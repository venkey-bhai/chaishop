import os
import sys
import unittest
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal

# Ensure backend root is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi.testclient import TestClient
from main import app


class TestPhase10AnalyticsAndReports(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

        # 1. Login as Admin
        admin_res = cls.client.post("/api/auth/login", json={
            "mobile_number": "9999999999",
            "password": "admin123"
        })
        assert admin_res.status_code == 200, f"Admin login failed: {admin_res.text}"
        cls.admin_token = admin_res.json()["access_token"]
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}

        # 2. Login as Staff
        staff_res = cls.client.post("/api/auth/login", json={
            "mobile_number": "8888888888",
            "password": "staff123"
        })
        assert staff_res.status_code == 200, f"Staff login failed: {staff_res.text}"
        cls.staff_token = staff_res.json()["access_token"]
        cls.staff_headers = {"Authorization": f"Bearer {cls.staff_token}"}

        # 3. Register Customer
        cls.cust_phone = f"90{str(uuid.uuid4().int)[:8]}"[:10]
        cust_reg = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.cust_phone,
            "name": "Analytics Customer",
            "password": "custpassword123"
        })
        assert cust_reg.status_code == 201, f"Customer registration failed: {cust_reg.text}"
        cls.cust_token = cust_reg.json()["access_token"]
        cls.cust_headers = {"Authorization": f"Bearer {cls.cust_token}"}

    def test_01_admin_can_access_dashboard_summary(self):
        """Admin can access executive dashboard KPIs (Section 22)."""
        res = self.client.get("/api/reports/summary", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("today_sales", data)
        self.assertIn("today_orders", data)
        self.assertIn("today_expenses", data)
        self.assertIn("today_profit", data)
        self.assertIn("credit_sales_today", data)
        self.assertIn("total_outstanding_credit", data)
        self.assertIn("total_customers", data)
        self.assertIn("cash_inflow_today", data)
        self.assertIn("profit_margin_pct", data)

    def test_02_staff_can_access_dashboard_summary(self):
        """Counter staff can access dashboard summary."""
        res = self.client.get("/api/reports/summary", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)

    def test_03_customer_forbidden_from_dashboard_summary(self):
        """Customer role receives 403 Forbidden when trying to access executive reports."""
        res = self.client.get("/api/reports/summary", headers=self.cust_headers)
        self.assertEqual(res.status_code, 403)

    def test_04_daily_pnl_report(self):
        """Daily P&L statement calculates sales, expenses, cash vs credit collections, and hourly distribution."""
        res = self.client.get("/api/reports/daily", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_orders", data)
        self.assertIn("total_sales", data)
        self.assertIn("cash_collected", data)
        self.assertIn("upi_collected", data)
        self.assertIn("credit_sales", data)
        self.assertIn("total_actual_inflow", data)
        self.assertIn("total_expenses", data)
        self.assertIn("net_profit", data)
        self.assertIn("gross_margin_percentage", data)
        self.assertIn("hourly_distribution", data)
        self.assertTrue(len(data["hourly_distribution"]) > 0)

    def test_05_daily_pnl_with_custom_date(self):
        """Daily report handles custom report_date query parameter."""
        custom_date = "2026-10-06"
        res = self.client.get(f"/api/reports/daily?report_date={custom_date}", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["report_date"], custom_date)

    def test_06_monthly_report_trendlines(self):
        """Monthly report returns aggregated financial totals and day-by-day trendline."""
        res = self.client.get("/api/reports/monthly", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("year", data)
        self.assertIn("month", data)
        self.assertIn("month_name", data)
        self.assertIn("total_sales", data)
        self.assertIn("total_expenses", data)
        self.assertIn("net_profit", data)
        self.assertIn("profit_margin_pct", data)
        self.assertIn("daily_trend", data)
        self.assertIsInstance(data["daily_trend"], list)

    def test_07_product_performance_report(self):
        """Product sales performance report returns ranked menu items with quantities and revenues."""
        res = self.client.get("/api/reports/products", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_products_sold", data)
        self.assertIn("total_menu_items_tracked", data)
        self.assertIn("top_performers", data)
        self.assertIsInstance(data["top_performers"], list)

    def test_08_credit_exposure_and_risk(self):
        """Credit report calculates total limits, debt exposure, and customer risk categorization."""
        res = self.client.get("/api/reports/credit", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_credit_eligible_customers", data)
        self.assertIn("total_approved_limit", data)
        self.assertIn("total_outstanding_debt", data)
        self.assertIn("total_available_credit", data)
        self.assertIn("customer_debts", data)
        self.assertIn("average_utilization_pct", data)

    def test_09_ai_sales_and_demand_forecast(self):
        """AI forecasting engine returns 7-day projected sales points and raw material requirements."""
        res = self.client.get("/api/reports/forecast", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("forecast_model", data)
        self.assertIn("average_daily_sales", data)
        self.assertIn("seven_day_forecast", data)
        self.assertEqual(len(data["seven_day_forecast"]), 7)
        self.assertIn("total_projected_weekly_revenue", data)
        self.assertIn("raw_material_demand", data)

        materials = [m["material_name"] for m in data["raw_material_demand"]]
        self.assertTrue(any("Milk" in m for m in materials))
        self.assertTrue(any("Tea Powder" in m for m in materials))
        self.assertTrue(any("Sugar" in m for m in materials))

    def test_10_unauthenticated_request_rejected(self):
        """Request without authentication token is rejected with 401 Unauthorized."""
        res = self.client.get("/api/reports/summary")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
