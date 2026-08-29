import logging
import hmac
import hashlib
import razorpay
from app.config import get_settings

logger = logging.getLogger("mercora.razorpay")
settings = get_settings()

_client: razorpay.Client | None = None


def _get_client() -> razorpay.Client | None:
    global _client
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        return None
    if _client is None:
        _client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    return _client


def is_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def create_order(amount_rupees: float, receipt: str, notes: dict) -> dict:
    """Amount in rupees; Razorpay expects paise. Falls back to a mock order
    when Razorpay credentials are not configured, so the app stays demoable."""
    amount_paise = int(round(amount_rupees * 100))
    client = _get_client()
    if client is None:
        logger.warning("Razorpay not configured; returning mock order")
        return {
            "id": f"order_mock_{receipt}",
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "status": "created",
            "mock": True,
        }
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": notes,
    })
    order["mock"] = False
    return order


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not is_configured():
        # Mock mode: accept a deterministic mock signature so the demo flow works end to end.
        expected = hashlib.sha256(f"{order_id}|{payment_id}|mock".encode()).hexdigest()
        return signature == expected
    client = _get_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False


def mock_signature(order_id: str, payment_id: str) -> str:
    return hashlib.sha256(f"{order_id}|{payment_id}|mock".encode()).hexdigest()
