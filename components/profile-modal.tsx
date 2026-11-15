'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, MessageSquare, Save, Sparkles, Upload, UserCheck, Users, X } from 'lucide-react'
import { SkinFace } from '@/components/skin-face'
import {
  NAME_FONTS,
  PROFILE_BANNERS,
  UserProfile,
  ensureJoinedAt,
  formatJoined,
  hashBanner,
  loadJoinedAt,
  loadProfiles,
  profileBannerStyle,
  saveProfile,
} from '@/lib/profiles'
import type { Friend } from '@/lib/social-store'
import { prepareImage } from '@/lib/media'
import { useClosing } from '@/lib/use-closing'

type ProfileModalProps = {
  gamertag: string
  viewer: string
  isAdmin: boolean
  own: boolean
  friends: Friend[]
  xuid?: string
  localSkin?: string | null
  skinTextureUrl?: string
  onClose: () => void
  onChat?: (gamertag: string) => void
}

function fallbackProfile(gamertag: string): UserProfile {
  return {
    gamertag,
    bio: '',
    joinedAt: '',
    bannerPreset: hashBanner(gamertag).id,
    friendGamertags: [],
  }
}

export function ProfileModal({
  gamertag,
  viewer,
  isAdmin,
  own,
  friends,
  xuid,
  localSkin,
  skinTextureUrl,
  onClose,
  onChat,
}: ProfileModalProps) {
  const { closing, requestClose } = useClosing(onClose)
  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = loadProfiles()[gamertag.trim().toLowerCase()]
    const base = stored || fallbackProfile(gamertag)
    if (own) {
      const joinedAt = stored?.joinedAt || loadJoinedAt() || ensureJoinedAt()
      return { ...base, joinedAt }
    }
    return base
  })
  const [draft, setDraft] = useState<UserProfile>(profile)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!own) return
    ensureJoinedAt()
  }, [own])

  const mutual = friends
    .filter((friend) => !friend.group)
    .filter((friend) => friend.gamertag.trim().toLowerCase() !== gamertag.trim().toLowerCase())
    .slice(0, 8)

  const joined = formatJoined(profile.joinedAt)
  const nameFont = NAME_FONTS.find((font) => font.id === profile.nameFont)
  const nameStyle = {
    color: own && isAdmin ? profile.nameColor || undefined : undefined,
    fontFamily: own && isAdmin ? nameFont?.value : undefined,
  }
  const nameClass = own && isAdmin ? nameFont?.className || '' : ''

  async function uploadBanner(file: File | null) {
    if (!file) return
    try {
      setError('')
      const dataUrl = await prepareImage(file, 1400 * 1024)
      setDraft((current) => ({ ...current, banner: dataUrl }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar la imagen.')
    }
  }

  function save() {
    const next: UserProfile = {
      ...draft,
      gamertag,
      bio: draft.bio.trim(),
      joinedAt: profile.joinedAt || ensureJoinedAt(),
      title: isAdmin ? draft.title?.trim() : undefined,
      nameColor: isAdmin ? draft.nameColor : undefined,
      nameFont: isAdmin ? draft.nameFont : undefined,
      banner: isAdmin ? draft.banner : undefined,
      profileTheme: draft.profileTheme || undefined,
      nameEffect: isAdmin ? draft.nameEffect : undefined,
      nameColors: isAdmin ? draft.nameColors : undefined,
    }
    saveProfile(next)
    setProfile(next)
    setDraft(next)
    setEditing(false)
  }

  return (
    <div className={`server-modal-backdrop ${closing ? 'closing' : ''}`} onClick={requestClose}>
      <section className="profile-modal" onClick={(event) => event.stopPropagation()} aria-label={`Perfil de ${gamertag}`} style={{ background: profile.profileTheme ? profile.profileTheme : 'rgba(10,8,16,.97)' }}>
        {profile.profileTheme && <div className="profile-theme-bg" style={{ background: profile.profileTheme }} />}
        <button className="modal-close" onClick={requestClose} aria-label="Cerrar perfil">
          <X />
        </button>

        <div className="profile-banner" style={{ background: `linear-gradient(135deg, hsl(${(gamertag.charCodeAt(0)*7)%360}, 65%, 38%), hsl(${(gamertag.charCodeAt(0)*13)%360}, 65%, 16%))` }}>
          <span className="profile-banner-fade" />
        </div>

        <div className="profile-top">
          <div className="profile-face">
            <SkinFace
              gamertag={gamertag}
              xuid={own ? xuid : undefined}
              localSkin={own ? localSkin : null}
              skinTextureUrl={own ? skinTextureUrl : undefined}
              size={104}
              alt={`Skin de ${gamertag}`}
            />
          </div>
          <div className="profile-identity">
            <div className="profile-name-row">
              <h1 style={{ color: '#f5f3ff' }}>{gamertag || 'Jugador'}</h1>
            </div>
            <span className="profile-handle">@{gamertag || 'jugador'}</span>
            <div className="profile-meta-line">
              {joined && (
                <span>
                  <CalendarDays /> Miembro desde {joined}
                </span>
              )}
              <span>
                <UserCheck /> Perfil de KaferProjects Launcher
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {!own && onChat && (
              <button className="btn-primary" onClick={() => onChat(gamertag)}>
                <MessageSquare /> Enviar mensaje
              </button>
            )}
            {false && own && (
              <button className="btn-ghost" onClick={() => setEditing((value) => !value)}>
                <Sparkles /> {editing ? 'Cancelar edición' : 'Editar perfil'}
              </button>
            )}
          </div>
        </div>

        <div className="profile-body">
          {!editing && (
            <>
              {mutual.length > 0 && (
                <section className="profile-card">
                  <h2>
                    <Users /> Amigos en común <b>{mutual.length}</b>
                  </h2>
                  <ul className="profile-friends">
                    {mutual.map((friend) => (
                      <li key={friend.id}>
                        <SkinFace gamertag={friend.gamertag} size={34} />
                        <span>{friend.gamertag}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {false && own && isAdmin && (
                <section className="profile-card profile-admin-card">
                  <h2>
                    <Sparkles /> Opciones de administrador
                  </h2>
                  <p>Fondo personalizado, banner GIF, título junto al nombre, color y tipografía del nombre.</p>
                </section>
              )}
            </>
          )}

          {false && editing && own && (
            <section className="profile-card profile-editor">
              <h2>Editar perfil</h2>

              {false && isAdmin && (
                <>
                  <div className="profile-field">
                    <span>Fondo del perfil (Tema)</span>
                    <div className="profile-banner-options">
                      {['linear-gradient(135deg,#1a1025,#0b0810)', 'radial-gradient(circle at top,#2d1b4e,#0b0810)', 'linear-gradient(180deg,#0f0a18,#06040a)', '#0b0810'].map((bg, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`profile-banner-swatch ${draft.profileTheme === bg ? 'active' : ''}`}
                          style={{ background: bg }}
                          onClick={() => setDraft((current) => ({ ...current, profileTheme: bg }))}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value="#1a1025"
                      onChange={(event) => setDraft((current) => ({ ...current, profileTheme: `linear-gradient(135deg,${event.target.value},#0b0810)` }))}
                    />
                    {draft.profileTheme && (
                      <button type="button" className="btn-ghost" onClick={() => setDraft((current) => ({ ...current, profileTheme: '' }))}>
                        Quitar tema
                      </button>
                    )}
                  </div>
                  <div className="profile-field">
                    <span>Banner</span>
                    <div className="profile-banner-options">
                      {PROFILE_BANNERS.map((banner) => (
                        <button
                          key={banner.id}
                          type="button"
                          className={`profile-banner-swatch ${!draft.banner && draft.bannerPreset === banner.id ? 'active' : ''}`}
                          style={{ background: banner.gradient }}
                          onClick={() => setDraft((current) => ({ ...current, banner: '', bannerPreset: banner.id }))}
                          title={banner.label}
                        />
                      ))}
                    </div>
                    <label className="profile-upload">
                      <Upload /> Subir imagen o GIF
                      <input type="file" accept="image/*" hidden onChange={(event) => uploadBanner(event.target.files?.[0] || null)} />
                    </label>
                    {draft.banner && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setDraft((current) => ({ ...current, banner: '' }))}
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>

                  {false && (draft.nameEffect === 'gradient' || draft.nameEffect === 'caricatura') && (
                    <div className="profile-field-row">
                      <label className="profile-field">
                        <span>Color 1</span>
                        <input type="color" value={draft.nameColors?.[0] || '#e2c2ff'} onChange={(e) => setDraft((c) => ({ ...c, nameColors: [e.target.value, c.nameColors?.[1] || '#7b37ba'] }))} />
                      </label>
                      <label className="profile-field">
                        <span>Color 2</span>
                        <input type="color" value={draft.nameColors?.[1] || '#7b37ba'} onChange={(e) => setDraft((c) => ({ ...c, nameColors: [c.nameColors?.[0] || '#e2c2ff', e.target.value] }))} />
                      </label>
                    </div>
                  )}
                  {false && draft.nameEffect === 'neon' && (
                    <label className="profile-field">
                      <span>Color neón</span>
                      <input type="color" value={draft.nameColors?.[0] || '#7CFCFF'} onChange={(e) => setDraft((c) => ({ ...c, nameColors: [e.target.value] }))} />
                    </label>
                  )}
                  {false && draft.nameEffect === 'gomitaa' && (
                    <div className="profile-field">
                      <span>Colores (varios predeterminados)</span>
                      <div className="profile-banner-options">
                        {[['#ff3b3b','#ff9c42','#ffe66d','#7CFFB2','#7CFCFF'],['#e2c2ff','#b57bff','#7b37ff','#9d4edd','#c77dff'],['#ff9c42','#f72585','#7209b7','#3a0ca3','#4361ee']].map((cols,idx)=>(
                          <button key={idx} type="button" className="profile-banner-swatch" style={{background:`linear-gradient(90deg,${cols.join(',')})`}} onClick={()=>setDraft(c=>({...c,nameColors:cols}))}/>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && <p className="settings-error">{error}</p>}

              <div className="profile-editor-actions">
                <button className="btn-ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={save}>
                  <Save /> Guardar perfil
                </button>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
