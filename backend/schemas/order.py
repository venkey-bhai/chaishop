from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

try:
    from models.order import PaymentMethod, PaymentStatus, OrderStatus
except ImportError:
    from backend.models.order import PaymentMethod, PaymentStatus, OrderStatus


# -------------------------------------------------------------
# Order Item Schemas
# -------------------------------------------------------------

class OrderItemCreate(BaseModel):
    """
    Schema for line items inside an order placement payload.
    """
    menu_item_id: int = Field(..., gt=0, description="Target MenuItem database ID")
    quantity: int = Field(..., gt=0, le=50, description="Quantity ordered (1 - 50)")
    selected_options: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Customized options (e.g. {'sugar': 'Less Sugar', 'strength': 'Kadak'})"
    )


class OrderItemResponse(BaseModel):
    """
    Schema representing a recorded order line item with historical price snapshot.
    """
    id: int
    order_id: int
    menu_item_id: int
    item_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    selected_options: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Order Create & Request Schemas
# -------------------------------------------------------------

class OrderCreate(BaseModel):
    """
    Payload for placing a new order via Customer QR menu or Counter POS.
    Both Customer Name and Customer Phone Number are mandatory.
    """
    customer_name: str = Field(..., min_length=2, max_length=100, description="Mandatory customer name for token callout", example="Ramesh Kumar")
    customer_phone: str = Field(..., description="Mandatory customer 10-digit mobile number", example="9876543210")
    customer_id: Optional[int] = Field(default=None, description="Optional Customer database ID / number")
    table_number: Optional[str] = Field(default=None, max_length=20, description="Dine-in table number from QR scan")
    counter_number: Optional[str] = Field(default=None, max_length=20, description="Counter pickup number from QR scan")
    payment_method: PaymentMethod = Field(default=PaymentMethod.CASH, description="CASH, UPI, CARD, or CREDIT")
    notes: Optional[str] = Field(default=None, max_length=300, description="Special preparation instructions")
    idempotency_key: Optional[str] = Field(default=None, max_length=64, description="Optional client idempotency key to prevent duplicate orders")
    items: List[OrderItemCreate] = Field(..., min_length=1, description="List of items ordered")

    @field_validator("customer_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 2:
            raise ValueError("Customer name is mandatory and must be at least 2 characters")
        return cleaned

    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = "".join(ch for ch in (v or "") if ch.isdigit())
        if len(cleaned) < 10:
            raise ValueError("Customer phone number is mandatory and must contain at least 10 digits")
        if cleaned == "0000000000":
            raise ValueError("Valid customer phone number is mandatory (cannot be all zeros)")
        return cleaned[-10:]


class OrderStatusUpdate(BaseModel):
    """
    Schema for updating the preparation lifecycle status of an order.
    """
    order_status: OrderStatus = Field(..., description="Target status: CONFIRMED, PREPARING, READY, COMPLETED, CANCELLED")


class AdminOrderOverrideRequest(BaseModel):
    """
    Schema for authorized staff/admin manual confirmation override of an unverified order.
    """
    reason: str = Field(..., min_length=3, max_length=255, description="Mandatory reason for overriding OTP verification")


class OrderPaymentUpdate(BaseModel):
    """
    Schema for recording payment receipt for an order.
    """
    payment_status: PaymentStatus = Field(..., description="PAID, FAILED, or PENDING")
    transaction_reference: Optional[str] = Field(default=None, max_length=100, description="UPI/Card reference code")


# -------------------------------------------------------------
# OTP Verification Schemas
# -------------------------------------------------------------

class OTPVerificationRequest(BaseModel):
    """
    Payload for customer OTP verification.
    """
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit verification OTP code", example="123456")
    idempotency_key: Optional[str] = Field(default=None, max_length=64, description="Optional submission token to prevent duplicate confirmation")

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        cleaned = "".join(ch for ch in (v or "") if ch.isdigit())
        if len(cleaned) != 6:
            raise ValueError("OTP must be exactly 6 digits")
        return cleaned


class OTPChallengeInfo(BaseModel):
    """
    Public challenge metadata returned to customer for verification screen.
    Never exposes raw OTP or OTP hash!
    """
    challenge_id: int
    order_id: int
    order_number: str
    masked_phone: str
    status: str
    expires_at: datetime
    seconds_until_expiry: int
    seconds_until_resend: int
    attempts_remaining: int
    max_attempts: int
    dev_otp: Optional[str] = None  # Populated ONLY in development mode!


class OTPVerificationResponse(BaseModel):
    """
    Result of OTP verification challenge attempt.
    """
    success: bool
    message: str
    verification_status: str
    attempts_remaining: Optional[int] = None
    order: Optional["OrderResponse"] = None


# -------------------------------------------------------------
# Order Response Schemas
# -------------------------------------------------------------

class OrderResponse(BaseModel):
    """
    Complete order representation returned to customer and staff.
    """
    id: int
    order_number: str
    daily_token_number: int
    customer_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    total_amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    order_status: OrderStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemResponse] = []
    otp_challenge: Optional[OTPChallengeInfo] = None

    model_config = ConfigDict(from_attributes=True)


class OrderPaginationResponse(BaseModel):
    """
    Paginated list of orders for Admin & Kitchen Display System (KDS).
    """
    items: List[OrderResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class TokenDisplayItem(BaseModel):
    """
    Lightweight token item for the live pickup screen and Kitchen Display.
    """
    order_number: str
    token_number: int
    order_status: OrderStatus
    table_or_counter: str
    customer_name: str
    items_count: int
    created_at: datetime


class DailyTokenStats(BaseModel):
    """
    Summary stats for today's daily token sequence and active preparation counts.
    """
    today_date: str
    total_orders: int
    latest_token: int
    active_pending_count: int
    active_preparing_count: int
    active_ready_count: int
    completed_count: int
