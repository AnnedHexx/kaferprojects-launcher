const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ekoLauncher', {
  setActivity: (activity) => ipcRenderer.send('presence:set', activity),
  clearActivity: () => ipcRenderer.send('presence:clear'),
  setEnabled: (enabled) => ipcRenderer.send('presence:enabled', enabled),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('presence:status', listener)
    return () => ipcRenderer.removeListener('presence:status', listener)
  },
  applySettings: (settings) => ipcRenderer.send('settings:apply', settings),
  chooseDownloadFolder: () => ipcRenderer.invoke('settings:choose-download-folder'),
  getSystemInfo: () => ipcRenderer.invoke('settings:system-info'),
  onSystemInfo: (callback) => {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('settings:system-info', listener)
    return () => ipcRenderer.removeListener('settings:system-info', listener)
  },
  microsoftRequest: (options) => ipcRenderer.invoke('microsoft:request', options),
  fetchImage: (url) => ipcRenderer.invoke('image:fetch', url),
  pingServer: (options) => ipcRenderer.invoke('server:ping', options),
  discoverServer: (options) => ipcRenderer.invoke('server:discover', options),
  joinGame: (options) => ipcRenderer.invoke('game:join', options),
  aternosStatus: (options) => ipcRenderer.invoke('aternos:status', options),
  aternosLogin: () => ipcRenderer.invoke('aternos:login'),
  getLocalSkin: (options) => ipcRenderer.invoke('skin:local', options),
  installAddon: (options) => ipcRenderer.invoke('addon:install', options),
  installAddonFile: (options) => ipcRenderer.invoke('addon:install-file', options),
  revealAddon: (filePath) => ipcRenderer.invoke('addon:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  notify: (payload) => ipcRenderer.send('notify:show', payload),
})

contextBridge.exposeInMainWorld('kaferSecurity', {
  available: () => ipcRenderer.invoke('security:available'),
  getSession: () => ipcRenderer.invoke('security:get-session'),
  setSession: (session) => ipcRenderer.invoke('security:set-session', session),
  clearSession: () => ipcRenderer.invoke('security:clear-session'),
  setSecret: (name, value) => ipcRenderer.invoke('security:set-secret', { name, value }),
  hasSecret: (name) => ipcRenderer.invoke('security:has-secret', { name }),
  deleteSecret: (name) => ipcRenderer.invoke('security:delete-secret', { name }),
})
