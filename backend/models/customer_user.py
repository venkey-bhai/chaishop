from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base

try:
    from models.user import UserRole
except ImportError:
    from backend.models.user import UserRole


class CustomerUser(Base):
    __tablename__ = "customer_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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

    # 1-to-1 relationship with Customer business profile
    customer_profile: Mapped[Optional["Customer"]] = relationship(
        "Customer",
        back_populates="customer_user",
        uselist=False
    )

    @property
    def name(self) -> str:
        return self.full_name

    @property
    def customer(self):
        return self.customer_profile

    @property
    def role(self) -> UserRole:
        return UserRole.CUSTOMER

    def __repr__(self) -> str:
        return f"<CustomerUser id={self.id} mobile={self.mobile_number} name={self.full_name}>"
