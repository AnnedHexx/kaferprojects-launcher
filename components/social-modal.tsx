'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy,
  Edit,
  Flag,
  ImagePlus,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Send,
  SmilePlus,
  Trash2,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  Video,
  X,
} from 'lucide-react'
import { EmojiPicker } from '@/components/emoji-picker'
import { EmojiReactions } from '@/components/emoji-reactions'
import { EmojiText } from '@/components/emoji-text'
import { SkinFace } from '@/components/skin-face'
import { ContextMenu, contextMenuIcons } from '@/components/context-menu'
import {
  ChatMessage,
  Friend,
  createFriendId,
  createMessageId,
  loadFriends,
  loadMessages,
  saveFriends,
  saveMessages,
  statusLabel,
} from '@/lib/social-store'
import { prepareImage } from '@/lib/media'
import { notifyIncomingMessage } from '@/lib/notifications'
import { useClosing } from '@/lib/use-closing'

type ChatModalProps = {
  gamertag: string
  isAdmin: boolean
  xuid?: string
  localSkin?: string | null
  skinTextureUrl?: string
  onClose: () => void
  onOpenProfile?: (gamertag: string) => void
  initialChat?: string
}

function nowTime() {
  return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function ChatModal({
  gamertag,
  isAdmin,
  xuid,
  localSkin,
  skinTextureUrl,
  onClose,
  onOpenProfile,
  initialChat,
}: ChatModalProps) {
  const { closing, requestClose } = useClosing(onClose)
  const [friends, setFriends] = useState<Friend[]>(() => loadFriends())
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => loadMessages())
  const [selected, setSelected] = useState<string | null>(() => {
    const list = loadFriends()
    if (initialChat) {
      const match = list.find((friend) => friend.gamertag.toLowerCase() === initialChat.toLowerCase())
      if (match) return match.id
    }
    return list[0]?.id || null
  })
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [tab, setTab] = useState<'friends' | 'add'>('friends')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [imageError, setImageError] = useState('')
  const [newGroup, setNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<{x:number,y:number,items:any[]} | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { const raw = localStorage.getItem('eko.blocked'); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
  })
  const [editingMsg, setEditingMsg] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [mutedChats, setMutedChats] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { const raw = localStorage.getItem('eko.chat.muted'); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
  })
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { const raw = localStorage.getItem('eko.chat.pinned'); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
  })
  function savePinned() { try { localStorage.setItem('eko.chat.pinned', JSON.stringify(Array.from(pinnedChats))) } catch {} }
  function saveMuted() { try { localStorage.setItem('eko.chat.muted', JSON.stringify(Array.from(mutedChats))) } catch {} }
  const [hiddenChats, setHiddenChats] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { const raw = localStorage.getItem('eko.chat.hidden'); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
  })
  const [showGroupInfo, setShowGroupInfo] = useState(false)

  const activeFriend = friends.find((friend) => friend.id === selected) || null
  const activeMessages = (activeFriend && messages[activeFriend.id]) || []
  const pinned = activeMessages.filter((message) => message.pinned)
  const canPin = Boolean(isAdmin || (activeFriend?.group && activeFriend.owner))
  const refreshKey = useMemo(() => Date.now(), [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages.length, selected])

  useEffect(() => {
    if (!query.trim()) {
      setSearchResult(null)
      return
    }
    const timer = window.setTimeout(() => setSearchResult(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onIncoming(event: Event) {
      const detail = (event as CustomEvent<{
        friendId?: string
        gamertag?: string
        text: string
        image?: string
      }>).detail
      if (!detail?.text && !detail?.image) return
      const author = detail.gamertag || 'Jugador'
      let friend = friends.find((item) => item.id === detail.friendId || item.gamertag.toLowerCase() === author.toLowerCase())
      let nextFriends = friends
      if (!friend) {
        friend = { id: createFriendId(), gamertag: author, status: 'offline' }
        nextFriends = [...friends, friend]
        setFriends(nextFriends)
        saveFriends(nextFriends)
      }
      const message: ChatMessage = {
        id: createMessageId(),
        author: 'them',
        gamertag: author,
        text: detail.text || '',
        image: detail.image,
        time: nowTime(),
      }
      setHiddenChats((current) => {
        if (!current.has(friend!.id)) return current
        const n = new Set(current)
        n.delete(friend!.id)
        try { localStorage.setItem('eko.chat.hidden', JSON.stringify(Array.from(n))) } catch {}
        return n
      })
      setMessages((current) => {
        const next = { ...current, [friend!.id]: [...(current[friend!.id] || []), message] }
        saveMessages(next)
        return next
      })
      notifyIncomingMessage({
        title: friend.group ? `${author} en ${friend.gamertag}` : `${author} te ha escrito`,
        body: detail.text || 'Te ha enviado una imagen',
        gamertag: author,
        friendId: friend.id,
      })
    }
    window.addEventListener('eko:social:incoming', onIncoming)
    return () => window.removeEventListener('eko:social:incoming', onIncoming)
  }, [friends])

  function commitFriends(next: Friend[]) {
    setFriends(next)
    saveFriends(next)
  }

  function commitMessages(next: Record<string, ChatMessage[]>) {
    setMessages(next)
    saveMessages(next)
  }

  function sendMessage(image?: string) {
    if (!activeFriend) return
    const text = draft.trim()
    if (!text && !image) return
    const message: ChatMessage = {
      id: createMessageId(),
      author: 'me',
      gamertag: gamertag || 'Yo',
      text,
      image,
      time: nowTime(),
    }
    commitMessages({ ...messages, [activeFriend.id]: [...(messages[activeFriend.id] || []), message] })
    setDraft('')
    setEmojiOpen(false)
  }

  async function uploadImage(file: File | null) {
    if (!file) return
    try {
      setImageError('')
      const dataUrl = await prepareImage(file, 900 * 1024)
      sendMessage(dataUrl)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No se pudo enviar la imagen.')
    }
  }

  async function uploadVideo(file: File | null) {
    if (!file) return
    try {
      setImageError('')
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        if (!activeFriend) return
        const message: ChatMessage = {
          id: createMessageId(),
          author: 'me',
          gamertag: gamertag || 'Yo',
          text: draft.trim(),
          image: dataUrl,
          time: nowTime(),
        }
        commitMessages({ ...messages, [activeFriend.id]: [...(messages[activeFriend.id] || []), message] })
        setDraft('')
        setEmojiOpen(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No se pudo enviar el video.')
    }
  }

  function addFriend(tag: string) {
    const clean = tag.trim()
    if (!clean) return
    const existing = friends.find((friend) => friend.gamertag.toLowerCase() === clean.toLowerCase())
    if (existing) {
      setSelected(existing.id)
      setTab('friends')
      setQuery('')
      setSearchResult(null)
      return
    }
    const friend: Friend = { id: createFriendId(), gamertag: clean, status: 'offline' }
    commitFriends([...friends, friend])
    setSelected(friend.id)
    setQuery('')
    setSearchResult(null)
    setTab('friends')
  }

  function createGroup() {
    const name = groupName.trim()
    if (!name) return
    const group: Friend = {
      id: `group-${Date.now()}`,
      gamertag: name,
      status: 'online',
      group: true,
      owner: true,
      memberCount: groupMembers.length + 1,
      createdAt: new Date().toISOString(),
      description: groupDescription.trim() || undefined,
    }
    commitFriends([...friends, group])
    setSelected(group.id)
    setGroupName('')
    setGroupMembers([])
    setNewGroup(false)
    setTab('friends')
  }

  function togglePin(messageId: string) {
    if (!activeFriend || !canPin) return
    const next = {
      ...messages,
      [activeFriend.id]: (messages[activeFriend.id] || []).map((message) =>
        message.id === messageId ? { ...message, pinned: !message.pinned } : message,
      ),
    }
    commitMessages(next)
  }

  function insertEmoji(emojiId: string) {
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}:${emojiId}:`)
    setEmojiOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={requestClose}>
      <section className="social-modal" onClick={(event) => event.stopPropagation()} aria-label="Chats de KaferProjects Launcher">
        <button className="modal-close" onClick={requestClose} aria-label="Cerrar chats">
          <X />
        </button>

        <aside className="social-sidebar">
          <div className="social-me">
            <SkinFace
              gamertag={gamertag}
              xuid={xuid}
              localSkin={localSkin}
              skinTextureUrl={skinTextureUrl}
              refreshKey={refreshKey}
              size={46}
            />
            <div>
              <strong>{gamertag || 'Jugador'}</strong>
              <span className="social-online">En línea</span>
            </div>
          </div>

          <div className="social-tabs">
            <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>
              <MessageSquare /> Chats <b>{friends.length}</b>
            </button>
            <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
              <UserPlus /> Añadir
            </button>
          </div>

          {tab === 'friends' && (
            <>
              <div className="social-quick-actions">
                <button className="btn-ghost" onClick={() => setNewGroup((value) => !value)}>
                  <Users /> {newGroup ? 'Cancelar grupo' : 'Crear grupo'}
                </button>
              </div>

              {newGroup && (
                <div className="social-group-form">
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Nombre del grupo"
                    maxLength={32}
                  />
                  <input
                    value={groupDescription}
                    onChange={(event) => setGroupDescription(event.target.value)}
                    placeholder="Descripción del grupo (opcional)"
                    maxLength={120}
                  />
                  <span>Miembros ({groupMembers.length})</span>
                  <div className="social-group-members">
                    {friends.filter((friend) => !friend.group).length === 0 && <p>Todavía no tienes amigos para añadir.</p>}
                    {friends
                      .filter((friend) => !friend.group)
                      .map((friend) => (
                        <label key={friend.id}>
                          <input
                            type="checkbox"
                            checked={groupMembers.includes(friend.id)}
                            onChange={(event) => {
                              setGroupMembers((current) =>
                                event.target.checked
                                  ? [...current, friend.id]
                                  : current.filter((id) => id !== friend.id),
                              )
                            }}
                          />
                          {friend.gamertag}
                        </label>
                      ))}
                  </div>
                  <button className="btn-primary" onClick={createGroup} disabled={!groupName.trim()}>
                    <Users /> Crear grupo
                  </button>
                </div>
              )}

              <ul className="social-list">
                {friends.length === 0 && (
                  <li className="social-empty">
                    <MessageSquare />
                    <strong>Aún no tienes chats</strong>
                    <span>Añade a un amigo por su gamertag para empezar.</span>
                  </li>
                )}
                {friends
                  .filter((friend) => !hiddenChats.has(friend.id))
                  .sort((a, b) => Number(pinnedChats.has(b.id)) - Number(pinnedChats.has(a.id)))
                  .map((friend) => (
                  <li key={friend.id}>
                    <button
                      className={selected === friend.id ? 'active' : ''}
                      onClick={() => setSelected(friend.id)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        const isCreator = Boolean(friend.group && friend.owner)
                        const items: any[] = []
                        items.push({
                          label: mutedChats.has(friend.id) ? 'Dejar de silenciar' : 'Silenciar',
                          icon: contextMenuIcons.mute,
                          onClick: () => {
                            setMutedChats((current) => {
                              const n = new Set(current)
                              if (n.has(friend.id)) n.delete(friend.id)
                              else n.add(friend.id)
                              try { localStorage.setItem('eko.chat.muted', JSON.stringify(Array.from(n))) } catch {}
                              return n
                            })
                          },
                        })
                        items.push({
                          label: pinnedChats.has(friend.id) ? 'Desfijar' : 'Fijar arriba',
                          icon: contextMenuIcons.pin,
                          onClick: () => {
                            setPinnedChats((current) => {
                              const n = new Set(current)
                              if (n.has(friend.id)) n.delete(friend.id)
                              else n.add(friend.id)
                              try { localStorage.setItem('eko.chat.pinned', JSON.stringify(Array.from(n))) } catch {}
                              return n
                            })
                          },
                        })
                        if (friend.group) {
                          if (isCreator) {
                            items.push({
                              label: 'Eliminar grupo',
                              icon: contextMenuIcons.delete,
                              danger: true,
                              onClick: () => {
                                const nextFriends = friends.filter((f) => f.id !== friend.id)
                                const nextMessages = { ...messages }
                                delete nextMessages[friend.id]
                                commitFriends(nextFriends)
                                commitMessages(nextMessages)
                                if (selected === friend.id) setSelected(nextFriends[0]?.id || null)
                              },
                            })
                          } else {
                            items.push({
                              label: 'Salir del grupo',
                              icon: contextMenuIcons.delete,
                              danger: true,
                              onClick: () => {
                                const nextFriends = friends.filter((f) => f.id !== friend.id)
                                const nextMessages = { ...messages }
                                delete nextMessages[friend.id]
                                commitFriends(nextFriends)
                                commitMessages(nextMessages)
                                if (selected === friend.id) setSelected(nextFriends[0]?.id || null)
                              },
                            })
                          }
                        } else {
                          items.push({
                            label: 'Cerrar chat',
                            icon: contextMenuIcons.delete,
                            danger: true,
                            onClick: () => {
                              setHiddenChats((current) => {
                                const n = new Set(current)
                                n.add(friend.id)
                                try { localStorage.setItem('eko.chat.hidden', JSON.stringify(Array.from(n))) } catch {}
                                return n
                              })
                              if (selected === friend.id) setSelected(null)
                            },
                          })
                        }
                        setContextMenu({ x: event.clientX, y: event.clientY, items })
                      }}
                      onDoubleClick={() => !friend.group && onOpenProfile?.(friend.gamertag)}
                    >
                      <span className={`friend-avatar ${friend.status}`}>
                        {friend.group ? (
                          <span className="friend-group">
                            <Users />
                          </span>
                        ) : (
                          <SkinFace gamertag={friend.gamertag} refreshKey={refreshKey} size={40} />
                        )}
                      </span>
                      <span className="friend-info">
                        <strong>{friend.gamertag}{mutedChats.has(friend.id) ? ' 🔕' : ''}{pinnedChats.has(friend.id) ? ' 📌' : ''}</strong>
                        <span className={`friend-status ${friend.status}`}>
                          {friend.group
                            ? `Chat grupal · ${friend.memberCount || 1} miembros`
                            : friend.status === 'playing'
                              ? `Jugando · ${friend.playing}`
                              : statusLabel(friend.status)}
                        </span>
                      </span>
                      {(messages[friend.id] || []).some((message) => message.pinned) && <Pin className="friend-pin" />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'add' && (
            <div className="social-add">
              <div className="input-wrap">
                <Search />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gamertag de Bedrock" />
              </div>
              {searchResult && (
                <div className="search-result">
                  <SkinFace gamertag={searchResult} refreshKey={refreshKey} size={44} />
                  <div>
                    <strong>{searchResult}</strong>
                    <span>Cara de la skin</span>
                  </div>
                  <button className="btn-primary" onClick={() => addFriend(searchResult)}>
                    <UserPlus /> Añadir
                  </button>
                </div>
              )}
              {!searchResult && <p className="social-hint">Escribe un gamertag para buscar su skin y abrir un chat.</p>}
            </div>
          )}
        </aside>

        <div className="social-chat">
          {activeFriend ? (
            <>
              <header className="chat-head">
                {activeFriend.group ? (
                  <span className="friend-group large">
                    <Users />
                  </span>
                ) : (
                  <button className="chat-head-profile" onClick={() => onOpenProfile?.(activeFriend.gamertag)} title="Ver perfil">
                    <SkinFace gamertag={activeFriend.gamertag} refreshKey={refreshKey} size={40} />
                  </button>
                )}
                <div>
                  <strong
                    onClick={() => activeFriend.group && setShowGroupInfo((v) => !v)}
                    style={activeFriend.group ? { cursor: 'pointer', textDecoration: 'underline dotted' } : undefined}
                  >
                    {activeFriend.gamertag}
                  </strong>
                  <span className={`friend-status ${activeFriend.status}`}>
                    {activeFriend.group
                      ? `Chat grupal · ${activeFriend.memberCount || 1} miembros${activeFriend.owner ? ' · Tú lo creaste' : ''}`
                      : activeFriend.status === 'playing'
                        ? `Jugando · ${activeFriend.playing}`
                        : statusLabel(activeFriend.status)}
                  </span>
                </div>
                <span className="chat-head-spacer" />
                {activeFriend.group && (
                  <button className="btn-ghost" onClick={() => setShowGroupInfo((v) => !v)}>
                    <Users /> Info del grupo
                  </button>
                )}
                {!activeFriend.group && (
                  <button className="btn-ghost" onClick={() => onOpenProfile?.(activeFriend.gamertag)}>
                    <MessageSquare /> Perfil
                  </button>
                )}
              </header>

              {activeFriend.group && showGroupInfo && (
                <div className="chat-group-info">
                  <div className="chat-group-head">
                    <strong>{activeFriend.gamertag}</strong>
                    <span>{activeFriend.memberCount || 1} miembros · {activeFriend.owner ? 'Tú lo creaste' : 'Miembro'}</span>
                  </div>
                  <p className="chat-group-desc">{activeFriend.description || 'Sin descripción del grupo.'}</p>
                  <div className="chat-group-actions">
                    <button className="btn-ghost" onClick={() => {
                      setMutedChats((current) => {
                        const n = new Set(current)
                        if (n.has(activeFriend.id)) n.delete(activeFriend.id)
                        else n.add(activeFriend.id)
                        try { localStorage.setItem('eko.chat.muted', JSON.stringify(Array.from(n))) } catch {}
                        return n
                      })
                    }}>
                      {mutedChats.has(activeFriend.id) ? '🔔 Dejar de silenciar' : '🔕 Silenciar grupo'}
                    </button>
                    {activeFriend.owner ? (
                      <button className="btn-ghost danger" onClick={() => {
                        const nextFriends = friends.filter((f) => f.id !== activeFriend.id)
                        const nextMessages = { ...messages }
                        delete nextMessages[activeFriend.id]
                        commitFriends(nextFriends)
                        commitMessages(nextMessages)
                        setShowGroupInfo(false)
                        setSelected(nextFriends[0]?.id || null)
                      }}>
                        <Trash2 /> Eliminar grupo
                      </button>
                    ) : (
                      <button className="btn-ghost danger" onClick={() => {
                        const nextFriends = friends.filter((f) => f.id !== activeFriend.id)
                        const nextMessages = { ...messages }
                        delete nextMessages[activeFriend.id]
                        commitFriends(nextFriends)
                        commitMessages(nextMessages)
                        setShowGroupInfo(false)
                        setSelected(nextFriends[0]?.id || null)
                      }}>
                        <UserMinus /> Salir del grupo
                      </button>
                    )}
                  </div>
                  <div className="chat-group-members">
                    <span>
                      <Users /> Miembros ({activeFriend.memberCount || 1})
                    </span>
                    <ul>
                      <li>
                        <SkinFace gamertag={gamertag} xuid={xuid} localSkin={localSkin} skinTextureUrl={skinTextureUrl} refreshKey={refreshKey} size={30} />
                        <span>{gamertag || 'Tú'} (tú)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {pinned.length > 0 && (
                <div className="chat-pins">
                  <Pin />
                  <div>
                    {pinned.map((message) => (
                      <p key={message.id}>
                        <strong>{message.gamertag}:</strong>{' '}
                        {message.image && !message.text ? 'Imagen fijada' : <EmojiText text={message.text} />}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="chat-body">
                {activeMessages.length === 0 && (
                  <p className="chat-empty">
                    Aún no hay mensajes con {activeFriend.gamertag}.{activeFriend.group ? ' Invita a tus amigos y empieza la conversación.' : ''}
                  </p>
                )}
                {activeMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message ${message.author === 'me' ? 'mine' : ''}`}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (blockedUsers.has(message.gamertag.toLowerCase())) return
                      const items: any[] = []
                      items.push({ label: 'Copiar', icon: contextMenuIcons.copy, onClick: () => { try { navigator.clipboard.writeText(message.text || '') } catch {} } })
                      if (message.image && (message.image.startsWith('data:image') || message.image.startsWith('http'))) {
                        items.push({ label: 'Abrir multimedia', icon: contextMenuIcons.copy, onClick: () => window.open(message.image, '_blank') })
                      }
                      if (message.author === 'me') {
                        items.push({ label: 'Editar mensaje', icon: contextMenuIcons.edit, onClick: () => { setEditingMsg(message.id); setEditDraft(message.text || '') } })
                        items.push({ label: 'Eliminar mensaje', icon: contextMenuIcons.delete, onClick: () => {
                          const updated = (messages[activeFriend.id] || []).filter(m => m.id !== message.id)
                          commitMessages({ ...messages, [activeFriend.id]: updated })
                        }, danger: true })
                      }
                      if (message.author !== 'me') {
                        items.push({ label: 'Bloquear usuario', icon: contextMenuIcons.block, onClick: () => {
                          const k = message.gamertag.toLowerCase()
                          setBlockedUsers(prev => { const n = new Set(prev); n.add(k); return n })
                          try { localStorage.setItem('eko.blocked', JSON.stringify(Array.from(new Set([...blockedUsers, k])))) } catch {}
                        }, danger: true })
                        items.push({ label: 'Reportar usuario', icon: contextMenuIcons.report, onClick: () => {
                          try {
                            const reports = JSON.parse(localStorage.getItem('eko.reports') || '[]')
                            reports.push({ type: 'user', user: message.gamertag, by: gamertag, at: Date.now() })
                            localStorage.setItem('eko.reports', JSON.stringify(reports))
                            alert('Reporte enviado')
                          } catch {}
                        }, danger: true })
                      }
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <div className={`chat-bubble ${message.author === 'me' ? 'mine' : ''}`}>
                      {message.author !== 'me' && <strong className="chat-author">{message.gamertag}</strong>}
                      {message.image && (
                        message.image.startsWith('data:video') ? (
                          <video className="chat-image" src={message.image} controls />
                        ) : (
                          <img
                            className="chat-image"
                            src={message.image}
                            alt="Imagen enviada"
                            onClick={() => window.open(message.image, '_blank')}
                          />
                        )
                      )}
                      {editingMsg === message.id ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} style={{ flex: 1 }} />
                          <button type="button" className="btn-ghost" onClick={() => {
                            const updated = (messages[activeFriend.id] || []).map(m => m.id === message.id ? { ...m, text: editDraft } : m)
                            commitMessages({ ...messages, [activeFriend.id]: updated })
                            setEditingMsg(null)
                          }}>Guardar</button>
                          <button type="button" className="btn-ghost" onClick={() => setEditingMsg(null)}>Cancelar</button>
                        </div>
                      ) : (
                        message.text && (
                          <p>
                            <EmojiText text={message.text} />
                          </p>
                        )
                      )}
                      <time>
                        {message.pinned && <Pin className="chat-pinned-mark" />} {message.time}
                      </time>
                    </div>
                    <div className="chat-message-tools">
                      <EmojiReactions
                        targetId={`chat:${activeFriend.id}:${message.id}`}
                        user={gamertag}
                        align={message.author === 'me' ? 'right' : 'left'}
                      />
                      {canPin && (
                        <button
                          type="button"
                          className="chat-pin-btn"
                          onClick={() => togglePin(message.id)}
                          title={message.pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
                        >
                          {message.pinned ? <PinOff /> : <Pin />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {imageError && <p className="settings-error chat-error">{imageError}</p>}

              <form
                className="chat-input"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendMessage()
                }}
              >
                <div className="chat-emoji-wrap">
                  <button
                    type="button"
                    className="chat-emoji-btn"
                    onClick={() => setEmojiOpen((current) => !current)}
                    aria-label="Insertar emoji EKO"
                  >
                    <SmilePlus />
                  </button>
                  {emojiOpen && (
                    <EmojiPicker
                      compact
                      className="emoji-popover chat-emoji-popover"
                      onPick={insertEmoji}
                      onClose={() => setEmojiOpen(false)}
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="chat-emoji-btn"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Enviar imagen o video"
                  title="Enviar imagen o video"
                >
                  <ImagePlus />
                </button>
                <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(event) => {
                  const f = event.target.files?.[0]
                  if (!f) return
                  try {
                    if (f.type.startsWith('video/')) {
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (!activeFriend) return
                        const message: ChatMessage = { id: createMessageId(), author: 'me', gamertag: gamertag || 'Yo', text: draft.trim(), image: reader.result as string, time: nowTime() }
                        commitMessages({ ...messages, [activeFriend.id]: [...(messages[activeFriend.id] || []), message] })
                        setDraft('')
                        setEmojiOpen(false)
                      }
                      reader.readAsDataURL(f)
                    } else {
                      uploadImage(f)
                    }
                  } catch {}
                  event.target.value = ''
                }} />
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Escribe a ${activeFriend.gamertag}...`}
                />
                <button type="submit" aria-label="Enviar mensaje">
                  <Send />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-state">
              <MessageSquare />
              <strong>Selecciona un chat</strong>
              <span>O añade a un amigo por su gamertag para empezar a hablar.</span>
            </div>
          )}
        </div>
      </section>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
