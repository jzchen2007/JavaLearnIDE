'use strict';
// ============ 轻量编程 IDE - 主进程 ============
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const APP_ROOT = __dirname;
const DATA_DIR = () => path.join(app.getPath('userData'), 'data');

// ---------- 关键字词典（离线内置：Java + Python） ----------
let KEYWORDS = [];
function loadKeywords() {
  const out = [];
  try {
    const java = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data', 'keywords.json'), 'utf8'));
    out.push(...java.map((k) => ({ ...k, lang: 'java' })));
  } catch (e) { console.error('[main] 加载 keywords.json 失败:', e.message); }
  try {
    const py = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data', 'python-keywords.json'), 'utf8'));
    out.push(...py.map((k) => ({ ...k, lang: 'python' })));
  } catch (e) { console.error('[main] 加载 python-keywords.json 失败:', e.message); }
  return out;
}
KEYWORDS = loadKeywords();

// ---------- 状态 ----------
let mainWin = null;
let termWin = null;
let petWin = null;
const PET_W = 192, PET_H = 208, PET_PANEL_H = 170; // 桌宠窗口尺寸（=GIF 原生分辨率，保持清晰）与面板展开高度
let petPanelOpen = false; // 气泡/菜单展开时窗口向上增高
let petDrag = null;       // 拖动状态 { winX, winY, startX, startY, last }
let quitting = false;
let projectRoot = null;
let currentFile = null;
let runProc = null;
let runStartTime = 0;
let javaHome = null; // 用户自定义 JDK 路径（可选）
let pythonHome = null; // 用户自定义 Python 解释器路径（可选）
let detectedPython = { ok: false, version: null, cmd: 'python', args: [] }; // 自动探测结果
let settings = {
  theme: 'vs-dark',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
  windowBounds: { width: 1280, height: 800 },
  recentFiles: [],
  showDictByDefault: true,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: 'Qwen/Qwen2.5-7B-Instruct',
  leetcodeBaseUrl: 'https://leetcode.cn'
};
let stats = null;
let settingsTimer = null, statsTimer = null;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- 持久化 ----------
function dataDir() {
  const dir = DATA_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function loadJson(name, fallback) {
  try {
    const f = path.join(dataDir(), name);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback;
  } catch { return fallback; }
}
function saveJson(name, obj) {
  try { fs.writeFileSync(path.join(dataDir(), name), JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { console.error('[main] 保存', name, '失败:', e.message); }
}
function loadSettings() {
  const s = loadJson('settings.json', null);
  if (s) settings = { ...settings, ...s };
  javaHome = settings.jdkHome || null;
  pythonHome = settings.pythonHome || null;
}
function loadStats() {
  stats = loadJson('stats.json', { date: todayStr(), todayLines: 0, totalLines: 0, compiles: 0, runs: 0, history: {} });
  if (stats.date !== todayStr()) { // 跨天滚动
    stats.history[stats.date] = { lines: stats.todayLines, compiles: stats.compiles, runs: stats.runs };
    stats.date = todayStr();
    stats.todayLines = 0; stats.compiles = 0; stats.runs = 0;
    saveJson('stats.json', stats);
  }
}
function persistStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => saveJson('stats.json', stats), 800);
}

// ---------- JDK 探测 ----------
function binDir() {
  if (javaHome && fs.existsSync(path.join(javaHome, 'bin', 'javac' + (process.platform === 'win32' ? '.exe' : '')))) {
    return path.join(javaHome, 'bin');
  }
  return null;
}
function detectJdk() {
  return new Promise((resolve) => {
    const bin = binDir();
    const cmd = bin ? path.join(bin, 'javac' + (process.platform === 'win32' ? '.exe' : '')) : 'javac';
    execFile(cmd, ['-version'], { timeout: 8000 }, (err, stdout, stderr) => {
      if (!err) {
        const ver = (stdout || '') + (stderr || '');
        const m = /javac\s+([\d.]+)/.exec(ver);
        return resolve({ ok: true, version: m ? m[1] : '未知', cmd });
      }
      resolve({ ok: false, version: null, cmd });
    });
  });
}

// ---------- Python 探测 ----------
function langFor(file) {
  return /\.py$/i.test(file || '') ? 'python' : 'java';
}
function pythonExe() {
  if (pythonHome) {
    try { if (fs.statSync(pythonHome).isFile()) return pythonHome; } catch {}
    for (const name of ['python.exe', 'python3.exe', 'python', 'python3']) {
      const p = path.join(pythonHome, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
function resolvePython() {
  const exe = pythonExe();
  if (exe) return { cmd: exe, args: [] };
  return { cmd: detectedPython.cmd || 'python', args: detectedPython.args || [] };
}
function probePython(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, [...args, '--version'], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const ver = ((stdout || '') + (stderr || '')).trim();
      const m = /Python\s+(\d+\.\d+(?:\.\d+)?)/.exec(ver);
      if (!err && m) return resolve({ ok: true, version: m[1], cmd, args });
      resolve({ ok: false, version: null, cmd, args });
    });
  });
}
function scanPythonDirs() {
  const candidates = [];
  const bases = [];
  const la = process.env.LOCALAPPDATA || '';
  if (la) bases.push(path.join(la, 'Programs', 'Python'));
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  bases.push(pf, pf86);
  for (const base of bases) {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!/^[Pp]ython\d*$/.test(e.name)) continue;
      const exe = path.join(base, e.name, 'python.exe');
      if (fs.existsSync(exe)) candidates.push(exe);
    }
  }
  // 按版本号降序（优先最新）
  const verOf = (p) => {
    const m = /[Pp]ython(\d)(\d+)/.exec(p);
    return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : 0;
  };
  candidates.sort((a, b) => verOf(b) - verOf(a));
  return candidates[0] || null;
}
async function detectPython() {
  // 1) 用户自定义路径优先
  const exe = pythonExe();
  if (exe) {
    const r = await probePython(exe, []);
    if (r.ok) return r;
  }
  // 2) 常见命令：python / python3 / py -3
  for (const c of [{ cmd: 'python', args: [] }, { cmd: 'python3', args: [] }, { cmd: 'py', args: ['-3'] }]) {
    const r = await probePython(c.cmd, c.args);
    if (r.ok) return r;
  }
  // 3) 扫描常见安装目录
  const found = scanPythonDirs();
  if (found) {
    const r = await probePython(found, []);
    if (r.ok) return r;
  }
  return { ok: false, version: null, cmd: 'python', args: [] };
}

// ---------- 编译 ----------
function collectJavaFiles(root) {
  const out = [];
  const skip = new Set(['.git', 'node_modules', 'out', 'build', 'target', '.idea', '.vscode', 'dist']);
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.java')) out.push(full);
    }
  })(root);
  return out.sort();
}
function collectPythonFiles(root) {
  const out = [];
  const skip = new Set(['.git', 'node_modules', 'out', 'build', 'target', '.idea', '.vscode', 'dist', '__pycache__', 'venv', '.venv', 'env']);
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.py')) out.push(full);
    }
  })(root);
  return out.sort();
}
function buildOutputDir(root) {
  const hash = crypto.createHash('md5').update(root).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), 'lite-code-ide', hash);
}

// javac 错误 → 中文解释
const ERROR_TRANSLATIONS = [
  { re: /cannot find symbol/, zh: '找不到符号', tip: '变量/方法/类名拼写错误、未声明，或使用了作用域外的名称。' },
  { re: /incompatible types: possible lossy conversion/, zh: '类型转换可能丢失精度', tip: '大范围类型转小范围类型（如 double→int）需要强制类型转换 (int)x。' },
  { re: /incompatible types/, zh: '类型不兼容', tip: '把一种类型的值赋给另一种类型，或传入的参数类型与方法要求不符。' },
  { re: /unreported exception .* must be caught or declared/, zh: '未处理的异常', tip: '方法可能抛出异常，需用 try-catch 捕获，或在方法声明处加 throws。' },
  { re: /reached end of file while parsing/, zh: '缺少右花括号 }', tip: '某个代码块（类/方法/循环）没有正确闭合，检查花括号配对。' },
  { re: /class, interface, enum, or record expected/, zh: '缺少类/接口/枚举声明', tip: '常见于花括号不匹配，或代码写在了类外面。' },
  { re: /unclosed string literal/, zh: '字符串缺少结束引号', tip: '字符串必须用一对双引号 "..." 闭合，检查是否漏写末尾引号。' },
  { re: /illegal character/, zh: '非法字符', tip: '可能输入了中文标点/全角符号，如中文分号；请切换英文输入法。' },
  { re: /';' expected/, zh: '缺少分号 ;', tip: '语句末尾通常需要英文分号。' },
  { re: /'\)' expected/, zh: '缺少右括号 )', tip: '方法调用或表达式缺少闭合括号。' },
  { re: /'\}' expected/, zh: '缺少右花括号 }', tip: '代码块没有闭合。' },
  { re: /'\)' expected/, zh: '缺少右括号', tip: '方法调用或表达式缺少闭合括号。' },
  { re: /already defined/, zh: '重复定义', tip: '同一作用域内变量/方法重复声明了。' },
  { re: /variable .* might not have been initialized/, zh: '变量可能未初始化', tip: '局部变量必须先赋值再使用。' },
  { re: /duplicate class/, zh: '重复的类名', tip: '同一个包内类名不能重复。' },
  { re: /is public, should be declared in a file named/, zh: 'public 类与文件名不一致', tip: 'public 类的类名必须与 .java 文件名完全相同。' },
  { re: /missing return statement/, zh: '缺少 return 语句', tip: '有返回值的方法，所有分支路径都必须返回对应类型的值。' },
  { re: /non-static method .* cannot be referenced from a static context/, zh: '静态上下文不能引用非静态方法', tip: '先 new 出对象再调用，或把该方法改为 static。' },
  { re: /non-static variable .* cannot be referenced from a static context/, zh: '静态上下文不能引用非静态变量', tip: '成员变量需要通过对象访问，或声明为 static。' },
  { re: /constructor .* cannot be applied/, zh: '构造方法参数不匹配', tip: 'new 时传入的参数与构造方法定义不一致（个数或类型）。' },
  { re: /method .* cannot be applied/, zh: '方法参数不匹配', tip: '调用方法时参数个数或类型与定义不符。' },
  { re: /orphaned case/, zh: 'case 位置错误', tip: 'case 必须写在 switch 语句内部。' },
  { re: /exception .* is never thrown/, zh: '声明了不会抛出的异常', tip: 'throws 后面写了该方法不会抛出的异常，删掉即可。' },
  { re: /modifier .* not allowed here/, zh: '此处不允许该修饰符', tip: '检查修饰符（public/static/final 等）是否放在了正确位置。' },
  { re: /generic array creation/, zh: '不能直接创建泛型数组', tip: '如 new T[] 不允许，可用 ArrayList 替代。' },
  { re: /cannot find symbol:.*method main/, zh: '找不到 main 方法', tip: '程序入口应为：public static void main(String[] args)。' },
  { re: /cannot find symbol:.*class/, zh: '找不到类', tip: '类名拼写错误、缺少 import 导入，或文件未保存。' },
  { re: /cannot find symbol:.*variable/, zh: '找不到变量', tip: '变量未声明、拼写错误，或超出了声明的作用域。' },
  { re: /expected/, zh: '语法错误：缺少符号', tip: '该位置缺少某个符号（分号/括号/花括号等），查看错误行附近。' }
];
function translateError(msg) {
  for (const t of ERROR_TRANSLATIONS) {
    if (t.re.test(msg)) return { zh: t.zh, tip: t.tip };
  }
  return { zh: '编译错误', tip: '请查看错误行附近的代码是否符合语法。' };
}

function parseJavacErrors(stderr) {
  const errors = [];
  const re = /^(.+?\.java):(\d+)(?::(\d+))?:\s*error:\s*(.*)$/gm;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    const file = path.resolve(m[1]);
    const line = parseInt(m[2], 10);
    const col = m[3] ? parseInt(m[3], 10) : 1;
    const msg = m[4].trim();
    const t = translateError(msg);
    errors.push({ file, line, col, msg, zh: t.zh, tip: t.tip });
  }
  return errors;
}

// Python 错误 → 中文解释
const PY_ERROR_TRANSLATIONS = [
  { re: /SyntaxError/, zh: '语法错误', tip: '代码不符合 Python 语法，检查冒号、括号、引号是否完整。' },
  { re: /IndentationError|TabError/, zh: '缩进错误', tip: 'Python 靠缩进划分代码块，检查缩进是否统一（建议 4 空格，勿混用 Tab）。' },
  { re: /NameError/, zh: '名字未定义', tip: '变量/函数名未定义、拼写错误，或在使用前未赋值。' },
  { re: /TypeError/, zh: '类型错误', tip: '操作类型不匹配，如数字与字符串相加；注意 input() 返回字符串。' },
  { re: /ValueError/, zh: '值错误', tip: '类型正确但值非法，如 int("abc")。' },
  { re: /ZeroDivisionError/, zh: '除零错误', tip: '除数不能为 0。' },
  { re: /IndexError/, zh: '下标越界', tip: '列表/字符串下标超出范围，注意下标从 0 开始。' },
  { re: /KeyError/, zh: '键不存在', tip: '字典中没有该键，可用 d.get(key, 默认值) 避免。' },
  { re: /AttributeError/, zh: '属性不存在', tip: '对象没有该属性/方法，检查拼写或类型。' },
  { re: /ImportError|ModuleNotFoundError/, zh: '导入失败', tip: '模块名拼写错误或未安装该模块（pip install）。' },
  { re: /FileNotFoundError/, zh: '文件不存在', tip: '指定的文件路径不存在，检查路径是否正确。' },
  { re: /EOFError/, zh: '输入结束', tip: 'input() 没有更多输入可读，检查是否提前结束输入。' },
  { re: /UnicodeDecodeError|UnicodeEncodeError/, zh: '编码错误', tip: '文件编码不匹配，打开文件时指定 encoding="utf-8"。' },
  { re: /RecursionError/, zh: '递归过深', tip: '递归缺少终止条件或层级太深。' },
  { re: /MemoryError/, zh: '内存不足', tip: '程序占用内存过大，检查是否有无限增长的列表/循环。' }
];
function translatePythonError(msg) {
  for (const t of PY_ERROR_TRANSLATIONS) {
    if (t.re.test(msg)) return { zh: t.zh, tip: t.tip };
  }
  return { zh: '运行错误', tip: '请查看错误信息定位问题。' };
}
// 解析 Python traceback：提取出错位置与异常信息（兼容 py_compile 语法错误与运行时错误）
function parsePythonErrors(stderr) {
  const lines = (stderr || '').split(/\r?\n/);
  const locs = [];
  for (const ln of lines) {
    const m = /^\s*File "(.+?)", line (\d+)/.exec(ln);
    if (m) locs.push({ file: m[1], line: parseInt(m[2], 10) });
  }
  let msg = '';
  for (const ln of lines) {
    const t = ln.trim();
    if (/^SyntaxError:\s*(.*)$/.test(t)) { msg = t; }
    else if (/^([A-Za-z_][\w.]*(?:Error|Exception|Warning|Interrupt|Exit|Error)):\s*(.*)$/.test(t)) { msg = t; }
    else if (/^KeyboardInterrupt$/.test(t)) { msg = t; }
  }
  if (!locs.length) return [];
  const loc = locs[locs.length - 1]; // 取 traceback 最深处（通常是用户代码）
  const t = translatePythonError(msg);
  return [{ file: loc.file, line: loc.line, col: 1, msg: msg || '运行出错', zh: t.zh, tip: t.tip }];
}

function runJavac(files, outDir) {
  return new Promise((resolve) => {
    const bin = binDir();
    const cmd = bin ? path.join(bin, 'javac' + (process.platform === 'win32' ? '.exe' : '')) : 'javac';
    const args = ['-encoding', 'UTF-8', '-J-Duser.language=en', '-J-Duser.country=US', '-d', outDir, ...files];
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => resolve({ ok: false, errors: [{ file: null, line: 1, col: 1, msg: '无法启动 javac：' + err.message, zh: 'JDK 未找到', tip: '请确认已安装 JDK 且 javac 可用，或在设置中指定 JDK 路径。' }], stdout, stderr }));
    child.on('close', (code) => {
      const errors = parseJavacErrors(stderr);
      resolve({ ok: code === 0 && errors.length === 0, errors, stdout, stderr });
    });
  });
}

async function compileFor(file, opts = {}) {
  const root = opts.root || projectRoot || path.dirname(file);
  const files = collectJavaFiles(root);
  if (files.length === 0) return { ok: false, errors: [{ file, line: 1, col: 1, msg: '项目中没有 .java 文件', zh: '没有可编译的文件', tip: '请先创建 Java 源文件。' }], stdout: '', stderr: '' };
  const outDir = buildOutputDir(root);
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(outDir, { recursive: true });
  return await runJavac(files, outDir);
}

// Python 语法检查（py_compile；-B 不写 .pyc 字节码）
function runPyCompile(file, cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args, '-B', '-m', 'py_compile', file], { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => resolve({ ok: false, errors: [{ file, line: 1, col: 1, msg: '无法启动 Python：' + err.message, zh: 'Python 未找到', tip: '请确认已安装 Python，或在设置中指定 Python 解释器路径。' }], stdout, stderr }));
    child.on('close', (code) => {
      // 清理 py_compile 生成的 __pycache__（保持项目目录干净）
      try { fs.rmSync(path.join(path.dirname(file), '__pycache__'), { recursive: true, force: true }); } catch {}
      const errors = parsePythonErrors(stderr);
      if (code === 0 && errors.length === 0) return resolve({ ok: true, errors: [], stdout, stderr });
      resolve({ ok: false, errors: errors.length ? errors : [{ file, line: 1, col: 1, msg: (stderr.trim() || '语法检查失败'), zh: '编译错误', tip: '请查看错误信息。' }], stdout, stderr });
    });
  });
}

// 按文件类型分发编译：.py → 语法检查；否则 → javac 项目编译
async function compileFile(file) {
  if (langFor(file) === 'python') {
    const py = resolvePython();
    return await runPyCompile(file, py.cmd, py.args);
  }
  return await compileFor(file);
}

function findMainClass(files) {
  let fallback = null;
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (/public\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s*\w*\s*\)/.test(src)) {
      const cls = /(?:public\s+)?(?:final\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(src);
      const pkg = /package\s+([\w.]+)\s*;/.exec(src);
      const name = cls ? cls[1] : path.basename(f, '.java');
      if (!fallback) fallback = { file: f, fqcn: (pkg ? pkg[1] + '.' : '') + name };
      if (path.resolve(f) === path.resolve(currentFile || '')) return { file: f, fqcn: (pkg ? pkg[1] + '.' : '') + name };
    }
  }
  return fallback;
}

function spawnRun(cmd, args, cwd, env) {
  runProc = spawn(cmd, args, { cwd, windowsHide: true, env: env || process.env });
  runStartTime = Date.now();
  if (process.env.VERIFY) {
    runProc.stdout.on('data', (d) => {
      console.log('[verify-run]', d.toString('utf8').trim());
      if (process.env.VERIFY_OUT) fs.appendFileSync(process.env.VERIFY_OUT, d.toString('utf8'));
    });
    // 2 秒后向 stdin 注入输入，验证交互式输入
    setTimeout(() => {
      try { if (runProc && runProc.stdin.writable) runProc.stdin.write('李雷\n'); } catch {}
    }, 2000);
  }
  runProc.stdout.on('data', (d) => sendToTerm('term:data', { data: d.toString('utf8') }));
  runProc.stderr.on('data', (d) => sendToTerm('term:data', { data: '\x1b[31m' + d.toString('utf8') + '\x1b[0m' }));
  runProc.on('error', (err) => {
    sendToTerm('term:data', { data: '\r\n\x1b[31m[运行失败] 无法启动进程：' + err.message + '\x1b[0m\r\n' });
    runProc = null;
  });
  runProc.on('close', (code) => {
    const ms = Date.now() - runStartTime;
    const sec = (ms / 1000).toFixed(2);
    sendToTerm('term:exit', { code, ms, sec });
    sendToTerm('term:data', { data: `\r\n\x1b[2m[进程结束] 退出码 ${code}，耗时 ${sec} 秒\x1b[0m\r\n` });
    runProc = null;
  });
}

async function handleRunPython(file) {
  const py = resolvePython();
  const chk = await runPyCompile(file, py.cmd, py.args);
  stats.compiles++; persistStats();
  if (!chk.ok) {
    revealErrors(chk.errors);
    return { ok: false, errors: chk.errors };
  }
  ensureTermWin();
  stats.runs++; persistStats();
  sendToTerm('term:start', { cmd: path.basename(file), file, lang: 'python' });
  spawnRun(py.cmd, [...py.args, file], path.dirname(file), { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' });
  return { ok: true };
}

async function handleRun(file) {
  if (langFor(file) === 'python') return await handleRunPython(file);
  const root = projectRoot || path.dirname(file);
  const res = await compileFor(file, { root });
  stats.compiles++; persistStats();
  if (!res.ok) {
    // 编译失败：错误进入主窗口问题面板，终端保持干净（只显示输入输出）
    revealErrors(res.errors);
    return { ok: false, errors: res.errors };
  }
  const files = collectJavaFiles(root);
  const main = findMainClass(files);
  if (!main) {
    const err = [{
      file: currentFile || file, line: 1, col: 1,
      msg: 'class ' + path.basename(file, '.java') + ' has no main method',
      zh: '未找到 main 方法',
      tip: '程序入口应为：public static void main(String[] args)'
    }];
    revealErrors(err);
    return { ok: false, errors: err };
  }
  // 编译成功后才显示终端窗口（编译失败不弹终端）
  ensureTermWin();
  const bin = binDir();
  const javaCmd = bin ? path.join(bin, 'java' + (process.platform === 'win32' ? '.exe' : '')) : 'java';
  const outDir = buildOutputDir(root);
  stats.runs++; persistStats();
  sendToTerm('term:start', { cmd: main.fqcn, file: main.file, lang: 'java' });
  spawnRun(javaCmd, ['-cp', outDir, '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', main.fqcn], root);
  return { ok: true };
}

function revealErrors(errors) {
  if (!mainWin) return;
  const first = errors.find((e) => e.file);
  if (first) {
    mainWin.webContents.send('editor:revealLine', { file: first.file, line: first.line });
  }
  mainWin.webContents.send('compile:result', { errors });
}

// ---------- 桌宠（菲比） ----------
function resizePetPanel() {
  if (!petWin || petWin.isDestroyed()) return;
  const b = petWin.getBounds();
  const targetH = petPanelOpen ? PET_H + PET_PANEL_H : PET_H;
  // 容差防抖：Windows DPI 取整可能让实际尺寸与目标差 ±2px
  if (Math.abs(b.height - targetH) < 3 && Math.abs(b.width - PET_W) < 3) return;
  petWin.setBounds({ x: b.x, y: b.y - (targetH - b.height), width: PET_W, height: targetH });
}

// 应用桌宠拖动位移（主进程统一 DIP 坐标运算 + 工作区钳制）
// 关键：用 setBounds 同时钉死尺寸，防止 Windows DPI 取整导致窗口尺寸漂移（漂移会产生巨大隐形窗口挡住其他应用）
function applyPetDrag(dx, dy) {
  if (!petDrag || !petWin || petWin.isDestroyed()) return;
  const b = petWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const cx = Math.round(Math.min(Math.max(petDrag.winX + dx, wa.x), wa.x + wa.width - b.width));
  const cy = Math.round(Math.min(Math.max(petDrag.winY + dy, wa.y), wa.y + wa.height - b.height));
  const targetH = petPanelOpen ? PET_H + PET_PANEL_H : PET_H;
  petWin.setBounds({ x: cx, y: cy, width: PET_W, height: targetH });
}

function togglePet() {
  if (petWin && !petWin.isDestroyed()) {
    if (petWin.isVisible()) { petWin.hide(); }
    else {
      petPanelOpen = false;
      petWin.show(); petWin.focus();
      resizePetPanel();
      petWin.webContents.send('pet:resync');
    }
    return;
  }
  petWin = new BrowserWindow({
    width: PET_W, height: PET_H,
    frame: false, transparent: true,
    resizable: false, skipTaskbar: true, hasShadow: false,
    parent: mainWin, // 作为主窗口的子窗口：与主界面同一图层，不置顶（切到别的应用时一起被盖住）
    webPreferences: { preload: path.join(APP_ROOT, 'preload-pet.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  petWin.loadURL('app://ide/pet.html');
  petWin.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    console.log(`[pet:${level}]`, message, `(${sourceId}:${lineNumber})`);
  });
  petWin.on('close', (e) => { if (!quitting) { e.preventDefault(); petWin.hide(); } }); // 点关闭=隐藏
  petWin.on('closed', () => { petWin = null; petDrag = null; });
}

// 获取编辑器当前内容（实时，而非磁盘旧版本）
async function getCurrentSource() {
  if (!mainWin || mainWin.isDestroyed()) return '';
  try {
    return await mainWin.webContents.executeJavaScript('window.EditorMod && window.EditorMod.getValue ? EditorMod.getValue() : ""');
  } catch { return ''; }
}

// AI 检查代码（OpenAI 兼容接口：在线服务或本地 Ollama；未配置时离线 javac/python 兜底）
async function aiCheckCode(code, fileName) {
  const base = (settings.aiBaseUrl || '').trim();
  const key = (settings.aiApiKey || '').trim();
  const model = (settings.aiModel || 'Qwen/Qwen2.5-7B-Instruct').trim();
  const lang = langFor(fileName || currentFile);
  const langName = lang === 'python' ? 'Python' : 'Java';
  const name = fileName ? fileName.split(/[\\/]/).pop() : (lang === 'python' ? 'main.py' : 'Main.java');
  const prompt = `你是"菲比"，一位友善的 ${langName} 编程助教。请检查这个 ${langName} 文件（${name}）的代码，指出：1. 语法/逻辑错误 2. 常见易错点 3. 改进建议。用中文分点回答，简洁明了，最多 6 条，不要贴整段代码。\n\n\`\`\`${lang}\n${code.slice(0, 6000)}\n\`\`\``;
  if (base && key) {
    try {
      const resp = await net.fetch(base.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 600 }),
        signal: AbortSignal.timeout(45000)
      });
      if (!resp.ok) return { ok: false, text: 'AI 接口请求失败（HTTP ' + resp.status + '），请检查设置里的接口地址与密钥。' };
      const data = await resp.json();
      const text = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
      return text ? { ok: true, text } : { ok: false, text: 'AI 返回为空，请稍后重试。' };
    } catch (e) {
      return { ok: false, text: 'AI 调用出错：' + e.message };
    }
  }
  // 离线兜底：语法检查 + 基础统计
  let offline = '';
  if (code.trim()) offline += `已检查 ${name}（${code.split('\n').length} 行）。`;
  else offline += '编辑器里还没有代码哦，先写点 ' + langName + ' 吧～';
  if (currentFile) {
    const res = await compileFile(currentFile);
    if (res.ok) offline += ' 语法检查通过 ✓。';
    else offline += ' 发现 ' + res.errors.length + ' 个错误：' + res.errors.slice(0, 3).map((e) => `${e.line}行 ${e.zh}`).join('；') + '。';
  }
  offline += '（当前为离线检查，在 设置→AI 检查 填写接口后可启用智能检查）';
  return { ok: true, text: offline };
}

async function handlePetAction(action) {
  const src = await getCurrentSource();
  switch (action) {
    case 'check': return await aiCheckCode(src, currentFile);
    case 'compile': {
      if (!currentFile) return { ok: false, text: '还没有打开文件哦～先打开一个文件吧' };
      stats.compiles++; persistStats();
      const res = await compileFile(currentFile);
      if (res.ok) return { ok: true, text: '编译成功 ✓' };
      return { ok: false, text: '编译失败：' + res.errors.length + ' 个错误。' + res.errors.slice(0, 3).map((e) => `${e.line}行 ${e.zh}`).join('；') + '（详情见问题面板）' };
    }
    case 'run': {
      if (!currentFile) return { ok: false, text: '还没有打开文件哦～先打开一个文件吧' };
      const res = await handleRun(currentFile);
      return res.ok ? { ok: true, text: '已开始运行，请看终端窗口～' } : { ok: false, text: '编译失败，请查看问题面板～' };
    }
    case 'judge': {
      if (!currentLeetCode) return { ok: false, text: '还没有打开 LeetCode 题目哦～先在「刷题」里选一题吧' };
      const res = await runLeetCodeTests(currentLeetCode.dir, currentLeetCode.lang);
      return res.ok ? { ok: true, text: '判题完成，请看终端窗口～' } : { ok: false, text: '判题失败，请查看问题面板～' };
    }
    default: return { ok: false, text: '未知指令' };
  }
}

// ---------- LeetCode 集成（拉题 + 本地判题） ----------
function leetcodeBaseUrl() {
  return (settings.leetcodeBaseUrl || 'https://leetcode.com').replace(/\/+$/, '');
}
async function leetcodeGet(url) {
  const resp = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (LiteCodeIDE)' }, signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}
let leetcodeProblemsCache = null;
async function leetcodeProblemList() {
  if (leetcodeProblemsCache) return leetcodeProblemsCache;
  const data = await leetcodeGet(leetcodeBaseUrl() + '/api/problems/all/');
  const lvl = { 1: '简单', 2: '中等', 3: '困难' };
  leetcodeProblemsCache = (data.stat_status_pairs || []).map((p) => ({
    id: p.stat.frontend_question_id,
    slug: p.stat.question__title_slug,
    title: p.stat.question__title,
    difficulty: lvl[(p.difficulty || {}).level] || ''
  }));
  return leetcodeProblemsCache;
}
async function resolveSlug(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const m = /problems\/([a-z0-9-]+)/i.exec(q);
  if (m) return m[1];
  if (/^\d+$/.test(q)) {
    try {
      const list = await leetcodeProblemList();
      const found = list.find((p) => String(p.id) === q);
      return found ? found.slug : null;
    } catch { return null; }
  }
  if (/^[a-z0-9-]+$/i.test(q)) return q;
  return null;
}
async function leetcodeQuestion(slug) {
  const gql = 'query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId title titleSlug difficulty translatedTitle translatedContent content metaData codeSnippets { lang langSlug code } exampleTestcaseList } }';
  const resp = await net.fetch(leetcodeBaseUrl() + '/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (LiteCodeIDE)' },
    body: JSON.stringify({ query: gql, variables: { titleSlug: slug } }),
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  return (data.data && data.data.question) || null;
}

function splitParams(input, count) {
  const parts = (input || '').split('\n');
  while (parts.length < count) parts.push('');
  return parts;
}
function parseParamValue(raw, type) {
  const s = (raw == null ? '' : String(raw)).trim();
  if ((type || '').endsWith('[]')) {
    try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/'/g, '"')); } catch { return null; } }
  }
  switch (type) {
    case 'integer': case 'int': case 'long': return parseInt(s, 10) || 0;
    case 'double': case 'float': return parseFloat(s) || 0;
    case 'boolean': case 'bool': return s === 'true';
    case 'character': case 'char': return s.replace(/^"|"$/g, '').charAt(0) || '';
    case 'string': default: return (s.startsWith('"') && s.endsWith('"')) ? s.slice(1, -1) : s;
  }
}
function isComplexType(type) {
  return /listnode|treenode/i.test(type || '');
}
function detectComplex(meta) {
  const types = [...((meta && meta.params) || []).map((p) => p.type), (meta && meta.return && meta.return.type) || ''];
  return types.some(isComplexType);
}
function javaScalar(x, base) {
  if (x === null || x === undefined) return 'null';
  switch (base) {
    case 'integer': case 'int': return String(x);
    case 'long': return String(x) + 'L';
    case 'double': case 'float': return String(x);
    case 'boolean': case 'bool': return x ? 'true' : 'false';
    case 'character': case 'char': return "'" + String(x).replace(/'/g, "\\'") + "'";
    case 'string': default: return '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
}
function javaPrimitive(base) {
  return ({ integer: 'int', int: 'int', long: 'long', double: 'double', float: 'float', boolean: 'boolean', bool: 'boolean', character: 'char', char: 'char', string: 'String' }[base] || 'String');
}
function javaLiteral(v, type) {
  if (v === null || v === undefined) return 'null';
  const base = (type || 'string').replace(/\[\]/g, '');
  const dims = ((type || '').match(/\[\]/g) || []).length;
  if (dims === 0) return javaScalar(v, base);
  const jt = javaPrimitive(base);
  if (dims === 1) return 'new ' + jt + '[]{' + (v || []).map((x) => javaScalar(x, base)).join(', ') + '}';
  if (dims === 2) return 'new ' + jt + '[][]{' + (v || []).map((row) => '{' + (row || []).map((x) => javaScalar(x, base)).join(', ') + '}').join(', ') + '}';
  return 'null';
}
function pyLiteral(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(pyLiteral).join(', ') + ']';
  return JSON.stringify(v);
}
function javaResultPrint(expr, retType) {
  const dims = ((retType || '').match(/\[\]/g) || []).length;
  if (dims >= 2) return 'Arrays.deepToString(' + expr + ')';
  if (dims >= 1) return 'Arrays.toString(' + expr + ')';
  return 'String.valueOf(' + expr + ')';
}
function javaResultCompare(actual, expectedLit, retType) {
  const base = (retType || '').replace(/\[\]/g, '');
  const dims = ((retType || '').match(/\[\]/g) || []).length;
  if (dims >= 2) return 'Arrays.deepEquals(' + actual + ', ' + expectedLit + ')';
  if (dims === 1) return 'Arrays.equals(' + actual + ', ' + expectedLit + ')';
  if (base === 'string') return 'Objects.equals(' + actual + ', ' + expectedLit + ')';
  return actual + ' == ' + expectedLit;
}
function genPythonTest(problem, testcases) {
  const meta = problem.metaData || {};
  const mname = meta.name || 'solve';
  const params = meta.params || [];
  const retType = (meta.return && meta.return.type) || 'string';
  const L = [];
  L.push('import sys, os');
  L.push('sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))');
  L.push('from solution import Solution');
  L.push('');
  L.push('if __name__ == "__main__":');
  L.push('    s = Solution()');
  let judged = 0;
  (testcases || []).forEach((tc, i) => {
    const inputs = splitParams(tc.input, params.length);
    const args = params.map((p, j) => pyLiteral(parseParamValue(inputs[j], p.type))).join(', ');
    const call = 's.' + mname + '(' + args + ')';
    const hasExpected = tc.expected != null && String(tc.expected).trim() !== '';
    L.push('    # 用例' + (i + 1));
    if (hasExpected) {
      judged++;
      const expLit = pyLiteral(parseParamValue(tc.expected, retType));
      const expShow = pyLiteral(String(tc.expected).trim());
      L.push('    _r = ' + call);
      L.push('    if _r != ' + expLit + ':');
      L.push('        print("不通过（用例 ' + (i + 1) + '：期望=" + ' + expShow + ' + " 实际=" + str(_r) + "）")');
      L.push('        sys.exit(1)');
    } else {
      L.push('    ' + call);
    }
  });
  L.push('    print("通过（' + judged + ' 个用例）")');
  L.push('');
  return L.join('\n');
}
function genJavaTest(problem, testcases) {
  const meta = problem.metaData || {};
  const mname = meta.name || 'solve';
  const params = meta.params || [];
  const retType = (meta.return && meta.return.type) || 'string';
  const L = [];
  L.push('import java.util.*;');
  L.push('');
  L.push('public class SolutionTest {');
  L.push('    public static void main(String[] args) {');
  L.push('        Solution s = new Solution();');
  let judged = 0;
  (testcases || []).forEach((tc, i) => {
    const inputs = splitParams(tc.input, params.length);
    const args = params.map((p, j) => javaLiteral(parseParamValue(inputs[j], p.type), p.type)).join(', ');
    const call = 's.' + mname + '(' + args + ')';
    const hasExpected = tc.expected != null && String(tc.expected).trim() !== '';
    L.push('        { // 用例' + (i + 1));
    if (hasExpected) {
      judged++;
      const expVal = parseParamValue(tc.expected, retType);
      const expLit = javaLiteral(expVal, retType);
      const cmp = javaResultCompare('_r', expLit, retType);
      const print = javaResultPrint('_r', retType);
      const printExp = javaResultPrint(expLit, retType);
      L.push('            var _r = ' + call + ';');
      L.push('            if (!(' + cmp + ')) {');
      L.push('                System.out.println("不通过（用例 ' + (i + 1) + '：期望=" + ' + printExp + ' + " 实际=" + ' + print + ' + "）");');
      L.push('                System.exit(1);');
      L.push('            }');
    } else {
      L.push('            ' + call + ';');
    }
    L.push('        }');
  });
  L.push('        System.out.println("通过（' + judged + ' 个用例）");');
  L.push('    }');
  L.push('}');
  L.push('');
  return L.join('\n');
}
function writeLeetCodeTest(dir, problem, testcases) {
  const testFile = problem.lang === 'python' ? 'test.py' : 'SolutionTest.java';
  const content = problem.lang === 'python' ? genPythonTest(problem, testcases) : genJavaTest(problem, testcases);
  fs.writeFileSync(path.join(dir, testFile), content, 'utf8');
}
function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|pre|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function defaultTemplate(lang, slug, meta) {
  const mname = (meta && meta.name) || 'solve';
  if (lang === 'python') return 'class Solution:\n    def ' + mname + '(self):\n        pass\n';
  return 'import java.util.*;\n\nclass Solution {\n    public void ' + mname + '() {\n    }\n}\n';
}
function javaDefaultReturn(type) {
  const base = (type || 'string').replace(/\[\]/g, '');
  if ((type || '').endsWith('[]')) return 'return new ' + javaPrimitive(base) + '[0];';
  switch (base) {
    case 'integer': case 'int': case 'long': case 'double': case 'float': return 'return 0;';
    case 'boolean': case 'bool': return 'return false;';
    case 'character': case 'char': return 'return \'\\0\';';
    case 'string': return 'return "";';
    default: return 'return null;';
  }
}
function pythonDefaultReturn(type) {
  const base = (type || 'string').replace(/\[\]/g, '');
  if ((type || '').endsWith('[]')) return 'return []';
  switch (base) {
    case 'integer': case 'int': case 'long': case 'double': case 'float': return 'return 0';
    case 'boolean': case 'bool': return 'return False';
    case 'character': case 'char': case 'string': return "return ''";
    default: return 'return None';
  }
}
// 提取描述中的期望输出（"输出：" / "Output:" 后的值），供示例用例本地判题
function extractExpectedOutputs(content) {
  const out = [];
  if (!content) return out;
  const re = /(?:输出|Output)\s*[:：]\s*<\/strong>\s*([^<\s]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
}
// 检测模板用到的 typing 名字，按需导入（替代 from typing import *）
function typingNames(template) {
  const names = new Set();
  const re = /\b(List|Optional|Dict|Set|Tuple|Deque|DefaultDict|Counter)\b/g;
  let m;
  while ((m = re.exec(template || '')) !== null) names.add(m[1]);
  return [...names];
}
// LeetCode 模板方法体常为空（Python 空体会语法错误、Java 空体会编译错误），此处补默认返回 + 按需导入 typing
function fillTemplate(template, lang, meta) {
  if (lang === 'python') {
    if (!/^\s{8,}\S/m.test(template)) {
      template = template.replace(/\s*$/, '') + '\n        ' + pythonDefaultReturn((meta && meta.return && meta.return.type) || '') + '\n';
    }
    const names = typingNames(template);
    if (names.length && !/from typing/.test(template)) {
      template = 'from typing import ' + names.join(', ') + '\n\n' + template;
    }
    return template;
  }
  if (!/return\b/.test(template)) {
    const dr = javaDefaultReturn((meta && meta.return && meta.return.type) || '');
    template = template.replace(/\{\s*\}/, '{\n        ' + dr + '\n    }');
  }
  return template;
}

let currentLeetCode = null; // { dir, lang, problem }

async function leetcodeImport(queries, lang) {
  lang = lang === 'python' ? 'python' : 'java';
  const problems = [];
  const errors = [];
  for (const raw of queries) {
    const query = (raw || '').trim();
    if (!query) continue;
    const slug = await resolveSlug(query);
    if (!slug) { errors.push(query + '：无法解析'); continue; }
    let q;
    try { q = await leetcodeQuestion(slug); } catch { errors.push(query + '：拉取失败'); continue; }
    if (!q) { errors.push(query + '：未找到'); continue; }
    problems.push({ titleSlug: slug, title: q.translatedTitle || q.title, difficulty: q.difficulty || '', lang });
  }
  return { ok: true, problems, errors };
}

async function leetcodeOpen(slug, lang) {
  lang = lang === 'python' ? 'python' : 'java';
  let q;
  try { q = await leetcodeQuestion(slug); } catch (e) { return { ok: false, error: '拉取题目失败：' + e.message }; }
  if (!q) return { ok: false, error: '未找到题目：' + slug };

  let meta = {};
  try { meta = q.metaData ? JSON.parse(q.metaData) : {}; } catch {}

  const wantSlug = lang === 'python' ? 'python3' : 'java';
  const snippet = (q.codeSnippets || []).find((s) => s.langSlug === wantSlug);
  let template = snippet ? snippet.code : defaultTemplate(lang, slug, meta);
  if (lang !== 'python' && !/import java\.util/i.test(template)) template = 'import java.util.*;\n\n' + template;
  template = fillTemplate(template, lang, meta);

  const expectedList = extractExpectedOutputs(q.translatedContent || q.content);
  const testcases = (q.exampleTestcaseList || []).map((input, i) => ({ input, expected: expectedList[i] || '' }));
  const baseDir = projectRoot || path.join(os.homedir(), 'LiteCodeIDE', 'leetcode');
  const dir = path.join(baseDir, slug);
  fs.mkdirSync(dir, { recursive: true });

  const title = q.translatedTitle || q.title;
  const problem = { title, titleSlug: slug, difficulty: q.difficulty || '', lang, metaData: meta, template };
  fs.writeFileSync(path.join(dir, 'problem.json'), JSON.stringify({ ...problem, testcases }, null, 2), 'utf8');
  const solFile = lang === 'python' ? 'solution.py' : 'Solution.java';
  fs.writeFileSync(path.join(dir, solFile), template, 'utf8');
  writeLeetCodeTest(dir, problem, testcases);
  currentFile = path.join(dir, solFile);
  addRecent(currentFile);
  currentLeetCode = { dir, lang, problem };

  return { ok: true, dir, solFile: path.join(dir, solFile), content: template, title, difficulty: q.difficulty, testcases, description: stripHtml(q.translatedContent || q.content), complexType: detectComplex(meta) };
}

function leetcodeAddTestCase(dir, tc) {
  const pjPath = path.join(dir, 'problem.json');
  let pj;
  try { pj = JSON.parse(fs.readFileSync(pjPath, 'utf8')); } catch { return { ok: false, error: '未找到题目配置 problem.json' }; }
  pj.testcases = pj.testcases || [];
  pj.testcases.push({ input: String(tc.input || ''), expected: String(tc.expected || '') });
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2), 'utf8');
  writeLeetCodeTest(dir, pj, pj.testcases);
  return { ok: true, testcases: pj.testcases };
}

async function runLeetCodeTests(dir, lang) {
  if (lang === 'python') {
    const py = resolvePython();
    const testFile = path.join(dir, 'test.py');
    const chk = await runPyCompile(testFile, py.cmd, py.args);
    if (!chk.ok) { revealErrors(chk.errors); return { ok: false, errors: chk.errors }; }
    ensureTermWin();
    stats.runs++; persistStats();
    sendToTerm('term:start', { cmd: 'test.py (LeetCode)', file: testFile, lang: 'python' });
    spawnRun(py.cmd, [...py.args, testFile], dir, { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' });
    return { ok: true };
  }
  const files = collectJavaFiles(dir);
  if (!files.length) return { ok: false, error: '目录中没有 .java 文件' };
  const outDir = buildOutputDir(dir);
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(outDir, { recursive: true });
  const res = await runJavac(files, outDir);
  stats.compiles++; persistStats();
  if (!res.ok) { revealErrors(res.errors); return { ok: false, errors: res.errors }; }
  const main = findMainClass(files);
  if (!main) { revealErrors([{ file: null, line: 1, col: 1, msg: 'no main', zh: '未找到测试入口', tip: '请检查是否生成了 SolutionTest.java' }]); return { ok: false, errors: [] }; }
  ensureTermWin();
  const bin = binDir();
  const javaCmd = bin ? path.join(bin, 'java' + (process.platform === 'win32' ? '.exe' : '')) : 'java';
  stats.runs++; persistStats();
  sendToTerm('term:start', { cmd: main.fqcn + ' (LeetCode)', file: main.file, lang: 'java' });
  spawnRun(javaCmd, ['-cp', outDir, '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', main.fqcn], dir);
  return { ok: true };
}

// ---------- 终端窗口 ----------
let termReady = false;
let termQueue = [];
function sendToTerm(channel, payload) {
  if (!termWin || termWin.isDestroyed()) return;
  if (termReady) termWin.webContents.send(channel, payload);
  else termQueue.push({ channel, payload }); // 窗口尚未加载完成，先入队
}
function ensureTermWin() {
  if (termWin && !termWin.isDestroyed()) { termWin.show(); termWin.focus(); return termWin; }
  termWin = new BrowserWindow({
    width: 760, height: 460,
    title: '运行终端',
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(APP_ROOT, 'preload-term.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  termWin.loadURL('app://ide/terminal.html');
  termWin.webContents.once('did-finish-load', () => {
    termReady = true;
    for (const m of termQueue) termWin.webContents.send(m.channel, m.payload);
    termQueue = [];
  });
  termWin.on('closed', () => { termWin = null; termReady = false; termQueue = []; });
  return termWin;
}

// ---------- 主窗口 ----------
function createMainWindow() {
  let allowClose = false;
  mainWin = new BrowserWindow({
    width: settings.windowBounds?.width || 1280,
    height: settings.windowBounds?.height || 800,
    minWidth: 940, minHeight: 600,
    title: '轻量编程 IDE',
    backgroundColor: settings.theme === 'vs-dark' ? '#1e1e1e' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(APP_ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWin.loadURL('app://ide/index.html');
  // 关闭前先让渲染进程保存所有未保存的修改
  mainWin.on('close', (e) => {
    if (!mainWin.isDestroyed()) { settings.windowBounds = mainWin.getBounds(); persistSettings(); }
    if (!allowClose) {
      e.preventDefault();
      mainWin.webContents.send('app:beforeClose');
    }
  });
  ipcMain.on('app:readyToClose', () => {
    allowClose = true;
    // 主窗口关闭 = 退出应用：桌宠一并销毁，避免残留
    if (petWin && !petWin.isDestroyed()) petWin.destroy();
    if (mainWin && !mainWin.isDestroyed()) mainWin.close();
  });
  // 调试：设置 SHOT_PATH 时自动截图并退出（用于无头验证界面）
  if (process.env.SHOT_PATH) {
    mainWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await mainWin.webContents.capturePage();
          fs.writeFileSync(process.env.SHOT_PATH, img.toPNG());
          console.log('[shot] saved ->', process.env.SHOT_PATH);
        } catch (e) { console.error('[shot] failed:', e.message); }
        app.exit(0);
      }, 4000);
    });
  }
  // 调试：设置 VERIFY 时自动执行端到端验证并退出
  if (process.env.VERIFY) {
    const demoFile = process.env.VERIFY_FILE;
    if (demoFile) projectRoot = path.dirname(demoFile); // 文件树测试需要项目根
    mainWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const info = await mainWin.webContents.executeJavaScript(`(async () => {
            const out = {};
            out.monacoLoaded = !!window.monaco;
            out.editorRendered = !!document.querySelector('.monaco-editor');
            out.dictItems = document.querySelectorAll('.dict-item').length;
            out.welcomeVisible = !document.getElementById('welcome').classList.contains('hidden');
            out.statusJava = document.getElementById('sb-java').textContent;
            out.settingsModal = !!document.getElementById('modal-settings');
            if (${JSON.stringify(!!demoFile)}) {
              const c = await window.api.compile(${JSON.stringify(demoFile)});
              out.compileOk = c.ok;
              out.compileErrors = (c.errors || []).map(e => e.line + ': ' + e.zh + ' | ' + e.msg.slice(0, 80));
              const r = await window.api.run(${JSON.stringify(demoFile)});
              out.runOk = !!r.ok;
              await new Promise(res => setTimeout(res, 2500));
              // 侧边栏交互测试（默认收起 → 点击展开 → 再点收起 → 再展开）
              const sb = document.getElementById('sidebar');
              out.sidebarCollapsedInit = sb.classList.contains('collapsed');
              document.getElementById('act-dict').click();
              out.sidebarOpenAfterClick = !sb.classList.contains('collapsed');
              out.dictActive = document.getElementById('view-dict').classList.contains('active');
              document.getElementById('act-dict').click();
              out.sidebarCollapsedAfterSecondClick = sb.classList.contains('collapsed');
              document.getElementById('act-dict').click();
              // 词典搜索测试
              const ds = document.getElementById('dict-search');
              ds.value = 'class'; ds.dispatchEvent(new Event('input'));
              out.dictSearchCount = document.querySelectorAll('.dict-item').length;
              out.dictFirst = (document.querySelector('.dict-item .kw') || {}).textContent || '';
              // 文件树点击测试（资源管理器文件打开）
              try {
                const data = await window.api.listProject();
                SidebarMod.renderTree(data);
                await new Promise(r => setTimeout(r, 200));
                const items = document.querySelectorAll('#file-tree .tree-item');
                out.treeItems = items.length;
                if (items.length) {
                  items[0].click();
                  await new Promise(r => setTimeout(r, 600));
                  out.treeTabOpened = document.querySelectorAll('#tabbar .tab').length > 0;
                  out.treeSbFile = document.getElementById('sb-file').textContent;
                  out.treeWelcomeHidden = document.getElementById('welcome').classList.contains('hidden');
                  // 标签页关闭测试：点关闭叉（按钮内是 SVG，target 可能为 svg/path）
                  document.querySelector('#tabbar .tab .tab-close').click();
                  await new Promise(r => setTimeout(r, 300));
                  out.tabClosed = document.querySelectorAll('#tabbar .tab').length === 0;
                  out.tabWelcomeBack = !document.getElementById('welcome').classList.contains('hidden');
                }
              } catch (e) { out.treeError = e.message; }
            }
            return out;
          })()`);
          // 问题面板测试（主进程侧控制 projectRoot，避免渲染进程无法修改主进程变量）
          try {
            const brokenDir = path.join(path.dirname(demoFile), '..', 'demo');
            projectRoot = brokenDir;
            await mainWin.webContents.executeJavaScript(`window.api.compile(${JSON.stringify(path.join(brokenDir, 'Broken.java'))})`);
            await new Promise((r) => setTimeout(r, 500));
            const p1 = await mainWin.webContents.executeJavaScript(`({ v: !document.getElementById('problems-panel').classList.contains('hidden'), n: document.querySelectorAll('#problems-list .problem-item').length, f: (document.querySelector('.problem-item .pi-zh') || {}).textContent || '' })`);
            info.problemsVisibleOnError = p1.v;
            info.problemsCount = p1.n;
            info.problemsFirst = p1.f;
            projectRoot = path.dirname(demoFile);
            await mainWin.webContents.executeJavaScript(`window.api.compile(${JSON.stringify(demoFile)})`);
            await new Promise((r) => setTimeout(r, 500));
            const p2 = await mainWin.webContents.executeJavaScript(`document.getElementById('problems-panel').classList.contains('hidden')`);
            info.problemsHiddenOnSuccess = p2;
          } catch (e) { info.problemsError = e.message; }
          // Python 兼容探测与语法检查（Python3 支持）
          try {
            info.python = detectedPython;
            const pyBroken = path.join(path.dirname(demoFile), 'broken.py');
            if (fs.existsSync(pyBroken)) {
              const pc = await mainWin.webContents.executeJavaScript(`window.api.compile(${JSON.stringify(pyBroken)})`);
              info.pyCompileOk = pc.ok;
              info.pyErrors = (pc.errors || []).map((e) => `${e.line}: ${e.zh} | ${e.msg.slice(0, 60)}`);
            }
            const pd = await mainWin.webContents.executeJavaScript(`(async () => {
              const ds = document.getElementById('dict-search');
              ds.value = 'def'; ds.dispatchEvent(new Event('input'));
              const items = [...document.querySelectorAll('.dict-item')];
              return { count: items.length, first: (items[0] && (items[0].querySelector('.kw')||{}).textContent) || '', hasPyBadge: !!document.querySelector('.lang-badge.py') };
            })()`);
            info.dictPyCount = pd.count;
            info.dictPyFirst = pd.first;
            info.dictPyBadge = pd.hasPyBadge;
          } catch (e) { info.pyError = e.message; }
          // 布局/样式诊断
          try {
            const css = await mainWin.webContents.executeJavaScript(`(() => {
              const out = {};
              out.cssSheets = document.styleSheets.length;
              out.ruleCount = (() => { try { return [...document.styleSheets].reduce((n, s) => { try { return n + s.cssRules.length; } catch { return n; } }, 0); } catch { return -1; } })();
              const g = (id) => { const el = document.getElementById(id); if (!el) return 'NO#' + id; const cs = getComputedStyle(el); return cs.display + '/' + cs.flexDirection + '/' + cs.width; };
              out.app = g('app');
              out.activitybar = g('activitybar');
              out.sidebar = g('sidebar');
              out.editorHost = g('editor-host');
              out.bodyBg = getComputedStyle(document.body).backgroundColor;
              // 几何位置断言（此时侧边栏已展开，词典视图激活）
              const rect = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
              out.geo = { activitybar: rect('activitybar'), sidebar: rect('sidebar'), editorHost: rect('editor-host'), statusbar: rect('statusbar') };
              out.sidebarLeftOfEditor = (out.geo.sidebar && out.geo.editorHost) ? (out.geo.sidebar.x + out.geo.sidebar.w <= out.geo.editorHost.x + 1) : null;
              out.statusbarAtBottom = (out.geo.statusbar && out.geo.editorHost) ? (out.geo.statusbar.y >= out.geo.editorHost.y + out.geo.editorHost.h - 1) : null;
              return out;
            })()`);
            Object.assign(info, css);
          } catch (e) { info.cssError = e.message; }
          console.log('[verify] ' + JSON.stringify(info));
          if (process.env.VERIFY_JSON) {
            try { fs.writeFileSync(process.env.VERIFY_JSON, JSON.stringify(info, null, 2)); } catch (e) { console.error('[verify] 写文件失败:', e.message); }
          }
          // 抓取终端窗口实际显示内容（验证输出是否真的显示在终端）
          try {
            if (termWin && !termWin.isDestroyed()) {
              await new Promise((r) => setTimeout(r, 600));
              info.termDiag = await termWin.webContents.executeJavaScript(`(() => {
                const t = window.__term;
                if (!t) return JSON.stringify({ err: 'NO_TERM', ready: document.readyState });
                const lines = [];
                const len = t.buffer.active.length;
                for (let i = 0; i < len; i++) { const l = t.buffer.active.getLine(i); if (l) lines.push(l.translateToString(true)); }
                return JSON.stringify({ rows: len, lines: lines.slice(-12), cols: t.cols });
              })()`);
              if (process.env.VERIFY_JSON) {
                try { fs.writeFileSync(process.env.VERIFY_JSON, JSON.stringify(info, null, 2)); } catch {}
              }
            }
          } catch (e) { info.termError = e.message; }
          // 桌宠测试：开屏默认显示（启动即创建，无需点按钮）、点击/拖动/面板/同图层
          try {
            await new Promise((r) => setTimeout(r, 2500));
            info.petWinCreated = !!(petWin && !petWin.isDestroyed());
            info.petVisibleOnStart = !!(petWin && !petWin.isDestroyed() && petWin.isVisible()); // 开屏默认可见
            info.petIsChild = !!(petWin && mainWin && !petWin.isDestroyed() && petWin.getParentWindow() === mainWin); // 同图层：主窗口子窗口
            info.petNotTopmost = !!(petWin && !petWin.isDestroyed() && !petWin.isAlwaysOnTop()); // 不置顶
            if (petWin && !petWin.isDestroyed()) {
              info.petUiLoaded = await petWin.webContents.executeJavaScript('!!document.querySelector("#pet img") && !!document.getElementById("pet-img").src');
              // 先放到已知位置，再测拖动位移
              await petWin.webContents.executeJavaScript('window.petApi.moveTo(400, 400)');
              await new Promise((r) => setTimeout(r, 250));
              // 1) 点击菲比 → 弹出菜单（修复“点击没反应”）
              info.petMenuWorks = await petWin.webContents.executeJavaScript(`(async () => {
                const pet = document.getElementById('pet');
                pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, screenX: 300, screenY: 300 }));
                pet.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, screenX: 300, screenY: 300 }));
                await new Promise(r => setTimeout(r, 120));
                return !document.getElementById('menu').classList.contains('hidden');
              })()`);
              // 2) 拖动菲比 → 窗口按位移精确移动（主进程统一 DIP 坐标，修复拖动漂移）
              const posBefore = petWin.getPosition();
              petDrag = { winX: posBefore[0], winY: posBefore[1], startX: 0, startY: 0, last: Date.now() };
              applyPetDrag(80, 60);
              const posAfter = petWin.getPosition();
              info.petDragDelta = [posAfter[0] - posBefore[0], posAfter[1] - posBefore[1]];
              info.petDragPrecise = Math.abs(info.petDragDelta[0] - 80) <= 1 && Math.abs(info.petDragDelta[1] - 60) <= 1;
              petDrag = null;
              // 3) 拖动边界钳制：拖出屏幕 → 自动拉回工作区
              await petWin.webContents.executeJavaScript('window.petApi.moveTo(-500, -500)');
              await new Promise((r) => setTimeout(r, 250));
              const pos = petWin.getPosition();
              const wa = screen.getDisplayMatching(petWin.getBounds()).workArea;
              info.petClampOk = pos[0] >= wa.x && pos[1] >= wa.y;
              // 4) 面板展开/收起：气泡/菜单打开窗口增高，关闭恢复贴地
              await petWin.webContents.executeJavaScript('window.petApi.setPanel(true)');
              await new Promise((r) => setTimeout(r, 250));
              info.petExpandedH = petWin.getBounds().height;
              await petWin.webContents.executeJavaScript('window.petApi.setPanel(false)');
              await new Promise((r) => setTimeout(r, 250));
              info.petCollapsedH = petWin.getBounds().height;
              info.petResizeOk = info.petExpandedH > info.petCollapsedH;
              // 5) 置顶状态：预期 false（与主界面同图层，不置顶）
              info.petAlwaysOnTop = petWin.isAlwaysOnTop();
              // 6) 桌宠窗口截图（视觉确认）
              try {
                const shot = await petWin.webContents.capturePage();
                fs.mkdirSync(path.join(APP_ROOT, '.cowork-temp'), { recursive: true });
                fs.writeFileSync(path.join(APP_ROOT, '.cowork-temp', 'pet-shot.png'), shot.toPNG());
                info.petShot = true;
              } catch (e) { info.petShotError = e.message; }
              const pc = await handlePetAction('check');
              info.petCheckOk = pc.ok;
              info.petCheckText = (pc.text || '').slice(0, 150);
              // 7) GIF 全部可加载（naturalWidth>0）+ 状态机回归：点击编译 → working → sad(无文件) → 4s 回 idle
              const sm = await petWin.webContents.executeJavaScript(`(async () => {
                const out = { gifs: {} };
                for (const [k, g] of Object.entries({ idle:'idle.gif', working:'running.gif', thinking:'waiting.gif', happy:'review.gif', sad:'failed.gif' })) {
                  const img = new Image();
                  await new Promise(res => { img.onload = () => res(); img.onerror = () => res(); img.src = 'pet/' + g; });
                  out.gifs[k] = img.naturalWidth > 0;
                }
                // 模拟点击“编译”菜单项（无打开文件 → 应返回 sad）
                document.querySelector('[data-act="compile"]').click();
                await new Promise(r => setTimeout(r, 800));
                out.stateAfterCompile = document.getElementById('pet').className;
                out.imgAfterCompile = document.getElementById('pet-img').src.split('/').pop();
                // 4 秒后应自动回 idle（不再一直停留在一个表情）
                await new Promise(r => setTimeout(r, 4500));
                out.stateAfter4s = document.getElementById('pet').className;
                out.imgAfter4s = document.getElementById('pet-img').src.split('/').pop();
                return out;
              })()`);
              info.petGifs = sm.gifs;
              info.petGifsOk = Object.values(sm.gifs).every(Boolean);
              info.petStateAfterCompile = sm.stateAfterCompile;
              info.petImgAfterCompile = sm.imgAfterCompile;
              info.petStateAfter4s = sm.stateAfter4s;
              info.petIdleRecover = sm.stateAfter4s === 'idle' && sm.imgAfter4s === 'idle.gif';
            }
            togglePet(); // 隐藏
          } catch (e) { info.petError = e.message; }
          // 最终结果落盘（包含终端与桌宠测试）
          console.log('[verify-final] ' + JSON.stringify(info));
          if (process.env.VERIFY_JSON) {
            try { fs.writeFileSync(process.env.VERIFY_JSON, JSON.stringify(info, null, 2)); } catch (e) { console.error('[verify] 写文件失败:', e.message); }
          }
        } catch (e) { console.error('[verify] failed:', e.message); }
        app.exit(0);
      }, 6000);
    });
  }
  mainWin.on('resize', () => {
    if (!mainWin.isMaximized()) settings.windowBounds = mainWin.getBounds();
    persistSettings();
  });
  mainWin.on('closed', () => {
    mainWin = null;
    // 保险：主窗口没了，桌宠也销毁（防止 window-all-closed 不触发导致残留）
    if (petWin && !petWin.isDestroyed()) petWin.destroy();
  });
  // 渲染进程日志转发（调试用）
  mainWin.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    console.log(`[renderer:${level}]`, message, `(${sourceId}:${lineNumber})`);
  });
}

function persistSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveJson('settings.json', settings), 600);
}

// ---------- 菜单 ----------
function buildMenu() {
  const send = (action) => () => { if (mainWin) mainWin.webContents.send('menu', action); };
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建文件', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: '打开文件夹（项目）…', accelerator: 'CmdOrCtrl+Shift+O', click: send('openFolder') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: '全部保存', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAll') },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '运行',
      submenu: [
        { label: '编译（显示错误）', accelerator: 'F6', click: send('compile') },
        { label: '运行（编译并执行）', accelerator: 'F5', click: send('run') },
        { label: '停止运行', accelerator: 'Shift+F5', click: send('stop') },
        { type: 'separator' },
        { label: '显示/聚焦终端窗口', click: send('showTerminal') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧边栏（文件/词典）', accelerator: 'CmdOrCtrl+B', click: send('toggleSidebar') },
        { label: '显示/隐藏桌宠（菲比）', accelerator: 'CmdOrCtrl+Alt+P', click: send('togglePet') },
        { label: '切换深浅主题', click: send('toggleTheme') },
        { label: '设置…', click: send('settings') }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '快捷键速查', accelerator: 'F1', click: send('shortcuts') },
        { label: '在文件管理器中显示项目目录', click: send('revealInExplorer') },
        { type: 'separator' },
        { label: '关于 轻量编程 IDE', click: send('about') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('app:init', async () => {
    const jdk = await detectJdk();
    detectedPython = await detectPython();
    return { settings, stats, projectRoot, currentFile, jdk, python: detectedPython, keywordsCount: KEYWORDS.length };
  });
  ipcMain.handle('keywords:get', () => KEYWORDS);
  ipcMain.handle('python:detect', async () => {
    detectedPython = await detectPython();
    return detectedPython;
  });
  ipcMain.handle('leetcode:import', async (_e, { queries, lang }) => await leetcodeImport(queries, lang));
  ipcMain.handle('leetcode:open', async (_e, { slug, lang }) => await leetcodeOpen(slug, lang));
  ipcMain.handle('leetcode:addTestCase', (_e, { dir, input, expected }) => leetcodeAddTestCase(dir, { input, expected }));
  ipcMain.handle('leetcode:runTests', async (_e, { dir, lang }) => await runLeetCodeTests(dir, lang));

  ipcMain.handle('file:openDialog', async () => {
    const r = await dialog.showOpenDialog(mainWin, {
      title: '打开文件',
      filters: [{ name: '源代码文件', extensions: ['java', 'py'] }, { name: 'Java 源文件', extensions: ['java'] }, { name: 'Python 源文件', extensions: ['py'] }, { name: '所有文件', extensions: ['*'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    currentFile = p;
    if (!projectRoot) projectRoot = path.dirname(p);
    addRecent(p);
    return { path: p, content: fs.readFileSync(p, 'utf8'), projectRoot, lang: langFor(p) };
  });

  ipcMain.handle('file:pickExe', async () => {
    const r = await dialog.showOpenDialog(mainWin, {
      title: '选择 Python 解释器',
      filters: [{ name: '可执行文件', extensions: ['exe'] }, { name: '所有文件', extensions: ['*'] }],
      properties: ['openFile']
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('file:openFolderDialog', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: '打开项目文件夹', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    projectRoot = r.filePaths[0];
    if (!currentFile || !path.resolve(currentFile).startsWith(path.resolve(projectRoot))) currentFile = null;
    return { projectRoot };
  });

  ipcMain.handle('file:new', async () => {
    const dir = currentFile ? path.dirname(currentFile) : (projectRoot || os.homedir());
    const r = await dialog.showSaveDialog(mainWin, {
      title: '新建文件',
      defaultPath: path.join(dir, 'Main.java'),
      filters: [
        { name: 'Java 源文件', extensions: ['java'] },
        { name: 'Python 源文件', extensions: ['py'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return null;
    const p = r.filePath;
    const lang = langFor(p); // 按后缀识别 java / py
    let content;
    if (lang === 'python') {
      content = `def main():\n    print("Hello, Python!")\n\n\nif __name__ == '__main__':\n    main()\n`;
    } else {
      const cls = path.basename(p, '.java');
      content = `public class ${cls} {\n    public static void main(String[] args) {\n        System.out.println("Hello, Java!");\n    }\n}\n`;
    }
    fs.writeFileSync(p, content, 'utf8');
    currentFile = p;
    if (!projectRoot) projectRoot = path.dirname(p);
    addRecent(p);
    return { path: p, content, projectRoot, lang };
  });

  ipcMain.handle('file:read', (_e, p) => fs.readFileSync(p, 'utf8'));
  ipcMain.handle('file:write', (_e, { path: p, content }) => {
    fs.writeFileSync(p, content, 'utf8');
    return { ok: true };
  });

  ipcMain.handle('project:list', () => {
    if (!projectRoot) return { root: null, files: [] };
    const java = collectJavaFiles(projectRoot).map((f) => ({ path: f, name: path.basename(f), rel: path.relative(projectRoot, f), lang: 'java' }));
    const py = collectPythonFiles(projectRoot).map((f) => ({ path: f, name: path.basename(f), rel: path.relative(projectRoot, f), lang: 'python' }));
    return { root: projectRoot, files: [...java, ...py] };
  });

  ipcMain.handle('compile', async (_e, file) => {
    stats.compiles++; persistStats();
    const res = await compileFile(file || currentFile);
    if (mainWin) mainWin.webContents.send('compile:result', { errors: res.errors });
    return res;
  });

  ipcMain.handle('run', async (_e, file) => {
    return await handleRun(file || currentFile);
  });

  ipcMain.handle('term:stop', () => {
    if (runProc) { try { runProc.kill(); } catch {} }
    return { ok: true };
  });
  ipcMain.on('term:input', (_e, data) => {
    if (runProc && runProc.stdin.writable) runProc.stdin.write(data);
  });
  ipcMain.on('term:clear', () => sendToTerm('term:data', { data: '\x1b[2J\x1b[H' }));
  ipcMain.on('term:show', () => ensureTermWin());
  ipcMain.on('pet:toggle', () => togglePet());
  ipcMain.handle('pet:action', async (_e, action) => handlePetAction(action));
  ipcMain.on('pet:hide', () => { petPanelOpen = false; petDrag = null; if (petWin && !petWin.isDestroyed()) petWin.hide(); });
  ipcMain.on('pet:setPanel', (_e, open) => {
    petPanelOpen = !!open;
    resizePetPanel();
  });
  ipcMain.on('pet:moveTo', (_e, { x, y }) => {
    if (!petWin || petWin.isDestroyed()) return;
    const b = petWin.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const cx = Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - b.width));
    const cy = Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - b.height));
    petWin.setPosition(cx, cy);
  });
  // 拖动：坐标运算统一在主进程（渲染进程 window.screenX 与 e.screenX 在 DPI 缩放下单位不一致，会造成拖动漂移）
  ipcMain.on('pet:dragStart', () => {
    if (!petWin || petWin.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const [wx, wy] = petWin.getPosition();
    petDrag = { winX: wx, winY: wy, startX: pt.x, startY: pt.y, last: Date.now() };
  });
  ipcMain.on('pet:dragMove', () => {
    if (!petWin || petWin.isDestroyed()) return;
    const now = Date.now();
    if (!petDrag || now - petDrag.last > 1500) { // 防卡死：超过 1.5s 未移动则重新锚定
      const pt = screen.getCursorScreenPoint();
      const [wx, wy] = petWin.getPosition();
      petDrag = { winX: wx, winY: wy, startX: pt.x, startY: pt.y, last: now };
      return;
    }
    petDrag.last = now;
    const pt = screen.getCursorScreenPoint();
    applyPetDrag(pt.x - petDrag.startX, pt.y - petDrag.startY);
  });
  ipcMain.on('pet:dragEnd', () => { petDrag = null; });
  ipcMain.on('term:openError', (_e, { file, line }) => {
    if (mainWin) mainWin.webContents.send('editor:revealLine', { file, line });
    if (mainWin) { mainWin.show(); mainWin.focus(); }
  });

  ipcMain.on('stats:add', (_e, lines) => {
    if (typeof lines === 'number' && lines > 0) {
      stats.todayLines += lines;
      stats.totalLines += lines;
      persistStats();
    }
  });
  ipcMain.handle('stats:get', () => stats);

  ipcMain.handle('settings:get', () => settings);
  ipcMain.on('settings:set', (_e, patch) => {
    settings = { ...settings, ...patch };
    if (patch.jdkHome !== undefined) javaHome = patch.jdkHome || null;
    if (patch.pythonHome !== undefined) pythonHome = patch.pythonHome || null;
    persistSettings();
    if (mainWin) mainWin.webContents.send('settings:changed', settings);
  });

  ipcMain.on('window:revealLine', (_e, { file, line }) => {
    if (mainWin) mainWin.webContents.send('editor:revealLine', { file, line });
  });
  ipcMain.on('shell:openPath', (_e, p) => { shell.openPath(p); });
  ipcMain.on('shell:showItem', (_e, p) => { shell.showItemInFolder(p); });
  ipcMain.on('app:setCurrentFile', (_e, p) => { currentFile = p; addRecent(p); });
}

function addRecent(p) {
  settings.recentFiles = [p, ...settings.recentFiles.filter((x) => x !== p)].slice(0, 10);
  persistSettings();
}

// ---------- 自定义协议 app:// ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    // 路径映射：/vendor/* -> vendor/，/data/* -> data/，其余 -> renderer/
    let filePath;
    if (p.startsWith('/vendor/')) filePath = path.join(APP_ROOT, p);
    else if (p.startsWith('/data/')) filePath = path.join(APP_ROOT, p);
    else filePath = path.join(APP_ROOT, 'renderer', p);
    filePath = path.normalize(filePath);
    // 防目录穿越
    const base = path.normalize(APP_ROOT);
    if (!filePath.startsWith(base)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileUrl(filePath));
  });
  loadSettings();
  loadStats();
  createMainWindow();
  buildMenu();
  registerIpc();
  togglePet(); // 开屏默认显示菲比（无需点按钮）
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前清理：终止仍在运行的 java 进程
app.on('before-quit', () => {
  quitting = true;
  try { if (runProc) runProc.kill(); } catch {}
});

function pathToFileUrl(p) {
  return require('url').pathToFileURL(p).toString();
}
