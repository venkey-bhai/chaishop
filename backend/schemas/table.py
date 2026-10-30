from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


class DiningTableCreate(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=20, description="Table identifier (e.g., '1', '5', 'T-10')")
    max_seats: int = Field(default=4, ge=1, le=50, description="Maximum seated capacity (1 to 50)")
    is_active: bool = Field(default=True, description="Whether the table is currently in service")

    @field_validator("table_number")
    @classmethod
    def clean_table_number(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Table number cannot be blank.")
        return cleaned


class DiningTableUpdate(BaseModel):
    max_seats: Optional[int] = Field(default=None, ge=1, le=50, description="Maximum seated capacity")
    is_active: Optional[bool] = Field(default=None, description="Whether table is available")


class DiningTableResponse(BaseModel):
    id: int
    table_number: str
    max_seats: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
