import logging
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

logger = logging.getLogger("mercora.db")

settings = get_settings()

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    return _client


def get_db():
    return get_client()[settings.database_name]


async def check_connection() -> bool:
    try:
        await get_client().admin.command("ping")
        return True
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        return False


async def ensure_indexes():
    db = get_db()
    await db.products.create_index("merchant_id")
    await db.products.create_index("category")
    await db.products.create_index([("name", "text"), ("description", "text"), ("tags", "text")])
    await db.orders.create_index("customer_id")
    await db.orders.create_index("merchant_id")
    await db.orders.create_index("created_at")
    await db.carts.create_index("customer_id", unique=True)
    await db.customers.create_index("email", unique=True)
    await db.search_events.create_index("created_at")
    await db.cart_events.create_index("created_at")
    await db.recommendation_events.create_index("created_at")
    await db.growth_opportunities.create_index("merchant_id")
    await db.audit_logs.create_index("created_at")
    await db.agent_conversations.create_index("session_id")
    await db.llm_usage_events.create_index("created_at")
