'use strict';
// ============ 侧边栏：文件树 + 关键字词典 ============
(function () {
  let keywords = [];
  let selectedKey = null; // kw|lang
  let onOpenFile = null;

  function init(opts) {
    onOpenFile = opts.onOpenFile || (() => {});
  }

  function setKeywords(list) {
    keywords = list || [];
    renderDict('');
  }

  // ---------- 文件树 ----------
  function renderTree(data) {
    const el = document.getElementById('file-tree');
    const nameEl = document.getElementById('project-name');
    if (!data || !data.root) {
      el.innerHTML = '<div class="tree-empty">尚未打开项目。<br>点击上方「打开文件夹…」选择一个项目目录，<br>或直接打开单个 .java 文件。</div>';
      nameEl.textContent = '未打开项目';
      return;
    }
    nameEl.textContent = data.root.split(/[\\/]/).pop();
    if (!data.files.length) {
      el.innerHTML = '<div class="tree-empty">该文件夹下没有 .java 文件。</div>';
      return;
    }
    const sorted = [...data.files].sort((a, b) => a.rel.localeCompare(b.rel));
    const items = [];
    for (const f of sorted) {
      const depth = f.rel.split(/[\\/]/).length - 1;
      const icon = f.lang === 'python' ? ICON.svg('filepy', 'py') : ICON.svg('filejava', 'java');
      items.push(
        `<div class="tree-item" data-path="${escapeHtml(f.path)}" style="padding-left:${10 + depth * 14}px">` +
        `${icon}<span>${escapeHtml(f.name)}</span></div>`
      );
    }
    el.innerHTML = items.join('');
    el.querySelectorAll('.tree-item').forEach((it) => {
      it.addEventListener('click', () => onOpenFile(unescapeAttr(it.dataset.path)));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function unescapeAttr(s) {
    return s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  }

  // ---------- 词典 ----------
  function langBadge(lang) {
    return lang === 'python' ? '<span class="lang-badge py">Py</span>' : '<span class="lang-badge java">Java</span>';
  }
  function renderDict(query) {
    const listEl = document.getElementById('dict-list');
    const q = (query || '').trim().toLowerCase();
    let items = keywords;
    if (q) {
      items = keywords.filter((k) => k.kw.toLowerCase().includes(q) || k.cn.includes(q));
    }
    if (!items.length) {
      listEl.innerHTML = '<div class="dict-empty">没有找到匹配的关键字，试试 class、for、def、print…</div>';
      return;
    }
    listEl.innerHTML = items.map((k) => {
      const key = k.kw + '|' + k.lang;
      const sel = selectedKey === key ? ' selected' : '';
      return `<div class="dict-item${sel}" data-kw="${escapeHtml(k.kw)}" data-lang="${k.lang}"><span class="kw">${escapeHtml(k.kw)}</span><span class="cn">${escapeHtml(k.cn)}</span>${langBadge(k.lang)}</div>`;
    }).join('');
    listEl.querySelectorAll('.dict-item').forEach((it) => {
      it.addEventListener('click', () => showDetail(it.dataset.kw, it.dataset.lang));
    });
  }

  function showDetail(kwName, langName) {
    const k = langName
      ? keywords.find((x) => x.kw === kwName && x.lang === langName)
      : keywords.find((x) => x.kw === kwName);
    if (!k) return;
    selectedKey = k.kw + '|' + k.lang;
    renderDict(document.getElementById('dict-search').value);
    const el = document.getElementById('dict-detail');
    el.classList.remove('hidden');
    el.innerHTML =
      `<h3><span class="dd-kw">${escapeHtml(k.kw)}</span>${langBadge(k.lang)}<span class="dd-cn">${escapeHtml(k.cn)}</span></h3>` +
      `<div class="sec">语法用法</div><div class="usage">${escapeHtml(k.usage)}</div>` +
      `<div class="sec">说明</div><div class="desc">${escapeHtml(k.desc)}</div>` +
      `<div class="sec">示例代码</div><div class="example">${escapeHtml(k.example)}</div>` +
      `<div class="sec">易错点</div><div class="pitfall">${ICON.svg('warn')} ${escapeHtml(k.pitfall)}</div>`;
  }

  function searchDict(q) {
    renderDict(q);
    if (!q) {
      document.getElementById('dict-detail').classList.add('hidden');
    }
  }

  window.SidebarMod = { init, setKeywords, renderTree, searchDict, showDetail };
})();
