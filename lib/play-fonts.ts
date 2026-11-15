export type PlayFontOption = {
  id: string
  label: string
  category: string
  /** Familia CSS declarada en app/fonts.css */
  family: string
  /** Clase extra para efectos especiales (por ejemplo, el bisel de Minecraft). */
  className?: string
  /** Pila completa con respaldo. */
  stack: string
}

const SANS = 'Arial, Helvetica, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace'

function option(id: string, label: string, category: string, family: string, stack = `${family}, ${SANS}`, className?: string): PlayFontOption {
  return { id, label, category, family, stack, className }
}

export const PLAY_FONT_OPTIONS: PlayFontOption[] = [
  option('default', 'Clásica del launcher', 'Básicas', 'Arial', SANS),
  option('minecraft-logo', 'Minecraft (logo)', 'Videojuegos', 'Minecrafter', `'Minecrafter', ${SANS}`),
  option('minecraft-logo-cracks', 'Minecraft (grietas)', 'Videojuegos', 'Minecrafter Alt', `'Minecrafter Alt', ${SANS}`),
  option('minecraft-text', 'Minecraft (texto)', 'Videojuegos', 'Minecraft', `'Minecraft', ${MONO}`),
  option('minecraft-pixel', 'Minecraft (pixel)', 'Videojuegos', 'Pixelify Sans', `'Pixelify Sans', ${MONO}`),
  option('press-start-2p', 'Press Start 2P', 'Pixel / Retro', 'Press Start 2P', `'Press Start 2P', ${MONO}`),
  option('silkscreen', 'Silkscreen', 'Pixel / Retro', 'Silkscreen', `'Silkscreen', ${MONO}`),
  option('pixelify-sans', 'Pixelify Sans', 'Pixel / Retro', 'Pixelify Sans', `'Pixelify Sans', ${SANS}`),
  option('jersey-10', 'Jersey 10', 'Pixel / Retro', 'Jersey 10', `'Jersey 10', ${SANS}`),
  option('micro-5', 'Micro 5', 'Pixel / Retro', 'Micro 5', `'Micro 5', ${MONO}`),
  option('handjet', 'Handjet', 'Pixel / Retro', 'Handjet', `'Handjet', ${SANS}`),
  option('vt323', 'VT323', 'Terminal', 'VT323', `'VT323', ${MONO}`),
  option('bungee', 'Bungee', 'Arcade / Videojuego', 'Bungee', `'Bungee', ${SANS}`),
  option('russo-one', 'Russo One', 'Arcade / Videojuego', 'Russo One', `'Russo One', ${SANS}`),
  option('black-ops-one', 'Black Ops One', 'Arcade / Videojuego', 'Black Ops One', `'Black Ops One', ${SANS}`),
  option('luckiest-guy', 'Luckiest Guy', 'Cómic / Cartoon', 'Luckiest Guy', `'Luckiest Guy', ${SANS}`),
  option('titan-one', 'Titan One', 'Cómic / Cartoon', 'Titan One', `'Titan One', ${SANS}`),
  option('bangers', 'Bangers', 'Cómic / Cartoon', 'Bangers', `'Bangers', ${SANS}`),
  option('lilita-one', 'Lilita One', 'Cómic / Cartoon', 'Lilita One', `'Lilita One', ${SANS}`),
  option('sigmar-one', 'Sigmar One', 'Cómic / Cartoon', 'Sigmar One', `'Sigmar One', ${SANS}`),
  option('fredoka', 'Fredoka', 'Cómic / Cartoon', 'Fredoka', `'Fredoka', ${SANS}`),
  option('baloo-2', 'Baloo 2', 'Cómic / Cartoon', 'Baloo 2', `'Baloo 2', ${SANS}`),
  option('orbitron', 'Orbitron', 'Ciencia ficción', 'Orbitron', `'Orbitron', ${SANS}`),
  option('audiowide', 'Audiowide', 'Ciencia ficción', 'Audiowide', `'Audiowide', ${SANS}`),
  option('chakra-petch', 'Chakra Petch', 'Ciencia ficción', 'Chakra Petch', `'Chakra Petch', ${SANS}`),
  option('monoton', 'Monoton', 'Ciencia ficción', 'Monoton', `'Monoton', ${SANS}`),
  option('exo-2', 'Exo 2', 'Ciencia ficción', 'Exo 2', `'Exo 2', ${SANS}`),
  option('rajdhani', 'Rajdhani', 'Ciencia ficción', 'Rajdhani', `'Rajdhani', ${SANS}`),
  option('cinzel', 'Cinzel', 'Fantasía / Medieval', 'Cinzel', `'Cinzel', ${SANS}`),
  option('cinzel-decorative', 'Cinzel Decorative', 'Fantasía / Medieval', 'Cinzel Decorative', `'Cinzel Decorative', ${SANS}`),
  option('medieval-sharp', 'MedievalSharp', 'Fantasía / Medieval', 'MedievalSharp', `'MedievalSharp', ${SANS}`),
  option('uncial-antiqua', 'Uncial Antiqua', 'Fantasía / Medieval', 'Uncial Antiqua', `'Uncial Antiqua', ${SANS}`),
  option('metamorphous', 'Metamorphous', 'Fantasía / Medieval', 'Metamorphous', `'Metamorphous', ${SANS}`),
  option('creepster', 'Creepster', 'Terror', 'Creepster', `'Creepster', ${SANS}`),
  option('nosifer', 'Nosifer', 'Terror', 'Nosifer', `'Nosifer', ${SANS}`),
  option('eater', 'Eater', 'Terror', 'Eater', `'Eater', ${SANS}`),
  option('permanent-marker', 'Permanent Marker', 'Manuscrita', 'Permanent Marker', `'Permanent Marker', ${SANS}`),
  option('caveat', 'Caveat', 'Manuscrita', 'Caveat', `'Caveat', ${SANS}`),
  option('pacifico', 'Pacifico', 'Manuscrita', 'Pacifico', `'Pacifico', ${SANS}`),
  option('lobster', 'Lobster', 'Manuscrita', 'Lobster', `'Lobster', ${SANS}`),
  option('bebas-neue', 'Bebas Neue', 'Elegante / Seria', 'Bebas Neue', `'Bebas Neue', ${SANS}`),
  option('anton', 'Anton', 'Elegante / Seria', 'Anton', `'Anton', ${SANS}`),
  option('archivo-black', 'Archivo Black', 'Elegante / Seria', 'Archivo Black', `'Archivo Black', ${SANS}`),
  option('oswald', 'Oswald', 'Elegante / Seria', 'Oswald', `'Oswald', ${SANS}`),
  option('montserrat', 'Montserrat', 'Elegante / Seria', 'Montserrat', `'Montserrat', ${SANS}`),
  option('poppins', 'Poppins', 'Elegante / Seria', 'Poppins', `'Poppins', ${SANS}`),
  option('inter', 'Inter', 'Elegante / Seria', 'Inter', `'Inter', ${SANS}`),
  option('space-mono', 'Space Mono', 'Monoespaciada', 'Space Mono', `'Space Mono', ${MONO}`),
  option('ibm-plex-mono', 'IBM Plex Mono', 'Monoespaciada', 'IBM Plex Mono', `'IBM Plex Mono', ${MONO}`),
  option('courier-prime', 'Courier Prime', 'Monoespaciada', 'Courier Prime', `'Courier Prime', ${MONO}`),
  option('share-tech-mono', 'Share Tech Mono', 'Monoespaciada', 'Share Tech Mono', `'Share Tech Mono', ${MONO}`),
  option('major-mono-display', 'Major Mono Display', 'Monoespaciada', 'Major Mono Display', `'Major Mono Display', ${MONO}`),
]

const FONT_BY_ID = new Map(PLAY_FONT_OPTIONS.map((font) => [font.id, font]))

/**
 * Compensación visual de tamaño por tipografía. Las fuentes pixel y de
 * x-height baja se verían diminutas al mismo em que una display normal; con
 * este multiplicador todas las tipografías se leen a tamaño equivalente.
 */
const FONT_BOOST: Record<string, number> = {
  'micro-5': 1.95,
  'press-start-2p': 1.3,
  silkscreen: 1.18,
  'jersey-10': 1.35,
  handjet: 1.22,
  vt323: 1.22,
  'pixelify-sans': 1.08,
  'minecraft-pixel': 1.08,
  'minecraft-text': 1.05,
  monoton: 0.92,
  nosifer: 0.96,
  bungee: 0.96,
  eater: 1.05,
}

export function playFontBoost(id: string): number {
  return FONT_BOOST[playFont(id).id] || 1
}

export function playFont(id: string): PlayFontOption {
  return FONT_BY_ID.get(id) || PLAY_FONT_OPTIONS[0]
}

export function playFontStack(id: string): string {
  return playFont(id).stack
}

export function playFontClass(id: string): string {
  return playFont(id).className || ''
}

export const PLAY_FONT_CATEGORIES = Array.from(new Set(PLAY_FONT_OPTIONS.map((font) => font.category)))
