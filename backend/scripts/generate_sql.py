import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from database.base import Base
import models
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

sql_output = []
sql_output.append("-- =============================================================")
sql_output.append("-- ChaiFlow / Tea Shop Management System Database Schema")
sql_output.append("-- For Supabase SQL Editor")
sql_output.append("-- =============================================================\n")

sql_output.append("-- 1. Enable UUID extension")
sql_output.append('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n')

sql_output.append("-- 2. Custom Enum Types")
enums = [
    ("user_role_enum", ["ADMIN", "STAFF", "CUSTOMER"]),
    ("payment_method_enum", ["CASH", "UPI", "CARD", "CREDIT"]),
    ("payment_status_enum", ["PENDING", "PAID", "FAILED"]),
    ("order_status_enum", ["PENDING_OTP_VERIFICATION", "PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED", "VERIFICATION_EXPIRED"]),
    ("otp_challenge_status_enum", ["PENDING", "VERIFIED", "EXPIRED", "MAX_ATTEMPTS_EXCEEDED", "CANCELLED"]),
    ("credit_transaction_type_enum", ["DEBIT", "PAYMENT_SETTLEMENT", "CREDIT_ADJUSTMENT"]),
    ("expense_payment_method_enum", ["CASH", "UPI", "BANK_TRANSFER", "CARD"]),
]

for name, values in enums:
    vals_str = ", ".join(f"'{v}'" for v in values)
    sql_output.append(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN CREATE TYPE {name} AS ENUM ({vals_str}); END IF; END $$;")

sql_output.append("\n-- 3. Tables")
for table in Base.metadata.sorted_tables:
    create_stmt = str(CreateTable(table).compile(dialect=postgresql.dialect())).strip()
    create_stmt = create_stmt.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
    sql_output.append(f"{create_stmt};\n")

out_path = os.path.join(backend_root, "supabase_schema.sql")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sql_output))

print(f"[SUCCESS] Wrote complete schema to: {out_path}")
