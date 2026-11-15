'use client'

export type FriendStatus = 'online' | 'playing' | 'away' | 'offline'

export type Friend = {
  id: string
  gamertag: string
  status: FriendStatus
  playing?: string
  group?: boolean
  owner?: boolean
  memberCount?: number
  createdAt?: string
  description?: string
}

export type ChatMessage = {
  id: string
  author: 'me' | 'them'
  gamertag: string
  text: string
  time: string
  image?: string
  pinned?: boolean
}

export const FRIENDS_KEY = 'eko.social.friends.v1'
export const MESSAGES_KEY = 'eko.social.messages.v1'

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadFriends(): Friend[] {
  if (typeof window === 'undefined') return []
  const parsed = safeParse<Friend[]>(window.localStorage.getItem(FRIENDS_KEY))
  if (!Array.isArray(parsed)) return []
  return parsed.filter((friend) => friend && typeof friend.id === 'string' && typeof friend.gamertag === 'string')
}

export function saveFriends(friends: Friend[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
  } catch {}
}

export function loadMessages(): Record<string, ChatMessage[]> {
  if (typeof window === 'undefined') return {}
  const parsed = safeParse<Record<string, ChatMessage[]>>(window.localStorage.getItem(MESSAGES_KEY))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const clean: Record<string, ChatMessage[]> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) continue
    clean[key] = value.filter((message) => message && typeof message.id === 'string')
  }
  return clean
}

export function saveMessages(messages: Record<string, ChatMessage[]>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
  } catch {}
}

export function createFriendId(): string {
  return `friend-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function statusLabel(status: FriendStatus): string {
  return status === 'online' ? 'En línea' : status === 'playing' ? 'Jugando' : status === 'away' ? 'Ausente' : 'Desconectado'
}

export type SuggestedPlayer = { gamertag: string; reason: string }

/**
 * Sugerencias locales: se construyen a partir de personas reales que ya
 * interactúan con este dispositivo (autores de publicaciones o miembros de
 * grupos). Si no hay coincidencias, no se muestra la sección.
 */
export function suggestPlayers(
  viewer: string,
  friends: Friend[],
  postAuthors: string[],
): SuggestedPlayer[] {
  const normalizedViewer = viewer.trim().toLowerCase()
  const known = new Set(friends.map((friend) => friend.gamertag.trim().toLowerCase()))

  const suggestions = new Map<string, string>()
  for (const author of postAuthors) {
    const tag = author.trim()
    const key = tag.toLowerCase()
    if (!tag || key === normalizedViewer || known.has(key)) continue
    suggestions.set(tag, 'Publica en canales que sigues')
  }

  return Array.from(suggestions, ([gamertag, reason]) => ({ gamertag, reason })).slice(0, 4)
}
