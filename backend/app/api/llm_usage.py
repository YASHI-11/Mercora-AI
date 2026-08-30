from fastapi import APIRouter
from app.database.connection import get_db

router = APIRouter(prefix="/api/llm-usage", tags=["llm_usage"])


@router.get("")
async def get_llm_usage(limit: int = 50):
    """Aggregate (estimated) LLM token usage, broken down by provider, plus the
    most recent individual calls. Token counts are approximate (see
    app.agents.llm_provider.estimate_tokens) -- this is for cost/volume
    visibility, not billing-grade accounting."""
    db = get_db()

    pipeline = [
        {"$group": {
            "_id": "$provider",
            "calls": {"$sum": 1},
            "prompt_tokens": {"$sum": "$prompt_tokens"},
            "completion_tokens": {"$sum": "$completion_tokens"},
            "total_tokens": {"$sum": "$total_tokens"},
            "truncated_calls": {"$sum": {"$cond": ["$truncated", 1, 0]}},
        }},
        {"$sort": {"total_tokens": -1}},
    ]
    by_provider = await db.llm_usage_events.aggregate(pipeline).to_list(length=20)
    for row in by_provider:
        row["provider"] = row.pop("_id")

    totals = {
        "calls": sum(r["calls"] for r in by_provider),
        "prompt_tokens": sum(r["prompt_tokens"] for r in by_provider),
        "completion_tokens": sum(r["completion_tokens"] for r in by_provider),
        "total_tokens": sum(r["total_tokens"] for r in by_provider),
    }

    recent = await db.llm_usage_events.find({}).sort("created_at", -1).to_list(length=limit)

    return {"totals": totals, "by_provider": by_provider, "recent_calls": recent}
