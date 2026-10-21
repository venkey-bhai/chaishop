import sys
import os

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database.connection import engine

def migrate():
    print("Running OTP Verification database migration...")
    with engine.connect() as conn:
        # 1. Add new enum values to order_status_enum if they don't exist
        for val in ['PENDING_OTP_VERIFICATION', 'VERIFICATION_EXPIRED']:
            try:
                conn.execute(text(f"ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS '{val}';"))
                conn.commit()
                print(f"Added '{val}' to order_status_enum.")
            except Exception as e:
                conn.rollback()
                print(f"Note on order_status_enum '{val}': {e}")

        # 2. Add reserved_quantity column to menu_items
        try:
            conn.execute(text("""
                ALTER TABLE menu_items 
                ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;
            """))
            conn.commit()
            print("Checked/added reserved_quantity on menu_items.")
        except Exception as e:
            conn.rollback()
            print(f"Note on reserved_quantity: {e}")

        # 3. Create order_otp_challenges table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS order_otp_challenges (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                    mobile_number VARCHAR(15) NOT NULL,
                    otp_hash VARCHAR(128) NOT NULL,
                    otp_salt VARCHAR(64) NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    last_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    verified_at TIMESTAMP WITH TIME ZONE,
                    resend_count INTEGER NOT NULL DEFAULT 0,
                    cooldown_seconds INTEGER NOT NULL DEFAULT 30,
                    idempotency_key VARCHAR(64),
                    reserved_stock JSONB
                );
                CREATE INDEX IF NOT EXISTS ix_order_otp_challenges_order_id ON order_otp_challenges(order_id);
                CREATE INDEX IF NOT EXISTS ix_order_otp_challenges_customer_id ON order_otp_challenges(customer_id);
                CREATE INDEX IF NOT EXISTS ix_order_otp_challenges_status ON order_otp_challenges(status);
                CREATE INDEX IF NOT EXISTS ix_order_otp_challenges_idempotency_key ON order_otp_challenges(idempotency_key);
            """))
            conn.commit()
            print("Checked/created order_otp_challenges table and indices.")
        except Exception as e:
            conn.rollback()
            print(f"Error creating order_otp_challenges table: {e}")
            raise

    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
