'use client'

import { useEffect, useMemo, useState } from 'react'

type SkinFaceProps = {
  gamertag?: string
  xuid?: string
  skinTextureUrl?: string
  localSkin?: string | null
  size?: number
  className?: string
  alt?: string
  refreshKey?: number
}

const CACHE_BUST = Date.now()

type HeadFaces = {
  front: string
  back: string
  left: string
  right: string
  top: string
  bottom: string
}

/**
 * Extrae las 6 caras de la cabeza desde una textura de skin de Minecraft
 * (formato 64×64). Cada cara compone también su capa exterior (layer/gorro).
 *
 *   Cara    base(x,y)  layer(x,y)
 *   Frente  (8,8)      (40,8)
 *   Atrás   (24,8)     (56,8)
 *   Derecha (0,8)      (32,8)   → derecha del personaje
 *   Izq.    (16,8)     (48,8)   → izquierda del personaje
 *   Arriba  (8,0)      (40,0)
 *   Abajo   (16,0)     (48,0)
 */
function extractHeadFaces(source: string): Promise<HeadFaces | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.width
        const unit = Math.round(w / 64) || 1
        const crop = (x: number, y: number) => {
          const canvas = document.createElement('canvas')
          const s = 8 * unit
          canvas.width = s
          canvas.height = s
          const ctx = canvas.getContext('2d')
          if (!ctx) return ''
          ctx.imageSmoothingEnabled = false
          // Capa base
          ctx.drawImage(img, x * unit, y * unit, s, s, 0, 0, s, s)
          // Capa exterior (hat/layer): +32px en X respecto a la base
          if (w >= 64) {
            ctx.drawImage(img, (x + 32) * unit, y * unit, s, s, 0, 0, s, s)
          }
          return canvas.toDataURL('image/png')
        }
        resolve({
          front: crop(8, 8),
          back: crop(24, 8),
          right: crop(16, 8),
          left: crop(0, 8),
          top: crop(8, 0),
          bottom: crop(16, 0),
        })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = source
  })
}

export function SkinFace({ gamertag, xuid, localSkin, size = 48, className, alt, refreshKey }: SkinFaceProps) {
  const [faces, setFaces] = useState<HeadFaces | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const sig = useMemo(() => `${gamertag || ''}|${xuid || ''}|${refreshKey || ''}`, [gamertag, xuid, refreshKey])
  const depth = Math.round(size / 2)

  useEffect(() => {
    let active = true
    setFaces(null)

    const run = async () => {
      // 1) Skin local (data URL): extracción directa, sin CORS.
      if (localSkin) {
        const result = await extractHeadFaces(localSkin)
        if (!active) return
        if (result) {
          setFaces(result)
          return
        }
      }
      // 2) APIs de skin: se intenta extraer; si CORS lo bloquea, se cae al avatar.
      const skinUrls: string[] = []
      if (xuid) skinUrls.push(`https://mc-api.io/skin/${xuid}`)
      if (gamertag) {
        skinUrls.push(`https://mc-heads.net/skin/${encodeURIComponent(gamertag)}`)
        skinUrls.push(`https://mc-api.io/skin/${encodeURIComponent(gamertag)}/BEDROCK`)
      }
      for (const url of skinUrls) {
        const result = await extractHeadFaces(url)
        if (!active) return
        if (result) {
          setFaces(result)
          return
        }
      }
      // 3) Fallback: avatar renderizado como cara frontal.
      const avatar = xuid
        ? `https://mc-api.io/render/FACE/${xuid}?size=128&t=${CACHE_BUST}`
        : gamertag
          ? `https://mc-heads.net/avatar/${encodeURIComponent(gamertag)}/128?t=${CACHE_BUST}`
          : 'https://mc-heads.net/avatar/Steve/128'
      if (active) setAvatarUrl(avatar)
    }

    void run()
    return () => {
      active = false
    }
  }, [localSkin, gamertag, xuid, sig])

  if (!gamertag && !xuid && !localSkin) {
    return (
      <span
        className={className}
        style={{ width: size, height: size, display: 'inline-block', borderRadius: 8, background: 'linear-gradient(135deg,#a950d8,#5b2a86)' }}
      />
    )
  }

  // Imágenes para cada cara (fallback: avatar en todas si no hay skin extraída).
  const faceImg = (key: keyof HeadFaces) => faces?.[key] || avatarUrl

  return (
    <div
      className={`skin-head-3d ${className || ''}`}
      style={{ width: size, height: size, ['--head-depth' as string]: `${depth}px` }}
      title={alt || `Skin de ${gamertag || 'jugador'}`}
    >
      <div className="skin-head-cube">
        <div className="skin-head-face skin-head-front"  style={{ backgroundImage: `url(${faceImg('front')})` }} />
        <div className="skin-head-face skin-head-back"   style={{ backgroundImage: `url(${faceImg('back')})` }} />
        <div className="skin-head-face skin-head-left"   style={{ backgroundImage: `url(${faceImg('left')})` }} />
        <div className="skin-head-face skin-head-right"  style={{ backgroundImage: `url(${faceImg('right')})` }} />
        <div className="skin-head-face skin-head-top"    style={{ backgroundImage: `url(${faceImg('top')})` }} />
        <div className="skin-head-face skin-head-bottom" style={{ backgroundImage: `url(${faceImg('bottom')})` }} />
      </div>
    </div>
  )
}
