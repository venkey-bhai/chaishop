import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from config import settings

logger = logging.getLogger(__name__)


# Create SQLAlchemy engine with pool_pre_ping to check connection health
engine = create_engine(
    settings.normalized_database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False
)

# Session factory for DB transactions
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

def get_db():
    """
    FastAPI dependency that provides a transactional database session per request.
    Automatically closes session upon request completion.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_db_connection() -> dict:
    """
    Executes a simple query to verify database connectivity.
    Returns status details for the health check API.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1;")).scalar()
            db_name = conn.execute(text("SELECT current_database();")).scalar()
            pg_version = conn.execute(text("SELECT version();")).scalar()
            tables = [
                row[0] for row in conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;")
                ).fetchall()
            ]
            return {
                "status": "connected" if result == 1 else "unexpected_result",
                "database": db_name,
                "version": pg_version.split(" on ")[0] if pg_version else "PostgreSQL",
                "tables": tables,
                "table_count": len(tables),
                "error": None
            }
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return {
            "status": "disconnected",
            "database": None,
            "version": None,
            "error": str(e)
        }

# import os
# from sqlalchemy import create_engine
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.orm import sessionmaker
# from dotenv import load_dotenv

# load_dotenv()

# DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/teashop_db")

# engine = create_engine(DATABASE_URL)
# SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base = declarative_base()

# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()