'use strict';
// ============ 外部终端窗口逻辑（xterm.js） ============
(function () {
  const termApi = window.termApi;
  const host = document.getElementById('terminal');

  const term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "Consolas, 'Courier New', monospace",
    lineHeight: 1.35,
    scrollback: 5000,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#aeafad',
      selectionBackground: '#264f78'
    }
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  fit.fit();
  window.addEventListener('resize', () => fit.fit());
  window.__term = term; // 调试探针：供 VERIFY 读取终端实际显示内容

  // ---------- 本地行编辑 + 输入回显 ----------
  // 程序 stdin 是管道（没有终端驱动的规范化处理），
  // 因此退格/回车/粘贴/Ctrl+C 都在这里自行处理，输入内容以青色回显。
  let inputBuffer = '';
  let inEscape = false; // 忽略方向键等转义序列
  term.onData((data) => {
    for (const ch of data) {
      if (inEscape) { if (/[A-Za-z~]/.test(ch)) inEscape = false; continue; }
      if (ch === '\x1b') { inEscape = true; continue; }
      if (ch === '\r' || ch === '\n') {
        term.write('\x1b[0m\r\n');
        termApi.input(inputBuffer + '\n');
        inputBuffer = '';
      } else if (ch === '\x7f' || ch === '\b') {
        if (inputBuffer.length) { inputBuffer = inputBuffer.slice(0, -1); term.write('\b \b'); }
      } else if (ch === '\x03') { // Ctrl+C：停止运行
        termApi.stop();
        term.write('\x1b[0m^C\r\n');
        inputBuffer = '';
      } else if (ch === '\x04') { // Ctrl+D：EOF
        termApi.input('\x04');
        term.write('\x1b[0m');
      } else {
        if (inputBuffer.length === 0) term.write('\x1b[36m'); // 青色回显输入
        inputBuffer += ch;
        term.write(ch);
      }
    }
  });

  // 主进程 → 终端输出（程序 stdout / stderr）
  termApi.onData((d) => term.write(d.data));

  // 开始运行：清屏，只显示本次运行的输入输出
  termApi.onStart((d) => {
    term.reset();
    term.write('\r\n\x1b[2m▶ 运行 java ' + d.cmd + '\x1b[0m\r\n');
    term.focus();
  });

  // 进程结束
  termApi.onExit((d) => {
    term.write(`\r\n\x1b[2m━━━ 程序运行结束（退出码 ${d.code}，耗时 ${d.sec} 秒）━━━\x1b[0m\r\n`);
  });

  // 工具栏
  document.getElementById('btn-clear').addEventListener('click', () => termApi.clear());
  document.getElementById('btn-stop').addEventListener('click', async () => {
    await termApi.stop();
    term.write('\r\n\x1b[33m[已发送停止信号]\x1b[0m\r\n');
  });

  term.writeln('\x1b[2m☕ Java 运行终端 —— 这里只显示程序的输入与输出\x1b[0m');
  term.focus();
})();
