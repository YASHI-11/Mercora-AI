"""Server-side guardrails. The LLM/AI layer can only PROPOSE actions;
these functions are the sole authority that validates and enforces limits.
No AI-generated value is trusted without being clamped/validated here."""
from app.database.connection import get_db
from app.config import get_settings

settings = get_settings()

DEFAULT_GUARDRAILS = {
    "max_discount": 10,
    "max_bundle_discount": 15,
    "automatic_campaign_creation": False,
    "automatic_price_changes": False,
    "merchant_approval_required": True,
}


async def get_guardrails(merchant_id: str) -> dict:
    db = get_db()
    doc = await db.merchants.find_one({"_id": merchant_id})
    if doc and "guardrails" in doc:
        return {**DEFAULT_GUARDRAILS, **doc["guardrails"]}
    return dict(DEFAULT_GUARDRAILS)


async def set_guardrails(merchant_id: str, guardrails: dict) -> dict:
    db = get_db()
    await db.merchants.update_one(
        {"_id": merchant_id}, {"$set": {"guardrails": guardrails}}, upsert=True
    )
    return guardrails


def clamp_discount(requested_discount: float, max_discount: float) -> float:
    if requested_discount is None:
        return 0
    return max(0, min(requested_discount, max_discount))


async def validate_bundle_discount(merchant_id: str, requested_discount: float) -> tuple[bool, float, str]:
    """Returns (allowed, clamped_discount, reason)."""
    guardrails = await get_guardrails(merchant_id)
    clamped = clamp_discount(requested_discount, guardrails["max_bundle_discount"])
    if clamped != requested_discount:
        return True, clamped, f"Discount clamped from {requested_discount}% to guardrail max {clamped}%"
    return True, clamped, "within guardrails"
