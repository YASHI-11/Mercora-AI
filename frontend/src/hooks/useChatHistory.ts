import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Chat message state backed by sessionStorage. Each merchant/shop tab is a
 * distinct React Router route, so a plain useState in a chat component gets
 * wiped whenever the user navigates to another tab and back (the component
 * unmounts). Persisting to sessionStorage keeps the conversation alive for
 * the whole browser tab session while still clearing on a real new session.
 */
export function useChatHistory<T>(storageKey: string, initial: T[]): [T[], Dispatch<SetStateAction<T[]>>] {
  const [messages, setMessages] = useState<T[]>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as T[]
    } catch {
      // corrupt/unavailable storage -- start fresh
    }
    return initial
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {
      // storage unavailable (private mode, quota) -- conversation just won't persist
    }
  }, [storageKey, messages])

  return [messages, setMessages]
}
