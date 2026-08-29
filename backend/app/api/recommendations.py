from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database.connection import get_db
from app.ml.recommendation import RecommendationEngine
from app.agents.shopping_agent import get_cross_sell_products
from app.services import events

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


class PersonalizedRequest(BaseModel):
    customer_id: str
    top_k: int = 8


@router.get("/{product_id}")
async def similar_products(product_id: str, top_k: int = 6):
    db = get_db()
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Product not found")
    all_products = await db.products.find({}).to_list(length=1000)
    engine = RecommendationEngine(all_products)
    similar = engine.similar_products(product_id, top_k=top_k)
    cross_sell = await get_cross_sell_products(product_id, top_k=3)
    await events.track("recommendation_shown", None, {"product_id": product_id, "count": len(similar)})
    return {"similar": similar, "cross_sell": cross_sell}


@router.post("/personalized")
async def personalized(payload: PersonalizedRequest):
    db = get_db()
    events_history = await db.cart_events.find(
        {"customer_id": payload.customer_id, "event_type": "add_to_cart"}
    ).sort("created_at", -1).limit(5).to_list(length=5)

    all_products = await db.products.find({}).to_list(length=1000)
    engine = RecommendationEngine(all_products)

    if events_history:
        seed_ids = [e["data"]["product_id"] for e in events_history]
        collected: dict[str, dict] = {}
        for pid in seed_ids:
            for p in engine.similar_products(pid, top_k=4):
                collected[p["_id"]] = p
        results = sorted(collected.values(), key=lambda p: p.get("similarity_score", 0), reverse=True)
        results = results[:payload.top_k]
    else:
        results = engine.popular(top_k=payload.top_k)

    return {"products": results}
