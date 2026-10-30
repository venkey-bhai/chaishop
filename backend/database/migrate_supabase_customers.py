import sys
from pathlib import Path
from sqlalchemy import text, create_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings

def run_migration():
    print(f"Connecting to database: {settings.normalized_database_url[:30]}...")
    engine = create_engine(settings.normalized_database_url)

    with engine.begin() as conn:
        print("1. Adding missing columns to customers table...")
        conn.execute(text("""
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS user_id INTEGER,
            ADD COLUMN IF NOT EXISTS name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS phone VARCHAR(15),
            ADD COLUMN IF NOT EXISTS is_credit_eligible BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS customer_user_id INTEGER;
        """))

        print("2. Syncing name, phone, customer_user_id from existing data...")
        conn.execute(text("""
            UPDATE customers
            SET name = COALESCE(name, full_name),
                phone = COALESCE(phone, mobile_number),
                customer_user_id = COALESCE(customer_user_id, id)
            WHERE name IS NULL OR phone IS NULL OR customer_user_id IS NULL;
        """))

        print("3. Setting column defaults and NOT NULL constraints where appropriate...")
        conn.execute(text("""
            ALTER TABLE customers ALTER COLUMN is_credit_eligible SET DEFAULT FALSE;
            ALTER TABLE customers ALTER COLUMN is_credit_eligible SET NOT NULL;
            ALTER TABLE customers ALTER COLUMN credit_limit SET DEFAULT 0.00;
            ALTER TABLE customers ALTER COLUMN credit_limit SET NOT NULL;
            ALTER TABLE customers ALTER COLUMN name SET NOT NULL;
            ALTER TABLE customers ALTER COLUMN phone SET NOT NULL;
        """))

        print("4. Creating unique indexes...")
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone ON customers(phone);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_customer_user_id ON customers(customer_user_id);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_id ON customers(user_id);
        """))

        print("5. Adding foreign key constraints if not present...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_user_id') THEN
                    ALTER TABLE customers ADD CONSTRAINT fk_customers_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_customer_user_id') THEN
                    ALTER TABLE customers ADD CONSTRAINT fk_customers_customer_user_id FOREIGN KEY (customer_user_id) REFERENCES customer_users(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """))

        print("6. Creating default CreditAccount for any customer without one...")
        conn.execute(text("""
            INSERT INTO credit_accounts (customer_id, credit_limit, current_balance, is_active, created_at, updated_at)
            SELECT c.id, c.credit_limit, 0.00, c.is_credit_eligible, NOW(), NOW()
            FROM customers c
            LEFT JOIN credit_accounts ca ON ca.customer_id = c.id
            WHERE ca.id IS NULL;
        """))

        print("7. Removing obsolete legacy columns from customers table...")
        conn.execute(text("""
            ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_mobile_number_key;
            ALTER TABLE customers DROP COLUMN IF EXISTS full_name CASCADE;
            ALTER TABLE customers DROP COLUMN IF EXISTS mobile_number CASCADE;
            ALTER TABLE customers DROP COLUMN IF EXISTS password_hash CASCADE;
            ALTER TABLE customers DROP COLUMN IF EXISTS is_active CASCADE;
        """))

        print("Supabase migration completed successfully!")

if __name__ == "__main__":
    run_migration()

