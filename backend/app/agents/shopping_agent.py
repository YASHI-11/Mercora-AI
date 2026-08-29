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
from app.agents.llm_provider import parse_shopping_intent_llm, generate_conversational_reply
from app.services import events
from app.schemas.common import new_id, now_iso


async def _all_products() -> list[dict]:
    db = get_db()
    return await db.products.find({}).to_list(length=1000)


async def search_catalog(category: str | None, budget: float | None, keywords: list[str]) -> list[dict]:
    """Category is a *preference*, not a strict filter: some products (e.g.
    bundle-companion accessories) are tagged with their parent category for
    association mining purposes even though a keyword like "mouse" or
    "charger" describes them more precisely than the category does. So we
    match on category OR any keyword appearing in the product's name/tags,
    then let TF-IDF ranking (rank_by_intent) sort by actual relevance."""
    db = get_db()
    and_filters: list[dict] = []
    if budget:
        and_filters.append({"price": {"$lte": budget}})

    match_clauses: list[dict] = []
    if category:
        match_clauses.append({"category": category})
    for kw in keywords:
        match_clauses.append({"name": {"$regex": kw, "$options": "i"}})
        match_clauses.append({"tags": {"$regex": kw, "$options": "i"}})
    if match_clauses:
        and_filters.append({"$or": match_clauses})

    query = {"$and": and_filters} if and_filters else {}
    products = await db.products.find(query).to_list(length=200)
    if not products:
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
    """Main orchestration: intent -> search -> rank -> explain -> cross-sell.
    Messages that aren't an actual product request (greetings, thanks, small
    talk) get a conversational reply instead of an unrelated product dump."""
    db = get_db()
    categories = await db.products.distinct("category")
    intent = await parse_shopping_intent_llm(message, categories)
    await events.track("search", customer_id, {"query": message, "intent": intent})

    if not intent.get("is_shopping_query"):
        reply = await generate_conversational_reply(message)
        await db.agent_conversations.insert_one({
            "_id": new_id("conv"),
            "session_id": session_id,
            "customer_id": customer_id,
            "role": "assistant",
            "agent": "shopping_agent",
            "message": message,
            "reply": reply,
            "intent": intent,
            "products_shown": [],
            "created_at": now_iso(),
        })
        return {"reply": reply, "products": [], "intent": intent, "cross_sell": []}

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
        reply_lines.append(f"\nWhy Mercora recommends \"{top['name']}\": {why}.")

        cross_sell = [c for c in await get_cross_sell_products(top["_id"], top_k=2) if c["_id"] != top["_id"]][:1]
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

    final_cross_sell = []
    if ranked:
        final_cross_sell = [
            c for c in await get_cross_sell_products(ranked[0]["_id"], top_k=2) if c["_id"] != ranked[0]["_id"]
        ][:1]

    return {
        "reply": reply,
        "products": ranked,
        "intent": intent,
        "cross_sell": final_cross_sell,
    }
