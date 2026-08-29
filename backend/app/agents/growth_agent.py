"""Merchant Growth Agent.

Reads real aggregate data (revenue, products, orders, association rules,
segments) and returns structured, grounded recommendations. Never invents
numbers, never mutates the catalog itself -- every action requires
merchant approval and passes through server-side guardrails
(app.services.guardrails) before anything is persisted.
"""
import json
import logging
import re

from app.agents.llm_provider import get_llm_provider
from app.database.connection import get_db
from app.ml.association import mine_association_rules
from app.ml.opportunity import build_bundle_opportunities, build_upsell_opportunities
from app.ml.segmentation import segment_customers
from app.schemas.common import new_id, now_iso

logger = logging.getLogger("mercora.growth_agent")


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


GROWTH_INTENTS = ["revenue", "opportunities", "underperforming", "top_performers", "segments", "general"]

GROWTH_INTENT_KEYWORDS = {
    "opportunities": ["bundle", "opportunit", "cross-sell", "cross sell", "upsell",
                       "recommend", "suggest", "idea"],
    "underperforming": ["underperform", "low perform", "worst", "not selling", "low convert",
                         "struggling", "weak", "poor", "slow mov"],
    "top_performers": ["top", "best sell", "best-sell", "best perform", "popular", "top seller", "winning"],
    "segments": ["segment", "customer group", "customer type", "who are my customers", "loyal", "vip", "at-risk", "cohort"],
    "revenue": ["revenue", "sales", "earn", "income", "aov", "order value", "conversion"],
}

# "How can I increase MY revenue" doesn't contain the literal phrase "increase revenue" --
# the words aren't adjacent -- so this is checked as a word-set intersection rather than a
# substring match. Any action word ("increase", "grow"...) combined with a metric word
# ("revenue", "sales"...) anywhere in the message means the merchant wants actionable growth
# suggestions, not a flat number readout.
ACTION_WORDS = {"increase", "boost", "grow", "improve", "raise", "maximize", "drive", "improving", "increasing", "growing"}
METRIC_WORDS = {"revenue", "sales", "income", "earnings", "orders", "conversion", "conversions", "profit"}


def _classify_growth_intent_fallback(message: str) -> str:
    text = message.lower()
    words = set(re.findall(r"[a-z']+", text))
    if words & ACTION_WORDS and words & METRIC_WORDS:
        return "opportunities"
    for intent, kws in GROWTH_INTENT_KEYWORDS.items():
        if any(kw in text for kw in kws):
            return intent
    return "general"


async def _get_recent_growth_history(session_id: str, limit: int = 6) -> list[dict]:
    db = get_db()
    docs = await db.agent_conversations.find(
        {"session_id": session_id, "agent": "growth_agent"}
    ).sort("created_at", -1).to_list(length=limit)
    docs.reverse()
    return docs


def _format_history(history: list[dict]) -> str:
    if not history:
        return ""
    lines = []
    for turn in history:
        lines.append(f"Merchant: {turn['message']}")
        lines.append(f"Copilot: {turn['reply']}")
    return "\n".join(lines)


async def classify_growth_intent(message: str, history_text: str = "") -> str:
    """Routes the merchant's message to a data domain (revenue / opportunities /
    underperforming / top_performers / segments / general chit-chat) so the
    copilot fetches the data that actually answers what was asked. Uses the
    live LLM provider (e.g. Gemini) -- with conversation history so follow-ups
    like "how can I increase it?" resolve what "it" refers to -- when a
    deterministic keyword match on the current message alone is ambiguous."""
    fallback_guess = _classify_growth_intent_fallback(message)
    if fallback_guess != "general":
        return fallback_guess

    provider = get_llm_provider()
    if not provider.is_live:
        return fallback_guess

    system_prompt = (
        "You are the intent router for a merchant growth-analytics copilot in an e-commerce "
        "admin dashboard. Classify the merchant's NEW message into exactly one category and "
        "reply with ONLY that single word, nothing else: revenue, opportunities, "
        "underperforming, top_performers, segments, general. Use the conversation history to "
        "resolve pronouns/follow-ups (e.g. \"how can I increase it?\" after a revenue "
        "discussion means opportunities). "
        "revenue = asking what current sales/revenue/AOV/conversion numbers ARE. "
        "opportunities = asking HOW TO grow/improve/increase revenue or sales, or about growth "
        "ideas, bundles, cross-sell/upsell. "
        "underperforming = about weak/low-selling/struggling products. "
        "top_performers = about best-selling/top/popular products. "
        "segments = about customer segments/groups/types. "
        "general = greetings, thanks, small talk, or anything else."
    )
    user_prompt = f"Conversation so far:\n{history_text}\n\nNew message: {message}" if history_text else message
    try:
        raw = (await provider.complete(system_prompt, user_prompt)).strip().lower()
        for intent in GROWTH_INTENTS:
            if intent in raw:
                return intent
        return fallback_guess
    except Exception:
        logger.warning("Growth intent classification via LLM failed, using keyword fallback", exc_info=True)
        return fallback_guess


async def _gather_domain_facts(intent: str, merchant_id: str, revenue: dict) -> tuple[dict, list[dict]]:
    """Fetches only the real, aggregate data relevant to the classified domain
    -- structured as JSON-able facts, not pre-written prose, so the LLM has
    room to decide how to phrase and organize the answer itself rather than
    reword a fixed template into something that reads the same every time."""
    facts: dict = {"revenue_snapshot": revenue}
    opportunities: list[dict] = []

    if intent in ("opportunities", "revenue", "general"):
        all_opps = await find_growth_opportunities(merchant_id, persist=True)
        opportunities = all_opps[:3]
        facts["total_growth_opportunities_found"] = len(all_opps)
        facts["top_growth_opportunities"] = [
            {
                "type": o["type"],
                "products": o["product_names"],
                "expected_uplift_per_month_rupees": o["expected_uplift"],
                "score_percent": round(o["score"] * 100, 1),
                "reason": o["reason"],
            }
            for o in opportunities
        ]

    if intent == "top_performers":
        metrics = await get_product_metrics(merchant_id)
        facts["top_selling_products"] = [
            {"name": p["name"], "units_sold": p["units_sold"], "revenue_rupees": p["revenue"]}
            for p in metrics["top_products"] if p["units_sold"] > 0
        ][:5]

    if intent == "underperforming":
        metrics = await get_product_metrics(merchant_id)
        facts["lowest_selling_products"] = [
            {"name": p["name"], "units_sold": p["units_sold"], "revenue_rupees": p["revenue"]}
            for p in metrics["low_conversion_products"]
        ][:5]

    if intent == "segments":
        seg = await get_customer_segments(merchant_id)
        facts["customer_segments"] = [
            {"name": s["name"], "customer_count": s["size"], "avg_spend_rupees": s["avg_total_spent"]}
            for s in seg.get("segments", [])
        ]

    return facts, opportunities


def _deterministic_reply(intent: str, facts: dict) -> str:
    """Human-readable fallback used only when no live LLM provider is
    configured (or a live call fails) -- so the copilot still answers
    correctly, just without Gemini's free-form phrasing."""
    revenue = facts["revenue_snapshot"]
    if intent == "revenue":
        return (
            f"{revenue['total_orders']} paid orders, total revenue ₹{revenue['total_revenue']:,.0f}, "
            f"average order value ₹{revenue['average_order_value']:,.0f}, "
            f"conversion rate {revenue['conversion_rate']:.1f}%."
        )
    if intent == "opportunities":
        opps = facts.get("top_growth_opportunities", [])
        if not opps:
            return "Not enough order history yet to identify statistically significant growth opportunities."
        lines = [f"Here are the top {len(opps)} growth opportunities I found:"]
        for i, o in enumerate(opps, 1):
            lines.append(
                f"{i}. [{o['type'].upper()}] {' + '.join(o['products'])} — expected uplift "
                f"₹{o['expected_uplift_per_month_rupees']:,.0f}/mo (score {o['score_percent']:.0f}%). {o['reason']}"
            )
        return "\n".join(lines)
    if intent == "top_performers":
        top = facts.get("top_selling_products", [])
        if not top:
            return "No products have recorded sales yet."
        return "Top-selling products:\n" + "\n".join(
            f"- {p['name']}: {p['units_sold']} units sold, ₹{p['revenue_rupees']:,.0f} revenue" for p in top
        )
    if intent == "underperforming":
        low = facts.get("lowest_selling_products", [])
        if not low:
            return "No product sales data available yet."
        return "Lowest-selling products:\n" + "\n".join(
            f"- {p['name']}: {p['units_sold']} units sold, ₹{p['revenue_rupees']:,.0f} revenue" for p in low
        )
    if intent == "segments":
        segs = facts.get("customer_segments", [])
        if not segs:
            return "Not enough customers yet to compute segments."
        return "Customer segments:\n" + "\n".join(
            f"- {s['name']}: {s['customer_count']} customers, avg spend ₹{s['avg_spend_rupees']:,.0f}" for s in segs
        )
    return (
        "I'm your Growth Copilot -- ask me about revenue and conversion, top or underperforming "
        "products, customer segments, or growth opportunities like bundles and cross-sells."
    )


async def _compose_reply(message: str, history_text: str, facts: dict) -> str:
    """Lets the live LLM provider (e.g. Gemini) fully author the reply --
    tone, structure, and wording are its call, not a fixed script we ask it
    to reword -- constrained only to the real numbers in FACTS and aware of
    the conversation so far. Falls back to a deterministic formatted answer
    when no LLM is configured or the call fails."""
    provider = get_llm_provider()
    if not provider.is_live:
        return _deterministic_reply(facts.get("_intent", ""), facts)

    system_prompt = (
        "You are Mercora's Growth Copilot: an AI growth analyst chatting with a merchant "
        "inside their e-commerce admin dashboard. Decide your own tone, structure, and wording "
        "for each reply -- don't reuse the same phrasing or structure across turns, and don't "
        "recite a fixed script. Rules: "
        "(1) Use ONLY the numbers, names, and figures inside FACTS below -- never invent, "
        "estimate, or guess a figure that isn't there. "
        "(2) Use CONVERSATION HISTORY to keep continuity and resolve references like \"it\" or "
        "\"that\" -- don't repeat what you already told them, build on it. "
        "(3) If the merchant is asking HOW to grow, increase, or improve something, give "
        "concrete, actionable suggestions grounded in FACTS.top_growth_opportunities (if "
        "present) rather than just restating a current number. "
        "(4) If FACTS doesn't contain what's needed to fully answer, say so honestly instead "
        "of making something up. "
        "(5) Keep it conversational and concise."
    )
    user_prompt = (
        (f"CONVERSATION HISTORY:\n{history_text}\n\n" if history_text else "")
        + f"FACTS:\n{json.dumps(facts, indent=2)}\n\nMerchant's new message: {message}"
    )
    try:
        reply = (await provider.complete(system_prompt, user_prompt)).strip()
        return reply if reply else _deterministic_reply(facts.get("_intent", ""), facts)
    except Exception:
        logger.warning("Growth copilot LLM reply generation failed, using deterministic fallback", exc_info=True)
        return _deterministic_reply(facts.get("_intent", ""), facts)


async def answer_growth_question(message: str, merchant_id: str, session_id: str) -> dict:
    """Classifies intent (with conversation-aware follow-up resolution),
    gathers only the relevant real data, then lets the configured LLM author
    a natural reply grounded strictly in that data -- so different questions,
    and follow-ups, actually get different, contextual answers."""
    history = await _get_recent_growth_history(session_id)
    history_text = _format_history(history)

    intent = await classify_growth_intent(message, history_text)
    revenue = await get_revenue_metrics(merchant_id)
    facts, opportunities = await _gather_domain_facts(intent, merchant_id, revenue)
    facts["_intent"] = intent

    reply = await _compose_reply(message, history_text, facts)

    db = get_db()
    await db.agent_conversations.insert_one({
        "_id": new_id("conv"),
        "session_id": session_id,
        "merchant_id": merchant_id,
        "role": "assistant",
        "agent": "growth_agent",
        "message": message,
        "reply": reply,
        "intent": intent,
        "created_at": now_iso(),
    })

    return {
        "reply": reply,
        "opportunities": opportunities,
        "revenue_metrics": revenue,
        "intent": intent,
    }
