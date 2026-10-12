from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

try:
    from models.payment import PaymentMethod, PaymentRecordStatus
except ImportError:
    from backend.models.payment import PaymentMethod, PaymentRecordStatus


# -------------------------------------------------------------
# Counter Payment Settlement Schemas
# -------------------------------------------------------------

class PaymentSettleRequest(BaseModel):
    """
    Payload when cashier or customer settles the bill for an order at counter.
    Supports Cash tender calculation (e.g. given ₹100 for ₹70 bill -> returns ₹30 change).
    """
    order_id: int = Field(..., gt=0, description="Target Order ID")
    payment_method: PaymentMethod = Field(default=PaymentMethod.CASH, description="CASH, UPI, CARD, or CREDIT")
    amount_received: Optional[Decimal] = Field(default=None, description="Actual cash amount tendered by customer")
    transaction_reference: Optional[str] = Field(default=None, max_length=100, description="UPI UTR number or Card auth code")
    notes: Optional[str] = Field(default=None, max_length=250, description="Cashier settlement note")


class PaymentSettleResponse(BaseModel):
    """
    Response returned after completing an order payment.
    """
    payment_id: int
    order_id: int
    order_number: str
    daily_token_number: int
    total_amount: Decimal
    amount_received: Decimal
    change_returned: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentRecordStatus
    transaction_reference: Optional[str] = None
    paid_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Credit Repayment Schemas (Section 17 in requirements)
# -------------------------------------------------------------

class CreditRepaymentRequest(BaseModel):
    """
    Payload for customer paying cash/UPI at counter to clear debt tab.
    Decreases customer's current credit balance.
    """
    customer_id: int = Field(..., gt=0, description="Customer account ID")
    amount: Decimal = Field(..., gt=0, description="Repayment amount (must be > 0)")
    payment_method: PaymentMethod = Field(default=PaymentMethod.CASH, description="Payment channel (CASH, UPI, CARD)")
    transaction_reference: Optional[str] = Field(default=None, max_length=100, description="UPI UTR / reference code")
    description: Optional[str] = Field(default=None, max_length=250, description="Audit note e.g. 'Partial debt clearance'")


class CreditRepaymentResponse(BaseModel):
    """
    Receipt for customer debt repayment transaction.
    """
    customer_id: int
    customer_name: str
    customer_phone: str
    amount_paid: Decimal
    previous_balance: Decimal
    new_balance: Decimal
    credit_limit: Decimal
    available_credit: Decimal
    payment_method: PaymentMethod
    transaction_reference: Optional[str] = None
    transaction_id: int
    created_at: datetime


# -------------------------------------------------------------
# Dynamic UPI QR Schemas
# -------------------------------------------------------------

class UpiQrResponse(BaseModel):
    """
    Dynamic UPI Payment Link and QR payload with exact order total and reference.
    Standard NPCI UPI spec: upi://pay?pa=...&pn=...&am=...&tr=...
    """
    order_id: int
    order_number: str
    daily_token_number: int
    amount: Decimal
    upi_id: str
    payee_name: str
    upi_uri: str
    qr_image_data: Optional[str] = None
    notes: str


# -------------------------------------------------------------
# Thermal Print Bill Receipt Schemas
# -------------------------------------------------------------

class BillReceiptItem(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    customizations: Optional[str] = None


class BillReceiptResponse(BaseModel):
    """
    Structured printable receipt for counter thermal printers (58mm/80mm).
    """
    shop_name: str
    tagline: str
    address: str
    phone: str
    fssai_license: str
    order_id: int
    order_number: str
    daily_token_number: int
    date_time: str
    customer_name: str
    customer_phone: str
    table_or_counter: str
    items: List[BillReceiptItem]
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    payment_method: str
    payment_status: str
    transaction_reference: Optional[str] = None
    cashier_name: str
    footer_message: str


# -------------------------------------------------------------
# Counter Shift & Daily Collection Summary Schemas (Section 21)
# -------------------------------------------------------------

class CounterShiftSummary(BaseModel):
    """
    Financial breakdown of actual money received today across channels.
    Distinguishes cash/UPI in hand from credit sales debt.
    """
    date: str
    cash_collected: Decimal
    upi_collected: Decimal
    card_collected: Decimal
    credit_repayments_collected: Decimal
    total_money_received: Decimal
    credit_sales_unpaid: Decimal
    total_sales_value: Decimal
    completed_orders_count: int
    pending_orders_count: int


# -------------------------------------------------------------
# Payment Ledger List Schemas
# -------------------------------------------------------------

class PaymentListItemResponse(BaseModel):
    id: int
    order_id: int
    order_number: str
    daily_token_number: int
    customer_name: str
    customer_phone: str
    amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentRecordStatus
    transaction_reference: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentPaginationResponse(BaseModel):
    items: List[PaymentListItemResponse]
    total: int
    page: int
    limit: int
    total_pages: int
