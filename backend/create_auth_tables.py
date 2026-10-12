import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database.connection import engine, SessionLocal
from database.base import Base
from models import AdminUser, CustomerUser, Customer, User, UserRole
from utils.security import hash_password

def setup_tables():
    print("Creating tables if they don't exist...")
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        # Check and add customer_user_id column to customers if not present
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='customers' AND column_name='customer_user_id'
                ) THEN
                    ALTER TABLE customers ADD COLUMN customer_user_id INTEGER UNIQUE REFERENCES customer_users(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """))
        conn.commit()
        print("Checked/added customer_user_id column on customers table.")

    db = SessionLocal()
    try:
        # 1. Seed or verify Admin user in admin_users
        admin = db.query(AdminUser).filter(AdminUser.mobile_number == "9999999999").first()
        if not admin:
            admin = AdminUser(
                full_name="ChaiFlow Admin",
                mobile_number="9999999999",
                email="admin@chaiflow.com",
                password_hash=hash_password("admin123"),
                shop_name="ChaiFlow Tea Shop",
                is_active=True
            )
            db.add(admin)
            print("Seeded default admin in admin_users: 9999999999 / admin123")
        else:
            print("Default admin already exists in admin_users.")

        # Ensure admin exists in legacy users table for foreign key compatibility
        legacy_admin = db.query(User).filter(User.mobile_number == "9999999999").first()
        if not legacy_admin:
            legacy_admin = User(
                mobile_number="9999999999",
                name="ChaiFlow Admin",
                email="admin@chaiflow.com",
                hashed_password=hash_password("admin123"),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(legacy_admin)
            print("Seeded legacy admin in users table.")

        db.commit()

        # 2. Check existing customers and link or create customer_users if needed
        customers = db.query(Customer).all()
        for cust in customers:
            if cust.phone and not cust.customer_user_id:
                existing_cu = db.query(CustomerUser).filter(CustomerUser.mobile_number == cust.phone).first()
                if not existing_cu:
                    cu = CustomerUser(
                        full_name=cust.name or "Customer",
                        mobile_number=cust.phone,
                        email=cust.email,
                        password_hash=hash_password("customer123"),
                        is_active=True
                    )
                    db.add(cu)
                    db.flush()
                    cust.customer_user_id = cu.id
                else:
                    cust.customer_user_id = existing_cu.id
        db.commit()
        print("Migration and seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    setup_tables()
