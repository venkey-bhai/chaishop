from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict

try:
    from models.order import PaymentMethod, PaymentStatus, OrderStatus
except ImportError:
    from backend.models.order import PaymentMethod, PaymentStatus, OrderStatus


# -------------------------------------------------------------
# Shared Dish Schemas
# -------------------------------------------------------------

class SharedDishCreate(BaseModel):
    """
    Payload for sharing an order item with another table/seat.
    Billing stays with the original table; no duplicate charges or tickets.
    """
    destination_table: str = Field(..., min_length=1, max_length=20, description="Destination table number")
    destination_seat: Optional[str] = Field(default=None, max_length=20, description="Destination seat number")
    quantity: int = Field(..., gt=0, description="Number of units to share")
    staff_member: Optional[str] = Field(default=None, max_length=100, description="Staff member who recorded the share")


class SharedDishResponse(BaseModel):
    """
    Representation of a shared dish record with complete origin and destination details.
    """
    id: int
    original_order_id: int
    original_order_item_id: int
    original_table_number: Optional[str] = None
    original_seat_number: Optional[str] = None
    destination_table_id: str
    destination_table_number: Optional[str] = None
    destination_seat_no: Optional[str] = None
    destination_seat_number: Optional[str] = None
    quantity: int
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    formatted_time: Optional[str] = None
    dish_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def sync_dest_fields(self):
        if not self.destination_table_number and self.destination_table_id:
            self.destination_table_number = self.destination_table_id
        if not self.destination_table_id and self.destination_table_number:
            self.destination_table_id = self.destination_table_number
        if not self.destination_seat_number and self.destination_seat_no:
            self.destination_seat_number = self.destination_seat_no
        if not self.destination_seat_no and self.destination_seat_number:
            self.destination_seat_no = self.destination_seat_number
        if not self.formatted_time and self.created_at:
            try:
                self.formatted_time = self.created_at.strftime("%I:%M %p")
            except Exception:
                pass
        return self



class TableSeatChangeRequest(BaseModel):
    """
    Payload for changing customer's table or seat prior to delivery.
    """
    table_number: str = Field(..., min_length=1, max_length=20, description="New destination table number")
    seat_number: Optional[str] = Field(default=None, max_length=20, description="New destination seat number")
    reason: Optional[str] = Field(default=None, max_length=255, description="Optional audit reason")


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
    menu_item_id: Optional[int] = None
    item_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    selected_options: Optional[Dict[str, Any]] = None
    status: str = "PENDING"
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    shared_quantity: int = 0
    remaining_unshared_quantity: int = 0
    shares: List[SharedDishResponse] = []

    model_config = ConfigDict(from_attributes=True)


class DishStatusUpdate(BaseModel):
    """
    Payload for Admin updating dish status (e.g. READY or PENDING).
    """
    status: str = Field(..., description="READY, PENDING, PREPARING, DELIVERED, or CANCELLED")


class DishCancelRequest(BaseModel):
    """
    Payload for Admin cancelling an individual dish.
    """
    reason: Optional[str] = Field(default=None, max_length=255, description="Cancellation reason")


class CustomerDishEdit(BaseModel):
    """
    Specification for customer modifying an existing item or adding a new dish.
    """
    item_id: Optional[int] = Field(default=None, description="Existing OrderItem ID if editing/cancelling existing item")
    menu_item_id: Optional[int] = Field(default=None, description="Menu item ID if adding a new dish")
    quantity: int = Field(..., ge=0, le=50, description="New quantity (0 = remove/cancel)")
    selected_options: Optional[Dict[str, Any]] = None


class CustomerOrderEditRequest(BaseModel):
    """
    Payload for customer editing active eligible orders on My Menu page.
    """
    customer_phone: str = Field(..., description="Mandatory phone number to verify ownership")
    edits: List[CustomerDishEdit] = Field(..., min_length=1, description="List of item changes/additions")



# -------------------------------------------------------------
# Order Create & Request Schemas
# -------------------------------------------------------------

class OrderCreate(BaseModel):
    """
    Payload for placing a new order via Customer QR menu or Counter POS.
    Both Customer Name and Customer Phone Number are mandatory.
    Dine-in requires table_number and seat_number. Takeaway does not.
    """
    customer_name: str = Field(..., min_length=2, max_length=100, description="Mandatory customer name for token callout", example="Ramesh Kumar")
    customer_phone: str = Field(..., description="Mandatory customer 10-digit mobile number", example="9876543210")
    customer_id: Optional[int] = Field(default=None, description="Optional Customer database ID / number")
    order_type: str = Field(default="DINE_IN", description="DINE_IN or TAKEAWAY")
    table_number: Optional[str] = Field(default=None, max_length=20, description="Dine-in table number (mandatory for DINE_IN)")
    seat_number: Optional[str] = Field(default=None, max_length=20, description="Dine-in seat number (mandatory for DINE_IN)")
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

    @model_validator(mode="after")
    def validate_dine_in_table_and_seat(self):
        otype = (self.order_type or "DINE_IN").upper().strip()
        self.order_type = otype
        # Mandatory Table & Seat validation commented out as requested
        # if otype == "DINE_IN":
        #     tbl = (self.table_number or "").strip()
        #     seat = (self.seat_number or "").strip()
        #     if not tbl:
        #         raise ValueError("Table number is mandatory for dine-in orders.")
        #     if not seat:
        #         raise ValueError("Seat number is mandatory for dine-in orders.")
        #     self.table_number = tbl
        #     self.seat_number = seat
        # elif otype == "TAKEAWAY":
        #     self.table_number = None
        #     self.seat_number = None
        if self.table_number:
            self.table_number = self.table_number.strip()
        if self.seat_number:
            self.seat_number = self.seat_number.strip()
        return self


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
    order_type: str = "DINE_IN"
    table_number: Optional[str] = None
    seat_number: Optional[str] = None
    total_amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    order_status: OrderStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemResponse] = []
    otp_challenge: Optional[OTPChallengeInfo] = None
    can_change_table_or_seat: bool = True
    shared_dishes: List[SharedDishResponse] = []

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
