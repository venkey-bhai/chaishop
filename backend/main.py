import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database.connection import check_db_connection

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("teashop_backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan events for FastAPI application.
    Executes startup checks and shutdown cleanup.
    """
    logger.info("Initializing Tea Shop Management System Backend...")
    db_check = check_db_connection()
    if db_check["status"] == "connected":
        logger.info(f"Connected to PostgreSQL database: '{db_check['database']}' ({db_check['version']})")
    else:
        logger.warning(f"Could not connect to PostgreSQL on startup: {db_check['error']}")
    
    yield
    
    logger.info("Shutting down Tea Shop Management System Backend...")

# Initialize FastAPI application
app = FastAPI(
    title="Tea Shop Management & Billing API",
    description="Backend API for QR ordering, customer credit management, shop expenses, and financial analytics.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS Middleware for Next.js frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"^https?://(?:(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:[a-z0-9-]+\.)*devtunnels\.ms(?::\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 3 Authentication Router
try:
    from routers.auth import router as auth_router
except ImportError:
    from backend.routers.auth import router as auth_router

app.include_router(auth_router)

# Phase 4 Customer Management Router
try:
    from routers.customers import router as customers_router
except ImportError:
    from backend.routers.customers import router as customers_router

app.include_router(customers_router)

# Phase 5 Menu Management Router
try:
    from routers.menu import router as menu_router
except ImportError:
    from backend.routers.menu import router as menu_router

app.include_router(menu_router)

# Phase 7 Orders & Daily Token Engine Router
try:
    from routers.orders import router as orders_router
except ImportError:
    from backend.routers.orders import router as orders_router

app.include_router(orders_router)

# Phase 8 Payments & Billing Engine Router
try:
    from routers.payments import router as payments_router
except ImportError:
    from backend.routers.payments import router as payments_router

app.include_router(payments_router)

# Phase 9 Shop Expenses & Cost Management Router
try:
    from routers.expenses import router as expenses_router
except ImportError:
    from backend.routers.expenses import router as expenses_router

app.include_router(expenses_router)

# Phase 10 Financial Analytics, P&L Reports & AI Forecasting Router
try:
    from routers.analytics import router as analytics_router
except ImportError:
    from backend.routers.analytics import router as analytics_router

app.include_router(analytics_router)


@app.get("/", tags=["General"])
def read_root():
    """
    Root endpoint verifying that the backend server is running.
    """
    return {
        "app": "Tea Shop Management System API",
        "status": "online",
        "version": "1.0.0",
        "docs_url": "/docs",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/health", tags=["Health"])
def health_check():
    """
    Health check endpoint verifying FastAPI and PostgreSQL database connectivity.
    Called by the Next.js frontend to verify end-to-end integration.
    """
    db_status = check_db_connection()
    overall_status = "healthy" if db_status["status"] == "connected" else "degraded"
    
    return {
        "status": overall_status,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/test", tags=["General"])
def test_endpoint():
    """
    Simple verification endpoint for frontend to backend connectivity test.
    """
    return {
        "success": True,
        "message": "Connection established successfully between Next.js and FastAPI!",
        "system": "Tea Shop Management System",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/schema", tags=["Schema"])
def get_schema_summary():
    """
    Returns summary of all created tables, relationships, and rule implementations.
    """
    db_check = check_db_connection()
    return {
        "database": db_check.get("database"),
        "total_tables": db_check.get("table_count", 0),
        "tables": db_check.get("tables", []),
        "features_supported": {
            "rule_61_admin_credit_approval": True,
            "customization_modifiers": ["sugar_level", "tea_strength"],
            "daily_stock_quantity_limits": True,
            "daily_order_token_number": True,
            "financial_precision": "NUMERIC(10, 2)"
        }
    }


# import os
# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# from dotenv import load_dotenv

# load_dotenv()

# app = FastAPI(
#     title="Tea Shop Management API",
#     version="1.0.0",
#     description="Backend API for Tea Shop Management, QR Ordering, and Credit Analytics"
# )

# origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=origins,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/")
# def read_root():
#     return {"message": "Welcome to the Tea Shop API - Phase 1 Operational"}

# @app.get("/api/health")
# def health_check():
#     return {"status": "healthy", "database": "connected"}