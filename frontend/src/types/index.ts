export interface Product {
  _id: string
  merchant_id: string
  name: string
  category: string
  brand: string
  description: string
  price: number
  discount: number
  inventory: number
  rating: number
  features: string[]
  tags: string[]
  image: string
  created_at: string
  match_score?: number
  similarity_score?: number
  reason?: string
  confidence?: number
  best_pick?: boolean
  units_sold?: number
  revenue?: number
}

export interface CartItem {
  product_id: string
  name: string
  image: string
  price: number
  quantity: number
  line_total: number
}

export interface Cart {
  cart_id: string
  customer_id: string
  items: CartItem[]
  subtotal: number
  total: number
}

export interface Order {
  _id: string
  customer_id: string
  merchant_id: string
  items: { product_id: string; name: string; quantity: number; price: number }[]
  subtotal: number
  discount: number
  total: number
  razorpay_order_id: string | null
  payment_status: string
  order_status: string
  created_at: string
}

export interface ShoppingAgentResponse {
  reply: string
  products: Product[]
  cross_sell: Product[]
  intent: { category: string | null; budget: number | null; keywords: string[] }
  session_id: string
  redirect_to_checkout?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  products?: Product[]
  crossSell?: Product[]
}

export interface Opportunity {
  _id: string
  merchant_id: string
  type: 'bundle' | 'upsell'
  products: string[]
  product_names: string[]
  score: number
  expected_uplift: number
  reason: string
  status: string
  support?: number
  confidence?: number
  lift?: number
  recommended_discount?: number
  applied_discount?: number
}

export interface AuditLog {
  _id: string
  merchant_id: string
  agent: string
  action: string
  target: string
  result: string
  approval_status: string
  created_at: string
}

export interface GuardrailSettings {
  max_discount: number
  max_bundle_discount: number
  automatic_campaign_creation: boolean
  automatic_price_changes: boolean
  merchant_approval_required: boolean
}

export interface MerchantOverview {
  total_revenue: number
  total_orders: number
  average_order_value: number
  conversion_rate: number
  ai_attributed_revenue: number
  ai_attributed_orders: number
  growth_opportunities_count: number
}
