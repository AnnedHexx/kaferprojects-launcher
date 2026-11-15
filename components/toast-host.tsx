'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { SkinFace } from '@/components/skin-face'
import type { IncomingMessagePayload } from '@/lib/notifications'

type Toast = IncomingMessagePayload & { key: string }

export function ToastHost({ onOpen }: { onOpen?: (toast: Toast) => void }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<IncomingMessagePayload>).detail
      if (!detail) return
      const toast: Toast = { ...detail, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
      setToasts((current) => [...current.slice(-2), toast])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.key !== toast.key))
      }, 6000)
    }
    window.addEventListener('eko:message-toast', onToast)
    return () => window.removeEventListener('eko:message-toast', onToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <aside className="toast-stack" aria-live="polite" aria-label="Mensajes nuevos">
      {toasts.map((toast) => (
        <article key={toast.key} className="message-toast">
          <button
            type="button"
            className="toast-main"
            onClick={() => {
              onOpen?.(toast)
              setToasts((current) => current.filter((item) => item.key !== toast.key))
            }}
          >
            <span className="toast-avatar">
              {toast.gamertag ? (
                <SkinFace gamertag={toast.gamertag} size={42} />
              ) : toast.avatar ? (
                <img src={toast.avatar} alt="" />
              ) : (
                <MessageSquare />
              )}
            </span>
            <span className="toast-copy">
              <strong>{toast.title}</strong>
              <span>{toast.body}</span>
            </span>
          </button>
          <button
            type="button"
            className="toast-close"
            aria-label="Descartar notificación"
            onClick={() => setToasts((current) => current.filter((item) => item.key !== toast.key))}
          >
            <X />
          </button>
        </article>
      ))}
    </aside>
  )
}
