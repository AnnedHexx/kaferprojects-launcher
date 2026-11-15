'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FileArchive,
  Globe,
  ImagePlus,
  Link2,
  Lock,
  Palette,
  Plus,
  Search,
  Server,
  Ticket,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import type { CustomServer, ServerAddon } from '@/lib/servers'
import { createAddonFileId, deleteAddonBlob, saveAddonBlob } from '@/lib/addon-store'
import { useClosing } from '@/lib/use-closing'
import { PlayProperties } from '@/components/play-customizer'
import { type PlayButtonConfig, normalizePlayButton } from '@/lib/play-button'
import { consumeInstanceCode, validateInstanceCode } from '@/lib/instance-codes'

const ADDON_EXTENSIONS = ['.mcaddon', '.mcpack']

function readImage(file: File, onDone: (dataUrl: string) => void, onError: (message: string) => void) {
  if (!file.type.startsWith('image/')) {
    onError('El archivo debe ser una imagen PNG, JPG o WEBP.')
    return
  }
  const reader = new FileReader()
  reader.onload = () => onDone(String(reader.result || ''))
  reader.onerror = () => onError('No se pudo leer la imagen.')
  reader.readAsDataURL(file)
}

export function formatBytes(bytes?: number): string {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function packName(fileName?: string, fallback?: string): string {
  if (fileName) return fileName.replace(/\.(mcaddon|mcpack)$/i, '')
  return fallback || 'Pack'
}

export function ServerAddModal({
  onClose,
  onAdd,
  onUpdate,
  initial,
  isAdmin,
  gamertag,
  onPreviewButton,
  previewControlRef,
}: {
  onClose: () => void
  onAdd: (server: CustomServer) => void
  onUpdate?: (server: CustomServer) => void
  initial?: CustomServer | null
  securityConfirmations: boolean
  isAdmin?: boolean
  gamertag?: string
  /** Muestra el botón JUGAR del menú con el diseño que se está editando. */
  onPreviewButton?: (preview: { config: PlayButtonConfig; fallbackColor: string } | null) => void
  /** Permite que el menú actualice la posición del botón al arrastrarlo. */
  previewControlRef?: React.MutableRefObject<React.Dispatch<React.SetStateAction<PlayButtonConfig>> | null>
}) {
  const { closing, requestClose } = useClosing(onClose)
  const editing = Boolean(initial)
  const [error, setError] = useState('')
  const [name, setName] = useState(initial?.name || '')
  const [ip, setIp] = useState(initial?.ip || '')
  const [port, setPort] = useState(initial?.port || '19132')
  const [banner, setBanner] = useState(initial?.banner || '')
  const [icon, setIcon] = useState(initial?.icon || '')
  const [background, setBackground] = useState(initial?.background || '')
  const [buttonColor, setButtonColor] = useState(initial?.buttonColor || '#7F49B4')
  const [buttonColorHex, setButtonColorHex] = useState(initial?.buttonColor || '#7F49B4')
  const [isPrivate, setIsPrivate] = useState(initial?.private || false)
  const [button, setButton] = useState<PlayButtonConfig>(() => normalizePlayButton(initial?.button))
  const [showButtonEditor, setShowButtonEditor] = useState(false)
  const [description, setDescription] = useState(initial?.description || '')
  const [packs, setPacks] = useState<ServerAddon[]>(() =>
    Array.isArray(initial?.addons) && initial.addons.length > 0
      ? initial.addons
      : initial?.addon
        ? [initial.addon]
        : [],
  )
  const [packBusy, setPackBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<{ port: number; motd?: string; players?: number; maxPlayers?: number; version?: string; offline?: boolean }[] | null>(null)
  const [scanError, setScanError] = useState('')
  const requiresCode = !editing && !isAdmin
  const [step, setStep] = useState<'code' | 'form'>(requiresCode ? 'code' : 'form')
  const [instanceCode, setInstanceCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [validatedCode, setValidatedCode] = useState<{ id: string; code: string } | null>(null)

  // Archivos que se han escrito en IndexedDB durante esta sesión del modal.
  const createdFileIds = useRef<string[]>([])
  // Packs eliminados que hay que borrar del almacén al guardar.
  const removedFileIds = useRef<string[]>([])

  // Vista previa en vivo: mientras se edita, el botón JUGAR del menú usa este diseño.
  useEffect(() => {
    onPreviewButton?.(showButtonEditor ? { config: button, fallbackColor: buttonColor } : null)
    return () => onPreviewButton?.(null)
  }, [showButtonEditor, button, buttonColor, onPreviewButton])

  // El menú puede mover el botón mientras se arrastra en la vista previa.
  useEffect(() => {
    if (!previewControlRef) return
    previewControlRef.current = showButtonEditor ? setButton : null
    return () => {
      previewControlRef.current = null
    }
  }, [showButtonEditor, previewControlRef])

  const BUTTON_PRESETS = ['#7F49B4', '#A57FC4', '#5B2E86', '#CFCFCF', '#E05C8A', '#49B47F', '#4A90D9']

  function applyButtonColor(value: string) {
    const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
    if (!match) {
      setButtonColorHex(buttonColor)
      return
    }
    const hex = `#${match[1].toLowerCase()}`
    setButtonColor(hex)
    setButtonColorHex(hex)
  }

  function discardCreatedFiles() {
    for (const id of createdFileIds.current) void deleteAddonBlob(id)
    createdFileIds.current = []
  }

  function handleClose() {
    discardCreatedFiles()
    requestClose()
  }

  async function addPackFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    const accepted: File[] = []
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase()
      if (!ADDON_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
        setError(`"${file.name}" no es válido. Solo se aceptan .mcaddon y .mcpack.`)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return

    setPackBusy(true)
    try {
      const next: ServerAddon[] = []
      for (const file of accepted) {
        const id = createAddonFileId()
        await saveAddonBlob(id, file)
        createdFileIds.current.push(id)
        next.push({
          fileId: id,
          fileName: file.name,
          size: file.size,
          name: packName(file.name),
          version: '1',
        })
      }
      setPacks((current) => [...current, ...next])
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : 'No se pudieron guardar los packs.')
    } finally {
      setPackBusy(false)
    }
  }

  function removePack(index: number) {
    setPacks((current) => {
      const pack = current[index]
      if (!pack) return current
      if (pack.fileId) {
        const wasCreatedNow = createdFileIds.current.includes(pack.fileId)
        if (wasCreatedNow) {
          createdFileIds.current = createdFileIds.current.filter((id) => id !== pack.fileId)
          void deleteAddonBlob(pack.fileId)
        } else {
          removedFileIds.current.push(pack.fileId)
        }
      }
      return current.filter((_, position) => position !== index)
    })
  }

  async function detectPort() {
    const host = ip.trim()
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
      setScanError('Escribe primero la IP o dominio de la instancia.')
      return
    }
    setScanError('')
    setScanResults(null)
    setScanning(true)
    try {
      const result = await window.ekoLauncher?.discoverServer?.({ host })
      const servers = result?.servers || []
      setScanResults(servers)
      if (servers.length === 0) {
        setScanError('No encontré ninguna instancia Bedrock en ese host. Revisa la IP o copia el puerto exacto del panel.')
      } else if (servers.length === 1) {
        setPort(String(servers[0].port))
      }
    } catch {
      setScanError('No se pudo completar la búsqueda.')
    } finally {
      setScanning(false)
    }
  }

  function confirmCode() {
    const check = validateInstanceCode(instanceCode)
    if (!check.ok) {
      setCodeError(check.message)
      return
    }
    setValidatedCode({ id: check.codeId || '', code: instanceCode.trim().toUpperCase() })
    setCodeError('')
    setError('')
    setStep('form')
  }

  function submit() {
    if (!name.trim()) {
      setError('Ponle un nombre a la instancia.')
      return
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(ip.trim())) {
      setError('Introduce una IP o dominio válido (sin espacios).')
      return
    }
    const portNumber = Number(port)
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError('El puerto debe estar entre 1 y 65535.')
      return
    }

    let instanceCodeId = ''
    if (requiresCode) {
      const check = validateInstanceCode(validatedCode?.code || '')
      if (!check.ok) {
        setStep('code')
        setCodeError(check.message)
        return
      }
      instanceCodeId = check.codeId || validatedCode?.id || ''
    }

    const cleanPacks = packs.filter((pack) => pack.fileId || pack.url)
    for (const fileId of removedFileIds.current) void deleteAddonBlob(fileId)
    createdFileIds.current = []

    const payload = {
      name: name.trim(),
      ip: ip.trim(),
      port: String(portNumber),
      banner: banner.trim(),
      icon: icon.trim(),
      background: background.trim(),
      description: description.trim(),
      buttonColor: buttonColor.toLowerCase(),
      button,
      addons: cleanPacks,
      addon: cleanPacks[0],
      private: isPrivate,
    }

    if (editing && initial) {
      onUpdate?.({ ...initial, ...payload })
      requestClose()
      return
    }
    onAdd({
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      available: true,
      ...payload,
    })
    if (instanceCodeId) consumeInstanceCode(instanceCodeId, gamertag || '')
    requestClose()
  }

  // Mientras se personaliza el botón, se oculta el creador para ver el menú real.
  if (showButtonEditor) {
    return createPortal(
      <div className="play-props-layer" onClick={(event) => event.stopPropagation()}>
        <PlayProperties
          config={button}
          onChange={setButton}
          onClose={() => setShowButtonEditor(false)}
          fallbackColor={buttonColor}
          contextLabel={name.trim() || initial?.name || 'Nueva instancia'}
        />
      </div>,
      document.body,
    )
  }

  // Paso previo para usuarios sin admin: validar el código antes de crear la instancia.
  if (requiresCode && step === 'code') {
    return (
      <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={handleClose}>
        <section
          className="server-add-modal instance-code-gate"
          onClick={(event) => event.stopPropagation()}
          aria-label="Código para crear instancia"
        >
          <header className="instance-head">
            <div>
              <div className="modal-kicker">KAFERPROJECTS / PASO 1 DE 2</div>
              <h1>Crear instancia</h1>
              <p>Escribe el código que te dio un administrador. Después podrás rellenar los datos de tu instancia.</p>
            </div>
            <button className="modal-close instance-close" onClick={handleClose} aria-label="Cerrar">
              <X />
            </button>
          </header>

          <div className="instance-body">
            <section className="instance-section instance-code-section">
              <header className="instance-section-head">
                <Ticket />
                <div>
                  <strong>Código para crear instancia</strong>
                  <span>Cada código tiene una duración y un número máximo de instancias.</span>
                </div>
              </header>
              <label className="server-field">
                <span>Código</span>
                <div className="input-wrap">
                  <Ticket />
                  <input
                    autoFocus
                    value={instanceCode}
                    onChange={(event) => {
                      setInstanceCode(event.target.value.toUpperCase())
                      setCodeError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmCode()
                    }}
                    placeholder="XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={32}
                    aria-required="true"
                  />
                </div>
              </label>
              {codeError && <p className="settings-error">{codeError}</p>}
              <p className="server-addon-hint">
                Si no tienes código, pídeselo a un administrador de KaferProjects.
              </p>
            </section>
          </div>

          <footer className="instance-actions">
            <div>
              <button className="btn-ghost" onClick={handleClose}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmCode}>
                <Ticket /> Continuar
              </button>
            </div>
          </footer>
        </section>
      </div>
    )
  }

  return (
    <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={handleClose}>
      <section className="server-add-modal" onClick={(event) => event.stopPropagation()} aria-label="Añadir instancia">
        <header className="instance-head">
          <div>
            <div className="modal-kicker">
              {requiresCode ? 'KAFERPROJECTS / PASO 2 DE 2' : 'KAFERPROJECTS / INSTANCIA'}
            </div>
            <h1>{editing ? 'Editar instancia' : 'Nueva instancia'}</h1>
            <p>
              {editing
                ? `${initial?.name} · los cambios se guardan al confirmar`
                : 'Rellena los datos de conexión y, si quieres, añade packs.'}
            </p>
          </div>
          <button className="modal-close instance-close" onClick={handleClose} aria-label="Cerrar">
            <X />
          </button>
        </header>

        <div className="instance-body">
          <section className="instance-section">
            <header className="instance-section-head">
              <Server />
              <div>
                <strong>Conexión</strong>
                <span>Nombre, IP y puerto de la instancia</span>
              </div>
            </header>

            <label className="server-field">
              <span>Nombre de la instancia</span>
              <div className="input-wrap">
                <Server />
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mi instancia de BedWars" />
              </div>
            </label>

            <div className="server-field-row">
              <label className="server-field">
                <span>IP o dominio</span>
                <div className="input-wrap">
                  <Link2 />
                  <input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="play.miInstancia.net" />
                </div>
              </label>
              <label className="server-field small">
                <span>Puerto</span>
                <div className="input-wrap">
                  <input value={port} onChange={(event) => setPort(event.target.value)} placeholder="19132" inputMode="numeric" />
                </div>
              </label>
            </div>

            <div className="server-port-detect">
              <button type="button" className="btn-ghost" onClick={detectPort} disabled={scanning}>
                <Search /> {scanning ? 'Buscando puertos…' : 'Detectar puerto automáticamente'}
              </button>
              {scanning && <p className="settings-hint">Revisando todos los puertos del host. Tarda unos 15 segundos.</p>}
              {scanError && <p className="settings-error">{scanError}</p>}
              {scanResults && scanResults.length > 0 && (
                <div className="port-results">
                  {scanResults.map((item) => (
                    <button
                      type="button"
                      key={item.port}
                      className={`port-result ${String(item.port) === String(port) ? 'active' : ''}`}
                      onClick={() => setPort(String(item.port))}
                      title={item.motd || ''}
                    >
                      <b>:{item.port}</b>
                      <span>{item.motd || 'Instancia Bedrock'}</span>
                      <em>{item.maxPlayers ? `${item.players || 0}/${item.maxPlayers}` : item.version || ''}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="server-visibility">
              <button
                type="button"
                className={`visibility-btn ${!isPrivate ? 'active' : ''}`}
                onClick={() => setIsPrivate(false)}
              >
                <Globe /> <strong>Pública</strong>
                <span>Visible para todos los usuarios</span>
              </button>
              <button
                type="button"
                className={`visibility-btn ${isPrivate ? 'active' : ''}`}
                onClick={() => setIsPrivate(true)}
              >
                <Lock /> <strong>Privada</strong>
                <span>Solo visible para ti</span>
              </button>
            </div>
          </section>

          <section className="instance-section">
            <header className="instance-section-head">
              <ImagePlus />
              <div>
                <strong>Apariencia</strong>
                <span>Banner, icono y fondo de la instancia</span>
              </div>
            </header>

            <div className="server-assets">
              <div className="server-asset">
                <span>Banner</span>
                <div className="server-asset-preview banner">{banner ? <img src={banner} alt="Banner de la instancia" /> : <ImagePlus />}</div>
                <label className="btn-ghost server-upload">
                  <Upload /> Subir banner
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) readImage(file, setBanner, setError)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
              <div className="server-asset">
                <span>Icono</span>
                <div className="server-asset-preview icon">{icon ? <img src={icon} alt="Icono de la instancia" /> : <ImagePlus />}</div>
                <label className="btn-ghost server-upload">
                  <Upload /> Subir icono
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) readImage(file, setIcon, setError)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
              <div className="server-asset">
                <span>Fondo</span>
                <div className="server-asset-preview banner">{background ? <img src={background} alt="Fondo de la instancia" /> : <ImagePlus />}</div>
                <label className="btn-ghost server-upload">
                  <Upload /> Subir fondo
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) readImage(file, setBackground, setError)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          </section>

          {isAdmin && (
          <section className="instance-section">
            <header className="instance-section-head">
              <Palette />
              <div>
                <strong>Color base del botón JUGAR</strong>
                <span>Se usa si no eliges un color principal en el personalizador</span>
              </div>
            </header>

            <div className="instance-color-row">
              <input
                type="color"
                className="instance-color-input"
                value={buttonColor}
                onChange={(event) => {
                  setButtonColor(event.target.value.toLowerCase())
                  setButtonColorHex(event.target.value.toLowerCase())
                }}
                aria-label="Elegir color del botón de la instancia"
              />
              <label className="server-field">
                <span>Código hexadecimal</span>
                <div className="input-wrap">
                  <input
                    value={buttonColorHex}
                    onChange={(event) => setButtonColorHex(event.target.value)}
                    onBlur={() => applyButtonColor(buttonColorHex)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyButtonColor(buttonColorHex)
                    }}
                    placeholder="#7F49B4"
                    maxLength={7}
                  />
                </div>
              </label>
            </div>
            <div className="instance-color-presets">
              {BUTTON_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={buttonColor.toLowerCase() === color.toLowerCase() ? 'selected' : ''}
                  style={{ background: color }}
                  onClick={() => {
                    setButtonColor(color.toLowerCase())
                    setButtonColorHex(color.toLowerCase())
                  }}
                  aria-label={`Usar color ${color}`}
                  title={color}
                />
              ))}
            </div>
          </section>
          )}

          <section className="instance-section instance-packs">
            <header className="instance-section-head">
              <FileArchive />
              <div>
                <strong>Packs de la instancia</strong>
                <span>Opcional · .mcaddon y .mcpack · varios permitidos</span>
              </div>
            </header>

            {packs.length > 0 && (
              <ul className="pack-list">
                {packs.map((pack, index) => (
                  <li key={`${pack.fileId || pack.url}-${index}`} className="pack-item">
                    <FileArchive />
                    <div className="pack-item-text">
                      <strong title={pack.fileName || pack.name}>{pack.fileName || pack.name || 'Pack'}</strong>
                      <span>{formatBytes(pack.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="pack-item-remove"
                      onClick={() => removePack(index)}
                      aria-label={`Quitar ${pack.fileName || pack.name || 'pack'}`}
                      title="Quitar pack"
                    >
                      <Trash2 />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label className="pack-add">
              <Plus />
              <div>
                <strong>{packBusy ? 'Guardando packs…' : 'Añadir pack'}</strong>
                <span>Solo .mcaddon o .mcpack · sin límite de tamaño</span>
              </div>
              <input
                type="file"
                accept=".mcaddon,.mcpack"
                multiple
                hidden
                disabled={packBusy}
                onChange={(event) => {
                  void addPackFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>

            <p className="server-addon-hint">
              El botón JUGAR se convierte en DESCARGAR hasta que el jugador tenga todos los packs instalados.
            </p>
          </section>

          {error && <p className="settings-error">{error}</p>}
        </div>

        <footer className="instance-actions">
          {isAdmin && (
            <button type="button" className="instance-customize" onClick={() => setShowButtonEditor(true)}>
              <Wand2 /> Personalizar botón JUGAR
            </button>
          )}
          <div>
            <button className="btn-ghost" onClick={handleClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={submit}>
              {editing ? 'Guardar cambios' : (<><Plus /> Añadir instancia</>)}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
