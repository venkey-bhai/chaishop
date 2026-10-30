import logging
from sqlalchemy import text
from database.connection import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def run_migration():
    logger.info("Running table capacity and credit audit migrations...")
    with engine.begin() as conn:
        # 1. Create dining_tables table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dining_tables (
                id SERIAL PRIMARY KEY,
                table_number VARCHAR(20) UNIQUE NOT NULL,
                max_seats INTEGER NOT NULL DEFAULT 4,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_dining_tables_table_number ON dining_tables (table_number);
        """))
        logger.info("Checked/created table: dining_tables")

        # 2. Create credit_limit_audits table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS credit_limit_audits (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                admin_name VARCHAR(100) NOT NULL,
                old_limit NUMERIC(10, 2) NOT NULL,
                new_limit NUMERIC(10, 2) NOT NULL,
                reason VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_credit_limit_audits_customer_id ON credit_limit_audits (customer_id);
            CREATE INDEX IF NOT EXISTS ix_credit_limit_audits_created_at ON credit_limit_audits (created_at);
        """))
        logger.info("Checked/created table: credit_limit_audits")

        # 3. Seed default tables if dining_tables is empty
        res = conn.execute(text("SELECT COUNT(*) FROM dining_tables")).scalar()
        if res == 0:
            logger.info("Seeding default dining tables (1-10)...")
            default_tables = [
                ("1", 4),
                ("2", 4),
                ("3", 4),
                ("4", 4),
                ("5", 6),
                ("6", 6),
                ("7", 6),
                ("8", 6),
                ("9", 8),
                ("10", 8),
            ]
            for tbl, seats in default_tables:
                conn.execute(
                    text("INSERT INTO dining_tables (table_number, max_seats, is_active) VALUES (:tbl, :seats, TRUE)"),
                    {"tbl": tbl, "seats": seats}
                )
            logger.info(f"Seeded {len(default_tables)} default dining tables.")
        else:
            logger.info(f"dining_tables already has {res} configured tables.")

    logger.info("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
