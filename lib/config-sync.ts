import { type AdminConfig, normalizeConfig } from './admin-config'

const FORMAT = 'kafer-admin-config'
const VERSION = 1
const PBKDF2_ITERATIONS = 150000

type EncryptedPayload = {
  format: typeof FORMAT
  version: number
  encrypted: true
  salt: string
  iv: string
  data: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Este equipo no tiene cifrado web disponible.')
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedConfigPayload(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Partial<EncryptedPayload>
    return parsed?.format === FORMAT && parsed?.encrypted === true && Boolean(parsed.salt && parsed.iv && parsed.data)
  } catch {
    return false
  }
}

export async function serializeConfig(config: AdminConfig, password = ''): Promise<string> {
  const payload = { ...config, updatedAt: new Date().toISOString() }
  if (!password) return JSON.stringify(payload, null, 2)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Este equipo no tiene cifrado web disponible.')
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const data = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const encrypted: EncryptedPayload = {
    format: FORMAT,
    version: VERSION,
    encrypted: true,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(data)),
  }
  return JSON.stringify(encrypted, null, 2)
}

export async function parseConfig(text: string, password = ''): Promise<AdminConfig> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('El archivo está vacío.')
  if (!isEncryptedConfigPayload(trimmed)) {
    return normalizeConfig(JSON.parse(trimmed))
  }
  if (!password) throw new Error('El archivo está cifrado. Escribe su contraseña para importarlo.')
  const payload = JSON.parse(trimmed) as EncryptedPayload
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Este equipo no tiene cifrado web disponible.')
  try {
    const key = await deriveKey(password, base64ToBytes(payload.salt))
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data),
    )
    return normalizeConfig(JSON.parse(new TextDecoder().decode(decrypted)))
  } catch {
    throw new Error('La contraseña no es correcta o el archivo está dañado.')
  }
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function configFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `kafer-config-${stamp}.json`
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsText(file)
  })
}
