'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react'
import { isAdminGamertag } from '@/lib/roles'
import {
  authenticate,
  hasAccounts,
  lockStatus,
  passwordStrength,
  registerAccount,
  validateNewPassword,
  validateGamertag,
} from '@/lib/account-store'
import { secureAvailable } from '@/lib/secure-bridge'

export type AuthProfile = {
  gamertag: string
  email: string
  isAdmin: boolean
  xuid?: string
  skinTextureUrl?: string
  warning?: string
}

type Mode = 'login' | 'register'

export function AccessScreen({
  onAuthenticated,
  showPasswordByDefault = false,
}: {
  onAuthenticated: (profile: AuthProfile, vaultKey: CryptoKey, remember: boolean) => Promise<void> | void
  showPasswordByDefault?: boolean
}) {
  // Primer arranque: si no existe ninguna cuenta, solo se ofrece crearla.
  const [firstRun, setFirstRun] = useState<boolean>(() => typeof window !== 'undefined' && !hasAccounts())
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && !hasAccounts() ? 'register' : 'login',
  )
  const [gamertag, setGamertag] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(showPasswordByDefault)
  const [remember, setRemember] = useState(true)
  const [secureStore, setSecureStore] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(0)

  const strength = passwordStrength(password)

  useEffect(() => {
    let alive = true
    secureAvailable().then((value) => {
      if (alive) setSecureStore(value)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setError('')
  }, [gamertag, password, confirm, mode])

  useEffect(() => {
    if (lockRemaining <= 0) return
    const timer = window.setInterval(() => {
      setLockRemaining((value) => Math.max(0, value - 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [lockRemaining])

  function switchMode(next: Mode) {
    setMode(next)
    setPassword('')
    setConfirm('')
    setError('')
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (busy) return

    const cleanTag = gamertag.trim()
    const tagError = validateGamertag(cleanTag)
    if (tagError) {
      setError(tagError)
      return
    }

    if (mode === 'register') {
      const passwordError = validateNewPassword(password)
      if (passwordError) {
        setError(passwordError)
        return
      }
      if (password !== confirm) {
        setError('Las contraseñas no coinciden.')
        return
      }
    } else if (!password) {
      setError('Escribe tu contraseña.')
      return
    }

    const lock = lockStatus(cleanTag)
    if (lock.locked) {
      setLockRemaining(lock.retryAfter)
      setError(`Demasiados intentos. Espera ${Math.ceil(lock.retryAfter / 1000)} s antes de volver a intentarlo.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const result =
        mode === 'register'
          ? await registerAccount(cleanTag, password)
          : await authenticate(cleanTag, password)

      if (!result.ok) {
        if (result.retryAfter) setLockRemaining(result.retryAfter)
        setError(result.message)
        return
      }

      if (mode === 'register') setFirstRun(false)

      await onAuthenticated(
        {
          gamertag: result.account.gamertag,
          email: '',
          isAdmin: isAdminGamertag(result.account.gamertag),
        },
        result.vaultKey,
        remember,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  const submitLabel =
    mode === 'register'
      ? busy
        ? 'Creando cuenta…'
        : 'Crear cuenta'
      : busy
        ? 'Entrando…'
        : 'Entrar'

  return (
    <main className="access-screen">
      <div className="access-glow" />
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-brand">
          <img src="./kafer-logo.svg" alt="Logo de KaferProjects" />
          <span>KAFERPROJECTS LAUNCHER</span>
        </div>
        <div className="access-heading">
          <span className="access-kicker">ACCESO AL LAUNCHER</span>
          <h1 id="access-title">{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
          <p>
            {mode === 'register'
              ? 'Elige un gamertag y una contraseña fuerte para proteger tus instancias.'
              : 'Entra con tu gamertag y tu contraseña.'}
          </p>
        </div>

        <div className="access-tabs" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => switchMode('login')}
            >
              <LogIn /> Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => switchMode('register')}
            >
              <UserPlus /> Crear cuenta
            </button>
          </div>

        <form className="access-form" onSubmit={submit}>
          <label>
            Gamertag
            <span className="access-field">
              <User />
              <input
                value={gamertag}
                onChange={(event) => setGamertag(event.target.value)}
                placeholder="Tu gamertag de Bedrock"
                autoComplete="username"
                autoFocus
                maxLength={32}
              />
            </span>
          </label>
          <label>
            Contraseña
            <span className="access-field">
              <KeyRound />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                maxLength={128}
              />
              <button
                type="button"
                className="access-eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </label>

          {mode === 'register' && (
            <>
              <label>
                Repite la contraseña
                <span className="access-field">
                  <ShieldCheck />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Vuelve a escribirla"
                    autoComplete="new-password"
                    maxLength={128}
                  />
                </span>
              </label>
              <div className={`access-strength score-${strength.score}`}>
                <div className="access-strength-bar">
                  <i style={{ width: `${Math.max(6, strength.score * 25)}%` }} />
                </div>
                <span>{strength.label}</span>
              </div>
            </>
          )}

          <label className="access-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>
              Mantener sesión iniciada en este equipo
              <small>
                {secureStore
                  ? 'La sesión se guarda cifrada con el llavero de Windows.'
                  : 'Sin llavero del sistema, la sesión dura hasta cerrar la ventana.'}
              </small>
            </span>
          </label>

          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}
          {lockRemaining > 0 && (
            <p className="access-lock" role="status">
              Cuenta bloqueada temporalmente: {Math.ceil(lockRemaining / 1000)} s
            </p>
          )}

          <button type="submit" className="access-submit" disabled={busy || lockRemaining > 0}>
            {mode === 'register' ? <UserPlus /> : <LogIn />} {submitLabel}
          </button>
        </form>

        <div className="access-bottom">
          <span className="access-ms-note">
            {mode === 'register'
              ? 'Las instancias se cifran con tu contraseña. Si la olvidas, no se pueden recuperar.'
              : 'Tu contraseña nunca se guarda en texto plano: se verifica con PBKDF2-SHA256.'}
          </span>
        </div>
      </section>
    </main>
  )
}
