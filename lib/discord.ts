type Activity = {
  details?: string
  state?: string
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  buttons?: { label: string; url: string }[]
}

type EkoLauncherBridge = {
  setActivity: (activity: Activity) => void
  clearActivity: () => void
  setEnabled: (enabled: boolean) => void
  onStatus: (callback: (status: { connected: boolean }) => void) => () => void
  applySettings: (settings: Record<string, unknown>) => void
  chooseDownloadFolder: () => Promise<string | null>
  getSystemInfo: () => Promise<Record<string, unknown>>
  onSystemInfo: (callback: (info: Record<string, unknown>) => void) => () => void
  microsoftRequest: (options: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }) => Promise<{ ok: boolean; status: number; data?: unknown; error?: string }>
  fetchImage: (url: string) => Promise<string | null>
  pingServer: (options: {
    ip: string
    port?: string | number
  }) => Promise<{
    online: boolean
    edition?: 'bedrock' | 'java'
    players?: number
    maxPlayers?: number
    motd?: string
    version?: string
    latencyMs?: number | null
    playersUnknown?: boolean
  }>
  discoverServer: (options: { host: string }) => Promise<{
    ip: string
    servers: {
      port: number
      motd?: string
      players?: number
      maxPlayers?: number
      version?: string
      offline?: boolean
    }[]
  }>
  joinGame: (options: { ip: string; port?: string | number }) => Promise<{
    ok: boolean
    url?: string
    host?: string
    port?: number
    redirected?: boolean
    started?: boolean
    error?: 'no-server' | 'bad-port' | 'not-installed' | 'launch-failed'
    message?: string
  }>
  aternosStatus: (options: { host: string }) => Promise<{
    online: boolean
    players?: number
    maxPlayers?: number
    needsLogin?: boolean
    notAternos?: boolean
    notFound?: boolean
    error?: string
    pending?: boolean
  }>
  aternosLogin: () => Promise<{ ok: boolean; already?: boolean }>
  getLocalSkin: (options: { xuid?: string }) => Promise<string | null>
  installAddon: (options: { url: string; name?: string; sha256?: string }) => Promise<{
    ok: boolean
    opened?: boolean
    path?: string
    restored?: boolean
    error?: string
  }>
  installAddonFile: (options: { name?: string; fileName?: string; data: ArrayBuffer }) => Promise<{
    ok: boolean
    opened?: boolean
    path?: string
    restored?: boolean
    error?: string
  }>
  revealAddon?: (filePath: string) => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
  minimizeWindow: () => void
  notify?: (payload: { title: string; body: string; icon?: string }) => void
}

declare global {
  interface Window {
    ekoLauncher?: EkoLauncherBridge
  }
}

export function setDiscordActivity(activity: Activity) {
  if (typeof window === 'undefined') return
  window.ekoLauncher?.setActivity(activity)
}

export function clearDiscordActivity() {
  if (typeof window === 'undefined') return
  window.ekoLauncher?.clearActivity()
}

export function setDiscordEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.ekoLauncher?.setEnabled(enabled)
}
