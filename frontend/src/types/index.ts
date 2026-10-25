export interface Product {
  _id: string
  merchant_id: string
  name: string
  category: string
  subcategory?: string
  brand: string
  description: string
  price: number
  discount: number
  inventory: number
  rating: number
  rating_count?: number
  features: string[]
  tags: string[]
  image: string
  /** Attribution for an openly licensed stock photo (illustrates the product type, not the exact item). */
  image_credit?: { author: string; license: string; source: string } | null
  created_at: string
  match_score?: number
  similarity_score?: number
  reason?: string
  /** Why a recommender picked this product (backend app/ml/explain.py). */
  explanation?: Explanation
  confidence?: number
  best_pick?: boolean
  units_sold?: number
  order_count?: number
  /** Too few buyers for an implicit rating: `rating` is the category median. */
  rating_imputed?: boolean
  revenue?: number
}

export interface CartItem {
  product_id: string
  name: string
  image: string
  category?: string
  subcategory?: string
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

export interface Invoice {
  invoice_number: string
  issued_at: string
  order_id: string
  customer: { name: string; address: string; phone: string; email: string }
  delivery: { name: string; address: string; phone: string }
  items: { product_id: string; name: string; quantity: number; price: number }[]
  subtotal: number
  discount: number
  total: number
  payment: {
    status: string
    razorpay_order_id: string | null
    razorpay_payment_id: string | null
    paid_at: string | null
  }
}

export interface ShoppingAgentResponse {
  reply: string
  products: Product[]
  cross_sell: Product[]
  intent: { category: string | null; budget: number | null; min_budget: number | null; keywords: string[] }
  session_id: string
  redirect_to_checkout?: boolean
  /** 'live' when the configured LLM answered this turn; a 'fallback_*' value
   * means it silently degraded to the deterministic keyword parser. */
  llm_status?: 'live' | 'fallback_not_configured' | 'fallback_error' | null
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
  /** Tracked checkout sessions; 0 means conversion_rate is a fallback, not a measurement. */
  checkout_sessions?: number
}

export type ExplanationMethod = 'co_purchase' | 'content' | 'intent' | 'popularity'

export interface Explanation {
  method: ExplanationMethod
  /** One sentence for shoppers. */
  summary: string
  /** Pre-formatted numbers behind the pick, e.g. { label: 'Lift', value: '3.10×' }. */
  signals: { label: string; value: string }[]
  metrics: Record<string, unknown>
}

export interface RecommenderScores {
  precision_at_k: number
  recall_at_k: number
  hit_rate: number
  /** Share of evaluated customers the method could recommend anything to. */
  coverage: number
}

export interface MlEvaluation {
  generated_at: string
  source: 'scripts/evaluate_ml.py' | 'merchant_ui'
  k: number
  duration_seconds: number
  data: { products: number; customers: number; paid_orders: number; train_orders: number; test_customers: number }
  recommendations: {
    n_evaluated: number
    content: RecommenderScores
    rules: RecommenderScores
    popularity_baseline: RecommenderScores
  } | null
  rules: {
    count: number
    mining_seconds: number
    support?: { min: number; max: number; avg: number }
    confidence?: { min: number; max: number; avg: number }
    lift?: { min: number; max: number; avg: number }
    holdout: {
      n_rules: number
      min_baskets: number
      avg_train_confidence: number
      avg_holdout_confidence: number
      points: {
        product_a: string
        product_b: string
        train_confidence: number
        holdout_confidence: number
        holdout_baskets: number
        lift: number
      }[]
    } | null
  }
  segmentation: {
    silhouette_score: number | null
    segments: { cluster_id: number; name: string; size: number; avg_total_spent: number; avg_frequency: number; avg_recency_days: number }[]
  }
}

export interface MlEvaluationResponse {
  /** null until the first evaluation has been run. */
  latest: MlEvaluation | null
  history: Pick<MlEvaluation, 'generated_at' | 'source' | 'recommendations'>[]
}
