import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from models.user import User
    from models.menu import MenuCategory, MenuItem
    from models.order import OrderItem
    from schemas.menu import (
        MenuCategoryCreate,
        MenuCategoryUpdate,
        MenuCategoryResponse,
        MenuItemCreate,
        MenuItemUpdate,
        MenuItemAvailabilityUpdate,
        MenuItemStockUpdate,
        MenuItemResponse,
        MenuCatalogCategoryResponse,
    )
    from dependencies.auth import require_admin, require_staff_or_admin
except ImportError:
    from backend.database.connection import get_db
    from backend.models.user import User
    from backend.models.menu import MenuCategory, MenuItem
    from backend.models.order import OrderItem
    from backend.schemas.menu import (
        MenuCategoryCreate,
        MenuCategoryUpdate,
        MenuCategoryResponse,
        MenuItemCreate,
        MenuItemUpdate,
        MenuItemAvailabilityUpdate,
        MenuItemStockUpdate,
        MenuItemResponse,
        MenuCatalogCategoryResponse,
    )
    from backend.dependencies.auth import require_admin, require_staff_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/menu", tags=["Menu"])


def _format_item(item: MenuItem) -> MenuItemResponse:
    """
    Serializes a MenuItem model, computing low-stock indicator and category name.
    """
    is_low = item.track_stock and item.available_quantity <= item.low_stock_threshold
    cat_name = item.category.name if item.category else None

    return MenuItemResponse(
        id=item.id,
        category_id=item.category_id,
        category_name=cat_name,
        name=item.name,
        description=item.description,
        price=item.price,
        image_url=item.image_url,
        is_available=item.is_available,
        track_stock=item.track_stock,
        available_quantity=item.available_quantity,
        low_stock_threshold=item.low_stock_threshold,
        is_low_stock=is_low,
        has_customizations=item.has_customizations,
        customization_options=item.customization_options,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _format_category(cat: MenuCategory, db: Session) -> MenuCategoryResponse:
    """
    Serializes a MenuCategory model with its count of items.
    """
    count = db.query(func.count(MenuItem.id)).filter(MenuItem.category_id == cat.id).scalar() or 0
    return MenuCategoryResponse(
        id=cat.id,
        name=cat.name,
        description=cat.description,
        display_order=cat.display_order,
        is_active=cat.is_active,
        items_count=count,
        created_at=cat.created_at,
        updated_at=cat.updated_at,
    )


# =============================================================
# Category Endpoints
# =============================================================

@router.get(
    "/categories",
    response_model=List[MenuCategoryResponse],
    summary="List Menu Categories (Public)",
    description="Returns categories ordered by display priority. Used by customers and admin menu builder."
)
def list_categories(
    include_inactive: bool = Query(False, description="Include deactivated categories (Admin)"),
    db: Session = Depends(get_db),
):
    query = db.query(MenuCategory)
    if not include_inactive:
        query = query.filter(MenuCategory.is_active.is_(True))

    categories = query.order_by(MenuCategory.display_order.asc(), MenuCategory.name.asc()).all()
    return [_format_category(c, db) for c in categories]


@router.post(
    "/categories",
    response_model=MenuCategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Category (Staff/Admin)",
    description="Creates a new menu category (e.g., Tea & Chai, Snacks)."
)
def create_category(
    payload: MenuCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    existing = db.query(MenuCategory).filter(
        func.lower(MenuCategory.name) == payload.name.lower()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category with name '{payload.name}' already exists.",
        )

    category = MenuCategory(
        name=payload.name,
        description=payload.description,
        display_order=payload.display_order,
        is_active=payload.is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    logger.info(f"Created menu category '{category.name}' (id={category.id}) by {current_user.name}")
    return _format_category(category, db)


@router.put(
    "/categories/{category_id}",
    response_model=MenuCategoryResponse,
    summary="Update Category (Staff/Admin)",
    description="Updates category name, description, priority, or visibility."
)
def update_category(
    category_id: int,
    payload: MenuCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    category = db.query(MenuCategory).filter(MenuCategory.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with ID {category_id} not found.",
        )

    if payload.name is not None:
        conflict = db.query(MenuCategory).filter(
            func.lower(MenuCategory.name) == payload.name.lower(),
            MenuCategory.id != category_id
        ).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category name '{payload.name}' is already taken.",
            )
        category.name = payload.name

    if payload.description is not None:
        category.description = payload.description
    if payload.display_order is not None:
        category.display_order = payload.display_order
    if payload.is_active is not None:
        category.is_active = payload.is_active

    db.commit()
    db.refresh(category)
    return _format_category(category, db)


@router.delete(
    "/categories/{category_id}",
    summary="Delete Category (Admin Only)",
    description="Deletes category and cascades deletion to associated items."
)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    category = db.query(MenuCategory).filter(MenuCategory.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with ID {category_id} not found.",
        )

    name = category.name
    db.delete(category)
    db.commit()
    logger.info(f"Admin {admin_user.name} deleted category '{name}' (id={category_id})")
    return {"success": True, "message": f"Category '{name}' deleted successfully."}


# =============================================================
# Menu Item Endpoints
# =============================================================

@router.get(
    "/items",
    response_model=List[MenuItemResponse],
    summary="List Menu Items (Public)",
    description="Lists items with optional search and category filters. Accessible publicly for QR ordering."
)
def list_menu_items(
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    search: Optional[str] = Query(None, description="Search product name or description"),
    is_available: Optional[bool] = Query(None, description="Filter available items only"),
    has_customizations: Optional[bool] = Query(None, description="Filter items offering customizations"),
    db: Session = Depends(get_db),
):
    query = db.query(MenuItem).options(joinedload(MenuItem.category))

    if category_id is not None:
        query = query.filter(MenuItem.category_id == category_id)

    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(MenuItem.name.ilike(pattern), MenuItem.description.ilike(pattern))
        )

    if is_available is not None:
        query = query.filter(MenuItem.is_available == is_available)

    if has_customizations is not None:
        query = query.filter(MenuItem.has_customizations == has_customizations)

    items = query.order_by(MenuItem.category_id.asc(), MenuItem.name.asc()).all()
    return [_format_item(i) for i in items]


@router.get(
    "/items/{item_id}",
    response_model=MenuItemResponse,
    summary="Get Menu Item Details (Public)",
    description="Returns single menu item details including customization modifiers."
)
def get_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(MenuItem).options(joinedload(MenuItem.category)).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item with ID {item_id} not found.",
        )
    return _format_item(item)


@router.post(
    "/items",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Menu Item (Staff/Admin)",
    description="Adds a new tea/coffee/snack item with price, stock tracking, and customization options."
)
def create_menu_item(
    payload: MenuItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    # Verify category exists
    category = db.query(MenuCategory).filter(MenuCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category ID {payload.category_id} does not exist.",
        )

    item = MenuItem(
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        image_url=payload.image_url,
        is_available=payload.is_available,
        track_stock=payload.track_stock,
        available_quantity=payload.available_quantity,
        low_stock_threshold=payload.low_stock_threshold,
        has_customizations=payload.has_customizations,
        customization_options=payload.customization_options,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info(f"Created menu item '{item.name}' (id={item.id}) under '{category.name}'")
    return _format_item(item)


@router.put(
    "/items/{item_id}",
    response_model=MenuItemResponse,
    summary="Update Menu Item (Staff/Admin)",
    description="Updates product specifications, pricing, stock limits, or customization choices."
)
def update_menu_item(
    item_id: int,
    payload: MenuItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    item = db.query(MenuItem).options(joinedload(MenuItem.category)).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item with ID {item_id} not found.",
        )

    if payload.category_id is not None:
        cat = db.query(MenuCategory).filter(MenuCategory.id == payload.category_id).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category ID {payload.category_id} does not exist.",
            )
        item.category_id = payload.category_id

    if payload.name is not None:
        item.name = payload.name
    if payload.description is not None:
        item.description = payload.description
    if payload.price is not None:
        item.price = payload.price
    if payload.image_url is not None:
        item.image_url = payload.image_url
    if payload.is_available is not None:
        item.is_available = payload.is_available
    if payload.track_stock is not None:
        item.track_stock = payload.track_stock
    if payload.available_quantity is not None:
        item.available_quantity = payload.available_quantity
    if payload.low_stock_threshold is not None:
        item.low_stock_threshold = payload.low_stock_threshold
    if payload.has_customizations is not None:
        item.has_customizations = payload.has_customizations
    if payload.customization_options is not None:
        item.customization_options = payload.customization_options

    db.commit()
    db.refresh(item)
    return _format_item(item)


@router.delete(
    "/items/{item_id}",
    summary="Delete Menu Item (Admin Only)",
    description="Deletes product from shop menu database."
)
def delete_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item with ID {item_id} not found.",
        )

    name = item.name
    # Preserve sales and receipt history while clearing foreign key reference
    db.query(OrderItem).filter(OrderItem.menu_item_id == item_id).update(
        {OrderItem.menu_item_id: None},
        synchronize_session=False,
    )
    db.delete(item)
    db.commit()
    logger.info(f"Admin {admin_user.name} deleted product '{name}' (id={item_id})")
    return {"success": True, "message": f"Product '{name}' deleted successfully."}


@router.patch(
    "/items/{item_id}/availability",
    response_model=MenuItemResponse,
    summary="Toggle Availability (Staff/Admin)",
    description="Quick toggle to 86 / make product available at counter."
)
def toggle_item_availability(
    item_id: int,
    payload: MenuItemAvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    item = db.query(MenuItem).options(joinedload(MenuItem.category)).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item with ID {item_id} not found.",
        )

    item.is_available = payload.is_available
    db.commit()
    db.refresh(item)
    logger.info(f"Availability for '{item.name}' set to {item.is_available} by {current_user.name}")
    return _format_item(item)


@router.patch(
    "/items/{item_id}/stock",
    response_model=MenuItemResponse,
    summary="Update Daily Stock (Staff/Admin)",
    description="Quickly update available stock units for a product."
)
def update_item_stock(
    item_id: int,
    payload: MenuItemStockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    item = db.query(MenuItem).options(joinedload(MenuItem.category)).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item with ID {item_id} not found.",
        )

    item.available_quantity = payload.available_quantity
    db.commit()
    db.refresh(item)
    logger.info(f"Stock for '{item.name}' updated to {item.available_quantity} by {current_user.name}")
    return _format_item(item)


# =============================================================
# Full Menu Catalog Tree for Mobile QR Ordering
# =============================================================

@router.get(
    "/catalog",
    response_model=List[MenuCatalogCategoryResponse],
    summary="Full Menu Catalog Tree (Public)",
    description="Returns all active categories nested with their active menu items for mobile QR menu view."
)
def get_full_catalog(db: Session = Depends(get_db)):
    categories = db.query(MenuCategory).filter(
        MenuCategory.is_active.is_(True)
    ).order_by(MenuCategory.display_order.asc(), MenuCategory.name.asc()).all()

    catalog = []
    for cat in categories:
        items = db.query(MenuItem).filter(
            MenuItem.category_id == cat.id
        ).order_by(MenuItem.name.asc()).all()

        if items:
            catalog.append(MenuCatalogCategoryResponse(
                id=cat.id,
                name=cat.name,
                description=cat.description,
                display_order=cat.display_order,
                items=[_format_item(i) for i in items]
            ))

    return catalog


@router.get(
    "/qr-info",
    summary="Get QR Ordering Metadata (Public)",
    description="Returns shop branding and table session metadata when a customer scans a table QR code."
)
def get_qr_info(
    table: Optional[str] = Query(None, description="Table number from scanned QR code"),
    counter: Optional[str] = Query(None, description="Counter pickup number from scanned QR code")
):
    order_mode = "table" if table else ("counter" if counter else "takeaway")
    return {
        "shop_name": "ChaiFlow Tea Shop",
        "tagline": "Traditional Spiced Chai & Irani Cafe Favorites",
        "currency": "INR",
        "currency_symbol": "₹",
        "order_mode": order_mode,
        "table_number": table,
        "counter_number": counter,
        "ordering_enabled": True,
        "features": {
            "customizations": True,
            "credit_billing": True,
            "fast_tokens": True,
        }
    }

