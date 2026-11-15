'use client'

import { hasFallingParticles, playButtonColors, type PlayButtonConfig } from '@/lib/play-button'
import { playFontBoost, playFontClass, playFontStack } from '@/lib/play-fonts'

/**
 * Contenido visual del botón JUGAR: lluvia/confeti, imagen o GIF, y el texto
 * con la tipografía elegida. Se usa tanto en el launcher como en la vista
 * previa del personalizador.
 */
export function PlayButtonFace({
  config,
  fallbackColor = '',
  children,
}: {
  config: PlayButtonConfig
  fallbackColor?: string
  children: React.ReactNode
}) {
  const colors = playButtonColors(config, fallbackColor)
  const falling = hasFallingParticles(config.animation)

  return (
    <>
      <span className="play-fx" aria-hidden="true">
        {falling &&
          colors.slice(1).map((color, index) => (
            <i
              key={index}
              className={config.animation === 'confetti' ? 'is-confetti' : ''}
              style={{
                background: color,
                left: `${7 + index * 23}%`,
                animationDelay: `${index * 0.26}s`,
                animationDuration: `${1.15 + index * 0.18}s`,
              }}
            />
          ))}
        {(config.animation === 'shine' || config.animation === 'neon' || config.animation === 'pulse') && (
          <span className="play-glow" />
        )}
      </span>
      {config.image && (
        <span
          className="play-media"
          style={{
            backgroundImage: `url("${config.image}")`,
            backgroundSize: config.imageFit,
            opacity: config.imageOpacity,
          }}
        />
      )}
      <span
        className={`play-label ${playFontClass(config.font)}`}
        style={{
          fontFamily: playFontStack(config.font),
          fontSize: `${config.fontSize * playFontBoost(config.font)}em`,
          color: config.textColor || undefined,
        }}
      >
        {children}
      </span>
    </>
  )
}
