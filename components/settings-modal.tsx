'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Check,
  Cpu,
  Info,
  Play,
  RotateCw,
  Save,
  Shield,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react'
import {
  EkoSettings,
  defaultSettings,
  normalizeHex,
} from '@/lib/settings'
import { clearJoinedServers } from '@/lib/servers'
import { SkinFace } from '@/components/skin-face'
import { useClosing } from '@/lib/use-closing'

type TabId =
  | 'general'
  | 'notifications'
  | 'performance'
  | 'privacy'
  | 'account'
  | 'about'

export type SettingsTab = TabId

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'performance', label: 'Rendimiento', icon: Cpu },
  { id: 'privacy', label: 'Privacidad', icon: Shield },
  { id: 'account', label: 'Cuenta', icon: User },
  { id: 'about', label: 'Acerca de KaferProjects', icon: Info },
]

const APP_VERSION = '1.0.0'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-toggle">
      <div>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="color-row">
      <span>{label}</span>
      <div className="color-control">
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
        <input
          className="color-hex"
          value={value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onChange(normalizeHex(event.target.value, normalizeHex(value)))}
          aria-label={`${label} en hexadecimal`}
        />
      </div>
    </div>
  )
}

export function SettingsModal({
  settings,
  onSave,
  onClose,
  onPreview,
  profile,
  onLogout,
  initialTab = 'general',
  servers,
  localSkin,
  skinTextureUrl,
  onOpenProfile,
}: {
  settings: EkoSettings
  onSave: (settings: EkoSettings) => void
  onClose: () => void
  onPreview?: (settings: EkoSettings) => void
  profile?: { gamertag: string; email: string; xuid?: string }
  onLogout?: () => void
  initialTab?: TabId
  servers?: { id: number; name: string }[]
  localSkin?: string | null
  skinTextureUrl?: string
  onOpenProfile?: (gamertag: string) => void
}) {
  const { closing, requestClose } = useClosing(onClose)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [draft, setDraft] = useState<EkoSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [assetError, setAssetError] = useState('')
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'latest'>('idle')

  const set = <K extends keyof EkoSettings>(key: K, value: EkoSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Vista previa en vivo de la apariencia: cada cambio se refleja al instante en el launcher.
  useEffect(() => {
    onPreview?.(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function setColorAt(key: 'accentGradient' | 'playColors', index: number, value: string) {
    setDraft((current) => {
      const next = [...current[key]]
      next[index] = value
      return { ...current, [key]: next }
    })
  }

  function setColorCount(key: 'accentGradient' | 'playColors', count: number) {
    setDraft((current) => {
      const next = current[key].slice(0, count)
      while (next.length < count) {
        next.push(defaultSettings[key][next.length] || current.accentColor)
      }
      return { ...current, [key]: next }
    })
  }

  const accentColors = useMemo(
    () => draft.accentGradient.map((color) => normalizeHex(color, draft.accentColor)),
    [draft.accentGradient, draft.accentColor],
  )
  const playColors = useMemo(
    () => draft.playColors.map((color) => normalizeHex(color, draft.accentColor)),
    [draft.playColors, draft.accentColor],
  )
  const accentBackground =
    draft.accentMode === 'gradient' && accentColors.length > 1
      ? `linear-gradient(135deg, ${accentColors.join(', ')})`
      : normalizeHex(draft.accentColor)
  const playBackground = playColors.length > 1 ? `linear-gradient(90deg, ${playColors.join(', ')})` : playColors[0]

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings])

  function handleSave() {
    onSave(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function handleReset() {
    if (draft.securityConfirmations && !window.confirm('¿Restablecer todos los ajustes de KaferProjects Launcher?')) return
    setDraft({ ...defaultSettings })
  }

  function handleBackgroundFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAssetError('El fondo debe ser una imagen PNG, JPG o WEBP.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAssetError('')
      set('backgroundImage', String(reader.result || ''))
    }
    reader.readAsDataURL(file)
  }

  function checkUpdates() {
    setUpdateState('checking')
    window.setTimeout(() => setUpdateState('latest'), 900)
  }

  return (
    <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={requestClose}>
      <section className="settings-modal" onClick={(event) => event.stopPropagation()} aria-label="Configuración de KaferProjects Launcher">
        <button className="modal-close" onClick={requestClose} aria-label="Cerrar configuración">
          <X />
        </button>
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="Secciones de configuración">
            <div className="settings-tabs-brand">
              <strong>Configuración</strong>
              <span>Ajustes de KaferProjects Launcher</span>
            </div>
            {tabs.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
                  <Icon /> {item.label}
                </button>
              )
            })}
          </nav>

          <div className="settings-content">
            {tab === 'general' && (
              <>
                <div className="settings-pane-head">
                  <h2>General</h2>
                  <p>Comportamiento del launcher en Windows.</p>
                </div>
                <div className="settings-body">
                  <Row title="Iniciar con Windows" description="Abre KaferProjects Launcher al encender el equipo.">
                    <Toggle checked={draft.startWithWindows} onChange={(v) => set('startWithWindows', v)} label="Iniciar con Windows" />
                  </Row>
                  <Row title="Minimizar al cerrar" description="Oculta el launcher en la bandeja en vez de cerrarlo.">
                    <Toggle checked={draft.minimizeOnClose} onChange={(v) => set('minimizeOnClose', v)} label="Minimizar al cerrar" />
                  </Row>
                  <Row title="Minimizar al jugar" description="Oculta el launcher al unirte a una instancia.">
                    <Toggle checked={draft.minimizeOnPlay} onChange={(v) => set('minimizeOnPlay', v)} label="Minimizar al jugar" />
                  </Row>
                  {servers && servers.length > 0 && (
                    <p className="settings-note">
                      No hay una instancia predeterminada: al abrir KaferProjects Launcher no se selecciona ninguna. Elige una desde
                      JUGAR o desde la barra lateral.
                    </p>
                  )}
                  <p className="settings-note">
                    KaferProjects Launcher está pensado para Minecraft Bedrock Edition. Los ajustes de Java no se incluyen.
                  </p>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <div className="settings-pane-head">
                  <h2>Notificaciones</h2>
                  <p>Elige qué avisos quieres recibir de KaferProjects Launcher.</p>
                </div>
                <div className="settings-body">
                  <Row
                    title="Nueva instancia disponible"
                    description="Te avisa cuando alguien publica una instancia nueva y tienes el launcher minimizado o en segundo plano."
                  >
                    <Toggle
                      checked={draft.notifyNewInstances}
                      onChange={(v) => set('notifyNewInstances', v)}
                      label="Nueva instancia disponible"
                    />
                  </Row>
                  <Row
                    title="Descargas terminadas"
                    description="Te avisa cuando los archivos de una instancia terminan de descargarse e instalarse."
                  >
                    <Toggle
                      checked={draft.notifyDownloads}
                      onChange={(v) => set('notifyDownloads', v)}
                      label="Descargas terminadas"
                    />
                  </Row>
                  <p className="settings-note">
                    Si tienes el launcher abierto y enfocado, los avisos se muestran como tarjetas dentro del launcher;
                    si está minimizado o en segundo plano, llegan como notificaciones de Windows.
                  </p>
                </div>
              </>
            )}

            {tab === 'performance' && (
              <>
                <div className="settings-pane-head">
                  <h2>Rendimiento</h2>
                  <p>Reduce el consumo del launcher en equipos modestos.</p>
                </div>
                <div className="settings-body">
                  <Row title="Modo ligero" description="Desactiva animaciones y efectos para consumir menos recursos.">
                    <Toggle checked={draft.liteMode} onChange={(v) => set('liteMode', v)} label="Modo ligero" />
                  </Row>
                  <Row title="Animaciones reducidas" description="Menos movimiento en la interfaz.">
                    <Toggle checked={draft.reducedAnimations} onChange={(v) => set('reducedAnimations', v)} label="Animaciones reducidas" />
                  </Row>
                  <Row title="Rich Presence de Discord" description="Muestra tu actividad de KaferProjects en Discord.">
                    <Toggle checked={draft.discordPresence} onChange={(v) => set('discordPresence', v)} label="Rich Presence" />
                  </Row>
                  <Row title="Mostrar instancia en Discord" description="Solo muestra la instancia cuando estás jugando de verdad.">
                    <Toggle checked={draft.richServers} onChange={(v) => set('richServers', v)} label="Mostrar instancia en Discord" />
                  </Row>
                </div>
              </>
            )}

            {tab === 'privacy' && (
              <>
                <div className="settings-pane-head">
                  <h2>Privacidad y seguridad</h2>
                  <p>Control de datos y confirmaciones.</p>
                </div>
                <div className="settings-body">
                  <Row title="Ver tu contraseña" description="Muestra la contraseña de tu cuenta al iniciar sesión.">
                    <Toggle
                      checked={draft.showPassword}
                      onChange={(v) => set('showPassword', v)}
                      label="Ver contraseña"
                    />
                  </Row>
                  <Row title="Confirmaciones de seguridad" description="Pide confirmación al cerrar sesión, añadir instancias o restablecer ajustes.">
                    <Toggle
                      checked={draft.securityConfirmations}
                      onChange={(v) => set('securityConfirmations', v)}
                      label="Confirmaciones de seguridad"
                    />
                  </Row>
                  <Row title="Guardar historial de instancias" description="Mantiene en la barra lateral las instancias a las que te uniste.">
                    <Toggle checked={draft.saveHistory} onChange={(v) => set('saveHistory', v)} label="Guardar historial" />
                  </Row>
                  <Row title="Borrar historial al salir" description="Elimina el historial de instancias al cerrar el launcher.">
                    <Toggle checked={draft.clearHistoryOnExit} onChange={(v) => set('clearHistoryOnExit', v)} label="Borrar historial al salir" />
                  </Row>
                  <div className="settings-actions">
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        if (!draft.securityConfirmations || window.confirm('¿Borrar el historial de instancias?')) {
                          clearJoinedServers()
                          setAssetError('')
                          window.alert('Historial de instancias borrado.')
                        }
                      }}
                    >
                      <Trash2 /> Borrar historial ahora
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'account' && (
              <>
                <div className="settings-pane-head">
                  <h2>Cuenta</h2>
                  <p>Tu cuenta local y opciones de sesión.</p>
                </div>
                <div className="settings-body">
                  <div className="account-card">
                    <SkinFace
                      gamertag={profile?.gamertag}
                      xuid={profile?.xuid}
                      localSkin={localSkin}
                      skinTextureUrl={skinTextureUrl}
                      size={64}
                    />
                    <div>
                      <strong>{profile?.gamertag || 'Sin iniciar sesión'}</strong>
                      <span>{profile?.email || 'Cuenta local de KaferProjects'}</span>
                      {profile?.xuid && <span className="account-xuid">XUID {profile.xuid}</span>}
                    </div>
                    {profile?.gamertag && (
                      <button
                        type="button"
                        className="btn-ghost account-profile-btn"
                        onClick={() => onOpenProfile?.(profile.gamertag)}
                      >
                        Ver mi perfil
                      </button>
                    )}
                  </div>
                  <Row title="Cerrar sesión" description="Cierra la sesión actual y vuelve a la pantalla de acceso.">
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => {
                        if (!draft.securityConfirmations || window.confirm('¿Cerrar sesión de KaferProjects Launcher?')) {
                          onLogout?.()
                        }
                      }}
                    >
                      Cerrar sesión
                    </button>
                  </Row>
                  <p className="settings-note">
                    Tu cuenta y tus instancias se guardan en este dispositivo.
                  </p>
                </div>
              </>
            )}

            {tab === 'about' && (
              <>
                <div className="settings-pane-head">
                  <h2>Acerca de KaferProjects</h2>
                  <p>Información del launcher.</p>
                </div>
                <div className="settings-body">
                  <div className="about-card">
                    <div className="about-logo">
                      <img src="./kafer-logo.svg" alt="" />
                    </div>
                    <div>
                      <strong>KaferProjects Launcher</strong>
                      <span>Versión {APP_VERSION} · Minecraft Bedrock</span>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button className="btn-primary" onClick={checkUpdates} disabled={updateState === 'checking'}>
                      <RotateCw className={updateState === 'checking' ? 'spin' : ''} />
                      {updateState === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
                    </button>
                    {updateState === 'latest' && (
                      <span className="settings-inline-note">
                        <Check /> Estás en la última versión disponible ({APP_VERSION}).
                      </span>
                    )}
                  </div>
                  <p className="about-credits">
                    Launcher de Minecraft Bedrock. Créditos: KaferProjects. Soporte: x.com/Kafer_Projects
                  </p>
                </div>
              </>
            )}

            {saved && (
              <p className="form-ok">
                <Check /> Ajustes guardados correctamente.
              </p>
            )}

            <div className="settings-footer">
              <span className="settings-note">
                {dirty ? 'Vista previa activa · se revierte si cierras sin guardar.' : 'Los cambios se aplican al guardar.'}
              </span>
              <div className="settings-actions">
                <button className="btn-ghost" onClick={handleReset}>
                  <RotateCw /> Restablecer todo
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setDraft(settings)}
                  disabled={!dirty}
                  title="Volver a la apariencia guardada"
                >
                  <X /> Descartar
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={!dirty && !saved}>
                  <Save /> Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
