'use client'

import { useState } from 'react'
import {
  Ban,
  Check,
  Clock,
  Copy,
  Plus,
  RefreshCw,
  Shield,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { type AdminConfig, type InstanceCode } from '@/lib/admin-config'
import {
  applyRemoteChange,
  isRemoteSyncEnabled,
  mergeCodeUsage,
} from '@/lib/remote-config'
import { generateInstanceCode, instanceCodeState, instanceCodeStatusLabel } from '@/lib/instance-codes'

type Props = {
  gamertag: string
  config: AdminConfig
  onChange: (config: AdminConfig) => void
  onClose: () => void
}

type Status = { text: string; error?: boolean }
type DurationId = '1h' | '1d' | '7d' | '30d' | 'never'

const DURATIONS: { id: DurationId; label: string; ms: number | null }[] = [
  { id: '1h', label: '1 hora', ms: 60 * 60 * 1000 },
  { id: '1d', label: '1 día', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'never', label: 'Nunca caduca', ms: null },
]

function formatDate(value?: string | null): string {
  if (!value) return 'No caduca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no válida'
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export function AdminPanel({ gamertag, config, onChange, onClose }: Props) {
  const [banTag, setBanTag] = useState('')
  const [banXuid, setBanXuid] = useState('')
  const [banReason, setBanReason] = useState('')
  const [newAdmin, setNewAdmin] = useState('')
  const [duration, setDuration] = useState<DurationId>('7d')
  const [maxUses, setMaxUses] = useState('1')
  const [lastCode, setLastCode] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  function update(next: AdminConfig) {
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    onChange(stamped)
    // Cada cambio se publica al instante para que llegue a todos los launchers.
    if (isRemoteSyncEnabled()) {
      void applyRemoteChange((doc) => ({
        ...doc,
        admins: stamped.admins,
        bans: stamped.bans,
        codes: mergeCodeUsage(stamped.codes, doc.codes),
      })).catch(() => {})
    }
  }

  function addBan() {
    const tag = banTag.trim()
    const xuid = banXuid.trim()
    if (!tag && !xuid) {
      setStatus({ text: 'Indica un gamertag o un XUID para banear.', error: true })
      return
    }
    if (tag && tag.toLowerCase() === gamertag.toLowerCase()) {
      setStatus({ text: 'No puedes banear tu propia cuenta.', error: true })
      return
    }
    const exists = config.bans.some(
      (entry) =>
        (tag && entry.gamertag && entry.gamertag.toLowerCase() === tag.toLowerCase()) ||
        (xuid && entry.xuid === xuid),
    )
    if (exists) {
      setStatus({ text: 'Ese usuario ya está baneado.', error: true })
      return
    }
    update({
      ...config,
      bans: [
        {
          ...(tag ? { gamertag: tag } : {}),
          ...(xuid ? { xuid } : {}),
          ...(banReason.trim() ? { reason: banReason.trim() } : {}),
          at: new Date().toISOString(),
        },
        ...config.bans,
      ],
    })
    setBanTag('')
    setBanXuid('')
    setBanReason('')
    setStatus({ text: 'Usuario añadido a la lista de baneos en este equipo.' })
  }

  function removeBan(index: number) {
    update({ ...config, bans: config.bans.filter((_, i) => i !== index) })
    setStatus({ text: 'Baneo eliminado.' })
  }

  function addAdmin() {
    const tag = newAdmin.trim().toLowerCase()
    if (!tag) return
    if (config.admins.includes(tag)) {
      setStatus({ text: 'Ese usuario ya es administrador.', error: true })
      return
    }
    update({ ...config, admins: [...config.admins, tag] })
    setNewAdmin('')
    setStatus({ text: 'Administrador añadido en este equipo.' })
  }

  function removeAdmin(tag: string) {
    if (tag.toLowerCase() === gamertag.toLowerCase()) {
      setStatus({ text: 'No puedes quitarte a ti mismo del panel.', error: true })
      return
    }
    update({ ...config, admins: config.admins.filter((entry) => entry !== tag) })
    setStatus({ text: 'Administrador eliminado.' })
  }

  function createCode() {
    const chosen = DURATIONS.find((entry) => entry.id === duration) || DURATIONS[2]
    const expiresAt = chosen.ms ? new Date(Date.now() + chosen.ms).toISOString() : null
    const parsedUses = Math.floor(Number(maxUses))
    const uses = Number.isFinite(parsedUses) ? Math.max(0, Math.min(1000, parsedUses)) : 1
    const code = generateInstanceCode(config.codes.map((entry) => entry.code))
    const entry: InstanceCode = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${code}`,
      code,
      createdAt: new Date().toISOString(),
      expiresAt,
      maxUses: uses,
      uses: 0,
      usedBy: [],
    }
    update({ ...config, codes: [entry, ...config.codes] })
    setLastCode(code)
    setStatus({
      text: `Código ${code} generado. ${uses === 0 ? 'Instancias ilimitadas' : `${uses} instancia${uses === 1 ? '' : 's'}`} · ${expiresAt ? `caduca el ${formatDate(expiresAt)}` : 'no caduca'}.`,
    })
  }

  function deleteCode(entry: InstanceCode) {
    if (!window.confirm(`¿Eliminar el código ${entry.code}? Dejará de funcionar al instante.`)) return
    update({ ...config, codes: config.codes.filter((item) => item.id !== entry.id) })
    if (lastCode === entry.code) setLastCode('')
    setStatus({ text: `Código ${entry.code} eliminado.` })
  }

  function regenerateCode(entry: InstanceCode) {
    const code = generateInstanceCode(config.codes.filter((item) => item.id !== entry.id).map((item) => item.code))
    update({
      ...config,
      codes: config.codes.map((item) => (item.id === entry.id ? { ...item, code } : item)),
    })
    if (lastCode === entry.code) setLastCode(code)
    setStatus({ text: `Código regenerado: ${code}. El anterior ya no funciona.` })
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setStatus({ text: `Código ${code} copiado al portapapeles.` })
    } catch {
      setStatus({ text: 'No se pudo copiar. Revisa los permisos del portapapeles.', error: true })
    }
  }

  return (
    <div className="server-modal-backdrop" onClick={onClose}>
      <section className="admin-panel" onClick={(event) => event.stopPropagation()} aria-label="Panel de administración">
        <header className="admin-head">
          <div>
            <h2><Shield /> Panel de administración</h2>
            <p>Control de usuarios, baneos, códigos para crear instancias y administradores.</p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Cerrar panel">
            <X />
          </button>
        </header>

        <div className="admin-body">
          <section className="admin-card">
            <h3><Ban /> Banear usuario</h3>
            <p>
              Un usuario baneado no podrá entrar: su launcher se quedará cargando y, si lo está usando ahora mismo,
              se bloqueará en pocos segundos. Puedes usar el gamertag, el XUID o ambos.
            </p>
            <div className="admin-grid">
              <input
                value={banTag}
                onChange={(event) => setBanTag(event.target.value)}
                placeholder="Gamertag (ej. Steve)"
              />
              <input
                value={banXuid}
                onChange={(event) => setBanXuid(event.target.value)}
                placeholder="XUID (opcional)"
              />
            </div>
            <input
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder="Motivo del baneo (opcional)"
            />
            <div className="admin-actions">
              <button className="btn-primary" onClick={addBan} disabled={busy}>
                <Ban /> Banear
              </button>
            </div>
            <ul className="admin-list">
              {config.bans.length === 0 && <li className="admin-empty">No hay usuarios baneados.</li>}
              {config.bans.map((entry, index) => (
                <li className="admin-item" key={`${entry.gamertag || entry.xuid}-${index}`}>
                  <div className="admin-item-main">
                    <strong>{entry.gamertag || entry.xuid}</strong>
                    <span>
                      {entry.gamertag && entry.xuid ? `XUID ${entry.xuid} · ` : ''}
                      {entry.reason || 'Sin motivo indicado'}
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={() => removeBan(index)} aria-label="Quitar baneo">
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-card">
            <h3><UserPlus /> Administradores</h3>
            <p>Los administradores ven este panel y pueden gestionar usuarios, códigos y configuración.</p>
            <div className="admin-actions">
              <input
                value={newAdmin}
                onChange={(event) => setNewAdmin(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') addAdmin() }}
                placeholder="Gamertag del nuevo admin"
              />
              <button className="btn-primary" onClick={addAdmin} disabled={busy}>
                <UserPlus /> Añadir
              </button>
            </div>
            <ul className="admin-list">
              {config.admins.length === 0 && <li className="admin-empty">No hay administradores adicionales.</li>}
              {config.admins.map((tag) => (
                <li className="admin-item" key={tag}>
                  <div className="admin-item-main">
                    <strong>{tag}</strong>
                    <span>Administrador</span>
                  </div>
                  <button className="btn-ghost" onClick={() => removeAdmin(tag)} aria-label={`Quitar admin ${tag}`}>
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-card">
            <h3><Ticket /> Códigos para crear instancias</h3>
            <p>
              Los usuarios que no son administradores necesitan uno de estos códigos para crear una instancia. Cada
              código se genera al azar y es distinto de todos los anteriores. Puedes elegir cuánto tarda en caducar y
              cuántas instancias se pueden crear con él. Aquí verás qué usuarios lo utilizaron y podrás eliminarlo o
              regenerarlo para que el anterior deje de funcionar. Los administradores no necesitan código.
            </p>
            <div className="admin-grid admin-code-form">
              <label className="admin-field">
                <span><Clock /> Duración</span>
                <select value={duration} onChange={(event) => setDuration(event.target.value as DurationId)}>
                  {DURATIONS.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span><Ticket /> Instancias que se pueden crear (0 = ilimitadas)</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                />
              </label>
            </div>
            <div className="admin-actions">
              <button className="btn-primary" onClick={createCode} disabled={busy}>
                <Plus /> Generar código aleatorio
              </button>
              {lastCode && (
                <button className="btn-ghost" onClick={() => copyCode(lastCode)} disabled={busy}>
                  <Copy /> Copiar {lastCode}
                </button>
              )}
            </div>
            {lastCode && (
              <div className="admin-code-highlight">
                <span>Último código generado</span>
                <code>{lastCode}</code>
                <button type="button" className="btn-ghost" onClick={() => copyCode(lastCode)} aria-label="Copiar código">
                  <Copy />
                </button>
              </div>
            )}
            <ul className="admin-list admin-codes">
              {config.codes.length === 0 && <li className="admin-empty">Todavía no hay códigos generados.</li>}
              {config.codes.map((entry) => {
                const state = instanceCodeState(entry)
                return (
                  <li className="admin-item admin-code" key={entry.id}>
                    <div className="admin-item-main">
                      <div className="admin-code-head">
                        <code>{entry.code}</code>
                        <span className={`admin-code-state ${state}`}>{instanceCodeStatusLabel(state)}</span>
                      </div>
                      <span>
                        {entry.maxUses === 0 ? `${entry.uses} instancias · ilimitadas` : `${entry.uses} / ${entry.maxUses} instancias`}
                        {' · '}
                        {entry.expiresAt ? `Caduca ${formatDate(entry.expiresAt)}` : 'No caduca'}
                      </span>
                      {entry.usedBy.length > 0 ? (
                        <details className="admin-code-used">
                          <summary>Usado por {entry.usedBy.length} usuario{entry.usedBy.length === 1 ? '' : 's'} para crear instancia{entry.usedBy.length === 1 ? '' : 's'}</summary>
                          <ul>
                            {entry.usedBy.map((use, index) => (
                              <li key={`${use.gamertag}-${index}`}>
                                <strong>{use.gamertag}</strong>
                                <span>{formatDate(use.at)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="admin-code-empty">Nadie lo ha usado todavía.</span>
                      )}
                    </div>
                    <div className="admin-code-actions">
                      <button type="button" className="btn-ghost" onClick={() => copyCode(entry.code)} aria-label={`Copiar ${entry.code}`} title="Copiar">
                        <Copy />
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => regenerateCode(entry)} aria-label={`Regenerar ${entry.code}`} title="Regenerar código">
                        <RefreshCw />
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => deleteCode(entry)} aria-label={`Eliminar ${entry.code}`} title="Eliminar código">
                        <Trash2 />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          {status && <p className={`admin-status ${status.error ? 'error' : ''}`}>{status.text}</p>}
          <p className="admin-status admin-saved-note">
            <Check /> Los cambios se aplican al instante y se sincronizan solos con los demás launchers en pocos segundos.
          </p>
        </div>
      </section>
    </div>
  )
}
