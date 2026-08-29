"""Customer Shopping Agent.

Tool-registry pattern: the agent may only invoke a fixed, explicit set of
tools (search_catalog, get_product, get_recommendations,
get_cross_sell_products, add_to_cart, get_cart). No arbitrary code
execution is ever allowed. Cart mutation only happens on explicit customer
action (the caller passes an intent flag); a payment is never triggered
from within the agent -- that is a separate, explicit checkout step.
"""
from app.database.connection import get_db
from app.ml.recommendation import RecommendationEngine
from app.agents.llm_provider import parse_shopping_intent
from app.services import events
from app.schemas.common import new_id, now_iso


async def _all_products() -> list[dict]:
    db = get_db()
    return await db.products.find({}).to_list(length=1000)


async def search_catalog(category: str | None, budget: float | None, keywords: list[str]) -> list[dict]:
    db = get_db()
    query: dict = {}
    if category:
        query["category"] = category
    if budget:
        query["price"] = {"$lte": budget}
    products = await db.products.find(query).to_list(length=200)
    if not products and category:
        products = await db.products.find({"price": {"$lte": budget}} if budget else {}).to_list(length=200)
    return products


async def get_recommendations(products: list[dict], query_text: str, top_k: int = 6) -> list[dict]:
    all_products = await _all_products()
    engine = RecommendationEngine(all_products)
    candidates = products if products else all_products
    return engine.rank_by_intent(candidates, query_text, top_k=top_k)


async def get_cross_sell_products(product_id: str, top_k: int = 3) -> list[dict]:
    db = get_db()
    rules_doc = await db.growth_opportunities.find(
        {"type": "bundle", "products": product_id}
    ).sort("score", -1).to_list(length=top_k)

    results = []
    for r in rules_doc:
        other_id = r["products"][1] if r["products"][0] == product_id else r["products"][0]
        other = await db.products.find_one({"_id": other_id})
        if other:
            results.append({**other, "reason": r["reason"], "confidence": r.get("confidence", 0.5)})

    if not results:
        all_products = await _all_products()
        engine = RecommendationEngine(all_products)
        similar = engine.similar_products(product_id, top_k=top_k)
        results = [{**p, "reason": f"Frequently viewed alongside similar {p['category']} products",
                    "confidence": p.get("similarity_score", 0.5)} for p in similar]
    return results


async def get_cart(customer_id: str) -> dict:
    db = get_db()
    cart = await db.carts.find_one({"customer_id": customer_id})
    if not cart:
        cart = {"_id": new_id("cart"), "customer_id": customer_id, "items": [], "created_at": now_iso()}
        await db.carts.insert_one(cart)
    return cart


async def add_to_cart(customer_id: str, product_id: str, quantity: int = 1) -> dict:
    db = get_db()
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise ValueError("Product not found")
    cart = await get_cart(customer_id)
    items = cart.get("items", [])
    for item in items:
        if item["product_id"] == product_id:
            item["quantity"] += quantity
            break
    else:
        items.append({"product_id": product_id, "quantity": quantity})
    await db.carts.update_one({"_id": cart["_id"]}, {"$set": {"items": items}})
    await events.track("add_to_cart", customer_id, {"product_id": product_id, "quantity": quantity})
    return await get_cart(customer_id)


def format_product_summary(p: dict) -> str:
    price = p["price"] * (1 - p.get("discount", 0) / 100)
    return f"{p['name']} — ₹{price:.0f} — {p.get('rating', 0)}★"


async def handle_shopping_message(message: str, customer_id: str, session_id: str) -> dict:
    """Main orchestration: intent -> search -> rank -> explain -> cross-sell."""
    intent = parse_shopping_intent(message)
    await events.track("search", customer_id, {"query": message, "intent": intent})

    candidates = await search_catalog(intent["category"], intent["budget"], intent["keywords"])
    ranked = await get_recommendations(candidates, message, top_k=6)

    reply_lines = []
    if not ranked:
        reply_lines.append(
            "I couldn't find products matching that exactly. Try adjusting your budget or category."
        )
    else:
        constraint_bits = []
        if intent["category"]:
            constraint_bits.append(intent["category"].lower())
        if intent["budget"]:
            constraint_bits.append(f"under ₹{intent['budget']:.0f}")
        constraint_txt = " ".join(constraint_bits) if constraint_bits else "your request"
        reply_lines.append(f"Here are the best matches I found for {constraint_txt}:")
        for p in ranked[:4]:
            reply_lines.append(f"• {format_product_summary(p)} — {p.get('description', '')[:80]}")

        top = ranked[0]
        why = f"Best match because it satisfies {constraint_txt}"
        if p.get("rating", 0) >= 4.3:
            why += f" and has a strong {top.get('rating')}★ rating"
        reply_lines.append(f"\nWhy ShopPilot recommends \"{top['name']}\": {why}.")

        cross_sell = await get_cross_sell_products(top["_id"], top_k=1)
        if cross_sell:
            cs = cross_sell[0]
            reply_lines.append(
                f"\nCustomers buying {top['name']} frequently add {cs['name']} (₹{cs['price']:.0f}). "
                f"Want me to add it too?"
            )

    reply = "\n".join(reply_lines)

    db = get_db()
    await db.agent_conversations.insert_one({
        "_id": new_id("conv"),
        "session_id": session_id,
        "customer_id": customer_id,
        "role": "assistant",
        "agent": "shopping_agent",
        "message": message,
        "reply": reply,
        "intent": intent,
        "products_shown": [p["_id"] for p in ranked],
        "created_at": now_iso(),
    })

    return {
        "reply": reply,
        "products": ranked,
        "intent": intent,
        "cross_sell": await get_cross_sell_products(ranked[0]["_id"], top_k=1) if ranked else [],
    }
