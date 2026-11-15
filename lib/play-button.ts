'use client'

import type { CSSProperties } from 'react'
import { isPlayAnimation, type PlayAnimationId } from './play-animations'
import { playFont, playFontClass } from './play-fonts'

export type PlayButtonConfig = {
  x: number
  y: number
  rotation: number
  /** Color principal. Vacío = usar el color base de la instancia o el tema. */
  color: string
  /** Segundo color (degradados, fuego, océano, glitch). */
  color2: string
  /** Tercer color (aurora, lluvia). */
  color3: string
  /** Cuarto color (aurora, lluvia). */
  color4: string
  /** Quinto color (lluvia, confeti). */
  color5: string
  animation: PlayAnimationId
  font: string
  /** Escala del texto: 1 = normal. */
  fontSize: number
  /** Color del texto. Vacío = blanco automático. */
  textColor: string
  /** Imagen o GIF en data URL. */
  image: string
  /** Opacidad de la imagen (0 a 1). */
  imageOpacity: number
  imageFit: 'cover' | 'contain'
}

export const defaultPlayButton: PlayButtonConfig = {
  x: 0,
  y: 0,
  rotation: 0,
  color: '',
  color2: '#E05C8A',
  color3: '#49B47F',
  color4: '#4A90D9',
  color5: '#F2C14E',
  animation: 'none',
  font: 'default',
  fontSize: 1,
  textColor: '',
  image: '',
  imageOpacity: 0.85,
  imageFit: 'cover',
}

const STORAGE_KEY = 'kafer.playButton.v1'
const MAX_IMAGE_CHARS = 2_600_000

export function normalizePlayColor(value: string): string {
  const raw = String(value || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const hex = raw.slice(1)
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`
  return ''
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(min, value))
}

function colorOr(value: unknown, fallback: string): string {
  return normalizePlayColor(String(value || '')) || fallback
}

export function normalizePlayButton(input: unknown): PlayButtonConfig {
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<PlayButtonConfig>
  const image = typeof parsed.image === 'string' ? parsed.image.trim() : ''
  return {
    x: clamp(Number(parsed.x ?? 0), -900, 900),
    y: clamp(Number(parsed.y ?? 0), -600, 600),
    rotation: clamp(Number(parsed.rotation ?? 0), -360, 360),
    color: normalizePlayColor(String(parsed.color || '')),
    color2: colorOr(parsed.color2, defaultPlayButton.color2),
    color3: colorOr(parsed.color3, defaultPlayButton.color3),
    color4: colorOr(parsed.color4, defaultPlayButton.color4),
    color5: colorOr(parsed.color5, defaultPlayButton.color5),
    animation: isPlayAnimation(parsed.animation) ? parsed.animation : 'none',
    font: playFont(String(parsed.font || 'default')).id,
    fontSize: clamp(Number(parsed.fontSize ?? 1), 0.6, 1.7),
    textColor: normalizePlayColor(String(parsed.textColor || '')),
    image: image.length <= MAX_IMAGE_CHARS ? image : '',
    imageOpacity: clamp(Number(parsed.imageOpacity ?? 0.85), 0, 1),
    imageFit: parsed.imageFit === 'contain' ? 'contain' : 'cover',
  }
}

/** Configuración efectiva de una instancia: su botón o su color base anterior. */
export function playButtonForServer(
  server: { button?: PlayButtonConfig; buttonColor?: string } | null | undefined,
): PlayButtonConfig {
  const config = normalizePlayButton(server?.button)
  if (!server?.button) {
    const base = normalizePlayColor(String(server?.buttonColor || ''))
    if (base) return { ...config, color: base }
  }
  return config
}

export function playButtonColors(config: PlayButtonConfig, fallbackColor = ''): string[] {
  const primary = normalizePlayColor(config.color) || normalizePlayColor(fallbackColor) || '#7F49B4'
  return [
    primary,
    colorOr(config.color2, defaultPlayButton.color2),
    colorOr(config.color3, defaultPlayButton.color3),
    colorOr(config.color4, defaultPlayButton.color4),
    colorOr(config.color5, defaultPlayButton.color5),
  ]
}

/** Fondo inline del botón según la animación elegida. */
export function playButtonPaint(
  config: PlayButtonConfig,
  fallbackColor = '',
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const [c1, c2, c3, c4] = playButtonColors(config, fallbackColor)
  const solid = { backgroundImage: `linear-gradient(135deg, ${c1}, ${c1})`, backgroundSize: '100% 100%', backgroundPosition: '0% 50%' }
  switch (config.animation) {
    case 'slide-right':
    case 'slide-left':
      return {
        backgroundImage: `linear-gradient(90deg, ${c1}, ${c2}, ${c1})`,
        backgroundSize: '220% 100%',
        backgroundPosition: '0% 50%',
      }
    case 'aurora':
      return {
        backgroundImage: `linear-gradient(120deg, ${c1}, ${c2}, ${c3}, ${c4}, ${c1})`,
        backgroundSize: '320% 320%',
        backgroundPosition: '0% 50%',
      }
    case 'fire':
      return {
        backgroundImage: `linear-gradient(135deg, ${c1}, ${c2}, ${c1})`,
        backgroundSize: '200% 200%',
        backgroundPosition: '0% 50%',
      }
    case 'ocean':
      return {
        backgroundImage: `linear-gradient(135deg, ${c1}, ${c2}, ${c1})`,
        backgroundSize: '200% 200%',
        backgroundPosition: '0% 50%',
      }
    case 'rainbow':
      return {
        backgroundImage:
          'linear-gradient(90deg, #ff004c, #ff8a00, #ffe600, #38d430, #00c8ff, #6a5cff, #ff00d4, #ff004c)',
        backgroundSize: '300% 100%',
        backgroundPosition: '0% 50%',
      }
    case 'glitch':
      return {
        backgroundImage: `linear-gradient(90deg, ${c1}, ${c2}, ${c1}, ${c2}, ${c1})`,
        backgroundSize: '400% 100%',
        backgroundPosition: '0% 50%',
      }
    default:
      return solid
  }
}

/** ¿La animación dibuja barras de lluvia/confeti? */
export function hasFallingParticles(animation: PlayAnimationId): boolean {
  return animation === 'rain' || animation === 'confetti'
}

/** Clases CSS del botón según animación y tipografía. */
export function playButtonClassName(config: PlayButtonConfig, extra = ''): string {
  const fontClass = playFontClass(config.font)
  return ['play-main', `play-anim-${config.animation}`, fontClass, extra].filter(Boolean).join(' ')
}

/** Estilo inline completo: fondo animado, variables de color y transformación. */
export function playButtonStyle(
  config: PlayButtonConfig,
  fallbackColor = '',
  withTransform = true,
): CSSProperties {
  const colors = playButtonColors(config, fallbackColor)
  const paint = playButtonPaint(config, fallbackColor)
  const style: Record<string, string | number> = {
    ...paint,
    '--play-1': colors[0],
    '--play-2': colors[1],
    '--play-3': colors[2],
    '--play-4': colors[3],
    '--play-5': colors[4],
  }
  if (withTransform) {
    style.transform = `translate(${config.x}px, ${config.y}px) rotate(${config.rotation}deg)`
  }
  return style as CSSProperties
}


export function loadPlayButton(): PlayButtonConfig {
  if (typeof window === 'undefined') return defaultPlayButton
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPlayButton
    return normalizePlayButton(JSON.parse(raw))
  } catch {
    return defaultPlayButton
  }
}

export function savePlayButton(config: PlayButtonConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePlayButton(config)))
  } catch {}
}
