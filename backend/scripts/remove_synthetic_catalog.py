"""One-off migration: removes the synthetic electronics demo catalog that the
old scripts/seed_data.py (now deleted) generated, so the store's catalog and history are
exactly mercora_ml_dataset.csv (see scripts/seed_kaggle_retail.py).

Only seed-generated documents are removed, identified by markers the seed
script left on them:
- products: not a retail id, and either carries the seed's _companion_group
  field or has one of the seed's categories AND one of its brands
- orders:   not a retail id, and either razorpay_order_id starts with
  "order_seed" or (no razorpay_order_id at all -- every real checkout sets
  one -- and every item is a synthetic product)
- customers: not a retail id, no phone (OTP-registered customers always
  have one), referenced by a removed order, and by no kept order or cart
- cart_events tied to a removed order
Real app activity is kept: orders placed through checkout stay as order
history (their line items carry name + price, so invoices still render),
synthetic items are pulled out of carts, pending opportunities that point
at removed products are deleted and bundles that do are deactivated.

Dry run by default -- prints what it would do. Pass --apply to write.
Usage (from backend/, with venv activated):
    python scripts/remove_synthetic_catalog.py [--apply]
"""
import os
import sys

from pymongo import MongoClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import get_settings  # noqa: E402

settings = get_settings()

SEED_CATEGORIES = {"Audio", "Laptops", "Gaming", "Accessories", "Smartwatches", "Cameras",
                   "Home Office", "Electronics"}
SEED_BRANDS = {
    "SonicWave", "BassPro", "EchoTech", "AudioMax", "NimbusBook", "CoreForge", "ZenLine", "TitanTech",
    "PulseGear", "ArcadeX", "NovaPlay", "ConnectPro", "PowerLine", "GripTech", "PulseFit", "OrbitWear",
    "ChronoTech", "LumaShot", "PixelPro", "FrameWorks", "DeskCraft", "ViewPoint", "ErgoLine",
    "NovaTech", "SwiftLine", "ClearView",
}
BATCH = 1000


def _batches(ids: list[str]):
    for start in range(0, len(ids), BATCH):
        yield ids[start:start + BATCH]


def find_synthetic(db) -> dict:
    products = [
        p["_id"] for p in db.products.find(
            {"_id": {"$not": {"$regex": "^prod_retail_"}}},
            {"_id": 1, "category": 1, "brand": 1, "_companion_group": 1},
        )
        if "_companion_group" in p or (p.get("category") in SEED_CATEGORIES and p.get("brand") in SEED_BRANDS)
    ]
    product_set = set(products)

    remove_orders, keep_customer_refs = [], set()
    for o in db.orders.find({"_id": {"$not": {"$regex": "^order_retail_"}}},
                            {"_id": 1, "customer_id": 1, "razorpay_order_id": 1, "items.product_id": 1}):
        rp = o.get("razorpay_order_id")
        seeded = (isinstance(rp, str) and rp.startswith("order_seed")) or (
            "razorpay_order_id" not in o and o.get("items")
            and all(i["product_id"] in product_set for i in o["items"])
        )
        if seeded:
            remove_orders.append(o)
        else:
            keep_customer_refs.add(o["customer_id"])
    keep_customer_refs |= {c["customer_id"] for c in db.carts.find({}, {"customer_id": 1})}

    seed_order_customers = {o["customer_id"] for o in remove_orders}
    customers = [
        c["_id"] for c in db.customers.find(
            {"_id": {"$not": {"$regex": "^cust_retail_"}}, "phone": {"$exists": False}}, {"_id": 1}
        )
        if c["_id"] in seed_order_customers and c["_id"] not in keep_customer_refs
    ]
    order_ids = [o["_id"] for o in remove_orders]
    cart_events = db.cart_events.count_documents({"data.order_id": {"$in": order_ids}}) if order_ids else 0
    return {"products": products, "orders": order_ids, "customers": customers, "cart_events": cart_events}


def main():
    apply = "--apply" in sys.argv[1:]
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]
    client.admin.command("ping")
    host = settings.mongodb_uri.split("@")[-1].split("//")[-1].split("/")[0]
    print(f"Target: {host} / {settings.database_name}  ({'APPLY' if apply else 'dry run'})")

    found = find_synthetic(db)
    products = found["products"]
    pending_opps = db.growth_opportunities.count_documents({"status": "pending", "products": {"$in": products}})
    bundles = db.bundles.count_documents({"active": True, "products": {"$in": products}})
    carts = db.carts.count_documents({"items.product_id": {"$in": products}})
    kept_orders_touching = db.orders.count_documents(
        {"_id": {"$nin": found["orders"]}, "items.product_id": {"$in": products}}
    )
    print(f"  synthetic products:   {len(products)}")
    print(f"  seed orders:          {len(found['orders'])}")
    print(f"  seed customers:       {len(found['customers'])}")
    print(f"  seed cart_events:     {found['cart_events']}")
    print(f"  pending opportunities to delete: {pending_opps}; bundles to deactivate: {bundles}; "
          f"carts to clean: {carts}")
    print(f"  real orders kept that include synthetic items (history, unchanged): {kept_orders_touching}")
    if not apply:
        print("Dry run only -- re-run with --apply to make these changes.")
        return

    for ids in _batches(found["orders"]):
        db.cart_events.delete_many({"data.order_id": {"$in": ids}})
        db.orders.delete_many({"_id": {"$in": ids}})
    for ids in _batches(found["customers"]):
        db.customers.delete_many({"_id": {"$in": ids}})
    if products:
        db.growth_opportunities.delete_many({"status": "pending", "products": {"$in": products}})
        db.bundles.update_many({"active": True, "products": {"$in": products}}, {"$set": {"active": False}})
        db.carts.update_many({}, {"$pull": {"items": {"product_id": {"$in": products}}}})
    for ids in _batches(products):
        db.products.delete_many({"_id": {"$in": ids}})
    print("Synthetic catalog removed.")


if __name__ == "__main__":
    main()
