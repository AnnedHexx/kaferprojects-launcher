'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Palette,
  Pin,
  PinOff,
  Plus,
  Send,
  ShoppingBag,
  SmilePlus,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { EmojiGlyph, EmojiText } from '@/components/emoji-text'
import { EmojiPicker } from '@/components/emoji-picker'
import { EmojiReactions } from '@/components/emoji-reactions'
import { SkinFace } from '@/components/skin-face'
import { ContextMenu, contextMenuIcons, removeFloatingMenus } from '@/components/context-menu'
import {
  BAZAAR_PRESETS,
  COMMUNITY_NEWS,
  DEFAULT_CHANNEL_DOTS,
  FORUM_CATEGORIES,
  FORUM_CHANNELS,
  GENERAL_CATEGORY_ID,
  BazaarItem,
  ChannelPreference,
  formatRelative,
  forumPostScore,
  isVideoMedia,
  loadBazaarItems,
  loadChannelPreferences,
  loadForumPosts,
  saveBazaarItems,
  saveChannelPreferences,
  saveForumPosts,
  type ForumComment,
  type ForumPost,
} from '@/lib/community-store'
import type { Friend } from '@/lib/social-store'
import { loadFriends, suggestPlayers } from '@/lib/social-store'
import { prepareImage, readVideoFile } from '@/lib/media'
import { useClosing } from '@/lib/use-closing'

type Tab = 'news' | 'forum' | 'bazaar'
type GeneralFilter = 'recent' | 'featured' | 'active'

type CommunityModalProps = {
  gamertag: string
  isAdmin: boolean
  friends?: Friend[]
  onClose: () => void
  onOpenProfile?: (gamertag: string) => void
}

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function openExternal(url: string) {
  if (typeof window === 'undefined') return
  if (window.ekoLauncher?.openExternal) {
    window.ekoLauncher.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function latestPostTime(posts: ForumPost[], categoryId: string): number {
  return posts
    .filter((post) => post.categoryId === categoryId)
    .reduce((latest, post) => Math.max(latest, Date.parse(post.createdAt) || 0), 0)
}

export function CommunityModal({
  gamertag,
  isAdmin,
  friends: friendsProp,
  onClose,
  onOpenProfile,
}: CommunityModalProps) {
  const { closing, requestClose } = useClosing(onClose)
  const [tab, setTab] = useState<Tab>('news')
  const [friends, setFriends] = useState<Friend[]>(() => friendsProp || loadFriends())
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [bazaar, setBazaar] = useState<BazaarItem[]>([])
  const [prefs, setPrefs] = useState<Record<string, ChannelPreference>>({})
  const [generalFilter, setGeneralFilter] = useState<GeneralFilter>('recent')
  const [categoryId, setCategoryId] = useState(GENERAL_CATEGORY_ID)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [media, setMedia] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [formError, setFormError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [commentEmoji, setCommentEmoji] = useState(false)
  const [showBazaarForm, setShowBazaarForm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [itemTag, setItemTag] = useState('Add-on')
  const [itemDescription, setItemDescription] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemPreset, setItemPreset] = useState(BAZAAR_PRESETS[0].id)
  const [itemEmoji, setItemEmoji] = useState('eko-001')
  const [itemIcon, setItemIcon] = useState('')
  const [itemBanner, setItemBanner] = useState('')
  const [itemBannerFile, setItemBannerFile] = useState('')
  const [itemPatreon, setItemPatreon] = useState('')
  const [editingItem, setEditingItem] = useState<any>(null)
  const [itemEmojiOpen, setItemEmojiOpen] = useState(false)
  const [bazaarError, setBazaarError] = useState('')
  const postFileRef = useRef<HTMLInputElement>(null)
  const postVideoRef = useRef<HTMLInputElement>(null)
  const itemFileRef = useRef<HTMLInputElement>(null)
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('eko.forum.hidden')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch { return new Set() }
  })
  const [followedPosts, setFollowedPosts] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('eko.forum.followed')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch { return new Set() }
  })
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('eko.blocked')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch { return new Set() }
  })
  const [contextMenu, setContextMenu] = useState<{x:number,y:number,items:any[]} | null>(null)

  useEffect(() => {
    setPosts(loadForumPosts())
    setBazaar(loadBazaarItems())
    setPrefs(loadChannelPreferences())
  }, [])

  useEffect(() => {
    if (friendsProp) setFriends(friendsProp)
  }, [friendsProp])

  const category = FORUM_CATEGORIES.find((item) => item.id === categoryId) || FORUM_CATEGORIES[0]
  const selectedPost = posts.find((post) => post.id === selectedPostId) || null

  const generalPosts = useMemo(() => {
    const sorted = [...posts]
    if (generalFilter === 'featured') {
      return sorted.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || forumPostScore(b) - forumPostScore(a))
    }
    if (generalFilter === 'active') {
      return sorted.sort((a, b) => b.comments.length - a.comments.length || forumPostScore(b) - forumPostScore(a))
    }
    return sorted.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
  }, [posts, generalFilter])

  const categoryPosts = useMemo(() => {
    if (categoryId === GENERAL_CATEGORY_ID) return generalPosts
    return posts
      .filter((post) => post.categoryId === categoryId)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
  }, [posts, categoryId, generalPosts])

  const suggested = useMemo(
    () => suggestPlayers(gamertag, friends, posts.map((post) => post.author)),
    [gamertag, friends, posts],
  )

  function commitPosts(next: ForumPost[]) {
    setPosts(next)
    saveForumPosts(next)
  }

  function commitBazaar(next: BazaarItem[]) {
    setBazaar(next)
    saveBazaarItems(next)
  }

  function commitPrefs(next: Record<string, ChannelPreference>) {
    setPrefs(next)
    saveChannelPreferences(next)
  }

  function hasUnread(id: string): boolean {
    if (id === GENERAL_CATEGORY_ID) {
      return FORUM_CHANNELS.some((channel) => hasUnread(channel.id))
    }
    const seenAt = prefs[id]?.seenAt || 0
    return latestPostTime(posts, id) > seenAt
  }

  function selectCategory(id: string) {
    setCategoryId(id)
    setSelectedPostId(null)
    setShowForm(false)
    const seenAt = Date.now()
    const affected = id === GENERAL_CATEGORY_ID ? FORUM_CHANNELS.map((channel) => channel.id) : [id]
    const next = { ...prefs }
    for (const channelId of affected) {
      next[channelId] = { ...(next[channelId] || { dot: DEFAULT_CHANNEL_DOTS[channelId] || '#a950d8' }), seenAt }
    }
    commitPrefs(next)
  }

  function setChannelDot(id: string, dot: string) {
    commitPrefs({
      ...prefs,
      [id]: {
        dot,
        seenAt: prefs[id]?.seenAt || 0,
      },
    })
  }

  function submitPost() {
    if (!title.trim() || !body.trim()) return
    const post: ForumPost = {
      id: newId('post'),
      categoryId: categoryId === GENERAL_CATEGORY_ID ? 'news' : categoryId,
      title: title.trim(),
      body: body.trim(),
      author: gamertag || 'Jugador',
      createdAt: nowIso(),
      media: media || mediaUrl.trim() || undefined,
      comments: [],
    }
    commitPosts([post, ...posts])
    setTitle('')
    setBody('')
    setMedia('')
    setMediaUrl('')
    setFormError('')
    setShowForm(false)
    setSelectedPostId(post.id)
  }

  async function uploadPostMedia(file: File | null) {
    if (!file) return
    try {
      setFormError('')
      const dataUrl = await prepareImage(file, 1000 * 1024)
      setMedia(dataUrl)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo usar la imagen.')
    }
  }

  async function uploadPostVideo(file: File | null) {
    if (!file) return
    try {
      setFormError('')
      const dataUrl = await readVideoFile(file)
      setMedia(dataUrl)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo usar el vídeo.')
    }
  }

  function submitComment() {
    if (!selectedPost || !commentDraft.trim()) return
    const comment: ForumComment = {
      id: newId('comment'),
      author: gamertag || 'Jugador',
      text: commentDraft.trim(),
      createdAt: nowIso(),
    }
    commitPosts(
      posts.map((post) =>
        post.id === selectedPost.id ? { ...post, comments: [...post.comments, comment] } : post,
      ),
    )
    setCommentDraft('')
    setCommentEmoji(false)
  }

  function toggleResolved(postId: string) {
    commitPosts(posts.map((post) => (post.id === postId ? { ...post, resolved: !post.resolved } : post)))
  }

  function togglePinPost(postId: string) {
    if (!isAdmin) return
    commitPosts(posts.map((post) => (post.id === postId ? { ...post, pinned: !post.pinned } : post)))
  }

  function togglePinComment(postId: string, commentId: string) {
    if (!isAdmin) return
    commitPosts(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments.map((comment) =>
                comment.id === commentId ? { ...comment, pinned: !comment.pinned } : comment,
              ),
            }
          : post,
      ),
    )
  }

  function saveHidden() {
    try { localStorage.setItem('eko.forum.hidden', JSON.stringify(Array.from(hiddenPosts))) } catch {}
  }
  function saveFollowed() {
    try { localStorage.setItem('eko.forum.followed', JSON.stringify(Array.from(followedPosts))) } catch {}
  }
  function saveBlocked() {
    try { localStorage.setItem('eko.blocked', JSON.stringify(Array.from(blockedUsers))) } catch {}
  }
  function hidePost(id: string) {
    setHiddenPosts(prev => { const n = new Set(prev); n.add(id); return n })
    setTimeout(saveHidden, 0)
  }
  function unhidePost(id: string) {
    setHiddenPosts(prev => { const n = new Set(prev); n.delete(id); return n })
    setTimeout(saveHidden, 0)
  }
  function toggleFollow(id: string) {
    setFollowedPosts(prev => { const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n })
    setTimeout(saveFollowed, 0)
  }
  function blockUser(user: string) {
    const k = user.toLowerCase()
    setBlockedUsers(prev => { const n = new Set(prev); n.add(k); return n })
    setTimeout(saveBlocked, 0)
  }
  function reportUser(user: string) {
    try {
      const reports = JSON.parse(localStorage.getItem('eko.reports') || '[]')
      reports.push({ type: 'user', user, by: gamertag, at: nowIso() })
      localStorage.setItem('eko.reports', JSON.stringify(reports))
      alert('Reporte enviado')
    } catch {}
  }
  function togglePinItem(itemId: string) {
    if (!isAdmin) return
    commitBazaar(bazaar.map((item) => (item.id === itemId ? { ...item, pinned: !item.pinned } : item)))
  }

  async function uploadItemIcon(file: File | null) {
    if (!file) return
    try {
      setBazaarError('')
      const dataUrl = await prepareImage(file, 720 * 1024)
      setItemIcon(dataUrl)
    } catch (err) {
      setBazaarError(err instanceof Error ? err.message : 'No se pudo usar la imagen.')
    }
  }

  function publishItem() {
    if (!isAdmin) return
    if (!itemName.trim() || !itemDescription.trim()) return
    const patreon = (itemPatreon.trim() || itemPrice.trim()).toLowerCase().includes('patreon')
      ? (itemPatreon.trim() || itemPrice.trim())
      : ''
    if (!patreon) {
      setBazaarError('Debes incluir un enlace de Patreon para publicar en el Bazaar.')
      return
    }
    const preset = BAZAAR_PRESETS.find((entry) => entry.id === itemPreset) || BAZAAR_PRESETS[0]
    if (editingItem) {
      const next = bazaar.map((entry) =>
        entry.id === editingItem.id
          ? {
              ...entry,
              name: itemName.trim(),
              tag: itemTag.trim() || 'Add-on',
              description: itemDescription.trim(),
              price: itemPrice.trim() || patreon,
              patreon,
              accent: preset.gradient,
              emoji: itemIcon ? undefined : itemEmoji || undefined,
              icon: itemIcon || undefined,
              banner: (itemBannerFile || itemBanner).trim() || undefined,
            } as any
          : entry,
      )
      commitBazaar(next)
      setEditingItem(null)
      resetItemForm()
      return
    }
    const item: BazaarItem = {
      id: newId('bazaar'),
      name: itemName.trim(),
      tag: itemTag.trim() || 'Add-on',
      description: itemDescription.trim(),
      price: itemPrice.trim() || patreon,
      accent: preset.gradient,
      emoji: itemIcon ? undefined : itemEmoji || undefined,
      icon: itemIcon || undefined,
      banner: (itemBannerFile || itemBanner).trim() || undefined,
      author: gamertag || 'Jugador',
      createdAt: nowIso(),
      patreon,
    } as any
    commitBazaar([item, ...bazaar])
    resetItemForm()
  }

  function resetItemForm() {
    setItemName('')
    setItemTag('Add-on')
    setItemDescription('')
    setItemPrice('')
    setItemPatreon('')
    setItemIcon('')
    setItemEmoji('eko-001')
    setItemBanner('')
    setItemBannerFile('')
    setShowBazaarForm(false)
    setBazaarError('')
  }

  function startEditItem(item: any) {
    if (!isAdmin) return
    setEditingItem(item)
    setItemName(item.name || '')
    setItemTag(item.tag || 'Add-on')
    setItemDescription(item.description || '')
    setItemPrice(item.price || '')
    setItemPatreon(item.patreon || item.price || '')
    setItemIcon(item.icon || '')
    setItemEmoji(item.emoji || 'eko-001')
    setItemBanner(item.banner || '')
    setItemBannerFile('')
    setShowBazaarForm(true)
  }

  const sortedBazaar = [...bazaar].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0),
  )

  return (
    <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={requestClose}>
      <section className="community-modal" onClick={(event) => event.stopPropagation()} aria-label="Comunidad de KaferProjects Launcher">
        <button className="modal-close" onClick={requestClose} aria-label="Cerrar comunidad">
          <X />
        </button>

        <header className="community-head">
          <div>
            <span className="community-kicker">KaferProjects Launcher</span>
            <h1>EKO Bazaar</h1>
          </div>
        </header>

        <div className="community-body">
          {false && tab === 'news' && (
            <div className="community-news">
              <div className="community-news-head">
                <div>
                  <span className="community-kicker">LO ÚLTIMO DE EKO</span>
                  <h2>Novedades de la comunidad</h2>
                  <p>Foro, Bazaar, changelog y noticias oficiales en un solo lugar.</p>
                </div>
                <button className="btn-ghost" onClick={() => setTab('forum')}>
                  <BookOpen /> Ir al foro
                </button>
              </div>

              <div className="news-grid">
                {COMMUNITY_NEWS.map((news) => (
                  <article key={news.id} className="news-card" style={{ '--news-accent': news.accent } as React.CSSProperties}>
                    <div className="news-card-media" style={{ background: news.accent }}>
                      <EmojiGlyph id={news.emoji} size={58} />
                      <span>{news.tag}</span>
                    </div>
                    <div className="news-card-body">
                      <strong>{news.title}</strong>
                      <p>{news.summary}</p>
                    </div>
                  </article>
                ))}
              </div>

              {suggested.length > 0 && (
                <section className="community-suggestions">
                  <div className="community-suggestions-head">
                    <div>
                      <span className="community-kicker">CONEXIONES</span>
                      <h2>
                        <Users /> Jugadores que quizá conozcas
                      </h2>
                      <p>Sugerencias basadas en amigos, grupos y actividad compartida.</p>
                    </div>
                  </div>
                  <div className="suggestion-grid">
                    {suggested.map((person) => (
                      <article key={person.gamertag} className="suggestion-card">
                        <SkinFace gamertag={person.gamertag} size={44} />
                        <div>
                          <strong>{person.gamertag}</strong>
                          <span>{person.reason}</span>
                        </div>
                        <button className="btn-ghost" onClick={() => onOpenProfile?.(person.gamertag)}>
                          Ver perfil
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {false && tab === 'forum' && (
            <div className="forum">
              <aside className="forum-categories">
                <div className={`forum-cat-row ${categoryId === GENERAL_CATEGORY_ID ? 'active' : ''}`}>
                  <button onClick={() => selectCategory(GENERAL_CATEGORY_ID)}>
                    <strong>General</strong>
                    <span>Recientes, destacadas y actividad</span>
                    {hasUnread(GENERAL_CATEGORY_ID) && (
                      <i
                        className="forum-unread"
                        style={{ background: prefs[GENERAL_CATEGORY_ID]?.dot || DEFAULT_CHANNEL_DOTS.general }}
                      />
                    )}
                  </button>
                  <label className="forum-dot-picker" title="Color del punto de novedad">
                    <Palette />
                    <input
                      type="color"
                      value={prefs[GENERAL_CATEGORY_ID]?.dot || DEFAULT_CHANNEL_DOTS.general}
                      onChange={(event) => setChannelDot(GENERAL_CATEGORY_ID, event.target.value)}
                    />
                  </label>
                </div>

                {FORUM_CHANNELS.map((channel) => (
                  <div key={channel.id} className={`forum-cat-row ${categoryId === channel.id ? 'active' : ''}`}>
                    <button onClick={() => selectCategory(channel.id)}>
                      <strong>{channel.label}</strong>
                      <span>{posts.filter((post) => post.categoryId === channel.id).length} publicaciones</span>
                      {hasUnread(channel.id) && (
                        <i
                          className="forum-unread"
                          style={{ background: prefs[channel.id]?.dot || DEFAULT_CHANNEL_DOTS[channel.id] }}
                        />
                      )}
                    </button>
                    <label className="forum-dot-picker" title="Color del punto de novedad">
                      <Palette />
                      <input
                        type="color"
                        value={prefs[channel.id]?.dot || DEFAULT_CHANNEL_DOTS[channel.id]}
                        onChange={(event) => setChannelDot(channel.id, event.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </aside>

              <div className="forum-content">
                {selectedPost ? (
                  <article className="forum-thread">
                    <button className="forum-back" onClick={() => setSelectedPostId(null)}>
                      <ArrowLeft /> Volver a {category.label}
                    </button>
                    <header className="forum-thread-head">
                      <div className="forum-post-head">
                        <span className="forum-badge">
                          {FORUM_CATEGORIES.find((item) => item.id === selectedPost.categoryId)?.label || 'General'}
                        </span>
                        {selectedPost.pinned && (
                          <span className="forum-pinned">
                            <Pin /> Fijada
                          </span>
                        )}
                        {selectedPost.resolved && (
                          <span className="forum-resolved">
                            <CheckCircle2 /> Resuelta
                          </span>
                        )}
                      </div>
                      <div className="forum-thread-actions">
                        <div className="more-menu">
                          <button className="more-btn" aria-label="Más opciones" onClick={(e) => {
                            e.stopPropagation()
                            const items = []
                            items.push({ label: hiddenPosts.has(selectedPost.id) ? 'Mostrar publicación' : 'Ocultar publicación', icon: contextMenuIcons.hide, onClick: () => hiddenPosts.has(selectedPost.id) ? unhidePost(selectedPost.id) : hidePost(selectedPost.id) })
                            items.push({ label: followedPosts.has(selectedPost.id) ? 'Dejar de seguir' : 'Seguir publicación', icon: contextMenuIcons.copy, onClick: () => toggleFollow(selectedPost.id) })
                            items.push({ label: 'Copiar enlace', icon: contextMenuIcons.copy, onClick: () => { try { navigator.clipboard.writeText(window.location.href) } catch {} } })
                            if(isAdmin) items.push({ label: selectedPost.pinned ? 'Desfijar publicación' : 'Fijar publicación', icon: selectedPost.pinned ? contextMenuIcons.unpin : contextMenuIcons.pin, onClick: () => togglePinPost(selectedPost.id) })
                            if(selectedPost.author.toLowerCase() !== gamertag.toLowerCase()) {
                              items.push({ label: 'Bloquear usuario', icon: contextMenuIcons.block, onClick: () => blockUser(selectedPost.author), danger: true })
                              items.push({ label: 'Reportar usuario', icon: contextMenuIcons.report, onClick: () => reportUser(selectedPost.author), danger: true })
                            }
                            setContextMenu({x: e.clientX, y: e.clientY, items})
                          }}>
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </div>
                    </header>

                    <div className="forum-thread-body">
                      <div className="forum-thread-avatar">
                        <SkinFace gamertag={selectedPost.author} size={40} />
                      </div>
                      <div className="forum-thread-content">
                        <div className="forum-thread-meta">
                          <button className="inline-profile" onClick={() => onOpenProfile?.(selectedPost.author)}>
                            {selectedPost.author}
                          </button>
                          <time>{formatRelative(selectedPost.createdAt)}</time>
                        </div>
                        <h2 style={{ margin: 0, fontSize: 18 }}>{selectedPost.title}</h2>
                        <div className="forum-thread-text">
                          <EmojiText text={selectedPost.body} />
                        </div>
                        {selectedPost.media &&
                          (isVideoMedia(selectedPost.media) ? (
                            <video className="forum-media" src={selectedPost.media} controls />
                          ) : (
                            <img
                              className="forum-media"
                              src={selectedPost.media}
                              alt={`Contenido de ${selectedPost.title}`}
                              onClick={() => window.open(selectedPost.media, '_blank')}
                            />
                          ))}
                        <div className="forum-post-actions">
                          <EmojiReactions targetId={`forum:post:${selectedPost.id}`} user={gamertag} />
                          <div className="forum-post-buttons">
                            {selectedPost.categoryId === 'help' && (
                              <button className="btn-ghost" onClick={() => toggleResolved(selectedPost.id)}>
                                <CheckCircle2 /> {selectedPost.resolved ? 'Marcar como no resuelta' : 'Marcar como resuelta'}
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn-ghost" onClick={() => togglePinPost(selectedPost.id)}>
                                {selectedPost.pinned ? <PinOff /> : <Pin />}
                                {selectedPost.pinned ? 'Desfijar publicación' : 'Fijar publicación'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="forum-participants">
                      <Users size={14} />
                      <span>Participantes</span>
                      <div className="forum-participants-list">
                        {[selectedPost.author, ...selectedPost.comments.map(c => c.author)].slice(0, 6).map((author, idx) => (
                          <SkinFace key={idx} gamertag={author} size={22} />
                        ))}
                      </div>
                    </div>

                    <h3 className="forum-comments-title">
                      <MessageSquare /> Respuestas ({selectedPost.comments.length})
                    </h3>
                    <div className="forum-thread-replies">
                      {selectedPost.comments.length === 0 && (
                        <p className="forum-empty">Todavía no hay respuestas. Sé el primero en participar.</p>
                      )}
                      {selectedPost.comments.map((comment) => (
                        <div key={comment.id} className={`forum-thread-reply ${comment.pinned ? 'pinned' : ''}`} onContextMenu={(e) => {
                          e.preventDefault()
                          const items = []
                          items.push({ label: 'Copiar', icon: contextMenuIcons.copy, onClick: () => { try { navigator.clipboard.writeText(comment.text) } catch {} } })
                          if(comment.author.toLowerCase() === gamertag.toLowerCase()) {
                            items.push({ label: 'Eliminar mensaje', icon: contextMenuIcons.delete, onClick: () => {
                              commitPosts(posts.map(p => p.id === selectedPost.id ? {...p, comments: p.comments.filter(c=>c.id!==comment.id)} : p))
                            }, danger: true })
                          }
                          if(selectedPost.author.toLowerCase() !== gamertag.toLowerCase() && comment.author.toLowerCase() !== gamertag.toLowerCase()) {
                            items.push({ label: 'Bloquear usuario', icon: contextMenuIcons.block, onClick: () => blockUser(comment.author), danger: true })
                            items.push({ label: 'Reportar usuario', icon: contextMenuIcons.report, onClick: () => reportUser(comment.author), danger: true })
                          }
                          setContextMenu({x: e.clientX, y: e.clientY, items})
                        }}>
                          <div className="forum-thread-avatar">
                            <SkinFace gamertag={comment.author} size={34} />
                          </div>
                          <div className="forum-thread-content">
                            <div className="forum-thread-meta">
                              <button className="inline-profile" onClick={() => onOpenProfile?.(comment.author)}>
                                {comment.author}
                              </button>
                              <time>{formatRelative(comment.createdAt)}</time>
                              {comment.pinned && <Pin size={10} />}
                            </div>
                            <div className="forum-thread-text">
                              <EmojiText text={comment.text} />
                            </div>
                            <div className="forum-comment-tools">
                              <EmojiReactions targetId={`forum:comment:${comment.id}`} user={gamertag} />
                              {isAdmin && (
                                <button
                                  className="chat-pin-btn"
                                  onClick={() => togglePinComment(selectedPost.id, comment.id)}
                                  title={comment.pinned ? 'Desfijar respuesta' : 'Fijar respuesta'}
                                >
                                  {comment.pinned ? <PinOff /> : <Pin />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="forum-comment-form">
                      <div className="forum-comment-input">
                        <input
                          value={commentDraft}
                          onChange={(event) => setCommentDraft(event.target.value)}
                          placeholder="Escribe una respuesta…"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') submitComment()
                          }}
                        />
                        <div className="chat-emoji-wrap">
                          <button
                            type="button"
                            className="chat-emoji-btn"
                            onClick={() => setCommentEmoji((current) => !current)}
                            aria-label="Insertar emoji EKO"
                          >
                            <SmilePlus />
                          </button>
                          {commentEmoji && (
                            <EmojiPicker
                              compact
                              className="emoji-popover chat-emoji-popover"
                              onPick={(emojiId) => {
                                setCommentDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}:${emojiId}:`)
                                setCommentEmoji(false)
                              }}
                              onClose={() => setCommentEmoji(false)}
                            />
                          )}
                        </div>
                        <button type="button" className="btn-primary" onClick={submitComment}>
                          <Send /> Enviar
                        </button>
                      </div>
                    </div>
                  </article>
                ) : showForm ? (
                  <div className="forum-form">
                    <button className="forum-back" onClick={() => setShowForm(false)}>
                      <ArrowLeft /> Cancelar
                    </button>
                    <h2>Nueva publicación en {category.label}</h2>
                    <p className="forum-category-desc">{category.description}</p>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título de la publicación" />
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Cuenta los detalles, tu jugada o tu pregunta…"
                      rows={6}
                    />
                    <div className="forum-media-picker">
                      <button type="button" className="btn-ghost" onClick={() => postFileRef.current?.click()}>
                        <ImagePlus /> Imagen del dispositivo
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => postVideoRef.current?.click()}>
                        <Upload /> Vídeo corto
                      </button>
                      <input ref={postFileRef} type="file" accept="image/*" hidden onChange={(event) => uploadPostMedia(event.target.files?.[0] || null)} />
                      <input ref={postVideoRef} type="file" accept="video/*" hidden onChange={(event) => uploadPostVideo(event.target.files?.[0] || null)} />
                    </div>
                    <input
                      value={mediaUrl}
                      onChange={(event) => {
                        setMediaUrl(event.target.value)
                        setMedia('')
                      }}
                      placeholder="O pega un enlace de imagen o vídeo (opcional)"
                    />
                    {(media || mediaUrl) && (
                      <div className="forum-media-preview">
                        {isVideoMedia(media || mediaUrl) ? (
                          <video src={media || mediaUrl} controls />
                        ) : (
                          <img src={media || mediaUrl} alt="Vista previa" />
                        )}
                      </div>
                    )}
                    {formError && <p className="settings-error">{formError}</p>}
                    <div className="forum-form-actions">
                      <button className="btn-ghost" onClick={() => setShowForm(false)}>
                        Cancelar
                      </button>
                      <button className="btn-primary" onClick={submitPost} disabled={!title.trim() || !body.trim()}>
                        <Plus /> Publicar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="forum-category-head">
                      <div>
                        <h2>{category.label}</h2>
                        <p>{category.description}</p>
                        {categoryId === GENERAL_CATEGORY_ID ? (
                          <div className="segmented small forum-general-filter">
                            <button
                              className={generalFilter === 'recent' ? 'active' : ''}
                              onClick={() => setGeneralFilter('recent')}
                            >
                              Recientes
                            </button>
                            <button
                              className={generalFilter === 'featured' ? 'active' : ''}
                              onClick={() => setGeneralFilter('featured')}
                            >
                              Destacadas
                            </button>
                            <button
                              className={generalFilter === 'active' ? 'active' : ''}
                              onClick={() => setGeneralFilter('active')}
                            >
                              Más actividad
                            </button>
                          </div>
                        ) : (
                          <ul>
                            {category.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <Plus /> Nueva publicación
                      </button>
                    </div>

                    <div className="forum-posts">
                      {categoryPosts.length === 0 && (
                        <div className="forum-empty-state">
                          <Newspaper />
                          <strong>Este canal está esperando su primera publicación</strong>
                          <span>Sé quien abra la conversación y comparte algo con la comunidad.</span>
                        </div>
                      )}
                      {categoryPosts.map((post) => {
                        const postCategory = FORUM_CATEGORIES.find((item) => item.id === post.categoryId)
                        return (
                          <button key={post.id} className="forum-post-card" onClick={() => setSelectedPostId(post.id)}>
                            <div className="forum-post-card-head">
                              <span className="forum-badge">{postCategory?.label || 'General'}</span>
                              {post.pinned && (
                                <span className="forum-pinned">
                                  <Pin /> Fijada
                                </span>
                              )}
                              {post.resolved && (
                                <span className="forum-resolved">
                                  <CheckCircle2 /> Resuelta
                                </span>
                              )}
                            </div>
                            <strong>{post.title}</strong>
                            <p>{post.body.length > 150 ? `${post.body.slice(0, 150)}…` : post.body}</p>
                            {post.media && (
                              <div className="forum-card-media">
                                {isVideoMedia(post.media) ? (
                                  <video src={post.media} muted preload="metadata" />
                                ) : (
                                  <img src={post.media} alt="" loading="lazy" />
                                )}
                                <span>{isVideoMedia(post.media) ? 'Vídeo' : 'Imagen'}</span>
                              </div>
                            )}
                            <span className="forum-meta">
                              {post.author} · {formatRelative(post.createdAt)} · {post.comments.length} respuestas
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {(tab === 'bazaar' || true) && (
            <div className="bazaar">
              <div className="bazaar-head">
                <div>
                  <span className="community-kicker">MERCADO DE LA COMUNIDAD</span>
                  <h2>EKO Bazaar</h2>
                  <p>
                    Add-ons, mapas y recursos. Requiere enlace a Patreon para publicar.
                    {!isAdmin && ' Solo el staff de EKO puede publicar artículos.'}
                  </p>
                </div>
                <div className="bazaar-head-actions">
                  {isAdmin && (
                    <button className="btn-primary" onClick={() => setShowBazaarForm((value) => !value)}>
                      <Plus /> Publicar artículo
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => openExternal('https://www.patreon.com/ekoclient')}>
                    <ExternalLink /> Ver Patreon
                  </button>
                </div>
              </div>

              {isAdmin && showBazaarForm && (
                <section className="bazaar-form">
                  <h3>Nuevo artículo</h3>
                  <div className="bazaar-form-grid">
                    <input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Nombre del artículo" />
                    <input value={itemTag} onChange={(event) => setItemTag(event.target.value)} placeholder="Etiqueta (Add-on, Mapa…)" />
                  </div>
                  <textarea
                    rows={3}
                    value={itemDescription}
                    onChange={(event) => setItemDescription(event.target.value)}
                    placeholder="Describe qué incluye y para qué versión de Bedrock sirve…"
                  />
                  <input value={itemPrice} onChange={(event) => { setItemPrice(event.target.value); setBazaarError('') }} placeholder="Precio (texto que verán los jugadores)" />

                  <div className="bazaar-form-section">
                    <span>Enlace de Patreon (obligatorio)</span>
                    <input value={itemPatreon} onChange={(event) => { setItemPatreon(event.target.value); setBazaarError('') }} placeholder="https://www.patreon.com/tu-enlace" />
                  </div>

                  <div className="bazaar-form-section">
                    <span>Banner del artículo (sube una imagen desde tu dispositivo)</span>
                    <div className="bazaar-form-row">
                      <label className="btn-ghost server-upload" style={{ cursor: 'pointer' }}>
                        <ImagePlus /> Subir banner
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={async (event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            try {
                              setBazaarError('')
                              setItemBannerFile(await prepareImage(file, 720 * 1024))
                              setItemBanner('')
                            } catch (err) {
                              setBazaarError(err instanceof Error ? err.message : 'No se pudo usar la imagen.')
                            }
                          }}
                        />
                      </label>
                      {(itemBannerFile || itemBanner) && (
                        <button type="button" className="btn-ghost" onClick={() => { setItemBanner(''); setItemBannerFile('') }}>
                          Quitar banner
                        </button>
                      )}
                    </div>
                    {(itemBannerFile || itemBanner) && (
                      <div className="bazaar-banner-preview">
                        <img src={itemBannerFile || itemBanner} alt="Vista previa del banner" />
                      </div>
                    )}
                  </div>

                  <div className="bazaar-form-section">
                    <span>Fondo degradado</span>
                    <div className="bazaar-presets">
                      {BAZAAR_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={itemPreset === preset.id ? 'active' : ''}
                          style={{ background: preset.gradient }}
                          onClick={() => setItemPreset(preset.id)}
                          title={preset.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="bazaar-form-section">
                    <span>Icono central</span>
                    <div className="bazaar-icon-options">
                      <button
                        type="button"
                        className={`bazaar-icon-choice ${!itemIcon ? 'active' : ''}`}
                        onClick={() => setItemIcon('')}
                      >
                        <EmojiGlyph id={itemEmoji} size={36} /> Emoji EKO
                      </button>
                      <button
                        type="button"
                        className="bazaar-icon-choice"
                        onClick={() => setItemEmojiOpen((value) => !value)}
                      >
                        <SmilePlus /> Elegir emoji
                      </button>
                      <button type="button" className="bazaar-icon-choice" onClick={() => itemFileRef.current?.click()}>
                        <ImagePlus /> Imagen propia
                      </button>
                      <input ref={itemFileRef} type="file" accept="image/*" hidden onChange={(event) => uploadItemIcon(event.target.files?.[0] || null)} />
                    </div>
                    {itemIcon && (
                      <div className="bazaar-icon-preview">
                        <img src={itemIcon} alt="Icono del artículo" />
                        <button type="button" className="btn-ghost" onClick={() => setItemIcon('')}>
                          Quitar imagen
                        </button>
                      </div>
                    )}
                    {itemEmojiOpen && (
                      <EmojiPicker
                        compact
                        onPick={(emojiId) => {
                          setItemEmoji(emojiId)
                          setItemIcon('')
                          setItemEmojiOpen(false)
                        }}
                        onClose={() => setItemEmojiOpen(false)}
                      />
                    )}
                  </div>

                  {bazaarError && <p className="settings-error">{bazaarError}</p>}
                  <div className="forum-form-actions">
                    <button className="btn-ghost" onClick={() => setShowBazaarForm(false)}>
                      Cancelar
                    </button>
                    <button className="btn-primary" onClick={publishItem} disabled={!itemName.trim() || !itemDescription.trim() || !(editingItem ? itemPrice.trim() : itemPatreon.trim()).toLowerCase().includes('patreon')}>
                      <Plus /> Publicar
                    </button>
                  </div>
                </section>
              )}

              {sortedBazaar.length === 0 ? (
                <div className="forum-empty-state">
                  <ShoppingBag />
                  <strong>El Bazaar está vacío</strong>
                  <span>Publica el primer artículo con tu propio estilo.</span>
                </div>
              ) : (
                <div className={`bazaar-grid ${sortedBazaar.some((entry) => entry.pinned) ? 'has-pinned' : ''}`}>
                  {sortedBazaar.map((item) => {
                    const bannerImage = (item as any).banner as string | undefined
                    return (
                    <article key={item.id} className={`bazaar-card ${item.pinned ? 'pinned' : ''}`} onContextMenu={(e) => {
                      e.preventDefault()
                      if(!isAdmin) return
                      removeFloatingMenus()
                      const menu = document.createElement('div')
                      menu.setAttribute('data-eko-ctx','1')
                      menu.style.cssText = 'position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;background:rgba(12,9,18,.98);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px;z-index:200;display:flex;flex-direction:column;gap:2px;min-width:150px'
                      if(isAdmin) {
                        const pin = document.createElement('button'); pin.textContent = item.pinned ? 'Quitar destacado' : 'Destacar'; pin.style.cssText='padding:8px 10px;text-align:left;color:#c9bcd6;background:transparent;font-size:12px'
                        pin.onclick = ()=>{ togglePinItem(item.id); document.body.removeChild(menu) }
                        menu.appendChild(pin)
                      }
                      if(isAdmin) {
                        const edit = document.createElement('button'); edit.textContent = 'Editar artículo'; edit.style.cssText='padding:8px 10px;text-align:left;color:#c9bcd6;background:transparent;font-size:12px'
                        edit.onclick = ()=>{ startEditItem(item); document.body.removeChild(menu) }
                        menu.appendChild(edit)
                        const del = document.createElement('button'); del.textContent = 'Eliminar artículo'; del.style.cssText='padding:8px 10px;text-align:left;color:#ff9c9c;background:transparent;font-size:12px'
                        del.onclick = ()=>{ commitBazaar(bazaar.filter(b=>b.id!==item.id)); document.body.removeChild(menu) }
                        menu.appendChild(del)
                      }
                      document.body.appendChild(menu)
                      const close=()=>{try{document.body.removeChild(menu)}catch{} document.removeEventListener('click',close)}
                      setTimeout(()=>document.addEventListener('click',close),0)
                    }}>
                      {item.pinned && <span className="bazaar-fire" aria-hidden="true" />}
                      <div
                        className={`bazaar-banner ${bannerImage ? 'has-image' : 'is-color'}`}
                        style={bannerImage ? undefined : { backgroundImage: item.accent }}
                      >
                        {bannerImage && (
                          <div
                            className="bazaar-banner-bg"
                            style={{ backgroundImage: `url(${bannerImage})` }}
                            aria-hidden="true"
                          />
                        )}
                        <div className="bazaar-banner-content">
                          {item.icon ? (
                            <img className="bazaar-banner-icon" src={item.icon} alt="" />
                          ) : item.emoji ? (
                            <EmojiGlyph id={item.emoji} size={54} />
                          ) : null}
                          <span>{item.tag}</span>
                          {item.pinned && (
                            <em className="bazaar-pin">
                              <Pin /> Destacado
                            </em>
                          )}
                        </div>
                      </div>
                      <div className="bazaar-card-body">
                        <strong>{item.name}</strong>
                        <p>{item.description}</p>
                        <span className="bazaar-price">{item.price}</span>
                        <div className="bazaar-actions">
                          {item.patreon ? (
                            <button className="btn-primary" onClick={() => openExternal(item.patreon || '')}>
                              <ExternalLink /> Comprar en Patreon
                            </button>
                          ) : (
                            <span className="bazaar-contact">Contacta al staff de EKO</span>
                          )}
                        </div>
                        <EmojiReactions targetId={`bazaar:${item.id}`} user={gamertag} />
                      </div>
                    </article>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
