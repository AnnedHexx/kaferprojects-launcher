export type PlayAnimationId =
  | 'none'
  | 'rain'
  | 'confetti'
  | 'slide-right'
  | 'slide-left'
  | 'pulse'
  | 'shine'
  | 'aurora'
  | 'fire'
  | 'ocean'
  | 'rainbow'
  | 'neon'
  | 'glitch'

export type PlayAnimationOption = {
  id: PlayAnimationId
  label: string
  description: string
  /** Cuántos colores usa: 1 = principal, 2 = principal + secundario, 5 = principal + 4. */
  colors: 1 | 2 | 4 | 5
}

export const PLAY_ANIMATIONS: PlayAnimationOption[] = [
  {
    id: 'none',
    label: 'Color liso',
    description: 'Un solo color, sin movimiento.',
    colors: 1,
  },
  {
    id: 'rain',
    label: 'Lluvia de colores',
    description: 'El color principal con 4 colores cayendo.',
    colors: 5,
  },
  {
    id: 'confetti',
    label: 'Confeti',
    description: 'Cuadraditos de 4 colores cayendo.',
    colors: 5,
  },
  {
    id: 'slide-right',
    label: 'Degradado →',
    description: 'Dos colores deslizándose hacia la derecha.',
    colors: 2,
  },
  {
    id: 'slide-left',
    label: 'Degradado ←',
    description: 'Dos colores deslizándose hacia la izquierda.',
    colors: 2,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Manchas de color a la deriva sobre todo el botón.',
    colors: 4,
  },
  {
    id: 'pulse',
    label: 'Latido',
    description: 'El botón entero respira: brillo, escala y sombra.',
    colors: 1,
  },
  {
    id: 'shine',
    label: 'Brillo',
    description: 'Una franja de luz con destello recorre el botón.',
    colors: 1,
  },
  {
    id: 'fire',
    label: 'Fuego',
    description: 'Llamas cálidas con resplandor en la base del botón.',
    colors: 2,
  },
  {
    id: 'ocean',
    label: 'Océano',
    description: 'Olas suaves recorriendo el botón completo.',
    colors: 2,
  },
  {
    id: 'rainbow',
    label: 'Arcoíris',
    description: 'Todo el espectro girando con halo de color.',
    colors: 1,
  },
  {
    id: 'neon',
    label: 'Neón',
    description: 'Resplandor pulsante con los colores de la instancia.',
    colors: 1,
  },
  {
    id: 'glitch',
    label: 'Glitch',
    description: 'Cortes digitales, separación RGB y saltos en todo el botón.',
    colors: 2,
  },
]

const ANIMATION_BY_ID = new Map(PLAY_ANIMATIONS.map((animation) => [animation.id, animation]))

export function playAnimation(id: string): PlayAnimationOption {
  return ANIMATION_BY_ID.get(id as PlayAnimationId) || PLAY_ANIMATIONS[0]
}

export function isPlayAnimation(value: unknown): value is PlayAnimationId {
  return typeof value === 'string' && ANIMATION_BY_ID.has(value as PlayAnimationId)
}
