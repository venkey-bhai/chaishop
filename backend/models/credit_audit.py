from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base


class CreditLimitAudit(Base):
    __tablename__ = "credit_limit_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    
    admin_name: Mapped[str] = mapped_column(String(100), nullable=False)
    old_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    new_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    customer: Mapped["Customer"] = relationship("Customer", foreign_keys=[customer_id])

    def __repr__(self) -> str:
        return f"<CreditLimitAudit cust={self.customer_id} old={self.old_limit} new={self.new_limit} by={self.admin_name}>"
