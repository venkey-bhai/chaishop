from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base

try:
    from models.user import UserRole
except ImportError:
    from backend.models.user import UserRole


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    shop_name: Mapped[str | None] = mapped_column(String(150), default="ChaiFlow Tea Shop", nullable=True)
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

    @property
    def name(self) -> str:
        return self.full_name

    @property
    def role(self) -> UserRole:
        return UserRole.ADMIN

    @property
    def customer(self):
        return None

    def __repr__(self) -> str:
        return f"<AdminUser id={self.id} mobile={self.mobile_number} name={self.full_name}>"
