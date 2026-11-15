const { app, ipcMain, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Almacenamiento seguro del launcher.
 *
 * - La sesión y los secretos se cifran con `safeStorage` (DPAPI en Windows).
 * - Nunca se escriben en texto plano en el renderer.
 */

function secureDirPath() {
  return path.join(app.getPath('userData'), 'secure')
}

function secureSessionPath() {
  return path.join(secureDirPath(), 'session.bin')
}

function secureSecretsPath() {
  return path.join(secureDirPath(), 'secrets.json')
}

function ensureSecureDir() {
  fs.mkdirSync(secureDirPath(), { recursive: true })
}

function safeStorageReady() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function readSecrets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(secureSecretsPath(), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeSecrets(secrets) {
  ensureSecureDir()
  fs.writeFileSync(secureSecretsPath(), JSON.stringify(secrets, null, 2), { mode: 0o600 })
}

function cleanSecretName(value) {
  const name = String(value || '').trim()
  return /^[a-z0-9._-]{1,64}$/i.test(name) ? name : ''
}

function registerSecureIpc() {
  ipcMain.handle('security:available', () => safeStorageReady())

  ipcMain.handle('security:set-session', (_event, data = {}) => {
    try {
      if (!safeStorageReady()) return { ok: false, error: 'no-safe-storage' }
      const gamertag = String(data.gamertag || '').trim().slice(0, 64)
      const key = String(data.key || '')
      const expiresAt = Number(data.expiresAt) || 0
      if (!gamertag || !key || !expiresAt) return { ok: false, error: 'invalid-session' }
      ensureSecureDir()
      const payload = JSON.stringify({ gamertag, key, expiresAt })
      fs.writeFileSync(secureSessionPath(), safeStorage.encryptString(payload), { mode: 0o600 })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message || 'session-error' }
    }
  })

  ipcMain.handle('security:get-session', () => {
    try {
      if (!safeStorageReady()) return null
      const raw = fs.readFileSync(secureSessionPath())
      const parsed = JSON.parse(safeStorage.decryptString(raw))
      if (!parsed?.gamertag || !parsed?.key) return null
      if (!Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) return null
      return {
        gamertag: String(parsed.gamertag),
        key: String(parsed.key),
        expiresAt: Number(parsed.expiresAt),
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('security:clear-session', () => {
    try {
      fs.unlinkSync(secureSessionPath())
    } catch {}
    return true
  })

  ipcMain.handle('security:set-secret', (_event, payload = {}) => {
    const name = cleanSecretName(payload.name)
    const value = String(payload.value || '')
    if (!name || !value || value.length > 8192) return { ok: false, error: 'invalid-secret' }
    if (!safeStorageReady()) return { ok: false, error: 'no-safe-storage' }
    try {
      const secrets = readSecrets()
      secrets[name] = safeStorage.encryptString(value).toString('base64')
      writeSecrets(secrets)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message || 'secret-error' }
    }
  })

  ipcMain.handle('security:has-secret', (_event, payload = {}) => {
    const name = cleanSecretName(payload.name)
    return Boolean(name && readSecrets()[name])
  })

  ipcMain.handle('security:delete-secret', (_event, payload = {}) => {
    const name = cleanSecretName(payload.name)
    const secrets = readSecrets()
    if (name && secrets[name]) {
      delete secrets[name]
      try {
        writeSecrets(secrets)
      } catch {}
    }
    return true
  })
}

module.exports = { registerSecureIpc }
