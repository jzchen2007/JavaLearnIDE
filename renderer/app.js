'use strict';
// ============ 应用主逻辑 ============
(function () {
  const api = window.api;
  // 直接在浏览器中打开 index.html 时没有 Electron 提供的 API，给出友好提示
  if (!api) {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Microsoft YaHei,sans-serif;background:#1e1e1e;color:#ccc"><div style="text-align:center;line-height:2"><div style="font-size:48px">${ICON.svg('run', 'lg')}</div><div style="font-size:18px;color:#fff">这是轻量编程 IDE 的界面文件</div><div style="font-size:13px">请运行 LiteCodeIDE.exe（或 npm start）打开应用，<br>不要直接在浏览器中打开本页面。</div></div></div>`;
    return;
  }
  let app = null;            // app:init 数据
  let settings = {};
  let tabs = [];             // { path, name, dirty, content }
  let activeTab = null;      // path
  let stats = { todayLines: 0, totalLines: 0, compiles: 0, runs: 0 };
  let compileTimer = null;
  let statsPendingLines = 0;
  let suppressNextDiff = false;
  let currentModel = null;

  const $ = (id) => document.getElementById(id);
  const langOf = (p) => /\.py$/i.test(p || '') ? 'python' : 'java';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ---------- 初始化 ----------
  async function init() {
    app = await api.init();
    app.python = app.python || { ok: false, version: null };
    settings = app.settings || {};
    stats = app.stats || stats;
    document.body.classList.toggle('light', settings.theme === 'vs');

    const keywords = await api.getKeywords();
    SidebarMod.init({ onOpenFile: openFile }); // 注入文件树点击回调（此前缺失导致资源管理器文件无法打开）
    SidebarMod.setKeywords(keywords);

    EditorMod.loadMonaco().then(() => {
      EditorMod.createEditor($('editor-container'), {
        settings,
        api,
        onSave: () => saveActive(),
        onRun: () => runActive(),
        onCompile: () => compileActive(true),
        onShortcuts: () => openModal('modal-shortcuts'),
        onNextTab: () => switchTabBy(1),
        onCloseTab: () => closeTab(activeTab),
        onCursor: (line, col) => { $('sb-lncol').textContent = `行 ${line}，列 ${col}`; }
      }).then(() => {
        EditorMod.applySettings(settings);
        // 编辑器内容变化 → 统计行数 + 静默编译
        EditorMod.getEditor().onDidChangeModelContent((e) => {
          const linesAdded = countAddedLines(e);
          if (linesAdded > 0 && !suppressNextDiff) {
            statsPendingLines += linesAdded;
            flushStats();
          }
          suppressNextDiff = false;
          scheduleSilentCompile();
        });
        if (tabs.length) activateTab(activeTab);
        else showWelcome();
        updateRuntimeStatus();
        updateStatsBar();
      });
    }).catch((err) => {
      toast('Monaco 加载失败：' + err.message, 'err');
    });

    wireEvents();
    api.onMenu(handleMenu);
    // 关闭窗口前自动保存所有未保存的修改
    api.onBeforeClose(async () => {
      for (const t of tabs) {
        if (!t.dirty) continue;
        if (t.path === activeTab) t.content = EditorMod.getValue();
        try { await api.writeFile(t.path, t.content); } catch {}
      }
      api.readyToClose();
    });
    api.onReveal(({ file, line }) => openAndReveal(file, line));
    api.onCompileResult(({ errors }) => {
      EditorMod.setMarkers(errors || []);
      updateProblemsPanel(errors || []);
      if (errors && errors.length) $('sb-stats').title = `${errors.length} 个编译错误`;
    });
    api.onSettingsChanged((s) => {
      settings = s;
      EditorMod.applySettings(s);
      document.body.classList.toggle('light', s.theme === 'vs');
    });

    refreshProject();
  }

  function countAddedLines(e) {
    let n = 0;
    for (const ch of e.changes) {
      for (const line of ch.text.split('\n')) {
        if (line.trim().length > 0) n++;
      }
    }
    return n;
  }

  function flushStats() {
    if (statsPendingLines <= 0) return;
    api.addStats(statsPendingLines);
    stats.todayLines += statsPendingLines;
    statsPendingLines = 0;
    updateStatsBar();
  }

  function scheduleSilentCompile() {
    clearTimeout(compileTimer);
    if (!activeTab) return;
    compileTimer = setTimeout(() => {
      if (activeTab && !tabs.find((t) => t.path === activeTab)?.dirty) return;
      silentCompile();
    }, 1200);
  }

  // ---------- 静默编译（错误波浪线） ----------
  async function silentCompile() {
    if (!activeTab) return;
    const file = tabs.find((t) => t.path === activeTab);
    if (!file) return;
    if (file.dirty) await saveActive(false);
    const res = await api.compile(activeTab);
    EditorMod.setMarkers(res.errors || []);
  }

  // ---------- Tab 管理 ----------
  async function openFile(path, content) {
    if (!path) return;
    const exist = tabs.find((t) => t.path === path);
    if (exist) { activateTab(path); return; }
    if (content === undefined) {
      try { content = await api.readFile(path); }
      catch { toast('无法读取文件：' + path, 'err'); return; }
    }
    const name = path.split(/[\\/]/).pop();
    tabs.push({ path, name, dirty: false, content });
    api.setCurrentFile(path);
    activateTab(path);
    hideWelcome();
  }

  function activateTab(path) {
    const t = tabs.find((x) => x.path === path);
    if (!t) return;
    activeTab = path;
    currentModel = t;
    renderTabs();
    EditorMod.setValue(t.content);
    EditorMod.setLanguage(langOf(path));
    EditorMod.clearMarkers();
    $('sb-file').textContent = t.path;
    $('sb-file').title = t.path;
    updateRuntimeStatus();
    silentCompile();
    refreshProject();
  }

  function renderTabs() {
    const bar = $('tabbar');
    if (!tabs.length) {
      bar.innerHTML = '<div class="tabbar-empty">未打开文件 —— 使用 Ctrl+O 打开，或 Ctrl+N 新建</div>';
      return;
    }
    bar.innerHTML = tabs.map((t) => {
      const active = t.path === activeTab ? ' active' : '';
      const dirty = t.dirty ? ' dirty' : '';
      return `<div class="tab${active}" data-path="${t.path}">` +
        `<span class="tab-name${dirty}">${t.name}</span>` +
        `<button class="tab-close" title="关闭">${ICON.svg('close')}</button></div>`;
    }).join('');
    bar.querySelectorAll('.tab').forEach((el) => {
      el.addEventListener('click', (ev) => {
        // closest 兼容按钮内的 SVG 图标（点击 svg/path 时 target 不是按钮本身）
        if (ev.target.closest && ev.target.closest('.tab-close')) {
          closeTab(el.dataset.path);
        } else {
          activateTab(el.dataset.path);
        }
      });
    });
    const activeEl = bar.querySelector('.tab.active');
    if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function closeTab(path) {
    const idx = tabs.findIndex((t) => t.path === path);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeTab === path) {
      activeTab = tabs.length ? tabs[Math.max(0, idx - 1)].path : null;
      if (activeTab) { const t = tabs.find((x) => x.path === activeTab); EditorMod.setValue(t.content); EditorMod.setLanguage(langOf(activeTab)); EditorMod.clearMarkers(); }
      else { EditorMod.setValue(''); EditorMod.setLanguage('java'); showWelcome(); }
    }
    renderTabs();
    $('sb-file').textContent = activeTab || '未打开文件';
    if (!tabs.length) EditorMod.clearMarkers();
    updateRuntimeStatus();
  }

  function switchTabBy(step) {
    if (!tabs.length) return;
    const idx = tabs.findIndex((t) => t.path === activeTab);
    const next = tabs[(idx + step + tabs.length) % tabs.length];
    activateTab(next.path);
  }

  async function saveActive(notify = true) {
    if (!activeTab) return false;
    const t = tabs.find((x) => x.path === activeTab);
    if (!t) return false;
    const content = EditorMod.getValue();
    try {
      await api.writeFile(t.path, content);
      t.content = content;
      t.dirty = false;
      renderTabs();
      if (notify) toast('已保存 ' + t.name, 'ok');
      return true;
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
      return false;
    }
  }

  // ---------- 编译 / 运行 ----------
  async function compileActive(showTerminal) {
    if (!activeTab) { toast('请先打开一个文件', 'err'); return; }
    await saveActive(false);
    toast('正在编译…');
    const res = await api.compile(activeTab);
    EditorMod.setMarkers(res.errors || []);
    if (res.ok) {
      toast(`${ICON.svg('check')} 编译成功`, 'ok');
    } else {
      toast(`${ICON.svg('error')} 编译失败：${res.errors.length} 个错误`, 'err');
      if (res.errors[0]?.file) {
        api.revealLine(res.errors[0].file, res.errors[0].line);
      }
    }
    updateStatsBar();
  }

  async function runActive() {
    if (!activeTab) { toast('请先打开一个文件', 'err'); return; }
    await saveActive(false);
    toast('正在编译并运行…');
    const res = await api.run(activeTab);
    if (res && !res.ok && res.errors && res.errors.length) {
      toast(`${ICON.svg('error')} 编译失败：${res.errors.length} 个错误，已定位到第一处`, 'err');
    } else if (res && res.ok) {
      toast(`${ICON.svg('run')} 程序已运行，请查看终端窗口`, 'ok');
    }
    updateStatsBar();
  }

  // ---------- 项目 ----------
  async function refreshProject() {
    const data = await api.listProject();
    SidebarMod.renderTree(data);
  }

  // ---------- 问题面板 ----------
  function updateProblemsPanel(errors) {
    const panel = $('problems-panel');
    const list = $('problems-list');
    if (!errors || !errors.length) {
      panel.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    $('problems-count').textContent = errors.length;
    list.innerHTML = '';
    errors.forEach((e) => {
      const pos = e.file ? `${e.file.split(/[\\/]/).pop()}:${e.line}` : '未知位置';
      const el = document.createElement('div');
      el.className = 'problem-item';
      el.innerHTML = `<span class="pi-pos">${pos}</span><span class="pi-zh">${e.zh}</span><span class="pi-msg">${e.msg}</span>`;
      el.addEventListener('click', () => { if (e.file) openAndReveal(e.file, e.line); });
      list.appendChild(el);
    });
    panel.classList.remove('hidden');
  }

  // ---------- 欢迎页 ----------
  function showWelcome() { $('welcome').classList.remove('hidden'); }
  function hideWelcome() { $('welcome').classList.add('hidden'); }

  // ---------- 打开并定位行 ----------
  async function openAndReveal(file, line) {
    await openFile(file);
    setTimeout(() => EditorMod.revealLine(line || 1), 120);
  }

  // ---------- 事件绑定 ----------
  function wireEvents() {
    // 活动栏
    $('act-explorer').addEventListener('click', () => switchView('explorer'));
    $('act-dict').addEventListener('click', () => switchView('dict'));
    $('act-leetcode').addEventListener('click', () => openModal('modal-leetcode'));
    $('act-pet').addEventListener('click', () => api.togglePet());
    $('act-settings').addEventListener('click', () => openSettings());
    // 文件
    $('btn-newfile').addEventListener('click', async () => {
      const r = await api.newFile();
      if (r) { ensureExplorerOpen(); await openFile(r.path, r.content); refreshProject(); }
    });
    $('btn-openfolder').addEventListener('click', openFolder);
    $('btn-project-open').addEventListener('click', openFolder);
    // 欢迎页
    $('w-new').addEventListener('click', async () => {
      const r = await api.newFile();
      if (r) { ensureExplorerOpen(); await openFile(r.path, r.content); refreshProject(); }
    });
    $('w-open').addEventListener('click', openFileDialog);
    $('w-folder').addEventListener('click', openFolder);
    // 词典搜索
    const ds = $('dict-search');
    ds.addEventListener('input', () => SidebarMod.searchDict(ds.value));
    ds.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); SidebarMod.showDetail(ds.value.trim()); }
    });
    // 快捷键（编辑器未聚焦时的全局）
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'F5' && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); runActive(); }
      if (e.key === 'F6') { e.preventDefault(); compileActive(true); }
      if (e.key === 'F1') { e.preventDefault(); openModal('modal-shortcuts'); }
    });
    // 问题面板关闭
    $('problems-close').addEventListener('click', () => $('problems-panel').classList.add('hidden'));
    // 弹窗
    document.querySelectorAll('.modal-close').forEach((b) => b.addEventListener('click', () => closeModals()));
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
    // 设置
    $('set-theme').addEventListener('change', (e) => api.setSettings({ theme: e.target.value }));
    $('set-fontsize').addEventListener('change', (e) => api.setSettings({ fontSize: parseInt(e.target.value, 10) || 14 }));
    $('set-font').addEventListener('change', (e) => api.setSettings({ fontFamily: e.target.value }));
    $('set-jdk').addEventListener('change', (e) => api.setSettings({ jdkHome: e.target.value.trim() || null }));
    $('set-python').addEventListener('change', async (e) => {
      api.setSettings({ pythonHome: e.target.value.trim() || null });
      app.python = await api.detectPython();
      updatePythonStatus();
      updateRuntimeStatus();
    });
    $('btn-python-browse').addEventListener('click', async () => {
      const p = await window.api.pickExe();
      if (p) {
        $('set-python').value = p;
        api.setSettings({ pythonHome: p });
        app.python = await api.detectPython();
        updatePythonStatus();
        updateRuntimeStatus();
      }
    });
    $('set-aiurl').addEventListener('change', (e) => api.setSettings({ aiBaseUrl: e.target.value.trim() }));
    $('set-aikey').addEventListener('change', (e) => api.setSettings({ aiApiKey: e.target.value.trim() }));
    $('set-aimodel').addEventListener('change', (e) => api.setSettings({ aiModel: e.target.value.trim() }));
    $('set-leetcode').addEventListener('change', (e) => api.setSettings({ leetcodeBaseUrl: e.target.value.trim() }));
    $('btn-jdk-browse').addEventListener('click', async () => {
      // 通过主进程对话框选择目录（复用 openFolderDialog 逻辑扩展：这里用系统对话框）
      const r = await window.api.openFolderDialog();
      if (r && r.projectRoot) {
        $('set-jdk').value = r.projectRoot;
        api.setSettings({ jdkHome: r.projectRoot });
      }
    });
    window.addEventListener('beforeunload', () => flushStats());
    // LeetCode 刷题
    $('btn-lc-fetch').addEventListener('click', fetchLeetCode);
    $('btn-lc-addcase').addEventListener('click', addLeetCodeCase);
    $('btn-lc-runtests').addEventListener('click', runLeetCodeTests);
    $('lc-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchLeetCode(); });
  }

  // ---------- LeetCode 刷题 ----------
  function renderLcCases(cases) {
    const el = $('lc-cases');
    if (!cases || !cases.length) { el.innerHTML = '<div style="color:var(--text-dim)">暂无测试用例</div>'; return; }
    el.innerHTML = cases.map((c, i) => {
      const exp = c.expected ? ` <span style="color:var(--ok)">期望 ${esc(c.expected)}</span>` : '';
      return `<div class="lc-case"><b>#${i + 1}</b> <code>${esc(c.input.replace(/\n/g, ' ⏎ '))}</code>${exp}</div>`;
    }).join('');
  }

  async function fetchLeetCode() {
    const query = $('lc-query').value.trim();
    const lang = $('lc-lang').value;
    if (!query) { toast('请输入题号或网址', 'err'); return; }
    toast('正在拉取题目…');
    const r = await api.leetcodeFetch(query, lang);
    if (!r.ok) { toast(r.error || '拉取失败', 'err'); return; }
    lcDir = r.dir; lcLang = lang;
    $('lc-result').classList.remove('hidden');
    $('lc-title').textContent = (r.difficulty ? '[' + r.difficulty + '] ' : '') + r.title;
    $('lc-desc').textContent = r.description || '（无描述）';
    renderLcCases(r.testcases);
    if (r.complexType) toast('该题含链表/树类型，自动判题暂不支持，已生成代码模板，请手动编写测试', 'err');
    else toast('已生成代码与测试，请在编辑器中完成 Solution 后点击「本地判题」', 'ok');
    await openFile(r.solFile, r.content);
    refreshProject();
  }

  async function addLeetCodeCase() {
    if (!lcDir) { toast('请先拉取题目', 'err'); return; }
    const input = $('lc-case-input').value;
    const expected = $('lc-case-expected').value.trim();
    if (!input.trim()) { toast('请输入测试用例输入', 'err'); return; }
    const r = await api.leetcodeAddTestCase(lcDir, { input, expected });
    if (!r.ok) { toast(r.error || '添加失败', 'err'); return; }
    $('lc-case-input').value = ''; $('lc-case-expected').value = '';
    renderLcCases(r.testcases);
    toast('已添加用例，点击「本地判题」运行', 'ok');
  }

  async function runLeetCodeTests() {
    if (!lcDir) { toast('请先拉取题目', 'err'); return; }
    await saveActive(false); // 先把当前 Solution 存盘，测试文件从磁盘导入
    toast('正在本地判题…');
    const r = await api.leetcodeRunTests(lcDir, lcLang);
    if (r && r.ok) toast('判题结果已输出到终端窗口', 'ok');
    else if (r && r.error) toast(r.error, 'err');
  }

  let currentView = 'explorer';
  let lcDir = null, lcLang = 'java'; // LeetCode 当前题目

  function switchView(name, forceOpen) {
    const sidebar = $('sidebar');
    const isOpen = !sidebar.classList.contains('collapsed');
    // 点击当前已展开的图标 → 收起侧边栏
    if (isOpen && currentView === name && !forceOpen) {
      sidebar.classList.add('collapsed');
      return;
    }
    currentView = name;
    document.querySelectorAll('.sidebar-view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
    $('view-' + name).classList.add('active');
    $('act-' + name).classList.add('active');
    sidebar.classList.remove('collapsed');
    if (name === 'dict') setTimeout(() => $('dict-search').focus(), 220);
  }

  // 打开文件/项目时自动展开资源管理器视图
  function ensureExplorerOpen() {
    if ($('sidebar').classList.contains('collapsed')) switchView('explorer', true);
  }

  async function openFileDialog() {
    const r = await api.openFileDialog();
    if (r) { ensureExplorerOpen(); await openFile(r.path, r.content); refreshProject(); }
  }
  async function openFolder() {
    const r = await api.openFolderDialog();
    if (r) { ensureExplorerOpen(); refreshProject(); toast('已打开项目：' + r.projectRoot, 'ok'); }
  }

  // ---------- 菜单 ----------
  function handleMenu(action) {
    switch (action) {
      case 'new': $('btn-newfile').click(); break;
      case 'open': openFileDialog(); break;
      case 'openFolder': openFolder(); break;
      case 'save': saveActive(); break;
      case 'saveAll': tabs.forEach((t) => saveActive()); break;
      case 'compile': compileActive(true); break;
      case 'run': runActive(); break;
      case 'stop': api.stopRun(); toast('已发送停止信号', 'ok'); break;
      case 'showTerminal': api.showTerminal(); break;
      case 'toggleSidebar':
        if ($('sidebar').classList.contains('collapsed')) switchView(currentView, true);
        else $('sidebar').classList.add('collapsed');
        break;
      case 'toggleTheme':
        api.setSettings({ theme: settings.theme === 'vs' ? 'vs-dark' : 'vs' });
        break;
      case 'togglePet': api.togglePet(); break;
      case 'settings': openSettings(); break;
      case 'shortcuts': openModal('modal-shortcuts'); break;
      case 'revealInExplorer':
        if (app.projectRoot) api.showItemInFolder(app.projectRoot);
        else if (activeTab) api.showItemInFolder(activeTab);
        break;
      case 'about': openModal('modal-about'); break;
    }
  }

  // ---------- 弹窗 ----------
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModals() { document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); }

  function openSettings() {
    $('set-theme').value = settings.theme === 'vs' ? 'vs' : 'vs-dark';
    $('set-fontsize').value = settings.fontSize || 14;
    $('set-font').value = settings.fontFamily || "Consolas, 'Courier New', monospace";
    $('set-jdk').value = settings.jdkHome || '';
    $('set-python').value = settings.pythonHome || '';
    $('set-aiurl').value = settings.aiBaseUrl || '';
    $('set-aikey').value = settings.aiApiKey || '';
    $('set-aimodel').value = settings.aiModel || '';
    $('set-leetcode').value = settings.leetcodeBaseUrl || 'https://leetcode.com';
    openModal('modal-settings');
    updateJavaStatus();
    updatePythonStatus();
  }

  async function updateJavaStatus() {
    if (!app) return;
    const el = $('jdk-status');
    if (app.jdk.ok) {
      $('sb-java').textContent = 'JDK ' + app.jdk.version;
      if (el) { el.innerHTML = `${ICON.svg('check')} 已检测到 javac ${app.jdk.version}`; el.className = 'ok'; }
    } else {
      $('sb-java').textContent = '未检测到 JDK';
      if (el) { el.innerHTML = `${ICON.svg('error')} 未检测到 javac，请在下方设置 JDK 路径（bin 目录的上级）`; el.className = 'err'; }
    }
  }

  async function updatePythonStatus() {
    if (!app) return;
    const el = $('python-status');
    const py = app.python || {};
    if (py.ok) {
      if (el) { el.innerHTML = `${ICON.svg('check')} 已检测到 Python ${py.version}`; el.className = 'ok'; }
    } else {
      if (el) { el.innerHTML = `${ICON.svg('error')} 未检测到 Python，请在下方指定解释器路径`; el.className = 'err'; }
    }
  }

  // 状态栏运行时状态：根据当前文件语言显示 JDK / Python
  function updateRuntimeStatus() {
    if (!app) return;
    const lang = activeTab ? langOf(activeTab) : 'java';
    if (lang === 'python') {
      const py = app.python || {};
      $('sb-java').textContent = py.ok ? 'Python ' + py.version : '未检测到 Python';
    } else {
      $('sb-java').textContent = app.jdk.ok ? 'JDK ' + app.jdk.version : '未检测到 JDK';
    }
  }

  function updateStatsBar() {
    $('sb-stats').textContent = `今日 ${stats.todayLines} 行 · 编译 ${stats.compiles} 次 · 运行 ${stats.runs} 次`;
    $('sb-stats').title = `累计编写 ${stats.totalLines} 行`;
  }

  // ---------- Toast ----------
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  init();
})();
