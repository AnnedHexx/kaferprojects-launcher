/**
 * Utilidades criptográficas del launcher.
 *
 * - Las contraseñas se guardan con PBKDF2-HMAC-SHA256 y salt aleatorio.
 * - Las instancias se cifran con AES-256-GCM usando una clave derivada de la
 *   contraseña. Sin la contraseña correcta no se pueden leer ni modificar.
 *
 * No hay respaldo débil: si WebCrypto no está disponible se lanza un error.
 */

export type EncryptedPayload = {
  v: 1
  alg: 'AES-GCM'
  iv: string
  data: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const PBKDF2_ITERATIONS = 310_000

export function cryptoAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && Boolean(globalThis.crypto.subtle)
}

function requireCrypto(): Crypto {
  if (!cryptoAvailable()) {
    throw new Error('Este dispositivo no soporta cifrado seguro (WebCrypto).')
  }
  return globalThis.crypto
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  requireCrypto().getRandomValues(out)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Deriva 256 bits con PBKDF2-HMAC-SHA256. */
export async function pbkdf2(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
  const crypto = requireCrypto()
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    256,
  )
  return new Uint8Array(bits)
}

/** Verificador de contraseña (hex) listo para guardar. */
export async function derivePasswordVerifier(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  return bytesToHex(await pbkdf2(password, salt, iterations))
}

/** Clave AES-256-GCM derivada de la contraseña para el baúl de instancias. */
export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const crypto = requireCrypto()
  const raw = await pbkdf2(password, salt, iterations)
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

/** Comparación en tiempo constante para no filtrar información por tiempos. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<EncryptedPayload> {
  const crypto = requireCrypto()
  const iv = randomBytes(12)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(aad) as BufferSource },
    key,
    encoder.encode(JSON.stringify(value)) as BufferSource,
  )
  return {
    v: 1,
    alg: 'AES-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }
}

export async function decryptJson<T>(key: CryptoKey, payload: unknown, aad: string): Promise<T> {
  const crypto = requireCrypto()
  if (!payload || typeof payload !== 'object') throw new Error('Datos cifrados no válidos.')
  const record = payload as Partial<EncryptedPayload>
  if (record.v !== 1 || record.alg !== 'AES-GCM' || !record.iv || !record.data) {
    throw new Error('Formato de datos cifrados no válido.')
  }
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(record.iv) as BufferSource,
      additionalData: encoder.encode(aad) as BufferSource,
    },
    key,
    base64ToBytes(record.data) as BufferSource,
  )
  return JSON.parse(decoder.decode(decrypted)) as T
}

/** Exporta la clave para guardarla en el llavero del sistema operativo. */
export async function exportRawKey(key: CryptoKey): Promise<string> {
  const crypto = requireCrypto()
  const raw = await crypto.subtle.exportKey('raw', key)
  return bytesToBase64(new Uint8Array(raw))
}

export async function importRawKey(value: string): Promise<CryptoKey> {
  const crypto = requireCrypto()
  return crypto.subtle.importKey('raw', base64ToBytes(value) as BufferSource, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ])
}
