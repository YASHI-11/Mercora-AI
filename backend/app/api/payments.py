from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.schemas.cart import PaymentOrderCreate, PaymentVerify
from app.schemas.common import now_iso
from app.services import razorpay_service, events
from app.api.orders import build_pending_order
from app.config import get_settings

router = APIRouter(prefix="/api/payments", tags=["payments"])
settings = get_settings()


@router.post("/create-order")
async def create_order(payload: PaymentOrderCreate):
    db = get_db()
    order = await build_pending_order(payload.customer_id)
    await db.orders.insert_one(order)

    try:
        rp_order = razorpay_service.create_order(
            order["total"], receipt=order["_id"],
            notes={"order_id": order["_id"], "customer_id": payload.customer_id},
        )
    except Exception as e:
        raise HTTPException(502, f"Razorpay error: {e}")

    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"razorpay_order_id": rp_order["id"]}})
    await events.track("checkout_started", payload.customer_id, {"order_id": order["_id"]})

    return {
        "order_id": order["_id"],
        "razorpay_order_id": rp_order["id"],
        "amount": rp_order["amount"],
        "currency": rp_order["currency"],
        "key_id": settings.razorpay_key_id or "rzp_test_mock",
        "mock": rp_order.get("mock", False),
    }


@router.post("/verify")
async def verify_payment(payload: PaymentVerify):
    db = get_db()
    order = await db.orders.find_one({"_id": payload.order_id})
    if not order:
        raise HTTPException(404, "Order not found")

    valid = razorpay_service.verify_payment_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    )
    if not valid:
        await db.orders.update_one({"_id": order["_id"]}, {"$set": {"payment_status": "failed"}})
        await events.track("payment_failed", order["customer_id"], {"order_id": order["_id"]})
        raise HTTPException(400, "Invalid payment signature")

    await db.orders.update_one(
        {"_id": order["_id"]},
        {"$set": {
            "payment_status": "paid", "order_status": "confirmed",
            "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": now_iso(),
        }},
    )
    await db.carts.update_one({"customer_id": order["customer_id"]}, {"$set": {"items": []}})
    await events.track("payment_success", order["customer_id"], {"order_id": order["_id"], "total": order["total"]})

    updated = await db.orders.find_one({"_id": order["_id"]})
    return {"success": True, "order": updated}


@router.get("/mock-signature")
async def mock_signature(order_id: str, payment_id: str):
    """Dev-only helper for testing the flow when Razorpay keys are not configured."""
    if razorpay_service.is_configured():
        raise HTTPException(400, "Razorpay is configured; use the real checkout widget")
    return {"signature": razorpay_service.mock_signature(order_id, payment_id)}
