'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Mantiene la ventana montada el tiempo justo para reproducir su animación
 * de cierre antes de llamar a onClose.
 */
export function useClosing(onClose: () => void, duration = 190) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<number | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const requestClose = useCallback(() => {
    setClosing((current) => {
      if (current) return current
      timer.current = window.setTimeout(() => closeRef.current(), duration)
      return true
    })
  }, [duration])

  return { closing, requestClose }
}
