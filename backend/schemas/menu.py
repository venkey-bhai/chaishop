from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


# -------------------------------------------------------------
# Category Schemas
# -------------------------------------------------------------

class MenuCategoryCreate(BaseModel):
    """
    Schema for creating a menu category (e.g., Tea & Chai, Snacks).
    """
    name: str = Field(..., min_length=2, max_length=60, description="Category name", example="Tea & Chai")
    description: Optional[str] = Field(default=None, description="Category description", example="Freshly brewed traditional teas")
    display_order: int = Field(default=0, ge=0, description="Display priority on menu")
    is_active: bool = Field(default=True, description="Whether category is visible on digital menu")

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Category name must be at least 2 characters")
        return trimmed


class MenuCategoryUpdate(BaseModel):
    """
    Schema for updating an existing menu category.
    """
    name: Optional[str] = Field(default=None, min_length=2, max_length=60)
    description: Optional[str] = None
    display_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Category name must be at least 2 characters")
        return trimmed


class MenuCategoryResponse(BaseModel):
    """
    Public category presentation DTO.
    """
    id: int
    name: str
    description: Optional[str] = None
    display_order: int
    is_active: bool
    items_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Menu Item Schemas
# -------------------------------------------------------------

class MenuItemCreate(BaseModel):
    """
    Schema for adding a product to the shop menu.
    """
    category_id: int = Field(..., description="ID of category this item belongs to")
    name: str = Field(..., min_length=2, max_length=120, description="Item name", example="Masala Chai")
    description: Optional[str] = Field(default=None, description="Item description", example="Brewed with fresh ginger, cardamom & clove")
    price: Decimal = Field(..., gt=0, decimal_places=2, description="Price in INR", example=20.00)
    image_url: Optional[str] = Field(default=None, max_length=255, description="Product image URL")
    is_available: bool = Field(default=True, description="Available for ordering")

    # Inventory & Stock protection
    track_stock: bool = Field(default=True, description="Whether to enforce daily stock tracking")
    available_quantity: int = Field(default=50, ge=0, description="Available stock quantity")
    low_stock_threshold: int = Field(default=5, ge=0, description="Threshold for low-stock warning")

    # Tea / Beverage customization options (e.g. Sugar levels, Kadak strength)
    has_customizations: bool = Field(default=False, description="Whether product allows preparation options")
    customization_options: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON definition of options, e.g. {'sugar_levels': ['None', 'Less', 'Medium', 'Extra'], 'tea_strength': ['Light', 'Regular', 'Kadak']}"
    )

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Item name must be at least 2 characters")
        return trimmed


class MenuItemUpdate(BaseModel):
    """
    Schema for updating product information.
    """
    category_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    track_stock: Optional[bool] = None
    available_quantity: Optional[int] = Field(default=None, ge=0)
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)
    has_customizations: Optional[bool] = None
    customization_options: Optional[Dict[str, Any]] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Item name must be at least 2 characters")
        return trimmed


class MenuItemAvailabilityUpdate(BaseModel):
    """
    Quick toggle for 86ing/restoring product availability at the counter.
    """
    is_available: bool = Field(..., description="In stock / Out of stock")


class MenuItemStockUpdate(BaseModel):
    """
    Quick stock quantity restock or manual adjustment.
    """
    available_quantity: int = Field(..., ge=0, description="New available units")


class MenuItemResponse(BaseModel):
    """
    Full menu item presentation DTO.
    """
    id: int
    category_id: int
    category_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    is_available: bool
    track_stock: bool
    available_quantity: int
    low_stock_threshold: int
    is_low_stock: bool = False
    has_customizations: bool
    customization_options: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MenuCatalogCategoryResponse(BaseModel):
    """
    Category with nested active menu items for digital mobile QR browsing.
    """
    id: int
    name: str
    description: Optional[str] = None
    display_order: int
    items: List[MenuItemResponse] = []
