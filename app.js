/**
 * C Compiler IDE — Visual Studio Code Architecture & Application Logic
 *
 * Features:
 *   - VS Code Activity Bar & Multi-View Sidebar (Explorer, Stages, Search, SCM, Debug, Settings)
 *   - Clean Editor Tab Bar (Stage outputs stored in-memory in Stage Explorer)
 *   - Interactive C Debugger Engine (Monaco Gutter Breakpoints, Floating Toolbar, Stepping, Execution Pointer)
 *   - Live Variables Watcher, Call Stack Inspector, and Interactive Debug Console Evaluator
 *   - Command Palette & Quick Open Overlay (Ctrl+Shift+P / Ctrl+P / F1)
 *   - Global VFS Search & Replace Engine
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
      '#include <stdio.h>\n\n#define SQUARE(x) ((x) * (x))\n#define APP_NAME "C11 WASM IDE"\n\nint main(void) {\n    int v = 7;\n    printf("%s: %d^2 = %d\\n", APP_NAME, v, SQUARE(v));\n    return 0;\n}\n'
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
     MODAL SYSTEM
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
      confirmBtn.style.background = isDanger ? 'var(--vsc-red)' : 'var(--vsc-blue)';

      $('modal-overlay').classList.remove('hidden');
      setTimeout(() => { input.focus(); input.select(); }, 50);

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
      const isGen = file?.readOnly;
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
        dirty: opts.dirty || false,
      });
      FileExplorer.render();
      SCM.updateStatus();
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
      SCM.updateStatus();
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
      SCM.updateStatus();
    },

    list() {
      return Array.from(this._files.keys()).sort((a, b) => a.localeCompare(b));
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
     COMPILATION STAGES OUTPUT STORE (Clean Tab Isolation)
     ══════════════════════════════════════════════════════════════════════ */
  const CompilationOutputs = {
    pp: '// Preprocessed C output will appear here after building.',
    ast: '// AST tree output will appear here after building.',
    wat: ';; WebAssembly Text Format will appear here after building.',
    sec: '=== WASM Sections Summary ===\n\nNo build executed yet.',
    _activeStage: 'pp',

    set(pp, ast, wat, sec) {
      this.pp = pp || '// No preprocessed output';
      this.ast = ast || '// No AST output';
      this.wat = wat || ';; No WAT output';
      this.sec = sec || '=== WASM Sections ===\nNone';
      this.render();
    },

    selectStage(stageKey) {
      this._activeStage = stageKey;
      document.querySelectorAll('.stage-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stage === stageKey);
      });
      this.render();
    },

    render() {
      const titles = {
        pp: 'Preprocessed Source (.i)',
        ast: 'Abstract Syntax Tree (.ast)',
        wat: 'WASM Text Format (.wat)',
        sec: 'WASM Binary Sections'
      };
      const titleEl = $('stage-viewer-title');
      const contentEl = $('stage-viewer-content');
      if (titleEl) titleEl.textContent = titles[this._activeStage] || 'Stage Viewer';
      if (contentEl) contentEl.textContent = this[this._activeStage] || '';
    }
  };

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

    getActive() { return this._active; },
    getOpen() { return this._open; },

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

    markDirty(path, isDirty) {
      const file = VFS.read(path);
      if (file) {
        file.dirty = isDirty;
        this._render();
      }
    },

    saveActive() {
      const path = this.getActive();
      if (!path) return;
      const file = VFS.read(path);
      if (file && !file.readOnly) {
        file.dirty = false;
        this._render();
        SCM.updateStatus();
        setBuildStatus('success', `Saved ${path}`);
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
      updateBreadcrumbs(path);
      updateStatusBar();
      FileExplorer.render();
      Debugger.refreshBreakpointsDecoration();
      setTimeout(() => { editor.layout(); }, 10);
    },

    _hideEditor() {
      $('monaco-editor').classList.remove('visible');
      $('welcome-screen').classList.remove('hidden');
      updateBreadcrumbs(null);
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

        const dirtyBadge = file?.dirty ? '<span class="tab-dirty-dot" title="Unsaved changes"></span>' : '';
        const closeIcon = `<span class="tab-close codicon codicon-close" data-close="${esc(path)}"></span>`;

        tab.innerHTML =
          `<i class="codicon ${ic.icon} tab-icon ${ic.cls}"></i>` +
          `<span class="tab-label">${esc(path)}</span>` +
          dirtyBadge +
          closeIcon;

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

      this._renderOpenEditorsSection();
    },

    _renderOpenEditorsSection() {
      const list = $('list-open-editors');
      if (!list) return;
      list.innerHTML = '';
      for (const path of this._open) {
        const file = VFS.read(path);
        const ic = fileIcon(path);
        const item = document.createElement('div');
        item.className = 'file-tree-item' + (path === this._active ? ' active' : '');
        item.innerHTML =
          `<i class="codicon ${ic.icon} file-icon ${ic.cls}"></i>` +
          `<span class="file-name">${esc(path)}</span>` +
          (file?.dirty ? '<span class="tab-dirty-dot"></span>' : '');

        item.onclick = () => this.open(path);
        list.appendChild(item);
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     FILE EXPLORER
     ══════════════════════════════════════════════════════════════════════ */
  const FileExplorer = {
    render() {
      const tree = $('file-tree');
      if (!tree) return;
      tree.innerHTML = '';
      const files = VFS.list();

      for (const path of files) {
        const file = VFS.read(path);
        const ic = fileIcon(path);
        const item = document.createElement('div');
        item.className = 'file-tree-item' + (path === Tabs.getActive() ? ' active' : '');
        item.dataset.path = path;

        let actionButtons = '';
        if (!file.readOnly) {
          actionButtons =
            `<div class="file-actions">` +
              `<span class="file-action-icon btn-rename-file" title="Rename"><i class="codicon codicon-edit"></i></span>` +
              `<span class="file-action-icon danger btn-delete-file" title="Delete"><i class="codicon codicon-trash"></i></span>` +
            `</div>`;
        }

        item.innerHTML =
          `<i class="codicon ${ic.icon} file-icon ${ic.cls}"></i>` +
          `<span class="file-name">${esc(path)}</span>` +
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
     INTERACTIVE C DEBUGGER ENGINE
     ══════════════════════════════════════════════════════════════════════ */
  const Debugger = {
    active: false,
    paused: false,
    currentLine: 1,
    breakpoints: new Set(),
    variables: new Map(),
    executableLines: [],
    _breakpointDecorations: [],
    _executionDecorations: [],

    init() {
      // Stage Navigation Buttons
      document.querySelectorAll('.stage-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          CompilationOutputs.selectStage(btn.dataset.stage);
        });
      });

      const copyBtn = $('btn-stage-copy');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const content = CompilationOutputs[CompilationOutputs._activeStage];
          if (navigator.clipboard) {
            navigator.clipboard.writeText(content);
            setBuildStatus('success', 'Copied stage output to clipboard');
          }
        };
      }

      // Debug Action Buttons
      $('btn-debug-header').onclick = () => this.start();
      $('btn-debug-start').onclick  = () => this.start();

      $('btn-dbg-continue').onclick  = () => this.continue();
      $('btn-dbg-step-over').onclick = () => this.stepOver();
      $('btn-dbg-step-into').onclick = () => this.stepInto();
      $('btn-dbg-step-out').onclick  = () => this.stepOut();
      $('btn-dbg-restart').onclick   = () => this.start();
      $('btn-dbg-stop').onclick      = () => this.stop();

      // Debug Console Input
      const dbgInput = $('debug-console-input');
      if (dbgInput) {
        dbgInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const expr = dbgInput.value.trim();
            if (expr) {
              this.evaluateExpression(expr);
              dbgInput.value = '';
            }
          }
        });
      }
    },

    toggleBreakpoint(line) {
      if (this.breakpoints.has(line)) {
        this.breakpoints.delete(line);
      } else {
        this.breakpoints.add(line);
      }
      this.refreshBreakpointsDecoration();
      this.renderBreakpointsList();
    },

    refreshBreakpointsDecoration() {
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;

      const newDecorations = Array.from(this.breakpoints).map(line => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'debug-breakpoint-glyph',
          glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` }
        }
      }));

      this._breakpointDecorations = editor.deltaDecorations(this._breakpointDecorations, newDecorations);
    },

    renderBreakpointsList() {
      const container = $('debug-breakpoints-list');
      if (!container) return;
      container.innerHTML = '';
      if (this.breakpoints.size === 0) {
        container.innerHTML = `<div class="dim font-11 padding-6">No breakpoints set. Click the editor gutter to set breakpoints.</div>`;
        return;
      }
      const activePath = Tabs.getActive() || 'main.c';
      Array.from(this.breakpoints).sort((a,b)=>a-b).forEach(line => {
        const item = document.createElement('div');
        item.className = 'file-tree-item';
        item.innerHTML =
          `<i class="codicon codicon-debug-breakpoint problem-icon-err"></i>` +
          `<span class="file-name">${esc(activePath)}:${line}</span>`;
        item.onclick = () => {
          if (editor) editor.revealLineInCenter(line);
        };
        container.appendChild(item);
      });
    },

    start() {
      const activePath = Tabs.getActive();
      if (!activePath || !VFS.exists(activePath)) {
        termLog('Open a C source file to start debugging.', 'err');
        return;
      }

      const file = VFS.read(activePath);
      const lines = file.content.split('\n');

      // Find executable statement lines (ignoring empty lines, comments, includes)
      this.executableLines = [];
      lines.forEach((l, i) => {
        const trimmed = l.trim();
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('#')) {
          this.executableLines.push(i + 1);
        }
      });

      if (this.executableLines.length === 0) {
        termLog('No executable lines found in active file.', 'err');
        return;
      }

      this.active = true;
      this.paused = true;
      this.variables.clear();

      // Find first breakpoint or start at first statement line
      const firstBp = Array.from(this.breakpoints).sort((a,b)=>a-b).find(l => this.executableLines.includes(l));
      this.currentLine = firstBp || this.executableLines[0];

      $('debug-floating-bar').classList.remove('hidden');
      ActivityBar.switchView('debug');
      PanelController.switchPanel('debug');

      debugLog(`[Debugger Started] Paused at line ${this.currentLine} in ${activePath}.`);
      this.highlightExecutionLine();
      this.simulateLineExecution(this.currentLine);
      this.renderVariables();
    },

    stop() {
      this.active = false;
      this.paused = false;
      $('debug-floating-bar').classList.add('hidden');
      if (editor) {
        this._executionDecorations = editor.deltaDecorations(this._executionDecorations, []);
      }
      debugLog('[Debugger Stopped]');
    },

    continue() {
      if (!this.active) return;
      // Find next line with a breakpoint
      const sortedBps = Array.from(this.breakpoints).sort((a,b)=>a-b);
      const nextBp = sortedBps.find(l => l > this.currentLine);

      if (nextBp) {
        // Step to next breakpoint
        this.currentLine = nextBp;
        this.highlightExecutionLine();
        this.simulateLineExecution(this.currentLine);
        this.renderVariables();
        debugLog(`[Paused] Breakpoint hit at line ${this.currentLine}.`);
      } else {
        // Finish program execution
        termLog('[Debugger] Executed to end of program.');
        debugLog('[Debugger] Execution completed successfully.');
        this.stop();
        runPipeline(true);
      }
    },

    stepOver() {
      if (!this.active) return;
      const idx = this.executableLines.indexOf(this.currentLine);
      if (idx !== -1 && idx < this.executableLines.length - 1) {
        this.currentLine = this.executableLines[idx + 1];
        this.highlightExecutionLine();
        this.simulateLineExecution(this.currentLine);
        this.renderVariables();
        debugLog(`Step Over → Line ${this.currentLine}`);
      } else {
        debugLog('[Debugger] Reached end of function main().');
        this.stop();
      }
    },

    stepInto() {
      this.stepOver();
    },

    stepOut() {
      this.stop();
    },

    highlightExecutionLine() {
      if (!editor) return;
      editor.revealLineInCenter(this.currentLine);
      this._executionDecorations = editor.deltaDecorations(this._executionDecorations, [
        {
          range: new monaco.Range(this.currentLine, 1, this.currentLine, 100),
          options: {
            isWholeLine: true,
            className: 'debug-active-execution-line',
            glyphMarginClassName: 'debug-active-glyph'
          }
        }
      ]);
    },

    simulateLineExecution(lineNum) {
      const activePath = Tabs.getActive();
      if (!activePath) return;
      const file = VFS.read(activePath);
      if (!file) return;

      const lines = file.content.split('\n');
      const lineText = lines[lineNum - 1] ? lines[lineNum - 1].trim() : '';

      // Parse simple int variable declarations: int v = 7; or sum = 0;
      const varDeclMatch = lineText.match(/(?:int|float|double|char\*?)\s+([a-zA-Z_]\w*)\s*=\s*(.+);/);
      if (varDeclMatch) {
        const varName = varDeclMatch[1];
        const valExpr = varDeclMatch[2];
        try {
          // evaluate primitive number / string
          const evalVal = Function(`"use strict"; return (${valExpr.replace(/(\w+)/g, (m) => this.variables.has(m) ? this.variables.get(m).value : m)});`)();
          this.variables.set(varName, { type: 'int', value: evalVal });
        } catch(e) {
          this.variables.set(varName, { type: 'int', value: valExpr });
        }
      }

      // Parse assignment: sum += i; or sum = sum + i;
      const assignMatch = lineText.match(/([a-zA-Z_]\w*)\s*(\+=|\*=|-=|=)\s*(.+);/);
      if (assignMatch && !lineText.startsWith('int') && !lineText.startsWith('for')) {
        const varName = assignMatch[1];
        const op = assignMatch[2];
        const expr = assignMatch[3];
        let curr = this.variables.get(varName)?.value || 0;
        if (op === '+=') curr += (parseInt(expr, 10) || 1);
        else if (op === '=') curr = parseInt(expr, 10) || 0;
        this.variables.set(varName, { type: 'int', value: curr });
      }
    },

    renderVariables() {
      const container = $('debug-variables-tree');
      if (!container) return;
      container.innerHTML = '';

      if (this.variables.size === 0) {
        container.innerHTML = `<div class="dim font-11 padding-6">No local variables in frame scope.</div>`;
        return;
      }

      for (const [key, info] of this.variables) {
        const row = document.createElement('div');
        row.className = 'debug-var-row';
        row.innerHTML =
          `<div><span class="var-name">${esc(key)}</span> <span class="var-type">${esc(info.type)}</span></div>` +
          `<span class="var-val">${esc(info.value)}</span>`;
        container.appendChild(row);
      }
    },

    evaluateExpression(expr) {
      if (this.variables.has(expr)) {
        const v = this.variables.get(expr);
        debugLog(`> ${expr} = ${v.value} (${v.type})`);
      } else {
        try {
          const evalFn = new Function(...Array.from(this.variables.keys()), `"use strict"; return (${expr});`);
          const res = evalFn(...Array.from(this.variables.values()).map(v => v.value));
          debugLog(`> ${expr} = ${res}`);
        } catch (err) {
          debugLog(`> ${expr} → Evaluation error: ${err.message}`);
        }
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     ACTIVITY BAR & SIDEBAR CONTROLLER
     ══════════════════════════════════════════════════════════════════════ */
  const ActivityBar = {
    _activeView: 'explorer',

    init() {
      const items = document.querySelectorAll('.activity-item[data-view]');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const view = item.dataset.view;
          this.switchView(view);
        });
      });
    },

    switchView(viewName) {
      const sb = $('sidebar');
      const isMobile = window.innerWidth <= 768;

      if (this._activeView === viewName && !sb.classList.contains('collapsed')) {
        sb.classList.add('collapsed');
      } else {
        sb.classList.remove('collapsed');

        document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('active'));
        const activeBtn = $(`act-${viewName}`);
        if (activeBtn) activeBtn.classList.add('active');

        document.querySelectorAll('.sidebar-view').forEach(el => el.classList.remove('active'));
        const targetView = $(`view-${viewName}`);
        if (targetView) targetView.classList.add('active');

        this._activeView = viewName;
      }

      if (isMobile) {
        const backdrop = $('sidebar-backdrop');
        if (backdrop) backdrop.classList.toggle('active', !sb.classList.contains('collapsed'));
      }

      setTimeout(() => { if (editor) editor.layout(); }, 150);
    }
  };

  function closeMobileSidebar() {
    const sb = $('sidebar');
    const backdrop = $('sidebar-backdrop');
    if (sb && window.innerWidth <= 768) sb.classList.add('collapsed');
    if (backdrop) backdrop.classList.remove('active');
  }

  /* ══════════════════════════════════════════════════════════════════════
     GLOBAL VFS SEARCH ENGINE
     ══════════════════════════════════════════════════════════════════════ */
  const SearchEngine = {
    init() {
      const input = $('search-input');
      if (input) {
        input.addEventListener('input', () => this.performSearch());
      }
    },

    performSearch() {
      const query = $('search-input').value.trim();
      const header = $('search-results-header');
      const container = $('search-results-tree');
      container.innerHTML = '';

      if (!query) {
        header.textContent = 'Type to search across workspace files';
        return;
      }

      let totalMatches = 0;
      const files = VFS.list();

      for (const path of files) {
        const file = VFS.read(path);
        if (!file) continue;
        const lines = file.content.split('\n');
        const fileMatches = [];

        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            fileMatches.push({ lineNum: index + 1, text: line.trim() });
          }
        });

        if (fileMatches.length > 0) {
          totalMatches += fileMatches.length;

          const group = document.createElement('div');
          group.className = 'search-file-group';
          const ic = fileIcon(path);

          group.innerHTML =
            `<div class="sidebar-section-header">` +
              `<i class="codicon ${ic.icon} ${ic.cls}"></i>` +
              `<span>${esc(path)}</span>` +
              `<span class="badge">${fileMatches.length}</span>` +
            `</div>`;

          const list = document.createElement('div');
          list.className = 'search-match-list';

          for (const match of fileMatches) {
            const item = document.createElement('div');
            item.className = 'file-tree-item';
            item.innerHTML = `<span class="problem-location">${match.lineNum}:</span> <span>${esc(match.text)}</span>`;
            item.onclick = () => {
              Tabs.open(path);
              if (editor) editor.revealLineInCenter(match.lineNum);
            };
            list.appendChild(item);
          }

          group.appendChild(list);
          container.appendChild(group);
        }
      }

      header.textContent = `${totalMatches} result${totalMatches === 1 ? '' : 's'} in ${container.children.length} file${container.children.length === 1 ? '' : 's'}`;
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     SOURCE CONTROL SIMULATION (SCM)
     ══════════════════════════════════════════════════════════════════════ */
  const SCM = {
    updateStatus() {
      const list = $('scm-changes-list');
      const badge = $('scm-badge');
      const count = $('scm-changes-count');
      if (!list) return;

      list.innerHTML = '';
      const files = VFS.list();

      for (const path of files) {
        const file = VFS.read(path);
        const ic = fileIcon(path);
        const item = document.createElement('div');
        item.className = 'file-tree-item';
        item.innerHTML =
          `<i class="codicon ${ic.icon} ${ic.cls}"></i>` +
          `<span class="file-name">${esc(path)}</span>` +
          `<span class="file-badge" style="color:var(--vsc-amber)">M</span>`;
        item.onclick = () => Tabs.open(path);
        list.appendChild(item);
      }

      const num = files.length;
      if (badge) badge.textContent = num;
      if (count) count.textContent = num;
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     COMMAND PALETTE & QUICK OPEN OVERLAY
     ══════════════════════════════════════════════════════════════════════ */
  const CommandPalette = {
    _mode: 'commands',
    _selectedIndex: 0,
    _items: [],

    init() {
      const input = $('palette-input');
      if (input) {
        input.addEventListener('input', () => this._renderResults());
        input.addEventListener('keydown', (e) => this._onKeyDown(e));
      }
      const overlay = $('command-palette-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.close();
        });
      }
      const btn = $('btn-quick-palette');
      if (btn) {
        btn.onclick = () => this.show('files');
      }
    },

    show(mode = 'commands') {
      this._mode = mode;
      this._selectedIndex = 0;
      const overlay = $('command-palette-overlay');
      const prefix = $('palette-prefix');
      const input = $('palette-input');

      prefix.textContent = mode === 'commands' ? '>' : '';
      input.placeholder = mode === 'commands' ? 'Type a command to run...' : 'Search files by name...';
      input.value = '';

      overlay.classList.remove('hidden');
      setTimeout(() => input.focus(), 50);
      this._buildItems();
      this._renderResults();
    },

    close() {
      $('command-palette-overlay').classList.add('hidden');
    },

    _buildItems() {
      if (this._mode === 'commands') {
        this._items = [
          { label: 'Start Debugging (F5)', shortcut: 'F5', action: () => Debugger.start() },
          { label: 'Run C Program (Build & Execute)', shortcut: 'Ctrl+Enter', action: () => runPipeline(true) },
          { label: 'Build Target to WebAssembly AST & WASM', shortcut: '', action: () => runPipeline(false) },
          { label: 'Create New File', shortcut: 'Ctrl+N', action: () => createNewFile() },
          { label: 'Save Active File', shortcut: 'Ctrl+S', action: () => Tabs.saveActive() },
          { label: 'Toggle Primary Sidebar', shortcut: 'Ctrl+B', action: () => ActivityBar.switchView(ActivityBar._activeView) },
          { label: 'Toggle Integrated Terminal Panel', shortcut: 'Ctrl+`', action: () => toggleTerminal() },
          { label: 'Switch View: Compilation Stages Explorer', shortcut: '', action: () => ActivityBar.switchView('stages') },
          { label: 'Switch View: File Explorer', shortcut: 'Ctrl+Shift+E', action: () => ActivityBar.switchView('explorer') },
          { label: 'Switch View: Global Search', shortcut: 'Ctrl+Shift+F', action: () => ActivityBar.switchView('search') },
          { label: 'Switch View: Source Control (Git)', shortcut: 'Ctrl+Shift+G', action: () => ActivityBar.switchView('scm') },
          { label: 'Switch View: Run and Debug', shortcut: 'Ctrl+Shift+D', action: () => ActivityBar.switchView('debug') },
          { label: 'Switch View: IDE Settings', shortcut: '', action: () => ActivityBar.switchView('settings') },
          { label: 'Clear Terminal Output', shortcut: '', action: () => $('terminal').innerHTML = '' },
        ];
      } else {
        this._items = VFS.list().map(path => ({
          label: path,
          shortcut: fileIcon(path).cls,
          action: () => Tabs.open(path)
        }));
      }
    },

    _renderResults() {
      const query = $('palette-input').value.trim().toLowerCase();
      const results = $('palette-results');
      results.innerHTML = '';

      const filtered = this._items.filter(item => item.label.toLowerCase().includes(query));
      this._filteredItems = filtered;

      if (filtered.length === 0) {
        results.innerHTML = `<div class="palette-item"><span class="dim">No matching results</span></div>`;
        return;
      }

      this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, filtered.length - 1));

      filtered.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'palette-item' + (index === this._selectedIndex ? ' active' : '');
        row.innerHTML =
          `<div class="palette-item-left">` +
            `<i class="codicon ${this._mode === 'commands' ? 'codicon-terminal' : fileIcon(item.label).icon}"></i>` +
            `<span>${esc(item.label)}</span>` +
          `</div>` +
          `<span class="palette-item-shortcut">${esc(item.shortcut)}</span>`;

        row.onclick = () => {
          this.close();
          item.action();
        };

        results.appendChild(row);
      });
    },

    _onKeyDown(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._selectedIndex = (this._selectedIndex + 1) % (this._filteredItems?.length || 1);
        this._renderResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._selectedIndex = (this._selectedIndex - 1 + (this._filteredItems?.length || 1)) % (this._filteredItems?.length || 1);
        this._renderResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this._filteredItems && this._filteredItems[this._selectedIndex]) {
          const item = this._filteredItems[this._selectedIndex];
          this.close();
          item.action();
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     BOTTOM PANEL TABS CONTROLLER (PROBLEMS, OUTPUT, DEBUG, TERMINAL)
     ══════════════════════════════════════════════════════════════════════ */
  const PanelController = {
    _activePanel: 'terminal',

    init() {
      const tabs = document.querySelectorAll('.terminal-tab[data-panel]');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          this.switchPanel(tab.dataset.panel);
        });
      });

      $('btn-close-term').onclick = () => toggleTerminal(true);
    },

    switchPanel(panelName) {
      document.querySelectorAll('.terminal-tab').forEach(el => el.classList.remove('active'));
      const activeTab = $(`ptab-${panelName}`);
      if (activeTab) activeTab.classList.add('active');

      document.querySelectorAll('.panel-body-content').forEach(el => el.classList.add('hidden'));
      const targetBody = $(`pbody-${panelName}`);
      if (targetBody) targetBody.classList.remove('hidden');

      this._activePanel = panelName;

      const panel = $('terminal-panel');
      if (panel.classList.contains('collapsed')) {
        toggleTerminal();
      }
    }
  };

  function toggleTerminal(forceCollapse = false) {
    const panel = $('terminal-panel');
    const icon = $('term-toggle-icon');
    if (forceCollapse) {
      panel.classList.add('collapsed');
    } else {
      panel.classList.toggle('collapsed');
    }
    if (icon) {
      icon.className = panel.classList.contains('collapsed') ? 'codicon codicon-chevron-up' : 'codicon codicon-chevron-down';
    }
    setTimeout(() => { if (editor) editor.layout(); }, 150);
  }

  /* ══════════════════════════════════════════════════════════════════════
     SETTINGS & THEME CONTROLLER
     ══════════════════════════════════════════════════════════════════════ */
  const SettingsController = {
    init() {
      const themeSelect = $('setting-theme');
      if (themeSelect) {
        themeSelect.onchange = (e) => {
          document.body.className = e.target.value;
        };
      }

      const fontInput = $('setting-font-size');
      if (fontInput) {
        fontInput.onchange = (e) => {
          const val = parseInt(e.target.value, 10) || 14;
          if (editor) editor.updateOptions({ fontSize: val });
        };
      }

      const tabSelect = $('setting-tab-size');
      if (tabSelect) {
        tabSelect.onchange = (e) => {
          const val = parseInt(e.target.value, 10) || 4;
          if (editor) editor.updateOptions({ tabSize: val });
          $('status-spaces').textContent = `Spaces: ${val}`;
        };
      }

      const minimapCheckbox = $('setting-minimap');
      if (minimapCheckbox) {
        minimapCheckbox.onchange = (e) => {
          if (editor) editor.updateOptions({ minimap: { enabled: e.target.checked } });
        };
      }

      const wrapCheckbox = $('setting-word-wrap');
      if (wrapCheckbox) {
        wrapCheckbox.onchange = (e) => {
          if (editor) editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' });
        };
      }
    }
  };

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
        wordWrap: 'on',
        glyphMargin: true,
      });

      editor.onMouseDown((e) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const line = e.target.position.lineNumber;
          Debugger.toggleBreakpoint(line);
        }
      });

      editor.onDidChangeCursorPosition((e) => {
        $('status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });

      editor.onDidChangeModelContent(() => {
        const path = Tabs.getActive();
        if (path && VFS.exists(path)) {
          const file = VFS.read(path);
          if (!file.readOnly) {
            file.content = editor.getValue();
            Tabs.markDirty(path, true);
          }
        }
      });

      editor.addAction({
        id: 'start-debug',
        label: 'Start Debugging',
        keybindings: [monaco.KeyCode.F5],
        run: () => Debugger.start(),
      });

      editor.addAction({
        id: 'run-program',
        label: 'Build & Run Program',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => runPipeline(true),
      });

      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => Tabs.saveActive(),
      });

      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          if (editor) editor.layout();
        });
        ro.observe($('editor-area'));
      }

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
    ActivityBar.init();
    CommandPalette.init();
    PanelController.init();
    SearchEngine.init();
    SettingsController.init();
    Debugger.init();
    FileExplorer.render();
    SCM.updateStatus();
    bootMonaco();
  });

  function populatePresets() {
    const sel = $('preset-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const [key, [label]] of Object.entries(PRESETS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  function bindEvents() {
    const presetSelect = $('preset-select');
    if (presetSelect) {
      presetSelect.onchange = (e) => {
        const p = PRESETS[e.target.value];
        if (p) {
          VFS.write('main.c', p[1], { language: 'c' });
          Tabs.updateModel('main.c');
          Tabs.open('main.c');
        }
      };
    }

    // Header Buttons
    $('btn-toggle-sidebar').onclick = () => ActivityBar.switchView(ActivityBar._activeView);
    $('btn-toggle-panel').onclick   = () => toggleTerminal();

    const backdrop = $('sidebar-backdrop');
    if (backdrop) backdrop.onclick = () => closeMobileSidebar();

    const headerOpenEditors = $('header-open-editors');
    if (headerOpenEditors) {
      headerOpenEditors.onclick = () => {
        $('list-open-editors').classList.toggle('collapsed');
      };
    }

    const headerProjectFiles = $('header-project-files');
    if (headerProjectFiles) {
      headerProjectFiles.onclick = () => {
        $('file-tree').classList.toggle('collapsed');
      };
    }

    $('btn-build').onclick  = () => runPipeline(false);
    $('btn-run').onclick    = () => runPipeline(true);
    $('btn-sidebar-new').onclick   = () => createNewFile();
    $('btn-sidebar-clean').onclick = () => {
      // Clear non-active files
      const active = Tabs.getActive();
      VFS.list().forEach(p => { if (p !== active) VFS.remove(p); });
    };

    $('btn-welcome-new').onclick     = () => createNewFile();
    $('btn-welcome-palette').onclick = () => CommandPalette.show('commands');

    $('btn-clear-term').onclick = (e) => {
      e.stopPropagation();
      $('terminal').innerHTML = '';
      $('output-log').innerHTML = '';
      $('debug-log').innerHTML = '';
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

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (e.key === 'F5') {
        e.preventDefault();
        if (!Debugger.active) Debugger.start();
        else Debugger.continue();
      } else if (e.key === 'F10') {
        e.preventDefault();
        Debugger.stepOver();
      } else if (e.key === 'F11') {
        e.preventDefault();
        Debugger.stepInto();
      } else if (isCmdOrCtrl && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        CommandPalette.show('commands');
      } else if (e.key === 'F1') {
        e.preventDefault();
        CommandPalette.show('commands');
      } else if (isCmdOrCtrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        CommandPalette.show('files');
      } else if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        runPipeline(true);
      } else if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        Tabs.saveActive();
      } else if (isCmdOrCtrl && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        createNewFile();
      } else if (isCmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        ActivityBar.switchView(ActivityBar._activeView);
      } else if (isCmdOrCtrl && (e.key === '`' || e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        toggleTerminal();
      }
    });

    window.addEventListener('resize', () => {
      if (editor) editor.layout();
    });

    initResize($('sidebar-resize'), 'sidebar', 'horizontal');
    initResize($('terminal-resize'), 'terminal-panel', 'vertical');
  }

  /* ── Resize Handles ─────────────────────────────────────────────────── */
  function initResize(handle, targetId, direction) {
    if (!handle) return;
    let startPos, startSize;
    const onMouseMove = (e) => {
      const el = $(targetId);
      if (direction === 'horizontal') {
        el.style.width = Math.max(160, startSize + (e.clientX - startPos)) + 'px';
      } else {
        el.style.height = Math.max(34, startSize - (e.clientY - startPos)) + 'px';
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

  /* ── Breadcrumbs & Status Bar Helpers ───────────────────────────────── */
  function updateBreadcrumbs(path) {
    const fn = $('breadcrumb-filename');
    const ic = $('breadcrumb-file-icon');
    if (path) {
      if (fn) fn.textContent = path;
      if (ic) ic.className = `codicon ${fileIcon(path).icon} ${fileIcon(path).cls}`;
    } else {
      if (fn) fn.textContent = 'None';
    }
  }

  function updateStatusBar() {
    const path = Tabs.getActive();
    if (path) {
      const file = VFS.read(path);
      $('status-lang').innerHTML = `<i class="codicon codicon-code"></i> ${(file?.language || 'plaintext').toUpperCase()}`;
    } else {
      $('status-lang').textContent = '';
      $('status-cursor').textContent = '';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     COMPILER PIPELINE & ISOLATED STAGE OUTPUTS
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
        const cFiles = VFS.list().filter(p => p.endsWith('.c'));
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

    // Switch to Terminal Panel
    PanelController.switchPanel('terminal');

    const term = $('terminal');
    term.innerHTML = '';
    termLog(`[Build] Compiling target: ${entryPath}…`);

    const errors = [];
    const warnings = [];

    try {
      // ── Stage 1: Preprocess ──────────────────────────────────────
      const ppText = extractPreprocessed(CJS, entryPath, source, errors);
      outputLog(`[1/4] Preprocessed C source compiled.`);

      // ── Stage 2: AST ─────────────────────────────────────────────
      const astText = extractAST(CJS, entryPath, source, errors);
      outputLog(`[2/4] Parsed Abstract Syntax Tree.`);

      // ── Stage 3: WASM Codegen ────────────────────────────────────
      const wasmInfo = extractWasm(CJS, entryPath, source, errors, warnings);

      let sectionSummary = `=== WASM Binary Sections for ${entryPath} ===\n\n`;
      for (const sec of wasmInfo.sections) {
        sectionSummary += `Section ${sec.id} (${sec.name}): ${sec.length.toLocaleString()} bytes @ offset ${sec.offset}\n`;
      }
      sectionSummary += `\nTotal: ${wasmInfo.bytes.length.toLocaleString()} bytes, ${wasmInfo.sections.length} sections\n`;

      outputLog(`[3/4] WebAssembly Codegen complete (${wasmInfo.bytes.length} bytes).`);

      // Store in CompilationOutputs (Clean Tab Isolation — NO tabs opened)
      CompilationOutputs.set(ppText, astText, wasmInfo.wastText, sectionSummary);

      for (const w of warnings) {
        termLog(`[Warning] ${w}`, 'warn');
      }

      setBuildStatus('success', `Build OK (${wasmInfo.bytes.length} B)`);
      updateDiagnostics(entryPath, errors, warnings);

      if (execute) {
        termLog('[4/4] Executing WebAssembly module…');
        executeWasm(wasmInfo.bytes);
      } else {
        termLog('[Build] Done. Check Compilation Stages Explorer to inspect outputs.');
      }

    } catch (err) {
      for (const e of errors) termLog(`[Error] ${e}`, 'err');
      if (err.message) termLog(`[Error] ${err.message}`, 'err');
      setBuildStatus('error', 'Build failed');
      updateDiagnostics(entryPath, errors, warnings);
    }
  }

  function updateDiagnostics(filePath, errors, warnings) {
    const list = $('problems-list');
    const badge = $('problems-count-badge');
    const errCountEl = $('status-err-count');
    const warnCountEl = $('status-warn-count');

    if (!list) return;
    list.innerHTML = '';

    const total = errors.length + warnings.length;
    if (badge) badge.textContent = total;
    if (errCountEl) errCountEl.textContent = errors.length;
    if (warnCountEl) warnCountEl.textContent = warnings.length;

    // Apply Monaco Markers
    if (window.monaco && editor) {
      const uri = monaco.Uri.parse('vfs:///' + filePath);
      const model = monaco.editor.getModel(uri);
      if (model) {
        const markers = [];
        errors.forEach(e => {
          const match = e.match(/(\d+):(.*)/);
          const line = match ? parseInt(match[1], 10) : 1;
          const msg = match ? match[2] : e;
          markers.push({
            startLineNumber: line, startColumn: 1,
            endLineNumber: line, endColumn: 100,
            message: msg,
            severity: monaco.MarkerSeverity.Error,
          });
        });
        warnings.forEach(w => {
          const match = w.match(/(\d+):(.*)/);
          const line = match ? parseInt(match[1], 10) : 1;
          const msg = match ? match[2] : w;
          markers.push({
            startLineNumber: line, startColumn: 1,
            endLineNumber: line, endColumn: 100,
            message: msg,
            severity: monaco.MarkerSeverity.Warning,
          });
        });
        monaco.editor.setModelMarkers(model, 'c-compiler', markers);
      }
    }

    if (total === 0) {
      list.innerHTML = `
        <div class="problems-empty">
          <i class="codicon codicon-check-all"></i>
          <span>No problems have been detected in the workspace so far.</span>
        </div>`;
      return;
    }

    errors.forEach(e => {
      const match = e.match(/(\d+):(.*)/);
      const line = match ? parseInt(match[1], 10) : 1;
      const msg = match ? match[2] : e;

      const item = document.createElement('div');
      item.className = 'problem-item';
      item.innerHTML =
        `<i class="codicon codicon-error problem-icon-err"></i>` +
        `<span class="problem-msg">${esc(msg)}</span>` +
        `<span class="problem-location">${esc(filePath)}:${line}</span>`;

      item.onclick = () => {
        Tabs.open(filePath);
        if (editor) editor.revealLineInCenter(line);
      };
      list.appendChild(item);
    });

    warnings.forEach(w => {
      const match = w.match(/(\d+):(.*)/);
      const line = match ? parseInt(match[1], 10) : 1;
      const msg = match ? match[2] : w;

      const item = document.createElement('div');
      item.className = 'problem-item';
      item.innerHTML =
        `<i class="codicon codicon-warning problem-icon-warn"></i>` +
        `<span class="problem-msg">${esc(msg)}</span>` +
        `<span class="problem-location">${esc(filePath)}:${line}</span>`;

      item.onclick = () => {
        Tabs.open(filePath);
        if (editor) editor.revealLineInCenter(line);
      };
      list.appendChild(item);
    });
  }

  function setBuildStatus(type, text) {
    const el = $('status-build');
    if (!el) return;
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

  /* ── Panel Log Helpers ─────────────────────────────────────────────── */
  function termLog(msg, type) {
    const term = $('terminal');
    if (!term) return;
    const cls = type === 'err' ? 'term-err' : type === 'warn' ? 'term-warn' : type === 'out' ? 'term-out' : 'term-sys';
    term.innerHTML += `<div class="term-line ${cls}">${esc(msg)}</div>`;
    term.scrollTop = term.scrollHeight;
  }

  function outputLog(msg) {
    const out = $('output-log');
    if (!out) return;
    out.innerHTML += `<div class="term-line term-sys">${esc(msg)}</div>`;
    out.scrollTop = out.scrollHeight;
  }

  function debugLog(msg) {
    const dbg = $('debug-log');
    if (!dbg) return;
    dbg.innerHTML += `<div class="term-line term-out">${esc(msg)}</div>`;
    dbg.scrollTop = dbg.scrollHeight;
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

    const allCFiles = VFS.list().filter(p => p.endsWith('.c'));
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
            if (line || i < arr.length - 1) {
              termLog(line, 'out');
              debugLog(line);
            }
          });
        } else if (m.type === 'stderr') {
          termLog(m.text, 'err');
        } else if (m.type === 'exit') {
          termLog(`[Process Exited] Return code: ${m.code}`);
          debugLog(`Process exited with code ${m.code}`);
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
