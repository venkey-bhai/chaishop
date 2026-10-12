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
