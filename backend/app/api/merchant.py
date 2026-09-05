from fastapi import APIRouter
from app.database.connection import get_db
from app.agents.growth_agent import get_revenue_metrics, get_product_metrics, get_customer_segments, fetch_paid_orders, fetch_products
from app.config import get_settings
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/merchant", tags=["merchant"])
settings = get_settings()


@router.get("/overview")
async def overview(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    all_orders = await fetch_paid_orders(mid)
    ai_orders = sum(1 for o in all_orders if o.get("ai_attributed"))
    carts_started = await db.cart_events.count_documents({"data.event": "checkout_started"})
    revenue = get_revenue_metrics(all_orders, carts_started)
    ai_revenue = sum(o.get("total", 0) for o in all_orders if o.get("ai_attributed"))
    opportunities_count = await db.growth_opportunities.count_documents({"merchant_id": mid, "status": "pending"})
    return {
        **revenue,
        "ai_attributed_revenue": round(ai_revenue, 2),
        "ai_attributed_orders": ai_orders,
        "growth_opportunities_count": opportunities_count,
    }


@router.get("/analytics/timeseries")
async def timeseries(merchant_id: str | None = None, days: int = 30):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    orders = await db.orders.find({"merchant_id": mid, "payment_status": "paid"}).to_list(length=20000)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    buckets: dict[str, dict] = {}
    for o in orders:
        created = datetime.fromisoformat(o["created_at"])
        if created < since:
            continue
        key = created.strftime("%Y-%m-%d")
        b = buckets.setdefault(key, {"date": key, "revenue": 0, "orders": 0})
        b["revenue"] += o.get("total", 0)
        b["orders"] += 1

    series = sorted(buckets.values(), key=lambda b: b["date"])
    for b in series:
        b["revenue"] = round(b["revenue"], 2)
        b["average_order_value"] = round(b["revenue"] / b["orders"], 2) if b["orders"] else 0
    return {"series": series}


@router.get("/analytics/categories")
async def category_performance(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    products = await fetch_products(mid)
    orders = await fetch_paid_orders(mid)
    metrics = get_product_metrics(products, orders)
    by_cat: dict[str, dict] = {}
    for p in products:
        cat = p["category"]
        c = by_cat.setdefault(cat, {"category": cat, "revenue": 0, "units_sold": 0, "product_count": 0})
        c["product_count"] += 1

    for p in metrics["top_products"] + metrics["low_conversion_products"]:
        cat = p["category"]
        if cat in by_cat:
            by_cat[cat]["revenue"] += p.get("revenue", 0)
            by_cat[cat]["units_sold"] += p.get("units_sold", 0)

    return {"categories": sorted(by_cat.values(), key=lambda c: c["revenue"], reverse=True)}


@router.get("/analytics/products")
async def product_analytics(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    products = await fetch_products(mid)
    orders = await fetch_paid_orders(mid)
    return get_product_metrics(products, orders)


@router.get("/analytics/segments")
async def segments(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    orders = await fetch_paid_orders(mid)
    return await get_customer_segments(orders)
