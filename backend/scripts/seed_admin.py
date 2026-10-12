import sys
import os

# Ensure backend root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from database.connection import SessionLocal
from models.user import User, UserRole
from utils.security import hash_password

def seed_users():
    db = SessionLocal()
    try:
        # 1. Seed or verify Admin User
        admin_mobile = "9999999999"
        admin = db.query(User).filter(User.mobile_number == admin_mobile).first()
        if not admin:
            admin = User(
                mobile_number=admin_mobile,
                name="Shop Owner Admin",
                email="admin@teashop.com",
                hashed_password=hash_password("admin123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(admin)
            print(f"[+] Admin account created: Mobile: {admin_mobile} | Password: admin123 | Role: ADMIN")
        else:
            print(f"[*] Admin account already exists: {admin_mobile}")

        # 2. Seed or verify Staff User
        staff_mobile = "8888888888"
        staff = db.query(User).filter(User.mobile_number == staff_mobile).first()
        if not staff:
            staff = User(
                mobile_number=staff_mobile,
                name="Counter Staff",
                email="staff@teashop.com",
                hashed_password=hash_password("staff123"),
                role=UserRole.STAFF,
                is_active=True,
            )
            db.add(staff)
            print(f"[+] Staff account created: Mobile: {staff_mobile} | Password: staff123 | Role: STAFF")
        else:
            print(f"[*] Staff account already exists: {staff_mobile}")

        db.commit()
        print("[SUCCESS] User seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"[!] Seeding failed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
