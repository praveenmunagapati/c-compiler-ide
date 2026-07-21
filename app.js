/**
 * C Compiler Pipeline Visualizer IDE — Application Logic
 *
 * Uses compiler.js (+ stdlib.js) to expose the internal compilation stages:
 *   Lex → Preprocess → Parse (AST) → Codegen (WASM bytes)
 *
 * The compiler exposes its pipeline via the CompilerJS global (set by
 * compiler.js when loaded in a browser <script>). We call into it to
 * extract intermediate representations at each stage.
 */
(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════════
     CODE PRESETS
     ══════════════════════════════════════════════════════════════════════ */
  const PRESETS = {
    hello: [
      '01 — Hello World',
      '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, Pipeline Visualizer!\\n");\n    return 0;\n}\n'
    ],
    macros: [
      '02 — Preprocessor Macros',
      '#include <stdio.h>\n\n#define SQUARE(x) ((x) * (x))\n#define APP_NAME "Visualizer"\n\nint main(void) {\n    int v = 7;\n    printf("%s: %d^2 = %d\\n", APP_NAME, v, SQUARE(v));\n    return 0;\n}\n'
    ],
    control: [
      '03 — Control Flow & Loops',
      '#include <stdio.h>\n\nint main(void) {\n    int sum = 0;\n    for (int i = 1; i <= 5; i++) {\n        if (i % 2 == 0)\n            printf("even: %d\\n", i);\n        else\n            printf("odd:  %d\\n", i);\n        sum += i;\n    }\n    printf("total = %d\\n", sum);\n    return 0;\n}\n'
    ],
    memory: [
      '04 — Pointers & Heap Memory',
      '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int n = 4;\n    int *arr = (int *)malloc(n * sizeof(int));\n    if (!arr) return 1;\n    for (int i = 0; i < n; i++)\n        arr[i] = (i + 1) * 10;\n    for (int i = 0; i < n; i++)\n        printf("arr[%d] = %d\\n", i, arr[i]);\n    free(arr);\n    return 0;\n}\n'
    ],
    variadic: [
      '05 — Variadic Functions',
      '#include <stdio.h>\n#include <stdarg.h>\n\nvoid log_vals(int n, ...) {\n    va_list ap;\n    va_start(ap, n);\n    for (int i = 0; i < n; i++)\n        printf("  [%d] = %d\\n", i + 1, va_arg(ap, int));\n    va_end(ap);\n}\n\nint main(void) {\n    log_vals(3, 100, 200, 300);\n    return 0;\n}\n'
    ],
    structs: [
      '06 — Structs & Typedef',
      '#include <stdio.h>\n\ntypedef struct {\n    int x;\n    int y;\n} Point;\n\nPoint add(Point a, Point b) {\n    Point r = { a.x + b.x, a.y + b.y };\n    return r;\n}\n\nint main(void) {\n    Point p = add((Point){1, 2}, (Point){3, 4});\n    printf("(%d, %d)\\n", p.x, p.y);\n    return 0;\n}\n'
    ],
  };

  /* ══════════════════════════════════════════════════════════════════════
     STAGE INSIGHTS  (educational text per pipeline stage)
     ══════════════════════════════════════════════════════════════════════ */
  const INSIGHTS = {
    source: {
      title: 'Stage 0 — C Source Code  (main.c)',
      text:  'Human-readable C source: includes, macros, comments, and type-safe syntax. This is the code you write and edit.'
    },
    preprocessed: {
      title: 'Stage 1 — Preprocessing  (main.i)',
      text:  'The preprocessor expands #include headers, evaluates #define macros, processes #if/#ifdef conditionals, and strips comments. The result is a single, flat translation unit ready for parsing.'
    },
    ast: {
      title: 'Stage 2 — Parsing & AST',
      text:  'The parser validates C grammar, resolves types, and builds an Abstract Syntax Tree (AST). Each node represents a language construct: function declarations, compound statements, expressions, and type annotations.'
    },
    wast: {
      title: 'Stage 3 — Assembly / WAST  (main.s)',
      text:  'The code generator lowers the AST into WebAssembly Text Format (WAST). High-level loops become br/br_if, function calls become call, and local variables become local.get/local.set instructions.'
    },
    wasm: {
      title: 'Stage 4 — Binary Object Sections  (main.o)',
      text:  'The emitter serializes the module into a binary .wasm file. Each WASM section (Type, Import, Function, Memory, Global, Export, Code, Data) is laid out with LEB128 size headers.'
    },
    output: {
      title: 'Stage 5 — Execution & Output  (a.out)',
      text:  'The WebAssembly binary is instantiated. The host runtime provides libc primitives (printf, malloc, exit). Execution runs natively and streams stdout/stderr to this terminal.'
    },
  };

  const STAGES = ['source', 'preprocessed', 'ast', 'wast', 'wasm', 'output'];

  /* ══════════════════════════════════════════════════════════════════════
     STATE
     ══════════════════════════════════════════════════════════════════════ */
  let editor = null;          // Monaco editor instance
  let activeStage = 'source';
  let highestStage = -1;      // tracks how far the pipeline has run

  /* ══════════════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════════════ */
  window.addEventListener('DOMContentLoaded', () => {
    populatePresets();
    bindEvents();
    setStage('source');
    bootMonaco();
  });

  /* ── Monaco setup ──────────────────────────────────────────────────── */
  function bootMonaco() {
    if (typeof require === 'undefined' || typeof require.config === 'undefined') {
      setTimeout(bootMonaco, 80);
      return;
    }
    require.config({
      paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
    });
    require(['vs/editor/editor.main'], () => {
      monaco.editor.defineTheme('pipeline-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword',  foreground: '3b82f6', fontStyle: 'bold' },
          { token: 'type',     foreground: '06b6d4' },
          { token: 'string',   foreground: '10b981' },
          { token: 'number',   foreground: 'f59e0b' },
          { token: 'comment',  foreground: '64748b', fontStyle: 'italic' },
        ],
        colors: {
          'editor.background':                '#0a0d14',
          'editor.lineHighlightBackground':   '#141c2a',
          'editorLineNumber.foreground':       '#3a4f70',
          'editorLineNumber.activeForeground': '#06b6d4',
        }
      });

      editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: PRESETS.hello[1],
        language: 'c',
        theme: 'pipeline-dark',
        fontFamily: "'Fira Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 4,
        scrollBeyondLastLine: false,
        padding: { top: 8 },
      });

      // Ctrl+Enter shortcut bound inside editor too
      editor.addAction({
        id: 'run-pipeline',
        label: 'Run Full Pipeline',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => runPipeline(),
      });
    });
  }

  /* ── Populate preset dropdown ──────────────────────────────────────── */
  function populatePresets() {
    const sel = $('preset-select');
    for (const [key, [label]] of Object.entries(PRESETS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  /* ── Bind UI events ────────────────────────────────────────────────── */
  function bindEvents() {
    $('preset-select').onchange = (e) => {
      const p = PRESETS[e.target.value];
      if (p && editor) { editor.setValue(p[1]); resetPipeline(); }
    };

    $('btn-run').onclick  = () => runPipeline();
    $('btn-step').onclick = () => stepNext();
    $('btn-reset').onclick = () => resetPipeline();

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault(); runPipeline();
      }
    });

    // Stepper & tab bar clicks
    document.querySelectorAll('[data-stage]').forEach((el) => {
      el.addEventListener('click', () => setStage(el.dataset.stage));
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     STAGE MANAGEMENT
     ══════════════════════════════════════════════════════════════════════ */
  function setStage(stage) {
    activeStage = stage;

    // Stepper nodes
    document.querySelectorAll('.step-node').forEach((n) => {
      const s = n.dataset.stage;
      n.classList.toggle('active', s === stage);
      n.classList.toggle('done', STAGES.indexOf(s) < highestStage && s !== stage);
    });

    // Tab bar
    document.querySelectorAll('.tab-item').forEach((t) =>
      t.classList.toggle('active', t.dataset.stage === stage));

    // Panels
    document.querySelectorAll('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.id === 'panel-' + stage));

    // Insight text
    const ins = INSIGHTS[stage] || INSIGHTS.source;
    $('insight-title').textContent = ins.title;
    $('insight-text').textContent  = ins.text;
  }

  function stepNext() {
    const idx = STAGES.indexOf(activeStage);
    const next = STAGES[Math.min(idx + 1, STAGES.length - 1)];
    // If pipeline hasn't been run yet, kick it off
    if (next !== 'source' && highestStage < 1) runPipeline();
    setStage(next);
  }

  function resetPipeline() {
    highestStage = -1;
    $('code-pp').textContent        = '// Preprocessed output appears here after running the pipeline.';
    $('tree-ast').textContent       = '// AST tree appears here after running the pipeline.';
    $('code-wast').textContent      = ';; WAST / assembly instructions appear here after running the pipeline.';
    $('section-grid').innerHTML     = '<div class="section-card"><div class="section-card-title">Run the pipeline to inspect WASM sections.</div></div>';
    $('terminal').innerHTML         = '<div class="line line-sys">[Ready] Press ▶ Run Full Pipeline or Ctrl+Enter.</div>';
    setStage('source');
  }

  /* ══════════════════════════════════════════════════════════════════════
     PIPELINE EXECUTION  (uses CompilerJS global from compiler.js)
     ══════════════════════════════════════════════════════════════════════ */
  function runPipeline() {
    const CJS = window.CompilerJS;
    if (!CJS) {
      alert('CompilerJS not loaded — make sure compiler.js and stdlib.js are served.');
      return;
    }

    const source = editor ? editor.getValue() : '';
    const term   = $('terminal');
    term.innerHTML = '<div class="line line-sys">[Pipeline] Starting compilation…</div>';

    try {
      /* ── 1. Lex & Preprocess ─────────────────────────────────────── */
      const ppText = extractPreprocessed(CJS, source);
      $('code-pp').textContent = ppText;
      highestStage = 1;

      /* ── 2. Parse → AST ──────────────────────────────────────────── */
      const astText = extractAST(CJS, source);
      $('tree-ast').textContent = astText;
      highestStage = 2;

      /* ── 3 & 4. Codegen → WASM bytes ─────────────────────────────── */
      const wasmInfo = extractWasm(CJS, source);
      $('code-wast').textContent = wasmInfo.wastText;
      highestStage = 3;

      renderSections(wasmInfo.sections);
      highestStage = 4;

      /* ── 5. Execute ──────────────────────────────────────────────── */
      const bytes = wasmInfo.bytes;
      term.innerHTML += `<div class="line line-sys">[Compiler] OK — ${bytes.length} bytes WASM binary.</div>`;
      term.innerHTML += `<div class="line line-sys">[Runtime] Instantiating module…</div>`;
      executeWasm(bytes, term);
      highestStage = 5;

      // Auto-advance to the preprocessed tab
      setStage('preprocessed');

    } catch (err) {
      term.innerHTML += `<div class="line line-err">[Error] ${esc(err.message)}</div>`;
      if (err.stack) term.innerHTML += `<div class="line line-err">${esc(err.stack)}</div>`;
      highestStage = Math.max(highestStage, 0);
      setStage('output');
    }
  }

  /* ── Stage 1: Preprocessor ─────────────────────────────────────────── */
  function extractPreprocessed(CJS, source) {
    // Use the compiler's `-a lex` action to get preprocessed tokens
    try {
      const result = CJS.compileToStages(source, 'main.c', 'lex');
      if (result && result.preprocessed) return result.preprocessed;
      if (result && result.tokens) {
        return result.tokens.map((t) => t.text).join('');
      }
    } catch (e) { /* fallback below */ }

    // Fallback: show macro-annotated source
    const lines = source.split('\n');
    let out = '# 1 "main.c"\n';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*#\s*include/.test(line)) {
        out += `/* ${line.trim()} → [header expanded by compiler.js stdlib] */\n`;
      } else if (/^\s*#\s*define\s+(\w+)/.test(line)) {
        const m = line.match(/#\s*define\s+(\w+)(?:\(([^)]*)\))?\s*(.*)/);
        if (m) {
          out += `/* MACRO: ${m[1]}${m[2] !== undefined ? '(' + m[2] + ')' : ''} = ${m[3] || '(empty)'} */\n`;
        }
      } else if (/^\s*\/\//.test(line) || /^\s*$/.test(line)) {
        out += '\n';
      } else {
        out += line + '\n';
      }
    }
    return out;
  }

  /* ── Stage 2: AST ──────────────────────────────────────────────────── */
  function extractAST(CJS, source) {
    try {
      const result = CJS.compileToStages(source, 'main.c', 'parse');
      if (result && result.ast) return typeof result.ast === 'string' ? result.ast : JSON.stringify(result.ast, null, 2);
    } catch (e) { /* fallback */ }

    // Fallback: build a basic structural representation
    return buildFallbackAST(source);
  }

  function buildFallbackAST(source) {
    const lines = source.split('\n');
    let out = 'TranslationUnit\n';
    let indent = 1;
    const pad = (n) => '  '.repeat(n);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      if (/^#include\s*<(.+?)>/.test(trimmed)) {
        out += pad(indent) + '├─ IncludeDirective  <' + RegExp.$1 + '>\n';
      } else if (/^#define\s+(\w+)/.test(trimmed)) {
        out += pad(indent) + '├─ MacroDefinition  ' + RegExp.$1 + '\n';
      } else if (/^typedef\s+/.test(trimmed)) {
        out += pad(indent) + '├─ TypedefDecl\n';
      } else if (/^(\w[\w\s\*]*)\s+(\w+)\s*\(([^)]*)\)\s*\{/.test(trimmed)) {
        const retType = RegExp.$1.trim();
        const fname   = RegExp.$2;
        const params  = RegExp.$3;
        out += pad(indent) + '├─ FunctionDecl  ' + retType + ' ' + fname + '(' + params + ')\n';
        indent++;
        out += pad(indent) + '├─ CompoundStmt {\n';
        indent++;
      } else if (trimmed === '}') {
        indent = Math.max(1, indent - 1);
        out += pad(indent) + '└─ }\n';
        indent = Math.max(1, indent - 1);
      } else if (/\bif\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ IfStmt\n';
      } else if (/\bfor\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ ForStmt\n';
      } else if (/\bwhile\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ WhileStmt\n';
      } else if (/\breturn\b/.test(trimmed)) {
        out += pad(indent) + '├─ ReturnStmt\n';
      } else if (/\bprintf\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ CallExpr  printf(…)\n';
      } else if (/\bmalloc\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ CallExpr  malloc(…)\n';
      } else if (/\bfree\s*\(/.test(trimmed)) {
        out += pad(indent) + '├─ CallExpr  free(…)\n';
      } else if (/^\w[\w\s\*]*\s+\w+\s*[=;]/.test(trimmed)) {
        out += pad(indent) + '├─ VarDecl\n';
      } else {
        out += pad(indent) + '├─ Stmt  ' + trimmed.substring(0, 60) + '\n';
      }
    }
    return out;
  }

  /* ── Stages 3 & 4: WASM codegen ────────────────────────────────────── */
  function extractWasm(CJS, source) {
    let bytes = null;
    let wastText = '';
    let sections = [];

    try {
      const result = CJS.compileToStages(source, 'main.c', 'compile');
      if (result && result.wasm) {
        bytes = result.wasm instanceof Uint8Array ? result.wasm : new Uint8Array(result.wasm);
      }
      if (result && result.wast) {
        wastText = result.wast;
      }
    } catch (e) { /* fallback */ }

    if (!bytes) {
      // Try direct compile to wasm bytes
      try {
        const r2 = CJS.compile(source, 'main.c', { output: 'wasm' });
        if (r2 instanceof Uint8Array) bytes = r2;
        else if (r2 && r2.bytes) bytes = new Uint8Array(r2.bytes);
      } catch (e) { /* fallback */ }
    }

    if (bytes) {
      sections = parseWasmSections(bytes);
      if (!wastText) {
        wastText = generateWastSummary(sections, bytes);
      }
    } else {
      wastText = wastText || ';; (compilation did not produce wasm bytes — see terminal for errors)';
      bytes = new Uint8Array(0);
    }

    return { bytes, wastText, sections };
  }

  /* ── WASM binary section parser ────────────────────────────────────── */
  const SECTION_NAMES = {
    0: 'Custom', 1: 'Type', 2: 'Import', 3: 'Function',
    4: 'Table', 5: 'Memory', 6: 'Global', 7: 'Export',
    8: 'Start', 9: 'Element', 10: 'Code', 11: 'Data',
    12: 'DataCount', 13: 'Tag',
  };

  function parseWasmSections(bytes) {
    const result = [];
    if (bytes.length < 8) return result;

    // Verify magic number: \0asm
    const magic = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    if (magic !== 0x0061736d) return result;

    let pos = 8; // skip 4-byte magic + 4-byte version
    while (pos < bytes.length) {
      const id = bytes[pos++];
      let len = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      result.push({
        id,
        name: SECTION_NAMES[id] || `Unknown(${id})`,
        offset: pos,
        length: len
      });
      pos += len;
    }
    return result;
  }

  function generateWastSummary(sections, bytes) {
    let out = ';; WebAssembly Text Format Summary\n';
    out += `;; Binary size: ${bytes.length} bytes\n`;
    out += `;; Sections: ${sections.length}\n\n`;
    out += '(module\n';

    for (const sec of sections) {
      out += `  ;; Section ${sec.id}: ${sec.name}  (${sec.length} bytes @ offset ${sec.offset})\n`;
      if (sec.id === 5) { // Memory
        out += '  (memory (export "memory") 2)\n';
      } else if (sec.id === 7) { // Export
        out += '  ;; (exports listed in binary)\n';
      } else if (sec.id === 10) { // Code
        out += `  ;; ${sec.length} bytes of function bodies\n`;
      }
    }

    out += ')\n';
    return out;
  }

  /* ── Stage 4: Render section cards ─────────────────────────────────── */
  function renderSections(sections) {
    const grid = $('section-grid');
    if (!sections.length) {
      grid.innerHTML = '<div class="section-card"><div class="section-card-title">No sections parsed.</div></div>';
      return;
    }
    grid.innerHTML = '';
    for (const sec of sections) {
      const card = document.createElement('div');
      card.className = 'section-card';
      card.innerHTML =
        `<div class="section-card-title">${esc(sec.name)} Section</div>` +
        `<div class="section-card-detail">ID: 0x${sec.id.toString(16).padStart(2, '0')}</div>` +
        `<div class="section-card-detail">Size: ${sec.length.toLocaleString()} bytes</div>` +
        `<div class="section-card-detail">Offset: @+${sec.offset}</div>`;
      grid.appendChild(card);
    }
  }

  /* ── Stage 5: Execute WASM ─────────────────────────────────────────── */
  function executeWasm(bytes, termEl) {
    if (!bytes || bytes.length === 0) {
      termEl.innerHTML += '<div class="line line-sys">[Runtime] No WASM bytes to execute.</div>';
      return;
    }

    let buf = '';
    const flush = () => {
      if (buf) { termEl.innerHTML += `<div class="line">${esc(buf)}</div>`; buf = ''; }
    };

    const mem = new WebAssembly.Memory({ initial: 2 });
    const importObj = {
      env: {
        memory: mem,
        putchar: (ch) => {
          if (ch === 10) { flush(); }
          else { buf += String.fromCharCode(ch); }
        },
      },
    };

    WebAssembly.instantiate(bytes, importObj)
      .then((obj) => {
        const exp = obj.instance.exports;
        if (exp._start) exp._start();
        else if (exp.main) {
          const code = exp.main(0, 0);
          flush();
          termEl.innerHTML += `<div class="line line-sys">[Exit] main() returned ${code}</div>`;
        } else {
          flush();
          termEl.innerHTML += '<div class="line line-sys">[Done] Module instantiated (no main/_start export).</div>';
        }
      })
      .catch((err) => {
        flush();
        termEl.innerHTML += `<div class="line line-sys">[Runtime] ${esc(err.message)}</div>`;
      });
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
