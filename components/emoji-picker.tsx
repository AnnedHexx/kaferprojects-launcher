'use client'

import { useMemo, useState } from 'react'
import { Search, Star, X } from 'lucide-react'
import { EMOJIS, EMOJI_CATEGORIES, emojiSrc, type EmojiEntry } from '@/lib/emoji-catalog'

const RECENT_KEY = 'eko.emojis.recent'
const FAV_KEY = 'eko.emojis.favorite'

function readList(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, value: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value.slice(0, 48)))
  } catch {}
}

export function pushRecentEmoji(id: string) {
  const recent = readList(RECENT_KEY).filter((item) => item !== id)
  writeList(RECENT_KEY, [id, ...recent])
}

type EmojiPickerProps = {
  onPick: (id: string) => void
  onClose?: () => void
  className?: string
  compact?: boolean
}

type Section = 'all' | 'recent' | 'favorite' | string

export function EmojiPicker({ onPick, onClose, className, compact }: EmojiPickerProps) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('all')
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY))

  const list = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    let base: EmojiEntry[] = EMOJIS
    if (section === 'recent') {
      const map = new Map(EMOJIS.map((emoji) => [emoji.id, emoji]))
      base = recent.map((id) => map.get(id)).filter((emoji): emoji is EmojiEntry => Boolean(emoji))
    } else if (section === 'favorite') {
      const map = new Map(EMOJIS.map((emoji) => [emoji.id, emoji]))
      base = favorites.map((id) => map.get(id)).filter((emoji): emoji is EmojiEntry => Boolean(emoji))
    } else if (section !== 'all') {
      base = EMOJIS.filter((emoji) => emoji.category === section)
    }
    if (!normalized) return base
    return base.filter(
      (emoji) =>
        emoji.id.includes(normalized) ||
        emoji.label.toLowerCase().includes(normalized) ||
        emoji.category.toLowerCase().includes(normalized) ||
        String(emoji.row) === normalized ||
        String(emoji.col) === normalized,
    )
  }, [query, section, recent, favorites])

  function pick(emoji: EmojiEntry) {
    pushRecentEmoji(emoji.id)
    setRecent(readList(RECENT_KEY))
    onPick(emoji.id)
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current]
      writeList(FAV_KEY, next)
      return next
    })
  }

  const tabs: { id: Section; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'recent', label: 'Recientes' },
    { id: 'favorite', label: 'Favoritos' },
    ...EMOJI_CATEGORIES.map((category) => ({ id: category, label: category })),
  ]

  return (
    <div className={`emoji-picker ${compact ? 'compact' : ''} ${className || ''}`} role="dialog" aria-label="Selector de emojis EKO">
      <div className="emoji-picker-head">
        <div className="emoji-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar emoji EKO…"
            autoFocus
          />
        </div>
        {onClose && (
          <button type="button" className="emoji-close" onClick={onClose} aria-label="Cerrar selector de emojis">
            <X />
          </button>
        )}
      </div>

      <div className="emoji-tabs" role="tablist" aria-label="Categorías de emojis">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            className={section === tab.id ? 'active' : ''}
            onClick={() => setSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="emoji-grid">
        {list.map((emoji) => (
          <div key={emoji.id} className="emoji-cell">
            <button type="button" className="emoji-pick" title={emoji.label} onClick={() => pick(emoji)}>
              <img src={emojiSrc(emoji.id)} alt={emoji.label} loading="lazy" draggable={false} />
            </button>
            <button
              type="button"
              className={`emoji-fav ${favorites.includes(emoji.id) ? 'on' : ''}`}
              onClick={() => toggleFavorite(emoji.id)}
              aria-label={favorites.includes(emoji.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <Star />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="emoji-empty">
            {section === 'recent'
              ? 'Todavía no has usado emojis EKO.'
              : section === 'favorite'
                ? 'Marca emojis con la estrella para tenerlos a mano.'
                : 'No se encontraron emojis con esa búsqueda.'}
          </p>
        )}
      </div>
    </div>
  )
}
