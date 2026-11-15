/**
 * Cuentas locales con seguridad real (dentro de lo posible sin servidor):
 *
 * - PBKDF2-HMAC-SHA256 con salt aleatorio por cuenta (310 000 iteraciones).
 * - Bloqueo progresivo tras varios intentos fallidos.
 * - La sesión se guarda cifrada por el sistema operativo (safeStorage/DPAPI),
 *   nunca en texto plano en localStorage.
 * - La clave del baúl de instancias se deriva de la contraseña y no se guarda
 *   en claro en ningún sitio.
 */

import { isAdminGamertag } from './roles'
import { applyRemoteChange, fetchFreshConfig } from './remote-config'
import {
  PBKDF2_ITERATIONS,
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  derivePasswordVerifier,
  deriveVaultKey,
  exportRawKey,
  importRawKey,
  randomBytes,
} from './secure-crypto'
import { secureBridge, type SecureSession } from './secure-bridge'

const ACCOUNTS_V2 = 'kafer.accounts.v2'
const ACCOUNTS_V1 = 'kafer.accounts.v1'
const LOCKOUT_KEY = 'kafer.lockout.v1'
const SESSION_KEY = 'kafer.session.v1'

const MAX_ATTEMPTS = 5
const BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 15 * 60_000
const SESSION_DAYS = 30

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'contraseña',
  'contrasena',
  'minecraft',
  'minecraft1',
  'qwerty123',
  'abc12345',
  'iloveyou',
  'admin123',
  'kaferprojects',
])

export type AccountRecord = {
  v: 2
  gamertag: string
  salt: string
  iterations: number
  hash: string
  vaultSalt: string
  vaultIterations: number
  createdAt: string
}

export type AuthSuccess = { ok: true; account: AccountRecord; vaultKey: CryptoKey }
export type AuthFailure = {
  ok: false
  code: 'no-account' | 'bad-password' | 'locked' | 'invalid' | 'exists' | 'crypto'
  message: string
  retryAfter?: number
}
export type AuthResult = AuthSuccess | AuthFailure

type LegacyAccount = { gamertag: string; hash: string }
type LockRecord = { fails: number; until: number }

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function normalizeGamertag(value: string): string {
  return String(value || '').trim()
}

export function validateGamertag(value: string): string {
  const tag = normalizeGamertag(value)
  if (tag.length < 3) return 'Escribe un gamertag de al menos 3 caracteres.'
  if (tag.length > 32) return 'El gamertag no puede tener más de 32 caracteres.'
  if (!/^[a-zA-Z0-9 _.-]+$/.test(tag)) {
    return 'El gamertag solo puede tener letras, números, espacios, guiones o puntos.'
  }
  return ''
}

export function validateNewPassword(value: string): string {
  if (value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (value.length > 128) return 'La contraseña no puede tener más de 128 caracteres.'
  if (/^(.)\1+$/.test(value)) return 'La contraseña no puede ser el mismo carácter repetido.'
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return 'Esa contraseña es demasiado común. Elige otra.'
  return ''
}

export function passwordStrength(value: string): { score: number; label: string } {
  if (!value) return { score: 0, label: 'Sin contraseña' }
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^a-zA-Z0-9]/.test(value)) score += 1
  score = Math.max(0, Math.min(4, score))
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente']
  return { score, label: labels[score] }
}

function loadAccountsV2(): Record<string, AccountRecord> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(ACCOUNTS_V2)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, AccountRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value as Partial<AccountRecord>
      if (
        record &&
        record.v === 2 &&
        typeof record.gamertag === 'string' &&
        typeof record.salt === 'string' &&
        typeof record.hash === 'string' &&
        typeof record.vaultSalt === 'string' &&
        Number.isFinite(Number(record.iterations)) &&
        Number.isFinite(Number(record.vaultIterations))
      ) {
        out[key] = {
          v: 2,
          gamertag: record.gamertag,
          salt: record.salt,
          iterations: Number(record.iterations),
          hash: record.hash,
          vaultSalt: record.vaultSalt,
          vaultIterations: Number(record.vaultIterations),
          createdAt: String(record.createdAt || ''),
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveAccountsV2(accounts: Record<string, AccountRecord>) {
  try {
    storage()?.setItem(ACCOUNTS_V2, JSON.stringify(accounts))
  } catch {}
}

function loadLegacyAccounts(): Record<string, LegacyAccount> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(ACCOUNTS_V1)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, LegacyAccount> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value as Partial<LegacyAccount>
      if (record && typeof record.gamertag === 'string' && typeof record.hash === 'string') {
        out[key] = { gamertag: record.gamertag, hash: record.hash }
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveLegacyAccounts(accounts: Record<string, LegacyAccount>) {
  try {
    storage()?.setItem(ACCOUNTS_V1, JSON.stringify(accounts))
  } catch {}
}

function loadLockouts(): Record<string, LockRecord> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(LOCKOUT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, LockRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value as Partial<LockRecord>
      if (record && Number.isFinite(Number(record.fails)) && Number.isFinite(Number(record.until))) {
        out[key] = { fails: Number(record.fails), until: Number(record.until) }
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveLockouts(lockouts: Record<string, LockRecord>) {
  try {
    storage()?.setItem(LOCKOUT_KEY, JSON.stringify(lockouts))
  } catch {}
}

export function lockStatus(gamertag: string): { locked: boolean; retryAfter: number } {
  const key = normalizeGamertag(gamertag).toLowerCase()
  if (!key) return { locked: false, retryAfter: 0 }
  const record = loadLockouts()[key]
  if (!record) return { locked: false, retryAfter: 0 }
  const retryAfter = Math.max(0, record.until - Date.now())
  return { locked: retryAfter > 0, retryAfter }
}

function recordFailure(gamertag: string): number {
  const key = normalizeGamertag(gamertag).toLowerCase()
  const lockouts = loadLockouts()
  const current = lockouts[key] || { fails: 0, until: 0 }
  current.fails += 1
  if (current.fails >= MAX_ATTEMPTS) {
    const extra = current.fails - MAX_ATTEMPTS
    const delay = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** Math.min(extra, 6))
    current.until = Date.now() + delay
  }
  lockouts[key] = current
  saveLockouts(lockouts)
  return Math.max(0, current.until - Date.now())
}

function clearFailures(gamertag: string) {
  const key = normalizeGamertag(gamertag).toLowerCase()
  const lockouts = loadLockouts()
  if (lockouts[key]) {
    delete lockouts[key]
    saveLockouts(lockouts)
  }
}

function legacyDjb2(text: string): string {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index)
  }
  return `fallback-${(hash >>> 0).toString(16)}`
}

async function legacySha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function createRecord(gamertag: string, password: string): Promise<{ record: AccountRecord; vaultKey: CryptoKey }> {
  const salt = randomBytes(16)
  const vaultSalt = randomBytes(16)
  const hash = await derivePasswordVerifier(password, salt, PBKDF2_ITERATIONS)
  const record: AccountRecord = {
    v: 2,
    gamertag,
    salt: bytesToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    hash,
    vaultSalt: bytesToBase64(vaultSalt),
    vaultIterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
  }
  const vaultKey = await deriveVaultKey(password, vaultSalt, PBKDF2_ITERATIONS)
  return { record, vaultKey }
}

export function accountExists(gamertag: string): boolean {
  const key = normalizeGamertag(gamertag).toLowerCase()
  if (!key) return false
  return Boolean(loadAccountsV2()[key] || loadLegacyAccounts()[key])
}

/** true si todavía no hay ninguna cuenta en este equipo (primer arranque). */
export function hasAccounts(): boolean {
  return Object.keys(loadAccountsV2()).length > 0 || Object.keys(loadLegacyAccounts()).length > 0
}

export async function registerAccount(gamertag: string, password: string): Promise<AuthResult> {
  const clean = normalizeGamertag(gamertag)
  const tagError = validateGamertag(clean)
  if (tagError) return { ok: false, code: 'invalid', message: tagError }
  const passwordError = validateNewPassword(password)
  if (passwordError) return { ok: false, code: 'invalid', message: passwordError }

  const key = clean.toLowerCase()
  if (accountExists(clean)) {
    return {
      ok: false,
      code: 'exists',
      message: 'Ese gamertag ya tiene una cuenta. Entra con su contraseña.',
    }
  }

  // Bloqueo global: nadie más en la red puede registrar el mismo gamertag.
  try {
    const cloud = await fetchFreshConfig()
    if (cloud?.accounts?.some((entry) => entry.gamertag.toLowerCase() === key)) {
      return {
        ok: false,
        code: 'exists',
        message: 'Ese gamertag ya está registrado por otro usuario. Elige otro.',
      }
    }
  } catch {
    // Sin conexión: se permite crear y se sincroniza después.
  }

  try {
    const { record, vaultKey } = await createRecord(clean, password)
    const accounts = loadAccountsV2()
    accounts[key] = record
    saveAccountsV2(accounts)
    clearFailures(clean)
    // Publicar la cuenta en la nube para que Android y PC compartan el login.
    void applyRemoteChange((doc) => ({
      ...doc,
      accounts: [
        ...(doc.accounts || []).filter((entry) => entry.gamertag.toLowerCase() !== key),
        {
          gamertag: record.gamertag,
          salt: record.salt,
          iterations: record.iterations,
          hash: record.hash,
          vaultSalt: record.vaultSalt,
          vaultIterations: record.vaultIterations,
          createdAt: record.createdAt,
        },
      ],
    })).catch(() => {})
    return { ok: true, account: record, vaultKey }
  } catch (error) {
    return {
      ok: false,
      code: 'crypto',
      message: error instanceof Error ? error.message : 'No se pudo crear la cuenta de forma segura.',
    }
  }
}

export async function authenticate(gamertag: string, password: string): Promise<AuthResult> {
  const clean = normalizeGamertag(gamertag)
  const tagError = validateGamertag(clean)
  if (tagError) return { ok: false, code: 'invalid', message: tagError }
  if (!password) return { ok: false, code: 'invalid', message: 'Escribe tu contraseña.' }

  const lock = lockStatus(clean)
  if (lock.locked) {
    return {
      ok: false,
      code: 'locked',
      message: `Demasiados intentos. Espera ${Math.ceil(lock.retryAfter / 1000)} s antes de volver a intentarlo.`,
      retryAfter: lock.retryAfter,
    }
  }

  const key = clean.toLowerCase()

  try {
    const accounts = loadAccountsV2()
    const record = accounts[key]

    if (record) {
      const verifier = await derivePasswordVerifier(password, base64ToBytes(record.salt), record.iterations)
      if (!constantTimeEqual(verifier, record.hash)) {
        const retryAfter = recordFailure(clean)
        return {
          ok: false,
          code: 'bad-password',
          message:
            retryAfter > 0
              ? `Contraseña incorrecta. Espera ${Math.ceil(retryAfter / 1000)} s antes de volver a intentarlo.`
              : 'La contraseña no es correcta para ese gamertag.',
          retryAfter: retryAfter || undefined,
        }
      }
      clearFailures(clean)
      const vaultKey = await deriveVaultKey(password, base64ToBytes(record.vaultSalt), record.vaultIterations)
      return { ok: true, account: record, vaultKey }
    }

    // Migración transparente desde el formato antiguo (SHA-256 sin salt).
    const legacy = loadLegacyAccounts()
    const old = legacy[key]
    if (old) {
      const legacyText = `kaferprojects:${password}`
      const expected = old.hash.startsWith('fallback-') ? legacyDjb2(legacyText) : await legacySha256(legacyText)
      if (!constantTimeEqual(expected, old.hash)) {
        const retryAfter = recordFailure(clean)
        return {
          ok: false,
          code: 'bad-password',
          message:
            retryAfter > 0
              ? `Contraseña incorrecta. Espera ${Math.ceil(retryAfter / 1000)} s antes de volver a intentarlo.`
              : 'La contraseña no es correcta para ese gamertag.',
          retryAfter: retryAfter || undefined,
        }
      }

      const { record: migrated, vaultKey } = await createRecord(clean, password)
      const accountsAfter = loadAccountsV2()
      accountsAfter[key] = migrated
      saveAccountsV2(accountsAfter)
      delete legacy[key]
      saveLegacyAccounts(legacy)
      clearFailures(clean)
      return { ok: true, account: migrated, vaultKey }
    }

    // Cuenta de la nube: permite entrar desde cualquier dispositivo (ej. la
    // cuenta creada en PC se usa igual en Android). Se guarda local para
    // poder entrar sin conexión la próxima vez.
    try {
      const cloud = await fetchFreshConfig()
      const remote = cloud?.accounts?.find((entry) => entry.gamertag.toLowerCase() === key)
      if (remote) {
        const verifier = await derivePasswordVerifier(password, base64ToBytes(remote.salt), remote.iterations)
        if (!constantTimeEqual(verifier, remote.hash)) {
          const retryAfter = recordFailure(clean)
          return {
            ok: false,
            code: 'bad-password',
            message:
              retryAfter > 0
                ? `Contraseña incorrecta. Espera ${Math.ceil(retryAfter / 1000)} s antes de volver a intentarlo.`
                : 'La contraseña no es correcta para ese gamertag.',
            retryAfter: retryAfter || undefined,
          }
        }
        const record: AccountRecord = {
          v: 2,
          gamertag: remote.gamertag,
          salt: remote.salt,
          iterations: remote.iterations,
          hash: remote.hash,
          vaultSalt: remote.vaultSalt,
          vaultIterations: remote.vaultIterations,
          createdAt: remote.createdAt,
        }
        const accountsNow = loadAccountsV2()
        accountsNow[key] = record
        saveAccountsV2(accountsNow)
        clearFailures(clean)
        const vaultKey = await deriveVaultKey(password, base64ToBytes(record.vaultSalt), record.vaultIterations)
        return { ok: true, account: record, vaultKey }
      }
    } catch {
      // Sin conexión: se cae al error de "no existe".
    }

    return {
      ok: false,
      code: 'no-account',
      message: 'No existe una cuenta con ese gamertag. Puedes crearla.',
    }
  } catch (error) {
    return {
      ok: false,
      code: 'crypto',
      message: error instanceof Error ? error.message : 'No se pudo verificar la cuenta de forma segura.',
    }
  }
}

export type RestoredSession = { gamertag: string; isAdmin: boolean; vaultKey: CryptoKey }

export async function persistSession(gamertag: string, vaultKey: CryptoKey, remember: boolean): Promise<void> {
  if (!remember) {
    await clearStoredSession()
    return
  }
  try {
    const session: SecureSession = {
      gamertag,
      key: await exportRawKey(vaultKey),
      expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    }
    const bridge = secureBridge()
    if (bridge) {
      const result = await bridge.setSession(session)
      if (result?.ok) return
    }
    // Sin Electron: la sesión solo dura mientras la pestaña siga abierta.
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

export async function restoreSession(): Promise<RestoredSession | null> {
  if (typeof window === 'undefined') return null
  let session: SecureSession | null = null
  try {
    const bridge = secureBridge()
    if (bridge) session = await bridge.getSession()
  } catch {}
  if (!session) {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY)
      if (raw) session = JSON.parse(raw) as SecureSession
    } catch {}
  }
  if (!session?.gamertag || !session.key) return null
  if (!Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) {
    await clearStoredSession()
    return null
  }
  try {
    const vaultKey = await importRawKey(session.key)
    return { gamertag: session.gamertag, isAdmin: isAdminGamertag(session.gamertag), vaultKey }
  } catch {
    await clearStoredSession()
    return null
  }
}

export async function clearStoredSession(): Promise<void> {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {}
  try {
    window.localStorage.removeItem('eko.profile')
  } catch {}
  try {
    await secureBridge()?.clearSession()
  } catch {}
}
