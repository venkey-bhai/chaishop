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


class TestPhase9ExpensesManagement(unittest.TestCase):
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

        # 3. Register a Customer user to verify permission rejection
        cls.cust_phone = f"91{str(uuid.uuid4().int)[:8]}"[:10]
        cust_reg = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.cust_phone,
            "name": "Expense Test Customer",
            "password": "custpassword123"
        })
        assert cust_reg.status_code == 201, f"Customer registration failed: {cust_reg.text}"
        cls.cust_token = cust_reg.json()["access_token"]
        cls.cust_headers = {"Authorization": f"Bearer {cls.cust_token}"}

    def test_01_admin_can_record_expense(self):
        """Admin can record a new tea shop expense successfully."""
        payload = {
            "category": "Milk",
            "description": "Daily 20L pouch milk purchase from cooperative dairy",
            "amount": 1000.00,
            "payment_method": "CASH"
        }
        res = self.client.post("/api/expenses", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["category"], "Milk")
        self.assertEqual(Decimal(str(data["amount"])), Decimal("1000.00"))
        self.assertEqual(data["payment_method"], "CASH")
        self.assertIn("id", data)

    def test_02_staff_can_record_expense(self):
        """Staff can record an operational expense."""
        payload = {
            "category": "Gas Cylinders",
            "description": "Counter gas cylinder refill paid via UPI",
            "amount": 1950.50,
            "payment_method": "UPI"
        }
        res = self.client.post("/api/expenses", json=payload, headers=self.staff_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["category"], "Gas Cylinders")
        self.assertEqual(Decimal(str(data["amount"])), Decimal("1950.50"))
        self.assertEqual(data["payment_method"], "UPI")

    def test_03_customer_forbidden_from_recording_expense(self):
        """Customer role receives 403 Forbidden when attempting to record an expense."""
        payload = {
            "category": "Tea Powder",
            "description": "Customer trying to tamper expense ledger",
            "amount": 500.00,
            "payment_method": "CASH"
        }
        res = self.client.post("/api/expenses", json=payload, headers=self.cust_headers)
        self.assertEqual(res.status_code, 403)

    def test_04_validation_rejects_zero_or_negative_amount(self):
        """Pydantic validation rejects zero and negative expense amounts with 422."""
        zero_payload = {
            "category": "Sugar",
            "description": "Zero amount outlay",
            "amount": 0.00,
            "payment_method": "CASH"
        }
        res_zero = self.client.post("/api/expenses", json=zero_payload, headers=self.admin_headers)
        self.assertEqual(res_zero.status_code, 422)

        neg_payload = {
            "category": "Sugar",
            "description": "Negative outlay",
            "amount": -150.00,
            "payment_method": "CASH"
        }
        res_neg = self.client.post("/api/expenses", json=neg_payload, headers=self.admin_headers)
        self.assertEqual(res_neg.status_code, 422)

    def test_05_list_expenses_pagination_and_categories(self):
        """List expenses returns items, total count, pagination metadata, and categories endpoint works."""
        # 1. Categories
        cat_res = self.client.get("/api/expenses/categories", headers=self.staff_headers)
        self.assertEqual(cat_res.status_code, 200)
        categories = cat_res.json()
        self.assertIsInstance(categories, list)
        self.assertIn("Milk", categories)

        # 2. List expenses
        res = self.client.get("/api/expenses?page=1&limit=5", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("items", data)
        self.assertIn("total", data)
        self.assertIn("total_amount", data)
        self.assertTrue(len(data["items"]) <= 5)

    def test_06_filter_expenses_by_category_and_search(self):
        """Filtering by category and search term returns accurate subset."""
        # Create unique search target
        unique_mark = f"UniqueSupplier_{uuid.uuid4().hex[:6]}"
        create_res = self.client.post("/api/expenses", json={
            "category": "Special Spices",
            "description": f"Cardamom and Cloves from {unique_mark}",
            "amount": 420.00,
            "payment_method": "UPI"
        }, headers=self.admin_headers)
        self.assertEqual(create_res.status_code, 201)

        # Search by unique keyword
        search_res = self.client.get(f"/api/expenses?search={unique_mark}", headers=self.staff_headers)
        self.assertEqual(search_res.status_code, 200)
        items = search_res.json()["items"]
        self.assertTrue(len(items) >= 1)
        self.assertIn(unique_mark, items[0]["description"])

    def test_07_filter_today_only(self):
        """Filter `today_only=true` correctly filters items to current date."""
        res = self.client.get("/api/expenses?today_only=true", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        today_str = datetime.now(timezone.utc).date().isoformat()
        for item in items:
            self.assertEqual(item["expense_date"], today_str)

    def test_08_expense_analytics_aggregates(self):
        """Analytics endpoint returns today outlay, monthly outlay, category percentages."""
        res = self.client.get("/api/expenses/analytics", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_expenses_today", data)
        self.assertIn("total_expenses_month", data)
        self.assertIn("by_category", data)
        self.assertIn("by_payment_method", data)
        self.assertIn("recent_expenses", data)
        self.assertGreaterEqual(len(data["by_category"]), 1)

    def test_09_update_expense(self):
        """Staff/Admin can update category, description, and amount of an existing expense."""
        # Create an expense
        create_res = self.client.post("/api/expenses", json={
            "category": "Maintenance",
            "description": "Tap leak repair",
            "amount": 250.00,
            "payment_method": "CASH"
        }, headers=self.admin_headers)
        expense_id = create_res.json()["id"]

        # Update it
        update_res = self.client.put(f"/api/expenses/{expense_id}", json={
            "description": "Tap leak repair + new Teflon tape & washer",
            "amount": 350.00
        }, headers=self.staff_headers)
        self.assertEqual(update_res.status_code, 200)
        updated = update_res.json()
        self.assertEqual(Decimal(str(updated["amount"])), Decimal("350.00"))
        self.assertIn("Teflon tape", updated["description"])

    def test_10_staff_cannot_delete_expense_admin_can_delete(self):
        """Staff gets 403 Forbidden on DELETE, but Admin successfully deletes expense."""
        # Create an expense to delete
        create_res = self.client.post("/api/expenses", json={
            "category": "Other",
            "description": "Temporary accidental charge to test deletion",
            "amount": 100.00,
            "payment_method": "CASH"
        }, headers=self.admin_headers)
        expense_id = create_res.json()["id"]

        # Staff tries to delete -> 403
        del_staff = self.client.delete(f"/api/expenses/{expense_id}", headers=self.staff_headers)
        self.assertEqual(del_staff.status_code, 403)

        # Admin deletes -> 200
        del_admin = self.client.delete(f"/api/expenses/{expense_id}", headers=self.admin_headers)
        self.assertEqual(del_admin.status_code, 200)

        # Verify not found after deletion
        get_res = self.client.get(f"/api/expenses/{expense_id}", headers=self.admin_headers)
        self.assertEqual(get_res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
