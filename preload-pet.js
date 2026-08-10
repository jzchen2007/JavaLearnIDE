'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  action: (a) => ipcRenderer.invoke('pet:action', a),
  hide: () => ipcRenderer.send('pet:hide'),
  setInteractive: (v) => ipcRenderer.send('pet:setInteractive', !!v),
  moveTo: (x, y) => ipcRenderer.send('pet:moveTo', { x, y })
});
