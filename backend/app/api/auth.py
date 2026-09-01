"""OTP-based auth. Sign-up collects the full profile (name, age, address,
phone, email) and only creates the account once the phone number is
verified via OTP. Log-in asks for nothing but phone + OTP -- no other
profile fields are ever requested there. No SMS provider is wired up in
this project, so OTP delivery falls back to a deterministic mock (the OTP
is logged and echoed back in the response with mock: true), mirroring the
mock-payment pattern in services/razorpay_service.py -- this keeps the
signup/login loop demoable end to end with zero external credentials."""
import logging
import random
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.database.connection import get_db
from app.schemas.common import new_id, now_iso

logger = logging.getLogger("mercora.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5
PHONE_RE = re.compile(r"^\+?[0-9]{7,15}$")


def _normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="Enter a valid phone number (7-15 digits).")
    return phone


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


async def _issue_otp(phone: str, purpose: str, payload: dict | None) -> str:
    db = get_db()
    otp = _generate_otp()
    # Stored as a naive UTC datetime (not an ISO string) so MongoDB's TTL
    # index -- which only recognizes BSON Date fields -- can actually expire
    # stale OTPs; compare against datetime.utcnow() below for the same reason.
    expires_at = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
    await db.otp_verifications.update_one(
        {"phone": phone, "purpose": purpose},
        {"$set": {
            "phone": phone, "purpose": purpose, "otp": otp, "payload": payload,
            "expires_at": expires_at, "attempts": 0, "created_at": now_iso(),
        }},
        upsert=True,
    )
    logger.info("Mock OTP for %s (%s): %s", phone, purpose, otp)
    return otp


async def _consume_otp(phone: str, purpose: str, otp: str) -> dict:
    db = get_db()
    record = await db.otp_verifications.find_one({"phone": phone, "purpose": purpose})
    if not record:
        raise HTTPException(status_code=400, detail="No OTP was requested for this phone number.")
    if record["attempts"] >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new OTP.")
    if record["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")
    if record["otp"] != otp.strip():
        await db.otp_verifications.update_one({"_id": record["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect OTP.")
    await db.otp_verifications.delete_one({"_id": record["_id"]})
    return record


class SignupRequestOtp(BaseModel):
    name: str
    age: int
    address: str
    phone: str
    email: EmailStr

    @field_validator("name", "address")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required.")
        return v

    @field_validator("age")
    @classmethod
    def valid_age(cls, v: int) -> int:
        if not (13 <= v <= 120):
            raise ValueError("Enter a valid age.")
        return v


class SignupVerifyOtp(BaseModel):
    phone: str
    otp: str


class LoginRequestOtp(BaseModel):
    phone: str


class LoginVerifyOtp(BaseModel):
    phone: str
    otp: str


@router.post("/signup/request-otp")
async def signup_request_otp(payload: SignupRequestOtp):
    db = get_db()
    phone = _normalize_phone(payload.phone)
    existing = await db.customers.find_one({"$or": [{"phone": phone}, {"email": payload.email}]})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this phone number or email already exists. Please log in instead.",
        )
    otp = await _issue_otp(phone, "signup", {
        "name": payload.name, "age": payload.age, "address": payload.address,
        "phone": phone, "email": payload.email,
    })
    return {"sent": True, "mock": True, "otp": otp, "expires_in": OTP_TTL_SECONDS}


@router.post("/signup/verify-otp")
async def signup_verify_otp(payload: SignupVerifyOtp):
    db = get_db()
    phone = _normalize_phone(payload.phone)
    record = await _consume_otp(phone, "signup", payload.otp)
    data = record["payload"]
    customer = {
        "_id": new_id("cust"),
        "name": data["name"],
        "age": data["age"],
        "address": data["address"],
        "phone": data["phone"],
        "email": data["email"],
        "phone_verified": True,
        "created_at": now_iso(),
    }
    await db.customers.insert_one(customer)
    return customer


@router.post("/login/request-otp")
async def login_request_otp(payload: LoginRequestOtp):
    db = get_db()
    phone = _normalize_phone(payload.phone)
    customer = await db.customers.find_one({"phone": phone})
    if not customer:
        raise HTTPException(status_code=404, detail="No account found for this phone number. Please sign up.")
    otp = await _issue_otp(phone, "login", None)
    return {"sent": True, "mock": True, "otp": otp, "expires_in": OTP_TTL_SECONDS}


@router.post("/login/verify-otp")
async def login_verify_otp(payload: LoginVerifyOtp):
    db = get_db()
    phone = _normalize_phone(payload.phone)
    await _consume_otp(phone, "login", payload.otp)
    customer = await db.customers.find_one({"phone": phone})
    if not customer:
        raise HTTPException(status_code=404, detail="Account no longer exists.")
    return customer
