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

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
