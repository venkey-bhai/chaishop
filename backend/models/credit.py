import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, Boolean, Numeric, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base


class CreditTransactionType(str, enum.Enum):
    CREDIT = "CREDIT"          # New purchase on credit (increases debt balance)
    PAYMENT = "PAYMENT"        # Customer paid cash/UPI to settle credit (decreases debt balance)
    ADJUSTMENT = "ADJUSTMENT"  # Admin manual adjustment (waiver, correction)

class CreditAccount(Base):
    __tablename__ = "credit_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)

    credit_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    
    # Rule 61: Admin activation required to convert customer into a credit customer
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="credit_account")

    @property
    def available_credit(self) -> Decimal:
        """Calculates available credit remaining: limit - current_balance"""
        return max(Decimal("0.00"), self.credit_limit - self.current_balance)

    def __repr__(self) -> str:
        return f"<CreditAccount customer_id={self.customer_id} balance={self.current_balance}/{self.credit_limit} active={self.is_active}>"


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)

    transaction_type: Mapped[CreditTransactionType] = mapped_column(Enum(CreditTransactionType, name="credit_tx_type_enum"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Audit trail: Admin or Staff who recorded/approved this credit transaction
    recorded_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="credit_transactions")
    order: Mapped["Order"] = relationship("Order", back_populates="credit_transaction")

    def __repr__(self) -> str:
        return f"<CreditTransaction id={self.id} type={self.transaction_type} amt={self.amount} balance={self.balance_after}>"
