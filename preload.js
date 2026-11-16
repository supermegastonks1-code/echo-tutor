const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('klyaks', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  openKeyPage: () => ipcRenderer.send('open-key-page'),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
  log: (line) => ipcRenderer.send('log', line),
  onUpdateReady: (cb) => ipcRenderer.on('update:ready', (_e, version) => cb(version)),
  installUpdate: () => ipcRenderer.send('update:install'),
  onClosing: (cb) => ipcRenderer.on('app:closing', () => cb()),
  closedOk: () => ipcRenderer.send('app:closed-ok')
});
