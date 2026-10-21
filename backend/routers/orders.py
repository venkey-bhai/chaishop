import logging
import secrets
from datetime import datetime, timezone, time, date, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy import or_, func, desc
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
        otp_challenge=challenge_info
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

    # 5. Format Order Notes with Table/Counter Prefix
    notes_parts = []
    if payload.table_number:
        notes_parts.append(f"Table #{payload.table_number}")
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
    description="Returns active daily tokens grouped by status for kitchen display and pickup calling screens."
)
def get_today_tokens(db: Session = Depends(get_db)):
    cleanup_expired_otp_challenges(db)
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    orders = db.query(Order).options(joinedload(Order.items), joinedload(Order.otp_challenges)).filter(
        Order.created_at >= start_of_day,
        Order.created_at <= end_of_day
    ).order_by(Order.daily_token_number.desc()).all()

    pending_otp = []
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
            "customer_phone": mask_phone_number(o.customer_phone),
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

    return {
        "today": today_date.isoformat(),
        "total_orders_today": len([o for o in orders if o.order_status not in [OrderStatus.CANCELLED, OrderStatus.VERIFICATION_EXPIRED]]),
        "latest_token": orders[0].daily_token_number if orders else 0,
        "pending_otp": pending_otp,
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
    cleanup_expired_otp_challenges(db)
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
        total_orders=len([o for o in orders if o.order_status not in [OrderStatus.CANCELLED, OrderStatus.VERIFICATION_EXPIRED]]),
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
