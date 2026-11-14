const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('klyaks', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  openKeyPage: () => ipcRenderer.send('open-key-page'),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
  log: (line) => ipcRenderer.send('log', line)
});
