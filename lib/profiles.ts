'use client'

export type ProfileBannerPreset = {
  id: string
  label: string
  gradient: string
}

export const PROFILE_BANNERS: ProfileBannerPreset[] = [
  { id: 'aurora', label: 'Aurora EKO', gradient: 'linear-gradient(120deg,#7b2ff7,#f107a3 55%,#ff7a45)' },
  { id: 'nebula', label: 'Nebulosa', gradient: 'linear-gradient(120deg,#12c2e9,#6a11cb 55%,#c471ed)' },
  { id: 'forest', label: 'Bosque', gradient: 'linear-gradient(120deg,#11998e,#38ef7d 60%,#0b6b5c)' },
  { id: 'sunset', label: 'Atardecer', gradient: 'linear-gradient(120deg,#fc5c7d,#6a82fb)' },
  { id: 'midnight', label: 'Medianoche', gradient: 'linear-gradient(120deg,#050a14,#1b2a4a 55%,#4b2a6b)' },
  { id: 'ember', label: 'Brasa', gradient: 'linear-gradient(120deg,#232526,#7f00ff 60%,#e100ff)' },
]

export const NAME_FONTS = [
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif', className: '' },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, serif', className: '' },
  { id: 'trebuchet', label: 'Trebuchet', value: '"Trebuchet MS", sans-serif', className: '' },
  { id: 'courier', label: 'Monoespaciada', value: '"Courier New", monospace', className: '' },
  { id: 'impact', label: 'Impacto', value: 'Impact, Haettenschweiler, sans-serif', className: '' },
  { id: 'sakura', label: 'Sakura', value: '"Segoe Script", "Lucida Handwriting", cursive', className: 'font-sakura' },
  { id: 'jellybean', label: 'Jellybean', value: '"Comic Sans MS", cursive, sans-serif', className: 'font-jellybean' },
  { id: 'modern', label: 'Modern', value: '"Inter", "Segoe UI", sans-serif', className: 'font-modern' },
  { id: 'medieval', label: 'Medieval', value: '"UnifrakturCook", "Times New Roman", serif', className: 'font-medieval' },
  { id: 'mainframe', label: 'Mainframe', value: '"Consolas", "Courier New", monospace', className: 'font-mainframe' },
  { id: 'monkeybars', label: 'Monkey Bars', value: 'Impact, "Arial Black", sans-serif', className: 'font-monkeybars' },
  { id: 'vampyre', label: 'Vampyre', value: '"Cinzel", "Times New Roman", serif', className: 'font-vampyre' },
  { id: 'headbang', label: 'Headbang', value: 'Anton, "Arial Black", sans-serif', className: 'font-headbang' },
  { id: 'journal', label: 'Journal', value: '"Patrick Hand", cursive', className: 'font-journal' },
  { id: 'minecraft', label: 'Minecraft', value: '"Minecraft", "Courier New", monospace', className: 'font-minecraft' },
]

export type UserProfile = {
  gamertag: string
  bio: string
  joinedAt?: string
  banner?: string
  bannerPreset?: string
  title?: string
  nameColor?: string
  nameFont?: string
  friendGamertags?: string[]
  profileTheme?: string
  nameEffect?: string
  nameColors?: string[]
}

const STORAGE_KEY = 'eko.profiles.v1'
const joinedKey = 'eko.joinedAt'

function normalizeGamertag(value: string): string {
  return value.trim().toLowerCase()
}

export function loadProfiles(): Record<string, UserProfile> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => {
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    })
    return Object.fromEntries(entries) as Record<string, UserProfile>
  } catch {
    return {}
  }
}

export function saveProfiles(profiles: Record<string, UserProfile>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {}
}

export function getProfile(gamertag: string): UserProfile | null {
  if (!gamertag) return null
  return loadProfiles()[normalizeGamertag(gamertag)] || null
}

export function saveProfile(profile: UserProfile) {
  if (!profile.gamertag.trim()) return
  const profiles = loadProfiles()
  profiles[normalizeGamertag(profile.gamertag)] = profile
  saveProfiles(profiles)
}

export function removeProfile(gamertag: string) {
  const profiles = loadProfiles()
  delete profiles[normalizeGamertag(gamertag)]
  saveProfiles(profiles)
}

export function profileBannerStyle(profile: UserProfile | null): string {
  if (profile?.banner) return `url(${profile.banner}) center / cover no-repeat`
  const preset = PROFILE_BANNERS.find((item) => item.id === profile?.bannerPreset)
  return (preset || PROFILE_BANNERS[0]).gradient
}

export function loadJoinedAt(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(joinedKey) || ''
  } catch {
    return ''
  }
}

export function ensureJoinedAt(): string {
  const existing = loadJoinedAt()
  if (existing) return existing
  const now = new Date().toISOString()
  try {
    window.localStorage.setItem(joinedKey, now)
  } catch {}
  return now
}

export function formatJoined(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export function hashBanner(gamertag: string): ProfileBannerPreset {
  let hash = 0
  for (const char of gamertag.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PROFILE_BANNERS[hash % PROFILE_BANNERS.length]
}
