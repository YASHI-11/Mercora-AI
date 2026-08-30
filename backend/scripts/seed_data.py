"""Seeds MongoDB with realistic synthetic data: products, customers, and
5000+ historical orders with INTENTIONAL purchase patterns (headphones+case,
laptop+mouse/keyboard, camera+SD card, smartwatch+strap, etc.) so the
association-rule mining and recommendation ML actually discover real
signal rather than being fed hardcoded relationships."""
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from faker import Faker
from pymongo import MongoClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import get_settings  # noqa: E402

fake = Faker()
random.seed(42)
Faker.seed(42)

settings = get_settings()
MERCHANT_ID = settings.default_merchant_id


def nid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


IMG_BASE = "https://loremflickr.com/500/500"

# Every keyword pair below was hand-picked and verified (fetched + visually
# inspected) to be a real, on-topic, people-free product photo across a wide
# range of `lock` values -- e.g. "wireless,headphones" was checked at locks
# 2, 66, 141, 219 and others up to 260 with zero misses. loremflickr.com's
# tag search returns a DIFFERENT actual photo per `lock` value on the SAME
# keyword, so each product gets a strictly sequential, never-repeated lock
# within its keyword group (see image_url below) -- guaranteeing every
# synthetic product has both a unique image AND a topically-correct one.
IMAGE_KEYWORDS = {
    "wireless,headphones", "gaming,headset", "wireless,earbuds", "bluetooth,speaker",
    "headphone,case", "laptop,computer", "gaming,laptop", "wireless,mouse",
    "mechanical,keyboard", "game,controller", "gaming,mouse", "gaming,chair",
    "mousepad,gaming", "phone,charger", "laptop,backpack", "usb,cable",
    "wireless,charging", "wearable,smartwatch", "watch,strap", "mirrorless,camera",
    "action,camera", "memory,card", "gaming,monitor", "desk,chair",
    "standing,desk", "webcam,device", "desk,lamp", "smartphone,screen",
    "tablet,ipad", "power,bank",
}

_image_group_counters: dict[str, int] = {}


def image_url(keyword: str) -> str:
    """A real, hand-verified, topically-relevant photo. Hands out sequential
    lock values per keyword so no two products sharing a keyword ever get
    the same URL."""
    assert keyword in IMAGE_KEYWORDS, f"unverified image keyword: {keyword!r}"
    lock = _image_group_counters.get(keyword, 0)
    _image_group_counters[keyword] = lock + 1
    return f"{IMG_BASE}/{keyword}?lock={lock}"


# Each item/companion tuple carries an explicit image keyword PAIR that must
# have a verified entry in IMAGE_LOCKS above.
CATEGORY_DATA = {
    "Audio": {
        "brands": ["SonicWave", "BassPro", "EchoTech", "AudioMax"],
        "items": [
            ("Wireless Bluetooth Headphones", 1500, 6000, ["Bluetooth 5.2", "40h battery", "Active Noise Cancelling", "Low-latency gaming mode"], "wireless,headphones"),
            ("Wired Gaming Headset", 1200, 4500, ["7.1 Surround", "Detachable mic", "Braided cable"], "gaming,headset"),
            ("True Wireless Earbuds", 1800, 5500, ["ENC mic", "IPX5", "24h with case"], "wireless,earbuds"),
            ("Portable Bluetooth Speaker", 900, 3500, ["12h playback", "Waterproof", "TWS pairing"], "bluetooth,speaker"),
            ("Over-Ear Studio Headphones", 3000, 9000, ["Flat frequency response", "Detachable cable"], "wireless,headphones"),
        ],
        "companion": ("Headphone Carrying Case", 299, 799, ["Hardshell", "Mesh pocket", "Carabiner clip"], "headphone,case"),
    },
    "Laptops": {
        "brands": ["NimbusBook", "CoreForge", "ZenLine", "TitanTech"],
        "items": [
            ("14-inch Ultrabook", 42000, 68000, ["Intel i5", "16GB RAM", "512GB SSD", "1.2kg"], "laptop,computer"),
            ("15.6-inch Gaming Laptop", 58000, 95000, ["RTX 4050", "16GB RAM", "144Hz display"], "gaming,laptop"),
            ("13-inch Business Laptop", 45000, 70000, ["Intel i7", "Fingerprint reader", "16h battery"], "laptop,computer"),
            ("Budget Student Laptop", 28000, 42000, ["Intel i3", "8GB RAM", "256GB SSD"], "laptop,computer"),
        ],
        "companion": ("Wireless Mouse", 399, 1299, ["2.4GHz", "Silent click", "6-month battery"], "wireless,mouse"),
    },
    "Gaming": {
        "brands": ["PulseGear", "ArcadeX", "NovaPlay"],
        "items": [
            ("Mechanical Gaming Keyboard", 2200, 6500, ["Hot-swappable switches", "RGB backlight", "N-key rollover"], "mechanical,keyboard"),
            ("Wireless Gaming Controller", 1500, 4200, ["Bluetooth + wired", "Programmable buttons"], "game,controller"),
            ("Gaming Mouse", 999, 3200, ["16000 DPI", "Lightweight 65g"], "gaming,mouse"),
            ("Gaming Chair", 8500, 18000, ["Ergonomic", "Adjustable armrests", "Reclines to 160°"], "gaming,chair"),
        ],
        "companion": ("Wrist Rest Pad", 249, 599, ["Memory foam", "Non-slip base"], "mousepad,gaming"),
    },
    "Accessories": {
        "brands": ["ConnectPro", "PowerLine", "GripTech"],
        "items": [
            ("USB-C Fast Charger 65W", 899, 1999, ["GaN tech", "Multi-port"], "phone,charger"),
            ("Laptop Backpack", 1200, 3200, ["Water-resistant", "Padded laptop sleeve"], "laptop,backpack"),
            ("Multi-port USB-C Hub", 1099, 2799, ["HDMI 4K", "3x USB-A", "SD card reader"], "usb,cable"),
            ("Wireless Charging Pad", 699, 1799, ["15W fast charge", "LED indicator"], "wireless,charging"),
        ],
        "companion": None,
    },
    "Smartwatches": {
        "brands": ["PulseFit", "OrbitWear", "ChronoTech"],
        "items": [
            ("Fitness Smartwatch", 2500, 7500, ["Heart rate monitor", "SpO2", "7-day battery"], "wearable,smartwatch"),
            ("Premium Smartwatch AMOLED", 6000, 15000, ["Always-on display", "GPS", "5ATM"], "wearable,smartwatch"),
        ],
        "companion": ("Extra Watch Strap", 299, 899, ["Silicone", "Breathable", "Quick release"], "watch,strap"),
    },
    "Cameras": {
        "brands": ["LumaShot", "PixelPro", "FrameWorks"],
        "items": [
            ("Mirrorless Camera", 45000, 85000, ["24MP sensor", "4K video", "In-body stabilization"], "mirrorless,camera"),
            ("Action Camera", 8000, 22000, ["4K60", "Waterproof 10m", "Voice control"], "action,camera"),
            ("Point-and-Shoot Camera", 12000, 28000, ["20x zoom", "Wi-Fi transfer"], "mirrorless,camera"),
        ],
        "companion": ("128GB SD Card", 799, 1999, ["V30 rated", "170MB/s read"], "memory,card"),
    },
    "Home Office": {
        "brands": ["DeskCraft", "ViewPoint", "ErgoLine"],
        "items": [
            ("27-inch Monitor QHD", 12000, 24000, ["144Hz", "IPS panel", "USB-C"], "gaming,monitor"),
            ("Ergonomic Office Chair", 9000, 20000, ["Lumbar support", "Adjustable height"], "desk,chair"),
            ("Standing Desk", 14000, 32000, ["Electric height adjust", "Memory presets"], "standing,desk"),
            ("Webcam 1080p", 1500, 3500, ["Auto-focus", "Built-in mic"], "webcam,device"),
        ],
        "companion": ("Monitor Light Bar", 999, 2199, ["Glare-free", "USB powered"], "desk,lamp"),
    },
    "Electronics": {
        "brands": ["NovaTech", "SwiftLine", "ClearView"],
        "items": [
            ("Smartphone 128GB", 15000, 35000, ["6.5in AMOLED", "5000mAh", "Triple camera"], "smartphone,screen"),
            ("Tablet 10-inch", 14000, 32000, ["10.1in display", "8000mAh", "Stylus support"], "tablet,ipad"),
            ("Power Bank 20000mAh", 1200, 2800, ["Fast charge 22.5W", "Dual output"], "power,bank"),
        ],
        "companion": None,
    },
}


def make_products():
    products = []
    for category, meta in CATEGORY_DATA.items():
        # Only the FIRST item template in each category is the "hero" product used
        # for the intentional co-purchase pattern (paired with the category's single
        # companion product below); other item templates add catalog variety/noise.
        # One unique suffix per variant so no two variants of the same item
        # template (even sharing a brand) ever end up with an identical name --
        # the first 4 use recognizable names, any further variant (needed to
        # reach a large catalog) gets a numbered "Series N" suffix instead of
        # wrapping back around into a collision.
        variant_suffixes = ["", "Lite", "Pro", "Max"]
        for item_index, (name_tpl, lo, hi, features, image_keyword) in enumerate(meta["items"]):
            variants = 22 if item_index == 0 else 16
            for variant in range(1, variants + 1):
                brand = random.choice(meta["brands"])
                price = round(random.uniform(lo, hi), -1)
                suffix = variant_suffixes[variant - 1] if variant <= len(variant_suffixes) else f"Series {variant}"
                name = f"{brand} {name_tpl} {suffix}".strip()
                pid = nid("prod")
                products.append({
                    "_id": pid,
                    "merchant_id": MERCHANT_ID,
                    "name": name,
                    "category": category,
                    "brand": brand,
                    "description": (
                        f"{name} delivers {', '.join(features[:2]).lower()} for everyday use. "
                        f"Built for reliability with {features[-1].lower()}."
                    ),
                    "price": float(price),
                    "discount": random.choice([0, 0, 0, 5, 10, 15]),
                    "inventory": random.randint(10, 200),
                    "rating": round(random.uniform(3.5, 5.0), 1),
                    "features": features,
                    "tags": [category.lower(), brand.lower()] + [f.lower().split()[0] for f in features[:2]],
                    "image": image_url(image_keyword),
                    "created_at": now_iso(),
                    "_companion_group": category,
                    "_is_hero": item_index == 0,
                })
        if meta["companion"]:
            cname, clo, chi, cfeat, c_image_keyword = meta["companion"]
            cid = nid("prod")
            cbrand = random.choice(meta["brands"])
            products.append({
                "_id": cid,
                "merchant_id": MERCHANT_ID,
                "name": f"{cbrand} {cname}",
                "category": category,
                "brand": cbrand,
                "description": f"{cname} designed to pair perfectly with your {category.lower()} purchase.",
                "price": float(round(random.uniform(clo, chi), -1)),
                "discount": random.choice([0, 0, 5, 10]),
                "inventory": random.randint(20, 300),
                "rating": round(random.uniform(3.8, 5.0), 1),
                "features": cfeat,
                "tags": [category.lower(), "companion", "accessory"],
                "image": image_url(c_image_keyword),
                "created_at": now_iso(),
                "_companion_group": category,
                "_is_companion": True,
            })
    return products


def make_customers(n=500):
    customers = []
    for _ in range(n):
        customers.append({
            "_id": nid("cust"),
            "email": fake.unique.email(),
            "name": fake.name(),
            "created_at": now_iso(),
        })
    return customers


def make_orders(products, customers, n=5000):
    by_group: dict[str, list[dict]] = {}
    for p in products:
        by_group.setdefault(p["_companion_group"], []).append(p)

    orders = []
    cart_events = []
    start = datetime.now(timezone.utc) - timedelta(days=180)

    for _ in range(n):
        customer = random.choice(customers)
        group = random.choice(list(by_group.keys()))
        group_products = by_group[group]
        mains = [p for p in group_products if not p.get("_is_companion")]
        companions = [p for p in group_products if p.get("_is_companion")]

        hero_mains = [p for p in mains if p.get("_is_hero")]
        other_mains = [p for p in mains if not p.get("_is_hero")]
        # Bias toward the category's "hero" product line so the hero+companion
        # pair accumulates enough support for association-rule mining to detect it.
        if hero_mains and (not other_mains or random.random() < 0.65):
            main = random.choice(hero_mains)
        else:
            main = random.choice(other_mains or mains)
        items = [{"product_id": main["_id"], "name": main["name"], "quantity": 1,
                  "price": round(main["price"] * (1 - main.get("discount", 0) / 100), 2)}]

        # Intentional co-purchase pattern: ~55% of the time buy the companion too.
        if companions and random.random() < 0.55:
            comp = random.choice(companions)
            items.append({"product_id": comp["_id"], "name": comp["name"], "quantity": 1,
                           "price": round(comp["price"] * (1 - comp.get("discount", 0) / 100), 2)})

        # occasionally add an unrelated impulse item
        if random.random() < 0.12:
            extra = random.choice(products)
            if extra["_id"] not in [i["product_id"] for i in items]:
                items.append({"product_id": extra["_id"], "name": extra["name"], "quantity": 1,
                               "price": round(extra["price"] * (1 - extra.get("discount", 0) / 100), 2)})

        subtotal = sum(i["price"] * i["quantity"] for i in items)
        created_at = start + timedelta(days=random.uniform(0, 180))
        payment_status = random.choices(["paid", "failed"], weights=[0.93, 0.07])[0]

        order = {
            "_id": nid("order"),
            "customer_id": customer["_id"],
            "merchant_id": MERCHANT_ID,
            "items": items,
            "subtotal": round(subtotal, 2),
            "discount": 0,
            "total": round(subtotal, 2),
            "razorpay_order_id": f"order_seed_{uuid.uuid4().hex[:12]}",
            "payment_status": payment_status,
            "order_status": "confirmed" if payment_status == "paid" else "cancelled",
            "ai_attributed": random.random() < 0.4,
            "created_at": created_at.isoformat(),
        }
        orders.append(order)
        cart_events.append({
            "_id": nid("evt"), "event_type": "checkout_started", "customer_id": customer["_id"],
            "data": {"event": "checkout_started", "order_id": order["_id"]}, "created_at": created_at.isoformat(),
        })
    return orders, cart_events


def main():
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]
    try:
        client.admin.command("ping")
    except Exception as e:
        print(f"ERROR: cannot connect to MongoDB at {settings.mongodb_uri}: {e}")
        sys.exit(1)

    print("Clearing existing demo data...")
    for coll in ["products", "customers", "orders", "carts", "search_events", "cart_events",
                 "recommendation_events", "customer_segments", "growth_opportunities", "bundles",
                 "audit_logs", "agent_conversations"]:
        db[coll].delete_many({})

    print("Creating merchant...")
    db.merchants.update_one(
        {"_id": MERCHANT_ID},
        {"$set": {"_id": MERCHANT_ID, "name": "Mercora Demo Store", "created_at": now_iso(),
                   "guardrails": {"max_discount": 10, "max_bundle_discount": 15,
                                   "automatic_campaign_creation": False,
                                   "automatic_price_changes": False,
                                   "merchant_approval_required": True}}},
        upsert=True,
    )

    print("Generating products...")
    products_raw = make_products()
    clean_products = []
    for p in products_raw:
        clean = dict(p)
        clean.pop("_companion_group", None)
        clean.pop("_is_companion", None)
        clean.pop("_is_hero", None)
        clean_products.append(clean)
    db.products.insert_many(clean_products)
    print(f"Inserted {len(products_raw)} products.")

    print("Generating customers...")
    customers = make_customers(500)
    db.customers.insert_many(customers)
    print(f"Inserted {len(customers)} customers.")

    print("Generating orders (this encodes intentional co-purchase patterns)...")
    orders, cart_events = make_orders(products_raw, customers, n=5000)
    db.orders.insert_many(orders)
    if cart_events:
        db.cart_events.insert_many(cart_events)
    print(f"Inserted {len(orders)} orders and {len(cart_events)} checkout events.")

    db.products.create_index("merchant_id")
    db.products.create_index("category")
    db.products.create_index([("name", "text"), ("description", "text"), ("tags", "text")])
    db.orders.create_index("customer_id")
    db.orders.create_index("merchant_id")
    db.orders.create_index("created_at")
    db.carts.create_index("customer_id", unique=True)
    db.customers.create_index("email", unique=True)

    print("Seed complete.")


if __name__ == "__main__":
    main()
