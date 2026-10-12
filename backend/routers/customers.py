import logging
import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from models.user import User, UserRole
    from models.customer import Customer
    from models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from models.payment import Payment, PaymentRecordStatus
    from schemas.customer import (
        CustomerCreate,
        CustomerUpdate,
        CustomerCreditStatusUpdate,
        CustomerResponse,
        CustomerPaginationResponse,
        CustomerHistoryResponse,
        CustomerHistoryProfile,
        CustomerFinancialSummary,
        CustomerTransactionRecord,
        CustomerHistoryItem,
        CustomerDailyGroup,
        CustomerHistoryPagination,
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
    from backend.models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from backend.models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from backend.models.payment import Payment, PaymentRecordStatus
    from backend.schemas.customer import (
        CustomerCreate,
        CustomerUpdate,
        CustomerCreditStatusUpdate,
        CustomerResponse,
        CustomerPaginationResponse,
        CustomerHistoryResponse,
        CustomerHistoryProfile,
        CustomerFinancialSummary,
        CustomerTransactionRecord,
        CustomerHistoryItem,
        CustomerDailyGroup,
        CustomerHistoryPagination,
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
    Serializes a Customer ORM model into CustomerResponse DTO with financial ledger balance and total spend.
    """
    current_balance = Decimal("0.00")
    available_credit = Decimal("0.00")

    if customer.credit_account:
        current_balance = customer.credit_account.current_balance
        available_credit = customer.credit_account.available_credit

    # Count total orders placed by this customer
    total_orders = db.query(func.count(Order.id)).filter(Order.customer_id == customer.id).scalar() or 0

    # Total spend across non-cancelled orders
    total_spent = db.query(func.coalesce(func.sum(Order.total_amount), Decimal("0.00"))).filter(
        Order.customer_id == customer.id,
        Order.order_status != OrderStatus.CANCELLED
    ).scalar() or Decimal("0.00")

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
        total_spent=total_spent,
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


def _is_customer_owner(customer: Customer, current_user) -> bool:
    if getattr(current_user, "role", None) != UserRole.CUSTOMER:
        return True
    return bool(
        customer.customer_user_id == current_user.id or
        customer.user_id == current_user.id or
        (hasattr(current_user, "customer") and current_user.customer and current_user.customer.id == customer.id) or
        (hasattr(current_user, "customer_profile") and current_user.customer_profile and current_user.customer_profile.id == customer.id) or
        (customer.phone and customer.phone == getattr(current_user, "mobile_number", None))
    )


@router.get(
    "/me/profile",
    response_model=CustomerResponse,
    summary="Get My Customer Profile",
    description="Returns customer details and credit status for the currently authenticated customer."
)
def get_my_customer_profile(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    customer = None
    if hasattr(current_user, "customer") and current_user.customer:
        customer = current_user.customer
    elif hasattr(current_user, "customer_profile") and current_user.customer_profile:
        customer = current_user.customer_profile
    else:
        customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
            or_(
                Customer.customer_user_id == current_user.id,
                Customer.user_id == current_user.id,
                Customer.phone == getattr(current_user, "mobile_number", None)
            )
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
    current_user = Depends(get_current_active_user),
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
    if not _is_customer_owner(customer, current_user):
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
    current_user = Depends(get_current_active_user),
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
    if not _is_customer_owner(customer, current_user):
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


@router.delete(
    "/{customer_id}",
    summary="Delete Customer (Admin Only)",
    description="Deletes a customer record from the directory. Ensures safety by disallowing deletion if outstanding credit balance exists."
)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    customer = db.query(Customer).options(
        joinedload(Customer.credit_account)
    ).filter(Customer.id == customer_id).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} does not exist.",
        )

    # Safety check: prevent deleting customer with unpaid khata / credit debt balance
    if customer.credit_account and customer.credit_account.current_balance > Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete customer '{customer.name}' because they have an active outstanding credit balance of ₹{customer.credit_account.current_balance:.2f}. Please settle debt before deleting.",
        )

    customer_name = customer.name

    try:
        # Unlink orders so sales history & analytics remain preserved with captured customer info
        db.query(Order).filter(Order.customer_id == customer_id).update({Order.customer_id: None})

        # Unlink payment records
        db.query(Payment).filter(Payment.customer_id == customer_id).update({Payment.customer_id: None})

        # Remove credit transactions
        db.query(CreditTransaction).filter(CreditTransaction.customer_id == customer_id).delete()

        # Remove credit account if present
        if customer.credit_account:
            db.delete(customer.credit_account)

        # Unlink linked User if present
        if customer.user_id:
            customer.user_id = None
            db.flush()

        # Delete customer record
        db.delete(customer)
        db.commit()

        logger.info(f"Admin {admin_user.name} deleted customer ID={customer_id} ({customer_name})")
        return {"message": f"Customer '{customer_name}' was deleted successfully.", "deleted_id": customer_id}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete customer {customer_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete customer: {str(e)}",
        )



# =============================================================
# Customer Purchase History, Ledger & Monthly Statement
# =============================================================

@router.get(
    "/me/history",
    response_model=CustomerHistoryResponse,
    summary="Get Current Customer Purchase History",
    description="Retrieves current logged-in customer's profile, financial summary, and order history."
)
def get_my_customer_history(
    mode: str = Query("all", description="Period filter mode: 'all', 'daily', or 'monthly'"),
    date: Optional[str] = Query(None, description="Target date for daily mode (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Target month (1-12) for monthly mode"),
    year: Optional[int] = Query(None, description="Target year for monthly mode"),
    search: Optional[str] = Query(None, description="Search by product name, bill number, or token"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method: CASH, UPI, CARD, CREDIT"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status: PAID, PENDING"),
    credit_filter: Optional[str] = Query(None, description="Filter by credit transaction type"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Rows per page"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    cust = None
    if hasattr(current_user, "customer") and current_user.customer:
        cust = current_user.customer
    elif hasattr(current_user, "customer_profile") and current_user.customer_profile:
        cust = current_user.customer_profile
    else:
        cust = db.query(Customer).filter(
            or_(
                Customer.customer_user_id == current_user.id,
                Customer.user_id == current_user.id,
                Customer.phone == getattr(current_user, "mobile_number", None)
            )
        ).first()

    if not cust:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer profile linked to this user account.",
        )

    return get_customer_history(
        customer_id=cust.id,
        mode=mode,
        date=date,
        month=month,
        year=year,
        search=search,
        payment_method=payment_method,
        payment_status=payment_status,
        credit_filter=credit_filter,
        page=page,
        limit=limit,
        db=db,
        current_user=current_user,
    )


@router.get(
    "/{customer_id}/history",
    response_model=CustomerHistoryResponse,
    summary="Get Detailed Customer Purchase History & Credit Ledger",
    description="Retrieves day-by-day bill history, line items, credit additions, repayments, and running balances with daily/monthly filters."
)
def get_customer_history(
    customer_id: int,
    mode: str = Query("all", description="Period filter mode: 'all', 'daily', or 'monthly'"),
    date: Optional[str] = Query(None, description="Target date for daily mode (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Target month (1-12) for monthly mode"),
    year: Optional[int] = Query(None, description="Target year for monthly mode"),
    search: Optional[str] = Query(None, description="Search by product name, bill number, or token"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method: CASH, UPI, CARD, CREDIT"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status: PAID, PENDING"),
    credit_filter: Optional[str] = Query(None, description="Filter by credit transaction type: all, credit_only, paid_only, full_credit_only"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Rows per page"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    customer = db.query(Customer).options(joinedload(Customer.credit_account)).filter(
        Customer.id == customer_id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} does not exist.",
        )

    # Ownership guard: Customers can only view their own history
    if getattr(current_user, "role", None) == UserRole.CUSTOMER:
        is_owner = (
            customer.customer_user_id == current_user.id or
            customer.user_id == current_user.id or
            (hasattr(current_user, "customer") and current_user.customer and current_user.customer.id == customer.id) or
            (customer.phone and customer.phone == getattr(current_user, "mobile_number", None))
        )
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own history.",
            )

    # Lifetime Customer Metrics
    lifetime_spent = db.query(func.coalesce(func.sum(Order.total_amount), Decimal("0.00"))).filter(
        Order.customer_id == customer.id,
        Order.order_status != OrderStatus.CANCELLED
    ).scalar() or Decimal("0.00")

    lifetime_orders = db.query(func.count(Order.id)).filter(
        Order.customer_id == customer.id
    ).scalar() or 0

    current_balance = customer.credit_account.current_balance if customer.credit_account else Decimal("0.00")
    available_credit = customer.credit_account.available_credit if customer.credit_account else Decimal("0.00")

    profile_dto = CustomerHistoryProfile(
        id=customer.id,
        user_id=customer.user_id,
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        is_credit_eligible=customer.is_credit_eligible,
        credit_limit=customer.credit_limit,
        current_balance=current_balance,
        available_credit=available_credit,
        total_orders_count=lifetime_orders,
        total_spent=lifetime_spent,
        created_at=customer.created_at,
    )

    # 1. Fetch all Orders for this customer
    orders = db.query(Order).options(
        joinedload(Order.items),
        joinedload(Order.payment),
        joinedload(Order.credit_transaction),
    ).filter(
        Order.customer_id == customer.id
    ).order_by(Order.created_at.asc(), Order.id.asc()).all()

    # 2. Fetch standalone Credit Transactions (Repayments & Adjustments)
    credit_txs = db.query(CreditTransaction).filter(
        CreditTransaction.customer_id == customer.id,
        CreditTransaction.order_id.is_(None)
    ).order_by(CreditTransaction.created_at.asc(), CreditTransaction.id.asc()).all()

    raw_events = []

    # Format Order Events
    for o in orders:
        items_dto = []
        summary_parts = []
        for it in (o.items or []):
            opt_str = None
            if it.selected_options:
                opt_str = " | ".join([f"{k}: {v}" for k, v in it.selected_options.items() if v])
            items_dto.append(CustomerHistoryItem(
                name=it.item_name,
                quantity=it.quantity,
                unit_price=it.unit_price,
                total_price=it.total_price,
                customizations=opt_str,
            ))
            summary_parts.append(f"{it.item_name} (x{it.quantity})")

        prod_summary = ", ".join(summary_parts) if summary_parts else "Counter Order"

        credit_added = Decimal("0.00")
        amount_paid = Decimal("0.00")

        pay_method_str = o.payment_method.value if hasattr(o.payment_method, "value") else str(o.payment_method)
        pay_status_str = o.payment_status.value if hasattr(o.payment_status, "value") else str(o.payment_status)
        order_status_str = o.order_status.value if hasattr(o.order_status, "value") else str(o.order_status)

        if pay_method_str == "CREDIT":
            credit_added = o.total_amount
            amount_paid = Decimal("0.00")
        else:
            if pay_status_str == "PAID":
                amount_paid = o.payment.amount if (o.payment and o.payment.amount) else o.total_amount
            else:
                amount_paid = Decimal("0.00")

        local_dt = o.created_at
        date_str = local_dt.strftime("%Y-%m-%d")
        time_str = local_dt.strftime("%I:%M %p")

        raw_events.append({
            "id": f"ord-{o.id}",
            "type": "ORDER",
            "date": date_str,
            "time": time_str,
            "created_at": o.created_at,
            "order_id": o.id,
            "order_number": o.order_number,
            "daily_token_number": o.daily_token_number,
            "items": items_dto,
            "product_summary": prod_summary,
            "total_bill_amount": o.total_amount,
            "amount_paid": amount_paid,
            "credit_added": credit_added,
            "credit_repaid": Decimal("0.00"),
            "payment_method": pay_method_str,
            "payment_status": pay_status_str,
            "order_status": order_status_str,
            "description": f"Bill #{o.daily_token_number} ({o.order_number})",
            "notes": o.notes,
            "explicit_balance_after": o.credit_transaction.balance_after if o.credit_transaction else None,
        })

    # Format Credit Repayment / Adjustment Events
    for tx in credit_txs:
        local_dt = tx.created_at
        date_str = local_dt.strftime("%Y-%m-%d")
        time_str = local_dt.strftime("%I:%M %p")

        is_payment = (tx.transaction_type == CreditTransactionType.PAYMENT)
        credit_repaid = tx.amount if is_payment else Decimal("0.00")
        amount_paid = tx.amount if is_payment else Decimal("0.00")

        pay_method = "CASH"
        desc_lower = (tx.description or "").lower()
        if "upi" in desc_lower:
            pay_method = "UPI"
        elif "card" in desc_lower:
            pay_method = "CARD"

        raw_events.append({
            "id": f"tx-{tx.id}",
            "type": "REPAYMENT" if is_payment else "ADJUSTMENT",
            "date": date_str,
            "time": time_str,
            "created_at": tx.created_at,
            "order_id": None,
            "order_number": None,
            "daily_token_number": None,
            "items": [],
            "product_summary": f"Khata Debt Repayment ({pay_method})" if is_payment else f"Credit Adjustment",
            "total_bill_amount": Decimal("0.00"),
            "amount_paid": amount_paid,
            "credit_added": Decimal("0.00"),
            "credit_repaid": credit_repaid,
            "payment_method": pay_method,
            "payment_status": "PAID",
            "order_status": "COMPLETED",
            "description": tx.description or f"Khata Debt Repayment via {pay_method}",
            "notes": None,
            "explicit_balance_after": tx.balance_after,
        })

    # Chronological sort ascending to simulate running ledger balances
    raw_events.sort(key=lambda x: (x["created_at"], x["id"]))

    simulated_balance = Decimal("0.00")
    timeline_events = []
    for ev in raw_events:
        prev_bal = simulated_balance
        if ev["explicit_balance_after"] is not None:
            simulated_balance = ev["explicit_balance_after"]
        else:
            if ev["type"] == "ORDER":
                simulated_balance += ev["credit_added"]
            elif ev["type"] == "REPAYMENT":
                simulated_balance = max(Decimal("0.00"), simulated_balance - ev["credit_repaid"])

        ev["previous_outstanding_credit"] = prev_bal
        ev["closing_outstanding_credit"] = simulated_balance
        timeline_events.append(ev)

    # Sanitize query parameters (handles both FastAPI dependency injection and direct function calls)
    mode_val = mode if isinstance(mode, str) else "all"
    date_val = date if isinstance(date, str) else None
    month_val = month if isinstance(month, int) else None
    year_val = year if isinstance(year, int) else None
    search_term = search.strip().lower() if (search and isinstance(search, str)) else None
    payment_method_val = payment_method if isinstance(payment_method, str) else None
    payment_status_val = payment_status if isinstance(payment_status, str) else None
    credit_filter_val = credit_filter if isinstance(credit_filter, str) else None
    page_val = page if isinstance(page, int) else 1
    limit_val = limit if isinstance(limit, int) else 10

    # 3. Period Filtering & Opening/Closing Balance Calculations
    now = datetime.now()
    if mode_val == "daily":
        target_date = date_val if date_val else now.strftime("%Y-%m-%d")
        # Opening balance = balance of the last event before target_date
        events_before = [e for e in timeline_events if e["date"] < target_date]
        opening_balance = events_before[-1]["closing_outstanding_credit"] if events_before else Decimal("0.00")

        period_events = [e for e in timeline_events if e["date"] == target_date]

        events_upto = [e for e in timeline_events if e["date"] <= target_date]
        closing_balance = events_upto[-1]["closing_outstanding_credit"] if events_upto else opening_balance
    elif mode_val == "monthly":
        sel_year = year_val if year_val else now.year
        sel_month = month_val if month_val else now.month
        target_prefix = f"{sel_year:04d}-{sel_month:02d}"

        events_before = [e for e in timeline_events if e["date"] < f"{target_prefix}-01"]
        opening_balance = events_before[-1]["closing_outstanding_credit"] if events_before else Decimal("0.00")

        period_events = [e for e in timeline_events if e["date"].startswith(target_prefix)]

        # Last day of target month
        import calendar
        _, last_day = calendar.monthrange(sel_year, sel_month)
        month_end_date = f"{target_prefix}-{last_day:02d}"
        events_upto = [e for e in timeline_events if e["date"] <= month_end_date]
        closing_balance = events_upto[-1]["closing_outstanding_credit"] if events_upto else opening_balance
    else:
        # All time
        opening_balance = Decimal("0.00")
        closing_balance = timeline_events[-1]["closing_outstanding_credit"] if timeline_events else current_balance
        period_events = list(timeline_events)

    # 4. Search and Secondary Filters
    filtered_events = []

    for ev in period_events:
        # Search Filter
        if search_term:
            match_prod = search_term in ev["product_summary"].lower()
            match_order = ev["order_number"] and (search_term in ev["order_number"].lower())
            match_token = ev["daily_token_number"] and (search_term in str(ev["daily_token_number"]))
            match_items = any(search_term in it.name.lower() for it in ev["items"])
            match_desc = search_term in ev["description"].lower()
            if not (match_prod or match_order or match_token or match_items or match_desc):
                continue

        # Payment Method Filter
        if payment_method_val and payment_method_val != "ALL":
            if ev["payment_method"] != payment_method_val:
                continue

        # Payment Status Filter
        if payment_status_val and payment_status_val != "ALL":
            if ev["payment_status"] != payment_status_val:
                continue

        # Credit Filter
        if credit_filter_val and credit_filter_val != "all":
            if credit_filter_val == "credit_only":
                if ev["credit_added"] <= Decimal("0.00") and ev["credit_repaid"] <= Decimal("0.00"):
                    continue
            elif credit_filter_val == "paid_only":
                if ev["type"] != "ORDER" or ev["payment_status"] != "PAID" or ev["payment_method"] == "CREDIT":
                    continue
            elif credit_filter_val == "full_credit_only":
                if ev["payment_method"] != "CREDIT":
                    continue

        filtered_events.append(ev)

    # 5. Financial Summary across Entire Filtered Dataset
    total_purchased = sum((ev["total_bill_amount"] for ev in filtered_events if ev["order_status"] != "CANCELLED"), Decimal("0.00"))
    total_paid_immediate = sum((ev["amount_paid"] for ev in filtered_events if ev["type"] == "ORDER"), Decimal("0.00"))
    total_credit_added = sum((ev["credit_added"] for ev in filtered_events), Decimal("0.00"))
    total_credit_repaid = sum((ev["credit_repaid"] for ev in filtered_events), Decimal("0.00"))
    total_orders_count = sum((1 for ev in filtered_events if ev["type"] == "ORDER"))
    total_transactions_count = len(filtered_events)
    total_paid_total = total_paid_immediate + total_credit_repaid

    summary_dto = CustomerFinancialSummary(
        opening_credit_balance=opening_balance,
        closing_credit_balance=closing_balance,
        total_purchased=total_purchased,
        total_paid_immediate=total_paid_immediate,
        total_paid_total=total_paid_total,
        total_credit_added=total_credit_added,
        total_credit_repaid=total_credit_repaid,
        total_orders_count=total_orders_count,
        total_transactions_count=total_transactions_count,
    )

    # 6. Group Records by Date for Daily Subtotals (Requirement 6)
    daily_groups_dict = {}
    for ev in filtered_events:
        d = ev["date"]
        if d not in daily_groups_dict:
            daily_groups_dict[d] = {
                "date": d,
                "purchases": Decimal("0.00"),
                "immediate_paid": Decimal("0.00"),
                "credit_added": Decimal("0.00"),
                "credit_repaid": Decimal("0.00"),
                "closing_balance": ev["closing_outstanding_credit"],
                "orders_count": 0,
            }
        g = daily_groups_dict[d]
        if ev["order_status"] != "CANCELLED":
            g["purchases"] += ev["total_bill_amount"]
        if ev["type"] == "ORDER":
            g["immediate_paid"] += ev["amount_paid"]
            g["orders_count"] += 1
        g["credit_added"] += ev["credit_added"]
        g["credit_repaid"] += ev["credit_repaid"]
        g["closing_balance"] = ev["closing_outstanding_credit"]

    daily_groups = [
        CustomerDailyGroup(**g) for g in sorted(daily_groups_dict.values(), key=lambda x: x["date"], reverse=True)
    ]

    # 7. Pagination with Newest First by default (Requirement 3 & 7)
    filtered_events.sort(key=lambda x: (x["created_at"], x["id"]), reverse=True)
    total_records = len(filtered_events)
    total_pages = math.ceil(total_records / limit_val) if total_records > 0 else 1
    offset = (page_val - 1) * limit_val
    page_events = filtered_events[offset: offset + limit_val]

    transactions_dto = [
        CustomerTransactionRecord(
            id=ev["id"],
            type=ev["type"],
            date=ev["date"],
            time=ev["time"],
            created_at=ev["created_at"],
            order_id=ev["order_id"],
            order_number=ev["order_number"],
            daily_token_number=ev["daily_token_number"],
            items=ev["items"],
            product_summary=ev["product_summary"],
            total_bill_amount=ev["total_bill_amount"],
            amount_paid=ev["amount_paid"],
            credit_added=ev["credit_added"],
            credit_repaid=ev["credit_repaid"],
            payment_method=ev["payment_method"],
            payment_status=ev["payment_status"],
            order_status=ev["order_status"],
            previous_outstanding_credit=ev["previous_outstanding_credit"],
            closing_outstanding_credit=ev["closing_outstanding_credit"],
            description=ev["description"],
            notes=ev["notes"],
        )
        for ev in page_events
    ]

    return CustomerHistoryResponse(
        customer=profile_dto,
        summary=summary_dto,
        transactions=transactions_dto,
        daily_groups=daily_groups,
        pagination=CustomerHistoryPagination(
            total_records=total_records,
            page=page_val,
            limit=limit_val,
            total_pages=total_pages,
        ),
    )
