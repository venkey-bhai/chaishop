import logging
from datetime import datetime, timezone, time, date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from models.user import User, UserRole
    from models.customer import Customer
    from models.menu import MenuItem
    from models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from models.payment import Payment, PaymentRecordStatus
    from models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from schemas.order import (
        OrderCreate,
        OrderResponse,
        OrderItemResponse,
        OrderStatusUpdate,
        OrderPaymentUpdate,
        OrderPaginationResponse,
        TokenDisplayItem,
        DailyTokenStats,
    )
    from dependencies.auth import require_admin, require_staff_or_admin, get_current_user
    from utils.security import decode_access_token
except ImportError:
    from backend.database.connection import get_db
    from backend.models.user import User, UserRole
    from backend.models.customer import Customer
    from backend.models.menu import MenuItem
    from backend.models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from backend.models.payment import Payment, PaymentRecordStatus
    from backend.models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from backend.schemas.order import (
        OrderCreate,
        OrderResponse,
        OrderItemResponse,
        OrderStatusUpdate,
        OrderPaymentUpdate,
        OrderPaginationResponse,
        TokenDisplayItem,
        DailyTokenStats,
    )
    from backend.dependencies.auth import require_admin, require_staff_or_admin, get_current_user
    from backend.utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/orders", tags=["Orders & Daily Token Engine"])


def _get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Extracts the authenticated user if Bearer token is provided, returns None for guest scans.
    """
    if not authorization:
        return None
    try:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            payload = decode_access_token(parts[1])
            user_id = payload.get("sub")
            if user_id:
                return db.query(User).filter(User.id == int(user_id)).first()
    except Exception:
        pass
    return None


def _format_order(order: Order) -> OrderResponse:
    """
    Serializes an Order model with its nested line items.
    """
    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        daily_token_number=order.daily_token_number,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        total_amount=order.total_amount,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        order_status=order.order_status,
        notes=order.notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=[
            OrderItemResponse(
                id=item.id,
                order_id=item.order_id,
                menu_item_id=item.menu_item_id,
                item_name=item.item_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.total_price,
                selected_options=item.selected_options,
            )
            for item in (order.items or [])
        ],
    )


# =============================================================
# Order Placement (Public / Customer / Staff)
# =============================================================

@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place New Order with Sequential Daily Token",
    description="Places a customer order from QR menu or POS, allocates a daily sequential token, snapshots prices, and updates stock."
)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    opt_user: Optional[User] = Depends(_get_optional_user),
):
    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must contain at least one item."
        )

    # 1. Resolve Customer Identity
    customer_obj: Optional[Customer] = None
    customer_id: Optional[int] = payload.customer_id
    customer_name: str = (payload.customer_name or "").strip()
    customer_phone: str = (payload.customer_phone or "").strip()

    if opt_user and opt_user.customer:
        customer_obj = opt_user.customer
        customer_id = customer_obj.id
        if not customer_name:
            customer_name = customer_obj.name
        if not customer_phone:
            customer_phone = customer_obj.phone
    elif customer_id:
        customer_obj = db.query(Customer).filter(Customer.id == customer_id).first()
        if customer_obj:
            if not customer_name:
                customer_name = customer_obj.name
            if not customer_phone:
                customer_phone = customer_obj.phone
    elif customer_phone:
        customer_obj = db.query(Customer).filter(Customer.phone == customer_phone).first()
        if customer_obj:
            customer_id = customer_obj.id
            if not customer_name:
                customer_name = customer_obj.name

    if not customer_name:
        customer_name = f"Table {payload.table_number}" if payload.table_number else (
            f"Counter {payload.counter_number}" if payload.counter_number else "Guest Customer"
        )
    if not customer_phone:
        customer_phone = "0000000000"

    # 2. Sequential Daily Token Calculation (Rule from Section 11 & Daily Reset)
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    max_token = db.query(func.max(Order.daily_token_number)).filter(
        Order.created_at >= start_of_day,
        Order.created_at <= end_of_day
    ).scalar()

    daily_token_number = (max_token or 0) + 1
    date_str = today_date.strftime("%Y%m%d")
    order_number = f"ORD-{date_str}-{daily_token_number:04d}"

    # 3. Snapshot Price & Validate Stock/Availability (Rule 12 in requirements)
    order_total = Decimal("0.00")
    order_items_to_create = []

    for line_item in payload.items:
        menu_item = db.query(MenuItem).filter(MenuItem.id == line_item.menu_item_id).first()
        if not menu_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Menu item with ID {line_item.menu_item_id} does not exist."
            )

        if not menu_item.is_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{menu_item.name}' is currently unavailable (86'd)."
            )

        if menu_item.track_stock:
            if menu_item.available_quantity < line_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for '{menu_item.name}'. Available: {menu_item.available_quantity}, requested: {line_item.quantity}."
                )
            # Decrement inventory stock
            menu_item.available_quantity -= line_item.quantity

        unit_price = Decimal(str(menu_item.price))
        total_price = unit_price * line_item.quantity
        order_total += total_price

        order_items_to_create.append({
            "menu_item_id": menu_item.id,
            "item_name": menu_item.name,
            "quantity": line_item.quantity,
            "unit_price": unit_price,
            "total_price": total_price,
            "selected_options": line_item.selected_options,
        })

    # 4. Credit Validation & Ledger (Rules 14, 15, 61 from requirements)
    if payload.payment_method == PaymentMethod.CREDIT:
        if not customer_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Credit purchase requires an existing registered customer profile."
            )

        if not customer_obj.is_credit_eligible:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Customer '{customer_obj.name}' is not eligible for credit purchases. Admin approval required (Rule 61)."
            )

        credit_account = customer_obj.credit_account
        if not credit_account or not credit_account.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer credit account is inactive or not initialized."
            )

        projected_balance = credit_account.current_balance + order_total
        if projected_balance > credit_account.credit_limit:
            available_credit = max(Decimal("0.00"), credit_account.credit_limit - credit_account.current_balance)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Credit limit exceeded. Available credit: ₹{available_credit:.2f}, Order total: ₹{order_total:.2f}."
            )

        # Update Credit Account Balance
        credit_account.current_balance = projected_balance
        initial_payment_status = PaymentStatus.PAID
    else:
        initial_payment_status = PaymentStatus.PENDING

    # 5. Format Order Notes with Table/Counter Prefix
    notes_parts = []
    if payload.table_number:
        notes_parts.append(f"Table #{payload.table_number}")
    if payload.counter_number:
        notes_parts.append(f"Counter #{payload.counter_number}")
    if payload.notes:
        notes_parts.append(payload.notes.strip())
    combined_notes = " | ".join(notes_parts) if notes_parts else None

    # 6. Save Order
    new_order = Order(
        order_number=order_number,
        daily_token_number=daily_token_number,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        total_amount=order_total,
        payment_method=payload.payment_method,
        payment_status=initial_payment_status,
        order_status=OrderStatus.PENDING,
        notes=combined_notes,
    )
    db.add(new_order)
    db.flush()  # Assign new_order.id

    # 7. Save Snapshot Line Items
    for item_data in order_items_to_create:
        item_obj = OrderItem(
            order_id=new_order.id,
            menu_item_id=item_data["menu_item_id"],
            item_name=item_data["item_name"],
            quantity=item_data["quantity"],
            unit_price=item_data["unit_price"],
            total_price=item_data["total_price"],
            selected_options=item_data["selected_options"],
        )
        db.add(item_obj)

    # 8. Record Credit Transaction or Payment Record
    if payload.payment_method == PaymentMethod.CREDIT and customer_obj:
        tx = CreditTransaction(
            customer_id=customer_obj.id,
            order_id=new_order.id,
            transaction_type=CreditTransactionType.CREDIT,
            amount=order_total,
            balance_after=credit_account.current_balance,
            description=f"Order #{daily_token_number} ({order_number}) on Credit",
            recorded_by_user_id=opt_user.id if opt_user else None,
        )
        db.add(tx)
    else:
        # Create initial Payment record
        pmt = Payment(
            order_id=new_order.id,
            customer_id=customer_id,
            amount=order_total,
            payment_method=payload.payment_method,
            payment_status=PaymentRecordStatus.PENDING,
            transaction_reference=None,
        )
        db.add(pmt)

    db.commit()
    db.refresh(new_order)

    logger.info(
        f"Created Order #{daily_token_number} ({order_number}) total=₹{order_total:.2f} "
        f"mode={payload.payment_method} customer='{customer_name}'"
    )

    return _format_order(new_order)


# =============================================================
# Token Queue & Display Screen Endpoints (Public & Staff)
# =============================================================

@router.get(
    "/tokens/today",
    summary="Get Today's Live Token Queue (Public / KDS)",
    description="Returns active daily tokens grouped by status for kitchen display and pickup calling screens."
)
def get_today_tokens(db: Session = Depends(get_db)):
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    orders = db.query(Order).options(joinedload(Order.items)).filter(
        Order.created_at >= start_of_day,
        Order.created_at <= end_of_day
    ).order_by(Order.daily_token_number.desc()).all()

    pending = []
    preparing = []
    ready = []
    completed = []

    for o in orders:
        items_list = []
        for i in (o.items or []):
            sugar = None
            strength = None
            if i.selected_options and isinstance(i.selected_options, dict):
                sugar = (
                    i.selected_options.get("sugar")
                    or i.selected_options.get("sugar_level")
                    or i.selected_options.get("sugar_levels")
                )
                strength = (
                    i.selected_options.get("strength")
                    or i.selected_options.get("tea_strength")
                )
            items_list.append({
                "id": i.id,
                "menu_item_id": i.menu_item_id,
                "item_name": i.item_name,
                "quantity": i.quantity,
                "unit_price": float(i.unit_price),
                "total_price": float(i.total_price),
                "selected_options": i.selected_options,
                "sugar_option": sugar,
                "strength_option": strength,
            })

        token_info = {
            "order_id": o.id,
            "order_number": o.order_number,
            "token_number": o.daily_token_number,
            "daily_token_number": o.daily_token_number,
            "customer_name": o.customer_name,
            "customer_phone": o.customer_phone,
            "table_or_notes": o.notes,
            "notes": o.notes,
            "items": items_list,
            "items_count": sum(i.quantity for i in (o.items or [])),
            "total_amount": float(o.total_amount),
            "order_status": o.order_status,
            "payment_method": o.payment_method,
            "payment_status": o.payment_status,
            "created_at": o.created_at.isoformat(),
            "order_time": o.created_at.isoformat(),
        }
        if o.order_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED]:
            pending.append(token_info)
        elif o.order_status == OrderStatus.PREPARING:
            preparing.append(token_info)
        elif o.order_status == OrderStatus.READY:
            ready.append(token_info)
        elif o.order_status == OrderStatus.COMPLETED:
            completed.append(token_info)

    return {
        "today": today_date.isoformat(),
        "total_orders_today": len(orders),
        "latest_token": orders[0].daily_token_number if orders else 0,
        "pending": pending,
        "preparing": preparing,
        "ready": ready,
        "completed": completed[:10],  # Last 10 completed for history
    }


@router.get(
    "/tokens/stats",
    response_model=DailyTokenStats,
    summary="Get Daily Token Summary Statistics",
    description="High-level counts of active tokens for header status badges."
)
def get_daily_token_stats(db: Session = Depends(get_db)):
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    orders = db.query(Order).filter(
        Order.created_at >= start_of_day,
        Order.created_at <= end_of_day
    ).all()

    latest_token = max([o.daily_token_number for o in orders], default=0)
    pending_count = sum(1 for o in orders if o.order_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED])
    preparing_count = sum(1 for o in orders if o.order_status == OrderStatus.PREPARING)
    ready_count = sum(1 for o in orders if o.order_status == OrderStatus.READY)
    completed_count = sum(1 for o in orders if o.order_status == OrderStatus.COMPLETED)

    return DailyTokenStats(
        today_date=today_date.isoformat(),
        total_orders=len(orders),
        latest_token=latest_token,
        active_pending_count=pending_count,
        active_preparing_count=preparing_count,
        active_ready_count=ready_count,
        completed_count=completed_count,
    )


# =============================================================
# Customer Order History (Rule 18 in requirements)
# =============================================================

@router.get(
    "/my-orders",
    response_model=List[OrderResponse],
    summary="Get Authenticated Customer Order History",
    description="Returns list of past orders for the currently logged-in customer."
)
def get_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.customer:
        return []

    orders = db.query(Order).options(
        joinedload(Order.items)
    ).filter(
        Order.customer_id == current_user.customer.id
    ).order_by(desc(Order.created_at)).all()

    return [_format_order(o) for o in orders]


# =============================================================
# Staff & Admin Order Management
# =============================================================

@router.get(
    "",
    response_model=OrderPaginationResponse,
    summary="List Orders with Filters (Staff / Admin)",
    description="Search and filter orders by date, order_status, payment_status, token number, or customer name."
)
def list_orders(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    order_status: Optional[OrderStatus] = Query(None, description="Filter by OrderStatus"),
    payment_status: Optional[PaymentStatus] = Query(None, description="Filter by PaymentStatus"),
    payment_method: Optional[PaymentMethod] = Query(None, description="Filter by PaymentMethod"),
    today_only: bool = Query(False, description="Filter for today's orders only"),
    search: Optional[str] = Query(None, description="Search by customer name, phone, or order number"),
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Order).options(joinedload(Order.items))

    if today_only:
        today_date = datetime.now(timezone.utc).date()
        start = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
        end = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)
        query = query.filter(Order.created_at >= start, Order.created_at <= end)

    if order_status:
        query = query.filter(Order.order_status == order_status)

    if payment_status:
        query = query.filter(Order.payment_status == payment_status)

    if payment_method:
        query = query.filter(Order.payment_method == payment_method)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_number.ilike(s),
                Order.customer_name.ilike(s),
                Order.customer_phone.ilike(s)
            )
        )

    total = query.count()
    offset = (page - 1) * limit
    orders = query.order_by(desc(Order.created_at)).offset(offset).limit(limit).all()

    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return OrderPaginationResponse(
        items=[_format_order(o) for o in orders],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get(
    "/{order_id}",
    response_model=OrderResponse,
    summary="Get Order by ID or Order Number",
    description="Returns order details with complete line item snapshot."
)
def get_order_by_id(
    order_id: str,
    db: Session = Depends(get_db),
    opt_user: Optional[User] = Depends(_get_optional_user)
):
    query = db.query(Order).options(joinedload(Order.items))
    if order_id.isdigit():
        order = query.filter(Order.id == int(order_id)).first()
    else:
        order = query.filter(Order.order_number == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_id}' was not found."
        )

    # Permission check: If customer, can only view their own order
    if opt_user and opt_user.role == UserRole.CUSTOMER:
        if opt_user.customer and order.customer_id != opt_user.customer.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this order."
            )

    return _format_order(order)


@router.patch(
    "/{order_id}/status",
    response_model=OrderResponse,
    summary="Update Order Preparation Status (Staff / Admin)",
    description="Transitions order between PENDING -> CONFIRMED -> PREPARING -> READY -> COMPLETED or CANCELLED."
)
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} not found."
        )

    old_status = order.order_status
    order.order_status = payload.order_status
    db.commit()
    db.refresh(order)

    logger.info(
        f"Order #{order.daily_token_number} status changed from {old_status} "
        f"to {order.order_status} by {current_user.name} ({current_user.role})"
    )

    return _format_order(order)


@router.patch(
    "/{order_id}/payment",
    response_model=OrderResponse,
    summary="Update Order Payment Status (Staff / Admin)",
    description="Updates payment status to PAID or FAILED and records transaction reference code."
)
def update_order_payment(
    order_id: int,
    payload: OrderPaymentUpdate,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} not found."
        )

    order.payment_status = payload.payment_status
    
    # Update linked Payment entity if present
    payment = db.query(Payment).filter(Payment.order_id == order.id).first()
    if payment:
        payment.payment_status = (
            PaymentRecordStatus.COMPLETED if payload.payment_status == PaymentStatus.PAID
            else PaymentRecordStatus.FAILED if payload.payment_status == PaymentStatus.FAILED
            else PaymentRecordStatus.PENDING
        )
        if payload.transaction_reference:
            payment.transaction_reference = payload.transaction_reference
        if payload.payment_status == PaymentStatus.PAID:
            payment.paid_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(order)

    logger.info(
        f"Order #{order.daily_token_number} payment status set to {payload.payment_status} "
        f"by {current_user.name}"
    )

    return _format_order(order)
