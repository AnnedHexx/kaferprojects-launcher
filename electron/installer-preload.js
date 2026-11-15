const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ekoInstaller', {
  defaultPath: () => ipcRenderer.invoke('installer:default-path'),
  chooseFolder: (current) => ipcRenderer.invoke('installer:choose-folder', current),
  install: (target) => ipcRenderer.invoke('installer:install', target),
  finish: (options) => ipcRenderer.invoke('installer:finish', options),
  cancel: () => ipcRenderer.send('installer:cancel'),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('installer:progress', listener)
    return () => ipcRenderer.removeListener('installer:progress', listener)
  },
})
