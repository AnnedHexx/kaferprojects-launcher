'use client'

/**
 * Puente para la app Android (Capacitor).
 * Define window.ekoLauncher con la misma interfaz que usa el launcher de Windows,
 * pero apoyándose en el plugin nativo EkoNative.
 * En Windows/Electron no hace nada: el preload ya define el puente real.
 */

type NativePlugin = {
  pingServer: (options: { ip: string; port?: number }) => Promise<Record<string, unknown>>
  openMinecraft: (options: { ip?: string; port?: number }) => Promise<Record<string, unknown>>
  httpRequest: (options: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }) => Promise<Record<string, unknown>>
  fetchImage: (options: { url: string }) => Promise<{ dataUrl?: string }>
  openExternal: (options: { url: string }) => Promise<unknown>
  installAddon: (options: { url: string; name?: string; sha256?: string }) => Promise<{
    ok: boolean
    path?: string
    size?: number
  }>
  installAddonFile: (options: { name?: string; fileName?: string; data: string }) => Promise<{
    ok: boolean
    path?: string
    size?: number
  }>
  getSystemInfo: () => Promise<Record<string, unknown>>
  notifyUser: (options: { title: string; body: string; icon?: string }) => Promise<unknown>
}

function install(attempt = 0) {
  if (typeof window === 'undefined') return
  const cap = (window as unknown as { Capacitor?: any }).Capacitor
  if (!cap) {
    if (attempt < 25) window.setTimeout(() => install(attempt + 1), 120)
    return
  }
  if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return
  // Marca el documento para que el CSS aplique los ajustes de pantalla de móvil.
  try {
    document.documentElement.setAttribute('data-platform', 'android')
  } catch {}
  const plugin = cap.Plugins?.EkoNative as NativePlugin | undefined
  if (!plugin) {
    if (attempt < 25) window.setTimeout(() => install(attempt + 1), 120)
    return
  }
  if (window.ekoLauncher) return

  window.ekoLauncher = {
    setActivity: () => {},
    clearActivity: () => {},
    setEnabled: () => {},
    onStatus: (callback) => {
      try {
        callback({ connected: false })
      } catch {}
      return () => {}
    },
    applySettings: () => {},
    chooseDownloadFolder: async () => null,
    getSystemInfo: async () => {
      try {
        return await plugin.getSystemInfo()
      } catch {
        return {}
      }
    },
    onSystemInfo: () => () => {},
    microsoftRequest: async (options) => {
      try {
        const result = await plugin.httpRequest(options)
        return result as { ok: boolean; status: number; data?: unknown; error?: string }
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : 'Error de red',
        }
      }
    },
    fetchImage: async (url) => {
      try {
        const result = await plugin.fetchImage({ url })
        return result?.dataUrl || null
      } catch {
        return null
      }
    },
    pingServer: async (options) => {
      try {
        const port = Number(options.port) || 19132
        return (await plugin.pingServer({ ip: options.ip, port })) as never
      } catch {
        return { online: false }
      }
    },
    discoverServer: async (options) => ({ ip: options.host, servers: [] }),
    joinGame: async (options) => {
      try {
        const port = Number(options.port) || 19132
        const result = await plugin.openMinecraft({ ip: options.ip, port })
        return result as never
      } catch {
        return { ok: false, error: 'launch-failed' as const }
      }
    },
    aternosStatus: async () => null as never,
    aternosLogin: async () => ({ ok: false }),
    getLocalSkin: async () => null,
    openExternal: async (url) => {
      try {
        await plugin.openExternal({ url })
        return true
      } catch {
        return false
      }
    },
    installAddon: async (options) => {
      try {
        return (await plugin.installAddon(options)) as { ok: boolean; path?: string; size?: number }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo instalar el pack',
        }
      }
    },
    installAddonFile: async (options) => {
      try {
        const data = arrayBufferToBase64(options.data)
        const result = await plugin.installAddonFile({
          name: options.name,
          fileName: options.fileName,
          data,
        })
        return result as { ok: boolean; path?: string; size?: number }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo instalar el pack',
        }
      }
    },
    minimizeWindow: () => {},
    notify: (payload) => {
      plugin.notifyUser(payload).catch(() => {})
    },
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

install()
