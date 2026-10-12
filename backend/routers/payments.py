import base64
import io
import logging
import urllib.parse
from datetime import datetime, timezone, time
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from config import settings
    from models.user import User
    from models.customer import Customer
    from models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from models.payment import Payment, PaymentRecordStatus
    from models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from schemas.payment import (
        PaymentSettleRequest,
        PaymentSettleResponse,
        CreditRepaymentRequest,
        CreditRepaymentResponse,
        UpiQrResponse,
        BillReceiptItem,
        BillReceiptResponse,
        CounterShiftSummary,
        PaymentListItemResponse,
        PaymentPaginationResponse,
    )
    from dependencies.auth import require_admin, require_staff_or_admin, get_current_user
except ImportError:
    from backend.database.connection import get_db
    from backend.config import settings
    from backend.models.user import User
    from backend.models.customer import Customer
    from backend.models.order import Order, OrderItem, PaymentMethod, PaymentStatus, OrderStatus
    from backend.models.payment import Payment, PaymentRecordStatus
    from backend.models.credit import CreditAccount, CreditTransaction, CreditTransactionType
    from backend.schemas.payment import (
        PaymentSettleRequest,
        PaymentSettleResponse,
        CreditRepaymentRequest,
        CreditRepaymentResponse,
        UpiQrResponse,
        BillReceiptItem,
        BillReceiptResponse,
        CounterShiftSummary,
        PaymentListItemResponse,
        PaymentPaginationResponse,
    )
    from backend.dependencies.auth import require_admin, require_staff_or_admin, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments", tags=["Payments & Billing Engine"])


# =============================================================
# Counter Order Payment Settlement (Cash / UPI / Card / Credit)
# =============================================================

@router.post(
    "/settle",
    response_model=PaymentSettleResponse,
    summary="Settle Order Bill at Counter (Staff / Admin)",
    description="Records payment completion for an order with cash tender calculations, UPI UTR verification, or credit ledger binding."
)
def settle_order_payment(
    payload: PaymentSettleRequest,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == payload.order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {payload.order_id} was not found."
        )

    if order.payment_status == PaymentStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order #{order.daily_token_number} ({order.order_number}) is already marked PAID."
        )

    # 1. Cash Tender Calculation
    total_amount = order.total_amount
    amount_received = total_amount
    change_returned = Decimal("0.00")

    if payload.payment_method == PaymentMethod.CASH:
        if payload.amount_received is not None:
            if payload.amount_received < total_amount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tendered cash (₹{payload.amount_received:.2f}) is less than bill amount (₹{total_amount:.2f})."
                )
            amount_received = payload.amount_received
            change_returned = amount_received - total_amount
    elif payload.payment_method == PaymentMethod.CREDIT:
        # Enforce Rule 61 if paying via credit
        if not order.customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Credit settlement requires a registered customer account."
            )
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if not customer or not customer.is_credit_eligible:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Customer '{order.customer_name}' is not eligible for credit purchases (Rule 61)."
            )
        credit_account = customer.credit_account
        if not credit_account or not credit_account.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer credit account is inactive."
            )
        if credit_account.current_balance + total_amount > credit_account.credit_limit:
            available = max(Decimal("0.00"), credit_account.credit_limit - credit_account.current_balance)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Credit limit exceeded. Available credit: ₹{available:.2f}, bill: ₹{total_amount:.2f}."
            )

        credit_account.current_balance += total_amount
        # Create audit transaction
        db.add(CreditTransaction(
            customer_id=customer.id,
            order_id=order.id,
            transaction_type=CreditTransactionType.CREDIT,
            amount=total_amount,
            balance_after=credit_account.current_balance,
            description=f"Counter settled Order #{order.daily_token_number} on Credit",
            recorded_by_user_id=current_user.id
        ))

    # 2. Update or Create Payment Entity
    now_utc = datetime.now(timezone.utc)
    payment = db.query(Payment).filter(Payment.order_id == order.id).first()
    if not payment:
        payment = Payment(
            order_id=order.id,
            customer_id=order.customer_id,
            amount=total_amount,
            payment_method=payload.payment_method,
            payment_status=PaymentRecordStatus.COMPLETED,
            transaction_reference=payload.transaction_reference,
            paid_at=now_utc
        )
        db.add(payment)
    else:
        payment.payment_method = payload.payment_method
        payment.payment_status = PaymentRecordStatus.COMPLETED
        payment.transaction_reference = payload.transaction_reference
        payment.paid_at = now_utc

    # 3. Update Order
    order.payment_method = payload.payment_method
    order.payment_status = PaymentStatus.PAID
    if order.order_status == OrderStatus.PENDING:
        order.order_status = OrderStatus.CONFIRMED

    db.commit()
    db.refresh(payment)
    db.refresh(order)

    logger.info(
        f"Settled Order #{order.daily_token_number} via {payload.payment_method} "
        f"total=₹{total_amount:.2f} by cashier '{current_user.name}'"
    )

    return PaymentSettleResponse(
        payment_id=payment.id,
        order_id=order.id,
        order_number=order.order_number,
        daily_token_number=order.daily_token_number,
        total_amount=total_amount,
        amount_received=amount_received,
        change_returned=change_returned,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        transaction_reference=payment.transaction_reference,
        paid_at=payment.paid_at
    )


# =============================================================
# Customer Credit Debt Repayment (Section 17 in requirements)
# =============================================================

@router.post(
    "/credit-repayment",
    response_model=CreditRepaymentResponse,
    summary="Record Customer Credit Repayment (Staff / Admin)",
    description="Records a customer visiting the counter to pay down their credit debt tab (Cash/UPI), decreasing outstanding balance and creating a PAYMENT ledger record."
)
def record_credit_repayment(
    payload: CreditRepaymentRequest,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {payload.customer_id} not found."
        )

    credit_account = customer.credit_account
    if not credit_account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Customer '{customer.name}' does not have an active credit account."
        )

    previous_balance = credit_account.current_balance
    if previous_balance <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Customer '{customer.name}' has zero outstanding credit debt."
        )

    # Decrease debt balance (capped at zero)
    new_balance = max(Decimal("0.00"), previous_balance - payload.amount)
    credit_account.current_balance = new_balance

    # Create immutable CreditTransaction (Type = PAYMENT)
    desc_text = payload.description or f"Counter Debt Repayment via {payload.payment_method}"
    if payload.transaction_reference:
        desc_text += f" (Ref: {payload.transaction_reference})"

    tx = CreditTransaction(
        customer_id=customer.id,
        order_id=None,
        transaction_type=CreditTransactionType.PAYMENT,
        amount=payload.amount,
        balance_after=new_balance,
        description=desc_text,
        recorded_by_user_id=current_user.id
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.refresh(credit_account)

    logger.info(
        f"Recorded credit repayment of ₹{payload.amount:.2f} for customer '{customer.name}' "
        f"new_balance=₹{new_balance:.2f} by cashier '{current_user.name}'"
    )

    return CreditRepaymentResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        amount_paid=payload.amount,
        previous_balance=previous_balance,
        new_balance=new_balance,
        credit_limit=credit_account.credit_limit,
        available_credit=credit_account.available_credit,
        payment_method=payload.payment_method,
        transaction_reference=payload.transaction_reference,
        transaction_id=tx.id,
        created_at=tx.created_at
    )


# =============================================================
# Dynamic NPCI UPI QR Generator
# =============================================================

@router.get(
    "/upi-qr/{order_id}",
    response_model=UpiQrResponse,
    summary="Generate Dynamic UPI QR Payload for Order",
    description="Builds an exact-amount NPCI standard UPI deep-link URI (upi://pay?pa=...&am=...&tr=...) for instant scanning."
)
def get_order_upi_qr(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found."
        )

    upi_id = getattr(settings, "UPI_ID", "chaiflow@upi")
    payee_name = getattr(settings, "SHOP_NAME", "ChaiFlow Tea Shop")
    amount_str = f"{order.total_amount:.2f}"
    encoded_name = urllib.parse.quote(payee_name)
    encoded_note = urllib.parse.quote(f"Token #{order.daily_token_number} {order.order_number}")

    # Standard NPCI UPI URI Specification
    upi_uri = (
        f"upi://pay?pa={upi_id}"
        f"&pn={encoded_name}"
        f"&am={amount_str}"
        f"&tr={order.order_number}"
        f"&tn={encoded_note}"
        f"&cu=INR"
    )

    qr_image_data = None
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(upi_uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        qr_image_data = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
    except Exception as qr_err:
        logger.warning(f"Could not generate server-side QR image for order {order_id}: {qr_err}")

    return UpiQrResponse(
        order_id=order.id,
        order_number=order.order_number,
        daily_token_number=order.daily_token_number,
        amount=order.total_amount,
        upi_id=upi_id,
        payee_name=payee_name,
        upi_uri=upi_uri,
        qr_image_data=qr_image_data,
        notes=f"Pay ₹{amount_str} to {payee_name} via any UPI App (GPay, PhonePe, Paytm)"
    )


# =============================================================
# Thermal Counter Bill Receipt Formatter (58mm / 80mm)
# =============================================================

@router.get(
    "/receipt/{order_id}",
    response_model=BillReceiptResponse,
    summary="Get Formatted Thermal Bill Receipt Data",
    description="Returns pre-formatted layout for instant 58mm/80mm thermal receipt printing at POS counter."
)
def get_bill_receipt(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found."
        )

    receipt_items = []
    for item in (order.items or []):
        opt_text = None
        if item.selected_options:
            parts = []
            if item.selected_options.get("sugar"):
                parts.append(f"Sugar: {item.selected_options['sugar']}")
            if item.selected_options.get("strength"):
                parts.append(f"Strength: {item.selected_options['strength']}")
            opt_text = " | ".join(parts) if parts else None

        receipt_items.append(BillReceiptItem(
            name=item.item_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_price=item.total_price,
            customizations=opt_text
        ))

    # Payment reference
    ref = None
    if order.payment:
        ref = order.payment.transaction_reference

    return BillReceiptResponse(
        shop_name=getattr(settings, "SHOP_NAME", "ChaiFlow Tea Shop"),
        tagline="Authentic Spiced Chai & Irani Cafe Favorites",
        address=getattr(settings, "SHOP_ADDRESS", "12 Market Square, Station Road"),
        phone=getattr(settings, "SHOP_PHONE", "+91 98840 12345"),
        fssai_license=getattr(settings, "FSSAI_LICENSE", "21524012000892"),
        order_id=order.id,
        order_number=order.order_number,
        daily_token_number=order.daily_token_number,
        date_time=order.created_at.strftime("%d-%b-%Y %I:%M %p"),
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        table_or_counter=order.notes or "Dine-in",
        items=receipt_items,
        subtotal=order.total_amount,
        tax_amount=Decimal("0.00"),
        total_amount=order.total_amount,
        payment_method=str(order.payment_method),
        payment_status=str(order.payment_status),
        transaction_reference=ref,
        cashier_name="Counter Cashier",
        footer_message="Thank you for visiting ChaiFlow! Please come again."
    )


# =============================================================
# Counter Shift & Daily Collection Summary (Section 21)
# =============================================================

@router.get(
    "/counter-summary",
    response_model=CounterShiftSummary,
    summary="Daily Counter Collection Summary (Section 21 Rule)",
    description="Accurately distinguishes actual cash/UPI received today from credit sales debt."
)
def get_counter_shift_summary(
    db: Session = Depends(get_db)
):
    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.date()
    start_of_day = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)

    # 1. Payments completed today
    payments_today = db.query(Payment).filter(
        Payment.created_at >= start_of_day,
        Payment.created_at <= end_of_day,
        Payment.payment_status == PaymentRecordStatus.COMPLETED
    ).all()

    cash_collected = sum(
        (p.amount for p in payments_today if p.payment_method == PaymentMethod.CASH),
        Decimal("0.00")
    )
    upi_collected = sum(
        (p.amount for p in payments_today if p.payment_method == PaymentMethod.UPI),
        Decimal("0.00")
    )
    card_collected = sum(
        (p.amount for p in payments_today if p.payment_method == PaymentMethod.CARD),
        Decimal("0.00")
    )

    # 2. Credit repayments collected at counter today (Section 17)
    repayments_today = db.query(CreditTransaction).filter(
        CreditTransaction.created_at >= start_of_day,
        CreditTransaction.created_at <= end_of_day,
        CreditTransaction.transaction_type == CreditTransactionType.PAYMENT
    ).all()

    credit_repayments_collected = sum(
        (r.amount for r in repayments_today),
        Decimal("0.00")
    )

    total_money_received = cash_collected + upi_collected + card_collected + credit_repayments_collected

    # 3. All orders placed today
    orders_today = db.query(Order).filter(
        Order.created_at >= start_of_day,
        Order.created_at <= end_of_day
    ).all()

    total_sales_value = sum((o.total_amount for o in orders_today), Decimal("0.00"))
    credit_sales_unpaid = sum(
        (o.total_amount for o in orders_today if o.payment_method == PaymentMethod.CREDIT),
        Decimal("0.00")
    )

    completed_orders_count = sum(1 for o in orders_today if o.order_status == OrderStatus.COMPLETED)
    pending_orders_count = sum(1 for o in orders_today if o.order_status != OrderStatus.COMPLETED)

    return CounterShiftSummary(
        date=today_date.isoformat(),
        cash_collected=cash_collected,
        upi_collected=upi_collected,
        card_collected=card_collected,
        credit_repayments_collected=credit_repayments_collected,
        total_money_received=total_money_received,
        credit_sales_unpaid=credit_sales_unpaid,
        total_sales_value=total_sales_value,
        completed_orders_count=completed_orders_count,
        pending_orders_count=pending_orders_count
    )


# =============================================================
# Payment Ledger List
# =============================================================

@router.get(
    "",
    response_model=PaymentPaginationResponse,
    summary="List Payments with Filters (Staff / Admin)",
    description="Returns paginated payment transactions for financial and cashier reconciliation."
)
def list_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    payment_method: Optional[PaymentMethod] = Query(None),
    payment_status: Optional[PaymentRecordStatus] = Query(None),
    today_only: bool = Query(False),
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Payment).options(joinedload(Payment.order))

    if today_only:
        today_date = datetime.now(timezone.utc).date()
        start = datetime.combine(today_date, time.min).replace(tzinfo=timezone.utc)
        end = datetime.combine(today_date, time.max).replace(tzinfo=timezone.utc)
        query = query.filter(Payment.created_at >= start, Payment.created_at <= end)

    if payment_method:
        query = query.filter(Payment.payment_method == payment_method)

    if payment_status:
        query = query.filter(Payment.payment_status == payment_status)

    total = query.count()
    offset = (page - 1) * limit
    payments = query.order_by(desc(Payment.created_at)).offset(offset).limit(limit).all()

    items = []
    for p in payments:
        ord_num = p.order.order_number if p.order else f"ORD-{p.order_id}"
        tok_num = p.order.daily_token_number if p.order else 0
        c_name = p.order.customer_name if p.order else "Customer"
        c_phone = p.order.customer_phone if p.order else ""

        items.append(PaymentListItemResponse(
            id=p.id,
            order_id=p.order_id,
            order_number=ord_num,
            daily_token_number=tok_num,
            customer_name=c_name,
            customer_phone=c_phone,
            amount=p.amount,
            payment_method=p.payment_method,
            payment_status=p.payment_status,
            transaction_reference=p.transaction_reference,
            paid_at=p.paid_at,
            created_at=p.created_at
        ))

    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return PaymentPaginationResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )
