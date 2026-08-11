'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  action: (a) => ipcRenderer.invoke('pet:action', a),
  hide: () => ipcRenderer.send('pet:hide'),
  setPanel: (open) => ipcRenderer.send('pet:setPanel', !!open),
  moveTo: (x, y) => ipcRenderer.send('pet:moveTo', { x, y }),
  onResync: (cb) => ipcRenderer.on('pet:resync', () => cb())
});
