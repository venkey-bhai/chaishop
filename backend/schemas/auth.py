import re
from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, ConfigDict

try:
    from models.user import UserRole
except ImportError:
    from backend.models.user import UserRole


class UserRegisterRequest(BaseModel):
    """
    Payload for customer registration via mobile scanning.
    """
    mobile_number: str = Field(..., description="Unique mobile number (10-15 digits)", example="9876543210")
    name: str = Field(..., min_length=2, max_length=100, description="Customer or user full name", example="Ravi Kumar")
    password: str = Field(..., min_length=6, max_length=64, description="User password", example="password123")
    email: Optional[str] = Field(default=None, max_length=120, description="Optional email address", example="ravi@example.com")

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\+?[0-9]{10,15}$", cleaned):
            raise ValueError("Mobile number must contain between 10 and 15 digits (optional leading +)")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Name must be at least 2 characters")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        trimmed = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", trimmed):
            raise ValueError("Invalid email address format")
        return trimmed


class UserLoginRequest(BaseModel):
    """
    Credentials for user authentication.
    """
    mobile_number: str = Field(..., description="Registered mobile number", example="9876543210")
    password: str = Field(..., min_length=1, description="Password", example="password123")

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\+?[0-9]{10,15}$", cleaned):
            raise ValueError("Invalid mobile number format")
        return cleaned


class UserResponse(BaseModel):
    """
    Public user profile data returned to client upon authentication.
    Excludes hashed password and internal security flags.
    """
    id: int
    mobile_number: str
    name: str
    email: Optional[str] = None
    role: str
    is_active: bool
    customer_id: Optional[int] = None
    is_credit_eligible: Optional[bool] = None
    credit_limit: Optional[Decimal] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """
    Standard JWT bearer token authentication response.
    """
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserResponse


class LogoutResponse(BaseModel):
    """
    Stateless logout confirmation response.
    """
    success: bool = True
    message: str = "Successfully logged out"
