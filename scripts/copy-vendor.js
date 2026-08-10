// 将 node_modules 中的前端库拷贝到 vendor/ 目录，供渲染进程离线加载（不走打包器）
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error('[copy-vendor] 缺失目录: ' + src);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (!entry.name.endsWith('.map')) fs.copyFileSync(s, d); // 跳过调试用的 .map 文件
  }
}

copyDir(path.join(root, 'node_modules/monaco-editor/min/vs'), path.join(root, 'vendor/monaco/vs'));
copyDir(path.join(root, 'node_modules/xterm/lib'), path.join(root, 'vendor/xterm'));
copyDir(path.join(root, 'node_modules/@xterm/addon-fit/lib'), path.join(root, 'vendor/xterm'));
fs.copyFileSync(path.join(root, 'node_modules/xterm/css/xterm.css'), path.join(root, 'vendor/xterm/xterm.css'));
console.log('[copy-vendor] 完成');
