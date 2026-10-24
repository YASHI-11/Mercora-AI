"""Loads the cleaned Mercora ML dataset (mercora_ml_dataset.csv -- the Kaggle
"Online Retail" UK invoices, https://www.kaggle.com/datasets/tunguz/online-retail,
pre-cleaned and enriched with a category/subcategory taxonomy, implicit
ratings, per-product popularity and per-customer RFM columns) into
Mercora's Mongo schema under the demo merchant. This dataset IS the store's
catalog and order history.

What the dataset provides is used as-is: product category and subcategory
(10 categories / 57 subcategories, assigned to every product by
scripts/fix_dataset.py's product-type rules -- run that first on a raw
file), canonical price, implicit rating (+ how many customers it is based
on), order/unit popularity, and customer country. Where the file is blank:
- A product with no category/subcategory (none in the cleaned file; only a
  raw file that skipped fix_dataset.py would have them) is stored as
  "Uncategorized" / "Uncategorized" (`category_source: "uncategorized"`)
  rather than guessed.
- Products with too few buyers have no implicit rating; they get their
  category's median rating and `rating_imputed: True`.
Guest invoices (no customer_id) are skipped -- an order has to belong to a
customer in this schema.

Dates: every order is shifted forward by the single fixed DATE_SHIFT so the
dataset's last invoice (2011-12-09) lands on 2026-10-23. Gaps between orders
are exactly as in the file (recency/frequency stay real), dashboards and
segmentation work against "now", and the file's own timestamp is kept in
`source_order_date`.

Images: the dataset has none, so `image` comes from data/product_images.json
(built by scripts/fetch_product_images.py): an openly licensed Wikimedia
Commons photo of the product's TYPE -- illustrative, not the exact item --
with author/licence/source in `image_credit` for attribution. Products
without one keep `image: ""` and the frontend renders a generated
category/subcategory tile (components/ProductImage.tsx).

Retail documents use deterministic ids (prod_retail_<stock code>,
cust_retail_<id>, order_retail_<invoice>), so re-running is an idempotent
upsert, and retail documents absent from this dataset are pruned (along with
pending growth opportunities that point at pruned products).

Usage (from backend/, with venv activated):
    python scripts/seed_kaggle_retail.py [path/to/mercora_ml_dataset.csv]
"""
import csv
import json
import os
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from pymongo import DeleteMany, MongoClient, ReplaceOne

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import get_settings  # noqa: E402
from app.schemas.product import UNCATEGORIZED  # noqa: E402

settings = get_settings()
MERCHANT_ID = settings.default_merchant_id

# The dataset is priced in GBP; scale into the same rough INR range the rest of
# the demo catalog uses so cross-sell/discount logic sees comparable numbers.
GBP_TO_INR = 105.0

DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "..", "..", "mercora_ml_dataset.csv")
IMAGES_JSON = os.path.join(os.path.dirname(__file__), "..", "data", "product_images.json")
STOCK_CODE_PREFIX = "OR-"
WRITE_BATCH = 2000
# Fixed (not "now"-relative) so re-imports are idempotent: the file's last
# invoice, 2011-12-09, maps to 2026-10-23 (same time of day).
DATE_SHIFT = datetime(2026, 10, 23) - datetime(2011, 12, 9)

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
SET_OF_RE = re.compile(r"\bSET OF (\d+)\b|\bPACK OF (\d+)\b", re.IGNORECASE)


def extract_features(description: str) -> list[str]:
    words = re.findall(r"[a-z]+", description.lower())
    seen = []
    for w in words:
        label = FEATURE_KEYWORDS.get(w)
        if label and label not in seen:
            seen.append(label)
        if len(seen) >= 4:
            break
    m = SET_OF_RE.search(description)
    if m:
        seen.insert(0, f"Set of {m.group(1) or m.group(2)}")
    return seen[:4]


def nid(prefix, key):
    """Deterministic id from a stable natural key so re-running the import is
    idempotent (upsert) instead of piling up duplicate documents."""
    return f"{prefix}_retail_{key}"


def stock_code_of(product_id: str) -> str:
    """The dataset's product_id is the original StockCode with an "OR-" prefix;
    stripping it keeps ids identical to the earlier Online_Retail.csv import,
    so existing carts/bundles that reference those products stay valid."""
    return product_id[len(STOCK_CODE_PREFIX):] if product_id.startswith(STOCK_CODE_PREFIX) else product_id


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def title_case(description: str) -> str:
    return " ".join(w.capitalize() for w in description.strip().split())


def parse_order_date(raw: str) -> datetime:
    # Dataset format: "2010-12-01T08:26:00" (naive, UK local time) -> UTC-aware
    return datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)


def shifted(source_date: datetime) -> datetime:
    return source_date + DATE_SHIFT


def _float_or_none(raw: str):
    raw = (raw or "").strip()
    return float(raw) if raw else None


def load_rows(csv_path: str):
    """Yields one dict per line item. Guest invoices (no customer_id) and any
    non-positive quantity/price rows are skipped."""
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            customer_id = (row["customer_id"] or "").strip()
            if not customer_id:
                continue
            try:
                quantity = int(row["quantity"])
                unit_price = float(row["unit_price"])
                price = float(row["price"])
            except ValueError:
                continue
            if quantity <= 0 or unit_price <= 0 or price <= 0:
                continue
            yield {
                "order_id": row["order_id"].strip(),
                "order_date": row["order_date"],
                "customer_id": customer_id,
                "country": row["country"].strip(),
                "stock_code": stock_code_of(row["product_id"].strip()),
                "product_name": row["product_name"].strip(),
                "category": (row["category"] or "").strip() or None,
                "subcategory": (row["subcategory"] or "").strip() or None,
                "price": price,
                "unit_price": unit_price,
                "quantity": quantity,
                "order_count": int(row["order_count"]),
                "units_sold": int(row["units_sold"]),
                "implicit_rating": _float_or_none(row["implicit_rating"]),
                "implicit_rating_customers": int(row["implicit_rating_customers"]),
            }


def load_images(path: str = IMAGES_JSON) -> dict[str, dict]:
    """stock code -> {url, author, license, source, title} from
    product_images.json; empty if the file is absent (products then get the
    frontend's generated tile)."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    pools = data.get("pools", {})
    images = {}
    for code, (query, index) in data.get("products", {}).items():
        pool = pools.get(query) or []
        if pool:
            images[code] = pool[index % len(pool)]
    return images


def build_products(rows, images: dict[str, dict] | None = None):
    """One product per stock code. Product-level columns (name, category,
    price, popularity, rating) are constant per product in the dataset, so
    the first row seen is authoritative."""
    images = images or {}
    product_rows: dict[str, dict] = {}
    for r in rows:
        if r["stock_code"] in product_rows:
            continue
        if r["category"] and r["subcategory"]:
            product_rows[r["stock_code"]] = {**r, "category_source": "dataset"}
        else:
            product_rows[r["stock_code"]] = {**r, "category": UNCATEGORIZED, "subcategory": UNCATEGORIZED,
                                             "category_source": "uncategorized"}

    ratings_by_category: dict[str, list[float]] = defaultdict(list)
    for r in product_rows.values():
        if r["implicit_rating"] is not None:
            ratings_by_category[r["category"]].append(r["implicit_rating"])
    all_ratings = [x for v in ratings_by_category.values() for x in v]
    fallback_rating = median(all_ratings) if all_ratings else 3.0

    products = {}
    for stock_code, r in product_rows.items():
        name = title_case(r["product_name"])
        category, subcategory = r["category"], r["subcategory"]
        features = extract_features(r["product_name"])
        rating_imputed = r["implicit_rating"] is None
        rating = (median(ratings_by_category[category]) if ratings_by_category.get(category)
                  else fallback_rating) if rating_imputed else r["implicit_rating"]
        products[stock_code] = {
            "_id": nid("prod", stock_code),
            "merchant_id": MERCHANT_ID,
            "name": name,
            "category": category,
            "subcategory": subcategory,
            "category_source": r["category_source"],
            "brand": "Online Retail Co.",
            "description": (f"{name} -- from the {subcategory} collection in our {category} range."
                            if category != UNCATEGORIZED else f"{name} -- from our gift and homeware catalogue."),
            "price": round(r["price"] * GBP_TO_INR, 2),
            "discount": 0,
            # Not in the dataset; stable per product so re-imports don't churn stock levels.
            "inventory": int(uuid.uuid5(uuid.NAMESPACE_DNS, f"inv:{stock_code}").hex[:4], 16) % 191 + 10,
            "rating": round(rating, 1),
            "rating_count": r["implicit_rating_customers"],
            "rating_imputed": rating_imputed,
            "order_count": r["order_count"],
            "units_sold": r["units_sold"],
            "features": features,
            "tags": [category.lower(), subcategory.lower()]
                    + [w.lower() for w in name.split()[:3]] + [f.lower() for f in features],
            "image": images[stock_code]["url"] if stock_code in images else "",
            "image_credit": ({k: images[stock_code][k] for k in ("author", "license", "source")}
                             if stock_code in images else None),
            "created_at": now_iso(),
        }
    return products


def build_customers(rows):
    customers = {}
    for r in rows:
        original_id = r["customer_id"]
        if original_id in customers:
            continue
        customers[original_id] = {
            "_id": nid("cust", original_id),
            "email": f"retail.customer.{original_id}@example.com",
            "name": f"Retail Customer {original_id}",
            "country": r["country"],
            "created_at": now_iso(),
        }
    return customers


def build_orders(rows, products, customers):
    by_order: dict[str, list] = defaultdict(list)
    for r in rows:
        by_order[r["order_id"]].append(r)

    orders = []
    for order_id, line_rows in by_order.items():
        first = line_rows[0]
        try:
            source_date = parse_order_date(first["order_date"])
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
            "_id": nid("order", order_id),
            "customer_id": customers[first["customer_id"]]["_id"],
            "merchant_id": MERCHANT_ID,
            "items": items,
            "subtotal": subtotal,
            "discount": 0,
            "total": subtotal,
            "razorpay_order_id": f"order_retail_{order_id}",
            "payment_status": "paid",
            "order_status": "confirmed",
            "ai_attributed": False,
            "country": first["country"],
            "source_order_date": source_date.isoformat(),
            "created_at": shifted(source_date).isoformat(),
        })
    return orders


def upsert_all(collection, docs) -> int:
    written = 0
    for start in range(0, len(docs), WRITE_BATCH):
        batch = docs[start:start + WRITE_BATCH]
        result = collection.bulk_write(
            [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in batch], ordered=False
        )
        written += result.upserted_count + result.matched_count
    return written


def prune_stale(collection, prefix: str, keep_ids: set[str]) -> list[str]:
    """Deletes retail documents (by id prefix) that this dataset no longer contains."""
    existing = [d["_id"] for d in collection.find({"_id": {"$regex": f"^{prefix}"}}, {"_id": 1})]
    stale = [i for i in existing if i not in keep_ids]
    for start in range(0, len(stale), WRITE_BATCH):
        collection.bulk_write([DeleteMany({"_id": {"$in": stale[start:start + WRITE_BATCH]}})])
    return stale


def main():
    csv_path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV)
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
    print(f"Kept {len(rows)} customer line items (guest invoices and invalid rows skipped).")

    print("Building products (one per stock code)...")
    images = load_images()
    products = build_products(rows, images)
    uncategorized = sum(1 for p in products.values() if p["category_source"] == "uncategorized")
    imputed = sum(1 for p in products.values() if p["rating_imputed"])
    file_categories = {p["category"] for p in products.values()} - {UNCATEGORIZED}
    file_subcategories = {p["subcategory"] for p in products.values()} - {UNCATEGORIZED}
    print(f"Built {len(products)} products: {len(file_categories)} categories / {len(file_subcategories)} "
          f"subcategories from the file, {uncategorized} blank in the file -> {UNCATEGORIZED}; "
          f"{imputed} with an imputed category-median rating; "
          f"{sum(1 for p in products.values() if p['image'])} with a photo.")

    customers = build_customers(rows)
    print(f"Built {len(customers)} customers.")

    orders = build_orders(rows, products, customers)
    print(f"Built {len(orders)} orders (real baskets; dates shifted +{DATE_SHIFT.days} days, "
          f"originals in source_order_date).")

    db.merchants.update_one({"_id": MERCHANT_ID}, {"$setOnInsert": {
        "_id": MERCHANT_ID, "name": "Mercora Demo Store", "created_at": now_iso(),
        "guardrails": {"max_discount": 10, "max_bundle_discount": 15,
                        "automatic_campaign_creation": False,
                        "automatic_price_changes": False,
                        "merchant_approval_required": True},
    }}, upsert=True)

    print(f"Upserted {upsert_all(db.products, list(products.values()))} products.")
    print(f"Upserted {upsert_all(db.customers, list(customers.values()))} customers.")
    print(f"Upserted {upsert_all(db.orders, orders)} orders.")

    stale_products = prune_stale(db.products, "prod_retail_", {p["_id"] for p in products.values()})
    stale_customers = prune_stale(db.customers, "cust_retail_", {c["_id"] for c in customers.values()})
    stale_orders = prune_stale(db.orders, "order_retail_", {o["_id"] for o in orders})
    stale_opps = 0
    if stale_products:
        stale_opps = db.growth_opportunities.delete_many(
            {"status": "pending", "products": {"$in": stale_products}}
        ).deleted_count
    print(f"Pruned stale retail docs from an earlier import: {len(stale_products)} products, "
          f"{len(stale_customers)} customers, {len(stale_orders)} orders, {stale_opps} pending opportunities.")

    db.products.create_index("merchant_id")
    db.products.create_index("category")
    db.products.create_index([("name", "text"), ("description", "text"), ("tags", "text")])
    db.orders.create_index("customer_id")
    db.orders.create_index("merchant_id")
    db.orders.create_index("created_at")
    db.customers.create_index("email", unique=True)

    print("Mercora ML dataset loaded.")


if __name__ == "__main__":
    main()
