import sys
import os
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

# Ensure backend root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from database.connection import SessionLocal
from models.user import User, UserRole
from models.expense import Expense, ExpensePaymentMethod


def seed_expenses():
    """
    Seed realistic tea shop operational expenses across multiple categories,
    dates, and payment methods (Section 20).
    """
    db = SessionLocal()
    try:
        # Find admin or staff user to attribute records to
        admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        admin_id = admin.id if admin else None

        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)
        three_days_ago = today - timedelta(days=3)
        last_week = today - timedelta(days=7)

        sample_expenses = [
            # Today's daily operational purchases
            {
                "category": "Milk",
                "description": "Daily morning fresh milk delivery (35 Litres @ ₹50/L from Nandini Dairy)",
                "amount": Decimal("1750.00"),
                "expense_date": today,
                "payment_method": ExpensePaymentMethod.CASH,
            },
            {
                "category": "Tea Powder",
                "description": "Wagh Bakri & Assam CTC premium blend 5kg wholesale bag",
                "amount": Decimal("1850.00"),
                "expense_date": today,
                "payment_method": ExpensePaymentMethod.UPI,
            },
            {
                "category": "Cleaning & Packaging",
                "description": "2,000 biodegradable paper tea cups (150ml) & napkins",
                "amount": Decimal("750.00"),
                "expense_date": today,
                "payment_method": ExpensePaymentMethod.UPI,
            },
            # Yesterday's procurement
            {
                "category": "Milk",
                "description": "Daily fresh milk delivery (30 Litres @ ₹50/L)",
                "amount": Decimal("1500.00"),
                "expense_date": yesterday,
                "payment_method": ExpensePaymentMethod.CASH,
            },
            {
                "category": "Sugar",
                "description": "Refined commercial sugar bag 25kg wholesale",
                "amount": Decimal("1100.00"),
                "expense_date": yesterday,
                "payment_method": ExpensePaymentMethod.UPI,
            },
            {
                "category": "Gas Cylinders",
                "description": "Commercial 19kg Indane LPG cylinder refill",
                "amount": Decimal("1950.00"),
                "expense_date": yesterday,
                "payment_method": ExpensePaymentMethod.CASH,
            },
            # 2 days ago
            {
                "category": "Milk",
                "description": "Daily milk supply 30L",
                "amount": Decimal("1500.00"),
                "expense_date": two_days_ago,
                "payment_method": ExpensePaymentMethod.CASH,
            },
            {
                "category": "Spices & Raw Materials",
                "description": "Fresh Ginger (Adrak 4kg), Green Cardamom (Elaichi 500g), Cinnamon",
                "amount": Decimal("920.00"),
                "expense_date": two_days_ago,
                "payment_method": ExpensePaymentMethod.UPI,
            },
            # 3 days ago
            {
                "category": "Bakery Items",
                "description": "Wholesale fresh Osmania biscuits, Khari, and Samosas batch",
                "amount": Decimal("1250.00"),
                "expense_date": three_days_ago,
                "payment_method": ExpensePaymentMethod.UPI,
            },
            {
                "category": "Maintenance",
                "description": "Commercial RO water purifier filter service & cartridge replacement",
                "amount": Decimal("850.00"),
                "expense_date": three_days_ago,
                "payment_method": ExpensePaymentMethod.CASH,
            },
            # Last week periodic costs
            {
                "category": "Electricity",
                "description": "Commercial electricity bill payment for tea shop premises",
                "amount": Decimal("3420.00"),
                "expense_date": last_week,
                "payment_method": ExpensePaymentMethod.BANK_TRANSFER,
            },
            {
                "category": "Cleaning & Packaging",
                "description": "Floor disinfectant, glass cleaner, hand wash, garbage liners",
                "amount": Decimal("480.00"),
                "expense_date": last_week,
                "payment_method": ExpensePaymentMethod.CASH,
            },
        ]

        inserted_count = 0
        for item in sample_expenses:
            # Check if matching expense already exists to prevent duplicate seeding
            existing = db.query(Expense).filter(
                Expense.description == item["description"],
                Expense.expense_date == item["expense_date"],
                Expense.amount == item["amount"]
            ).first()

            if not existing:
                expense = Expense(
                    category=item["category"],
                    description=item["description"],
                    amount=item["amount"],
                    expense_date=item["expense_date"],
                    payment_method=item["payment_method"],
                    recorded_by_user_id=admin_id,
                )
                db.add(expense)
                inserted_count += 1

        db.commit()
        print(f"[SUCCESS] Seeded {inserted_count} expense records successfully.")

        # Print summary
        total_records = db.query(Expense).count()
        print(f"[*] Total shop expense records in database: {total_records}")

    except Exception as e:
        db.rollback()
        print(f"[!] Error seeding expenses: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_expenses()
