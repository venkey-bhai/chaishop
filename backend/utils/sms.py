import os
import secrets
import hashlib
import logging
import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any
from config import settings

logger = logging.getLogger(__name__)

# In-memory store for test verification if needed
TEST_SMS_OUTBOX: Dict[str, str] = {}


def generate_otp_code() -> str:
    """
    Generates a cryptographically secure 6-digit numeric OTP string.
    Range: 100000 - 999999.
    """
    return f"{secrets.randbelow(900000) + 100000}"


def hash_otp(otp_code: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Hashes the plain OTP code using SHA-256 with a unique cryptographic salt.
    Returns (otp_hash, salt). Plain text OTP is never stored in DB.
    """
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{otp_code}".encode("utf-8")).hexdigest()
    return hashed, salt


def verify_otp_hash(plain_otp: str, salt: str, expected_hash: str) -> bool:
    """
    Constant-time comparison of candidate plain OTP against salted hash.
    """
    candidate_hash, _ = hash_otp(plain_otp, salt)
    return secrets.compare_digest(candidate_hash, expected_hash)


def mask_phone_number(phone: str) -> str:
    """
    Masks all but the last 4 digits of a customer mobile number.
    e.g. '9876543210' -> '******3210'
    """
    clean = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(clean) <= 4:
        return "****"
    return f"{'*' * (len(clean) - 4)}{clean[-4:]}"


def send_otp_sms(mobile_number: str, otp_code: str, order_number: str) -> bool:
    """
    Dispatches OTP SMS using the configured SMS provider.
    Never exposes raw OTP in production logs.
    Handles provider errors and returns True on success, raises or returns False on error.
    """
    masked = mask_phone_number(mobile_number)
    provider = (settings.SMS_PROVIDER or "console").lower()

    # Always record in test outbox for automated test suites
    TEST_SMS_OUTBOX[mobile_number] = otp_code

    message_body = (
        f"Your ChaiFlow verification code is {otp_code} for Order {order_number}. "
        f"Valid for {settings.OTP_EXPIRE_MINUTES} minutes. Do not share this code with anyone."
    )

    if provider == "console":
        if settings.ENVIRONMENT == "development":
            logger.info(f"[SMS CONSOLE] OTP sent to {masked} for {order_number}. [DEV ONLY CODE: {otp_code}]")
        else:
            logger.info(f"[SMS CONSOLE] OTP sent to {masked} for {order_number}.")
        return True

    elif provider == "mock":
        logger.info(f"[SMS MOCK] Simulated SMS delivery to {masked}")
        return True

    elif provider == "twilio":
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_FROM_NUMBER:
            logger.error("Twilio provider selected but TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER not configured.")
            raise RuntimeError("SMS provider configuration error: Twilio credentials missing.")
        
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            clean_phone = "".join(c for c in mobile_number if c.isdigit())
            to_number = f"+91{clean_phone[-10:]}" if not mobile_number.startswith("+") else mobile_number

            data = urllib.parse.urlencode({
                "To": to_number,
                "From": settings.TWILIO_FROM_NUMBER,
                "Body": message_body
            }).encode("utf-8")

            req = urllib.request.Request(url, data=data, method="POST")
            # Basic Auth
            auth_str = f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}"
            import base64
            auth_b64 = base64.b64encode(auth_str.encode()).decode()
            req.add_header("Authorization", f"Basic {auth_b64}")

            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    logger.info(f"Twilio SMS dispatched successfully to {masked}")
                    return True
                else:
                    logger.error(f"Twilio SMS returned unexpected status code: {resp.status}")
                    return False
        except Exception as e:
            logger.error(f"Twilio SMS dispatch failed to {masked}: {e}")
            raise RuntimeError(f"SMS delivery failed via Twilio: {str(e)}")

    elif provider == "fast2sms":
        if not settings.FAST2SMS_API_KEY:
            logger.error("Fast2SMS provider selected but FAST2SMS_API_KEY not configured.")
            raise RuntimeError("SMS provider configuration error: Fast2SMS API key missing.")

        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            clean_phone = "".join(c for c in mobile_number if c.isdigit())[-10:]
            payload = json.dumps({
                "route": "otp",
                "variables_values": otp_code,
                "numbers": clean_phone
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("authorization", settings.FAST2SMS_API_KEY)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = json.loads(resp.read().decode())
                if resp_data.get("return") is True:
                    logger.info(f"Fast2SMS OTP dispatched successfully to {masked}")
                    return True
                else:
                    logger.error(f"Fast2SMS returned error: {resp_data.get('message')}")
                    return False
        except Exception as e:
            logger.error(f"Fast2SMS dispatch failed to {masked}: {e}")
            raise RuntimeError(f"SMS delivery failed via Fast2SMS: {str(e)}")

    else:
        logger.warning(f"Unknown SMS provider '{provider}', falling back to console mock.")
        return True
