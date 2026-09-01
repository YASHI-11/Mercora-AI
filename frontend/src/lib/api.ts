import axios from 'axios'

// In local dev, vite.config.ts proxies /api -> localhost:8000, so the
// relative path works with no env var needed. In production the frontend
// and backend are typically deployed to different hosts (e.g. Vercel +
// Railway), so VITE_API_BASE_URL must be set at build time to the deployed
// backend's full URL (e.g. https://your-backend.up.railway.app/api).
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const api = axios.create({ baseURL })

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Request failed'
    return Promise.reject(new Error(message))
  }
)

export function getCustomerId(): string {
  let id = localStorage.getItem('mercora_customer_id')
  if (!id) {
    id = 'cust_guest_' + Math.random().toString(36).slice(2, 12)
    localStorage.setItem('mercora_customer_id', id)
  }
  return id
}

export interface AuthCustomer {
  _id: string
  name?: string
  phone?: string
  email?: string
}

/** Called once signup/login OTP verification succeeds -- swaps the guest
 * identity for the real, verified customer_id so every subsequent call
 * (cart, orders, agent) that reads getCustomerId() picks it up automatically. */
export function setAuthenticatedCustomer(customer: AuthCustomer) {
  localStorage.setItem('mercora_customer_id', customer._id)
  localStorage.setItem('mercora_authenticated', 'true')
  localStorage.setItem('mercora_customer_name', customer.name || '')
}

export function isAuthenticated(): boolean {
  return localStorage.getItem('mercora_authenticated') === 'true'
}

export function getCustomerName(): string {
  return localStorage.getItem('mercora_customer_name') || ''
}

export function logout() {
  localStorage.removeItem('mercora_customer_id')
  localStorage.removeItem('mercora_authenticated')
  localStorage.removeItem('mercora_customer_name')
}

export function getSessionId(key: string): string {
  const storageKey = `mercora_session_${key}`
  let id = sessionStorage.getItem(storageKey)
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2, 12)
    sessionStorage.setItem(storageKey, id)
  }
  return id
}

/** Starts a fresh conversation thread: a new session id so the agent's
 * server-side conversation memory (ordinal/"show more" follow-ups) doesn't
 * leak from the cleared chat into the new one. */
export function resetSessionId(key: string): string {
  const storageKey = `mercora_session_${key}`
  const id = 'sess_' + Math.random().toString(36).slice(2, 12)
  sessionStorage.setItem(storageKey, id)
  return id
}
