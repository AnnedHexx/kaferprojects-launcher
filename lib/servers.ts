import { decryptJson, encryptJson } from './secure-crypto'
import { normalizePlayButton, type PlayButtonConfig } from './play-button'

export type ServerAddon = {
  /** URL directa (compatibilidad con instancias antiguas) */
  url?: string
  /** Identificador del archivo guardado en IndexedDB */
  fileId?: string
  /** Nombre original del archivo seleccionado */
  fileName?: string
  /** Tamaño del archivo en bytes */
  size?: number
  /** Versión del pack: si cambia, el launcher vuelve a pedir la descarga */
  version?: string
  /** SHA-256 opcional para verificar la descarga */
  sha256?: string
  /** Nombre visible del pack */
  name?: string
}

export type CustomServer = {
  id: string
  name: string
  ip: string
  port: string
  banner: string
  icon: string
  description?: string
  background?: string
  available?: boolean
  /** Instancia fijada: se muestra arriba en la lista. */
  pinned?: boolean
  /** Color del botón JUGAR de esta instancia (hex). */
  buttonColor?: string
  /** Personalización completa del botón JUGAR de esta instancia. */
  button?: PlayButtonConfig
  /** Packs de la instancia (varios permitidos). */
  addons?: ServerAddon[]
  /** Compatibilidad: pack único de versiones anteriores. */
  addon?: ServerAddon
  /** Instancia compartida en la nube: fecha de su último cambio. */
  updatedAt?: string
  /** Gamertag de quien creó la instancia compartida. */
  createdBy?: string
  /** Marca de borrado (tombstone) para propagar eliminaciones sin resucitar. */
  deletedAt?: string
  /** Si es true, la instancia es privada: solo se guarda en el baúl local,
   *  no se publica en la nube ni se muestra a otros usuarios. */
  private?: boolean
}

/** Clave antigua (sin cifrar). Solo se usa para migrar datos existentes. */
const LEGACY_STORAGE_KEY = 'eko.customServers.v1'
const HISTORY_KEY = 'eko.joinedServers.v1'
const ADDONS_KEY = 'eko.installedAddons.v1'
const VAULT_PREFIX = 'kafer.servers.vault.v1.'

type ActiveVault = {
  accountKey: string
  key: CryptoKey
  servers: CustomServer[]
}

let activeVault: ActiveVault | null = null
let pendingWrite: Promise<void> = Promise.resolve()
let writeQueued = false
let vaultErrorHandler: ((message: string) => void) | null = null

export function setVaultErrorHandler(handler: ((message: string) => void) | null) {
  vaultErrorHandler = handler
}

function reportVaultError(message: string) {
  try {
    vaultErrorHandler?.(message)
  } catch {}
}

function vaultStorageKey(accountKey: string): string {
  return `${VAULT_PREFIX}${accountKey}`
}

function vaultAad(accountKey: string): string {
  return `kafer.servers:${accountKey}`
}

function cleanAddon(raw: ServerAddon | undefined): ServerAddon | undefined {
  if (!raw) return undefined
  const hasSource =
    (typeof raw.url === 'string' && raw.url.trim()) ||
    (typeof raw.fileId === 'string' && raw.fileId.trim())
  if (!hasSource) return undefined
  return {
    url: typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined,
    fileId: typeof raw.fileId === 'string' && raw.fileId.trim() ? raw.fileId.trim() : undefined,
    fileName: raw.fileName ? String(raw.fileName) : undefined,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : undefined,
    version: raw.version ? String(raw.version) : undefined,
    sha256: raw.sha256 ? String(raw.sha256) : undefined,
    name: raw.name ? String(raw.name) : undefined,
  }
}

/** Normaliza cualquier lista de instancias (viene de disco o de la memoria). */
export function normalizeServers(input: unknown): CustomServer[] {
  if (!Array.isArray(input)) return []
  return (input as CustomServer[])
    .filter(
      (server) =>
        server &&
        typeof server.id === 'string' &&
        typeof server.name === 'string' &&
        typeof server.ip === 'string',
    )
    .map((server) => {
      const list = Array.isArray(server.addons)
        ? server.addons.map(cleanAddon).filter((item): item is ServerAddon => Boolean(item))
        : []
      const legacy = cleanAddon(server.addon)
      return {
        ...server,
        pinned: Boolean(server.pinned),
        private: Boolean(server.private),
        buttonColor:
          typeof server.buttonColor === 'string' && /^#[0-9a-f]{6}$/i.test(server.buttonColor.trim())
            ? server.buttonColor.trim().toLowerCase()
            : undefined,
        button: server.button ? normalizePlayButton(server.button) : undefined,
        addons: list.length > 0 ? list : legacy ? [legacy] : [],
        addon: list.length > 0 ? list[0] : legacy,
      }
    })
}

async function writeVaultNow(): Promise<boolean> {
  const vault = activeVault
  if (!vault) return false
  if (typeof window === 'undefined') return false
  try {
    const payload = await encryptJson(vault.key, vault.servers, vaultAad(vault.accountKey))
    window.localStorage.setItem(vaultStorageKey(vault.accountKey), JSON.stringify(payload))
    return true
  } catch {
    reportVaultError('No se pudieron guardar las instancias de forma segura. Revisa el espacio libre del disco.')
    return false
  }
}

function queueVaultWrite() {
  if (!activeVault) return
  if (writeQueued) return
  writeQueued = true
  pendingWrite = pendingWrite.then(async () => {
    writeQueued = false
    await writeVaultNow()
  })
}

/**
 * Descifra el baúl de instancias de una cuenta. Si es la primera vez que se
 * usa este formato, adopta las instancias antiguas sin cifrar y las borra.
 */
export async function unlockServerVault(
  accountKey: string,
  key: CryptoKey,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'Entorno no válido.' }
  const id = String(accountKey || '').trim().toLowerCase()
  if (!id) return { ok: false, error: 'Cuenta no válida.' }

  try {
    const raw = window.localStorage.getItem(vaultStorageKey(id))
    if (raw) {
      const payload = JSON.parse(raw) as unknown
      const servers = await decryptJson<unknown>(key, payload, vaultAad(id))
      activeVault = { accountKey: id, key, servers: normalizeServers(servers) }
      return { ok: true }
    }

    // Primera vez con el baúl cifrado: reclamar las instancias antiguas.
    let legacy: CustomServer[] = []
    try {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacyRaw) legacy = normalizeServers(JSON.parse(legacyRaw))
    } catch {
      legacy = []
    }

    activeVault = { accountKey: id, key, servers: legacy }
    if (legacy.length > 0) {
      const stored = await writeVaultNow()
      if (stored) {
        try {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {}
      }
    } else {
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {}
    }
    return { ok: true }
  } catch {
    activeVault = null
    return {
      ok: false,
      error:
        'No se pudieron descifrar las instancias. La contraseña no coincide o los datos fueron modificados.',
    }
  }
}

/** Cierra el baúl y borra la clave de la memoria. */
export async function lockServerVault(): Promise<void> {
  try {
    await pendingWrite
  } catch {}
  activeVault = null
}

export function isServerVaultUnlocked(): boolean {
  return Boolean(activeVault)
}

export function loadCustomServers(): CustomServer[] {
  if (!activeVault) return []
  return activeVault.servers
}

export function saveCustomServers(servers: CustomServer[]): boolean {
  if (!activeVault) return false
  activeVault.servers = normalizeServers(servers)
  queueVaultWrite()
  return true
}

/** Espera a que terminen las escrituras pendientes (útil al cerrar sesión). */
export function flushServerVault(): Promise<void> {
  return pendingWrite
}

export function createServerId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function loadJoinedServerIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveJoinedServerIds(ids: string[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(ids.slice(0, 3)))
    return true
  } catch {
    return false
  }
}

export function clearJoinedServers() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(HISTORY_KEY)
  } catch {}
}

function loadInstalledAddons(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(ADDONS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Lista de packs de una instancia (acepta el formato antiguo de un solo pack). */
export function serverAddons(server: { addon?: ServerAddon; addons?: ServerAddon[] }): ServerAddon[] {
  if (Array.isArray(server.addons) && server.addons.length > 0) return server.addons
  return server.addon ? [server.addon] : []
}

/** Versión efectiva del conjunto de packs (cambia si cambia cualquier archivo). */
export function addonVersion(server: { addon?: ServerAddon; addons?: ServerAddon[] }): string {
  const packs = serverAddons(server)
  if (packs.length === 0) return ''
  return packs
    .map((pack) => `${pack.fileId || pack.url || ''}:${pack.version || '1'}`)
    .join('|')
}

/** ¿El pack de esta instancia ya está instalado en Minecraft con esa versión? */
export function isAddonInstalled(serverId: string, version: string): boolean {
  const installed = loadInstalledAddons()
  return installed[serverId] === String(version)
}

export function markAddonInstalled(serverId: string, version: string) {
  if (typeof window === 'undefined') return
  try {
    const installed = loadInstalledAddons()
    installed[serverId] = String(version)
    window.localStorage.setItem(ADDONS_KEY, JSON.stringify(installed))
  } catch {}
}

export function forgetAddon(serverId: string) {
  if (typeof window === 'undefined') return
  try {
    const installed = loadInstalledAddons()
    delete installed[serverId]
    window.localStorage.setItem(ADDONS_KEY, JSON.stringify(installed))
  } catch {}
}
