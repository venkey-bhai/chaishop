import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session

try:
    from database.connection import get_db
    from models.user import User
    from models.expense import Expense, ExpensePaymentMethod
    from schemas.expense import (
        ExpenseCreate,
        ExpenseUpdate,
        ExpenseResponse,
        ExpensePaginationResponse,
        ExpenseCategorySummary,
        ExpenseAnalyticsResponse,
    )
    from dependencies.auth import require_admin, require_staff_or_admin
except ImportError:
    from backend.database.connection import get_db
    from backend.models.user import User
    from backend.models.expense import Expense, ExpensePaymentMethod
    from backend.schemas.expense import (
        ExpenseCreate,
        ExpenseUpdate,
        ExpenseResponse,
        ExpensePaginationResponse,
        ExpenseCategorySummary,
        ExpenseAnalyticsResponse,
    )
    from backend.dependencies.auth import require_admin, require_staff_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/expenses", tags=["Shop Expenses & Cost Management"])

STANDARD_CATEGORIES = [
    "Milk",
    "Tea Powder",
    "Sugar",
    "Gas Cylinders",
    "Electricity",
    "Rent",
    "Staff Salary",
    "Maintenance",
    "Cleaning & Packaging",
    "Other",
]


def _format_expense(expense: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=expense.id,
        category=expense.category,
        description=expense.description,
        amount=expense.amount,
        expense_date=expense.expense_date,
        payment_method=expense.payment_method,
        recorded_by_user_id=expense.recorded_by_user_id,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


# =============================================================
# Categories & Predefined Types
# =============================================================

@router.get(
    "/categories",
    response_model=List[str],
    summary="List Predefined Expense Categories (Staff / Admin)",
    description="Returns list of standard and custom expense categories used in tea shop procurement."
)
def list_expense_categories(
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    db_cats = db.query(Expense.category).distinct().all()
    all_cats = set(STANDARD_CATEGORIES)
    for row in db_cats:
        if row[0]:
            all_cats.add(row[0])
    return sorted(list(all_cats))


# =============================================================
# Expense CRUD Operations
# =============================================================

@router.post(
    "",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record New Shop Expense (Staff / Admin)",
    description="Records a new operational outlay (e.g. daily milk delivery, gas refill, or ingredients)."
)
def create_expense(
    payload: ExpenseCreate,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    expense_date = payload.expense_date or datetime.now(timezone.utc).date()

    new_expense = Expense(
        category=payload.category,
        description=payload.description.strip(),
        amount=payload.amount,
        expense_date=expense_date,
        payment_method=payload.payment_method,
        recorded_by_user_id=current_user.id
    )
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    logger.info(
        f"Recorded expense ID={new_expense.id} '{new_expense.category}' "
        f"amount=₹{new_expense.amount} by {current_user.name}"
    )

    return _format_expense(new_expense)


@router.get(
    "",
    response_model=ExpensePaginationResponse,
    summary="List & Filter Expenses (Staff / Admin)",
    description="Search and filter shop operating expenses by category, date range, payment method, or vendor description."
)
def list_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None, description="Filter by category"),
    payment_method: Optional[ExpensePaymentMethod] = Query(None, description="Filter by payment channel"),
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    today_only: bool = Query(False, description="Today's expenses only"),
    search: Optional[str] = Query(None, description="Search category or description"),
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Expense)

    if today_only:
        today_date = datetime.now(timezone.utc).date()
        query = query.filter(Expense.expense_date == today_date)
    else:
        if start_date:
            query = query.filter(Expense.expense_date >= start_date)
        if end_date:
            query = query.filter(Expense.expense_date <= end_date)

    if category:
        query = query.filter(Expense.category.ilike(f"%{category.strip()}%"))

    if payment_method:
        query = query.filter(Expense.payment_method == payment_method)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Expense.category.ilike(s),
                Expense.description.ilike(s)
            )
        )

    total = query.count()
    total_amount = query.with_entities(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).scalar() or Decimal("0.00")

    offset = (page - 1) * limit
    expenses = query.order_by(desc(Expense.expense_date), desc(Expense.id)).offset(offset).limit(limit).all()

    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return ExpensePaginationResponse(
        items=[_format_expense(e) for e in expenses],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        total_amount=total_amount
    )


@router.get(
    "/analytics",
    response_model=ExpenseAnalyticsResponse,
    summary="Expense Analytics & Cost Breakdown (Staff / Admin)",
    description="Calculates today's outlay, current calendar month outlay, category distributions, and payment mode breakdowns."
)
def get_expense_analytics(
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    today = datetime.now(timezone.utc).date()
    month_start = date(today.year, today.month, 1)

    # 1. Total expenses today
    total_today = db.query(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).filter(
        Expense.expense_date == today
    ).scalar() or Decimal("0.00")

    # 2. Total expenses current month
    total_month = db.query(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).filter(
        Expense.expense_date >= month_start
    ).scalar() or Decimal("0.00")

    total_records = db.query(func.count(Expense.id)).scalar() or 0

    # 3. Category Breakdown (Sum & Count)
    cat_rows = db.query(
        Expense.category,
        func.sum(Expense.amount).label("cat_total"),
        func.count(Expense.id).label("cat_count")
    ).group_by(Expense.category).order_by(desc("cat_total")).all()

    overall_total = sum((r[1] for r in cat_rows), Decimal("0.00"))
    by_category = []
    for cat_name, cat_tot, cat_cnt in cat_rows:
        pct = float((cat_tot / overall_total) * 100) if overall_total > 0 else 0.0
        by_category.append(ExpenseCategorySummary(
            category=cat_name,
            total_amount=cat_tot,
            count=cat_cnt,
            percentage=round(pct, 1)
        ))

    # 4. By Payment Method
    pm_rows = db.query(
        Expense.payment_method,
        func.sum(Expense.amount)
    ).group_by(Expense.payment_method).all()

    by_pm = {str(row[0].value if hasattr(row[0], "value") else row[0]): row[1] for row in pm_rows}

    # 5. Recent 5 expenses
    recent = db.query(Expense).order_by(desc(Expense.expense_date), desc(Expense.id)).limit(5).all()

    return ExpenseAnalyticsResponse(
        total_expenses_today=total_today,
        total_expenses_month=total_month,
        total_records=total_records,
        by_category=by_category,
        by_payment_method=by_pm,
        recent_expenses=[_format_expense(e) for e in recent]
    )


@router.get(
    "/{expense_id}",
    response_model=ExpenseResponse,
    summary="Get Expense by ID (Staff / Admin)",
    description="Retrieves single expense record."
)
def get_expense_by_id(
    expense_id: int,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Expense with ID {expense_id} not found."
        )
    return _format_expense(expense)


@router.put(
    "/{expense_id}",
    response_model=ExpenseResponse,
    summary="Update Expense (Staff / Admin)",
    description="Updates existing expense record fields."
)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    current_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Expense with ID {expense_id} not found."
        )

    if payload.category is not None:
        expense.category = payload.category.strip().title()
    if payload.description is not None:
        expense.description = payload.description.strip()
    if payload.amount is not None:
        expense.amount = payload.amount
    if payload.expense_date is not None:
        expense.expense_date = payload.expense_date
    if payload.payment_method is not None:
        expense.payment_method = payload.payment_method

    db.commit()
    db.refresh(expense)

    logger.info(f"Updated expense ID={expense.id} by {current_user.name}")
    return _format_expense(expense)


@router.delete(
    "/{expense_id}",
    summary="Delete Expense Record (Admin Only)",
    description="Permanently deletes an expense record. Restricted to Administrator."
)
def delete_expense(
    expense_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Expense with ID {expense_id} not found."
        )

    cat_name = expense.category
    amt = expense.amount
    db.delete(expense)
    db.commit()

    logger.info(f"Deleted expense ID={expense_id} ('{cat_name}' ₹{amt}) by admin {current_user.name}")
    return {"message": "Expense deleted successfully", "id": expense_id}
