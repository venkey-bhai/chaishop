from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

try:
    from models.expense import ExpensePaymentMethod
except ImportError:
    from backend.models.expense import ExpensePaymentMethod


# -------------------------------------------------------------
# Expense Request Schemas
# -------------------------------------------------------------

class ExpenseCreate(BaseModel):
    """
    Schema for recording a new tea shop operating expense (Section 20).
    """
    category: str = Field(..., min_length=2, max_length=60, description="Expense category e.g. Milk, Gas, Tea Powder")
    description: str = Field(..., min_length=2, max_length=500, description="Detailed explanation or vendor name")
    amount: Decimal = Field(..., gt=Decimal("0.00"), description="Cost amount (must be positive)")
    expense_date: Optional[date] = Field(default=None, description="Date of expense (defaults to today)")
    payment_method: ExpensePaymentMethod = Field(
        default=ExpensePaymentMethod.CASH,
        description="Payment mode used (CASH, UPI, CARD, BANK_TRANSFER)"
    )

    @field_validator("category")
    @classmethod
    def clean_category(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Category name must be at least 2 characters")
        return trimmed.title()


class ExpenseUpdate(BaseModel):
    """
    Schema for updating an existing expense record.
    """
    category: Optional[str] = Field(default=None, min_length=2, max_length=60)
    description: Optional[str] = Field(default=None, min_length=2, max_length=500)
    amount: Optional[Decimal] = Field(default=None, gt=Decimal("0.00"))
    expense_date: Optional[date] = None
    payment_method: Optional[ExpensePaymentMethod] = None


# -------------------------------------------------------------
# Expense Response Schemas
# -------------------------------------------------------------

class ExpenseResponse(BaseModel):
    """
    Standard serialized representation of an expense record.
    """
    id: int
    category: str
    description: str
    amount: Decimal
    expense_date: date
    payment_method: ExpensePaymentMethod
    recorded_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExpensePaginationResponse(BaseModel):
    """
    Paginated expense ledger response.
    """
    items: List[ExpenseResponse]
    total: int
    page: int
    limit: int
    total_pages: int
    total_amount: Decimal


class ExpenseCategorySummary(BaseModel):
    """
    Category-level financial breakdown.
    """
    category: str
    total_amount: Decimal
    count: int
    percentage: float


class ExpenseAnalyticsResponse(BaseModel):
    """
    High-level operational cost statistics and category distributions.
    """
    total_expenses_today: Decimal
    total_expenses_month: Decimal
    total_records: int
    by_category: List[ExpenseCategorySummary]
    by_payment_method: Dict[str, Decimal]
    recent_expenses: List[ExpenseResponse]
