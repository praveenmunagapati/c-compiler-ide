/**
 * C Compiler IDE — VS Code-inspired Application Logic
 *
 * Architecture:
 *   VFS (Virtual File System)  →  file storage in memory
 *   TabManager                 →  open/close/switch editor tabs (Monaco models)
 *   FileExplorer               →  sidebar tree rendered from VFS
 *   Compiler Pipeline          →  tokenize → parse → codegen → execute
 */
(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════════
     CODE PRESETS
     ══════════════════════════════════════════════════════════════════════ */
  const PRESETS = {
    hello: [
      'Hello World',
      '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}\n'
    ],
    macros: [
      'Preprocessor Macros',
      '#include <stdio.h>\n\n#define SQUARE(x) ((x) * (x))\n#define APP_NAME "Visualizer"\n\nint main(void) {\n    int v = 7;\n    printf("%s: %d^2 = %d\\n", APP_NAME, v, SQUARE(v));\n    return 0;\n}\n'
    ],
    loops: [
      'Control Flow & Loops',
      '#include <stdio.h>\n\nint main(void) {\n    int sum = 0;\n    for (int i = 1; i <= 5; i++) {\n        if (i % 2 == 0)\n            printf("even: %d\\n", i);\n        else\n            printf("odd:  %d\\n", i);\n        sum += i;\n    }\n    printf("total = %d\\n", sum);\n    return 0;\n}\n'
    ],
    memory: [
      'Pointers & Heap Memory',
      '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int n = 4;\n    int *arr = (int *)malloc(n * sizeof(int));\n    if (!arr) return 1;\n    for (int i = 0; i < n; i++)\n        arr[i] = (i + 1) * 10;\n    for (int i = 0; i < n; i++)\n        printf("arr[%d] = %d\\n", i, arr[i]);\n    free(arr);\n    return 0;\n}\n'
    ],
    structs: [
      'Structs & Typedef',
      '#include <stdio.h>\n\ntypedef struct {\n    int x;\n    int y;\n} Point;\n\nPoint add(Point a, Point b) {\n    Point r = { a.x + b.x, a.y + b.y };\n    return r;\n}\n\nint main(void) {\n    Point p = add((Point){1, 2}, (Point){3, 4});\n    printf("(%d, %d)\\n", p.x, p.y);\n    return 0;\n}\n'
    ],
  };

  /* ══════════════════════════════════════════════════════════════════════
     VIRTUAL FILE SYSTEM (VFS)
     ══════════════════════════════════════════════════════════════════════ */
  const VFS = {
    _files: new Map(),

    /** Create or overwrite a file. */
    write(path, content, opts = {}) {
      this._files.set(path, {
        content: content,
        language: opts.language || langFromExt(path),
        readOnly: opts.readOnly || false,
        generated: opts.generated || false,
      });
    },

    /** Read a file. Returns null if not found. */
    read(path) {
      return this._files.get(path) || null;
    },

    /** Check if file exists. */
    exists(path) {
      return this._files.has(path);
    },

    /** Delete a file. */
    remove(path) {
      this._files.delete(path);
    },

    /** List all file paths. */
    list() {
      return Array.from(this._files.keys()).sort((a, b) => {
        // User files first, then generated
        const aGen = this._files.get(a).generated ? 1 : 0;
        const bGen = this._files.get(b).generated ? 1 : 0;
        if (aGen !== bGen) return aGen - bGen;
        return a.localeCompare(b);
      });
    },

    /** Clear all generated files. */
    clearGenerated() {
      for (const [path, file] of this._files) {
        if (file.generated) this._files.delete(path);
      }
    },
  };

  function langFromExt(path) {
    if (path.endsWith('.c') || path.endsWith('.h') || path.endsWith('.i')) return 'c';
    if (path.endsWith('.wat') || path.endsWith('.wast')) return 'wat';
    return 'plaintext';
  }

  function fileIcon(path) {
    if (path.endsWith('.c'))   return { icon: 'codicon-file-code', cls: 'icon-c' };
    if (path.endsWith('.h'))   return { icon: 'codicon-file-code', cls: 'icon-header' };
    if (path.endsWith('.i'))   return { icon: 'codicon-file-code', cls: 'icon-header' };
    if (path.endsWith('.ast')) return { icon: 'codicon-type-hierarchy', cls: 'icon-ast' };
    if (path.endsWith('.wat')) return { icon: 'codicon-file-binary', cls: 'icon-wasm' };
    if (path.endsWith('.wasm'))return { icon: 'codicon-file-binary', cls: 'icon-wasm' };
    if (path.endsWith('.txt')) return { icon: 'codicon-output', cls: 'icon-output' };
    return { icon: 'codicon-file', cls: 'icon-default' };
  }

  /* ══════════════════════════════════════════════════════════════════════
     TAB MANAGER
     ══════════════════════════════════════════════════════════════════════ */
  const Tabs = {
    _open: [],      // ordered list of open file paths
    _active: null,  // currently active path
    _models: {},    // path → Monaco ITextModel

    /** Open a file (add tab if not open, switch to it). */
    open(path) {
      if (!VFS.exists(path)) return;
      if (!this._open.includes(path)) {
        this._open.push(path);
      }
      this._active = path;
      this._ensureModel(path);
      this._render();
      this._showEditor(path);
    },

    /** Close a tab. */
    close(path) {
      const idx = this._open.indexOf(path);
      if (idx === -1) return;
      this._open.splice(idx, 1);
      // If closing the active tab, switch to neighbor
      if (this._active === path) {
        if (this._open.length > 0) {
          this._active = this._open[Math.min(idx, this._open.length - 1)];
          this._showEditor(this._active);
        } else {
          this._active = null;
          this._hideEditor();
        }
      }
      // Dispose the model if generated (save memory)
      if (this._models[path] && VFS.read(path)?.generated) {
        this._models[path].dispose();
        delete this._models[path];
      }
      this._render();
    },

    /** Close all generated-file tabs. */
    closeGenerated() {
      const gen = this._open.filter(p => VFS.read(p)?.generated);
      for (const p of gen) this.close(p);
    },

    /** Get active file path. */
    getActive() { return this._active; },

    /** Ensure a Monaco model exists for a file. */
    _ensureModel(path) {
      if (this._models[path]) return;
      const file = VFS.read(path);
      if (!file) return;
      const lang = file.language || 'plaintext';
      const uri = monaco.Uri.parse('vfs:///' + path);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(file.content, lang, uri);
      } else {
        model.setValue(file.content);
        monaco.editor.setModelLanguage(model, lang);
      }
      this._models[path] = model;
    },

    /** Update the model content for a path (e.g., after rebuild). */
    updateModel(path) {
      const file = VFS.read(path);
      if (!file) return;
      if (this._models[path]) {
        this._models[path].setValue(file.content);
      }
    },

    /** Show the editor for a path. */
    _showEditor(path) {
      if (!editor || !this._models[path]) return;
      const file = VFS.read(path);
      editor.setModel(this._models[path]);
      editor.updateOptions({ readOnly: file?.readOnly || false });
      $('monaco-editor').classList.add('visible');
      $('welcome-screen').classList.add('hidden');
      updateStatusBar();
      FileExplorer.render();
    },

    /** Hide the editor (no tabs open). */
    _hideEditor() {
      $('monaco-editor').classList.remove('visible');
      $('welcome-screen').classList.remove('hidden');
      updateStatusBar();
      FileExplorer.render();
    },

    /** Render the tab bar DOM. */
    _render() {
      const bar = $('tab-bar');
      bar.innerHTML = '';
      for (const path of this._open) {
        const file = VFS.read(path);
        const ic = fileIcon(path);
        const tab = document.createElement('div');
        tab.className = 'tab' + (path === this._active ? ' active' : '');
        tab.dataset.path = path;

        tab.innerHTML =
          `<i class="codicon ${ic.icon} tab-icon ${ic.cls}"></i>` +
          `<span class="tab-label">${esc(path)}</span>` +
          (file?.readOnly ? '<span class="tab-readonly">read-only</span>' : '') +
          `<span class="tab-close codicon codicon-close" data-close="${esc(path)}"></span>`;

        // Click tab → switch
        tab.addEventListener('click', (e) => {
          if (e.target.dataset.close !== undefined) return;
          this.open(path);
        });
        // Click × → close
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
          e.stopPropagation();
          this.close(path);
        });

        bar.appendChild(tab);
      }
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     FILE EXPLORER
     ══════════════════════════════════════════════════════════════════════ */
  const FileExplorer = {
    render() {
      const tree = $('file-tree');
      tree.innerHTML = '';
      const files = VFS.list();
      for (const path of files) {
        const file = VFS.read(path);
        const ic = fileIcon(path);
        const item = document.createElement('div');
        item.className = 'file-tree-item' + (path === Tabs.getActive() ? ' active' : '');
        item.dataset.path = path;

        let badge = '';
        if (file.generated) badge = '<span class="file-badge">gen</span>';

        item.innerHTML =
          `<i class="codicon ${ic.icon} file-icon ${ic.cls}"></i>` +
          `<span class="file-name">${esc(path)}</span>` +
          badge;

        item.addEventListener('click', () => Tabs.open(path));
        tree.appendChild(item);
      }
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     MONACO EDITOR
     ══════════════════════════════════════════════════════════════════════ */
  let editor = null;

  function bootMonaco() {
    if (typeof require === 'undefined' || typeof require.config === 'undefined') {
      setTimeout(bootMonaco, 80);
      return;
    }
    require.config({
      paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
    });
    require(['vs/editor/editor.main'], () => {
      monaco.editor.defineTheme('ide-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword',  foreground: '569cd6', fontStyle: 'bold' },
          { token: 'type',     foreground: '4ec9b0' },
          { token: 'string',   foreground: 'ce9178' },
          { token: 'number',   foreground: 'b5cea8' },
          { token: 'comment',  foreground: '6a9955', fontStyle: 'italic' },
        ],
        colors: {
          'editor.background':                '#1e1e1e',
          'editor.lineHighlightBackground':   '#2a2d2e',
          'editorLineNumber.foreground':       '#858585',
          'editorLineNumber.activeForeground': '#c6c6c6',
        }
      });

      editor = monaco.editor.create($('monaco-editor'), {
        theme: 'ide-dark',
        fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
        fontSize: 14,
        lineHeight: 20,
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 4,
        scrollBeyondLastLine: false,
        padding: { top: 8, bottom: 8 },
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
      });

      // Track cursor for status bar
      editor.onDidChangeCursorPosition((e) => {
        $('status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });

      // Save editor content back to VFS on change
      editor.onDidChangeModelContent(() => {
        const path = Tabs.getActive();
        if (path && VFS.exists(path)) {
          const file = VFS.read(path);
          if (!file.readOnly) {
            file.content = editor.getValue();
          }
        }
      });

      // Ctrl+Enter shortcut
      editor.addAction({
        id: 'run-program',
        label: 'Build & Run',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => runPipeline(true),
      });

      // Open the default file
      Tabs.open('main.c');
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════════════ */
  window.addEventListener('DOMContentLoaded', () => {
    // Initialize VFS with default file
    VFS.write('main.c', PRESETS.hello[1], { language: 'c' });

    populatePresets();
    bindEvents();
    FileExplorer.render();
    bootMonaco();
  });

  function populatePresets() {
    const sel = $('preset-select');
    for (const [key, [label]] of Object.entries(PRESETS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  function bindEvents() {
    $('preset-select').onchange = (e) => {
      const p = PRESETS[e.target.value];
      if (p) {
        VFS.write('main.c', p[1], { language: 'c' });
        Tabs.updateModel('main.c');
        Tabs.open('main.c');
      }
    };

    $('btn-build').onclick  = () => runPipeline(false);
    $('btn-run').onclick    = () => runPipeline(true);
    $('btn-new').onclick    = () => createNewFile();

    $('btn-clear-term').onclick = () => { $('terminal').innerHTML = ''; };
    $('btn-toggle-term').onclick = () => {
      $('terminal-panel').classList.toggle('collapsed');
    };

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runPipeline(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewFile();
      }
    });

    // Sidebar resize
    initResize($('sidebar-resize'), 'sidebar', 'horizontal');
    // Terminal resize
    initResize($('terminal-resize'), 'terminal-panel', 'vertical');
  }

  /* ── Create New File ────────────────────────────────────────────────── */
  function createNewFile() {
    let name = prompt('New file name:', 'untitled.c');
    if (!name) return;
    if (!name.includes('.')) name += '.c';
    if (VFS.exists(name)) {
      Tabs.open(name);
      return;
    }
    VFS.write(name, '// ' + name + '\n', { language: langFromExt(name) });
    FileExplorer.render();
    Tabs.open(name);
  }

  /* ── Resize Handles ─────────────────────────────────────────────────── */
  function initResize(handle, targetId, direction) {
    let startPos, startSize;
    const onMouseMove = (e) => {
      const el = $(targetId);
      if (direction === 'horizontal') {
        el.style.width = Math.max(140, startSize + (e.clientX - startPos)) + 'px';
      } else {
        el.style.height = Math.max(80, startSize - (e.clientY - startPos)) + 'px';
      }
    };
    const onMouseUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('active');
      const el = $(targetId);
      startPos = direction === 'horizontal' ? e.clientX : e.clientY;
      startSize = direction === 'horizontal' ? el.offsetWidth : el.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /* ── Status Bar ─────────────────────────────────────────────────────── */
  function updateStatusBar() {
    const path = Tabs.getActive();
    if (path) {
      $('status-file').textContent = path;
      const file = VFS.read(path);
      $('status-lang').textContent = (file?.language || 'plaintext').toUpperCase();
    } else {
      $('status-file').textContent = '';
      $('status-lang').textContent = '';
      $('status-cursor').textContent = '';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     COMPILER PIPELINE
     ══════════════════════════════════════════════════════════════════════ */
  function runPipeline(execute) {
    const CJS = window.CompilerJS;
    if (!CJS) {
      termLog('CompilerJS not loaded.', 'err');
      return;
    }

    // Get main.c source
    const mainFile = VFS.read('main.c');
    if (!mainFile) { termLog('No main.c found.', 'err'); return; }
    const source = mainFile.content;

    // Ensure terminal is visible
    $('terminal-panel').classList.remove('collapsed');

    const term = $('terminal');
    term.innerHTML = '';
    termLog('[Build] Starting compilation…');

    const errors = [];
    const warnings = [];

    try {
      // ── Stage 1: Preprocess ──────────────────────────────────────
      const ppText = extractPreprocessed(CJS, source, errors);
      VFS.write('main.i', ppText, { language: 'c', readOnly: true, generated: true });
      termLog('[1/4] Preprocessed → main.i');

      // ── Stage 2: AST ─────────────────────────────────────────────
      const astText = extractAST(CJS, source, errors);
      VFS.write('main.ast', astText, { language: 'plaintext', readOnly: true, generated: true });
      termLog('[2/4] Parsed → main.ast');

      // ── Stage 3: Codegen ─────────────────────────────────────────
      const wasmInfo = extractWasm(CJS, source, errors, warnings);
      VFS.write('main.wat', wasmInfo.wastText, { language: 'plaintext', readOnly: true, generated: true });

      // Section summary
      let sectionSummary = '=== WASM Binary Sections ===\n\n';
      for (const sec of wasmInfo.sections) {
        sectionSummary += `Section ${sec.id} (${sec.name}): ${sec.length.toLocaleString()} bytes @ offset ${sec.offset}\n`;
      }
      sectionSummary += `\nTotal: ${wasmInfo.bytes.length.toLocaleString()} bytes, ${wasmInfo.sections.length} sections\n`;
      VFS.write('a.wasm.txt', sectionSummary, { language: 'plaintext', readOnly: true, generated: true });

      termLog(`[3/4] Codegen → main.wat (${wasmInfo.bytes.length} bytes WASM)`);

      // Show warnings
      for (const w of warnings) {
        termLog(`[Warning] ${w}`, 'warn');
      }

      // Update models for any already-open generated tabs
      for (const p of ['main.i', 'main.ast', 'main.wat', 'a.wasm.txt']) {
        Tabs.updateModel(p);
      }

      FileExplorer.render();

      // Open generated files as tabs
      Tabs.open('main.i');
      Tabs.open('main.ast');
      Tabs.open('main.wat');

      // Switch to main.c tab as primary
      Tabs.open('main.c');

      setBuildStatus('success', `Build OK — ${wasmInfo.bytes.length} bytes`);

      if (execute) {
        termLog('[4/4] Executing…');
        executeWasm(wasmInfo.bytes);
      } else {
        termLog('[Build] Done. Press ▶ Run to execute.');
        // Open the WAT tab to show build output
        Tabs.open('main.wat');
      }

    } catch (err) {
      for (const e of errors) termLog(`[Error] ${e}`, 'err');
      termLog(`[Error] ${err.message}`, 'err');
      setBuildStatus('error', 'Build failed');
    }
  }

  function setBuildStatus(type, text) {
    const el = $('status-build');
    if (type === 'success') {
      el.innerHTML = `<i class="codicon codicon-check"></i> ${esc(text)}`;
    } else if (type === 'error') {
      el.innerHTML = `<i class="codicon codicon-error"></i> ${esc(text)}`;
    } else {
      el.innerHTML = `<i class="codicon codicon-loading codicon-modifier-spin"></i> ${esc(text)}`;
    }
  }

  /* ── Terminal Helpers ───────────────────────────────────────────────── */
  function termLog(msg, type) {
    const term = $('terminal');
    const cls = type === 'err' ? 'term-err' : type === 'warn' ? 'term-warn' : type === 'out' ? 'term-out' : 'term-sys';
    term.innerHTML += `<div class="term-line ${cls}">${esc(msg)}</div>`;
    term.scrollTop = term.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════════
     PIPELINE STAGE EXTRACTORS
     ══════════════════════════════════════════════════════════════════════ */

  /* ── Stage 1: Preprocessor ─────────────────────────────────────────── */
  function extractPreprocessed(CJS, source, errors) {
    const pp = CJS.createDefaultPPRegistry();
    const result = CJS.tokenize(CJS.intern('main.c'), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors)
        errors.push(`${err.filename || 'main.c'}:${err.line}: ${err.message}`);
      return '// Preprocessing failed — see terminal for errors.';
    }

    const tokens = result.tokens;
    let out = '';
    let prevLine = -1;
    let prevFile = '';

    for (const t of tokens) {
      if (t.kind === CJS.TokenKind.EOS) continue;

      if (t.filename !== prevFile) {
        if (out.length > 0 && !out.endsWith('\n')) out += '\n';
        out += `# ${t.line} "${t.filename}"\n`;
        prevFile = t.filename;
        prevLine = t.line;
      } else if (t.line > prevLine) {
        const diff = t.line - prevLine;
        if (diff > 5) {
          out += `\n# ${t.line} "${t.filename}"\n`;
        } else {
          out += '\n'.repeat(diff);
        }
        prevLine = t.line;
      }

      if (t.flags && t.flags.hasSpace && !out.endsWith('\n') && !out.endsWith(' ')) {
        out += ' ';
      }
      out += t.text;
    }

    return out || '// Preprocessor produced no output.';
  }

  /* ── Stage 2: AST ──────────────────────────────────────────────────── */
  function extractAST(CJS, source, errors) {
    const pp = CJS.createDefaultPPRegistry();
    const result = CJS.parseSource(CJS.intern('main.c'), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors)
        errors.push(`${err.filename || 'main.c'}:${err.line}: ${err.message}`);
      return '// Parsing failed — see terminal for errors.';
    }

    const rawAst = CJS.dumpAst([result.translationUnit]);
    return formatAST(rawAst);
  }

  /* ── AST Tree Formatting ───────────────────────────────────────────── */
  function formatAST(rawAstText) {
    if (!rawAstText || typeof rawAstText !== 'string') return rawAstText;

    const lines = rawAstText.split('\n');
    const parsedNodes = [];
    let importedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const match = line.match(/^(\s*)(.*)/);
      const indent = match && match[1] ? match[1].length : 0;
      const depth = Math.floor(indent / 2);
      const content = match ? match[2] : line;

      if (content.includes('(import)') && depth === 1) {
        importedCount++;
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextMatch = nextLine.match(/^(\s*)/);
          const nextIndent = nextMatch && nextMatch[1] ? nextMatch[1].length : 0;
          if (Math.floor(nextIndent / 2) > depth) { i++; } else { break; }
        }
        continue;
      }

      parsedNodes.push({ depth, content });
    }

    if (parsedNodes.length === 0) return rawAstText;

    if (importedCount > 0) {
      parsedNodes.splice(1, 0, {
        depth: 1,
        content: `[${importedCount} stdlib imports collapsed]`,
      });
    }

    const out = [];
    for (let i = 0; i < parsedNodes.length; i++) {
      const node = parsedNodes[i];
      const depth = node.depth;
      let cleanContent = simplifyAstContent(node.content);

      if (depth === 0) { out.push('📦 ' + cleanContent); continue; }

      let isLast = true;
      for (let j = i + 1; j < parsedNodes.length; j++) {
        if (parsedNodes[j].depth === depth) { isLast = false; break; }
        if (parsedNodes[j].depth < depth) break;
      }

      let prefix = '';
      for (let d = 1; d < depth; d++) {
        let hasMore = false;
        for (let j = i + 1; j < parsedNodes.length; j++) {
          if (parsedNodes[j].depth === d) { hasMore = true; break; }
          if (parsedNodes[j].depth < d) break;
        }
        prefix += hasMore ? '│  ' : '   ';
      }
      out.push(prefix + (isLast ? '└─ ' : '├─ ') + cleanContent);
    }
    return out.join('\n');
  }

  function simplifyAstContent(raw) {
    let s = raw;
    s = s.replace(/\s*\$\d+/g, '');
    s = s.replace(/\s*\(def=\$\d+\)/g, '');
    s = s.replace(/\s*\(decl=\$\d+,\s*defn=\$\d+\)/g, '');
    s = s.replace(/\s*\(decl=\$\d+\)/g, '');

    if (s.startsWith('Translation Unit '))
      return 'TranslationUnit <' + s.substring(17).trim() + '>';
    if (s.startsWith('Decl DFunc'))
      return 'FunctionDecl ' + s.substring(s.indexOf('DFunc') + 5).trim();
    if (s.startsWith('Decl DVar'))
      return 'VarDecl ' + s.substring(s.indexOf('DVar') + 4).trim();
    if (s.endsWith(' parameters'))
      return 'Params(' + s.split(' ')[0] + ')';
    if (s.startsWith('Stmt SCompound:'))
      return 'CompoundStmt {' + s.substring(14).trim() + '}';
    if (s.startsWith('Stmt SExpr:')) return 'ExprStmt';
    if (s.startsWith('Stmt SReturn:')) return 'ReturnStmt';
    if (s.startsWith('Stmt SIf:')) return 'IfStmt';
    if (s.startsWith('Stmt SFor:')) return 'ForStmt';
    if (s.startsWith('Stmt SWhile:')) return 'WhileStmt';

    if (s.startsWith('Expr: Type=')) {
      const typeEnd = s.indexOf(' ', 11);
      const typeStr = typeEnd > -1 ? s.substring(11, typeEnd) : '';
      const rest = typeEnd > -1 ? s.substring(typeEnd + 1).trim() : s.substring(11);
      if (rest.startsWith('CALL ')) return 'CallExpr (' + rest.substring(5) + ') → ' + typeStr;
      if (rest.startsWith('IDENT ')) return 'Ident "' + rest.substring(6) + '" : ' + typeStr;
      if (rest.startsWith('STRING ')) return 'StringLit ' + rest.substring(7);
      if (rest.startsWith('INT ')) return 'IntLit ' + rest.substring(4);
      if (rest.startsWith('IMPLICIT_CAST ')) return 'ImplicitCast → ' + typeStr;
      if (rest.startsWith('DECAY ')) return 'Decay → ' + typeStr;
      return 'Expr ' + rest + ' : ' + typeStr;
    }

    return s;
  }

  /* ── Stages 3 & 4: WASM codegen ────────────────────────────────────── */
  function extractWasm(CJS, source, errors, warnings) {
    let bytes = null;
    let wastText = '';
    let sections = [];

    const fakeFs = {
      readFileSync: (path) => {
        if (path === 'main.c') return source;
        throw new Error('File not found: ' + path);
      }
    };

    const pp = CJS.createDefaultPPRegistry();
    const compileErrors = [];
    const writeErr = (s) => { compileErrors.push(s.replace(/\n$/, '')); };

    const compilerOptions = {
      allowImplicitFunctionDecl: true,
      allowEmptyParams: true,
    };

    try {
      const units = CJS.parseAllUnits(fakeFs, pp, ['main.c'], {
        warningFlags: { pointerDecay: false, circularDependency: false },
        compilerOptions,
        writeErr,
      });

      const linkResult = CJS.linkTranslationUnits(units, compilerOptions);
      if (linkResult.errors && linkResult.errors.length > 0) {
        for (const err of linkResult.errors) errors.push('Link: ' + err.message);
        return { bytes: new Uint8Array(0), wastText: ';; Linking failed', sections: [] };
      }

      bytes = CJS.generateCode(units, 'a.wasm', { compilerOptions });

    } catch (e) {
      if (e.compilationFailed && compileErrors.length > 0) {
        for (const msg of compileErrors) errors.push(msg);
      } else {
        errors.push(e.message);
      }
    }

    if (bytes && bytes.length > 0) {
      sections = parseWasmSections(bytes);
      wastText = generateWastSummary(sections, bytes);
    } else {
      bytes = new Uint8Array(0);
      wastText = wastText || ';; (no WASM bytes produced)';
    }

    return { bytes, wastText, sections };
  }

  /* ── WASM binary parser ────────────────────────────────────────────── */
  const SECTION_NAMES = {
    0:'Custom',1:'Type',2:'Import',3:'Function',4:'Table',5:'Memory',
    6:'Global',7:'Export',8:'Start',9:'Element',10:'Code',11:'Data',12:'DataCount',
  };

  function parseWasmSections(bytes) {
    const result = [];
    if (bytes.length < 8) return result;
    const magic = (bytes[0]<<24)|(bytes[1]<<16)|(bytes[2]<<8)|bytes[3];
    if (magic !== 0x0061736d) return result;
    let pos = 8;
    while (pos < bytes.length) {
      const id = bytes[pos++];
      let len = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      result.push({ id, name: SECTION_NAMES[id]||`Unknown(${id})`, offset: pos, length: len });
      pos += len;
    }
    return result;
  }

  function generateWastSummary(sections, bytes) {
    let out = ';; WebAssembly Module\n';
    out += `;; Size: ${bytes.length} bytes | Sections: ${sections.length}\n\n`;
    out += '(module\n';
    for (const sec of sections) {
      out += `  ;; Section ${sec.id}: ${sec.name} (${sec.length} bytes @ ${sec.offset})\n`;
      if (sec.id === 2) out += '  ;; (host imports: libc, memory)\n';
      if (sec.id === 5) out += '  (memory (export "memory") 2)\n';
      if (sec.id === 7) out += '  ;; (exports: _start/main, memory)\n';
      if (sec.id === 10) out += `  ;; (${sec.length} bytes of function bodies)\n`;
      if (sec.id === 11) out += `  ;; (${sec.length} bytes of data segments)\n`;
    }
    out += ')\n';
    return out;
  }

  /* ── Stage 5: Execute ──────────────────────────────────────────────── */
  function executeWasm(bytes) {
    if (!bytes || bytes.length === 0) {
      termLog('[Runtime] No WASM bytes to execute.', 'err');
      return;
    }

    const hostUrl = new URL('host.js', location.href).href;
    const workerCode = `
      importScripts('${hostUrl}');
      self.onmessage = async function(e) {
        if (e.data.type !== 'run') return;
        const bytes = new Uint8Array(e.data.bytes);
        const decoder = new TextDecoder();
        try {
          const store = new self.BLOCK_FS.MemoryByteStore(1024 * 1024);
          const blockFS = self.BLOCK_FS.create(store);
          try { blockFS.mkdir('/tmp', 511); } catch(err) {}
          const exitCode = await runModule({
            bytes: bytes,
            args: ['a.out'],
            blockFsFactory: async function(ctx) {
              return { c: blockFS.toWasmEnv(ctx) };
            },
            writeOut: function(buf) {
              const text = (buf instanceof Uint8Array) ? decoder.decode(buf) : String(buf);
              self.postMessage({ type: 'stdout', text: text });
            },
            writeErr: function(buf) {
              const text = (buf instanceof Uint8Array) ? decoder.decode(buf) : String(buf);
              self.postMessage({ type: 'stderr', text: text });
            },
          });
          self.postMessage({ type: 'exit', code: exitCode });
        } catch(err) {
          self.postMessage({ type: 'error', message: err.message });
        }
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'stdout') {
          m.text.split('\n').forEach((line, i, arr) => {
            if (line || i < arr.length - 1) termLog(line, 'out');
          });
        } else if (m.type === 'stderr') {
          termLog(m.text, 'err');
        } else if (m.type === 'exit') {
          termLog(`[Exit] Process exited with code ${m.code}`);
          worker.terminate();
          URL.revokeObjectURL(url);
        } else if (m.type === 'error') {
          termLog(`[Runtime Error] ${m.message}`, 'err');
          worker.terminate();
          URL.revokeObjectURL(url);
        }
      };

      worker.onerror = (e) => {
        termLog(`[Worker Error] ${e.message}`, 'err');
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      worker.postMessage({ type: 'run', bytes: buffer }, [buffer]);

    } catch (err) {
      termLog(`[Worker] ${err.message}`, 'err');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════════════ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
