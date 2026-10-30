import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from database.connection import get_db
    from models.table import DiningTable
    from models.user import User
    from schemas.table import DiningTableCreate, DiningTableUpdate, DiningTableResponse
    from dependencies.auth import require_admin, require_staff_or_admin
except ImportError:
    from backend.database.connection import get_db
    from backend.models.table import DiningTable
    from backend.models.user import User
    from backend.schemas.table import DiningTableCreate, DiningTableUpdate, DiningTableResponse
    from backend.dependencies.auth import require_admin, require_staff_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/tables",
    tags=["Dining Tables & Seats"]
)


def validate_table_and_seat(db: Session, table_number: str, seat_number: Optional[str] = None) -> DiningTable:
    """
    Validates table existence, active status, and seat capacity.
    Requirement 4: If customer selects Seat 8 on Table 5 with max 6 seats:
    'Table 5 has a maximum of 6 seats. Please select a seat between 1 and 6.'
    """
    clean_table = (table_number or "").strip()
    if not clean_table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Table number is required."
        )

    dining_table = db.query(DiningTable).filter(
        DiningTable.table_number == clean_table,
        DiningTable.is_active == True
    ).first()

    if not dining_table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Table {clean_table} has no configured capacity or is currently inactive. Please configure table capacity in Admin."
        )

    if seat_number is not None:
        clean_seat_str = str(seat_number).strip()
        if clean_seat_str:
            digits = "".join(ch for ch in clean_seat_str if ch.isdigit())
            try:
                seat_num = int(digits) if digits else int(clean_seat_str)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid seat number '{clean_seat_str}'. Please select a seat between 1 and {dining_table.max_seats}."
                )

            if seat_num < 1 or seat_num > dining_table.max_seats:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table {dining_table.table_number} has a maximum of {dining_table.max_seats} seats. Please select a seat between 1 and {dining_table.max_seats}."
                )

    return dining_table


@router.get(
    "",
    response_model=List[DiningTableResponse],
    summary="List Active Dining Tables and Capacities",
    description="Returns all active tables with their configured maximum seat capacity for QR ordering, dine-in, and table changes."
)
def list_active_tables(db: Session = Depends(get_db)):
    tables = db.query(DiningTable).filter(DiningTable.is_active == True).all()
    # Sort numerically where possible, otherwise alphabetically
    def sort_key(t):
        try:
            return (0, int(t.table_number), t.table_number)
        except ValueError:
            return (1, 0, t.table_number)

    return sorted(tables, key=sort_key)


@router.get(
    "/all",
    response_model=List[DiningTableResponse],
    summary="List All Dining Tables (Admin)",
    description="Returns all tables (active and inactive) for admin management."
)
def list_all_tables(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_staff_or_admin)
):
    tables = db.query(DiningTable).all()
    def sort_key(t):
        try:
            return (0, int(t.table_number), t.table_number)
        except ValueError:
            return (1, 0, t.table_number)

    return sorted(tables, key=sort_key)


@router.post(
    "",
    response_model=DiningTableResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or Update Dining Table Capacity (Admin Only)",
    description="Creates a new table or updates the maximum seats for an existing table."
)
def create_or_update_table(
    payload: DiningTableCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    clean_table = payload.table_number.strip()
    existing = db.query(DiningTable).filter(DiningTable.table_number == clean_table).first()

    if existing:
        existing.max_seats = payload.max_seats
        existing.is_active = payload.is_active
        db.commit()
        db.refresh(existing)
        logger.info(f"Admin {admin_user.name} updated table #{clean_table} max_seats={payload.max_seats}")
        return existing

    new_table = DiningTable(
        table_number=clean_table,
        max_seats=payload.max_seats,
        is_active=payload.is_active
    )
    db.add(new_table)
    db.commit()
    db.refresh(new_table)
    logger.info(f"Admin {admin_user.name} created table #{clean_table} with max_seats={payload.max_seats}")
    return new_table


@router.put(
    "/{table_number}",
    response_model=DiningTableResponse,
    summary="Update Table Capacity and Status (Admin Only)",
    description="Updates maximum seat capacity or active status for a specific table."
)
def update_table_capacity(
    table_number: str,
    payload: DiningTableUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    clean_table = table_number.strip()
    existing = db.query(DiningTable).filter(DiningTable.table_number == clean_table).first()

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table #{clean_table} not found."
        )

    if payload.max_seats is not None:
        existing.max_seats = payload.max_seats
    if payload.is_active is not None:
        existing.is_active = payload.is_active

    db.commit()
    db.refresh(existing)
    logger.info(f"Admin {admin_user.name} modified table #{clean_table}: max_seats={existing.max_seats}, active={existing.is_active}")
    return existing


@router.delete(
    "/{table_number}",
    summary="Deactivate or Delete Table (Admin Only)",
    description="Deactivates a table to remove it from customer ordering while preserving past history."
)
def deactivate_table(
    table_number: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    clean_table = table_number.strip()
    existing = db.query(DiningTable).filter(DiningTable.table_number == clean_table).first()

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table #{clean_table} not found."
        )

    existing.is_active = False
    db.commit()
    logger.info(f"Admin {admin_user.name} deactivated table #{clean_table}")
    return {"message": f"Table #{clean_table} has been deactivated.", "table_number": clean_table}
