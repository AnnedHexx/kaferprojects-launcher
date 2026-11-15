'use client'

import '@/lib/android-bridge'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, Download, Gamepad2, Pin, Play, Plus, Settings, Shield, Users, Wand2, X } from 'lucide-react'
import { AccessScreen, AuthProfile } from '@/components/access'
import { AdminPanel } from '@/components/admin-panel'
import { ProfileModal } from '@/components/profile-modal'
import { PlayProperties } from '@/components/play-customizer'
import { PlayButtonFace } from '@/components/play-button-face'
import { ServerAddModal } from '@/components/server-add-modal'
import { SettingsModal, type SettingsTab } from '@/components/settings-modal'
import { SkinFace } from '@/components/skin-face'
import { ToastHost } from '@/components/toast-host'
import { clearDiscordActivity, setDiscordActivity, setDiscordEnabled } from '@/lib/discord'
import { EkoSettings, applyAppearance, loadSettings, normalizeSettings, saveSettings } from '@/lib/settings'
import { installUiSounds } from '@/lib/sfx'
import { ContextMenu, contextMenuIcons } from '@/components/context-menu'
import { isAdminGamertag } from '@/lib/roles'
import {
  banFor,
  isConfigAdmin,
  loadCachedConfig,
  saveCachedConfig,
  type AdminConfig,
} from '@/lib/admin-config'
import { loadFriends } from '@/lib/social-store'
import { ensureJoinedAt } from '@/lib/profiles'
import { notifyDownloadFinished, notifyNewInstanceAvailable } from '@/lib/notifications'
import { deleteAddonBlob, loadAddonBlob } from '@/lib/addon-store'
import {
  CustomServer,
  type ServerAddon,
  addonVersion,
  clearJoinedServers,
  isAddonInstalled,
  loadCustomServers,
  loadJoinedServerIds,
  lockServerVault,
  markAddonInstalled,
  normalizeServers,
  saveCustomServers,
  saveJoinedServerIds,
  serverAddons,
  setVaultErrorHandler,
  unlockServerVault,
} from '@/lib/servers'
import { clearStoredSession, persistSession, restoreSession } from '@/lib/account-store'
import { applyRemoteChange, fetchFreshConfig, isRemoteSyncEnabled, mergeInstanceLists } from '@/lib/remote-config'
import {
  type PlayButtonConfig,
  normalizePlayButton,
  playButtonClassName,
  playButtonForServer,
  playButtonStyle,
} from '@/lib/play-button'

const loadingBatImage = './kafer-logo-mask.svg'
const loadingBackground = './kafer-bg.svg'
const defaultBackground = './kafer-menu-bg.png'
const profileKey = 'eko.profile'

// Abre enlaces fuera del launcher. En Electron pasa por el proceso principal
// (que valida el dominio); en web usa una pestaña nueva.
function openExternalUrl(url: string) {
  if (typeof window === 'undefined') return
  if (window.ekoLauncher?.openExternal) {
    window.ekoLauncher.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Pantalla de arranque: el logo aparece hueco, se rellena como una barra y, al
// llegar al 100 %, muestra "Iniciando Launcher" durante 2 s antes de fundirse
// y dar paso al menú principal con un fade in.
function LoadingScreen({ duration, onFilled }: { duration: number | null; onFilled?: () => void }) {
  const [filled, setFilled] = useState(false)
  const [exiting, setExiting] = useState(false)
  const finished = useRef(false)
  const exitTimer = useRef<number | null>(null)

  const markFilled = useCallback(() => setFilled(true), [])

  // 100 % -> 2 s con el texto -> fundido de salida -> menú principal.
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    if (!onFilled) return
    setExiting(true)
    exitTimer.current = window.setTimeout(() => onFilled(), 320)
  }, [onFilled])

  useEffect(() => {
    if (!filled) return
    const timer = window.setTimeout(finish, 2000)
    return () => window.clearTimeout(timer)
  }, [filled, finish])

  // Red de seguridad: si la animación no llega a disparar su final (por ejemplo
  // con el equipo muy cargado), no dejamos la pantalla bloqueada para siempre.
  useEffect(() => {
    if (!onFilled || !duration) return
    const timer = window.setTimeout(markFilled, duration + 2000)
    return () => window.clearTimeout(timer)
  }, [duration, markFilled, onFilled])

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current)
  }, [])

  const fillMask = { maskImage: `url(${loadingBatImage})` } as CSSProperties
  const ringMask = {
    maskImage: `url(${loadingBatImage}), url(${loadingBatImage})`,
    maskSize: 'contain, 96% 96%',
    maskComposite: 'exclude',
  } as CSSProperties

  return (
    <main
      className={`loading-screen${filled ? ' is-filled' : ''}${exiting ? ' is-exiting' : ''}`}
      style={{ backgroundImage: `url(${loadingBackground})` }}
      aria-label="Cargando KaferProjects Launcher"
    >
      <div
        className="loading-stage"
        style={duration ? ({ '--boot-duration': `${duration}ms` } as CSSProperties) : undefined}
      >
        <div
          className="loading-logo"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={filled ? '100%' : undefined}
        >
          <span className="loading-logo-hollow" aria-hidden="true" style={ringMask} />
          <span
            className="loading-logo-fill"
            aria-hidden="true"
            style={fillMask}
            onAnimationEnd={(event) => {
              if (event.animationName === 'loading-fill') markFilled()
            }}
          />
          <span className="loading-logo-glow" aria-hidden="true" style={fillMask} />
        </div>
        <span className="loading-bar" aria-hidden="true">
          <span className="loading-bar-fill" />
        </span>
        <span className={`loading-label${filled && onFilled ? ' is-visible' : ''}`} role="status" aria-live="polite">
          {filled && onFilled ? 'Iniciando Launcher' : ''}
        </span>
      </div>
    </main>
  )
}

type LauncherServer = {
  id: string
  name: string
  game: string
  image: string
  icon?: string
  status: 'online' | 'offline'
  players: number
  ping: string
  custom?: boolean
  ip?: string
  port?: string
  description?: string
  background?: string
  available?: boolean
  pinned?: boolean
  buttonColor?: string
  button?: PlayButtonConfig
  addon?: ServerAddon
  addons?: ServerAddon[]
}

function ServerDots() {
  return (
    <span className="server-dots" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <i key={index} />
      ))}
    </span>
  )
}

export default function Page() {
  const [screen, setScreen] = useState<'loading' | 'access' | 'launcher'>('loading')
  // Duración aleatoria por arranque (2–9,7 s) generada en el cliente. La animación
  // del logo y la entrada a la app usan este mismo valor.
  const [bootDuration, setBootDuration] = useState<number | null>(null)
  const [bootTarget, setBootTarget] = useState<'access' | 'launcher' | null>(null)
  const [logoFilled, setLogoFilled] = useState(false)
  const handleLogoFilled = useCallback(() => setLogoFilled(true), [])
  useEffect(() => {
    setBootDuration(2000 + Math.random() * 7700)
  }, [])
  const [showServers, setShowServers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [showAddServer, setShowAddServer] = useState(false)
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null)
  const [buttonDraft, setButtonDraft] = useState<PlayButtonConfig | null>(null)
  // Vista previa del botón mientras se personaliza desde el creador de instancias.
  const [buttonPreview, setButtonPreview] = useState<{ config: PlayButtonConfig; fallbackColor: string } | null>(null)
  const buttonPreviewControl = useRef<Dispatch<SetStateAction<PlayButtonConfig>> | null>(null)
  const handlePreviewButton = useCallback(
    (preview: { config: PlayButtonConfig; fallbackColor: string } | null) => setButtonPreview(preview),
    [],
  )
  const playEditMode = Boolean(editingButtonId) || Boolean(buttonPreview)
  const [noInstanceNotice, setNoInstanceNotice] = useState(0)
  const playDrag = useRef<{ active: boolean; moved: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [profileGamertag, setProfileGamertag] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quick, setQuick] = useState<{ id: string; pinned: boolean }[]>(() =>
    loadJoinedServerIds().map((id) => ({ id, pinned: true })),
  )
  const [customServers, setCustomServers] = useState<CustomServer[]>(() => loadCustomServers())
  const customServersRef = useRef<CustomServer[]>(customServers)
  // Instancias ya vistas: sirve para avisar solo de las realmente nuevas.
  const seenInstancesRef = useRef<Set<string> | null>(null)
  const [editingServer, setEditingServer] = useState<CustomServer | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [addonBusy, setAddonBusy] = useState(false)
  const [addonTick, setAddonTick] = useState(0)
  const [toast, setToast] = useState<{ id: number; message: string; kind: 'error' | 'info' } | null>(null)
  const [joining, setJoining] = useState(false)
  const [profile, setProfile] = useState<AuthProfile>({ gamertag: '', email: '', isAdmin: false })
  const [settings, setSettings] = useState<EkoSettings>(() => loadSettings())
  const [settingsPreview, setSettingsPreview] = useState<EkoSettings | null>(null)
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(() => Date.now())
  const [localSkin, setLocalSkin] = useState<string | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [remoteConfig, setRemoteConfig] = useState<AdminConfig>(() => loadCachedConfig())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; server: LauncherServer } | null>(null)

  // Vista previa en vivo: mientras el modal de ajustes está abierto se usa el borrador.
  const view = settingsPreview ?? settings

  // Instancias compartidas por la nube (fuera quedan las tombstones de borrado).
  const sharedServers = useMemo(
    () => normalizeServers(remoteConfig.instances).filter((entry) => !entry.deletedAt && !entry.private),
    [remoteConfig],
  )
  const sharedIds = useMemo(() => new Set(sharedServers.map((entry) => entry.id)), [sharedServers])
  // Vista combinada: lo compartido manda y lo personal se añade detrás.
  const mergedServers = useMemo(() => {
    const personal = customServers.filter((entry) => !sharedIds.has(entry.id))
    return [...sharedServers, ...personal]
  }, [sharedServers, customServers, sharedIds])

  const allServers = useMemo<LauncherServer[]>(
    () =>
      [...mergedServers]
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
        .map((server) => ({
          id: server.id,
          name: server.name,
          game: 'Instancia personalizada',
          image: server.banner,
          icon: server.icon,
          status: server.available === false ? ('offline' as const) : ('online' as const),
          players: 0,
          ping: '—',
          custom: true,
          ip: server.ip,
          port: server.port,
          description: server.description || '',
          background: server.background,
          available: server.available !== false,
          pinned: Boolean(server.pinned),
          buttonColor: server.buttonColor,
          button: server.button,
          addon: server.addon,
          addons: server.addons,
        })),
    [mergedServers],
  )

  const server = selectedId ? allServers.find((item) => item.id === selectedId) || null : null
  const activeButton =
    editingButtonId && buttonDraft && server?.id === editingButtonId
      ? buttonDraft
      : buttonPreview?.config ?? playButtonForServer(server)
  const activeButtonFallback = buttonPreview?.fallbackColor ?? server?.buttonColor
  const serverPackList = server ? serverAddons(server) : []
  const addonReady = useMemo(() => {
    if (!server) return true
    const packs = serverAddons(server)
    if (packs.length === 0) return true
    return isAddonInstalled(server.id, addonVersion(server))
  }, [server, addonTick])
  const needsAddon = serverPackList.length > 0 && !addonReady
  const gamertag = profile.gamertag
  const isAdmin = profile.isAdmin || isConfigAdmin(remoteConfig, gamertag)
  const ban = useMemo(() => banFor(remoteConfig, profile), [remoteConfig, profile])
  // Barra lateral: 1 icono que cambia con la selección; solo se acumulan las instancias donde picaste JUGAR.
  const joinedServers = quick
    .map((item) => allServers.find((entry) => entry.id === item.id))
    .filter((entry): entry is LauncherServer => Boolean(entry))
  const quickServers = [
    ...(server && !joinedServers.some((item) => item.id === server.id) ? [server] : []),
    ...joinedServers,
  ].slice(0, 3)
  const ownProfile = Boolean(profileGamertag && profileGamertag.toLowerCase() === gamertag.toLowerCase())

  // Ping RakNet real (UDP) de las instancias: online, jugadores y latencia.
  const [pings, setPings] = useState<Record<string, { online: boolean; players?: number; maxPlayers?: number; latency?: number; playersUnknown?: boolean; aternosPanel?: boolean }>>({})
  const [aternosNeedsLogin, setAternosNeedsLogin] = useState(false)

  // Aviso flotante pequeño: sube y se desvanece.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(message: string, kind: 'error' | 'info' = 'error') {
    setToast({ id: Date.now(), message, kind })
  }

  useEffect(() => {
    customServersRef.current = mergedServers
  }, [mergedServers])

  /** Publica la lista compartida completa (con fusión anti-pérdidas).
   *  Las instancias privadas nunca se publican. */
  function publishShared(view: CustomServer[]) {
    const publicView = view.filter((entry) => !entry.private)
    return applyRemoteChange((doc) => ({
      ...doc,
      instances: mergeInstanceLists(publicView, doc.instances || []),
    }))
  }

  /** Marca una instancia compartida como borrada para todos los equipos. */
  function removeSharedInstance(instance: CustomServer) {
    return applyRemoteChange((doc) => ({
      ...doc,
      instances: mergeInstanceLists(
        [{ ...instance, deletedAt: new Date().toISOString() }],
        doc.instances || [],
      ),
    }))
  }

  /**
   * Persiste la lista combinada: lo personal al baúl de este equipo y lo
   * compartido a la nube (con actualización optimista de la vista).
   */
  function commitServers(nextMerged: CustomServer[], changedIds: Set<string>): boolean {
    const now = new Date().toISOString()
    const stamped = nextMerged.map((entry) =>
      changedIds.has(entry.id) ? { ...entry, updatedAt: now } : entry,
    )
    customServersRef.current = stamped
    // Las privadas van SIEMPRE al baúl local; las públicas, a la nube.
    const nextPersonal = stamped.filter((entry) => entry.private || !sharedIds.has(entry.id))
    const nextShared = stamped.filter((entry) => !entry.private && sharedIds.has(entry.id))
    setCustomServers(nextPersonal)
    const stored = saveCustomServers(nextPersonal)
    if (isRemoteSyncEnabled() && sharedIds.size > 0) {
      // Si una instancia pública se volvió privada, se saca de la nube.
      const tombstones = stamped
        .filter((entry) => entry.private && sharedIds.has(entry.id))
        .map((entry) => ({ ...entry, deletedAt: now }))
      const publishList = [...nextShared, ...tombstones]
      setRemoteConfig((current) => ({
        ...current,
        instances: mergeInstanceLists(publishList, current.instances || []),
      }))
      void publishShared(publishList)
        .then((config) => setRemoteConfig(config))
        .catch(() => showToast('No se pudo sincronizar el cambio con la nube.'))
    }
    return stored
  }

  // Guarda el botón de la instancia mientras se edita, con un pequeño retardo.
  useEffect(() => {
    if (!editingButtonId || !buttonDraft) return
    const id = editingButtonId
    const config = buttonDraft
    const timer = window.setTimeout(() => {
      const next = customServersRef.current.map((entry) =>
        entry.id === id ? { ...entry, button: config } : entry,
      )
      commitServers(next, new Set([id]))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [editingButtonId, buttonDraft])

  useEffect(() => {
    if (!noInstanceNotice) return
    const timer = window.setTimeout(() => setNoInstanceNotice(0), 1700)
    return () => window.clearTimeout(timer)
  }, [noInstanceNotice])

  useEffect(() => {
    if (screen !== 'launcher' || allServers.length === 0) return
    let cancelled = false
    let running = false
    async function pingAll() {
      if (running) return
      running = true
      try {
        const results: Record<string, { online: boolean; players?: number; maxPlayers?: number; latency?: number; playersUnknown?: boolean; aternosPanel?: boolean }> = {}
        await Promise.allSettled(
          allServers.map(async (entry) => {
            try {
              const host = String(entry.ip || '').toLowerCase()
              const isAternos = host.endsWith('aternos.me')
              const aternosResult = isAternos ? await window.ekoLauncher?.aternosStatus?.({ host }) : null
              const result = await window.ekoLauncher?.pingServer?.({ ip: entry.ip || '', port: entry.port || 19132 })
              let merged: { online: boolean; players?: number; maxPlayers?: number; latency?: number; playersUnknown?: boolean; aternosPanel?: boolean } | null = null
              if (result?.online) {
                merged = { online: true, players: result.players || 0, maxPlayers: result.maxPlayers || 0, latency: result.latencyMs || undefined, playersUnknown: result.playersUnknown }
              }
              // Si el ping clásico no da un conteo válido, usamos el panel de la cuenta Aternos.
              if (isAternos) {
                if (aternosResult?.needsLogin) {
                  if (!cancelled) setAternosNeedsLogin(true)
                } else if (aternosResult?.pending || aternosResult?.error) {
                  // La ventana oculta aún carga: no tocamos el estado conocido
                } else if (aternosResult?.online) {
                  merged = { online: true, players: aternosResult.players || 0, maxPlayers: aternosResult.maxPlayers || 0, aternosPanel: true }
                } else if (aternosResult) {
                  // El panel manda: si dice offline, el proxy responde 'Online' pero está dormido
                  merged = { online: false, players: 0 }
                }
              }
              results[entry.id] = merged || { online: false }
            } catch {
              results[entry.id] = { online: false }
            }
          }),
        )
        if (!cancelled) setPings((current) => ({ ...current, ...results }))
      } finally {
        running = false
      }
    }
    pingAll()
    const timer = window.setInterval(pingAll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [screen, allServers])

  const connectAternos = async () => {
    const result = await window.ekoLauncher?.aternosLogin?.()
    if (result?.ok) setAternosNeedsLogin(false)
  }


  useEffect(() => {
    let cancelled = false

    async function boot() {
      const restored = await restoreSession()
      if (cancelled) return

      if (restored) {
        const unlocked = await unlockServerVault(restored.gamertag.trim().toLowerCase(), restored.vaultKey)
        if (cancelled) return
        if (unlocked.ok) {
          setProfile({ gamertag: restored.gamertag, email: '', isAdmin: restored.isAdmin })
          setCustomServers(loadCustomServers())
          setQuick(loadJoinedServerIds().map((id) => ({ id, pinned: true })))
          ensureJoinedAt()
          if (!cancelled) setBootTarget('launcher')
          return
        }
        await clearStoredSession()
        if (cancelled) return
      }

      if (!cancelled) setBootTarget('access')
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  // La pantalla de carga solo se abandona cuando la sesión está lista Y el logo
  // terminó de rellenarse (más los 2 s de "Iniciando Launcher"). Para entonces
  // ya está fundida en negro, así que el cambio es inmediato.
  useEffect(() => {
    if (!bootTarget || !logoFilled) return
    setScreen(bootTarget)
  }, [bootTarget, logoFilled])

  useEffect(() => {
    setVaultErrorHandler((message) => showToast(message))
    return () => setVaultErrorHandler(null)
  }, [])

  useEffect(() => installUiSounds(), [])

  // Config de administración remota: se consulta cada 3 s vía API (siempre
  // fresca) para que baneos, admins, códodos e instancias lleguen en vivo a
  // todos los launchers. Los 304 (sin cambios) no consumen límite de API.
  useEffect(() => {
    let cancelled = false
    async function sync() {
      try {
        const config = await fetchFreshConfig()
        if (!cancelled && config) {
          const instances = normalizeServers(config.instances).filter((entry) => !entry.deletedAt && !entry.private)
          const seen = seenInstancesRef.current
          if (seen === null) {
            // Primera sincronización: no se avisa de lo que ya existía.
            seenInstancesRef.current = new Set(instances.map((entry) => entry.id))
          } else {
            const mine = (profile.gamertag || '').trim().toLowerCase()
            for (const entry of instances) {
              if (seen.has(entry.id)) continue
              if ((entry.createdBy || '').trim().toLowerCase() === mine) continue
              if (settings.notifyNewInstances) notifyNewInstanceAvailable(entry.name)
            }
            seenInstancesRef.current = new Set(instances.map((entry) => entry.id))
          }
          setRemoteConfig(config)
          saveCachedConfig(config)
        }
      } catch {
        // Sin conexión se mantiene la última copia conocida.
      }
    }
    sync()
    const timer = window.setInterval(sync, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [profile.gamertag, settings.notifyNewInstances])

  useEffect(() => {
    applyAppearance(view)
    setDiscordEnabled(view.discordPresence)
    window.ekoLauncher?.applySettings(view)
  }, [view])

  // La configuración de administración se guarda y se lee en este equipo.
  // Para llevarla a otro equipo se usa Exportar/Importar en el panel de admin.

  useEffect(() => {
    if (!profile.gamertag) {
      setLocalSkin(null)
      return
    }
    let active = true
    window.ekoLauncher
      ?.getLocalSkin?.({ xuid: profile.xuid })
      .then((skin) => {
        if (active) setLocalSkin(skin)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [profile.gamertag, profile.xuid])

  useEffect(() => {
    if (!profile.gamertag) return
    setAvatarRefreshKey(Date.now())
    const refreshTimer = window.setInterval(() => setAvatarRefreshKey(Date.now()), 60000)
    return () => window.clearInterval(refreshTimer)
  }, [profile.gamertag, profile.skinTextureUrl, profile.xuid])

  useEffect(() => {
    if (screen !== 'launcher') return
    if (!view.discordPresence) {
      clearDiscordActivity()
      return
    }
    if (playing) {
      // Solo se anuncia "jugando" cuando el usuario se ha unido de verdad a una instancia.
      const playingServer = allServers.find((s) => s.name === playing)
      setDiscordActivity({
        details: view.richServers ? `Jugando en ${playing}` : 'Jugando en KaferProjects Launcher',
        state: `Conectado como ${gamertag || 'jugador'}`,
        smallImageKey: playingServer?.icon || playingServer?.image || undefined,
        smallImageText: playing,
      })
    } else {
      // Rich Presence del menú: funciona sin tener ninguna instancia predeterminada.
      setDiscordActivity({
        details: view.richServers ? 'En el menú de KaferProjects Launcher' : 'Explorando KaferProjects Launcher',
        state: gamertag ? `Conectado como ${gamertag}` : 'Minecraft Bedrock',
      })
    }
  }, [screen, view.discordPresence, view.richServers, playing, gamertag])

  useEffect(() => {
    if (!settings.saveHistory) {
      clearJoinedServers()
      return
    }
    const pinned = quick.filter((item) => item.pinned).map((item) => item.id)
    saveJoinedServerIds(pinned)
  }, [quick, settings.saveHistory])

  useEffect(() => {
    function onUnload() {
      if (settings.clearHistoryOnExit) clearJoinedServers()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [settings.clearHistoryOnExit])

  async function handleAuthenticated(next: AuthProfile, vaultKey: CryptoKey, remember: boolean) {
    const accountKey = next.gamertag.trim().toLowerCase()
    const unlocked = await unlockServerVault(accountKey, vaultKey)
    if (!unlocked.ok) {
      throw new Error(unlocked.error || 'No se pudieron descifrar las instancias de esta cuenta.')
    }
    const normalized = { ...next, isAdmin: isAdminGamertag(next.gamertag) }
    setProfile(normalized)
    setCustomServers(loadCustomServers())
    setQuick(loadJoinedServerIds().map((id) => ({ id, pinned: true })))
    ensureJoinedAt()
    await persistSession(normalized.gamertag, vaultKey, remember)
    try {
      window.localStorage.removeItem(profileKey)
    } catch {}
    setScreen('launcher')
  }

  async function handleLogout() {
    await clearStoredSession()
    await lockServerVault()
    setProfile({ gamertag: '', email: '', isAdmin: false })
    setCustomServers([])
    setQuick([])
    setSelectedId(null)
    setCtxMenu(null)
    setSettingsPreview(null)
    setShowSettings(false)
    setShowAdmin(false)
    setScreen('access')
  }

  function handleSaveSettings(next: EkoSettings) {
    const normalized = normalizeSettings(next)
    setSettings(normalized)
    saveSettings(normalized)
    setSettingsPreview(null)
  }

  function closeSettings() {
    setSettingsPreview(null)
    setShowSettings(false)
  }

  function selectServer(id: string) {
    setSelectedId(id)
    setDownloaded(false)
  }

  function togglePin(id: string) {
    const index = mergedServers.findIndex((entry) => entry.id === id)
    if (index < 0) return
    const item = mergedServers[index]
    const nextPinned = !item.pinned
    const rest = mergedServers.filter((entry) => entry.id !== id)
    let next: CustomServer[]
    if (nextPinned) {
      next = [{ ...item, pinned: true }, ...rest]
    } else {
      const lastPinned = rest.reduce((acc, entry, position) => (entry.pinned ? position : acc), -1)
      const copy = [...rest]
      copy.splice(lastPinned + 1, 0, { ...item, pinned: false })
      next = copy
    }
    commitServers(next, new Set([id]))
    showToast(nextPinned ? 'Instancia fijada arriba.' : 'Instancia desfijada.', 'info')
  }

  function moveServer(id: string, direction: -1 | 1) {
    const index = mergedServers.findIndex((entry) => entry.id === id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= mergedServers.length) return
    const next = [...mergedServers]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitServers(next, new Set())
  }

  function toggleServerAvailability(id: string) {
    const next = mergedServers.map((entry) =>
      entry.id === id ? { ...entry, available: entry.available === false } : entry,
    )
    commitServers(next, new Set([id]))
  }

  function deleteServer(id: string) {
    const target = mergedServers.find((entry) => entry.id === id)
    if (!target) return
    if (!window.confirm(`¿Eliminar la instancia "${target.name}"? Esta acción no se puede deshacer.`)) return
    for (const pack of serverAddons(target)) {
      if (pack.fileId) void deleteAddonBlob(pack.fileId)
    }
    const next = mergedServers.filter((entry) => entry.id !== id)
    if (sharedIds.has(id)) {
      // Borrado compartido: tombstone para que no resucite en otros equipos.
      const tombstone: CustomServer = { ...target, deletedAt: new Date().toISOString() }
      customServersRef.current = next
      setRemoteConfig((current) => ({
        ...current,
        instances: mergeInstanceLists([tombstone], current.instances || []),
      }))
      void removeSharedInstance(target)
        .then((config) => setRemoteConfig(config))
        .catch(() => showToast('No se pudo sincronizar el borrado con la nube.'))
    } else {
      commitServers(next, new Set())
    }
    if (selectedId === id) setSelectedId(null)
    setQuick((current) => current.filter((item) => item.id !== id))
    setCtxMenu(null)
    showToast('Instancia eliminada.', 'info')
  }

  async function joinServer(id: string, options: { fresh?: boolean } = {}) {
    const target = allServers.find((item) => item.id === id)
    if (!target) return
    if (target.available === false) {
      showToast('Esta instancia está marcada como no disponible.')
      return
    }
    if (serverAddons(target).length > 0 && !isAddonInstalled(target.id, addonVersion(target))) {
      showToast('Primero descarga los packs de la instancia con el botón DESCARGAR.', 'info')
      return
    }
    if (joining) return

    // Si la instancia está apagada no lanzamos el juego.
    let online = options.fresh ? undefined : pings[id]?.online
    if (online === undefined) {
      const fresh = await window.ekoLauncher?.pingServer?.({ ip: target.ip || '', port: target.port || 19132 })
      online = Boolean(fresh?.online)
    }
    if (!online) {
      showToast('Esta instancia se encuentra offline.')
      return
    }

    setJoining(true)
    try {
      const result = await window.ekoLauncher?.joinGame?.({ ip: target.ip || '', port: target.port || 19132 })
      if (!result?.ok) {
        if (result?.error === 'not-installed') {
          showToast('No encontré Minecraft Bedrock instalado en este equipo.')
        } else {
          showToast('No se pudo abrir Minecraft. Inténtalo otra vez.')
        }
        return
      }
      setSelectedId(id)
      setQuick((current) => {
        const keptPinned = current.filter((item) => item.pinned && item.id !== id)
        return [{ id, pinned: true }, ...keptPinned].slice(0, 3)
      })
      if (result.started) {
        showToast('Minecraft se está abriendo y entrará a la instancia.', 'info')
      }
      if (result.redirected && result.host && result.port) {
        showToast(`Conectando a ${result.host}:${result.port}`, 'info')
      }
      setPlaying(target.name)
      setShowServers(false)
      setDownloaded(false)
      if (settings.minimizeOnPlay) window.ekoLauncher?.minimizeWindow?.()
    } finally {
      setJoining(false)
    }
  }

  async function installServerAddon() {
    const target = server
    if (!target || addonBusy) return
    const packs = serverAddons(target)
    if (packs.length === 0) return
    setAddonBusy(true)
    try {
      const version = addonVersion(target)
      const bridge = window.ekoLauncher
      let installed = 0
      let failed = false
      let restored = false

      for (const addon of packs) {
        let result: { ok: boolean; opened?: boolean; path?: string; restored?: boolean; error?: string } | undefined

        if (addon.fileId) {
          if (!bridge?.installAddonFile) {
            showToast('Este dispositivo no puede instalar packs automáticamente.')
            return
          }
          const blob = await loadAddonBlob(addon.fileId)
          if (!blob) {
            showToast(`El pack "${addon.fileName || addon.name || 'pack'}" ya no está guardado. Edita la instancia y vuelve a seleccionarlo.`)
            return
          }
          const data = await blob.arrayBuffer()
          result = await bridge.installAddonFile({
            name: addon.name || target.name,
            fileName: addon.fileName || 'pack.mcaddon',
            data,
          })
        } else if (addon.url) {
          if (!bridge?.installAddon) {
            showToast('Este dispositivo no puede instalar packs automáticamente.')
            return
          }
          result = await bridge.installAddon({
            url: addon.url,
            name: addon.name || target.name,
            sha256: addon.sha256,
          })
        } else {
          continue
        }

        if (!result?.ok) {
          failed = true
          const code = String(result?.error || '')
          if (code === 'not-installed') {
            showToast('No encontré Minecraft Bedrock instalado en este dispositivo.')
          } else if (code === 'hash-mismatch') {
            showToast('El pack descargado no coincide con la firma esperada.')
          } else if (code === 'invalid-pack') {
            showToast('El pack no tiene un manifest de Minecraft válido.')
          } else if (code === 'bad-url') {
            showToast('El enlace del pack no es válido.')
          } else if (code.startsWith('http-')) {
            showToast(`La instancia del pack respondió ${code.replace('http-', 'HTTP ')}.`)
          } else {
            showToast(code || 'No se pudo instalar el pack de la instancia.')
          }
          break
        }
        if (result.opened === false) {
          showToast(
            `Pack descargado, pero Minecraft no lo abrió. Ábrelo manualmente desde ${result.path || 'la carpeta de descargas'}.`,
            'info',
          )
          failed = true
          break
        }
        installed += 1
        if (result.restored) restored = true
      }

      if (failed || installed === 0) return
      markAddonInstalled(target.id, version)
      setAddonTick((value) => value + 1)
      showToast(
        restored
          ? 'Carpeta de Minecraft restaurada y pack instalado. Ya puedes entrar con JUGAR.'
          : installed > 1
            ? `${installed} packs instalados. Ya puedes entrar con JUGAR.`
            : 'Pack instalado. Ya puedes entrar con JUGAR.',
        'info',
      )
      if (settings.notifyDownloads) notifyDownloadFinished(target.name)
      return
    } catch (installError) {
      showToast(
        installError instanceof Error ? installError.message : 'No se pudo instalar el pack de la instancia.',
      )
    } finally {
      setAddonBusy(false)
    }
  }

  function addCustomServer(input: CustomServer) {
    const entry: CustomServer = {
      ...input,
      updatedAt: new Date().toISOString(),
      createdBy: profile.gamertag || 'Sin sesión',
    }
    seenInstancesRef.current?.add(entry.id)
    // La instancia privada siempre se guarda solo en el baúl local.
    if (!entry.private && isRemoteSyncEnabled()) {
      // Instancia compartida: vive en la nube y llega a todos en segundos.
      setRemoteConfig((current) => ({
        ...current,
        instances: mergeInstanceLists([entry], current.instances || []),
      }))
      void publishShared([entry])
        .then((config) => setRemoteConfig(config))
        .catch(() => {
          showToast('Sin conexión con la nube: la instancia se guardó solo en este equipo.', 'info')
          const next = [...customServers, entry]
          setCustomServers(next)
          saveCustomServers(next)
        })
      selectServer(input.id)
      setShowServers(true)
      setEditingServer(null)
      return
    }
    const next = [...customServers, entry]
    setCustomServers(next)
    const stored = saveCustomServers(next)
    selectServer(input.id)
    setShowServers(true)
    setEditingServer(null)
    if (!stored) {
      window.alert('La instancia se añadió, pero no se pudo guardar en el dispositivo (espacio insuficiente).')
    }
  }

  function updateCustomServer(nextServer: CustomServer) {
    const previous = mergedServers.find((entry) => entry.id === nextServer.id)
    const previousIds = previous ? serverAddons(previous).map((pack) => pack.fileId).filter(Boolean) : []
    const nextIds = new Set(serverAddons(nextServer).map((pack) => pack.fileId).filter(Boolean))
    for (const fileId of previousIds) {
      if (fileId && !nextIds.has(fileId)) void deleteAddonBlob(fileId)
    }
    const next = mergedServers.map((entry) => (entry.id === nextServer.id ? nextServer : entry))
    const stored = commitServers(next, new Set([nextServer.id]))
    setEditingServer(null)
    setShowServers(true)
    if (!stored) {
      window.alert('Los cambios se guardaron, pero no se pudieron almacenar en el dispositivo (espacio insuficiente).')
    }
  }

  /** Guarda la personalización del botón solo en la instancia indicada. */
  function persistServerButton(id: string, config: PlayButtonConfig) {
    const next = customServersRef.current.map((entry) =>
      entry.id === id ? { ...entry, button: config } : entry,
    )
    commitServers(next, new Set([id]))
  }

  function openButtonEditor(id: string) {
    if (!isAdmin) return
    const target = customServersRef.current.find((entry) => entry.id === id)
    if (!target) return
    setShowServers(false)
    setShowAddServer(false)
    setEditingServer(null)
    setCtxMenu(null)
    selectServer(id)
    setButtonDraft(normalizePlayButton(target.button))
    setEditingButtonId(id)
  }

  function closeButtonEditor() {
    if (editingButtonId && buttonDraft) persistServerButton(editingButtonId, buttonDraft)
    setEditingButtonId(null)
    setButtonDraft(null)
  }

  function openAccount() {
    setSettingsTab('account')
    setShowSettings(true)
  }

  function openProfile(tag: string) {
    if (!tag) return
    setProfileGamertag(tag)
  }

  if (ban) return <LoadingScreen duration={bootDuration} />
  if (screen === 'loading') return <LoadingScreen duration={bootDuration} onFilled={handleLogoFilled} />
  if (screen === 'access') return <AccessScreen onAuthenticated={handleAuthenticated} showPasswordByDefault={view.showPassword} />

  return (
    <main
      className={`launcher ${playEditMode ? 'is-editing' : ''}`}
      data-theme={view.theme}
      data-animations={view.animations && !view.reducedAnimations && !view.liteMode ? 'on' : 'off'}
    >
      {view.backgroundImage ? (
        <img className="launcher-video" src={view.backgroundImage} alt="" aria-hidden="true" />
      ) : (
        <>
          <img className="launcher-video launcher-menu-bg" src={defaultBackground} alt="" aria-hidden="true" />
          <span className="launcher-menu-aura" aria-hidden="true" />
        </>
      )}
      {server?.background && (
        <div className="server-bg" style={{ backgroundImage: `url(${server.background})` }} aria-hidden="true" />
      )}
      <div className="launcher-overlay" style={view.transparency ? { opacity: 1 - view.transparency / 100 } : undefined} />

      {!playEditMode && (
      <aside className="launcher-rail" aria-label="Navegación principal">
        <button
          className="launcher-logo"
          aria-label={`Cuenta y ajustes de ${gamertag || 'jugador'}`}
          onClick={openAccount}
          title="Mi cuenta"
        >
          <SkinFace
            gamertag={gamertag}
            xuid={profile.xuid}
            localSkin={localSkin}
            skinTextureUrl={profile.skinTextureUrl}
            refreshKey={avatarRefreshKey}
            size={49}
            alt={`Cara de la skin de ${gamertag || 'jugador'}`}
          />
        </button>

        {quickServers.length > 0 && (
          <div className="rail-servers" aria-label="Instancias recientes">
            {quickServers.map((item) => (
              <button
                key={item.id}
                className={`rail-server ${item.id === selectedId ? 'active' : ''}`}
                onClick={() => selectServer(item.id)}
                title={item.name}
                aria-label={`Instancia ${item.name}`}
              >
                {item.icon || item.image ? <img src={item.icon || item.image} alt="" /> : <Gamepad2 />}
              </button>
            ))}
          </div>
        )}

        <button className="rail-icon rail-servers-button" aria-label="Instancias" onClick={() => setShowServers(true)} title="Instancias">
          <ServerDots />
        </button>
        <button className="rail-icon" aria-label="Añadir instancia" onClick={() => setShowAddServer(true)} title="Añadir instancia">
          <Plus />
        </button>
        <div className="rail-spacer" />
        <button
          className="rail-icon"
          aria-label="Configuración"
          onClick={() => {
            setSettingsTab('general')
            setShowSettings(true)
          }}
        >
          <Settings />
        </button>
      </aside>
      )}

      <section className="launcher-main">
        <header className="launcher-top">
          {isAdmin && (
            <button
              className="admin-open"
              onClick={() => {
                // Refresca los códigos y usos guardados por otras sesiones del mismo equipo.
                setRemoteConfig(loadCachedConfig())
                setShowAdmin(true)
              }}
              title="Panel de administración"
            >
              <Shield /> Admin
            </button>
          )}
        </header>

        <div className={`launcher-side ${server ? '' : 'no-server'}`}>
          {server && (
            <div className="server-status">
              <div className="server-badge">
                {server.icon || server.image ? <img src={server.icon || server.image} alt="" /> : <Gamepad2 />}
              </div>
              <div>
                <strong>{server.name}</strong>
                <span className={pings[server.id]?.online ? 'online' : ''}>
                  {pings[server.id]?.online ? 'Online' : 'Sin conexión'}
                </span>
                {serverPackList.length > 0 && (
                  <small className={`addon-status ${addonReady ? 'ready' : ''}`}>
                    {addonReady
                      ? `${serverPackList.length} pack${serverPackList.length > 1 ? 's' : ''} instalado${serverPackList.length > 1 ? 's' : ''}`
                      : 'Pulsa DESCARGAR para instalar los packs'}
                  </small>
                )}
              </div>
              <b title={pings[server.id]?.online ? (pings[server.id].playersUnknown ? 'Online · el host no informa jugadores' : `${pings[server.id].players || 0} de ${pings[server.id].maxPlayers || 0} jugadores online`) : 'Sin conexión'}>
                {pings[server.id]?.online ? (pings[server.id].playersUnknown ? '—' : (<>{pings[server.id].players || 0}{pings[server.id].maxPlayers ? <em className="status-max">/{pings[server.id].maxPlayers}</em> : null}</>)) : '—'}
              </b>
            </div>
          )}
        </div>

        <div className="launcher-footer">
          {server ? (
          <button
            className={playButtonClassName(
              activeButton,
              `${joining || addonBusy ? 'is-joining' : ''} ${needsAddon ? 'is-download' : ''} ${playEditMode ? 'is-editing' : ''}`,
            )}
            disabled={joining || addonBusy}
            style={playButtonStyle(activeButton, activeButtonFallback)}
            onPointerDown={(event) => {
              if (!playEditMode) return
              if (event.pointerType === 'mouse' && event.button !== 0) return
              playDrag.current = {
                active: true,
                moved: false,
                startX: event.clientX,
                startY: event.clientY,
                originX: activeButton.x,
                originY: activeButton.y,
              }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const drag = playDrag.current
              if (!drag?.active) return
              const dx = event.clientX - drag.startX
              const dy = event.clientY - drag.startY
              if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return
              drag.moved = true
              const nextX = Math.min(900, Math.max(-900, drag.originX + dx))
              const nextY = Math.min(600, Math.max(-600, drag.originY + dy))
              if (editingButtonId) {
                setButtonDraft((current) => (current ? { ...current, x: nextX, y: nextY } : current))
              } else {
                buttonPreviewControl.current?.((current) => ({ ...current, x: nextX, y: nextY }))
              }
            }}
            onPointerUp={(event) => {
              const drag = playDrag.current
              if (drag?.active) {
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                } catch {}
                window.setTimeout(() => {
                  playDrag.current = null
                }, 0)
              }
            }}
            onPointerCancel={() => {
              playDrag.current = null
            }}
            onClick={(event) => {
              if (playDrag.current?.moved) {
                event.preventDefault()
                return
              }
              if (playEditMode) return
              if (!server) {
                setNoInstanceNotice(Date.now())
                return
              }
              if (needsAddon) {
                void installServerAddon()
                return
              }
              void joinServer(server.id)
            }}
            title={
              !server
                ? 'Selecciona una instancia'
                : needsAddon
                  ? `Descargar el pack de ${server.name}`
                  : `Jugar en ${server.name}`
            }
          >
            <PlayButtonFace config={activeButton} fallbackColor={activeButtonFallback}>
              {addonBusy ? (
                <>
                  <Download /> DESCARGANDO…
                </>
              ) : needsAddon ? (
                <>
                  <Download /> DESCARGAR
                </>
              ) : joining ? (
                <>
                  <Play /> CONECTANDO…
                </>
              ) : (
                <>
                  <Play /> JUGAR
                </>
              )}
            </PlayButtonFace>
          </button>
          ) : (
            <p className="play-placeholder">Descarga una instancia para poder jugar</p>
          )}

          {!playEditMode && (
          <div className="launcher-socials">
            <button
              className="discord"
              onClick={() => openExternalUrl('https://discord.com/invite/JK7gZmNysM')}
              aria-label="Abrir Discord"
              title="Únete al Discord de KaferProjects"
            >
              <span className="discord-icon" aria-hidden="true">
                <svg className="discord-logo" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.54 5.32A16.3 16.3 0 0 0 15.5 4l-.5 1.02a14.2 14.2 0 0 0-6 0L8.5 4a16.3 16.3 0 0 0-4.04 1.32C1.9 9.13 1.2 12.85 1.56 16.52A16.4 16.4 0 0 0 6.5 19l1.2-1.65a9.7 9.7 0 0 1-1.9-.92l.46-.35c3.67 1.7 7.65 1.7 11.28 0l.47.35c-.6.36-1.24.67-1.9.92L17.5 19a16.4 16.4 0 0 0 4.94-2.48c.42-4.26-.72-7.94-2.9-11.2ZM8.44 14.63c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2 .99 2 2.2-.9 2.2-2 2.2Zm7.12 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2 .99 2 2.2-.9 2.2-2 2.2Z" />
                </svg>
              </span>
            </button>
            <button
              className="social-x"
              onClick={() => openExternalUrl('https://x.com/Kafer_Projects')}
              aria-label="Abrir X (Twitter)"
              title="X (Twitter)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
            </button>
          </div>
          )}
        </div>

        {noInstanceNotice > 0 && (
          <div key={noInstanceNotice} className="instance-required-notice" role="status" aria-live="polite">
            Debes tener una instancia seleccionada para jugar
          </div>
        )}
      </section>

      {showServers && (
        <div className="server-modal-backdrop" onClick={() => setShowServers(false)}>
          <section className="server-modal" onClick={(event) => event.stopPropagation()} aria-label="Instancias disponibles">
            <button className="modal-close" onClick={() => setShowServers(false)} aria-label="Cerrar selección">
              <X />
            </button>
            <div className="modal-kicker">KaferProjects Launcher / Instancias</div>
            <h1 className="server-grid-title">Instancias disponibles:</h1>

            {aternosNeedsLogin && (
              <button
                type="button"
                className="aternos-connect"
                onClick={connectAternos}
                title="Para ver los jugadores de Aternos, conecta tu cuenta una vez (se guarda en el launcher)"
              >
                Conecta tu cuenta de Aternos para ver los jugadores
              </button>
            )}

            <div className="server-grid">
              {allServers.length === 0 ? (
                <div className="server-empty-state">
                  <Gamepad2 />
                  <strong>Sin instancias</strong>
                  <span>Añade una instancia con sus datos.</span>
                </div>
              ) : (
                allServers.map((server) => {
                  const live = pings[server.id]
                  const online = server.available !== false && Boolean(live?.online)
                  return (
                  <div key={server.id} className={`server-tile ${server.available === false ? 'unavailable' : ''}`} onClick={() => server.available !== false && selectServer(server.id)} onContextMenu={(event) => {
                    event.preventDefault()
                    if (!server.custom) return
                    setCtxMenu({ x: event.clientX, y: event.clientY, server })
                  }} role="button">
                    <div className="server-tile-banner" style={{ background: server.image ? `url(${server.image}) center/cover` : 'linear-gradient(135deg,#1f0f2e,#0b0810)' }}>
                      {server.pinned && (
                        <span className="server-tile-pin" title="Instancia fijada" aria-label="Instancia fijada">
                          <Pin size={13} />
                        </span>
                      )}
                      {server.icon && <img className="server-tile-icon" src={server.icon} alt="" />}
                      {server.available === false && <span className="server-unavailable-tag">No disponible</span>}
                    </div>
                    <div className="server-tile-body">
                      <strong>{server.name}</strong>
                      {online && typeof live?.latency === 'number' && (
                        <span className="server-tile-ping">{live.latency} ms</span>
                      )}
                      <span
                        className={`server-tile-dot ${online ? 'ok' : 'off'}`}
                        title={online ? (live?.playersUnknown ? 'Online (el host no informa jugadores)' : `Online · ${live?.players || 0} jugadores`) : 'Offline o no responde'}
                      />
                      {online && !live?.playersUnknown && (
                        <span className="server-tile-players" title={`${live?.players || 0} de ${live?.maxPlayers || 0} jugadores`}>
                          {live?.players || 0}
                          {live?.maxPlayers ? <em>/{live.maxPlayers}</em> : null}
                        </span>
                      )}
                    </div>
                  </div>
                  )
                })
              )}
            </div>

            <div className="modal-footer">
              <span>
                <Users /> Clic derecho en una instancia para fijarla, moverla, editarla o eliminarla
              </span>
            </div>
          </section>
        </div>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: ctxMenu.server.pinned ? 'Quitar de fijadas' : 'Fijar instancia',
              icon: ctxMenu.server.pinned ? contextMenuIcons.unpin : contextMenuIcons.pin,
              onClick: () => togglePin(ctxMenu.server.id),
            },
            {
              label: 'Editar instancia',
              icon: contextMenuIcons.edit,
              onClick: () => {
                setEditingServer(mergedServers.find((entry) => entry.id === ctxMenu.server.id) || null)
                setShowServers(false)
                setShowAddServer(true)
              },
            },
            ...(isAdmin
              ? [
                  {
                    label: 'Personalizar botón JUGAR',
                    icon: <Wand2 size={14} />,
                    onClick: () => openButtonEditor(ctxMenu.server.id),
                  },
                ]
              : []),
            {
              label: 'Subir',
              icon: <ArrowUp size={14} />,
              onClick: () => moveServer(ctxMenu.server.id, -1),
            },
            {
              label: 'Bajar',
              icon: <ArrowDown size={14} />,
              onClick: () => moveServer(ctxMenu.server.id, 1),
            },
            ...(isAdmin
              ? [
                  {
                    label:
                      ctxMenu.server.available === false
                        ? 'Marcar como disponible'
                        : 'Marcar como no disponible',
                    icon: contextMenuIcons.show,
                    onClick: () => toggleServerAvailability(ctxMenu.server.id),
                  },
                ]
              : []),
            {
              label: 'Eliminar instancia',
              icon: contextMenuIcons.delete,
              danger: true,
              divider: true,
              onClick: () => deleteServer(ctxMenu.server.id),
            },
          ]}
        />
      )}

      {showAddServer && (
        <ServerAddModal
          securityConfirmations={settings.securityConfirmations}
          isAdmin={isAdmin}
          gamertag={gamertag}
          initial={editingServer}
          onClose={() => { setShowAddServer(false); setEditingServer(null) }}
          onAdd={addCustomServer}
          onUpdate={updateCustomServer}
          onPreviewButton={handlePreviewButton}
          previewControlRef={buttonPreviewControl}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          initialTab={settingsTab}
          onSave={handleSaveSettings}
          onClose={closeSettings}
          onPreview={(next) => setSettingsPreview(next)}
          profile={{ gamertag: profile.gamertag, email: profile.email, xuid: profile.xuid }}
          onLogout={handleLogout}
          localSkin={localSkin}
          skinTextureUrl={profile.skinTextureUrl}
          onOpenProfile={openProfile}
        />
      )}

      {showAdmin && isAdmin && (
        <AdminPanel
          gamertag={gamertag}
          config={remoteConfig}
          onChange={(next) => {
            setRemoteConfig(next)
            saveCachedConfig(next)
          }}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {isAdmin && playEditMode && buttonDraft && (
        <PlayProperties
          config={buttonDraft}
          onChange={setButtonDraft}
          onClose={closeButtonEditor}
          fallbackColor={server?.buttonColor}
          contextLabel={server?.name}
        />
      )}

      {profileGamertag && (
        <ProfileModal
          gamertag={profileGamertag}
          viewer={gamertag}
          isAdmin={isAdmin}
          own={ownProfile}
          friends={loadFriends()}
          xuid={profile.xuid}
          localSkin={localSkin}
          skinTextureUrl={profile.skinTextureUrl}
          onClose={() => setProfileGamertag(null)}
        />
      )}

      <ToastHost />

      {toast && (
        <div key={toast.id} className={`eko-toast ${toast.kind}`} role="status" aria-live="polite">
          <span className="eko-toast-dot" aria-hidden="true" />
          {toast.message}
        </div>
      )}
    </main>
  )
}
