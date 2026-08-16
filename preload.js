'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 初始化
  init: () => ipcRenderer.invoke('app:init'),
  getKeywords: () => ipcRenderer.invoke('keywords:get'),
  detectPython: () => ipcRenderer.invoke('python:detect'),
  leetcodeFetch: (query, lang) => ipcRenderer.invoke('leetcode:fetch', { query, lang }),
  leetcodeAddTestCase: (dir, tc) => ipcRenderer.invoke('leetcode:addTestCase', { dir, input: tc.input, expected: tc.expected }),
  leetcodeRunTests: (dir, lang) => ipcRenderer.invoke('leetcode:runTests', { dir, lang }),
  // 文件
  openFileDialog: () => ipcRenderer.invoke('file:openDialog'),
  openFolderDialog: () => ipcRenderer.invoke('file:openFolderDialog'),
  pickExe: () => ipcRenderer.invoke('file:pickExe'),
  newFile: () => ipcRenderer.invoke('file:new'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, c) => ipcRenderer.invoke('file:write', { path: p, content: c }),
  listProject: () => ipcRenderer.invoke('project:list'),
  setCurrentFile: (p) => ipcRenderer.send('app:setCurrentFile', p),
  // 编译运行
  compile: (p) => ipcRenderer.invoke('compile', p),
  run: (p) => ipcRenderer.invoke('run', p),
  stopRun: () => ipcRenderer.invoke('term:stop'),
  showTerminal: () => ipcRenderer.send('term:show'),
  togglePet: () => ipcRenderer.send('pet:toggle'),
  // 统计与设置
  addStats: (n) => ipcRenderer.send('stats:add', n),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (p) => ipcRenderer.send('settings:set', p),
  // 系统
  revealLine: (file, line) => ipcRenderer.send('window:revealLine', { file, line }),
  showItemInFolder: (p) => ipcRenderer.send('shell:showItem', p),
  openPath: (p) => ipcRenderer.send('shell:openPath', p),
  readyToClose: () => ipcRenderer.send('app:readyToClose'),
  onBeforeClose: (cb) => ipcRenderer.on('app:beforeClose', () => cb()),
  // 主进程 → 渲染进程事件
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  onReveal: (cb) => ipcRenderer.on('editor:revealLine', (_e, d) => cb(d)),
  onCompileResult: (cb) => ipcRenderer.on('compile:result', (_e, r) => cb(r)),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s))
});
