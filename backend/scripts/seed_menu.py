import os
import sys
from decimal import Decimal

# Ensure backend root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.abspath(os.path.join(current_dir, ".."))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from database.connection import SessionLocal
from models.menu import MenuCategory, MenuItem

def seed_menu():
    db = SessionLocal()
    try:
        categories_data = [
            {
                "name": "Tea & Chai",
                "description": "Authentic fresh-brewed Indian teas prepared with premium milk and spices",
                "display_order": 1,
                "items": [
                    {
                        "name": "Special Masala Chai",
                        "description": "Signature milk tea infused with ginger, cardamom, clove, and cinnamon",
                        "price": Decimal("20.00"),
                        "track_stock": True,
                        "available_quantity": 100,
                        "has_customizations": True,
                        "customization_options": {
                            "sugar_levels": ["No Sugar", "Less Sugar", "Regular Sugar", "Extra Sugar"],
                            "tea_strength": ["Light", "Regular", "Kadak"]
                        }
                    },
                    {
                        "name": "Ginger Chai (Adrak)",
                        "description": "Refreshing winter favorite crushed with fresh pungent ginger root",
                        "price": Decimal("20.00"),
                        "track_stock": True,
                        "available_quantity": 100,
                        "has_customizations": True,
                        "customization_options": {
                            "sugar_levels": ["No Sugar", "Less Sugar", "Regular Sugar", "Extra Sugar"],
                            "tea_strength": ["Regular", "Kadak"]
                        }
                    },
                    {
                        "name": "Royal Elaichi Chai",
                        "description": "Fragrant cardamom-infused luxury tea",
                        "price": Decimal("25.00"),
                        "track_stock": True,
                        "available_quantity": 80,
                        "has_customizations": True,
                        "customization_options": {
                            "sugar_levels": ["No Sugar", "Less Sugar", "Regular Sugar", "Extra Sugar"],
                            "tea_strength": ["Regular", "Kadak"]
                        }
                    },
                    {
                        "name": "Detox Green Tea",
                        "description": "Steamed whole-leaf green tea with natural honey and lemon juice",
                        "price": Decimal("30.00"),
                        "track_stock": True,
                        "available_quantity": 50,
                        "has_customizations": True,
                        "customization_options": {
                            "sweetener": ["No Honey", "Mild Honey", "Double Honey"]
                        }
                    }
                ]
            },
            {
                "name": "Coffee & Brews",
                "description": "Rich roasted coffees and classic filter brews",
                "display_order": 2,
                "items": [
                    {
                        "name": "South Indian Filter Coffee",
                        "description": "Strong decoction poured with foamy hot milk in traditional dabara style",
                        "price": Decimal("30.00"),
                        "track_stock": True,
                        "available_quantity": 60,
                        "has_customizations": True,
                        "customization_options": {
                            "sugar_levels": ["Less Sugar", "Regular Sugar", "Extra Sugar"],
                            "strength": ["Medium", "Strong Decoction"]
                        }
                    },
                    {
                        "name": "Cold Coffee Shake",
                        "description": "Thick creamy blended cold coffee with dark chocolate drizzle",
                        "price": Decimal("50.00"),
                        "track_stock": True,
                        "available_quantity": 30,
                        "has_customizations": False,
                        "customization_options": None
                    }
                ]
            },
            {
                "name": "Snacks & Quick Bites",
                "description": "Crispy fried and bakery snacks to pair with your hot cup",
                "display_order": 3,
                "items": [
                    {
                        "name": "Crispy Samosa (Plate of 2)",
                        "description": "Flaky golden crust stuffed with spiced potato and green peas, served with mint chutney",
                        "price": Decimal("30.00"),
                        "track_stock": True,
                        "available_quantity": 50,
                        "has_customizations": False,
                        "customization_options": None
                    },
                    {
                        "name": "Irani Bun Maska",
                        "description": "Warm sweet bun sliced and smothered with pure Amul butter",
                        "price": Decimal("35.00"),
                        "track_stock": True,
                        "available_quantity": 40,
                        "has_customizations": False,
                        "customization_options": None
                    },
                    {
                        "name": "Osmania Biscuits (4 pcs)",
                        "description": "Authentic melt-in-mouth sweet and salt tea biscuits",
                        "price": Decimal("20.00"),
                        "track_stock": True,
                        "available_quantity": 120,
                        "has_customizations": False,
                        "customization_options": None
                    }
                ]
            },
            {
                "name": "Coolers & Beverages",
                "description": "Chilled lemonades and flavored milks for hot afternoons",
                "display_order": 4,
                "items": [
                    {
                        "name": "Fresh Lime Soda",
                        "description": "Fizzy club soda with freshly squeezed lime, black salt, and roasted cumin",
                        "price": Decimal("35.00"),
                        "track_stock": True,
                        "available_quantity": 50,
                        "has_customizations": True,
                        "customization_options": {
                            "flavor": ["Sweet", "Salted", "Sweet & Salt"]
                        }
                    },
                    {
                        "name": "Kesar Badam Milk",
                        "description": "Chilled almond milk laced with pure saffron and crushed pistachio",
                        "price": Decimal("45.00"),
                        "track_stock": True,
                        "available_quantity": 25,
                        "has_customizations": False,
                        "customization_options": None
                    }
                ]
            }
        ]

        total_cats = 0
        total_items = 0

        for cat_data in categories_data:
            cat = db.query(MenuCategory).filter(MenuCategory.name == cat_data["name"]).first()
            if not cat:
                cat = MenuCategory(
                    name=cat_data["name"],
                    description=cat_data["description"],
                    display_order=cat_data["display_order"],
                    is_active=True
                )
                db.add(cat)
                db.flush()
                print(f"[+] Category created: {cat.name}")
                total_cats += 1
            else:
                print(f"[*] Category already exists: {cat.name}")

            for item_data in cat_data["items"]:
                existing_item = db.query(MenuItem).filter(
                    MenuItem.category_id == cat.id,
                    MenuItem.name == item_data["name"]
                ).first()

                if not existing_item:
                    item = MenuItem(
                        category_id=cat.id,
                        name=item_data["name"],
                        description=item_data["description"],
                        price=item_data["price"],
                        track_stock=item_data["track_stock"],
                        available_quantity=item_data["available_quantity"],
                        low_stock_threshold=5,
                        is_available=True,
                        has_customizations=item_data["has_customizations"],
                        customization_options=item_data["customization_options"]
                    )
                    db.add(item)
                    print(f"    -> Product created: {item.name} (Rs. {item.price})")
                    total_items += 1
                else:
                    print(f"    -> Product already exists: {existing_item.name}")

        db.commit()
        print(f"[SUCCESS] Menu seeding complete! {total_cats} categories, {total_items} items added.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Menu seeding failed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_menu()
