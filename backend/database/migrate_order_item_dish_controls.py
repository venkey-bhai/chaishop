import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from database.connection import engine

def migrate_order_items():
    with engine.connect() as conn:
        print("Checking order_items table for new dish control columns...")
        
        # 1. Add status column to order_items
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'order_items' AND column_name = 'status'
                ) THEN
                    ALTER TABLE order_items ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PENDING';
                    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
                    RAISE NOTICE 'Added status column to order_items';
                END IF;
            END $$;
        """))

        # 2. Add cancelled_by column to order_items
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'order_items' AND column_name = 'cancelled_by'
                ) THEN
                    ALTER TABLE order_items ADD COLUMN cancelled_by VARCHAR(50) NULL;
                    RAISE NOTICE 'Added cancelled_by column to order_items';
                END IF;
            END $$;
        """))

        # 3. Add cancelled_at column to order_items
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'order_items' AND column_name = 'cancelled_at'
                ) THEN
                    ALTER TABLE order_items ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE NULL;
                    RAISE NOTICE 'Added cancelled_at column to order_items';
                END IF;
            END $$;
        """))

        # 4. Add completed_at column to order_items
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'order_items' AND column_name = 'completed_at'
                ) THEN
                    ALTER TABLE order_items ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE NULL;
                    RAISE NOTICE 'Added completed_at column to order_items';
                END IF;
            END $$;
        """))

        # 5. Populate initial status based on existing order's order_status
        conn.execute(text("""
            UPDATE order_items oi
            SET status = CASE 
                WHEN o.order_status = 'CANCELLED' THEN 'CANCELLED'
                WHEN o.order_status = 'READY' THEN 'READY'
                WHEN o.order_status = 'COMPLETED' THEN 'DELIVERED'
                WHEN o.order_status = 'PREPARING' THEN 'PREPARING'
                ELSE 'PENDING'
            END,
            cancelled_by = CASE
                WHEN o.order_status = 'CANCELLED' THEN 'ADMIN'
                ELSE NULL
            END
            FROM orders o
            WHERE oi.order_id = o.id AND (oi.status IS NULL OR oi.status = 'PENDING');
        """))

        conn.commit()
        print("Migration for order_items dish controls completed successfully!")

if __name__ == "__main__":
    migrate_order_items()
