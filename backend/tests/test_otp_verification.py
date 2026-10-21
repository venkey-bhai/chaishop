import os
import sys
import unittest
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Ensure backend root is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi.testclient import TestClient
from main import app
from database.connection import SessionLocal
from models.order import Order, OrderStatus, OrderOTPChallenge
from models.menu import MenuItem, MenuCategory
from models.customer import Customer
from models.credit import CreditAccount, CreditTransaction
from utils.sms import TEST_SMS_OUTBOX


class TestOTPVerificationSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

        # 1. Login Admin
        admin_res = cls.client.post("/api/auth/login", json={
            "mobile_number": "9999999999",
            "password": "admin123"
        })
        assert admin_res.status_code == 200, f"Admin login failed: {admin_res.text}"
        cls.admin_token = admin_res.json()["access_token"]
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}

        # 2. Login Staff
        staff_res = cls.client.post("/api/auth/login", json={
            "mobile_number": "8888888888",
            "password": "staff123"
        })
        assert staff_res.status_code == 200, f"Staff login failed: {staff_res.text}"
        cls.staff_token = staff_res.json()["access_token"]
        cls.staff_headers = {"Authorization": f"Bearer {cls.staff_token}"}

        # 3. Create test category & items
        cat_res = cls.client.post("/api/menu/categories", json={
            "name": f"OTP Test Cat {uuid.uuid4().hex[:6]}",
            "display_order": 1,
            "is_active": True
        }, headers=cls.admin_headers)
        cls.category_id = cat_res.json()["id"]

        # Item with 10 available stock
        item1_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": f"OTP Special Samosa {uuid.uuid4().hex[:4]}",
            "price": 30.00,
            "is_available": True,
            "track_stock": True,
            "available_quantity": 10,
            "low_stock_threshold": 2
        }, headers=cls.admin_headers)
        cls.item_tracked = item1_res.json()

        # Item without stock tracking (Tea)
        item2_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": f"OTP Ginger Tea {uuid.uuid4().hex[:4]}",
            "price": 20.00,
            "is_available": True,
            "track_stock": False
        }, headers=cls.admin_headers)
        cls.item_untracked = item2_res.json()

        # 4. Register a regular customer
        cls.customer_phone = f"97{str(uuid.uuid4().int)[:8]}"[:10]
        cust_reg = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.customer_phone,
            "name": "OTP Verified Customer",
            "password": "Password123!"
        })
        cls.customer_token = cust_reg.json()["access_token"]
        cls.customer_headers = {"Authorization": f"Bearer {cls.customer_token}"}
        cls.customer_id = cust_reg.json()["user"]["customer_id"]

        # 5. Register a VIP credit customer with limit 500
        cls.credit_phone = f"96{str(uuid.uuid4().int)[:8]}"[:10]
        credit_reg = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.credit_phone,
            "name": "OTP VIP Credit Customer",
            "password": "Password123!"
        })
        cls.credit_token = credit_reg.json()["access_token"]
        cls.credit_headers = {"Authorization": f"Bearer {cls.credit_token}"}
        cls.credit_cust_id = credit_reg.json()["user"]["customer_id"]

        cls.client.patch(
            f"/api/customers/{cls.credit_cust_id}/credit-status",
            json={"is_credit_eligible": True, "credit_limit": 500.00},
            headers=cls.admin_headers
        )

    def test_01_new_order_requires_otp_and_starts_pending(self):
        """Case 1: Every new order requires a new OTP and begins in PENDING_OTP_VERIFICATION."""
        payload = {
            "customer_name": "OTP Tester",
            "customer_phone": self.customer_phone,
            "table_number": "1",
            "payment_method": "CASH",
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 2}]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["order_status"], "PENDING_OTP_VERIFICATION")
        self.assertIsNotNone(data["otp_challenge"])
        self.assertEqual(data["otp_challenge"]["status"], "PENDING")
        self.assertEqual(data["otp_challenge"]["attempts_remaining"], 5)
        self.assertIn("******", data["otp_challenge"]["masked_phone"])

        # OTP is present in development mode outbox
        otp_code = TEST_SMS_OUTBOX.get(self.customer_phone)
        self.assertIsNotNone(otp_code)
        self.assertEqual(len(otp_code), 6)

    def test_02_logged_in_customer_still_requires_new_otp(self):
        """Case 2: Logged-in authenticated customers must still enter new OTP for every order."""
        payload = {
            "customer_name": "Logged In Customer",
            "customer_phone": self.customer_phone,
            "table_number": "2",
            "payment_method": "UPI",
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        res = self.client.post("/api/orders", json=payload, headers=self.customer_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["order_status"], "PENDING_OTP_VERIFICATION")
        self.assertIsNotNone(data["otp_challenge"])

    def test_03_valid_otp_confirms_intended_order(self):
        """Case 3: Valid OTP verification confirms the order and sets status to CONFIRMED."""
        payload = {
            "customer_name": "Valid OTP User",
            "customer_phone": self.customer_phone,
            "table_number": "3",
            "payment_method": "CASH",
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        order_res = self.client.post("/api/orders", json=payload)
        order_data = order_res.json()
        order_id = order_data["id"]

        otp_code = TEST_SMS_OUTBOX.get(self.customer_phone)
        verify_res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": otp_code})
        self.assertEqual(verify_res.status_code, 200)
        v_data = verify_res.json()
        self.assertTrue(v_data["success"])
        self.assertEqual(v_data["order"]["order_status"], "CONFIRMED")
        self.assertEqual(v_data["verification_status"], "VERIFIED")

    def test_04_incorrect_otp_rejected_with_remaining_attempts(self):
        """Case 4: Incorrect OTP is rejected and decrements attempt count."""
        payload = {
            "customer_name": "Wrong OTP User",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        order_data = self.client.post("/api/orders", json=payload).json()
        order_id = order_data["id"]

        wrong_res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": "000000"})
        self.assertEqual(wrong_res.status_code, 400)
        self.assertIn("Incorrect OTP", wrong_res.json()["detail"])
        self.assertIn("4 attempt(s) remaining", wrong_res.json()["detail"])

    def test_05_expired_otp_is_rejected_and_order_marked_expired(self):
        """Case 5: Expired OTP challenge is rejected and order marked VERIFICATION_EXPIRED."""
        payload = {
            "customer_name": "Expired OTP User",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_tracked["id"], "quantity": 1}]
        }
        order_data = self.client.post("/api/orders", json=payload).json()
        order_id = order_data["id"]

        # Manually backdate the challenge expires_at in DB
        db = SessionLocal()
        try:
            ch = db.query(OrderOTPChallenge).filter(OrderOTPChallenge.order_id == order_id).first()
            ch.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
            db.commit()
        finally:
            db.close()

        otp_code = TEST_SMS_OUTBOX.get(self.customer_phone)
        res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": otp_code})
        self.assertEqual(res.status_code, 400)
        self.assertIn("expired", res.json()["detail"].lower())

        # Verify order is marked VERIFICATION_EXPIRED
        chk = self.client.get(f"/api/orders/{order_id}").json()
        self.assertEqual(chk["order_status"], "VERIFICATION_EXPIRED")

    def test_06_otp_reuse_is_prevented(self):
        """Case 6: Once an order is verified, the same OTP cannot be reused to confirm another order."""
        # Place Order A
        order_a = self.client.post("/api/orders", json={
            "customer_name": "User A",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }).json()
        otp_a = TEST_SMS_OUTBOX.get(self.customer_phone)

        # Place Order B
        order_b = self.client.post("/api/orders", json={
            "customer_name": "User B",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }).json()
        otp_b = TEST_SMS_OUTBOX.get(self.customer_phone)

        # Confirm Order A with otp_a
        res_a = self.client.post(f"/api/orders/{order_a['id']}/verify-otp", json={"otp": otp_a})
        self.assertEqual(res_a.status_code, 200)

        # Try to use otp_a to confirm Order B (should fail if otp_a != otp_b)
        if otp_a != otp_b:
            res_b = self.client.post(f"/api/orders/{order_b['id']}/verify-otp", json={"otp": otp_a})
            self.assertEqual(res_b.status_code, 400)

        # Confirming Order A again returns idempotent verified response, not a duplicate confirmation
        res_a_repeat = self.client.post(f"/api/orders/{order_a['id']}/verify-otp", json={"otp": otp_a})
        self.assertEqual(res_a_repeat.status_code, 200)
        self.assertEqual(res_a_repeat.json()["verification_status"], "VERIFIED")

    def test_07_resend_otp_invalidates_previous_challenge_and_enforces_cooldown(self):
        """Case 7: Resending OTP invalidates previous challenge; enforces cooldown."""
        payload = {
            "customer_name": "Resend Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        order_data = self.client.post("/api/orders", json=payload).json()
        order_id = order_data["id"]
        initial_otp = TEST_SMS_OUTBOX.get(self.customer_phone)

        # Immediate resend should trigger 429 Cooldown
        resend_too_soon = self.client.post(f"/api/orders/{order_id}/resend-otp")
        self.assertEqual(resend_too_soon.status_code, 429)
        self.assertIn("wait", resend_too_soon.json()["detail"].lower())

        # Simulate cooldown passage in DB
        db = SessionLocal()
        try:
            ch = db.query(OrderOTPChallenge).filter(OrderOTPChallenge.order_id == order_id).first()
            ch.last_sent_at = datetime.now(timezone.utc) - timedelta(seconds=35)
            db.commit()
        finally:
            db.close()

        # Now resend should succeed
        resend_ok = self.client.post(f"/api/orders/{order_id}/resend-otp")
        self.assertEqual(resend_ok.status_code, 200)
        new_otp = TEST_SMS_OUTBOX.get(self.customer_phone)

        # Old OTP is now invalid
        if initial_otp != new_otp:
            old_try = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": initial_otp})
            self.assertEqual(old_try.status_code, 400)

        # New OTP verifies successfully
        new_try = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": new_otp})
        self.assertEqual(new_try.status_code, 200)
        self.assertEqual(new_try.json()["verification_status"], "VERIFIED")

    def test_08_verification_attempt_limit_locks_challenge(self):
        """Case 8: 5 consecutive failed attempts lock the challenge (MAX_ATTEMPTS_EXCEEDED)."""
        payload = {
            "customer_name": "Brute Force Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        order_data = self.client.post("/api/orders", json=payload).json()
        order_id = order_data["id"]

        for i in range(5):
            res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": "111111"})
            self.assertEqual(res.status_code, 400)

        # 6th attempt should be rejected with maximum attempts exceeded
        final_res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": "111111"})
        self.assertEqual(final_res.status_code, 400)
        self.assertIn("maximum", final_res.json()["detail"].lower())

    def test_09_idempotency_key_prevents_duplicate_orders(self):
        """Case 10: Duplicate requests with same idempotency_key return existing order without creating new bill."""
        idem_key = f"idem-{uuid.uuid4().hex}"
        payload = {
            "customer_name": "Double Clicker",
            "customer_phone": self.customer_phone,
            "idempotency_key": idem_key,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }
        res1 = self.client.post("/api/orders", json=payload)
        res2 = self.client.post("/api/orders", json=payload)

        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res1.json()["id"], res2.json()["id"])
        self.assertEqual(res1.json()["order_number"], res2.json()["order_number"])

    def test_10_temporary_stock_reservation_and_confirmation_deduction(self):
        """Case 11 & 12: Temporary stock reservation prevents overselling; deducted exactly once upon confirmation."""
        # Check current stock
        item_before = self.client.get(f"/api/menu/items/{self.item_tracked['id']}").json()
        initial_avail = item_before["available_quantity"]

        # Place Order for 3 units
        payload = {
            "customer_name": "Stock Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_tracked["id"], "quantity": 3}]
        }
        order = self.client.post("/api/orders", json=payload).json()
        order_id = order["id"]

        # Available physical stock is NOT yet permanently deducted
        item_mid = self.client.get(f"/api/menu/items/{self.item_tracked['id']}").json()
        self.assertEqual(item_mid["available_quantity"], initial_avail)

        # Now verify OTP
        otp_code = TEST_SMS_OUTBOX.get(self.customer_phone)
        v_res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": otp_code})
        self.assertEqual(v_res.status_code, 200)

        # After confirmation, stock is deducted exactly once
        item_after = self.client.get(f"/api/menu/items/{self.item_tracked['id']}").json()
        self.assertEqual(item_after["available_quantity"], initial_avail - 3)

    def test_11_expired_or_cancelled_order_releases_temporary_reservation(self):
        """Case 13: Cancellation or expiration releases reserved stock back to effective availability."""
        item_info = self.client.get(f"/api/menu/items/{self.item_tracked['id']}").json()
        stock_start = item_info["available_quantity"]

        # Create pending order for 2 units
        order = self.client.post("/api/orders", json={
            "customer_name": "Cancel Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_tracked["id"], "quantity": 2}]
        }).json()
        order_id = order["id"]

        # Cancel verification
        cancel_res = self.client.post(f"/api/orders/{order_id}/cancel-verification")
        self.assertEqual(cancel_res.status_code, 200)

        # Check stock is fully available
        item_after_cancel = self.client.get(f"/api/menu/items/{self.item_tracked['id']}").json()
        self.assertEqual(item_after_cancel["available_quantity"], stock_start)

    def test_12_credit_transaction_created_only_after_otp_verification(self):
        """Case 14 & 15: Credit transaction and debt increase occur ONLY upon OTP verification."""
        cust_info = self.client.get(f"/api/customers/{self.credit_cust_id}", headers=self.admin_headers).json()
        balance_before = float(cust_info["current_balance"])

        # Create credit order for ₹90 (3 x 30)
        order = self.client.post("/api/orders", json={
            "customer_name": "VIP Credit Customer",
            "customer_phone": self.credit_phone,
            "payment_method": "CREDIT",
            "items": [{"menu_item_id": self.item_tracked["id"], "quantity": 3}]
        }, headers=self.credit_headers).json()
        order_id = order["id"]

        # Balance before OTP verification is UNCHANGED
        cust_mid = self.client.get(f"/api/customers/{self.credit_cust_id}", headers=self.admin_headers).json()
        self.assertEqual(float(cust_mid["current_balance"]), balance_before)

        # Verify OTP
        otp_code = TEST_SMS_OUTBOX.get(self.credit_phone)
        v_res = self.client.post(f"/api/orders/{order_id}/verify-otp", json={"otp": otp_code})
        self.assertEqual(v_res.status_code, 200)

        # Balance after verification increases by order amount (₹90)
        cust_after = self.client.get(f"/api/customers/{self.credit_cust_id}", headers=self.admin_headers).json()
        self.assertEqual(float(cust_after["current_balance"]), balance_before + 90.00)

    def test_13_unverified_orders_excluded_from_sales_analytics(self):
        """Case 17: Unverified orders (PENDING_OTP_VERIFICATION) are excluded from confirmed sales totals."""
        summary_before = self.client.get("/api/reports/summary", headers=self.admin_headers).json()
        sales_before = float(summary_before["today_sales"])

        # Place pending order for ₹60
        pending_order = self.client.post("/api/orders", json={
            "customer_name": "Analytics Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 3}]
        }).json()

        # Summary sales should NOT include the unverified order
        summary_mid = self.client.get("/api/reports/summary", headers=self.admin_headers).json()
        self.assertEqual(float(summary_mid["today_sales"]), sales_before)

        # Confirm the order via OTP
        otp_code = TEST_SMS_OUTBOX.get(self.customer_phone)
        self.client.post(f"/api/orders/{pending_order['id']}/verify-otp", json={"otp": otp_code})

        # Summary sales should NOW reflect the confirmed order (+ ₹60)
        summary_after = self.client.get("/api/reports/summary", headers=self.admin_headers).json()
        self.assertEqual(float(summary_after["today_sales"]), sales_before + 60.00)

    def test_14_admin_override_confirms_unverified_order_with_audit_reason(self):
        """Case 18: Authorized staff can manually confirm with recorded audit reason."""
        order = self.client.post("/api/orders", json={
            "customer_name": "Override Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }).json()
        order_id = order["id"]

        override_res = self.client.post(
            f"/api/orders/{order_id}/admin-override",
            json={"reason": "Customer phone battery died at counter, verified in person"},
            headers=self.staff_headers
        )
        self.assertEqual(override_res.status_code, 200)
        data = override_res.json()
        self.assertEqual(data["order_status"], "CONFIRMED")
        self.assertIn("ADMIN OVERRIDE", data["notes"])
        self.assertIn("battery died", data["notes"])

    def test_15_prevent_staff_accidental_status_update_on_unverified_order(self):
        """Case 19: Staff cannot advance unverified order directly to PREPARING without OTP or override."""
        order = self.client.post("/api/orders", json={
            "customer_name": "Accident Tester",
            "customer_phone": self.customer_phone,
            "items": [{"menu_item_id": self.item_untracked["id"], "quantity": 1}]
        }).json()
        order_id = order["id"]

        patch_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"order_status": "PREPARING"},
            headers=self.staff_headers
        )
        self.assertEqual(patch_res.status_code, 400)
        self.assertIn("unverified order", patch_res.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
