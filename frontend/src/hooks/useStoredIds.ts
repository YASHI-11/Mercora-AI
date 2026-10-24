import { useCallback, useSyncExternalStore } from 'react'

// Per-browser id lists (wishlist, compare). They are conveniences, not
// account data: storage can be unavailable (private mode, blocked site data),
// so every access is guarded and the UI works with an empty list.
const EVENT = 'mercora:stored-ids'

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

const snapshots = new Map<string, { raw: string | null; ids: string[] }>()

function snapshot(key: string): string[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    raw = null
  }
  const cached = snapshots.get(key)
  if (cached && cached.raw === raw) return cached.ids
  const ids = read(key)
  snapshots.set(key, { raw, ids })
  return ids
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useStoredIds(key: string, max = 100) {
  const ids = useSyncExternalStore(subscribe, () => snapshot(key), () => [])

  const write = useCallback((next: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(next.slice(-max)))
    } catch {
      // storage unavailable: the change just doesn't persist
    }
    window.dispatchEvent(new Event(EVENT))
  }, [key, max])

  const toggle = useCallback((id: string) => {
    const current = snapshot(key)
    write(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }, [key, write])

  const remove = useCallback((id: string) => write(snapshot(key).filter((x) => x !== id)), [key, write])
  const clear = useCallback(() => write([]), [write])

  return { ids, has: (id: string) => ids.includes(id), toggle, remove, clear, full: ids.length >= max }
}

export const useWishlist = () => useStoredIds('mercora_wishlist', 100)
export const COMPARE_MAX = 3
export const useCompare = () => useStoredIds('mercora_compare', COMPARE_MAX)
