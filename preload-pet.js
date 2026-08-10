'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  action: (a) => ipcRenderer.invoke('pet:action', a),
  hide: () => ipcRenderer.send('pet:hide')
});
