const { Client } = require('@xhayper/discord-rpc')

// Client ID de la aplicacion de Discord "KaferProjects Launcher".
// Sustituye este valor por el Application ID de tu app nueva en
// https://discord.com/developers/applications (no es el token ni el secreto).
const DEFAULT_CLIENT_ID = '1569599407702417478'

class DiscordPresence {
  constructor(options = {}) {
    this.clientId =
      options.clientId ||
      process.env.KAFER_DISCORD_CLIENT_ID ||
      process.env.EKO_DISCORD_CLIENT_ID ||
      DEFAULT_CLIENT_ID
    this.client = null
    this.connected = false
    this.connecting = false
    this.enabled = true
    this.startedAt = new Date()
    this.current = null
    this.reconnectTimer = null
    this.keepAliveTimer = null
    this.destroyed = false
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled)
    if (!this.enabled) {
      this.clear()
      return
    }
    this.connect()
  }

  async connect() {
    if (!this.enabled || this.destroyed || this.connected || this.connecting) return
    this.connecting = true

    try {
      this.client = new Client({ clientId: this.clientId })
      this.client.on('ready', () => {
        this.connected = true
        this.connecting = false
        this.startedAt = new Date()
        if (this.current) this.push(this.current)
        this.startKeepAlive()
      })
      this.client.on('disconnected', () => {
        this.connected = false
        this.stopKeepAlive()
        this.scheduleReconnect()
      })
      this.client.on('error', () => {
        this.connected = false
        this.connecting = false
        this.stopKeepAlive()
        this.scheduleReconnect()
      })
      await this.client.login()
    } catch {
      this.connected = false
      this.connecting = false
      this.scheduleReconnect()
    }
  }

  startKeepAlive() {
    if (this.keepAliveTimer) return
    this.keepAliveTimer = setInterval(() => {
      if (this.connected && this.current && this.enabled) this.push(this.current)
    }, 20000)
    if (this.keepAliveTimer.unref) this.keepAliveTimer.unref()
  }

  stopKeepAlive() {
    if (!this.keepAliveTimer) return
    clearInterval(this.keepAliveTimer)
    this.keepAliveTimer = null
  }

  scheduleReconnect() {
    if (this.destroyed || !this.enabled || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.client) {
        try { this.client.destroy() } catch {}
        this.client = null
      }
      this.connect()
    }, 15000)
    if (this.reconnectTimer.unref) this.reconnectTimer.unref()
  }

  setActivity(activity = {}) {
    this.current = activity
    if (!this.enabled) return
    if (!this.connected) {
      this.connect()
      return
    }
    this.push(activity)
  }

  clear() {
    this.current = null
    if (!this.connected || !this.client || !this.client.user) return
    this.client.user.clearActivity().catch(() => {})
  }

  push(activity) {
    if (!this.connected || !this.client || !this.client.user) return
    const payload = {
      type: 0,
      startTimestamp: this.startedAt,
      largeImageKey: 'logo',
      largeImageText: 'KaferProjects Launcher - Launcher de Minecraft Bedrock',
      instance: false,
      ...activity,
    }
    // El icono pequeño de la instancia: si la instancia tiene icono (data URL o
    // URL), se envía como smallImageKey para que se vea en la esquina inferior.
    // Discord acepta keys de assets registrados; si no hay icono, no se envía.
    if (!activity.smallImageKey) delete payload.smallImageKey
    this.client.user.setActivity(payload).catch(() => {})
  }

  async destroy() {
    this.destroyed = true
    this.stopKeepAlive()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.client) {
      try { await this.client.destroy() } catch {}
    }
    this.client = null
    this.connected = false
  }
}

module.exports = { DiscordPresence }
