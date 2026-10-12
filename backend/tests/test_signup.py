import unittest
import time
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi.testclient import TestClient
from main import app
from config import settings

class TestSignupEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_customer_signup_success(self):
        mobile = f"98{int(time.time()) % 100000000:08d}"
        payload = {
            "full_name": "Test Customer",
            "mobile_number": mobile,
            "email": f"cust_{mobile}@example.com",
            "password": "custpassword123",
            "confirm_password": "custpassword123"
        }
        res = self.client.post("/api/auth/signup/customer", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "CUSTOMER")
        self.assertEqual(data["user"]["mobile_number"], mobile)

    def test_customer_signup_password_mismatch(self):
        mobile = f"97{int(time.time()) % 100000000:08d}"
        payload = {
            "full_name": "Test Customer",
            "mobile_number": mobile,
            "password": "password123",
            "confirm_password": "mismatchpassword"
        }
        res = self.client.post("/api/auth/signup/customer", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("do not match", res.json()["detail"])

    def test_admin_signup_invalid_secret(self):
        mobile = f"96{int(time.time()) % 100000000:08d}"
        payload = {
            "full_name": "Unauthorized Admin",
            "mobile_number": mobile,
            "password": "adminpassword123",
            "confirm_password": "adminpassword123",
            "admin_secret": "WRONG_SECRET_CODE"
        }
        res = self.client.post("/api/auth/signup/admin", json=payload)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Invalid Admin Authorization Secret Key", res.json()["detail"])

    def test_admin_signup_success(self):
        mobile = f"95{int(time.time()) % 100000000:08d}"
        payload = {
            "full_name": "Authorized Admin",
            "mobile_number": mobile,
            "email": f"admin_{mobile}@example.com",
            "password": "adminpassword123",
            "confirm_password": "adminpassword123",
            "shop_name": "Royal Tea Shop",
            "admin_secret": settings.ADMIN_REGISTRATION_SECRET
        }
        res = self.client.post("/api/auth/signup/admin", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "ADMIN")
        self.assertEqual(data["user"]["mobile_number"], mobile)
        self.assertEqual(data["user"]["shop_name"], "Royal Tea Shop")

if __name__ == "__main__":
    unittest.main()
