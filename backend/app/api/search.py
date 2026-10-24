from fastapi import APIRouter
from pydantic import BaseModel
from app.database.connection import CATALOG_FETCH_LIMIT, get_db
from app.agents.llm_provider import parse_shopping_intent
from app.ml.recommendation import RecommendationEngine
from app.services import events

router = APIRouter(prefix="/api", tags=["search"])


class AISearchRequest(BaseModel):
    query: str
    customer_id: str | None = None


@router.get("/search")
async def search(q: str, limit: int = 30):
    db = get_db()
    products = await db.products.find({"$text": {"$search": q}}).to_list(length=limit)
    if not products:
        products = await db.products.find(
            {"name": {"$regex": q, "$options": "i"}}
        ).to_list(length=limit)
    return {"products": products, "query": q}


@router.post("/ai/search")
async def ai_search(payload: AISearchRequest):
    """Converts natural-language intent into structured filters + ranked results."""
    intent = parse_shopping_intent(payload.query)
    db = get_db()
    all_products = await db.products.find({}).to_list(length=CATALOG_FETCH_LIMIT)
    # Filter the already-loaded catalog rather than a capped Mongo query: a
    # find(...).to_list(200) took the first 200 documents in insertion order,
    # so most of a large category (Fashion & Jewellery has ~400 products)
    # never reached the ranker.
    candidates = [
        p for p in all_products
        if (not intent["category"] or p.get("category") == intent["category"])
        and (not intent["budget"] or p.get("price", 0) <= intent["budget"])
    ] or all_products

    engine = RecommendationEngine(all_products)
    ranked = engine.rank_by_intent(candidates, payload.query, top_k=12)

    await events.track("search", payload.customer_id, {"query": payload.query, "intent": intent})
    return {"products": ranked, "intent": intent}
