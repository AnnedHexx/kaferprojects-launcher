const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const SPRITE = 'assets/eko_emojis_transparent.png'
const OUT_DIR = 'public/emoji'
const PREVIEW = 'assets/emoji-preview.png'
const CATALOG = 'lib/emoji-catalog.ts'
const GRID = 20
const CELL = 88
const STRIDE = 80
const OFFSET = 80
const CONTENT = 72
const PACKS = 5
const PACK_SIZE = GRID / PACKS

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const { data, info } = await sharp(SPRITE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== GRID * CELL || info.height !== GRID * CELL) {
    throw new Error(`Sprite inesperado ${info.width}x${info.height}, se esperaba ${GRID * CELL}x${GRID * CELL}`)
  }

  const entries = []
  let nonEmpty = 0

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const index = row * GRID + col
      const id = `eko-${String(index + 1).padStart(3, '0')}`
      // Cada emoji ocupa 72x72 px con un paso de 80 px; se recorta 88x88 con 8 px de margen.
      const left = OFFSET + col * STRIDE
      const top = OFFSET + row * STRIDE

      // Solo se generan celdas con contenido real (evita recortes vacíos en el selector).
      let hasContent = false
      for (let y = 0; y < CELL && !hasContent; y++) {
        for (let x = 0; x < CELL; x++) {
          const alpha = data[((top + y) * info.width + (left + x)) * 4 + 3]
          if (alpha > 12) {
            hasContent = true
            break
          }
        }
      }
      if (!hasContent) continue
      nonEmpty++

      const file = `${id}.png`
      await sharp(SPRITE)
        .extract({ left, top, width: CELL, height: CELL })
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT_DIR, file))

      const pack = Math.floor(row / PACK_SIZE) + 1
      entries.push({
        id,
        file,
        row: row + 1,
        col: col + 1,
        category: `Pack ${pack}`,
        label: `Emoji ${String(index + 1).padStart(3, '0')}`,
      })
    }
  }

  const catalog = `// Archivo generado por scripts/generate-emoji-assets.js. No editar a mano.
// Sprite: ${GRID}x${GRID} celdas de ${CELL}px (contenido ${CONTENT}px) a partir de assets/eko_emojis_transparent.png

export type EmojiEntry = {
  id: string
  file: string
  row: number
  col: number
  category: string
  label: string
}

export const EMOJI_GRID = ${GRID}
export const EMOJI_CELL = ${CELL}

export const EMOJI_CATEGORIES = ${JSON.stringify(Array.from({ length: PACKS }, (_, i) => `Pack ${i + 1}`))}

export const EMOJIS: EmojiEntry[] = ${JSON.stringify(entries, null, 2)}

const byId = new Map(EMOJIS.map((emoji) => [emoji.id, emoji]))

export function getEmoji(id: string): EmojiEntry | undefined {
  return byId.get(id)
}

export function emojiSrc(id: string): string {
  const emoji = byId.get(id)
  return emoji ? \`./emoji/\${emoji.file}\` : ''
}

export const EMOJI_TOKEN_REGEX = /:eko-(\\d{3}):/g

export function isEmojiToken(token: string): boolean {
  return /^:eko-\\d{3}:$/.test(token)
}
`

  fs.writeFileSync(CATALOG, catalog, 'utf8')

  // Hoja de vista previa: tablero de ajedrez para verificar transparencia + rejilla.
  const checker = Buffer.alloc(info.width * info.height * 4)
  const square = 22
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const even = (Math.floor(x / square) + Math.floor(y / square)) % 2 === 0
      const offset = (y * info.width + x) * 4
      const value = even ? 42 : 54
      checker[offset] = value
      checker[offset + 1] = value - 6
      checker[offset + 2] = value + 8
      checker[offset + 3] = 255
    }
  }
  const gridLines = []
  for (let i = 0; i <= GRID; i++) {
    const p = OFFSET + i * STRIDE
    gridLines.push(`<line x1="${p}" y1="0" x2="${p}" y2="${info.height}" />`)
    gridLines.push(`<line x1="0" y1="${p}" x2="${info.width}" y2="${p}" />`)
  }
  const overlay = Buffer.from(
    `<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg"><g stroke="#c879f4" stroke-opacity="0.55" stroke-width="1">${gridLines.join('')}</g></svg>`,
  )

  await sharp(checker, { raw: { width: info.width, height: info.height, channels: 4 } })
    .composite([
      { input: SPRITE, left: 0, top: 0 },
      { input: overlay, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(PREVIEW)

  console.log(`Emojis generados: ${entries.length}`)
  console.log(`Celdas con contenido: ${nonEmpty}`)
  console.log(`Catalogo: ${CATALOG}`)
  console.log(`Vista previa: ${PREVIEW}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
