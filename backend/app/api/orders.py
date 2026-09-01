from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.schemas.common import new_id, now_iso
from app.config import get_settings
from app.api.cart import _hydrate_cart
from app.agents.shopping_agent import get_cart as agent_get_cart

router = APIRouter(prefix="/api/orders", tags=["orders"])
settings = get_settings()


async def build_pending_order(customer_id: str) -> dict:
    cart = await agent_get_cart(customer_id)
    hydrated = await _hydrate_cart(cart)
    if not hydrated["items"]:
        raise HTTPException(400, "Cart is empty")

    order = {
        "_id": new_id("order"),
        "customer_id": customer_id,
        "merchant_id": settings.default_merchant_id,
        "items": [{"product_id": i["product_id"], "name": i["name"],
                    "quantity": i["quantity"], "price": i["price"]} for i in hydrated["items"]],
        "subtotal": hydrated["subtotal"],
        "discount": 0,
        "total": hydrated["total"],
        "razorpay_order_id": None,
        "payment_status": "pending",
        "order_status": "created",
        "created_at": now_iso(),
    }
    return order


@router.get("")
async def list_orders(customer_id: str):
    db = get_db()
    orders = await db.orders.find({"customer_id": customer_id}).sort("created_at", -1).to_list(length=100)
    return {"orders": orders}


@router.get("/{order_id}")
async def get_order(order_id: str):
    db = get_db()
    order = await db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    return order


@router.get("/{order_id}/invoice")
async def get_invoice(order_id: str):
    """Only available once payment is confirmed. Customer contact/address
    fields come from the verified account profile (see api/auth.py) --
    doubles as the delivery details since checkout doesn't collect a
    separate shipping address."""
    db = get_db()
    order = await db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["payment_status"] != "paid":
        raise HTTPException(400, "Invoice is only available once payment is confirmed")

    customer = await db.customers.find_one({"_id": order["customer_id"]})
    if not customer:
        raise HTTPException(404, "Customer not found")

    customer_details = {
        "name": customer.get("name", ""),
        "address": customer.get("address", ""),
        "phone": customer.get("phone", ""),
        "email": customer.get("email", ""),
    }

    return {
        "invoice_number": "INV-" + order["_id"].split("_", 1)[-1][:10].upper(),
        "issued_at": order.get("paid_at") or order["created_at"],
        "order_id": order["_id"],
        "customer": customer_details,
        "delivery": customer_details,
        "items": order["items"],
        "subtotal": order["subtotal"],
        "discount": order["discount"],
        "total": order["total"],
        "payment": {
            "status": order["payment_status"],
            "razorpay_order_id": order.get("razorpay_order_id"),
            "razorpay_payment_id": order.get("razorpay_payment_id"),
            "paid_at": order.get("paid_at"),
        },
    }
