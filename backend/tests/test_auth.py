import os
import sys
import unittest
import uuid

# Ensure backend root is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi.testclient import TestClient
from main import app
from database.connection import SessionLocal
from models.user import User
from models.customer import Customer
from models.credit import CreditAccount

class TestPhase3Authentication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Unique test phone numbers to avoid conflicts with existing DB records
        unique_suffix = str(uuid.uuid4().int)[:8]
        cls.test_phone = f"98{unique_suffix}"[:10]
        cls.test_password = "SecurePassword123!"
        cls.test_name = "Ravi Kumar"
        cls.test_email = f"ravi_{unique_suffix}@example.com"

    def test_01_customer_registration(self):
        """Test customer registration creates user, customer profile, and returns JWT."""
        payload = {
            "mobile_number": self.test_phone,
            "name": self.test_name,
            "password": self.test_password,
            "email": self.test_email,
        }
        response = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()

        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertIn("user", data)
        self.assertEqual(data["user"]["mobile_number"], self.test_phone)
        self.assertEqual(data["user"]["name"], self.test_name)
        self.assertEqual(data["user"]["role"], "CUSTOMER")
        self.assertIsNotNone(data["user"]["customer_id"])
        self.assertFalse(data["user"]["is_credit_eligible"])

        # Store token for later tests
        self.__class__.customer_token = data["access_token"]

        # Verify database consistency
        db = SessionLocal()
        try:
            created_user = db.query(User).filter(User.mobile_number == self.test_phone).first()
            self.assertIsNotNone(created_user)
            self.assertEqual(created_user.role.value, "CUSTOMER")

            # Check customer table record
            customer = db.query(Customer).filter(Customer.user_id == created_user.id).first()
            self.assertIsNotNone(customer)
            self.assertEqual(customer.phone, self.test_phone)

            # Check linked credit account
            credit_acc = db.query(CreditAccount).filter(CreditAccount.customer_id == customer.id).first()
            self.assertIsNotNone(credit_acc)
            self.assertEqual(float(credit_acc.current_balance), 0.0)
        finally:
            db.close()

    def test_02_duplicate_registration_rejected(self):
        """Duplicate mobile number registration should be rejected with 400 Bad Request."""
        payload = {
            "mobile_number": self.test_phone,
            "name": "Another Name",
            "password": "anotherpassword",
        }
        response = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("already registered", response.json()["detail"])

    def test_03_invalid_inputs_rejected(self):
        """Input validation tests for short passwords and invalid phone numbers."""
        # Short password (< 6 chars)
        res_short_pwd = self.client.post("/api/auth/register", json={
            "mobile_number": "9123456789",
            "name": "Test Short",
            "password": "123",
        })
        self.assertEqual(res_short_pwd.status_code, 422)

        # Invalid phone format
        res_bad_phone = self.client.post("/api/auth/register", json={
            "mobile_number": "123abc45",
            "name": "Test Phone",
            "password": "password123",
        })
        self.assertEqual(res_bad_phone.status_code, 422)

    def test_04_customer_login_success(self):
        """Valid customer login returns JWT token and user profile."""
        payload = {
            "mobile_number": self.test_phone,
            "password": self.test_password,
        }
        response = self.client.post("/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["mobile_number"], self.test_phone)

    def test_05_customer_login_wrong_password(self):
        """Login with incorrect password should be rejected with 401 Unauthorized."""
        payload = {
            "mobile_number": self.test_phone,
            "password": "WrongPassword999!",
        }
        response = self.client.post("/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid mobile number or password", response.json()["detail"])

    def test_06_admin_login(self):
        """Login as the seeded Admin user and verify admin role."""
        payload = {
            "mobile_number": "9999999999",
            "password": "admin123",
        }
        response = self.client.post("/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["user"]["role"], "ADMIN")
        self.__class__.admin_token = data["access_token"]

    def test_07_get_current_user_profile(self):
        """Protected /api/auth/me endpoint returns decoded user profile."""
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["mobile_number"], self.test_phone)
        self.assertEqual(data["name"], self.test_name)
        self.assertEqual(data["role"], "CUSTOMER")

    def test_08_unauthenticated_request_rejected(self):
        """Request without Bearer header should be rejected with 401."""
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_09_role_based_access_control(self):
        """Role guard tests: Customer accessing admin endpoint gets 403 Forbidden."""
        # 1. Customer token trying to access admin endpoint -> 403 Forbidden
        cust_headers = {"Authorization": f"Bearer {self.customer_token}"}
        res_admin_check = self.client.get("/api/auth/admin-check", headers=cust_headers)
        self.assertEqual(res_admin_check.status_code, 403)

        # 2. Admin token accessing admin endpoint -> 200 OK
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        res_admin_success = self.client.get("/api/auth/admin-check", headers=admin_headers)
        self.assertEqual(res_admin_success.status_code, 200)
        self.assertEqual(res_admin_success.json()["role"], "ADMIN")

        # 3. Customer accessing customer endpoint -> 200 OK
        res_cust_success = self.client.get("/api/auth/customer-check", headers=cust_headers)
        self.assertEqual(res_cust_success.status_code, 200)

    def test_10_logout_endpoint(self):
        """Stateless logout acknowledges request."""
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
