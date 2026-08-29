from fastapi import APIRouter
from app.database.connection import get_db
from app.config import get_settings

router = APIRouter(prefix="/api/audit", tags=["audit"])
settings = get_settings()


@router.get("")
async def list_audit_logs(merchant_id: str | None = None, limit: int = 100):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    logs = await db.audit_logs.find({"merchant_id": mid}).sort("created_at", -1).limit(limit).to_list(length=limit)
    return {"logs": logs}
