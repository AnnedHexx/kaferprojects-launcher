import { type InstanceCode, loadCachedConfig, saveCachedConfig } from './admin-config'
import { applyRemoteChange, isRemoteSyncEnabled } from './remote-config'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type InstanceCodeState = 'active' | 'expired' | 'used'

export function instanceCodeState(entry: InstanceCode, now = Date.now()): InstanceCodeState {
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= now) return 'expired'
  if (entry.maxUses > 0 && entry.uses >= entry.maxUses) return 'used'
  return 'active'
}

export function instanceCodeStatusLabel(state: InstanceCodeState): string {
  if (state === 'expired') return 'Caducado'
  if (state === 'used') return 'Agotado'
  return 'Activo'
}

export function randomInstanceCode(length = 8): string {
  const size = Math.max(4, Math.min(16, length))
  const bytes = new Uint8Array(size)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < size; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let index = 0; index < size; index += 1) {
    out += ALPHABET[bytes[index] % ALPHABET.length]
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

export function generateInstanceCode(existing: string[] = []): string {
  const taken = new Set(existing.map((value) => value.trim().toUpperCase()))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = randomInstanceCode(8)
    if (!taken.has(candidate)) return candidate
  }
  return randomInstanceCode(12)
}

export function validateInstanceCode(value: string): { ok: boolean; message: string; codeId?: string } {
  const clean = value.trim().toUpperCase()
  if (!clean) {
    return { ok: false, message: 'Escribe un código para poder crear la instancia.' }
  }
  const config = loadCachedConfig()
  const entry = config.codes.find((item) => item.code.toUpperCase() === clean)
  if (!entry) {
    return { ok: false, message: 'Ese código no existe o fue eliminado por un administrador.' }
  }
  const state = instanceCodeState(entry)
  if (state === 'expired') {
    return { ok: false, message: 'Ese código ha caducado. Pide uno nuevo a un administrador.' }
  }
  if (state === 'used') {
    return {
      ok: false,
      message: 'Ese código ya alcanzó su número máximo de usos. Pide uno nuevo a un administrador.',
    }
  }
  return { ok: true, message: '', codeId: entry.id }
}

/** Suma un uso y registra el gamertag que creó la instancia. */
export function consumeInstanceCode(codeId: string, gamertag: string): boolean {
  const tag = gamertag.trim() || 'Sin sesión'
  const at = new Date().toISOString()
  const config = loadCachedConfig()
  let changed = false
  const codes = config.codes.map((entry) => {
    if (entry.id !== codeId) return entry
    if (instanceCodeState(entry) !== 'active') return entry
    changed = true
    return {
      ...entry,
      uses: entry.uses + 1,
      usedBy: [...entry.usedBy, { gamertag: tag, at }],
    }
  })
  if (changed) saveCachedConfig({ ...config, codes })
  // Con nube configurada, el uso también se publica para que los demás
  // launchers vean el contador al día.
  if (changed && isRemoteSyncEnabled()) {
    void applyRemoteChange((doc) => ({
      ...doc,
      codes: doc.codes.map((entry) => {
        if (entry.id !== codeId) return entry
        if (instanceCodeState(entry) !== 'active') return entry
        return {
          ...entry,
          uses: entry.uses + 1,
          usedBy: [...entry.usedBy, { gamertag: tag, at }],
        }
      }),
    })).catch(() => {})
  }
  return changed
}
