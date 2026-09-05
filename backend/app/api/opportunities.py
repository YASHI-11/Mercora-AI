from fastapi import APIRouter, HTTPException
from app.database.connection import get_db
from app.agents.growth_agent import find_growth_opportunities, fetch_paid_orders, fetch_products
from app.schemas.cart import OpportunityApproval
from app.schemas.common import new_id, now_iso
from app.services.guardrails import validate_bundle_discount, get_guardrails, set_guardrails
from app.schemas.cart import GuardrailSettings
from app.services.audit import log_action
from app.config import get_settings

router = APIRouter(prefix="/api", tags=["opportunities"])
settings = get_settings()


@router.get("/opportunities")
async def list_opportunities(merchant_id: str | None = None, refresh: bool = False, status: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    if refresh:
        orders = await fetch_paid_orders(mid)
        products = await fetch_products(mid)
        await find_growth_opportunities(products, orders, mid, persist=True)
    query: dict = {"merchant_id": mid}
    if status:
        query["status"] = status
    opps = await db.growth_opportunities.find(query).sort("score", -1).to_list(length=100)
    return {"opportunities": opps}


@router.get("/opportunities/{opportunity_id}")
async def get_opportunity(opportunity_id: str):
    db = get_db()
    opp = await db.growth_opportunities.find_one({"_id": opportunity_id})
    if not opp:
        raise HTTPException(404, "Opportunity not found")
    return opp


@router.post("/opportunities/{opportunity_id}/approve")
async def approve_opportunity(opportunity_id: str, payload: OpportunityApproval):
    db = get_db()
    opp = await db.growth_opportunities.find_one({"_id": opportunity_id})
    if not opp:
        raise HTTPException(404, "Opportunity not found")

    await log_action(opp["merchant_id"], "growth_agent", "opportunity_reviewed", opportunity_id,
                      result="approved" if payload.approve else "rejected",
                      approval_status="approved" if payload.approve else "rejected")

    if not payload.approve:
        await db.growth_opportunities.update_one({"_id": opportunity_id}, {"$set": {"status": "rejected"}})
        return {"status": "rejected"}

    requested_discount = payload.discount if payload.discount is not None else opp.get("recommended_discount", 5)
    allowed, clamped_discount, reason = await validate_bundle_discount(opp["merchant_id"], requested_discount)

    bundle = None
    if opp["type"] == "bundle":
        bundle = {
            "_id": new_id("bundle"),
            "merchant_id": opp["merchant_id"],
            "products": opp["products"],
            "product_names": opp["product_names"],
            "discount": clamped_discount,
            "source_opportunity_id": opportunity_id,
            "active": True,
            "created_at": now_iso(),
        }
        await db.bundles.insert_one(bundle)
        await log_action(opp["merchant_id"], "growth_agent", "bundle_created", bundle["_id"],
                          result=f"Created bundle with {clamped_discount}% discount ({reason})",
                          approval_status="approved", meta={"guardrail_note": reason})

    await db.growth_opportunities.update_one(
        {"_id": opportunity_id},
        {"$set": {"status": "approved", "applied_discount": clamped_discount, "approved_at": now_iso()}},
    )
    await log_action(opp["merchant_id"], "growth_agent", "catalog_updated", opportunity_id,
                      result="Catalog/offer updated with approved opportunity", approval_status="approved")

    return {"status": "approved", "discount_applied": clamped_discount, "bundle": bundle}


@router.get("/merchant/settings/guardrails")
async def get_guardrail_settings(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    return await get_guardrails(mid)


@router.put("/merchant/settings/guardrails")
async def update_guardrail_settings(payload: GuardrailSettings, merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    saved = await set_guardrails(mid, payload.model_dump())
    await log_action(mid, "merchant", "guardrails_updated", "settings", result="Guardrails updated",
                      approval_status="n/a", meta=saved)
    return saved


@router.get("/bundles")
async def list_bundles(merchant_id: str | None = None):
    mid = merchant_id or settings.default_merchant_id
    db = get_db()
    bundles = await db.bundles.find({"merchant_id": mid, "active": True}).to_list(length=100)
    return {"bundles": bundles}
