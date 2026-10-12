from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


# =============================================================
# Executive Dashboard KPI Schemas (Section 22)
# =============================================================

class DashboardSummaryResponse(BaseModel):
    """
    Executive dashboard top-line KPIs (Section 22).
    """
    report_date: date
    today_sales: Decimal = Field(..., description="Total sales from orders today")
    today_orders: int = Field(..., description="Total orders placed today")
    today_expenses: Decimal = Field(..., description="Total operating outlays today")
    today_profit: Decimal = Field(..., description="Net operational profit (Sales - Expenses)")
    credit_sales_today: Decimal = Field(..., description="Orders placed on credit today")
    total_outstanding_credit: Decimal = Field(..., description="Accumulated customer debt balance")
    total_customers: int = Field(..., description="Total registered customer accounts")
    profit_margin_pct: float = Field(..., description="Net margin percentage")
    cash_inflow_today: Decimal = Field(..., description="Actual cash + UPI received today")


# =============================================================
# Daily P&L Report Schemas (Section 21, 24, 25)
# =============================================================

class HourlySalesPoint(BaseModel):
    hour: int
    label: str
    order_count: int
    sales_amount: Decimal


class DailyReportResponse(BaseModel):
    """
    Comprehensive Daily Profit & Loss and Cash Flow Statement (Section 21, 24).
    """
    report_date: date
    total_orders: int
    completed_orders: int
    cancelled_orders: int
    
    # Revenue Breakdown
    total_sales: Decimal
    average_order_value: Decimal
    
    # Payment Collections (Section 21: Actual cashflow vs credit)
    cash_collected: Decimal
    upi_collected: Decimal
    card_collected: Decimal
    credit_sales: Decimal
    credit_repayments: Decimal
    total_actual_inflow: Decimal
    
    # Outlays & Bottom Line
    total_expenses: Decimal
    net_profit: Decimal
    gross_margin_percentage: float
    
    # Hourly traffic distribution
    hourly_distribution: List[HourlySalesPoint]
    
    # Top sold items today
    top_items_today: List[Dict[str, object]]


# =============================================================
# Monthly Report Schemas
# =============================================================

class DailyTrendPoint(BaseModel):
    date: date
    sales: Decimal
    expenses: Decimal
    net_profit: Decimal
    order_count: int


class MonthlyReportResponse(BaseModel):
    """
    Calendar month performance report with daily trendline series.
    """
    year: int
    month: int
    month_name: str
    total_sales: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    profit_margin_pct: float
    total_orders: int
    daily_trend: List[DailyTrendPoint]
    payment_methods: Dict[str, Decimal]


# =============================================================
# Product Performance Schemas
# =============================================================

class ProductPerformanceItem(BaseModel):
    item_id: Optional[int] = None
    name: str
    category_name: str
    price: Decimal
    quantity_sold: int
    total_revenue: Decimal
    revenue_percentage: float


class ProductReportResponse(BaseModel):
    total_products_sold: int
    total_menu_items_tracked: int
    top_performers: List[ProductPerformanceItem]


# =============================================================
# Credit Exposure & Risk Schemas (Section 19, 24)
# =============================================================

class CustomerCreditRiskItem(BaseModel):
    customer_id: int
    customer_name: str
    mobile_number: str
    credit_limit: Decimal
    current_balance: Decimal
    available_credit: Decimal
    utilization_percentage: float
    is_high_risk: bool


class CreditReportResponse(BaseModel):
    total_credit_eligible_customers: int
    total_approved_limit: Decimal
    total_outstanding_debt: Decimal
    total_available_credit: Decimal
    average_utilization_pct: float
    high_risk_customers_count: int
    customer_debts: List[CustomerCreditRiskItem]


# =============================================================
# AI / Statistical Sales & Demand Forecasting Schemas (Phase 15)
# =============================================================

class SalesForecastPoint(BaseModel):
    date: date
    day_name: str
    predicted_sales: Decimal
    confidence_lower: Decimal
    confidence_upper: Decimal
    predicted_cups: int


class RawMaterialRequirement(BaseModel):
    material_name: str
    unit: str
    estimated_daily_need: float
    estimated_weekly_need: float
    reorder_recommended: bool


class ForecastResponse(BaseModel):
    forecast_model: str
    historical_days_analyzed: int
    average_daily_sales: Decimal
    predicted_growth_rate_pct: float
    seven_day_forecast: List[SalesForecastPoint]
    total_projected_weekly_revenue: Decimal
    raw_material_demand: List[RawMaterialRequirement]
    forecast_generated_at: datetime
