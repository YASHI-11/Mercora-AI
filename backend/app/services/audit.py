from app.database.connection import get_db
from app.schemas.common import new_id, now_iso


async def log_action(merchant_id: str, agent: str, action: str, target: str,
                      result: str, approval_status: str = "n/a", meta: dict | None = None):
    db = get_db()
    entry = {
        "_id": new_id("audit"),
        "merchant_id": merchant_id,
        "agent": agent,
        "action": action,
        "target": target,
        "result": result,
        "approval_status": approval_status,
        "meta": meta or {},
        "created_at": now_iso(),
    }
    await db.audit_logs.insert_one(entry)
    return entry
