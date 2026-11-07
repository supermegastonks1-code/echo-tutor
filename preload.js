const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loki', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
  log: (line) => ipcRenderer.send('log', line)
});
