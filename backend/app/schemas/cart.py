from pydantic import BaseModel


class CartItemCreate(BaseModel):
    product_id: str
    quantity: int = 1


class CartItemUpdate(BaseModel):
    quantity: int


class OrderCreate(BaseModel):
    customer_id: str


class PaymentOrderCreate(BaseModel):
    customer_id: str


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: str


class AgentChatRequest(BaseModel):
    message: str
    customer_id: str
    session_id: str | None = None


class GrowthChatRequest(BaseModel):
    message: str
    merchant_id: str | None = None
    session_id: str | None = None


class GuardrailSettings(BaseModel):
    max_discount: float = 10
    max_bundle_discount: float = 15
    automatic_campaign_creation: bool = False
    automatic_price_changes: bool = False
    merchant_approval_required: bool = True


class OpportunityApproval(BaseModel):
    approve: bool
    discount: float | None = None
