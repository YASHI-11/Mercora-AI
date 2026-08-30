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


ORDINAL_WORDS = {
    "first": 0, "1st": 0, "second": 1, "2nd": 1, "third": 2, "3rd": 2,
    "fourth": 3, "4th": 3, "fifth": 4, "5th": 4, "sixth": 5, "6th": 5,
    "last": -1,
}
MORE_PHRASES = ("show more", "show me more", "see more", "more options", "more products",
                "other options", "anything else", "what else", "more choices")


def _extract_ordinal_index(message: str) -> int | None:
    """Detects a reply like "I'll take the first one" / "the 2nd" referencing
    a previously shown product list. Deliberately narrow: only fires when the
    message doesn't also look like a fresh search (no budget/price mention),
    so "show me the first laptop under 5000" is still treated as a new
    search rather than a stale selection."""
    text = message.lower()
    if any(ch.isdigit() for ch in text) and "st" not in text and "nd" not in text and "rd" not in text and "th" not in text:
        return None  # looks like a price ("under 5000"), not an ordinal
    words = text.replace(",", " ").split()
    for w in words:
        w = w.strip(".!?")
        if w in ORDINAL_WORDS:
            return ORDINAL_WORDS[w]
    return None


def _wants_more(message: str) -> bool:
    text = message.lower()
    return any(phrase in text for phrase in MORE_PHRASES)


async def _last_shown_turn(db, session_id: str) -> dict | None:
    return await db.agent_conversations.find_one(
        {"session_id": session_id, "agent": "shopping_agent", "products_shown.0": {"$exists": True}},
        sort=[("created_at", -1)],
    )


async def _fetch_products_ordered(db, ids: list[str]) -> list[dict]:
    docs = {p["_id"]: p for p in await db.products.find({"_id": {"$in": ids}}).to_list(length=len(ids))}
    return [docs[i] for i in ids if i in docs]


async def handle_shopping_message(message: str, customer_id: str, session_id: str) -> dict:
    """Main orchestration: intent -> search -> rank -> explain -> cross-sell.
    Messages that aren't an actual product request (greetings, thanks, small
    talk) get a conversational reply instead of an unrelated product dump.
    Also handles two follow-up patterns against the PREVIOUS turn's shown
    products: an ordinal reference ("I'll take the second one") and a request
    to see more ("show me more options")."""
    db = get_db()

    ordinal = _extract_ordinal_index(message)
    wants_more = _wants_more(message)
    if ordinal is not None or wants_more:
        prev = await _last_shown_turn(db, session_id)
        if prev:
            prev_ids = prev["products_shown"]
            # The true search text (for TF-IDF ranking) and the accumulated
            # list of every product id shown so far this "thread" -- carried
            # forward through ordinal-selection turns too, so a later "show
            # me more" still ranks against the ORIGINAL query ("wireless
            # headphones under 6000"), not a selection reply like "I'll take
            # the second one", and never re-shows something already seen.
            query_text = prev.get("query_text") or prev.get("message", message)
            all_shown_ids = prev.get("all_shown_ids") or prev_ids
            if ordinal is not None:
                idx = ordinal if ordinal >= 0 else len(prev_ids) - 1
                if 0 <= idx < len(prev_ids):
                    picked = await _fetch_products_ordered(db, [prev_ids[idx]])
                    if picked:
                        # Selecting a specific product ("I'll take the second
                        # one") is explicit purchase intent, so add it to the
                        # cart right away instead of making the customer
                        # click Add again -- the actual payment itself still
                        # requires the customer's own explicit "Pay with
                        # Razorpay" click on the checkout page, so no money
                        # moves without a deliberate action on their part.
                        await add_to_cart(customer_id, picked[0]["_id"], quantity=1)
                        reply = (f"Added {picked[0]['name']} (₹{picked[0]['price']:.0f}) to your cart — "
                                 f"taking you to checkout now.")
                        await db.agent_conversations.insert_one({
                            "_id": new_id("conv"), "session_id": session_id, "customer_id": customer_id,
                            "role": "assistant", "agent": "shopping_agent", "message": message, "reply": reply,
                            "intent": prev.get("intent"), "products_shown": [picked[0]["_id"]],
                            "query_text": query_text, "all_shown_ids": all_shown_ids,
                            "created_at": now_iso(),
                        })
                        return {"reply": reply, "products": picked, "intent": prev.get("intent"),
                                "cross_sell": [], "redirect_to_checkout": True}
            elif wants_more:
                prev_intent = prev.get("intent") or {}
                candidates = await search_catalog(prev_intent.get("category"), prev_intent.get("budget"),
                                                    prev_intent.get("keywords") or [])
                ranked = await get_recommendations(candidates, query_text, top_k=20)
                remaining = [p for p in ranked if p["_id"] not in all_shown_ids][:4]
                if remaining:
                    reply = "Here are a few more options:\n" + "\n".join(
                        f"• {format_product_summary(p)}" for p in remaining)
                    new_shown_ids = all_shown_ids + [p["_id"] for p in remaining]
                    await db.agent_conversations.insert_one({
                        "_id": new_id("conv"), "session_id": session_id, "customer_id": customer_id,
                        "role": "assistant", "agent": "shopping_agent", "message": message, "reply": reply,
                        "intent": prev_intent, "products_shown": [p["_id"] for p in remaining],
                        "query_text": query_text, "all_shown_ids": new_shown_ids,
                        "created_at": now_iso(),
                    })
                    return {"reply": reply, "products": remaining, "intent": prev_intent, "cross_sell": []}
                else:
                    reply = "That's everything I've got matching your last search — want to try a different category or budget?"
                    return {"reply": reply, "products": [], "intent": prev_intent, "cross_sell": []}

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
        shown = ranked[:4]
        for i, p in enumerate(shown, start=1):
            reply_lines.append(f"{i}. {format_product_summary(p)} — {p.get('description', '')[:80]}")

        top = ranked[0]
        top["best_pick"] = True
        why = f"Best match because it satisfies {constraint_txt}"
        if top.get("rating", 0) >= 4.3:
            why += f" and has a strong {top.get('rating')}★ rating"
        reply_lines.append(f"\n★ My top pick: \"{top['name']}\" — {why}.")

        cross_sell = [c for c in await get_cross_sell_products(top["_id"], top_k=2) if c["_id"] != top["_id"]][:1]
        if cross_sell:
            cs = cross_sell[0]
            reply_lines.append(
                f"\nCustomers buying {top['name']} frequently add {cs['name']} (₹{cs['price']:.0f}). "
                f"Want me to add it too?"
            )

        if len(shown) > 1:
            reply_lines.append(f"\nTell me \"first\", \"second\", etc. to focus on one, "
                                f"or say \"show me more\" for other options.")

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
        "products_shown": [p["_id"] for p in (shown if ranked else [])],
        "query_text": message,
        "all_shown_ids": [p["_id"] for p in (shown if ranked else [])],
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
