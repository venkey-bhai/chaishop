import sys
import logging
from pathlib import Path
from sqlalchemy import text
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.connection import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def run_migration():
    logger.info("Applying database migration for Table, Seat, and Shared Dishes...")
    with engine.begin() as conn:
        # Add order_type, table_number, and seat_number to orders table
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'DINE_IN' NOT NULL;"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number VARCHAR(20);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS seat_number VARCHAR(20);"))
        
        # Create shared_dish_transactions table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shared_dish_transactions (
                id SERIAL PRIMARY KEY,
                original_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                original_order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
                destination_table_id VARCHAR(20) NOT NULL,
                destination_seat_no VARCHAR(20),
                quantity INTEGER NOT NULL,
                status VARCHAR(32) DEFAULT 'CONFIRMED' NOT NULL,
                created_by VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            );
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shared_dish_transactions_original_order_id ON shared_dish_transactions(original_order_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shared_dish_transactions_original_order_item_id ON shared_dish_transactions(original_order_item_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shared_dish_transactions_destination_table_id ON shared_dish_transactions(destination_table_id);"))
        
        # Backfill any existing table numbers from notes (e.g. 'Table #3' -> table_number = '3')
        conn.execute(text("""
            UPDATE orders 
            SET table_number = SUBSTRING(notes FROM 'Table #([0-9A-Za-z_-]+)')
            WHERE table_number IS NULL AND notes LIKE '%Table #%';
        """))
        
        logger.info("Migration finished successfully!")

if __name__ == "__main__":
    run_migration()
