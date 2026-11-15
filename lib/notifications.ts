'use client'

import { playSelectSound } from '@/lib/sfx'

export type IncomingMessagePayload = {
  id?: string
  title: string
  body: string
  gamertag?: string
  friendId?: string
  avatar?: string
}

function isAppActive(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    return !document.hidden && document.hasFocus()
  } catch {
    return false
  }
}

/**
 * Con la app abierta y enfocada: tarjeta flotante + sonido "seleccionar".
 * Cerrada, minimizada o en segundo plano: notificación nativa de Windows
 * (gestionada por el proceso principal de Electron).
 */
export function notifyIncomingMessage(payload: IncomingMessagePayload) {
  if (typeof window === 'undefined') return
  if (isAppActive()) {
    playSelectSound()
    window.dispatchEvent(new CustomEvent('eko:message-toast', { detail: payload }))
    return
  }
  window.ekoLauncher?.notify?.({
    title: payload.title,
    body: payload.body,
    icon: payload.avatar,
  })
}

export function pushMessageToast(payload: IncomingMessagePayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('eko:message-toast', { detail: payload }))
}

/**
 * Aviso de instancia nueva publicada por alguien. Quien está activo la ve
 * aparecer en la lista en tiempo real; quien está inactivo (minimizado o en
 * segundo plano) recibe una notificación nativa de Windows.
 */
export function notifyNewInstanceAvailable(name: string) {
  if (typeof window === 'undefined') return
  const body = `${name} ya está disponible en la lista de instancias.`
  if (isAppActive()) {
    window.dispatchEvent(
      new CustomEvent('eko:message-toast', {
        detail: { title: 'Nueva instancia disponible', body },
      }),
    )
    return
  }
  window.ekoLauncher?.notify?.({ title: 'Nueva instancia disponible', body })
}

/** Aviso de que los archivos de una instancia terminaron de descargarse. */
export function notifyDownloadFinished(name: string) {
  if (typeof window === 'undefined') return
  const body = `Los archivos de ${name} ya están instalados. Ya puedes entrar con JUGAR.`
  if (isAppActive()) {
    window.dispatchEvent(
      new CustomEvent('eko:message-toast', {
        detail: { title: 'Descarga terminada', body },
      }),
    )
    return
  }
  window.ekoLauncher?.notify?.({ title: 'Descarga terminada', body })
}
