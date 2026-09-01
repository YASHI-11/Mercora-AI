"""Converts the Kaggle "Online Retail" UK e-commerce dataset (Online_Retail.csv,
https://www.kaggle.com/datasets/tunguz/online-retail) into Mercora's Mongo schema
and inserts it into the SAME collections used by scripts/seed_data.py, under the
same demo merchant.

This is additive by design: it does NOT clear products/customers/orders first, so
it can be layered on top of the synthetic seed_data.py catalog (run seed_data.py
first, then this) or run standalone. Real basket data needs no synthetic
hero/companion weighting -- the actual co-purchase patterns already in the
invoices are what feeds the association-rule miner real signal.

Usage (from backend/, with venv activated):
    python scripts/seed_kaggle_retail.py [path/to/Online_Retail.csv]
"""
import csv
import os
import random
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone

from pymongo import MongoClient, ReplaceOne

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import get_settings  # noqa: E402

random.seed(7)

settings = get_settings()
MERCHANT_ID = settings.default_merchant_id

# The dataset is priced in GBP; scale into the same rough INR range the rest of
# the demo catalog uses so cross-sell/discount logic sees comparable numbers.
GBP_TO_INR = 105.0

# Non-product line items (postage, bank fees, manual adjustments, etc.) that
# should never become "products".
NON_PRODUCT_CODES = {
    "POST", "DOT", "M", "m", "C2", "D", "S", "B", "BANK CHARGES",
    "AMAZONFEE", "CRUK", "PADS", "ADJUST",
}

CATEGORY_RULES = [
    ("Christmas & Seasonal", ["christmas", "xmas", "advent", "santa", "reindeer", "snowman"]),
    ("Kitchen & Dining", ["mug", "cup", "kitchen", "teapot", "cake", "baking", "tin", "jar", "spoon", "bowl", "plate", "tray"]),
    ("Home Decor", ["light", "candle", "holder", "lantern", "frame", "clock", "sign", "mirror", "cushion", "curtain"]),
    ("Bags & Purses", ["bag", "purse", "wallet"]),
    ("Stationery & Cards", ["card", "notebook", "paper", "pen", "pencil", "envelope", "stamp", "sticker"]),
    ("Jewellery & Accessories", ["necklace", "bracelet", "earring", "ring", "jewel", "hair"]),
    ("Toys & Games", ["toy", "game", "doll", "puzzle", "playhouse", "block"]),
    ("Garden & Outdoor", ["garden", "plant", "pot", "outdoor"]),
    ("Bathroom & Textiles", ["towel", "bath", "soap", "blanket", "cushion"]),
]
DEFAULT_CATEGORY = "General Gifts"

# Descriptive words present in the raw dataset descriptions, mapped to a
# human-readable feature label -- this is what lets the recommendation engine
# (and the "why recommended" UI) explain a match on something more specific
# than just category, e.g. "Shares Glass, Heart Motif with ...".
FEATURE_KEYWORDS = {
    "red": "Red", "white": "White", "blue": "Blue", "green": "Green", "pink": "Pink",
    "black": "Black", "silver": "Silver", "gold": "Gold", "yellow": "Yellow",
    "purple": "Purple", "ivory": "Ivory", "cream": "Cream", "natural": "Natural finish",
    "orange": "Orange", "grey": "Grey", "gray": "Grey", "brown": "Brown",
    "wood": "Wooden", "wooden": "Wooden", "metal": "Metal", "glass": "Glass",
    "ceramic": "Ceramic", "porcelain": "Porcelain", "felt": "Felt", "cotton": "Cotton",
    "paper": "Paper", "tin": "Tin", "wicker": "Wicker", "knitted": "Knitted",
    "vintage": "Vintage style", "retro": "Retro style", "heart": "Heart motif",
    "floral": "Floral pattern", "stripe": "Striped pattern", "stripes": "Striped pattern",
    "polkadot": "Polka dot pattern", "christmas": "Christmas themed", "flower": "Floral pattern",
    "mini": "Compact size", "large": "Large size", "small": "Small size",
    "hanging": "Hangable", "light": "Illuminated", "lights": "Illuminated",
}

def _feature_pattern():
    import re
    return re.compile(r"\bSET OF (\d+)\b|\bPACK OF (\d+)\b", re.IGNORECASE)


def extract_features(description: str) -> list[str]:
    import re
    text = description.lower()
    words = re.findall(r"[a-z]+", text)
    seen = []
    for w in words:
        label = FEATURE_KEYWORDS.get(w)
        if label and label not in seen:
            seen.append(label)
        if len(seen) >= 4:
            break
    m = _feature_pattern().search(description)
    if m:
        count = m.group(1) or m.group(2)
        seen.insert(0, f"Set of {count}")
    return seen[:4]


def nid(prefix, key):
    """Deterministic id from a stable natural key so re-running the import is
    idempotent (upsert) instead of piling up duplicate documents."""
    return f"{prefix}_retail_{key}"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def categorize(description: str) -> str:
    text = description.lower()
    for category, keywords in CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return category
    return DEFAULT_CATEGORY


# loremflickr.com serves a live Flickr tag search: a single generic tag
# alone (e.g. "camera" or "watch") is unreliable, but a pair of two specific
# nouns reliably narrows to a real, on-topic photo (verified by hand across
# ~40 live spot checks earlier). Each product's own descriptive noun is paired
# with its category's anchor word below, giving every distinct item a
# distinct, still-relevant photo instead of one image shared by an entire
# category.
CATEGORY_IMAGE_ANCHOR = {
    "Christmas & Seasonal": "christmas",
    "Kitchen & Dining": "kitchen",
    "Home Decor": "decor",
    "Bags & Purses": "bag",
    "Stationery & Cards": "stationery",
    "Jewellery & Accessories": "jewellery",
    "Toys & Games": "toy",
    "Garden & Outdoor": "garden",
    "Bathroom & Textiles": "bathroom",
    "General Gifts": "gift",
}
_IMAGE_KEYWORD_STOPWORDS = {
    "the", "and", "with", "for", "set", "pack", "no", "of", "in", "a", "to", "on",
}


def image_keyword_for(description: str, category: str) -> str:
    """The item's own descriptive noun paired with its category anchor,
    e.g. "holder,decor" or "necklace,jewellery"."""
    import re
    words = re.findall(r"[a-zA-Z]+", description.lower())
    anchor = CATEGORY_IMAGE_ANCHOR.get(category, "gift")
    noun = next((w for w in reversed(words) if len(w) >= 4 and w not in _IMAGE_KEYWORD_STOPWORDS), None)
    return f"{noun},{anchor}" if noun and noun != anchor else anchor


def image_url(stock_code: str, keyword: str) -> str:
    """Deterministic per-product photo pick from the keyword's live tag pool."""
    lock = int(uuid.uuid5(uuid.NAMESPACE_DNS, stock_code).hex[:6], 16) % 400 + 1
    return f"https://loremflickr.com/500/500/{keyword}?lock={lock}"


def parse_invoice_date(raw: str) -> datetime:
    # Dataset format: "12/1/10 8:26" -> M/D/YY H:MM
    dt = datetime.strptime(raw, "%m/%d/%y %H:%M")
    return dt.replace(tzinfo=timezone.utc)


def title_case(description: str) -> str:
    return " ".join(w.capitalize() for w in description.strip().split())


def load_rows(csv_path: str):
    with open(csv_path, "r", encoding="latin1", newline=None) as f:
        reader = csv.DictReader(f)
        for row in reader:
            invoice_no = row["InvoiceNo"].strip()
            stock_code = row["StockCode"].strip()
            description = (row["Description"] or "").strip()
            customer_id = row["CustomerID"].strip()

            if not customer_id or not description or not stock_code:
                continue
            if stock_code in NON_PRODUCT_CODES or stock_code.startswith("gift_"):
                continue
            if invoice_no.startswith("C"):  # cancellation/return
                continue
            try:
                quantity = int(float(row["Quantity"]))
                unit_price = float(row["UnitPrice"])
            except ValueError:
                continue
            if quantity <= 0 or unit_price <= 0:
                continue

            yield {
                "invoice_no": invoice_no,
                "stock_code": stock_code,
                "description": description,
                "quantity": quantity,
                "unit_price": unit_price,
                "customer_id": customer_id,
                "invoice_date": row["InvoiceDate"],
            }


def build_products(rows):
    """One product per StockCode; uses the most common description variant and
    the median unit price seen across all its line items."""
    descriptions: dict[str, Counter] = defaultdict(Counter)
    prices: dict[str, list] = defaultdict(list)

    for r in rows:
        descriptions[r["stock_code"]][r["description"]] += 1
        prices[r["stock_code"]].append(r["unit_price"])

    products = {}
    for stock_code, desc_counter in descriptions.items():
        best_description = desc_counter.most_common(1)[0][0]
        price_list = sorted(prices[stock_code])
        median_price = price_list[len(price_list) // 2]
        category = categorize(best_description)
        name = title_case(best_description)
        pid = nid("prod", stock_code)
        features = extract_features(best_description)
        products[stock_code] = {
            "_id": pid,
            "merchant_id": MERCHANT_ID,
            "name": name,
            "category": category,
            "brand": "Online Retail Co.",
            "description": f"{name} -- a UK online-retail catalog item ({stock_code}).",
            "price": round(median_price * GBP_TO_INR, 2),
            "discount": random.choice([0, 0, 0, 5, 10]),
            "inventory": random.randint(10, 200),
            "rating": round(random.uniform(3.5, 5.0), 1),
            "features": features,
            "tags": [category.lower()] + [w.lower() for w in name.split()[:3]] + [f.lower() for f in features],
            "image": image_url(stock_code, image_keyword_for(best_description, category)),
            "created_at": now_iso(),
        }
    return products


def build_customers(rows):
    ids = {r["customer_id"] for r in rows}
    customers = {}
    for original_id in ids:
        cid = nid("cust", original_id)
        customers[original_id] = {
            "_id": cid,
            "email": f"retail.customer.{original_id}@example.com",
            "name": f"Retail Customer {original_id}",
            "created_at": now_iso(),
        }
    return customers


def build_orders(rows, products, customers):
    by_invoice: dict[str, list] = defaultdict(list)
    for r in rows:
        if r["stock_code"] not in products:
            continue
        by_invoice[r["invoice_no"]].append(r)

    orders = []
    for invoice_no, line_rows in by_invoice.items():
        customer_id = line_rows[0]["customer_id"]
        if customer_id not in customers:
            continue
        try:
            created_at = parse_invoice_date(line_rows[0]["invoice_date"])
        except ValueError:
            continue

        items = []
        for r in line_rows:
            product = products[r["stock_code"]]
            items.append({
                "product_id": product["_id"],
                "name": product["name"],
                "quantity": r["quantity"],
                "price": round(r["unit_price"] * GBP_TO_INR, 2),
            })
        subtotal = round(sum(i["price"] * i["quantity"] for i in items), 2)

        orders.append({
            "_id": nid("order", invoice_no),
            "customer_id": customers[customer_id]["_id"],
            "merchant_id": MERCHANT_ID,
            "items": items,
            "subtotal": subtotal,
            "discount": 0,
            "total": subtotal,
            "razorpay_order_id": f"order_retail_{uuid.uuid4().hex[:12]}",
            "payment_status": "paid",
            "order_status": "confirmed",
            "ai_attributed": False,
            "created_at": created_at.isoformat(),
        })
    return orders


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "..", "Online_Retail.csv"
    )
    csv_path = os.path.abspath(csv_path)
    if not os.path.exists(csv_path):
        print(f"ERROR: CSV not found at {csv_path}")
        sys.exit(1)

    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]
    try:
        client.admin.command("ping")
    except Exception as e:
        print(f"ERROR: cannot connect to MongoDB at {settings.mongodb_uri}: {e}")
        sys.exit(1)

    print(f"Reading {csv_path} ...")
    rows = list(load_rows(csv_path))
    print(f"Kept {len(rows)} valid line items after filtering returns/non-products/missing customers.")

    print("Building products (one per StockCode)...")
    products = build_products(rows)
    print(f"Built {len(products)} products across {len({p['category'] for p in products.values()})} categories.")

    print("Building customers...")
    customers = build_customers(rows)
    print(f"Built {len(customers)} customers.")

    print("Building orders (real historical baskets, no synthetic weighting)...")
    orders = build_orders(rows, products, customers)
    print(f"Built {len(orders)} orders.")

    db.merchants.update_one({"_id": MERCHANT_ID}, {"$setOnInsert": {
        "_id": MERCHANT_ID, "name": "Mercora Demo Store", "created_at": now_iso(),
        "guardrails": {"max_discount": 10, "max_bundle_discount": 15,
                        "automatic_campaign_creation": False,
                        "automatic_price_changes": False,
                        "merchant_approval_required": True},
    }}, upsert=True)

    def upsert_all(collection, docs):
        if not docs:
            return 0
        result = collection.bulk_write(
            [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs], ordered=False
        )
        return result.upserted_count + result.modified_count

    n = upsert_all(db.products, list(products.values()))
    print(f"Upserted {n} products.")
    n = upsert_all(db.customers, list(customers.values()))
    print(f"Upserted {n} customers.")
    n = upsert_all(db.orders, orders)
    print(f"Upserted {n} orders.")

    db.products.create_index("merchant_id")
    db.products.create_index("category")
    db.products.create_index([("name", "text"), ("description", "text"), ("tags", "text")])
    db.orders.create_index("customer_id")
    db.orders.create_index("merchant_id")
    db.orders.create_index("created_at")
    db.customers.create_index("email", unique=True)

    print("Kaggle Online Retail data merged in.")


if __name__ == "__main__":
    main()
