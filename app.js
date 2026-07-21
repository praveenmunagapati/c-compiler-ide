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

    $('btn-build').onclick = () => buildPipeline();
    $('btn-run').onclick   = () => runPipeline({ runExecution: true });
    $('btn-step').onclick  = () => stepNext();
    $('btn-reset').onclick = () => resetPipeline();

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault(); runPipeline({ runExecution: true });
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
    if (next !== 'source' && highestStage < 1) runPipeline({ runExecution: false });
    setStage(next);
  }

  function resetPipeline() {
    highestStage = -1;
    $('code-pp').textContent        = '// Preprocessed output appears here after running the pipeline.';
    $('tree-ast').textContent       = '// AST tree appears here after running the pipeline.';
    $('code-wast').textContent      = ';; WAST / assembly instructions appear here after running the pipeline.';
    $('section-grid').innerHTML     = '<div class="section-card"><div class="section-card-title">Run the pipeline to inspect WASM sections.</div></div>';
    $('terminal').innerHTML         = '<div class="line line-sys">[Ready] Press 🔨 Build or ▶ Run Program (Ctrl+Enter).</div>';
    setStage('source');
  }

  function buildPipeline() {
    runPipeline({ runExecution: false });
  }

  /* ══════════════════════════════════════════════════════════════════════
     PIPELINE EXECUTION  (uses CompilerJS global from compiler.js)
     ══════════════════════════════════════════════════════════════════════ */
  function runPipeline(opts = { runExecution: true }) {
    const runExecution = opts && opts.runExecution !== undefined ? opts.runExecution : true;
    const CJS = window.CompilerJS;
    if (!CJS) {
      alert('CompilerJS not loaded — make sure compiler.js and stdlib.js are served.');
      return;
    }

    const source = editor ? editor.getValue() : '';
    const term   = $('terminal');
    term.innerHTML = '<div class="line line-sys">[Pipeline] Starting compilation…</div>';

    // Collect errors/warnings for display
    const allErrors = [];
    const allWarnings = [];

    try {
      /* ── 1. Lex & Preprocess ─────────────────────────────────────── */
      const ppText = extractPreprocessed(CJS, source, allErrors);
      $('code-pp').textContent = ppText;
      highestStage = 1;
      term.innerHTML += '<div class="line line-sys">[Stage 1] Preprocessing complete.</div>';

      /* ── 2. Parse → AST ──────────────────────────────────────────── */
      const astText = extractAST(CJS, source, allErrors);
      $('tree-ast').textContent = astText;
      highestStage = 2;
      term.innerHTML += '<div class="line line-sys">[Stage 2] Parsing complete — AST generated.</div>';

      /* ── 3 & 4. Codegen → WASM bytes ─────────────────────────────── */
      const wasmInfo = extractWasm(CJS, source, allErrors, allWarnings);
      $('code-wast').textContent = wasmInfo.wastText;
      highestStage = 3;
      term.innerHTML += '<div class="line line-sys">[Stage 3] Code generation complete.</div>';

      renderSections(wasmInfo.sections);
      highestStage = 4;

      const bytes = wasmInfo.bytes;
      term.innerHTML += `<div class="line line-sys">[Compiler] OK — ${bytes.length} bytes WASM binary generated (${wasmInfo.sections.length} sections).</div>`;

      // Show any warnings collected during compilation
      for (const w of allWarnings) {
        term.innerHTML += `<div class="line line-warn">[Warning] ${esc(w)}</div>`;
      }

      if (runExecution) {
        /* ── 5. Execute ──────────────────────────────────────────────── */
        term.innerHTML += `<div class="line line-sys">[Runtime] Instantiating and executing module…</div>`;
        executeWasm(bytes, term);
        highestStage = 5;
        // Auto-advance to the Terminal output tab when running
        setStage('output');
      } else {
        term.innerHTML += `<div class="line line-sys">[Build] SUCCESS — WASM binary ready. Press ▶ Run Program to execute.</div>`;
        // Auto-advance to the WASM Sections tab when building
        setStage('wasm');
      }

    } catch (err) {
      // Show collected errors
      for (const e of allErrors) {
        term.innerHTML += `<div class="line line-err">[Error] ${esc(e)}</div>`;
      }
      term.innerHTML += `<div class="line line-err">[Error] ${esc(err.message)}</div>`;
      if (err.stack) {
        // Only show a few lines of the stack
        const shortStack = err.stack.split('\n').slice(0, 4).join('\n');
        term.innerHTML += `<div class="line line-err">${esc(shortStack)}</div>`;
      }
      highestStage = Math.max(highestStage, 0);
      setStage('output');
    }
  }

  /* ── Stage 1: Preprocessor ─────────────────────────────────────────── */
  function extractPreprocessed(CJS, source, errors) {
    // Create a fresh PPRegistry with stdlib headers for each run
    const pp = CJS.createDefaultPPRegistry();

    // Tokenize: lex → preprocess → postProcess
    const result = CJS.tokenize(CJS.intern('main.c'), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors) {
        errors.push(`${err.filename || 'main.c'}:${err.line}: ${err.message}`);
      }
      return '// Preprocessing failed — see terminal for errors.';
    }

    // Reconstruct preprocessed source text from all tokens (including included headers)
    const tokens = result.tokens;
    let out = '';
    let prevLine = -1;
    let prevFile = '';

    for (const t of tokens) {
      if (t.kind === CJS.TokenKind.EOS) continue;

      // Emit file / line markers whenever file changes or line jumps significantly
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

      // Preserve space between tokens
      if (t.flags && t.flags.hasSpace && !out.endsWith('\n') && !out.endsWith(' ')) {
        out += ' ';
      }

      out += t.text;
    }

    if (!out.trim()) {
      return '// Preprocessor produced no output.';
    }

    return out;
  }

  /* ── Stage 2: AST ──────────────────────────────────────────────────── */
  function extractAST(CJS, source, errors) {
    // Create a fresh PPRegistry
    const pp = CJS.createDefaultPPRegistry();

    // parseSource: tokenize + parse → { translationUnit, errors, warnings }
    const result = CJS.parseSource(CJS.intern('main.c'), source, pp);

    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors) {
        errors.push(`${err.filename || 'main.c'}:${err.line}: ${err.message}`);
      }
      return '// Parsing failed — see terminal for errors.';
    }

    // dumpAst takes an array of translation units
    const rawAst = CJS.dumpAst([result.translationUnit]);
    return formatAST(rawAst);
  }

  /* ── AST Tree Formatting Helper ────────────────────────────────────── */
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

      // Collapse header function prototypes that have no body (import)
      if (content.includes('(import)') && depth === 1) {
        importedCount++;
        // Skip parameter lines of this imported function
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextMatch = nextLine.match(/^(\s*)/);
          const nextIndent = nextMatch && nextMatch[1] ? nextMatch[1].length : 0;
          if (Math.floor(nextIndent / 2) > depth) {
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      parsedNodes.push({ depth, content, origLine: line });
    }

    if (parsedNodes.length === 0) return rawAstText;

    // Add stdlib header summary node at depth 1
    if (importedCount > 0) {
      parsedNodes.splice(1, 0, {
        depth: 1,
        content: `[Header Prototypes] (${importedCount} functions imported from stdlib)`,
        origLine: ''
      });
    }

    // Build box-drawing tree
    const formattedLines = [];

    for (let i = 0; i < parsedNodes.length; i++) {
      const node = parsedNodes[i];
      const depth = node.depth;
      const cleanContent = simplifyAstContent(node.content);

      if (depth === 0) {
        formattedLines.push('📦 ' + cleanContent);
        continue;
      }

      let isLast = true;
      for (let j = i + 1; j < parsedNodes.length; j++) {
        if (parsedNodes[j].depth === depth) {
          isLast = false;
          break;
        }
        if (parsedNodes[j].depth < depth) {
          break;
        }
      }

      let prefix = '';
      for (let d = 1; d < depth; d++) {
        let hasMoreAtD = false;
        for (let j = i + 1; j < parsedNodes.length; j++) {
          if (parsedNodes[j].depth === d) {
            hasMoreAtD = true;
            break;
          }
          if (parsedNodes[j].depth < d) {
            break;
          }
        }
        prefix += hasMoreAtD ? '│  ' : '   ';
      }

      const connector = isLast ? '└─ ' : '├─ ';
      formattedLines.push(prefix + connector + cleanContent);
    }

    return formattedLines.join('\n');
  }

  function simplifyAstContent(raw) {
    let s = raw;

    // Remove internal compiler IDs ($17, def=$0, decl=$18, etc.)
    s = s.replace(/\s*\$\d+/g, '');
    s = s.replace(/\s*\(def=\$\d+\)/g, '');
    s = s.replace(/\s*\(decl=\$\d+,\s*defn=\$\d+\)/g, '');
    s = s.replace(/\s*\(decl=\$\d+\)/g, '');

    if (s.startsWith('Translation Unit ')) {
      return `TranslationUnit <${s.substring(17).trim()}>`;
    }

    // Function Declarations
    if (s.startsWith('Decl DFunc: ') || s.startsWith('Decl DFunc ')) {
      const declStr = s.substring(s.indexOf('DFunc') + 5).trim();
      return `FunctionDecl  ${declStr}`;
    }

    // Variable Declarations
    if (s.startsWith('Decl DVar: ') || s.startsWith('Decl DVar ')) {
      const declStr = s.substring(s.indexOf('DVar') + 4).trim();
      return `VarDecl  ${declStr}`;
    }

    // Parameters line
    if (s.endsWith(' parameters')) {
      return `Parameters (${s.split(' ')[0]})`;
    }

    // Statements
    if (s.startsWith('Stmt SCompound:')) {
      return `CompoundStmt  {${s.substring(14).trim()}}`;
    }
    if (s.startsWith('Stmt SExpr:')) return 'ExprStmt';
    if (s.startsWith('Stmt SReturn:')) return 'ReturnStmt';
    if (s.startsWith('Stmt SIf:')) return 'IfStmt';
    if (s.startsWith('Stmt SFor:')) return 'ForStmt';
    if (s.startsWith('Stmt SWhile:')) return 'WhileStmt';

    // Expressions
    if (s.startsWith('Expr: Type=')) {
      const typeEnd = s.indexOf(' ', 11);
      const typeStr = typeEnd > -1 ? s.substring(11, typeEnd) : '';
      const rest = typeEnd > -1 ? s.substring(typeEnd + 1).trim() : s.substring(11);

      if (rest.startsWith('CALL ')) return `CallExpr  (${rest.substring(5)}, return: ${typeStr})`;
      if (rest.startsWith('IDENT ')) return `Identifier  "${rest.substring(6)}" (${typeStr})`;
      if (rest.startsWith('STRING ')) return `StringLiteral  ${rest.substring(7)} (${typeStr})`;
      if (rest.startsWith('INT ')) return `IntLiteral  ${rest.substring(4)}`;
      if (rest.startsWith('FLOAT ')) return `FloatLiteral  ${rest.substring(6)}`;
      if (rest.startsWith('IMPLICIT_CAST ')) return `ImplicitCast  -> ${typeStr}`;
      if (rest.startsWith('DECAY ')) return `ArrayDecay  -> ${typeStr}`;

      return `Expr  ${rest} [${typeStr}]`;
    }

    return s;
  }

  /* ── Stages 3 & 4: WASM codegen ────────────────────────────────────── */
  function extractWasm(CJS, source, errors, warnings) {
    let bytes = null;
    let wastText = '';
    let sections = [];

    // Build a fake "fs" object for parseAllUnits.
    // parseAllUnits calls fs.readFileSync(file, "utf-8") for each input file.
    const fakeFs = {
      readFileSync: (path, _encoding) => {
        if (path === 'main.c') return source;
        throw new Error(`File not found: ${path}`);
      }
    };

    // Create a fresh PPRegistry
    const pp = CJS.createDefaultPPRegistry();

    // Collect errors/warnings from compilation
    const compileErrors = [];
    const compileWarnings = [];
    const writeErr = (s) => { compileErrors.push(s.replace(/\n$/, '')); };

    const compilerOptions = {
      allowImplicitFunctionDecl: true,
      allowEmptyParams: true,
    };

    try {
      // Parse all units (handles user code + auto-required stdlib sources like __alloca.c)
      const units = CJS.parseAllUnits(fakeFs, pp, ['main.c'], {
        warningFlags: { pointerDecay: false, circularDependency: false },
        compilerOptions,
        writeErr,
      });

      // Link translation units
      const linkResult = CJS.linkTranslationUnits(units, compilerOptions);
      if (linkResult.errors && linkResult.errors.length > 0) {
        for (const err of linkResult.errors) {
          errors.push(`Link error: ${err.message}`);
        }
        wastText = ';; Linking failed — see terminal for errors.';
        return { bytes: new Uint8Array(0), wastText, sections: [] };
      }

      // Generate WASM binary
      bytes = CJS.generateCode(units, 'a.wasm', { compilerOptions });

    } catch (e) {
      // If it's a compilation failure with diagnostics already emitted to writeErr, 
      // collect those instead of the raw exception
      if (e.compilationFailed && compileErrors.length > 0) {
        for (const msg of compileErrors) errors.push(msg);
      } else {
        errors.push(e.message);
      }
    }

    // Forward compile warnings
    for (const w of compileWarnings) warnings.push(w);

    if (bytes && bytes.length > 0) {
      sections = parseWasmSections(bytes);
      wastText = generateWastSummary(sections, bytes);
    } else {
      wastText = wastText || ';; (compilation did not produce WASM bytes — see terminal for errors)';
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
      if (sec.id === 1) { // Type
        out += `  ;; ${sec.length} bytes of function type signatures\n`;
      } else if (sec.id === 2) { // Import
        out += `  ;; (host imports: libc functions, memory, etc.)\n`;
      } else if (sec.id === 3) { // Function
        out += `  ;; (function index → type index mapping)\n`;
      } else if (sec.id === 5) { // Memory
        out += '  (memory (export "memory") 2)\n';
      } else if (sec.id === 6) { // Global
        out += `  ;; (global variables: stack pointer, heap base, etc.)\n`;
      } else if (sec.id === 7) { // Export
        out += '  ;; (exports: _start or main, memory, etc.)\n';
      } else if (sec.id === 10) { // Code
        out += `  ;; ${sec.length} bytes of function bodies\n`;
      } else if (sec.id === 11) { // Data
        out += `  ;; ${sec.length} bytes of data segments (string literals, static data)\n`;
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

  /* ── Stage 5: Execute WASM via host.js in a Web Worker ─────────────── */
  function executeWasm(bytes, termEl) {
    if (!bytes || bytes.length === 0) {
      termEl.innerHTML += '<div class="line line-sys">[Runtime] No WASM bytes to execute.</div>';
      return;
    }

    // Build a Worker from an inline script that loads host.js and calls runModule.
    // host.js only exports runModule in Worker context (self, when window is absent).
    // Use absolute URL because Blob workers have an opaque origin.
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
          try { blockFS.mkdir('/tmp', 0o777); } catch(err) {}

          const exitCode = await runModule({
            bytes: bytes,
            args: ['a.out'],
            blockFsFactory: async function (ctx) {
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
          self.postMessage({ type: 'exit', exitCode: exitCode });
        } catch(err) {
          self.postMessage({ type: 'error', message: err.message, stack: err.stack });
        }
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'stdout') {
          // Split on newlines so each line gets its own element
          const lines = msg.text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line || i < lines.length - 1) {
              termEl.innerHTML += `<div class="line">${esc(line)}</div>`;
            }
          }
        } else if (msg.type === 'stderr') {
          termEl.innerHTML += `<div class="line line-err">${esc(msg.text)}</div>`;
        } else if (msg.type === 'exit') {
          termEl.innerHTML += `<div class="line line-sys">[Exit] Process exited with code ${msg.exitCode}</div>`;
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        } else if (msg.type === 'error') {
          termEl.innerHTML += `<div class="line line-err">[Runtime Error] ${esc(msg.message)}</div>`;
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        }
      };

      worker.onerror = (e) => {
        termEl.innerHTML += `<div class="line line-err">[Worker Error] ${esc(e.message)}</div>`;
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      // Send the WASM bytes to the worker (as transferable)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      worker.postMessage({ type: 'run', bytes: buffer }, [buffer]);

    } catch (workerErr) {
      termEl.innerHTML += `<div class="line line-err">[Worker] Failed to create worker: ${esc(workerErr.message)}</div>`;
      termEl.innerHTML += '<div class="line line-sys">[Fallback] Attempting direct instantiation…</div>';
      executeWasmDirect(bytes, termEl);
    }
  }

  /* ── Fallback: Direct WASM execution (no host.js runtime) ──────────── */
  function executeWasmDirect(bytes, termEl) {
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
