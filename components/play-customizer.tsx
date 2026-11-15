'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Crosshair,
  Hash,
  ImagePlus,
  Move,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  type PlayButtonConfig,
  defaultPlayButton,
  hasFallingParticles,
  normalizePlayColor,
  playButtonClassName,
  playButtonColors,
  playButtonStyle,
} from '@/lib/play-button'
import { PLAY_ANIMATIONS } from '@/lib/play-animations'
import { PLAY_FONT_OPTIONS, playFontClass, playFontStack } from '@/lib/play-fonts'
import { PlayButtonFace } from './play-button-face'

const PRESETS = ['#7F49B4', '#A57FC4', '#5B2E86', '#CFCFCF', '#141414', '#E05C8A', '#49B47F', '#4A90D9', '#F2C14E', '#FF5D5D']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizePlayColor(hex) || '#7f49b4'
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsv(r: number, g: number, b: number) {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6
    else if (max === gg) h = (bb - rr) / delta + 2
    else h = (rr - gg) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s
  const hp = (h % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string
  fallback: string
  onChange: (color: string) => void
}) {
  const [text, setText] = useState(value || fallback)
  useEffect(() => {
    setText(value || fallback)
  }, [value, fallback])

  function apply(raw: string) {
    const clean = normalizePlayColor(raw)
    if (!clean) {
      setText(value || fallback)
      return
    }
    setText(clean)
    onChange(clean)
  }

  return (
    <div className="play-color-row">
      <span className="play-color-label">{label}</span>
      <input
        type="color"
        className="play-color-input"
        value={value || fallback}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        aria-label={`${label}: elegir color`}
      />
      <input
        className="play-color-hex"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => apply(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply(text)
        }}
        maxLength={7}
        aria-label={`${label}: código hexadecimal`}
      />
      <div className="play-color-presets">
        {PRESETS.slice(0, 6).map((color) => (
          <button
            key={color}
            type="button"
            style={{ background: color }}
            onClick={() => apply(color)}
            aria-label={`${label}: usar ${color}`}
            title={color}
          />
        ))}
      </div>
    </div>
  )
}

export function PlayProperties({
  config,
  onChange,
  onClose,
  fallbackColor = '',
  contextLabel,
}: {
  config: PlayButtonConfig
  onChange: (next: PlayButtonConfig) => void
  onClose: () => void
  /** Color base de la instancia, usado cuando el color principal está vacío. */
  fallbackColor?: string
  /** Nombre de la instancia que se está personalizando. */
  contextLabel?: string
}) {
  const effectiveColor = config.color || fallbackColor || '#7F49B4'
  const [hex, setHex] = useState(effectiveColor)
  const [error, setError] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [fontQuery, setFontQuery] = useState('')
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const dialRef = useRef<HTMLDivElement | null>(null)

  const rgb = hexToRgb(effectiveColor)
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const animation = PLAY_ANIMATIONS.find((item) => item.id === config.animation) || PLAY_ANIMATIONS[0]

  useEffect(() => {
    setHex(effectiveColor)
  }, [effectiveColor])

  const applyColor = (value: string) => {
    const clean = normalizePlayColor(value)
    if (!clean) return false
    setHex(clean)
    onChange({ ...config, color: clean })
    return true
  }

  const pickFromWheel = (clientX: number, clientY: number) => {
    const element = wheelRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    const radius = rect.width / 2
    const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius)
    let hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (hue < 0) hue += 360
    const saturation = Math.min(1, distance * 1.02)
    const next = hsvToRgb(hue, saturation, Math.max(hsv.v, 0.45))
    const nextHex = rgbToHex(next.r, next.g, next.b)
    setError('')
    setHex(nextHex)
    onChange({ ...config, color: nextHex })
  }

  const pickRotation = (clientX: number, clientY: number) => {
    const element = dialRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    let degrees = (Math.atan2(dx, -dy) * 180) / Math.PI
    degrees = Math.round(degrees)
    onChange({ ...config, rotation: clamp(degrees, -180, 180) })
  }

  function readMedia(file: File) {
    if (!file.type.startsWith('image/')) {
      setMediaError('El archivo debe ser una imagen PNG, JPG, WEBP o GIF.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setMediaError('')
      onChange({ ...config, image: String(reader.result || '') })
    }
    reader.onerror = () => setMediaError('No se pudo leer la imagen.')
    reader.readAsDataURL(file)
  }

  const filteredFonts = useMemo(() => {
    const query = fontQuery.trim().toLowerCase()
    if (!query) return PLAY_FONT_OPTIONS
    return PLAY_FONT_OPTIONS.filter(
      (font) => font.label.toLowerCase().includes(query) || font.category.toLowerCase().includes(query),
    )
  }, [fontQuery])

  const fontGroups = useMemo(() => {
    const groups: { category: string; fonts: typeof PLAY_FONT_OPTIONS }[] = []
    for (const font of filteredFonts) {
      let group = groups.find((item) => item.category === font.category)
      if (!group) {
        group = { category: font.category, fonts: [] }
        groups.push(group)
      }
      group.fonts.push(font)
    }
    return groups
  }, [filteredFonts])

  const rotationAngle = ((config.rotation % 360) + 360) % 360
  const previewStyle = playButtonStyle(config, fallbackColor, false)

  return (
    <aside className="play-props" aria-label="Propiedades del botón JUGAR">
      <header className="play-props-head">
        <div>
          <span className="play-props-kicker">PROPIEDADES · SOLO ESTA INSTANCIA</span>
          <strong>Botón JUGAR</strong>
          {contextLabel && <span className="play-props-context">{contextLabel}</span>}
        </div>
        <button type="button" className="play-props-close" onClick={onClose} aria-label="Salir de la edición">
          <X />
        </button>
      </header>

      <div className="play-props-body">
        <div className="play-props-preview">
          <span className={playButtonClassName(config, 'play-preview')} style={previewStyle}>
            <PlayButtonFace config={config} fallbackColor={fallbackColor}>
              JUGAR
            </PlayButtonFace>
          </span>
        </div>

        <section className="play-props-block">
          <header>
            <Palette />
            <div>
              <strong>Color principal</strong>
              <span>Elige en el círculo o escribe el código</span>
            </div>
          </header>

          <div className="play-props-color">
            <div
              ref={wheelRef}
              className="play-wheel"
              role="slider"
              aria-label="Círculo cromático"
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={Math.round(hsv.h)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                pickFromWheel(event.clientX, event.clientY)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  pickFromWheel(event.clientX, event.clientY)
                }
              }}
              onPointerUp={(event) => {
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                } catch {}
              }}
            >
              <div
                className="play-wheel-marker"
                style={{
                  transform: `rotate(${hsv.h}deg) translateY(-${Math.round(24 + hsv.s * 36)}px)`,
                }}
              />
              <div className="play-wheel-preview" style={{ background: effectiveColor }} />
            </div>

            <div className="play-props-codes">
              <label className="play-props-hex">
                <Hash />
                <input
                  value={hex}
                  onChange={(event) => setHex(event.target.value)}
                  onBlur={() => {
                    if (!applyColor(hex)) setError('Escribe un hexadecimal válido, por ejemplo #7F49B4.')
                    else setError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    if (!applyColor(hex)) setError('Escribe un hexadecimal válido, por ejemplo #7F49B4.')
                    else setError('')
                  }}
                  placeholder="#7F49B4"
                  maxLength={7}
                  aria-label="Código hexadecimal"
                />
              </label>
              <div className="play-props-swatches" aria-label="Colores rápidos">
                {PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={effectiveColor.toLowerCase() === color.toLowerCase() ? 'selected' : ''}
                    style={{ background: color }}
                    onClick={() => {
                      setError('')
                      setHex(color)
                      onChange({ ...config, color: color.toLowerCase() })
                    }}
                    aria-label={`Usar color ${color}`}
                    title={color}
                  />
                ))}
              </div>
              <dl className="play-props-rgb">
                <div><dt>R</dt><dd>{Math.round(rgb.r)}</dd></div>
                <div><dt>G</dt><dd>{Math.round(rgb.g)}</dd></div>
                <div><dt>B</dt><dd>{Math.round(rgb.b)}</dd></div>
              </dl>
              {error && <p className="settings-error">{error}</p>}
              <button
                type="button"
                className="play-props-reset"
                onClick={() => {
                  setError('')
                  onChange({ ...config, color: '' })
                }}
              >
                <Undo2 /> Usar color de la instancia
              </button>
            </div>
          </div>
        </section>

        <section className="play-props-block">
          <header>
            <Sparkles />
            <div>
              <strong>Animación de color</strong>
              <span>{animation.label} · {animation.description}</span>
            </div>
          </header>

          <div className="play-anim-grid">
            {PLAY_ANIMATIONS.map((item) => {
              const selected = config.animation === item.id
              const sample = { ...config, animation: item.id }
              const swatch = playButtonStyle(sample, fallbackColor, false)
              const colors = playButtonColors(sample, fallbackColor)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`play-anim-option ${selected ? 'selected' : ''}`}
                  onClick={() => onChange({ ...config, animation: item.id })}
                  title={item.description}
                >
                  <span className={`play-anim-swatch play-anim-${item.id}`} style={swatch} aria-hidden="true">
                    {hasFallingParticles(item.id) && (
                      <span className="play-fx">
                        {colors.slice(1).map((color, index) => (
                          <i
                            key={index}
                            className={item.id === 'confetti' ? 'is-confetti' : ''}
                            style={{
                              background: color,
                              left: `${7 + index * 23}%`,
                              animationDelay: `${index * 0.26}s`,
                              animationDuration: `${1.15 + index * 0.18}s`,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                  <strong>{item.label}</strong>
                </button>
              )
            })}
          </div>

          {animation.colors > 1 && (
            <div className="play-color-list">
              <ColorField
                label="Secundario"
                value={config.color2}
                fallback={defaultPlayButton.color2}
                onChange={(color) => onChange({ ...config, color2: color })}
              />
              {animation.colors >= 4 && (
                <ColorField
                  label="Tercero"
                  value={config.color3}
                  fallback={defaultPlayButton.color3}
                  onChange={(color) => onChange({ ...config, color3: color })}
                />
              )}
              {animation.colors >= 4 && (
                <ColorField
                  label="Cuarto"
                  value={config.color4}
                  fallback={defaultPlayButton.color4}
                  onChange={(color) => onChange({ ...config, color4: color })}
                />
              )}
              {animation.colors >= 5 && (
                <ColorField
                  label="Quinto"
                  value={config.color5}
                  fallback={defaultPlayButton.color5}
                  onChange={(color) => onChange({ ...config, color5: color })}
                />
              )}
            </div>
          )}
        </section>

        <section className="play-props-block">
          <header>
            <ImagePlus />
            <div>
              <strong>Imagen o GIF</strong>
              <span>Se dibuja dentro del botón · hasta 700 KB</span>
            </div>
          </header>

          <div className="play-media-editor">
            <div
              className="play-media-preview"
              style={
                config.image
                  ? { backgroundImage: `url("${config.image}")`, backgroundSize: config.imageFit }
                  : undefined
              }
            >
              {!config.image && <ImagePlus />}
            </div>
            <div className="play-media-actions">
              <label className="play-props-reset play-media-upload">
                <Upload /> {config.image ? 'Cambiar imagen' : 'Subir imagen o GIF'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) readMedia(file)
                    event.target.value = ''
                  }}
                />
              </label>
              {config.image && (
                <button
                  type="button"
                  className="play-props-reset"
                  onClick={() => onChange({ ...config, image: '' })}
                >
                  <Trash2 /> Quitar
                </button>
              )}
            </div>
          </div>

          {config.image && (
            <>
              <label className="play-range">
                <span>Opacidad <b>{Math.round(config.imageOpacity * 100)}%</b></span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(config.imageOpacity * 100)}
                  onChange={(event) => onChange({ ...config, imageOpacity: Number(event.target.value) / 100 })}
                />
              </label>
              <div className="play-fit-toggle">
                <button
                  type="button"
                  className={config.imageFit === 'cover' ? 'selected' : ''}
                  onClick={() => onChange({ ...config, imageFit: 'cover' })}
                >
                  Cubrir
                </button>
                <button
                  type="button"
                  className={config.imageFit === 'contain' ? 'selected' : ''}
                  onClick={() => onChange({ ...config, imageFit: 'contain' })}
                >
                  Contener
                </button>
              </div>
            </>
          )}
          {mediaError && <p className="settings-error">{mediaError}</p>}
        </section>

        <section className="play-props-block">
          <header>
            <Type />
            <div>
              <strong>Tipografía</strong>
              <span>{PLAY_FONT_OPTIONS.length} estilos · pixel, gaming, fantasía y más</span>
            </div>
          </header>

          <label className="play-font-search">
            <Search />
            <input
              value={fontQuery}
              onChange={(event) => setFontQuery(event.target.value)}
              placeholder="Buscar tipografía (Minecraft, pixel, terror…)"
              aria-label="Buscar tipografía"
            />
          </label>

          <label className="play-range">
            <span>Tamaño del texto <b>{Math.round(config.fontSize * 100)}%</b></span>
            <input
              type="range"
              min={60}
              max={170}
              value={Math.round(config.fontSize * 100)}
              onChange={(event) => onChange({ ...config, fontSize: Number(event.target.value) / 100 })}
            />
          </label>

          <ColorField
            label="Color del texto"
            value={config.textColor}
            fallback="#FFFFFF"
            onChange={(color) => onChange({ ...config, textColor: color })}
          />
          {config.textColor && (
            <button
              type="button"
              className="play-props-reset"
              onClick={() => onChange({ ...config, textColor: '' })}
            >
              <Undo2 /> Texto blanco automático
            </button>
          )}

          <div className="play-font-list">
            {fontGroups.map((group) => (
              <div key={group.category} className="play-font-group">
                <span className="play-font-category">{group.category}</span>
                <div className="play-font-grid">
                  {group.fonts.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      className={`play-font-option ${config.font === font.id ? 'selected' : ''}`}
                      onClick={() => onChange({ ...config, font: font.id })}
                      title={font.label}
                    >
                      <b className={playFontClass(font.id)} style={{ fontFamily: playFontStack(font.id) }}>
                        JUGAR
                      </b>
                      <span>{font.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {fontGroups.length === 0 && <p className="settings-hint">No hay tipografías con ese nombre.</p>}
          </div>
        </section>

        <section className="play-props-block">
          <header>
            <RotateCcw />
            <div>
              <strong>Rotación</strong>
              <span>Gira solo con el círculo</span>
            </div>
          </header>

          <div className="play-props-rotation">
            <div
              ref={dialRef}
              className="play-dial"
              role="slider"
              aria-label="Rotación del botón"
              aria-valuemin={-180}
              aria-valuemax={180}
              aria-valuenow={config.rotation}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                pickRotation(event.clientX, event.clientY)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  pickRotation(event.clientX, event.clientY)
                }
              }}
              onPointerUp={(event) => {
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                } catch {}
              }}
            >
              <span className="play-dial-ticks" />
              <span className="play-dial-handle" style={{ transform: `rotate(${rotationAngle}deg)` }}>
                <i />
              </span>
              <b>{config.rotation}°</b>
            </div>
            <button type="button" className="play-props-reset" onClick={() => onChange({ ...config, rotation: 0 })}>
              <Undo2 /> Restablecer rotación
            </button>
          </div>
        </section>

        <section className="play-props-block">
          <header>
            <Move />
            <div>
              <strong>Posición</strong>
              <span>Arrastra el botón o ajusta con los deslizadores</span>
            </div>
          </header>

          <label className="play-range">
            <span>Horizontal <b>{config.x} px</b></span>
            <input
              type="range"
              min={-900}
              max={900}
              value={config.x}
              onChange={(event) => onChange({ ...config, x: Number(event.target.value) })}
            />
          </label>
          <label className="play-range">
            <span>Vertical <b>{config.y} px</b></span>
            <input
              type="range"
              min={-600}
              max={600}
              value={config.y}
              onChange={(event) => onChange({ ...config, y: Number(event.target.value) })}
            />
          </label>
          <button
            type="button"
            className="play-props-reset"
            onClick={() => onChange({ ...config, x: 0, y: 0 })}
          >
            <Crosshair /> Centrar en 0, 0
          </button>
        </section>
      </div>

      <footer className="play-props-foot">
        <button type="button" className="btn-ghost" onClick={() => onChange({ ...defaultPlayButton })}>
          <Undo2 /> Restablecer todo
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          Listo
        </button>
      </footer>
    </aside>
  )
}
