/**
 * Puente seguro con el proceso principal de Electron.
 * Guarda la sesión y los secretos con el llavero del sistema operativo
 * mediante `safeStorage` (DPAPI en Windows). Nunca quedan en texto
 * plano dentro de localStorage.
 */

export type SecureSession = {
  gamertag: string
  /** Clave AES del baúl, exportada en base64. */
  key: string
  expiresAt: number
}

export type SecureBridge = {
  available: () => Promise<boolean>
  getSession: () => Promise<SecureSession | null>
  setSession: (session: SecureSession) => Promise<{ ok: boolean; error?: string }>
  clearSession: () => Promise<boolean>
  setSecret: (name: string, value: string) => Promise<{ ok: boolean; error?: string }>
  hasSecret: (name: string) => Promise<boolean>
  deleteSecret: (name: string) => Promise<boolean>
}

declare global {
  interface Window {
    kaferSecurity?: SecureBridge
  }
}

export function secureBridge(): SecureBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return window.kaferSecurity
}

export async function secureAvailable(): Promise<boolean> {
  try {
    return Boolean(await secureBridge()?.available())
  } catch {
    return false
  }
}
