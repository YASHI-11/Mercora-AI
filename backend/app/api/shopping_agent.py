from fastapi import APIRouter
from app.schemas.cart import AgentChatRequest
from app.agents.shopping_agent import handle_shopping_message
from app.schemas.common import new_id

router = APIRouter(prefix="/api/agent", tags=["shopping_agent"])


@router.post("/shop")
async def shop(payload: AgentChatRequest):
    session_id = payload.session_id or new_id("sess")
    result = await handle_shopping_message(payload.message, payload.customer_id, session_id)
    return {**result, "session_id": session_id}
