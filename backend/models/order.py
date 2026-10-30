import enum
from datetime import datetime
from decimal import Decimal
from typing import Any
from sqlalchemy import Integer, String, Numeric, DateTime, ForeignKey, Enum, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
try:
    from database.base import Base
except ImportError:
    from backend.database.base import Base


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"
    CREDIT = "CREDIT"

class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"

class OrderStatus(str, enum.Enum):
    PENDING_OTP_VERIFICATION = "PENDING_OTP_VERIFICATION"
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    PREPARING = "PREPARING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    VERIFICATION_EXPIRED = "VERIFICATION_EXPIRED"

class OTPChallengeStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    EXPIRED = "EXPIRED"
    MAX_ATTEMPTS_EXCEEDED = "MAX_ATTEMPTS_EXCEEDED"
    CANCELLED = "CANCELLED"

class OrderType(str, enum.Enum):
    DINE_IN = "DINE_IN"
    TAKEAWAY = "TAKEAWAY"

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    daily_token_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(15), nullable=False)

    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod, name="payment_method_enum"), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status_enum"), default=PaymentStatus.PENDING, nullable=False)
    order_status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status_enum"), default=OrderStatus.PENDING_OTP_VERIFICATION, nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), default="DINE_IN", nullable=False)
    table_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    seat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment: Mapped["Payment"] = relationship("Payment", back_populates="order", uselist=False, cascade="all, delete-orphan")
    credit_transaction: Mapped["CreditTransaction"] = relationship("CreditTransaction", back_populates="order", uselist=False)
    otp_challenges: Mapped[list["OrderOTPChallenge"]] = relationship(
        "OrderOTPChallenge",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderOTPChallenge.created_at.desc()"
    )
    shared_dishes_sent: Mapped[list["SharedDishTransaction"]] = relationship(
        "SharedDishTransaction",
        back_populates="original_order",
        cascade="all, delete-orphan",
        order_by="SharedDishTransaction.created_at.desc()"
    )

    @property
    def active_otp_challenge(self):
        if not self.otp_challenges:
            return None
        return self.otp_challenges[0]

    def __repr__(self) -> str:
        return f"<Order #{self.daily_token_number} id={self.order_number} total={self.total_amount} status={self.order_status}>"


class OrderOTPChallenge(Base):
    __tablename__ = "order_otp_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    
    mobile_number: Mapped[str] = mapped_column(String(15), nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    otp_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    resend_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    reserved_stock: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="otp_challenges")
    customer: Mapped["Customer"] = relationship("Customer")

    def __repr__(self) -> str:
        return f"<OrderOTPChallenge id={self.id} order_id={self.order_id} status={self.status} attempts={self.attempts}/{self.max_attempts}>"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    menu_item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), index=True, nullable=True)
    
    # Snapshot of item name and price at the exact moment of order creation
    item_name: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Customer choices: e.g. {"sugar": "High Sugar", "strength": "Kadak"}
    selected_options: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Individual dish lifecycle and admin cancellation controls
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True, nullable=False)
    cancelled_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="items")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="order_items")
    shared_transactions: Mapped[list["SharedDishTransaction"]] = relationship(
        "SharedDishTransaction",
        back_populates="original_order_item",
        cascade="all, delete-orphan",
        order_by="SharedDishTransaction.created_at.desc()"
    )

    @property
    def shared_quantity(self) -> int:
        return sum(
            st.quantity for st in (self.shared_transactions or [])
            if getattr(st, "status", None) in ["CONFIRMED", "PENDING"]
        )

    @property
    def remaining_unshared_quantity(self) -> int:
        return max(0, self.quantity - self.shared_quantity)

    def __repr__(self) -> str:
        return f"<OrderItem item={self.item_name} qty={self.quantity} price={self.unit_price}>"


class SharedDishStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    REVERSED = "REVERSED"


class SharedDishTransaction(Base):
    __tablename__ = "shared_dish_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    original_order_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), index=True, nullable=False)

    destination_table_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    destination_seat_no: Mapped[str | None] = mapped_column(String(20), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="CONFIRMED", nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    original_order: Mapped["Order"] = relationship("Order", back_populates="shared_dishes_sent")
    original_order_item: Mapped["OrderItem"] = relationship("OrderItem", back_populates="shared_transactions")

    def __repr__(self) -> str:
        return f"<SharedDishTransaction id={self.id} order={self.original_order_id} item={self.original_order_item_id} dest={self.destination_table_id} qty={self.quantity}>"

