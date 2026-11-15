import { type AdminConfig, type InstanceCode, normalizeConfig } from './admin-config'
import { type CustomServer } from './servers'

/**
 * Sincronización remota de la configuración de administración (admins, baneos
 * y códigos de instancia). Todos los launchers descargan el JSON de una URL
 * pública (normalmente un Gist de GitHub) cada pocos segundos, y el admin
 * publica sus cambios en ese mismo Gist. Así las acciones del panel de admin
 * sí llegan a los launchers de los demás jugadores.
 */
export type RemoteSettings = {
  /** URL raw del JSON público que todos los launchers consultan. */
  url: string
  /** ID del Gist donde el admin publica. */
  gistId: string
  /** Token de GitHub con permiso "gist" (solo lo necesita el admin que publica). */
  token: string
}

const SETTINGS_KEY = 'kafer.admin.remote.v1'
export const CONFIG_FILENAME = 'kafer-admin-config.json'

/**
 * URL pública del JSON que se incrusta al compilar el launcher. Pega aquí la
 * URL raw del Gist (o define NEXT_PUBLIC_KAFER_CONFIG_URL al compilar) para
 * que todos los equipos la usen sin configurar nada.
 */
export const DEFAULT_CONFIG_URL = process.env.NEXT_PUBLIC_KAFER_CONFIG_URL || ''
const DEFAULT_GIST_ID = process.env.NEXT_PUBLIC_KAFER_CONFIG_GIST_ID || ''
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_KAFER_CONFIG_TOKEN || ''

export function loadRemoteSettings(): RemoteSettings {
  const defaults: RemoteSettings = { url: DEFAULT_CONFIG_URL, gistId: DEFAULT_GIST_ID, token: DEFAULT_TOKEN }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<RemoteSettings>
    return {
      url: String(parsed.url || '').trim() || DEFAULT_CONFIG_URL,
      gistId: String(parsed.gistId || '').trim() || DEFAULT_GIST_ID,
      token: String(parsed.token || '').trim() || DEFAULT_TOKEN,
    }
  } catch {
    return defaults
  }
}

export function saveRemoteSettings(settings: RemoteSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

/** ¿La sincronización en la nube está operativa (URL + Gist + token)? */
export function isRemoteSyncEnabled(): boolean {
  const settings = loadRemoteSettings()
  return Boolean(settings.url && settings.gistId && settings.token)
}

/**
 * Fusiona la vista local de instancias con la remota sin pérdidas:
 *  - las eliminaciones se propagan con tombstones (`deletedAt`);
 *  - por id gana la instancia con `updatedAt` más reciente;
 *  - lo que solo existe en un lado se conserva (adiciones concurrentes).
 */
export function mergeInstanceLists(view: CustomServer[], remote: CustomServer[]): CustomServer[] {
  const byId = new Map<string, CustomServer>()
  const put = (server: CustomServer) => {
    const id = String(server.id || '')
    if (!id) return
    const current = byId.get(id)
    if (!current) {
      byId.set(id, server)
      return
    }
    const currentDeleted = Boolean(current.deletedAt)
    const nextDeleted = Boolean(server.deletedAt)
    if (currentDeleted || nextDeleted) {
      // El borrado siempre gana; entre dos tombstones gana el más reciente.
      if (currentDeleted && nextDeleted) {
        if (String(server.deletedAt) >= String(current.deletedAt)) byId.set(id, server)
      } else {
        byId.set(id, currentDeleted ? current : server)
      }
      return
    }
    const currentAt = Date.parse(current.updatedAt || '') || 0
    const nextAt = Date.parse(server.updatedAt || '') || 0
    if (nextAt >= currentAt) byId.set(id, server)
  }
  // El orden de la vista manda (así se propagan reordenados y fijados).
  for (const server of view) put(server)
  for (const server of remote) put(server)
  const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000
  return [...byId.values()].filter(
    (server) =>
      !server.deletedAt || Date.now() - (Date.parse(server.deletedAt) || 0) < TOMBSTONE_TTL,
  )
}

/**
 * Fusiona los códigos de instancia: la colección local manda (el admin crea y
 * borra), pero los usos/registros remotos nunca se pierden.
 */
export function mergeCodeUsage(local: InstanceCode[], remote: InstanceCode[]): InstanceCode[] {
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]))
  return local.map((entry) => {
    const other = remoteById.get(entry.id)
    if (!other) return entry
    const seen = new Set(entry.usedBy.map((use) => `${use.gamertag}|${use.at}`))
    const usedBy = [...entry.usedBy]
    for (const use of other.usedBy) {
      const key = `${use.gamertag}|${use.at}`
      if (!seen.has(key)) {
        seen.add(key)
        usedBy.push(use)
      }
    }
    return {
      ...entry,
      uses: Math.max(entry.uses, other.uses, usedBy.length),
      usedBy,
    }
  })
}

// Las mutaciones se serializan para evitar que dos publicaciones simultáneas se
// pisen entre lectura y escritura.
let changeQueue: Promise<unknown> = Promise.resolve()

// Caché de lectura fresca (API de GitHub con ETag): una respuesta 304 significa
// "sin cambios" y no consume límite de la API, así que el sondeo puede ser
// frecuente sin penalización.
let freshEtag: string | null = null
let freshConfig: AdminConfig | null = null

/**
 * Lee la configuración desde la API de GitHub (fuente siempre fresca, a
 * diferencia de la URL raw, que la CDN puede servir desactualizada).
 * Devuelve `null` si no hay cambios desde la última lectura (HTTP 304).
 */
export async function fetchFreshConfig(): Promise<AdminConfig | null> {
  const settings = loadRemoteSettings()
  if (!settings.gistId || !settings.token) {
    // Sin API configurada: URL raw (puede llegar con caché desfasada).
    return fetchConfig(settings.url)
  }
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${settings.token}`,
  }
  if (freshEtag) headers['If-None-Match'] = freshEtag
  try {
    const res = await fetch(`https://api.github.com/gists/${settings.gistId}`, { headers, cache: 'no-store' })
    if (res.status === 304) return null
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    freshEtag = res.headers.get('etag')
    const info = (await res.json()) as { files?: Record<string, { content?: string }> }
    const content = info?.files?.[CONFIG_FILENAME]?.content
    if (!content) throw new Error(`El Gist no contiene ${CONFIG_FILENAME}`)
    freshConfig = normalizeConfig(JSON.parse(content))
    return freshConfig
  } catch (error) {
    // Respaldo: en el WebView de Android la API con Authorization puede
    // chocar con CORS. La URL raw del Gist sí permite CORS y entrega la misma
    // configuración (así las instancias se ven también en Android).
    if (settings.url) {
      try {
        const fallback = await fetchConfig(settings.url)
        freshConfig = fallback
        return fallback
      } catch {
        throw error
      }
    }
    throw error
  }
}

/**
 * Aplica un cambio a la configuración compartida de forma segura: lee la
 * última versión de la nube (API fresca, nunca la caché de CDN), aplica la
 * mutación y la publica (read-modify-write). Sin nube configurada aplica el
 * cambio solo en este equipo.
 */
export function applyRemoteChange(mutate: (doc: AdminConfig) => AdminConfig): Promise<AdminConfig> {
  const settings = loadRemoteSettings()
  if (!settings.url || !settings.gistId || !settings.token) {
    const next = mutate(normalizeConfig(readLocalCache()))
    saveCachedConfigSafe(next)
    return Promise.resolve(next)
  }
  const run = async (): Promise<AdminConfig> => {
    const remote = (await fetchFreshConfig()) ?? freshConfig ?? normalizeConfig(readLocalCache())
    const merged = mutate(remote)
    const result = await publishConfig(settings.gistId, settings.token, merged)
    // La publicación cambia el documento: invalidar el ETag para reler fresco.
    freshEtag = null
    freshConfig = result.config
    saveCachedConfigSafe(result.config)
    return result.config
  }
  const task = changeQueue.then(run, run)
  changeQueue = task.catch(() => {})
  return task
}

function readLocalCache(): unknown {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem('eko.remote-config.v1')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCachedConfigSafe(config: AdminConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem('eko.remote-config.v1', JSON.stringify(config))
  } catch {}
}

export async function fetchConfig(url: string, timeoutMs = 6000): Promise<AdminConfig> {
  const target = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return normalizeConfig(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

async function github(path: string, token: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      detail = body?.message || ''
    } catch {}
    throw new Error(`GitHub ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

export async function readConfigFromGist(gistId: string, token: string): Promise<AdminConfig> {
  const info = await github(`/gists/${gistId}`, token)
  const content = info?.files?.[CONFIG_FILENAME]?.content
  if (!content) throw new Error(`El Gist no contiene ${CONFIG_FILENAME}`)
  return normalizeConfig(JSON.parse(content))
}

export async function publishConfig(
  gistId: string,
  token: string,
  config: AdminConfig,
): Promise<{ config: AdminConfig; url: string }> {
  const payload: AdminConfig = { ...config, updatedAt: new Date().toISOString() }
  const info = await github(`/gists/${gistId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        [CONFIG_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  })
  const owner = String(info?.owner?.login || '')
  const url = owner
    ? `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${CONFIG_FILENAME}`
    : ''
  return { config: payload, url }
}
