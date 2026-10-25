import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from app.database.connection import CATALOG_FETCH_LIMIT, get_db
from app.agents.growth_agent import (
    fetch_order_totals, fetch_product_sales, fetch_products, get_customer_segments,
    get_product_metrics, get_revenue_metrics, with_sales,
)
from app.config import get_settings
from app.ml.evaluation import run_evaluation
from app.services.audit import log_action
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
        # 0 for imported history: conversion_rate then falls back to
        # orders/orders (100%), which the dashboard must not present as real.
        "checkout_sessions": carts_started,
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


# ----------------------------------------------------------- ML evaluation
# Reports come from app/ml/evaluation.run_evaluation -- written by
# scripts/evaluate_ml.py or by the run endpoint below -- and are kept, so the
# page can show how the numbers move as the data and models change.

_evaluation_lock = asyncio.Lock()


@router.get("/ml-evaluation")
async def ml_evaluation(history: int = 10):
    db = get_db()
    latest = await db.ml_evaluations.find_one({}, {"_id": 0}, sort=[("generated_at", -1)])
    if not latest:
        # Not an error: the page shows how to run the first evaluation.
        return {"latest": None, "history": []}
    past = await db.ml_evaluations.find(
        {}, {"_id": 0, "generated_at": 1, "source": 1, "recommendations": 1,
             "segmentation.silhouette_score": 1, "rules.count": 1, "rules.holdout.avg_holdout_confidence": 1},
    ).sort("generated_at", -1).limit(max(1, min(history, 50))).to_list(length=50)
    return {"latest": latest, "history": past}


@router.post("/ml-evaluation/run")
async def run_ml_evaluation(merchant_id: str | None = None):
    """Recomputes the report from the live data. CPU-bound (TF-IDF over the
    catalogue, Apriori, KMeans), so it runs in a worker thread; one run at a
    time."""
    if _evaluation_lock.locked():
        raise HTTPException(409, "An evaluation is already running")
    async with _evaluation_lock:
        db = get_db()
        products = await db.products.find({}).to_list(length=CATALOG_FETCH_LIMIT)
        orders = await db.orders.find(
            {"payment_status": "paid"}, {"customer_id": 1, "created_at": 1, "total": 1, "items.product_id": 1},
        ).to_list(length=None)
        customers = await db.customers.find({}, {"_id": 1}).to_list(length=None)
        report = await run_in_threadpool(run_evaluation, products, orders, customers)
        await db.ml_evaluations.insert_one({**report, "source": "merchant_ui"})
        await log_action(merchant_id or settings.default_merchant_id, "ml", "evaluation_run", "ml_evaluations",
                         "completed", meta={"duration_seconds": report["duration_seconds"],
                                            "paid_orders": report["data"]["paid_orders"]})
        return report
