'use client'

import { useEffect, useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { EmojiPicker } from '@/components/emoji-picker'
import { EmojiGlyph } from '@/components/emoji-text'

const STORAGE_KEY = 'eko.reactions.v1'
const EVENT = 'eko:reactions-updated'

type ReactionStore = Record<string, Record<string, string[]>>

function readStore(): ReactionStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as ReactionStore) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: ReactionStore) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT))
}

type EmojiReactionsProps = {
  targetId: string
  user?: string
  className?: string
  align?: 'left' | 'right'
}

export function EmojiReactions({ targetId, user, className, align = 'left' }: EmojiReactionsProps) {
  const [reactions, setReactions] = useState<Record<string, string[]>>({})
  const [open, setOpen] = useState(false)
  const me = (user || 'invitado').toLowerCase()

  useEffect(() => {
    const refresh = () => {
      const store = readStore()
      setReactions(store[targetId] || {})
    }
    refresh()
    window.addEventListener(EVENT, refresh)
    return () => window.removeEventListener(EVENT, refresh)
  }, [targetId])

  function toggle(emojiId: string) {
    const store = readStore()
    const entry: Record<string, string[]> = { ...(store[targetId] || {}) }
    const users = entry[emojiId] ? [...entry[emojiId]] : []
    const index = users.indexOf(me)
    if (index >= 0) users.splice(index, 1)
    else users.push(me)
    if (users.length) entry[emojiId] = users
    else delete entry[emojiId]
    if (Object.keys(entry).length) store[targetId] = entry
    else delete store[targetId]
    writeStore(store)
  }

  const entries = Object.entries(reactions)

  return (
    <div
      className={`emoji-reactions ${align === 'right' ? 'align-right' : ''} ${className || ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {entries.map(([emojiId, users]) => (
        <button
          key={emojiId}
          type="button"
          className={`emoji-reaction ${users.includes(me) ? 'mine' : ''}`}
          onClick={() => toggle(emojiId)}
          title={users.length === 1 ? '1 reacción' : `${users.length} reacciones`}
        >
          <EmojiGlyph id={emojiId} size={18} />
          <b>{users.length}</b>
        </button>
      ))}

      <div className="emoji-add-wrap">
        <button
          type="button"
          className="emoji-reaction emoji-add"
          onClick={() => setOpen((current) => !current)}
          aria-label="Añadir una reacción con emoji EKO"
        >
          <SmilePlus />
        </button>
        {open && (
          <EmojiPicker
            compact
            className={`emoji-popover ${align === 'right' ? 'align-right' : ''}`}
            onPick={(emojiId) => {
              toggle(emojiId)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
