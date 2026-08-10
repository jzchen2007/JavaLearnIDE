// 打包启动器：本机 PATH 中的 node 可能是 LobsterAI 包装器（会把脚本路径当位置参数），
// electron-builder 的 yargs 解析会出错。这里显式寻找真正的 node.exe 来运行 electron-builder。
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const candidates = [
  process.env.REAL_NODE,
  'D:/nodejs/node.exe',
  'C:/Program Files/nodejs/node.exe',
  'C:/Program Files (x86)/nodejs/node.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs/nodejs/node.exe') : null
].filter(Boolean);

let realNode = null;
for (const c of candidates) {
  try { if (fs.existsSync(c)) { realNode = c; break; } } catch {}
}
if (!realNode) {
  console.error('[dist] 未找到真正的 node.exe（尝试过: ' + candidates.join(', ') + '）。可设置环境变量 REAL_NODE 指定路径。');
  process.exit(1);
}

const cli = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');
const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/'
};
console.log('[dist] 使用真实 node:', realNode);
const child = spawn(realNode, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code == null ? 0 : code));
