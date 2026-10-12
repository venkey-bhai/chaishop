import os
import sys
import unittest
import uuid
from decimal import Decimal

# Ensure backend root is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi.testclient import TestClient
from main import app
from database.connection import SessionLocal
from models.user import User, UserRole
from models.customer import Customer
from models.credit import CreditAccount


class TestPhase4CustomerManagement(unittest.TestCase):
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

        # 3. Register Customer A
        phone_suffix_a = str(uuid.uuid4().int)[:8]
        cls.cust_a_phone = f"97{phone_suffix_a}"[:10]
        reg_a = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.cust_a_phone,
            "name": "Customer Alice",
            "password": "AlicePassword123!",
            "email": f"alice_{phone_suffix_a}@example.com"
        })
        assert reg_a.status_code == 201, f"Cust A reg failed: {reg_a.text}"
        cls.cust_a_token = reg_a.json()["access_token"]
        cls.cust_a_headers = {"Authorization": f"Bearer {cls.cust_a_token}"}
        cls.cust_a_id = reg_a.json()["user"]["customer_id"]

        # 4. Register Customer B
        phone_suffix_b = str(uuid.uuid4().int)[:8]
        cls.cust_b_phone = f"96{phone_suffix_b}"[:10]
        reg_b = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.cust_b_phone,
            "name": "Customer Bob",
            "password": "BobPassword123!",
            "email": f"bob_{phone_suffix_b}@example.com"
        })
        assert reg_b.status_code == 201, f"Cust B reg failed: {reg_b.text}"
        cls.cust_b_token = reg_b.json()["access_token"]
        cls.cust_b_headers = {"Authorization": f"Bearer {cls.cust_b_token}"}
        cls.cust_b_id = reg_b.json()["user"]["customer_id"]

    def test_01_admin_list_customers(self):
        """Admin can list customers with pagination and filtering."""
        res = self.client.get("/api/customers?page=1&limit=10", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertIn("items", data)
        self.assertIn("total", data)
        self.assertGreaterEqual(data["total"], 2)
        self.assertGreaterEqual(len(data["items"]), 2)

    def test_02_customer_cannot_list_all_customers(self):
        """Standard customer receives 403 Forbidden when trying to list all customers."""
        res = self.client.get("/api/customers", headers=self.cust_a_headers)
        self.assertEqual(res.status_code, 403)

    def test_03_customer_search_autocomplete(self):
        """Staff/Admin can quickly search customers by phone prefix."""
        res = self.client.get(f"/api/customers/search?phone={self.cust_a_phone[:6]}", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200, res.text)
        items = res.json()
        self.assertIsInstance(items, list)
        self.assertTrue(any(c["phone"] == self.cust_a_phone for c in items))

    def test_04_get_my_customer_profile(self):
        """Customer can retrieve their own profile via /me/profile."""
        res = self.client.get("/api/customers/me/profile", headers=self.cust_a_headers)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["id"], self.cust_a_id)
        self.assertEqual(data["name"], "Customer Alice")
        self.assertFalse(data["is_credit_eligible"])

    def test_05_customer_ownership_access_guard(self):
        """Customer Alice can view her own ID, but viewing Bob's ID is rejected (403)."""
        # Alice viewing Alice -> 200
        res_own = self.client.get(f"/api/customers/{self.cust_a_id}", headers=self.cust_a_headers)
        self.assertEqual(res_own.status_code, 200)

        # Alice viewing Bob -> 403 Forbidden
        res_other = self.client.get(f"/api/customers/{self.cust_b_id}", headers=self.cust_a_headers)
        self.assertEqual(res_other.status_code, 403)

        # Admin viewing Bob -> 200 OK
        res_admin = self.client.get(f"/api/customers/{self.cust_b_id}", headers=self.admin_headers)
        self.assertEqual(res_admin.status_code, 200)

    def test_06_customer_update_profile(self):
        """Customer updates their own name, verified in database."""
        res = self.client.put(
            f"/api/customers/{self.cust_a_id}",
            json={"name": "Alice Wonderland"},
            headers=self.cust_a_headers
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "Alice Wonderland")

    def test_07_rule_61_non_admin_cannot_alter_credit(self):
        """Rule 61: Standard customers or staff cannot toggle credit status (403 Forbidden)."""
        payload = {"is_credit_eligible": True, "credit_limit": 500.0}

        # Customer attempting to grant self credit -> 403
        res_cust = self.client.patch(f"/api/customers/{self.cust_a_id}/credit-status", json=payload, headers=self.cust_a_headers)
        self.assertEqual(res_cust.status_code, 403)

        # Staff attempting to grant credit -> 403
        res_staff = self.client.patch(f"/api/customers/{self.cust_a_id}/credit-status", json=payload, headers=self.staff_headers)
        self.assertEqual(res_staff.status_code, 403)

    def test_08_rule_61_admin_approves_credit(self):
        """Rule 61: Shop Admin enables credit for Alice and sets ₹500 limit."""
        payload = {"is_credit_eligible": True, "credit_limit": 500.0}
        res = self.client.patch(
            f"/api/customers/{self.cust_a_id}/credit-status",
            json=payload,
            headers=self.admin_headers
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["is_credit_eligible"])
        self.assertEqual(float(data["credit_limit"]), 500.0)
        self.assertEqual(float(data["available_credit"]), 500.0)

        # Verify CreditAccount table in DB
        db = SessionLocal()
        try:
            account = db.query(CreditAccount).filter(CreditAccount.customer_id == self.cust_a_id).first()
            self.assertIsNotNone(account)
            self.assertTrue(account.is_active)
            self.assertEqual(float(account.credit_limit), 500.0)
        finally:
            db.close()

    def test_09_admin_creates_walkin_customer(self):
        """Admin registers a counter walk-in customer with immediate credit approval."""
        walkin_phone = f"95{str(uuid.uuid4().int)[:8]}"[:10]
        payload = {
            "name": "Walk-in Regular",
            "phone": walkin_phone,
            "email": "walkin@example.com",
            "is_credit_eligible": True,
            "credit_limit": 300.0
        }
        res = self.client.post("/api/customers", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        self.assertEqual(data["name"], "Walk-in Regular")
        self.assertTrue(data["is_credit_eligible"])
        self.assertEqual(float(data["credit_limit"]), 300.0)

    def test_10_staff_cannot_create_credit_customer(self):
        """Staff cannot grant credit when registering a walk-in customer (Rule 61 violation)."""
        walkin_phone = f"94{str(uuid.uuid4().int)[:8]}"[:10]
        payload = {
            "name": "Unauthorized Credit Customer",
            "phone": walkin_phone,
            "is_credit_eligible": True,
            "credit_limit": 1000.0
        }
        res = self.client.post("/api/customers", json=payload, headers=self.staff_headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Rule 61", res.json()["detail"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
