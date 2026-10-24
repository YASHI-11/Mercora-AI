from fastapi import APIRouter
from app.database.connection import get_db
from app.agents.growth_agent import (
    fetch_order_totals, fetch_product_sales, fetch_products, get_customer_segments,
    get_product_metrics, get_revenue_metrics, with_sales,
)
from app.config import get_settings
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/merchant", tags=["merchant"])
settings = get_settings()


@router.get("/overview")
async def overview(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    totals = await fetch_order_totals(mid)
    carts_started = await db.cart_events.count_documents({"data.event": "checkout_started"})
    revenue = get_revenue_metrics(totals, carts_started)
    opportunities_count = await db.growth_opportunities.count_documents({"merchant_id": mid, "status": "pending"})
    return {
        **revenue,
        "ai_attributed_revenue": round(totals["ai_attributed_revenue"], 2),
        "ai_attributed_orders": totals["ai_attributed_orders"],
        "growth_opportunities_count": opportunities_count,
    }


@router.get("/analytics/timeseries")
async def timeseries(merchant_id: str | None = None, days: int = 30):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    # created_at is a UTC ISO-8601 string everywhere, so the window filter and
    # the per-day bucketing (its first 10 chars) both run inside MongoDB.
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = await db.orders.aggregate([
        {"$match": {"merchant_id": mid, "payment_status": "paid", "created_at": {"$gte": since}}},
        {"$group": {"_id": {"$substrCP": ["$created_at", 0, 10]},
                    "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(length=None)

    series = []
    for r in rows:
        revenue = round(r["revenue"], 2)
        series.append({"date": r["_id"], "revenue": revenue, "orders": r["orders"],
                       "average_order_value": round(revenue / r["orders"], 2) if r["orders"] else 0})
    return {"series": series}


@router.get("/analytics/categories")
async def category_performance(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    products = with_sales(await fetch_products(mid), await fetch_product_sales(mid))
    by_cat: dict[str, dict] = {}
    for p in products:
        c = by_cat.setdefault(p["category"], {"category": p["category"], "revenue": 0, "units_sold": 0,
                                              "product_count": 0})
        c["product_count"] += 1
        c["revenue"] += p["revenue"]
        c["units_sold"] += p["units_sold"]
    for c in by_cat.values():
        c["revenue"] = round(c["revenue"], 2)
    return {"categories": sorted(by_cat.values(), key=lambda c: c["revenue"], reverse=True)}


@router.get("/analytics/products")
async def product_analytics(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    return get_product_metrics(await fetch_products(mid), await fetch_product_sales(mid))


@router.get("/analytics/segments")
async def segments(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    return await get_customer_segments(mid)
