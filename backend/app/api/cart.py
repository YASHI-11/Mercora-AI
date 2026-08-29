from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.schemas.cart import CartItemCreate, CartItemUpdate
from app.agents.shopping_agent import get_cart as agent_get_cart, add_to_cart as agent_add_to_cart
from app.services import events

router = APIRouter(prefix="/api/cart", tags=["cart"])


async def _hydrate_cart(cart: dict) -> dict:
    db = get_db()
    items_out = []
    subtotal = 0.0
    for item in cart.get("items", []):
        product = await db.products.find_one({"_id": item["product_id"]})
        if not product:
            continue
        price = product["price"] * (1 - product.get("discount", 0) / 100)
        line_total = price * item["quantity"]
        subtotal += line_total
        items_out.append({
            "product_id": product["_id"], "name": product["name"], "image": product.get("image", ""),
            "price": round(price, 2), "quantity": item["quantity"], "line_total": round(line_total, 2),
        })
    return {
        "cart_id": cart["_id"], "customer_id": cart["customer_id"], "items": items_out,
        "subtotal": round(subtotal, 2), "total": round(subtotal, 2),
    }


@router.get("")
async def get_cart(customer_id: str):
    cart = await agent_get_cart(customer_id)
    return await _hydrate_cart(cart)


@router.post("/items")
async def add_item(customer_id: str, payload: CartItemCreate):
    try:
        cart = await agent_add_to_cart(customer_id, payload.product_id, payload.quantity)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return await _hydrate_cart(cart)


@router.put("/items/{product_id}")
async def update_item(customer_id: str, product_id: str, payload: CartItemUpdate):
    db = get_db()
    cart = await agent_get_cart(customer_id)
    items = cart.get("items", [])
    for item in items:
        if item["product_id"] == product_id:
            item["quantity"] = payload.quantity
            break
    else:
        raise HTTPException(404, "Item not in cart")
    items = [i for i in items if i["quantity"] > 0]
    await db.carts.update_one({"_id": cart["_id"]}, {"$set": {"items": items}})
    return await _hydrate_cart(await agent_get_cart(customer_id))


@router.delete("/items/{product_id}")
async def remove_item(customer_id: str, product_id: str):
    db = get_db()
    cart = await agent_get_cart(customer_id)
    items = [i for i in cart.get("items", []) if i["product_id"] != product_id]
    await db.carts.update_one({"_id": cart["_id"]}, {"$set": {"items": items}})
    await events.track("remove_from_cart", customer_id, {"product_id": product_id})
    return await _hydrate_cart(await agent_get_cart(customer_id))
