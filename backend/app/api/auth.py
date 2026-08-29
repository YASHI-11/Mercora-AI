"""Lightweight identity endpoint. The MVP does not require passworded auth
for the shopping/demo flow -- customers are identified by email and get a
stable customer_id used across cart/orders/agent calls. This keeps the
Razorpay/agentic-commerce flow the focus rather than a full auth system."""
from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
from app.database.connection import get_db
from app.schemas.common import new_id, now_iso

router = APIRouter(prefix="/api/auth", tags=["auth"])


class IdentifyRequest(BaseModel):
    email: EmailStr
    name: str | None = None


@router.post("/identify")
async def identify(payload: IdentifyRequest):
    db = get_db()
    customer = await db.customers.find_one({"email": payload.email})
    if not customer:
        customer = {
            "_id": new_id("cust"),
            "email": payload.email,
            "name": payload.name or payload.email.split("@")[0],
            "created_at": now_iso(),
        }
        await db.customers.insert_one(customer)
    return customer
