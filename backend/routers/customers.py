import logging
import math
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from models.user import User, UserRole
    from models.customer import Customer
    from models.credit import CreditAccount
    from models.order import Order
    from schemas.customer import (
        CustomerCreate,
        CustomerUpdate,
        CustomerCreditStatusUpdate,
        CustomerResponse,
        CustomerPaginationResponse,
    )
    from dependencies.auth import (
        get_current_active_user,
        require_admin,
        require_staff_or_admin,
    )
except ImportError:
    from backend.database.connection import get_db
    from backend.models.user import User, UserRole
    from backend.models.customer import Customer
    from backend.models.credit import CreditAccount
    from backend.models.order import Order
    from backend.schemas.customer import (
        CustomerCreate,
        CustomerUpdate,
        CustomerCreditStatusUpdate,
        CustomerResponse,
        CustomerPaginationResponse,
    )
    from backend.dependencies.auth import (
        get_current_active_user,
        require_admin,
        require_staff_or_admin,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/customers", tags=["Customers"])


def _format_customer(customer: Customer, db: Session) -> CustomerResponse:
    """
    Serializes a Customer ORM model into CustomerResponse DTO with financial ledger balance.
    """
    current_balance = Decimal("0.00")
    available_credit = Decimal("0.00")

    if customer.credit_account:
        current_balance = customer.credit_account.current_balance
        available_credit = customer.credit_account.available_credit

    # Count total orders placed by this customer
    total_orders = db.query(func.count(Order.id)).filter(Order.customer_id == customer.id).scalar() or 0

    return CustomerResponse(
        id=customer.id,
        user_id=customer.user_id,
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        is_credit_eligible=customer.is_credit_eligible,
        credit_limit=customer.credit_limit,
        current_balance=current_balance,
        available_credit=available_credit,
        total_orders_count=total_orders,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


@router.get(
    "",
    response_model=CustomerPaginationResponse,
    summary="List Customers (Admin/Staff)",
    description="Retrieves paginated list of customers with optional search by name/phone and credit eligibility filtering."
)
def list_customers(
    search: Optional[str] = Query(None, description="Search by customer name or phone number"),
    is_credit_eligible: Optional[bool] = Query(None, description="Filter by credit eligibility"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    query = db.query(Customer).options(
        joinedload(Customer.credit_account),
    )

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.name.ilike(search_pattern),
                Customer.phone.ilike(search_pattern),
                Customer.email.ilike(search_pattern),
            )
        )

    if is_credit_eligible is not None:
        query = query.filter(Customer.is_credit_eligible == is_credit_eligible)

    total = query.count()
    offset = (page - 1) * limit
    customers = query.order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()

    items = [_format_customer(c, db) for c in customers]
    total_pages = math.ceil(total / limit) if total > 0 else 1

    return CustomerPaginationResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get(
    "/search",
    response_model=List[CustomerResponse],
    summary="Search Customers Autocomplete (Admin/Staff)",
    description="Fast counter lookup by phone number or name for POS terminal billing."
)
def search_customers(
    phone: Optional[str] = Query(None, description="Exact or prefix phone number"),
    q: Optional[str] = Query(None, description="General search query"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    query = db.query(Customer).options(joinedload(Customer.credit_account))

    if phone:
        query = query.filter(Customer.phone.startswith(phone.strip()))
    elif q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(Customer.phone.ilike(pattern), Customer.name.ilike(pattern))
        )
    else:
        return []

    results = query.order_by(Customer.name.asc()).limit(10).all()
    return [_format_customer(c, db) for c in results]


@router.get(
    "/me/profile",
    response_model=CustomerResponse,
    summary="Get My Customer Profile",
    description="Returns customer details and credit status for the currently authenticated customer."
)
def get_my_customer_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
        Customer.user_id == current_user.id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer profile linked to this user account.",
        )

    return _format_customer(customer, db)


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Get Customer Details",
    description="Returns detailed customer information. Customers may only access their own profile; Admin/Staff may view any."
)
def get_customer_by_id(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
        Customer.id == customer_id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} does not exist.",
        )

    # Customer Ownership Guard (Section 40)
    if current_user.role == UserRole.CUSTOMER:
        if customer.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own customer profile.",
            )

    return _format_customer(customer, db)


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Customer (Admin/Staff)",
    description="Registers a counter walk-in customer. Rule 61: Only Admin can grant credit eligibility at creation."
)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    # Verify phone uniqueness
    existing = db.query(Customer).filter(Customer.phone == payload.phone).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Customer with phone number '{payload.phone}' already exists.",
        )

    # Rule 61 Enforcement: Staff cannot grant credit eligibility
    if payload.is_credit_eligible and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rule 61 Violation: Only Shop Admin can approve credit eligibility for customers.",
        )

    credit_limit = payload.credit_limit if payload.is_credit_eligible else Decimal("0.00")

    try:
        new_customer = Customer(
            name=payload.name,
            phone=payload.phone,
            email=payload.email,
            is_credit_eligible=payload.is_credit_eligible,
            credit_limit=credit_limit,
        )
        db.add(new_customer)
        db.flush()

        # Initialize credit account
        credit_account = CreditAccount(
            customer_id=new_customer.id,
            credit_limit=credit_limit,
            current_balance=Decimal("0.00"),
            is_active=payload.is_credit_eligible,
        )
        db.add(credit_account)

        db.commit()
        db.refresh(new_customer)
        logger.info(f"Created customer ID={new_customer.id}, phone={new_customer.phone} by {current_user.role}")
        return _format_customer(new_customer, db)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create customer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create customer record due to a database error.",
        )


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update Customer Profile",
    description="Updates basic customer profile details. Customers can update their own info; Admin can update any."
)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
        Customer.id == customer_id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} does not exist.",
        )

    # Ownership check
    if current_user.role == UserRole.CUSTOMER and customer.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update another customer's profile.",
        )

    if payload.name is not None:
        customer.name = payload.name
    if payload.email is not None:
        customer.email = payload.email

    # Also update linked user table if present
    if customer.user_id:
        user = db.query(User).filter(User.id == customer.user_id).first()
        if user:
            if payload.name is not None:
                user.name = payload.name
            if payload.email is not None:
                user.email = payload.email

    db.commit()
    db.refresh(customer)
    return _format_customer(customer, db)


@router.patch(
    "/{customer_id}/credit-status",
    response_model=CustomerResponse,
    summary="Update Credit Eligibility (Rule 61 - Admin Only)",
    description="Admin-only endpoint to toggle credit eligibility (khata access) and set maximum credit limit."
)
def update_credit_status(
    customer_id: int,
    payload: CustomerCreditStatusUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Rule 61: Admin can only allow credit. Admin enables credit option to convert customer into credit-enabled.
    """
    customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
        Customer.id == customer_id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} does not exist.",
        )

    # Apply Rule 61 updates
    customer.is_credit_eligible = payload.is_credit_eligible
    customer.credit_limit = payload.credit_limit if payload.is_credit_eligible else Decimal("0.00")

    # Sync with CreditAccount
    if customer.credit_account:
        customer.credit_account.is_active = payload.is_credit_eligible
        customer.credit_account.credit_limit = customer.credit_limit
    else:
        new_account = CreditAccount(
            customer_id=customer.id,
            credit_limit=customer.credit_limit,
            current_balance=Decimal("0.00"),
            is_active=payload.is_credit_eligible,
        )
        db.add(new_account)

    db.commit()
    db.refresh(customer)
    logger.info(
        f"Admin {admin_user.name} updated credit status for Customer {customer.id}: "
        f"Eligible={customer.is_credit_eligible}, Limit={customer.credit_limit}"
    )

    return _format_customer(customer, db)
