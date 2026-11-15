import { normalizeServers, type CustomServer } from './servers'

export type BanEntry = {
  gamertag?: string
  xuid?: string
  reason?: string
  at?: string
}

export type InstanceCodeUse = {
  gamertag: string
  at: string
}

export type InstanceCode = {
  id: string
  code: string
  createdAt: string
  /** Fecha ISO en la que caduca. `null` o vacío = nunca caduca. */
  expiresAt?: string | null
  /** 0 = usos ilimitados. */
  maxUses: number
  uses: number
  usedBy: InstanceCodeUse[]
}

export type AdminConfig = {
  admins: string[]
  bans: BanEntry[]
  codes: InstanceCode[]
  /** Instancias compartidas por la nube (incluye tombstones de borrado). */
  instances?: CustomServer[]
  /** Cuentas registradas (gamertag + hash). Permite login multi-dispositivo
   *  y bloquea gamertags duplicados. */
  accounts?: CloudAccount[]
  updatedAt?: string
}

/** Cuenta en la nube: nunca guarda la contraseña, solo su verificador PBKDF2. */
export type CloudAccount = {
  gamertag: string
  salt: string
  iterations: number
  hash: string
  vaultSalt: string
  vaultIterations: number
  createdAt: string
}

const CONFIG_KEY = 'eko.remote-config.v1'

export function emptyConfig(): AdminConfig {
  return { admins: [], bans: [], codes: [], instances: [], updatedAt: new Date().toISOString() }
}

function cleanTag(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function cleanCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeAccounts(input: unknown): CloudAccount[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: CloudAccount[] = []
  for (const entry of input) {
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const gamertag = String(raw.gamertag ?? '').trim()
    const salt = String(raw.salt ?? '')
    const hash = String(raw.hash ?? '')
    const vaultSalt = String(raw.vaultSalt ?? '')
    if (!gamertag || !salt || !hash || !vaultSalt) continue
    const key = gamertag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      gamertag,
      salt,
      iterations: Math.max(1000, Math.floor(Number(raw.iterations) || 310000)),
      hash,
      vaultSalt,
      vaultIterations: Math.max(1000, Math.floor(Number(raw.vaultIterations) || 310000)),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    })
  }
  return out
}

function normalizeInstanceCode(input: unknown): InstanceCode | null {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const code = cleanCode(raw.code)
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) return null
  const id = String(raw.id ?? '').trim() || code
  const maxUsesRaw = Math.floor(Number(raw.maxUses))
  const maxUses = Number.isFinite(maxUsesRaw) ? Math.max(0, Math.min(100000, maxUsesRaw)) : 0
  const usesRaw = Math.floor(Number(raw.uses))
  const uses = Number.isFinite(usesRaw) ? Math.max(0, usesRaw) : 0
  const usedBy: InstanceCodeUse[] = []
  if (Array.isArray(raw.usedBy)) {
    for (const entry of raw.usedBy) {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      const gamertag = String(item.gamertag ?? '').trim()
      if (!gamertag) continue
      usedBy.push({
        gamertag,
        at: typeof item.at === 'string' ? item.at : new Date().toISOString(),
      })
    }
  }
  return {
    id,
    code,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    expiresAt: typeof raw.expiresAt === 'string' && raw.expiresAt ? raw.expiresAt : null,
    maxUses,
    uses,
    usedBy,
  }
}

export function normalizeConfig(input: unknown): AdminConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const admins = Array.isArray(raw.admins)
    ? Array.from(new Set(raw.admins.map(cleanTag).filter(Boolean)))
    : []
  const bans: BanEntry[] = []
  if (Array.isArray(raw.bans)) {
    for (const entry of raw.bans) {
      const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      const gamertag = String(item.gamertag ?? '').trim()
      const xuid = String(item.xuid ?? '').trim()
      if (!gamertag && !xuid) continue
      bans.push({
        ...(gamertag ? { gamertag } : {}),
        ...(xuid ? { xuid } : {}),
        ...(item.reason ? { reason: String(item.reason) } : {}),
        ...(item.at ? { at: String(item.at) } : {}),
      })
    }
  }
  const codes: InstanceCode[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw.codes)) {
    for (const entry of raw.codes) {
      const parsed = normalizeInstanceCode(entry)
      if (!parsed) continue
      const key = `${parsed.id}|${parsed.code}`
      if (seen.has(key)) continue
      seen.add(key)
      codes.push(parsed)
    }
  }
  return {
    admins,
    bans,
    codes,
    instances: normalizeServers(raw.instances),
    accounts: normalizeAccounts(raw.accounts),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  }
}

export function loadCachedConfig(): AdminConfig {
  if (typeof window === 'undefined') return emptyConfig()
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return emptyConfig()
    return normalizeConfig(JSON.parse(raw))
  } catch {
    return emptyConfig()
  }
}

export function saveCachedConfig(config: AdminConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {}
}

export function isConfigAdmin(config: AdminConfig, gamertag?: string | null): boolean {
  const tag = cleanTag(gamertag)
  return Boolean(tag) && config.admins.includes(tag)
}

export function banFor(
  config: AdminConfig,
  profile: { gamertag?: string | null; xuid?: string | null },
): BanEntry | null {
  const tag = cleanTag(profile.gamertag)
  const xuid = String(profile.xuid || '').trim()
  for (const ban of config.bans) {
    if (ban.xuid && xuid && ban.xuid === xuid) return ban
    if (ban.gamertag && tag && cleanTag(ban.gamertag) === tag) return ban
  }
  return null
}

export { CONFIG_KEY as ADMIN_CONFIG_STORAGE_KEY }
