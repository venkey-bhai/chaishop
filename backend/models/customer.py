from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, Boolean, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Rule 61: Only Admin can grant credit eligibility and set credit limit
    is_credit_eligible: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)

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
    user: Mapped["User"] = relationship("User", back_populates="customer")
    customer_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customer_users.id", ondelete="SET NULL"), unique=True, nullable=True)
    customer_user: Mapped["CustomerUser"] = relationship("CustomerUser", back_populates="customer_profile", uselist=False)
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")
    credit_account: Mapped["CreditAccount"] = relationship("CreditAccount", back_populates="customer", uselist=False, cascade="all, delete-orphan")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship("CreditTransaction", back_populates="customer")

    def __repr__(self) -> str:
        return f"<Customer id={self.id} phone={self.phone} credit_eligible={self.is_credit_eligible}>"
