import logging
from typing import Optional, List
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from models.user import User, UserRole
    from models.customer import Customer
    from utils.security import decode_access_token
except ImportError:
    from backend.database.connection import get_db
    from backend.models.user import User, UserRole
    from backend.models.customer import Customer
    from backend.utils.security import decode_access_token

logger = logging.getLogger(__name__)

# Security scheme for Swagger UI and header extraction
security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency that extracts, decodes, and validates the JWT Bearer token
    from the HTTP Authorization header. Returns the matching User record from PostgreSQL.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided. Include 'Authorization: Bearer <token>' header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please login again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        logger.warning(f"Invalid JWT token received: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token signature or payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims: subject missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(subject)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject claim format.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Eagerly load customer profile if one exists for performance
    user = db.query(User).options(joinedload(User.customer)).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Verifies that the authenticated user's account is active and has not been deactivated.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your user account has been deactivated. Please contact the shop owner.",
        )
    return current_user


def require_roles(*allowed_roles: UserRole):
    """
    Higher-order dependency generator for Role-Based Access Control (RBAC).
    Restricts endpoint access to users possessing at least one of the specified roles.
    """
    def role_verifier(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            role_names = ", ".join([r.value for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. This action requires one of the following roles: [{role_names}]. Your current role is '{current_user.role.value}'.",
            )
        return current_user

    return role_verifier


# Pre-defined convenience role guards
require_admin = require_roles(UserRole.ADMIN)
require_staff_or_admin = require_roles(UserRole.ADMIN, UserRole.STAFF)
require_customer = require_roles(UserRole.CUSTOMER)
