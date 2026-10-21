import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field(default="postgresql://postgres:9884@localhost:5432/teashop_db")
    SECRET_KEY: str = Field(default="teashop_dev_secret_key_8f394c8e7b1a2026tea_billing")
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440)
    CORS_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000")
    ENVIRONMENT: str = Field(default="development")
    SHOP_NAME: str = Field(default="ChaiFlow Tea Shop")
    SHOP_PHONE: str = Field(default="+91 98840 12345")
    SHOP_ADDRESS: str = Field(default="12 Market Square, Station Road")
    UPI_ID: str = Field(default="chaiflow@upi")
    FSSAI_LICENSE: str = Field(default="21524012000892")
    ADMIN_REGISTRATION_SECRET: str = Field(default="CHAIFLOW_ADMIN_SECRET_2026")

    # OTP & SMS Provider Configuration
    SMS_PROVIDER: str = Field(default="console")  # "console", "twilio", "fast2sms", "mock"
    TWILIO_ACCOUNT_SID: str = Field(default="")
    TWILIO_AUTH_TOKEN: str = Field(default="")
    TWILIO_FROM_NUMBER: str = Field(default="")
    FAST2SMS_API_KEY: str = Field(default="")
    OTP_EXPIRE_MINUTES: int = Field(default=5)
    OTP_MAX_ATTEMPTS: int = Field(default=5)
    OTP_RESEND_COOLDOWN_SECONDS: int = Field(default=30)

    @property
    def cors_origins_list(self) -> List[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        for origin in ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]:
            if origin not in origins:
                origins.append(origin)
        return origins

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
