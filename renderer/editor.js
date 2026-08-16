'use strict';
// ============ 编辑器（Monaco） ============
(function () {
  const JAVA_KEYWORDS = [
    'abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default',
    'do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import',
    'instanceof','int','interface','long','native','new','package','private','protected','public','return',
    'short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try',
    'void','volatile','while','var','record','sealed','permits','yield','true','false','null','String','System','Scanner'
  ];

  const PY_KEYWORDS = [
    'def','return','class','if','elif','else','for','while','break','continue','pass','import','from','as',
    'try','except','finally','raise','with','lambda','and','or','not','in','is','global','nonlocal','del',
    'assert','yield','async','await','match','case','None','True','False','print','input','range','len',
    'int','float','str','list','tuple','dict','set','open','enumerate','zip','map','filter','sorted','type',
    'self','__init__','__name__','__main__'
  ];

  const SNIPPETS = [
    { label: 'psvm', insert: 'public static void main(String[] args) {\n\t$0\n}', doc: 'main 方法模板' },
    { label: 'main', insert: 'public static void main(String[] args) {\n\t$0\n}', doc: 'main 方法模板' },
    { label: 'sout', insert: 'System.out.println($0);', doc: '输出语句' },
    { label: 'soutv', insert: 'System.out.println("$1 = " + $1);$0', doc: '带变量名输出' },
    { label: 'fori', insert: 'for (int i = 0; i < $1; i++) {\n\t$0\n}', doc: 'for 循环' },
    { label: 'foreach', insert: 'for ($1 : $2) {\n\t$0\n}', doc: 'foreach 循环' },
    { label: 'whilei', insert: 'while ($1) {\n\t$0\n}', doc: 'while 循环' },
    { label: 'ifn', insert: 'if ($1) {\n\t$0\n}', doc: 'if 判断' },
    { label: 'ife', insert: 'if ($1) {\n\t$0\n} else {\n\t$2\n}', doc: 'if-else' },
    { label: 'switchi', insert: 'switch ($1) {\n\tcase $2:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', doc: 'switch 分支' },
    { label: 'tryc', insert: 'try {\n\t$0\n} catch (Exception e) {\n\te.printStackTrace();\n}', doc: 'try-catch' },
    { label: 'sc', insert: 'Scanner sc = new Scanner(System.in);\n$0', doc: '创建 Scanner 输入对象' },
    { label: 'printarr', insert: 'System.out.println(Arrays.toString($1));$0', doc: '打印数组' },
    { label: 'classi', insert: 'public class $1 {\n\t$0\n}', doc: '类模板' }
  ];

  const PY_SNIPPETS = [
    { label: 'main', insert: "if __name__ == '__main__':\n\t$0", doc: '主程序入口' },
    { label: 'def', insert: 'def $1($2):\n\t$0', doc: '函数模板' },
    { label: 'class', insert: 'class $1:\n\tdef __init__(self):\n\t\t$0', doc: '类模板' },
    { label: 'print', insert: 'print($0)', doc: '输出' },
    { label: 'fori', insert: 'for $1 in range($2):\n\t$0', doc: 'for 循环' },
    { label: 'forin', insert: 'for $1 in $2:\n\t$0', doc: 'for-in 遍历' },
    { label: 'while', insert: 'while $1:\n\t$0', doc: 'while 循环' },
    { label: 'ife', insert: 'if $1:\n\t$0\nelse:\n\t$2', doc: 'if-else' },
    { label: 'elif', insert: 'elif $1:\n\t$0', doc: 'elif 分支' },
    { label: 'trye', insert: 'try:\n\t$0\nexcept Exception as e:\n\tprint(e)', doc: 'try-except' },
    { label: 'input', insert: '${1:x} = input("${2:请输入: }")$0', doc: '输入' },
    { label: 'fstring', insert: "f'${1:文本}{$2}'$0", doc: 'f-string 格式化' }
  ];

  let editor = null;
  let monacoReady = null;
  let settings = { theme: 'vs-dark', fontSize: 14, fontFamily: "Consolas, 'Courier New', monospace" };
  let api = null;

  // ---------- Monaco 加载 ----------
  function loadMonaco() {
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve, reject) => {
      self.MonacoEnvironment = {
        getWorkerUrl: function () {
          return 'app://ide/vendor/monaco/vs/base/worker/workerMain.js';
        }
      };
      require.config({ paths: { vs: '../vendor/monaco/vs' } });
      require(['vs/editor/editor.main'], function () {
        registerJavaLanguage();
        registerPythonLanguage();
        resolve(window.monaco);
      });
      setTimeout(() => reject(new Error('Monaco 加载超时')), 20000);
    });
    return monacoReady;
  }

  // ---------- Java 语言与补全 ----------
  function registerJavaLanguage() {
    const monaco = window.monaco;
    // 关键字补全
    monaco.languages.registerCompletionItemProvider('java', {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const items = [];
        for (const kw of JAVA_KEYWORDS) {
          items.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
            detail: 'Java 关键字',
            documentation: 'Tab 插入关键字'
          });
        }
        for (const s of SNIPPETS) {
          items.push({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: '代码片段',
            documentation: s.doc
          });
        }
        return { suggestions: items };
      }
    });
  }

  // ---------- Python 语言与补全 ----------
  function registerPythonLanguage() {
    const monaco = window.monaco;
    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const items = [];
        for (const kw of PY_KEYWORDS) {
          items.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
            detail: 'Python 关键字',
            documentation: 'Tab 插入关键字'
          });
        }
        for (const s of PY_SNIPPETS) {
          items.push({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: '代码片段',
            documentation: s.doc
          });
        }
        return { suggestions: items };
      }
    });
  }

  // ---------- 创建编辑器 ----------
  function createEditor(container, opts) {
    return loadMonaco().then((monaco) => {
      settings = opts.settings || settings;
      api = opts.api;
      editor = monaco.editor.create(container, {
        value: '',
        language: 'java',
        theme: settings.theme === 'vs' ? 'vs' : 'vs-dark',
        fontFamily: settings.fontFamily || "Consolas, 'Courier New', monospace",
        fontSize: settings.fontSize || 14,
        lineHeight: Math.round((settings.fontSize || 14) * 1.6),
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoIndent: 'full',
        tabCompletion: 'on',
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: 'currentDocument',
        renderLineHighlight: 'all',
        roundedSelection: true,
        padding: { top: 8 },
        guides: { indentation: true, bracketPairs: true },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
      });

      // 快捷键
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => opts.onSave && opts.onSave());
      editor.addCommand(monaco.KeyCode.F5, () => opts.onRun && opts.onRun());
      editor.addCommand(monaco.KeyCode.F6, () => opts.onCompile && opts.onCompile());
      editor.addCommand(monaco.KeyCode.F1, () => opts.onShortcuts && opts.onShortcuts());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => opts.onNextTab && opts.onNextTab());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => opts.onCloseTab && opts.onCloseTab());

      // 光标位置 → 状态栏
      editor.onDidChangeCursorPosition((e) => {
        if (opts.onCursor) opts.onCursor(e.position.lineNumber, e.position.column);
      });

      return editor;
    });
  }

  function getEditor() { return editor; }

  // 根据文件类型切换编辑器语言（Python / Java）
  function setLanguage(lang) {
    if (!editor || !window.monaco) return;
    const monaco = window.monaco;
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang === 'python' ? 'python' : 'java');
  }

  function setValue(text) {
    if (!editor) return;
    editor.setValue(text || '');
    editor.setPosition({ lineNumber: 1, column: 1 });
  }

  function getValue() { return editor ? editor.getValue() : ''; }

  function setMarkers(errors) {
    if (!editor || !window.monaco) return;
    const monaco = window.monaco;
    const model = editor.getModel();
    if (!model) return;
    const markers = (errors || [])
      .filter((e) => e.line)
      .map((e) => ({
        severity: monaco.MarkerSeverity.Error,
        message: `[${e.zh}] ${e.tip}\n${e.msg}`,
        startLineNumber: e.line,
        startColumn: Math.max(1, e.col || 1),
        endLineNumber: e.line,
        endColumn: 1073741824 // MAX_SAFE 列，覆盖整行
      }));
    monaco.editor.setModelMarkers(model, 'java-errors', markers);
  }

  function clearMarkers() {
    if (!editor || !window.monaco) return;
    window.monaco.editor.setModelMarkers(editor.getModel(), 'java-errors', []);
  }

  function applySettings(s) {
    settings = { ...settings, ...s };
    if (!editor || !window.monaco) return;
    editor.updateOptions({
      theme: settings.theme === 'vs' ? 'vs' : 'vs-dark',
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: Math.round(settings.fontSize * 1.6)
    });
    document.body.classList.toggle('light', settings.theme === 'vs');
  }

  function focus() { if (editor) editor.focus(); }
  function revealLine(line) {
    if (!editor) return;
    editor.revealLineInCenter(line, 1);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }

  window.EditorMod = {
    loadMonaco, createEditor, getEditor, setValue, getValue, setLanguage,
    setMarkers, clearMarkers, applySettings, focus, revealLine
  };
})();
