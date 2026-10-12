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


class TestPhase8PaymentsAndBilling(unittest.TestCase):
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

        # 3. Create a test category and item for billing tests
        cat_res = cls.client.post("/api/menu/categories", json={
            "name": f"Billing Cat {uuid.uuid4().hex[:4]}",
            "display_order": 1,
            "is_active": True
        }, headers=cls.admin_headers)
        cls.category_id = cat_res.json()["id"]

        item_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": "Masala Ginger Chai",
            "price": 25.00,
            "is_available": True,
            "track_stock": False
        }, headers=cls.admin_headers)
        cls.item_id = item_res.json()["id"]

        # 4. Register a customer and set up credit
        cls.cust_phone = f"92{str(uuid.uuid4().int)[:8]}"[:10]
        reg_res = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.cust_phone,
            "name": "Billing VIP Customer",
            "password": "Password123!"
        })
        cls.customer_id = reg_res.json()["user"]["customer_id"]
        cls.cust_token = reg_res.json()["access_token"]
        cls.cust_headers = {"Authorization": f"Bearer {cls.cust_token}"}

        # Admin enables Rule 61 credit
        cls.client.patch(
            f"/api/customers/{cls.customer_id}/credit-status",
            json={"is_credit_eligible": True, "credit_limit": 600.00},
            headers=cls.admin_headers
        )

    def test_01_settle_order_cash_tender_and_change(self):
        """Staff settles cash bill at counter, calculating change returned."""
        # 1. Place order for 2x Chai = 50.00
        order_res = self.client.post("/api/orders", json={
            "customer_name": "Cash Customer",
            "customer_phone": "9876543210",
            "table_number": "4",
            "payment_method": "CASH",
            "items": [{"menu_item_id": self.item_id, "quantity": 2}]
        })
        self.assertEqual(order_res.status_code, 201)
        order_data = order_res.json()
        order_id = order_data["id"]
        self.assertEqual(float(order_data["total_amount"]), 50.00)
        self.assertEqual(order_data["payment_status"], "PENDING")

        # 2. Staff settles bill: customer tenders ₹100 note for ₹50 bill
        settle_res = self.client.post("/api/payments/settle", json={
            "order_id": order_id,
            "payment_method": "CASH",
            "amount_received": 100.00,
            "notes": "Counter cash received"
        }, headers=self.staff_headers)
        self.assertEqual(settle_res.status_code, 200, settle_res.text)
        data = settle_res.json()

        self.assertEqual(float(data["total_amount"]), 50.00)
        self.assertEqual(float(data["amount_received"]), 100.00)
        self.assertEqual(float(data["change_returned"]), 50.00)
        self.assertEqual(data["payment_status"], "COMPLETED")
        self.assertEqual(data["payment_method"], "CASH")

        # 3. Verify order is now marked PAID
        chk_res = self.client.get(f"/api/orders/{order_id}", headers=self.staff_headers)
        self.assertEqual(chk_res.json()["payment_status"], "PAID")

    def test_02_settle_order_insufficient_cash_rejected(self):
        """Tendering less than bill amount is rejected with 400 Bad Request."""
        order_res = self.client.post("/api/orders", json={
            "customer_name": "Short Cash Customer",
            "customer_phone": "9876543210",
            "items": [{"menu_item_id": self.item_id, "quantity": 2}]  # 50.00
        })
        order_id = order_res.json()["id"]

        settle_res = self.client.post("/api/payments/settle", json={
            "order_id": order_id,
            "payment_method": "CASH",
            "amount_received": 30.00  # Less than 50.00!
        }, headers=self.staff_headers)
        self.assertEqual(settle_res.status_code, 400)
        self.assertIn("less than bill amount", settle_res.json()["detail"].lower())

    def test_03_settle_already_paid_order_rejected(self):
        """Attempting to settle an order that is already PAID returns 400 Bad Request."""
        order_res = self.client.post("/api/orders", json={
            "customer_name": "Repeat Payment Order",
            "customer_phone": "9876543210",
            "items": [{"menu_item_id": self.item_id, "quantity": 1}]
        })
        order_id = order_res.json()["id"]

        # First settlement succeeds
        self.client.post("/api/payments/settle", json={
            "order_id": order_id,
            "payment_method": "CASH"
        }, headers=self.staff_headers)

        # Second settlement fails
        res2 = self.client.post("/api/payments/settle", json={
            "order_id": order_id,
            "payment_method": "CASH"
        }, headers=self.staff_headers)
        self.assertEqual(res2.status_code, 400)
        self.assertIn("already marked paid", res2.json()["detail"].lower())

    def test_04_settle_order_upi_with_utr_reference(self):
        """Settling via UPI records UTR reference code and marks payment COMPLETED."""
        order_res = self.client.post("/api/orders", json={
            "customer_name": "UPI Customer",
            "customer_phone": "9876543210",
            "table_number": "6",
            "payment_method": "UPI",
            "items": [{"menu_item_id": self.item_id, "quantity": 3}]  # 75.00
        })
        order_id = order_res.json()["id"]

        utr_code = f"UPI{uuid.uuid4().hex[:8].upper()}"
        settle_res = self.client.post("/api/payments/settle", json={
            "order_id": order_id,
            "payment_method": "UPI",
            "transaction_reference": utr_code
        }, headers=self.staff_headers)
        self.assertEqual(settle_res.status_code, 200)
        data = settle_res.json()

        self.assertEqual(data["payment_method"], "UPI")
        self.assertEqual(data["payment_status"], "COMPLETED")
        self.assertEqual(data["transaction_reference"], utr_code)

    def test_05_dynamic_upi_qr_payload(self):
        """Dynamic UPI endpoint returns standard NPCI URI formatted with exact amount."""
        order_res = self.client.post("/api/orders", json={
            "customer_name": "QR Scan Customer",
            "customer_phone": "9876543210",
            "items": [{"menu_item_id": self.item_id, "quantity": 2}]  # 50.00
        })
        order_id = order_res.json()["id"]

        qr_res = self.client.get(f"/api/payments/upi-qr/{order_id}")
        self.assertEqual(qr_res.status_code, 200, qr_res.text)
        data = qr_res.json()

        self.assertEqual(float(data["amount"]), 50.00)
        self.assertTrue(data["upi_uri"].startswith("upi://pay?"))
        self.assertIn("am=50.00", data["upi_uri"])
        self.assertIn("cu=INR", data["upi_uri"])
        self.assertIn(data["order_number"], data["upi_uri"])

    def test_06_thermal_bill_receipt_data(self):
        """Receipt endpoint returns formatted printable thermal bill data."""
        order_res = self.client.post("/api/orders", json={
            "customer_name": "Receipt Customer",
            "customer_phone": "9876543210",
            "table_number": "2",
            "items": [
                {
                    "menu_item_id": self.item_id,
                    "quantity": 2,
                    "selected_options": {"sugar": "Less Sugar", "strength": "Kadak"}
                }
            ]
        })
        order_id = order_res.json()["id"]

        receipt_res = self.client.get(f"/api/payments/receipt/{order_id}")
        self.assertEqual(receipt_res.status_code, 200, receipt_res.text)
        data = receipt_res.json()

        self.assertIn("shop_name", data)
        self.assertIn("fssai_license", data)
        self.assertEqual(data["daily_token_number"], order_res.json()["daily_token_number"])
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["name"], "Masala Ginger Chai")
        self.assertIn("Sugar: Less Sugar", data["items"][0]["customizations"])
        self.assertEqual(float(data["total_amount"]), 50.00)

    def test_07_credit_repayment_at_counter(self):
        """Customer visits counter and repays debt; reduces balance and creates PAYMENT transaction."""
        # 1. Place order on credit to build debt
        order_res = self.client.post("/api/orders", json={
            "customer_name": "Credit Customer",
            "customer_phone": self.cust_phone,
            "payment_method": "CREDIT",
            "items": [{"menu_item_id": self.item_id, "quantity": 4}]  # 100.00
        }, headers=self.cust_headers)
        self.assertEqual(order_res.status_code, 201)

        # 2. Verify customer balance is 100.00
        cust_res = self.client.get(f"/api/customers/{self.customer_id}", headers=self.admin_headers)
        self.assertEqual(float(cust_res.json()["current_balance"]), 100.00)

        # 3. Customer visits counter and pays ₹60 cash towards debt
        repay_res = self.client.post("/api/payments/credit-repayment", json={
            "customer_id": self.customer_id,
            "amount": 60.00,
            "payment_method": "CASH",
            "description": "Counter debt partial repayment"
        }, headers=self.staff_headers)
        self.assertEqual(repay_res.status_code, 200, repay_res.text)
        repay_data = repay_res.json()

        self.assertEqual(float(repay_data["amount_paid"]), 60.00)
        self.assertEqual(float(repay_data["previous_balance"]), 100.00)
        self.assertEqual(float(repay_data["new_balance"]), 40.00)

        # 4. Verify customer profile reflects updated debt
        cust_after = self.client.get(f"/api/customers/{self.customer_id}", headers=self.admin_headers)
        self.assertEqual(float(cust_after.json()["current_balance"]), 40.00)

    def test_08_credit_repayment_zero_debt_rejected(self):
        """Repayment against zero debt is rejected with 400 Bad Request."""
        # Create a new customer with 0 debt
        clean_phone = f"91{str(uuid.uuid4().int)[:8]}"[:10]
        reg_res = self.client.post("/api/auth/register", json={
            "mobile_number": clean_phone,
            "name": "Zero Debt Customer",
            "password": "Password123!"
        })
        cust_id = reg_res.json()["user"]["customer_id"]

        res = self.client.post("/api/payments/credit-repayment", json={
            "customer_id": cust_id,
            "amount": 50.00,
            "payment_method": "CASH"
        }, headers=self.staff_headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("zero outstanding", res.json()["detail"].lower())

    def test_09_counter_shift_summary(self):
        """Counter summary distinguishes actual money collected from credit sales (Section 21)."""
        summary_res = self.client.get("/api/payments/counter-summary")
        self.assertEqual(summary_res.status_code, 200, summary_res.text)
        data = summary_res.json()

        self.assertIn("cash_collected", data)
        self.assertIn("upi_collected", data)
        self.assertIn("credit_repayments_collected", data)
        self.assertIn("total_money_received", data)
        self.assertIn("credit_sales_unpaid", data)
        self.assertGreaterEqual(float(data["total_money_received"]), 50.00)

    def test_10_list_payments_pagination(self):
        """Staff/Admin can list paginated payment records."""
        res = self.client.get("/api/payments?page=1&limit=10", headers=self.staff_headers)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()

        self.assertIn("items", data)
        self.assertIn("total", data)
        self.assertGreaterEqual(len(data["items"]), 1)
        self.assertIn("amount", data["items"][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
