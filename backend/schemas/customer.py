import re
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class CustomerCreate(BaseModel):
    """
    Schema for creating a customer record (e.g., admin manual entry or walk-in customer).
    """
    name: str = Field(..., min_length=2, max_length=100, description="Customer full name", example="Ravi Kumar")
    phone: str = Field(..., description="Unique contact number (10-15 digits)", example="9876543210")
    email: Optional[str] = Field(default=None, max_length=120, description="Optional customer email", example="ravi@example.com")
    is_credit_eligible: bool = Field(default=False, description="Admin approval for credit purchases (Rule 61)")
    credit_limit: Decimal = Field(default=Decimal("0.00"), ge=0, description="Initial credit ceiling limit in Rupees")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\+?[0-9]{10,15}$", cleaned):
            raise ValueError("Phone number must contain between 10 and 15 digits (optional leading +)")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Customer name must be at least 2 characters")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        trimmed = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", trimmed):
            raise ValueError("Invalid email format")
        return trimmed


class CustomerUpdate(BaseModel):
    """
    Schema for updating basic customer profile info.
    """
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[str] = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Customer name must be at least 2 characters")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        trimmed = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", trimmed):
            raise ValueError("Invalid email format")
        return trimmed


class CustomerCreditStatusUpdate(BaseModel):
    """
    Rule 61: Admin-Only credit eligibility toggling and credit ceiling configuration.
    """
    is_credit_eligible: bool = Field(..., description="Whether customer is approved for tea khata/credit")
    credit_limit: Decimal = Field(default=Decimal("0.00"), ge=0, description="Maximum unpaid credit balance ceiling")


class CustomerCreditLimitUpdate(BaseModel):
    """
    Payload for configuring and modifying a customer's credit limit.
    """
    credit_limit: Decimal = Field(..., ge=0, description="New approved credit limit ceiling (0 to reset)")
    reason: Optional[str] = Field(default=None, max_length=255, description="Audit reason for limit change")


class CreditLimitAuditResponse(BaseModel):
    id: int
    customer_id: int
    admin_name: str
    old_limit: Decimal
    new_limit: Decimal
    reason: Optional[str] = None
    created_at: datetime
    formatted_time: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)



class CustomerResponse(BaseModel):
    """
    Detailed public customer profile DTO with real-time financial metrics.
    """
    id: int
    user_id: Optional[int] = None
    name: str
    phone: str
    email: Optional[str] = None
    is_credit_eligible: bool
    credit_limit: Decimal
    current_balance: Decimal = Decimal("0.00")
    available_credit: Decimal = Decimal("0.00")
    total_orders_count: int = 0
    total_spent: Decimal = Decimal("0.00")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomerPaginationResponse(BaseModel):
    """
    Paginated customer search and listing result envelope.
    """
    items: List[CustomerResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class CustomerHistoryItem(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    customizations: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerTransactionRecord(BaseModel):
    id: str
    type: str  # "ORDER" | "REPAYMENT" | "ADJUSTMENT"
    date: str
    time: str
    created_at: datetime
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    daily_token_number: Optional[int] = None
    items: List[CustomerHistoryItem] = []
    product_summary: Optional[str] = None
    total_bill_amount: Decimal = Decimal("0.00")
    amount_paid: Decimal = Decimal("0.00")
    credit_added: Decimal = Decimal("0.00")
    credit_repaid: Decimal = Decimal("0.00")
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    order_status: Optional[str] = None
    order_type: Optional[str] = "DINE_IN"
    table_number: Optional[str] = None
    seat_number: Optional[str] = None
    previous_outstanding_credit: Decimal = Decimal("0.00")
    closing_outstanding_credit: Decimal = Decimal("0.00")
    description: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerDailyGroup(BaseModel):
    date: str
    purchases: Decimal = Decimal("0.00")
    immediate_paid: Decimal = Decimal("0.00")
    credit_added: Decimal = Decimal("0.00")
    credit_repaid: Decimal = Decimal("0.00")
    closing_balance: Decimal = Decimal("0.00")
    orders_count: int = 0


class CustomerFinancialSummary(BaseModel):
    opening_credit_balance: Decimal = Decimal("0.00")
    closing_credit_balance: Decimal = Decimal("0.00")
    total_purchased: Decimal = Decimal("0.00")
    total_paid_immediate: Decimal = Decimal("0.00")
    total_paid_total: Decimal = Decimal("0.00")
    total_credit_added: Decimal = Decimal("0.00")
    total_credit_repaid: Decimal = Decimal("0.00")
    total_orders_count: int = 0
    total_transactions_count: int = 0


class CustomerHistoryProfile(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: str
    phone: str
    email: Optional[str] = None
    is_credit_eligible: bool
    credit_limit: Decimal
    current_balance: Decimal = Decimal("0.00")
    available_credit: Decimal = Decimal("0.00")
    total_orders_count: int = 0
    total_spent: Decimal = Decimal("0.00")
    created_at: datetime


class CustomerHistoryPagination(BaseModel):
    total_records: int
    page: int
    limit: int
    total_pages: int


class CustomerHistoryResponse(BaseModel):
    customer: CustomerHistoryProfile
    summary: CustomerFinancialSummary
    transactions: List[CustomerTransactionRecord]
    daily_groups: List[CustomerDailyGroup] = []
    pagination: CustomerHistoryPagination
