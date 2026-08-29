"""Merchant Growth Agent.

Reads real aggregate data (revenue, products, orders, association rules,
segments) and returns structured, grounded recommendations. Never invents
numbers, never mutates the catalog itself -- every action requires
merchant approval and passes through server-side guardrails
(app.services.guardrails) before anything is persisted.
"""
from app.database.connection import get_db
from app.ml.association import mine_association_rules
from app.ml.opportunity import build_bundle_opportunities, build_upsell_opportunities
from app.ml.segmentation import segment_customers
from app.schemas.common import new_id, now_iso


async def get_revenue_metrics(merchant_id: str) -> dict:
    db = get_db()
    orders = await db.orders.find({"merchant_id": merchant_id, "payment_status": "paid"}).to_list(length=10000)
    total_revenue = sum(o.get("total", 0) for o in orders)
    total_orders = len(orders)
    aov = total_revenue / total_orders if total_orders else 0
    all_carts_started = await db.cart_events.count_documents(
        {"data.event": "checkout_started"}
    ) or total_orders
    conversion_rate = (total_orders / max(all_carts_started, total_orders, 1)) * 100
    return {
        "total_revenue": round(total_revenue, 2),
        "total_orders": total_orders,
        "average_order_value": round(aov, 2),
        "conversion_rate": round(conversion_rate, 2),
    }


async def get_product_metrics(merchant_id: str) -> dict:
    db = get_db()
    products = await db.products.find({"merchant_id": merchant_id}).to_list(length=1000)
    orders = await db.orders.find({"merchant_id": merchant_id, "payment_status": "paid"}).to_list(length=10000)

    sales_count: dict[str, int] = {}
    revenue_by_product: dict[str, float] = {}
    for o in orders:
        for item in o.get("items", []):
            pid = item["product_id"]
            sales_count[pid] = sales_count.get(pid, 0) + item["quantity"]
            revenue_by_product[pid] = revenue_by_product.get(pid, 0) + item["quantity"] * item["price"]

    for p in products:
        p["units_sold"] = sales_count.get(p["_id"], 0)
        p["revenue"] = round(revenue_by_product.get(p["_id"], 0), 2)

    top_products = sorted(products, key=lambda p: p["units_sold"], reverse=True)[:10]
    low_products = sorted(products, key=lambda p: p["units_sold"])[:10]
    return {"top_products": top_products, "low_conversion_products": low_products, "total_products": len(products)}


async def get_association_rules(merchant_id: str) -> list[dict]:
    db = get_db()
    orders = await db.orders.find({"merchant_id": merchant_id, "payment_status": "paid"}).to_list(length=10000)
    return mine_association_rules(orders)


async def get_customer_segments(merchant_id: str) -> dict:
    db = get_db()
    customers = await db.customers.find({}).to_list(length=5000)
    orders = await db.orders.find({"merchant_id": merchant_id, "payment_status": "paid"}).to_list(length=10000)
    return segment_customers(customers, orders)


async def find_growth_opportunities(merchant_id: str, persist: bool = True) -> list[dict]:
    db = get_db()
    rules = await get_association_rules(merchant_id)
    products = await db.products.find({"merchant_id": merchant_id}).to_list(length=1000)
    products_by_id = {p["_id"]: p for p in products}
    orders_count = await db.orders.count_documents({"merchant_id": merchant_id, "payment_status": "paid"})

    bundle_opps = build_bundle_opportunities(rules, products_by_id, max(orders_count, 1))
    upsell_opps = build_upsell_opportunities(products)
    all_opps = bundle_opps + upsell_opps
    all_opps.sort(key=lambda o: o["score"], reverse=True)

    if persist:
        for opp in all_opps:
            existing = await db.growth_opportunities.find_one({
                "merchant_id": merchant_id, "type": opp["type"], "products": opp["products"],
            })
            if existing:
                await db.growth_opportunities.update_one(
                    {"_id": existing["_id"]}, {"$set": {**opp, "updated_at": now_iso()}}
                )
            else:
                await db.growth_opportunities.insert_one({
                    "_id": new_id("opp"),
                    "merchant_id": merchant_id,
                    "status": "pending",
                    "created_at": now_iso(),
                    **opp,
                })
    return all_opps


async def answer_growth_question(message: str, merchant_id: str) -> dict:
    """Deterministic (LLM-optional) grounded response to merchant questions."""
    revenue = await get_revenue_metrics(merchant_id)
    opportunities = await find_growth_opportunities(merchant_id, persist=True)
    top_opps = opportunities[:3]

    lines = [
        f"Based on {revenue['total_orders']} paid orders totaling ₹{revenue['total_revenue']:,.0f} "
        f"(avg order value ₹{revenue['average_order_value']:,.0f}, {revenue['conversion_rate']:.1f}% conversion), "
        f"I identified {len(opportunities)} growth opportunities. Here are the top {len(top_opps)}:"
    ]
    for i, opp in enumerate(top_opps, 1):
        names = " + ".join(opp["product_names"])
        lines.append(
            f"{i}. [{opp['type'].upper()}] {names} — expected uplift ₹{opp['expected_uplift']:,.0f}/mo "
            f"(score {opp['score']*100:.0f}%). {opp['reason']}"
        )
    if not top_opps:
        lines.append("Not enough order history yet to identify statistically significant opportunities.")

    return {"reply": "\n".join(lines), "opportunities": top_opps, "revenue_metrics": revenue}
