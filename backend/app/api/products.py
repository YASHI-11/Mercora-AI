from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.schemas.product import UNCATEGORIZED, ProductCreate, ProductUpdate
from app.schemas.common import new_id, now_iso
from app.config import get_settings

router = APIRouter(prefix="/api/products", tags=["products"])
settings = get_settings()


@router.get("")
async def list_products(category: str | None = None, subcategory: str | None = None,
                         min_price: float | None = None,
                         max_price: float | None = None, sort: str | None = None,
                         q: str | None = None, min_rating: float | None = None,
                         in_stock: bool = False, limit: int = 60, skip: int = 0):
    db = get_db()
    query: dict = {}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory
    if min_price is not None or max_price is not None:
        query["price"] = {}
        if min_price is not None:
            query["price"]["$gte"] = min_price
        if max_price is not None:
            query["price"]["$lte"] = max_price
    if q:
        query["$text"] = {"$search": q}
    if min_rating is not None:
        query["rating"] = {"$gte": min_rating}
    if in_stock:
        query["inventory"] = {"$gt": 0}

    # A text search without an explicit sort is ordered by relevance; without
    # this Mongo returns $text matches in no particular order.
    by_relevance = bool(q) and sort is None
    cursor = db.products.find(query, {"score": {"$meta": "textScore"}} if by_relevance else None)
    if by_relevance:
        cursor = cursor.sort([("score", {"$meta": "textScore"})])
    sort_map = {
        "price_asc": [("price", 1)], "price_desc": [("price", -1)],
        # rating_count breaks ties: a 5.0 from hundreds of buyers before a 5.0 from three
        "rating": [("rating", -1), ("rating_count", -1)], "newest": [("created_at", -1)],
        "popular": [("units_sold", -1), ("order_count", -1)],
    }
    if sort in sort_map:
        cursor = cursor.sort(sort_map[sort])
    cursor = cursor.skip(skip).limit(limit)
    products = await cursor.to_list(length=limit)
    total = await db.products.count_documents(query)
    return {"products": products, "total": total}


@router.get("/categories")
async def list_categories():
    db = get_db()
    rows = await db.products.aggregate([
        # Sorted first so $first picks each category's best seller -- its photo
        # represents the category on collection cards.
        {"$sort": {"units_sold": -1}},
        {"$group": {"_id": "$category", "subcategories": {"$addToSet": "$subcategory"}, "count": {"$sum": 1},
                    "image": {"$first": "$image"}, "top_product": {"$first": "$name"}}},
    ]).to_list(length=None)
    # Uncategorized sorts last so the dataset's real taxonomy leads.
    rows.sort(key=lambda r: (r["_id"] == UNCATEGORIZED, r["_id"] or ""))
    return {
        "categories": [r["_id"] for r in rows if r["_id"]],
        "taxonomy": [
            {"category": r["_id"], "count": r["count"], "image": r.get("image") or "",
             "top_product": r.get("top_product") or "",
             "subcategories": sorted(s for s in r["subcategories"] if s and s != r["_id"])}
            for r in rows if r["_id"]
        ],
    }


@router.get("/{product_id}")
async def get_product(product_id: str):
    db = get_db()
    product = await db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.post("")
async def create_product(payload: ProductCreate):
    db = get_db()
    doc = {
        "_id": new_id("prod"),
        "merchant_id": settings.default_merchant_id,
        **payload.model_dump(),
        "created_at": now_iso(),
    }
    await db.products.insert_one(doc)
    return doc


@router.put("/{product_id}")
async def update_product(product_id: str, payload: ProductUpdate):
    db = get_db()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = await db.products.update_one({"_id": product_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return await db.products.find_one({"_id": product_id})


@router.delete("/{product_id}")
async def delete_product(product_id: str):
    db = get_db()
    result = await db.products.delete_one({"_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Product not found")
    return {"deleted": True}
