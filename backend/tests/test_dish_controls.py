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


class TestDishControlsAndMyMenu(unittest.TestCase):
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

        # 2. Create test category and items
        cat_res = cls.client.post("/api/menu/categories", json={
            "name": f"Dish Test Cat {uuid.uuid4().hex[:4]}",
            "description": "Category for dish tests",
            "display_order": 1,
            "is_active": True
        }, headers=cls.admin_headers)
        cls.category_id = cat_res.json()["id"]

        # Item A: Masala Chai (Rs 20)
        item_a = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": f"Test Masala Chai {uuid.uuid4().hex[:4]}",
            "price": 20.00,
            "is_available": True,
            "track_stock": True,
            "available_quantity": 20,
            "low_stock_threshold": 2,
        }, headers=cls.admin_headers).json()
        cls.item_a = item_a

        # Item B: Bun Maska (Rs 35)
        item_b = cls.client.post("/api/menu/items", json={
            "category_id": cls.category_id,
            "name": f"Test Bun Maska {uuid.uuid4().hex[:4]}",
            "price": 35.00,
            "is_available": True,
            "track_stock": True,
            "available_quantity": 15,
            "low_stock_threshold": 2,
        }, headers=cls.admin_headers).json()
        cls.item_b = item_b

    def test_01_create_order_with_items(self):
        """Create a dine-in order with 2x Item A (40) and 1x Item B (35) = Total 75."""
        order_payload = {
            "customer_name": "Test Customer",
            "customer_phone": "9123456789",
            "order_type": "DINE_IN",
            "table_number": "5",
            "seat_number": "1",
            "payment_method": "CASH",
            "items": [
                {"menu_item_id": self.item_a["id"], "quantity": 2},
                {"menu_item_id": self.item_b["id"], "quantity": 1},
            ]
        }
        res = self.client.post("/api/orders", json=order_payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(float(data["total_amount"]), 75.0)

        # Confirm via admin override to make order active
        override_res = self.client.post(
            f"/api/orders/{data['id']}/admin-override",
            json={"reason": "Test verification"},
            headers=self.admin_headers
        )
        self.assertEqual(override_res.status_code, 200)

        order_data = override_res.json()
        item1 = order_data["items"][0]
        item2 = order_data["items"][1]

        # Test A: Admin toggles dish completion status (Requirement 2A)
        status_res = self.client.patch(
            f"/api/orders/{order_data['id']}/items/{item1['id']}/dish-status",
            json={"status": "READY"},
            headers=self.admin_headers
        )
        self.assertEqual(status_res.status_code, 200)
        updated_item1 = [i for i in status_res.json()["items"] if i["id"] == item1["id"]][0]
        self.assertEqual(updated_item1["status"], "READY")

        # Test A2: Uncheck/revert dish back to PENDING (Requirement 2A)
        revert_res = self.client.patch(
            f"/api/orders/{order_data['id']}/items/{item1['id']}/dish-status",
            json={"status": "PENDING"},
            headers=self.admin_headers
        )
        self.assertEqual(revert_res.status_code, 200)
        reverted_item1 = [i for i in revert_res.json()["items"] if i["id"] == item1["id"]][0]
        self.assertEqual(reverted_item1["status"], "PENDING")

        # Test B: Unauthorized/customer cannot change dish status directly (Requirement 2C)
        unauth_res = self.client.patch(
            f"/api/orders/{order_data['id']}/items/{item1['id']}/dish-status",
            json={"status": "READY"}
        )
        self.assertIn(unauth_res.status_code, [401, 403])

        # Test C: Admin cancels individual dish item2 (Item B: Rs 35) (Requirement 2B)
        cancel_res = self.client.post(
            f"/api/orders/{order_data['id']}/items/{item2['id']}/cancel-dish",
            json={"reason": "Ran out of buns"},
            headers=self.admin_headers
        )
        self.assertEqual(cancel_res.status_code, 200)
        cancelled_order = cancel_res.json()
        # Total should be reduced from 75 to 40
        self.assertEqual(float(cancelled_order["total_amount"]), 40.0)
        cancelled_item = [i for i in cancelled_order["items"] if i["id"] == item2["id"]][0]
        self.assertEqual(cancelled_item["status"], "CANCELLED")
        self.assertEqual(cancelled_item["cancelled_by"], "ADMIN")

        # Test D: Customer looks up order by phone number (Requirement 4A)
        find_res = self.client.get("/api/orders/customer/find-orders?query=9123456789")
        self.assertEqual(find_res.status_code, 200)
        customer_orders = find_res.json()
        self.assertTrue(any(o["id"] == order_data["id"] for o in customer_orders))

        # Test E: Customer cannot edit the cancelled dish (Requirement 5)
        forbidden_edit_res = self.client.patch(
            f"/api/orders/{order_data['id']}/customer-edit",
            json={
                "customer_phone": "9123456789",
                "edits": [{"item_id": item2["id"], "quantity": 2}]
            }
        )
        self.assertEqual(forbidden_edit_res.status_code, 400)
        self.assertIn("cancelled", forbidden_edit_res.text.lower())

        # Test F: Customer can edit eligible item1 quantity and add new dish (Requirement 4C)
        valid_edit_res = self.client.patch(
            f"/api/orders/{order_data['id']}/customer-edit",
            json={
                "customer_phone": "9123456789",
                "edits": [
                    {"item_id": item1["id"], "quantity": 3}  # change from 2 to 3 (+20)
                ]
            }
        )
        self.assertEqual(valid_edit_res.status_code, 200)
        # Total should now be 3 * 20 = 60
        self.assertEqual(float(valid_edit_res.json()["total_amount"]), 60.0)

        # Test G: Customer cancels item1 to 0 while including already-cancelled item2 (qty: 0)
        # Order should smoothly close and transition to CANCELLED with 0.00 total
        all_cancel_res = self.client.patch(
            f"/api/orders/{order_data['id']}/customer-edit",
            json={
                "customer_phone": "9123456789",
                "edits": [
                    {"item_id": item1["id"], "quantity": 0},
                    {"item_id": item2["id"], "quantity": 0},
                ]
            }
        )
        self.assertEqual(all_cancel_res.status_code, 200)
        final_order = all_cancel_res.json()
        self.assertEqual(final_order["order_status"], "CANCELLED")
        self.assertEqual(float(final_order["total_amount"]), 0.0)


if __name__ == "__main__":
    unittest.main()
