'use client'

let clickAudio: HTMLAudioElement | null = null
let selectAudio: HTMLAudioElement | null = null
let installed = false

function ensureAudio() {
  if (typeof window === 'undefined') return
  if (!clickAudio) {
    clickAudio = new Audio('./clickear.mp3')
    clickAudio.preload = 'auto'
    clickAudio.volume = 0.4
  }
}

function ensureSelectAudio() {
  if (typeof window === 'undefined') return
  if (!selectAudio) {
    selectAudio = new Audio('./seleccionar.wav')
    selectAudio.preload = 'auto'
    selectAudio.volume = 0.55
  }
}

export function playSelectSound() {
  ensureSelectAudio()
  safePlay(selectAudio)
}

const INTERACTIVE_SELECTOR = 'button, a, [role="switch"], .client-card, .rail-server'

function findInteractive(target: Element | null): HTMLElement | null {
  if (!target) return null
  const element = target.closest(INTERACTIVE_SELECTOR) as HTMLElement | null
  if (!element) return null
  if (element.matches(':disabled')) return null
  if (element.getAttribute('aria-disabled') === 'true') return null
  return element
}

function safePlay(audio: HTMLAudioElement | null) {
  if (!audio) return
  try {
    audio.currentTime = 0
    const result = audio.play()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {}
}

export function installUiSounds(): () => void {
  if (typeof window === 'undefined' || installed) return () => {}
  installed = true
  ensureAudio()

  function onClick(event: MouseEvent) {
    const element = findInteractive(event.target as Element | null)
    if (!element) return
    ensureAudio()
    safePlay(clickAudio)
  }

  function unlock() {
    ensureAudio()
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('pointerdown', unlock, { capture: true, once: true })
  document.addEventListener('keydown', unlock, { capture: true, once: true })

  return () => {
    installed = false
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('pointerdown', unlock, true)
    document.removeEventListener('keydown', unlock, true)
  }
}
