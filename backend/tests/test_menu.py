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


class TestPhase5MenuManagement(unittest.TestCase):
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

        # 3. Register Customer for permission checks
        cust_phone = f"93{str(uuid.uuid4().int)[:8]}"[:10]
        reg_res = cls.client.post("/api/auth/register", json={
            "mobile_number": cust_phone,
            "name": "Menu Customer",
            "password": "Password123!"
        })
        assert reg_res.status_code == 201, f"Customer registration failed: {reg_res.text}"
        cls.cust_token = reg_res.json()["access_token"]
        cls.cust_headers = {"Authorization": f"Bearer {cls.cust_token}"}

    def test_01_public_list_categories(self):
        """Unauthenticated customer can list active menu categories."""
        res = self.client.get("/api/menu/categories")
        self.assertEqual(res.status_code, 200, res.text)
        categories = res.json()
        self.assertIsInstance(categories, list)
        self.assertGreaterEqual(len(categories), 1)
        self.assertIn("name", categories[0])
        self.assertIn("items_count", categories[0])

    def test_02_public_list_items_and_search(self):
        """Unauthenticated customer can list and search menu items."""
        # 1. Search for Chai
        res_search = self.client.get("/api/menu/items?search=Chai")
        self.assertEqual(res_search.status_code, 200)
        items = res_search.json()
        self.assertTrue(any("Chai" in item["name"] for item in items))

        # 2. Filter by category
        cat_id = items[0]["category_id"]
        res_cat = self.client.get(f"/api/menu/items?category_id={cat_id}")
        self.assertEqual(res_cat.status_code, 200)
        self.assertTrue(all(item["category_id"] == cat_id for item in res_cat.json()))

    def test_03_staff_creates_category(self):
        """Staff can create a new menu category."""
        unique_name = f"Specials {str(uuid.uuid4().int)[:4]}"
        payload = {
            "name": unique_name,
            "description": "Daily chef seasonal specials",
            "display_order": 99,
            "is_active": True
        }
        res = self.client.post("/api/menu/categories", json=payload, headers=self.staff_headers)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        self.assertEqual(data["name"], unique_name)
        self.__class__.created_category_id = data["id"]

    def test_04_customer_cannot_create_category(self):
        """Standard customer receives 403 Forbidden attempting to create category."""
        res = self.client.post("/api/menu/categories", json={"name": "Hacked Category"}, headers=self.cust_headers)
        self.assertEqual(res.status_code, 403)

    def test_05_admin_creates_menu_item_with_customizations(self):
        """Admin creates a new tea item with sugar and strength modifiers."""
        payload = {
            "category_id": self.created_category_id,
            "name": "Kashmiri Kahwa Tea",
            "description": "Traditional green tea brewed with saffron strands, crushed almonds, and green cardamom",
            "price": 45.00,
            "track_stock": True,
            "available_quantity": 40,
            "low_stock_threshold": 5,
            "has_customizations": True,
            "customization_options": {
                "sugar_levels": ["No Sugar", "Less Sugar", "Medium Sugar"],
                "garnish": ["Extra Almonds", "Regular Almonds"]
            }
        }
        res = self.client.post("/api/menu/items", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201, res.text)
        item = res.json()
        self.assertEqual(item["name"], "Kashmiri Kahwa Tea")
        self.assertEqual(float(item["price"]), 45.00)
        self.assertTrue(item["has_customizations"])
        self.assertIn("sugar_levels", item["customization_options"])
        self.__class__.created_item_id = item["id"]

    def test_06_staff_toggles_availability(self):
        """Staff can 86 (mark unavailable) and re-enable a menu item at counter."""
        # 1. Mark Out of Stock
        res_off = self.client.patch(
            f"/api/menu/items/{self.created_item_id}/availability",
            json={"is_available": False},
            headers=self.staff_headers
        )
        self.assertEqual(res_off.status_code, 200)
        self.assertFalse(res_off.json()["is_available"])

        # 2. Re-enable item
        res_on = self.client.patch(
            f"/api/menu/items/{self.created_item_id}/availability",
            json={"is_available": True},
            headers=self.staff_headers
        )
        self.assertEqual(res_on.status_code, 200)
        self.assertTrue(res_on.json()["is_available"])

    def test_07_staff_updates_stock(self):
        """Staff can restock or update daily available quantity."""
        res = self.client.patch(
            f"/api/menu/items/{self.created_item_id}/stock",
            json={"available_quantity": 75},
            headers=self.staff_headers
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["available_quantity"], 75)

    def test_08_staff_updates_menu_item(self):
        """Staff can update item price and description."""
        payload = {
            "price": 50.00,
            "description": "Enhanced with saffron, pure cinnamon bark, and almonds"
        }
        res = self.client.put(
            f"/api/menu/items/{self.created_item_id}",
            json=payload,
            headers=self.staff_headers
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(float(data["price"]), 50.00)
        self.assertEqual(data["description"], payload["description"])

    def test_09_customer_cannot_delete_item(self):
        """Customer is rejected (403 Forbidden) when attempting to delete a product."""
        res = self.client.delete(f"/api/menu/items/{self.created_item_id}", headers=self.cust_headers)
        self.assertEqual(res.status_code, 403)

    def test_10_full_catalog_tree(self):
        """Public catalog endpoint returns nested category-item hierarchy for mobile menu."""
        res = self.client.get("/api/menu/catalog")
        self.assertEqual(res.status_code, 200, res.text)
        catalog = res.json()
        self.assertIsInstance(catalog, list)
        self.assertGreaterEqual(len(catalog), 1)
        self.assertIn("items", catalog[0])
        self.assertIsInstance(catalog[0]["items"], list)

    def test_11_qr_info_metadata(self):
        """Public endpoint returns QR ordering branding and session metadata."""
        res = self.client.get("/api/menu/qr-info?table=5")
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["shop_name"], "ChaiFlow Tea Shop")
        self.assertEqual(data["table_number"], "5")
        self.assertEqual(data["order_mode"], "table")
        self.assertEqual(data["ordering_enabled"], True)
        self.assertEqual(data["currency"], "INR")
        self.assertIn("features", data)
        self.assertTrue(data["features"]["customizations"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

