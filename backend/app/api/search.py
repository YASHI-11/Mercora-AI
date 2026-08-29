from fastapi import APIRouter
from pydantic import BaseModel
from app.database.connection import get_db
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
    query: dict = {}
    if intent["category"]:
        query["category"] = intent["category"]
    if intent["budget"]:
        query["price"] = {"$lte": intent["budget"]}
    candidates = await db.products.find(query).to_list(length=200)
    if not candidates:
        candidates = await db.products.find({}).to_list(length=500)

    all_products = await db.products.find({}).to_list(length=1000)
    engine = RecommendationEngine(all_products)
    ranked = engine.rank_by_intent(candidates, payload.query, top_k=12)

    await events.track("search", payload.customer_id, {"query": payload.query, "intent": intent})
    return {"products": ranked, "intent": intent}
