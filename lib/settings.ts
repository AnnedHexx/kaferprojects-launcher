'use client'

export type ThemeMode = 'dark' | 'light'
export type AccentColor = 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red'
export type AccentMode = 'solid' | 'gradient'
export type UiScale = 'compact' | 'normal' | 'large'

export type EkoSettings = {
  // General
  startWithWindows: boolean
  minimizeOnClose: boolean
  minimizeOnPlay: boolean
  defaultServerId: number

  // Discord
  discordPresence: boolean
  richServers: boolean

  // Apariencia
  theme: ThemeMode
  accentMode: AccentMode
  accentColor: string
  accentGradient: string[]
  playColors: string[]
  sidebarColor: string
  sidebarOpacity: number
  sidebarBlur: number
  backgroundImage: string
  transparency: number
  animations: boolean
  uiScale: UiScale
  compactMode: boolean

  // Rendimiento
  liteMode: boolean
  reducedAnimations: boolean

  // Privacidad y seguridad
  securityConfirmations: boolean
  saveHistory: boolean
  clearHistoryOnExit: boolean
  showPassword: boolean

  // Notificaciones
  notifyNewInstances: boolean
  notifyDownloads: boolean

  // Avanzado
  advancedMode: boolean
}

export const defaultSettings: EkoSettings = {
  startWithWindows: false,
  minimizeOnClose: false,
  minimizeOnPlay: true,
  defaultServerId: 1,

  discordPresence: true,
  richServers: true,

  theme: 'dark',
  accentMode: 'solid',
  accentColor: '#7F49B4',
  accentGradient: ['#7F49B4', '#5B2E86', '#141414'],
  playColors: ['#7F49B4', '#A57FC4'],
  sidebarColor: '#141414',
  sidebarOpacity: 88,
  sidebarBlur: 0,
  backgroundImage: '',
  transparency: 0,
  animations: true,
  uiScale: 'normal',
  compactMode: false,

  liteMode: false,
  reducedAnimations: false,

  securityConfirmations: true,
  saveHistory: true,
  clearHistoryOnExit: false,
  showPassword: true,

  notifyNewInstances: true,
  notifyDownloads: true,

  advancedMode: false,
}

export const accentMap: Record<AccentColor, { main: string; soft: string; glow: string }> = {
  purple: { main: '#7F49B4', soft: 'rgba(127,73,180,.16)', glow: 'rgba(127,73,180,.45)' },
  green: { main: '#18bd18', soft: 'rgba(24,189,24,.16)', glow: 'rgba(24,189,24,.4)' },
  blue: { main: '#3b82f6', soft: 'rgba(59,130,246,.16)', glow: 'rgba(59,130,246,.4)' },
  pink: { main: '#ec4899', soft: 'rgba(236,72,153,.16)', glow: 'rgba(236,72,153,.4)' },
  orange: { main: '#f97316', soft: 'rgba(249,115,22,.16)', glow: 'rgba(249,115,22,.4)' },
  red: { main: '#ef4444', soft: 'rgba(239,68,68,.16)', glow: 'rgba(239,68,68,.4)' },
}

export const accentPalette: { id: AccentColor; label: string; hex: string }[] = [
  { id: 'purple', label: 'Morado', hex: '#7F49B4' },
  { id: 'green', label: 'Verde', hex: '#18bd18' },
  { id: 'blue', label: 'Azul', hex: '#3b82f6' },
  { id: 'pink', label: 'Rosa', hex: '#ec4899' },
  { id: 'orange', label: 'Naranja', hex: '#f97316' },
  { id: 'red', label: 'Rojo', hex: '#ef4444' },
]

export const themeMap: Record<ThemeMode, { bg: string; bg2: string; panel: string }> = {
  dark: { bg: '#141414', bg2: '#1c1c1c', panel: 'rgba(20,20,20,.82)' },
  light: { bg: '#efeaf5', bg2: '#ffffff', panel: 'rgba(255,255,255,.82)' },
}

/** Solo quedan 2 temas; los valores antiguos migran a oscuro. */
const LEGACY_THEMES: Record<string, ThemeMode> = {
  darker: 'dark', midnight: 'dark', amoled: 'dark',
}

const storageKey = 'eko.settings'

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function normalizeHex(value: string, fallback = '#7F49B4'): string {
  const raw = (value || '').trim()
  if (HEX_RE.test(raw)) return raw.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`
  return fallback
}

export function hexToRgb(value: string): [number, number, number] {
  let hex = normalizeHex(value).slice(1)
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('')
  return [
    parseInt(hex.slice(0, 2), 16) || 0,
    parseInt(hex.slice(2, 4), 16) || 0,
    parseInt(hex.slice(4, 6), 16) || 0,
  ]
}

export function withAlpha(value: string, alpha: number): string {
  const [r, g, b] = hexToRgb(value)
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha))})`
}

function cleanColors(value: unknown, fallback: string[], min: number, max: number): string[] {
  const list = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && HEX_RE.test(item.trim())).map((item) => normalizeHex(item))
    : []
  const base = list.length ? list : fallback
  return base.slice(0, max).concat(Array.from({ length: Math.max(0, min - base.length) }, () => base[base.length - 1] || fallback[0]))
}

export function normalizeSettings(input: Partial<EkoSettings> | null | undefined): EkoSettings {
  const record = (input || {}) as Partial<EkoSettings> & { accent?: string }
  const merged = { ...defaultSettings, ...record }
  // Migración desde la versión anterior, que guardaba el acento como nombre ('green', 'blue', ...).
  const legacyAccent = record.accent ? accentPalette.find((item) => item.id === record.accent)?.hex : undefined
  return {
    ...merged,
    theme: themeMap[merged.theme as ThemeMode] ? (merged.theme as ThemeMode) : 'dark',
    accentMode: merged.accentMode === 'gradient' ? 'gradient' : 'solid',
    accentColor: normalizeHex(
      typeof record.accentColor === 'string' ? record.accentColor : legacyAccent || defaultSettings.accentColor,
      defaultSettings.accentColor,
    ),
    accentGradient: cleanColors(merged.accentGradient, defaultSettings.accentGradient, 2, 4),
    playColors: cleanColors(merged.playColors, defaultSettings.playColors, 1, 3),
    sidebarColor: normalizeHex(merged.sidebarColor, defaultSettings.sidebarColor),
    sidebarOpacity: Math.min(100, Math.max(0, Number(merged.sidebarOpacity ?? defaultSettings.sidebarOpacity))),
    sidebarBlur: Math.min(40, Math.max(0, Number(merged.sidebarBlur ?? defaultSettings.sidebarBlur))),
    transparency: Math.min(90, Math.max(0, Number(merged.transparency ?? 0))),
  }
}

export function loadSettings(): EkoSettings {
  if (typeof window === 'undefined') return defaultSettings
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return defaultSettings
    return normalizeSettings(JSON.parse(stored) as Partial<EkoSettings>)
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: EkoSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeSettings(settings)))
  } catch {}
}

export function resetSettings(): EkoSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {}
  }
  return defaultSettings
}

export function exportSettings(settings: EkoSettings): string {
  return JSON.stringify(normalizeSettings(settings), null, 2)
}

export function importSettings(raw: string): EkoSettings | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EkoSettings>
    if (!parsed || typeof parsed !== 'object') return null
    return normalizeSettings(parsed)
  } catch {
    return null
  }
}

export function applyAppearance(settings: EkoSettings) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const safe = normalizeSettings(settings)
  const theme = themeMap[safe.theme]
  const accentColors = safe.accentGradient.slice(0, 4)
  const gradient = safe.accentMode === 'gradient' && accentColors.length > 1
  const accent = gradient ? accentColors[0] : safe.accentColor
  const [r, g, b] = hexToRgb(accent)
  const accentGradient = gradient
    ? `linear-gradient(135deg, ${accentColors.join(', ')})`
    : accent
  const play = safe.playColors.slice(0, 3)
  const playGradient = play.length > 1 ? `linear-gradient(90deg, ${play.join(', ')})` : play[0] || accent

  root.style.setProperty('--purple', accent)
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-rgb', `${r},${g},${b}`)
  root.style.setProperty('--accent-2', safe.accentGradient[1] || accent)
  root.style.setProperty('--accent-grad', accentGradient)
  root.style.setProperty('--accent-soft', `rgba(${r},${g},${b},.16)`)
  root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},.45)`)
  root.style.setProperty('--play-grad', playGradient)
  root.style.setProperty('--sidebar-bg', withAlpha(safe.sidebarColor, safe.sidebarOpacity / 100))
  root.style.setProperty('--sidebar-blur', `${safe.sidebarBlur}px`)
  root.style.setProperty('--app-bg', theme.bg)
  root.style.setProperty('--app-bg-2', theme.bg2)
  root.style.setProperty('--panel', theme.panel)
  root.style.setProperty('--transparency', `${safe.transparency}%`)

  root.dataset.theme = safe.theme
  root.dataset.accent = safe.accentMode
  root.dataset.uiScale = safe.uiScale
  root.dataset.animations = safe.animations && !safe.reducedAnimations && !safe.liteMode ? 'on' : 'off'
  root.dataset.compact = safe.compactMode ? 'on' : 'off'
  root.dataset.transparency = safe.transparency > 0 ? 'on' : 'off'
}
