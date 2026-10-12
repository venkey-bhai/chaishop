import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

try:
    from config import settings
except ImportError:
    from backend.config import settings


def hash_password(password: str) -> str:
    """
    Hash a plain text password securely using bcrypt with an automatically generated salt.
    Returns the decoded UTF-8 hash string for storage in PostgreSQL.
    """
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify that a provided plain text password matches the stored bcrypt hash string.
    Uses constant-time comparison in bcrypt to prevent timing attacks.
    """
    pwd_bytes = plain_password.encode("utf-8")
    hash_bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create and sign a JWT access token containing the provided payload claims.
    Sets standard 'exp' (expiration) claim in UTC timestamp format.
    """
    to_encode = data.copy()
    if expires_delta is not None:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate the signature and expiration time of a JWT access token.
    Raises jwt.ExpiredSignatureError if expired, or jwt.InvalidTokenError if tampered/invalid.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
