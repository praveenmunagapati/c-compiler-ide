/**
 * C Compiler IDE — VS Code-inspired Application Logic
 *
 * Features:
 *   - Virtual File System (VFS) with create, edit, rename, delete
 *   - Responsive Monaco Editor with ResizeObserver layout tracking
 *   - Mobile-responsive sidebar drawer & keyboard shortcuts
 *   - C11 WebAssembly Compiler Pipeline (Preprocess, AST, WAT, WASM Execution)
 *   - Interactive Modal Prompts & Context Menus
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
      '#include <stdio.h>\n\ntypedef struct {\n    int x;\n    int y;\n} Point;\n\nPoint add(Point a, Point b) {\n    Point r = { a.x + b.x, a.y + b.y };\n    return r;\n}\n\nint main(void) {\n    Point p = add((Point){1, 2}, (Point){3, 4});\n    printf("Point sum: (%d, %d)\\n", p.x, p.y);\n    return 0;\n}\n'
    ],
  };

  /* ══════════════════════════════════════════════════════════════════════
     MODAL & CONTEXT MENU SYSTEM
     ══════════════════════════════════════════════════════════════════════ */
  const Modal = {
    show({ title, desc, placeholder, defaultValue, confirmText, isDanger, onConfirm }) {
      $('modal-title').textContent = title || 'Input';
      $('modal-desc').innerHTML = desc || '';
      const input = $('modal-input');
      input.placeholder = placeholder || '';
      input.value = defaultValue || '';

      const confirmBtn = $('btn-modal-confirm');
      confirmBtn.textContent = confirmText || 'Confirm';
      if (isDanger) {
        confirmBtn.style.background = 'var(--red)';
      } else {
        confirmBtn.style.background = 'var(--blue)';
      }

      $('modal-overlay').classList.remove('hidden');
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      const handleConfirm = () => {
        const val = input.value.trim();
        this.close();
        if (onConfirm) onConfirm(val);
      };

      confirmBtn.onclick = handleConfirm;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') this.close();
      };
      $('btn-modal-cancel').onclick = () => this.close();
      $('btn-modal-close').onclick = () => this.close();
    },
    close() {
      $('modal-overlay').classList.add('hidden');
    }
  };

  const ContextMenu = {
    _targetPath: null,
    show(x, y, path) {
      this._targetPath = path;
      const menu = $('context-menu');
      menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
      menu.classList.remove('hidden');

      const file = VFS.read(path);
      const isGen = file?.generated || file?.readOnly;
      $('ctx-rename').style.display = isGen ? 'none' : 'flex';
      $('ctx-delete').style.display = isGen ? 'none' : 'flex';
    },
    hide() {
      $('context-menu').classList.add('hidden');
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     VIRTUAL FILE SYSTEM (VFS)
     ══════════════════════════════════════════════════════════════════════ */
  const VFS = {
    _files: new Map(),

    write(path, content, opts = {}) {
      this._files.set(path, {
        content: content,
        language: opts.language || langFromExt(path),
        readOnly: opts.readOnly || false,
        generated: opts.generated || false,
      });
      FileExplorer.render();
    },

    read(path) {
      return this._files.get(path) || null;
    },

    exists(path) {
      return this._files.has(path);
    },

    remove(path) {
      if (!this._files.has(path)) return;
      this._files.delete(path);
      Tabs.close(path);
      FileExplorer.render();
    },

    rename(oldPath, newPath) {
      if (!oldPath || !newPath || oldPath === newPath) return;
      if (!this._files.has(oldPath)) return;
      const fileData = this._files.get(oldPath);
      this._files.delete(oldPath);
      fileData.language = langFromExt(newPath);
      this._files.set(newPath, fileData);

      Tabs.rename(oldPath, newPath);
      FileExplorer.render();
    },

    list() {
      return Array.from(this._files.keys()).sort((a, b) => {
        const aGen = this._files.get(a).generated ? 1 : 0;
        const bGen = this._files.get(b).generated ? 1 : 0;
        if (aGen !== bGen) return aGen - bGen;
        return a.localeCompare(b);
      });
    },

    clearGenerated() {
      for (const [path, file] of this._files) {
        if (file.generated) {
          this.remove(path);
        }
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
    _open: [],
    _active: null,
    _models: {},

    open(path) {
      if (!VFS.exists(path)) return;
      if (!this._open.includes(path)) {
        this._open.push(path);
      }
      this._active = path;
      this._ensureModel(path);
      this._render();
      this._showEditor(path);
      // Close mobile drawer if open
      closeMobileSidebar();
    },

    close(path) {
      const idx = this._open.indexOf(path);
      if (idx === -1) return;
      this._open.splice(idx, 1);
      if (this._active === path) {
        if (this._open.length > 0) {
          this._active = this._open[Math.min(idx, this._open.length - 1)];
          this._showEditor(this._active);
        } else {
          this._active = null;
          this._hideEditor();
        }
      }
      if (this._models[path]) {
        this._models[path].dispose();
        delete this._models[path];
      }
      this._render();
    },

    rename(oldPath, newPath) {
      const idx = this._open.indexOf(oldPath);
      if (idx !== -1) {
        this._open[idx] = newPath;
      }
      if (this._active === oldPath) {
        this._active = newPath;
      }
      if (this._models[oldPath]) {
        this._models[newPath] = this._models[oldPath];
        delete this._models[oldPath];
      }
      this._render();
      if (this._active === newPath) {
        this._showEditor(newPath);
      }
    },

    closeGenerated() {
      const gen = this._open.filter(p => VFS.read(p)?.generated);
      for (const p of gen) this.close(p);
    },

    getActive() { return this._active; },

    _ensureModel(path) {
      if (!window.monaco) return;
      const file = VFS.read(path);
      if (!file) return;
      const lang = file.language || 'plaintext';
      const uri = monaco.Uri.parse('vfs:///' + path);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(file.content, lang, uri);
      } else {
        if (model.getValue() !== file.content) {
          model.setValue(file.content);
        }
        monaco.editor.setModelLanguage(model, lang);
      }
      this._models[path] = model;
    },

    updateModel(path) {
      const file = VFS.read(path);
      if (!file) return;
      if (this._models[path]) {
        this._models[path].setValue(file.content);
      }
    },

    _showEditor(path) {
      if (!editor) return;
      this._ensureModel(path);
      if (!this._models[path]) return;
      const file = VFS.read(path);
      editor.setModel(this._models[path]);
      editor.updateOptions({ readOnly: file?.readOnly || false });
      $('monaco-editor').classList.add('visible');
      $('welcome-screen').classList.add('hidden');
      updateStatusBar();
      FileExplorer.render();
      setTimeout(() => { editor.layout(); }, 10);
    },

    _hideEditor() {
      $('monaco-editor').classList.remove('visible');
      $('welcome-screen').classList.remove('hidden');
      updateStatusBar();
      FileExplorer.render();
    },

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

        tab.addEventListener('click', (e) => {
          if (e.target.dataset.close !== undefined) return;
          this.open(path);
        });

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

        let actionButtons = '';
        if (!file.generated && !file.readOnly) {
          actionButtons =
            `<div class="file-actions">` +
              `<span class="file-action-icon btn-rename-file" title="Rename"><i class="codicon codicon-edit"></i></span>` +
              `<span class="file-action-icon danger btn-delete-file" title="Delete"><i class="codicon codicon-trash"></i></span>` +
            `</div>`;
        }

        item.innerHTML =
          `<i class="codicon ${ic.icon} file-icon ${ic.cls}"></i>` +
          `<span class="file-name">${esc(path)}</span>` +
          badge +
          actionButtons;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.file-actions')) return;
          Tabs.open(path);
        });

        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          ContextMenu.show(e.clientX, e.clientY, path);
        });

        const renameBtn = item.querySelector('.btn-rename-file');
        if (renameBtn) {
          renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renameFile(path);
          });
        }

        const deleteBtn = item.querySelector('.btn-delete-file');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFile(path);
          });
        }

        tree.appendChild(item);
      }
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     FILE ACTIONS (NEW, RENAME, DELETE)
     ══════════════════════════════════════════════════════════════════════ */
  function createNewFile() {
    Modal.show({
      title: 'Create New File',
      desc: 'Enter file name (e.g. <code>my_program.c</code> or <code>helpers.h</code>):',
      placeholder: 'untitled.c',
      defaultValue: 'my_program.c',
      confirmText: 'Create File',
      onConfirm: (name) => {
        if (!name) return;
        if (!name.includes('.')) name += '.c';
        if (VFS.exists(name)) {
          Tabs.open(name);
          return;
        }
        VFS.write(name, `// ${name}\n#include <stdio.h>\n\nint main(void) {\n    printf("Hello from ${name}!\\n");\n    return 0;\n}\n`, { language: langFromExt(name) });
        Tabs.open(name);
      }
    });
  }

  function renameFile(oldPath) {
    if (!VFS.exists(oldPath)) return;
    Modal.show({
      title: 'Rename File',
      desc: `Enter new name for <code>${esc(oldPath)}</code>:`,
      defaultValue: oldPath,
      confirmText: 'Rename',
      onConfirm: (newName) => {
        if (!newName || newName === oldPath) return;
        if (!newName.includes('.')) newName += '.c';
        VFS.rename(oldPath, newName);
      }
    });
  }

  function deleteFile(path) {
    if (!VFS.exists(path)) return;
    Modal.show({
      title: 'Delete File',
      desc: `Are you sure you want to delete <code>${esc(path)}</code>?`,
      confirmText: 'Delete File',
      isDanger: true,
      onConfirm: () => {
        VFS.remove(path);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     SIDEBAR TOGGLE & MOBILE DRAWER LOGIC
     ══════════════════════════════════════════════════════════════════════ */
  function toggleSidebar() {
    const sb = $('sidebar');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      sb.classList.toggle('mobile-open');
      const backdrop = $('sidebar-backdrop');
      if (backdrop) {
        if (sb.classList.contains('mobile-open')) {
          backdrop.classList.add('active');
        } else {
          backdrop.classList.remove('active');
        }
      }
    } else {
      sb.classList.toggle('collapsed');
    }
    setTimeout(() => { if (editor) editor.layout(); }, 200);
  }

  function closeMobileSidebar() {
    const sb = $('sidebar');
    const backdrop = $('sidebar-backdrop');
    if (sb) sb.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
  }

  /* ══════════════════════════════════════════════════════════════════════
     MONACO EDITOR BOOT & RESIZE OBSERVER
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
      monaco.editor.defineTheme('ide-slate-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword',  foreground: '60a5fa', fontStyle: 'bold' },
          { token: 'type',     foreground: '34d399' },
          { token: 'string',   foreground: 'fb923c' },
          { token: 'number',   foreground: 'f59e0b' },
          { token: 'comment',  foreground: '64748b', fontStyle: 'italic' },
        ],
        colors: {
          'editor.background':                '#090d16',
          'editor.lineHighlightBackground':   '#1e293b55',
          'editorLineNumber.foreground':       '#475569',
          'editorLineNumber.activeForeground': '#94a3b8',
        }
      });

      editor = monaco.editor.create($('monaco-editor'), {
        theme: 'ide-slate-dark',
        fontFamily: "'Fira Code', Consolas, monospace",
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 4,
        scrollBeyondLastLine: false,
        padding: { top: 10, bottom: 10 },
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
      });

      // Track cursor position for status bar
      editor.onDidChangeCursorPosition((e) => {
        $('status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });

      // Save editor changes to VFS
      editor.onDidChangeModelContent(() => {
        const path = Tabs.getActive();
        if (path && VFS.exists(path)) {
          const file = VFS.read(path);
          if (!file.readOnly) {
            file.content = editor.getValue();
          }
        }
      });

      // Shortcut: Ctrl+Enter -> Build & Run
      editor.addAction({
        id: 'run-program',
        label: 'Build & Run',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => runPipeline(true),
      });

      // ResizeObserver to ensure Monaco always fills container
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          if (editor) editor.layout();
        });
        ro.observe($('editor-area'));
      }

      // Open initial default file
      Tabs.open('main.c');
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     INIT & EVENT BINDINGS
     ══════════════════════════════════════════════════════════════════════ */
  window.addEventListener('DOMContentLoaded', () => {
    VFS.write('main.c', PRESETS.hello[1], { language: 'c' });

    populatePresets();
    bindEvents();
    FileExplorer.render();
    bootMonaco();
  });

  function populatePresets() {
    const sel = $('preset-select');
    sel.innerHTML = '';
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

    $('btn-toggle-sidebar').onclick = () => toggleSidebar();
    const backdrop = $('sidebar-backdrop');
    if (backdrop) backdrop.onclick = () => closeMobileSidebar();

    $('btn-build').onclick  = () => runPipeline(false);
    $('btn-run').onclick    = () => runPipeline(true);
    $('btn-new').onclick    = () => createNewFile();

    $('btn-sidebar-new').onclick   = () => createNewFile();
    $('btn-sidebar-clean').onclick = () => {
      Tabs.closeGenerated();
      VFS.clearGenerated();
    };

    $('btn-welcome-new').onclick    = () => createNewFile();
    $('btn-welcome-preset').onclick = () => Tabs.open('main.c');

    $('btn-clear-term').onclick = () => { $('terminal').innerHTML = ''; };
    $('btn-toggle-term').onclick = () => {
      $('terminal-panel').classList.toggle('collapsed');
      setTimeout(() => { if (editor) editor.layout(); }, 150);
    };

    // Context Menu Item Listeners
    $('ctx-open').onclick = () => {
      if (ContextMenu._targetPath) Tabs.open(ContextMenu._targetPath);
      ContextMenu.hide();
    };
    $('ctx-rename').onclick = () => {
      if (ContextMenu._targetPath) renameFile(ContextMenu._targetPath);
      ContextMenu.hide();
    };
    $('ctx-delete').onclick = () => {
      if (ContextMenu._targetPath) deleteFile(ContextMenu._targetPath);
      ContextMenu.hide();
    };

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#context-menu')) {
        ContextMenu.hide();
      }
    });

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
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      }
    });

    window.addEventListener('resize', () => {
      if (editor) editor.layout();
    });

    // Sidebar resize
    initResize($('sidebar-resize'), 'sidebar', 'horizontal');
    // Terminal resize
    initResize($('terminal-resize'), 'terminal-panel', 'vertical');
  }

  /* ── Resize Handles ─────────────────────────────────────────────────── */
  function initResize(handle, targetId, direction) {
    let startPos, startSize;
    const onMouseMove = (e) => {
      const el = $(targetId);
      if (direction === 'horizontal') {
        el.style.width = Math.max(160, startSize + (e.clientX - startPos)) + 'px';
      } else {
        el.style.height = Math.max(80, startSize - (e.clientY - startPos)) + 'px';
      }
      if (editor) editor.layout();
    };
    const onMouseUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (editor) editor.layout();
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
      $('status-file').innerHTML = `<i class="codicon ${fileIcon(path).icon}"></i> ${esc(path)}`;
      const file = VFS.read(path);
      $('status-lang').innerHTML = `<i class="codicon codicon-code"></i> ${(file?.language || 'plaintext').toUpperCase()}`;
    } else {
      $('status-file').textContent = '';
      $('status-lang').textContent = '';
      $('status-cursor').textContent = '';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     COMPILER PIPELINE (DYNAMIC MULTI-FILE & ACTIVE ENTRY POINT)
     ══════════════════════════════════════════════════════════════════════ */
  function runPipeline(execute) {
    const CJS = window.CompilerJS;
    if (!CJS) {
      termLog('CompilerJS engine not loaded.', 'err');
      return;
    }

    let entryPath = Tabs.getActive();
    if (!entryPath || !entryPath.endsWith('.c') || !VFS.exists(entryPath)) {
      if (VFS.exists('main.c')) {
        entryPath = 'main.c';
      } else {
        const cFiles = VFS.list().filter(p => p.endsWith('.c') && !VFS.read(p).generated);
        entryPath = cFiles.length > 0 ? cFiles[0] : null;
      }
    }

    if (!entryPath) {
      termLog('No C source file (.c) available to compile.', 'err');
      return;
    }

    const entryFile = VFS.read(entryPath);
    if (!entryFile) {
      termLog(`File ${entryPath} not found.`, 'err');
      return;
    }

    const source = entryFile.content;
    const baseName = entryPath.includes('.') ? entryPath.substring(0, entryPath.lastIndexOf('.')) : entryPath;

    $('terminal-panel').classList.remove('collapsed');

    const term = $('terminal');
    term.innerHTML = '';
    termLog(`[Build] Compiling target: ${entryPath}…`);

    const errors = [];
    const warnings = [];

    try {
      // ── Stage 1: Preprocess ──────────────────────────────────────
      const ppText = extractPreprocessed(CJS, entryPath, source, errors);
      const ppFile = baseName + '.i';
      VFS.write(ppFile, ppText, { language: 'c', readOnly: true, generated: true });
      termLog(`[1/4] Preprocessed → ${ppFile}`);

      // ── Stage 2: AST ─────────────────────────────────────────────
      const astText = extractAST(CJS, entryPath, source, errors);
      const astFile = baseName + '.ast';
      VFS.write(astFile, astText, { language: 'plaintext', readOnly: true, generated: true });
      termLog(`[2/4] Parsed AST → ${astFile}`);

      // ── Stage 3: WASM Codegen ────────────────────────────────────
      const wasmInfo = extractWasm(CJS, entryPath, source, errors, warnings);
      const watFile = baseName + '.wat';
      VFS.write(watFile, wasmInfo.wastText, { language: 'plaintext', readOnly: true, generated: true });

      // Section summary
      let sectionSummary = `=== WASM Binary Sections for ${entryPath} ===\n\n`;
      for (const sec of wasmInfo.sections) {
        sectionSummary += `Section ${sec.id} (${sec.name}): ${sec.length.toLocaleString()} bytes @ offset ${sec.offset}\n`;
      }
      sectionSummary += `\nTotal: ${wasmInfo.bytes.length.toLocaleString()} bytes, ${wasmInfo.sections.length} sections\n`;
      VFS.write('a.wasm.txt', sectionSummary, { language: 'plaintext', readOnly: true, generated: true });

      termLog(`[3/4] WASM Codegen → ${watFile} (${wasmInfo.bytes.length} bytes)`);

      for (const w of warnings) {
        termLog(`[Warning] ${w}`, 'warn');
      }

      for (const p of [ppFile, astFile, watFile, 'a.wasm.txt']) {
        Tabs.updateModel(p);
      }

      FileExplorer.render();

      Tabs.open(ppFile);
      Tabs.open(astFile);
      Tabs.open(watFile);

      Tabs.open(entryPath);

      setBuildStatus('success', `Build OK (${wasmInfo.bytes.length} B)`);

      if (execute) {
        termLog('[4/4] Executing WebAssembly module…');
        executeWasm(wasmInfo.bytes);
      } else {
        termLog('[Build] Done. Press ▶ Run to execute.');
        Tabs.open(watFile);
      }

    } catch (err) {
      for (const e of errors) termLog(`[Error] ${e}`, 'err');
      if (err.message) termLog(`[Error] ${err.message}`, 'err');
      setBuildStatus('error', 'Build failed');
    }
  }

  function setBuildStatus(type, text) {
    const el = $('status-build');
    if (type === 'success') {
      el.className = 'status-item status-badge-ok';
      el.innerHTML = `<i class="codicon codicon-check"></i> ${esc(text)}`;
    } else if (type === 'error') {
      el.className = 'status-item status-badge-err';
      el.innerHTML = `<i class="codicon codicon-error"></i> ${esc(text)}`;
    } else {
      el.className = 'status-item';
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

  function extractPreprocessed(CJS, filename, source, errors) {
    const pp = CJS.createDefaultPPRegistry();
    const result = CJS.tokenize(CJS.intern(filename), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors)
        errors.push(`${err.filename || filename}:${err.line}: ${err.message}`);
      return '// Preprocessing failed — see terminal for details.';
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

  function extractAST(CJS, filename, source, errors) {
    const pp = CJS.createDefaultPPRegistry();
    const result = CJS.parseSource(CJS.intern(filename), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors)
        errors.push(`${err.filename || filename}:${err.line}: ${err.message}`);
      return '// Parsing failed — see terminal for details.';
    }

    const rawAst = CJS.dumpAst([result.translationUnit]);
    return formatAST(rawAst);
  }

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

  function extractWasm(CJS, filename, source, errors, warnings) {
    let bytes = null;
    let wastText = '';
    let sections = [];

    const fakeFs = {
      readFileSync: (path) => {
        const cleanPath = path.replace(/^\/+/, '');
        const f = VFS.read(cleanPath) || VFS.read(path);
        if (f) return f.content;
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

    const allCFiles = VFS.list().filter(p => p.endsWith('.c') && !VFS.read(p).generated);
    const compileUnits = [filename].concat(allCFiles.filter(p => p !== filename));

    try {
      const units = CJS.parseAllUnits(fakeFs, pp, compileUnits, {
        warningFlags: { pointerDecay: false, circularDependency: false },
        compilerOptions,
        writeErr,
      });

      const linkResult = CJS.linkTranslationUnits(units, compilerOptions);
      if (linkResult.errors && linkResult.errors.length > 0) {
        for (const err of linkResult.errors) errors.push('Link Error: ' + err.message);
        return { bytes: new Uint8Array(0), wastText: ';; Linking failed', sections: [] };
      }

      bytes = CJS.generateCode(units, 'a.wasm', { compilerOptions });

    } catch (e) {
      if (e.compilationFailed && compileErrors.length > 0) {
        for (const msg of compileErrors) errors.push(msg);
      } else {
        errors.push(e.message || String(e));
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

  function executeWasm(bytes) {
    if (!bytes || bytes.length === 0) {
      termLog('[Runtime] No WASM binary available to execute.', 'err');
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
          termLog(`[Process Exited] Return code: ${m.code}`);
          worker.terminate();
          URL.revokeObjectURL(url);
        } else if (m.type === 'error') {
          termLog(`[Runtime Error] ${m.message}`, 'err');
          worker.terminate();
          URL.revokeObjectURL(url);
        }
      };

      worker.onerror = (e) => {
        termLog(`[Worker Exception] ${e.message}`, 'err');
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      worker.postMessage({ type: 'run', bytes: buffer }, [buffer]);

    } catch (err) {
      termLog(`[Worker Exception] ${err.message}`, 'err');
    }
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
