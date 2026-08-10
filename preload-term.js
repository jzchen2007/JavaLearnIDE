'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('termApi', {
  input: (data) => ipcRenderer.send('term:input', data),
  clear: () => ipcRenderer.send('term:clear'),
  stop: () => ipcRenderer.invoke('term:stop'),
  openError: (file, line) => ipcRenderer.send('term:openError', { file, line }),
  onData: (cb) => ipcRenderer.on('term:data', (_e, d) => cb(d)),
  onStart: (cb) => ipcRenderer.on('term:start', (_e, d) => cb(d)),
  onExit: (cb) => ipcRenderer.on('term:exit', (_e, d) => cb(d)),
  onErrors: (cb) => ipcRenderer.on('term:errors', (_e, d) => cb(d))
});
