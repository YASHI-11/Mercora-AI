import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

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
