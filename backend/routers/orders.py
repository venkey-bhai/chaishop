import logging
import secrets
from datetime import datetime, timezone, time, date, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy import or_, and_, func, desc
from sqlalchemy.orm import Session, joinedload

try:
    from config import settings
    from database.connection import get_db
    from models.user import User, UserRole
    from models.customer import Customer
    from models.menu import MenuItem
    from models.order import (
        Order,
        OrderItem,
        PaymentMethod,
        PaymentStatus,
        OrderStatus,
        OrderOTPChallenge,
        OTPChallengeStatus,
        OrderType,
        SharedDishTransaction,
        SharedDishStatus,
    )
    from models.payment import Payment, PaymentRecordStatus
    from models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from schemas.order import (
        OrderCreate,
        OrderResponse,
        OrderItemResponse,
        OrderStatusUpdate,
        AdminOrderOverrideRequest,
        OrderPaymentUpdate,
        OTPVerificationRequest,
        OTPChallengeInfo,
        OTPVerificationResponse,
        OrderPaginationResponse,
        TokenDisplayItem,
        DailyTokenStats,
        SharedDishCreate,
        SharedDishResponse,
        TableSeatChangeRequest,
        DishStatusUpdate,
        DishCancelRequest,
        CustomerOrderEditRequest,
    )
    from dependencies.auth import require_admin, require_staff_or_admin, get_current_user
    from utils.security import decode_access_token
    from utils.sms import (
        generate_otp_code,
        hash_otp,
        verify_otp_hash,
        mask_phone_number,
        send_otp_sms,
        TEST_SMS_OUTBOX,
    )
    from routers.tables import validate_table_and_seat
except ImportError:
    from backend.config import settings
    from backend.database.connection import get_db
    from backend.models.user import User, UserRole
    from backend.models.customer import Customer
    from backend.models.menu import MenuItem
    from backend.models.order import (
        Order,
        OrderItem,
        PaymentMethod,
        PaymentStatus,
        OrderStatus,
        OrderOTPChallenge,
        OTPChallengeStatus,
        OrderType,
        SharedDishTransaction,
        SharedDishStatus,
    )
    from backend.models.payment import Payment, PaymentRecordStatus
    from backend.models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from backend.schemas.order import (
        OrderCreate,
        OrderResponse,
        OrderItemResponse,
        OrderStatusUpdate,
        AdminOrderOverrideRequest,
        OrderPaymentUpdate,
        OTPVerificationRequest,
        OTPChallengeInfo,
        OTPVerificationResponse,
        OrderPaginationResponse,
        TokenDisplayItem,
        DailyTokenStats,
        SharedDishCreate,
        SharedDishResponse,
        TableSeatChangeRequest,
    )
    from backend.dependencies.auth import require_admin, require_staff_or_admin, get_current_user
    from backend.utils.security import decode_access_token
    from backend.utils.sms import (
        generate_otp_code,
        hash_otp,
        verify_otp_hash,
        mask_phone_number,
        send_otp_sms,
        TEST_SMS_OUTBOX,
    )
    from backend.routers.tables import validate_table_and_seat

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


def _format_order(order: Order, db: Optional[Session] = None) -> OrderResponse:
    """
    Serializes an Order model with its nested line items and active OTP verification challenge info if any.
    Never exposes raw OTP or internal OTP hash!
    """
    challenge_info = None
    challenges = getattr(order, "otp_challenges", None)
    if challenges is not None and len(challenges) > 0:
        ch = challenges[0]
        now_utc = datetime.now(timezone.utc)
        expires_at = ch.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        last_sent = ch.last_sent_at
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)

        secs_expiry = max(0, int((expires_at - now_utc).total_seconds()))
        secs_resend = max(0, ch.cooldown_seconds - int((now_utc - last_sent).total_seconds()))
        attempts_rem = max(0, ch.max_attempts - ch.attempts)

        # In development mode, provide dev_otp for automated testing and local debugging
        dev_code = None
        if settings.ENVIRONMENT == "development":
            dev_code = TEST_SMS_OUTBOX.get(ch.mobile_number)

        challenge_info = OTPChallengeInfo(
            challenge_id=ch.id,
            order_id=order.id,
            order_number=order.order_number,
            masked_phone=mask_phone_number(ch.mobile_number),
            status=ch.status,
            expires_at=expires_at,
            seconds_until_expiry=secs_expiry,
            seconds_until_resend=secs_resend,
            attempts_remaining=attempts_rem,
            max_attempts=ch.max_attempts,
            dev_otp=dev_code
        )

    can_change = order.order_status not in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]

    shared_dishes_list = []
    for sd in getattr(order, "shared_dishes_sent", []) or []:
        shared_dishes_list.append(
            SharedDishResponse(
                id=sd.id,
                original_order_id=sd.original_order_id,
                original_order_item_id=sd.original_order_item_id,
                original_table_number=order.table_number,
                original_seat_number=order.seat_number,
                destination_table_id=sd.destination_table_id,
                destination_table_number=sd.destination_table_id,
                destination_seat_no=sd.destination_seat_no,
                destination_seat_number=sd.destination_seat_no,
                quantity=sd.quantity,
                status=sd.status,
                created_by=sd.created_by,
                created_at=sd.created_at,
                formatted_time=sd.created_at.strftime("%I:%M %p") if sd.created_at else None,
                dish_name=sd.original_order_item.item_name if sd.original_order_item else None,
            )
        )

    formatted_items = []
    for item in (order.items or []):
        item_shares = []
        for st in getattr(item, "shared_transactions", []) or []:
            item_shares.append(
                SharedDishResponse(
                    id=st.id,
                    original_order_id=st.original_order_id,
                    original_order_item_id=st.original_order_item_id,
                    original_table_number=order.table_number,
                    original_seat_number=order.seat_number,
                    destination_table_id=st.destination_table_id,
                    destination_table_number=st.destination_table_id,
                    destination_seat_no=st.destination_seat_no,
                    destination_seat_number=st.destination_seat_no,
                    quantity=st.quantity,
                    status=st.status,
                    created_by=st.created_by,
                    created_at=st.created_at,
                    formatted_time=st.created_at.strftime("%I:%M %p") if st.created_at else None,
                    dish_name=item.item_name,
                )
            )
        shared_qty = sum(s.quantity for s in item_shares if s.status in ["CONFIRMED", "PENDING"])
        remaining_unshared = max(0, item.quantity - shared_qty)

        formatted_items.append(
            OrderItemResponse(
                id=item.id,
                order_id=item.order_id,
                menu_item_id=item.menu_item_id,
                item_name=item.item_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.total_price,
                selected_options=item.selected_options,
                status=getattr(item, "status", "PENDING") or "PENDING",
                cancelled_by=getattr(item, "cancelled_by", None),
                cancelled_at=getattr(item, "cancelled_at", None),
                completed_at=getattr(item, "completed_at", None),
                shared_quantity=shared_qty,
                remaining_unshared_quantity=remaining_unshared,
                shares=item_shares,
            )
        )

    return OrderResponse(
        id=order.id,
        order_number=order.order_number,
        daily_token_number=order.daily_token_number,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        order_type=getattr(order, "order_type", "DINE_IN"),
        table_number=getattr(order, "table_number", None),
        seat_number=getattr(order, "seat_number", None),
        total_amount=order.total_amount,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        order_status=order.order_status,
        notes=order.notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=formatted_items,
        otp_challenge=challenge_info,
        can_change_table_or_seat=can_change,
        shared_dishes=shared_dishes_list,
    )


def cleanup_expired_otp_challenges(db: Session) -> int:
    """
    Finds pending OTP challenges that have reached expiration,
    transitions their orders to VERIFICATION_EXPIRED, and releases reserved stock.
    """
    now_utc = datetime.now(timezone.utc)
    expired_challenges = db.query(OrderOTPChallenge).filter(
        OrderOTPChallenge.status == "PENDING",
        OrderOTPChallenge.expires_at < now_utc
    ).all()

    cleaned = 0
    for ch in expired_challenges:
        ch.status = "EXPIRED"
        order = db.query(Order).filter(Order.id == ch.order_id).first()
        if order and order.order_status == OrderStatus.PENDING_OTP_VERIFICATION:
            order.order_status = OrderStatus.VERIFICATION_EXPIRED
            # Release temporarily reserved inventory
            if ch.reserved_stock and isinstance(ch.reserved_stock, list):
                for res_item in ch.reserved_stock:
                    mi = db.query(MenuItem).filter(MenuItem.id == res_item.get("menu_item_id")).first()
                    if mi and mi.track_stock:
                        mi.reserved_quantity = max(0, mi.reserved_quantity - res_item.get("quantity", 0))
            cleaned += 1
    if cleaned > 0:
        db.commit()
    return cleaned


# =============================================================
# Order Placement (Public / Customer / Staff)
# =============================================================

@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place New Order with Sequential Daily Token & OTP Generation",
    description="Validates customer, reserves stock temporarily, generates secure OTP challenge, sends SMS, and returns pending order."
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

    # 1. Resolve & Enforce Mandatory Customer Identity (Phone No & Customer Number)
    customer_name: str = (payload.customer_name or "").strip()
    customer_phone: str = (payload.customer_phone or "").strip()

    # Clean phone number to digits only
    clean_phone = "".join(ch for ch in customer_phone if ch.isdigit())

    # Mandatory Phone Number & Name Validation
    if not clean_phone or len(clean_phone) < 10 or clean_phone == "0000000000":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer phone number is mandatory to place an order (must be a valid 10-digit mobile number)."
        )

    if not customer_name or len(customer_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer name is mandatory to place an order (minimum 2 characters required)."
        )

    customer_phone = clean_phone[-10:]

    # Mandatory Table & Seat Capacity Validation for Dine-In (Requirement 4) - Commented out as requested
    # if (payload.order_type or "").upper() == "DINE_IN":
    #     validate_table_and_seat(db, payload.table_number, payload.seat_number)

    # Duplicate Order Prevention via client Idempotency Key (Section 6)
    if payload.idempotency_key:
        existing_ch = db.query(OrderOTPChallenge).filter(
            OrderOTPChallenge.idempotency_key == payload.idempotency_key
        ).first()
        if existing_ch:
            existing_order = db.query(Order).options(
                joinedload(Order.items), joinedload(Order.otp_challenges)
            ).filter(Order.id == existing_ch.order_id).first()
            if existing_order:
                logger.info(f"Duplicate order submission prevented by idempotency key: {payload.idempotency_key}")
                return _format_order(existing_order, db)

    # Cleanup any expired pending challenges before allocating
    cleanup_expired_otp_challenges(db)

    customer_obj: Optional[Customer] = None
    customer_id: Optional[int] = payload.customer_id

    # Check if authenticated customer
    if opt_user and opt_user.customer:
        customer_obj = opt_user.customer
        customer_id = customer_obj.id
    elif customer_id:
        customer_obj = db.query(Customer).filter(Customer.id == customer_id).first()

    # Look up existing customer record by phone number
    if not customer_obj:
        customer_obj = db.query(Customer).filter(Customer.phone == customer_phone).first()

    # If customer does not exist in the database, automatically register them so they have an official Customer Number (ID)
    if not customer_obj:
        customer_obj = Customer(
            name=customer_name,
            phone=customer_phone,
            is_credit_eligible=False,
            credit_limit=Decimal("0.00"),
        )
        db.add(customer_obj)
        db.flush()

        # Initialize credit account
        credit_account = CreditAccount(
            customer_id=customer_obj.id,
            credit_limit=Decimal("0.00"),
            current_balance=Decimal("0.00"),
            is_active=False,
        )
        db.add(credit_account)
        db.flush()

    customer_id = customer_obj.id
    if not customer_name:
        customer_name = customer_obj.name
    if not customer_phone:
        customer_phone = customer_obj.phone

    # 2. Sequential Daily Token Calculation (Section 11 & Daily Reset)
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

    # 3. Snapshot Price & Validate Stock/Availability with Temporary Reservation (Section 7)
    order_total = Decimal("0.00")
    order_items_to_create = []

    for line_item in payload.items:
        menu_item = db.query(MenuItem).filter(MenuItem.id == line_item.menu_item_id).with_for_update().first()
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
            # Check physical availability minus currently active unexpired reservations
            effective_available = menu_item.available_quantity - menu_item.reserved_quantity
            if effective_available < line_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for '{menu_item.name}'. Available: {effective_available}, requested: {line_item.quantity}."
                )
            # Temporarily reserve quantity for this OTP session
            menu_item.reserved_quantity += line_item.quantity

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

    # 4. Credit Pre-Validation (Section 9)
    # Does NOT charge or debit credit balance yet. Credit is only debited upon OTP verification!
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

    # 5. Format Order Notes with Table/Seat/Counter Prefix
    order_type_str = (payload.order_type or "DINE_IN").upper().strip()
    notes_parts = []
    if order_type_str == "TAKEAWAY":
        notes_parts.append("Takeaway Order")
    else:
        if payload.table_number:
            seat_info = f", Seat #{payload.seat_number}" if payload.seat_number else ""
            notes_parts.append(f"Table #{payload.table_number}{seat_info}")
    if payload.counter_number:
        notes_parts.append(f"Counter #{payload.counter_number}")
    if payload.notes:
        notes_parts.append(payload.notes.strip())
    combined_notes = " | ".join(notes_parts) if notes_parts else None

    # 6. Save Order in PENDING_OTP_VERIFICATION state (Section 1)
    new_order = Order(
        order_number=order_number,
        daily_token_number=daily_token_number,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        order_type=order_type_str,
        table_number=payload.table_number if order_type_str != "TAKEAWAY" else None,
        seat_number=payload.seat_number if order_type_str != "TAKEAWAY" else None,
        total_amount=order_total,
        payment_method=payload.payment_method,
        payment_status=PaymentStatus.PENDING,
        order_status=OrderStatus.PENDING_OTP_VERIFICATION,
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

    # 8. Generate Secure Random 6-Digit OTP & Challenge (Section 3)
    otp_code = generate_otp_code()
    otp_hash_val, otp_salt_val = hash_otp(otp_code)
    expires_at = now_utc + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    challenge = OrderOTPChallenge(
        order_id=new_order.id,
        customer_id=customer_id,
        mobile_number=customer_phone,
        otp_hash=otp_hash_val,
        otp_salt=otp_salt_val,
        status="PENDING",
        attempts=0,
        max_attempts=settings.OTP_MAX_ATTEMPTS,
        created_at=now_utc,
        expires_at=expires_at,
        last_sent_at=now_utc,
        resend_count=0,
        cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        idempotency_key=payload.idempotency_key,
        reserved_stock=[{"menu_item_id": it["menu_item_id"], "quantity": it["quantity"]} for it in order_items_to_create]
    )
    db.add(challenge)
    db.flush()

    # 9. SMS Delivery
    try:
        send_otp_sms(customer_phone, otp_code, order_number)
    except Exception as e:
        logger.error(f"Failed to dispatch SMS for Order {order_number}: {e}")
        # Note: In development mode, mock/console always succeeds. In prod, log and handle safely.

    db.commit()
    db.refresh(new_order)

    logger.info(
        f"Created Order #{daily_token_number} ({order_number}) awaiting OTP verification. "
        f"Mode={payload.payment_method} Customer='{customer_name}' Phone='{mask_phone_number(customer_phone)}'"
    )

    return _format_order(new_order, db)


# =============================================================
# OTP Verification & Order Confirmation Endpoints (Section 3, 4, 6, 7, 8, 9)
# =============================================================

@router.post(
    "/{order_id}/verify-otp",
    response_model=OTPVerificationResponse,
    summary="Verify Order OTP and Atomically Confirm Order",
    description="Validates the 6-digit OTP, finalizes stock deduction and credit/payment ledgers, and confirms the order."
)
def verify_order_otp(
    order_id: str,
    payload: OTPVerificationRequest,
    db: Session = Depends(get_db)
):
    cleanup_expired_otp_challenges(db)

    # 1. Look up order with row locking
    if order_id.isdigit():
        order = db.query(Order).filter(Order.id == int(order_id)).with_for_update().first()
    else:
        order = db.query(Order).filter(Order.order_number == order_id).with_for_update().first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_id}' was not found."
        )

    # Idempotent handling: If already confirmed, return success
    if order.order_status in [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED]:
        return OTPVerificationResponse(
            success=True,
            message="Order is already confirmed.",
            verification_status="VERIFIED",
            order=_format_order(order, db)
        )

    if order.order_status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot verify a cancelled order."
        )

    if order.order_status == OrderStatus.VERIFICATION_EXPIRED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP verification session has expired. Please return to cart and place a new order."
        )

    if order.order_status != OrderStatus.PENDING_OTP_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order is not in a pending verification state (current: {order.order_status})."
        )

    # 2. Get active challenge
    challenge = None
    for ch in (order.otp_challenges or []):
        if ch.status == "PENDING":
            challenge = ch
            break

    if not challenge:
        if order.otp_challenges:
            latest_ch = order.otp_challenges[0]
            if latest_ch.status == "MAX_ATTEMPTS_EXCEEDED":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Maximum OTP verification attempts exceeded for this challenge. Please request a new OTP."
                )
            if latest_ch.status == "EXPIRED":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="OTP verification code has expired. Please request a new OTP."
                )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active OTP challenge found for this order. Please request a new OTP."
        )

    now_utc = datetime.now(timezone.utc)
    ch_expires = challenge.expires_at
    if ch_expires.tzinfo is None:
        ch_expires = ch_expires.replace(tzinfo=timezone.utc)

    # Expiry Check
    if now_utc > ch_expires:
        challenge.status = "EXPIRED"
        order.order_status = OrderStatus.VERIFICATION_EXPIRED
        # Release temporary stock reservations
        if challenge.reserved_stock and isinstance(challenge.reserved_stock, list):
            for res_item in challenge.reserved_stock:
                mi = db.query(MenuItem).filter(MenuItem.id == res_item.get("menu_item_id")).first()
                if mi and mi.track_stock:
                    mi.reserved_quantity = max(0, mi.reserved_quantity - res_item.get("quantity", 0))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP verification code has expired. Please request a new OTP."
        )

    # Max Attempts Check
    if challenge.attempts >= challenge.max_attempts:
        challenge.status = "MAX_ATTEMPTS_EXCEEDED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts exceeded for this challenge. Please request a new OTP."
        )

    # Increment attempts
    challenge.attempts += 1

    # Verify Hash
    is_valid = verify_otp_hash(payload.otp, challenge.otp_salt, challenge.otp_hash)
    if not is_valid:
        remaining = max(0, challenge.max_attempts - challenge.attempts)
        if remaining == 0:
            challenge.status = "MAX_ATTEMPTS_EXCEEDED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect OTP code. {remaining} attempt(s) remaining."
        )

    # 3. Successful Verification: Mark Challenge as VERIFIED
    challenge.status = "VERIFIED"
    challenge.verified_at = now_utc

    # 4. Finalize Inventory: Convert temporary reservations to permanent deductions
    for item in (order.items or []):
        if item.menu_item_id:
            menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).with_for_update().first()
            if menu_item and menu_item.track_stock:
                if menu_item.available_quantity < item.quantity:
                    db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Insufficient inventory available to confirm order for '{menu_item.name}'."
                    )
                menu_item.available_quantity = max(0, menu_item.available_quantity - item.quantity)
                menu_item.reserved_quantity = max(0, menu_item.reserved_quantity - item.quantity)

    # 5. Finalize Payment & Credit Ledgers (Rules 8 & 9)
    if order.payment_method == PaymentMethod.CREDIT:
        customer_obj = db.query(Customer).filter(Customer.id == order.customer_id).with_for_update().first()
        if not customer_obj:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Credit purchase requires an existing registered customer profile."
            )
        if not customer_obj.is_credit_eligible:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Customer '{customer_obj.name}' is not eligible for credit purchases."
            )
        credit_account = customer_obj.credit_account
        if not credit_account or not credit_account.is_active:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer credit account is inactive or not initialized."
            )
        projected_balance = credit_account.current_balance + order.total_amount
        if projected_balance > credit_account.credit_limit:
            db.rollback()
            available_credit = max(Decimal("0.00"), credit_account.credit_limit - credit_account.current_balance)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Credit limit exceeded at confirmation. Available credit: ₹{available_credit:.2f}, Order total: ₹{order.total_amount:.2f}."
            )
        # Update credit balance atomically
        credit_account.current_balance = projected_balance
        order.payment_status = PaymentStatus.PAID

        # Record Credit Transaction
        tx = CreditTransaction(
            customer_id=customer_obj.id,
            order_id=order.id,
            transaction_type=CreditTransactionType.CREDIT,
            amount=order.total_amount,
            balance_after=credit_account.current_balance,
            description=f"Order #{order.daily_token_number} ({order.order_number}) on Credit (OTP Verified)",
            recorded_by_user_id=None,
        )
        db.add(tx)
    else:
        # Cash/UPI/Card: Create or update Payment record
        pmt = db.query(Payment).filter(Payment.order_id == order.id).first()
        if not pmt:
            pmt = Payment(
                order_id=order.id,
                customer_id=order.customer_id,
                amount=order.total_amount,
                payment_method=order.payment_method,
                payment_status=PaymentRecordStatus.PENDING,
                transaction_reference=None,
            )
            db.add(pmt)
        order.payment_status = PaymentStatus.PENDING

    # 6. Confirm Order Status
    order.order_status = OrderStatus.CONFIRMED
    db.commit()
    db.refresh(order)

    logger.info(
        f"Order #{order.daily_token_number} ({order.order_number}) successfully confirmed via OTP verification! "
        f"Mode={order.payment_method} Customer='{order.customer_name}'"
    )

    return OTPVerificationResponse(
        success=True,
        message="OTP verified successfully! Order is confirmed.",
        verification_status="VERIFIED",
        attempts_remaining=challenge.max_attempts - challenge.attempts,
        order=_format_order(order, db)
    )


@router.post(
    "/{order_id}/resend-otp",
    summary="Resend Order OTP with Cooldown Enforcement",
    description="Invalidates previous OTP, checks cooldown, generates a new 6-digit OTP, and sends SMS."
)
def resend_order_otp(
    order_id: str,
    db: Session = Depends(get_db)
):
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.otp_challenges))
    if order_id.isdigit():
        order = query.filter(Order.id == int(order_id)).first()
    else:
        order = query.filter(Order.order_number == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{order_id}' was not found."
        )

    if order.order_status != OrderStatus.PENDING_OTP_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resend OTP for order in status '{order.order_status}'."
        )

    now_utc = datetime.now(timezone.utc)

    # Check cooldown on active or last challenge
    last_challenge = order.otp_challenges[0] if order.otp_challenges else None
    if last_challenge:
        last_sent = last_challenge.last_sent_at
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        elapsed = (now_utc - last_sent).total_seconds()
        if elapsed < last_challenge.cooldown_seconds:
            remaining = int(last_challenge.cooldown_seconds - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} second(s) before requesting a new OTP."
            )
        # Invalidate previous challenge
        last_challenge.status = "EXPIRED"

    # Generate new OTP code
    otp_code = generate_otp_code()
    otp_hash_val, otp_salt_val = hash_otp(otp_code)
    expires_at = now_utc + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    resend_count = (last_challenge.resend_count + 1) if last_challenge else 1

    # Preserve reserved stock specification from previous challenge or items
    reserved_stock = (
        last_challenge.reserved_stock if (last_challenge and last_challenge.reserved_stock)
        else [{"menu_item_id": it.menu_item_id, "quantity": it.quantity} for it in (order.items or [])]
    )

    new_challenge = OrderOTPChallenge(
        order_id=order.id,
        customer_id=order.customer_id,
        mobile_number=order.customer_phone,
        otp_hash=otp_hash_val,
        otp_salt=otp_salt_val,
        status="PENDING",
        attempts=0,
        max_attempts=settings.OTP_MAX_ATTEMPTS,
        created_at=now_utc,
        expires_at=expires_at,
        last_sent_at=now_utc,
        resend_count=resend_count,
        cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        reserved_stock=reserved_stock
    )
    db.add(new_challenge)
    db.commit()
    db.refresh(order)

    # Dispatch SMS
    send_otp_sms(order.customer_phone, otp_code, order.order_number)

    logger.info(f"Resent OTP for Order #{order.daily_token_number} ({order.order_number}) to {mask_phone_number(order.customer_phone)}")

    return {
        "success": True,
        "message": f"New OTP verification code sent to {mask_phone_number(order.customer_phone)}",
        "order": _format_order(order, db)
    }


@router.post(
    "/{order_id}/cancel-verification",
    summary="Cancel Pending Order and Release Reserved Stock",
    description="Customer cancels OTP verification session, marking order CANCELLED and immediately releasing inventory."
)
def cancel_order_verification(
    order_id: str,
    db: Session = Depends(get_db)
):
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.otp_challenges))
    if order_id.isdigit():
        order = query.filter(Order.id == int(order_id)).first()
    else:
        order = query.filter(Order.order_number == order_id).first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' was not found.")

    if order.order_status != OrderStatus.PENDING_OTP_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel verification for order in status '{order.order_status}'."
        )

    # Invalidate challenges
    for ch in (order.otp_challenges or []):
        if ch.status == "PENDING":
            ch.status = "CANCELLED"

    # Release temporarily reserved inventory
    for it in (order.items or []):
        if it.menu_item_id:
            mi = db.query(MenuItem).filter(MenuItem.id == it.menu_item_id).first()
            if mi and mi.track_stock:
                mi.reserved_quantity = max(0, mi.reserved_quantity - it.quantity)

    order.order_status = OrderStatus.CANCELLED
    db.commit()

    return {
        "success": True,
        "message": "Order verification cancelled successfully. Temporary reservations have been released."
    }


@router.post(
    "/{order_id}/admin-override",
    response_model=OrderResponse,
    summary="Staff/Admin Manual Confirmation Override",
    description="Allows authorized staff to manually confirm an order with an audit reason."
)
def admin_order_override(
    order_id: str,
    payload: AdminOrderOverrideRequest,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    if order_id.isdigit():
        order = db.query(Order).filter(Order.id == int(order_id)).with_for_update().first()
    else:
        order = db.query(Order).filter(Order.order_number == order_id).with_for_update().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' was not found.")

    if order.order_status != OrderStatus.PENDING_OTP_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Admin override is only valid for orders awaiting OTP verification (current status: {order.order_status})."
        )

    # Invalidate any pending challenges
    now_utc = datetime.now(timezone.utc)
    for ch in (order.otp_challenges or []):
        if ch.status == "PENDING":
            ch.status = "VERIFIED"
            ch.verified_at = now_utc

    # Finalize inventory
    for item in (order.items or []):
        if item.menu_item_id:
            menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).with_for_update().first()
            if menu_item and menu_item.track_stock:
                menu_item.available_quantity = max(0, menu_item.available_quantity - item.quantity)
                menu_item.reserved_quantity = max(0, menu_item.reserved_quantity - item.quantity)

    # Finalize credit if credit order
    if order.payment_method == PaymentMethod.CREDIT:
        customer_obj = db.query(Customer).filter(Customer.id == order.customer_id).with_for_update().first()
        if customer_obj and customer_obj.credit_account:
            credit_account = customer_obj.credit_account
            credit_account.current_balance += order.total_amount
            tx = CreditTransaction(
                customer_id=customer_obj.id,
                order_id=order.id,
                transaction_type=CreditTransactionType.CREDIT,
                amount=order.total_amount,
                balance_after=credit_account.current_balance,
                description=f"Order #{order.daily_token_number} ({order.order_number}) on Credit (Staff Override: {payload.reason})",
                recorded_by_user_id=current_user.id,
            )
            db.add(tx)
            order.payment_status = PaymentStatus.PAID
    else:
        pmt = db.query(Payment).filter(Payment.order_id == order.id).first()
        if not pmt:
            pmt = Payment(
                order_id=order.id,
                customer_id=order.customer_id,
                amount=order.total_amount,
                payment_method=order.payment_method,
                payment_status=PaymentRecordStatus.PENDING,
            )
            db.add(pmt)

    override_note = f"[ADMIN OVERRIDE by {current_user.name}: {payload.reason}]"
    order.notes = f"{order.notes} | {override_note}" if order.notes else override_note
    order.order_status = OrderStatus.CONFIRMED

    db.commit()
    db.refresh(order)

    logger.info(f"Staff member '{current_user.name}' performed manual confirmation override on Order #{order.daily_token_number}: {payload.reason}")
    return _format_order(order, db)


@router.get(
    "/{order_id}/verification-status",
    summary="Get Order OTP Verification Status",
    description="Returns public verification countdown, masked phone number, and status."
)
def get_order_verification_status(
    order_id: str,
    db: Session = Depends(get_db)
):
    cleanup_expired_otp_challenges(db)
    query = db.query(Order).options(joinedload(Order.otp_challenges))
    if order_id.isdigit():
        order = query.filter(Order.id == int(order_id)).first()
    else:
        order = query.filter(Order.order_number == order_id).first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' was not found.")

    formatted = _format_order(order, db)
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "order_status": order.order_status,
        "customer_name": order.customer_name,
        "total_amount": float(order.total_amount),
        "payment_method": order.payment_method,
        "otp_challenge": formatted.otp_challenge
    }


# =============================================================
# Token Queue & Display Screen Endpoints (Public & Staff)
# =============================================================

@router.get(
    "/tokens/today",
    summary="Get Today's Live Token Queue (Public / KDS)",
    description="Returns active daily tokens grouped by status for kitchen display and pickup calling screens. Includes unfulfilled orders from previous dates."
)
def get_today_tokens(
    target_date: Optional[date] = Query(None, description="Optional target date to filter tokens for (defaults to today)"),
    include_all_active: bool = Query(True, description="Whether to include unfulfilled orders (pending/preparing/ready) from previous dates"),
    db: Session = Depends(get_db)
):
    cleanup_expired_otp_challenges(db)
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()

    if not isinstance(target_date, date):
        target_date = None
    if not isinstance(include_all_active, bool):
        include_all_active = True

    view_date = target_date or today_date
    start_of_day = datetime.combine(view_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(view_date, time.max).replace(tzinfo=timezone.utc)

    active_statuses = [
        OrderStatus.PENDING_OTP_VERIFICATION,
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY
    ]

    if include_all_active:
        filter_clause = or_(
            Order.order_status.in_(active_statuses),
            and_(Order.created_at >= start_of_day, Order.created_at <= end_of_day)
        )
    else:
        filter_clause = and_(Order.created_at >= start_of_day, Order.created_at <= end_of_day)

    orders = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.shared_transactions),
        joinedload(Order.otp_challenges),
        joinedload(Order.shared_dishes_sent).joinedload(SharedDishTransaction.original_order_item)
    ).filter(filter_clause).order_by(Order.created_at.desc()).all()

    pending_otp = []
    pending = []
    preparing = []
    ready = []
    completed = []

    for o in orders:
        can_change = o.order_status not in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]

        shared_dishes_list = []
        for sd in (getattr(o, "shared_dishes_sent", []) or []):
            shared_dishes_list.append({
                "id": sd.id,
                "original_order_id": sd.original_order_id,
                "original_order_item_id": sd.original_order_item_id,
                "original_table_number": o.table_number,
                "original_seat_number": o.seat_number,
                "destination_table_id": sd.destination_table_id,
                "destination_table_number": sd.destination_table_id,
                "destination_seat_no": sd.destination_seat_no,
                "destination_seat_number": sd.destination_seat_no,
                "quantity": sd.quantity,
                "status": sd.status,
                "created_by": sd.created_by,
                "created_at": sd.created_at.isoformat() if sd.created_at else None,
                "formatted_time": sd.created_at.strftime("%I:%M %p") if sd.created_at else None,
                "dish_name": sd.original_order_item.item_name if sd.original_order_item else None,
            })

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
            item_shares = [
                {
                    "id": st.id,
                    "destination_table_id": st.destination_table_id,
                    "destination_seat_no": st.destination_seat_no,
                    "quantity": st.quantity,
                    "status": st.status,
                }
                for st in (getattr(i, "shared_transactions", []) or [])
            ]
            shared_qty = sum(s["quantity"] for s in item_shares if s["status"] in ["CONFIRMED", "PENDING"])
            remaining_unshared = max(0, i.quantity - shared_qty)

            items_list.append({
                "id": i.id,
                "menu_item_id": i.menu_item_id,
                "item_name": i.item_name,
                "quantity": i.quantity,
                "unit_price": float(i.unit_price),
                "total_price": float(i.total_price),
                "selected_options": i.selected_options,
                "status": getattr(i, "status", "PENDING") or "PENDING",
                "cancelled_by": getattr(i, "cancelled_by", None),
                "cancelled_at": i.cancelled_at.isoformat() if getattr(i, "cancelled_at", None) else None,
                "completed_at": i.completed_at.isoformat() if getattr(i, "completed_at", None) else None,
                "sugar_option": sugar,
                "strength_option": strength,
                "shared_quantity": shared_qty,
                "remaining_unshared_quantity": remaining_unshared,
                "shares": item_shares,
            })

        order_created = o.created_at.replace(tzinfo=timezone.utc) if o.created_at.tzinfo is None else o.created_at.astimezone(timezone.utc)
        order_date = order_created.date()
        is_today = (order_date == today_date)
        is_previous_day = (order_date < today_date)
        days_ago = (today_date - order_date).days if is_previous_day else 0
        date_label = (
            "Today" if is_today
            else "Yesterday" if days_ago == 1
            else f"{order_date.strftime('%d %b %Y')} ({days_ago} days ago)"
        )

        token_info = {
            "order_id": o.id,
            "order_number": o.order_number,
            "token_number": o.daily_token_number,
            "daily_token_number": o.daily_token_number,
            "customer_name": o.customer_name,
            "customer_phone": mask_phone_number(o.customer_phone),
            "order_type": getattr(o, "order_type", "DINE_IN"),
            "table_number": getattr(o, "table_number", None),
            "seat_number": getattr(o, "seat_number", None),
            "can_change_table_or_seat": can_change,
            "table_or_notes": o.notes,
            "notes": o.notes,
            "items": items_list,
            "items_count": sum(i.quantity for i in (o.items or [])),
            "total_amount": float(o.total_amount),
            "order_status": o.order_status,
            "payment_method": o.payment_method,
            "payment_status": o.payment_status,
            "otp_verification_status": (
                "VERIFIED" if o.order_status in [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED]
                else "EXPIRED" if o.order_status == OrderStatus.VERIFICATION_EXPIRED
                else "CANCELLED" if o.order_status == OrderStatus.CANCELLED
                else "PENDING"
            ),
            "created_at": o.created_at.isoformat(),
            "order_time": o.created_at.isoformat(),
            "order_date": order_date.isoformat(),
            "is_today": is_today,
            "is_previous_day": is_previous_day,
            "days_ago": days_ago,
            "date_label": date_label,
            "shared_dishes": shared_dishes_list,
        }
        if o.order_status == OrderStatus.PENDING_OTP_VERIFICATION:
            pending_otp.append(token_info)
        elif o.order_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED]:
            pending.append(token_info)
        elif o.order_status == OrderStatus.PREPARING:
            preparing.append(token_info)
        elif o.order_status == OrderStatus.READY:
            ready.append(token_info)
        elif o.order_status == OrderStatus.COMPLETED:
            completed.append(token_info)

    today_orders = [o for o in orders if o.created_at >= start_of_day and o.created_at <= end_of_day]
    prev_orders_active = [o for o in orders if o.created_at < start_of_day and o.order_status in active_statuses]

    return {
        "today": today_date.isoformat(),
        "view_date": view_date.isoformat(),
        "total_orders_today": len([o for o in today_orders if o.order_status not in [OrderStatus.CANCELLED, OrderStatus.VERIFICATION_EXPIRED]]),
        "total_active_pipeline": len(pending_otp) + len(pending) + len(preparing) + len(ready),
        "previous_days_active_count": len(prev_orders_active),
        "latest_token": max([o.daily_token_number for o in today_orders], default=0),
        "pending_otp": pending_otp,
        "pending": pending,
        "preparing": preparing,
        "ready": ready,
        "completed": completed[:20],  # Last 20 completed for history
    }


@router.get(
    "/tokens/stats",
    response_model=DailyTokenStats,
    summary="Get Daily Token Summary Statistics",
    description="High-level counts of active tokens for header status badges."
)
def get_daily_token_stats(db: Session = Depends(get_db)):
    cleanup_expired_otp_challenges(db)
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    active_statuses = [
        OrderStatus.PENDING_OTP_VERIFICATION,
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY
    ]

    orders = db.query(Order).filter(
        or_(
            Order.order_status.in_(active_statuses),
            and_(Order.created_at >= start_of_day, Order.created_at <= end_of_day)
        )
    ).all()

    today_orders = [o for o in orders if o.created_at >= start_of_day and o.created_at <= end_of_day]
    latest_token = max([o.daily_token_number for o in today_orders], default=0)
    pending_count = sum(1 for o in orders if o.order_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED])
    preparing_count = sum(1 for o in orders if o.order_status == OrderStatus.PREPARING)
    ready_count = sum(1 for o in orders if o.order_status == OrderStatus.READY)
    completed_count = sum(1 for o in today_orders if o.order_status == OrderStatus.COMPLETED)

    return DailyTokenStats(
        today_date=today_date.isoformat(),
        total_orders=len([o for o in today_orders if o.order_status not in [OrderStatus.CANCELLED, OrderStatus.VERIFICATION_EXPIRED]]),
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
        joinedload(Order.items), joinedload(Order.otp_challenges)
    ).filter(
        Order.customer_id == current_user.customer.id
    ).order_by(desc(Order.created_at)).all()

    return [_format_order(o, db) for o in orders]


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
    cleanup_expired_otp_challenges(db)
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.otp_challenges))

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
        items=[_format_order(o, db) for o in orders],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get(
    "/{order_id}",
    response_model=OrderResponse,
    summary="Get Order by ID or Order Number",
    description="Returns order details with complete line item snapshot and OTP status."
)
def get_order_by_id(
    order_id: str,
    db: Session = Depends(get_db),
    opt_user: Optional[User] = Depends(_get_optional_user)
):
    cleanup_expired_otp_challenges(db)
    query = db.query(Order).options(joinedload(Order.items), joinedload(Order.otp_challenges))
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

    return _format_order(order, db)


@router.patch(
    "/{order_id}/status",
    response_model=OrderResponse,
    summary="Update Order Preparation Status (Staff / Admin)",
    description="Transitions order between CONFIRMED -> PREPARING -> READY -> COMPLETED or CANCELLED."
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
    new_status = payload.order_status

    if old_status == OrderStatus.PENDING_OTP_VERIFICATION and new_status not in [OrderStatus.CANCELLED, OrderStatus.VERIFICATION_EXPIRED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot progress an unverified order. Customer must verify OTP, or authorized staff must use Admin Override."
        )

    if old_status != new_status:
        # If order is being cancelled, restore inventory
        if new_status == OrderStatus.CANCELLED:
            if old_status == OrderStatus.PENDING_OTP_VERIFICATION:
                # Release temporary stock reservation
                for item in (order.items or []):
                    if item.menu_item_id:
                        menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
                        if menu_item and menu_item.track_stock:
                            menu_item.reserved_quantity = max(0, menu_item.reserved_quantity - item.quantity)
            else:
                # Release permanently deducted stock
                for item in (order.items or []):
                    if item.menu_item_id:
                        menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
                        if menu_item and menu_item.track_stock:
                            menu_item.available_quantity += item.quantity
                            logger.info(
                                f"Restored stock for MenuItem '{menu_item.name}' (ID: {menu_item.id}) by {item.quantity} units. "
                                f"New available stock: {menu_item.available_quantity} (Order #{order.daily_token_number} cancelled)"
                            )

            # Revert credit debt if this order was paid on credit
            if order.payment_method == PaymentMethod.CREDIT and order.customer_id and old_status != OrderStatus.PENDING_OTP_VERIFICATION:
                customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
                if customer and customer.credit_account:
                    credit_account = customer.credit_account
                    credit_account.current_balance = max(Decimal("0.00"), credit_account.current_balance - order.total_amount)
                    refund_tx = CreditTransaction(
                        customer_id=customer.id,
                        order_id=order.id,
                        transaction_type=CreditTransactionType.ADJUSTMENT,
                        amount=order.total_amount,
                        balance_after=credit_account.current_balance,
                        description=f"Credit reversed for cancelled Order #{order.daily_token_number} ({order.order_number})",
                        recorded_by_user_id=current_user.id if current_user else None,
                    )
                    db.add(refund_tx)

            # Update payment record if pending or completed
            payment = db.query(Payment).filter(Payment.order_id == order.id).first()
            if payment:
                if payment.payment_status == PaymentRecordStatus.PENDING:
                    payment.payment_status = PaymentRecordStatus.FAILED
                elif payment.payment_status == PaymentRecordStatus.COMPLETED:
                    payment.payment_status = PaymentRecordStatus.REFUNDED

            if order.payment_status == PaymentStatus.PENDING:
                order.payment_status = PaymentStatus.FAILED

        # Re-opening previously cancelled order: re-deduct inventory
        elif old_status == OrderStatus.CANCELLED:
            for item in (order.items or []):
                if item.menu_item_id:
                    menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
                    if menu_item and menu_item.track_stock:
                        menu_item.available_quantity = max(0, menu_item.available_quantity - item.quantity)
                        logger.info(
                            f"Re-deducted stock for MenuItem '{menu_item.name}' (ID: {menu_item.id}) by {item.quantity} units. "
                            f"New available stock: {menu_item.available_quantity} (Order #{order.daily_token_number} re-opened)"
                        )

            if order.payment_method == PaymentMethod.CREDIT and order.customer_id:
                customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
                if customer and customer.credit_account:
                    credit_account = customer.credit_account
                    credit_account.current_balance += order.total_amount
                    recharge_tx = CreditTransaction(
                        customer_id=customer.id,
                        order_id=order.id,
                        transaction_type=CreditTransactionType.CREDIT,
                        amount=order.total_amount,
                        balance_after=credit_account.current_balance,
                        description=f"Credit re-applied for re-opened Order #{order.daily_token_number} ({order.order_number})",
                        recorded_by_user_id=current_user.id if current_user else None,
                    )
                    db.add(recharge_tx)

        order.order_status = new_status
        db.commit()
        db.refresh(order)

    logger.info(
        f"Order #{order.daily_token_number} status changed from {old_status} "
        f"to {order.order_status} by {current_user.name} ({current_user.role})"
    )

    return _format_order(order, db)


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

    return _format_order(order, db)


# =============================================================
# Table & Seat Change (Requirement 6)
# =============================================================

@router.patch(
    "/{order_id}/table-seat",
    response_model=OrderResponse,
    summary="Change Order Table or Seat Prior to Delivery",
    description="Allows customers or staff to update their table or seat until the order is delivered/completed."
)
def update_order_table_seat(
    order_id: int,
    payload: TableSeatChangeRequest,
    db: Session = Depends(get_db),
    opt_user: Optional[User] = Depends(_get_optional_user)
):
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.shared_transactions),
        joinedload(Order.otp_challenges),
        joinedload(Order.shared_dishes_sent).joinedload(SharedDishTransaction.original_order_item)
    ).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{order_id} not found."
        )

    # Restriction: Allowed ONLY until the first order has been delivered
    if order.order_status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Table or seat cannot be changed because this order has already been delivered or cancelled."
        )

    new_table = payload.table_number.strip()
    new_seat = payload.seat_number.strip() if payload.seat_number else None

    # Validate table capacity and seat bounds (Requirement 4)
    validate_table_and_seat(db, new_table, new_seat)

    old_table = order.table_number or "None"
    old_seat = order.seat_number or "None"

    order.order_type = "DINE_IN"
    order.table_number = new_table
    order.seat_number = new_seat

    audit_entry = f"[Table/Seat changed: Table #{old_table}, Seat #{old_seat} ➔ Table #{new_table}, Seat #{new_seat or '1'}]"
    if order.notes:
        order.notes = f"{order.notes} | {audit_entry}"
    else:
        order.notes = audit_entry

    db.commit()
    db.refresh(order)
    logger.info(f"Order #{order.order_number} table updated to Table {new_table}, Seat {new_seat}")
    return _format_order(order, db)


# =============================================================
# Shared Dish Transfer / Sharing (Requirement 5 & 1)
# =============================================================

@router.post(
    "/{order_id}/items/{item_id}/share",
    response_model=SharedDishResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Share Dish with Another Table (Billing Stays with Original Table)",
    description="Transfers a dish or partial quantity to a destination table for serving without duplicate billing."
)
def share_order_dish(
    order_id: int,
    item_id: int,
    payload: SharedDishCreate,
    db: Session = Depends(get_db),
    opt_user: Optional[User] = Depends(_get_optional_user)
):
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.shared_transactions)
    ).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order #{order_id} not found.")

    if order.order_status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled orders cannot be shared.")

    order_item = db.query(OrderItem).options(
        joinedload(OrderItem.shared_transactions)
    ).filter(OrderItem.id == item_id, OrderItem.order_id == order_id).first()

    if not order_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item #{item_id} not found in Order #{order_id}.")

    if payload.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Shared quantity must be greater than zero.")

    unshared_qty = order_item.remaining_unshared_quantity
    if payload.quantity > unshared_qty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot share {payload.quantity} units. Only {unshared_qty} unshared unit(s) remaining for '{order_item.item_name}'."
        )

    dest_table = payload.destination_table.strip()
    dest_seat = payload.destination_seat.strip() if payload.destination_seat else None
    staff_name = payload.staff_member or (opt_user.name if opt_user else "Staff")

    # Validate destination table and seat capacity (Requirement 4)
    validate_table_and_seat(db, dest_table, dest_seat)

    shared_tx = SharedDishTransaction(
        original_order_id=order.id,
        original_order_item_id=order_item.id,
        destination_table_id=dest_table,
        destination_seat_no=dest_seat,
        quantity=payload.quantity,
        status="CONFIRMED",
        created_by=staff_name
    )
    db.add(shared_tx)

    # Billing Responsibility Rule:
    # Original table pays for the shared dish. No duplicate charge on destination.
    share_note = f"[Shared {payload.quantity}x {order_item.item_name} with Table {dest_table}{f', Seat {dest_seat}' if dest_seat else ''}]"
    if order.notes:
        order.notes = f"{order.notes} | {share_note}"
    else:
        order.notes = share_note

    db.commit()
    db.refresh(shared_tx)
    logger.info(f"Shared dish recorded: {payload.quantity}x {order_item.item_name} from Order #{order.order_number} to Table {dest_table}")

    return SharedDishResponse(
        id=shared_tx.id,
        original_order_id=shared_tx.original_order_id,
        original_order_item_id=shared_tx.original_order_item_id,
        original_table_number=order.table_number,
        original_seat_number=order.seat_number,
        destination_table_id=shared_tx.destination_table_id,
        destination_table_number=shared_tx.destination_table_id,
        destination_seat_no=shared_tx.destination_seat_no,
        destination_seat_number=shared_tx.destination_seat_no,
        quantity=shared_tx.quantity,
        status=shared_tx.status,
        created_by=shared_tx.created_by,
        created_at=shared_tx.created_at,
        formatted_time=shared_tx.created_at.strftime("%I:%M %p") if shared_tx.created_at else None,
        dish_name=order_item.item_name
    )


@router.get(
    "/tables/{table_number}/shared-dishes",
    response_model=List[SharedDishResponse],
    summary="Get Shared Dishes Received by Table",
    description="Returns all dishes shared with this table for serving display (no additional charge)."
)
def get_table_shared_dishes(
    table_number: str,
    db: Session = Depends(get_db)
):
    shares = db.query(SharedDishTransaction).options(
        joinedload(SharedDishTransaction.original_order_item),
        joinedload(SharedDishTransaction.original_order)
    ).filter(
        SharedDishTransaction.destination_table_id == table_number.strip(),
        SharedDishTransaction.status == "CONFIRMED"
    ).order_by(SharedDishTransaction.created_at.desc()).all()

    return [
        SharedDishResponse(
            id=s.id,
            original_order_id=s.original_order_id,
            original_order_item_id=s.original_order_item_id,
            original_table_number=s.original_order.table_number if s.original_order else None,
            original_seat_number=s.original_order.seat_number if s.original_order else None,
            destination_table_id=s.destination_table_id,
            destination_table_number=s.destination_table_id,
            destination_seat_no=s.destination_seat_no,
            destination_seat_number=s.destination_seat_no,
            quantity=s.quantity,
            status=s.status,
            created_by=s.created_by,
            created_at=s.created_at,
            formatted_time=s.created_at.strftime("%I:%M %p") if s.created_at else None,
            dish_name=s.original_order_item.item_name if s.original_order_item else "Unknown Dish"
        )
        for s in shares
    ]


@router.post(
    "/shares/{share_id}/reverse",
    response_model=SharedDishResponse,
    summary="Reverse Shared Dish Transaction",
    description="Reverses a dish sharing record preserving audit history without altering the bill."
)
def reverse_shared_dish(
    share_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_staff_or_admin)
):
    share = db.query(SharedDishTransaction).options(
        joinedload(SharedDishTransaction.original_order_item),
        joinedload(SharedDishTransaction.original_order)
    ).filter(SharedDishTransaction.id == share_id).first()

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sharing transaction not found.")

    if share.status == "REVERSED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This sharing transaction is already reversed.")

    share.status = "REVERSED"
    
    rev_note = f"[Reversed share of {share.quantity}x {share.original_order_item.item_name if share.original_order_item else 'dish'} by {admin_user.name}]"
    if share.original_order:
        if share.original_order.notes:
            share.original_order.notes = f"{share.original_order.notes} | {rev_note}"
        else:
            share.original_order.notes = rev_note

    db.commit()
    db.refresh(share)
    return SharedDishResponse(
        id=share.id,
        original_order_id=share.original_order_id,
        original_order_item_id=share.original_order_item_id,
        original_table_number=share.original_order.table_number if share.original_order else None,
        original_seat_number=share.original_order.seat_number if share.original_order else None,
        destination_table_id=share.destination_table_id,
        destination_table_number=share.destination_table_id,
        destination_seat_no=share.destination_seat_no,
        destination_seat_number=share.destination_seat_no,
        quantity=share.quantity,
        status=share.status,
        created_by=share.created_by,
        created_at=share.created_at,
        formatted_time=share.created_at.strftime("%I:%M %p") if share.created_at else None,
        dish_name=share.original_order_item.item_name if share.original_order_item else "Unknown Dish"
    )


# =============================================================
# ADMIN DISH CONTROLS (Requirement 2 & 5)
# =============================================================

@router.patch(
    "/{order_id}/items/{item_id}/dish-status",
    response_model=OrderResponse,
    summary="Update Dish Preparation Status (Admin/Staff Only)",
    description="Updates an individual dish status (e.g. READY, PENDING, PREPARING) with validation and persistence."
)
def update_dish_status(
    order_id: str,
    item_id: int,
    payload: DishStatusUpdate,
    admin_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    """
    Allows admin/staff to mark dish as READY or revert to PENDING/PREPARING.
    Persists changes and updates overall order status if all dishes are completed.
    """
    if order_id.isdigit():
        order = db.query(Order).filter(Order.id == int(order_id)).with_for_update().first()
    else:
        order = db.query(Order).filter(Order.order_number == order_id).with_for_update().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' not found.")

    target_item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).with_for_update().first()

    if not target_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dish item #{item_id} not found in this order.")

    new_status = payload.status.upper().strip()
    valid_statuses = ["PENDING", "PREPARING", "READY", "DELIVERED", "CANCELLED"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid dish status: {payload.status}. Must be one of {valid_statuses}")

    # Cannot toggle status of a cancelled dish via this endpoint
    if target_item.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update status of a cancelled dish. Dish was cancelled by Admin."
        )

    old_status = target_item.status
    target_item.status = new_status
    now_utc = datetime.now(timezone.utc)

    if new_status == "READY":
        target_item.completed_at = now_utc
    elif new_status in ["PENDING", "PREPARING"]:
        target_item.completed_at = None

    # Audit log entry into order notes
    status_note = f"[Dish '{target_item.item_name}' status changed: {old_status} ➔ {new_status} by {admin_user.name}]"
    if order.notes:
        order.notes = f"{order.notes} | {status_note}"
    else:
        order.notes = status_note

    # Check if all active non-cancelled dishes are now READY or DELIVERED
    active_items = [i for i in order.items if i.id != target_item.id and i.status != "CANCELLED"] + ([target_item] if new_status != "CANCELLED" else [])
    if active_items and all(i.status in ["READY", "DELIVERED"] for i in active_items):
        if order.order_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING]:
            order.order_status = OrderStatus.READY

    db.commit()
    db.refresh(order)
    return _format_order(order, db)


@router.post(
    "/{order_id}/items/{item_id}/cancel-dish",
    response_model=OrderResponse,
    summary="Cancel Individual Dish (Admin Only)",
    description="Authorized admin cancels a single dish without cancelling the entire order. Updates order total, preserves history, and returns stock."
)
def cancel_individual_dish(
    order_id: str,
    item_id: int,
    payload: DishCancelRequest,
    admin_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    """
    Cancels an individual dish item:
    1. Sets item status to CANCELLED and records cancelled_by = 'ADMIN'.
    2. Subtracts dish total from order total_amount (and credit/payment records).
    3. Restores stock to MenuItem if track_stock is enabled.
    4. Preserves audit history.
    """
    if order_id.isdigit():
        order = db.query(Order).filter(Order.id == int(order_id)).with_for_update().first()
    else:
        order = db.query(Order).filter(Order.order_number == order_id).with_for_update().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' not found.")

    target_item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).with_for_update().first()

    if not target_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dish item #{item_id} not found in this order.")

    if target_item.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This dish is already cancelled.")

    now_utc = datetime.now(timezone.utc)
    old_status = target_item.status
    target_item.status = "CANCELLED"
    target_item.cancelled_by = "ADMIN"
    target_item.cancelled_at = now_utc

    # Restore stock if item was active
    if target_item.menu_item_id:
        menu_item = db.query(MenuItem).filter(MenuItem.id == target_item.menu_item_id).with_for_update().first()
        if menu_item and menu_item.track_stock:
            menu_item.available_quantity += target_item.quantity

    # Recalculate order total from remaining active non-cancelled items
    remaining_active_items = [i for i in order.items if i.id != target_item.id and i.status != "CANCELLED"]
    new_total = sum(Decimal(str(i.total_price)) for i in remaining_active_items) if remaining_active_items else Decimal("0.00")
    amount_reduced = Decimal(str(order.total_amount)) - new_total
    order.total_amount = new_total

    # Update payment or credit transaction if needed
    if order.payment_method == PaymentMethod.CREDIT and amount_reduced > Decimal("0.00"):
        customer_obj = db.query(Customer).filter(Customer.id == order.customer_id).with_for_update().first()
        if customer_obj and customer_obj.credit_account:
            credit_account = customer_obj.credit_account
            credit_account.current_balance = max(Decimal("0.00"), credit_account.current_balance - amount_reduced)
            adj_tx = CreditTransaction(
                customer_id=customer_obj.id,
                order_id=order.id,
                transaction_type=CreditTransactionType.PAYMENT,
                amount=amount_reduced,
                balance_after=credit_account.current_balance,
                description=f"Refund/Adjustment for cancelled dish '{target_item.item_name}' (Order #{order.daily_token_number}) by {admin_user.name}",
                recorded_by_user_id=admin_user.id,
            )
            db.add(adj_tx)
    else:
        pmt = db.query(Payment).filter(Payment.order_id == order.id).first()
        if pmt:
            pmt.amount = new_total

    # If all items are now cancelled, mark whole order CANCELLED
    if not remaining_active_items:
        order.order_status = OrderStatus.CANCELLED

    # Audit log into order notes
    reason_str = f" Reason: {payload.reason}" if payload.reason else ""
    cancel_note = f"[Dish '{target_item.item_name}' (qty: {target_item.quantity}) cancelled by Admin {admin_user.name}.{reason_str}]"
    if order.notes:
        order.notes = f"{order.notes} | {cancel_note}"
    else:
        order.notes = cancel_note

    db.commit()
    db.refresh(order)
    return _format_order(order, db)


# =============================================================
# CUSTOMER MY MENU ENDPOINTS (Requirement 4 & 5)
# =============================================================

@router.get(
    "/customer/find-orders",
    response_model=List[OrderResponse],
    summary="Find Customer Orders by Phone or Name",
    description="Customer-facing lookup to view current and recent orders by registered mobile number or customer name."
)
def find_customer_orders(
    query: str = Query(..., min_length=2, max_length=100, description="Customer 10-digit mobile number or customer name"),
    db: Session = Depends(get_db)
):
    """
    Search active or recent orders by matching phone number or customer name.
    Strictly validates input to prevent wildcard exposure.
    """
    clean_query = query.strip()
    digits = "".join(ch for ch in clean_query if ch.isdigit())

    filter_conditions = []
    # If 10 digits provided, match phone strictly
    if len(digits) >= 10:
        phone_10 = digits[-10:]
        filter_conditions.append(Order.customer_phone.like(f"%{phone_10}"))
    else:
        # Match customer name exact or substring (min 3 chars)
        if len(clean_query) >= 3:
            filter_conditions.append(Order.customer_name.ilike(f"%{clean_query}%"))
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please enter a valid 10-digit mobile number or at least 3 letters of your customer name."
            )

    orders = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.shared_transactions),
        joinedload(Order.otp_challenges),
        joinedload(Order.shared_dishes_sent).joinedload(SharedDishTransaction.original_order_item)
    ).filter(or_(*filter_conditions)).order_by(Order.created_at.desc()).limit(15).all()

    return [_format_order(o, db) for o in orders]


@router.patch(
    "/{order_id}/customer-edit",
    response_model=OrderResponse,
    summary="Customer Edit Order from My Menu",
    description="Allows customer to add dishes, edit quantities, or request removal of eligible items on active orders."
)
def customer_edit_order(
    order_id: str,
    payload: CustomerOrderEditRequest,
    db: Session = Depends(get_db)
):
    """
    Allows a customer to edit their pending/preparing order:
    - Verifies customer ownership by matching phone number.
    - Prevents editing DELIVERED or CANCELLED dishes.
    - Admin cancellations take strict precedence and cannot be overwritten.
    - Server recalculates all prices based on active MenuItem catalog prices.
    - Validates stock availability for quantity increments or new dishes.
    """
    clean_phone = "".join(ch for ch in payload.customer_phone if ch.isdigit())
    if len(clean_phone) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid 10-digit mobile number is required to verify order ownership."
        )
    phone_10 = clean_phone[-10:]

    if order_id.isdigit():
        order = db.query(Order).filter(Order.id == int(order_id)).with_for_update().first()
    else:
        order = db.query(Order).filter(Order.order_number == order_id).with_for_update().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order '{order_id}' not found.")

    # Verify customer ownership
    order_digits = "".join(ch for ch in order.customer_phone if ch.isdigit())
    if not order_digits.endswith(phone_10):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Phone number does not match this order. Authorization failed."
        )

    # Order level lifecycle check: Cannot edit delivered, cancelled or completed orders
    if order.order_status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit order with status {order.order_status}."
        )

    audit_changes = []

    for edit in payload.edits:
        # Case A: Existing Item Modification (quantity change or customer removal)
        if edit.item_id:
            existing_item = db.query(OrderItem).filter(
                OrderItem.id == edit.item_id,
                OrderItem.order_id == order.id
            ).with_for_update().first()

            if not existing_item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dish item #{edit.item_id} not found in this order."
                )

            # RULE: If dish is CANCELLED (especially by Admin), customer cannot modify or re-activate it
            if existing_item.status == "CANCELLED":
                if edit.quantity <= 0:
                    # Item is already cancelled; customer is keeping it cancelled or confirming removal
                    continue
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Dish '{existing_item.item_name}' was cancelled and cannot be re-activated."
                    )

            # RULE: Cannot modify dishes that are already READY or DELIVERED
            if existing_item.status in ["READY", "DELIVERED"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Dish '{existing_item.item_name}' is already {existing_item.status} and cannot be modified."
                )

            if edit.quantity == 0:
                # Customer requests removal/cancellation of dish
                existing_item.status = "CANCELLED"
                existing_item.cancelled_by = "CUSTOMER"
                existing_item.cancelled_at = datetime.now(timezone.utc)
                if existing_item.menu_item_id:
                    m_item = db.query(MenuItem).filter(MenuItem.id == existing_item.menu_item_id).with_for_update().first()
                    if m_item and m_item.track_stock:
                        m_item.available_quantity += existing_item.quantity
                audit_changes.append(f"Removed '{existing_item.item_name}'")
            else:
                # Quantity update
                diff = edit.quantity - existing_item.quantity
                if diff > 0 and existing_item.menu_item_id:
                    m_item = db.query(MenuItem).filter(MenuItem.id == existing_item.menu_item_id).with_for_update().first()
                    if m_item and m_item.track_stock:
                        if m_item.available_quantity < diff:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Insufficient stock for '{existing_item.item_name}'. Only {m_item.available_quantity} available."
                            )
                        m_item.available_quantity -= diff
                elif diff < 0 and existing_item.menu_item_id:
                    m_item = db.query(MenuItem).filter(MenuItem.id == existing_item.menu_item_id).with_for_update().first()
                    if m_item and m_item.track_stock:
                        m_item.available_quantity += abs(diff)

                old_qty = existing_item.quantity
                existing_item.quantity = edit.quantity
                existing_item.total_price = Decimal(str(existing_item.unit_price)) * Decimal(str(edit.quantity))
                if edit.selected_options is not None:
                    existing_item.selected_options = edit.selected_options
                audit_changes.append(f"Changed '{existing_item.item_name}' qty: {old_qty} ➔ {edit.quantity}")

        # Case B: Adding a new dish to the order
        elif edit.menu_item_id:
            if edit.quantity <= 0:
                continue
            menu_item = db.query(MenuItem).filter(MenuItem.id == edit.menu_item_id).with_for_update().first()
            if not menu_item or not menu_item.is_available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Dish item #{edit.menu_item_id} is unavailable or not found."
                )

            if menu_item.track_stock:
                if menu_item.available_quantity < edit.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Insufficient stock for '{menu_item.name}'. Only {menu_item.available_quantity} available."
                    )
                menu_item.available_quantity -= edit.quantity

            unit_price = Decimal(str(menu_item.price))
            total_price = unit_price * Decimal(str(edit.quantity))
            new_item = OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                item_name=menu_item.name,
                quantity=edit.quantity,
                unit_price=unit_price,
                total_price=total_price,
                selected_options=edit.selected_options,
                status="PENDING",
            )
            db.add(new_item)
            audit_changes.append(f"Added {edit.quantity}x '{menu_item.name}'")

    db.flush()

    # Recalculate order total from all active non-cancelled items
    active_items = [i for i in order.items if i.status != "CANCELLED"]
    new_total = sum(Decimal(str(i.total_price)) for i in active_items) if active_items else Decimal("0.00")
    order.total_amount = new_total

    # Update payment amount
    pmt = db.query(Payment).filter(Payment.order_id == order.id).first()
    if pmt:
        pmt.amount = new_total

    # If all items are cancelled or total reaches 0.00, close and cancel the entire order
    if not active_items or new_total <= Decimal("0.00"):
        old_status = order.order_status
        order.order_status = OrderStatus.CANCELLED
        if order.payment_status == PaymentStatus.PENDING:
            order.payment_status = PaymentStatus.FAILED
        if pmt:
            if pmt.payment_status == PaymentRecordStatus.PENDING:
                pmt.payment_status = PaymentRecordStatus.FAILED
            elif pmt.payment_status == PaymentRecordStatus.COMPLETED:
                pmt.payment_status = PaymentRecordStatus.REFUNDED

        if order.payment_method == PaymentMethod.CREDIT and order.customer_id:
            customer_obj = db.query(Customer).filter(Customer.id == order.customer_id).with_for_update().first()
            if customer_obj and customer_obj.credit_account:
                credit_account = customer_obj.credit_account
                credit_account.current_balance = max(Decimal("0.00"), credit_account.current_balance - order.total_amount)

        audit_changes.append(f"All dishes cancelled - Order #{order.daily_token_number} closed/cancelled (was {old_status})")

    # Update credit balance if credit order and still active
    elif order.payment_method == PaymentMethod.CREDIT:
        customer_obj = db.query(Customer).filter(Customer.id == order.customer_id).with_for_update().first()
        if customer_obj and customer_obj.credit_account:
            credit_account = customer_obj.credit_account
            pass

    # Audit note
    if audit_changes:
        audit_note = f"[Customer Edits ({datetime.now(timezone.utc).strftime('%H:%M')}): {', '.join(audit_changes)}]"
        order.notes = f"{order.notes} | {audit_note}" if order.notes else audit_note

    db.commit()
    db.refresh(order)
    return _format_order(order, db)


