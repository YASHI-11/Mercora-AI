from app.database.connection import get_db
from app.schemas.common import new_id, now_iso

EVENT_COLLECTIONS = {
    "search": "search_events",
    "product_view": "search_events",
    "recommendation_shown": "recommendation_events",
    "recommendation_clicked": "recommendation_events",
    "upsell_shown": "recommendation_events",
    "upsell_accepted": "recommendation_events",
    "add_to_cart": "cart_events",
    "remove_from_cart": "cart_events",
    "checkout_started": "cart_events",
    "payment_success": "cart_events",
    "payment_failed": "cart_events",
}


async def track(event_type: str, customer_id: str | None, data: dict):
    db = get_db()
    collection = EVENT_COLLECTIONS.get(event_type, "search_events")
    doc = {
        "_id": new_id("evt"),
        "event_type": event_type,
        "customer_id": customer_id,
        "data": data,
        "created_at": now_iso(),
    }
    await db[collection].insert_one(doc)
