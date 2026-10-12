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
from models.menu import MenuCategory, MenuItem
from models.customer import Customer
from models.credit import CreditAccount


class TestPhase7OrderPlacementAndTokens(unittest.TestCase):
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

        # 3. Create a test category and menu items for ordering
        cat_res = cls.client.post("/api/menu/categories", json={
            "name": f"Order Test Cat {uuid.uuid4().hex[:4]}",
            "description": "Category for order tests",
            "display_order": 1,
            "is_active": True
        }, headers=cls.admin_headers)
        cls.category_id = cat_res.json()["id"]

        # Item 1: Stock tracked item (e.g. Samosa, 10 available)
        item1_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": "Hot Crispy Samosa",
            "description": "Potato filled snack",
            "price": 20.00,
            "is_available": True,
            "track_stock": True,
            "available_quantity": 10,
            "low_stock_threshold": 2,
            "has_customizations": False
        }, headers=cls.admin_headers)
        cls.item_tracked = item1_res.json()

        # Item 2: Irani Chai with customizations
        item2_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": "Hyderabadi Irani Chai",
            "description": "Rich creamy milk tea",
            "price": 25.00,
            "is_available": True,
            "track_stock": False,
            "available_quantity": 0,
            "low_stock_threshold": 0,
            "has_customizations": True,
            "customization_options": {
                "sugar_levels": ["None", "Less Sugar", "Regular", "Extra"],
                "tea_strength": ["Regular", "Kadak"]
            }
        }, headers=cls.admin_headers)
        cls.item_chai = item2_res.json()

        # Item 3: Unavailable item (86'd)
        item3_res = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": "Sold Out Item",
            "price": 30.00,
            "is_available": False,
            "track_stock": True,
            "available_quantity": 0,
        }, headers=cls.admin_headers)
        cls.item_unavailable = item3_res.json()

        # 4. Register two customers: one regular, one with approved credit
        cls.phone_regular = f"94{str(uuid.uuid4().int)[:8]}"[:10]
        reg_res = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.phone_regular,
            "name": "Regular Non-Credit Customer",
            "password": "Password123!"
        })
        cls.cust_token = reg_res.json()["access_token"]
        cls.cust_headers = {"Authorization": f"Bearer {cls.cust_token}"}
        cls.cust_id = reg_res.json()["user"]["customer_id"]

        cls.phone_credit = f"95{str(uuid.uuid4().int)[:8]}"[:10]
        credit_reg_res = cls.client.post("/api/auth/register", json={
            "mobile_number": cls.phone_credit,
            "name": "Approved VIP Credit Customer",
            "password": "Password123!"
        })
        cls.credit_token = credit_reg_res.json()["access_token"]
        cls.credit_headers = {"Authorization": f"Bearer {cls.credit_token}"}
        cls.credit_cust_id = credit_reg_res.json()["user"]["customer_id"]

        # Admin enables Rule 61 credit for VIP customer with limit 500
        cls.client.patch(
            f"/api/customers/{cls.credit_cust_id}/credit-status",
            json={"is_credit_eligible": True, "credit_limit": 500.00},
            headers=cls.admin_headers
        )

    def test_01_public_guest_order_and_token(self):
        """Public guest places order at Table 3; verifies token, customer phone and customer ID."""
        payload = {
            "customer_name": "Ramesh Guest",
            "customer_phone": "9876543210",
            "table_number": "3",
            "payment_method": "CASH",
            "items": [
                {
                    "menu_item_id": self.item_chai["id"],
                    "quantity": 2,
                    "selected_options": {"sugar": "Regular", "strength": "Kadak"}
                }
            ],
            "notes": "Serve extra piping hot"
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()

        self.assertGreaterEqual(data["daily_token_number"], 1)
        self.assertTrue(data["order_number"].startswith("ORD-"))
        self.assertEqual(float(data["total_amount"]), 50.00)  # 2 x 25.00
        self.assertEqual(data["order_status"], "PENDING")
        self.assertEqual(data["customer_name"], "Ramesh Guest")
        self.assertEqual(data["customer_phone"], "9876543210")
        self.assertIsNotNone(data["customer_id"])
        self.assertIn("Table #3", data["notes"])
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["item_name"], "Hyderabadi Irani Chai")
        self.assertEqual(data["items"][0]["quantity"], 2)

        TestPhase7OrderPlacementAndTokens.first_token = data["daily_token_number"]
        TestPhase7OrderPlacementAndTokens.first_order_id = data["id"]

    def test_02_sequential_daily_token_increment(self):
        """Sequential order strictly increments daily token number by 1."""
        payload = {
            "customer_name": "Second Guest",
            "customer_phone": "9876543211",
            "table_number": "5",
            "payment_method": "UPI",
            "items": [
                {"menu_item_id": self.item_chai["id"], "quantity": 1}
            ]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()

        self.assertEqual(data["daily_token_number"], self.first_token + 1)
        self.assertEqual(float(data["total_amount"]), 25.00)

    def test_03_inventory_stock_decrement(self):
        """Ordering a stock-tracked item automatically decrements available quantity."""
        # Initial stock was 10
        payload = {
            "customer_name": "Stock Customer",
            "customer_phone": "9876543212",
            "counter_number": "1",
            "payment_method": "CASH",
            "items": [
                {"menu_item_id": self.item_tracked["id"], "quantity": 3}
            ]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 201)

        # Fetch menu item and verify stock reduced to 7
        item_res = self.client.get(f"/api/menu/items/{self.item_tracked['id']}")
        self.assertEqual(item_res.status_code, 200)
        self.assertEqual(item_res.json()["available_quantity"], 7)

    def test_04_insufficient_stock_rejection(self):
        """Ordering more than current stock is rejected with 400 Bad Request."""
        payload = {
            "customer_name": "Over Stock Customer",
            "customer_phone": "9876543213",
            "payment_method": "CASH",
            "items": [
                {"menu_item_id": self.item_tracked["id"], "quantity": 50}  # Only 7 left
            ]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Insufficient stock", res.json()["detail"])

    def test_05_unavailable_item_rejection(self):
        """Ordering an 86'd item is rejected with 400 Bad Request."""
        payload = {
            "customer_name": "Unavailable Customer",
            "customer_phone": "9876543214",
            "payment_method": "CASH",
            "items": [
                {"menu_item_id": self.item_unavailable["id"], "quantity": 1}
            ]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("unavailable", res.json()["detail"].lower())

    def test_06_ineligible_credit_order_rejected(self):
        """Customer not approved for credit cannot purchase on CREDIT (Rule 61)."""
        payload = {
            "customer_name": "Regular Non-Credit Customer",
            "customer_phone": self.phone_regular,
            "payment_method": "CREDIT",
            "items": [
                {"menu_item_id": self.item_chai["id"], "quantity": 1}
            ]
        }
        res = self.client.post("/api/orders", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("not eligible for credit", res.json()["detail"].lower())

    def test_07_eligible_credit_order_succeeds(self):
        """Approved credit customer purchases on credit; balance increases and ledger logs transaction."""
        payload = {
            "customer_name": "Approved VIP Credit Customer",
            "customer_phone": self.phone_credit,
            "payment_method": "CREDIT",
            "items": [
                {"menu_item_id": self.item_chai["id"], "quantity": 4}  # 4 x 25 = 100.00
            ]
        }
        res = self.client.post("/api/orders", json=payload, headers=self.credit_headers)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        self.assertEqual(data["payment_method"], "CREDIT")
        self.assertEqual(data["payment_status"], "PAID")
        self.assertEqual(float(data["total_amount"]), 100.00)

        # Verify customer credit account balance updated
        cust_res = self.client.get(f"/api/customers/{self.credit_cust_id}", headers=self.admin_headers)
        self.assertEqual(cust_res.status_code, 200)
        self.assertEqual(float(cust_res.json()["current_balance"]), 100.00)

    def test_08_credit_order_exceeding_limit_rejected(self):
        """Ordering on credit beyond available limit is rejected with 400 Bad Request."""
        # VIP limit is 500, balance is 100, remaining is 400. Ordering 20 x 25 = 500 exceeds available credit!
        payload = {
            "customer_name": "Approved VIP Credit Customer",
            "customer_phone": self.phone_credit,
            "payment_method": "CREDIT",
            "items": [
                {"menu_item_id": self.item_chai["id"], "quantity": 20}
            ]
        }
        res = self.client.post("/api/orders", json=payload, headers=self.credit_headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Credit limit exceeded", res.json()["detail"])

    def test_09_staff_updates_order_status_lifecycle(self):
        """Staff can transition order status: PENDING -> PREPARING -> READY -> COMPLETED."""
        order_id = self.first_order_id

        # 1. Staff sets PREPARING
        res1 = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"order_status": "PREPARING"},
            headers=self.staff_headers
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["order_status"], "PREPARING")

        # 2. Staff sets READY
        res2 = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"order_status": "READY"},
            headers=self.staff_headers
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["order_status"], "READY")

        # 3. Staff sets COMPLETED
        res3 = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"order_status": "COMPLETED"},
            headers=self.staff_headers
        )
        self.assertEqual(res3.status_code, 200)
        self.assertEqual(res3.json()["order_status"], "COMPLETED")

    def test_10_today_tokens_queue(self):
        """Endpoint returns live token queue grouped into active states."""
        res = self.client.get("/api/orders/tokens/today")
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()

        self.assertIn("total_orders_today", data)
        self.assertIn("latest_token", data)
        self.assertIn("pending", data)
        self.assertIn("preparing", data)
        self.assertIn("ready", data)
        self.assertIn("completed", data)
        self.assertGreaterEqual(data["total_orders_today"], 2)

    def test_11_customer_my_orders_history(self):
        """Authenticated customer retrieves their order history."""
        res = self.client.get("/api/orders/my-orders", headers=self.credit_headers)
        self.assertEqual(res.status_code, 200)
        orders = res.json()
        self.assertIsInstance(orders, list)
        self.assertGreaterEqual(len(orders), 1)
        self.assertEqual(orders[0]["customer_phone"], self.phone_credit)

    def test_12_mandatory_customer_phone_validation(self):
        """Order placement strictly fails if phone is missing, too short, or all zeros."""
        base_item = [{"menu_item_id": self.item_chai["id"], "quantity": 1}]

        # 1. Missing phone
        res1 = self.client.post("/api/orders", json={
            "customer_name": "Test Missing Phone",
            "items": base_item
        })
        self.assertEqual(res1.status_code, 422)

        # 2. Too short phone (< 10 digits)
        res2 = self.client.post("/api/orders", json={
            "customer_name": "Test Short Phone",
            "customer_phone": "98765",
            "items": base_item
        })
        self.assertEqual(res2.status_code, 422)

        # 3. All zeros phone (0000000000)
        res3 = self.client.post("/api/orders", json={
            "customer_name": "Test Zero Phone",
            "customer_phone": "0000000000",
            "items": base_item
        })
        self.assertEqual(res3.status_code, 422)

    def test_13_mandatory_customer_name_validation(self):
        """Order placement strictly fails if customer name is missing or too short."""
        base_item = [{"menu_item_id": self.item_chai["id"], "quantity": 1}]

        # 1. Missing name
        res1 = self.client.post("/api/orders", json={
            "customer_phone": "9876543299",
            "items": base_item
        })
        self.assertEqual(res1.status_code, 422)

        # 2. Too short name (< 2 chars)
        res2 = self.client.post("/api/orders", json={
            "customer_name": "A",
            "customer_phone": "9876543299",
            "items": base_item
        })
        self.assertEqual(res2.status_code, 422)

    def test_14_auto_registers_customer_and_allocates_customer_id(self):
        """Order placement for new phone number automatically creates Customer record and assigns customer_id."""
        unique_phone = f"99{str(uuid.uuid4().int)[:8]}"[:10]
        res = self.client.post("/api/orders", json={
            "customer_name": "New Auto Customer",
            "customer_phone": unique_phone,
            "items": [{"menu_item_id": self.item_chai["id"], "quantity": 1}]
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIsNotNone(data["customer_id"])
        self.assertEqual(data["customer_phone"], unique_phone)
        self.assertEqual(data["customer_name"], "New Auto Customer")

        # Verify Customer row exists in database via customer search
        cust_search = self.client.get(f"/api/customers?search={unique_phone}", headers=self.admin_headers)
        self.assertEqual(cust_search.status_code, 200)
        cust_list = cust_search.json()["items"]
        self.assertTrue(any(c["phone"] == unique_phone for c in cust_list))


if __name__ == "__main__":
    unittest.main(verbosity=2)
