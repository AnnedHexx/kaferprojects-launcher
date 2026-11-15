'use client'

export type ForumCategory = {
  id: string
  label: string
  description: string
  bullets: string[]
}

export const GENERAL_CATEGORY_ID = 'general'

export const GENERAL_CATEGORY: ForumCategory = {
  id: GENERAL_CATEGORY_ID,
  label: 'General',
  description: 'El pulso de la comunidad: publicaciones recientes, destacadas y las conversaciones con más actividad.',
  bullets: ['Recientes', 'Destacadas', 'Con más actividad'],
}

export const FORUM_CHANNELS: ForumCategory[] = [
  {
    id: 'clips',
    label: 'Clips y jugadas',
    description: 'Comparte tus mejores momentos jugando. Clips de 15–60 segundos y capturas.',
    bullets: ['Combos de PvP', 'Victorias épicas', 'Momentos graciosos', 'Capturas de pantalla'],
  },
  {
    id: 'builds',
    label: 'Construcciones y mundos',
    description: 'Muestra creaciones de Minecraft y comparte descargas de tus mapas.',
    bullets: ['Casas y ciudades', 'Mapas personalizados', 'Granjas y mecanismos', 'Mundos de supervivencia'],
  },
  {
    id: 'players',
    label: 'Buscar jugadores',
    description: 'Encuentra gente con quien jugar, forma equipos y organiza partidas privadas.',
    bullets: ['Compañeros de PvP', 'Equipos y clanes', 'Supervivencia', 'Torneos'],
  },
  {
    id: 'showcase',
    label: 'Showcase',
    description: 'Presume proyectos relacionados con Minecraft y EKO.',
    bullets: ['Skins creadas por usuarios', 'Diseños de interfaces', 'Launchers personalizados', 'Proyectos en desarrollo'],
  },
  {
    id: 'help',
    label: 'Preguntas y ayuda',
    description: 'Resuelve dudas con la comunidad. Las publicaciones pueden marcarse como resueltas.',
    bullets: ['Problemas con Bedrock', 'Errores al iniciar', 'Ayuda con add-ons', 'Consejos de PvP'],
  },
  {
    id: 'news',
    label: 'Noticias y debates',
    description: 'Habla de novedades, cambios y opiniones de la comunidad.',
    bullets: ['Actualizaciones de Minecraft', 'Encuestas comunitarias', 'Opiniones sobre mecánicas', 'Sugerencias para EKO'],
  },
]

export const FORUM_CATEGORIES: ForumCategory[] = [GENERAL_CATEGORY, ...FORUM_CHANNELS]

export type ForumComment = {
  id: string
  author: string
  text: string
  createdAt: string
  pinned?: boolean
  image?: string
}

export type ForumPost = {
  id: string
  categoryId: string
  title: string
  body: string
  author: string
  createdAt: string
  resolved?: boolean
  pinned?: boolean
  media?: string
  comments: ForumComment[]
}

const FORUM_KEY = 'eko.forum.v1'
const BAZAAR_KEY = 'eko.bazaar.v1'
const CHANNEL_PREFS_KEY = 'eko.forum.channels.v1'

export function loadForumPosts(): ForumPost[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FORUM_KEY)
    if (!raw) {
      window.localStorage.setItem(FORUM_KEY, JSON.stringify([]))
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (post): post is ForumPost =>
        Boolean(post) &&
        typeof post === 'object' &&
        typeof (post as ForumPost).id === 'string' &&
        typeof (post as ForumPost).categoryId === 'string' &&
        typeof (post as ForumPost).title === 'string' &&
        Array.isArray((post as ForumPost).comments),
    )
  } catch {
    return []
  }
}

export function saveForumPosts(posts: ForumPost[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FORUM_KEY, JSON.stringify(posts))
  } catch {}
}

export function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days} d`
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export function forumPostScore(post: ForumPost): number {
  const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt).getTime()) / 3600000)
  const recency = Math.max(0, 48 - ageHours) * 2
  const activity = post.comments.length * 6
  return recency + activity + (post.pinned ? 18 : 0) + (post.resolved ? 3 : 0)
}

export function isVideoMedia(value?: string): boolean {
  if (!value) return false
  return value.startsWith('data:video/') || /\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(value)
}

export function isImageMedia(value?: string): boolean {
  if (!value) return false
  return value.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(value)
}

export type ChannelPreference = {
  dot: string
  seenAt: number
}

export const DEFAULT_CHANNEL_DOTS: Record<string, string> = {
  general: '#a950d8',
  clips: '#f97316',
  builds: '#38bdf8',
  players: '#22c55e',
  showcase: '#ec4899',
  help: '#facc15',
  news: '#ef4444',
}

export function loadChannelPreferences(): Record<string, ChannelPreference> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CHANNEL_PREFS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, ChannelPreference>
  } catch {
    return {}
  }
}

export function saveChannelPreferences(prefs: Record<string, ChannelPreference>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHANNEL_PREFS_KEY, JSON.stringify(prefs))
  } catch {}
}

export type BazaarItem = {
  id: string
  name: string
  tag: string
  description: string
  price: string
  emoji?: string
  icon?: string
  accent: string
  patreon?: string
  pinned?: boolean
  author?: string
  createdAt?: string
}

export const BAZAAR_PRESETS: { id: string; label: string; gradient: string }[] = [
  { id: 'violet', label: 'Violeta EKO', gradient: 'linear-gradient(135deg,#7b2ff7,#f107a3)' },
  { id: 'ocean', label: 'Océano', gradient: 'linear-gradient(135deg,#12c2e9,#c471ed)' },
  { id: 'forest', label: 'Bosque', gradient: 'linear-gradient(135deg,#11998e,#38ef7d)' },
  { id: 'sunset', label: 'Atardecer', gradient: 'linear-gradient(135deg,#fc5c7d,#6a82fb)' },
  { id: 'ember', label: 'Brasa', gradient: 'linear-gradient(135deg,#232526,#7f00ff)' },
  { id: 'gold', label: 'Oro', gradient: 'linear-gradient(135deg,#f6d365,#fda085)' },
]

export const BAZAAR_ITEMS: BazaarItem[] = [
  {
    id: 'pvp-overlay',
    name: 'EKO PvP Overlay',
    tag: 'Add-on',
    description: 'HUD de PvP con corazones, combos y temporizadores. Compatible con Bedrock 1.21+.',
    price: 'Patreon · 3 US$/mes',
    emoji: 'eko-001',
    accent: BAZAAR_PRESETS[0].gradient,
    patreon: 'https://www.patreon.com/ekoclient',
  },
  {
    id: 'bedwars-pack',
    name: 'EKO BedWars Pack',
    tag: 'Add-on',
    description: 'Mapas, kits y mejoras de BedWars listas para tu Instancia de Bedrock.',
    price: 'Patreon · 5 US$/mes',
    emoji: 'eko-041',
    accent: BAZAAR_PRESETS[1].gradient,
    patreon: 'https://www.patreon.com/ekoclient',
  },
  {
    id: 'skyblock-essentials',
    name: 'Skyblock Essentials',
    tag: 'Add-on',
    description: 'Economía, islas, cofres y misiones para montar tu propio Skyblock.',
    price: 'Patreon · 4 US$/mes',
    emoji: 'eko-081',
    accent: BAZAAR_PRESETS[2].gradient,
    patreon: 'https://www.patreon.com/ekoclient',
  },
  {
    id: 'eko-ui-kit',
    name: 'EKO UI Kit',
    tag: 'Showcase',
    description: 'Recursos de interfaz y texturas con el estilo de EKO para tus proyectos.',
    price: 'Patreon · 2 US$/mes',
    emoji: 'eko-121',
    accent: BAZAAR_PRESETS[3].gradient,
    patreon: 'https://www.patreon.com/ekoclient',
  },
  {
    id: 'horror-map',
    name: 'EKO Horror Map',
    tag: 'Mapa',
    description: 'Aventura cooperativa de terror con acertijos, sonido ambiental y finales múltiples.',
    price: 'Patreon · 3 US$/mes',
    emoji: 'eko-161',
    accent: BAZAAR_PRESETS[4].gradient,
    patreon: 'https://www.patreon.com/ekoclient',
  },
]

export function loadBazaarItems(): BazaarItem[] {
  if (typeof window === 'undefined') return BAZAAR_ITEMS
  try {
    const raw = window.localStorage.getItem(BAZAAR_KEY)
    if (!raw) {
      window.localStorage.setItem(BAZAAR_KEY, JSON.stringify(BAZAAR_ITEMS))
      return BAZAAR_ITEMS
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return BAZAAR_ITEMS
    const items = parsed.filter(
      (item): item is BazaarItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as BazaarItem).id === 'string' &&
        typeof (item as BazaarItem).name === 'string',
    )
    return items.length ? items : BAZAAR_ITEMS
  } catch {
    return BAZAAR_ITEMS
  }
}

export function saveBazaarItems(items: BazaarItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BAZAAR_KEY, JSON.stringify(items))
  } catch {}
}

export type CommunityNews = {
  id: string
  tag: string
  title: string
  summary: string
  emoji: string
  accent: string
}

/** Noticias oficiales de EKO. No son usuarios ni publicaciones de ejemplo. */
export const COMMUNITY_NEWS: CommunityNews[] = [
  {
    id: 'community-launch',
    tag: 'Comunidad',
    title: 'La comunidad de EKO abre sus puertas',
    summary: 'Foro, chats, perfiles y Bazaar ya conviven en un mismo espacio preparado para el lanzamiento público.',
    emoji: 'eko-003',
    accent: 'linear-gradient(135deg,#7b2ff7,#f107a3)',
  },
  {
    id: 'general-channel',
    tag: 'Foro',
    title: 'Nuevo canal General',
    summary: 'Recientes, destacadas y conversaciones con más actividad en una sola vista para no perderte nada.',
    emoji: 'eko-041',
    accent: 'linear-gradient(135deg,#12c2e9,#c471ed)',
  },
  {
    id: 'bazaar-custom',
    tag: 'Bazaar',
    title: 'Publica tu artículo con tu propio estilo',
    summary: 'Elige un fondo degradado, sube una imagen del dispositivo o usa un emoji EKO como icono central.',
    emoji: 'eko-081',
    accent: 'linear-gradient(135deg,#11998e,#38ef7d)',
  },
  {
    id: 'xbox-profiles',
    tag: 'Perfiles',
    title: 'Perfiles con identidad propia',
    summary: 'Banner, descripción, fecha de ingreso y amigos en común. Los admins además pueden personalizar título y nombre.',
    emoji: 'eko-121',
    accent: 'linear-gradient(135deg,#fc5c7d,#6a82fb)',
  },
  {
    id: 'smart-notifications',
    tag: 'Sistema',
    title: 'Notificaciones que respetan tu partida',
    summary: 'Con EKO abierto verás una tarjeta flotante y oirás el sonido de selección. En segundo plano llega la notificación de Windows.',
    emoji: 'eko-161',
    accent: 'linear-gradient(135deg,#232526,#7f00ff)',
  },
  {
    id: 'microsoft-only',
    tag: 'Seguridad',
    title: 'Acceso único con Microsoft',
    summary: 'Hemos retirado el registro local. Tu cuenta de Microsoft/Xbox es la única puerta de entrada a KaferProjects Launcher.',
    emoji: 'eko-201',
    accent: 'linear-gradient(135deg,#0f9b0f,#38ef7d)',
  },
]
