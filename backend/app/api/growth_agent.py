from fastapi import APIRouter
from app.schemas.cart import GrowthChatRequest
from app.agents.growth_agent import answer_growth_question
from app.config import get_settings
from app.schemas.common import new_id

router = APIRouter(prefix="/api/agent", tags=["growth_agent"])
settings = get_settings()


@router.post("/growth")
async def growth(payload: GrowthChatRequest):
    merchant_id = payload.merchant_id or settings.default_merchant_id
    session_id = payload.session_id or new_id("sess")
    result = await answer_growth_question(payload.message, merchant_id, session_id)
    return {**result, "session_id": session_id}
