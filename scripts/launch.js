// 启动器：规避环境中 ELECTRON_RUN_AS_NODE 干扰，正常启动 Electron 应用
'use strict';
delete process.env.ELECTRON_RUN_AS_NODE;
const path = require('path');
const { spawn } = require('child_process');

const electronPath = require('electron'); // 在 Node 环境下返回可执行文件路径
const appDir = path.join(__dirname, '..');
const child = spawn(electronPath, [appDir], { stdio: 'inherit', env: process.env });
child.on('close', (code) => process.exit(code == null ? 0 : code));
