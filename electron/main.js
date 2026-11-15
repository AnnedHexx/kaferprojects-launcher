const { app, BrowserWindow, dialog, ipcMain, shell, screen, Tray, Menu, nativeImage, Notification, net } = require('electron')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { spawn, spawnSync } = require('node:child_process')
const { installTo } = require('./installer-core')
const { DiscordPresence } = require('./discord-presence')
const { registerSecureIpc } = require('./secure-store')

const APP_VERSION = '1.0.0'
const appRoot = path.join(__dirname, '..')
const iconPath = path.join(__dirname, 'assets', 'icon.png')
const configDir = path.join(app.getPath('appData'), 'KaferProjectsLauncher')
const configPath = path.join(configDir, 'config.json')

let installerWindow = null
let mainWindow = null
let switchingToMain = false
let presence = null
let settingsCache = {}
let tray = null

app.setName('KaferProjects Launcher')
app.setAppUserModelId('net.kaferprojects.launcher')

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}

function writeConfig(config) {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function logBoot(message) {
  if (process.env.EKO_DEBUG !== '1') return
  try {
    fs.mkdirSync(configDir, { recursive: true })
    fs.appendFileSync(path.join(configDir, 'boot.log'), `[${new Date().toISOString()}] ${message}\n`)
  } catch {}
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function destroyTray() {
  if (!tray) return
  try {
    tray.destroy()
  } catch {}
  tray = null
}

function ensureTray() {
  if (tray) return
  try {
    let image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 })
    tray = new Tray(image)
    tray.setToolTip('KaferProjects Launcher')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir KaferProjects Launcher', click: () => showMainWindow() },
        { type: 'separator' },
        {
          label: 'Salir',
          click: () => {
            app.isQuitting = true
            destroyTray()
            app.quit()
          },
        },
      ]),
    )
    tray.on('click', () => showMainWindow())
    tray.on('double-click', () => showMainWindow())
  } catch {
    tray = null
  }
}

function getInstalledPath() {
  const config = readConfig()
  if (!config || !config.installPath) return null
  const installPath = config.installPath
  if (app.isPackaged) {
    const executable = installedExecutable(installPath)
    const indexFile = path.join(installPath, 'resources', 'app', 'out', 'index.html')
    return fs.existsSync(executable) && fs.existsSync(indexFile) ? installPath : null
  }
  return fs.existsSync(path.join(installPath, 'app', 'index.html')) ? installPath : null
}

function installedExecutable(installPath) {
  return path.join(installPath, path.basename(process.execPath))
}

function openInstaller() {
  if (installerWindow) {
    installerWindow.focus()
    return
  }

  installerWindow = new BrowserWindow({
    width: 880,
    height: 600,
    minWidth: 880,
    minHeight: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'KaferProjects Launcher — Instalación',
    icon: iconPath,
    backgroundColor: '#07050b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'installer-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  installerWindow.setMenuBarVisibility(false)
  installerWindow.loadFile(path.join(__dirname, 'installer', 'index.html'))
  installerWindow.once('ready-to-show', () => installerWindow && installerWindow.show())
  installerWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    logBoot(`installer did-fail-load: ${code} ${description} ${url}`)
    if (installerWindow && !installerWindow.isVisible()) installerWindow.show()
  })
  setTimeout(() => {
    if (installerWindow && !installerWindow.isDestroyed() && !installerWindow.isVisible()) {
      logBoot('installer fallback show (ready-to-show never fired)')
      installerWindow.show()
    }
  }, 4000)
  installerWindow.on('closed', () => {
    installerWindow = null
    if (!mainWindow && !switchingToMain) app.quit()
  })
}

function openMain(installPath) {
  if (mainWindow) {
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 950,
    minHeight: 580,
    show: false,
    fullscreen: false,
    maximizable: true,
    title: 'KaferProjects Launcher',
    icon: iconPath,
    backgroundColor: '#0a0810',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'launcher-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  // Seguridad: nada de ventanas nuevas, navegación externa ni DevTools en producción.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.EKO_DEV_URL
    const allowed = url.startsWith('file://') || Boolean(devUrl && url.startsWith(devUrl))
    if (!allowed) event.preventDefault()
  })
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const key = String(input.key || '').toLowerCase()
      const ctrl = Boolean(input.control || input.meta)
      if (key === 'f12' || (ctrl && input.shift && (key === 'i' || key === 'j' || key === 'c'))) {
        event.preventDefault()
      }
    })
    mainWindow.webContents.on('devtools-opened', () => {
      try {
        mainWindow.webContents.closeDevTools()
      } catch {}
    })
  }

  const devUrl = process.env.EKO_DEV_URL
  if (devUrl) mainWindow.loadURL(devUrl)
  else if (app.isPackaged) mainWindow.loadFile(path.join(app.getAppPath(), 'out', 'index.html'))
  else mainWindow.loadFile(path.join(installPath, 'app', 'index.html'))

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show())
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    logBoot(`main did-fail-load: ${code} ${description} ${url}`)
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logBoot('main fallback show (ready-to-show never fired)')
      mainWindow.show()
    }
  }, 4000)
  mainWindow.on('close', (event) => {
    if (settingsCache.minimizeOnClose && !app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      ensureTray()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    destroyTray()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (settingsCache.uiScale && uiScaleFactors[settingsCache.uiScale] && mainWindow) {
      try {
        mainWindow.webContents.setZoomFactor(uiScaleFactors[settingsCache.uiScale])
      } catch {}
    }
  })

  startPresence()
}

function createShortcut(shortcutPath, installPath) {
  const target = app.isPackaged ? installedExecutable(installPath) : process.execPath
  const args = app.isPackaged ? '' : `"${installPath}"`
  const created = shell.writeShortcutLink(shortcutPath, 'create', {
    target,
    args,
    cwd: installPath,
    description: 'KaferProjects Launcher — Launcher de Minecraft Bedrock',
    icon: target,
    iconIndex: 0,
  })
  return created
}

function startupShortcutPath() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'KaferProjects Launcher.lnk')
}

function desktopShortcutPath() {
  return path.join(app.getPath('desktop'), 'KaferProjects Launcher.lnk')
}

function scheduleSetupCleanup() {
  if (!app.isPackaged) return
  // Migrar los accesos directos de la versión anterior "EKO Client": se borran
  // los viejos y, si el usuario tenía autostart, se crea el de KaferProjects
  // en su lugar (así no pierde su preferencia de iniciar con Windows).
  try {
    const desktop = app.getPath('desktop')
    const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    const startupDir = path.join(startMenu, 'Startup')
    const oldDesktop = path.join(desktop, 'EKO Client.lnk')
    const oldMenu = path.join(startMenu, 'EKO Client.lnk')
    const oldStartup = path.join(startupDir, 'EKO Client.lnk')
    const hadAutoStart = fs.existsSync(oldStartup)
    for (const file of [oldDesktop, oldMenu, oldStartup]) {
      try { fs.rmSync(file, { force: true }) } catch {}
    }
    if (hadAutoStart) {
      try { createShortcut(path.join(startupDir, 'KaferProjects Launcher.lnk'), app.getAppPath()) } catch {}
    }
  } catch {}
  const setupFile = process.env.PORTABLE_EXECUTABLE_FILE || process.argv[0]
  const scriptPath = path.join(app.getPath('temp'), `kafer-cleanup-${Date.now()}.bat`)
  const script = [
    '@echo off',
    'ping -n 3 127.0.0.1 >nul',
    'for /L %%i in (1,1,120) do (',
    `  if not exist "${setupFile}" goto done`,
    `  del /f /q "${setupFile}" >nul 2>&1`,
    '  if not exist "' + setupFile + '" goto done',
    '  ping -n 2 127.0.0.1 >nul',
    ')',
    ':done',
    'del /f /q "%~f0" >nul 2>&1',
  ].join('\r\n')

  try {
    fs.writeFileSync(scriptPath, script, 'ascii')
    const child = spawn('cmd.exe', ['/c', 'start', '""', '/min', 'cmd.exe', '/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch {
    // Si no se puede programar la limpieza, la instalación sigue siendo válida.
  }
}

function startPresence() {
  if (presence) return presence
  presence = new DiscordPresence()
  presence.setActivity({
    details: 'En el menú principal',
    state: 'Explorando la red KaferProjects',
  })
  return presence
}

function stopPresence() {
  if (!presence) return
  presence.destroy()
  presence = null
}

function normalizeActivity(activity) {
  if (!activity || typeof activity !== 'object') return null
  const clean = {}
  const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined)
  const details = text(activity.details, 128)
  const state = text(activity.state, 128)
  if (details) clean.details = details
  if (state) clean.state = state
  if (activity.largeImageKey) clean.largeImageKey = String(activity.largeImageKey).slice(0, 32)
  if (activity.largeImageText) clean.largeImageText = String(activity.largeImageText).slice(0, 128)
  if (activity.smallImageText) clean.smallImageText = String(activity.smallImageText).slice(0, 128)
  if (Array.isArray(activity.buttons)) {
    clean.buttons = activity.buttons
      .filter((button) => button && button.label && button.url)
      .slice(0, 2)
      .map((button) => ({ label: String(button.label).slice(0, 32), url: String(button.url) }))
  }
  return clean
}

ipcMain.on('presence:set', (_event, activity) => {
  const clean = normalizeActivity(activity)
  if (!clean) return
  startPresence().setActivity(clean)
})

ipcMain.on('presence:clear', () => {
  if (presence) presence.clear()
})

ipcMain.on('presence:enabled', (_event, enabled) => {
  if (!enabled) {
    stopPresence()
    return
  }
  startPresence()
})

const uiScaleFactors = { compact: 0.9, normal: 1, large: 1.15 }

ipcMain.on('settings:apply', (event, settings = {}) => {
  const window = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (settings.uiScale && uiScaleFactors[settings.uiScale] && window) {
    try {
      window.webContents.setZoomFactor(uiScaleFactors[settings.uiScale])
    } catch {}
  }
  if (typeof settings.startWithWindows === 'boolean' && app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: settings.startWithWindows,
        path: process.execPath,
        args: [],
      })
    } catch {}
  }
  settingsCache = { ...settingsCache, ...settings }
})

/* ------------------------------ seguridad ------------------------------ */

registerSecureIpc()

ipcMain.on('window:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (!window || window.isDestroyed()) return
  try {
    window.minimize()
  } catch {}
})

ipcMain.on('notify:show', (_event, payload = {}) => {
  if (!Notification || !Notification.isSupported()) return
  // Con la ventana visible y enfocada la interfaz muestra su propia tarjeta.
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) return
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim().slice(0, 120) : 'KaferProjects Launcher'
  const body = typeof payload.body === 'string' ? payload.body.trim().slice(0, 240) : ''
  if (!body) return
  try {
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', () => showMainWindow())
    notification.show()
  } catch {}
})

ipcMain.handle('settings:choose-download-folder', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) || mainWindow
  const result = await dialog.showOpenDialog(window, {
    title: 'Elige la carpeta de descargas de KaferProjects Launcher',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Seleccionar carpeta',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// --- Ping Bedrock (RakNet UDP unconnected ping) ---
const RAKNET_MAGIC = Buffer.concat([
  Buffer.from([0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78]),
])

function raknetPing(host, port, timeoutMs = 1800) {
  return new Promise((resolve) => {
    const dgram = require('node:dgram')
    const socket = dgram.createSocket('udp4')
    const done = (result) => {
      try { socket.close() } catch {}
      resolve(result)
    }
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      done(result)
    }
    const timer = setTimeout(() => finish({ online: false }), timeoutMs)

    socket.on('error', () => {
      clearTimeout(timer)
      finish({ online: false })
    })

    socket.on('message', (msg) => {
      clearTimeout(timer)
      try {
        // Pong: 0x1c + timestamp(8) + MAGIC(16) + ident(8) + string short
        if (msg[0] !== 0x1c) return finish({ online: false })
        const strLen = msg.readUInt16BE(33)
        const info = msg.slice(35, 35 + strLen).toString('utf8')
        const parts = info.split(';')
        const isOffline = (parts[1] || '').trim().toLowerCase() === 'offline'
        finish({
          online: !isOffline,
          players: Number.parseInt(parts[4], 10) || 0,
          maxPlayers: Number.parseInt(parts[5], 10) || 0,
          motd: parts[1] || '',
          subMotd: parts[7] || '',
          version: parts[3] || '',
          protocol: Number.parseInt(parts[2], 10) || 0,
          gamemode: parts[8] || '',
          latencyMs: Math.round(Date.now() - sentAt),
        })
      } catch {
        finish({ online: false })
      }
    })

    // Pong: 0x1c + timestamp(8) + GUID(8) + MAGIC(16) + string short
    const sentAt = Date.now()
    const packet = Buffer.concat([Buffer.from([0x01]), Buffer.alloc(8, 0), RAKNET_MAGIC, Buffer.alloc(8, 0)])
    socket.send(packet, port, host, () => {})
  })
}

/** Ping a un servidor NetherNet (Bedrock 1.26.50+). Su transporte nuevo no
 *  habla RakNet: la señalización es HTTP sobre el puerto del juego y responde
 *  `GET /v1/join` con 200 cuando el servidor está vivo (protocolo observado en
 *  el tráfico real del cliente del juego). El conteo de jugadores no está
 *  expuesto en esta señalización. */
function netherNetPing(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const net = require('node:net')
    const socket = net.connect({ host, port })
    let done = false
    const chunks = []
    const sentAt = Date.now()
    const finish = (result) => {
      if (done) return
      done = true
      try { socket.destroy() } catch {}
      resolve(result)
    }
    const timer = setTimeout(() => finish({ online: false }), timeoutMs)
    socket.on('connect', () => {
      socket.write(
        `GET /v1/join HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\nUser-Agent: KaferProjectsLauncher/${APP_VERSION}\r\n\r\n`,
      )
    })
    socket.on('data', (chunk) => {
      chunks.push(chunk)
      const head = Buffer.concat(chunks).toString('latin1', 0, 64)
      const match = head.match(/HTTP\/[\d.]+ (\d{3})/)
      if (!match) return
      clearTimeout(timer)
      if (match[1] !== '200') return finish({ online: false })
      finish({
        online: true,
        transport: 'nethernet',
        players: null,
        maxPlayers: null,
        playersUnknown: true,
        motd: '',
        subMotd: '',
        version: '',
        protocol: 0,
        gamemode: '',
        latencyMs: Math.round(Date.now() - sentAt),
      })
    })
    socket.on('error', () => { clearTimeout(timer); finish({ online: false }) })
    socket.on('close', () => { clearTimeout(timer); finish({ online: false }) })
  })
}

// --- Ping Java (TCP Status/SLP con descubrimiento SRV) ---
function varintBytes(value) {
  const bytes = []
  let n = value >>> 0
  do {
    let b = n & 127
    n >>>= 7
    if (n) b |= 128
    bytes.push(b)
  } while (n)
  return Buffer.from(bytes)
}

function readVarint(buffer, offset) {
  let result = 0
  let shift = 0
  let index = offset
  while (index < buffer.length) {
    const byte = buffer[index]
    result |= (byte & 127) << shift
    index += 1
    if ((byte & 128) === 0) return { value: result, length: index - offset }
    shift += 7
    if (shift > 28) break
  }
  return null
}

function javaPing(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const net = require('node:net')
    const socket = net.createConnection({ host, port })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch {}
      resolve(result)
    }

    socket.setTimeout(timeoutMs, () => finish({ online: false, edition: 'java' }))
    socket.on('error', () => finish({ online: false, edition: 'java' }))

    // Handshake (protocolo 47) + solicitud de estado
    const hostBuf = Buffer.from(host, 'utf8')
    const portBuf = Buffer.from([(port >> 8) & 255, port & 255])
    const handshake = Buffer.concat([
      varintBytes(0x00),
      varintBytes(47),
      Buffer.from([hostBuf.length]),
      hostBuf,
      portBuf,
      Buffer.from([0x01]),
    ])
    const request = Buffer.concat([varintBytes(1), varintBytes(0x00)])
    socket.on('connect', () => {
      sentAt = Date.now()
      socket.write(Buffer.concat([varintBytes(handshake.length), handshake, request]))
    })

    let sentAt = 0

    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      try {
        const varLength = readVarint(buffer, 0)
        if (!varLength) return
        if (buffer.length < varLength.length + varLength.value) return
        const body = buffer.subarray(varLength.length, varLength.length + varLength.value)
        if (body[0] !== 0x00) return finish({ online: false, edition: 'java' })
        const strVar = readVarint(body, 1)
        if (!strVar) return finish({ online: false, edition: 'java' })
        const json = JSON.parse(body.subarray(1 + strVar.length, 1 + strVar.length + strVar.value).toString('utf8'))
        finish({
          online: true,
          edition: 'java',
          players: json?.players?.online || 0,
          // Algunos hosts (Aternos) ocultan el conteo real: max=0 → mostramos '—' en la UI
          playersUnknown: !(json?.players && json.players.max > 0),
          maxPlayers: json?.players?.max || 0,
          motd: typeof json?.description === 'string'
            ? json.description
            : json?.description?.text || json?.description?.extra?.[0]?.text || '',
          version: json?.version?.name || '',
          latencyMs: sentAt ? Date.now() - sentAt : null,
        })
      } catch {
        finish({ online: false, edition: 'java' })
      }
    })
  })
}

// Recordar la edición de cada host evita repetir la prueba Java cuando ya
// sabemos que el Instancia habla Bedrock (y al revés).
const serverEditionCache = new Map()

ipcMain.handle('server:ping', async (_event, options = {}) => {
  const rawHost = String(options.ip || '').trim()
  const port = Number.parseInt(String(options.port || ''), 10) || 19132
  if (!rawHost) return { online: false }
  const cacheKey = `${rawHost.toLowerCase()}:${port}`
  const known = serverEditionCache.get(cacheKey)

  // 1) Bedrock directo (RakNet UDP)
  if (known !== 'java') {
    try {
      const result = await raknetPing(rawHost, port)
      if (result.online) {
        serverEditionCache.set(cacheKey, 'bedrock')
        return { ...result, edition: 'bedrock' }
      }
    } catch {}
  }

  // 2) NetherNet (Bedrock 1.26.50+): señalización HTTP en el puerto del juego
  if (known !== 'java') {
    try {
      const result = await netherNetPing(rawHost, port)
      if (result.online) {
        serverEditionCache.set(cacheKey, 'bedrock')
        return { ...result, edition: 'bedrock' }
      }
    } catch {}
  }

  // 3) Java: primero registro SRV _minecraft._tcp.host (puerto real del panel)
  if (known !== 'bedrock') {
    try {
      const dnsPromises = require('node:dns').promises
      let target = { host: rawHost, port }
      try {
        const srv = await dnsPromises.resolveSrv(`_minecraft._tcp.${rawHost}`.replace(/\.$/, ''))
        if (Array.isArray(srv) && srv.length > 0) {
          target = { host: srv[0].name, port: srv[0].port }
        }
      } catch {}
      const attempts = target.host === rawHost && target.port === port ? [target] : [target, { host: rawHost, port }]
      for (const attempt of attempts) {
        const result = await javaPing(attempt.host, attempt.port)
        if (result.online) {
          serverEditionCache.set(cacheKey, 'java')
          return { ...result, edition: 'java' }
        }
      }
    } catch {}
  }

  return { online: false }
})

// --- Detección del puerto real: busca Instancias RakNet (Bedrock) en el host ---
// Algunos hosts dan un puerto web/panel que no habla Minecraft. Esta búsqueda
// encuentra los puertos que sí responden como Instancia Bedrock.
//
// El bucle de eventos del proceso principal de Electron va a ~150 ms por tick,
// así que barrer 65.535 puertos ahí dentro no llega ni a la mitad del rango.
// Por eso el barrido corre en un proceso hijo de Node (ELECTRON_RUN_AS_NODE),
// que sí mantiene el ritmo y no congela la interfaz.
const BEDROCK_SCAN_SOURCE = String.raw`
const dgram = require('node:dgram')
const MAGIC = Buffer.from([0x00,0xff,0xff,0x00,0xfe,0xfe,0xfe,0xfe,0xfd,0xfd,0xfd,0xfd,0x12,0x34,0x56,0x78])
const PACKET = Buffer.concat([Buffer.from([0x01]), Buffer.alloc(8,0), MAGIC, Buffer.alloc(8,0)])
const ip = process.argv[1]
if (!ip) process.exit(1)
const socket = dgram.createSocket('udp4')
const found = new Map()
let closed = false
const send = () => {
  if (closed) return
  closed = true
  try { process.stdout.write(JSON.stringify([...found.values()].sort((a,b) => a.port - b.port))) } catch {}
  try { socket.close() } catch {}
  process.exit(0)
}
socket.on('message', (msg, rinfo) => {
  try {
    if (msg[0] !== 0x1c || found.has(rinfo.port)) return
    const n = msg.readUInt16BE(33)
    const p = msg.slice(35, 35 + n).toString('utf8').split(';')
    found.set(rinfo.port, {
      port: rinfo.port,
      motd: p[1] || '',
      players: Number.parseInt(p[4], 10) || 0,
      maxPlayers: Number.parseInt(p[5], 10) || 0,
      version: p[3] || '',
      offline: (p[1] || '').trim().toLowerCase() === 'offline',
    })
  } catch {}
})
socket.on('error', () => send())
socket.bind(() => {
  try { socket.setRecvBufferSize(8 * 1024 * 1024) } catch {}
  let port = 1
  const pump = () => {
    if (closed) return
    const end = Math.min(65535, port + 127)
    for (; port <= end; port++) { try { socket.send(PACKET, port, ip) } catch {} }
    if (port <= 65535) setTimeout(pump, 10)
  }
  pump()
})
setTimeout(send, 16000)
`

function discoverBedrockPorts(ip, timeoutMs = 22000) {
  return new Promise((resolve) => {
    let child = null
    let settled = false
    let timer = null
    const finish = (servers) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { if (child) child.kill() } catch {}
      resolve(Array.isArray(servers) ? servers : [])
    }
    try {
      const { spawn } = require('node:child_process')
      child = spawn(process.execPath, ['-e', BEDROCK_SCAN_SOURCE, ip], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      return resolve([])
    }
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk.toString() })
    child.on('error', () => finish([]))
    child.on('exit', () => {
      try {
        const parsed = JSON.parse(out)
        finish(parsed)
      } catch {
        finish([])
      }
    })
    timer = setTimeout(() => finish([]), timeoutMs)
  })
}

ipcMain.handle('server:discover', async (_event, options = {}) => {
  const rawHost = String(options.host || '').trim()
  if (!rawHost) return { ip: '', servers: [] }
  let ip = rawHost
  try {
    const dnsPromises = require('node:dns').promises
    const record = await dnsPromises.lookup(rawHost, { family: 4 })
    if (record && record.address) ip = record.address
  } catch {}
  const servers = await discoverBedrockPorts(ip)
  return { ip, servers }
})

// --- Entrar al Instancia desde el botón JUGAR ---
// Se usa el deep link oficial de Bedrock: conecta directo al Instancia sin
// añadirlo a la lista de Instancias del juego.
function minecraftBedrockInstalled() {
  try {
    const packagesDir = path.join(process.env.LOCALAPPDATA || '', 'Packages')
    const entries = fs.readdirSync(packagesDir)
    if (entries.some((name) => /^Microsoft\.MinecraftUWP_/i.test(name))) return true
  } catch {}
  try {
    const result = require('node:child_process').spawnSync('reg', ['query', 'HKCR\\minecraft'], {
      windowsHide: true,
      timeout: 4000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

// Un Instancia Java detrás de un proxy (Aternos) puede escuchar en un puerto que
// no es el de Bedrock. El MOTD del proxy dice la dirección correcta:
// "Connect to anne25.aternos.me:19132".
async function resolveBedrockAddress(host, port) {
  const direct = await raknetPing(host, port, 1500)
  if (direct && direct.online) return { host, port, redirected: false }
  const java = await javaPing(host, port, 2500)
  if (java && java.online && java.motd) {
    // El MOTD viene con códigos de color de Minecraft (§7, §a...) intercalados.
    const cleanMotd = String(java.motd).replace(/§./g, '')
    const match = cleanMotd.match(/connect to\s+([a-z0-9.-]+):(\d{1,5})/i)
    if (match) {
      const altPort = Number.parseInt(match[2], 10)
      const sameHost = match[1].toLowerCase() === host.toLowerCase()
      if (altPort > 0 && altPort <= 65535 && (altPort !== port || !sameHost)) {
        return { host: match[1], port: altPort, redirected: true }
      }
    }
  }
  return { host, port, redirected: false }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** ¿Está abierto Minecraft Bedrock? Consulta síncrona y corta a tasklist. */
function minecraftRunning() {
  try {
    const result = spawnSync('tasklist', ['/NH'], { windowsHide: true, timeout: 15000, encoding: 'utf8' })
    if (result.error) {
      logBoot(`minecraftRunning: error=${result.error.message}`)
      return null
    }
    return /Minecraft\.Windows\.exe/i.test(String(result.stdout || ''))
  } catch (error) {
    logBoot(`minecraftRunning: excepción ${String(error && error.message)}`)
    return null
  }
}

/** Abre un enlace minecraft:// con ShellExecute (sin procesos externos:
 *  lanzar powershell/cmd desde una app sin firmar activa Smart App Control). */
async function openMinecraftUrl(url) {
  try {
    await shell.openExternal(url)
    return true
  } catch {}
  try {
    spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return true
  } catch {
    return false
  }
}

// El aviso "¿Quieres unirte a un servidor externo?" lo dibuja el propio juego y
// lo confirma el jugador: no se simula ningún clic ni tecla.

ipcMain.handle('game:join', async (_event, options = {}) => {
  const host = String(options.ip || '').trim()
  const port = Number.parseInt(String(options.port || ''), 10) || 19132
  if (!host) return { ok: false, error: 'no-server' }
  if (port < 1 || port > 65535) return { ok: false, error: 'bad-port' }
  if (!minecraftBedrockInstalled()) return { ok: false, error: 'not-installed' }

  const target = await resolveBedrockAddress(host, port)
  // El cliente 1.26+ (transporte NetherNet) espera `serverAddress=host:puerto`;
  // los clientes antiguos usan `serverUrl`/`serverPort`. Se envían ambos para
  // que la ventana de confirmación aparezca en cualquier versión del juego.
  // OJO: el juego NO decodifica URL-encoding en serverAddress: el separador de
  // puerto debe ir en crudo (dos puntos), no como %3A.
  const url =
    `minecraft://connect/?serverUrl=${encodeURIComponent(target.host)}&serverPort=${target.port}` +
    `&serverAddress=${target.host}:${target.port}`

  // Si Bedrock está cerrado, el aviso de "unirse a un servidor externo" se
  // pierde: Windows abre el juego y la petición llega mientras aún carga.
  // Por eso primero abrimos el juego, esperamos a que arranque y solo
  // entonces enviamos el enlace de conexión.
  // UN SOLO envío por clic en JUGAR. El deep link de conexión lanza Minecraft
  // si está cerrado y Windows le entrega el enlace al juego, que lo procesa
  // cuando el menú está listo (probado con Minecraft 1.26: la ventana de
  // confirmación aparece sola al terminar de cargar). Si el jugador la cancela,
  // no se vuelve a abrir hasta que pique JUGAR otra vez.
  const running = await minecraftRunning()
  logBoot(`game:join ${target.host}:${target.port} running=${running} envío único`)
  try {
    await openMinecraftUrl(url)
  } catch (error) {
    logBoot(`game:join EXC ${String(error && error.stack || error)}`)
    return { ok: false, error: 'launch-failed' }
  }

  return { ok: true, url, host: target.host, port: target.port, redirected: target.redirected, started: running === false }
})

// --- Addons / packs de Instancia ---
// Los packs no se importan con el diálogo normal de Minecraft. Se dejan en la
// misma caché que usa el cliente para los packs que descarga de un servidor
// (com.mojang/resource_packs y behavior_packs), con su misma convención de
// nombres: sin espacios y recortado a 10 caracteres. Así el juego los reconoce
// sin abrir el importador, que dejaría al jugador ver y extraer el pack.
const ADDON_EXTENSIONS = ['.mcaddon', '.mcpack', '.mcworld', '.mctemplate']

const ZIP_EOCD = 0x06054b50
const ZIP_CENTRAL = 0x02014b50
const ZIP_LOCAL = 0x04034b50

function addonFileName(name, url) {
  const base = String(name || 'kafer-addon')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'kafer-addon'
  const clean = String(url || '').toLowerCase().split('?')[0].split('#')[0]
  const ext = ADDON_EXTENSIONS.find((candidate) => clean.endsWith(candidate)) || '.mcaddon'
  return `${base}${ext}`
}

/** Lee un ZIP en memoria (sin dependencias externas). */
function readZipEntries(buffer) {
  let eocd = -1
  const min = Math.max(0, buffer.length - 65557)
  for (let index = buffer.length - 22; index >= min; index--) {
    if (buffer.readUInt32LE(index) === ZIP_EOCD) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('invalid-zip')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  for (let index = 0; index < count; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL) throw new Error('invalid-zip')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== ZIP_LOCAL) throw new Error('invalid-zip')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)
    entries.push({
      name: name.replace(/\\/g, '/'),
      data: method === 0 ? raw : zlib.inflateRawSync(raw),
    })
  }
  return entries
}

function safeRelativePath(name) {
  const clean = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = clean.split('/').filter((part) => part && part !== '.')
  if (parts.some((part) => part === '..')) return null
  return parts.join('/')
}

function extractPackEntries(entries, prefix, targetDir) {
  const cleanPrefix = prefix ? `${prefix.replace(/\/+$/, '')}/` : ''
  for (const entry of entries) {
    if (cleanPrefix && !entry.name.startsWith(cleanPrefix)) continue
    const relative = safeRelativePath(cleanPrefix ? entry.name.slice(cleanPrefix.length) : entry.name)
    if (!relative) continue
    const target = path.join(targetDir, relative)
    if (target !== targetDir && !target.startsWith(targetDir + path.sep)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, entry.data)
  }
}

// --- Caché interna de packs de servidor ("Datos en caché") ---
// Cuando Bedrock descarga los packs de un servidor (CubeCraft, Hive, etc.) no
// los deja en `games/com.mojang/resource_packs` (visible y copiable por el
// jugador), sino en su caché interna de packs:
//   %LOCALAPPDATA%\Temp\Minecraft Bedrock\minecraftpe\packcache\resource\<clave>\
// Esa caché es la que el juego muestra en Ajustes > Almacenamiento como
// "Datos en caché", y no aparece como pack seleccionable del jugador.
// Estructura observada (creada por el propio juego):
//   <clave>/manifest.json + archivos  (pack descargado del servidor)
//   <clave>/RP/manifest.json + ...    (copia de un pack suelto al aplicarlo)
//   <clave>/BP/...                    (parte de comportamiento, si la hay)
function packCacheRoot() {
  return path.join(os.tmpdir(), 'Minecraft Bedrock', 'minecraftpe', 'packcache', 'resource')
}

/** Clave estable por pack (uuid + versión), igual estilo que las carpetas del
 *  juego: base64 de 12 caracteres. Reinstalar la misma versión reemplaza la
 *  entrada en vez de duplicarla. */
function packCacheKey(uuid, version) {
  const digest = require('node:crypto')
    .createHash('sha256')
    .update(`${String(uuid || '')}_${Array.isArray(version) ? version.join('.') : String(version || '')}`)
    .digest()
  return digest.subarray(0, 8).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Extrae un .mcaddon/.mcpack directo en la caché interna de packs de Bedrock
 *  ("Datos en caché"), como los que baja el juego de los servidores. */
function installPackBuffer(buffer) {
  const root = packCacheRoot()
  try {
    fs.mkdirSync(root, { recursive: true })
  } catch (error) {
    logBoot(`installPackBuffer: fallo creando caché ${String(error && error.message)}`)
    return { ok: false, error: 'not-installed' }
  }

  const entries = readZipEntries(buffer)
  const manifests = entries.filter((entry) => /(^|\/)manifest\.json$/i.test(entry.name))
  if (manifests.length === 0) return { ok: false, error: 'invalid-pack' }

  const installed = []

  for (const manifestEntry of manifests) {
    let manifest
    try {
      manifest = JSON.parse(manifestEntry.data.toString('utf8'))
    } catch {
      continue
    }
    const header = manifest?.header || {}
    const types = Array.isArray(manifest?.modules)
      ? manifest.modules.map((module) => String(module?.type || ''))
      : []
    const wantsResources = types.some((type) => type === 'resources' || type === 'client_data')
    const wantsBehavior = types.some((type) => type === 'data' || type === 'script')
    if (!wantsResources && !wantsBehavior) continue

    const prefix = manifestEntry.name.slice(0, manifestEntry.name.length - 'manifest.json'.length)
    const key = packCacheKey(header.uuid, header.version)

    for (const folder of [wantsResources && 'RP', wantsBehavior && 'BP']) {
      if (!folder) continue
      const target = path.join(root, key, folder)
      try {
        fs.rmSync(target, { recursive: true, force: true })
      } catch {}
      fs.mkdirSync(target, { recursive: true })
      extractPackEntries(entries, prefix, target)
      installed.push(target)
    }
  }

  if (installed.length === 0) return { ok: false, error: 'invalid-pack' }
  return { ok: true, installed: true, cache: true, path: installed[0], paths: installed, root }
}

function isWorldFile(file) {
  return /\.(mcworld|mctemplate)$/i.test(String(file || ''))
}

async function openWorldFile(file) {
  const openError = await shell.openPath(file)
  if (openError) return { ok: true, opened: false, path: file, error: openError }
  return { ok: true, opened: true, path: file }
}

ipcMain.handle('addon:install', async (_event, options = {}) => {
  const url = String(options.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad-url' }
  const targetDir = path.join(app.getPath('userData'), 'addons')
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    const file = path.join(targetDir, addonFileName(options.name, url))
    const response = await net.fetch(url, { headers: { 'User-Agent': `KaferProjectsLauncher/${APP_VERSION}` } })
    if (!response.ok) return { ok: false, error: `http-${response.status}` }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) return { ok: false, error: 'empty-file' }
    if (options.sha256) {
      const actual = require('node:crypto').createHash('sha256').update(buffer).digest('hex')
      if (actual.toLowerCase() !== String(options.sha256).trim().toLowerCase()) {
        return { ok: false, error: 'hash-mismatch' }
      }
    }
    fs.writeFileSync(file, buffer)
    if (isWorldFile(file)) return openWorldFile(file)
    try {
      return { ...installPackBuffer(buffer), cached: file }
    } catch {
      return { ok: false, error: 'invalid-pack', cached: file }
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
})

ipcMain.handle('addon:install-file', async (_event, options = {}) => {
  try {
    const data = options.data
    if (!data) return { ok: false, error: 'no-data' }
    const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(new Uint8Array(data))
    if (buffer.length === 0) return { ok: false, error: 'empty-file' }
    const targetDir = path.join(app.getPath('userData'), 'addons')
    fs.mkdirSync(targetDir, { recursive: true })
    const file = path.join(targetDir, addonFileName(options.name, options.fileName || ''))
    fs.writeFileSync(file, buffer)
    if (isWorldFile(file)) return openWorldFile(file)
    try {
      return { ...installPackBuffer(buffer), cached: file }
    } catch {
      return { ok: false, error: 'invalid-pack', cached: file }
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
})

ipcMain.handle('addon:reveal', async (_event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  } catch {
    return false
  }
})

// --- Aternos: estado del panel (jugadores con sesión de la propia cuenta) ---
const AI = require('electron')
function aternosPartition() {
  if (!global.__ekoAternosSession) {
    global.__ekoAternosSession = AI.session.fromPartition('persist:eko-aternos', { cache: true })
  }
  return global.__ekoAternosSession
}

function aternosFetchHtml(url) {
  return net.fetch(url, { session: aternosPartition(), useSessionCookies: true, method: 'GET', headers: { 'Accept': 'text/html' } })
    .then((res) => res.text().then((body) => ({ status: res.status, body })))
    .catch(() => ({ status: 0, body: '' }))
}

// Parser robusto basado en estructura real del panel:
// <a class="servercard online" data-id="XXXX" title="Nombre" ...>
//   <div class="server-name"> Nombre </div> ... <div class="statusplayerbadge" title="Players">1/20</div>
function parseAternosServers(html) {
  const out = []
  const marker = 'class="servercard'
  let index = html.indexOf(marker)
  while (index >= 0 && out.length < 60) {
    const next = html.indexOf(marker, index + marker.length)
    const chunk = html.slice(index, next >= 0 ? next : index + 8000)
    const stateMatch = /class="servercard([^"]*)"/.exec(chunk)
    const state = stateMatch ? (stateMatch[1] || '').trim() : ''
    const idMatch = /data-id="([A-Za-z0-9]+)"/.exec(chunk)
    const badgeMatch = /statusplayerbadge[^>]*>\s*([0-9]+)\s*\/\s*([0-9]+)/.exec(chunk)
    const nameMatch = /server-name[^>]*>\s*([^<]{1,40}?)\s*</.exec(chunk)
    if (idMatch) {
      const stateParts = state.split(/\s+/).filter(Boolean)
      out.push({
        id: idMatch[1],
        name: (nameMatch ? nameMatch[1] : '').trim(),
        state,
        online: stateParts[0] === 'online',
        players: badgeMatch ? Number.parseInt(badgeMatch[1], 10) : 0,
        maxPlayers: badgeMatch ? Number.parseInt(badgeMatch[2], 10) : 0,
      })
    }
    index = next
  }
  return out
}

// Ventana oculta permanente: el WAF de Aternos solo acepta peticiones desde
// un contexto de página real, así que consultamos el estado desde ahí.
let aternosHiddenWindow = null
let aternosHiddenReady = false
let aternosHiddenLoadAt = 0

function ensureAternosHiddenWindow() {
  if (aternosHiddenWindow && !aternosHiddenWindow.isDestroyed()) return aternosHiddenWindow
  aternosHiddenReady = false
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      session: aternosPartition(),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })
  aternosHiddenWindow = win
  aternosHiddenLoadAt = Date.now()
  win.webContents.on('did-finish-load', () => { aternosHiddenReady = true })
  win.on('closed', () => {
    aternosHiddenWindow = null
    aternosHiddenReady = false
  })
  win.loadURL('https://aternos.org/servers/')
  return win
}

const AT_STATUS_JS = `(async () => {
  try {
    const res = await fetch('/servers/', { credentials: 'include' });
    const html = await res.text();
    if (html.indexOf('servercard') < 0) {
      return JSON.stringify({ loggedIn: false });
    }
    const list = [];
    const marker = 'class="servercard';
    let index = html.indexOf(marker);
    while (index >= 0 && list.length < 60) {
      const next = html.indexOf(marker, index + marker.length);
      const chunk = html.slice(index, next >= 0 ? next : index + 8000);
      const sm = chunk.match(/class="servercard([^"]*)"/);
      const state = sm ? (sm[1] || '').trim() : '';
      const im = chunk.match(/data-id="([A-Za-z0-9]+)"/);
      const bm = chunk.match(/statusplayerbadge[^>]*>\\s*([0-9]+)\\s*\\/\\s*([0-9]+)/);
      const nm = chunk.match(/server-name[^>]*>\\s*([^<]{1,40}?)\\s*</);
      if (im) {
        const parts = state.split(/\\s+/).filter(Boolean);
        list.push({
          id: im[1],
          name: nm ? nm[1].trim() : '',
          state: parts[0] || '',
          online: parts[0] === 'online',
          players: bm ? parseInt(bm[1], 10) : 0,
          maxPlayers: bm ? parseInt(bm[2], 10) : 0,
        });
      }
      index = next;
    }
    return JSON.stringify({ loggedIn: true, list: list });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
})()`

ipcMain.handle('aternos:status', async (_event, options = {}) => {
  const host = String(options.host || '').trim().toLowerCase()
  if (!host.endsWith('aternos.me') && !host.endsWith('aternos.os') && !host.endsWith('aternos.life')) {
    return { online: false, notAternos: true }
  }
  // El WAF de Aternos solo deja consultar desde contexto de página real;
  // usamos la ventana oculta con la sesión persistente del launcher.
  try {
    const win = ensureAternosHiddenWindow()
    if (!aternosHiddenReady) return { online: false, pending: true }
    const raw = await win.webContents.executeJavaScript(AT_STATUS_JS, true)
    const data = JSON.parse(raw)
    if (data.error) return { online: false, error: data.error }
    if (!data.loggedIn) {
      return { online: false, needsLogin: true }
    }
    const prefix = host.split('.')[0].replace(/[^a-z0-9_]/g, '')
    const candidates = data.list
      .filter((s) => s.name.toLowerCase().replace(/[^a-z0-9_]/g, '') === prefix)
      .filter((s) => s.state !== 'deleted')
    const found = candidates.find((s) => s.online) || candidates[0]
    if (!found) return { online: false, notFound: true, count: data.list.length }
    if (!found.online) return { online: false, players: 0, maxPlayers: found.maxPlayers, aternosPanel: true }
    return {
      online: true,
      players: found.players,
      maxPlayers: found.maxPlayers,
      edition: 'aternos-panel',
      aternosPanel: true,
      latencyMs: null,
    }
  } catch {
    return { online: false, pending: true }
  }
})

let aternosLoginWindow = null
ipcMain.handle('aternos:login', async () => {
  if (aternosLoginWindow && !aternosLoginWindow.isDestroyed()) {
    aternosLoginWindow.focus()
    return { ok: false, already: true }
  }
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 470,
      height: 660,
      title: 'Conectar Aternos',
      autoHideMenuBar: true,
      webPreferences: {
        session: aternosPartition(),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    aternosLoginWindow = win
    let resolved = false
    let pollTimer = null
    const finish = (ok) => {
      if (resolved) return
      resolved = true
      if (pollTimer) clearInterval(pollTimer)
      resolve({ ok })
    }
    // Cierre automático SOLO cuando la sesión de Aternos funciona de verdad.
    pollTimer = setInterval(async () => {
      try {
        if (win.isDestroyed()) return
        const raw = await win.webContents.executeJavaScript(`(async () => {
          try { const res = await fetch('/servers/', { credentials: 'include' }); const t = await res.text(); return String(t.indexOf('servercard') >= 0) } catch (e) { return 'false' }
        })()`, true)
        if (String(raw) === 'true') {
          finish(true)
          setTimeout(() => { try { win.close() } catch {} }, 600)
        }
      } catch {}
    }, 2500)
    win.webContents.on('did-navigate', (_e, url) => {
      const u = url.replace(/\/$/, '')
      if (u.endsWith('aternos.org/panel') || u.endsWith('aternos.org/servers')) {
        // El cierre lo confirma el poll (valida sesión real)
      }
    })
    win.on('closed', () => {
      aternosLoginWindow = null
      finish(false)
    })
    win.loadURL('https://aternos.org/go/')
  })
})

ipcMain.handle('settings:system-info', () => ({
  cpu: os.cpus()?.[0]?.model || 'CPU desconocida',
  cores: os.cpus()?.length || 0,
  memoryTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
  memoryFreeMb: Math.round(os.freemem() / (1024 * 1024)),
  platform: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  hostname: os.hostname(),
  displays: screen ? screen.getAllDisplays().map((d) => ({ width: d.size.width, height: d.size.height })) : [],
}))

const microsoftAllowedHosts = new Set([
  'login.microsoftonline.com',
  'graph.microsoft.com',
  'user.auth.xboxlive.com',
  'xsts.auth.xboxlive.com',
  'profile.xboxlive.com',
  'api.minecraftservices.com',
  'api.geysermc.org',
])

ipcMain.handle('microsoft:request', async (_event, options = {}) => {
  try {
    const url = new URL(String(options.url || ''))
    if (!microsoftAllowedHosts.has(url.hostname)) {
      return { ok: false, status: 0, error: `Host no permitido: ${url.hostname}` }
    }
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, error: error.message || 'Error de red' }
  }
})

const imageAllowedHosts = new Set(['textures.minecraft.net', 'api.geysermc.org', 'mc-heads.net'])

ipcMain.handle('image:fetch', async (_event, url) => {
  try {
    const target = new URL(String(url || ''))
    if (!imageAllowedHosts.has(target.hostname)) return null
    const response = await fetch(target.toString())
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const type = response.headers.get('content-type') || 'image/png'
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
})

const externalAllowedHosts = new Set([
  'www.microsoft.com',
  'microsoft.com',
  'login.microsoft.com',
  'login.live.com',
  'patreon.com',
  'www.patreon.com',
  'discord.com',
  'www.discord.com',
  'discord.gg',
  'discordapp.com',
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
])

ipcMain.handle('shell:open-external', async (_event, url) => {
  try {
    const target = new URL(String(url || ''))
    if (target.protocol !== 'https:' || !externalAllowedHosts.has(target.hostname)) return false
    await shell.openExternal(target.toString())
    return true
  } catch {
    return false
  }
})

function findSkinPng(dir, skinUuid, depth = 0) {
  if (depth > 4 || !skinUuid) return null
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findSkinPng(full, skinUuid, depth + 1)
      if (nested) return nested
    } else if (entry.name.toLowerCase().endsWith('.png') && entry.name.toLowerCase().startsWith(skinUuid.toLowerCase())) {
      return full
    }
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) return path.join(dir, entry.name)
  }
  return null
}

ipcMain.handle('skin:local', async (_event, options = {}) => {
  try {
    const base = path.join(app.getPath('appData'), 'Minecraft Bedrock', 'Users')
    if (!fs.existsSync(base)) return null
    const wantedXuid = String(options.xuid || '').trim()
    const users = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    const candidates = []
    for (const user of users) {
      const root = path.join(base, user.name, 'games', 'com.mojang')
      const optionsFile = path.join(root, 'minecraftpe', 'options.txt')
      let lastXuid = ''
      let skinType = ''
      try {
        const text = fs.readFileSync(optionsFile, 'utf8')
        const xuidMatch = text.match(/^last_xuid:(.*)$/m)
        const skinMatch = text.match(/^game_skintypefull:(.*)$/m)
        lastXuid = xuidMatch ? xuidMatch[1].trim() : ''
        skinType = skinMatch ? skinMatch[1].trim() : ''
      } catch {}
      const skinUuid = skinType.includes('_') ? skinType.split('_').pop() : ''
      const png = findSkinPng(path.join(root, 'custom_skins'), skinUuid)
      if (png) {
        let mtime = 0
        try {
          mtime = fs.statSync(png).mtimeMs
        } catch {}
        candidates.push({ lastXuid, png, mtime })
      }
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => {
      const matchA = wantedXuid && a.lastXuid === wantedXuid ? 1 : 0
      const matchB = wantedXuid && b.lastXuid === wantedXuid ? 1 : 0
      if (matchA !== matchB) return matchB - matchA
      return b.mtime - a.mtime
    })
    const chosen = wantedXuid ? candidates.find((item) => item.lastXuid === wantedXuid) : candidates[0]
    if (!chosen) return null
    const buffer = fs.readFileSync(chosen.png)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('installer:default-path', () => path.join(app.getPath('documents'), 'KaferProjects Components'))

ipcMain.handle('installer:choose-folder', async (event, current) => {
  const window = BrowserWindow.fromWebContents(event.sender) || installerWindow
  const result = await dialog.showOpenDialog(window, {
    title: 'Elige la carpeta de instalación de KaferProjects Launcher',
    defaultPath: current || path.join(app.getPath('documents'), 'KaferProjects Components'),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Seleccionar carpeta',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('installer:install', async (event, installPath) => {
  try {
    const sender = event.sender
    const result = await installTo({
      root: appRoot,
      installPath,
      runtimeRoot: app.isPackaged ? path.dirname(process.resourcesPath) : null,
      onProgress: (progress) => {
        if (!sender.isDestroyed()) sender.send('installer:progress', progress)
      },
    })

    writeConfig({
      installPath: result.installPath,
      version: APP_VERSION,
      installedAt: new Date().toISOString(),
    })

    return { ok: true, installPath: result.installPath, files: result.files }
  } catch (error) {
    return { ok: false, error: error.message || 'La instalación falló.' }
  }
})

ipcMain.handle('installer:finish', async (event, options = {}) => {
  const installPath = getInstalledPath()
  if (!installPath) return { ok: false, error: 'No se encontró una instalación válida.' }

  const warnings = []

  if (options.createShortcut) {
    try {
      if (!createShortcut(desktopShortcutPath(), installPath)) warnings.push('No se pudo crear el acceso directo del escritorio.')
    } catch {
      warnings.push('No se pudo crear el acceso directo del escritorio.')
    }
  }

  if (options.addToStartup) {
    try {
      if (!createShortcut(startupShortcutPath(), installPath)) warnings.push('No se pudo agregar KaferProjects Launcher al inicio.')
    } catch {
      warnings.push('No se pudo agregar KaferProjects Launcher al inicio.')
    }
  }

  scheduleSetupCleanup()

  if (options.runNow) {
    if (app.isPackaged) {
      const child = spawn(installedExecutable(installPath), [], { detached: true, stdio: 'ignore', cwd: installPath })
      child.unref()
      app.quit()
      return { ok: true, warnings }
    }

    switchingToMain = true
    if (installerWindow) {
      const window = installerWindow
      installerWindow = null
      window.destroy()
    }
    openMain(installPath)
  } else {
    app.quit()
  }

  return { ok: true, warnings }
})

ipcMain.on('installer:cancel', () => {
  app.quit()
})

app.whenReady().then(() => {
  logBoot(`whenReady packaged=${app.isPackaged} argv=${JSON.stringify(process.argv)} resourcesPath=${process.resourcesPath} appPath=${app.getAppPath()}`)

  if (app.isPackaged) {
    // Sin menú de desarrollo: elimina los atajos de DevTools/recarga.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Editar',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
      ]),
    )
  }

  const forceInstaller = process.argv.includes('--installer') || process.env.EKO_FORCE_INSTALLER === '1'

  if (app.isPackaged && !forceInstaller) {
    openMain(app.getAppPath())
  } else {
    const installedPath = getInstalledPath()
    if (installedPath && !forceInstaller) openMain(installedPath)
    else openInstaller()
  }

  if (process.env.EKO_SMOKE === '1') {
    setTimeout(() => app.quit(), 2500)
  }
})

app.on('window-all-closed', () => {
  if (switchingToMain) return
  if (settingsCache.minimizeOnClose && !app.isQuitting) {
    ensureTray()
    return
  }
  stopPresence()
  destroyTray()
  app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopPresence()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const installedPath = getInstalledPath()
    if (installedPath) openMain(installedPath)
    else openInstaller()
  }
})
