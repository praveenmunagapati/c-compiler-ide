#!/usr/bin/env node
(() => {
"use strict";

// ====================
// Lexer
// ====================

const Lexer = (() => {

// String interning - returns the same string reference for equal strings
const internPool = new Map();
function intern(str) {
  let s = internPool.get(str);
  if (s !== undefined) return s;
  internPool.set(str, str);
  return str;
}

// Token kinds
const TokenKind = Object.freeze({
  EOS: "EOS",
  NEWLINE: "NEWLINE",
  IDENT: "IDENT",
  PP_NUMBER: "PP_NUMBER",
  STRING: "STRING",
  CHAR: "CHAR",
  PUNCT: "PUNCT",
  KEYWORD: "KEYWORD",
  INT: "INT",
  FLOAT: "FLOAT",
  PLACEMARKER: "PLACEMARKER",
  // A structural pragma the parser needs positionally (currently only
  // `#pragma pack`). The preprocessor emits it into the token stream;
  // postProcess resolves it into a per-struct pack value and drops it, so
  // it never reaches the parser (todos/0191).
  PRAGMA: "PRAGMA",
  // A non-white-space character that forms no other token (C11 6.4p1's
  // "each non-white-space character that cannot be one of the above" —
  // @, $, `). Valid as a pp-token; diagnosed only if it survives
  // preprocessing (skipped #if groups and unexpanded macro bodies may
  // legally contain them).
  OTHER: "OTHER",
});

// Keywords
const Keyword = Object.freeze({
  AUTO: "auto",
  BREAK: "break",
  CASE: "case",
  CHAR: "char",
  CONST: "const",
  CONTINUE: "continue",
  DEFAULT: "default",
  DO: "do",
  DOUBLE: "double",
  ELSE: "else",
  ENUM: "enum",
  EXTERN: "extern",
  FLOAT: "float",
  FOR: "for",
  GOTO: "goto",
  IF: "if",
  INT: "int",
  LONG: "long",
  REGISTER: "register",
  RETURN: "return",
  SHORT: "short",
  SIGNED: "signed",
  SIZEOF: "sizeof",
  STATIC: "static",
  STRUCT: "struct",
  SWITCH: "switch",
  TYPEDEF: "typedef",
  UNION: "union",
  UNSIGNED: "unsigned",
  VOID: "void",
  VOLATILE: "volatile",
  WHILE: "while",
  // C99
  INLINE: "inline",
  RESTRICT: "restrict",
  // C11
  GENERIC: "_Generic",
  STATIC_ASSERT: "_Static_assert",
  NORETURN: "_Noreturn",
  ALIGNOF: "_Alignof",
  ALIGNAS: "_Alignas",
  THREAD_LOCAL: "_Thread_local",
  // C23
  TYPEOF: "typeof",
  TYPEOF_UNQUAL: "typeof_unqual",
  // Extensions
  BOOL: "_Bool",
  X_IMPORT: "__import",
  X_BUILTIN_VA_START: "__builtin_va_start",
  X_BUILTIN_VA_ARG: "__builtin_va_arg",
  X_BUILTIN_VA_END: "__builtin_va_end",
  X_BUILTIN_VA_COPY: "__builtin_va_copy",
  X_BUILTIN_UNREACHABLE: "__builtin_unreachable",
  X_BUILTIN_ABORT: "__builtin_abort",
  X_BUILTIN_EXPECT: "__builtin_expect",
  X_MEMORY_SIZE: "__memory_size",
  X_MEMORY_GROW: "__memory_grow",
  X_BUILTIN: "__builtin",
  X_ATTRIBUTE: "__attribute__",
  X_REQUIRE_SOURCE: "__require_source",
  X_EXPORT: "__export",
  X_MINSTACK: "__minstack",
  X_WASM: "__wasm",
  X_EXCEPTION: "__exception",
  X_TRY: "__try",
  X_CATCH: "__catch",
  X_THROW: "__throw",
  X_EXTERNREF: "__externref",
  X_REFEXTERN: "__refextern",
  X_STRUCT_GC: "__struct",
  X_ARRAY_GC: "__array",
  X_STRUCT_NEW: "__struct_new",
  X_NEW: "__new",
  X_ARRAY_NEW: "__array_new",
  X_REF_IS_NULL: "__ref_is_null",
  X_REF_EQ: "__ref_eq",
  X_REF_NULL: "__ref_null",
  X_REF_TEST: "__ref_test",
  X_REF_TEST_NULL: "__ref_test_null",
  X_ARRAY_LEN: "__array_len",
  X_ARRAY_OF: "__array_of",
  X_EXTENDS: "__extends",
  X_REF_CAST: "__ref_cast",
  X_REF_CAST_NULL: "__ref_cast_null",
  X_ARRAY_FILL: "__array_fill",
  X_ARRAY_COPY: "__array_copy",
  X_EQREF: "__eqref",
  X_REF_AS_EXTERN: "__ref_as_extern",
  X_REF_AS_EQ: "__ref_as_eq",
  X_CAST: "__cast",
  X_GCSTR: "__gcstr",
});

// Punctuation
const Punct = Object.freeze({
  // Single-character
  LBRACK: 0, RBRACK: 1, LPAREN: 2, RPAREN: 3, LBRACE: 4, RBRACE: 5,
  DOT: 6, AMP: 7, STAR: 8, PLUS: 9, MINUS: 10, TILDE: 11,
  BANG: 12, SLASH: 13, PCT: 14, LT: 15, GT: 16, CARET: 17,
  PIPE: 18, QMARK: 19, COLON: 20, SEMI: 21, EQ: 22, COMMA: 23, HASH: 24,
  // Two-character
  ARROW: 25, PLUSPLUS: 26, MINUSMINUS: 27, LSHIFT: 28, RSHIFT: 29,
  LE: 30, GE: 31, EQEQ: 32, NE: 33, AMPAMP: 34, PIPEPIPE: 35,
  STAR_EQ: 36, SLASH_EQ: 37, PCT_EQ: 38, PLUS_EQ: 39, MINUS_EQ: 40,
  AMP_EQ: 41, CARET_EQ: 42, PIPE_EQ: 43, HASH_HASH: 44,
  // Three-character
  LSHIFT_EQ: 45, RSHIFT_EQ: 46, ELLIPSIS: 47,
});

// String prefix for string/char literals
const StringPrefix = Object.freeze({
  NONE: 0,
  PREFIX_L: 1,
  PREFIX_u: 2,
  PREFIX_U: 3,
  PREFIX_u8: 4,
});

class TokenFlags {
  constructor() {
    this.atBol = false;
    this.hasSpace = false;
    this.isUnsigned = false;
    this.isLong = false;
    this.isLongLong = false;
    this.isFloat = false;
    this.isDecimal = false;
    this.stringPrefix = StringPrefix.NONE;
    Object.seal(this);
  }
}

// Loc — source location with start/end span.
//
// Back-compat: .line/.column/.filename getters delegate to .start, so legacy
// reads (e.g. `loc.line`) still work after construction sites switch from
// plain `{filename,line}` literals to Loc instances.
class Loc {
  constructor(filename, startLine, startColumn, endLine, endColumn) {
    this.filename = filename;
    this.start = { line: startLine || 0, column: startColumn || 0 };
    this.end = {
      line: endLine || startLine || 0,
      column: endColumn || startColumn || 0,
    };
    Object.freeze(this.start);
    Object.freeze(this.end);
    Object.freeze(this);
  }
  get line() { return this.start.line; }
  get column() { return this.start.column; }
  static fromTok(tok) {
    if (!tok) return new Loc('<generated>', 0, 0, 0, 0);
    const col = tok.column || 0;
    return new Loc(tok.filename || '<generated>', tok.line || 0, col, tok.line || 0, col);
  }
  static generated() { return new Loc('<generated>', 0, 0, 0, 0); }
  // Span over additional locs. All must share the same filename.
  join(...locs) {
    let start = this.start, end = this.end;
    for (const o of locs) {
      if (!o) continue;
      if (o.filename !== this.filename) continue; // ignore foreign locs
      if (o.start.line < start.line || (o.start.line === start.line && o.start.column < start.column)) start = o.start;
      if (o.end.line > end.line || (o.end.line === end.line && o.end.column > end.column)) end = o.end;
    }
    return new Loc(this.filename, start.line, start.column, end.line, end.column);
  }
}

class Token {
  constructor(filename, line, column, kind, text) {
    this.filename = filename;
    this.line = line;
    this.column = column;
    this.kind = kind;
    this.text = text;
    // Value union — only one is meaningful depending on kind
    this.integer = 0; // BigInt for INT tokens (set during post-processing)
    this.floating = 0; // number for FLOAT tokens
    this.keyword = null; // Keyword value for KEYWORD tokens
    this.punct = 0; // Punct value for PUNCT tokens
    // Blue paint (C11 6.10.3.4p2): set on an IDENT that emerged from its
    // own macro's expansion — never eligible for macro replacement again.
    this.noExpand = false;
    this.flags = new TokenFlags();
    // PRAGMA tokens carry their directive here ({op, n} for `#pragma pack`);
    // postProcess consumes and drops them (todos/0191).
    this.pragma = null;
    // Pack alignment cap (bytes) in effect where a `struct`/`union` keyword
    // sits, stamped by postProcess from the resolved `#pragma pack` stack.
    // 0 = natural alignment (no pack pragma active).
    this.packValue = 0;
    Object.seal(this);
  }

  atIdent(ident) {
    return this.kind === TokenKind.IDENT && this.text === ident;
  }

  atPunct(p) {
    return this.kind === TokenKind.PUNCT && this.punct === p;
  }

  atKeyword(kw) {
    return this.kind === TokenKind.KEYWORD && this.keyword === kw;
  }
}

class LexError {
  constructor(message, filename, line) {
    this.message = message;
    this.filename = filename;
    this.line = line;
    Object.seal(this);
  }
}

class LexResult {
  constructor() {
    this.tokens = [];
    this.errors = [];
    this.warnings = [];
    Object.seal(this);
  }
}

// Character classification helpers (string-based, used outside lexer)
function isSpace(c) {
  return c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === "\n";
}

function isIdentStart(c) {
  return (
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$"
  );
}

function isDigit(c) {
  return c >= "0" && c <= "9";
}

function isIdentPart(c) {
  return isIdentStart(c) || isDigit(c);
}

function isPpNumberPart(c) {
  return isIdentPart(c) || c === ".";
}

// Byte-based classification helpers (used in lexer on Uint8Array)
function isSpaceB(b) {
  return b === 0x20 || b === 0x09 || b === 0x0D || b === 0x0C || b === 0x0B || b === 0x0A;
  //       space       tab         \r          \f          \v          \n
}
function isIdentStartB(b) {
  return (b >= 0x61 && b <= 0x7A) || (b >= 0x41 && b <= 0x5A) || b === 0x5F || b === 0x24;
  //       a-z                        A-Z                        _           $
}
function isDigitB(b) { return b >= 0x30 && b <= 0x39; }
function isIdentPartB(b) { return isIdentStartB(b) || isDigitB(b); }
function isPpNumberPartB(b) { return isIdentPartB(b) || b === 0x2E; /* . */ }

function isxdigit(c) {
  return (
    (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")
  );
}

function hexVal(c) {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 0x30;
  if (c >= "a" && c <= "f") return 10 + c.charCodeAt(0) - 0x61;
  if (c >= "A" && c <= "F") return 10 + c.charCodeAt(0) - 0x41;
  return 0;
}

// ====================
// Raw lexer (phase 1)
// ====================

function lex(filename, source, lineOffsets) {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const bytes = textEncoder.encode(source);
  const n = bytes.length;
  const result = new LexResult();
  let i = 0,
    line = 1;
  let lineStart = 0; // byte index of start of current line
  let j = 0; // token start byte index
  let savedLine = 1,
    savedColumn = 1;
  let lastTokenWasNewline = true;
  let bol = true,
    space = false;
  // lineOffsets, if provided, maps a spliced-byte-offset to "how many
  // extra original-source lines were swallowed by `\<NL>` splices up to
  // that point". We add this to savedLine when emitting each token so
  // diagnostics report the line in the un-spliced source.
  const _lineOffsets = lineOffsets || null;

  function decodeText(start, end) {
    return textDecoder.decode(bytes.subarray(start, end));
  }

  function mark() {
    j = i;
    savedLine = line;
    savedColumn = i - lineStart + 1;
  }

  function peek(k = 0) {
    return i + k < n ? bytes[i + k] : 0;
  }

  // Byte constants for readability
  const NL = 0x0A, CR = 0x0D, TAB = 0x09, SPC = 0x20;
  const SLASH = 0x2F, STAR = 0x2A, HASH = 0x23, BSLASH = 0x5C;
  const DQUOTE = 0x22, SQUOTE = 0x27, DOT = 0x2E;
  const LT = 0x3C, GT = 0x3E, EQ = 0x3D, BANG = 0x21;
  const PLUS = 0x2B, MINUS = 0x2D, AMP = 0x26, PIPE = 0x7C;
  const CARET = 0x5E, PCT = 0x25, TILDE = 0x7E, QMARK = 0x3F;
  const COLON = 0x3A, SEMI = 0x3B, COMMA = 0x2C;
  const LPAREN = 0x28, RPAREN = 0x29, LBRACK = 0x5B, RBRACK = 0x5D;
  const LBRACE = 0x7B, RBRACE = 0x7D;
  const CH_L = 0x4C, CH_U = 0x55, CH_u = 0x75, CH_8 = 0x38;
  const CH_e = 0x65, CH_E = 0x45, CH_p = 0x70, CH_P = 0x50;

  function isPunctByte(b) {
    switch (b) {
      case LBRACK: case RBRACK: case LPAREN: case RPAREN:
      case LBRACE: case RBRACE: case DOT: case AMP:
      case STAR: case PLUS: case MINUS: case TILDE:
      case BANG: case SLASH: case PCT: case LT:
      case GT: case CARET: case PIPE: case QMARK:
      case COLON: case SEMI: case EQ: case COMMA:
      case HASH:
        return true;
      default: return false;
    }
  }
  function tryPunct() {
    let p, len = 1;
    switch (peek()) {
      case LBRACK: p = Punct.LBRACK; break;
      case RBRACK: p = Punct.RBRACK; break;
      case LPAREN: p = Punct.LPAREN; break;
      case RPAREN: p = Punct.RPAREN; break;
      case LBRACE: p = Punct.LBRACE; break;
      case RBRACE: p = Punct.RBRACE; break;
      case TILDE: p = Punct.TILDE; break;
      case QMARK: p = Punct.QMARK; break;
      case SEMI: p = Punct.SEMI; break;
      case COMMA: p = Punct.COMMA; break;
      case DOT:
        if (peek(1) === DOT && peek(2) === DOT) { p = Punct.ELLIPSIS; len = 3; }
        else { p = Punct.DOT; }
        break;
      case PLUS:
        if (peek(1) === PLUS) { p = Punct.PLUSPLUS; len = 2; }
        else if (peek(1) === EQ) { p = Punct.PLUS_EQ; len = 2; }
        else { p = Punct.PLUS; }
        break;
      case MINUS:
        if (peek(1) === GT) { p = Punct.ARROW; len = 2; }
        else if (peek(1) === MINUS) { p = Punct.MINUSMINUS; len = 2; }
        else if (peek(1) === EQ) { p = Punct.MINUS_EQ; len = 2; }
        else { p = Punct.MINUS; }
        break;
      case STAR:
        if (peek(1) === EQ) { p = Punct.STAR_EQ; len = 2; }
        else { p = Punct.STAR; }
        break;
      case SLASH:
        if (peek(1) === EQ) { p = Punct.SLASH_EQ; len = 2; }
        else { p = Punct.SLASH; }
        break;
      case PCT:
        if (peek(1) === EQ) { p = Punct.PCT_EQ; len = 2; }
        else { p = Punct.PCT; }
        break;
      case LT:
        if (peek(1) === LT) {
          if (peek(2) === EQ) { p = Punct.LSHIFT_EQ; len = 3; }
          else { p = Punct.LSHIFT; len = 2; }
        } else if (peek(1) === EQ) { p = Punct.LE; len = 2; }
        else { p = Punct.LT; }
        break;
      case GT:
        if (peek(1) === GT) {
          if (peek(2) === EQ) { p = Punct.RSHIFT_EQ; len = 3; }
          else { p = Punct.RSHIFT; len = 2; }
        } else if (peek(1) === EQ) { p = Punct.GE; len = 2; }
        else { p = Punct.GT; }
        break;
      case EQ:
        if (peek(1) === EQ) { p = Punct.EQEQ; len = 2; }
        else { p = Punct.EQ; }
        break;
      case BANG:
        if (peek(1) === EQ) { p = Punct.NE; len = 2; }
        else { p = Punct.BANG; }
        break;
      case AMP:
        if (peek(1) === AMP) { p = Punct.AMPAMP; len = 2; }
        else if (peek(1) === EQ) { p = Punct.AMP_EQ; len = 2; }
        else { p = Punct.AMP; }
        break;
      case PIPE:
        if (peek(1) === PIPE) { p = Punct.PIPEPIPE; len = 2; }
        else if (peek(1) === EQ) { p = Punct.PIPE_EQ; len = 2; }
        else { p = Punct.PIPE; }
        break;
      case CARET:
        if (peek(1) === EQ) { p = Punct.CARET_EQ; len = 2; }
        else { p = Punct.CARET; }
        break;
      case COLON: p = Punct.COLON; break;
      case HASH:
        if (peek(1) === HASH) { p = Punct.HASH_HASH; len = 2; }
        else { p = Punct.HASH; }
        break;
      default: return false;
    }
    mark();
    advance(len);
    addToken(TokenKind.PUNCT);
    result.tokens[result.tokens.length - 1].punct = p;
    return true;
  }

  function advance(count = 1) { i += count; }
  function advanceLine() { ++line; lineStart = i; }

  function addToken(kind, textOverride) {
    const adjLine = _lineOffsets ? savedLine + lineOffsetAt(_lineOffsets, j) : savedLine;
    const tok = new Token(
      filename,
      adjLine,
      savedColumn,
      kind,
      textOverride !== undefined ? textOverride : decodeText(j, i)
    );
    tok.flags.atBol = bol;
    tok.flags.hasSpace = space;
    result.tokens.push(tok);
    lastTokenWasNewline = kind === TokenKind.NEWLINE;
    bol = false;
    space = false;
  }

  while (i < n && result.errors.length === 0) {
    // Whitespace and comments
    if (bytes[i] === NL && !lastTokenWasNewline) {
      mark();
      addToken(TokenKind.NEWLINE);
      advance();
      advanceLine();
      bol = true;
      // A newline is whitespace: the next token must carry hasSpace so `#`
      // stringization renders one space between tokens split across lines
      // (C11 6.10.3.2p2).
      space = true;
      continue;
    }
    if (isSpaceB(bytes[i])) {
      if (bytes[i] === NL) { advance(); advanceLine(); }
      else { advance(); }
      space = true;
      continue;
    }
    // A comment counts as whitespace (C11 5.1.1.2p1 phase 3): the token
    // after it must carry hasSpace — `#x` stringizes `a/**/b` as "a b",
    // and `#define f/**/(x)` is an object-like macro.
    if (peek() === SLASH && peek(1) === SLASH) {
      while (i < n && bytes[i] !== NL) {
        advance();
      }
      space = true;
      continue;
    }
    if (peek() === SLASH && peek(1) === STAR) {
      advance(2);
      while (i < n && !(peek() === STAR && peek(1) === SLASH)) {
        if (bytes[i] === NL) { advance(); advanceLine(); }
        else { advance(); }
      }
      if (i < n) {
        advance(2);
      } else {
        result.errors.push(
          new LexError("Unterminated comment", filename, line)
        );
      }
      space = true;
      continue;
    }

    mark();

    // String and character literals (including prefixed: L, u, U, u8)
    {
      let prefix = StringPrefix.NONE;
      let isLiteral = false;
      if (bytes[i] === DQUOTE || bytes[i] === SQUOTE) {
        isLiteral = true;
      } else if (bytes[i] === CH_L && (peek(1) === DQUOTE || peek(1) === SQUOTE)) {
        prefix = StringPrefix.PREFIX_L;
        advance();
        isLiteral = true;
      } else if (bytes[i] === CH_U && (peek(1) === DQUOTE || peek(1) === SQUOTE)) {
        prefix = StringPrefix.PREFIX_U;
        advance();
        isLiteral = true;
      } else if (bytes[i] === CH_u) {
        if (peek(1) === SQUOTE || peek(1) === DQUOTE) {
          prefix = StringPrefix.PREFIX_u;
          advance();
          isLiteral = true;
        } else if (peek(1) === CH_8 && peek(2) === DQUOTE) {
          prefix = StringPrefix.PREFIX_u8;
          advance(2);
          isLiteral = true;
        }
      }
      if (isLiteral) {
        const quoteChar = bytes[i];
        if (prefix === StringPrefix.PREFIX_u8 && quoteChar === SQUOTE) {
          result.errors.push(
            new LexError(
              "u8 prefix is not valid for character literals",
              filename,
              line
            )
          );
        }
        advance();
        while (i < n && bytes[i] !== quoteChar) {
          if (bytes[i] === BSLASH) {
            advance(2);
          } else {
            advance();
          }
        }
        if (i < n) {
          advance(); // closing " or '
          const kind =
            quoteChar === DQUOTE ? TokenKind.STRING : TokenKind.CHAR;
          addToken(kind);
          result.tokens[result.tokens.length - 1].flags.stringPrefix = prefix;
        } else {
          result.errors.push(
            new LexError("Unterminated string literal", filename, line)
          );
        }
        continue;
      }
    }

    // Identifiers
    if (isIdentStartB(bytes[i])) {
      advance();
      while (isIdentPartB(peek())) {
        advance();
      }
      addToken(TokenKind.IDENT);
      continue;
    }

    // Preprocessor numbers
    if (isDigitB(bytes[i]) || (bytes[i] === DOT && isDigitB(peek(1)))) {
      advance();
      while (isPpNumberPartB(peek())) {
        const c1 = peek();
        const c2 = peek(1);
        if (
          (c1 === CH_e || c1 === CH_E || c1 === CH_p || c1 === CH_P) &&
          (c2 === PLUS || c2 === MINUS)
        ) {
          advance();
        }
        advance();
      }
      addToken(TokenKind.PP_NUMBER);
      continue;
    }

    // C99 digraphs
    {
      const d0 = peek(),
        d1 = peek(1);
      let handled = false;
      function addDigraph(len, canon, punctId) {
        advance(len);
        const tok = new Token(
          filename,
          savedLine,
          savedColumn,
          TokenKind.PUNCT,
          canon
        );
        tok.flags.atBol = bol;
        tok.flags.hasSpace = space;
        tok.punct = punctId;
        result.tokens.push(tok);
        lastTokenWasNewline = false;
        bol = false;
        space = false;
        handled = true;
      }
      if (d0 === PCT && d1 === COLON) {
        if (peek(2) === PCT && peek(3) === COLON) {
          addDigraph(4, "##", Punct.HASH_HASH);
        } else {
          addDigraph(2, "#", Punct.HASH);
        }
      } else if (d0 === LT && d1 === COLON) {
        addDigraph(2, "[", Punct.LBRACK);
      } else if (d0 === LT && d1 === PCT) {
        addDigraph(2, "{", Punct.LBRACE);
      } else if (d0 === COLON && d1 === GT) {
        addDigraph(2, "]", Punct.RBRACK);
      } else if (d0 === PCT && d1 === GT) {
        addDigraph(2, "}", Punct.RBRACE);
      }
      if (handled) continue;
    }

    // Punctuation
    if (tryPunct()) continue;

    // Character that forms no other token: lex it as an OTHER pp-token
    // (the whole run, for a readable diagnostic) and let the preprocessor
    // diagnose it only if it survives into the parser's token stream.
    {
      let text = "";
      while (i < n && !isSpaceB(bytes[i]) && !isPunctByte(bytes[i])) {
        text += String.fromCharCode(bytes[i]);
        advance();
      }
      addToken(TokenKind.OTHER, text);
    }
  }

  mark();
  addToken(TokenKind.EOS);

  return result;
}

// ====================
// Escape sequence helpers
// ====================

// Unescape one character from a string/char literal.
// `pos` is an object { i: number } used as a mutable cursor into `text`.
// Returns the unescaped byte value (0-255 for narrow, codepoint for wide).
function unescape(text, pos, end) {
  if (pos.i >= end) return 0;

  if (text[pos.i] === "\\") {
    pos.i++; // skip backslash
    if (pos.i >= end) return 0;

    switch (text[pos.i]) {
      case "n":
        pos.i++;
        return 0x0a;
      case "t":
        pos.i++;
        return 0x09;
      case "r":
        pos.i++;
        return 0x0d;
      case "b":
        pos.i++;
        return 0x08;
      case "f":
        pos.i++;
        return 0x0c;
      case "v":
        pos.i++;
        return 0x0b;
      case "a":
        pos.i++;
        return 0x07;
      case "\\":
        pos.i++;
        return 0x5c;
      case "'":
        pos.i++;
        return 0x27;
      case '"':
        pos.i++;
        return 0x22;
      case "x": {
        // Hex: \xHH... (greedy per C11 standard)
        pos.i++;
        let val = 0;
        while (pos.i < end && isxdigit(text[pos.i])) {
          val = (val << 4) | hexVal(text[pos.i++]);
        }
        return val;
      }
      case "u": // \uXXXX
      case "U": {
        // \UXXXXXXXX
        const len = text[pos.i] === "u" ? 4 : 8;
        pos.i++;
        let val = 0;
        for (let k = 0; k < len && pos.i < end && isxdigit(text[pos.i]); ++k) {
          val = (val << 4) | hexVal(text[pos.i++]);
        }
        return val;
      }
      default:
        // Octal: \0, \012, \377, etc.
        if (text[pos.i] >= "0" && text[pos.i] <= "7") {
          let val = text.charCodeAt(pos.i++) - 0x30;
          for (
            let k = 0;
            k < 2 && pos.i < end && text[pos.i] >= "0" && text[pos.i] <= "7";
            ++k
          ) {
            val = (val << 3) | (text.charCodeAt(pos.i++) - 0x30);
          }
          return val;
        }
        // Fallback for unknown escapes
        return text.charCodeAt(pos.i++);
    }
  }

  // Raw character (may be multi-byte for non-ASCII)
  const cp = text.codePointAt(pos.i);
  pos.i += cp > 0xffff ? 2 : 1;
  return cp;
}

// Decode one UTF-8 codepoint from a string (JavaScript strings are UTF-16,
// so we use codePointAt which handles surrogate pairs).
function decodeCodepoint(text, pos, end) {
  if (pos.i >= end) return 0;
  const cp = text.codePointAt(pos.i);
  // Advance past the code point (may be 2 UTF-16 code units for astral planes)
  pos.i += cp > 0xffff ? 2 : 1;
  return cp;
}

// Unescape one character/codepoint from a string literal.
// For escape sequences, delegates to unescape().
// For raw source characters, decodes a full codepoint.
function unescapeCodepoint(text, pos, end) {
  if (text[pos.i] === "\\") return unescape(text, pos, end);
  return decodeCodepoint(text, pos, end);
}

// Value of a narrow character constant's body (text between the quotes,
// cursor range [start, end)). A single character keeps its byte value with
// signed-char semantics on this target ('\xff' == -1). Multi-character
// constants use the GCC/clang packing: each character shifted in from the
// right, wrapping in int32, so only the last 4 characters survive —
// 'SAME' == 0x53414D45. C11 6.4.4.4p10 leaves the value
// implementation-defined; matching GCC is what real-world FourCC-style
// magics expect. The signed-char adjustment deliberately does NOT apply
// to multi-character constants (GCC doesn't apply it either).
function narrowCharConstValue(text, start, end) {
  const pos = { i: start };
  const first = unescape(text, pos, end);
  if (pos.i >= end) {
    return first >= 0x80 && first <= 0xff ? first - 0x100 : first;
  }
  let value = first & 0xff;
  while (pos.i < end) {
    value = ((value << 8) | (unescape(text, pos, end) & 0xff)) | 0;
  }
  return value;
}

// Encode a Unicode codepoint as UTF-16LE bytes, appending to output array.
function encodeUtf16LE(cp, out) {
  if (cp <= 0xffff) {
    out.push(cp & 0xff);
    out.push((cp >> 8) & 0xff);
  } else {
    const adj = cp - 0x10000;
    const hi = 0xd800 + (adj >> 10);
    const lo = 0xdc00 + (adj & 0x3ff);
    out.push(hi & 0xff);
    out.push((hi >> 8) & 0xff);
    out.push(lo & 0xff);
    out.push((lo >> 8) & 0xff);
  }
}

// Encode a Unicode codepoint as UTF-8 bytes, appending to output array.
function encodeUtf8(cp, out) {
  if (cp <= 0x7f) {
    out.push(cp);
  } else if (cp <= 0x7ff) {
    out.push(0xc0 | (cp >> 6));
    out.push(0x80 | (cp & 0x3f));
  } else if (cp <= 0xffff) {
    out.push(0xe0 | (cp >> 12));
    out.push(0x80 | ((cp >> 6) & 0x3f));
    out.push(0x80 | (cp & 0x3f));
  } else {
    out.push(0xf0 | (cp >> 18));
    out.push(0x80 | ((cp >> 12) & 0x3f));
    out.push(0x80 | ((cp >> 6) & 0x3f));
    out.push(0x80 | (cp & 0x3f));
  }
}

// Encode a Unicode codepoint as UTF-32LE bytes, appending to output array.
function encodeUtf32LE(cp, out) {
  out.push(cp & 0xff);
  out.push((cp >> 8) & 0xff);
  out.push((cp >> 16) & 0xff);
  out.push((cp >> 24) & 0xff);
}

// ====================
// Keyword map
// ====================

const KEYWORD_MAP = new Map([
  ["auto", Keyword.AUTO],
  ["break", Keyword.BREAK],
  ["case", Keyword.CASE],
  ["char", Keyword.CHAR],
  ["const", Keyword.CONST],
  ["continue", Keyword.CONTINUE],
  ["default", Keyword.DEFAULT],
  ["do", Keyword.DO],
  ["double", Keyword.DOUBLE],
  ["else", Keyword.ELSE],
  ["enum", Keyword.ENUM],
  ["extern", Keyword.EXTERN],
  ["float", Keyword.FLOAT],
  ["for", Keyword.FOR],
  ["goto", Keyword.GOTO],
  ["if", Keyword.IF],
  ["int", Keyword.INT],
  ["long", Keyword.LONG],
  ["register", Keyword.REGISTER],
  ["return", Keyword.RETURN],
  ["short", Keyword.SHORT],
  ["signed", Keyword.SIGNED],
  ["sizeof", Keyword.SIZEOF],
  ["static", Keyword.STATIC],
  ["struct", Keyword.STRUCT],
  ["switch", Keyword.SWITCH],
  ["typedef", Keyword.TYPEDEF],
  ["union", Keyword.UNION],
  ["unsigned", Keyword.UNSIGNED],
  ["void", Keyword.VOID],
  ["volatile", Keyword.VOLATILE],
  ["while", Keyword.WHILE],
  ["inline", Keyword.INLINE],
  ["restrict", Keyword.RESTRICT],
  ["_Generic", Keyword.GENERIC],
  ["_Static_assert", Keyword.STATIC_ASSERT],
  ["_Noreturn", Keyword.NORETURN],
  ["_Alignof", Keyword.ALIGNOF],
  ["_Alignas", Keyword.ALIGNAS],
  ["_Thread_local", Keyword.THREAD_LOCAL],
  ["typeof", Keyword.TYPEOF],
  ["typeof_unqual", Keyword.TYPEOF_UNQUAL],
  ["__typeof", Keyword.TYPEOF],
  ["__typeof__", Keyword.TYPEOF],
  ["_Bool", Keyword.BOOL],
  ["__import", Keyword.X_IMPORT],
  ["__builtin_va_start", Keyword.X_BUILTIN_VA_START],
  ["__builtin_va_arg", Keyword.X_BUILTIN_VA_ARG],
  ["__builtin_va_end", Keyword.X_BUILTIN_VA_END],
  ["__builtin_va_copy", Keyword.X_BUILTIN_VA_COPY],
  ["__builtin_unreachable", Keyword.X_BUILTIN_UNREACHABLE],
  ["__builtin_abort", Keyword.X_BUILTIN_ABORT],
  ["__builtin_expect", Keyword.X_BUILTIN_EXPECT],
  ["__memory_size", Keyword.X_MEMORY_SIZE],
  ["__memory_grow", Keyword.X_MEMORY_GROW],
  ["__builtin", Keyword.X_BUILTIN],
  ["__require_source", Keyword.X_REQUIRE_SOURCE],
  ["__export", Keyword.X_EXPORT],
  ["__minstack", Keyword.X_MINSTACK],
  ["__wasm", Keyword.X_WASM],
  ["__exception", Keyword.X_EXCEPTION],
  ["__try", Keyword.X_TRY],
  ["__catch", Keyword.X_CATCH],
  ["__throw", Keyword.X_THROW],
  ["__externref", Keyword.X_EXTERNREF],
  ["__refextern", Keyword.X_REFEXTERN],
  ["__struct", Keyword.X_STRUCT_GC],
  ["__array", Keyword.X_ARRAY_GC],
  ["__struct_new", Keyword.X_STRUCT_NEW],
  ["__new", Keyword.X_NEW],
  ["__array_new", Keyword.X_ARRAY_NEW],
  ["__ref_is_null", Keyword.X_REF_IS_NULL],
  ["__ref_eq", Keyword.X_REF_EQ],
  ["__ref_null", Keyword.X_REF_NULL],
  ["__ref_test", Keyword.X_REF_TEST],
  ["__ref_test_null", Keyword.X_REF_TEST_NULL],
  ["__array_len", Keyword.X_ARRAY_LEN],
  ["__array_of", Keyword.X_ARRAY_OF],
  ["__extends", Keyword.X_EXTENDS],
  ["__ref_cast", Keyword.X_REF_CAST],
  ["__ref_cast_null", Keyword.X_REF_CAST_NULL],
  ["__array_fill", Keyword.X_ARRAY_FILL],
  ["__array_copy", Keyword.X_ARRAY_COPY],
  ["__eqref", Keyword.X_EQREF],
  ["__ref_as_extern", Keyword.X_REF_AS_EXTERN],
  ["__ref_as_eq", Keyword.X_REF_AS_EQ],
  ["__cast", Keyword.X_CAST],
  ["__gcstr", Keyword.X_GCSTR],
  ["__attribute__", Keyword.X_ATTRIBUTE],
  ["__attribute", Keyword.X_ATTRIBUTE],
]);

// ====================
// Tokenize (phase 1 + post-processing, without preprocessor)
// ====================

// Multiply by 2^e exactly, splitting the scale so no intermediate step
// overflows or underflows before the final result would.
function ldexpNumber(x, e) {
  while (e > 1000) { x *= Math.pow(2, 1000); e -= 1000; }
  while (e < -1000) { x *= Math.pow(2, -1000); e += 1000; }
  return x * Math.pow(2, e);
}

// Round M * 2^E (M a non-negative BigInt) to the nearest double, ties to
// even — the single correct rounding C11 6.4.4.2p3 requires for hex float
// literals. Handles overflow to Infinity and gradual underflow.
function bigIntTimesPow2ToDouble(M, E) {
  if (M === 0n) return 0;
  while ((M & 1n) === 0n) { M >>= 1n; E++; } // normalize; keeps M small
  const bits = M.toString(2).length;
  const topExp = bits - 1 + E; // floor(log2(value))
  if (topExp > 1023) return Infinity;
  // Normals keep 53 significand bits; subnormals lose one per exponent
  // step below -1022.
  const sigBits = topExp >= -1022 ? 53 : 53 - (-1022 - topExp);
  if (sigBits <= 0) {
    // Below (or at half of) the minimum subnormal: only a value strictly
    // above 2^-1075 rounds up to 2^-1074; a tie rounds to even (zero).
    return (topExp === -1075 && bits > 1) ? Math.pow(2, -1074) : 0;
  }
  const drop = bits - sigBits;
  if (drop <= 0) return ldexpNumber(Number(M), E); // exact
  const kept = M >> BigInt(drop);
  const roundBit = (M >> BigInt(drop - 1)) & 1n;
  const sticky = (M & ((1n << BigInt(drop - 1)) - 1n)) !== 0n;
  const rounded = (roundBit === 1n && (sticky || (kept & 1n) === 1n)) ? kept + 1n : kept;
  return ldexpNumber(Number(rounded), E + drop);
}

// Parse a floating-point literal, including C hex floats (0x1.8p3).
// JS parseFloat doesn't handle hex floats, so we do it manually. The
// mantissa is accumulated as a BigInt and rounded ONCE — parsing the
// fraction through parseInt(.., 16) used to round twice, losing sticky
// bits below the 53rd (hex floats exist for bit-exact constants).
function parseHexFloat(text) {
  // Try standard parseFloat first (handles decimal floats)
  if (!(text.length >= 2 && text[0] === "0" && (text[1] === "x" || text[1] === "X"))) {
    return parseFloat(text);
  }
  // Hex float: 0xHHH.HHHpEEE
  const pIdx = text.indexOf("p") !== -1 ? text.indexOf("p") : text.indexOf("P");
  if (pIdx === -1) return NaN; // hex float requires p/P exponent
  const mantissaStr = text.substring(2, pIdx); // after "0x"
  const expStr = text.substring(pIdx + 1);
  const exp = expStr.length > 0 ? parseInt(expStr, 10) : 0;
  if (Number.isNaN(exp)) return NaN;
  const dotIdx = mantissaStr.indexOf(".");
  const digits = dotIdx === -1
    ? mantissaStr
    : mantissaStr.substring(0, dotIdx) + mantissaStr.substring(dotIdx + 1);
  const fracLen = dotIdx === -1 ? 0 : mantissaStr.length - dotIdx - 1;
  let M;
  try { M = BigInt("0x" + (digits.length > 0 ? digits : "0")); } catch { return NaN; }
  return bigIntTimesPow2ToDouble(M, exp - 4 * fracLen);
}

// C11 6.4.4.1: decode an integer-constant pp-number into its value. Strips
// the u/U/l/L suffixes, then dispatches on prefix: 0x/0X hex, 0b/0B binary
// (C23 / GCC extension), leading-0 octal, else decimal. Returns
// { value: BigInt, unsigned: bool, decimal: bool } or null on a malformed
// constant (e.g. "08") — the caller diagnoses. This is the ONE integer
// decoder: both the lexer's PP_NUMBER→INT resolution and the #if evaluator
// (ConstEval.itemFromPPNumber) funnel through it, so the two contexts can
// never drift (a diverged #if-side copy used to reject 0b constants).
function decodeIntegerLiteral(text) {
  let unsigned = false;
  let end = text.length;
  for (let i = text.length - 1; i > 0; --i) {
    const c = text[i];
    if (c === "u" || c === "U") { unsigned = true; end = i; }
    else if (c === "l" || c === "L") { end = i; }
    else break;
  }
  const numText = text.substring(0, end);
  let value;
  let decimal = false;
  try {
    if (numText === "0") {
      value = 0n;
    } else if (
      numText.length >= 2 &&
      numText[0] === "0" &&
      (numText[1] === "x" || numText[1] === "X" ||
       numText[1] === "b" || numText[1] === "B")
    ) {
      value = BigInt(numText); // hex or binary — BigInt parses both natively
    } else if (numText[0] === "0" && numText.length > 1) {
      value = BigInt("0o" + numText.substring(1)); // octal (throws on 8/9)
    } else {
      value = BigInt(numText);
      decimal = true;
    }
  } catch {
    return null;
  }
  return { value, unsigned, decimal };
}

// Post-process a LexResult: strip newlines, resolve keywords, convert numbers/chars.
// In the full compiler this also runs the preprocessor between lex() and post-processing.
// For now, the preprocessor step is omitted — call postProcess(lex(...)) directly.
function postProcess(lexResult) {
  if (lexResult.errors.length > 0) return lexResult;

  // Strip NEWLINE tokens
  lexResult.tokens = lexResult.tokens.filter(
    (t) => t.kind !== TokenKind.NEWLINE
  );

  for (const t of lexResult.tokens) {
    // (A) IDENT -> KEYWORD
    if (t.kind === TokenKind.IDENT) {
      const kw = KEYWORD_MAP.get(t.text);
      if (kw !== undefined) {
        t.kind = TokenKind.KEYWORD;
        t.keyword = kw;
      }
    }
    // (B) PP_NUMBER -> INT or FLOAT
    else if (t.kind === TokenKind.PP_NUMBER) {
      const text = t.text;
      const isHex =
        text.length >= 2 &&
        text[0] === "0" &&
        (text[1] === "x" || text[1] === "X");
      const isHexFloat =
        isHex && (text.indexOf("p") !== -1 || text.indexOf("P") !== -1);
      let isDouble =
        text.indexOf(".") !== -1 ||
        isHexFloat ||
        (!isHex && (text.indexOf("e") !== -1 || text.indexOf("E") !== -1));
      let isLongLong = false;
      let isLong = false;
      let isFloat = false;
      let isUnsigned = false;

      // Parse suffixes from the end
      for (let si = text.length - 1; si > 0; --si) {
        const c = text[si];
        if (c === "u" || c === "U") {
          isUnsigned = true;
        } else if (c === "l" || c === "L") {
          if (isLong || isLongLong) {
            isLongLong = true;
            isLong = false;
          } else {
            isLong = true;
          }
        } else if ((c === "f" || c === "F") && (!isHex || isHexFloat)) {
          isFloat = true;
        } else {
          break;
        }
      }

      t.flags.isUnsigned = isUnsigned;
      t.flags.isLong = isLong;
      t.flags.isLongLong = isLongLong;
      t.flags.isFloat = isFloat;

      if (isFloat || isDouble) {
        t.kind = TokenKind.FLOAT;
        // Strip type suffixes before parsing
        let floatText = text;
        while (floatText.length > 0) {
          const last = floatText[floatText.length - 1];
          if (last === "f" || last === "F" || last === "l" || last === "L") {
            floatText = floatText.substring(0, floatText.length - 1);
          } else {
            break;
          }
        }
        t.floating = parseHexFloat(floatText);
        if (isNaN(t.floating)) {
          lexResult.errors.push(
            new LexError(
              "Invalid numeric literal: " + text,
              t.filename,
              t.line
            )
          );
        }
      } else {
        t.kind = TokenKind.INT;
        const dec = decodeIntegerLiteral(text);
        if (dec === null) {
          lexResult.errors.push(
            new LexError(
              "Invalid numeric literal: " + text,
              t.filename,
              t.line
            )
          );
        } else {
          t.integer = dec.value;
          t.flags.isDecimal = dec.decimal;
        }
      }
    }
    // (C) Resolve CHAR -> INT
    else if (t.kind === TokenKind.CHAR) {
      const text = t.text;
      let start = 0;
      if (text[start] === "L" || text[start] === "U") start++;
      else if (text[start] === "u") start++;
      start++; // Skip opening '
      const end = text.length - 1; // Skip trailing '

      const isWideChar =
        t.flags.stringPrefix === StringPrefix.PREFIX_L ||
        t.flags.stringPrefix === StringPrefix.PREFIX_u ||
        t.flags.stringPrefix === StringPrefix.PREFIX_U;

      // Narrow constants go through narrowCharConstValue: single chars are
      // signed-char values ((char)0xFF == -1 — without this, `c == '\xff'`
      // can never be true for a char c), multi-char constants pack GCC-style.
      let codepoint;
      if (isWideChar) {
        const pos = { i: start };
        codepoint = unescapeCodepoint(text, pos, end);
      } else {
        codepoint = narrowCharConstValue(text, start, end);
      }
      t.kind = TokenKind.INT;
      t.integer = BigInt(codepoint);
    }
  }

  // Resolve `#pragma pack` (todos/0191): walk the stream keeping the MSVC/gcc
  // pack stack, stamp the alignment cap in effect onto each `struct`/`union`
  // keyword (parseTagSpecifier reads it), and drop the PRAGMA markers so the
  // parser never sees them.
  if (lexResult.tokens.some((t) => t.kind === TokenKind.PRAGMA)) {
    const kept = [];
    let cur = 0;              // current pack cap in bytes (0 = natural)
    const stack = [];
    for (const t of lexResult.tokens) {
      if (t.kind === TokenKind.PRAGMA) {
        const p = t.pragma;
        if (p && p.op === "set") cur = p.n > 0 ? p.n : 0;
        else if (p && p.op === "reset") cur = 0;
        else if (p && p.op === "push") { stack.push(cur); if (p.n != null && p.n > 0) cur = p.n; }
        else if (p && p.op === "pop") { if (stack.length) cur = stack.pop(); }
        continue; // drop the marker
      }
      if (t.kind === TokenKind.KEYWORD &&
          (t.keyword === Keyword.STRUCT || t.keyword === Keyword.UNION)) {
        t.packValue = cur;
      }
      kept.push(t);
    }
    lexResult.tokens = kept;
  }

  return lexResult;
}

// Translation phase 2: splice lines by removing backslash-newline sequences.
// Must be applied before lexing (matches C++ readFile() behavior).
//
// Returns { spliced, lineOffsets }. `lineOffsets` is a sorted array of
// pairs `[splicedOffset, extraLines]` recording how many original lines
// were swallowed BEFORE that point in the spliced output. The lexer
// adds `extraLines` to each token's line number so diagnostics still
// point at the original source line. For sources with no splices,
// `lineOffsets` is `null` (zero-overhead fast path).
function spliceLines(source) {
  // Translation phase 1: map physical line endings to '\n' — CRLF (and lone
  // CR) sources must splice `\`-continuations and count lines identically
  // to LF sources. Every lex path funnels through here, so this is the one
  // normalization point.
  if (source.indexOf("\r") !== -1) source = source.replace(/\r\n?/g, "\n");
  if (source.indexOf("\\\n") === -1) return { spliced: source, lineOffsets: null };
  let spliced = "";
  const lineOffsets = [];
  let skipped = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && i + 1 < source.length && source[i + 1] === "\n") {
      i++; // skip both '\' and '\n'
      skipped++;
      lineOffsets.push([spliced.length, skipped]);
    } else {
      spliced += source[i];
    }
  }
  return { spliced, lineOffsets };
}

// Look up the line-number offset that applies at `splicedOffset` in a
// previously-spliced source. Binary searches a sorted `lineOffsets`
// array of `[splicedOffset, extraLines]` pairs. Returns 0 if the table
// is null/empty or the offset precedes any splice.
function lineOffsetAt(lineOffsets, splicedOffset) {
  if (!lineOffsets || lineOffsets.length === 0) return 0;
  let lo = 0, hi = lineOffsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lineOffsets[mid][0] <= splicedOffset) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : lineOffsets[lo - 1][1];
}

// ====================
// Preprocessor
// ====================

class PPRegistry {
  constructor() {
    this.defines = new Map(); // Map<string, string|null> — name -> value (null = defined but no value)
    this.prelude = "";        // Preprocessor source processed before every translation unit
    this.includePaths = [];   // string[]
    this.sourceBuffers = new Map(); // Map<string, string> — path -> content cache
    this.onceGuards = new Set();    // Set<string> — files with #pragma once
    this.standardHeaders = new Map(); // Map<string, string> — header name -> content
    this.fileReader = null;   // function(path) -> string|null — callback to read files
  }

  loadFile(path) {
    if (this.sourceBuffers.has(path)) return this.sourceBuffers.get(path);
    if (!this.fileReader) return null;
    const content = this.fileReader(path);
    if (content === null) return null;
    this.sourceBuffers.set(path, content);
    return content;
  }
}

function preprocess(filename, initialTokens, ppRegistry) {
  const result = new LexResult();
  const output = [];
  const macros = new Map(); // Map<string, Macro>
  const ifStack = [];       // {active: bool, anyBranchRan: bool}[]
  const includeStack = [filename];

  // --- 1. SEED REGISTRY MACROS ---
  for (const [name, val] of ppRegistry.defines) {
    const m = { isFunctionLike: false, isVariadic: false, params: [], replacement: [] };
    if (val !== null) {
      const lexRes = lex(name, val);
      for (const t of lexRes.tokens) {
        if (t.kind !== TokenKind.EOS) m.replacement.push(t);
      }
    }
    macros.set(name, m);
  }

  // --- 1b. PROCESS PRELUDE ---
  if (ppRegistry.prelude) {
    const preludeLex = lex("<prelude>", ppRegistry.prelude);
    const preludeTokens = preludeLex.tokens.filter(t => t.kind !== TokenKind.EOS);
    initialTokens = [...preludeTokens, ...initialTokens];
  }

  function isActive() {
    return ifStack.length === 0 || ifStack[ifStack.length - 1].active;
  }

  // Compute __DATE__ and __TIME__ once (frozen at translation start per C standard)
  const now = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = now.getDate();
  const dateStr = `"${months[now.getMonth()]} ${day < 10 ? " " : ""}${day} ${now.getFullYear()}"`;
  const pad2 = n => n < 10 ? "0" + n : "" + n;
  const timeStr = `"${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}"`;

  // __COUNTER__ (GNU extension): one counter per preprocess run (= per
  // translation unit, matching gcc), bumped at each expansion.
  let counterValue = 0;

  function isBuiltinMacro(tok) {
    return tok.atIdent("__LINE__") || tok.atIdent("__FILE__") ||
           tok.atIdent("__DATE__") || tok.atIdent("__TIME__") ||
           tok.atIdent("__COUNTER__");
  }

  function tryExpandBuiltinMacro(tok) {
    if (tok.atIdent("__LINE__")) {
      tok.kind = TokenKind.PP_NUMBER;
      tok.text = intern(String(tok.line));
      return true;
    }
    if (tok.atIdent("__COUNTER__")) {
      tok.kind = TokenKind.PP_NUMBER;
      tok.text = intern(String(counterValue++));
      return true;
    }
    if (tok.atIdent("__FILE__")) {
      tok.kind = TokenKind.STRING;
      tok.text = intern('"' + tok.filename + '"');
      return true;
    }
    if (tok.atIdent("__DATE__")) {
      tok.kind = TokenKind.STRING;
      tok.text = intern(dateStr);
      return true;
    }
    if (tok.atIdent("__TIME__")) {
      tok.kind = TokenKind.STRING;
      tok.text = intern(timeStr);
      return true;
    }
    return false;
  }

  // ONE pragma handler for both spellings: the #pragma directive and the
  // _Pragma("...") operator (C11 6.10.9 processes the destringized contents
  // as if they were a #pragma directive). `once` is the only pragma with
  // semantics here; anything else is silently ignored either way.
  function applyPragma(toks, currentFile) {
    if (toks.length > 0 && toks[0].atIdent("once")) {
      ppRegistry.onceGuards.add(currentFile);
    }
  }

  // `#pragma pack` (todos/0191): parse the MSVC/gcc-compatible forms into an
  // op the parser applies to struct layout. Returns a PRAGMA marker token
  // to splice into the stream, or null if `toks` is not a pack pragma.
  //   pack(n)        -> {op:'set', n}
  //   pack()         -> {op:'reset'}      (back to default alignment)
  //   pack(push)     -> {op:'push'}
  //   pack(push, n)  -> {op:'push', n}
  //   pack(pop)      -> {op:'pop'}
  function packPragmaMarker(toks, currentFile, line) {
    if (toks.length === 0 || !toks[0].atIdent("pack")) return null;
    // Collect the tokens inside pack( ... ), ignoring the parentheses.
    const inner = toks.slice(1).filter(
      (t) => !t.atPunct(Punct.LPAREN) && !t.atPunct(Punct.RPAREN) &&
             !t.atPunct(Punct.COMMA));
    let op;
    if (inner.length === 0) {
      op = { op: "reset", n: null };
    } else if (inner[0].atIdent("push")) {
      const n = inner[1] ? parseInt(inner[1].text, 10) : null;
      op = { op: "push", n: Number.isFinite(n) ? n : null };
    } else if (inner[0].atIdent("pop")) {
      op = { op: "pop", n: null };
    } else {
      const n = parseInt(inner[0].text, 10);
      if (!Number.isFinite(n)) return null;
      op = { op: "set", n };
    }
    const marker = new Token(currentFile, line || 0, 0, TokenKind.PRAGMA, "#pragma pack");
    marker.pragma = op;
    return marker;
  }

  // C11 6.10.9p1 destringize: drop any encoding prefix and the quotes,
  // then \" -> " and \\ -> \.
  function destringize(text) {
    const open = text.indexOf('"');
    return text.substring(open + 1, text.length - 1).replace(/\\(["\\])/g, "$1");
  }

  function executePragmaOperator(strTok, currentFile) {
    const lexed = lex(currentFile, destringize(strTok.text));
    const toks = lexed.tokens.filter(tk =>
      tk.kind !== TokenKind.EOS && tk.kind !== TokenKind.NEWLINE);
    applyPragma(toks, currentFile);
    // C11 6.10.9: `_Pragma("pack(1)")` is equivalent to `#pragma pack(1)`.
    return packPragmaMarker(toks, currentFile, strTok.line);
  }

  // Does `tok` name the `defined` operator, directly or through an
  // object-like macro alias chain (`#define D defined`)? gcc/clang honor a
  // `defined` produced by such an expansion inside `#if`/`#elif` — strictly
  // UB per C11 6.10.1p4, but portable config headers rely on it (todos/0195).
  function aliasesToDefined(tok, seen) {
    if (tok.atIdent("defined")) return true;
    if (tok.kind !== TokenKind.IDENT || !macros.has(tok.text) || seen.has(tok.text)) return false;
    const m = macros.get(tok.text);
    if (m.isFunctionLike || m.replacement.length !== 1) return false;
    seen.add(tok.text);
    return aliasesToDefined(m.replacement[0], seen);
  }

  // Resolve `defined` operators on a #if/#elif controlling line BEFORE macro
  // expansion, so the operand is taken literally and never macro-expanded
  // (C11 6.10.1p1). Handles both the literal `defined X`/`defined(X)` forms
  // and a `defined` reached through an object-like alias (todos/0195). The
  // operand identifier is looked up as a macro NAME for defined-ness; it does
  // not go through expansion, so `#define FOO 1` / `#if D(FOO)` sees FOO the
  // name (defined) rather than its replacement 1.
  function resolveDefinedOperators(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (aliasesToDefined(t, new Set())) {
        let j = i + 1, paren = false;
        if (j < tokens.length && tokens[j].atPunct(Punct.LPAREN)) { paren = true; j++; }
        if (j < tokens.length && tokens[j].kind === TokenKind.IDENT) {
          const resultTok = cloneToken(t);
          resultTok.kind = TokenKind.PP_NUMBER;
          resultTok.text = macros.has(tokens[j].text) ? "1" : "0";
          out.push(resultTok);
          i = j;
          if (paren && i + 1 < tokens.length && tokens[i + 1].atPunct(Punct.RPAREN)) i++;
          continue;
        }
        // Malformed `defined` — leave as-is; expand/evaluate reports it.
      }
      out.push(t);
    }
    return out;
  }

  // --- 2. CENTRALIZED EXPANSION HELPER ---
  function expand(tokens, hideset) {
    const expanded = [];
    // Rescan the tail of a freshly produced expansion: if `replacement` ends in
    // a function-like macro NAME whose `( … )` argument list is supplied by the
    // tokens that FOLLOW position `i` in the current stream — i.e. the call was
    // formed only during this expansion, out of the SAME replacement list — apply
    // it. C11 6.10.3.4 requires the fully rescanned sequence to include calls
    // formed after the inner expansion (e.g. `#define IDX(...) SEL_1` selected by
    // a count-dispatch macro, with the `(args)` glued on in the same replacement
    // list — jq's `JV_ARRAY`/`BLOCK` idiom). Shared by BOTH the object-like and
    // function-like branches, since the top-level rescan never sees the
    // `name(args)` pairing when the call site is itself inside another expansion.
    // Mutates `replacement` in place; returns the advanced input index.
    function applyTrailingCall(replacement, hs, i) {
      while (replacement.length > 0) {
        const last = replacement[replacement.length - 1];
        if (last.kind !== TokenKind.IDENT || last.noExpand || !macros.has(last.text) ||
            !macros.get(last.text).isFunctionLike || hs.has(last.text))
          break;
        let k = i + 1;
        while (k < tokens.length && tokens[k].kind === TokenKind.NEWLINE) k++;
        if (k >= tokens.length || !tokens[k].atPunct(Punct.LPAREN)) break;
        const call = [last, tokens[k]];
        let depth = 1, k2 = k + 1;
        while (k2 < tokens.length && depth > 0) {
          const tt = tokens[k2];
          if (tt.atPunct(Punct.LPAREN)) depth++;
          else if (tt.atPunct(Punct.RPAREN)) depth--;
          call.push(tt);
          k2++;
        }
        i = k2 - 1;
        replacement.splice(replacement.length - 1, 1, ...expand(call, new Set(hs)));
      }
      return i;
    }
    for (let i = 0; i < tokens.length; ++i) {
      const t = tokens[i];

      // Special handling for the 'defined' operator
      if (t.atIdent("defined")) {
        let hasParens = false;
        let nextIdx = i + 1;
        if (nextIdx < tokens.length && tokens[nextIdx].atPunct(Punct.LPAREN)) {
          hasParens = true;
          nextIdx++;
        }
        if (nextIdx < tokens.length && tokens[nextIdx].kind === TokenKind.IDENT) {
          const operand = tokens[nextIdx];
          const isDefined = macros.has(operand.text);
          const resultTok = cloneToken(t);
          resultTok.kind = TokenKind.PP_NUMBER;
          resultTok.text = isDefined ? "1" : "0";
          expanded.push(resultTok);
          i = nextIdx;
          if (hasParens && i + 1 < tokens.length && tokens[i + 1].atPunct(Punct.RPAREN)) {
            i++;
          }
          continue;
        }
      }

      // Handle __FILE__ / __LINE__ / __DATE__ / __TIME__ / __COUNTER__
      if (isBuiltinMacro(t)) {
        const tok = cloneToken(t);
        tryExpandBuiltinMacro(tok);
        expanded.push(tok);
        continue;
      }

      // Normal expansion logic
      if (t.kind === TokenKind.IDENT && !t.noExpand && macros.has(t.text) && !hideset.has(t.text)) {
        const m = macros.get(t.text);
        if (!m.isFunctionLike) {
          const nextHideset = new Set(hideset);
          nextHideset.add(t.text);
          const relocated = m.replacement.map(tok => {
            const c = cloneToken(tok);
            c.filename = t.filename;
            c.line = t.line;
            c.column = t.column;
            return c;
          });
          const replacement = expand(relocated, nextHideset);
          // Object-like macro whose expansion ends in a function-like macro
          // name (e.g. `#define h g` where g(a,b) is function-like and `h(2,3)`
          // appears in another macro's replacement list): pull its argument list
          // from the following tokens. See applyTrailingCall.
          i = applyTrailingCall(replacement, hideset, i);
          expanded.push(...replacement);
        } else {
          // Function-style macro: need to check for '(' and collect arguments
          let argStart = i + 1;
          while (argStart < tokens.length && tokens[argStart].kind === TokenKind.NEWLINE)
            argStart++;
          if (argStart < tokens.length && tokens[argStart].atPunct(Punct.LPAREN)) {
            const args = [];
            // Leading-whitespace flag of each argument-separating comma, so a
            // stringized __VA_ARGS__ keeps the space BEFORE the delimiter
            // (`#__VA_ARGS__` of `S(a , b)` is "a , b" — todos/0196).
            // argCommaSpace[k] is the comma between args[k] and args[k+1].
            const argCommaSpace = [];
            let currentArg = [];
            let parenDepth = 1;
            let j = argStart + 1;

            while (j < tokens.length && parenDepth > 0) {
              const argTok = tokens[j];
              if (argTok.kind === TokenKind.NEWLINE) {
                // Skip newlines inside macro arguments
              } else if (argTok.atPunct(Punct.LPAREN)) {
                parenDepth++;
                currentArg.push(argTok);
              } else if (argTok.atPunct(Punct.RPAREN)) {
                parenDepth--;
                if (parenDepth > 0) currentArg.push(argTok);
              } else if (argTok.atPunct(Punct.COMMA) && parenDepth === 1) {
                args.push(currentArg);
                argCommaSpace.push(argTok.flags.hasSpace);
                currentArg = [];
              } else {
                currentArg.push(argTok);
              }
              j++;
            }
            // C11 6.10.3p4: `M()` supplies ONE argument — an empty one —
            // whenever the macro expects any (params or variadic). Failing
            // to record it left the parameter unmapped, so the parameter
            // NAME survived in the expansion and could capture an in-scope
            // variable. Only a zero-parameter macro's `()` is zero args.
            if (currentArg.length > 0 || args.length > 0 ||
                m.params.length > 0 || m.isVariadic) {
              args.push(currentArg);
            }

            // Build parameter-to-argument maps
            const paramMap = new Map();
            const rawParamMap = new Map();
            for (let p = 0; p < m.params.length && p < args.length; ++p) {
              rawParamMap.set(m.params[p], args[p]);
              paramMap.set(m.params[p], expand(args[p], new Set(hideset)));
            }
            if (m.isVariadic) {
              const vaRaw = [];
              const vaArgs = [];
              for (let p = m.params.length; p < args.length; ++p) {
                if (p > m.params.length) {
                  const comma = new Token(null, 0, 0, TokenKind.PUNCT, intern(","));
                  comma.punct = Punct.COMMA;
                  // Carry the original delimiter comma's leading-whitespace bit
                  // so `#__VA_ARGS__` preserves the space before it (todos/0196).
                  comma.flags.hasSpace = argCommaSpace[p - 1] || false;
                  vaRaw.push(comma);
                  vaArgs.push(comma);
                }
                vaRaw.push(...args[p]);
                vaArgs.push(...expand(args[p], new Set(hideset)));
              }
              rawParamMap.set("__VA_ARGS__", [...vaRaw]);
              paramMap.set("__VA_ARGS__", [...vaArgs]);
              // GNU extension: named variadic param also gets all variadic args
              if (m.variadicName) {
                rawParamMap.set(m.variadicName, vaRaw);
                paramMap.set(m.variadicName, vaArgs);
              }
            }

            // Helper: check if position ri is adjacent to ## in a replacement list
            function isAdjacentToPaste(repl, ri) {
              if (ri > 0 && repl[ri - 1].atPunct(Punct.HASH_HASH)) return true;
              if (ri + 1 < repl.length && repl[ri + 1].atPunct(Punct.HASH_HASH)) return true;
              return false;
            }

            // Substitute parameters in a replacement token list. Recurses for
            // __VA_OPT__ content (which may itself reference parameters).
            function substituteTokens(repl) {
              const out = [];
              for (let ri = 0; ri < repl.length; ++ri) {
              const repTok = repl[ri];

              // C23 __VA_OPT__(content): expands content iff the variadic
              // arguments are non-empty.
              if (m.isVariadic && repTok.kind === TokenKind.IDENT &&
                  repTok.text === "__VA_OPT__" &&
                  ri + 1 < repl.length && repl[ri + 1].atPunct(Punct.LPAREN)) {
                let depth = 0, j = ri + 1;
                for (; j < repl.length; j++) {
                  if (repl[j].atPunct(Punct.LPAREN)) depth++;
                  else if (repl[j].atPunct(Punct.RPAREN)) { depth--; if (depth === 0) break; }
                }
                const content = repl.slice(ri + 2, j);
                if (paramMap.get("__VA_ARGS__").length > 0) {
                  out.push(...substituteTokens(content));
                }
                ri = j; // skip past ')'
                continue;
              }

              // GNU extension: `, ## __VA_ARGS__` (also with a named variadic
              // param) deletes the comma when the variadic args are empty.
              // With non-empty args no actual paste happens — the comma and
              // the fully-expanded args are emitted as-is. Without this
              // special case the generic paste pass would merge `,` with the
              // first arg token and drop the rest of the lexed result.
              if (m.isVariadic && repTok.atPunct(Punct.COMMA) &&
                  ri + 2 < repl.length &&
                  repl[ri + 1].atPunct(Punct.HASH_HASH) &&
                  repl[ri + 2].kind === TokenKind.IDENT &&
                  (repl[ri + 2].text === "__VA_ARGS__" ||
                   (m.variadicName && repl[ri + 2].text === m.variadicName))) {
                const vaTokens = paramMap.get(repl[ri + 2].text);
                if (vaTokens.length > 0) {
                  out.push(repTok);
                  out.push(...vaTokens);
                }
                ri += 2; // consume `,` ## param
                continue;
              }

              // Handle # stringification operator
              if (repTok.atPunct(Punct.HASH) && ri + 1 < repl.length &&
                  repl[ri + 1].kind === TokenKind.IDENT &&
                  rawParamMap.has(repl[ri + 1].text)) {
                ri++;
                const rawTokens = rawParamMap.get(repl[ri].text);
                let str = '"';
                for (let ai = 0; ai < rawTokens.length; ++ai) {
                  if (ai > 0 && rawTokens[ai].flags.hasSpace) str += ' ';
                  for (const c of rawTokens[ai].text) {
                    if (c === '"' || c === '\\') str += '\\';
                    str += c;
                  }
                }
                str += '"';
                const strTok = cloneToken(repTok);
                strTok.kind = TokenKind.STRING;
                strTok.text = intern(str);
                out.push(strTok);
                continue;
              }

              if (repTok.kind === TokenKind.IDENT && paramMap.has(repTok.text)) {
                const adjPaste = isAdjacentToPaste(repl, ri);
                const map = adjPaste ? rawParamMap : paramMap;
                const argTokens = map.get(repTok.text);
                if (argTokens.length === 0 && adjPaste) {
                  const pm = cloneToken(repTok);
                  pm.kind = TokenKind.PLACEMARKER;
                  pm.text = "";
                  out.push(pm);
                } else {
                  out.push(...argTokens);
                }
              } else {
                out.push(repTok);
              }
              }
              return out;
            }
            const substituted = substituteTokens(m.replacement);

            // Token pasting (##) pass
            for (let si = 0; si < substituted.length;) {
              if (substituted[si].atPunct(Punct.HASH_HASH) && si > 0 && si + 1 < substituted.length) {
                const left = substituted[si - 1];
                const right = substituted[si + 1];
                if (left.kind === TokenKind.PLACEMARKER && right.kind === TokenKind.PLACEMARKER) {
                  substituted.splice(si, 2);
                } else if (left.kind === TokenKind.PLACEMARKER) {
                  substituted[si - 1] = right;
                  substituted.splice(si, 2);
                } else if (right.kind === TokenKind.PLACEMARKER) {
                  substituted.splice(si, 2);
                } else {
                  const merged = left.text + right.text;
                  const mergedSym = intern(merged);
                  const lexed = lex(left.filename, mergedSym);
                  // C11 6.10.3.3p3: the concatenation must form ONE valid
                  // preprocessing token. It used to take the FIRST lexed
                  // token and silently DROP the rest (`x ## ++` became
                  // plain `x`) — diagnose instead (todos/0227 G22).
                  const isOneToken = lexed.errors.length === 0 &&
                    lexed.tokens.length > 0 && lexed.tokens[0].kind !== TokenKind.EOS &&
                    (lexed.tokens.length < 2 || lexed.tokens[1].kind === TokenKind.EOS);
                  if (isOneToken) {
                    const newTok = cloneToken(lexed.tokens[0]);
                    newTok.filename = left.filename;
                    newTok.line = left.line;
                    newTok.column = left.column;
                    // Stringization spacing (C99 6.10.3.3p4): the pasted
                    // token stands where `left` stood, so it keeps left's
                    // leading-space flag rather than the lexer's default.
                    newTok.flags.hasSpace = left.flags.hasSpace;
                    substituted[si - 1] = newTok;
                    substituted.splice(si, 2);
                  } else {
                    result.errors.push(new LexError(
                      `pasting formed '${merged}', an invalid preprocessing token`,
                      left.filename, left.line));
                    // Recover: drop the '##' and keep both operands.
                    substituted.splice(si, 1);
                  }
                }
              } else {
                si++;
              }
            }

            // Remove surviving placemarker tokens
            for (let si = substituted.length - 1; si >= 0; si--) {
              if (substituted[si].kind === TokenKind.PLACEMARKER) substituted.splice(si, 1);
            }

            // Update replacement token locations to invocation site (clone to avoid mutating shared tokens)
            for (let si = 0; si < substituted.length; si++) {
              substituted[si] = cloneToken(substituted[si]);
              substituted[si].filename = t.filename;
              substituted[si].line = t.line;
              substituted[si].column = t.column;
            }

            // Recursively expand with macro in hideset
            const nextHideset = new Set(hideset);
            nextHideset.add(t.text);
            const expandedResult = expand(substituted, nextHideset);

            // Advance past the macro invocation
            i = j - 1; // -1 because loop will increment
            // The expansion may END in a function-like macro name whose `(args)`
            // are glued on in the SAME replacement list (a count-dispatch
            // selector: `IDX(__VA_ARGS__, …)(__VA_ARGS__)` — jq's JV_ARRAY/BLOCK).
            // Pull them from the following tokens, same as the object-like branch.
            i = applyTrailingCall(expandedResult, hideset, i);
            expanded.push(...expandedResult);
          } else {
            // Function-like macro not followed by '(' - don't expand
            expanded.push(t);
          }
        }
      } else if (t.kind === TokenKind.IDENT && !t.noExpand && hideset.has(t.text) && macros.has(t.text)) {
        // Blue paint (C11 6.10.3.4p2): this occurrence of the name came out
        // of its own macro's expansion, so it is never replaced again — not
        // even when a later rescan with a fresh hideset finds it followed
        // by an argument list. Mark it permanently.
        const painted = cloneToken(t);
        painted.noExpand = true;
        expanded.push(painted);
      } else {
        expanded.push(t);
      }
    }
    return expanded;
  }

  // --- 3. PRATT-STYLE EXPRESSION EVALUATOR ---
  // C11 6.10.1p4: all arithmetic happens at intmax_t/uintmax_t width
  // (itemFromPPNumber types every constant 64-bit). && / || / ?: genuinely
  // short-circuit: the unevaluated operand is still parsed for syntax, but
  // its value is ignored and errors inside it (division by zero, malformed
  // constants) are not diagnosed — `#if 0 && 1/0` is valid C.
  // `onError` receives a message for errors in EVALUATED positions; the
  // expression then poisons to 0 rather than crashing the compiler.
  function evaluateExpression(line, onError) {
    const ZERO = new ConstEval.Item(0n, ConstEval.SIGNED);
    // C11 6.10.1p4: EVERY value in a #if expression is intmax_t/uintmax_t.
    // ConstEval types comparison and logical-! results as int — correct for
    // expression semantics, but here a 32-bit-typed `(1<2)` would wrap a
    // following `<< 31` and reject `<< 35` outright. Retype such results to
    // intmax_t (they are always 0/1, so the retype is exact).
    const asIntmax = (item) =>
      (item.type === ConstEval.SIGNED || item.type === ConstEval.UNSIGNED)
        ? item : new ConstEval.Item(item.value, ConstEval.SIGNED);
    let pos = 0;
    let errored = false;
    function evalFail(msg, evaluating) {
      if (evaluating && !errored) {
        errored = true;
        if (onError) onError(msg);
      }
      return ZERO; // poison value; keep parsing for syntax
    }
    function peek() { return pos < line.length ? line[pos] : null; }
    function consume() { return line[pos++]; }

    function getPrecedence(t) {
      if (!t || t.kind !== TokenKind.PUNCT) return 0;
      if (t.atPunct(Punct.QMARK)) return 1;
      if (t.atPunct(Punct.PIPEPIPE)) return 2;
      if (t.atPunct(Punct.AMPAMP)) return 3;
      if (t.atPunct(Punct.PIPE)) return 4;
      if (t.atPunct(Punct.CARET)) return 5;
      if (t.atPunct(Punct.AMP)) return 6;
      if (t.atPunct(Punct.EQEQ) || t.atPunct(Punct.NE)) return 7;
      if (t.atPunct(Punct.LT) || t.atPunct(Punct.GT) || t.atPunct(Punct.LE) || t.atPunct(Punct.GE)) return 8;
      if (t.atPunct(Punct.LSHIFT) || t.atPunct(Punct.RSHIFT)) return 9;
      if (t.atPunct(Punct.PLUS) || t.atPunct(Punct.MINUS)) return 10;
      if (t.atPunct(Punct.STAR) || t.atPunct(Punct.SLASH) || t.atPunct(Punct.PCT)) return 11;
      return 0;
    }

    const punctToOp = (p) => {
      if (p.atPunct(Punct.PLUS)) return "+"; if (p.atPunct(Punct.MINUS)) return "-";
      if (p.atPunct(Punct.STAR)) return "*"; if (p.atPunct(Punct.SLASH)) return "/";
      if (p.atPunct(Punct.PCT)) return "%"; if (p.atPunct(Punct.AMP)) return "&";
      if (p.atPunct(Punct.PIPE)) return "|"; if (p.atPunct(Punct.CARET)) return "^";
      if (p.atPunct(Punct.LSHIFT)) return "<<"; if (p.atPunct(Punct.RSHIFT)) return ">>";
      if (p.atPunct(Punct.EQEQ)) return "=="; if (p.atPunct(Punct.NE)) return "!=";
      if (p.atPunct(Punct.LT)) return "<"; if (p.atPunct(Punct.GT)) return ">";
      if (p.atPunct(Punct.LE)) return "<="; if (p.atPunct(Punct.GE)) return ">=";
      if (p.atPunct(Punct.AMPAMP)) return "&&"; if (p.atPunct(Punct.PIPEPIPE)) return "||";
      return null;
    };

    function parseBinary(minPrec, evaluating) {
      const t = consume();
      if (!t) return ZERO;

      let left;
      if (t.kind === TokenKind.PP_NUMBER) {
        left = ConstEval.itemFromPPNumber(t.text);
        if (left === null) {
          left = evalFail(`invalid integer constant '${t.text}' in preprocessor expression`, evaluating);
        }
      } else if (t.atPunct(Punct.BANG)) {
        left = asIntmax(ConstEval.unary("!", parseBinary(12, evaluating)));
      } else if (t.atPunct(Punct.MINUS)) {
        left = ConstEval.unary("-", parseBinary(12, evaluating));
      } else if (t.atPunct(Punct.PLUS)) {
        left = ConstEval.unary("+", parseBinary(12, evaluating));
      } else if (t.atPunct(Punct.TILDE)) {
        left = ConstEval.unary("~", parseBinary(12, evaluating));
      } else if (t.atPunct(Punct.LPAREN)) {
        left = parseBinary(0, evaluating);
        const next = peek();
        if (next && next.atPunct(Punct.RPAREN)) consume();
      } else if (t.kind === TokenKind.CHAR) {
        let s = 0;
        const isWide = t.text[s] === "L" || t.text[s] === "U" || t.text[s] === "u";
        if (isWide) s++;
        s++;
        const e = t.text.length - 1;
        // Match the CHAR→INT token resolution: narrow constants get
        // signed-char single-char values and GCC multi-char packing.
        let v;
        if (isWide) {
          const p = { i: s };
          v = s < e ? unescape(t.text, p, e) : 0;
        } else {
          v = narrowCharConstValue(t.text, s, e);
        }
        left = new ConstEval.Item(BigInt(v), ConstEval.SIGNED);
      } else if (t.kind === TokenKind.IDENT) {
        left = ZERO;
      } else if (t.kind === TokenKind.INT) {
        left = new ConstEval.Item(t.integer, t.flags.isUnsigned ? ConstEval.UNSIGNED : ConstEval.SIGNED);
      } else {
        left = ZERO;
      }

      while (true) {
        const op = peek();
        const prec = getPrecedence(op);
        if (prec <= minPrec) break;
        consume();

        if (op.atPunct(Punct.QMARK)) {
          const cond = left.value !== 0n;
          // Only the selected arm is semantically evaluated (6.5.15).
          const thenVal = parseBinary(0, evaluating && cond);
          const next = peek();
          if (next && next.atPunct(Punct.COLON)) consume();
          // The conditional operator is right-associative: parse the else
          // arm with minPrec BELOW '?' so a nested `a ? b : c ? d : e`
          // groups as `a ? b : (c ? d : e)`.
          const elseVal = parseBinary(prec - 1, evaluating && !cond);
          // 6.5.15p5 via 6.10.1p4: the arms undergo the usual arithmetic
          // conversions in intmax space — either arm unsigned makes the
          // result uintmax_t (the Item ctor re-truncates, so a negative
          // signed arm converts to its huge unsigned value).
          const ternType = (thenVal.type === ConstEval.UNSIGNED || elseVal.type === ConstEval.UNSIGNED)
            ? ConstEval.UNSIGNED : ConstEval.SIGNED;
          left = new ConstEval.Item((cond ? thenVal : elseVal).value, ternType);
          continue;
        }

        const opStr = punctToOp(op);
        if (opStr === "&&" || opStr === "||") {
          // Genuine short-circuit (6.5.13/14): parse the right operand for
          // syntax, but only evaluate it when the left doesn't decide.
          const lTrue = left.value !== 0n;
          const rightDecides = (opStr === "&&") ? lTrue : !lTrue;
          const right = parseBinary(prec, evaluating && rightDecides);
          const result = (opStr === "&&") ? (lTrue && right.value !== 0n)
                                          : (lTrue || right.value !== 0n);
          left = new ConstEval.Item(result ? 1n : 0n, ConstEval.SIGNED);
          continue;
        }

        const right = parseBinary(prec, evaluating);
        const r = ConstEval.binary(opStr, left, right);
        left = r !== null ? asIntmax(r)
          : evalFail((opStr === "/" || opStr === "%")
              ? "division by zero in preprocessor expression"
              : `invalid operands to '${opStr}' in preprocessor expression`, evaluating);
      }
      return left;
    }

    return parseBinary(0, true).value;
  }

  // --- 4. INCLUDE RESOLUTION ---
  function resolveAndLex(target, currentFile, angled) {
    const lastSlash = Math.max(currentFile.lastIndexOf("/"), currentFile.lastIndexOf("\\"));
    const baseDir = lastSlash >= 0 ? currentFile.substring(0, lastSlash + 1) : "";

    const loadReal = (fullPath) => {
      const content = ppRegistry.loadFile(fullPath);
      if (content === null) return null;
      const resolved = intern(fullPath);
      const { spliced, lineOffsets } = spliceLines(content);
      return { lexResult: lex(resolved, spliced, lineOffsets), resolvedFile: resolved };
    };

    // Splice line continuations like the real-file path: inline core headers
    // (template literals) already had their backslash-newlines elided by JS,
    // but headers loaded from libc-ext.js (via JSON.parse) keep real
    // backslash-newline continuations (e.g. multi-line macros) that must join.
    const loadStandard = () => {
      if (!ppRegistry.standardHeaders.has(target)) return null;
      const resolved = intern(target);
      const { spliced, lineOffsets } = spliceLines(ppRegistry.standardHeaders.get(target));
      return { lexResult: lex(resolved, spliced, lineOffsets), resolvedFile: resolved };
    };

    // Build the -I search-path list once.
    const incPaths = [];
    for (const p of ppRegistry.includePaths) {
      let path = p;
      if (path.length > 0 && path[path.length - 1] !== "/" && path[path.length - 1] !== "\\")
        path += "/";
      incPaths.push(path + target);
    }

    if (!angled) {
      // Quote include (C11 6.10.2p3): the including file's own directory first,
      // then the -I paths, then the system headers.
      let r = loadReal(baseDir + target);
      if (r) return r;
      for (const fullPath of incPaths) { r = loadReal(fullPath); if (r) return r; }
      return loadStandard();
    }

    // Angle include (C11 6.10.2p2): search only the -I paths and the system
    // headers — NOT the including file's directory. This matters when a
    // project ships a header whose basename collides with a system one (e.g.
    // mGBA's include/mgba-util/string.h next to a common.h that does
    // `#include <string.h>`): the sibling must NOT shadow the real header. As
    // a lenient last resort we still fall back to the including directory so
    // projects that (non-standardly) use `<local.h>` for a same-dir header
    // whose dir isn't on the -I list keep working.
    for (const fullPath of incPaths) { const r = loadReal(fullPath); if (r) return r; }
    const std = loadStandard();
    if (std) return std;
    return loadReal(baseDir + target);
  }

  // rescanTrailingMacros: if expansion result ends with a function-like macro
  // name and source has '(' next, collect args and re-expand
  function rescanTrailingMacros(expanded, state) {
    while (expanded.length > 0 && !state.atEnd && state.peek().atPunct(Punct.LPAREN)) {
      const last = expanded[expanded.length - 1];
      if (last.kind !== TokenKind.IDENT || last.noExpand || !macros.has(last.text) ||
          !macros.get(last.text).isFunctionLike)
        break;
      const combined = [...expanded];
      combined.push(state.consume()); // '('
      let depth = 1;
      while (!state.atEnd && depth > 0) {
        if (state.peek().atPunct(Punct.LPAREN)) depth++;
        else if (state.peek().atPunct(Punct.RPAREN)) depth--;
        combined.push(state.consume());
      }
      expanded.length = 0;
      expanded.push(...expand(combined, new Set()));
    }
  }

  // --- 5. CORE PROCESSING ---
  function processTokens(state) {
    let lineOffset = 0;
    let fileOverride = null;

    function emitToken(tok) {
      if (tok.kind === TokenKind.OTHER) {
        // An "other" pp-token survived preprocessing — only now is it an
        // error (C11 6.4p1; skipped groups/unexpanded macros already
        // dropped theirs).
        result.errors.push(new LexError(
          "Unexpected character: '" + tok.text + "'",
          fileOverride || tok.filename, tok.line + lineOffset));
        return;
      }
      if (lineOffset || fileOverride) {
        tok = cloneToken(tok);
        tok.line = tok.line + lineOffset;
        if (fileOverride) tok.filename = fileOverride;
      }
      output.push(tok);
    }

    // _Pragma produced by macro expansion still takes effect (C11 6.10.9 —
    // it operates wherever it appears in the token stream): intercept
    // `_Pragma ( "..." )` sequences in expansion output instead of emitting.
    function emitExpandedTokens(toks) {
      for (let k = 0; k < toks.length; ++k) {
        const et = toks[k];
        if (et.atIdent("_Pragma") && k + 3 < toks.length &&
            toks[k + 1].atPunct(Punct.LPAREN) &&
            toks[k + 2].kind === TokenKind.STRING &&
            toks[k + 3].atPunct(Punct.RPAREN)) {
          executePragmaOperator(toks[k + 2], state.currentFile);
          k += 3;
          continue;
        }
        emitToken(et);
      }
    }

    while (!state.atEnd) {
      const t = state.peek();

      if (t.atPunct(Punct.HASH) && t.flags.atBol) {
        state.consume();
        if (state.atEnd || state.peek().kind === TokenKind.NEWLINE) continue;

        const dir = state.consume();

        if (dir.atIdent("ifdef") || dir.atIdent("ifndef") || dir.atIdent("if")) {
          let condition = false;
          if (dir.atIdent("ifdef") || dir.atIdent("ifndef")) {
            if (!state.atEnd && state.peek().kind === TokenKind.IDENT) {
              const name = state.consume();
              condition = macros.has(name.text);
              if (dir.atIdent("ifndef")) condition = !condition;
            }
          } else { // #if
            const lineTokens = [];
            while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) {
              lineTokens.push(state.consume());
            }
            // Inside a skipped group, conditionals are only tracked for
            // nesting (C11 6.10p6) — expanding/evaluating them there would
            // diagnose expressions the standard says to ignore.
            if (isActive()) {
              const expandedTokens = expand(resolveDefinedOperators(lineTokens), new Set());
              condition = evaluateExpression(expandedTokens, (msg) =>
                result.errors.push(new LexError(msg, state.currentFile, dir.line))) !== 0n;
            }
          }
          const parentActive = isActive();
          ifStack.push({ active: parentActive && condition, anyBranchRan: condition,
                         sawElse: false,
                         dirName: "#" + dir.text, file: state.currentFile, line: dir.line });
        } else if (dir.atIdent("elif")) {
          if (ifStack.length === 0) {
            result.errors.push(new LexError("#elif without #if", state.currentFile, dir.line));
          } else {
            const lineTokens = [];
            while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) {
              lineTokens.push(state.consume());
            }
            const top = ifStack[ifStack.length - 1];
            // The grammar (C11 6.10.1) puts every elif-group BEFORE the
            // else-group — an #elif after #else is ill-formed even inside a
            // skipped enclosing group (clang/gcc diagnose it there too).
            if (top.sawElse) {
              result.errors.push(new LexError("#elif after #else", state.currentFile, dir.line));
            }
            const parentActive = ifStack.length > 1 ? ifStack[ifStack.length - 2].active : true;
            // Evaluate only when this #elif can actually select a branch:
            // an earlier branch already taken (or a skipped enclosing group)
            // means the expression is ignored per C11 6.10p6.
            let condition = false;
            if (parentActive && !top.anyBranchRan) {
              const expandedTokens = expand(resolveDefinedOperators(lineTokens), new Set());
              condition = evaluateExpression(expandedTokens, (msg) =>
                result.errors.push(new LexError(msg, state.currentFile, dir.line))) !== 0n;
            }
            top.active = parentActive && !top.anyBranchRan && condition;
            if (top.active) top.anyBranchRan = true;
          }
        } else if (dir.atIdent("else")) {
          if (ifStack.length === 0) {
            result.errors.push(new LexError("#else without #if", state.currentFile, dir.line));
          } else {
            const top = ifStack[ifStack.length - 1];
            if (top.sawElse) {
              result.errors.push(new LexError("#else after #else", state.currentFile, dir.line));
            }
            top.sawElse = true;
            const parentActive = ifStack.length > 1 ? ifStack[ifStack.length - 2].active : true;
            top.active = parentActive && !top.anyBranchRan;
            top.anyBranchRan = true;
          }
        } else if (dir.atIdent("endif")) {
          if (ifStack.length === 0) {
            result.errors.push(new LexError("#endif without #if", state.currentFile, dir.line));
          } else {
            ifStack.pop();
          }
        } else if (isActive()) {
          if (dir.atIdent("define")) {
            if (!state.atEnd && state.peek().kind === TokenKind.IDENT) {
              const nameTok = state.consume();
              const m = { isFunctionLike: false, isVariadic: false, variadicName: "", params: [], replacement: [] };
              if (!state.atEnd && state.peek().atPunct(Punct.LPAREN) && !state.peek().flags.hasSpace) {
                m.isFunctionLike = true;
                state.consume(); // '('
                while (!state.atEnd && !state.peek().atPunct(Punct.RPAREN)) {
                  if (state.peek().atPunct(Punct.ELLIPSIS)) {
                    m.isVariadic = true;
                    state.consume();
                    break;
                  }
                  if (state.peek().kind === TokenKind.IDENT) {
                    const name = state.consume().text;
                    // GNU extension: "name..." is a named variadic param
                    if (!state.atEnd && state.peek().atPunct(Punct.ELLIPSIS)) {
                      m.isVariadic = true;
                      m.variadicName = name;
                      state.consume(); // consume "..."
                      break;
                    }
                    m.params.push(name);
                  }
                  if (!state.atEnd && state.peek().atPunct(Punct.COMMA)) state.consume();
                }
                if (!state.atEnd) state.consume(); // ')'
              }
              while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE)
                m.replacement.push(state.consume());
              // C11 6.10.3.2p1 (todos/0227 G22): in a FUNCTION-LIKE macro
              // every '#' must be followed by a parameter (or, C23,
              // __VA_OPT__). A trailing/misapplied '#' used to be accepted
              // and expand as a literal '#'. Object-like macros keep '#'
              // as an ordinary token (`#define HASH #`).
              if (m.isFunctionLike) {
                const stringizable = (tok) => tok && tok.kind === TokenKind.IDENT &&
                  (m.params.includes(tok.text) ||
                   (m.isVariadic && (tok.text === "__VA_ARGS__" ||
                                     tok.text === "__VA_OPT__" ||
                                     (m.variadicName && tok.text === m.variadicName))));
                for (let ri = 0; ri < m.replacement.length; ri++) {
                  if (m.replacement[ri].atPunct(Punct.HASH) && !stringizable(m.replacement[ri + 1])) {
                    result.errors.push(new LexError(
                      "'#' is not followed by a macro parameter",
                      state.currentFile, dir.line));
                    break;
                  }
                }
              }
              // C11 6.10.3.3p1: '##' shall not be the first or last token
              // of any replacement list.
              if (m.replacement.length > 0 &&
                  (m.replacement[0].atPunct(Punct.HASH_HASH) ||
                   m.replacement[m.replacement.length - 1].atPunct(Punct.HASH_HASH))) {
                result.errors.push(new LexError(
                  "'##' cannot appear at either end of a macro expansion",
                  state.currentFile, dir.line));
              }
              macros.set(nameTok.text, m);
            }
          } else if (dir.atIdent("undef")) {
            if (!state.atEnd && state.peek().kind === TokenKind.IDENT) {
              const name = state.consume();
              macros.delete(name.text);
            }
          } else if (dir.atIdent("include")) {
            if (!state.atEnd) {
              const lineTokens = [];
              while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) {
                lineTokens.push(state.consume());
              }
              let tokensToUse = lineTokens;
              if (tokensToUse.length > 0 && tokensToUse[0].kind !== TokenKind.STRING &&
                  !tokensToUse[0].atPunct(Punct.LT)) {
                tokensToUse = expand(tokensToUse, new Set());
              }
              let rawPath;
              if (tokensToUse.length === 0) {
                result.errors.push(new LexError("Empty #include directive", state.currentFile, dir.line));
                // skip to newline
                while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) state.consume();
                if (!state.atEnd) state.consume();
                continue;
              }
              const angledInclude = tokensToUse[0].atPunct(Punct.LT);
              if (tokensToUse[0].kind === TokenKind.STRING) {
                const sv = tokensToUse[0].text;
                rawPath = sv.substring(1, sv.length - 1);
              } else if (tokensToUse[0].atPunct(Punct.LT)) {
                rawPath = "";
                for (let ti = 1; ti < tokensToUse.length; ++ti) {
                  if (tokensToUse[ti].atPunct(Punct.GT)) break;
                  rawPath += tokensToUse[ti].text;
                }
              } else {
                result.errors.push(new LexError("Expected string or <...> in #include", state.currentFile, dir.line));
                while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) state.consume();
                if (!state.atEnd) state.consume();
                continue;
              }
              const includeRes = resolveAndLex(rawPath, state.currentFile, angledInclude);
              if (!includeRes) {
                let msg = "Could not find include file: " + rawPath;
                if (ppRegistry.extProvidedHeaders &&
                    ppRegistry.extProvidedHeaders.indexOf(rawPath) >= 0 &&
                    !ppRegistry.standardHeaders.has(rawPath)) {
                  msg += " (provided by the optional libc-ext.js, which is not present)";
                }
                result.errors.push(new LexError(msg, state.currentFile, dir.line));
              } else if (ppRegistry.onceGuards.has(includeRes.resolvedFile)) {
                // #pragma once: skip
              } else {
                let circular = false;
                for (const s of includeStack) {
                  if (s === includeRes.resolvedFile) circular = true;
                }
                if (circular) {
                  result.warnings.push(new LexError("Circular include detected", state.currentFile, dir.line));
                } else {
                  includeStack.push(includeRes.resolvedFile);
                  const toks = includeRes.lexResult.tokens;
                  const nextState = makePPState(includeRes.resolvedFile, toks, 0, toks.length);
                  const ifDepthBefore = ifStack.length;
                  processTokens(nextState);
                  // A conditional opened in an included file must close in
                  // that file (C11 6.10.2). Pop leaked frames so a dangling
                  // false branch can't swallow the rest of the includer.
                  while (ifStack.length > ifDepthBefore) {
                    const frame = ifStack.pop();
                    result.errors.push(new LexError(
                      `unterminated ${frame.dirName || "#if"} — missing #endif`,
                      frame.file || includeRes.resolvedFile, frame.line || 0));
                  }
                  includeStack.pop();
                }
              }
            }
          } else if (dir.atIdent("warning") || dir.atIdent("error")) {
            let msg = "";
            while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) {
              if (msg.length > 0) msg += " ";
              msg += state.consume().text;
            }
            if (dir.atIdent("error")) {
              result.errors.push(new LexError(msg, state.currentFile, dir.line));
            }
          } else if (dir.atIdent("line")) {
            if (!state.atEnd && state.peek().kind === TokenKind.PP_NUMBER) {
              const numTok = state.consume();
              const newLine = parseInt(numTok.text, 10);
              lineOffset = newLine - dir.line - 1;
              if (!state.atEnd && state.peek().kind === TokenKind.STRING) {
                const sv = state.consume().text;
                if (sv.length >= 2 && sv[0] === '"' && sv[sv.length - 1] === '"') {
                  fileOverride = intern(sv.substring(1, sv.length - 1));
                }
              }
            }
          } else if (dir.atIdent("pragma")) {
            const lineTokens = [];
            while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE)
              lineTokens.push(state.consume());
            applyPragma(lineTokens, state.currentFile);
            const packMarker = packPragmaMarker(lineTokens, state.currentFile, dir.line);
            if (packMarker) output.push(packMarker);
          } else if (dir.kind === TokenKind.IDENT) {
            // C11 6.10p1: a '#' line whose first token names no directive
            // is a non-directive — a constraint violation clang/gcc
            // diagnose; it used to be silently ignored (todos/0227 G22).
            // Non-IDENT forms stay accepted: `# 1 "file.c"` GNU line
            // markers (PP_NUMBER) appear in preprocessed input, and the
            // null directive (`#` alone) was consumed above. Only fires
            // in ACTIVE groups — unknown directives in skipped
            // conditional blocks are ignored per 6.10p6.
            result.errors.push(new LexError(
              `invalid preprocessing directive '#${dir.text}'`,
              state.currentFile, dir.line));
          }
        }

        // Skip until end of line to finish processing the directive
        while (!state.atEnd && state.peek().kind !== TokenKind.NEWLINE) state.consume();
        if (!state.atEnd) state.consume(); // consume NEWLINE
        continue;
      }

      if (isActive()) {
        // Handle __FILE__ / __LINE__ / __DATE__ / __TIME__ / __COUNTER__
        if (isBuiltinMacro(t)) {
          let tok = cloneToken(state.consume());
          if (lineOffset) tok.line = tok.line + lineOffset;
          if (fileOverride) tok.filename = fileOverride;
          tryExpandBuiltinMacro(tok);
          output.push(tok);
          continue;
        }
        // C99 _Pragma operator
        if (t.atIdent("_Pragma") && !state.atEnd) {
          state.consume();
          if (state.peek().atPunct(Punct.LPAREN)) {
            state.consume();
            if (!state.atEnd && state.peek().kind === TokenKind.STRING) {
              const packMarker = executePragmaOperator(state.consume(), state.currentFile);
              if (packMarker) output.push(packMarker);
              if (!state.atEnd && state.peek().atPunct(Punct.RPAREN)) {
                state.consume();
              }
            }
          }
          continue;
        }
        if (t.kind === TokenKind.IDENT && macros.has(t.text)) {
          const m = macros.get(t.text);
          if (m.isFunctionLike) {
            const invocation = [];
            invocation.push(state.consume()); // macro name
            // The '(' may sit on the next line — an invocation spans
            // newlines (C11 6.10.3p10, expand() already skips them when
            // collecting arguments). NEWLINE tokens are dropped by this
            // loop anyway, so consuming them is behavior-neutral even
            // when no '(' follows and the name is emitted unexpanded.
            while (!state.atEnd && state.peek().kind === TokenKind.NEWLINE) state.consume();
            if (!state.atEnd && state.peek().atPunct(Punct.LPAREN)) {
              invocation.push(state.consume()); // '('
              let parenDepth = 1;
              while (!state.atEnd && parenDepth > 0) {
                const argTok = state.peek();
                if (argTok.atPunct(Punct.LPAREN)) parenDepth++;
                else if (argTok.atPunct(Punct.RPAREN)) parenDepth--;
                invocation.push(state.consume());
              }
              const expandedTokens = expand(invocation, new Set());
              rescanTrailingMacros(expandedTokens, state);
              emitExpandedTokens(expandedTokens);
            } else {
              emitToken(invocation[0]);
            }
          } else {
            // Object-like macro: consume BEFORE rescan
            state.consume();
            const expandedTokens = expand([t], new Set());
            rescanTrailingMacros(expandedTokens, state);
            emitExpandedTokens(expandedTokens);
          }
        } else if (t.kind !== TokenKind.NEWLINE) {
          emitToken(state.consume());
        } else {
          state.consume();
        }
      } else {
        state.consume();
      }
    }
  }

  const initialState = makePPState(filename, initialTokens, 0, initialTokens.length);
  processTokens(initialState);

  // An #if left open at end of input is ill-formed (C11 6.10.1) — and worse
  // than a syntax nit: a dangling false branch silently discards the rest of
  // the file. Report each unmatched conditional at its opening directive.
  for (const frame of ifStack) {
    result.errors.push(new LexError(
      `unterminated ${frame.dirName || "#if"} — missing #endif`,
      frame.file || filename, frame.line || 0));
  }

  result.tokens = output;
  return result;
}

// PPState helper — wraps an array of tokens with a cursor
function makePPState(currentFile, tokens, start, end) {
  let idx = start;
  return {
    currentFile,
    get atEnd() { return idx >= end || tokens[idx].kind === TokenKind.EOS; },
    peek() { return tokens[idx]; },
    consume() { return tokens[idx++]; },
  };
}

// Clone a Token (shallow copy)
function cloneToken(t) {
  const c = new Token(t.filename, t.line, t.column, t.kind, t.text);
  c.integer = t.integer;
  c.floating = t.floating;
  c.keyword = t.keyword;
  c.punct = t.punct;
  if (t.noExpand) c.noExpand = true; // blue paint survives cloning
  c.flags = new TokenFlags();
  c.flags.atBol = t.flags.atBol;
  c.flags.hasSpace = t.flags.hasSpace;
  c.flags.isUnsigned = t.flags.isUnsigned;
  c.flags.isLong = t.flags.isLong;
  c.flags.isLongLong = t.flags.isLongLong;
  c.flags.isFloat = t.flags.isFloat;
  c.flags.isDecimal = t.flags.isDecimal;
  c.flags.stringPrefix = t.flags.stringPrefix;
  return c;
}

// Convenience: splice + lex + preprocess + post-process
function tokenize(filename, source, ppRegistry) {
  const { spliced, lineOffsets } = spliceLines(source);
  const lexResult = lex(filename, spliced, lineOffsets);
  if (lexResult.errors.length > 0) return lexResult;
  if (ppRegistry) {
    const ppResult = preprocess(filename, lexResult.tokens, ppRegistry);
    if (ppResult.errors.length > 0) return ppResult;
    return postProcess(ppResult);
  }
  return postProcess(lexResult);
}

// ====================
// Token formatting
// ====================

function formatToken(t) {
  let s = `${t.filename}:${t.line}:${t.column} ${t.kind} ${JSON.stringify(t.text)}`;
  if (t.kind === TokenKind.INT) {
    s += ` ${t.integer}`;
    if (t.flags.isUnsigned) s += "u";
    if (t.flags.isLongLong) s += "ll";
    else if (t.flags.isLong) s += "l";
  } else if (t.kind === TokenKind.FLOAT) {
    // Print float as hex bytes for exact comparison with C++
    const buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = t.floating;
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, "0");
    s += ` ${hex}`;
    if (t.flags.isFloat) s += "f";
    else if (t.flags.isLong) s += "l";
  } else if (t.kind === TokenKind.KEYWORD) {
    s += ` ${t.keyword}`;
  } else if (t.kind === TokenKind.STRING) {
    const prefixNames = { 1: "L", 2: "u", 3: "U", 4: "u8" };
    if (t.flags.stringPrefix !== StringPrefix.NONE) {
      s += ` prefix=${prefixNames[t.flags.stringPrefix]}`;
    }
  }
  return s;
}

return {
  intern, TokenKind, Keyword, Punct, StringPrefix, TokenFlags, Token, Loc, LexError, LexResult,
  lex, unescape, decodeCodepoint, unescapeCodepoint, encodeUtf16LE, encodeUtf32LE,
  parseHexFloat, decodeIntegerLiteral, postProcess, spliceLines, PPRegistry,
  preprocess, cloneToken, tokenize, formatToken, encodeUtf8,
};
})();

// ====================
// Parser — Type System
// ====================

const Types = (() => {

const TagKind = Object.freeze({
  STRUCT: "struct", UNION: "union", ENUM: "enum",
  GC_STRUCT: "gc_struct",
});

const StorageClass = Object.freeze({
  NONE: "none", AUTO: "auto", REGISTER: "register",
  STATIC: "static", EXTERN: "extern", TYPEDEF: "typedef", IMPORT: "import",
});

const AllocClass = Object.freeze({ REGISTER: "register", MEMORY: "memory" });

const LabelKind = Object.freeze({ FORWARD: "forward", LOOP: "loop", BOTH: "both" });

const IntrinsicKind = Object.freeze({
  VA_START: "va_start", VA_ARG: "va_arg", VA_END: "va_end", VA_COPY: "va_copy",
  MEMORY_SIZE: "memory_size", MEMORY_GROW: "memory_grow",
  MEMORY_COPY: "memory_copy", MEMORY_FILL: "memory_fill",
  HEAP_BASE: "heap_base", ALLOCA: "alloca", UNREACHABLE: "unreachable",
  REF_IS_NULL: "ref_is_null", REF_EQ: "ref_eq", REF_NULL: "ref_null",
  REF_TEST: "ref_test", REF_TEST_NULL: "ref_test_null",
  REF_CAST: "ref_cast", REF_CAST_NULL: "ref_cast_null",
  ARRAY_LEN: "array_len", GC_NEW_ARRAY: "gc_new_array",
  ARRAY_FILL: "array_fill", ARRAY_COPY: "array_copy",
  REF_AS_EXTERN: "ref_as_extern", REF_AS_EQ: "ref_as_eq",
  CAST: "cast", GC_STR: "gc_str",
});

const BopStr = Object.freeze({
  ADD: "+", SUB: "-", MUL: "*", DIV: "/", MOD: "%",
  EQ: "==", NE: "!=", LT: "<", GT: ">", LE: "<=", GE: ">=",
  LAND: "&&", LOR: "||", BAND: "&", BOR: "|", BXOR: "^", SHL: "<<", SHR: ">>",
  ASSIGN: "=", ADD_ASSIGN: "+=", SUB_ASSIGN: "-=", MUL_ASSIGN: "*=",
  DIV_ASSIGN: "/=", MOD_ASSIGN: "%=", BAND_ASSIGN: "&=", BOR_ASSIGN: "|=",
  BXOR_ASSIGN: "^=", SHL_ASSIGN: "<<=", SHR_ASSIGN: ">>=",
});

const UopStr = Object.freeze({
  OP_POS: "+", OP_NEG: "-", OP_LNOT: "!", OP_BNOT: "~",
  OP_DEREF: "*", OP_ADDR: "&",
  OP_PRE_INC: "++pre", OP_PRE_DEC: "--pre",
  OP_POST_INC: "post++", OP_POST_DEC: "post--",
});

// Type system: an abstract base + per-kind subclasses.
//
// Identity comparison by reference. The factory functions below ensure
// canonical instances (one PointerType per pointee, one ArrayType per
// (elem, size), etc.), so `t1 === t2` is meaningful for structural equality.
//
// To narrow a type, use `instanceof XType` for parametric/aggregate kinds
// (`PointerType`, `ArrayType`, `TagType`, `GCStructHeapType`, ...) or `===`
// identity against the singletons (`t === Types.TINT`, `t === Types.TVOID`,
// etc.) for primitive and ref-singleton kinds. Predicate methods on
// `TypeInfo` (`isInteger`, `isPointer`, `isVoid`, ...) wrap the common ones.
class TypeInfo {
  constructor(size, align, isComplete) {
    this.size = size;
    this.align = align;
    this.isComplete = isComplete;
    this.isConst = false;
    this.isVolatile = false;
    // Cache slots that can hang on any type:
    //   _pointer        — `T *` for this T
    //   _constVariant   — `const T` (or its non-const sibling)
    //   _volatileVariant — `volatile T` (or its non-volatile sibling)
    //   _arrayCache     — Map<size, ArrayType> for arrays of this element type
    //   _funcTypeCache  — nested Map for function types with this return type
    //   _gcArrayCache   — single GCArrayType for this element type
    this._pointer = null;
    this._constVariant = null;
    this._volatileVariant = null;
    this._arrayCache = null;
    this._funcTypeCache = null;
    this._gcArrayCache = null;
  }

  // ------------- Field accessors --------------------------------------
  // Most kind-specific data (baseType, arraySize, returnType, paramTypes,
  // tagName, tagDecl, ...) lives only on the subclass that uses it. Generic
  // code typically guards with a kind/instanceof check before reading. The
  // getters below are intentionally not defined on the base — accessing them
  // on a type that doesn't carry the field returns `undefined`, which the
  // existing `?.` / `||` patterns at call sites handle gracefully.
  getBaseType()   { return this.baseType; }
  getReturnType() { return this.returnType; }
  getParamTypes() { return this.paramTypes || []; }

  // ------------- Predicates ---------------------------------------------
  // Defaults are false on the abstract base; the relevant subclass overrides.
  // E.g. `isInteger()` is true on IntegerType, `isFloatingPoint()` on
  // FloatingType, `isVoid()` on VoidType, etc.
  isInteger()    { return false; }
  isUnsigned()   { return false; }
  isFloatingPoint() { return false; }
  isArithmetic() { return this.isInteger() || this.isFloatingPoint(); }
  isScalar()     { return this.isArithmetic() || this.isPointer(); }
  isPointer()    { return false; }
  isArray()      { return false; }
  isFunction()   { return false; }
  isVoid()       { return false; }
  isDivergent()  { return false; }
  isTag()        { return false; }
  isStruct()     { return false; }
  isUnion()      { return false; }
  isEnum()       { return false; }
  isAggregate()  { return false; }
  isRef()        { return false; }
  isGCRef()      { return false; }
  isGCStruct()       { return false; }
  isGCStructHeap()   { return false; }
  isGCStructRefOrHeap() { return this.isGCStruct() || this.isGCStructHeap(); }
  isGCArray()    { return false; }
  // Normalize a GC struct (heap or ref) to its heap form. Returns null for
  // non-GC-struct types. Refs delegate metadata (tagDecl, parentType,
  // isComplete) to their heap, so most ref-form code never needs this.
  gcHeap()       { return null; }
  // True for any concrete GC type that has a wasm type index — heap form
  // structs, ref form structs (which share the heap's index), and GC arrays.
  // Codegen uses this at entry points (cToWasmType / getBinaryWasmType) to
  // dispatch to `getOrCreateGCWasmTypeIdx`.
  isWasmGCType() { return false; }

  // The value of the sizeof OPERATOR applied to this type (todos/0227 G21):
  // void and function types yield 1 — the GNU extension, matching the
  // void*-arithmetic stride-1 choice — while `.size` stays 0 for them
  // because layout math relies on that. Incomplete types are a constraint
  // violation diagnosed in the parser before any reader gets here; a
  // COMPLETE zero-size type (GNU empty struct) genuinely yields 0.
  sizeofResult() { return this.isVoid() || this.isFunction() ? 1 : this.size; }

  // ------------- Qualifiers ---------------------------------------------
  // Per-subclass clone — used by toggleConst/toggleVolatile to construct a
  // sibling with flipped qualifier. Each subclass implements this so the
  // sibling carries the right kind-specific fields.
  _cloneForQualifier() { throw new Error(`${this.constructor.name}._cloneForQualifier not implemented`); }

  toggleConst() {
    if (this._constVariant) return this._constVariant;
    const c = this._cloneForQualifier();
    c.isConst = !this.isConst;
    c.isVolatile = this.isVolatile;
    c._constVariant = this;
    this._constVariant = c;
    c._volatileVariant = this._volatileVariant?._constVariant || null;
    return c;
  }
  addConst()    { return this.isConst ? this : this.toggleConst(); }
  removeConst() { return this.isConst ? this.toggleConst() : this; }

  toggleVolatile() {
    if (this._volatileVariant) return this._volatileVariant;
    const v = this._cloneForQualifier();
    v.isVolatile = !this.isVolatile;
    v.isConst = this.isConst;
    v._volatileVariant = this;
    this._volatileVariant = v;
    return v;
  }
  addVolatile() { return this.isVolatile ? this : this.toggleVolatile(); }

  removeQualifiers() {
    let t = this;
    if (t.isConst) t = t.toggleConst();
    if (t.isVolatile) t = t.toggleVolatile();
    return t;
  }

  // ------------- Conversions / construction -----------------------------
  // Standard `T → T*`. ArrayType.decay() produces `T*` from `T[]`,
  // FunctionType.decay() produces `Fn*`. Others return self.
  decay() { return this; }

  // `T → T*`. Default builds a PointerType. GC kinds override.
  pointer() {
    if (this._pointer) return this._pointer;
    const p = new PointerType(this);
    this._pointer = p;
    return p;
  }

  // ------------- Pretty-printing / structural compare -------------------
  toString() {
    let out = "";
    if (this.isConst) out += "const ";
    if (this.isVolatile) out += "volatile ";
    out += this._toString();
    return out;
  }
  // Subclass override: kind-specific spelling without qualifiers.
  // Subclasses must implement; the abstract base intentionally throws.
  _toString() { throw new Error(`${this.constructor.name}._toString not implemented`); }

  // Top-level structural equality. Common shape: same class, same qualifiers,
  // then per-subclass `_eqStructure`. Identity (===) short-circuits since
  // factories canonicalize.
  isCompatibleWith(other, _seen) {
    if (this === other) return true;
    if (!other || this.constructor !== other.constructor) return false;
    if (this.isConst !== other.isConst || this.isVolatile !== other.isVolatile) return false;
    return this._eqStructure(other, _seen);
  }
  // Subclass override: structural comparison given matching class + qualifiers.
  // Default true — singleton primitives that reach here are equal because
  // identity already matched above.
  _eqStructure(_other, _seen) { return true; }
}

// Most primitive numeric types (BOOL/CHAR/INT/FLOAT/...) and the special
// non-numeric singletons (VOID/AUTO/DIVERGENT/UNKNOWN). All have fixed
// size+align and no kind-specific fields.
// Abstract: any type that doesn't carry kind-specific structure (no
// baseType, no params, no fields). Subclasses are the concrete primitive
// categories: IntegerType, FloatingType, VoidType, AutoType, UnknownType,
// DivergentType. They share the trivial qualifier-clone idiom — each
// concrete subclass is also the cloning factory for its own kind.
class PrimitiveType extends TypeInfo {
  constructor(size, align, isComplete) {
    super(size, align, isComplete);
  }
  // Two primitive instances of the same class but different identity (e.g.
  // TINT vs TUINT — both IntegerType, distinct singletons) are NOT
  // compatible. The base `isCompatibleWith` short-circuits true on identity,
  // so reaching `_eqStructure` means they're different — return false.
  _eqStructure(_other, _seen) { return false; }
}

// Integer types: bool, char, signed/unsigned char/short/int/long/long long.
// `isSigned` distinguishes the signedness of a given width. `name` is the C
// spelling used by `toString()` (e.g. `"int"`, `"_Bool"`, `"unsigned long"`).
class IntegerType extends PrimitiveType {
  constructor(name, size, align, isSigned) {
    super(size, align, true);
    this.name = name;
    this.isSigned = isSigned;
    Object.seal(this);
  }
  isInteger()  { return true; }
  isUnsigned() { return !this.isSigned; }
  _toString()  { return this.name; }
  _cloneForQualifier() { return new IntegerType(this.name, this.size, this.align, this.isSigned); }
}

// Floating-point types: float, double, long double.
class FloatingType extends PrimitiveType {
  constructor(name, size, align) {
    super(size, align, true);
    this.name = name;
    Object.seal(this);
  }
  isFloatingPoint() { return true; }
  _toString() { return this.name; }
  _cloneForQualifier() { return new FloatingType(this.name, this.size, this.align); }
}

// `void`. Singleton; carried through pointer types as `void *` etc.
// Has size/align of 0 and isComplete = false (cannot be a value type).
class VoidType extends PrimitiveType {
  constructor() {
    super(0, 0, false);
    Object.seal(this);
  }
  isVoid()    { return true; }
  _toString() { return "void"; }
  _cloneForQualifier() { return new VoidType(); }
}

// C23 `auto`: parser sentinel during decl-spec, replaced with the inferred
// type once the initializer is known. Identity-compared (`t === TAUTO`).
class AutoType extends PrimitiveType {
  constructor() {
    super(0, 0, false);
    Object.seal(this);
  }
  _toString() { return "auto"; }
  _cloneForQualifier() { return new AutoType(); }
}

// `unknown` — placeholder for "no type known yet" in early parse stages.
// Identity-compared sentinel.
class UnknownType extends PrimitiveType {
  constructor() {
    super(0, 0, false);
    Object.seal(this);
  }
  _toString() { return "unknown"; }
  _cloneForQualifier() { return new UnknownType(); }
}

// Bottom type for error recovery. Operations that combine types
// (usual-arithmetic, computeBinaryType, maybeImplicitCast) treat any
// divergent operand as absorbing — the result is divergent.
class DivergentType extends PrimitiveType {
  constructor() {
    super(0, 0, false);
    Object.seal(this);
  }
  isDivergent() { return true; }
  _toString()   { return "divergent"; }
  _cloneForQualifier() { return new DivergentType(); }
}

// `T *` — a C pointer to T. Always 4 bytes (wasm32).
class PointerType extends TypeInfo {
  constructor(baseType) {
    super(4, 4, true);
    this.baseType = baseType;
    Object.seal(this);
  }
  isPointer() { return true; }
  _toString() { return "*" + this.baseType.toString(); }
  _eqStructure(other, seen) { return this.baseType.isCompatibleWith(other.baseType, seen); }
  _cloneForQualifier() { return new PointerType(this.baseType); }
}

// `T[N]` — a C array of N elements of T (linear memory). N=0 marks an
// incomplete array (e.g., `extern int a[];`).
class ArrayType extends TypeInfo {
  constructor(baseType, size) {
    super(baseType.size * size, baseType.align, size > 0);
    this.baseType = baseType;
    this.arraySize = size;
    Object.seal(this);
  }
  isArray() { return true; }
  isAggregate() { return true; }
  decay() { return this.baseType.pointer(); }
  _toString() { return "[" + this.arraySize + "]" + this.baseType.toString(); }
  _eqStructure(other, seen) {
    if (!this.baseType.isCompatibleWith(other.baseType, seen)) return false;
    return this.arraySize === 0 || other.arraySize === 0 || this.arraySize === other.arraySize;
  }
  _cloneForQualifier() { return new ArrayType(this.baseType, this.arraySize); }
}

// Function type `R(P0, P1, ...)` (with optional `...` and "unspecified
// params" for the `f()` form vs `f(void)`).
class FunctionType extends TypeInfo {
  constructor(returnType, paramTypes, isVarArg, hasUnspecifiedParams) {
    super(0, 0, true);
    this.returnType = returnType;
    this.paramTypes = paramTypes;
    this.isVarArg = !!isVarArg;
    this.hasUnspecifiedParams = !!hasUnspecifiedParams;
    Object.seal(this);
  }
  isFunction() { return true; }
  decay() { return this.pointer(); }
  _toString() {
    let out = "(";
    if (this.paramTypes) {
      out += this.paramTypes.map(p => p.toString()).join(", ");
      if (this.isVarArg) out += ", ...";
    }
    return out + ")" + this.returnType.toString();
  }
  _eqStructure(other, seen) {
    if (!this.returnType.isCompatibleWith(other.returnType, seen)) return false;
    const a = this.paramTypes || [], b = other.paramTypes || [];
    if (this.hasUnspecifiedParams || other.hasUnspecifiedParams) return true;
    if (this.isVarArg !== other.isVarArg) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      // C11 6.7.6.3p15: for compatibility, each parameter is taken as
      // having the unqualified version of its declared type — only the
      // TOP-LEVEL qualifiers drop (`const char *const` param compares as
      // `const char *`; the pointee's const still matters).
      if (!a[i].removeQualifiers().isCompatibleWith(b[i].removeQualifiers(), seen)) return false;
    }
    return true;
  }
  _cloneForQualifier() {
    return new FunctionType(this.returnType, this.paramTypes, this.isVarArg, this.hasUnspecifiedParams);
  }
}

// Linear-memory aggregates: `struct`, `union`, `enum`. `tagDecl` is the
// AST.DTag with members (filled in once the body is parsed).
class TagType extends TypeInfo {
  constructor(tagKind, tagName, size, align) {
    super(size, align, false);
    this.tagKind = tagKind;
    this.tagName = tagName;
    this.tagDecl = null;
    Object.seal(this);
  }
  isTag()    { return true; }
  isStruct() { return this.tagKind === TagKind.STRUCT; }
  isUnion()  { return this.tagKind === TagKind.UNION; }
  isEnum()   { return this.tagKind === TagKind.ENUM; }
  // The signedness of the enum's implementation-defined compatible type
  // (C11 6.7.2.2p4). clang/gcc pick `unsigned int` when every enumerator is
  // >= 0, else `int`. Used for enum bit-field read extension (todos/0189).
  // An incomplete/forward enum has no enumerators yet — treat as signed.
  enumIsUnsigned() {
    if (this.tagKind !== TagKind.ENUM || !this.tagDecl) return false;
    for (const m of this.tagDecl.members) {
      if (m.value < 0n) return false;
    }
    return true;
  }
  isAggregate() { return this.isStruct() || this.isUnion(); }
  _toString() { return this.tagKind + " " + this.tagName; }
  _eqStructure(other, _seen) {
    if (this.tagKind !== other.tagKind) return false;
    if (this.tagName === other.tagName) return true;
    return this.tagName?.startsWith("__anon_") && other.tagName?.startsWith("__anon_");
  }
  _cloneForQualifier() {
    const c = new TagType(this.tagKind, this.tagName, this.size, this.align);
    c.isComplete = this.isComplete;
    c.tagDecl = this.tagDecl;
    return c;
  }
}

// `__struct Foo` — the named heap-allocated GC struct *type entity*. NOT a
// value type. Carries `tagDecl` (members), `parentType` (single inheritance
// link), and lazily produces its ref form via `pointer()`.
class GCStructHeapType extends TypeInfo {
  constructor(tagName) {
    super(0, 0, false);
    this.tagKind = TagKind.GC_STRUCT;
    this.tagName = tagName;
    this.tagDecl = null;       // set when struct definition is parsed
    this.parentType = null;    // GCStructHeapType | null
    Object.seal(this);
  }
  isGCStructHeap() { return true; }
  isWasmGCType()   { return true; }
  gcHeap() { return this; }
  // First `*` converts heap → ref form. The ref shares the heap as its
  // `baseType`, and looks up tagDecl/parentType/isComplete via that link.
  pointer() {
    if (this._pointer) return this._pointer;
    const ref = new GCStructRefType(this);
    this._pointer = ref;
    return ref;
  }
  _toString() { return "__struct " + this.tagName; }
  _eqStructure(other, _seen) {
    if (!this.isComplete || !other.isComplete) return false;
    if (_seen) {
      for (const [a, b] of _seen) {
        if ((a === this && b === other) || (a === other && b === this)) return true;
      }
    }
    const seen = _seen ? _seen.concat([[this, other]]) : [[this, other]];
    const am = this.tagDecl.members, bm = other.tagDecl.members;
    if (am.length !== bm.length) return false;
    for (let i = 0; i < am.length; i++) {
      if (!am[i].type.isCompatibleWith(bm[i].type, seen)) return false;
    }
    return true;
  }
  _cloneForQualifier() {
    const c = new GCStructHeapType(this.tagName);
    c.tagDecl = this.tagDecl;
    c.parentType = this.parentType;
    c.isComplete = this.isComplete;
    return c;
  }
}

// `__struct Foo *` — a value-typed GC reference. Holds only a back-link to
// its heap; tagDecl / parentType / isComplete are read through getters so
// they always reflect the current heap state (no sync required when a
// forward-declared struct gets defined later).
class GCStructRefType extends TypeInfo {
  constructor(heap) {
    super(0, 0, heap.isComplete);
    this._heap = heap;
    Object.seal(this);
  }
  get baseType()   { return this._heap; }   // legacy alias for codegen
  get tagName()    { return this._heap.tagName; }
  get tagKind()    { return this._heap.tagKind; }
  get tagDecl()    { return this._heap.tagDecl; }
  get parentType() { return this._heap.parentType; }
  // ref form's completeness mirrors heap (heap may transition false → true
  // after a forward-declared struct gets defined).
  get isComplete() { return this._heap.isComplete; }
  set isComplete(_v) { /* derived from heap; ignore writes */ }
  isRef()      { return true; }
  isGCRef()    { return true; }
  isGCStruct() { return true; }
  isWasmGCType() { return true; }
  gcHeap()     { return this._heap; }
  // `*` on a ref form is rejected at the parser; we return null as a
  // sentinel for any callers that didn't add the explicit guard.
  pointer() { return null; }
  _toString() { return "__struct " + this._heap.tagName + " *"; }
  // Two refs are compatible iff their heaps are. Recurses via baseType.
  _eqStructure(other, seen) { return this._heap.isCompatibleWith(other._heap, seen); }
  _cloneForQualifier() { return new GCStructRefType(this._heap); }
}

// `__array(T)` — a GC-managed array with element type T. Self-referential
// `*` is rejected (arrays don't take the pointer-form sugar — they're
// already references by design).
class GCArrayType extends TypeInfo {
  constructor(elementType) {
    super(0, 0, true);
    this.baseType = elementType;
    Object.seal(this);
  }
  isRef()     { return true; }
  isGCRef()   { return true; }
  isGCArray() { return true; }
  isWasmGCType() { return true; }
  pointer()   { return this; }   // collapse — `__array(T) *` is rejected at parser
  _toString() { return "__array(" + this.baseType.toString() + ")"; }
  _eqStructure(other, seen) { return this.baseType.isCompatibleWith(other.baseType, seen); }
  _cloneForQualifier() { return new GCArrayType(this.baseType); }
}

// `__externref` (nullable) and `__refextern` (non-nullable) — opaque host
// references. Singletons.
class ExternRefType extends TypeInfo {
  constructor() { super(0, 0, false); Object.seal(this); }
  isRef() { return true; }
  // Historically the spelling has been the bare wasm name (no `__` prefix).
  // Several test diagnostics check this string verbatim — keep it.
  _toString() { return "externref"; }
  _cloneForQualifier() { return new ExternRefType(); }
}
class RefExternType extends TypeInfo {
  constructor() { super(0, 0, false); Object.seal(this); }
  isRef() { return true; }
  _toString() { return "refextern"; }
  _cloneForQualifier() { return new RefExternType(); }
}

// `__eqref` — the GC-universe top type (eq lattice). Singleton.
class EqRefType extends TypeInfo {
  constructor() { super(0, 0, true); Object.seal(this); }
  isRef()   { return true; }
  isGCRef() { return true; }
  pointer() { return this; }   // collapse — `__eqref *` is meaningless
  _toString() { return "__eqref"; }
  _cloneForQualifier() { return new EqRefType(); }
}

// Primitive type singletons. Each is an instance of the concrete subclass
// (IntegerType / FloatingType / VoidType / etc.). All are sealed via the
// subclass constructor.
const TUNKNOWN = new UnknownType();
const TVOID = new VoidType();
const TDIVERGENT = new DivergentType();
const TBOOL   = new IntegerType("_Bool",          1, 1, /* isSigned */ false);
// `char` signedness is implementation-defined in C; we treat plain char as
// signed (matching most platforms and the existing isUnsigned() behavior).
const TCHAR   = new IntegerType("char",           1, 1, true);
const TSCHAR  = new IntegerType("signed char",    1, 1, true);
const TUCHAR  = new IntegerType("unsigned char",  1, 1, false);
const TSHORT  = new IntegerType("short",          2, 2, true);
const TUSHORT = new IntegerType("unsigned short", 2, 2, false);
const TINT    = new IntegerType("int",            4, 4, true);
const TUINT   = new IntegerType("unsigned int",   4, 4, false);
const TLONG   = new IntegerType("long",           4, 4, true);
const TULONG  = new IntegerType("unsigned long",  4, 4, false);
const TLLONG  = new IntegerType("long long",      8, 8, true);
const TULLONG = new IntegerType("unsigned long long", 8, 8, false);
const TFLOAT   = new FloatingType("float",       4, 4);
const TDOUBLE  = new FloatingType("double",      8, 8);
const TLDOUBLE = new FloatingType("long double", 8, 8);
const TEXTERNREF = new ExternRefType();
const TREFEXTERN = new RefExternType();
const TEQREF = new EqRefType();
const TAUTO = new AutoType();

// Type construction caches
function arrayOf(elemType, size) {
  if (!elemType._arrayCache) elemType._arrayCache = new Map();
  if (elemType._arrayCache.has(size)) return elemType._arrayCache.get(size);
  const t = new ArrayType(elemType, size);
  elemType._arrayCache.set(size, t);
  return t;
}

function functionType(retType, paramTypes, isVarArg, hasUnspecifiedParams = false) {
  // Cache by type identity (matching C++ which keys by Info* pointers)
  let map = retType._funcTypeCache;
  if (!map) { map = new Map(); retType._funcTypeCache = map; }
  for (const pt of paramTypes) {
    let next = map.get(pt);
    if (!next) { next = new Map(); map.set(pt, next); }
    map = next;
  }
  const key = (isVarArg ? 1 : 0) | (hasUnspecifiedParams ? 2 : 0);
  if (map.has(key)) return map.get(key);
  const t = new FunctionType(retType, paramTypes, isVarArg, hasUnspecifiedParams);
  map.set(key, t);
  return t;
}

// Create a fresh (incomplete) tag type. Each *definition* of a tag is a
// distinct type (C11 6.7.2.3p5) — definitions must NOT share objects
// through the name cache below, or an inner-scope `struct S {...}` would
// overwrite the file-scope `struct S`'s layout in place.
function createTagType(tagKind, name) {
  const isEnum = tagKind === TagKind.ENUM;
  const size = isEnum ? 4 : 0;
  const align = isEnum ? 4 : 0;
  return new TagType(tagKind, name, size, align);
}

// Tag type cache: tagKind+name -> TagType. Used only for *references* to
// not-yet-declared tags, so repeated `struct S *` mentions resolve to one
// incomplete type object.
function getOrCreateTagType(tagTypeCache, tagKind, name) {
  const key = tagKind + ":" + name;
  if (tagTypeCache.has(key)) return tagTypeCache.get(key);
  const t = createTagType(tagKind, name);
  tagTypeCache.set(key, t);
  return t;
}

// Walk a type and report every GC_STRUCT_HEAP that appears in a value-position
// slot (the type itself, pointer/array bases, GC array element, function
// return / parameter types). Heap forms are only legal as the type-arg of
// `__new`, `__ref_test`, `__ref_cast`, `__ref_null`, `__extends`, and inside
// struct definitions — not as values. The ref form `__struct Foo *` is the
// value spelling.
function validateNoHeapInValueType(type, errorFn) {
  const seen = new Set();
  const walk = (t) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    const u = t.removeQualifiers();
    if (u.isGCStructHeap()) {
      errorFn(`'${u.toString()}' (heap form) cannot appear as a value type — use the ref form '${u.toString()} *'`);
      return;
    }
    if (u.isPointer() || u.isArray() || u.isGCArray()) walk(u.baseType);
    else if (u.isFunction()) {
      walk(u.returnType);
      for (const pt of (u.paramTypes || [])) walk(pt);
    }
  };
  walk(type);
}

// GC struct type cache: name -> GCStructHeapType.
// Returns the heap form. The ref form (`__struct Foo *`) is created lazily via
// `.pointer()`. Heap forms appear only in heap-type positions (struct
// definitions, intrinsic type-args). Values (vars, fields, params) use the
// ref form.
function getOrCreateGCStructType(gcStructTypeCache, name) {
  if (gcStructTypeCache.has(name)) return gcStructTypeCache.get(name);
  const t = new GCStructHeapType(name);
  gcStructTypeCache.set(name, t);
  return t;
}

// GC array type cache: keyed by element type identity (stored on element's _gcArrayCache)
function gcArrayOf(elementType) {
  if (elementType._gcArrayCache) return elementType._gcArrayCache;
  const t = new GCArrayType(elementType);
  elementType._gcArrayCache = t;
  return t;
}

function computeStructLayout(members, packAlign = 0) {
  // packAlign: `#pragma pack`/attribute alignment cap in bytes (0 = natural).
  // A cap of 1 is full byte-packing (`__attribute__((packed))` / pack(1)):
  // the bit-field internals below key on that for contiguous byte-anchored
  // packing; a cap of 2/4/8 only lowers each member's alignment (todos/0191).
  const isPacked = packAlign === 1;
  let size = 0;
  let maxAlign = 1;
  // Bit-field packing state. Placement follows the psABI (Itanium / what
  // clang tracks on wasm32): bit-fields of ANY declared type share one
  // packed bit region measured from the struct start; each field goes at
  // the current bit cursor unless it would straddle a container boundary of
  // its own declared type, in which case it advances to the next such
  // boundary (todos/0190 — keying the "unit" on the declared type split
  // adjacent mixed-type fields into separate units, diverging from clang on
  // sizeof and on every following member's offset).
  let bfCursor = 0;     // absolute bit position (from struct start) of the next field
  let inBitField = false;
  let bfPackedEnd = 0;  // packed: max byte-end of any access window in the run

  // A bit-field's access window: the smallest power-of-2 byte count,
  // anchored at the storage unit's start, that covers the member's bits.
  // 8-byte units never narrow (the i64 access path keeps its type domain).
  // Codegen RMWs this window instead of the declared unit so a packed
  // struct — whose tail bytes the unit doesn't own — never touches memory
  // past the member run.
  const windowBytes = (m, endBit) => {
    if (m.type.size === 8) return 8;
    const b = (endBit + 7) >> 3;
    return b <= 1 ? 1 : b <= 2 ? 2 : b <= 4 ? 4 : 8;
  };
  // Close the open unit: advance past the USED bytes only — a following
  // member packs into the unit's unused tail bytes exactly as clang wasm32
  // does (todos/0216; the old `size += bfUnitSize` advance diverged from
  // clang on sizeof AND on the offset of every following member). Packed
  // structs advance past the widest access window instead, so no member's
  // RMW load/store can reach beyond the struct.
  const closeBfUnit = () => {
    size = Math.max(size, (bfCursor + 7) >> 3);
    // Packed: a member's RMW window can extend past its used bits; the
    // struct must cover it so the store never runs off the end (todos/0216).
    if (isPacked) size = Math.max(size, bfPackedEnd);
    inBitField = false; bfCursor = 0; bfPackedEnd = 0;
  };

  for (const m of members) {
    // `#pragma pack(N)` / attribute packed lower each member's alignment to
    // at most the pack cap; an explicit _Alignas/aligned still raises it.
    const nat = m.type.align || 1;
    const naturalAlign = packAlign > 0 ? Math.min(nat, packAlign) : nat;
    const mAlign = m.requestedAlignment > 0 ? Math.max(naturalAlign, m.requestedAlignment) : naturalAlign;
    const mSize = m.type.size;

    if (m.bitWidth === 0) {
      // Zero-width bitfield: finish the current unit and realign to the
      // declared type's boundary. Two clang/GCC subtleties (todos/0216):
      // `:0` keeps its force-to-boundary effect inside a PACKED struct,
      // and it contributes NOTHING to the struct's alignment (clang:
      // struct {char a:3; int :0; char c;} is sizeof 5, align 1).
      if (inBitField) closeBfUnit();
      const zAlign = m.type.align || 1;
      size = (size + zAlign - 1) & ~(zAlign - 1);
      continue;
    }
    if (mAlign > maxAlign) maxAlign = mAlign;

    if (m.bitWidth >= 0) {
      const bw = m.bitWidth;
      const containerBits = mSize * 8;

      // All adjacent bit-fields share one bit region regardless of declared
      // type (signedness never splits it either — `int a:3; unsigned b:3`
      // is one region; sign extension is per-member at access time).
      if (!inBitField) { bfCursor = size * 8; inBitField = true; }
      let absStart = bfCursor;
      if (!isPacked && bw > 0 &&
          Math.floor(absStart / containerBits) !== Math.floor((absStart + bw - 1) / containerBits)) {
        // Would straddle a container boundary of the declared type: advance
        // to the next such boundary (psABI). A same-type run fills its
        // container in order and never trips this; a wider following type
        // that doesn't fit the remaining bits starts a fresh container.
        absStart = Math.ceil(absStart / containerBits) * containerBits;
      }
      if (isPacked) {
        // No container constraint: bits pack contiguously, byte-anchored.
        m.byteOffset = absStart >> 3;
        m.bitOffset = absStart & 7;
      } else {
        // Anchor the access window at the field's declared-type container.
        // The field can't straddle it, so the window stays inside — and a
        // store RMW preserves any member tail-packed into the same bytes.
        const containerByte = Math.floor(absStart / containerBits) * mSize;
        m.byteOffset = containerByte;
        m.bitOffset = absStart - containerByte * 8;
      }
      bfCursor = absStart + bw;
      m.bfAccessBytes = windowBytes(m, m.bitOffset + bw);
      // Anonymous bit-fields reserve bits but are never accessed, so they
      // don't widen the packed advance past their used bytes.
      if (isPacked && m.name) {
        const endByte = m.byteOffset + m.bfAccessBytes;
        if (endByte > bfPackedEnd) bfPackedEnd = endByte;
      }
    } else {
      // Regular (non-bitfield) member: finish any pending bitfield unit
      if (inBitField) closeBfUnit();
      size = (size + mAlign - 1) & ~(mAlign - 1);
      m.byteOffset = size;
      size += mSize;
    }
  }
  // Finish any trailing bitfield unit
  if (inBitField) closeBfUnit();
  // Final struct size aligned to struct alignment
  if (maxAlign > 0) size = (size + maxAlign - 1) & ~(maxAlign - 1);
  return { size, align: maxAlign };
}

function computeUnionLayout(members, packAlign = 0) {
  let maxSize = 0;
  let maxAlign = 1;
  for (const m of members) {
    m.byteOffset = 0;
    if (m.type.size > maxSize) maxSize = m.type.size;
    // Per-member _Alignas/__attribute__((aligned)) raises the union's
    // alignment exactly as the struct path does (todos/0216 — it was
    // silently ignored here, diverging from clang on align AND size).
    // `#pragma pack(N)`/packed cap the natural alignment (todos/0191).
    const nat = m.type.align || 1;
    const naturalAlign = packAlign > 0 ? Math.min(nat, packAlign) : nat;
    const mAlign = m.requestedAlignment > 0 ? Math.max(naturalAlign, m.requestedAlignment) : naturalAlign;
    if (mAlign > maxAlign) maxAlign = mAlign;
  }
  if (maxAlign > 0) maxSize = Math.ceil(maxSize / maxAlign) * maxAlign;
  return { size: maxSize, align: maxAlign };
}

// Matches CC's computeUnaryType exactly (compiler.cc ~line 10055)
function computeUnaryType(op, operandType) {
  switch (op) {
    case "OP_LNOT": return TINT;
    case "OP_ADDR": return operandType.pointer();
    case "OP_DEREF":
      if (operandType.isPointer()) return operandType.baseType;
      if (operandType.isArray()) return operandType.baseType;
      return TUNKNOWN;
    case "OP_POS":
    case "OP_NEG":
    case "OP_BNOT":
      if (operandType.isInteger() && operandType.size < TINT.size) {
        return TINT;
      }
      return operandType;
    case "OP_PRE_INC":
    case "OP_PRE_DEC":
    case "OP_POST_INC":
    case "OP_POST_DEC": return operandType;
    default: return operandType;
  }
}

// Truncate a constant BigInt value to fit the given C type's width (C99 §6.3.1.3).
function truncateConstInt(v, type) {
  type = type.removeQualifiers();
  if (type === TCHAR || type === TSCHAR) return BigInt.asIntN(8, v);
  if (type === TUCHAR) return BigInt.asUintN(8, v);
  if (type === TSHORT) return BigInt.asIntN(16, v);
  if (type === TUSHORT) return BigInt.asUintN(16, v);
  if (type === TINT || type === TLONG) return BigInt.asIntN(32, v);
  if (type === TUINT || type === TULONG) return BigInt.asUintN(32, v);
  if (type === TLLONG) return BigInt.asIntN(64, v);
  if (type === TULLONG) return BigInt.asUintN(64, v);
  if (type === TBOOL) return v !== 0n ? 1n : 0n;
  return v;  // pointer: no truncation needed
}

function usualArithmeticConversions(a, b) {
  // C99 6.3.1.8: strip qualifiers so 'const double' matches TDOUBLE etc.
  a = a.removeQualifiers();
  b = b.removeQualifiers();
  // Divergent absorbs — the result of mixing in a recovery type stays
  // divergent so further operations don't blow up either.
  if (a.isDivergent() || b.isDivergent()) return TDIVERGENT;
  if (a.isFloatingPoint() || b.isFloatingPoint()) {
    if (a === TLDOUBLE || b === TLDOUBLE) return TLDOUBLE;
    if (a === TDOUBLE || b === TDOUBLE) return TDOUBLE;
    return TFLOAT;
  }
  // Integer promotions: char, short, bool → int
  const promote = (t) => {
    if (t === TCHAR || t === TSCHAR || t === TUCHAR || t === TSHORT || t === TUSHORT || t === TBOOL)
      return TINT;
    return t;
  };
  a = promote(a);
  b = promote(b);
  if (a === b) return a;
  // C99 §6.3.1.8: rank by size, then handle signed/unsigned conflicts.
  const isU = (t) => t === TUINT || t === TULONG || t === TULLONG;
  const toU = (t) => {
    if (t === TINT) return TUINT;
    if (t === TLONG) return TULONG;
    if (t === TLLONG) return TULLONG;
    return t;
  };
  const aU = isU(a), bU = isU(b);
  const aSize = a.size, bSize = b.size;
  // Same signedness: higher rank (larger size) wins
  if (aU === bU) return aSize >= bSize ? a : b;
  // Different signedness
  const signedT = aU ? b : a;
  const unsignedT = aU ? a : b;
  const sSize = signedT.size, uSize = unsignedT.size;
  if (uSize >= sSize) return unsignedT;
  if (sSize > uSize) return signedT;
  return toU(signedT);
}

return {
  TagKind, StorageClass, AllocClass, LabelKind,
  IntrinsicKind, BopStr, UopStr,
  TypeInfo,
  PrimitiveType, IntegerType, FloatingType,
  VoidType, AutoType, UnknownType, DivergentType,
  PointerType, ArrayType, FunctionType, TagType,
  GCStructHeapType, GCStructRefType, GCArrayType,
  ExternRefType, RefExternType, EqRefType,
  TUNKNOWN, TVOID, TBOOL, TCHAR, TSCHAR, TUCHAR, TSHORT, TUSHORT,
  TINT, TUINT, TLONG, TULONG, TLLONG, TULLONG, TFLOAT, TDOUBLE, TLDOUBLE, TEXTERNREF, TREFEXTERN, TEQREF, TAUTO,
  TDIVERGENT,
  arrayOf, functionType, getOrCreateTagType, createTagType,
  getOrCreateGCStructType, gcArrayOf, validateNoHeapInValueType,
  computeStructLayout, computeUnionLayout, computeUnaryType,
  usualArithmeticConversions, truncateConstInt,
};
})();

// ====================
// ConstEval — typed integer constant arithmetic
// ====================
// Wraps a BigInt value + C type so that signedness and width are preserved
// through arithmetic, comparisons, and bitwise ops. Used by the preprocessor
// (#if expressions operate at intmax_t/uintmax_t per C99 §6.10.1) and
// available for constEvalInt / inliner migration later.
const ConstEval = (() => {
const { TINT, TUINT, TLLONG, TULLONG, TFLOAT, TBOOL, truncateConstInt, usualArithmeticConversions } = Types;

// Integer-typed constant. `value` is a BigInt, always kept truncated to the
// type's width, so every intermediate result wraps exactly like the target.
class Item {
  constructor(value, type) {
    this.value = truncateConstInt(value, type);
    this.type = type;
  }
}

// Floating-typed constant. `fval` is a JS number (an IEEE double, which is
// exactly the target's double). For TFLOAT the value is re-rounded to f32 at
// construction, so every intermediate result rounds exactly like runtime f32
// arithmetic. TDOUBLE and TLDOUBLE are both 8-byte IEEE doubles here.
class FloatItem {
  constructor(fval, type) {
    this.fval = type.removeQualifiers() === TFLOAT ? Math.fround(fval) : fval;
    this.type = type;
  }
}

function isFloatItem(item) { return item instanceof FloatItem; }
function isTruthy(item) { return isFloatItem(item) ? item.fval !== 0 : item.value !== 0n; }

function isUnsigned(type) {
  return type === TUINT || type === Types.TULONG || type === TULLONG
      || type === Types.TUCHAR || type === Types.TUSHORT;
}

// float → integer conversion for constants. C makes out-of-range conversions
// undefined; we fold them with saturating semantics (NaN → 0) so constant
// evaluation agrees with the wasm runtime's trunc_sat instructions.
function saturatingTruncToInt(f, type) {
  if (Number.isNaN(f)) return 0n;
  const w = BigInt(type.size * 8);
  const lo = isUnsigned(type) ? 0n : -(1n << (w - 1n));
  const hi = isUnsigned(type) ? (1n << w) - 1n : (1n << (w - 1n)) - 1n;
  if (f === Infinity) return hi;
  if (f === -Infinity) return lo;
  const b = BigInt(Math.trunc(f));
  return b < lo ? lo : b > hi ? hi : b;
}

// C11 6.3.1 scalar conversion of a constant to `type`. Returns a new
// Item/FloatItem, or null when the conversion can't be folded. This is THE
// conversion routine — the parser's evaluator, the inliner, and codegen's
// static-initializer evaluator must all funnel casts through it so the three
// never disagree (they used to: (long double) casts were dropped, (float)
// casts skipped the f32 rounding, and _Bool truncated before testing != 0).
function convert(item, type) {
  const t = type.removeQualifiers();
  if (t === TBOOL) {
    // 6.3.1.2: the result is value != 0 — test BEFORE any truncation.
    return new Item(isTruthy(item) ? 1n : 0n, TBOOL);
  }
  if (t.isFloatingPoint()) {
    // Number(BigInt) rounds to nearest-even — exactly 6.3.1.4p2. The
    // FloatItem constructor applies the extra f32 rounding for TFLOAT.
    return new FloatItem(isFloatItem(item) ? item.fval : Number(item.value), t);
  }
  if (t.isInteger()) {
    if (!isFloatItem(item)) return new Item(item.value, t);
    // float → int truncates toward zero (6.3.1.4p1). Out-of-range/NaN is
    // UB — DECLINE to fold so the runtime conversion keeps its semantics
    // (saturating by default, trapping under --trapping-float-conversions).
    // Static-initializer emission, which must produce bytes with no runtime
    // to defer to, opts into saturation explicitly via saturatingTruncToInt.
    if (!Number.isFinite(item.fval)) return null;
    const b = BigInt(Math.trunc(item.fval));
    if (truncateConstInt(b, t) !== b) return null; // out of range for t
    return new Item(b, t);
  }
  if (t.isPointer() && !isFloatItem(item)) return new Item(item.value, t);
  return null;
}

function itemFromPPNumber(text) {
  // The canonical decoder (shared with the lexer's PP_NUMBER→INT
  // resolution) — #if accepts exactly the forms normal code does.
  const dec = Lexer.decodeIntegerLiteral(text);
  if (dec === null) return null; // malformed constant (e.g. "08") — caller diagnoses
  // C11 6.10.1p4: #if operands evaluate as intmax_t/uintmax_t (64-bit),
  // regardless of suffix width. Unsuffixed constants are signed; they
  // escalate to uintmax_t only when the value doesn't fit intmax_t
  // (possible for non-decimal constants per 6.4.4.1's type progression).
  const type = (dec.unsigned || BigInt.asIntN(64, dec.value) !== dec.value) ? TULLONG : TLLONG;
  return new Item(dec.value, type);
}

function promote(item) {
  if (isFloatItem(item)) return item;
  if (item.type === Types.TCHAR || item.type === Types.TSCHAR || item.type === Types.TUCHAR
      || item.type === Types.TSHORT || item.type === Types.TUSHORT || item.type === Types.TBOOL)
    return new Item(item.value, TINT);
  return item;
}

function unary(op, a) {
  a = promote(a);
  if (isFloatItem(a)) {
    switch (op) {
      case "-": case "OP_NEG": return new FloatItem(-a.fval, a.type);
      case "+": case "OP_POS": return a;
      case "!": case "OP_LNOT": return new Item(a.fval === 0 ? 1n : 0n, TINT);
      default: return null; // ~ is a constraint violation on floats
    }
  }
  switch (op) {
    case "~": case "OP_BNOT": return new Item(~a.value, a.type);
    case "-": case "OP_NEG": return new Item(-a.value, a.type);
    case "+": case "OP_POS": return a;
    case "!": case "OP_LNOT": return new Item(a.value === 0n ? 1n : 0n, TINT);
    default: return null;
  }
}

function binary(op, a, b) {
  a = promote(a); b = promote(b);

  if (isFloatItem(a) || isFloatItem(b)) {
    // 6.3.1.8: the common type is floating; arithmetic happens in that type
    // (the FloatItem constructor rounds per-operation for f32).
    const rt = usualArithmeticConversions(a.type, b.type);
    if (!rt.isFloatingPoint()) return null;
    const lv = isFloatItem(a) ? a.fval : Number(a.value);
    const rv = isFloatItem(b) ? b.fval : Number(b.value);
    switch (op) {
      case "+": case "ADD": return new FloatItem(lv + rv, rt);
      case "-": case "SUB": return new FloatItem(lv - rv, rt);
      case "*": case "MUL": return new FloatItem(lv * rv, rt);
      case "/": case "DIV": return new FloatItem(lv / rv, rt); // IEEE: x/0 = ±inf
      case "==": case "EQ": return new Item(lv === rv ? 1n : 0n, TINT);
      case "!=": case "NE": return new Item(lv !== rv ? 1n : 0n, TINT);
      case "<": case "LT": return new Item(lv < rv ? 1n : 0n, TINT);
      case ">": case "GT": return new Item(lv > rv ? 1n : 0n, TINT);
      case "<=": case "LE": return new Item(lv <= rv ? 1n : 0n, TINT);
      case ">=": case "GE": return new Item(lv >= rv ? 1n : 0n, TINT);
      case "&&": case "LAND": return new Item((lv !== 0 && rv !== 0) ? 1n : 0n, TINT);
      case "||": case "LOR": return new Item((lv !== 0 || rv !== 0) ? 1n : 0n, TINT);
      default: return null; // %, shifts, bitwise: constraint violations on floats
    }
  }

  // C11 6.5.7p3: shift operands are promoted INDEPENDENTLY; the result has
  // the promoted LEFT operand's type. Usual arithmetic conversions do not
  // apply (applying them used to let an unsigned right operand turn an
  // arithmetic right-shift of a negative left operand into a logical one).
  if (op === "<<" || op === "SHL" || op === ">>" || op === "SHR") {
    const width = BigInt(a.type.size * 8);
    const count = b.value;
    if (count < 0n || count >= width) return null; // UB — decline, caller diagnoses
    const res = (op === "<<" || op === "SHL") ? (a.value << count) : (a.value >> count);
    return new Item(res, a.type); // Item ctor wraps to the result type
  }

  const rt = usualArithmeticConversions(a.type, b.type);
  const lv = truncateConstInt(a.value, rt);
  const rv = truncateConstInt(b.value, rt);
  switch (op) {
    case "+": case "ADD": return new Item(lv + rv, rt);
    case "-": case "SUB": return new Item(lv - rv, rt);
    case "*": case "MUL": return new Item(lv * rv, rt);
    case "/": case "DIV": return rv !== 0n ? new Item(lv / rv, rt) : null;
    case "%": case "MOD": return rv !== 0n ? new Item(lv % rv, rt) : null;
    case "&": case "BAND": return new Item(lv & rv, rt);
    case "|": case "BOR": return new Item(lv | rv, rt);
    case "^": case "BXOR": return new Item(lv ^ rv, rt);
    case "==": case "EQ": return new Item(lv === rv ? 1n : 0n, TINT);
    case "!=": case "NE": return new Item(lv !== rv ? 1n : 0n, TINT);
    case "<": case "LT": return new Item(lv < rv ? 1n : 0n, TINT);
    case ">": case "GT": return new Item(lv > rv ? 1n : 0n, TINT);
    case "<=": case "LE": return new Item(lv <= rv ? 1n : 0n, TINT);
    case ">=": case "GE": return new Item(lv >= rv ? 1n : 0n, TINT);
    case "&&": case "LAND": return new Item((lv !== 0n && rv !== 0n) ? 1n : 0n, TINT);
    case "||": case "LOR": return new Item((lv !== 0n || rv !== 0n) ? 1n : 0n, TINT);
    default: return null;
  }
}

return { Item, FloatItem, isFloatItem, isTruthy, convert, saturatingTruncToInt,
         itemFromPPNumber, unary, binary, isUnsigned, promote,
         SIGNED: TLLONG, UNSIGNED: TULLONG };
})();

// ====================
// Diagnostics pool
// ====================
//
// Shared error/warning sink. Set by `withDiag(sink, fn)` for the duration
// of `fn()`, after which `_currentDiag` is restored. Anywhere downstream
// — parser, AST builders, codegen — can call `reportError`/`reportWarning`
// without threading a context through.
//
// `fatalError` reports and throws `FatalDiag`. The caller's `withDiag`
// scope catches it and the error is already in the sink.

let _currentDiag = null;

class FatalDiag {}

function withDiag(sink, fn) {
  const saved = _currentDiag;
  _currentDiag = sink;
  try { return fn(); } finally { _currentDiag = saved; }
}

function reportError(loc, msg) {
  if (!_currentDiag) throw new Error(`reportError("${msg}") called outside withDiag scope`);
  _currentDiag.errors.push(new Lexer.LexError(msg, loc.filename, loc.line));
}

function reportWarning(loc, msg) {
  if (!_currentDiag) throw new Error(`reportWarning("${msg}") called outside withDiag scope`);
  _currentDiag.warnings.push(new Lexer.LexError(msg, loc.filename, loc.line));
}

// Reports the error and throws FatalDiag. The active `withDiag` scope
// catches it; downstream parsing of the current translation unit halts
// but the error is preserved in the sink.
function fatalError(loc, msg) {
  reportError(loc, msg);
  throw new FatalDiag();
}

// ====================
// AST
// ====================

const AST = (() => {

class Scope {
  constructor() { this.stack = [new Map()]; }
  push() { this.stack.push(new Map()); }
  pop() { this.stack.pop(); }
  set(name, value) {
    const top = this.stack[this.stack.length - 1];
    if (top.has(name)) return false;
    top.set(name, value);
    return true;
  }
  replace(name, value) {
    // Replace in whatever scope level it exists, or set in top
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].has(name)) { this.stack[i].set(name, value); return; }
    }
    this.stack[this.stack.length - 1].set(name, value);
  }
  get(name) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].has(name)) return this.stack[i].get(name);
    }
    return undefined;
  }
  has(name) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].has(name)) return true;
    }
    return false;
  }
  hasInCurrentScope(name) {
    return this.stack[this.stack.length - 1].has(name);
  }
  getInCurrentScope(name) {
    return this.stack[this.stack.length - 1].get(name);
  }
  replaceInCurrentScope(name, value) {
    this.stack[this.stack.length - 1].set(name, value);
  }
  getLevel(name) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].has(name)) return i;
    }
    return -1;
  }
}

// ====================
// AST Node Classes
// ====================

let nextDeclId = 1;

// TreeBag: a tree-shaped read-only set/multiset. Each node owns an
// array of items (not a Set — guc.js uses Set, but the user prefers
// arrays for insertion-order traversal and lower constant overhead),
// and references its children's bags. Items are NEVER copied into
// ancestors: iteration / `has` walk the children tree on demand, so
// memory stays O(N) regardless of depth.
//
// Used as a structural-share container for bubble-up metadata on Expr
// and Stmt. A node's `referencedFunctions` (or any future bag) is
// computed once at construction as `new TreeBag(ownItems, ...children
// .map(c => c.bag))` — no eager union, no rebuild on subtree change.
//
// Suitable for one-shot iteration / membership tests. If a caller
// queries the same bag many times, snapshot the iteration result.
class TreeBag {
  // `children` is a plain array — NOT a rest parameter. Spreading tens of
  // thousands of children as arguments (huge initializer lists) overflows
  // the engine's argument limit with a RangeError.
  constructor(own, children = []) {
    this._own = (own && own.length > 0) ? own.slice() : null;
    this._children = children.filter(c => c.size > 0);
    let n = this._own ? this._own.length : 0;
    for (const c of this._children) n += c.size;
    this.size = n;
    Object.freeze(this._children);
    Object.freeze(this);
  }
  *[Symbol.iterator]() {
    if (this._own) yield* this._own;
    for (const child of this._children) yield* child;
  }
  has(value) {
    if (this._own && this._own.includes(value)) return true;
    for (const child of this._children) if (child.has(value)) return true;
    return false;
  }
  forEach(fn) { for (const item of this) fn(item); }
}
const _EMPTY_TREE_BAG = new TreeBag(null);

// Linearity (substructural typing, à la guc.js):
//   LINEAR        — must be evaluated in source order (side effects, traps,
//                   memory reads/writes, control flow). Cannot be discarded
//                   without losing observable behavior.
//   AFFINE        — has identity (allocation, address-take). Can be discarded
//                   if unused, but cannot be duplicated/reordered.
//   UNRESTRICTED  — pure, deterministic, no identity. Can be discarded,
//                   duplicated, or reordered freely.
// Optimizers consult this to decide whether a transform is safe.
const Linearity = Object.freeze({
  LINEAR: 'LINEAR', AFFINE: 'AFFINE', UNRESTRICTED: 'UNRESTRICTED',
});
const _LINEARITY_RANK = { UNRESTRICTED: 0, AFFINE: 1, LINEAR: 2 };
function _rankToLinearity(r) {
  return r === 2 ? 'LINEAR' : r === 1 ? 'AFFINE' : 'UNRESTRICTED';
}
// Linearity of a memory-access expression, keyed on the accessed object's
// type (todos/0187). C11 5.1.2.3: accesses to volatile objects are
// observable behavior — their count and order must survive optimization —
// so a volatile access is LINEAR (evaluate exactly once, in order), never
// UNRESTRICTED (the inliner would duplicate a >1×-used argument or drop an
// unused one). Non-volatile accesses stay UNRESTRICTED: the load itself
// has no side effects and reading twice yields the same value.
function _accessLinearity(type) {
  return (type && type.isVolatile) ? Linearity.LINEAR : Linearity.UNRESTRICTED;
}
// Join an op's intrinsic linearity with the linearity of children. The
// result is the strictest of (opLinearity, child1.linearity, ...) — a
// node is UNRESTRICTED iff its op is pure AND every child is too.
// Tolerates null/undefined children (some construction phases use partial
// child lists, e.g. EInitList during normalizeInitList).
function joinLinearity(opLinearity, children) {
  let rank = _LINEARITY_RANK[opLinearity];
  for (const c of children) {
    if (!c) continue;
    const r = _LINEARITY_RANK[c.linearity];
    if (r > rank) rank = r;
  }
  return _rankToLinearity(rank);
}

// --- Base classes ---
// The base Expr constructor takes a `children` array (in evaluation
// order) and an `opLinearity` (the intrinsic linearity of this op,
// before child contributions). The base computes `this.linearity` by
// joining opLinearity with the children's linearities — subclasses
// just declare what kind of op they are; bubble-up is automatic.
//
// Children are walkable via `this.children` (used by walkExpr / generic
// rewriters). Subclasses additionally store named field aliases (`left`,
// `right`, `operand`, `base`, `index`, etc.) for ergonomic access from
// codegen and other consumers — these alias the same expression objects.
class Expr {
    constructor(loc, type, children, opLinearity) {
      if (!loc) {
        throw new Error(`Expr: loc is required (use Lexer.Loc.fromTok / Loc.generated for synthesized nodes)`);
      }
      this.loc = loc;
      this.type = type;
      this.children = children;
      this.linearity = joinLinearity(opLinearity, children);
    }
    // Bubble-up bags are computed on demand from current children.
    // The getter form (rather than a precomputed field) tolerates the
    // seal-only escapees (EInitList, SLabel, SGoto) whose `children`
    // arrays are mutated by post-construction passes — the bag stays
    // consistent with whatever `children` currently looks like.
    // EIdent of a DFunc / DVar overrides to add itself.
    get referencedFunctions() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedFunctions));
    }
    get referencedVariables() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedVariables));
    }
    get referencedCompoundLiterals() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedCompoundLiterals));
    }
    // Case labels can't appear inside expressions — empty by definition.
    get caseBag() { return _EMPTY_TREE_BAG; }
    // Rebuild this node with replaced children, in the same order as
    // `this.children`. Leaf subclasses (no children) inherit this
    // identity-return; non-leaf subclasses must override.
    _withChildren(newChildren) {
      if (newChildren.length === 0) return this;
      throw new Error(
        `${this.constructor.name} must implement _withChildren ` +
        `(node has ${this.children.length} children)`);
    }
  }
  // Stmt parallels Expr: takes a `children` array (mixed Expr and Stmt
  // subtrees in evaluation/control order), exposes generic traversal,
  // and bubbles up `referencedFunctions` from children. Subclasses
  // additionally store named field aliases (`condition`, `body`, etc.)
  // for ergonomic access — same pattern as Expr.
  class Stmt {
    constructor(loc, children = []) {
      if (!loc) {
        throw new Error(`Stmt: loc is required (use Lexer.Loc.fromTok / Loc.generated for synthesized nodes)`);
      }
      this.loc = loc;
      this.children = children;
    }
    // Bubble-up bag, computed on demand. See Expr.referencedFunctions
    // for rationale (handles parser-mutated children arrays cleanly).
    get referencedFunctions() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedFunctions));
    }
    get referencedVariables() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedVariables));
    }
    get referencedCompoundLiterals() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.referencedCompoundLiterals));
    }
    // Case labels visible from this subtree. Bubbles up through all
    // intermediate Stmts; SSwitch overrides to return empty (its inner
    // cases belong to itself, not the enclosing switch). Exprs return
    // empty via Expr.caseBag — case labels can't appear inside expressions.
    get caseBag() {
      return new TreeBag(null,
        this.children.filter(c => c).map(c => c.caseBag));
    }
    _withChildren(newChildren) {
      if (newChildren.length === 0) return this;
      throw new Error(
        `${this.constructor.name} must implement _withChildren ` +
        `(node has ${this.children.length} children)`);
    }
  }
  class Decl {
    constructor() {
      this.id = nextDeclId++;
    }
  }

  // --- Decl subclasses ---
  class DVar extends Decl {
    constructor(loc, name, type, storageClass, initExpr) {
      super();
      this.loc = loc; this.name = name; this.type = type;
      this.storageClass = storageClass || Types.StorageClass.NONE;
      this.allocClass = Types.AllocClass.REGISTER;
      this.initExpr = initExpr || null;
      this.definition = null;
      this.bitWidth = -1; this.bitOffset = 0; this.byteOffset = 0;
      this.bfAccessBytes = 0;  // bit-field RMW window, set by computeStructLayout
      this.requestedAlignment = 0;
      // For an enum bit-field: the pre-erasure enum type, whose compatible
      // type drives the read sign/zero-extension (todos/0189). Null otherwise.
      this.enumBitField = null;
      Object.seal(this);
    }
  }
  class DFunc extends Decl {
    constructor(loc, name, type, params, storageClass, isInline, body) {
      super();
      this.loc = loc; this.name = name; this.type = type;
      this.parameters = params || [];
      this.storageClass = storageClass || Types.StorageClass.NONE;
      this.isInline = isInline || false;
      // Inline-policy attributes ({noinline, alwaysInline} or null),
      // threaded parser → codegen fnMeta → WAST inliner (todos/0214).
      this.fnAttrs = null;
      this.body = body || null;
      this.staticLocals = []; this.externLocals = []; this.externLocalFuncs = [];
      this.definition = null;
      this.importModule = null; this.importName = null;
      Object.seal(this);
    }
  }
  class DTag extends Decl {
    constructor(loc, tagKind, name, isComplete, members) {
      super();
      this.loc = loc; this.tagKind = tagKind; this.name = name;
      this.isComplete = isComplete || false;
      this.isPacked = false;
      this.members = members || [];
      Object.seal(this);
    }
  }
  // Exception tag declaration. `paramTypes` lists the types of the
  // arguments a `__throw <name>(...)` site supplies and that a
  // `__catch <name>(...)` binding receives. `definition` is the
  // canonical (cross-TU-unified) tag — same chain pattern as DVar/DFunc.
  // Used by SThrow.tag and STryCatch's catch clauses.
  class DExceptionTag extends Decl {
    constructor(loc, name, paramTypes) {
      super();
      this.loc = loc; this.name = name;
      this.paramTypes = paramTypes;
      this.definition = null;
      Object.seal(this);
    }
  }
  class DEnumConst extends Decl {
    constructor(loc, name, value, type) {
      super();
      this.loc = loc; this.name = name; this.value = value;
      // int normally; unsigned int for values in (INT_MAX, UINT_MAX] —
      // the gcc/clang extension this project follows (see the repo's
      // unsigned_consteval test). Keeps bit-31 flag enums positive.
      this.type = type || Types.TINT;
      Object.seal(this);
    }
  }

  // --- Expr subclasses ---
  // Linearity assignment recipe:
  //   pure literals (EInt/EFloat/EString) and type-only operators
  //     (sizeof/_Alignof/E[Implicit]Cast/EDecay) → UNRESTRICTED
  //   side-effecting / control-flow / memory-accessing → LINEAR
  //   identity-bearing allocations (EGCNew/ECompoundLiteral) → AFFINE
  //   bubble-from-children for ops where the op itself is pure but a
  //     child might not be (EBinary non-assign, EUnary non-side-effect, etc.)
  class EInt extends Expr {
    constructor(loc, type, value) {
      if (!(type instanceof Types.TypeInfo) || !type.isInteger()) {
        throw new Error(`EInt: type must be integral; got ${type}`);
      }
      if (typeof value !== 'bigint') {
        throw new Error(`EInt: value must be a BigInt; got ${typeof value}`);
      }
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.value = value;
      Object.freeze(this);
    }
  }
  class EFloat extends Expr {
    constructor(loc, type, value) {
      if (!(type instanceof Types.TypeInfo) || !type.isFloatingPoint()) {
        throw new Error(`EFloat: type must be floating-point; got ${type}`);
      }
      if (typeof value !== 'number') {
        throw new Error(`EFloat: value must be a number; got ${typeof value}`);
      }
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.value = value;
      Object.freeze(this);
    }
  }
  class EString extends Expr {
    constructor(loc, type, value) {
      if (!(type instanceof Types.TypeInfo) || !type.isArray()) {
        throw new Error(`EString: type must be an array; got ${type}`);
      }
      // String literal element types: any integer up to 32 bits (CHAR..UINT
      // covers narrow string, wide string, char32_t-style literals).
      const elem = type.baseType;
      if (!elem || !elem.isInteger() || elem.size > 4) {
        throw new Error(`EString: element type must be a character/integer kind suitable for a string literal; got ${type.baseType}`);
      }
      if (!Array.isArray(value)) {
        throw new Error(`EString: value must be an Array of byte numbers; got ${value?.constructor?.name ?? typeof value}`);
      }
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.value = value;
      Object.freeze(this);
    }
  }
  // Variable / function / enum constant reference. Pure UNRESTRICTED at
  // this AST level: the load itself has no side effects, and reading a
  // named decl twice in adjacent positions yields the same value — unless
  // the decl is volatile-qualified, which makes the access LINEAR
  // (todos/0187; we still don't model signal handlers or threads).
  // `decl` is required (use makeIdent for name-based lookup) — get the
  // source identifier via `this.decl.name`.
  class EIdent extends Expr {
    constructor(loc, type, decl) {
      if (!decl) throw new Error(`EIdent: decl is required (use makeIdent for name-based lookup)`);
      super(loc, type, [], _accessLinearity(type));
      this.decl = decl;
      Object.freeze(this);
    }
    get name() { return this.decl.name; }
    // A reference to a function (direct or address-take) contributes
    // to the bubble-up bag. Calls go through here too: ECall's callee
    // is an EDecay/EIdent chain whose EIdent adds the DFunc to the bag.
    // Forward declarations have their `definition` field linked to the
    // body-bearing DFunc; we surface that so consumers always see the
    // canonical instance (which is what `unit.{static,defined}Functions`
    // contains).
    get referencedFunctions() {
      if (this.decl instanceof DFunc) {
        return new TreeBag([this.decl.definition || this.decl]);
      }
      return _EMPTY_TREE_BAG;
    }
    get referencedVariables() {
      if (this.decl instanceof DVar) {
        return new TreeBag([this.decl.definition || this.decl]);
      }
      return _EMPTY_TREE_BAG;
    }
  }
  // BinOp / UnOp: single source of truth for op metadata. EBinary /
  // EUnary look up linearity here at construction time and reject
  // unknown op names (catches typos like "ASSING" or stray refactor
  // residue). Other code consults these for diagnostic text and
  // category checks (isAssign, isCompare, etc.) instead of scattering
  // `op === "..."` chains. The flags are fixed properties of the op
  // itself — assignment-ness etc. don't depend on operands.
  const BinOp = Object.freeze({
    ADD:         { text: "+",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    SUB:         { text: "-",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    MUL:         { text: "*",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    DIV:         { text: "/",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    MOD:         { text: "%",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    EQ:          { text: "==",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    NE:          { text: "!=",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    LT:          { text: "<",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    GT:          { text: ">",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    LE:          { text: "<=",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    GE:          { text: ">=",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: true,  isLogical: false, isShift: false, isBitwise: false },
    LAND:        { text: "&&",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: true,  isShift: false, isBitwise: false },
    LOR:         { text: "||",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: true,  isShift: false, isBitwise: false },
    BAND:        { text: "&",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    BOR:         { text: "|",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    BXOR:        { text: "^",   linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    SHL:         { text: "<<",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: true,  isBitwise: false },
    SHR:         { text: ">>",  linearity: Linearity.UNRESTRICTED, isAssign: false, isCompare: false, isLogical: false, isShift: true,  isBitwise: false },
    ASSIGN:      { text: "=",   linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    ADD_ASSIGN:  { text: "+=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    SUB_ASSIGN:  { text: "-=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    MUL_ASSIGN:  { text: "*=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    DIV_ASSIGN:  { text: "/=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    MOD_ASSIGN:  { text: "%=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: false },
    BAND_ASSIGN: { text: "&=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    BOR_ASSIGN:  { text: "|=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    BXOR_ASSIGN: { text: "^=",  linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: false, isBitwise: true },
    SHL_ASSIGN:  { text: "<<=", linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: true,  isBitwise: false },
    SHR_ASSIGN:  { text: ">>=", linearity: Linearity.LINEAR,       isAssign: true,  isCompare: false, isLogical: false, isShift: true,  isBitwise: false },
  });
  const UnOp = Object.freeze({
    OP_PRE_INC:  { text: "++",  linearity: Linearity.LINEAR,       isIncDec: true,  isAddr: false, isDeref: false },
    OP_PRE_DEC:  { text: "--",  linearity: Linearity.LINEAR,       isIncDec: true,  isAddr: false, isDeref: false },
    OP_POST_INC: { text: "++",  linearity: Linearity.LINEAR,       isIncDec: true,  isAddr: false, isDeref: false },
    OP_POST_DEC: { text: "--",  linearity: Linearity.LINEAR,       isIncDec: true,  isAddr: false, isDeref: false },
    // Address-take produces identity (the address is observable).
    OP_ADDR:     { text: "&",   linearity: Linearity.AFFINE,       isIncDec: false, isAddr: true,  isDeref: false },
    // Memory read; pure at this level UNLESS the pointee is volatile —
    // EUnary's constructor upgrades a volatile deref to LINEAR (0187).
    OP_DEREF:    { text: "*",   linearity: Linearity.UNRESTRICTED, isIncDec: false, isAddr: false, isDeref: true },
    OP_POS:      { text: "+",   linearity: Linearity.UNRESTRICTED, isIncDec: false, isAddr: false, isDeref: false },
    OP_NEG:      { text: "-",   linearity: Linearity.UNRESTRICTED, isIncDec: false, isAddr: false, isDeref: false },
    OP_BNOT:     { text: "~",   linearity: Linearity.UNRESTRICTED, isIncDec: false, isAddr: false, isDeref: false },
    OP_LNOT:     { text: "!",   linearity: Linearity.UNRESTRICTED, isIncDec: false, isAddr: false, isDeref: false },
  });

  class EBinary extends Expr {
    constructor(loc, type, op, left, right) {
      const meta = BinOp[op];
      if (!meta) throw new Error(`EBinary: unknown op '${op}' (typo? known: ${Object.keys(BinOp).join(", ")})`);
      super(loc, type, [left, right], meta.linearity);
      this.op = op; this.left = left; this.right = right;
      Object.freeze(this);
    }
    _withChildren([left, right]) { return new EBinary(this.loc, this.type, this.op, left, right); }
  }
  class EUnary extends Expr {
    constructor(loc, type, op, operand) {
      const meta = UnOp[op];
      if (!meta) throw new Error(`EUnary: unknown op '${op}' (typo? known: ${Object.keys(UnOp).join(", ")})`);
      // `*p` where p points to volatile: the result type IS the accessed
      // object's type (computeUnaryType returns the pointee), so a
      // volatile deref classifies LINEAR (todos/0187).
      super(loc, type, [operand],
        meta.isDeref ? _accessLinearity(type) : meta.linearity);
      this.op = op; this.operand = operand;
      Object.freeze(this);
    }
    _withChildren([operand]) { return new EUnary(this.loc, this.type, this.op, operand); }
  }
  class ETernary extends Expr {
    constructor(loc, type, condition, thenExpr, elseExpr) {
      // Control flow: only one branch evaluates. Conservative LINEAR.
      super(loc, type, [condition, thenExpr, elseExpr], Linearity.LINEAR);
      this.condition = condition; this.thenExpr = thenExpr; this.elseExpr = elseExpr;
      Object.freeze(this);
    }
    _withChildren([condition, thenExpr, elseExpr]) {
      return new ETernary(this.loc, this.type, condition, thenExpr, elseExpr);
    }
  }
  class ECall extends Expr {
    // The result type is the function's return type (after array/function
    // decay on the callee). For "this isn't actually callable" cases the
    // parser also accepts (no separate diagnostic today), fall back to int —
    // some downstream pass will report the real diagnostic.
    //
    // funcDecl is the DFunc that's directly being called, if the callee is
    // a plain identifier resolving to one. For function-pointer expressions,
    // funcDecl is null and the codegen emits an indirect call.
    constructor(loc, callee, args) {
      // The parser wraps the callee in EDecay so callee.type is the
      // decayed pointer-to-function type. Synthesized callers (setjmp/
      // longjmp lowering) do the same.
      const calleeType = callee.type;
      let returnType = Types.TINT;
      if (calleeType.isPointer() &&
          calleeType.baseType.isFunction()) {
        returnType = calleeType.baseType.returnType;
      }
      super(loc, returnType, [callee, ...args], Linearity.LINEAR);
      this.callee = callee;
      this.arguments = args;
      // Look through EDecay so direct calls to a function name still
      // resolve to a DFunc decl (vs. an indirect call through a pointer).
      const inner = callee instanceof EDecay ? callee.operand : callee;
      this.funcDecl = (inner instanceof EIdent && inner.decl instanceof DFunc)
        ? inner.decl : null;
      Object.freeze(this);
    }
    _withChildren([callee, ...args]) { return new ECall(this.loc, callee, args); }
  }
  class ESubscript extends Expr {
    constructor(loc, type, array, index) {
      // Pure indexed read — unless the element type is volatile (0187).
      // makeSubscript pushes a volatile qualifier on the array TYPE down
      // onto the element type (C11 6.7.3p9), so checking `type` suffices.
      super(loc, type, [array, index], _accessLinearity(type));
      this.array = array; this.index = index;
      Object.freeze(this);
    }
    _withChildren([array, index]) { return new ESubscript(this.loc, this.type, array, index); }
  }
  class EMember extends Expr {
    constructor(loc, type, base, memberDecl) {
      if (!memberDecl) throw new Error(`EMember: memberDecl is required (use makeMember to look up by name)`);
      // Pure field read — unless the member is volatile, or the base
      // aggregate is volatile-qualified (member types do NOT inherit the
      // base's qualifiers in makeMember, so look at both; 0187).
      super(loc, type, [base],
        (base && base.type && base.type.isVolatile)
          ? Linearity.LINEAR : _accessLinearity(type));
      this.base = base;
      this.memberDecl = memberDecl;
      Object.freeze(this);
    }
    _withChildren([base]) { return new EMember(this.loc, this.type, base, this.memberDecl); }
  }
  class EArrow extends Expr {
    constructor(loc, type, base, memberDecl) {
      if (!memberDecl) throw new Error(`EArrow: memberDecl is required (use makeArrow to look up by name)`);
      // Pure indirect field read — unless the member is volatile, or the
      // base points to a volatile-qualified aggregate (member types do
      // NOT inherit the pointee's qualifiers in makeArrow; 0187).
      super(loc, type, [base],
        (base && base.type && base.type.isPointer() && base.type.baseType.isVolatile)
          ? Linearity.LINEAR : _accessLinearity(type));
      this.base = base;
      this.memberDecl = memberDecl;
      Object.freeze(this);
    }
    _withChildren([base]) { return new EArrow(this.loc, this.type, base, this.memberDecl); }
  }
  class ECast extends Expr {
    constructor(loc, type, targetType, expr) {
      super(loc, type, [expr], Linearity.UNRESTRICTED);
      this.targetType = targetType; this.expr = expr;
      Object.freeze(this);
    }
    _withChildren([expr]) { return new ECast(this.loc, this.type, this.targetType, expr); }
  }
  // sizeof / _Alignof don't evaluate their expression operand — children
  // is empty so its linearity doesn't propagate.
  class ESizeofExpr extends Expr {
    constructor(loc, type, expr) {
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.expr = expr;
      Object.freeze(this);
    }
  }
  class ESizeofType extends Expr {
    constructor(loc, type, operandType) {
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.operandType = operandType;
      Object.freeze(this);
    }
  }
  class EAlignofExpr extends Expr {
    constructor(loc, type, expr) {
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.expr = expr;
      Object.freeze(this);
    }
  }
  class EAlignofType extends Expr {
    constructor(loc, type, operandType) {
      super(loc, type, [], Linearity.UNRESTRICTED);
      this.operandType = operandType;
      Object.freeze(this);
    }
  }
  class EComma extends Expr {
    constructor(loc, type, expressions) {
      // Sequencing — each subexpression evaluates in order.
      super(loc, type, expressions, Linearity.LINEAR);
      this.expressions = expressions;
      Object.freeze(this);
    }
    _withChildren(newChildren) { return new EComma(this.loc, this.type, newChildren); }
  }
  // EInitList stays seal-only because normalizeInitList still mutates
  // `unionMemberIndex` in place when designators select a non-default
  // union member during the stack-based traversal. The `.type` mutation
  // was lifted out (normalize returns a fresh EInitList for that), but
  // `unionMemberIndex` writes happen through `top.output` references
  // mid-traversal and would require restructuring the whole walk to
  // remove. Acceptable trade-off — the refactor is bounded but not
  // earned today.
  class EInitList extends Expr {
    constructor(loc, type, elements, designators, unionMemberIndex) {
      super(loc, type, elements, Linearity.UNRESTRICTED);
      this.elements = elements;  // same ref as this.children
      this.designators = designators || [];
      this.unionMemberIndex = unionMemberIndex ?? -1;
      Object.seal(this);
    }
    _withChildren(newChildren) {
      return new EInitList(this.loc, this.type, newChildren, this.designators, this.unionMemberIndex);
    }
  }
  class EIntrinsic extends Expr {
    constructor(loc, type, ikind, args, argType) {
      // Most intrinsics are calls (memory ops, va_arg, etc.).
      super(loc, type, args, Linearity.LINEAR);
      this.intrinsicKind = ikind; this.args = args;
      this.argType = argType || null;
      Object.freeze(this);
    }
    _withChildren(newChildren) {
      return new EIntrinsic(this.loc, this.type, this.intrinsicKind, newChildren, this.argType);
    }
  }
  class EWasm extends Expr {
    constructor(loc, type, args, bytes) {
      super(loc, type, args, Linearity.LINEAR);
      this.args = args; this.bytes = bytes;
      Object.freeze(this);
    }
    _withChildren(newChildren) {
      return new EWasm(this.loc, this.type, newChildren, this.bytes);
    }
  }
  // ECompoundLiteral represents `(T){...}` — an aggregate-typed
  // allocation with observable identity (its storage address is taken).
  // Bubbles itself up via `referencedCompoundLiterals` so codegen can
  // discover all live compound literals from the AST shape rather than
  // a parser-side list — that lets INLINER replace nodes via
  // `_withChildren` without breaking layout (the bag picks up whatever
  // node is current at codegen time).
  class ECompoundLiteral extends Expr {
    constructor(loc, type, initList) {
      // Allocation has identity (the storage's address is observable).
      super(loc, type, [initList], Linearity.AFFINE);
      this.initList = initList;
      Object.freeze(this);
    }
    _withChildren([initList]) { return new ECompoundLiteral(this.loc, this.type, initList); }
    get referencedCompoundLiterals() {
      return new TreeBag([this], [this.initList.referencedCompoundLiterals]);
    }
  }
  class EImplicitCast extends Expr {
    constructor(loc, type, expr) {
      super(loc, type, [expr], Linearity.UNRESTRICTED);
      this.expr = expr;
      Object.freeze(this);
    }
    _withChildren([expr]) { return new EImplicitCast(this.loc, this.type, expr); }
  }
  // Array→pointer or function→pointer decay. The operand has array or
  // function type; the EDecay node has the corresponding decayed pointer type.
  // Codegen for EDecay just emits the operand (which already produces the
  // base address for arrays / table index for functions).
  class EDecay extends Expr {
    constructor(loc, type, operand) {
      super(loc, type, [operand], Linearity.UNRESTRICTED);
      this.operand = operand;
      Object.freeze(this);
    }
    _withChildren([operand]) { return new EDecay(this.loc, this.type, operand); }
  }
  class EGCNew extends Expr {
    constructor(loc, type, args) {
      // GC allocation produces a fresh ref with identity.
      super(loc, type, args, Linearity.AFFINE);
      this.args = args;
      Object.freeze(this);
    }
    _withChildren(newChildren) { return new EGCNew(this.loc, this.type, newChildren); }
  }

  // --- Stmt subclasses ---
  // Most are frozen at construction. SLabel / SGoto stay seal-only because
  // their fields get filled in during the parser's goto-resolution pass.
  class SExpr extends Stmt {
    constructor(loc, expr) { super(loc, [expr]); this.expr = expr; Object.freeze(this); }
    _withChildren([expr]) { return new SExpr(this.loc, expr); }
  }
  // SDecl bubble-up needs to reach into each DVar's initExpr — the
  // declarations array isn't structurally `children` (DVars aren't
  // Expr/Stmt) but their initializers can reference functions.
  class SDecl extends Stmt {
    constructor(loc, declarations) {
      const initExprs = [];
      for (const d of declarations) {
        if (d instanceof DVar && d.initExpr) initExprs.push(d.initExpr);
      }
      super(loc, initExprs);
      this.declarations = declarations;
      Object.freeze(this);
    }
    _withChildren(_) { return this; /* DVars are mutated in place; children mirror initExprs */ }
  }
  class SCompound extends Stmt {
    constructor(loc, statements, labels, isLabelGroup) {
      super(loc, statements);
      this.statements = statements;
      this.labels = labels || [];
      // Transient parse-time marker: a 2-element [SLabel, body] group produced
      // for a labeled statement, so it can be flattened back into sibling
      // markers when it sits directly inside a compound (see
      // parseCompoundStatement). Never set after parsing.
      this.isLabelGroup = !!isLabelGroup;
      Object.freeze(this);
    }
    _withChildren(newChildren) { return new SCompound(this.loc, newChildren, this.labels); }
  }
  class SIf extends Stmt {
    constructor(loc, condition, thenBranch, elseBranch) {
      const kids = [condition, thenBranch];
      if (elseBranch) kids.push(elseBranch);
      super(loc, kids);
      this.condition = condition;
      this.thenBranch = thenBranch;
      this.elseBranch = elseBranch || null;
      Object.freeze(this);
    }
    _withChildren(newChildren) {
      const [cond, then_, else_] = newChildren;
      return new SIf(this.loc, cond, then_, else_ || null);
    }
  }
  class SWhile extends Stmt {
    constructor(loc, condition, body) {
      super(loc, [condition, body]);
      this.condition = condition; this.body = body;
      Object.freeze(this);
    }
    _withChildren([cond, body]) { return new SWhile(this.loc, cond, body); }
  }
  class SDoWhile extends Stmt {
    constructor(loc, body, condition) {
      super(loc, [body, condition]);
      this.body = body; this.condition = condition;
      Object.freeze(this);
    }
    _withChildren([body, cond]) { return new SDoWhile(this.loc, body, cond); }
  }
  class SFor extends Stmt {
    constructor(loc, init, condition, increment, body) {
      const kids = [];
      if (init) kids.push(init);
      if (condition) kids.push(condition);
      if (increment) kids.push(increment);
      kids.push(body);
      super(loc, kids);
      this.init = init || null;
      this.condition = condition || null;
      this.increment = increment || null;
      this.body = body;
      Object.freeze(this);
    }
    // Reconstruct from named slots — the children array's shape varies
    // (3, 4, or 5 slots depending on which optional clauses were present).
    _withChildren(_) {
      throw new Error(`SFor._withChildren: rebuild via the named-arg constructor instead`);
    }
  }
  class SBreak extends Stmt {
    constructor(loc) { super(loc); Object.freeze(this); }
  }
  class SContinue extends Stmt {
    constructor(loc) { super(loc); Object.freeze(this); }
  }
  class SReturn extends Stmt {
    constructor(loc, expr) {
      super(loc, expr ? [expr] : []);
      this.expr = expr || null;
      Object.freeze(this);
    }
    _withChildren(newChildren) {
      return new SReturn(this.loc, newChildren.length > 0 ? newChildren[0] : null);
    }
  }
  class SSwitch extends Stmt {
    constructor(loc, expr, body) {
      super(loc, [expr, body]);
      this.expr = expr; this.body = body;
      Object.freeze(this);
    }
    _withChildren([expr, body]) { return new SSwitch(this.loc, expr, body); }
    // Barrier: case labels inside this switch's body belong to this
    // switch, not the enclosing one. Readers that want this switch's
    // cases read `sw.body.caseBag` directly.
    get caseBag() { return _EMPTY_TREE_BAG; }
  }
  // A case (or default) label in a switch body. Standalone statement —
  // the next statement in the enclosing compound is the case's target
  // (parallel to how SLabel works for goto labels). `lo` / `hi` are
  // BigInts giving the value range (inclusive). For a single-value
  // case (`case 5:`), lo === hi. For a GNU range (`case 0 ... 9:`),
  // lo < hi. For default, isDefault is true and lo/hi are ignored.
  class SCase extends Stmt {
    constructor(loc, lo, hi, isDefault) {
      super(loc);
      this.lo = lo; this.hi = hi; this.isDefault = !!isDefault;
      Object.freeze(this);
    }
    get caseBag() { return new TreeBag([this]); }
  }
  // SGoto and SLabel are seal-only (not frozen) because the parser
  // backfills `target` (when a forward goto's label is later defined)
  // and updates `labelKind` / `hasGotos` as gotos are resolved.
  class SGoto extends Stmt {
    constructor(loc, label) { super(loc); this.label = label; this.target = null; Object.seal(this); }
  }
  class SLabel extends Stmt {
    constructor(loc, name, enclosingBlock) { super(loc); this.name = name; this.enclosingBlock = enclosingBlock || null; this.labelKind = Types.LabelKind.FORWARD; this.hasGotos = false; this.isSwitchLevel = false; Object.seal(this); }
  }
  class SEmpty extends Stmt {
    constructor(loc) { super(loc); Object.freeze(this); }
  }
  // STryCatch's catches are { tag, bindings, body } objects — body is a
  // Stmt and bubbles, so include each catch body in children.
  class STryCatch extends Stmt {
    constructor(loc, tryBody, catches) {
      const kids = [tryBody, ...catches.map(c => c.body)];
      super(loc, kids);
      this.tryBody = tryBody; this.catches = catches;
      Object.freeze(this);
    }
    _withChildren(newChildren) {
      const newTry = newChildren[0];
      const newCatches = this.catches.map((c, i) => ({ ...c, body: newChildren[i + 1] }));
      return new STryCatch(this.loc, newTry, newCatches);
    }
  }
  class SThrow extends Stmt {
    constructor(loc, tag, args) {
      super(loc, args);
      this.tag = tag; this.args = args;
      Object.freeze(this);
    }
    _withChildren(newChildren) { return new SThrow(this.loc, this.tag, newChildren); }
  }

// ---------- AST traversal / rewrite ----------
//
// walkExpr(expr, visit) walks the tree pre-order. The visitor returns:
//   - undefined  → keep recursing into children
//   - some node  → replace this subtree with the returned node (children
//                  of the replacement are NOT visited automatically;
//                  the visitor can call walkExpr on the replacement
//                  recursively if it wants that)
// If any child changed during recursion, the parent is rebuilt via
// `_withChildren(newChildren)`. Identity-preserving on no-change paths,
// so allocation stays O(changed).

function walkExpr(expr, visit) {
  if (!expr) return expr;
  const replaced = visit(expr);
  if (replaced !== undefined) return replaced;
  const kids = expr.children;
  if (!kids || kids.length === 0) return expr;
  let changed = false;
  const newKids = new Array(kids.length);
  for (let i = 0; i < kids.length; i++) {
    const w = walkExpr(kids[i], visit);
    if (w !== kids[i]) changed = true;
    newKids[i] = w;
  }
  return changed ? expr._withChildren(newKids) : expr;
}

// Substitute parameter references in an expression. `paramMap` maps
// DVar instances (the function's parameter decls) to expression
// replacements (the call's argument expressions). Used by the inliner
// to rewrite a function body for substitution at a call site.
function substituteParams(expr, paramMap) {
  return walkExpr(expr, node => {
    if (node instanceof EIdent && node.decl && paramMap.has(node.decl)) {
      return paramMap.get(node.decl);
    }
    return undefined;
  });
}

// ---------- AST builders that apply C semantics ----------
//
// These take "raw" inputs (the things the parser literally has at hand:
// callee + args, op + operands, etc.) and return a node with the
// C-standard conversions already inserted: array/function decay,
// implicit casts to the target type, default-argument promotions, etc.
//
// Constructors stay dumb (no implicit insertions). The make* helpers are
// the canonical place to build correct nodes — useful for the parser, AST
// rewriters, and any future pass that synthesizes calls/binops/etc.
//
// Diagnostics: callers pass a `report(loc, msg)` callback. The helpers
// don't throw — they report and proceed with the best-effort node, so
// callers can decide whether errors are fatal or recoverable.

// True if `srcType` flows into `targetType` under C99 §6.5.16.1
// (simple-assignment compatibility — the "as if by assignment" rules
// the spec invokes for function args, return values, and init exprs).
//
// Covers:
//   - same type (post qualifier strip)
//   - both arithmetic (numeric promotion / narrowing)
//   - target _Bool + source pointer
//   - both pointers, with compatible bases OR either is void*
//   - target pointer + source null-pointer constant
//   - both struct/union of compatible types
//   - ref-target rules (same ref, NPC → ref, arithmetic → __eqref boxing)
//   - divergent absorbs (error recovery)
//
// `expr` is consulted only for the null-pointer-constant cases; pass
// it when the source expression is available, otherwise null.
function isCharType(t) {
  return t === Types.TCHAR || t === Types.TSCHAR || t === Types.TUCHAR;
}

function typesAreAssignmentCompatible(srcType, targetType, expr) {
  const s = srcType.removeQualifiers();
  const t = targetType.removeQualifiers();
  if (s === t) return true;
  // Divergent (parser error recovery) absorbs — don't cascade complaints.
  if (s.isDivergent() || t.isDivergent()) return true;
  // Voids: assignment to void shouldn't happen at well-formed sites,
  // but tolerate so we don't double-error after a real error elsewhere.
  if (s.isVoid() || t.isVoid()) return true;
  // TAUTO is the C23 placeholder type; auto-resolution should have
  // replaced it before we reach a flow site, but `const auto` slips
  // past one branch of the resolver — tolerate it here so the user
  // sees the actual auto-related error rather than a confusing cast
  // error on the placeholder.
  if (s === Types.TAUTO || t === Types.TAUTO) return true;
  // C99 6.5.16.1: arithmetic types convert freely under assignment.
  if (s.isArithmetic() && t.isArithmetic()) return true;
  // _Bool ← any pointer (truthiness).
  if (t === Types.TBOOL && s.isPointer()) return true;
  // Pointers ↔ pointers (C99 6.5.16.1): the target's pointee must carry
  // every qualifier the source's pointee has (you can ADD const, not
  // drop it), and unqualified pointee types must match structurally.
  if (s.isPointer() && t.isPointer()) {
    const sBase = s.baseType, tBase = t.baseType;
    if (sBase.isVoid() || tBase.isVoid()) return true;
    if (sBase.isConst && !tBase.isConst) return false;
    if (sBase.isVolatile && !tBase.isVolatile) return false;
    const su = sBase.removeQualifiers(), tu = tBase.removeQualifiers();
    if (su.isCompatibleWith(tu)) return true;
    if (isCharType(su) && isCharType(tu)) return true;
    // Pointers to same-size integer types of different signedness
    // (long long * <- unsigned long long *). Strictly a constraint
    // violation, but gcc and clang accept it (with a default-off
    // warning) and real code — and Csmith output — relies on it. The
    // representation is identical either way.
    if (su.isInteger() && tu.isInteger() && su.size === tu.size) return true;
    return false;
  }
  // Pointer target ← null pointer constant (literal 0, casts of 0).
  if (t.isPointer() && expr && isNullPointerConstant(expr)) return true;
  // Struct/union ← compatible struct/union.
  if ((s.isStruct() || s.isUnion()) && (t.isStruct() || t.isUnion())) {
    return s.isCompatibleWith(t);
  }
  // Ref-target rules. (rejectNonZeroToRef enforces a subset; we mirror
  // it here so the predicate is the single gate.)
  if (t.isRef()) {
    if (s.isRef()) {
      if (s.isCompatibleWith(t)) return true;
      // refextern (non-nullable) widens to externref (nullable). Going
      // the other direction would erase the nullability invariant.
      if (s === Types.TREFEXTERN && t === Types.TEXTERNREF) return true;
      // GC struct inheritance: a Dog ref flows into an Animal ref if
      // Animal is an ancestor in the parentType chain. parentType lives on
      // the heap form, so normalize both sides via gcHeap.
      if (s.isGCStruct() && t.isGCStruct()) {
        const th = t.gcHeap();
        for (let p = s.gcHeap().parentType; p; p = p.parentType) {
          if (p === th) return true;
        }
      }
      // Any GC ref widens to __eqref (top of the GC lattice).
      if (t === Types.TEQREF && (s.isGCStruct() || s.isGCArray())) return true;
      return false;
    }
    if (expr && isNullPointerConstant(expr)) return true;
    if (t === Types.TEQREF && s.isArithmetic()) return true;
    return false;
  }
  // Anything left: ref → non-ref, mismatched aggregates, etc. — reject.
  return false;
}

// True if `t` is legal in a "controlling expression" position
// (C99 §6.8.4.1, §6.8.5.1-3, §6.5.15.2, §6.5.3.3 — `if` / `while` /
// `do-while` / `for` / `?:` / `!`). Standard C requires scalar; we
// extend with refs (compiler extension: `if (gc_ref)` is sugar for
// `__ref_is_null` semantics, just as we already allow `!gc_ref`).
function isBoolContextType(t) {
  const u = t.removeQualifiers();
  return u.isDivergent() || u.isScalar() || u.isRef();
}

// True if `leftType` and `rightType` are a legal operand pair for the
// given binary op. Catches operator-illegal combinations the C standard
// forbids regardless of any implicit conversion (e.g. bitwise ops on
// floats, struct + struct, ptr + ptr). Called from `makeBinary` BEFORE
// the cast/conversion logic — if it fails we report and skip the rest
// to avoid downstream "incompatible types" cascades.
//
// Compound assigns (X_ASSIGN) defer to the underlying op's rules.
// Ref operands are tolerated here — the caller's ref-specific block
// handles them with its own per-op messages.

// Compound-assign op → its base binary op ("SHR_ASSIGN" → "SHR"). The ONE
// _ASSIGN-stripping site — both sema (typesAreOperandCompatible) and codegen
// (emitAssignment → emitBinaryAluOp) derive the base op through here.
function baseOpOfCompound(op) {
  return op.endsWith("_ASSIGN") ? op.slice(0, -"_ASSIGN".length) : op;
}

function typesAreOperandCompatible(op, leftType, rightType) {
  const meta = AST.BinOp[op];
  if (!meta) return true;
  const l = leftType.removeQualifiers();
  const r = rightType.removeQualifiers();
  // Divergent absorbs (parser error recovery).
  if (l.isDivergent() || r.isDivergent()) return true;
  // Refs: defer to the ref-specific handling already in makeBinary.
  if (l.isRef() || r.isRef()) return true;
  // ASSIGN: assignment-compatibility is the relevant rule, checked
  // separately at the call site via typesAreAssignmentCompatible.
  if (op === "ASSIGN") return true;
  // Compound assigns: evaluate as the underlying arithmetic/bitwise op.
  if (meta.isAssign) {
    return typesAreOperandCompatible(baseOpOfCompound(op), leftType, rightType);
  }
  // Bitwise / shift: integer operands only.
  if (meta.isBitwise || meta.isShift) {
    return l.isInteger() && r.isInteger();
  }
  // Logical && / ||: scalar (testable as bool).
  if (meta.isLogical) return l.isScalar() && r.isScalar();
  // MUL / DIV: both arithmetic. MOD: integer-only (% on float is
  // disallowed; fmod is a function).
  if (op === "MUL" || op === "DIV") return l.isArithmetic() && r.isArithmetic();
  if (op === "MOD") return l.isInteger() && r.isInteger();
  // ADD: both arithmetic, or one pointer/array and one integer.
  if (op === "ADD") {
    if (l.isArithmetic() && r.isArithmetic()) return true;
    if ((l.isPointer() || l.isArray()) && r.isInteger()) return true;
    if ((r.isPointer() || r.isArray()) && l.isInteger()) return true;
    return false;
  }
  // SUB: both arithmetic, or pointer-int, or pointer-pointer (same base).
  if (op === "SUB") {
    if (l.isArithmetic() && r.isArithmetic()) return true;
    if ((l.isPointer() || l.isArray()) && r.isInteger()) return true;
    if ((l.isPointer() || l.isArray()) && (r.isPointer() || r.isArray())) {
      return l.baseType.removeQualifiers().isCompatibleWith(r.baseType.removeQualifiers());
    }
    return false;
  }
  // Comparisons.
  if (meta.isCompare) {
    if (l.isArithmetic() && r.isArithmetic()) return true;
    if (l.isPointer() && r.isPointer()) return true;
    // EQ/NE: pointer + integer is allowed only via NPC; that case is
    // handled by typesAreAssignmentCompatible at the cast site. We
    // tolerate it here so the assignment-compat path can give the
    // canonical NPC message without cascading.
    if (op === "EQ" || op === "NE") {
      if ((l.isPointer() && r.isInteger()) || (r.isPointer() && l.isInteger())) return true;
    }
    return false;
  }
  return false;
}

// Wrap an expression in EImplicitCast at the target type. Pass-through
// when the source already matches the target after qualifier strip,
// or when either side is void / divergent. Validates assignment
// compatibility — `reportError` (not fatal) on mismatch and pass the
// expression through unwrapped, so cascading damage is bounded.
function maybeImplicitCast(expr, targetType) {
  targetType = targetType.removeQualifiers();
  let srcType = expr.type.removeQualifiers();
  // Arrays decay in boolean contexts: _Bool b = arr; is the decayed
  // pointer's truth value.
  if (targetType === Types.TBOOL && (srcType.isArray() || srcType.isFunction())) {
    expr = maybeDecay(expr);
    srcType = expr.type.removeQualifiers();
  }
  if (srcType === targetType) return expr;
  if (targetType.isVoid() || srcType.isVoid()) return expr;
  // Divergent (recovery from a parser error) absorbs — don't wrap.
  if (srcType.isDivergent() || targetType.isDivergent()) return expr;
  if (!typesAreAssignmentCompatible(srcType, targetType, expr)) {
    // Specialize the message for non-ref → ref (the old rejectNonZeroToRef
    // case) — the user almost certainly wants either __cast or __ref_null.
    if (targetType.isRef() && !srcType.isRef()) {
      const castSpelling = castTypeArgSpelling(targetType);
      reportError(expr.loc,
        `cannot convert '${srcType.toString()}' to reference type '${targetType.toString()}' (use __cast(${castSpelling}, x) for an explicit conversion, or __ref_null for null)`);
    } else {
      reportError(expr.loc,
        `incompatible types: cannot implicitly convert '${srcType.toString()}' to '${targetType.toString()}'`);
    }
    return expr;
  }
  return new EImplicitCast(expr.loc, targetType, expr);
}

// The spelling to suggest for the type-arg of `__cast(T, x)` and similar
// intrinsics. GC struct refs collapse to their heap form (the ref form's `*`
// is not allowed in heap-type-arg positions).
function castTypeArgSpelling(type) {
  const u = type.removeQualifiers();
  if (u.isGCStruct()) return `__struct ${u.tagName}`;
  return type.toString();
}

// Wrap an expression in EDecay if its type is array or function.
// Pass-through otherwise.
function maybeDecay(expr) {
  const t = expr.type;
  if (t.isArray() || t.isFunction()) return new EDecay(expr.loc, t.decay(), expr);
  return expr;
}

// True if `expr` is a null pointer constant (literal 0, possibly wrapped
// in casts to void* / similar).
function isNullPointerConstant(expr) {
  if (!expr) return false;
  if (expr instanceof EInt && expr.value === 0n) return true;
  if (expr instanceof EImplicitCast || expr instanceof ECast) {
    return isNullPointerConstant(expr.expr);
  }
  return false;
}

// Reject a non-zero non-ref source flowing into a ref target. Allowed:
// null pointer constant, prim → __eqref auto-box. Anything else needs an
// explicit __cast.
function rejectNonZeroToRef(targetType, expr, loc) {
  if (!expr || !targetType) return;
  const t = targetType.removeQualifiers();
  const s = expr.type.removeQualifiers();
  if (!t.isRef() || s.isRef()) return;
  if (isNullPointerConstant(expr)) return;
  if (t === Types.TEQREF && s.isArithmetic()) return;
  reportError(loc,
    `cannot convert '${expr.type.toString()}' to reference type '${targetType.toString()}' (use __cast(${castTypeArgSpelling(targetType)}, x) for an explicit conversion, or __ref_null for null)`);
}

// Pointer arithmetic: given the operand types of a binary `+`/`-`,
// return the pointee element type if one side is a pointer/array (the
// other being an integer), or null if it's not pointer arithmetic.
// Used by both constEval and codegen to consistently identify the
// pointee whose size scales the integer operand.
function pointerArithElemType(leftType, rightType) {
  const l = leftType.removeQualifiers();
  const r = rightType.removeQualifiers();
  if (l.isPointer() || l.isArray()) return l.baseType;
  if (r.isPointer() || r.isArray()) return r.baseType;
  return null;
}

// C99 6.3.1.1: integer promotions for bitfield expressions. A bitfield
// member smaller than int promotes to int (or unsigned int if it can't
// be represented as int). Non-bitfield expressions promote to themselves.
function promoteExprType(e) {
  const t = e.type;
  let bf = null;
  if ((e instanceof EMember || e instanceof EArrow) && e.memberDecl.bitWidth >= 0) {
    bf = e.memberDecl;
  }
  if (bf) {
    const bw = bf.bitWidth;
    const uq = t.removeQualifiers();
    const isSigned = uq === Types.TINT || uq === Types.TLONG || uq === Types.TSHORT || uq === Types.TSCHAR || uq === Types.TCHAR;
    if (isSigned || bw < 32) return Types.TINT;
    return Types.TUINT;
  }
  return t;
}

// Result type of a binary expression. Operands must be already decayed
// (so array types never reach here) and bitfield-promoted (so small
// types are already TINT/TUINT).
function computeBinaryType(op, leftType, rightType) {
  // Divergent absorbs — propagate so further ops on it stay sound.
  if (leftType.isDivergent() || rightType.isDivergent()) return Types.TDIVERGENT;
  const meta = AST.BinOp[op];
  // Comparison and logical operators return int.
  if (meta.isCompare || meta.isLogical) return Types.TINT;
  // Assignment operators return left type.
  if (meta.isAssign) return leftType;
  // Shift operators: result type is the promoted left operand type (C99 6.5.7).
  if (meta.isShift) {
    const uq = leftType.removeQualifiers();
    if (uq === Types.TCHAR || uq === Types.TSCHAR || uq === Types.TUCHAR ||
        uq === Types.TSHORT || uq === Types.TUSHORT || uq === Types.TBOOL) {
      return Types.TINT;
    }
    return uq;
  }
  // Pointer arithmetic.
  if (leftType.isPointer() && rightType.isInteger()) return leftType;
  if (rightType.isPointer() && leftType.isInteger() && op === "ADD") return rightType;
  if (leftType.isPointer() && rightType.isPointer() && op === "SUB") return Types.TLONG;
  return Types.usualArithmeticConversions(leftType, rightType);
}

// Build an EBinary, applying C semantics:
//   - reject ref-incompatible operators
//   - reject non-null int → ref on ASSIGN; reject any compound-assign on ref
//   - decay array/function operands (left only when not an assignment target)
//   - compute the result type via C99 promotion + usual arithmetic conversions
//   - insert implicit casts on operands to the common operation type
//
// `op` is the AST op string ("ADD", "SUB", "ASSIGN", "ADD_ASSIGN", ...).
// `loc` is typically the left operand's loc to match how chained binops
// report (the whole-expression start). Type-error diagnostics use
// `fatalError` so parsing halts at the first one, matching the parser's
// historic behavior.
function makeBinary(loc, op, left, right) {
  const meta = AST.BinOp[op];
  if (!meta) throw new Error(`makeBinary: unknown op '${op}'`);
  const opText = meta.text;
  const lIsRef = left.type.removeQualifiers().isRef();
  const rIsRef = right.type.removeQualifiers().isRef();
  // Refs: only ==, !=, &&, ||, ASSIGN are allowed.
  if (lIsRef || rIsRef) {
    if (op === "LT" || op === "GT" || op === "LE" || op === "GE") {
      fatalError(loc, `'${opText}' on reference type is not allowed (only ==, != for identity/null)`);
    }
    // Arithmetic / shift / bitwise on refs is meaningless.
    if (op === "ADD" || op === "SUB" || op === "MUL" || op === "DIV" ||
        op === "MOD" || meta.isShift || meta.isBitwise) {
      fatalError(loc, `'${opText}' on reference type is not allowed`);
    }
    // == / != involving refs: must be ref-vs-ref OR ref-vs-(null pointer constant).
    if (meta.isCompare && (op === "EQ" || op === "NE")) {
      if (lIsRef !== rIsRef && !isNullPointerConstant(lIsRef ? right : left)) {
        fatalError(loc,
          `'${opText}' between reference and non-reference requires the non-ref operand to be the literal 0 / NULL`);
      }
    }
  }
  // Compound assignment on ref: not allowed.
  if (lIsRef && meta.isAssign && op !== "ASSIGN") {
    fatalError(loc, `'${opText}' on reference type is not allowed`);
  }
  // C11 6.5.16p2: assignment requires a modifiable lvalue on the left.
  // Non-lvalues (`5 = 3`, `f() = x`, `(int)x = 5`) used to fall through
  // to codegen and die in emitLValue's internal throw — diagnose here.
  // Array/function-typed lvalues are never modifiable (6.3.2.1p1).
  if (meta.isAssign) {
    if (!isLvalueExpr(left)) {
      reportError(loc, `expression is not assignable`);
      return new EBinary(loc, Types.TDIVERGENT, op, left, right);
    }
    const lu = left.type.removeQualifiers();
    if (lu.isArray() || lu.isFunction()) {
      reportError(loc,
        `${lu.isArray() ? "array" : "function"} type '${left.type.toString()}' is not assignable`);
      return new EBinary(loc, Types.TDIVERGENT, op, left, right);
    }
    // C11 6.3.2.1p1: const-qualified (or const-member-bearing) lvalues
    // are not modifiable (todos/0227 G22).
    const constViol = exprConstWriteViolation(left);
    if (constViol) {
      reportError(loc, `cannot assign to ${constViol}`);
      return new EBinary(loc, Types.TDIVERGENT, op, left, right);
    }
  }
  // Decay array/function operands. ASSIGN/compound's left is the lvalue
  // target — never decayed. ASSIGN's right decays only if the left is a
  // pointer (so `p = arr` works).
  const isPtrArith = (op === "ADD" || op === "SUB") &&
    (left.type.isPointer() || right.type.isPointer() ||
     left.type.isArray() || right.type.isArray());
  if (!meta.isAssign) {
    left = maybeDecay(left);
    right = maybeDecay(right);
  } else if (op === "ASSIGN" && left.type.isPointer()) {
    right = maybeDecay(right);
  }
  // Operand-compat: catch operator-illegal type combinations BEFORE
  // the cast/conversion logic. `int & float`, `struct + struct`,
  // `int << ptr`, etc. — none of these are fixable by an implicit
  // cast; reporting here gives a clean message and prevents downstream
  // cascades. Refs and ASSIGN have their own specific handling above.
  if (!typesAreOperandCompatible(op, left.type, right.type)) {
    reportError(loc,
      `invalid operands to binary '${opText}': '${left.type.toString()}' and '${right.type.toString()}'`);
    return new EBinary(loc, Types.TDIVERGENT, op, left, right);
  }
  // ASSIGN: validate RHS is assignment-compatible with LHS. EImplicitCast
  // isn't inserted on ASSIGN (codegen does the conversion), but we still
  // need to enforce the rules — otherwise `ref = 5` etc. silently miscompiles.
  if (op === "ASSIGN" &&
      !typesAreAssignmentCompatible(right.type, left.type, right)) {
    if (left.type.removeQualifiers().isRef() && !right.type.removeQualifiers().isRef()) {
      reportError(loc,
        `cannot convert '${right.type.toString()}' to reference type '${left.type.toString()}' (use __cast(${castTypeArgSpelling(left.type)}, x) for an explicit conversion, or __ref_null for null)`);
    } else {
      reportError(loc,
        `incompatible types in assignment: cannot convert '${right.type.toString()}' to '${left.type.toString()}'`);
    }
  }
  // Apply C99 6.3.1.1 integer promotions for bitfield operands.
  const resType = computeBinaryType(op, promoteExprType(left), promoteExprType(right));
  // Insert implicit casts on operands to the common op type. Skipped for:
  //   - assignment ops (handled by lvalue context, not arithmetic)
  //   - logical && / || (boolean coercion is per-operand, not common)
  //   - pointer arithmetic (operand types are deliberately mixed)
  //   - pointer comparisons (no implicit qualifier-stripping on pointee)
  //   - ref operands (== / != on refs is identity, no conversion)
  if (!meta.isAssign && !meta.isLogical) {
    const leftType = left.type;
    const rightType = right.type;
    const involvesRef = leftType.removeQualifiers().isRef() ||
                        rightType.removeQualifiers().isRef();
    const involvesPtr = leftType.isPointer() || rightType.isPointer();
    if (!isPtrArith && !involvesRef && !(meta.isCompare && involvesPtr)) {
      // Comparisons convert operands at the common type of the PROMOTED
      // operands (C11 6.5.8p3) — bitfield promotion included: an
      // `unsigned bf:3` promotes to (signed) int since its values fit,
      // so `bf > -1` is a signed compare. Using the raw member types
      // here used to make it unsigned.
      const opType = meta.isCompare
        ? Types.usualArithmeticConversions(promoteExprType(left), promoteExprType(right))
        : resType;
      left = maybeImplicitCast(left, opType);
      right = maybeImplicitCast(right, opType);
    }
  }
  return new EBinary(loc, resType, op, left, right);
}

// C11 6.3.2.1p1: lvalue-ness is structural — an identifier bound to an
// object, a member/subscript/deref access, a string literal, or a
// compound literal (6.5.2.5p4: a compound literal IS an lvalue). This
// mirrors exactly the shapes codegen's emitLValue can address; anything
// else is an rvalue and must be rejected in sema, not crash codegen.
// `.member` propagates the base's lvalue-ness (`f().m` is NOT an
// lvalue) — except a GC-struct base, where field access is
// reference-like and assignable through any ref-valued expression.
function isLvalueExpr(e) {
  if (e instanceof EIdent) return !!(e.decl && e.decl instanceof DVar);
  if (e instanceof EMember) {
    const bt = e.base.type && e.base.type.removeQualifiers();
    if (bt && bt.isGCStruct()) return true;
    return isLvalueExpr(e.base);
  }
  if (e instanceof EArrow) return true;
  if (e instanceof ESubscript) return true;
  if (e instanceof EUnary && e.op === "OP_DEREF") return true;
  if (e instanceof ECompoundLiteral) return true;
  if (e instanceof EString) return true;
  return false;
}

// C11 6.3.2.1p1: a modifiable lvalue additionally is not const-qualified
// and, for a struct/union, has no const-qualified member (recursively,
// through nested aggregates and array elements — a pointer TO const stops
// the walk: the pointer itself is still writable). Returns a description
// for the diagnostic, or null if the type is writable (todos/0227 G22).
function constWriteViolation(type, seen) {
  if (type.isConst) return `const-qualified type '${type.toString()}'`;
  const uq = type.removeQualifiers();
  if (uq.isArray()) return constWriteViolation(uq.baseType, seen);
  if ((uq.isStruct() || uq.isUnion()) && uq.tagDecl && uq.tagDecl.members) {
    if (!seen) seen = new Set();
    if (seen.has(uq.tagDecl)) return null;
    seen.add(uq.tagDecl);
    for (const m of uq.tagDecl.members) {
      if (m.type && constWriteViolation(m.type, seen)) {
        return `type '${type.toString()}' with const-qualified member` +
               (m.name ? ` '${m.name}'` : "");
      }
    }
  }
  return null;
}

// C11 6.5.2.3p3: a member access is qualified with its BASE's qualifiers,
// but EMember/EArrow carry the member's declared type — walk the access
// path so `const struct S s; s.m = ..` and writes through a pointer to a
// const struct are caught too. The walk checks only QUALIFIER propagation:
// the aggregate const-MEMBER rule applies to the assigned type itself
// (whole-aggregate assignment), NOT to bases — writing a non-const member
// of a struct/union that merely CONTAINS a const member is legal (clang
// agrees; the csmith corpus is full of that shape). A dereference stops
// the walk (a const POINTER member still points at writable storage).
function exprConstWriteViolation(e) {
  const viol = e.type && constWriteViolation(e.type);
  if (viol) return viol;
  return basePathConstViolation(e);
}
function basePathConstViolation(e) {
  const memberDesc = (m) => `member${m && m.name ? ` '${m.name}'` : ""}`;
  if (e instanceof EMember) {
    const bt = e.base.type;
    if (bt && bt.isConst) {
      return `${memberDesc(e.memberDecl)} of const-qualified type '${bt.toString()}'`;
    }
    return basePathConstViolation(e.base);
  }
  if (e instanceof EArrow) {
    const pt = e.base.type && e.base.type.removeQualifiers();
    const pointee = pt && pt.isPointer() ? pt.baseType : null;
    if (pointee && pointee.isConst) {
      return `${memberDesc(e.memberDecl)} of pointer to const-qualified type '${pointee.toString()}'`;
    }
    return null;
  }
  if (e instanceof ESubscript) {
    // A real array base propagates its enclosing aggregate's qualifiers;
    // a pointer subscript's const-ness already lives on the element type.
    // makeSubscript decays the array base behind an EDecay — look through
    // it, or a member array of a const struct (`const struct S s;
    // s.a[0] = ..`) walks a pointer-typed node and the check goes blind.
    const arr = e.array instanceof EDecay ? e.array.operand : e.array;
    const at = arr.type && arr.type.removeQualifiers();
    if (at && at.isArray()) return basePathConstViolation(arr);
    return null;
  }
  return null;
}

// Mark `expr` as having its address taken — promotes the underlying
// DVar from REGISTER to MEMORY allocation. Walks through EMember and
// (for array elements) ESubscript to find the root storage.
function markAddressTaken(expr) {
  if (!expr) return;
  if (expr instanceof EIdent) {
    if (expr.decl && expr.decl instanceof DVar) {
      expr.decl.allocClass = Types.AllocClass.MEMORY;
    }
  } else if (expr instanceof EMember) {
    markAddressTaken(expr.base);
  } else if (expr instanceof ESubscript) {
    if (expr.array.type && expr.array.type.isArray()) {
      markAddressTaken(expr.array);
    }
  }
}

// Build an EUnary, applying C semantics. Dispatches on `op`:
//   OP_PRE_INC / OP_PRE_DEC / OP_POST_INC / OP_POST_DEC: reject ref operand
//   OP_ADDR: reject bitfield-member, ref, GC struct field, GC array elem;
//            mark the underlying decl as memory-allocated
//   OP_DEREF: reject ref operand; decay array/function operand
//   OP_POS / OP_NEG / OP_BNOT: reject ref operand
//   OP_LNOT: ref allowed (boolean coercion sugar = __ref_is_null)
function makeUnary(loc, op, operand) {
  const isRef = operand.type && operand.type.removeQualifiers().isRef();
  // C11 6.5.3.1p1 / 6.5.2.4p1: ++/-- require a modifiable lvalue.
  const checkIncDecOperand = (what) => {
    const u = operand.type && operand.type.removeQualifiers();
    if (!isLvalueExpr(operand) || (u && (u.isArray() || u.isFunction()))) {
      reportError(loc, `lvalue required as ${what} operand`);
      return;
    }
    // C11 6.3.2.1p1: const-qualified operands aren't modifiable
    // (todos/0227 G22).
    const constViol = operand.type && exprConstWriteViolation(operand);
    if (constViol) reportError(loc, `cannot ${what} ${constViol}`);
  };
  switch (op) {
    case "OP_PRE_INC": case "OP_POST_INC":
      if (isRef) fatalError(loc, `'++' on reference type is not allowed`);
      checkIncDecOperand("increment");
      break;
    case "OP_PRE_DEC": case "OP_POST_DEC":
      if (isRef) fatalError(loc, `'--' on reference type is not allowed`);
      checkIncDecOperand("decrement");
      break;
    case "OP_ADDR":
      if ((operand instanceof EMember || operand instanceof EArrow) &&
          operand.memberDecl.bitWidth >= 0) {
        fatalError(loc, `Cannot take address of bit-field member '${operand.memberDecl.name}'`);
      }
      if (isRef) {
        fatalError(loc, `Cannot take address of ${operand.type.removeQualifiers().toString()} variable`);
      }
      if (operand instanceof EMember && operand.base && operand.base.type &&
          operand.base.type.removeQualifiers().isGCStruct()) {
        fatalError(loc, `cannot take address of GC struct field`);
      }
      if (operand instanceof ESubscript && operand.array && operand.array.type &&
          operand.array.type.removeQualifiers().isGCArray()) {
        fatalError(loc, `cannot take address of GC array element`);
      }
      // C11 6.5.3.2p1: `&` requires an lvalue or a function designator.
      if (!isLvalueExpr(operand) &&
          !(operand.type && operand.type.removeQualifiers().isFunction())) {
        reportError(loc, `lvalue required as unary '&' operand`);
      }
      markAddressTaken(operand);
      break;
    case "OP_DEREF":
      if (isRef) {
        fatalError(loc, `unary '*' on reference type '${operand.type.toString()}' is not allowed (use '->' for fields, or just access the ref directly)`);
      }
      operand = maybeDecay(operand);
      break;
    case "OP_POS":
      if (isRef) fatalError(loc, `unary '+' on reference type is not allowed`);
      break;
    case "OP_NEG":
      if (isRef) fatalError(loc, `unary '-' on reference type is not allowed`);
      break;
    case "OP_BNOT":
      if (isRef) fatalError(loc, `unary '~' on reference type is not allowed`);
      break;
    case "OP_LNOT":
      operand = maybeDecay(operand);
      if (!isBoolContextType(operand.type)) {
        reportError(loc,
          `unary '!' requires a scalar operand, got '${operand.type.toString()}'`);
      }
      break;
  }
  return new EUnary(loc, Types.computeUnaryType(op, operand.type), op, operand);
}

// Build an SReturn, applying C semantics:
//   - decay array/function expression
//   - reject non-null int → ref when return type is a ref
//   - implicit-cast to the function's return type
// retType may be null (e.g., void function — caller passes null and the
// expr is just attached as-is). expr may also be null for `return;`.
function makeReturn(loc, expr, retType) {
  // C99 §6.8.6.4: a `return` with no value in a non-void function is a
  // constraint violation. C23 §6.8.6.4 relaxed the void case: `return EXPR;`
  // in a void function is now legal IFF EXPR's type is also void (i.e.,
  // `return void_func();` to forward through). Accept the C23 form for
  // GCC/clang compatibility — both have accepted this as an extension for
  // decades and real-world C code (including tinyemu) relies on it.
  // (We tolerate `retType === null` callers, e.g. legacy/synthesized
  // sites — they explicitly opt out by passing null.)
  if (retType !== null) {
    const rt = retType.removeQualifiers();
    if (!expr && !rt.isVoid()) {
      reportError(loc,
        `non-void function returns no value (return type is '${retType.toString()}')`);
    } else if (expr && rt.isVoid() && !expr.type.removeQualifiers().isVoid()) {
      reportError(loc,
        `void function should not return a value`);
    }
  }
  if (!expr) return new SReturn(loc, null);
  expr = maybeDecay(expr);
  if (retType) {
    expr = maybeImplicitCast(expr, retType);
  }
  return new SReturn(loc, expr);
}

// Build an ECast (explicit cast `(T)expr`), applying C semantics:
//   - decay array/function operand
//   - reject ref↔non-ref except (refT)0 / (refT)NULL
function makeCast(loc, targetType, expr) {
  expr = maybeDecay(expr);
  const tIsRef = targetType.removeQualifiers().isRef();
  const sIsRef = expr.type && expr.type.removeQualifiers().isRef();
  if (tIsRef || sIsRef) {
    if (tIsRef && !sIsRef && isNullPointerConstant(expr)) {
      // (refT)0 / (refT)NULL — typed null pointer constant.
      return new ECast(loc, targetType, targetType, expr);
    }
    fatalError(loc, "Cannot cast to or from a reference type; use __cast(T, x) (or __ref_cast for GC ref downcast)");
  }
  return new ECast(loc, targetType, targetType, expr);
}

// Resolve a member-name lookup against a struct/union type. Returns
// the chain of DVar field decls leading to the target (length 1 for a
// direct field, length >1 when traversing anonymous nested structs),
// or null if the name doesn't resolve. Pure — depends only on the type
// and its tagDecl.members.
function lookupMemberChain(type, name) {
  const ut = type.removeQualifiers();
  if (ut.tagDecl && ut.tagDecl.members) {
    for (const m of ut.tagDecl.members) {
      if (!(m instanceof DVar)) continue;
      if (m.name === name) return [m];
      // Recurse into anonymous nested struct/union members.
      if (!m.name && m.type && m.type.tagDecl && m.type.tagDecl.members) {
        const sub = lookupMemberChain(m.type, name);
        if (sub) return [m, ...sub];
      }
    }
  }
  return null;
}

// Synthesize a placeholder DVar for error recovery. Used by makeIdent /
// makeMember / makeArrow when the name doesn't resolve — we report the
// diagnostic, then return a placeholder so downstream construction can
// continue without nulls. The placeholder's type is divergent so any
// operations on it stay well-typed.
function _placeholderDVar(loc, name) {
  return new DVar(loc, name, Types.TDIVERGENT, Types.StorageClass.NONE, null);
}

// Build a member-access expression `base.name`. Looks up the field
// (handling anonymous-nested chains). On miss, reports a recoverable
// diagnostic and constructs the EMember with a synthesized placeholder
// DVar (divergent-typed) so the parse can continue. After this returns,
// EMember always has a non-null memberDecl.
function makeMember(loc, base, name) {
  // The `.` operator requires struct/union on the left. GC struct refs use
  // `->` (they are reference values, not aggregates). Without this gate,
  // `int x; x.foo` would crash later in lookupMemberChain or in codegen.
  const bt = base.type.removeQualifiers();
  if (bt.isGCStruct()) {
    reportError(loc,
      `'.' on GC struct ref '${base.type.toString()}' is not allowed — use '->'`);
    return new EMember(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
  }
  if (!bt.isStruct() && !bt.isUnion() && !bt.isDivergent()) {
    reportError(loc,
      `left operand of '.' must have struct or union type, got '${base.type.toString()}'`);
    return new EMember(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
  }
  const chain = lookupMemberChain(base.type, name);
  if (!chain) {
    reportError(loc, `'${base.type.toString()}' has no member named '${name}'`);
    return new EMember(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
  }
  let result = base;
  for (const m of chain) {
    result = new EMember(loc, m.type, result, m);
  }
  return result;
}

// Build a pointer-arrow expression `base->name`. For GC struct refs
// (one-indirection by design), build an EMember chain directly — GC field
// access is dispatched in codegen by checking that the EMember base is a
// GC struct ref. For other pointer-to-struct types, decay the base if
// needed and build EArrow + EMember chain.
function makeArrow(loc, base, name) {
  let bt = base.type.removeQualifiers();
  if (bt.isGCStruct()) {
    const chain = lookupMemberChain(bt, name);
    if (!chain) {
      reportError(loc, `'${base.type.toString()}' has no member named '${name}'`);
      return new EMember(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
    }
    let result = base;
    for (const m of chain) result = new EMember(loc, m.type, result, m);
    return result;
  }
  base = maybeDecay(base);
  bt = base.type.removeQualifiers();
  // `->` requires a pointer-to-struct/union on the left. Without this
  // gate, `struct S s; s->a` would find a member in the (non-pointer)
  // struct type and silently build an EArrow with a non-pointer base
  // — codegen later crashes dereferencing tagDecl on something that
  // isn't a tag.
  if (!bt.isPointer() && !bt.isDivergent()) {
    reportError(loc,
      `left operand of '->' must be a pointer to struct or union, got '${base.type.toString()}'`);
    return new EArrow(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
  }
  if (bt.isPointer()) {
    const pointee = bt.baseType.removeQualifiers();
    if (!pointee.isStruct() && !pointee.isUnion() && !pointee.isDivergent()) {
      reportError(loc,
        `left operand of '->' must point to struct or union, got pointer to '${bt.baseType.toString()}'`);
      return new EArrow(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
    }
    bt = bt.baseType;
  }
  const chain = lookupMemberChain(bt, name);
  if (!chain) {
    reportError(loc, `'${base.type.toString()}' has no member named '${name}'`);
    return new EArrow(loc, Types.TDIVERGENT, base, _placeholderDVar(loc, name));
  }
  const first = chain[0];
  let result = new EArrow(loc, first.type, base, first);
  for (let i = 1; i < chain.length; i++) {
    result = new EMember(loc, chain[i].type, result, chain[i]);
  }
  return result;
}

// Build an EIdent from a name resolved through a scope. On miss, reports
// a recoverable diagnostic and synthesizes a placeholder DVar so
// EIdent.decl is always non-null.
//
// `scope` is anything with `.get(name)` returning a DVar / DFunc /
// DEnumConst / null — typically the parser's varScope.
function makeIdent(loc, name, scope) {
  const decl = scope.get(name);
  if (decl instanceof DVar)       return new EIdent(loc, decl.type, decl);
  if (decl instanceof DFunc)      return new EIdent(loc, decl.type, decl);
  if (decl instanceof DEnumConst) return new EIdent(loc, decl.type, decl);
  reportError(loc, `Undeclared identifier '${name}'`);
  return new EIdent(loc, Types.TDIVERGENT, _placeholderDVar(loc, name));
}

// Build an ESubscript, applying C semantics:
//   - normalize the commutative form `N[arr]` to `arr[N]` (C11 6.5.2.1p2)
//   - reject subscript on a reference type
//   - decay an array base to a pointer (GC arrays stay — they aren't C arrays)
//   - infer element type from the base's pointer/array element
//
// Diagnostics flow through the active `withDiag` sink. Always returns an
// ESubscript (best-effort even on errors).
function makeSubscript(loc, base, index) {
  let baseUt = base.type.removeQualifiers();
  let idxUt = index.type.removeQualifiers();
  // C11 6.5.2.1p2: `E1[E2]` is defined as `*((E1)+(E2))`, and addition is
  // commutative, so `N[arr]` is legal and equal to `arr[N]`. Normalize it by
  // swapping to the array/pointer-first form before the usual lowering
  // (todos/0193).
  if (baseUt.isInteger() && (idxUt.isPointer() || idxUt.isArray())) {
    const tmp = base; base = index; index = tmp;
    baseUt = base.type.removeQualifiers();
    idxUt = index.type.removeQualifiers();
  }
  // Base must be pointer / array / GC-array. Without this check
  // codegen would emit `base_addr + idx*sizeof(elem)` against a
  // non-pointer base value (e.g. a struct's wasm representation),
  // producing a wild memory read.
  const baseIsIndexable =
    baseUt.isArray() ||
    baseUt.isPointer() ||
    baseUt.isGCArray();
  // Refs that aren't GC arrays (e.g. eqref, GC structs, externref) —
  // give the helpful `__array(T)` hint. GC_ARRAY is handled as
  // indexable above; isRef() also matches it, so the order matters.
  if (!baseIsIndexable && baseUt.isRef()) {
    reportError(loc,
      `subscript '[]' on reference type '${base.type.toString()}' is not allowed (use __array(T) for indexable GC storage)`);
  } else if (!baseIsIndexable && !baseUt.isDivergent()) {
    reportError(loc,
      `subscripted value is not an array, pointer, or vector — got '${base.type.toString()}'`);
  }
  // Index must be integer. Otherwise codegen multiplies a non-int
  // (e.g. another pointer's bit-value) by sizeof(elem) and adds it to
  // base — silent wild memory access.
  if (!idxUt.isInteger() && !idxUt.isDivergent()) {
    reportError(loc,
      `array subscript must be of integer type, got '${index.type.toString()}'`);
  }
  let elemType = Types.TINT;
  if (baseIsIndexable) elemType = baseUt.baseType;
  // C11 6.7.3p9: qualifying an array type qualifies the ELEMENT type.
  // Direct declarations already carry the qualifier on the element
  // (`volatile int a[4]`), but through a typedef (`typedef int A[4];
  // volatile A a;`) it lands on the array TypeInfo itself — push it
  // down so the access classifies volatile (todos/0187).
  if (base.type.isVolatile && base.type.removeQualifiers().isArray()) {
    elemType = elemType.addVolatile();
  }
  // Same push-down for const (todos/0227 G22): `typedef int A[4];
  // const A a;` must make `a[0]` a const lvalue, or the 6.3.2.1p1
  // modifiable-lvalue check misses it.
  if (base.type.isConst && base.type.removeQualifiers().isArray()) {
    elemType = elemType.addConst();
  }
  // GC arrays don't decay; keep them as the array operand.
  const arrayOperand = baseUt.isGCArray() ? base : maybeDecay(base);
  return new ESubscript(loc, elemType, arrayOperand, index);
}

// Build an ECall, applying C semantics:
//   - decay callee (function name → function pointer; array → ptr)
//   - decay each argument
//   - reject ref-conversion errors on declared params
//   - reject ref-typed varargs
//   - implicit-cast each fixed arg to its parameter type
//   - default-argument promotion (float → double) on varargs
//
// Diagnostics flow through the active `withDiag` sink — no callback
// threading. Always returns an ECall (best-effort even on errors).
function makeCall(loc, callee, args) {
  callee = maybeDecay(callee);
  const calleeType = callee.type;
  let funcType = null;
  if (calleeType.isPointer() &&
      calleeType.baseType.isFunction()) {
    funcType = calleeType.baseType;
  } else if (!calleeType.isDivergent()) {
    // The callee must be a function or pointer-to-function (after
    // decay). Without this gate, `int x; x();` would build an ECall
    // with a non-function callee — codegen later crashes computing
    // the function-pointer call shape.
    reportError(loc,
      `called object is not a function or function pointer; got '${callee.type.toString()}'`);
    return new ECall(loc, callee, args);
  }
  // Decay all arguments first; pointer-typed params and varargs alike
  // receive pointer values, never arrays.
  for (let i = 0; i < args.length; i++) args[i] = maybeDecay(args[i]);
  if (funcType) {
    const paramTypes = funcType.getParamTypes();
    const numFixed = paramTypes.length;
    // Validation: only meaningful when the prototype declared its params.
    if (!funcType.hasUnspecifiedParams) {
      if (funcType.isVarArg) {
        if (args.length < numFixed) {
          reportError(loc,
            `too few arguments to function call (expected at least ${numFixed}, got ${args.length})`);
        }
        for (let i = numFixed; i < args.length; i++) {
          if (args[i].type.removeQualifiers().isRef()) {
            reportError(loc,
              `cannot pass reference type '${args[i].type.toString()}' as a variadic argument — vararg storage uses linear memory which can't hold GC references`);
          }
        }
      } else if (args.length !== numFixed) {
        reportError(loc,
          `${args.length < numFixed ? 'too few' : 'too many'} arguments to function call (expected ${numFixed}, got ${args.length})`);
      }
    }
    // Implicit casts on fixed arguments.
    for (let i = 0; i < args.length && i < numFixed; i++) {
      args[i] = maybeImplicitCast(args[i], paramTypes[i]);
    }
    // Default-argument promotions (C11 6.5.2.2p6): float → double plus the
    // integer promotions. They apply to variadic arguments AND to every
    // argument of a call through an unprototyped declaration (`int f();`)
    // — the latter used to get no conversion at all, so a float argument
    // reached a double-parameter definition unconverted and codegen
    // emitted invalid wasm.
    const promoteDefault = (arg) => {
      const t = arg.type.removeQualifiers();
      if (t === Types.TFLOAT) return maybeImplicitCast(arg, Types.TDOUBLE);
      if (t === Types.TCHAR || t === Types.TSCHAR || t === Types.TUCHAR ||
          t === Types.TSHORT || t === Types.TUSHORT || t === Types.TBOOL) {
        return maybeImplicitCast(arg, Types.TINT);
      }
      return arg;
    };
    if (funcType.hasUnspecifiedParams) {
      for (let i = 0; i < args.length; i++) args[i] = promoteDefault(args[i]);
    } else if (funcType.isVarArg) {
      for (let i = numFixed; i < args.length; i++) args[i] = promoteDefault(args[i]);
    }
  }
  return new ECall(loc, callee, args);
}

// TUnit constructor
class TUnit {
  constructor(filename) {
    this.filename = filename;
    this.importedFunctions = [];
    this.definedFunctions = [];
    this.staticFunctions = [];
    this.declaredFunctions = [];
    this.localDeclaredFunctions = [];
    this.definedVariables = [];
    this.externVariables = [];
    this.localExternVariables = [];
    this.requiredSources = new Set();
    this.minStackBytes = 0;
    this.exportDirectives = [];
    this.exceptionTags = [];
    Object.seal(this);
  }
}
function makeTUnit(filename) { return new TUnit(filename); }

return {
  Scope,
  Expr, Stmt, Decl,
  DVar, DFunc, DTag, DExceptionTag, DEnumConst,
  EInt, EFloat, EString, EIdent, EBinary, EUnary, ETernary, ECall,
  ESubscript, EMember, EArrow, ECast, ESizeofExpr, ESizeofType,
  EAlignofExpr, EAlignofType, EComma, EInitList, EIntrinsic, EWasm,
  ECompoundLiteral, EImplicitCast, EDecay, EGCNew,
  SExpr, SDecl, SCompound, SIf, SWhile, SDoWhile, SFor,
  SBreak, SContinue, SReturn, SSwitch, SCase, SGoto, SLabel, SEmpty,
  STryCatch, SThrow,
  makeTUnit,
  // C-semantics-aware builders
  maybeImplicitCast, typesAreAssignmentCompatible, typesAreOperandCompatible,
  isBoolContextType,
  maybeDecay, isNullPointerConstant, rejectNonZeroToRef,
  pointerArithElemType,
  promoteExprType, computeBinaryType, markAddressTaken,
  makeCall, makeSubscript, makeBinary, makeUnary, makeReturn, makeCast,
  makeMember, makeArrow, makeIdent, lookupMemberChain,
  // Linearity tagging for optimizer correctness checks
  Linearity, joinLinearity,
  // Op metadata registries (text, linearity, classification flags)
  BinOp, UnOp, baseOpOfCompound,
  // Generic traversal / substitution for AST→AST passes
  walkExpr, substituteParams,
  // Bubble-up metadata container
  TreeBag,
};
})();

// ====================
// constEvalItem / constEvalInt — typed integer constant evaluator
// ====================
// constEvalItem returns ConstEval.Item (value + type) or null.
// constEvalInt is a thin wrapper returning BigInt or null for callers
// that don't need the type.

function constEvalItem(expr) {
  if (!expr) return null;
  switch (expr.constructor) {
    case AST.EInt: return new ConstEval.Item(expr.value, expr.type);
    case AST.EFloat: return new ConstEval.FloatItem(expr.value, expr.type);
    case AST.EIdent:
      if (expr.decl && expr.decl instanceof AST.DEnumConst)
        return new ConstEval.Item(expr.decl.value, expr.type);
      return null;
    case AST.EBinary: {
      const l = constEvalItem(expr.left);
      if (l === null) return null;
      // && / || short-circuit in constant expressions too (C11 6.6p3 via
      // 6.5.13/6.5.14): `1 || 1/0` is a valid integer constant expression
      // — the unevaluated operand must not make the eval fail (which used
      // to silently fall back, e.g. to the running enum counter).
      if (expr.op === "LAND" && !ConstEval.isTruthy(l))
        return new ConstEval.Item(0n, Types.TINT);
      if (expr.op === "LOR" && ConstEval.isTruthy(l))
        return new ConstEval.Item(1n, Types.TINT);
      const r = constEvalItem(expr.right);
      if (r === null) return null;
      return ConstEval.binary(expr.op, l, r);
    }
    case AST.EUnary: {
      if (expr.op === "OP_ADDR") {
        const inner = expr.operand;
        if (inner instanceof AST.EArrow || inner instanceof AST.EMember) {
          const base = constEvalItem(inner.base);
          if (base !== null && !ConstEval.isFloatItem(base))
            return new ConstEval.Item(base.value + BigInt(inner.memberDecl.byteOffset), expr.type);
        }
        return null;
      }
      const a = constEvalItem(expr.operand);
      if (a === null) return null;
      return ConstEval.unary(expr.op, a);
    }
    // Casts go through ConstEval.convert — the single implementation of
    // C11 6.3.1 constant conversions (int↔float, f32 rounding, _Bool).
    case AST.EImplicitCast:
    case AST.ECast: {
      const inner = constEvalItem(expr.expr);
      if (inner === null) return null;
      return ConstEval.convert(inner, expr.type);
    }
    case AST.ETernary: {
      const c = constEvalItem(expr.condition);
      if (c === null) return null;
      return constEvalItem(ConstEval.isTruthy(c) ? expr.thenExpr : expr.elseExpr);
    }
    case AST.ESizeofExpr: return new ConstEval.Item(BigInt(expr.expr.type.sizeofResult()), Types.TUINT);
    case AST.ESizeofType: return new ConstEval.Item(BigInt(expr.operandType.sizeofResult()), Types.TUINT);
    case AST.EAlignofExpr: return new ConstEval.Item(BigInt(expr.expr.type.align), Types.TUINT);
    case AST.EAlignofType: return new ConstEval.Item(BigInt(expr.operandType.align), Types.TUINT);
    default: return null;
  }
}

// Integer-only view of constEvalItem: floating results are NOT integer
// constant expressions, so they yield null here (callers want array sizes,
// case labels, enum values — a float reaching them is a caller bug).
function constEvalInt(expr) {
  const item = constEvalItem(expr);
  return item !== null && !ConstEval.isFloatItem(item) ? item.value : null;
}

// ====================
// INLINER — AST→AST optimization pass
// ====================
//
// One pass that walks each function body bottom-up and folds constant
// subexpressions (and dead branches under constant conditions). Named
// INLINER because it's the home for inlining + tree-shaking too once
// those land — the three optimizations want to feed each other. For
// now: constant folding only.
//
// Strategy:
//   - Bottom-up post-order: fold children, then try to fold the node.
//   - On replacement, return a fresh AST node (preserve the original
//     node's loc and type). Constructors are dumb, so we can build
//     directly without surprise wrapping; type-changing rewrites would
//     route through make* helpers, but folding never changes types.
//   - On no change, return the original node identity. Callers compare
//     by `===` to skip rebuilds, which keeps AST allocation O(changed).
//   - Side-effecting ops (ASSIGN, ++/--, function calls, dereferences,
//     intrinsics, etc.) are walked into but never folded as a whole.
//   - DFunc.body and DVar.initExpr are mutated in place (sealed but
//     writable), matching how the rest of the codebase already handles
//     post-construction updates.

const INLINER = (() => {

// True if `op` is the AST tag for an op with no value-producing side
// effect of its own — folding the operands and rewriting to a literal
// is OK iff this is true AND the operands are themselves pure.
function isPureBinop(op) {
  return !AST.BinOp[op].isAssign;
}

// True if discarding `stmt` would delete a jump target that code OUTSIDE
// it can still reach: any goto label (goto targets are function-wide), or
// a case/default owned by an ENCLOSING switch. `caseBag` already respects
// switch barriers (a nested switch owns its cases and reports none), so
// it is exactly the set of externally-owned case labels; goto labels are
// found by a full scan (they're reachable even inside nested switches).
function hasExternalJumpTargets(stmt) {
  if (!stmt) return false;
  if (stmt.caseBag.size > 0) return true;
  const scan = (n) => {
    if (!n) return false;
    if (n instanceof AST.SLabel) return true;
    if (n.children) {
      for (const c of n.children) if (c && scan(c)) return true;
    }
    return false;
  };
  return scan(stmt);
}

// Materialize a ConstEval result as a literal node of `type` (converting
// per C11 6.3.1 on the way), or null when it doesn't fold to a literal.
// One materializer for every fold site so integer results always become a
// width-truncated EInt and floating results a precision-correct EFloat —
// float-typed values must never be rebuilt through integer arithmetic.
function materializeConst(loc, type, item) {
  const conv = ConstEval.convert(item, type);
  if (conv === null) return null;
  if (ConstEval.isFloatItem(conv)) {
    return type.isFloatingPoint() ? new AST.EFloat(loc, type, conv.fval) : null;
  }
  return type.isInteger() ? new AST.EInt(loc, type, conv.value) : null;
}

// Evaluate a pure integer binary op on BigInt operands. Returns the
// result as a BigInt, or null if not foldable (e.g. div by zero, shift
// out of range). Caller is responsible for truncating to the result type.
// Fold an expression. Bottom-up: fold children first.
function foldExpr(expr) {
  if (!expr) return expr;
  switch (expr.constructor) {
    // True leaves — nothing inside to fold.
    case AST.EInt:
    case AST.EFloat:
    case AST.EString:
    case AST.EIdent:
    case AST.ESizeofType:
    case AST.EAlignofType:
      return expr;

    // sizeof(expr) / _Alignof(expr) don't evaluate their operand at
    // runtime — leave the inner expression alone so we don't create
    // surprising side-effect changes.
    case AST.ESizeofExpr:
    case AST.EAlignofExpr:
      return expr;

    case AST.EUnary: {
      const op = expr.op;
      const operand = foldExpr(expr.operand);
      // Skip side-effecting / addressing ops; only rebuild if the operand changed.
      if (op === "OP_PRE_INC"  || op === "OP_PRE_DEC" ||
          op === "OP_POST_INC" || op === "OP_POST_DEC" ||
          op === "OP_ADDR"     || op === "OP_DEREF") {
        return operand === expr.operand ? expr
          : new AST.EUnary(expr.loc, expr.type, op, operand);
      }
      const a = constEvalItem(operand);
      if (a !== null) {
        const r = ConstEval.unary(op, a);
        if (r !== null) {
          const lit = materializeConst(expr.loc, expr.type, r);
          if (lit !== null) return lit;
        }
      }
      return operand === expr.operand ? expr
        : new AST.EUnary(expr.loc, expr.type, op, operand);
    }

    case AST.EBinary: {
      const left = foldExpr(expr.left);
      const right = foldExpr(expr.right);
      const op = expr.op;
      if (!isPureBinop(op)) {
        return (left === expr.left && right === expr.right) ? expr
          : new AST.EBinary(expr.loc, expr.type, op, left, right);
      }
      const li = constEvalItem(left);
      if (op === "LAND" && li !== null && !ConstEval.isTruthy(li)) return new AST.EInt(expr.loc, expr.type, 0n);
      if (op === "LOR"  && li !== null && ConstEval.isTruthy(li)) return new AST.EInt(expr.loc, expr.type, 1n);
      const ri = constEvalItem(right);
      if (li !== null && ri !== null) {
        const r = ConstEval.binary(op, li, ri);
        if (r !== null) {
          const lit = materializeConst(expr.loc, expr.type, r);
          if (lit !== null) return lit;
        }
      }
      return (left === expr.left && right === expr.right) ? expr
        : new AST.EBinary(expr.loc, expr.type, op, left, right);
    }

    case AST.ETernary: {
      const cond = foldExpr(expr.condition);
      const ci = constEvalItem(cond);
      if (ci !== null) {
        // Pick the live branch; fold and return it directly (its type
        // matches expr.type by the parser's ternary type computation,
        // possibly via an EImplicitCast wrapper).
        return foldExpr(ConstEval.isTruthy(ci) ? expr.thenExpr : expr.elseExpr);
      }
      const thenE = foldExpr(expr.thenExpr);
      const elseE = foldExpr(expr.elseExpr);
      return (cond === expr.condition && thenE === expr.thenExpr && elseE === expr.elseExpr) ? expr
        : new AST.ETernary(expr.loc, expr.type, cond, thenE, elseE);
    }

    case AST.ECall: {
      const callee = foldExpr(expr.callee);
      let changed = callee !== expr.callee;
      const newArgs = expr.arguments.map(a => {
        const folded = foldExpr(a);
        if (folded !== a) changed = true;
        return folded;
      });
      const call = changed ? new AST.ECall(expr.loc, callee, newArgs) : expr;
      // No manual liveness bookkeeping here — the call's children (the
      // EDecay/EIdent on the callee) bubble the DFunc into the
      // referencedFunctions bag automatically. Try inlining; on success,
      // recurse-fold so cascades like square(5) → 25 collapse in one pass.
      const inlined = tryInline(call);
      return inlined !== null ? foldExpr(inlined) : call;
    }

    case AST.ESubscript: {
      const arr = foldExpr(expr.array);
      const idx = foldExpr(expr.index);
      return (arr === expr.array && idx === expr.index) ? expr
        : new AST.ESubscript(expr.loc, expr.type, arr, idx);
    }

    case AST.EMember: {
      const base = foldExpr(expr.base);
      return base === expr.base ? expr
        : new AST.EMember(expr.loc, expr.type, base, expr.memberDecl);
    }

    case AST.EArrow: {
      const base = foldExpr(expr.base);
      return base === expr.base ? expr
        : new AST.EArrow(expr.loc, expr.type, base, expr.memberDecl);
    }

    case AST.ECast: {
      const inner = foldExpr(expr.expr);
      const a = constEvalItem(inner);
      if (a !== null) {
        // materializeConst routes through ConstEval.convert, so folding a
        // cast applies the real conversion (f32 rounding, float→int
        // truncation, _Bool != 0) instead of reinterpreting the raw value.
        const lit = materializeConst(expr.loc, expr.targetType, a);
        if (lit !== null) return lit;
      }
      return inner === expr.expr ? expr
        : new AST.ECast(expr.loc, expr.type, expr.targetType, inner);
    }

    case AST.EImplicitCast: {
      const inner = foldExpr(expr.expr);
      const a = constEvalItem(inner);
      if (a !== null) {
        const lit = materializeConst(expr.loc, expr.type, a);
        if (lit !== null) return lit;
      }
      return inner === expr.expr ? expr
        : new AST.EImplicitCast(expr.loc, expr.type, inner);
    }

    case AST.EDecay: {
      const inner = foldExpr(expr.operand);
      return inner === expr.operand ? expr
        : new AST.EDecay(expr.loc, expr.type, inner);
    }

    case AST.EComma: {
      let changed = false;
      const newExprs = expr.expressions.map(e => {
        const folded = foldExpr(e);
        if (folded !== e) changed = true;
        return folded;
      });
      return changed
        ? new AST.EComma(expr.loc, expr.type, newExprs)
        : expr;
    }

    case AST.EInitList: {
      let changed = false;
      const newElems = expr.elements.map(e => {
        const folded = foldExpr(e);
        if (folded !== e) changed = true;
        return folded;
      });
      return changed
        ? new AST.EInitList(expr.loc, expr.type, newElems, expr.designators, expr.unionMemberIndex)
        : expr;
    }

    case AST.EIntrinsic: {
      let changed = false;
      const newArgs = expr.args.map(a => {
        const folded = foldExpr(a);
        if (folded !== a) changed = true;
        return folded;
      });
      return changed
        ? new AST.EIntrinsic(expr.loc, expr.type, expr.intrinsicKind, newArgs, expr.argType)
        : expr;
    }

    case AST.EWasm: {
      let changed = false;
      const newArgs = expr.args.map(a => {
        const folded = foldExpr(a);
        if (folded !== a) changed = true;
        return folded;
      });
      return changed
        ? new AST.EWasm(expr.loc, expr.type, newArgs, expr.bytes)
        : expr;
    }

    case AST.EGCNew: {
      let changed = false;
      const newArgs = expr.args.map(a => {
        const folded = foldExpr(a);
        if (folded !== a) changed = true;
        return folded;
      });
      return changed
        ? new AST.EGCNew(expr.loc, expr.type, newArgs)
        : expr;
    }

    case AST.ECompoundLiteral: {
      // ECompoundLiteral is frozen — fold the init list and rebuild via
      // _withChildren. Codegen finds the current node via the bag.
      const folded = foldExpr(expr.initList);
      return folded === expr.initList ? expr : expr._withChildren([folded]);
    }

    default:
      return expr;
  }
}

// Fold a statement bottom-up. Eliminates dead branches when conditions
// are constant. Returns a (possibly new) statement; callers compare by
// `===` to skip rebuilds.
function foldStmt(stmt) {
  if (!stmt) return stmt;
  switch (stmt.constructor) {
    case AST.SEmpty:
    case AST.SBreak:
    case AST.SContinue:
    case AST.SLabel:
    case AST.SGoto:
    case AST.SCase:
      return stmt;

    case AST.SExpr: {
      const e = foldExpr(stmt.expr);
      return e === stmt.expr ? stmt : new AST.SExpr(stmt.loc, e);
    }

    case AST.SDecl: {
      // Mutate each DVar's initExpr in place. DVars are sealed-but-writable.
      for (const d of stmt.declarations) {
        if (d instanceof AST.DVar && d.initExpr) {
          const folded = foldExpr(d.initExpr);
          if (folded !== d.initExpr) d.initExpr = folded;
        }
      }
      return stmt;
    }

    case AST.SCompound: {
      let changed = false;
      const newStmts = stmt.statements.map(s => {
        const folded = foldStmt(s);
        if (folded !== s) changed = true;
        return folded;
      });
      return changed
        ? new AST.SCompound(stmt.loc, newStmts, stmt.labels)
        : stmt;
    }

    case AST.SIf: {
      const cond = foldExpr(stmt.condition);
      const cv = constEvalInt(cond);
      // Dead-branch elimination when the condition is a known constant.
      // A branch that contains a label or an enclosing switch's case is
      // NOT dead — goto/switch can jump into it (C11 6.8.6.1) — so it
      // must survive; deleting it used to leave live SGoto.targets
      // dangling (the irreducible fallback then spun forever on a state
      // with no segment) and to silently drop case labels.
      if (cv === 0n && !hasExternalJumpTargets(stmt.thenBranch)) {
        return stmt.elseBranch ? foldStmt(stmt.elseBranch) : new AST.SEmpty(stmt.loc);
      }
      if (cv !== null && cv !== 0n && !hasExternalJumpTargets(stmt.elseBranch)) {
        return foldStmt(stmt.thenBranch);
      }
      const thenB = foldStmt(stmt.thenBranch);
      const elseB = foldStmt(stmt.elseBranch);
      return (cond === stmt.condition && thenB === stmt.thenBranch && elseB === stmt.elseBranch)
        ? stmt
        : new AST.SIf(stmt.loc, cond, thenB, elseB);
    }

    case AST.SWhile: {
      const cond = foldExpr(stmt.condition);
      const body = foldStmt(stmt.body);
      // while (0) — body never runs (unless it holds a jump target that
      // code outside can still enter through; see SIf above).
      if (constEvalInt(cond) === 0n && !hasExternalJumpTargets(stmt.body)) {
        return new AST.SEmpty(stmt.loc);
      }
      return (cond === stmt.condition && body === stmt.body)
        ? stmt
        : new AST.SWhile(stmt.loc, cond, body);
    }

    case AST.SDoWhile: {
      const body = foldStmt(stmt.body);
      const cond = foldExpr(stmt.condition);
      return (body === stmt.body && cond === stmt.condition)
        ? stmt
        : new AST.SDoWhile(stmt.loc, body, cond);
    }

    case AST.SFor: {
      const init = stmt.init ? foldStmt(stmt.init) : null;
      const cond = stmt.condition ? foldExpr(stmt.condition) : null;
      const incr = stmt.increment ? foldExpr(stmt.increment) : null;
      const body = foldStmt(stmt.body);
      return (init === stmt.init && cond === stmt.condition &&
              incr === stmt.increment && body === stmt.body)
        ? stmt
        : new AST.SFor(stmt.loc, init, cond, incr, body);
    }

    case AST.SReturn: {
      if (!stmt.expr) return stmt;
      const e = foldExpr(stmt.expr);
      return e === stmt.expr ? stmt : new AST.SReturn(stmt.loc, e);
    }

    case AST.SSwitch: {
      const e = foldExpr(stmt.expr);
      const body = foldStmt(stmt.body);
      return (e === stmt.expr && body === stmt.body)
        ? stmt
        : new AST.SSwitch(stmt.loc, e, body);
    }

    case AST.STryCatch: {
      const tryB = foldStmt(stmt.tryBody);
      let changed = tryB !== stmt.tryBody;
      const newCatches = stmt.catches.map(c => {
        const newBody = foldStmt(c.body);
        if (newBody === c.body) return c;
        changed = true;
        return { ...c, body: newBody };
      });
      return changed
        ? new AST.STryCatch(stmt.loc, tryB, newCatches)
        : stmt;
    }

    case AST.SThrow: {
      let changed = false;
      const newArgs = stmt.args.map(a => {
        const folded = foldExpr(a);
        if (folded !== a) changed = true;
        return folded;
      });
      return changed
        ? new AST.SThrow(stmt.loc, stmt.tag, newArgs)
        : stmt;
    }

    default:
      return stmt;
  }
}

// ---------- Inlining ----------
//
// _inliningStack is the set of functions currently being inlined.
// While we're substituting body B for a call to F, we push F. Any
// recursive call to F encountered while folding B is left as a real
// call (because tryInline bails when the callee is on the stack).
// After we're done with F's body, we pop. This gives us natural
// recursion detection without a separate call-graph pass.
//
// Liveness no longer needs separate state — the AST itself bubbles up
// `referencedFunctions` via TreeBag, so once a function's body has been
// folded we can read its bag to see what it transitively references.
const _inliningStack = new Set();

// Instrumentation (todos/0188): successful inlines and refusals charged
// to the expansion budget, cumulative across the per-TU passes and the
// post-link round. `optimizeLinked` snapshots its own share into
// `stats.postLink`.
const stats = { inlined: 0, budgetRefused: 0, noinlineRefused: 0, postLink: null };

// Bounded expansion (todos/0188). Substitution duplicates each argument
// once per parameter use, and foldExpr re-folds substituted bodies, so a
// chain of nested pure helpers (sq(sq(sq(x)))) grows multiplicatively.
// The budget is on GROWTH per call site: the substituted expression may
// exceed the nodes already present at the site (the arguments) by at
// most INLINE_GROWTH_CAP effective nodes. A parameter used once inlines
// regardless of argument size (no duplication — pure win); duplication
// of large arguments is what gets refused. Sizes are EFFECTIVE (shared
// substituted subtrees counted once per occurrence), because the
// tree-walking codegen re-emits shared nodes — effective size is the
// honest code-size metric, and capping it also bounds fold/codegen time.
const INLINE_GROWTH_CAP = 64;
// Per-argument scan ceiling: bounds the cost of the budget check itself
// on pathologically large argument trees (which can be DAG-shared and
// exponentially larger effectively than physically).
const INLINE_ARG_SCAN_CAP = 4096;

// Effective node count of `expr`, early-exiting once the count exceeds
// `cap` (returns cap+1-or-more, meaning "too big").
function effSize(expr, cap) {
  let n = 0;
  const stack = [expr];
  while (stack.length > 0) {
    const e = stack.pop();
    if (!e) continue;
    if (++n > cap) return n;
    const kids = e.children;
    if (kids) for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
  }
  return n;
}

// Predicate: is this body a single `return EXPR;`? Returns the return
// expression, or null if the body is anything more complex.
function singleReturnBody(body) {
  if (!body) return null;
  if (body instanceof AST.SReturn) return body.expr || null;
  if (body instanceof AST.SCompound &&
      body.statements.length === 1 &&
      body.statements[0] instanceof AST.SReturn) {
    return body.statements[0].expr || null;
  }
  return null;
}

// Try to inline a call. Returns the substituted expression on success,
// or null if the call should stay as a call. Conservative criteria:
//   - direct call (funcDecl set), with a body
//   - body is a single `return EXPR;`
//   - return EXPR is UNRESTRICTED (no side effects, deterministic)
//   - argument count matches parameter count
//   - all arguments are UNRESTRICTED (safe to substitute multiple times)
//   - callee is not currently being inlined (recursion detected via stack)
function tryInline(callExpr) {
  const decl = callExpr.funcDecl;
  if (!decl) return null;
  const def = decl.definition || decl;
  if (_inliningStack.has(def)) return null;
  if (!def.body) return null;
  // __attribute__((noinline)) is a hard refusal at every inlining layer
  // (todos/0214) — the AST rule would otherwise fold tiny accessors the
  // user explicitly pinned.
  if (def.fnAttrs && def.fnAttrs.noinline) { stats.noinlineRefused++; return null; }
  const returnExpr = singleReturnBody(def.body);
  if (!returnExpr) return null;
  if (returnExpr.linearity !== AST.Linearity.UNRESTRICTED) return null;
  const params = def.parameters || [];
  if (callExpr.arguments.length !== params.length) return null;
  for (const arg of callExpr.arguments) {
    if (arg.linearity !== AST.Linearity.UNRESTRICTED) return null;
  }
  const paramMap = new Map();
  for (let i = 0; i < params.length; i++) {
    let arg = callExpr.arguments[i];
    // Through an unprototyped decl the args carry their default-PROMOTED
    // types (double for a float arg — C89 6.5.2.2p6) while the definition's
    // param may be narrower; substituting the promoted expr verbatim would
    // splice an f64 where the body expects f32 (todos/0159). Convert back
    // to the param's declared type when they differ.
    const pt = params[i].type.removeQualifiers();
    if (arg.type.removeQualifiers() !== pt && pt.isScalar() && arg.type.isScalar()) {
      arg = new AST.EImplicitCast(arg.loc, params[i].type, arg);
    }
    paramMap.set(params[i], arg);
  }
  // Push self onto the stack while substituting & re-folding the body,
  // so a recursive call to `decl` inside the body sees its callee as
  // already-being-inlined and bails. Keyed on the body-bearing def so
  // cross-TU decl aliases of one function can't slip past (todos/0188).
  _inliningStack.add(def);
  try {
    const sub = AST.substituteParams(returnExpr, paramMap);
    // Expansion budget: allow the substituted expression to exceed the
    // material already at the site (the arguments) by at most
    // INLINE_GROWTH_CAP effective nodes. See the constant's comment.
    let argSize = 0;
    for (const arg of callExpr.arguments) {
      argSize += effSize(arg, INLINE_ARG_SCAN_CAP);
    }
    const budget = argSize + INLINE_GROWTH_CAP;
    if (effSize(sub, budget) > budget) {
      stats.budgetRefused++;
      return null;
    }
    stats.inlined++;
    return sub;
  } finally {
    _inliningStack.delete(def);
  }
}

// Optimize a translation unit. Walk from "root" functions (entry points
// + exported + extern + address-taken) and fold their bodies; ECall
// folding records every reached callee as live and tries to inline.
// Anything never reached gets dropped from the unit at the end —
// inlining and tree-shaking fall out of the same walk.
function isRootFunction(f, unit) {
  // Anything not defined here can't be a root we own.
  if (!f.body) return false;
  // `main` is the conventional program entry.
  if (f.name === "main") return true;
  // Anything explicitly exported is a root.
  for (const [, decl] of unit.exportDirectives) if (decl === f) return true;
  // Extern-linkage functions might be called from another TU.
  if (f.storageClass === Types.StorageClass.EXTERN ||
      f.storageClass === Types.StorageClass.NONE) return true;
  return false;
}

function optimize(unit, options) {
  _inliningStack.clear();
  // Unified worklist for both functions and globals. We walk from real
  // roots (extern-linkage symbols, exports, main) and accumulate every
  // function / variable reachable from them via the AST bag. Anything
  // unreached at the end is dead and gets tree-shaken.
  const liveFuncs = new Set();
  const liveVars = new Set();
  const funcQ = [];
  const varQ = [];
  const enqueueFunc = (f) => {
    if (!f || liveFuncs.has(f)) return;
    liveFuncs.add(f);
    funcQ.push(f);
  };
  const enqueueVar = (v) => {
    if (!v || liveVars.has(v)) return;
    liveVars.add(v);
    varQ.push(v);
  };
  const visitRefs = (node) => {
    for (const f of node.referencedFunctions) enqueueFunc(f);
    for (const v of node.referencedVariables) enqueueVar(v);
  };
  // Seed: extern-linkage / exported / main funcs + non-static globals.
  for (const f of unit.definedFunctions) {
    if (isRootFunction(f, unit)) enqueueFunc(f);
  }
  // Export-directive targets are roots regardless of whether they're
  // called from anywhere in this TU. They may be a non-defining
  // declaration whose definition lives in another TU; without this seed
  // the tree-shake would drop the decl from `declaredFunctions` and the
  // linker would have nothing left to set `.definition` on.
  for (const [, decl] of unit.exportDirectives) enqueueFunc(decl);
  for (const v of unit.definedVariables) {
    if (v.storageClass !== Types.StorageClass.STATIC) enqueueVar(v);
  }
  // Drain to fixed point. We process funcs and vars together; either
  // queue might add to the other.
  while (funcQ.length > 0 || varQ.length > 0) {
    while (funcQ.length > 0) {
      const f = funcQ.shift();
      if (!f.body) continue;
      f.body = foldStmt(f.body);
      visitRefs(f.body);
      // Static locals are diverted out of the function body (they live
      // in `staticLocals`), so their initializers don't ride the body's
      // bag. Walk them explicitly — function-pointer tables in static
      // locals (e.g. Lua's searcher_C / searcher_Lua dispatch table)
      // are a real reference path.
      for (const v of (f.staticLocals || [])) {
        if (v.initExpr) {
          const folded = foldExpr(v.initExpr);
          if (folded !== v.initExpr) v.initExpr = folded;
          visitRefs(v.initExpr);
        }
      }
    }
    while (varQ.length > 0) {
      const v = varQ.shift();
      if (!v.initExpr) continue;
      const folded = foldExpr(v.initExpr);
      if (folded !== v.initExpr) v.initExpr = folded;
      visitRefs(v.initExpr);
    }
  }
  // Tree-shake. The bag-walk above transitively visited everything
  // reachable from roots; anything not in `live*` is genuinely dead.
  // - static funcs / vars: drop if unreached (TU-internal, safe).
  // - imported / extern / declared decls: also drop if unreached UNLESS
  //   --no-undefined, in which case the linker should be allowed to
  //   complain about every dangling reference for visibility. (Defined
  //   non-static decls are seeded as roots, so they're never filtered.)
  unit.staticFunctions = unit.staticFunctions.filter(f => liveFuncs.has(f));
  unit.definedVariables = unit.definedVariables.filter(
    v => v.storageClass !== Types.StorageClass.STATIC || liveVars.has(v));
  if (!options?.noUndefined) {
    unit.importedFunctions = unit.importedFunctions.filter(f => liveFuncs.has(f));
    unit.externVariables = unit.externVariables.filter(v => liveVars.has(v));
    unit.declaredFunctions = unit.declaredFunctions.filter(f => liveFuncs.has(f));
    unit.localExternVariables = unit.localExternVariables.filter(v => liveVars.has(v));
    unit.localDeclaredFunctions = unit.localDeclaredFunctions.filter(f => liveFuncs.has(f));
  }
  return unit;
}

// Whole-program inline+fold round (todos/0188). Runs AFTER
// linkTranslationUnits has wired decl.definition across TUs, so
// tryInline's `decl.definition || decl` now resolves callee bodies that
// live in OTHER translation units — the dominant refusal of the per-TU
// pass ("callee body not visible"). Additive: the per-TU optimize()
// already ran (it feeds per-TU tree-shaking and keeps link inputs
// small); this round only re-folds function bodies under the same
// single-return-expression inlining rule.
//
// Order is CALLEE-BEFORE-CALLER (post-order over the call graph, cycles
// broken arbitrarily by the visited set): tryInline inspects the
// callee's CURRENT body, so folding callees first exposes bodies that
// only become single-return after their own dead branches fold away
// (e.g. `if (1) return x; else return y;`).
//
// Liveness is untouched here — no tree-shake. The bags are computed on
// demand from current children, so a body whose calls all inlined
// simply stops referencing the callee; gcSectionsPass (which runs after
// this, before codegen) reaps what genuinely became unreachable while
// keeping exports / main / address-taken functions rooted.
function optimizeLinked(units) {
  _inliningStack.clear();
  const inlinedBefore = stats.inlined;
  const refusedBefore = stats.budgetRefused;

  // Collect the canonical (body-bearing) definition set. Non-canonical
  // duplicates (C11 inline definitions superseded by an external one)
  // are skipped — codegen never emits them.
  const defs = [];
  const defSet = new Set();
  for (const unit of units) {
    for (const f of [...unit.definedFunctions, ...unit.staticFunctions]) {
      const def = f.definition || f;
      if (def.body && !defSet.has(def)) {
        defSet.add(def);
        defs.push(def);
      }
    }
  }

  // Iterative post-order DFS. Edges come from the body's bubble-up bag
  // (which already canonicalizes through decl.definition), restricted
  // to defined functions. Address-taken references ride the bag too —
  // harmless for ordering, which is a heuristic, not a soundness need.
  function calleesOf(f) {
    const out = [];
    for (const g of f.body.referencedFunctions) {
      if (defSet.has(g) && g !== f) out.push(g);
    }
    return out;
  }
  const order = [];
  const visited = new Set();
  for (const root of defs) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [[root, calleesOf(root), 0]];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const kids = top[1];
      let advanced = false;
      while (top[2] < kids.length) {
        const child = kids[top[2]++];
        if (!visited.has(child)) {
          visited.add(child);
          stack.push([child, calleesOf(child), 0]);
          advanced = true;
          break;
        }
      }
      if (!advanced) {
        order.push(top[0]);
        stack.pop();
      }
    }
  }

  for (const f of order) {
    f.body = foldStmt(f.body);
  }

  stats.postLink = {
    inlined: stats.inlined - inlinedBefore,
    budgetRefused: stats.budgetRefused - refusedBefore,
  };
}

return { optimize, optimizeLinked, foldExpr, foldStmt, tryInline, stats };
})();

// ====================
// GOTO NORMALIZER — AST→AST transformation pass
// ====================
//
// C allows `goto L` to jump to any label `L:` within the same function,
// regardless of block scoping. WASM only allows `br` to *enclosing* block
// labels. Most of the gap is closed by the codegen's pre-scan (which opens a
// `block` for each forward label at the same compound level), but cross-
// block forward gotos — where `goto L` is in one branch and `L:` is in a
// sibling/cousin branch — fail to codegen.
//
// This pass detects such cases and rewrites the AST to put the label at a
// position structurally enclosing both the goto and its original location,
// preserving the original control-flow semantics. The transform is:
//
//   if (cond) {                       if (cond) {
//     goto L;                           goto L;
//   } else {            =====>        } else {
//     L: stmt;                          goto L;
//   }                                 }
//   /* continuation */                L: stmt;
//                                     /* continuation */
//
// The label and its tail (subsequent statements in the same compound) move
// to the LCA compound right after the subtree that contained the original
// label. The original position becomes `goto L` so the natural fall-through
// path still reaches the labeled stmt.
//
// Restrictions (bail with a clean diagnostic if violated):
//   - Hoisting must NOT cross a loop body boundary. Hoisting a label out of
//     a loop changes iteration semantics.
//   - The hoisted tail must NOT contain `break` or `continue` whose target
//     is a loop or switch crossed by the hoist.
//   - The labeled tail must be at the END of its containing compound (the
//     simple case). Mid-block labels with post-label stmts in nested
//     intermediate compounds are not handled by this pass.
//
// The pass iterates: each round transforms one cross-block label, then
// re-scans (transforms can reveal new opportunities or cause re-classifying
// of other gotos). Bounded by the label count.

const GOTO_NORMALIZER = (() => {

// DVars whose declaring compound was split by `applyHoist` — uses are now
// in a sibling/ancestor compound that no longer shares the declaring scope.
// Codegen treats these as function-scope (slot live for the whole function)
// so block-scope-based slot reuse doesn't free them while still in use.
const HOIST_PROMOTED_DVARS = new WeakSet();

// Walk a function body, collecting per-label and per-goto location traces.
// Each trace is the chain of ancestor nodes from the function body (root)
// down to the SLabel/SGoto, in outer→inner order. SCompound nodes act as
// "scope boundaries" — gotos and labels are children of some SCompound.
//
// Returns:
//   labels: Map<SLabel, { compound, indexInCompound, trace }>
//   gotos:  Map<SGoto,  { compound, indexInCompound, trace }>
function collectTraces(body) {
  const labels = new Map();
  const gotos = new Map();

  // `nearestCompound` is the deepest SCompound on `trace` — the compound
  // that an SGoto/SLabel "belongs to" structurally, even if its immediate
  // parent is a control-flow node like an unbraced `if (cond) goto X;`.
  function nearestCompound(trace) {
    for (let i = trace.length - 1; i >= 0; i--) {
      if (trace[i] instanceof AST.SCompound) return trace[i];
    }
    return null;
  }

  function visit(node, trace) {
    if (!node) return;
    const ntrace = [...trace, node];

    if (node instanceof AST.SLabel) {
      const compound = nearestCompound(ntrace);
      // Index in compound is meaningful only if the label is a direct
      // child of the compound. Otherwise (e.g. `if (cond) L: stmt;`),
      // index is -1 to signal "non-direct child" — we won't apply the
      // hoist transform to such labels.
      const idx = compound ? compound.statements.indexOf(node) : -1;
      labels.set(node, { compound, indexInCompound: idx, trace: ntrace });
      return;
    }
    if (node instanceof AST.SGoto) {
      const compound = nearestCompound(ntrace);
      gotos.set(node, { compound, indexInCompound: -1, trace: ntrace });
      return;
    }

    if (node instanceof AST.SCompound) {
      for (const s of node.statements) visit(s, ntrace);
    } else if (node instanceof AST.SIf) {
      visit(node.thenBranch, ntrace);
      if (node.elseBranch) visit(node.elseBranch, ntrace);
    } else if (node instanceof AST.SWhile || node instanceof AST.SDoWhile) {
      visit(node.body, ntrace);
    } else if (node instanceof AST.SFor) {
      visit(node.init, ntrace);
      visit(node.body, ntrace);
    } else if (node instanceof AST.SSwitch) {
      visit(node.body, ntrace);
    } else if (node instanceof AST.STryCatch) {
      visit(node.tryBody, ntrace);
      for (const cc of node.catches) visit(cc.body, ntrace);
    }
    // Other Stmt subclasses (SExpr, SDecl, SReturn, SBreak, SContinue,
    // SEmpty) are leaves with no nested labels/gotos.
  }

  visit(body, []);
  return { labels, gotos };
}

// Returns the deepest common-prefix length of two traces. trace1[0..k-1]
// equals trace2[0..k-1], and they differ (or one ends) at index k.
function commonPrefixLength(trace1, trace2) {
  let i = 0;
  while (i < trace1.length && i < trace2.length && trace1[i] === trace2[i]) i++;
  return i;
}

// Classify a (goto, label) pair given their traces.
//   "structured-forward": label's compound is an ancestor of the goto's
//                         compound. The wasm `block` opened for the label
//                         wraps the goto's position, so `br` reaches it.
//                         Current codegen handles this; this pass skips.
//   "needs-transform":    everything else — either the goto's compound is
//                         an ancestor of the label's (jump INTO a nested
//                         scope), or they're in sibling/cousin subtrees.
//                         Both cases require hoisting the label to a
//                         position structurally enclosing the goto.
function classifyPair(gotoInfo, labelInfo) {
  const gotoTrace = gotoInfo.trace;
  if (gotoTrace.includes(labelInfo.compound)) return "structured-forward";
  return "needs-transform";
}

// Find the SCompound that's the LCA of the given traces (deepest common
// ancestor that is itself an SCompound, since insertions happen at compound
// level). Returns { lcaCompound, anchorStmt, anchorIndex } where anchorStmt
// is the statement in lcaCompound on the LABEL's path (the construct that
// transitively contains the label's branch), and anchorIndex is its index.
function findHoistTarget(gotoInfo, labelInfo) {
  const k = commonPrefixLength(gotoInfo.trace, labelInfo.trace);
  // Walk up from index k-1 to find the deepest SCompound that's a common
  // ancestor.
  let lcaCompound = null;
  for (let i = k - 1; i >= 0; i--) {
    if (gotoInfo.trace[i] instanceof AST.SCompound) {
      lcaCompound = gotoInfo.trace[i];
      break;
    }
  }
  if (!lcaCompound) return null;
  // Find the position of the next-level node on the LABEL's trace within
  // lcaCompound.statements. The next-level node is labelInfo.trace[lcaIdx+1]
  // where lcaIdx is the index of lcaCompound in labelInfo.trace.
  const lcaIdx = labelInfo.trace.indexOf(lcaCompound);
  if (lcaIdx < 0) return null;
  const childOnLabelPath = labelInfo.trace[lcaIdx + 1];
  if (!childOnLabelPath) return null;
  const anchorIndex = lcaCompound.statements.indexOf(childOnLabelPath);
  if (anchorIndex < 0) {
    // child is not directly in statements; it's wrapped by some control-flow
    // node that IS in statements. Find which statement contains it.
    for (let i = 0; i < lcaCompound.statements.length; i++) {
      if (containsNode(lcaCompound.statements[i], childOnLabelPath)) {
        return { lcaCompound, anchorStmt: lcaCompound.statements[i], anchorIndex: i };
      }
    }
    return null;
  }
  return { lcaCompound, anchorStmt: childOnLabelPath, anchorIndex };
}

// True if `tree` contains `node` somewhere in its sub-tree (matches by
// reference identity).
function containsNode(tree, node) {
  if (tree === node) return true;
  if (tree instanceof AST.SCompound) {
    return tree.statements.some(s => containsNode(s, node));
  }
  if (tree instanceof AST.SIf) {
    return containsNode(tree.thenBranch, node) ||
           (tree.elseBranch && containsNode(tree.elseBranch, node));
  }
  if (tree instanceof AST.SWhile || tree instanceof AST.SDoWhile) {
    return containsNode(tree.body, node);
  }
  if (tree instanceof AST.SFor) {
    return (tree.init && containsNode(tree.init, node)) ||
           containsNode(tree.body, node);
  }
  if (tree instanceof AST.SSwitch) return containsNode(tree.body, node);
  if (tree instanceof AST.STryCatch) {
    return containsNode(tree.tryBody, node) ||
           tree.catches.some(c => containsNode(c.body, node));
  }
  return false;
}

// Safety: check that hoisting `label` (in `labelInfo.compound`) up to
// `lcaCompound` is sound. Returns { ok: true } or { ok: false, reason: '...' }.
function checkHoistSafe(labelInfo, hoistTarget, body, switchBodies) {
  // Condition 1: lcaCompound must NOT itself be a switch body. Hoisting
  // into a switch body would interleave label/tail statements between case
  // blocks; the codegen's case-dispatch machinery already handles cross-
  // case-compound gotos directly, so leave those alone.
  if (switchBodies.has(hoistTarget.lcaCompound)) {
    return { ok: false, reason: `cannot hoist into a switch body — codegen handles cross-case gotos directly` };
  }

  // Condition 2: label and its tail (label + post-label stmts) are at the
  // END of labelCompound. In our simple model, the tail consists of
  // [labelCompound.statements from labelIdx onward]; we always include all
  // of those, so the tail-collapsing is safe within the labelCompound
  // itself. (The post-label stmts move with the tail.)

  // Condition 3: the path from labelCompound up to lcaCompound must NOT
  // cross a loop, switch, or try/catch body. Hoisting a label out of a
  // loop body changes the loop's iteration semantics; out of a switch
  // changes case dispatch + break semantics; out of a try-body would
  // move statements outside the protection of the corresponding catch
  // (and out of a catch-body would similarly change which throws are
  // re-caught).
  const trace = labelInfo.trace;
  const lcaIdx = trace.indexOf(hoistTarget.lcaCompound);
  for (let i = lcaIdx + 1; i < trace.length; i++) {
    const node = trace[i];
    if (node instanceof AST.SWhile || node instanceof AST.SDoWhile || node instanceof AST.SFor) {
      return { ok: false, reason: `cannot hoist label '${labelInfo.label?.name || '?'}' out of a loop body` };
    }
    if (node instanceof AST.SSwitch) {
      return { ok: false, reason: `cannot hoist label '${labelInfo.label?.name || '?'}' out of a switch body` };
    }
    if (node instanceof AST.STryCatch) {
      return { ok: false, reason: `cannot hoist label '${labelInfo.label?.name || '?'}' out of a try/catch body` };
    }
  }

  // Condition 4: fall-through from the hoisted tail must reach the position
  // right after the anchor without skipping any statements. SIf branches
  // exit right after the if, so they're fine — but an intermediate SCompound
  // with statements AFTER the node on the label's path is not: those
  // trailing statements run on every original path (both goto-driven label
  // fall-through and natural execution), and the hoist would jump straight
  // past them to the relocated tail. (Found via tcc's parse_number: the
  // `float_frac_parse:` label sits in nested ifs with `*q = '\0'; ...`
  // trailing in an intermediate block; the hoist silently dropped them.)
  // Bail — the irreducible-lowering fallback handles the general case.
  for (let i = lcaIdx + 1; i < trace.length - 1; i++) {
    const node = trace[i];
    if (node === labelInfo.compound) break; // own compound: tail moves with the label
    if (!(node instanceof AST.SCompound)) continue;
    const child = trace[i + 1];
    let stmtIdx = node.statements.indexOf(child);
    if (stmtIdx < 0) {
      // child is wrapped by a control-flow node that IS in statements
      stmtIdx = node.statements.findIndex(s => containsNode(s, child));
    }
    if (stmtIdx >= 0 && stmtIdx !== node.statements.length - 1) {
      return { ok: false, reason: `cannot hoist label '${labelInfo.label?.name || '?'}' past trailing statements in an intermediate block` };
    }
  }

  return { ok: true };
}

// Collect the set of SCompound nodes that are the body of an SSwitch in the
// function. Used by safety check to reject hoisting into a switch body.
function collectSwitchBodies(body) {
  const set = new Set();
  function visit(node) {
    if (!node) return;
    if (node instanceof AST.SCompound) {
      for (const s of node.statements) visit(s);
    } else if (node instanceof AST.SIf) {
      visit(node.thenBranch);
      visit(node.elseBranch);
    } else if (node instanceof AST.SWhile || node instanceof AST.SDoWhile) {
      visit(node.body);
    } else if (node instanceof AST.SFor) {
      visit(node.init);
      visit(node.body);
    } else if (node instanceof AST.SSwitch) {
      if (node.body instanceof AST.SCompound) set.add(node.body);
      visit(node.body);
    } else if (node instanceof AST.STryCatch) {
      visit(node.tryBody);
      for (const cc of node.catches) visit(cc.body);
    }
  }
  visit(body);
  return set;
}

// Perform the hoist transform. Returns the new function body (rebuilt).
//
// Layout of the resulting LCA compound (around the anchor stmt):
//
//   ...stmts before anchor...
//   modified anchor      (label-compound replaced with `goto L`)
//   goto __hoist_skip_N  (skip the hoisted region on natural fall-through)
//   L: ...tail...        (hoisted body)
//   __hoist_skip_N:      (resume natural fall-through)
//   ...stmts after anchor...
//
// The `goto __hoist_skip` + `__hoist_skip:` pair is essential: without it,
// any natural fall-through past the anchor that DIDN'T originally execute
// the label's body would now run the hoisted body inadvertently. With the
// skip-jump, only goto-driven and "explicit branch into the modified
// anchor" paths reach the hoisted body.
//
// The transform rebuilds every SCompound on the path from body down to
// labelCompound, plus lcaCompound itself.
let __hoistSkipCounter = 0;
function applyHoist(body, labelInfo, hoistTarget) {
  const labelCompound = labelInfo.compound;
  const labelIdx = labelInfo.indexInCompound;
  const lcaCompound = hoistTarget.lcaCompound;
  const anchorIndex = hoistTarget.anchorIndex;
  const labelStmt = labelCompound.statements[labelIdx];

  // Hoist splits labelCompound: pre-label statements stay in place, the
  // tail (label + everything after) moves to lcaCompound. Any DVars
  // declared by SDecls in the pre-label region may be referenced from the
  // hoisted tail — but the tail no longer shares scope with them. Mark
  // those DVars as function-scope so codegen's block-scope slot reuse
  // doesn't free them while the (now far-away) uses are still live.
  for (const s of labelCompound.statements.slice(0, labelIdx)) {
    if (s instanceof AST.SDecl) {
      for (const d of s.declarations) {
        if (d instanceof AST.DVar) HOIST_PROMOTED_DVARS.add(d);
      }
    }
  }

  // Tail = label + everything after in labelCompound
  const tail = labelCompound.statements.slice(labelIdx);

  // New labelCompound: original stmts before label + a single SGoto
  const gotoReplacement = new AST.SGoto(labelStmt.loc, labelStmt.name);
  gotoReplacement.target = labelStmt;
  // Mark the original label as having gotos (it now has at least our new one).
  labelStmt.hasGotos = true;
  if (labelStmt.labelKind === Types.LabelKind.LOOP) {
    labelStmt.labelKind = Types.LabelKind.BOTH;
  } // else stays FORWARD

  const newLabelCompoundStmts = [
    ...labelCompound.statements.slice(0, labelIdx),
    gotoReplacement,
  ];
  const newLabelCompound = new AST.SCompound(labelCompound.loc, newLabelCompoundStmts, labelCompound.labels);

  // Walk anchor subtree; replace labelCompound deep inside with the modified
  // version. This rebuilds the SIf/SCompound chain on the way down.
  const oldAnchor = lcaCompound.statements[anchorIndex];

  // The hoisted tail may also reference DVars declared in INTERMEDIATE
  // compounds between the anchor and labelCompound (checkHoistSafe
  // condition 4 permits the hoist when the label-path child is the last
  // statement of such a compound). After the hoist those compounds no
  // longer enclose the tail, so codegen's block-scope slot reuse would
  // free their wasm locals while the tail still uses them — mark every
  // DVar on the path function-scope, exactly like the pre-label ones.
  {
    const pathCompounds = [];
    const collect = (node) => {
      if (!node) return false;
      if (node === labelCompound) return true;
      if (node.children) {
        for (const c of node.children) {
          if (c && collect(c)) {
            if (node instanceof AST.SCompound) pathCompounds.push(node);
            return true;
          }
        }
      }
      return false;
    };
    collect(oldAnchor);
    for (const comp of pathCompounds) {
      for (const s of comp.statements) {
        if (s instanceof AST.SDecl) {
          for (const d of s.declarations) {
            if (d instanceof AST.DVar) HOIST_PROMOTED_DVARS.add(d);
          }
        }
      }
    }
  }

  const newAnchor = rebuildAlongPath(oldAnchor, labelCompound, newLabelCompound);

  // Update the label's enclosingBlock pointer to point to the lcaCompound
  // (its new parent compound after hoist).
  labelStmt.enclosingBlock = lcaCompound;

  // Synthesize a unique skip-label and the goto+label pair.
  const skipName = `__hoist_skip_${labelStmt.name}_${++__hoistSkipCounter}`;
  const skipLabel = new AST.SLabel(labelStmt.loc, skipName, lcaCompound);
  skipLabel.hasGotos = true;
  skipLabel.labelKind = Types.LabelKind.FORWARD;
  const skipGoto = new AST.SGoto(labelStmt.loc, skipName);
  skipGoto.target = skipLabel;

  const newLcaStmts = [
    ...lcaCompound.statements.slice(0, anchorIndex),
    newAnchor,
    skipGoto,
    ...tail,
    skipLabel,
    ...lcaCompound.statements.slice(anchorIndex + 1),
  ];
  const newLcaCompound = new AST.SCompound(lcaCompound.loc, newLcaStmts, lcaCompound.labels);

  // Update the SCompound.labels references on lcaCompound to include the
  // hoisted label and the new skip-label.
  if (!newLcaCompound.labels.includes(labelStmt)) {
    newLcaCompound.labels.push(labelStmt);
  }
  newLcaCompound.labels.push(skipLabel);
  // Remove the label from the (old) labelCompound's labels list (it lives
  // there from parser registration; we want consistency).
  if (newLabelCompound.labels) {
    const idx = newLabelCompound.labels.indexOf(labelStmt);
    if (idx >= 0) newLabelCompound.labels.splice(idx, 1);
  }

  // Now rebuild the body to install newLcaCompound in place of lcaCompound.
  return rebuildAlongPath(body, lcaCompound, newLcaCompound);
}

// Walk `tree` looking for `oldNode`; return a new tree where every node on
// the path to oldNode is rebuilt, and oldNode itself is replaced by newNode.
// Returns `tree` unchanged if oldNode is not found.
function rebuildAlongPath(tree, oldNode, newNode) {
  if (tree === oldNode) return newNode;
  if (tree instanceof AST.SCompound) {
    const newStmts = tree.statements.map(s => rebuildAlongPath(s, oldNode, newNode));
    if (newStmts.some((s, i) => s !== tree.statements[i])) {
      return new AST.SCompound(tree.loc, newStmts, tree.labels);
    }
    return tree;
  }
  if (tree instanceof AST.SIf) {
    const newThen = rebuildAlongPath(tree.thenBranch, oldNode, newNode);
    const newElse = tree.elseBranch ? rebuildAlongPath(tree.elseBranch, oldNode, newNode) : null;
    if (newThen !== tree.thenBranch || newElse !== tree.elseBranch) {
      return new AST.SIf(tree.loc, tree.condition, newThen, newElse);
    }
    return tree;
  }
  if (tree instanceof AST.SWhile) {
    const newBody = rebuildAlongPath(tree.body, oldNode, newNode);
    if (newBody !== tree.body) return new AST.SWhile(tree.loc, tree.condition, newBody);
    return tree;
  }
  if (tree instanceof AST.SDoWhile) {
    const newBody = rebuildAlongPath(tree.body, oldNode, newNode);
    if (newBody !== tree.body) return new AST.SDoWhile(tree.loc, newBody, tree.condition);
    return tree;
  }
  if (tree instanceof AST.SFor) {
    const newBody = rebuildAlongPath(tree.body, oldNode, newNode);
    if (newBody !== tree.body) return new AST.SFor(tree.loc, tree.init, tree.condition, tree.increment, newBody);
    return tree;
  }
  if (tree instanceof AST.SSwitch) {
    const newBody = rebuildAlongPath(tree.body, oldNode, newNode);
    if (newBody !== tree.body) return new AST.SSwitch(tree.loc, tree.expr, newBody);
    return tree;
  }
  if (tree instanceof AST.STryCatch) {
    const newTry = rebuildAlongPath(tree.tryBody, oldNode, newNode);
    let changed = newTry !== tree.tryBody;
    const newCatches = tree.catches.map(c => {
      const nb = rebuildAlongPath(c.body, oldNode, newNode);
      if (nb !== c.body) { changed = true; return { ...c, body: nb }; }
      return c;
    });
    if (changed) return new AST.STryCatch(tree.loc, newTry, newCatches);
    return tree;
  }
  return tree;
}

// Top-level entry: run the pass on a function body. Iteratively transforms
// cross-block goto/label pairs. Reports any unhandled cases via `sink`.
function normalize(funcDecl, sink) {
  if (!funcDecl.body) return;
  let body = funcDecl.body;
  const MAX_ITERATIONS = 256;  // upper bound on transformations per function
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { labels, gotos } = collectTraces(body);
    const switchBodies = collectSwitchBodies(body);
    let transformedThisRound = false;
    for (const [gotoNode, gotoInfo] of gotos) {
      if (!gotoNode.target) continue;  // unresolved goto; codegen will report
      const labelInfo = labels.get(gotoNode.target);
      if (!labelInfo) continue;
      // Hoist requires the label to be a direct child of a compound (so we
      // can replace it with a goto). Skip pathological cases like
      // `if (cond) name: stmt;`.
      if (labelInfo.indexInCompound < 0) continue;
      const cls = classifyPair(gotoInfo, labelInfo);
      if (cls !== "needs-transform") continue;
      const target = findHoistTarget(gotoInfo, labelInfo);
      if (!target) continue;
      const labelInfoWithLabel = { ...labelInfo, label: gotoNode.target };
      const safe = checkHoistSafe(labelInfoWithLabel, target, body, switchBodies);
      if (!safe.ok) {
        // Leave it alone; codegen will surface its own diagnostic.
        continue;
      }
      body = applyHoist(body, labelInfoWithLabel, target);
      transformedThisRound = true;
      break;  // re-collect traces after a transform
    }
    if (!transformedThisRound) break;
  }
  funcDecl.body = body;
}

// ---------------------------------------------------------------------
// Backward-goto inlining
//
// A label that's both a forward-goto target AND a backward-goto target
// (`labelKind === BOTH`) gets a wasm `loop` block opened at its position
// to receive backward branches. If a SUBSEQUENT forward label appears in
// the same compound, the codegen has to close the loop (wasm structured
// blocks can't outlive an outer block that ends earlier) — and any
// later backward goto to the original label fails to codegen.
//
// virtio.c's `virtio_9p_recv_request` hits this exact pattern:
//
//     ... many `goto error;` (forward) ...
//     return 0;
//   error:                                  // BOTH (forward + backward)
//     virtio_9p_send_error(...); return 0;
//   protocol_error:                         // FORWARD — closes error's loop
//   fid_not_found:
//     err = -P9_EPROTO;
//     goto error;                           // <-- error's loop is gone, fails
//
// Fix: at the AST level, REPLACE each backward goto with a copy of the
// labeled-tail's statements. The label retains forward-only gotos, no
// loop is needed, and the wasm structure cleanly nests.
//
// Safety conditions for inlining (all must hold):
//   - The body terminates (last stmt is `return`) so we don't fall through
//     past the inlined region into surrounding code.
//   - The body contains no nested labels, gotos, declarations, breaks, or
//     continues. (Labels would be duplicated across inline sites; gotos
//     could target stale positions; decls could clash with the goto-site's
//     scope; break/continue could re-target a different enclosing loop.)
//   - The body is non-empty.

// Compute the label's body slice: statements in `compound.statements`
// after position `labelIndex`, up to (but not including) the next SLabel
// or end of compound. Returns null if the slice contains anything that
// makes inlining unsafe.
function bodySliceFor(compound, labelIndex) {
  const stmts = compound.statements;
  let endIdx = labelIndex + 1;
  while (endIdx < stmts.length && !(stmts[endIdx] instanceof AST.SLabel)) endIdx++;
  return stmts.slice(labelIndex + 1, endIdx);
}

// True if `stmts` is safe to splice in place of a backward goto.
function isInlineSafe(stmts) {
  if (stmts.length === 0) return false;

  // Walk to detect any disqualifying construct.
  function disqualifies(s) {
    if (s instanceof AST.SLabel || s instanceof AST.SGoto) return true;
    if (s instanceof AST.SDecl) return true;
    if (s instanceof AST.SBreak || s instanceof AST.SContinue) return true;
    if (s instanceof AST.SCompound) return s.statements.some(disqualifies);
    if (s instanceof AST.SIf) {
      return disqualifies(s.thenBranch) || (s.elseBranch && disqualifies(s.elseBranch));
    }
    if (s instanceof AST.SWhile || s instanceof AST.SDoWhile) return disqualifies(s.body);
    if (s instanceof AST.SFor) {
      return (s.init && disqualifies(s.init)) || disqualifies(s.body);
    }
    if (s instanceof AST.SSwitch) return disqualifies(s.body);
    if (s instanceof AST.STryCatch) {
      return disqualifies(s.tryBody) || s.catches.some(c => disqualifies(c.body));
    }
    return false;
  }
  if (stmts.some(disqualifies)) return false;

  // Must terminate. Conservative: last stmt is SReturn. Could later
  // extend to nested SIf where both branches terminate, calls to
  // `_Noreturn` functions, etc.
  const last = stmts[stmts.length - 1];
  if (last instanceof AST.SReturn) return true;

  return false;
}

// Walk a function body and assign each SLabel and SGoto a linear "source
// position" (an integer that respects pre-order traversal). Two nodes
// where pos(a) < pos(b) means `a` appears textually before `b`.
function collectLabelGotoPositions(body) {
  const labelInfo = new Map();   // SLabel → { compound, indexInCompound, position, bodySlice }
  const gotoInfo = new Map();    // SGoto → { compound, indexInCompound, position }
  let pos = 0;

  function walk(node) {
    if (!node) return;
    if (node instanceof AST.SCompound) {
      for (let i = 0; i < node.statements.length; i++) {
        const s = node.statements[i];
        if (s instanceof AST.SLabel) {
          const slice = bodySliceFor(node, i);
          labelInfo.set(s, { compound: node, indexInCompound: i, position: pos++, bodySlice: slice });
        } else if (s instanceof AST.SGoto) {
          gotoInfo.set(s, { compound: node, indexInCompound: i, position: pos++ });
        } else {
          pos++;
          walk(s);
        }
      }
    } else if (node instanceof AST.SIf) {
      walk(node.thenBranch);
      walk(node.elseBranch);
    } else if (node instanceof AST.SWhile || node instanceof AST.SDoWhile) {
      walk(node.body);
    } else if (node instanceof AST.SFor) {
      walk(node.init);
      walk(node.body);
    } else if (node instanceof AST.SSwitch) {
      walk(node.body);
    } else if (node instanceof AST.STryCatch) {
      walk(node.tryBody);
      for (const cc of node.catches) walk(cc.body);
    }
    // else: leaf
  }
  walk(body);
  return { labelInfo, gotoInfo };
}

// Run the backward-goto inlining pass on a function body. Iterates: each
// round inlines one backward goto, then re-walks to find more. Bounded
// by the goto count.
function inlineBackwardGotos(funcDecl) {
  if (!funcDecl.body) return;
  let body = funcDecl.body;

  for (let iter = 0; iter < 1024; iter++) {
    const { labelInfo, gotoInfo } = collectLabelGotoPositions(body);

    let didTransform = false;
    for (const [label, lInfo] of labelInfo) {
      // Only relevant for labels with at least one backward goto. The
      // parser sets BOTH when forward + backward both exist; LOOP for
      // backward-only. We only want to inline backward gotos to BOTH
      // labels — pure LOOP labels are fine for the codegen as-is.
      if (label.labelKind !== Types.LabelKind.BOTH) continue;
      if (!isInlineSafe(lInfo.bodySlice)) continue;

      // Find a backward goto to this label.
      let targetGoto = null;
      let targetGotoInfo = null;
      for (const [g, gI] of gotoInfo) {
        if (g.target === label && gI.position > lInfo.position) {
          targetGoto = g;
          targetGotoInfo = gI;
          break;
        }
      }
      if (!targetGoto) continue;

      // Replace the goto with the body slice. The slice's statements are
      // shared (not deep-cloned); since the safety check guarantees no
      // labels/gotos/decls inside, sharing is fine. (Multiple inline
      // sites referencing the same EXpr nodes is OK — the codegen reads
      // them, doesn't mutate.)
      const compound = targetGotoInfo.compound;
      const idx = targetGotoInfo.indexInCompound;
      const newStmts = [
        ...compound.statements.slice(0, idx),
        ...lInfo.bodySlice,
        ...compound.statements.slice(idx + 1),
      ];
      const newCompound = new AST.SCompound(compound.loc, newStmts, compound.labels);
      body = rebuildAlongPath(body, compound, newCompound);

      // If this was the last backward goto to the label, demote labelKind
      // from BOTH back to FORWARD so the codegen treats it as a pure
      // forward target (no loop block).
      let backwardCount = 0;
      for (const [g, gI] of gotoInfo) {
        if (g === targetGoto) continue;
        if (g.target === label && gI.position > lInfo.position) backwardCount++;
      }
      if (backwardCount === 0) label.labelKind = Types.LabelKind.FORWARD;

      didTransform = true;
      break;
    }
    if (!didTransform) break;
  }

  funcDecl.body = body;
}

// Optimize all functions with bodies in a translation unit. Runs the
// cross-block hoist pass and the backward-goto inlining pass. Both can
// reduce the goto graph; running them in this order means hoist sees the
// original structure (which is what its safety conditions assume), and
// inlining cleans up any remaining BOTH-label trouble after.
function optimize(unit) {
  for (const fn of unit.definedFunctions || []) {
    normalize(fn);
    inlineBackwardGotos(fn);
  }
  for (const fn of unit.staticFunctions || []) {
    normalize(fn);
    inlineBackwardGotos(fn);
  }
}

return { normalize, inlineBackwardGotos, optimize, collectTraces, classifyPair, HOIST_PROMOTED_DVARS };

})();

// ====================
// IRREDUCIBLE LOWERING — function-local loop-switch fallback
// ====================
//
// For functions where GOTO_NORMALIZER couldn't make all gotos resolvable via
// structured wasm `block`/`loop` nesting, we fall back to a CPS-style
// encoding: rewrite the whole function body as `while (1) switch (state)`
// with one case per basic block. Each goto becomes `state = N; continue;`.
//
// The output is plain structured C and feeds back through the existing
// codegen unchanged — this pass is purely an AST→AST transformation.
//
// Pass ordering: runs after GOTO_NORMALIZER so we only pay the cost for
// functions that genuinely can't be structured. Functions with clean control
// flow are left alone.
//
// Limitations (documented, not silently miscompiled):
//   - VLAs are rejected at parse time elsewhere; their hoisting would need
//     dynamic alloca which we don't model.
//   - setjmp/longjmp interaction inside an irreducible function: not
//     supported. (Structured-mode functions still work.)
//   - Computed goto (GCC extension): we don't support it generally.

const IRREDUCIBLE_LOWERING = (() => {

// ----- Segment + terminator types -----
//
// A Segment is the AST equivalent of a basic block — a maximal sequence of
// straight-line statements with one entry (the case label) and one exit
// (its terminator). All segments live in a flat array; their `id` is the
// switch-case value used to dispatch into them.
//
// Terminators describe how control leaves a segment. They get translated
// into AST statements at the end of each case body during wrapper synthesis.

function newSegment(id) {
  return { id, stmts: [], term: null };
}

// Terminator factory helpers. Each returns a plain object whose `kind` field
// is one of: "fallthrough", "goto", "branch", "switch", "return", "halt".
const Term = {
  fallthrough: (nextId) => ({ kind: "fallthrough", nextId }),
  goto: (targetId) => ({ kind: "goto", targetId }),
  branch: (cond, thenId, elseId) => ({ kind: "branch", cond, thenId, elseId }),
  // cases: [{ value: bigint, target: int }], defaultTarget: int
  switchDispatch: (scrutinee, cases, defaultTarget) => ({
    kind: "switch", scrutinee, cases, defaultTarget,
  }),
  return: (expr) => ({ kind: "return", expr }),
  // SThrow as a terminator — emitted by the segmentizer when it rewrites
  // a longjmp(buf, val) call. The thrown exception is caught by the
  // physical try/catch that the wrapper synthesizes around the switch.
  throw: (sthrow) => ({ kind: "throw", sthrow }),
  // "halt" marks a segment that exits the loop-switch and falls out the
  // bottom of the function (used for unreachable continuations after a
  // terminator emits its branch).
  halt: () => ({ kind: "halt" }),
};

// ----- Variable hoisting -----
//
// Walk the function body, collect every DVar declaration into a single
// flat list at function entry, and replace each in-place declaration with
// an SExpr-wrapped assignment (when there was an initializer).
//
// α-rename when a nested-scope DVar shadows an outer-scope one with the
// same name. EIdent nodes already point at DVar objects by reference, so
// mutating DVar.name (DVars are seal'd, not frozen) keeps every reference
// pointed at the right object — only the displayed name changes.
//
// Returns { decls: DVar[], rewrittenBody: SCompound }. The DVars in
// `decls` are stripped of initExprs.
function hoistDeclarations(funcDef) {
  const hoisted = [];
  // names seen anywhere in this function so far — used to detect
  // shadowing. A second `int x;` in a nested scope gets renamed.
  const used = new Set();
  for (const p of funcDef.parameters) used.add(p.name);

  function uniquify(dvar) {
    if (!used.has(dvar.name)) { used.add(dvar.name); return; }
    let i = 2;
    let candidate = `${dvar.name}__${i}`;
    while (used.has(candidate)) { i++; candidate = `${dvar.name}__${i}`; }
    used.add(candidate);
    dvar.name = candidate;
  }

  // Emit per-leaf assignment statements that reproduce an aggregate
  // initializer at its ORIGINAL position. Used when the initializer
  // reads variables or calls functions: keeping it on the hoisted decl
  // would evaluate it at function entry, before the values it reads
  // exist (found via micropython's float divmod — `mp_obj_t tuple[2] =
  // {a0, a1}` in an irreducible function read a0/a1 as zeros).
  // normalizeInitList has already resolved designators, brace elision,
  // and zero-fill, so init lists here are fully positional.
  function emitAggregateInitAssigns(target, init, out) {
    if (init instanceof AST.EInitList) {
      const t = target.type.removeQualifiers();
      if (t.isArray()) {
        // C11 6.7.9p14 brace-wrapped string: normalizeInitList keeps the
        // literal as the SOLE element (the EInitList{char[N],[EString]}
        // shape) — it initializes the WHOLE array, not element 0. Without
        // this, `char B[] = {"brace"}` fell to the scalar leaf below as
        // B[0] = <string> and stored the literal's address low byte.
        if (init.elements.length === 1 && init.elements[0] instanceof AST.EString &&
            !t.baseType.removeQualifiers().isArray() &&
            !t.baseType.removeQualifiers().isAggregate()) {
          emitAggregateInitAssigns(target, init.elements[0], out);
          return;
        }
        for (let i = 0; i < init.elements.length; i++) {
          const el = init.elements[i];
          if (!el) continue;
          const idx = new AST.EInt(el.loc, Types.TINT, BigInt(i));
          emitAggregateInitAssigns(AST.makeSubscript(el.loc, target, idx), el, out);
        }
        return;
      }
      if (t.isTag() && t.tagDecl) {
        const members = [];
        for (const m of t.tagDecl.members) {
          if (!(m instanceof AST.DVar)) continue;
          if (m.bitWidth >= 0 && !m.name) continue; // unnamed bitfields
          members.push(m);
        }
        if (t.tagDecl.tagKind === Types.TagKind.UNION) {
          const mi = init.unionMemberIndex >= 0 ? init.unionMemberIndex : 0;
          const m = members[mi];
          const el = init.elements[0];
          if (m && el) emitAggregateInitAssigns(new AST.EMember(el.loc, m.type, target, m), el, out);
          return;
        }
        for (let i = 0; i < init.elements.length && i < members.length; i++) {
          const el = init.elements[i];
          if (!el) continue;
          emitAggregateInitAssigns(new AST.EMember(el.loc, members[i].type, target, members[i]), el, out);
        }
        return;
      }
    }
    if (init instanceof AST.EString && target.type.removeQualifiers().isArray()) {
      // char-array member initialized from a string literal inside an
      // otherwise non-constant list: per-element stores (the literal's
      // bytes include the NUL; remaining elements zero-fill).
      const arrType = target.type.removeQualifiers();
      const n = arrType.arraySize || 0;
      // The literal's value is little-endian BYTES; decode element-sized
      // units — u"XY" is [88,0, 89,0, 0,0], so indexing raw bytes by the
      // ELEMENT index interleaved the NULs (`{88,0,89}` not `{88,89,0}`).
      const es = (init.type && init.type.removeQualifiers().isArray())
        ? init.type.removeQualifiers().baseType.removeQualifiers().size : 1;
      for (let i = 0; i < n; i++) {
        let b = 0;
        for (let k = 0; k < es; k++) b += (init.value[i * es + k] || 0) * 2 ** (8 * k);
        const idx = new AST.EInt(init.loc, Types.TINT, BigInt(i));
        const lhs = AST.makeSubscript(init.loc, target, idx);
        const rhs = new AST.EInt(init.loc, Types.TINT, BigInt(b));
        out.push(new AST.SExpr(init.loc, new AST.EBinary(init.loc, lhs.type, "ASSIGN", lhs, rhs)));
      }
      return;
    }
    // Scalar leaf (or whole-aggregate copy, e.g. `S a = b;` — struct
    // assignment is supported by codegen).
    out.push(new AST.SExpr(init.loc,
      new AST.EBinary(init.loc, target.type, "ASSIGN", target, init)));
  }

  function rewrite(stmt) {
    if (!stmt) return stmt;
    if (stmt instanceof AST.SDecl) {
      const initStmts = [];
      for (const d of stmt.declarations) {
        if (!(d instanceof AST.DVar)) continue;
        if (d.storageClass === Types.StorageClass.STATIC ||
            d.storageClass === Types.StorageClass.EXTERN) continue;
        uniquify(d);
        const init = d.initExpr;
        // EInitList / aggregate-array initializers can't be expressed as
        // a plain `var = expr` SExpr after declaration.
        const initIsListLike = init &&
          (init instanceof AST.EInitList ||
           (d.type.isArray && d.type.isArray()) ||
           (d.type.isAggregate && d.type.isAggregate()));
        if (initIsListLike) {
          // Always hoist the BARE decl and reproduce the initializer with
          // per-leaf assignments at the original position. A C initializer
          // runs every time the declaration is reached (C11 6.8p3); the
          // old "entry-safe" shortcut kept constant initializers on the
          // hoisted decl (evaluated once at function entry), so a
          // loop-local `int a[2] = {1,2}` in a lowered function kept its
          // mutated values across iterations. What the init READS never
          // mattered — the target itself changes between visits.
          // (Cost: constant tables re-store per visit in irreducible
          // functions; correctness owns that trade.)
          d.initExpr = null;
          hoisted.push(d);
          const target = new AST.EIdent(d.loc, d.type, d);
          emitAggregateInitAssigns(target, init, initStmts);
          continue;
        }
        d.initExpr = null;  // strip — the hoisted decl has no initializer
        hoisted.push(d);
        if (init !== null) {
          const ident = new AST.EIdent(d.loc, d.type, d);
          const assign = new AST.EBinary(d.loc, d.type, "ASSIGN", ident, init);
          initStmts.push(new AST.SExpr(d.loc, assign));
        }
      }
      // Collapse to nothing / a single SExpr / a small SCompound of
      // assignments — whatever's smallest.
      if (initStmts.length === 0) return new AST.SEmpty(stmt.loc);
      if (initStmts.length === 1) return initStmts[0];
      return new AST.SCompound(stmt.loc, initStmts);
    }
    if (stmt instanceof AST.SCompound) {
      const rewritten = stmt.statements.map(rewrite);
      return new AST.SCompound(stmt.loc, rewritten, stmt.labels);
    }
    if (stmt instanceof AST.SIf) {
      return new AST.SIf(stmt.loc, stmt.condition,
        rewrite(stmt.thenBranch),
        stmt.elseBranch ? rewrite(stmt.elseBranch) : null);
    }
    if (stmt instanceof AST.SWhile) {
      return new AST.SWhile(stmt.loc, stmt.condition, rewrite(stmt.body));
    }
    if (stmt instanceof AST.SDoWhile) {
      return new AST.SDoWhile(stmt.loc, rewrite(stmt.body), stmt.condition);
    }
    if (stmt instanceof AST.SFor) {
      return new AST.SFor(stmt.loc,
        stmt.init ? rewrite(stmt.init) : null,
        stmt.condition, stmt.increment,
        rewrite(stmt.body));
    }
    if (stmt instanceof AST.SSwitch) {
      const newBody = rewrite(stmt.body);
      return new AST.SSwitch(stmt.loc, stmt.expr, newBody);
    }
    if (stmt instanceof AST.STryCatch) {
      // After irreducible lifts catch bodies into segments, the catch's
      // binding vars need function-scope visibility (segments reference
      // them by DVar identity from outside the catch's lexical scope).
      // Hoist them alongside the rest of the locals.
      for (const cc of stmt.catches) {
        for (const bv of (cc.bindingVars || [])) {
          uniquify(bv);
          hoisted.push(bv);
        }
      }
      const newTry = rewrite(stmt.tryBody);
      const newCatches = stmt.catches.map(c => ({ ...c, body: rewrite(c.body) }));
      return new AST.STryCatch(stmt.loc, newTry, newCatches);
    }
    return stmt;  // SExpr, SReturn, SGoto, SLabel, SBreak, SContinue, SEmpty, etc.
  }

  const rewrittenBody = rewrite(funcDef.body);
  return { decls: hoisted, rewrittenBody };
}

// ----- AST → segments walker -----
//
// Walks the rewritten function body, splitting it at every control-flow
// boundary into a flat list of Segments. Each goto/branch/return becomes
// a terminator referring to other segment ids by integer.
//
// Loop and switch contexts are tracked on `loopStack` so SBreak/SContinue
// resolve to the right exit/header ids.
function buildSegments(body, tryCtx) {
  const segments = [];
  let curSeg = null;
  let nextId = 0;
  const labelToId = new Map();  // SLabel → segment id
  // Loop stack: each entry is { breakId, continueId? }. Switches push
  // entries without continueId (SContinue must skip past switches).
  const loopStack = [];
  // Stack of Map<SCase, segmentId>. Pushed when entering an SSwitch's
  // body; consumed when an SCase node is visited (so the visitor knows
  // which segment id to open at that label).
  const caseIdsStack = [];

  function allocId() { return nextId++; }
  function currentHandlerRegionId() {
    if (!tryCtx || tryCtx.regionStack.length === 0) return -1;
    return tryCtx.regionStack[tryCtx.regionStack.length - 1];
  }
  function openSeg(id) {
    const seg = newSegment(id);
    segments.push(seg);
    curSeg = seg;
    // Stamp every opened segment with the innermost active handler-region.
    // The wrapper writes this id into a runtime variable at the top of each
    // case body, so when an exception fires, the catch dispatcher knows
    // which lexical region the current segment belongs to.
    if (tryCtx) tryCtx.segmentHandlerIds.set(id, currentHandlerRegionId());
    return seg;
  }
  function close(term) {
    if (!curSeg.term) curSeg.term = term;
    curSeg = null;  // anything emitted before a new openSeg goes into limbo
  }
  function ensureOpen() {
    // If we just emitted a terminator and the next statement isn't a label,
    // create a fresh "dead" segment to hold further code.
    if (curSeg === null) openSeg(allocId());
  }
  function getLabelId(label) {
    let id = labelToId.get(label);
    if (id === undefined) { id = allocId(); labelToId.set(label, id); }
    return id;
  }
  function topLoop() {
    for (let i = loopStack.length - 1; i >= 0; i--) {
      if (loopStack[i].continueId !== null) return loopStack[i];
    }
    return null;
  }
  function topBreakTarget() {
    return loopStack.length > 0 ? loopStack[loopStack.length - 1].breakId : null;
  }

  // Open the entry segment.
  openSeg(allocId());

  function visit(node) {
    if (!node) return;
    ensureOpen();

    if (node instanceof AST.SEmpty) return;

    if (node instanceof AST.SCompound) {
      for (const s of node.statements) visit(s);
      return;
    }

    if (node instanceof AST.SLabel) {
      // A label site: close the current segment falling through to a fresh
      // segment with the label's id, then open it.
      const id = getLabelId(node);
      close(Term.fallthrough(id));
      openSeg(id);
      return;
    }

    if (node instanceof AST.SGoto) {
      if (!node.target) {
        // Unresolved label name — leave a halt; codegen will diagnose it.
        close(Term.halt());
        return;
      }
      const id = getLabelId(node.target);
      close(Term.goto(id));
      return;
    }

    if (node instanceof AST.SIf) {
      const thenId = allocId();
      const elseId = node.elseBranch ? allocId() : null;
      const joinId = allocId();
      close(Term.branch(node.condition, thenId, elseId !== null ? elseId : joinId));
      openSeg(thenId);
      visit(node.thenBranch);
      if (curSeg !== null) close(Term.fallthrough(joinId));
      if (elseId !== null) {
        openSeg(elseId);
        visit(node.elseBranch);
        if (curSeg !== null) close(Term.fallthrough(joinId));
      }
      openSeg(joinId);
      return;
    }

    if (node instanceof AST.SWhile) {
      const hdrId = allocId();
      const bodyId = allocId();
      const exitId = allocId();
      close(Term.fallthrough(hdrId));
      openSeg(hdrId);
      close(Term.branch(node.condition, bodyId, exitId));
      openSeg(bodyId);
      loopStack.push({ breakId: exitId, continueId: hdrId });
      visit(node.body);
      loopStack.pop();
      if (curSeg !== null) close(Term.fallthrough(hdrId));
      openSeg(exitId);
      return;
    }

    if (node instanceof AST.SDoWhile) {
      const bodyId = allocId();
      const testId = allocId();
      const exitId = allocId();
      close(Term.fallthrough(bodyId));
      openSeg(bodyId);
      loopStack.push({ breakId: exitId, continueId: testId });
      visit(node.body);
      loopStack.pop();
      if (curSeg !== null) close(Term.fallthrough(testId));
      openSeg(testId);
      close(Term.branch(node.condition, bodyId, exitId));
      openSeg(exitId);
      return;
    }

    if (node instanceof AST.SFor) {
      // After hoisting, SFor.init is either null, an SExpr, an SCompound of
      // assignments, or SEmpty. Lower init in the current segment.
      if (node.init) visit(node.init);
      const hdrId = allocId();
      const bodyId = allocId();
      const contId = allocId();  // continue target = increment block
      const exitId = allocId();
      close(Term.fallthrough(hdrId));
      openSeg(hdrId);
      if (node.condition) {
        close(Term.branch(node.condition, bodyId, exitId));
      } else {
        close(Term.fallthrough(bodyId));
      }
      openSeg(bodyId);
      loopStack.push({ breakId: exitId, continueId: contId });
      visit(node.body);
      loopStack.pop();
      if (curSeg !== null) close(Term.fallthrough(contId));
      openSeg(contId);
      if (node.increment) {
        curSeg.stmts.push(new AST.SExpr(node.loc, node.increment));
      }
      close(Term.fallthrough(hdrId));
      openSeg(exitId);
      return;
    }

    if (node instanceof AST.SSwitch) {
      const postId = allocId();
      // Allocate a segment id per SCase in this switch's body. The
      // mapping is stashed on caseIdsStack so the SCase visitor below
      // can open the right segment at each label position — case
      // labels deep inside nested compounds work naturally because
      // they're just SCase nodes the visitor will encounter in order.
      const caseIds = new Map();
      let defaultTarget = postId;
      const dispatchCases = [];
      for (const sc of node.body.caseBag) {
        const id = allocId();
        caseIds.set(sc, id);
        if (sc.isDefault) {
          defaultTarget = id;
        } else {
          for (let v = sc.lo; v <= sc.hi; v++) {
            dispatchCases.push({ value: v, target: id });
          }
        }
      }
      close(Term.switchDispatch(node.expr, dispatchCases, defaultTarget));
      caseIdsStack.push(caseIds);
      loopStack.push({ breakId: postId, continueId: null });
      openSeg(allocId());
      visit(node.body);
      loopStack.pop();
      caseIdsStack.pop();
      if (curSeg !== null) close(Term.fallthrough(postId));
      openSeg(postId);
      return;
    }

    if (node instanceof AST.SCase) {
      // Close the current segment falling through into this case's
      // segment, then open it. The id was assigned by the enclosing
      // SSwitch handler above.
      const top = caseIdsStack.length > 0 ? caseIdsStack[caseIdsStack.length - 1] : null;
      const id = top ? top.get(node) : undefined;
      if (id === undefined) {
        throw new Error("irreducible lowering: SCase outside switch");
      }
      if (curSeg !== null) close(Term.fallthrough(id));
      openSeg(id);
      return;
    }

    if (node instanceof AST.SBreak) {
      const target = topBreakTarget();
      if (target === null) {
        throw new Error("irreducible lowering: SBreak outside loop/switch");
      }
      close(Term.goto(target));
      return;
    }

    if (node instanceof AST.SContinue) {
      const loop = topLoop();
      if (!loop) {
        throw new Error("irreducible lowering: SContinue outside loop");
      }
      close(Term.goto(loop.continueId));
      return;
    }

    if (node instanceof AST.SReturn) {
      close(Term.return(node.expr));
      return;
    }

    // STryCatch: hoist its try-body and catch bodies into segments in
    // the shared switch. The wrapper synthesizes a single physical
    // try/catch wrapping the whole switch, with one catch clause per
    // distinct tag; the dispatcher inside each clause reads the runtime
    // `current_handler` (stamped per-segment) and routes to the right
    // catch entry segment — or rethrows if no enclosing region handles
    // this tag.
    if (node instanceof AST.STryCatch) {
      if (!tryCtx) {
        // Defensive: lower() always passes a tryCtx now. If we ever
        // call buildSegments without one, fall back to opaque.
        curSeg.stmts.push(node);
        return;
      }

      const parentId = currentHandlerRegionId();
      const regionId = tryCtx.regions.length;
      const joinId = allocId();
      const catchInfos = node.catches.map(cc => {
        // A tag-less clause (catch-all) has no tag to key by — it gets
        // its own physical catch_all_ref dispatcher in the wrapper.
        if (cc.tag) tryCtx.tags.set(cc.tag.name, cc.tag);
        else tryCtx.hasCatchAll = true;
        return {
          tag: cc.tag,
          userBindingVars: cc.bindingVars || [],
          entrySegId: allocId(),
        };
      });
      tryCtx.regions.push({
        id: regionId,
        parentId,
        joinSegId: joinId,
        catches: catchInfos,
      });

      // Close current segment, fall through into the try body.
      const tryEntryId = allocId();
      close(Term.fallthrough(tryEntryId));

      // Push this region while segmentizing the try body so its segments
      // get stamped with regionId.
      tryCtx.regionStack.push(regionId);
      openSeg(tryEntryId);
      visit(node.tryBody);
      if (curSeg !== null) close(Term.fallthrough(joinId));
      tryCtx.regionStack.pop();

      // Catch bodies run *after* their region exited — segments here are
      // protected by the parent region (or unprotected if top-level).
      for (let i = 0; i < node.catches.length; i++) {
        openSeg(catchInfos[i].entrySegId);
        visit(node.catches[i].body);
        if (curSeg !== null) close(Term.fallthrough(joinId));
      }

      openSeg(joinId);
      return;
    }

    // SThrow as a terminator: closes the current segment. The thrown
    // exception is caught by the physical try/catch the wrapper
    // synthesizes around the switch (when any setjmp region exists).
    if (node instanceof AST.SThrow) {
      close(Term.throw(node));
      return;
    }

    // Straight-line statements: SExpr, SDecl (post-hoist — only static/extern
    // locals survive), and anything else we don't transform.
    curSeg.stmts.push(node);
  }

  visit(body);
  // Close any trailing open segment with a halt (function fall-through).
  if (curSeg !== null) close(Term.halt());

  return segments;
}

// For a region and a tag, find the innermost enclosing region that has
// a catch for that tag. Walks the parent chain. Returns the matching
// catch info (with entrySegId, userBindingVars) or null if no ancestor
// handles the tag.
function findDispatchEntry(regionId, tag, regions) {
  let id = regionId;
  while (id >= 0) {
    const r = regions[id];
    for (const ci of r.catches) {
      // A tag-less catch (catch-all) matches ANY tag. Within a region a
      // specific catch wins by clause order — catch-all is constrained
      // to be last. `tag === null` (the physical catch_all_ref
      // dispatcher asking for an unknown-tag exception's handler) only
      // matches a catch-all.
      if (ci.tag === tag || ci.tag === null) return ci;
    }
    id = r.parentId;
  }
  return null;
}

// Construct one catch clause of the physical try/catch wrapping the
// switch. The clause catches `tag`, binds the thrown args into fresh
// temp DVars, and dispatches based on the runtime handler-region id:
//
//   catch tag(__tmp0, __tmp1, ...) {
//     if      (__irreducible_handler == R1) { user.id = __tmp0; ...; state = entryR1; }
//     else if (__irreducible_handler == R2) { ...                     state = entryR2; }
//     ...
//     else __throw tag(__tmp0, __tmp1, ...);  // no ancestor handles → propagate
//   }
//
// After the catch body falls off, the while loop iterates and the
// switch re-enters at the new state (whose case prefix stamps a new
// handler id — typically the dispatched-to handler's parent region).
// `tag === null` builds the catch-all dispatcher: a physical
// catch_all_ref clause (no payload bindings — the C-level catch-all has
// none) whose else arm re-raises the captured exnref via throw_ref, so
// an exception no active region handles propagates with tag and payload
// intact.
function makeDispatcherCatch(tag, tryCtx, loc, handlerVar, setState) {
  const paramTypes = (tag && tag.paramTypes) || [];
  const tempBindings = paramTypes.map((t, idx) => {
    const dv = new AST.DVar(loc,
      Lexer.intern(`__irreducible_caught_${idx}`),
      t, Types.StorageClass.NONE, null);
    dv.definition = dv;
    return dv;
  });
  const tempBindingNames = tempBindings.map(d => d.name);

  // Per-region match arm: assign temp bindings into the chosen user
  // catch's bindings, then state = entry. Only emit an arm for regions
  // whose dispatch table for this tag is non-null.
  const armStmts = [];  // [{ regionId, body }]
  for (let i = 0; i < tryCtx.regions.length; i++) {
    const entry = findDispatchEntry(i, tag, tryCtx.regions);
    if (!entry) continue;
    const bodyStmts = [];
    for (let j = 0; j < tempBindings.length && j < entry.userBindingVars.length; j++) {
      const userVar = entry.userBindingVars[j];
      const tmpVar = tempBindings[j];
      const lhs = new AST.EIdent(loc, userVar.type, userVar);
      const rhs = new AST.EIdent(loc, tmpVar.type, tmpVar);
      bodyStmts.push(new AST.SExpr(loc,
        new AST.EBinary(loc, userVar.type, "ASSIGN", lhs, rhs)));
    }
    bodyStmts.push(setState(entry.entrySegId));
    armStmts.push({ regionId: i, body: new AST.SCompound(loc, bodyStmts) });
  }

  // Build the if/else chain: each arm checks __irreducible_handler == R.
  // Final else: rethrow tag(tempBindings...).
  const rethrowArgs = tempBindings.map(d => new AST.EIdent(loc, d.type, d));
  let chain = new AST.SThrow(loc, tag, rethrowArgs);
  for (let i = armStmts.length - 1; i >= 0; i--) {
    const arm = armStmts[i];
    const cond = new AST.EBinary(loc, Types.TINT, "EQ",
      new AST.EIdent(loc, Types.TINT, handlerVar),
      new AST.EInt(loc, Types.TINT, BigInt(arm.regionId)));
    chain = new AST.SIf(loc, cond, arm.body, chain);
  }

  return {
    tag,
    bindings: tempBindingNames,
    bindingVars: tempBindings,
    // Codegen lowers this clause as catch_all_ref (capturing the
    // in-flight exception as an exnref) so the SThrow(null) rethrow in
    // the else arm can throw_ref it.
    catchAllRethrow: tag === null,
    body: new AST.SCompound(loc, [chain]),
  };
}

// ----- Wrapper synthesis -----
//
// Build the output function body:
//
//   {
//     <hoisted decls>
//     int __state = 0;
//     while (1) {
//       switch (__state) {
//         case 0: { ...seg0 stmts... ; <terminator stmts> ; continue/break; }
//         ...
//       }
//       break;  // unreachable, but keeps the wasm validator happy if any
//               // case body fell through without an explicit transfer
//     }
//   }
//
// Terminator translations:
//   fallthrough(n) → __state = n; continue;
//   goto(n)        → __state = n; continue;
//   branch(c,t,e)  → __state = (c) ? t : e; continue;
//   switch(...)    → switch(scrut) { case v: __state=t; ...; default: __state=d; }
//                     continue;
//   return(e)      → return e;
//   halt()         → break;   /* exits the while(1) */
function synthesizeWrapper(funcDef, hoistedDecls, segments, tryCtx) {
  const loc = funcDef.loc;
  const stateVar = new AST.DVar(loc, "__irreducible_state",
    Types.TINT, Types.StorageClass.AUTO, null);
  stateVar.definition = stateVar;  // local definition (codegen checks this)
  // Runtime variable holding the innermost active try-region id for the
  // currently-executing segment. Stamped at the top of each case body
  // from the segment's static handler-id; read by the physical catch's
  // dispatcher to decide which user catch (if any) handles the throw.
  // Only allocated when the function has at least one try-region.
  const haveRegions = tryCtx && tryCtx.regions.length > 0;
  let handlerVar = null;
  if (haveRegions) {
    handlerVar = new AST.DVar(loc, "__irreducible_handler",
      Types.TINT, Types.StorageClass.AUTO, null);
    handlerVar.definition = handlerVar;
  }
  const retType = funcDef.type.getReturnType();
  const isVoid = retType === Types.TVOID;

  function intLit(n) { return new AST.EInt(loc, Types.TINT, BigInt(n)); }
  // For "halt" terminators (function fall-through or unreachable
  // continuation after a goto), produce a return that satisfies the
  // function's signature. Falling off the end of a non-void function is
  // UB in C; we conservatively return a zero of the appropriate type.
  function haltReturn() {
    if (isVoid) return new AST.SReturn(loc, null);
    let zero;
    if (retType.isInteger()) {
      zero = new AST.EInt(loc, retType, 0n);
    } else if (retType.isFloatingPoint()) {
      zero = new AST.EFloat(loc, retType, 0);
    } else if (retType.isPointer()) {
      // null pointer: int 0 cast to the pointer type. Use a 0-int and
      // let the existing cast machinery handle conversion if needed.
      zero = new AST.EInt(loc, Types.TINT, 0n);
    } else {
      // Aggregate / struct / ref return — too complex to fabricate; emit
      // a bare `return;` and accept the UB. The codegen may diagnose.
      zero = null;
    }
    return new AST.SReturn(loc, zero);
  }
  function stateRef() { return new AST.EIdent(loc, Types.TINT, stateVar); }
  function setState(n) {
    return new AST.SExpr(loc,
      new AST.EBinary(loc, Types.TINT, "ASSIGN", stateRef(), intLit(n)));
  }
  // We use SBreak inside the switch+while envelope to mean "next iteration".
  // The desugaring is: each case body ends with SBreak (exits the switch);
  // the while loop body then loops back. But that's only correct if the
  // while body is JUST the switch. We wrap accordingly.
  const continueWhile = () => new AST.SBreak(loc);  // breaks inner switch
  const breakWhile = () => {
    // Mark the outer while with a label-driven exit. Since we can't goto
    // out of nested structures portably in our AST without labels, we use
    // a sentinel: set state to a "done" id and break the switch — the
    // while loop checks state and exits.
    // Simpler: use SReturn(null) only if return type is void; otherwise
    // we can't fabricate a value. For now, halt cases are unreachable in
    // well-formed input — emit `break` and let the while loop iterate
    // back into the switch with whatever state is set. The default switch
    // case handles unexpected state by falling through to "break loop".
    return new AST.SBreak(loc);
  };

  // Translate one terminator to a list of statements appended after the
  // segment's body stmts. The last statement should transfer control.
  function termToStmts(term) {
    if (term === null) return [];
    if (term.kind === "fallthrough" || term.kind === "goto") {
      return [setState(term.kind === "goto" ? term.targetId : term.nextId),
              continueWhile()];
    }
    if (term.kind === "branch") {
      // __state = cond ? thenId : elseId
      const tern = new AST.ETernary(loc, Types.TINT,
        term.cond, intLit(term.thenId), intLit(term.elseId));
      const assign = new AST.SExpr(loc,
        new AST.EBinary(loc, Types.TINT, "ASSIGN", stateRef(), tern));
      return [assign, continueWhile()];
    }
    if (term.kind === "switch") {
      // Emit a structured switch into __state, then break to outer loop.
      const bodyStmts = [];
      for (const c of term.cases) {
        bodyStmts.push(new AST.SCase(loc, c.value, c.value, false));
        bodyStmts.push(setState(c.target));
        bodyStmts.push(new AST.SBreak(loc));
      }
      bodyStmts.push(new AST.SCase(loc, 0n, 0n, true));
      bodyStmts.push(setState(term.defaultTarget));
      bodyStmts.push(new AST.SBreak(loc));
      const switchBody = new AST.SCompound(loc, bodyStmts);
      const inner = new AST.SSwitch(loc, term.scrutinee, switchBody);
      return [inner, continueWhile()];
    }
    if (term.kind === "return") {
      return [new AST.SReturn(loc, term.expr)];
    }
    if (term.kind === "throw") {
      // The throw itself transfers control to the catch on the physical
      // try/catch wrapping the whole switch; no continuation needed.
      return [term.sthrow];
    }
    if (term.kind === "halt") {
      // Either function fall-through (reached end of source body without
      // an explicit return) or an unreachable continuation after a goto.
      // Either way, emit a return — for void, bare `return;`; for non-
      // void, a zero of the return type. The unreachable case never
      // actually executes; the function-fall-through case is well-defined
      // for void and UB-but-safe for non-void.
      return [haltReturn()];
    }
    throw new Error(`unknown terminator kind: ${term.kind}`);
  }

  // Helpers for the handler-stamp prefix at each case body.
  function handlerRef() { return new AST.EIdent(loc, Types.TINT, handlerVar); }
  function setHandler(regionId) {
    return new AST.SExpr(loc,
      new AST.EBinary(loc, Types.TINT, "ASSIGN",
        handlerRef(), intLit(regionId)));
  }

  // Build the inner switch: emit one SCase per segment id at the head
  // of that segment's body. Segments are sorted by id; per-segment bodies
  // appear in id order in the switch body. When the function has any
  // try-region, each case body's first action is writing the segment's
  // static handler-region id to __irreducible_handler.
  const switchBodyStmts = [];
  const ordered = [...segments].sort((a, b) => a.id - b.id);
  for (const seg of ordered) {
    switchBodyStmts.push(new AST.SCase(loc, BigInt(seg.id), BigInt(seg.id), false));
    if (haveRegions) {
      const stamp = tryCtx.segmentHandlerIds.get(seg.id);
      switchBodyStmts.push(setHandler(stamp == null ? -1 : stamp));
    }
    switchBodyStmts.push(...seg.stmts);
    switchBodyStmts.push(...termToStmts(seg.term));
  }
  // Default: break out (unexpected state).
  switchBodyStmts.push(new AST.SCase(loc, 0n, 0n, true));
  switchBodyStmts.push(new AST.SBreak(loc));

  const switchStmt = new AST.SSwitch(loc, stateRef(),
    new AST.SCompound(loc, switchBodyStmts));

  // If the function has try-regions, wrap the switch in a physical
  // try/catch — one catch clause per distinct tag. Each clause's body
  // is a switch(__irreducible_handler) that, for each region that
  // (transitively) handles this tag, dispatches to the catch entry
  // segment, copying the thrown args into the user catch's hoisted
  // binding vars. If no region matches, rethrow with the same tag/args.
  let switchOrTry = switchStmt;
  if (haveRegions) {
    const tagsList = [...tryCtx.tags.values()];
    const physicalCatches = tagsList.map(tag => makeDispatcherCatch(tag, tryCtx, loc, handlerVar, setState));
    // Catch-all last: try_table matches clauses in order, so tagged
    // exceptions dispatch through their own clause (which itself routes
    // to a region's catch-all when that's the innermost handler) and
    // only unknown tags — thrown by callees — reach the catch_all_ref.
    if (tryCtx.hasCatchAll) {
      physicalCatches.push(makeDispatcherCatch(null, tryCtx, loc, handlerVar, setState));
    }
    switchOrTry = new AST.STryCatch(loc, switchStmt, physicalCatches);
  }

  // The while loop wraps just the switch (or the try/catch around it).
  const whileBody = new AST.SCompound(loc, [switchOrTry]);
  const whileCond = new AST.EInt(loc, Types.TINT, 1n);
  const whileStmt = new AST.SWhile(loc, whileCond, whileBody);

  // Build the new function body: state-var decl + while(1) { switch }.
  // The handler-region var is declared alongside state when present;
  // initialization happens at each case body's stamp, but we still set
  // a sentinel here so the validator sees a definite assignment.
  const fnBodyStmts = [];
  if (hoistedDecls.length > 0) fnBodyStmts.push(new AST.SDecl(loc, hoistedDecls));
  fnBodyStmts.push(new AST.SDecl(loc, [stateVar]));
  fnBodyStmts.push(new AST.SExpr(loc,
    new AST.EBinary(loc, Types.TINT, "ASSIGN", stateRef(), intLit(0))));
  if (handlerVar) {
    fnBodyStmts.push(new AST.SDecl(loc, [handlerVar]));
    fnBodyStmts.push(new AST.SExpr(loc,
      new AST.EBinary(loc, Types.TINT, "ASSIGN", handlerRef(), intLit(-1))));
  }
  fnBodyStmts.push(whileStmt);
  return new AST.SCompound(loc, fnBodyStmts);
}

function lower(funcDef, dumpSegments) {
  // tryCtx threads the try-region graph through segmentization and
  // wrapper synthesis. Every STryCatch in the function body becomes a
  // region; the segmentizer maintains a region stack while visiting,
  // and stamps each opened segment with the innermost region's id
  // (-1 if unprotected). The wrapper writes that id into a runtime
  // `current_handler` variable at the top of each case, so when an
  // exception fires the physical catch can walk the region graph and
  // dispatch to the right handler segment (or rethrow if no ancestor
  // catches the tag).
  const tryCtx = {
    regions: [],          // [{ id, parentId, joinSegId,
                          //    catches: [{ tag, userBindingVars, entrySegId }] }]
    regionStack: [],      // segmentizer-time stack of active region ids
    segmentHandlerIds: new Map(),  // segmentId → innermost regionId (-1 if none)
    tags: new Map(),      // distinct tags appearing in any catch (by name)
    hasCatchAll: false,   // any tag-less (catch-all) clause in the function
  };

  const { decls, rewrittenBody } = hoistDeclarations(funcDef);
  const segments = buildSegments(rewrittenBody, tryCtx);
  if (dumpSegments) {
    for (const s of segments) {
      const t = s.term;
      let td = '?';
      if (t) {
        if (t.kind === 'fallthrough') td = 'fall→' + t.nextId;
        else if (t.kind === 'goto') td = 'goto→' + t.targetId;
        else if (t.kind === 'branch') td = 'branch→' + t.thenId + '/' + t.elseId;
        else if (t.kind === 'switch') td = 'sw[' + t.cases.map(c => c.value+'→'+c.target).join(',') + '] def→' + t.defaultTarget;
        else if (t.kind === 'throw') td = 'throw';
        else td = t.kind;
      }
      dumpSegments(`  seg ${s.id}: ${s.stmts.length} stmts → ${td}\n`);
    }
  }

  const newBody = synthesizeWrapper(funcDef, decls, segments, tryCtx);
  funcDef.body = newBody;
}

// ----- JSON export (for the disasm tool's CFG view) -----
//
// Produce a plain-old-data object describing one function's segments and
// their terminators, with short C-like snippets for each statement and
// expression. This is purely for visualization — the snippet text is a
// best-effort rendering, not a faithful pretty-print.
//
// IMPORTANT: this destructively rewrites the funcDef AST (DVars get
// alpha-renamed, initExprs stripped) the same way `lower()` does, since
// it reuses hoistDeclarations + buildSegments. Don't call this on a
// function you intend to compile afterward.
function fmtType(t) {
  if (!t) return '?';
  if (t.name) return t.name;
  if (typeof t.toString === 'function') {
    const s = t.toString();
    return s.length > 32 ? s.slice(0, 29) + '…' : s;
  }
  return '?';
}

const BINOP_TEXT = {
  ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%',
  EQ: '==', NE: '!=', LT: '<', LE: '<=', GT: '>', GE: '>=',
  LAND: '&&', LOR: '||',
  BAND: '&', BOR: '|', BXOR: '^', SHL: '<<', SHR: '>>',
  ASSIGN: '=',
  ADD_ASSIGN: '+=', SUB_ASSIGN: '-=', MUL_ASSIGN: '*=',
  DIV_ASSIGN: '/=', MOD_ASSIGN: '%=',
  BAND_ASSIGN: '&=', BOR_ASSIGN: '|=', BXOR_ASSIGN: '^=',
  SHL_ASSIGN: '<<=', SHR_ASSIGN: '>>=',
};
const UNOP_TEXT = {
  OP_NEG: '-', OP_POS: '+', OP_LNOT: '!', OP_BNOT: '~',
  OP_ADDR: '&', OP_DEREF: '*',
  OP_PRE_INC: '++', OP_PRE_DEC: '--',
  OP_POST_INC: '++', OP_POST_DEC: '--',
};

function fmtExpr(e) {
  if (!e) return '';
  if (e instanceof AST.EImplicitCast) return fmtExpr(e.expr);
  if (e instanceof AST.EDecay) return fmtExpr(e.operand);
  if (e instanceof AST.EInt) {
    const tn = e.type && e.type.name;
    if (tn === 'long long' || tn === 'unsigned long long') return String(e.value) + 'LL';
    return String(e.value);
  }
  if (e instanceof AST.EFloat) return String(e.value);
  if (e instanceof AST.EString) {
    const s = String(e.value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return '"' + (s.length > 40 ? s.slice(0, 37) + '…' : s) + '"';
  }
  if (e instanceof AST.EIdent) {
    return (e.decl && e.decl.name) || '?';
  }
  if (e instanceof AST.EBinary) {
    const op = BINOP_TEXT[e.op] || e.op;
    return fmtExpr(e.left) + ' ' + op + ' ' + fmtExpr(e.right);
  }
  if (e instanceof AST.EUnary) {
    const op = UNOP_TEXT[e.op] || e.op;
    if (e.op === 'OP_POST_INC' || e.op === 'OP_POST_DEC') return fmtExpr(e.operand) + op;
    return op + fmtExpr(e.operand);
  }
  if (e instanceof AST.ETernary) {
    return fmtExpr(e.condition) + ' ? ' + fmtExpr(e.thenExpr) + ' : ' + fmtExpr(e.elseExpr);
  }
  if (e instanceof AST.ECall) {
    const args = (e.arguments || []).map(fmtExpr).join(', ');
    return fmtExpr(e.callee) + '(' + args + ')';
  }
  if (e instanceof AST.ESubscript) return fmtExpr(e.array) + '[' + fmtExpr(e.index) + ']';
  if (e instanceof AST.EMember) {
    return fmtExpr(e.base) + '.' + (e.memberDecl && e.memberDecl.name || '?');
  }
  if (e instanceof AST.EArrow) {
    return fmtExpr(e.base) + '->' + (e.memberDecl && e.memberDecl.name || '?');
  }
  if (e instanceof AST.ECast) return '(' + fmtType(e.targetType) + ')' + fmtExpr(e.expr);
  if (e instanceof AST.EComma) {
    return (e.expressions || []).map(fmtExpr).join(', ');
  }
  if (e instanceof AST.ESizeofExpr) return 'sizeof(' + fmtExpr(e.expr) + ')';
  if (e instanceof AST.ESizeofType) return 'sizeof(' + fmtType(e.operandType) + ')';
  // Fallback for less-common nodes
  return '<' + e.constructor.name + '>';
}

function fmtStmt(s) {
  if (!s) return '';
  if (s instanceof AST.SExpr) return fmtExpr(s.expr) + ';';
  if (s instanceof AST.SEmpty) return ';';
  if (s instanceof AST.SDecl) {
    const parts = [];
    for (const d of s.declarations) {
      const tname = fmtType(d.type);
      if (d.storageClass === Types.StorageClass.STATIC) {
        parts.push('static ' + tname + ' ' + d.name);
      } else if (d.storageClass === Types.StorageClass.EXTERN) {
        parts.push('extern ' + tname + ' ' + d.name);
      } else {
        parts.push(tname + ' ' + d.name);
      }
    }
    return parts.join('; ') + ';';
  }
  return '<' + s.constructor.name + '>';
}

function locOf(node) {
  if (!node || !node.loc) return null;
  return { file: node.loc.filename || '?', line: node.loc.line || 0 };
}

function funcToCfgJson(funcDef) {
  const { decls, rewrittenBody } = hoistDeclarations(funcDef);
  const segments = buildSegments(rewrittenBody);

  const segJson = segments.map(seg => {
    const stmts = seg.stmts.map(st => ({
      text: fmtStmt(st),
      loc: locOf(st),
    }));
    const t = seg.term;
    let term;
    if (!t) {
      term = { kind: 'none' };
    } else if (t.kind === 'fallthrough') {
      term = { kind: 'fallthrough', next: t.nextId };
    } else if (t.kind === 'goto') {
      term = { kind: 'goto', target: t.targetId };
    } else if (t.kind === 'branch') {
      term = { kind: 'branch', cond: fmtExpr(t.cond), thenId: t.thenId, elseId: t.elseId };
    } else if (t.kind === 'switch') {
      term = {
        kind: 'switch',
        scrutinee: fmtExpr(t.scrutinee),
        cases: t.cases.map(c => ({ value: String(c.value), target: c.target })),
        defaultTarget: t.defaultTarget,
      };
    } else if (t.kind === 'return') {
      term = { kind: 'return', expr: t.expr ? fmtExpr(t.expr) : null };
    } else {
      term = { kind: t.kind };
    }
    return { id: seg.id, stmts, terminator: term };
  });

  const params = (funcDef.parameters || []).map(p => ({
    name: p.name,
    type: fmtType(p.type),
  }));
  const hoistedDecls = decls.map(d => ({
    name: d.name,
    type: fmtType(d.type),
  }));

  return {
    name: funcDef.name,
    loc: locOf(funcDef),
    params,
    hoistedDecls,
    segments: segJson,
  };
}

return { lower, hoistDeclarations, buildSegments, funcToCfgJson };

})();

// LEB128 encoding utilities (shared between Parser and Wasm)
function lebU(out, value) {
  do {
    let byte = value & 0x7F;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    out.push(byte);
  } while (value !== 0);
}

function lebSize(value) {
  var n = 0;
  do { value >>>= 7; n++; } while (value !== 0);
  return n;
}

function lebI(out, value) {
  value = value | 0; // ensure i32 range
  let more = true;
  while (more) {
    let byte = value & 0x7F;
    value >>= 7; // arithmetic shift
    if ((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte & 0xFF);
  }
}

function lebI64(out, value) {
  // value is a BigInt for i64 - ensure signed 64-bit range
  if (value > 0x7FFFFFFFFFFFFFFFn || value < -0x8000000000000000n) {
    value = BigInt.asIntN(64, value);
  }
  let more = true;
  while (more) {
    let byte = Number(value & 0x7Fn);
    value >>= 7n; // arithmetic shift
    if ((value === 0n && (byte & 0x40) === 0) || (value === -1n && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte & 0xFF);
  }
}

// C11 6.7.9p14: a string literal may (brace-optionally) initialize an array
// whose ELEMENT is a matching-width character/integer type — and nothing
// else. Every `{ "str" }` byte-copy shortcut must gate on this, or an array
// of char* with a single string-literal initializer gets the string's BYTES
// written into the pointer slot (todos/0176: `const char *r[] = {"cmd"}`
// yielded r[0] == "cmd\0" read as an address). Top-level on purpose: both
// the Parser (compound-literal paths) and the codegen (static/frame/file-
// scope init paths) gate on it.
function stringLiteralCanInitArray(arrayType, strExpr) {
  if (!arrayType.isArray()) return false;
  const abt = arrayType.baseType.removeQualifiers();
  if (abt.isAggregate() || abt.isPointer() || abt.isArray()) return false;
  const st = strExpr && strExpr.type && strExpr.type.isArray()
    ? strExpr.type.baseType.removeQualifiers() : null;
  return !st || abt.size === st.size;
}

// ====================
// Parser
// ====================

const Parser = (() => {

class DumpContext {
  constructor() { this.idMap = new Map(); this.nextId = 1; }
  formatId(obj) {
    if (!obj) return "$0";
    if (this.idMap.has(obj)) return "$" + this.idMap.get(obj);
    const id = this.nextId++;
    this.idMap.set(obj, id);
    return "$" + id;
  }
  formatDeclId(decl) { return this.formatId(decl); }
  formatDeclIdOfDefinition(decl) {
    if (decl instanceof AST.DFunc || decl instanceof AST.DVar) {
      return this.formatId(decl.definition);
    }
    return this.formatId(decl);
  }
}

function ind(indent) { return "\n" + "  ".repeat(indent); }

// Format float matching C printf %f (6 decimal places, no scientific notation)
// Format a double exactly like C's printf("%f") — 6 decimal places, full precision.
// Extracts IEEE 754 bits and computes the exact decimal expansion via BigInt.
function formatFloatForDump(v) {
  if (!isFinite(v)) return v.toString();
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = v;
  const dv = new DataView(buf);
  const bits = dv.getBigUint64(0, true); // little-endian
  const sign = bits >> 63n;
  const rawExp = Number((bits >> 52n) & 0x7FFn);
  const frac = bits & 0xFFFFFFFFFFFFFn;

  let mantissa, exp;
  if (rawExp === 0) {
    // subnormal: mantissa = frac, exponent = 1 - 1023 - 52 = -1074
    mantissa = frac;
    exp = -1074;
  } else {
    // normal: mantissa = (1 << 52) | frac, exponent = rawExp - 1023 - 52
    mantissa = (1n << 52n) | frac;
    exp = rawExp - 1023 - 52;
  }

  // exact value = mantissa * 2^exp
  // If exp >= 0: integer = mantissa << exp, fracDigits = "000000"
  // If exp < 0:  multiply by 5^(-exp) to convert denominator from 2^(-exp) to 10^(-exp)
  //              then split at -exp digits from the right
  let intPart, fracStr;
  if (exp >= 0) {
    intPart = (mantissa << BigInt(exp)).toString();
    fracStr = "000000";
  } else {
    const negExp = -exp;
    const full = mantissa * 5n ** BigInt(negExp); // = mantissa * 5^negExp
    const digits = full.toString();
    if (digits.length > negExp) {
      intPart = digits.substring(0, digits.length - negExp);
      fracStr = digits.substring(digits.length - negExp);
    } else {
      intPart = "0";
      fracStr = "0".repeat(negExp - digits.length) + digits;
    }
    // Round to 6 decimal places
    if (fracStr.length > 6) {
      const roundUp = fracStr.charCodeAt(6) >= 53; // '5'
      fracStr = fracStr.substring(0, 6);
      if (roundUp) {
        const rounded = (BigInt(intPart + fracStr) + 1n).toString();
        intPart = rounded.substring(0, rounded.length - 6);
        fracStr = rounded.substring(rounded.length - 6);
        if (!intPart) intPart = "0";
      }
    } else {
      fracStr = (fracStr + "000000").substring(0, 6);
    }
  }
  const result = intPart + "." + fracStr;
  return sign ? "-" + result : result;
}

function dumpExpr(expr, ctx, indent) {
  let ret = ind(indent);
  ret += "Expr: Type=" + expr.type.toString() + " ";
  switch (expr.constructor) {
    case AST.EInt:
      ret += "INT " + expr.value;
      break;
    case AST.EFloat:
      ret += "FLOAT " + formatFloatForDump(expr.value);
      break;
    case AST.EString:
      ret += "STRING len=" + expr.value.length;
      break;
    case AST.EIdent: {
      ret += "IDENT " + expr.name;
      if (expr.decl) {
        const id = ctx.formatDeclId(expr.decl);
        const defnId = ctx.formatDeclIdOfDefinition(expr.decl);
        if (id === defnId) ret += " (decl=" + id + ")";
        else ret += " (decl=" + id + ", defn=" + defnId + ")";
      }
      break;
    }
    case AST.EBinary:
      ret += "BINARY " + Types.BopStr[expr.op];
      ret += dumpExpr(expr.left, ctx, indent + 1);
      ret += dumpExpr(expr.right, ctx, indent + 1);
      break;
    case AST.EUnary:
      ret += "UNARY " + Types.UopStr[expr.op];
      ret += dumpExpr(expr.operand, ctx, indent + 1);
      break;
    case AST.ETernary:
      ret += "TERNARY";
      ret += dumpExpr(expr.condition, ctx, indent + 1);
      ret += dumpExpr(expr.thenExpr, ctx, indent + 1);
      ret += dumpExpr(expr.elseExpr, ctx, indent + 1);
      break;
    case AST.ECall:
      ret += "CALL " + expr.arguments.length + " args";
      ret += dumpExpr(expr.callee, ctx, indent + 1);
      for (const arg of expr.arguments) ret += dumpExpr(arg, ctx, indent + 1);
      break;
    case AST.ESubscript:
      ret += "SUBSCRIPT";
      ret += dumpExpr(expr.array, ctx, indent + 1);
      ret += dumpExpr(expr.index, ctx, indent + 1);
      break;
    case AST.EMember:
      ret += "MEMBER ." + (expr.memberDecl.name ?? "(anon)");
      ret += dumpExpr(expr.base, ctx, indent + 1);
      break;
    case AST.EArrow:
      ret += "ARROW ->" + (expr.memberDecl.name ?? "(anon)");
      ret += dumpExpr(expr.base, ctx, indent + 1);
      break;
    case AST.ECast:
      ret += "CAST " + expr.targetType.toString();
      ret += dumpExpr(expr.expr, ctx, indent + 1);
      break;
    case AST.EImplicitCast:
      ret += "IMPLICIT_CAST " + expr.type.toString();
      ret += dumpExpr(expr.expr, ctx, indent + 1);
      break;
    case AST.EDecay:
      ret += "DECAY " + expr.type.toString();
      ret += dumpExpr(expr.operand, ctx, indent + 1);
      break;
    case AST.ESizeofExpr:
      ret += "SIZEOF_EXPR";
      ret += dumpExpr(expr.expr, ctx, indent + 1);
      break;
    case AST.ESizeofType:
      ret += "SIZEOF_TYPE " + expr.operandType.toString();
      break;
    case AST.EAlignofExpr:
      ret += "ALIGNOF_EXPR";
      ret += dumpExpr(expr.expr, ctx, indent + 1);
      break;
    case AST.EAlignofType:
      ret += "ALIGNOF_TYPE " + expr.operandType.toString();
      break;
    case AST.EComma:
      ret += "COMMA " + expr.expressions.length;
      for (const e of expr.expressions) ret += dumpExpr(e, ctx, indent + 1);
      break;
    case AST.EInitList:
      ret += "INIT_LIST " + expr.elements.length;
      for (const e of expr.elements) ret += dumpExpr(e, ctx, indent + 1);
      break;
    case AST.EIntrinsic:
      ret += "INTRINSIC " + expr.intrinsicKind;
      for (const arg of expr.args) ret += dumpExpr(arg, ctx, indent + 1);
      break;
    case AST.EWasm:
      ret += "WASM " + expr.bytes.length + " bytes " + expr.args.length + " args";
      for (const arg of expr.args) ret += dumpExpr(arg, ctx, indent + 1);
      break;
    case AST.ECompoundLiteral:
      ret += "COMPOUND_LITERAL";
      ret += dumpExpr(expr.initList, ctx, indent + 1);
      break;
  }
  return ret;
}

function dumpStmt(stmt, ctx, indent) {
  let ret = ind(indent);
  ret += "Stmt " + stmt.constructor.name + ":";
  switch (stmt.constructor) {
    case AST.SExpr:
      ret += dumpExpr(stmt.expr, ctx, indent + 1);
      break;
    case AST.SReturn:
      if (stmt.expr) ret += dumpExpr(stmt.expr, ctx, indent + 1);
      else ret += " (no expression)";
      break;
    case AST.SDecl:
      for (const d of stmt.declarations) ret += dumpDecl(d, ctx, indent + 1);
      break;
    case AST.SCompound:
      ret += " " + stmt.statements.length + " statements";
      for (const s of stmt.statements) ret += dumpStmt(s, ctx, indent + 1);
      break;
    case AST.SGoto:
      ret += " " + stmt.label;
      break;
    case AST.SLabel:
      ret += " " + stmt.name;
      break;
    case AST.SIf:
      ret += dumpExpr(stmt.condition, ctx, indent + 1);
      ret += dumpStmt(stmt.thenBranch, ctx, indent + 1);
      if (stmt.elseBranch) ret += dumpStmt(stmt.elseBranch, ctx, indent + 1);
      break;
    case AST.SWhile:
      ret += dumpExpr(stmt.condition, ctx, indent + 1);
      ret += dumpStmt(stmt.body, ctx, indent + 1);
      break;
    case AST.SDoWhile:
      ret += dumpStmt(stmt.body, ctx, indent + 1);
      ret += dumpExpr(stmt.condition, ctx, indent + 1);
      break;
    case AST.SFor:
      if (stmt.init) ret += dumpStmt(stmt.init, ctx, indent + 1);
      else ret += ind(indent + 1) + "(no init)";
      if (stmt.condition) ret += dumpExpr(stmt.condition, ctx, indent + 1);
      else ret += ind(indent + 1) + "(no condition)";
      if (stmt.increment) ret += dumpExpr(stmt.increment, ctx, indent + 1);
      else ret += ind(indent + 1) + "(no increment)";
      ret += dumpStmt(stmt.body, ctx, indent + 1);
      break;
    case AST.SSwitch: {
      ret += dumpExpr(stmt.expr, ctx, indent + 1);
      const cases = [...stmt.body.caseBag];
      ret += ind(indent + 1) + cases.length + " cases";
      for (const c of cases) {
        ret += ind(indent + 2);
        if (c.isDefault) ret += "default:";
        else if (c.lo === c.hi) ret += "case " + c.lo + ":";
        else ret += "case " + c.lo + " ... " + c.hi + ":";
      }
      ret += dumpStmt(stmt.body, ctx, indent + 1);
      break;
    }
    case AST.SCase:
      ret += " " + (stmt.isDefault ? "default" :
        (stmt.lo === stmt.hi ? "case " + stmt.lo : "case " + stmt.lo + " ... " + stmt.hi));
      break;
    case AST.STryCatch:
      ret += dumpStmt(stmt.tryBody, ctx, indent + 1);
      for (const cc of stmt.catches) {
        ret += ind(indent + 1);
        if (cc.tag) ret += "catch " + cc.tag.name;
        else ret += "catch_all";
        ret += dumpStmt(cc.body, ctx, indent + 2);
      }
      break;
    case AST.SThrow:
      ret += " " + stmt.tag.name;
      for (const arg of stmt.args) ret += dumpExpr(arg, ctx, indent + 1);
      break;
    case AST.SEmpty:
    case AST.SBreak:
    case AST.SContinue:
      break;
  }
  return ret;
}

function dumpDecl(decl, ctx, indent) {
  let ret = ind(indent);
  ret += "Decl " + decl.constructor.name + " " + ctx.formatDeclId(decl);
  const defnStr = ctx.formatDeclIdOfDefinition(decl);
  if (defnStr !== ctx.formatDeclId(decl)) {
    ret += " (def=" + defnStr + ")";
  }
  ret += ":";
  if (decl instanceof AST.DVar) {
    ret += " " + decl.name + " " + decl.type.toString();
    if (decl.storageClass !== Types.StorageClass.NONE) ret += " (" + decl.storageClass + ")";
    if (decl.initExpr) ret += dumpExpr(decl.initExpr, ctx, indent + 1);
  } else if (decl instanceof AST.DFunc) {
    ret += " " + decl.name + " " + decl.type.toString();
    if (decl.storageClass !== Types.StorageClass.NONE) ret += " (" + decl.storageClass + ")";
    ret += ind(indent + 1) + decl.parameters.length + " parameters";
    for (const p of decl.parameters) ret += dumpDecl(p, ctx, indent + 2);
    if (decl.body) ret += dumpStmt(decl.body, ctx, indent + 1);
  }
  return ret;
}

function dumpTUnit(unit, ctx, depth) {
  let ret = ind(depth) + "Translation Unit " + unit.filename;
  const show = (d) => { ret += dumpDecl(d, ctx, depth + 1); };
  for (const f of unit.importedFunctions) show(f);
  for (const f of unit.definedFunctions) show(f);
  for (const f of unit.staticFunctions) show(f);
  for (const f of unit.declaredFunctions) show(f);
  for (const f of unit.localDeclaredFunctions) show(f);
  for (const v of unit.definedVariables) show(v);
  for (const v of unit.externVariables) show(v);
  for (const v of unit.localExternVariables) show(v);
  return ret;
}

function dumpAst(units) {
  const ctx = new DumpContext();
  let out = "";
  for (const unit of units) {
    out += dumpTUnit(unit, ctx, 0) + "\n";
  }
  return out;
}

// ====================
// C Pretty-Printer — AST→C source
// ====================
//
// Emits re-compilable C code from the AST. The output parses to the same
// AST (modulo source locations and cosmetic whitespace). EImplicitCast and
// EDecay nodes are transparent — they're re-inserted deterministically by
// the parser, so we skip them here.

function printC(units, options) {
  const showStdlib = !!(options && options.showStdlib);
  const out = [];
  const emittedTags = new Set();
  let curLine = 1;
  let curLoc = null;
  const lineMap = [];

  function w(s) {
    out.push(s);
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\n') {
        if (curLoc && curLoc.filename !== '<generated>') {
          if (!lineMap[curLine]) lineMap[curLine] = { file: curLoc.filename, line: curLoc.line };
        }
        curLine++;
      }
    }
  }

  function setLoc(loc) { if (loc) curLoc = loc; }

  // --- Type spelling (C's inside-out declaration syntax) ---
  // spellType(type, declarator) returns a string like "int (*x)[10]".
  // `declarator` is the "inner" part built outward from the variable name.
  function spellType(type, declarator) {
    type = type.removeQualifiers ? type : type;
    const q = qualPrefix(type);
    const uq = type.removeQualifiers();
    if (uq instanceof Types.PointerType) {
      let inner = "*" + q + declarator;
      const base = uq.baseType.removeQualifiers();
      if (base instanceof Types.ArrayType || base.isFunction()) inner = "(" + inner + ")";
      return spellType(uq.baseType, inner);
    }
    if (uq instanceof Types.ArrayType) {
      const sz = uq.arraySize >= 0 ? String(uq.arraySize) : "";
      return spellType(uq.baseType, declarator + "[" + sz + "]");
    }
    if (uq.isFunction()) {
      const params = [];
      for (let i = 0; i < uq.paramTypes.length; i++) {
        params.push(spellType(uq.paramTypes[i], ""));
      }
      if (uq.isVarArg) params.push("...");
      else if (params.length === 0 && !uq.hasUnspecifiedParams) params.push("void");
      return spellType(uq.returnType, declarator + "(" + params.join(", ") + ")");
    }
    return q + spellBaseType(uq) + (declarator ? " " + declarator : "");
  }

  function qualPrefix(type) {
    let q = "";
    if (type.isConst) q += "const ";
    if (type.isVolatile) q += "volatile ";
    return q;
  }

  function spellBaseType(type) {
    const uq = type.removeQualifiers();
    if (uq.isTag && uq.isTag()) {
      return uq.tagKind + " " + uq.tagName;
    }
    if (uq instanceof Types.GCStructRefType) return "__struct " + uq.tagName + " *";
    if (uq instanceof Types.GCStructHeapType) return "__struct " + uq.tagName;
    if (uq instanceof Types.GCArrayType) return "__array(" + spellBaseType(uq.baseType) + ")";
    if (uq instanceof Types.ExternRefType) return "__externref";
    if (uq instanceof Types.RefExternType) return "__refextern";
    if (uq instanceof Types.EqRefType) return "__eqref";
    if (uq === Types.TVOID) return "void";
    if (uq === Types.TBOOL) return "_Bool";
    if (uq.name) return uq.name;
    return uq.toString();
  }

  // Spell a declaration with a name: "int x", "void (*fp)(int)"
  function spellDecl(type, name) {
    return spellType(type, name);
  }

  // --- Tag (struct/union/enum) definition emission ---
  function emitTagDef(tagDecl, indent) {
    if (!tagDecl || emittedTags.has(tagDecl)) return;
    emittedTags.add(tagDecl);
    const ind = "  ".repeat(indent);
    if (tagDecl.tagKind === "enum") {
      w(ind + tagDecl.tagKind + " " + (tagDecl.name || "") + " {\n");
      for (let i = 0; i < tagDecl.members.length; i++) {
        const m = tagDecl.members[i];
        w(ind + "  " + m.name + " = " + m.value);
        if (i < tagDecl.members.length - 1) w(",");
        w("\n");
      }
      w(ind + "}");
      return;
    }
    // struct / union
    w(ind + tagDecl.tagKind + " " + (tagDecl.name || ""));
    if (!tagDecl.isComplete) return;
    w(" {\n");
    for (const m of tagDecl.members) {
      if (!m.name && m.type && m.type.isTag && m.type.isTag() && m.type.tagDecl) {
        emitTagDef(m.type.tagDecl, indent + 1);
        w(";\n");
        continue;
      }
      w(ind + "  " + spellDecl(m.type, m.name || ""));
      if (m.bitWidth >= 0) w(" : " + m.bitWidth);
      w(";\n");
    }
    w(ind + "}");
    if (tagDecl.isPacked) w(" __attribute__((packed))");
  }

  // Emit tag definition inline if this type references a tag we haven't
  // emitted yet. Returns the base type string to use.
  function maybeEmitInlineTag(type) {
    const uq = type.removeQualifiers();
    if (uq.isTag && uq.isTag() && uq.tagDecl && uq.tagDecl.isComplete && !emittedTags.has(uq.tagDecl)) {
      return true;
    }
    return false;
  }

  // --- Operator precedence for minimal parenthesization ---
  const PREC = {
    COMMA: 1,
    ASSIGN: 2, ADD_ASSIGN: 2, SUB_ASSIGN: 2, MUL_ASSIGN: 2,
    DIV_ASSIGN: 2, MOD_ASSIGN: 2, BAND_ASSIGN: 2, BOR_ASSIGN: 2,
    BXOR_ASSIGN: 2, SHL_ASSIGN: 2, SHR_ASSIGN: 2,
    TERNARY: 3,
    LOR: 4, LAND: 5, BOR: 6, BXOR: 7, BAND: 8,
    EQ: 9, NE: 9, LT: 10, GT: 10, LE: 10, GE: 10,
    SHL: 11, SHR: 11, ADD: 12, SUB: 12, MUL: 13, DIV: 13, MOD: 13,
    UNARY: 14, POSTFIX: 15, PRIMARY: 16,
  };

  function exprPrec(expr) {
    if (!expr) return PREC.PRIMARY;
    if (expr instanceof AST.EImplicitCast) return exprPrec(expr.expr);
    if (expr instanceof AST.EDecay) return exprPrec(expr.operand);
    if (expr instanceof AST.EBinary) return PREC[expr.op] || PREC.PRIMARY;
    if (expr instanceof AST.EComma) return PREC.COMMA;
    if (expr instanceof AST.ETernary) return PREC.TERNARY;
    if (expr instanceof AST.EUnary) {
      if (expr.op === "OP_POST_INC" || expr.op === "OP_POST_DEC") return PREC.POSTFIX;
      return PREC.UNARY;
    }
    if (expr instanceof AST.ECast) return PREC.UNARY;
    return PREC.PRIMARY;
  }

  function paren(inner, innerPrec, neededPrec) {
    return innerPrec < neededPrec ? "(" + inner + ")" : inner;
  }

  // --- Expression emission ---
  function emitExpr(expr) {
    if (!expr) return "0";
    if (expr instanceof AST.EImplicitCast) return emitExpr(expr.expr);
    if (expr instanceof AST.EDecay) return emitExpr(expr.operand);

    if (expr instanceof AST.EInt) {
      const t = expr.type.removeQualifiers();
      let s = String(expr.value);
      if (expr.value < 0n) s = "(" + s + ")";
      if (t === Types.TUINT || t === Types.TULONG) s += "U";
      else if (t === Types.TLLONG) s += "LL";
      else if (t === Types.TULLONG) s += "ULL";
      else if (t === Types.TLONG) s += "L";
      return s;
    }
    if (expr instanceof AST.EFloat) {
      const t = expr.type.removeQualifiers();
      let s;
      if (!isFinite(expr.value)) {
        if (expr.value === Infinity) s = "(1.0/0.0)";
        else if (expr.value === -Infinity) s = "(-1.0/0.0)";
        else s = "(0.0/0.0)";
      } else {
        s = expr.value.toString();
        if (!s.includes(".") && !s.includes("e") && !s.includes("E")) s += ".0";
      }
      if (t === Types.TFLOAT) s += "f";
      else if (t === Types.TLDOUBLE) s += "L";
      return s;
    }
    if (expr instanceof AST.EString) {
      return emitStringLiteral(expr);
    }
    if (expr instanceof AST.EIdent) {
      return expr.decl.name;
    }
    if (expr instanceof AST.EBinary) {
      const meta = AST.BinOp[expr.op];
      const p = PREC[expr.op] || PREC.PRIMARY;
      const isRightAssoc = meta.isAssign;
      const left = paren(emitExpr(expr.left), exprPrec(expr.left), isRightAssoc ? p + 1 : p);
      const right = paren(emitExpr(expr.right), exprPrec(expr.right), isRightAssoc ? p : p + 1);
      return left + " " + meta.text + " " + right;
    }
    if (expr instanceof AST.EUnary) {
      const meta = AST.UnOp[expr.op];
      if (expr.op === "OP_POST_INC" || expr.op === "OP_POST_DEC") {
        return paren(emitExpr(expr.operand), exprPrec(expr.operand), PREC.POSTFIX) + meta.text;
      }
      const inner = paren(emitExpr(expr.operand), exprPrec(expr.operand), PREC.UNARY);
      return meta.text + inner;
    }
    if (expr instanceof AST.ETernary) {
      const c = paren(emitExpr(expr.condition), exprPrec(expr.condition), PREC.TERNARY + 1);
      const t = emitExpr(expr.thenExpr);
      const e = paren(emitExpr(expr.elseExpr), exprPrec(expr.elseExpr), PREC.TERNARY);
      return c + " ? " + t + " : " + e;
    }
    if (expr instanceof AST.ECall) {
      const callee = paren(emitExpr(expr.callee), exprPrec(expr.callee), PREC.POSTFIX);
      const args = expr.arguments.map(a => emitExpr(a)).join(", ");
      return callee + "(" + args + ")";
    }
    if (expr instanceof AST.ESubscript) {
      return paren(emitExpr(expr.array), exprPrec(expr.array), PREC.POSTFIX) + "[" + emitExpr(expr.index) + "]";
    }
    if (expr instanceof AST.EMember) {
      return paren(emitExpr(expr.base), exprPrec(expr.base), PREC.POSTFIX) + "." + expr.memberDecl.name;
    }
    if (expr instanceof AST.EArrow) {
      return paren(emitExpr(expr.base), exprPrec(expr.base), PREC.POSTFIX) + "->" + expr.memberDecl.name;
    }
    if (expr instanceof AST.ECast) {
      return "(" + spellType(expr.targetType, "") + ")" + paren(emitExpr(expr.expr), exprPrec(expr.expr), PREC.UNARY);
    }
    if (expr instanceof AST.ESizeofExpr) {
      return "sizeof(" + emitExpr(expr.expr) + ")";
    }
    if (expr instanceof AST.ESizeofType) {
      return "sizeof(" + spellType(expr.operandType, "") + ")";
    }
    if (expr instanceof AST.EAlignofExpr) {
      return "_Alignof(" + emitExpr(expr.expr) + ")";
    }
    if (expr instanceof AST.EAlignofType) {
      return "_Alignof(" + spellType(expr.operandType, "") + ")";
    }
    if (expr instanceof AST.EComma) {
      return emitExpr(expr.left) + ", " + emitExpr(expr.right);
    }
    if (expr instanceof AST.EInitList) {
      return "{" + expr.elements.map(e => emitExpr(e)).join(", ") + "}";
    }
    if (expr instanceof AST.ECompoundLiteral) {
      return "(" + spellType(expr.type, "") + ")" + emitExpr(expr.initList);
    }
    if (expr instanceof AST.EIntrinsic) {
      return emitIntrinsic(expr);
    }
    if (expr instanceof AST.EWasm) {
      return emitWasm(expr);
    }
    if (expr instanceof AST.EGCNew) {
      return "__gc_new(" + expr.args.map(a => emitExpr(a)).join(", ") + ")";
    }
    return "/* unknown expr " + expr.constructor.name + " */0";
  }

  function emitStringLiteral(expr) {
    const elemType = expr.type.baseType;
    const elemSize = elemType.size;
    let prefix = "";
    if (elemSize === 2) prefix = "u";
    else if (elemSize === 4) prefix = "U";
    const bytes = expr.value;
    let s = prefix + "\"";
    // Decode elements from the byte array
    const nullTermBytes = elemSize;
    const contentLen = bytes.length - nullTermBytes;
    for (let i = 0; i < contentLen; i += elemSize) {
      let ch;
      if (elemSize === 1) ch = bytes[i];
      else if (elemSize === 2) ch = bytes[i] | (bytes[i + 1] << 8);
      else ch = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
      if (ch === 0) s += "\\0";
      else if (ch === 7) s += "\\a";
      else if (ch === 8) s += "\\b";
      else if (ch === 9) s += "\\t";
      else if (ch === 10) s += "\\n";
      else if (ch === 11) s += "\\v";
      else if (ch === 12) s += "\\f";
      else if (ch === 13) s += "\\r";
      else if (ch === 27) s += "\\e";
      else if (ch === 34) s += "\\\"";
      else if (ch === 92) s += "\\\\";
      else if (ch >= 32 && ch < 127) s += String.fromCharCode(ch);
      else if (elemSize === 1) s += "\\x" + ch.toString(16).padStart(2, "0");
      else if (elemSize === 2) s += "\\u" + ch.toString(16).padStart(4, "0");
      else s += "\\U" + (ch >>> 0).toString(16).padStart(8, "0");
    }
    s += "\"";
    return s;
  }

  function emitIntrinsic(expr) {
    const args = expr.args.map(a => emitExpr(a)).join(", ");
    switch (expr.intrinsicKind) {
      case Types.IntrinsicKind.VA_START: return "__builtin_va_start(" + args + ")";
      case Types.IntrinsicKind.VA_ARG: return "__builtin_va_arg(" + args + ")";
      case Types.IntrinsicKind.VA_END: return "__builtin_va_end(" + args + ")";
      case Types.IntrinsicKind.VA_COPY: return "__builtin_va_copy(" + args + ")";
      case Types.IntrinsicKind.UNREACHABLE: return "__builtin_unreachable()";
      case Types.IntrinsicKind.ALLOCA: return "__builtin(alloca" + (args ? ", " + args : "") + ")";
      case Types.IntrinsicKind.MEMORY_SIZE: return "__builtin(memory_size)";
      case Types.IntrinsicKind.MEMORY_GROW: return "__builtin(memory_grow, " + args + ")";
      case Types.IntrinsicKind.MEMORY_COPY: return "__builtin(memory_copy, " + args + ")";
      case Types.IntrinsicKind.MEMORY_FILL: return "__builtin(memory_fill, " + args + ")";
      case Types.IntrinsicKind.HEAP_BASE: return "__builtin(heap_base)";
      case Types.IntrinsicKind.REF_IS_NULL: return "__ref_is_null(" + args + ")";
      case Types.IntrinsicKind.REF_EQ: return "__ref_eq(" + args + ")";
      case Types.IntrinsicKind.REF_NULL: {
        const t = expr.argType || expr.type;
        return "__ref_null(" + spellType(t, "") + ")";
      }
      case Types.IntrinsicKind.REF_TEST: return "__ref_test(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.REF_TEST_NULL: return "__ref_test_null(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.REF_CAST: return "__ref_cast(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.REF_CAST_NULL: return "__ref_cast_null(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.ARRAY_LEN: return "__array_len(" + args + ")";
      case Types.IntrinsicKind.GC_NEW_ARRAY: return "__gc_new_array(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.ARRAY_FILL: return "__array_fill(" + args + ")";
      case Types.IntrinsicKind.ARRAY_COPY: return "__array_copy(" + args + ")";
      case Types.IntrinsicKind.REF_AS_EXTERN: return "__ref_as_extern(" + args + ")";
      case Types.IntrinsicKind.REF_AS_EQ: return "__ref_as_eq(" + args + ")";
      case Types.IntrinsicKind.CAST: return "__cast(" + spellType(expr.argType, "") + ", " + args + ")";
      case Types.IntrinsicKind.GC_STR: return "__gcstr(" + args + ")";
      default: return "/* intrinsic:" + expr.intrinsicKind + " */(" + args + ")";
    }
  }

  function emitWasm(expr) {
    const args = expr.args.map(a => emitExpr(a));
    const hexBytes = Array.from(expr.bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
    return "__wasm(\"" + hexBytes + "\"" + (args.length ? ", " + args.join(", ") : "") + ")";
  }

  // --- Statement emission ---
  function emitStmt(stmt, indent) {
    if (!stmt) return;
    setLoc(stmt.loc);
    const ind = "  ".repeat(indent);
    if (stmt instanceof AST.SCompound) {
      w(ind + "{\n");
      for (const s of stmt.statements) emitStmt(s, indent + 1);
      w(ind + "}\n");
      return;
    }
    if (stmt instanceof AST.SExpr) {
      w(ind + emitExpr(stmt.expr) + ";\n");
      return;
    }
    if (stmt instanceof AST.SDecl) {
      for (const d of stmt.declarations) {
        emitLocalDecl(d, indent);
      }
      return;
    }
    if (stmt instanceof AST.SReturn) {
      if (stmt.expr) w(ind + "return " + emitExpr(stmt.expr) + ";\n");
      else w(ind + "return;\n");
      return;
    }
    if (stmt instanceof AST.SIf) {
      w(ind + "if (" + emitExpr(stmt.condition) + ")\n");
      emitBody(stmt.thenBranch, indent);
      if (stmt.elseBranch) {
        w(ind + "else\n");
        emitBody(stmt.elseBranch, indent);
      }
      return;
    }
    if (stmt instanceof AST.SWhile) {
      w(ind + "while (" + emitExpr(stmt.condition) + ")\n");
      emitBody(stmt.body, indent);
      return;
    }
    if (stmt instanceof AST.SDoWhile) {
      w(ind + "do\n");
      emitBody(stmt.body, indent);
      w(ind + "while (" + emitExpr(stmt.condition) + ");\n");
      return;
    }
    if (stmt instanceof AST.SFor) {
      w(ind + "for (");
      if (stmt.init) {
        if (stmt.init instanceof AST.SDecl) {
          const parts = [];
          for (const d of stmt.init.declarations) {
            let s = spellDecl(d.type, d.name);
            if (d.initExpr) s += " = " + emitExpr(d.initExpr);
            parts.push(s);
          }
          w(parts.join(", "));
        } else if (stmt.init instanceof AST.SExpr) {
          w(emitExpr(stmt.init.expr));
        }
      }
      w("; ");
      if (stmt.condition) w(emitExpr(stmt.condition));
      w("; ");
      if (stmt.increment) w(emitExpr(stmt.increment));
      w(")\n");
      emitBody(stmt.body, indent);
      return;
    }
    if (stmt instanceof AST.SSwitch) {
      w(ind + "switch (" + emitExpr(stmt.expr) + ")\n");
      emitBody(stmt.body, indent);
      return;
    }
    if (stmt instanceof AST.SCase) {
      const cind = "  ".repeat(Math.max(0, indent - 1));
      if (stmt.isDefault) w(cind + "default:\n");
      else if (stmt.lo === stmt.hi) w(cind + "case " + stmt.lo + ":\n");
      else w(cind + "case " + stmt.lo + " ... " + stmt.hi + ":\n");
      return;
    }
    if (stmt instanceof AST.SGoto) {
      w(ind + "goto " + stmt.label + ";\n");
      return;
    }
    if (stmt instanceof AST.SLabel) {
      w(stmt.name + ":\n");
      return;
    }
    if (stmt instanceof AST.SBreak) { w(ind + "break;\n"); return; }
    if (stmt instanceof AST.SContinue) { w(ind + "continue;\n"); return; }
    if (stmt instanceof AST.SEmpty) { w(ind + ";\n"); return; }
    if (stmt instanceof AST.STryCatch) {
      w(ind + "__try\n");
      emitBody(stmt.tryBody, indent);
      for (const cc of stmt.catches) {
        if (cc.tag) {
          w(ind + "__catch " + cc.tag.name + "(" + cc.bindings.join(", ") + ")\n");
        } else {
          w(ind + "__catch\n");
        }
        emitBody(cc.body, indent);
      }
      return;
    }
    if (stmt instanceof AST.SThrow) {
      w(ind + "__throw " + stmt.tag.name + "(" + stmt.args.map(a => emitExpr(a)).join(", ") + ");\n");
      return;
    }
    w(ind + "/* unknown stmt: " + stmt.constructor.name + " */\n");
  }

  // Emit a stmt as a block body — if it's a compound, emit directly;
  // otherwise wrap in braces for safety.
  function emitBody(stmt, indent) {
    if (stmt instanceof AST.SCompound) {
      emitStmt(stmt, indent);
    } else {
      const ind = "  ".repeat(indent);
      w(ind + "{\n");
      emitStmt(stmt, indent + 1);
      w(ind + "}\n");
    }
  }

  // --- Local declarations ---
  function emitLocalDecl(decl, indent) {
    setLoc(decl.loc);
    const ind = "  ".repeat(indent);
    if (decl instanceof AST.DVar) {
      let s = "";
      if (decl.storageClass === Types.StorageClass.STATIC) s += "static ";
      else if (decl.storageClass === Types.StorageClass.EXTERN) s += "extern ";
      else if (decl.storageClass === Types.StorageClass.REGISTER) s += "register ";
      s += spellDecl(decl.type, decl.name);
      if (decl.initExpr) s += " = " + emitExpr(decl.initExpr);
      w(ind + s + ";\n");
    } else if (decl instanceof AST.DFunc) {
      emitFuncDecl(decl, indent);
    }
  }

  // --- Top-level declaration emission ---
  function emitTopLevelDecl(decl) {
    if (decl instanceof AST.DFunc) {
      emitFuncDecl(decl, 0);
    } else if (decl instanceof AST.DVar) {
      emitVarDecl(decl, 0);
    }
  }

  function storagePrefix(decl) {
    if (decl.storageClass === Types.StorageClass.STATIC) return "static ";
    if (decl.storageClass === Types.StorageClass.EXTERN) return "extern ";
    if (decl.storageClass === Types.StorageClass.IMPORT) return "__import ";
    return "";
  }

  function emitVarDecl(decl, indent) {
    setLoc(decl.loc);
    const ind = "  ".repeat(indent);
    let s = storagePrefix(decl);
    // Check if we need to emit the tag definition inline
    const uq = decl.type.removeQualifiers();
    if (maybeEmitInlineTag(decl.type)) {
      emitTagDef(uq.tagDecl, indent);
      w(" " + decl.name);
    } else {
      s += spellDecl(decl.type, decl.name);
      w(ind + s);
    }
    if (decl.initExpr) w(" = " + emitExpr(decl.initExpr));
    w(";\n");
  }

  function emitFuncDecl(decl, indent) {
    setLoc(decl.loc);
    const ind = "  ".repeat(indent);
    let prefix = storagePrefix(decl);
    if (decl.isInline) prefix += "inline ";

    // Build parameter list with names
    const paramStrs = [];
    for (let i = 0; i < decl.parameters.length; i++) {
      const p = decl.parameters[i];
      paramStrs.push(spellDecl(p.type, p.name || ""));
    }
    if (decl.type.isVarArg) paramStrs.push("...");
    else if (paramStrs.length === 0 && !decl.type.hasUnspecifiedParams) paramStrs.push("void");

    const retType = decl.type.getReturnType();
    const declStr = decl.name + "(" + paramStrs.join(", ") + ")";
    w(ind + prefix + spellType(retType, declStr));

    if (decl.body) {
      w("\n");
      emitStmt(decl.body, indent);
    } else {
      w(";\n");
    }
  }

  // Collect all tag types referenced anywhere in a type tree
  function collectTagsFromType(type, tags) {
    if (!type) return;
    const uq = type.removeQualifiers();
    if (uq.isTag && uq.isTag() && uq.tagDecl && uq.tagDecl.isComplete) {
      if (!tags.has(uq.tagDecl)) {
        tags.set(uq.tagDecl, uq.tagDecl);
        for (const m of uq.tagDecl.members) collectTagsFromType(m.type, tags);
      }
    }
    if (uq instanceof Types.PointerType) collectTagsFromType(uq.baseType, tags);
    if (uq instanceof Types.ArrayType) collectTagsFromType(uq.baseType, tags);
    if (uq.isFunction()) {
      collectTagsFromType(uq.returnType, tags);
      for (const p of uq.paramTypes) collectTagsFromType(p, tags);
    }
  }

  function collectTagsFromExpr(expr, tags) {
    if (!expr) return;
    collectTagsFromType(expr.type, tags);
    if (expr.children) for (const c of expr.children) collectTagsFromExpr(c, tags);
  }

  function collectTagsFromStmt(stmt, tags) {
    if (!stmt) return;
    if (stmt instanceof AST.SCompound) {
      for (const s of stmt.statements) collectTagsFromStmt(s, tags);
    } else if (stmt instanceof AST.SExpr) {
      collectTagsFromExpr(stmt.expr, tags);
    } else if (stmt instanceof AST.SDecl) {
      for (const d of stmt.declarations) {
        collectTagsFromType(d.type, tags);
        if (d.initExpr) collectTagsFromExpr(d.initExpr, tags);
      }
    } else if (stmt instanceof AST.SIf) {
      collectTagsFromExpr(stmt.condition, tags);
      collectTagsFromStmt(stmt.thenBranch, tags);
      if (stmt.elseBranch) collectTagsFromStmt(stmt.elseBranch, tags);
    } else if (stmt instanceof AST.SWhile) {
      collectTagsFromExpr(stmt.condition, tags);
      collectTagsFromStmt(stmt.body, tags);
    } else if (stmt instanceof AST.SDoWhile) {
      collectTagsFromStmt(stmt.body, tags);
      collectTagsFromExpr(stmt.condition, tags);
    } else if (stmt instanceof AST.SFor) {
      if (stmt.init) collectTagsFromStmt(stmt.init, tags);
      if (stmt.condition) collectTagsFromExpr(stmt.condition, tags);
      if (stmt.increment) collectTagsFromExpr(stmt.increment, tags);
      collectTagsFromStmt(stmt.body, tags);
    } else if (stmt instanceof AST.SSwitch) {
      collectTagsFromExpr(stmt.expr, tags);
      collectTagsFromStmt(stmt.body, tags);
    } else if (stmt instanceof AST.SReturn && stmt.expr) {
      collectTagsFromExpr(stmt.expr, tags);
    } else if (stmt instanceof AST.STryCatch) {
      collectTagsFromStmt(stmt.tryBody, tags);
      for (const cc of stmt.catches) collectTagsFromStmt(cc.body, tags);
    } else if (stmt instanceof AST.SThrow) {
      for (const a of stmt.args) collectTagsFromExpr(a, tags);
    }
  }

  // --- Translation unit ---
  function emitTUnit(unit) {
    // Collect all top-level decls and sort by id (source order)
    const allDecls = [];
    for (const f of unit.importedFunctions) allDecls.push(f);
    for (const f of unit.declaredFunctions) allDecls.push(f);
    for (const f of unit.localDeclaredFunctions) allDecls.push(f);
    for (const v of unit.externVariables) allDecls.push(v);
    for (const v of unit.localExternVariables) allDecls.push(v);
    for (const f of unit.definedFunctions) allDecls.push(f);
    for (const f of unit.staticFunctions) allDecls.push(f);
    for (const v of unit.definedVariables) allDecls.push(v);
    allDecls.sort((a, b) => a.id - b.id);

    // Collect all tag definitions referenced anywhere in this TU
    const tags = new Map();
    for (const decl of allDecls) {
      if (decl.type) collectTagsFromType(decl.type, tags);
      if (decl instanceof AST.DFunc) {
        for (const p of decl.parameters) collectTagsFromType(p.type, tags);
        if (decl.body) collectTagsFromStmt(decl.body, tags);
      }
    }
    // Emit tag definitions sorted by decl id (definition order)
    const sortedTags = [...tags.values()].sort((a, b) => a.id - b.id);
    for (const tagDecl of sortedTags) {
      if (!emittedTags.has(tagDecl)) {
        emitTagDef(tagDecl, 0);
        w(";\n\n");
      }
    }

    for (const decl of allDecls) {
      emitTopLevelDecl(decl);
      w("\n");
    }
  }

  for (const unit of units) {
    if (!showStdlib && unit.filename.startsWith("__")) continue;
    emitTUnit(unit);
  }
  return { text: out.join(""), lineMap: lineMap };
}

// Whole-program tree-shake. Walks the AST bag (referencedFunctions /
// referencedVariables) from cross-TU roots: `main`, `alloca`, exports.
// Any decl not reached from those roots — including non-static defined
// functions / globals — gets dropped. This is more aggressive than
// INLINER.optimize's per-TU pass, which has to assume non-static decls
// might be called from another TU.
function gcSectionsPass(units, options) {
  const liveFuncs = new Set();
  const liveVars = new Set();
  const funcQ = [];
  const varQ = [];
  const enqueueFunc = (f) => {
    if (!f || liveFuncs.has(f)) return;
    liveFuncs.add(f);
    funcQ.push(f);
  };
  const enqueueVar = (v) => {
    if (!v || liveVars.has(v)) return;
    liveVars.add(v);
    varQ.push(v);
  };
  const visitRefs = (node) => {
    for (const f of node.referencedFunctions) enqueueFunc(f);
    for (const v of node.referencedVariables) enqueueVar(v);
  };

  // Seed cross-TU roots.
  for (const unit of units) {
    for (const f of unit.definedFunctions) {
      if (f.name === "main" || f.name === "alloca") enqueueFunc(f);
    }
    if (!(options && options.gcNoExportRoots)) {
      // Root the body-bearing definition: an export directive may name a
      // forward declaration (no body) whose .definition is the real function
      // (linked in by linkTranslationUnits). Enqueuing the bodiless declaration
      // marks it live but never visits the body or keeps the definition node,
      // so the exported function gets dropped. Canonical victim: libc `exit`
      // (prototype, defined later), which the host runtime calls after main to
      // flush stdio — dropping it silently loses unflushed, non-newline output.
      for (const [, func] of unit.exportDirectives) enqueueFunc(func.definition || func);
    }
  }

  // Drain. The bag follows decl.definition || decl, so cross-TU
  // references resolve naturally to the body-bearing instance after
  // the linker has run setDefinition.
  while (funcQ.length > 0 || varQ.length > 0) {
    while (funcQ.length > 0) {
      const f = funcQ.shift();
      if (f.body) visitRefs(f.body);
      for (const v of (f.staticLocals || [])) {
        if (v.initExpr) visitRefs(v.initExpr);
      }
    }
    while (varQ.length > 0) {
      const v = varQ.shift();
      if (v.initExpr) visitRefs(v.initExpr);
    }
  }

  const keepF = (f) => liveFuncs.has(f);
  const keepV = (v) => liveVars.has(v);
  for (const unit of units) {
    unit.importedFunctions = unit.importedFunctions.filter(keepF);
    unit.definedFunctions = unit.definedFunctions.filter(keepF);
    unit.staticFunctions = unit.staticFunctions.filter(keepF);
    unit.declaredFunctions = unit.declaredFunctions.filter(keepF);
    unit.localDeclaredFunctions = unit.localDeclaredFunctions.filter(keepF);
    unit.definedVariables = unit.definedVariables.filter(keepV);
    unit.externVariables = unit.externVariables.filter(keepV);
    unit.localExternVariables = unit.localExternVariables.filter(keepV);
  }
}

// ====================
// Linker
// ====================

function linkTranslationUnits(units, compilerOptions) {
  const errors = [];
  const externScope = new Map();

  function addError(message, locations) { errors.push({ message, locations: locations || [] }); }

  function isStatic(decl) {
    return decl.storageClass === Types.StorageClass.STATIC;
  }

  function isDefinition(decl) {
    if (decl instanceof AST.DVar) {
      return decl.storageClass !== Types.StorageClass.EXTERN || decl.initExpr != null;
    } else if (decl instanceof AST.DFunc) {
      return decl.body != null;
    }
    return false;
  }

  /* A "tentative definition" (C11 6.9.2 §2): a file-scope variable
   * declared without an initializer and without `extern`. Multiple
   * tentative definitions of the same identifier in the same scope are
   * merged into one object — only one becomes the real definition, and
   * the others are absorbed. If any later declaration has an
   * initializer, it wins. */
  function isTentativeDefinition(decl) {
    return decl instanceof AST.DVar
        && decl.storageClass !== Types.StorageClass.EXTERN
        && decl.initExpr == null;
  }

  function isImportFunction(decl) {
    return decl instanceof AST.DFunc && decl.storageClass === Types.StorageClass.IMPORT;
  }

  function getDeclType(decl) { return decl.type; }
  function getName(decl) { return decl.name; }

  function checkCompatibility(a, b) {
    const locs = [a.loc, b.loc].filter(l => l?.filename);
    if (a.constructor !== b.constructor) {
      addError(`declaration and definition kinds do not match for symbol '${getName(a)}'`, locs);
      return;
    }
    const ta = getDeclType(a), tb = getDeclType(b);
    if (ta && tb && !ta.isCompatibleWith(tb)) {
      addError(`conflicting types for '${getName(a)}' ('${ta.toString()}' vs '${tb.toString()}')`, locs);
    }
  }

  function setDefinition(decl, definition) {
    if (decl.constructor !== definition.constructor) return;
    if (decl instanceof AST.DVar) {
      decl.definition = definition;
      // Propagate allocClass
      if (decl.allocClass === Types.AllocClass.MEMORY) {
        definition.allocClass = Types.AllocClass.MEMORY;
      }
    } else if (decl instanceof AST.DFunc) {
      decl.definition = definition;
    }
  }

  function addDecl(scope, decl) {
    const name = getName(decl);
    if (!name) throw new Error("Declaration has no name");

    if (!scope.has(name)) {
      scope.set(name, decl);
      return;
    }

    const existing = scope.get(name);
    checkCompatibility(existing, decl);

    if (!isDefinition(decl) || isImportFunction(decl)) return;

    if (isDefinition(existing)) {
      // Inline semantics (C11 6.7.4p7): an inline definition does not
      // provide the external definition, so besides inline+inline being
      // fine, an inline definition may coexist with ONE non-inline
      // (external) definition from another TU — and the external one is
      // THE definition of the symbol.
      if (decl instanceof AST.DFunc && existing instanceof AST.DFunc &&
          (decl.isInline || existing.isInline)) {
        if (existing.isInline && !decl.isInline) {
          scope.set(name, decl); // external definition supersedes inline
          return;
        }
        return; // inline+inline, or existing external + new inline
      }
      // C11 6.9.2: tentative definitions merge. Two tentatives → same
      // object; a later definition with an initializer supersedes any
      // prior tentative.
      if (isTentativeDefinition(existing) && isTentativeDefinition(decl)) {
        return;  // collapse second tentative into the first
      }
      if (isTentativeDefinition(existing) && decl instanceof AST.DVar && decl.initExpr != null) {
        scope.set(name, decl);  // initializer wins
        return;
      }
      if (isTentativeDefinition(decl) && existing instanceof AST.DVar && existing.initExpr != null) {
        return;  // existing initializer wins
      }
      addError(`Duplicate definition of symbol '${name}'`);
      return;
    }

    scope.set(name, decl);
  }

  function forEachDecl(unit, forStatic, callback) {
    const check = (d) => { if (isStatic(d) === forStatic) callback(d); };
    for (const f of unit.importedFunctions) check(f);
    for (const f of unit.definedFunctions) check(f);
    for (const f of unit.staticFunctions) check(f);
    for (const f of unit.declaredFunctions) check(f);
    for (const f of unit.localDeclaredFunctions) check(f);
    for (const v of unit.definedVariables) check(v);
    for (const v of unit.externVariables) check(v);
    for (const v of unit.localExternVariables) check(v);
  }

  function collectSymbols(unit, outScope, forStatic) {
    forEachDecl(unit, forStatic, (decl) => {
      const scope = isStatic(decl) ? outScope : externScope;
      addDecl(scope, decl);
    });
  }

  function linkSymbols(scope, unit, forStatic) {
    forEachDecl(unit, forStatic, (decl) => {
      const name = getName(decl);
      const it = scope.get(name);
      if (!it) {
        addError(`Internal linker error: symbol '${name}' not found in scope`);
        return;
      }
      if (!isDefinition(it) && !isImportFunction(it)) {
        if (compilerOptions.allowUndefined && it instanceof AST.DFunc) {
          it.storageClass = Types.StorageClass.IMPORT;
        } else {
          addError(`Undefined symbol '${name}' during linking`, [decl.loc || it.loc]);
          return;
        }
      }
      setDefinition(decl, it);
    });
  }

  // Collect all definitions and link static symbols
  for (const unit of units) {
    const tuScope = new Map();
    collectSymbols(unit, tuScope, false);  // extern
    collectSymbols(unit, tuScope, true);   // static
    linkSymbols(tuScope, unit, true);      // link static
  }

  // Link extern symbols
  for (const unit of units) {
    linkSymbols(externScope, unit, false);
  }

  // C11 6.9.2p2 (EXAMPLE 2): a tentative definition whose array type is
  // still incomplete at end of translation unit is completed to ONE
  // element with the implicit zero initializer (gcc/clang, both warn).
  // Without this the object sized to 0 bytes at allocateStatic and the
  // NEXT global overlapped it (todos/0204). Runs after definition merge
  // so an initialized (size-bearing) definition has already won.
  const completeTentativeArray = (decl) => {
    if (!(decl instanceof AST.DVar)) return;
    const def = decl.definition || decl;
    if (!isTentativeDefinition(def)) return;
    const t = def.type.removeQualifiers();
    if (t.isArray() && (t.arraySize || 0) === 0) {
      def.type = Types.arrayOf(t.baseType, 1);
    }
  };
  for (const unit of units) {
    forEachDecl(unit, false, completeTentativeArray);
    forEachDecl(unit, true, completeTentativeArray);
  }

  // Whole-program inline+fold round (todos/0188): now that every decl's
  // `.definition` points at its body-bearing instance, re-fold bodies so
  // cross-TU single-return callees become inline candidates. Placed here
  // (rather than in each driver) so every consumer of the linker — the
  // CLI, the in-OS cc driver, tests — gets whole-program inlining
  // uniformly. Skipped on link errors (definitions may be missing) and
  // under --no-fold, matching the per-TU pass gate.
  if (errors.length === 0 && !compilerOptions?.noFold) {
    INLINER.optimizeLinked(units);
  }

  return { errors };
}


// ====================
// Init list normalization helpers
// ====================

// Get VAR members of a tag, filtering out unnamed bitfields
function getVarMembers(tag) {
  const result = [];
  for (const m of tag.members) {
    if (!(m instanceof AST.DVar)) continue;
    if (m.bitWidth >= 0 && !m.name) continue; // skip unnamed bitfields
    result.push(m);
  }
  return result;
}

// Recursively search for a named member in a tag, descending into
// anonymous struct/union members. Returns array of DVar* path, or null.
function findMemberChain(tag, name) {
  for (const m of tag.members) {
    if (!(m instanceof AST.DVar)) continue;
    if (m.name === name) return [m];
    // Recurse into anonymous struct/union members
    if (!m.name && m.type.isTag() && m.type.tagDecl) {
      const sub = findMemberChain(m.type.tagDecl, name);
      if (sub) return [m, ...sub];
    }
  }
  return null;
}

// Normalize an init list: resolve designators, brace elision, zero-fill.
// Returns the (possibly new) init list — for unsized arrays the type
// changes to the inferred size, so a fresh EInitList is built at the
// end. Otherwise returns the original (mutated in place: elements and
// designators arrays are rewritten through the existing references —
// safe because Object.freeze on EInitList is shallow).
function normalizeInitList(initList, containerType) {
  // C11 6.7.9p14: a char array may be initialized by a string literal that is
  // optionally enclosed in braces — `char a[] = { "hi" }`. Keep the string as
  // the sole element and adopt the (string-sized) array type; the per-element
  // cursor logic below would otherwise treat the string as a single scalar
  // element and produce a size-1 array. Codegen's init-list paths already
  // handle EInitList{ char[N], [EString] } — the same shape the `(char[]){"hi"}`
  // compound-literal path produces.
  if (containerType.isArray() &&
      initList.elements.length === 1 &&
      initList.elements[0] instanceof AST.EString &&
      initList.elements[0].type && initList.elements[0].type.isArray()) {
    const abt = containerType.baseType.removeQualifiers();
    const sbt = initList.elements[0].type.baseType.removeQualifiers();
    // A string can only initialize an array whose element is a matching-width
    // character/integer type (char[] from "..", wchar[] from L"..").
    if (!abt.isAggregate() && !abt.isPointer() && !abt.isArray() &&
        abt.size === sbt.size) {
      // C11 6.7.9p14: the string may exceed the array only by its NUL.
      const fixedSize = containerType.arraySize || 0;
      const strSize = initList.elements[0].type.arraySize; // includes the NUL
      if (fixedSize > 0 && strSize - 1 > fixedSize) {
        reportError(initList.loc,
          `initializer string (${strSize - 1} chars) is too long for '${containerType.toString()}'`);
      }
      const arrType = fixedSize === 0
        ? Types.arrayOf(containerType.baseType, strSize)
        : containerType;
      return new AST.EInitList(initList.loc, arrType, initList.elements.slice(),
                               initList.designators.slice(), initList.unionMemberIndex);
    }
  }
  // Snapshot source, then clear in place. Mutating array lengths/
  // contents rather than reassigning the references keeps
  // initList.children aliasing initList.elements for walkers. Frozen
  // EInitList allows array-content mutation since freeze is shallow.
  const src = initList.elements.slice();
  const desigs = initList.designators.slice();
  initList.elements.length = 0;
  initList.designators.length = 0;
  // Effective type: starts as containerType; may be refined for unsized
  // arrays once we know the actual extent. Tracked locally rather than
  // mutated on initList so we can build a fresh EInitList at the end.
  let effectiveType = containerType;

  // Child count for an aggregate type
  function childCount(t) {
    if (t.isArray()) {
      const sz = t.arraySize || 0;
      return sz === 0 ? 0x7FFFFFFF : sz;
    }
    if (t.isTag() && t.tagDecl) {
      if (t.tagDecl.tagKind === Types.TagKind.UNION) return 1;
      // STRUCT: count VAR members
      return getVarMembers(t.tagDecl).length;
    }
    return 0;
  }

  // Type of the i-th child of an aggregate
  function childType(t, index, output) {
    if (t.isArray()) return t.baseType;
    if (t.isTag() && t.tagDecl) {
      if (t.tagDecl.tagKind === Types.TagKind.UNION) {
        const members = getVarMembers(t.tagDecl);
        const umi = output.unionMemberIndex;
        if (umi >= 0 && umi < members.length) return members[umi].type;
        return members.length > 0 ? members[0].type : Types.TINT;
      }
      // STRUCT
      const members = getVarMembers(t.tagDecl);
      if (index >= 0 && index < members.length) return members[index].type;
    }
    return Types.TINT;
  }

  // Create a zero expression for a given type
  function makeZero(t) {
    const loc = Lexer.Loc.generated();
    if (t.isFloatingPoint()) return new AST.EFloat(loc, t, 0.0);
    return new AST.EInt(loc, Types.TINT, 0n);
  }

  // Ensure output has a slot at index
  function ensureSlot(list, index) {
    while (list.elements.length <= index) list.elements.push(null);
  }

  // Ensure output[index] is a sub-EInitList for an aggregate child
  function ensureSubList(list, index, subType) {
    ensureSlot(list, index);
    if (!list.elements[index] || !(list.elements[index] instanceof AST.EInitList)) {
      const cc = childCount(subType);
      const elems = [];
      if (cc !== 0x7FFFFFFF && cc > 0) {
        for (let i = 0; i < cc; i++) elems.push(null);
      }
      list.elements[index] = new AST.EInitList(Lexer.Loc.generated(), subType, elems);
    }
    return list.elements[index];
  }

  // Cursor: stack of levels tracking position in the type tree
  const stack = [];

  // Advance cursor to next position after placing an element
  function advanceCursor() {
    while (stack.length > 0) {
      stack[stack.length - 1].index++;
      if (stack[stack.length - 1].index < stack[stack.length - 1].count) return;
      stack.pop();
    }
  }

  // Descend into current slot (for brace elision)
  function descend() {
    const top = stack[stack.length - 1];
    const slotType = childType(top.type, top.index, top.output);
    const sub = ensureSubList(top.output, top.index, slotType);
    const cc = childCount(slotType);
    stack.push({ type: slotType, index: 0, count: cc, output: sub });
  }

  // Initialize root level — `length = 0` was already done above; pad with nulls.
  const rootCount = childCount(containerType);
  if (rootCount !== 0x7FFFFFFF && rootCount > 0) {
    for (let i = 0; i < rootCount; i++) initList.elements.push(null);
  }
  stack.push({ type: containerType, index: 0, count: rootCount, output: initList });

  // Track max extent for unsized arrays
  let maxExtent = 0;

  let srcIdx = 0;
  while (srcIdx < src.length) {
    // 1. Handle designator — reset cursor to root and navigate
    const hasDesig = srcIdx < desigs.length && desigs[srcIdx].steps.length > 0;
    if (!hasDesig && stack.length === 0) break;
    if (hasDesig) {
      const steps = desigs[srcIdx].steps;

      // Reset to root
      stack.length = 0;
      stack.push({ type: containerType, index: 0, count: rootCount, output: initList });

      let desigError = false;
      for (let si = 0; si < steps.length; si++) {
        const step = steps[si];
        const top = stack[stack.length - 1];

        if (step.kind === "FIELD") {
          // Resolve field name
          if (!top.type.isTag() || !top.type.tagDecl) break;
          const tag = top.type.tagDecl;

          // One path for structs AND unions: findMemberChain sees through
          // anonymous struct/union members, and the per-level loop below
          // already sets unionMemberIndex when a level is a union. (Unions
          // used to scan only direct members — `.b = 42` naming a member
          // of an anonymous struct inside a union silently landed on
          // member 0.)
          const chain = findMemberChain(tag, step.fieldName);
          if (!chain) {
            reportError(initList.loc,
              `designator '.${step.fieldName}' names no member of '${top.type.toString()}'`);
            desigError = true;
            break;
          }
          for (let ci = 0; ci < chain.length; ci++) {
            const member = chain[ci];
            let currentTag = stack[stack.length - 1].type.tagDecl;
            const members = getVarMembers(currentTag);
            for (let j = 0; j < members.length; j++) {
              if (members[j] === member) {
                if (currentTag.tagKind === Types.TagKind.UNION) {
                  stack[stack.length - 1].output.unionMemberIndex = j;
                  stack[stack.length - 1].index = 0;
                } else {
                  stack[stack.length - 1].index = j;
                }
                break;
              }
            }
            // If not the final member in chain, descend into anonymous aggregate
            if (ci < chain.length - 1) {
              descend();
            }
          }
        } else {
          // INDEX designator
          if (!top.type.isArray()) break;
          const val = constEvalInt(step.indexExpr);
          if (val !== null) {
            const idx = Number(val);
            const bound = top.type.arraySize || 0;
            if (val < 0n || (bound > 0 && idx >= bound)) {
              // C11 6.7.9p3 constraint — accepting this used to write past
              // the object and corrupt neighboring memory at runtime.
              reportError(initList.loc,
                `array designator index ${val} is out of bounds for '${top.type.toString()}'`);
              desigError = true;
              break;
            }
            top.index = idx;
            ensureSlot(top.output, top.index);
          }
        }

        // If not the last step, descend into the current slot
        if (si + 1 < steps.length) {
          descend();
        }
      }
      if (desigError) { srcIdx++; continue; } // skip the element; error already reported
    }

    if (stack.length === 0) break;

    // 2. Place element — descend through aggregates for brace elision
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      ensureSlot(top.output, top.index);
      const slotType = childType(top.type, top.index, top.output);
      // The extent of an unsized ROOT array is the highest root-level slot
      // touched — placements at nested levels advance stack[0].index only
      // when the whole nested aggregate is consumed, so read the extent
      // from the root cursor, never from the innermost one. (Reading the
      // innermost index used to inflate `struct P a[] = {1,2,3}` to three
      // elements.)
      const noteExtent = () => {
        const rootIdx = stack.length > 0 ? stack[0].index : 0;
        if (rootIdx + 1 > maxExtent) maxExtent = rootIdx + 1;
      };

      if (src[srcIdx] instanceof AST.EInitList &&
          (slotType.isAggregate() || slotType.isArray())) {
        // Braced sub-init-list at an aggregate slot: place and recurse
        top.output.elements[top.index] = src[srcIdx];
        top.output.elements[top.index] = normalizeInitList(top.output.elements[top.index], slotType);
        srcIdx++;
        noteExtent();
        advanceCursor();
        break;
      } else if (src[srcIdx] instanceof AST.EInitList) {
        // C11 6.7.9p11: a SCALAR's initializer may be brace-enclosed —
        // unwrap to the single expression. (Leaving the EInitList wrapper
        // on a scalar slot used to make codegen emit 0.)
        let inner = src[srcIdx];
        while (inner instanceof AST.EInitList && inner.elements.length > 0) {
          if (inner.elements.length > 1) {
            reportError(inner.loc, `excess elements in scalar initializer`);
            break;
          }
          inner = inner.elements[0];
        }
        top.output.elements[top.index] =
          inner instanceof AST.EInitList ? makeZero(slotType) : inner; // {} → zero
        srcIdx++;
        noteExtent();
        advanceCursor();
        break;
      } else if (src[srcIdx] instanceof AST.EString && slotType.isArray()) {
        // String literal for char array
        top.output.elements[top.index] = src[srcIdx];
        srcIdx++;
        noteExtent();
        advanceCursor();
        break;
      } else if (slotType.isAggregate() &&
                 src[srcIdx].type && src[srcIdx].type.removeQualifiers().isCompatibleWith(slotType.removeQualifiers())) {
        // Aggregate expression matching slot type: place directly
        top.output.elements[top.index] = src[srcIdx];
        srcIdx++;
        noteExtent();
        advanceCursor();
        break;
      } else if (slotType.isAggregate()) {
        // Brace elision: descend into aggregate without consuming srcIdx
        descend();
        continue;
      } else {
        // Scalar at scalar slot
        top.output.elements[top.index] = src[srcIdx];
        srcIdx++;
        noteExtent();
        advanceCursor();
        break;
      }
    }
  }

  // Anything left in src after the cursor ran off the end of a fixed-size
  // object is a constraint violation (C11 6.7.9p2) — it used to be
  // silently dropped.
  if (srcIdx < src.length) {
    reportError(initList.loc, `excess elements in initializer for '${containerType.toString()}'`);
  }

  // For unsized arrays, finalize type based on actual extent.
  if (containerType.isArray() && (containerType.arraySize || 0) === 0) {
    const finalSize = Math.max(maxExtent, initList.elements.length);
    const elemType = containerType.baseType;
    effectiveType = Types.arrayOf(elemType, finalSize);
    while (initList.elements.length < finalSize) initList.elements.push(null);
  }

  // fillZeros: recursively replace null elements with zero values
  function fillZeros(list, type) {
    if (type.isArray()) {
      const elemType = type.baseType;
      const sz = type.arraySize || 0;
      while (list.elements.length < sz) list.elements.push(null);
      for (let i = 0; i < sz; i++) {
        if (list.elements[i] === null) {
          if (elemType.isAggregate()) {
            const sub = new AST.EInitList(Lexer.Loc.generated(), elemType, []);
            list.elements[i] = sub;
            fillZeros(sub, elemType);
          } else {
            list.elements[i] = makeZero(elemType);
          }
        } else if (list.elements[i] instanceof AST.EInitList) {
          fillZeros(list.elements[i], elemType);
        }
      }
    } else if (type.isTag() && type.tagDecl) {
      const tag = type.tagDecl;
      if (tag.tagKind === Types.TagKind.STRUCT) {
        const members = getVarMembers(tag);
        const mc = members.length;
        while (list.elements.length < mc) list.elements.push(null);
        for (let i = 0; i < mc; i++) {
          const mt = members[i].type;
          if (list.elements[i] === null) {
            if (mt.isAggregate()) {
              const sub = new AST.EInitList(Lexer.Loc.generated(), mt, []);
              list.elements[i] = sub;
              fillZeros(sub, mt);
            } else {
              list.elements[i] = makeZero(mt);
            }
          } else if (list.elements[i] instanceof AST.EInitList) {
            fillZeros(list.elements[i], mt);
          }
        }
      } else if (tag.tagKind === Types.TagKind.UNION) {
        // Union: ensure single element exists
        if (list.elements.length === 0 || list.elements[0] === null) {
          if (list.elements.length === 0) list.elements.push(null);
          const members = getVarMembers(tag);
          const umi = list.unionMemberIndex >= 0 ? list.unionMemberIndex : 0;
          if (umi < members.length) {
            const mt = members[umi].type;
            if (mt.isAggregate()) {
              const sub = new AST.EInitList(Lexer.Loc.generated(), mt, []);
              list.elements[0] = sub;
              fillZeros(sub, mt);
            } else {
              list.elements[0] = makeZero(mt);
            }
          }
        } else if (list.elements[0] instanceof AST.EInitList) {
          const members = getVarMembers(tag);
          const umi = list.unionMemberIndex;
          if (umi >= 0 && umi < members.length) {
            fillZeros(list.elements[0], members[umi].type);
          }
        }
      }
    }
  }
  fillZeros(initList, effectiveType);
  // If the type was refined (unsized → sized array), build a new
  // EInitList sharing the now-mutated elements/designators arrays.
  if (effectiveType !== initList.type) {
    return new AST.EInitList(initList.loc, effectiveType,
      initList.elements, initList.designators, initList.unionMemberIndex);
  }
  return initList;
}

// Does this (normalized) struct init list provide elements for a trailing
// flexible array member? Mirrors computeFAMExtraSize's non-zero condition:
// static-storage FAM init sizes the object with that extra; automatic
// storage cannot (the frame slot is plain sizeOf), so callers reject it.
function initListInitializesFAM(type, initList) {
  if (!(initList instanceof AST.EInitList)) return false;
  const uq = type.removeQualifiers();
  if (!uq.isTag() || !uq.tagDecl || uq.tagDecl.tagKind !== Types.TagKind.STRUCT) return false;
  const members = uq.tagDecl.members.filter(m => m instanceof AST.DVar);
  let famIdx = -1;
  for (let i = 0; i < members.length; i++) {
    if (members[i].type.isArray() && members[i].type.arraySize === 0) famIdx = i;
  }
  if (famIdx < 0 || famIdx >= initList.elements.length) return false;
  const famElem = initList.elements[famIdx];
  if (famElem == null) return false;
  if (famElem instanceof AST.EInitList) return famElem.elements.some(e => e != null);
  return true; // EString or a scalar expression
}

// ====================
// Parser — Main Parser Class
// ====================

class Parser {
  constructor(tokens, errors, warnings) {
    this.tokens = tokens;
    this.errors = errors;
    this.warnings = warnings;
    this.pos = 0;
    this.typeScope = new AST.Scope();
    this.tagScope = new AST.Scope();
    this.varScope = new AST.Scope();
    this.anonCounter = 0;
    this.tagTypeCache = new Map();
    this.gcStructTypeCache = new Map();
    this.currentParsingFunc = null;
    this.currentCompound = null;
    this.requiredSources = new Set();
    this.exportDirectives = [];
    this.parsedExceptionTags = [];
    this.parsedLabels = new Map();
    this.pendingGotos = new Map();
    this.warningFlags = { pointerDecay: false, circularDependency: false };
  }

  // --- Lexer.Token helpers ---
  atEnd() { return this.pos >= this.tokens.length || this.tokens[this.pos].kind === Lexer.TokenKind.EOS; }
  peek(offset) {
    const i = this.pos + (offset || 0);
    if (i < 0 || i >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[i];
  }
  advance() {
    if (!this.atEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }
  atKind(kind) { return !this.atEnd() && this.peek().kind === kind; }
  atText(text) { return !this.atEnd() && this.peek().text === text; }
  atKW(kw) { return !this.atEnd() && this.peek().kind === Lexer.TokenKind.KEYWORD && this.peek().keyword === kw; }
  matchText(text) { if (this.atText(text)) { this.advance(); return true; } return false; }
  matchKW(kw) { if (this.atKW(kw)) { this.advance(); return true; } return false; }
  matchKind(kind) { if (this.atKind(kind)) { this.advance(); return true; } return false; }
  expect(text, msg) {
    if (this.atText(text)) return this.advance();
    this.error(this.peek(), msg || `Expected '${text}'`);
  }
  expectKW(kw, msg) {
    if (this.atKW(kw)) return this.advance();
    this.error(this.peek(), msg || `Expected '${kw}'`);
  }
  expectKind(kind, msg) {
    if (this.atKind(kind)) return this.advance();
    this.error(this.peek(), msg || `Expected ${kind}`);
  }
  // Token-flavored shorthands that delegate to the module-level diag pool.
  // New code should prefer reportError / reportWarning / fatalError on a
  // Loc directly; these stay because the parser has many existing callers.
  error(tok, msg) { fatalError(Lexer.Loc.fromTok(tok), msg); }
  recoverableError(tok, msg) { reportError(Lexer.Loc.fromTok(tok), msg); }
  warning(tok, msg) { reportWarning(Lexer.Loc.fromTok(tok), msg); }

  // C11 6.5.3.4p1 constraint: sizeof shall not be applied to an incomplete
  // type (todos/0227 G21). void and function types pass — GNU accepts them
  // with result 1 (TypeInfo.sizeofResult). Divergent operands come from a
  // prior recovered error; don't cascade a second diagnostic onto them.
  checkSizeofOperand(tok, type) {
    const uq = type.removeQualifiers();
    if (uq.isVoid() || uq.isFunction() || uq.isDivergent() || uq.isComplete) return;
    this.recoverableError(tok, `invalid application of 'sizeof' to an incomplete type '${uq.toString()}'`);
  }

  // --- isTypeName ---
  isTypeName() {
    const t = this.peek();
    if (t.kind === Lexer.TokenKind.KEYWORD) {
      switch (t.keyword) {
        case Lexer.Keyword.VOID: case Lexer.Keyword.BOOL: case Lexer.Keyword.CHAR:
        case Lexer.Keyword.SHORT: case Lexer.Keyword.INT: case Lexer.Keyword.LONG:
        case Lexer.Keyword.FLOAT: case Lexer.Keyword.DOUBLE:
        case Lexer.Keyword.SIGNED: case Lexer.Keyword.UNSIGNED:
        case Lexer.Keyword.STRUCT: case Lexer.Keyword.UNION: case Lexer.Keyword.ENUM:
        case Lexer.Keyword.CONST: case Lexer.Keyword.VOLATILE: case Lexer.Keyword.RESTRICT:
        case Lexer.Keyword.TYPEDEF: case Lexer.Keyword.STATIC: case Lexer.Keyword.EXTERN:
        case Lexer.Keyword.REGISTER: case Lexer.Keyword.AUTO:
        case Lexer.Keyword.INLINE: case Lexer.Keyword.NORETURN:
        case Lexer.Keyword.ALIGNAS: case Lexer.Keyword.THREAD_LOCAL:
        case Lexer.Keyword.TYPEOF: case Lexer.Keyword.TYPEOF_UNQUAL:
        case Lexer.Keyword.X_IMPORT:
        case Lexer.Keyword.X_EXTERNREF:
        case Lexer.Keyword.X_REFEXTERN:
        case Lexer.Keyword.X_EQREF:
        case Lexer.Keyword.X_STRUCT_GC:
        case Lexer.Keyword.X_ARRAY_GC:
          return true;
      }
    }
    if (t.kind === Lexer.TokenKind.IDENT) {
      const typeLevel = this.typeScope.getLevel(t.text);
      if (typeLevel !== -1) {
        const varLevel = this.varScope.getLevel(t.text);
        return typeLevel >= varLevel;
      }
    }
    return false;
  }

  // --- GCC __attribute__((...)) parsing ---
  skipBalancedParens() {
    let depth = 1;
    while (depth > 0 && !this.atEnd()) {
      if (this.matchText("(")) depth++;
      else if (this.matchText(")")) depth--;
      else this.advance();
    }
  }

  parseSingleAttribute(attrs) {
    if (this.atText(")") || this.atText(",")) return;
    const nameTok = this.advance();
    let name = nameTok.text;
    // Normalize __foo__ -> foo
    if (name.length > 4 && name.startsWith("__") && name.endsWith("__")) {
      name = name.slice(2, -2);
    }

    // --- Attributes with dedicated handling ---
    if (name === "packed") {
      attrs.packed = true;
      if (this.matchText("(")) this.skipBalancedParens();
      return;
    }
    if (name === "aligned") {
      if (this.matchText("(")) {
        if (this.atText(")")) {
          attrs.aligned = Math.max(attrs.aligned, 8);
        } else {
          const alignExpr = this.parseAssignmentExpression();
          const v = constEvalInt(alignExpr);
          if (v !== null) {
            const n = Number(v);
            // GCC: "requested alignment is not a positive power of 2".
            // 2^28 matches GCC's MAX_OFILE_ALIGNMENT-class cap; anything
            // bigger is a typo, not a request.
            if (n <= 0 || (n & (n - 1)) !== 0 || n > (1 << 28)) {
              this.error(nameTok, `aligned(${v}) is not a positive power of 2 (or exceeds the supported maximum)`);
            }
            attrs.aligned = Math.max(attrs.aligned, n);
          }
        }
        this.expect(")");
      } else {
        attrs.aligned = Math.max(attrs.aligned, 8);
      }
      return;
    }

    // --- No-arg attributes stored in flags ---
    const noArgAttrs = new Set([
      "noinline", "noipa", "always_inline", "noclone", "noreturn", "cold", "hot",
      "unused", "used",
      "const", "pure", "nothrow", "malloc",
      "no_instrument_function", "externally_visible", "may_alias",
      "flatten", "leaf",
      "returns_twice", "warn_unused_result", "deprecated", "visibility",
    ]);
    if (noArgAttrs.has(name)) {
      attrs.flags.add(name);
      if (this.matchText("(")) this.skipBalancedParens();
      return;
    }

    // --- Attributes with args that are safe to parse and store ---
    const argAttrs = new Set([
      "format", "nonnull", "optimize", "section", "sentinel",
      "alloc_size", "assume_aligned", "target",
    ]);
    if (argAttrs.has(name)) {
      attrs.flags.add(name);
      if (this.matchText("(")) this.skipBalancedParens();
      return;
    }

    // --- Attributes that change semantics — error ---
    if (name === "vector_size" || name === "mode" || name === "scalar_storage_order" ||
        name === "constructor" || name === "destructor" || name === "alias" ||
        name === "ifunc" || name === "weak") {
      if (this.matchText("(")) this.skipBalancedParens();
      this.error(nameTok, `__attribute__((${name})) is not supported`);
      return;
    }

    // --- Unknown attribute — error ---
    if (this.matchText("(")) this.skipBalancedParens();
    this.error(nameTok, `unknown __attribute__((${name}))`);
  }

  parseGCCAttributes() {
    const attrs = { packed: false, aligned: 0, flags: new Set() };
    while (this.atKW(Lexer.Keyword.X_ATTRIBUTE)) {
      this.advance();
      this.expect("(");
      this.expect("(");
      while (!this.atText(")") && !this.atEnd()) {
        this.parseSingleAttribute(attrs);
        if (!this.matchText(",")) break;
      }
      this.expect(")");
      this.expect(")");
    }
    return attrs;
  }

  // --- C23 [[...]] attribute specifiers (todos/0214) ---
  // Deliberately minimal: recognized only in the declaration-specifier
  // position (the placement the corpus uses — `[[gnu::noinline]] void f()`).
  // gnu::-prefixed names map onto the same flag bag parseGCCAttributes
  // fills; standard/unknown attributes are skipped (C23 6.7.12.1 makes
  // unknown attributes ignorable).
  atC23AttrStart() {
    return this.atText("[") && this.peek(1).text === "[";
  }
  parseC23Attributes(attrs) {
    while (this.atC23AttrStart()) {
      this.advance(); this.advance(); // [ [
      for (;;) {
        if (this.matchText(",")) continue;
        if (this.atText("]") || this.atEnd()) break;
        let name = this.advance().text;
        // attribute-token may be prefixed: `gnu::noinline` (`::` lexes as
        // one token or two `:` depending on adjacency — accept both).
        let prefixed = false;
        if (this.matchText("::")) prefixed = true;
        else if (this.atText(":") && this.peek(1).text === ":") {
          this.advance(); this.advance();
          prefixed = true;
        }
        if (prefixed) {
          const prefix = name;
          name = this.advance().text;
          if (prefix === "gnu") attrs.flags.add(name);
        }
        if (this.matchText("(")) this.skipBalancedParens();
      }
      this.expect("]"); this.expect("]");
    }
  }

  // Distill attribute flag bags into a DFunc.fnAttrs record — only the
  // inline-policy attributes are consumed today; null when none apply
  // (the common case, so most decls carry no extra object).
  _mkFnAttrs(specFlags, declFlags) {
    const has = (n) => (specFlags && specFlags.has(n)) ||
                       (declFlags && declFlags.has(n));
    const noinline = !!has("noinline");
    const alwaysInline = !!has("always_inline");
    return (noinline || alwaysInline) ? { noinline, alwaysInline } : null;
  }
  _mergeFnAttrs(a, b) {
    if (!b) return a;
    if (!a) return { noinline: b.noinline, alwaysInline: b.alwaysInline };
    if ((b.noinline && !a.noinline) || (b.alwaysInline && !a.alwaysInline)) {
      return { noinline: a.noinline || b.noinline,
               alwaysInline: a.alwaysInline || b.alwaysInline };
    }
    return a;
  }

  // --- parseDeclSpecifiers ---
  parseDeclSpecifiers() {
    let type = null;
    let storageClass = Types.StorageClass.NONE;
    let isInline = false;
    let attrFlags = null; // attribute flag names (noinline, always_inline, …)
    let requestedAlignment = 0;
    let importModule = null, importName = null;
    let isConst = false, isVolatile = false;
    let isSigned = false, isUnsigned = false;
    let longCount = 0, shortCount = 0;
    let hasChar = false, hasInt = false, hasFloat = false, hasDouble = false;
    let hasVoid = false, hasBool = false;
    let sawAuto = false;

    while (!this.atEnd()) {
      const t = this.peek();

      // Storage class specifiers
      if (this.matchKW(Lexer.Keyword.TYPEDEF)) { storageClass = Types.StorageClass.TYPEDEF; continue; }
      if (this.matchKW(Lexer.Keyword.STATIC)) { storageClass = Types.StorageClass.STATIC; continue; }
      if (this.matchKW(Lexer.Keyword.EXTERN)) { storageClass = Types.StorageClass.EXTERN; continue; }
      if (this.matchKW(Lexer.Keyword.REGISTER)) { storageClass = Types.StorageClass.REGISTER; continue; }
      if (this.matchKW(Lexer.Keyword.AUTO)) {
        // C23: `auto` is a storage-class specifier (legacy meaning) that may
        // additionally trigger type inference when no other type spec is
        // given. Per spec strict reading (matching clang), it's mutually
        // exclusive with other storage-class specifiers — `static auto x`
        // is invalid. For `static`-with-inference, write `static int x` etc.
        if (storageClass !== Types.StorageClass.NONE) {
          this.error(this.peek(-1),
            `'auto' cannot be combined with another storage-class specifier`);
        }
        storageClass = Types.StorageClass.AUTO;
        sawAuto = true;
        continue;
      }
      if (this.matchKW(Lexer.Keyword.X_IMPORT)) {
        storageClass = Types.StorageClass.IMPORT;
        if (this.atText("(")) {
          this.advance();
          const first = this.expectKind(Lexer.TokenKind.STRING);
          if (this.matchText(",")) {
            const second = this.expectKind(Lexer.TokenKind.STRING);
            importModule = first.text.replace(/^"(.*)"$/, '$1');
            importName = second.text.replace(/^"(.*)"$/, '$1');
          } else {
            importModule = first.text.replace(/^"(.*)"$/, '$1');
          }
          this.expect(")");
        }
        continue;
      }

      // Qualifiers
      if (this.matchKW(Lexer.Keyword.CONST)) { isConst = true; continue; }
      if (this.matchKW(Lexer.Keyword.VOLATILE)) { isVolatile = true; continue; }
      if (this.matchKW(Lexer.Keyword.RESTRICT)) { continue; } // ignore restrict

      // Function specifiers
      if (this.matchKW(Lexer.Keyword.INLINE)) { isInline = true; continue; }
      if (this.matchKW(Lexer.Keyword.NORETURN)) { continue; }
      if (this.matchKW(Lexer.Keyword.THREAD_LOCAL)) { continue; }
      if (this.atKW(Lexer.Keyword.X_ATTRIBUTE)) {
        const attrs = this.parseGCCAttributes();
        if (attrs.aligned > requestedAlignment) requestedAlignment = attrs.aligned;
        for (const f of attrs.flags) (attrFlags || (attrFlags = new Set())).add(f);
        continue;
      }
      // C23 [[...]] attribute specifiers in the declaration-specifier
      // position ([[gnu::noinline]] void f(...)) — todos/0214. gnu::-
      // prefixed names land in the same flag bag as __attribute__.
      if (this.atC23AttrStart()) {
        const attrs = { packed: false, aligned: 0, flags: new Set() };
        this.parseC23Attributes(attrs);
        for (const f of attrs.flags) (attrFlags || (attrFlags = new Set())).add(f);
        continue;
      }

      // _Alignas
      if (this.matchKW(Lexer.Keyword.ALIGNAS)) {
        const alignTok = this.peek(-1);
        this.expect("(");
        let alignVal;
        if (this.isTypeName()) {
          const alignType = this.parseDeclSpecifiers().type;
          alignVal = alignType.align;
        } else {
          const alignExpr = this.parseAssignmentExpression();
          alignVal = Number(constEvalInt(alignExpr) ?? 0n);
        }
        this.expect(")");
        if (alignVal < 0 || (alignVal & (alignVal - 1)) !== 0) {
          this.error(alignTok, "_Alignas value must be a positive power of 2");
        }
        // C11 6.2.8: extended alignments (> max_align_t = 8 on wasm32) are
        // implementation-defined. This compiler honors them for both static
        // storage (data section, region base 64 KiB-aligned) and automatic
        // storage (over-aligned frame slot — same path as the already-uncapped
        // __attribute__((aligned(N)))), so `_Alignas` no longer caps at 8
        // (todos/0194). Guard only the data-section alignment ceiling here.
        if (alignVal > 65536) {
          this.error(alignTok, `_Alignas(${alignVal}) exceeds maximum supported alignment of 65536`);
        }
        if (alignVal > requestedAlignment) requestedAlignment = alignVal;
        continue;
      }

      // _Static_assert
      if (this.matchKW(Lexer.Keyword.STATIC_ASSERT)) {
        this.expect("(");
        const condExpr = this.parseAssignmentExpression();
        let msg = "";
        if (this.matchText(",")) {
          const msgTok = this.expectKind(Lexer.TokenKind.STRING);
          msg = msgTok.text.replace(/^"(.*)"$/, '$1');
        }
        this.expect(")");
        this.expect(";");
        const val = constEvalInt(condExpr);
        if (val === 0n) this.recoverableError(this.peek(-1) || this.peek(), `_Static_assert failed: ${msg}`);
        continue;
      }

      // Type specifiers
      if (this.matchKW(Lexer.Keyword.VOID)) { hasVoid = true; continue; }
      if (this.matchKW(Lexer.Keyword.BOOL)) { hasBool = true; continue; }
      if (this.matchKW(Lexer.Keyword.CHAR)) { hasChar = true; continue; }
      if (this.matchKW(Lexer.Keyword.SHORT)) { shortCount++; continue; }
      if (this.matchKW(Lexer.Keyword.INT)) { hasInt = true; continue; }
      if (this.matchKW(Lexer.Keyword.LONG)) { longCount++; continue; }
      if (this.matchKW(Lexer.Keyword.FLOAT)) { hasFloat = true; continue; }
      if (this.matchKW(Lexer.Keyword.DOUBLE)) { hasDouble = true; continue; }
      if (this.matchKW(Lexer.Keyword.SIGNED)) { isSigned = true; continue; }
      if (this.matchKW(Lexer.Keyword.UNSIGNED)) { isUnsigned = true; continue; }
      if (this.matchKW(Lexer.Keyword.X_EXTERNREF)) { type = Types.TEXTERNREF; continue; }
      if (this.matchKW(Lexer.Keyword.X_REFEXTERN)) { type = Types.TREFEXTERN; continue; }
      if (this.matchKW(Lexer.Keyword.X_EQREF)) { type = Types.TEQREF; continue; }

      // GC struct/array (WASM GC extension)
      if (this.atKW(Lexer.Keyword.X_STRUCT_GC)) {
        type = this.parseGCStructSpecifier();
        continue;
      }
      if (this.atKW(Lexer.Keyword.X_ARRAY_GC)) {
        type = this.parseGCArraySpecifier();
        continue;
      }

      // typeof / typeof_unqual / __typeof__ (C23 + GCC). Acts as a type
      // specifier — yields the type of an expression (without lvalue/decay
      // conversion) or a type name. typeof_unqual additionally strips
      // const/volatile from the result.
      if (this.atKW(Lexer.Keyword.TYPEOF) || this.atKW(Lexer.Keyword.TYPEOF_UNQUAL)) {
        const isUnqual = this.atKW(Lexer.Keyword.TYPEOF_UNQUAL);
        const tok = this.peek();
        this.advance();
        this.expect("(");
        let resolved;
        if (this.isTypeName()) {
          const specs = this.parseDeclSpecifiers();
          resolved = specs.type;
          if (this.atText("*") || this.atText("[") || this.atText("(")) {
            const decl = this.parseDeclarator(resolved);
            resolved = decl.type;
          }
        } else {
          const expr = this.parseExpression();
          resolved = expr.type;
        }
        this.expect(")");
        if (isUnqual) resolved = resolved.removeQualifiers();
        type = resolved;
        continue;
      }

      // struct/union/enum
      if (this.atKW(Lexer.Keyword.STRUCT) || this.atKW(Lexer.Keyword.UNION)) {
        type = this.parseTagSpecifier();
        continue;
      }
      if (this.atKW(Lexer.Keyword.ENUM)) {
        type = this.parseEnumSpecifier();
        continue;
      }

      // typedef name — only if no base type specifiers already seen
      const hasBase = hasVoid || hasBool || hasChar || hasInt || hasFloat || hasDouble ||
          shortCount > 0 || longCount > 0 || isSigned || isUnsigned;
      if (t.kind === Lexer.TokenKind.IDENT && this.typeScope.has(t.text) && type === null && !hasBase) {
        this.advance();
        type = this.typeScope.get(t.text);
        continue;
      }

      // __attribute__ can appear after base type too
      if (this.atKW(Lexer.Keyword.X_ATTRIBUTE)) {
        const attrs = this.parseGCCAttributes();
        if (attrs.aligned > requestedAlignment) requestedAlignment = attrs.aligned;
        for (const f of attrs.flags) (attrFlags || (attrFlags = new Set())).add(f);
        continue;
      }

      break; // not a decl specifier
    }

    // Resolve type from accumulated specifiers
    if (type === null) {
      const hasBase = hasVoid || hasBool || hasChar || hasInt || hasFloat || hasDouble ||
          shortCount > 0 || longCount > 0 || isSigned || isUnsigned;
      // C23: bare `auto` (no other type spec) means type-inference. The actual
      // type is filled in by the declarator/init handler.
      if (sawAuto && !hasBase) {
        type = Types.TAUTO;
        // `auto` here was consumed as a storage class above; for the inference
        // role it should be treated as 'auto storage' (the legacy meaning),
        // which is the default for locals — leave storageClass as AUTO so it
        // still resolves naturally.
      } else if (hasVoid) type = Types.TVOID;
      else if (hasBool) type = Types.TBOOL;
      else if (hasChar) type = isSigned ? Types.TSCHAR : (isUnsigned ? Types.TUCHAR : Types.TCHAR);
      else if (shortCount > 0) type = isUnsigned ? Types.TUSHORT : Types.TSHORT;
      else if (hasFloat) type = Types.TFLOAT;
      else if (hasDouble) type = longCount > 0 ? Types.TLDOUBLE : Types.TDOUBLE;
      else if (longCount >= 2) type = isUnsigned ? Types.TULLONG : Types.TLLONG;
      else if (longCount === 1) type = isUnsigned ? Types.TULONG : Types.TLONG;
      else if (isUnsigned) type = Types.TUINT;
      else {
        if (!hasBase && !this._allowImplicitInt) {
          this.error(this.peek(), "type specifier missing (implicit int is not allowed in C99)");
        }
        type = Types.TINT;
      }
    }

    // In C, enum types are compatible with int. Erase enum types to int
    // early so codegen never needs to handle them as a special case. Keep
    // the pre-erasure enum around: an enum *bit-field* must follow the
    // enum's compatible-type signedness for its read extension (C11
    // 6.7.2.2p4 — clang/gcc make an all-non-negative enum unsigned int, so
    // the field zero-extends). See emitBitFieldLoad / todos/0189.
    const enumType = type.isEnum() ? type : null;
    if (type.isEnum()) type = Types.TINT;

    if (isConst) type = type.addConst();
    if (isVolatile) type = type.addVolatile();

    return { type, enumType, storageClass, isInline, attrFlags, requestedAlignment, importModule, importName };
  }

  // --- Tag specifier (struct/union) ---
  parseTagSpecifier() {
    let tagKind;
    // The `#pragma pack` cap in effect at this keyword (stamped by
    // postProcess; 0 = natural alignment). todos/0191.
    const pragmaPack = this.peek().packValue || 0;
    if (this.matchKW(Lexer.Keyword.STRUCT)) tagKind = Types.TagKind.STRUCT;
    else { this.advance(); tagKind = Types.TagKind.UNION; }

    // Parse optional __attribute__ after struct/union keyword
    const tagAttrs = this.parseGCCAttributes();

    let name = null;

    if (this.atKind(Lexer.TokenKind.IDENT)) {
      name = this.advance().text;
    }

    if (this.matchText("{")) {
      // Tag body definition. Each definition declares a DISTINCT type in
      // the current scope (C11 6.7.2.3p5): an inner-scope `struct S {...}`
      // shadows — never mutates — an outer `struct S`. The only object we
      // may complete in place is a forward declaration made in THIS scope
      // (so `struct S; struct S *p; struct S {...};` keeps one identity).
      if (!name) name = "__anon_" + this.anonCounter++;
      let tagType;
      const existing = this.tagScope.getInCurrentScope(name);
      if (existing !== undefined && existing.tagKind === tagKind && !existing.isComplete) {
        tagType = existing; // complete the same-scope forward declaration
      } else {
        if (existing !== undefined) {
          this.recoverableError(this.peek(),
            existing.tagKind === tagKind
              ? `redefinition of '${tagKind === Types.TagKind.STRUCT ? "struct" : "union"} ${name}'`
              : `'${name}' defined as wrong kind of tag`);
        }
        tagType = Types.createTagType(tagKind, name);
        // Bind before parsing members so `struct S { struct S *next; }`
        // resolves the self-reference to this definition.
        if (existing !== undefined) this.tagScope.replaceInCurrentScope(name, tagType);
        else this.tagScope.set(name, tagType);
      }
      const members = [];

      // Create tag decl
      const tagDecl = new AST.DTag({ filename: this.peek().filename, line: this.peek().line },
        tagKind, name, true, members);

      // Parse members
      while (!this.atEnd() && !this.atText("}")) {
        if (this.matchText(";")) continue;
        // C11 6.7.2.1p1: _Static_assert is allowed as a struct-declaration
        if (this.matchKW(Lexer.Keyword.STATIC_ASSERT)) {
          this.expect("(");
          const condExpr = this.parseAssignmentExpression();
          let msg = "";
          if (this.matchText(",")) {
            const msgTok = this.expectKind(Lexer.TokenKind.STRING);
            msg = msgTok.text.replace(/^"(.*)"$/, '$1');
          }
          this.expect(")");
          this.expect(";");
          const val = constEvalInt(condExpr);
          // constEvalInt returns a BigInt — compare against 0n (a bare 0
          // here silently disabled every in-struct _Static_assert).
          if (val === 0n) this.recoverableError(this.peek(-1) || this.peek(), `_Static_assert failed: ${msg}`);
          continue;
        }
        const memSpecs = this.parseDeclSpecifiers();
        let memType = memSpecs.type;

        if (this.atText(";")) {
          // Anonymous struct/union member — create unnamed DVar
          if (memType.isTag()) {
            const mVar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
              null, memType, Types.StorageClass.NONE, null);
            members.push(mVar);
          }
          this.advance();
          continue;
        }

        // Parse member declarators
        let first = true;
        while (!this.atEnd()) {
          if (!first) { if (!this.matchText(",")) break; }
          first = false;

          // Bitfield without declarator (anonymous bitfield)
          if (this.atText(":")) {
            this.advance();
            const widthExpr = this.parseAssignmentExpression();
            const bitW = Number(constEvalInt(widthExpr) ?? 0n);
            const mVar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
              null, memType, Types.StorageClass.NONE, null);
            mVar.bitWidth = bitW;
            members.push(mVar);
            break; // anonymous bit-fields end the declarator list
          }

          const { type: mType, name: mName } = this.parseDeclarator(memType);
          if (mType.removeQualifiers().isRef()) {
            this.error(this.peek(), `${mType.removeQualifiers().toString()} cannot be used as a struct/union member`);
          }
          Types.validateNoHeapInValueType(mType, msg => this.error(this.peek(), msg));

          // A struct/union member must have complete type (C11 6.7.2.1p3); the
          // only exception (the trailing flexible array member) is an
          // incomplete *array* and is validated separately below. Reject a
          // member whose type — possibly nested in arrays — is an incomplete
          // struct/union. Silently accepting it sizes the member as 0, which
          // under-allocates the aggregate; a TU that later sees the full
          // definition then writes past the storage and corrupts memory.
          {
            let elem = mType.removeQualifiers();
            while (elem.isArray()) elem = elem.baseType.removeQualifiers();
            if (elem.isAggregate() && !elem.isArray() && !elem.isComplete) {
              this.error(this.peek(),
                `field '${mName || ""}' has incomplete type '${elem.toString()}'`);
            }
          }

          // Parse __attribute__ after member declarator
          const memAttrs = this.parseGCCAttributes();
          if (memAttrs.aligned > 0 && memSpecs.requestedAlignment < memAttrs.aligned) {
            memSpecs.requestedAlignment = memAttrs.aligned;
          }

          // Check for bitfield
          let bitWidth = -1;
          if (this.matchText(":")) {
            const widthExpr = this.parseAssignmentExpression();
            bitWidth = Number(constEvalInt(widthExpr) ?? 0n);
            if (!mType.isInteger || !mType.isInteger()) {
              this.error(this.peek(-1), "Bit-field must have integer type");
            } else if (mType.size > 8) {
              this.error(this.peek(-1), "Bit-field storage type must be at most 8 bytes");
            }
            if (bitWidth > mType.size * 8) {
              this.error(this.peek(-1), `Bit-field width ${bitWidth} exceeds storage type's ${mType.size * 8} bits`);
            }
          }

          const mVar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
            mName, mType, Types.StorageClass.NONE, null);
          mVar.bitWidth = bitWidth;
          // An enum bit-field reads back with the signedness of the enum's
          // compatible type, not of the erased `int` (todos/0189). The enum
          // is erased to int in parseDeclSpecifiers; carry the original for
          // emitBitFieldLoad's sign/zero-extension choice.
          if (bitWidth >= 0 && memSpecs.enumType) mVar.enumBitField = memSpecs.enumType;
          if (memSpecs.requestedAlignment > 0) {
            if (bitWidth >= 0) {
              this.error(this.peek(), "_Alignas cannot be applied to a bit-field");
            }
            if (memSpecs.requestedAlignment < (mType.align || 1)) {
              this.error(this.peek(), `_Alignas cannot reduce alignment below natural alignment of type '${mType.toString()}'`);
            }
            mVar.requestedAlignment = memSpecs.requestedAlignment;
          }
          members.push(mVar);
        }
        this.expect(";");
      }
      this.expect("}");

      // Parse __attribute__ after closing }
      const postTagAttrs = this.parseGCCAttributes();
      if (tagAttrs.packed || postTagAttrs.packed) tagDecl.isPacked = true;

      // Effective pack cap (bytes): `__attribute__((packed))` is the strongest
      // (byte-tight, cap 1); otherwise the `#pragma pack(N)` cap in effect.
      const packAlign = tagDecl.isPacked ? 1 : pragmaPack;

      // Compute layout
      if (tagKind === Types.TagKind.STRUCT) {
        const layout = Types.computeStructLayout(members, packAlign);
        tagType.size = layout.size;
        tagType.align = layout.align;
      } else if (tagKind === Types.TagKind.UNION) {
        const layout = Types.computeUnionLayout(members, packAlign);
        tagType.size = layout.size;
        tagType.align = layout.align;
      }
      // Tag-level __attribute__((aligned(N))) — either position (after the
      // struct/union keyword or after the closing brace) — raises the TYPE's
      // alignment, with sizeof padded up to it (todos/0216: it used to land
      // only on the declaration's requestedAlignment, so _Alignof/sizeof of
      // the type ignored it). aligned() can only increase alignment; a
      // reduction needs packed (GCC semantics, matches clang).
      const tagAligned = Math.max(tagAttrs.aligned, postTagAttrs.aligned);
      if (tagAligned > tagType.align) {
        tagType.align = tagAligned;
        tagType.size = (tagType.size + tagAligned - 1) & ~(tagAligned - 1);
      }
      tagType.isComplete = true;
      tagType.tagDecl = tagDecl;
      tagDecl.members = members;

      // Validate flexible array members (C99). With
      // --allow-zero-length-arrays, the legacy GCC zero-length-array
      // extension is permitted: multiple `arr[0]` members, in unions,
      // and not necessarily last. Their sizeof is 0 so the struct/
      // union layout still works.
      if (!this._allowZeroLengthArrays) {
        let foundFAM = false, famIdx = -1;
        const varMembers = members.filter(m => m instanceof AST.DVar);
        for (let i = 0; i < varMembers.length; i++) {
          const mv = varMembers[i];
          if (mv.type.isArray() && mv.type.arraySize === 0) {
            if (tagKind === Types.TagKind.UNION) {
              this.error(this.peek(), "flexible array member not allowed in a union");
            }
            if (foundFAM) {
              this.error(this.peek(), "only one flexible array member is allowed per struct");
            }
            foundFAM = true;
            famIdx = i;
          }
        }
        if (foundFAM && famIdx < varMembers.length - 1) {
          this.error(this.peek(), "flexible array member must be the last member of a struct");
        }
      }

      // Propagate updates to existing const/volatile variants
      const propagate = (variant) => {
        if (!variant) return;
        variant.size = tagType.size;
        variant.align = tagType.align;
        variant.isComplete = true;
        variant.tagDecl = tagDecl;
      };
      propagate(tagType._constVariant);
      propagate(tagType._volatileVariant);
      if (tagType._constVariant) propagate(tagType._constVariant._volatileVariant);
      if (tagType._volatileVariant) propagate(tagType._volatileVariant._constVariant);

      // (already bound into tagScope before member parsing)
      return tagType;
    }

    // Forward declaration or reference
    if (!name) this.error(this.peek(), "Expected tag name or '{'");
    let tagType = this.tagScope.get(name);
    if (!tagType) {
      tagType = Types.getOrCreateTagType(this.tagTypeCache, tagKind, name);
      this.tagScope.set(name, tagType);
    }
    return tagType;
  }

  // --- GC struct specifier: __struct [Name] [{ member; member; ... }] ---
  parseGCStructSpecifier() {
    this.advance(); // consume '__struct'
    let name = null;
    if (this.atKind(Lexer.TokenKind.IDENT)) name = this.advance().text;

    if (this.matchText("{")) {
      // GC struct definition
      if (!name) name = "__anon_gc_" + this.anonCounter++;
      const gcType = Types.getOrCreateGCStructType(this.gcStructTypeCache, name);
      const members = [];
      const tagDecl = new AST.DTag({ filename: this.peek().filename, line: this.peek().line },
        Types.TagKind.GC_STRUCT, name, true, members);
      // Optional __extends(__struct Parent); — must be the very first body statement.
      let parentType = null;
      if (this.atKW(Lexer.Keyword.X_EXTENDS)) {
        const extTok = this.peek();
        this.advance();
        this.expect("(");
        if (!this.atKW(Lexer.Keyword.X_STRUCT_GC)) {
          this.error(extTok, "__extends(...) requires a __struct type");
        }
        parentType = this.parseGCStructSpecifier();
        // Heap form only — reject `__extends(__struct Foo *)`.
        if (this.atText("*")) {
          this.error(this.peek(), "__extends(...) takes a heap-type spelling — write '__extends(__struct Foo)' without '*'");
        }
        this.expect(")");
        this.expect(";");
        if (!parentType.isGCStructHeap() || !parentType.isComplete) {
          this.error(extTok, `__extends parent must be a complete __struct, got '${parentType.toString()}'`);
        }
      }
      while (!this.atEnd() && !this.atText("}")) {
        if (this.matchText(";")) continue;
        const memSpecs = this.parseDeclSpecifiers();
        let memBaseType = memSpecs.type;
        let firstM = true;
        while (!this.atEnd()) {
          if (!firstM) { if (!this.matchText(",")) break; }
          firstM = false;
          const { type: mType, name: mName } = this.parseDeclarator(memBaseType);
          if (!mName) this.error(this.peek(), "GC struct members must be named");
          if (mType.isArray()) {
            this.error(this.peek(), "C arrays are not allowed as GC struct members; use __array(T) instead");
          }
          if (mType.isFunction()) {
            this.error(this.peek(), "function types are not allowed as GC struct members");
          }
          Types.validateNoHeapInValueType(mType, msg => this.error(this.peek(), msg));
          const mVar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
            mName, mType, Types.StorageClass.NONE, null);
          members.push(mVar);
        }
        this.expect(";");
      }
      this.expect("}");
      // Validate prefix: child's first N fields must match parent's fields exactly
      // by name and type (WASM GC subtype rule — fields can't be reordered or
      // re-typed, only appended).
      if (parentType) {
        const parentMembers = parentType.tagDecl.members;
        if (members.length < parentMembers.length) {
          this.error(this.peek(-1),
            `__struct ${name} extends '${parentType.tagName}' but has only ${members.length} fields (parent has ${parentMembers.length})`);
        }
        for (let i = 0; i < parentMembers.length; i++) {
          const p = parentMembers[i], c = members[i];
          if (p.name !== c.name) {
            this.error(this.peek(-1),
              `__struct ${name}: field #${i} must be named '${p.name}' to match parent '${parentType.tagName}', got '${c.name}'`);
          }
          if (!p.type.isCompatibleWith(c.type)) {
            this.error(this.peek(-1),
              `__struct ${name}: field '${c.name}' must have type '${p.type.toString()}' to match parent '${parentType.tagName}', got '${c.type.toString()}'`);
          }
        }
      }
      // Assign field indices
      for (let i = 0; i < members.length; i++) members[i].byteOffset = i;
      gcType.tagDecl = tagDecl;
      gcType.isComplete = true;
      gcType.parentType = parentType;
      // The ref form (`__struct Foo *`), if previously created during a
      // forward reference, reads tagDecl/isComplete through getters that
      // delegate to the heap — no sync needed.
      this.tagScope.set(name, gcType);
      return gcType;
    }

    // Forward reference
    if (!name) this.error(this.peek(), "Expected GC struct name or '{'");
    let gcType = this.tagScope.get(name);
    if (!gcType || !gcType.isGCStructHeap()) {
      gcType = Types.getOrCreateGCStructType(this.gcStructTypeCache, name);
      this.tagScope.set(name, gcType);
    }
    return gcType;
  }

  // --- GC array specifier: __array(ElementType) ---
  parseGCArraySpecifier() {
    this.advance(); // consume '__array'
    this.expect("(");
    const elemSpecs = this.parseDeclSpecifiers();
    let elemType = elemSpecs.type;
    if (this.atText("*") || this.atText("[") || this.atText("(")) {
      const decl = this.parseDeclarator(elemType);
      elemType = decl.type;
    }
    this.expect(")");
    if (elemType.isArray()) {
      this.error(this.peek(), "C arrays are not allowed as __array element type");
    }
    if (elemType.isFunction()) {
      this.error(this.peek(), "function types are not allowed as __array element type");
    }
    return Types.gcArrayOf(elemType);
  }

  // --- Enum specifier ---
  parseEnumSpecifier() {
    this.advance(); // consume 'enum'
    let name = null;
    // Tag names live in the tag namespace, distinct from typedef names
    // (C99 6.2.3). A `typedef enum X X;` forward declaration must not
    // prevent us from later defining `enum X { ... }`.
    if (this.atKind(Lexer.TokenKind.IDENT)) {
      name = this.advance().text;
    }

    if (this.matchText("{")) {
      if (!name) name = "__anon_" + this.anonCounter++;
      // Same scoping rule as struct/union definitions (C11 6.7.2.3p5): a
      // definition declares a distinct type in the current scope; only a
      // same-scope forward reference may be completed in place.
      let tagType;
      const existing = this.tagScope.getInCurrentScope(name);
      if (existing !== undefined && existing.tagKind === Types.TagKind.ENUM && !existing.tagDecl) {
        tagType = existing;
      } else {
        if (existing !== undefined) {
          this.recoverableError(this.peek(),
            existing.tagKind === Types.TagKind.ENUM
              ? `redefinition of 'enum ${name}'`
              : `'${name}' defined as wrong kind of tag`);
        }
        tagType = Types.createTagType(Types.TagKind.ENUM, name);
        if (existing !== undefined) this.tagScope.replaceInCurrentScope(name, tagType);
        else this.tagScope.set(name, tagType);
      }
      tagType.size = 4; tagType.align = 4; tagType.isComplete = true;
      const tagDecl = new AST.DTag({ filename: this.peek().filename, line: this.peek().line },
        Types.TagKind.ENUM, name, true, []);

      let nextVal = 0n;
      while (!this.atEnd() && !this.atText("}")) {
        const eNameTok = this.expectKind(Lexer.TokenKind.IDENT);
        const eName = eNameTok.text;
        let val = nextVal;
        if (this.matchText("=")) {
          const valExpr = this.parseAssignmentExpression();
          const cv = constEvalInt(valExpr);
          if (cv === null) {
            // C11 6.7.2.2p2: the expression SHALL be an integer constant
            // expression — a failed eval used to silently fall back to
            // the running counter (miscompile, not just accepts-invalid).
            this.recoverableError(eNameTok,
              `enumerator '${eName}' value is not an integer constant expression`);
            val = nextVal; // keep parsing coherently
          } else {
            val = cv;
          }
        }
        // C11 6.7.2.2p2 wants each enumerator representable as int; this
        // project follows the gcc/clang extension where values up to
        // UINT_MAX get type unsigned int (silently wrapping them to a
        // NEGATIVE int was the bug — it flipped bit-31 flag enums).
        // Anything outside 32 bits is diagnosed.
        let ecType = Types.TINT;
        if (val > 2147483647n && val <= 4294967295n) {
          ecType = Types.TUINT;
        } else if (val < -2147483648n || val > 4294967295n) {
          this.recoverableError(eNameTok,
            `enumerator '${eName}' value ${val} does not fit in 32 bits`);
          val = Types.truncateConstInt(val, Types.TINT); // keep parsing coherently
        }
        nextVal = val + 1n;
        const ec = new AST.DEnumConst({ filename: this.peek().filename, line: this.peek().line }, eName, val, ecType);
        tagDecl.members.push(ec);
        // Register enum constant in varScope
        this.varScope.set(eName, ec);
        if (!this.matchText(",")) break;
      }
      this.expect("}");
      tagType.tagDecl = tagDecl;
      return tagType;
    }

    if (!name) this.error(this.peek(), "Expected enum name or '{'");
    let tagType = this.tagScope.get(name);
    if (!tagType) {
      tagType = Types.getOrCreateTagType(this.tagTypeCache, Types.TagKind.ENUM, name);
      this.tagScope.set(name, tagType);
    }
    return tagType;
  }

  // --- Declarator parsing ---

  isStartOfParamList() {
    // Look ahead to determine if ( starts a parameter list or a grouping paren
    // This is the ambiguity between function declarator and parenthesized declarator
    const saved = this.pos;
    this.advance(); // skip (

    // Empty parens or void = parameter list
    if (this.atText(")")) { this.pos = saved; return true; }
    if (this.isTypeName()) { this.pos = saved; return true; }
    if (this.atText("...")) { this.pos = saved; return true; }

    this.pos = saved;
    return false;
  }

  combineDeclaratorTypes(innerType, outerBase, outerResult, innerPtrCount) {
    // For parenthesized declarators: replace the base in inner with outerResult.
    // Handles things like: int (*fp)(void) where inner = *<base>, outer suffix = (void).
    // We need to replace the deepest base in inner with outerResult.
    //
    // Special case: GC ref types collapse `*` (so inner.type may equal
    // outerBase even when the user wrote `*`s). innerPtrCount tells us how
    // many were consumed at the top of the inner declarator — re-apply them
    // to outerResult so things like `__eqref (*fn)(int)` get the right
    // pointer-to-function-returning-eqref type rather than just function.
    if (innerType === outerBase) {
      let r = outerResult;
      if (innerPtrCount) {
        for (let i = 0; i < innerPtrCount; i++) r = r.pointer();
      }
      return r;
    }
    if (innerType.isPointer()) {
      const newBase = this.combineDeclaratorTypes(innerType.baseType, outerBase, outerResult);
      const result = newBase.pointer();
      if (innerType.isConst) return result.addConst();
      if (innerType.isVolatile) return result.addVolatile();
      return result;
    }
    if (innerType.isArray()) {
      const newBase = this.combineDeclaratorTypes(innerType.baseType, outerBase, outerResult);
      return Types.arrayOf(newBase, innerType.arraySize);
    }
    if (innerType.isFunction()) {
      // Function declarator returning a derived type, e.g.
      // int (*pick(int))(int) — inner is fn(int) -> <hole>, where the
      // hole (the return type) recombines with the outer suffix to
      // become pointer-to-fn(int)->int. Without this case the inner
      // function type passed through unchanged and pick "returned" int*.
      const newRet = this.combineDeclaratorTypes(innerType.returnType, outerBase, outerResult);
      return Types.functionType(newRet, innerType.paramTypes, innerType.isVarArg, innerType.hasUnspecifiedParams);
    }
    return innerType;
  }

  // --- Expression parsing ---

  parsePrimaryExpression() {
    const t = this.peek();

    // Integer literal (includes char literals converted by Lexer.postProcess)
    if (t.kind === Lexer.TokenKind.INT) {
      this.advance();
      let type = Types.TINT;
      const val = t.integer;  // keep as BigInt for full precision
      // Check for char literal prefixes (Lexer.postProcess converts CHAR -> INT)
      if (t.flags.stringPrefix === Lexer.StringPrefix.PREFIX_u) type = Types.TUSHORT;
      else if (t.flags.stringPrefix === Lexer.StringPrefix.PREFIX_U || t.flags.stringPrefix === Lexer.StringPrefix.PREFIX_L) type = Types.TINT;
      else {
        // C99 §6.4.4.1: Determine type from suffix, then promote based on value.
        if (t.flags.isUnsigned && t.flags.isLongLong) type = Types.TULLONG;
        else if (t.flags.isUnsigned && t.flags.isLong) type = Types.TULONG;
        else if (t.flags.isUnsigned) type = Types.TUINT;
        else if (t.flags.isLongLong) type = Types.TLLONG;
        else if (t.flags.isLong) type = Types.TLONG;

        const isDecimal = t.flags.isDecimal;
        const fitsI32 = val <= 0x7FFFFFFFn;
        const fitsU32 = val <= 0xFFFFFFFFn;
        const fitsI64 = val <= 0x7FFFFFFFFFFFFFFFn;
        // A decimal constant that fits no SIGNED candidate type (> LLONG_MAX)
        // but fits unsigned long long: C11 6.4.4.1p5's candidate list is
        // signed-only, so this is ill-formed — but gcc/clang extend it to
        // `unsigned long long` with a warning rather than silently wrapping
        // it negative (todos/0192; the old `isDecimal ? TLLONG` wrapped it,
        // flipping the signedness of every surrounding conversion).
        const oorDecimalToULL = () => {
          this.warning(t, `integer constant ${val} is so large that it is unsigned`);
          return Types.TULLONG;
        };

        if (!t.flags.isUnsigned && !t.flags.isLong && !t.flags.isLongLong) {
          if (fitsI32) type = Types.TINT;
          else if (!isDecimal && fitsU32) type = Types.TUINT;
          else if (fitsI64) type = Types.TLLONG;
          else type = isDecimal ? oorDecimalToULL() : Types.TULLONG;
        } else if (t.flags.isUnsigned && !t.flags.isLong && !t.flags.isLongLong) {
          if (fitsU32) type = Types.TUINT;
          else type = Types.TULLONG;
        } else if (!t.flags.isUnsigned && t.flags.isLong && !t.flags.isLongLong) {
          if (fitsI32) type = Types.TLONG;
          else if (!isDecimal && fitsU32) type = Types.TULONG;
          else if (fitsI64) type = Types.TLLONG;
          else type = isDecimal ? oorDecimalToULL() : Types.TULLONG;
        } else if (t.flags.isUnsigned && t.flags.isLong && !t.flags.isLongLong) {
          if (fitsU32) type = Types.TULONG;
          else type = Types.TULLONG;
        } else if (!t.flags.isUnsigned && t.flags.isLongLong) {
          if (fitsI64) type = Types.TLLONG;
          else type = isDecimal ? oorDecimalToULL() : Types.TULLONG;
        }
        // ULL: always Types.TULLONG, already set
      }
      return new AST.EInt(Lexer.Loc.fromTok(t), type, val);
    }

    // Float literal
    if (t.kind === Lexer.TokenKind.FLOAT) {
      this.advance();
      let type = Types.TDOUBLE;
      if (t.flags.isFloat) type = Types.TFLOAT;
      else if (t.flags.isLong) type = Types.TLDOUBLE;
      return new AST.EFloat(Lexer.Loc.fromTok(t), type, t.floating);
    }

    // Note: CHAR tokens are converted to INT by Lexer.postProcess, handled above

    // String literal (with concatenation)
    if (t.kind === Lexer.TokenKind.STRING) {
      return this.parseStringLiteral();
    }

    // Identifier
    if (t.kind === Lexer.TokenKind.IDENT) {
      this.advance();
      const name = t.text;
      const loc = Lexer.Loc.fromTok(t);
      // Check __func__ / __FUNCTION__
      if ((name === "__func__" || name === "__FUNCTION__") && this.currentParsingFunc) {
        const funcName = this.currentParsingFunc.name;
        const bytes = [];
        for (let i = 0; i < funcName.length; i++) bytes.push(funcName.charCodeAt(i));
        bytes.push(0);
        return new AST.EString(loc, Types.arrayOf(Types.TCHAR, bytes.length), bytes);
      }
      // Implicit function declaration: C89 allowed calling undeclared functions.
      // Gated behind --allow-implicit-function-decl / --allow-old-c. We
      // create the decl ourselves here so makeIdent's lookup succeeds.
      if (!this.varScope.get(name) && this._allowImplicitFunctionDecl && this.atText("(")) {
        // C89 semantics: the implicit declaration is `extern int name()` —
        // return int, UNSPECIFIED params (calls get the default argument
        // promotions, not a ()-means-(void) arity check). Register it with
        // the enclosing function like a block-scope `extern` declaration so
        // it reaches the unit's declared-function list — the linker stitches
        // `.definition` to a cross-TU definition there (or reports a real
        // undefined-symbol error); an unregistered decl skipped linking
        // entirely and codegen ICE'd on the unstitched node (todos/0158).
        const ftype = Types.functionType(Types.TINT, [], false, true);
        const fdecl = new AST.DFunc({ filename: t.filename, line: t.line }, name, ftype, [], Types.StorageClass.EXTERN, false, null);
        this.varScope.set(name, fdecl);
        if (this.currentParsingFunc) this.currentParsingFunc.externLocalFuncs.push(fdecl);
      }
      return AST.makeIdent(loc, name, this.varScope);
    }

    // Parenthesized expression or compound literal
    if (t.kind === Lexer.TokenKind.PUNCT && t.text === "(") {
      const startLoc = Lexer.Loc.fromTok(t);
      // Check if it's a compound literal: (type){...}
      const saved = this.pos;
      this.advance(); // skip (
      if (this.isTypeName()) {
        // Could be cast or compound literal
        const specs = this.parseDeclSpecifiers();
        let castType = specs.type;
        // Parse abstract declarator
        if (this.atText("*") || this.atText("[") || this.atText("(")) {
          const decl = this.parseDeclarator(castType);
          castType = decl.type;
        }
        this.expect(")");
        if (this.atText("{")) {
          // Compound literal
          let initList = this.parseInitList(castType);
          // Handle string-initialized char array (e.g., `(char[]){"hi"}`).
          if (castType.isArray() && castType.arraySize === 0 &&
              initList.elements.length === 1 && initList.elements[0] instanceof AST.EString &&
              stringLiteralCanInitArray(castType, initList.elements[0])) {
            castType = initList.elements[0].type;
            initList = new AST.EInitList(initList.loc, castType,
              initList.elements, initList.designators, initList.unionMemberIndex);
          } else if (castType.isArray() && castType.arraySize === 0) {
            initList = normalizeInitList(initList, castType);
            castType = initList.type;
          } else if (castType.isAggregate()) {
            initList = normalizeInitList(initList, castType);
          }
          return new AST.ECompoundLiteral(startLoc, castType, initList);
        }
        // Cast expression
        const expr = this.parseCastExpression();
        // GCC extension: cast-to-union — (union_type) expr → compound literal
        if (castType.isUnion()) {
          let initList = new AST.EInitList(startLoc, castType, [expr], []);
          initList = normalizeInitList(initList, castType);
          return new AST.ECompoundLiteral(startLoc, castType, initList);
        }
        return AST.makeCast(startLoc, castType, expr);
      }
      // Regular parenthesized expression
      this.pos = saved;
      this.advance();
      const expr = this.parseExpression();
      this.expect(")");
      return expr;
    }

    // sizeof
    if (this.atKW(Lexer.Keyword.SIZEOF)) {
      const sizeofLoc = Lexer.Loc.fromTok(t);
      this.advance();
      if (this.matchText("(")) {
        if (this.isTypeName()) {
          const specs = this.parseDeclSpecifiers();
          let sType = specs.type;
          if (this.atText("*") || this.atText("[") || this.atText("(")) {
            const decl = this.parseDeclarator(sType);
            sType = decl.type;
          }
          this.expect(")");
          if (sType.removeQualifiers().isRef()) this.error(this.peek(-1), `sizeof(${sType.removeQualifiers().toString()}) is not allowed`);
          if (this.atText("{")) {
            // `sizeof (T){...}` — the operand is a compound-literal
            // postfix-expression (C11 6.5.3 grammar), not a parenthesized
            // type name. Build it exactly like the cast-expression path.
            let litType = sType;
            let initList = this.parseInitList(litType);
            if (litType.isArray() && litType.arraySize === 0 &&
                initList.elements.length === 1 && initList.elements[0] instanceof AST.EString &&
                stringLiteralCanInitArray(litType, initList.elements[0])) {
              litType = initList.elements[0].type;
              initList = new AST.EInitList(initList.loc, litType,
                initList.elements, initList.designators, initList.unionMemberIndex);
            } else if (litType.isArray() && litType.arraySize === 0) {
              initList = normalizeInitList(initList, litType);
              litType = initList.type;
            } else if (litType.isAggregate()) {
              initList = normalizeInitList(initList, litType);
            }
            const lit = new AST.ECompoundLiteral(sizeofLoc, litType, initList);
            this.checkSizeofOperand(t, lit.type);
            return new AST.ESizeofExpr(sizeofLoc, Types.TULONG, lit);
          }
          this.checkSizeofOperand(t, sType);
          return new AST.ESizeofType(sizeofLoc, Types.TULONG, sType);
        }
        let expr = this.parseExpression();
        this.expect(")");
        // The operand is a full unary-expression (C11 6.5.3), so postfix
        // operators keep binding to the parenthesized expression:
        // sizeof(a)[0] is sizeof((a)[0]), not (sizeof(a))[0].
        expr = this.parsePostfixTail(expr);
        this.checkSizeofOperand(t, expr.type);
        return new AST.ESizeofExpr(sizeofLoc, Types.TULONG, expr);
      }
      const expr = this.parseUnaryExpression();
      this.checkSizeofOperand(t, expr.type);
      return new AST.ESizeofExpr(sizeofLoc, Types.TULONG, expr);
    }

    // _Alignof
    if (this.atKW(Lexer.Keyword.ALIGNOF)) {
      const alignofLoc = Lexer.Loc.fromTok(t);
      this.advance();
      this.expect("(");
      if (this.isTypeName()) {
        const specs = this.parseDeclSpecifiers();
        let aType = specs.type;
        if (this.atText("*") || this.atText("[") || this.atText("(")) {
          const decl = this.parseDeclarator(aType);
          aType = decl.type;
        }
        this.expect(")");
        if (aType.isFunction()) {
          this.error(this.peek(-1), "_Alignof cannot be applied to a function type");
        }
        if (!aType.isComplete) {
          this.error(this.peek(-1), "_Alignof cannot be applied to incomplete type '" + aType.toString() + "'");
        }
        return new AST.EAlignofType(alignofLoc, Types.TULONG, aType);
      }
      const expr = this.parseExpression();
      this.expect(")");
      return new AST.EAlignofExpr(alignofLoc, Types.TULONG, expr);
    }

    // __builtin_va_start/va_arg/va_end/va_copy
    if (this.atKW(Lexer.Keyword.X_BUILTIN_VA_START)) { return this.parseIntrinsic(Types.IntrinsicKind.VA_START); }
    if (this.atKW(Lexer.Keyword.X_BUILTIN_VA_ARG)) { return this.parseVaArg(); }
    if (this.atKW(Lexer.Keyword.X_BUILTIN_VA_END)) { return this.parseIntrinsic(Types.IntrinsicKind.VA_END); }
    if (this.atKW(Lexer.Keyword.X_BUILTIN_VA_COPY)) { return this.parseIntrinsic(Types.IntrinsicKind.VA_COPY); }
    if (this.atKW(Lexer.Keyword.X_BUILTIN_UNREACHABLE)) { return this.parseIntrinsic(Types.IntrinsicKind.UNREACHABLE); }
    if (this.atKW(Lexer.Keyword.X_BUILTIN_ABORT)) { return this.parseIntrinsic(Types.IntrinsicKind.UNREACHABLE); }
    if (this.matchKW(Lexer.Keyword.X_BUILTIN_EXPECT)) {
      this.expect("(");
      const first = this.parseAssignmentExpression();
      this.expect(",");
      this.parseAssignmentExpression(); // discard the hint
      this.expect(")");
      return first;
    }

    // __struct_new(__struct Foo, args...) — struct.new / struct.new_default
    // __new(__struct Foo, args...) — alias for __struct_new
    // The type-arg is the bare heap form (e.g. `__struct Foo`, possibly via a
    // typedef). The expression's value type is the corresponding ref form.
    if (this.matchKW(Lexer.Keyword.X_STRUCT_NEW) || this.matchKW(Lexer.Keyword.X_NEW)) {
      const newTok = this.peek(-1);
      const callName = newTok.text;
      this.expect("(");
      if (!this.isTypeName()) this.error(this.peek(), `${callName} requires a __struct type`);
      const specs = this.parseDeclSpecifiers();
      let nType = specs.type;
      if (this.atText("*") || this.atText("[") || this.atText("(")) {
        const decl = this.parseDeclarator(nType);
        nType = decl.type;
      }
      const nq = nType.removeQualifiers();
      if (!nq.isGCStructHeap()) {
        this.error(newTok, `${callName} requires a heap-form __struct type (e.g. '__struct Foo', no '*'), got '${nType.toString()}'`);
      }
      if (!nq.isComplete) this.error(newTok, `${callName} of incomplete GC struct '${nq.tagName}'`);
      const args = [];
      while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      this.expect(")");
      const fields = nq.tagDecl.members;
      if (args.length !== 0 && args.length !== fields.length) {
        this.error(newTok, `${callName}(__struct ${nq.tagName}, ...): expected ${fields.length} field args, got ${args.length}`);
      }
      // Reject implicit non-zero int → non-eqref ref field (silent-null bug).
      const newLoc = Lexer.Loc.fromTok(newTok);
      for (let i = 0; i < args.length; i++) {
        AST.rejectNonZeroToRef(fields[i].type, args[i], newLoc);
      }
      return new AST.EGCNew(newLoc, nq.pointer(), args);
    }

    // __array_new(elemType, length [, init]) — array.new / array.new_default
    if (this.matchKW(Lexer.Keyword.X_ARRAY_NEW)) {
      const newTok = this.peek(-1);
      this.expect("(");
      if (!this.isTypeName()) this.error(this.peek(), `__array_new requires an element type as the first argument`);
      const specs = this.parseDeclSpecifiers();
      let elemType = specs.type;
      if (this.atText("*") || this.atText("[") || this.atText("(")) {
        const decl = this.parseDeclarator(elemType);
        elemType = decl.type;
      }
      if (elemType.isArray() || elemType.isFunction()) {
        this.error(newTok, `__array_new element type must not be a C array or function`);
      }
      const arrType = Types.gcArrayOf(elemType);
      const args = [];
      while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      this.expect(")");
      if (args.length < 1 || args.length > 2) {
        this.error(newTok, `__array_new(...): expected length [, init], got ${args.length} args`);
      }
      // Reject non-zero int as fill value when element type is a non-eqref ref.
      const newLoc = Lexer.Loc.fromTok(newTok);
      if (args.length === 2) AST.rejectNonZeroToRef(elemType, args[1], newLoc);
      return new AST.EGCNew(newLoc, arrType, args);
    }

    // __memory_size, __memory_grow
    if (this.matchKW(Lexer.Keyword.X_MEMORY_SIZE)) {
      const kwLoc = Lexer.Loc.fromTok(this.peek(-1));
      this.expect("(");
      this.expect(")");
      return new AST.EIntrinsic(kwLoc, Types.TULONG, Types.IntrinsicKind.MEMORY_SIZE, []);
    }
    if (this.matchKW(Lexer.Keyword.X_MEMORY_GROW)) {
      const kwLoc = Lexer.Loc.fromTok(this.peek(-1));
      this.expect("(");
      const arg = this.parseAssignmentExpression();
      this.expect(")");
      return new AST.EIntrinsic(kwLoc, Types.TULONG, Types.IntrinsicKind.MEMORY_GROW, [arg]);
    }

    // __ref_is_null(ref)
    if (this.matchKW(Lexer.Keyword.X_REF_IS_NULL)) {
      const tok = this.peek(-1);
      this.expect("(");
      const arg = this.parseAssignmentExpression();
      this.expect(")");
      if (!arg.type.removeQualifiers().isRef()) {
        this.error(tok, `__ref_is_null requires a reference type, got '${arg.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TINT, Types.IntrinsicKind.REF_IS_NULL, [arg]);
    }

    // __ref_eq(ref, ref)
    if (this.matchKW(Lexer.Keyword.X_REF_EQ)) {
      const tok = this.peek(-1);
      this.expect("(");
      const a = this.parseAssignmentExpression();
      this.expect(",");
      const b = this.parseAssignmentExpression();
      this.expect(")");
      const at = a.type.removeQualifiers(), bt = b.type.removeQualifiers();
      if (!at.isRef() || !bt.isRef()) {
        this.error(tok, `__ref_eq requires two reference operands, got '${a.type.toString()}' and '${b.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TINT, Types.IntrinsicKind.REF_EQ, [a, b]);
    }

    // __gcstr("...") — the string literal as an imported externref constant
    // (js-string importedStringConstants): one immutable `(ref extern)`
    // global import per distinct literal, module "#", import NAME = the
    // literal's bytes. Zero-copy, zero linear memory, deduped by
    // construction. global.get of an immutable import is a wasm constant
    // expression, so file-scope `__externref g = __gcstr("...")` works.
    if (this.matchKW(Lexer.Keyword.X_GCSTR)) {
      const tok = this.peek(-1);
      this.expect("(");
      if (!this.atKind(Lexer.TokenKind.STRING)) {
        this.error(tok, `__gcstr requires a string literal argument`);
      }
      const lit = this.parseStringLiteral();   // adjacent-literal concatenation applies
      this.expect(")");
      if (lit.type.baseType !== Types.TCHAR) {
        this.error(tok, `__gcstr requires a narrow string literal (no L/u/U prefix)`);
      }
      // The literal becomes a wasm import name, and import names must be
      // valid UTF-8 — \x/octal byte escapes can produce sequences that
      // aren't. Reject here with a source location instead of tripping the
      // binary validator.
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(lit.value.slice(0, -1)));
      } catch (e) {
        this.error(tok, `__gcstr literal must be valid UTF-8 (it becomes a wasm import name)`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TREFEXTERN, Types.IntrinsicKind.GC_STR, [lit]);
    }

    // __ref_null(type) — produces a null of the given reference type.
    // The type-arg is the heap form for GC structs (`__struct Foo`, no `*`)
    // mirroring wasm's `ref.null heaptype`. For arrays / externref / eqref
    // (which have no separate heap-form spelling), pass the type directly.
    if (this.matchKW(Lexer.Keyword.X_REF_NULL)) {
      const tok = this.peek(-1);
      this.expect("(");
      if (!this.isTypeName()) this.error(tok, "__ref_null requires a reference type");
      const specs = this.parseDeclSpecifiers();
      let nType = specs.type;
      if (this.atText("*") || this.atText("[") || this.atText("(")) {
        const decl = this.parseDeclarator(nType);
        nType = decl.type;
      }
      this.expect(")");
      const nq = nType.removeQualifiers();
      if (nq.isGCStruct()) {
        this.error(tok, `__ref_null takes the heap form '__struct ${nq.tagName}' (no '*'), got '${nType.toString()}'`);
      } else if (!nq.isRef() && !nq.isGCStructHeap()) {
        this.error(tok, `__ref_null requires a reference type, got '${nType.toString()}'`);
      }
      if (nq === Types.TREFEXTERN) {
        this.error(tok, `__ref_null(__refextern) is not allowed — non-nullable refs cannot be null; use __externref instead`);
      }
      // The expression's value type is the ref form (for GC structs) or the
      // type itself (already a ref for externref/eqref/array).
      const valueType = nq.isGCStructHeap() ? nq.pointer() : nq;
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), valueType, Types.IntrinsicKind.REF_NULL, [], nq);
    }

    // __ref_test(target_type, ref) — runtime type test
    // __ref_test / __ref_test_null — runtime type test.
    //   __ref_test(T, x)      → false on null (instance-of semantics)
    //   __ref_test_null(T, x) → true on null (type-lattice semantics, pairs
    //                           with __ref_cast_null which doesn't trap on null)
    {
      const isNullable = this.atKW(Lexer.Keyword.X_REF_TEST_NULL);
      const isPlain = this.atKW(Lexer.Keyword.X_REF_TEST);
      if (isNullable || isPlain) {
        this.advance();
        const opName = isNullable ? "__ref_test_null" : "__ref_test";
        const tok = this.peek(-1);
        this.expect("(");
        if (!this.isTypeName()) this.error(tok, `${opName} requires a target heap-type`);
        const specs = this.parseDeclSpecifiers();
        let tType = specs.type;
        if (this.atText("*") || this.atText("[") || this.atText("(")) {
          const decl = this.parseDeclarator(tType);
          tType = decl.type;
        }
        this.expect(",");
        const refExpr = this.parseAssignmentExpression();
        this.expect(")");
        const tq = tType.removeQualifiers();
        if (tq.isGCStruct()) {
          this.error(tok, `${opName} target takes the heap form '__struct ${tq.tagName}' (no '*'), got '${tType.toString()}'`);
        } else if (!tq.isGCStructHeap() && !tq.isGCArray()) {
          this.error(tok, `${opName} target must be a heap-form __struct or __array type, got '${tType.toString()}'`);
        }
        if (!refExpr.type.removeQualifiers().isGCRef()) {
          this.error(tok, `${opName} second argument must be a GC-universe ref, got '${refExpr.type.toString()}'`);
        }
        const kind = isNullable ? Types.IntrinsicKind.REF_TEST_NULL : Types.IntrinsicKind.REF_TEST;
        return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TINT, kind, [refExpr], tq);
      }
    }

    // __ref_cast / __ref_cast_null — runtime downcast (traps on type mismatch).
    //   __ref_cast(T, x)      → traps on null (matches WASM `ref.cast`).
    //   __ref_cast_null(T, x) → null passes through unchanged
    //                           (matches WASM `ref.cast null`).
    {
      const isNullable = this.atKW(Lexer.Keyword.X_REF_CAST_NULL);
      const isPlain = this.atKW(Lexer.Keyword.X_REF_CAST);
      if (isNullable || isPlain) {
        this.advance();
        const opName = isNullable ? "__ref_cast_null" : "__ref_cast";
        const tok = this.peek(-1);
        this.expect("(");
        if (!this.isTypeName()) this.error(tok, `${opName} requires a target heap-type`);
        const specs = this.parseDeclSpecifiers();
        let tType = specs.type;
        if (this.atText("*") || this.atText("[") || this.atText("(")) {
          const decl = this.parseDeclarator(tType);
          tType = decl.type;
        }
        this.expect(",");
        const refExpr = this.parseAssignmentExpression();
        this.expect(")");
        const tq = tType.removeQualifiers();
        if (tq.isGCStruct()) {
          this.error(tok, `${opName} target takes the heap form '__struct ${tq.tagName}' (no '*'), got '${tType.toString()}'`);
        } else if (!tq.isGCStructHeap() && !tq.isGCArray()) {
          this.error(tok, `${opName} target must be a heap-form __struct or __array type, got '${tType.toString()}'`);
        }
        if (!refExpr.type.removeQualifiers().isGCRef()) {
          this.error(tok, `${opName} second argument must be a GC-universe ref, got '${refExpr.type.toString()}'`);
        }
        // Result value type: the ref form (for struct heap) or the array (already a ref).
        const valueType = tq.isGCStructHeap() ? tq.pointer() : tq;
        const kind = isNullable ? Types.IntrinsicKind.REF_CAST_NULL : Types.IntrinsicKind.REF_CAST;
        return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), valueType, kind, [refExpr], tq);
      }
    }

    // __array_len(arr) — array length
    if (this.matchKW(Lexer.Keyword.X_ARRAY_LEN)) {
      const tok = this.peek(-1);
      this.expect("(");
      const arg = this.parseAssignmentExpression();
      this.expect(")");
      if (!arg.type.removeQualifiers().isGCArray()) {
        this.error(tok, `__array_len requires a __array(...) operand, got '${arg.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TINT, Types.IntrinsicKind.ARRAY_LEN, [arg]);
    }

    // __array_of(elemType, v1, v2, ...) — array.new_fixed
    if (this.matchKW(Lexer.Keyword.X_ARRAY_OF)) {
      const tok = this.peek(-1);
      this.expect("(");
      if (!this.isTypeName()) this.error(tok, "__array_of first argument must be the element type");
      const specs = this.parseDeclSpecifiers();
      let elemType = specs.type;
      if (this.atText("*") || this.atText("[") || this.atText("(")) {
        const decl = this.parseDeclarator(elemType);
        elemType = decl.type;
      }
      const args = [];
      while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      this.expect(")");
      if (elemType.isArray() || elemType.isFunction()) {
        this.error(tok, `__array_of element type must not be a C array or function`);
      }
      // Reject implicit non-zero int → non-eqref ref element (silent-null bug).
      const tokLoc = Lexer.Loc.fromTok(tok);
      for (let i = 0; i < args.length; i++) {
        AST.rejectNonZeroToRef(elemType, args[i], tokLoc);
      }
      const arrType = Types.gcArrayOf(elemType);
      return new AST.EIntrinsic(tokLoc, arrType, Types.IntrinsicKind.GC_NEW_ARRAY, args, elemType);
    }

    // __array_fill(arr, offset, value, count) — bulk fill of a GC array slice
    if (this.matchKW(Lexer.Keyword.X_ARRAY_FILL)) {
      const tok = this.peek(-1);
      this.expect("(");
      const arr = this.parseAssignmentExpression();
      this.expect(",");
      const off = this.parseAssignmentExpression();
      this.expect(",");
      const val = this.parseAssignmentExpression();
      this.expect(",");
      const count = this.parseAssignmentExpression();
      this.expect(")");
      if (!arr.type.removeQualifiers().isGCArray()) {
        this.error(tok, `__array_fill first argument must be a __array(...), got '${arr.type.toString()}'`);
      }
      const elemType = arr.type.removeQualifiers().baseType;
      const tokLoc = Lexer.Loc.fromTok(tok);
      AST.rejectNonZeroToRef(elemType, val, tokLoc);
      return new AST.EIntrinsic(tokLoc, Types.TVOID, Types.IntrinsicKind.ARRAY_FILL, [arr, off, val, count]);
    }

    // __ref_as_extern(gc_ref) — wrap a GC-universe ref (struct/array/eqref)
    // as an externref. Cheap retag (extern.convert_any).
    if (this.matchKW(Lexer.Keyword.X_REF_AS_EXTERN)) {
      const tok = this.peek(-1);
      this.expect("(");
      const arg = this.parseAssignmentExpression();
      this.expect(")");
      if (!arg.type.removeQualifiers().isGCRef()) {
        this.error(tok, `__ref_as_extern requires a GC-universe ref (__struct/__array/__eqref), got '${arg.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TEXTERNREF, Types.IntrinsicKind.REF_AS_EXTERN, [arg]);
    }

    // __ref_as_any(extern_ref) — unwrap an externref to eqref. Cheap retag
    // (any.convert_extern). Result is __eqref — use __ref_cast(T, ...) to
    // narrow to a specific GC type.
    if (this.matchKW(Lexer.Keyword.X_REF_AS_EQ)) {
      const tok = this.peek(-1);
      this.expect("(");
      const arg = this.parseAssignmentExpression();
      this.expect(")");
      const at = arg.type.removeQualifiers();
      if (at !== Types.TEXTERNREF && at !== Types.TREFEXTERN) {
        this.error(tok, `__ref_as_any requires an __externref/__refextern, got '${arg.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TEQREF, Types.IntrinsicKind.REF_AS_EQ, [arg]);
    }

    // __cast(TargetType, expr) — universal conversion. Dispatch on the
    // (source, target) type combo at codegen time. Supports:
    //   - prim ↔ __eqref       (auto-boxes/unboxes via internal box structs)
    //   - GC ref ↔ __eqref     (subtype upcast / ref.cast downcast)
    //   - GC ref → GC ref       (ref.cast — same as __ref_cast)
    //   - GC ref ↔ __externref  (extern bridges)
    //   - prim → prim           (numeric conversion)
    //   - same type             (identity)
    if (this.matchKW(Lexer.Keyword.X_CAST)) {
      const tok = this.peek(-1);
      this.expect("(");
      if (!this.isTypeName()) this.error(tok, "__cast requires a target type as first arg");
      const specs = this.parseDeclSpecifiers();
      let tType = specs.type;
      if (this.atText("*") || this.atText("[") || this.atText("(")) {
        const decl = this.parseDeclarator(tType);
        tType = decl.type;
      }
      this.expect(",");
      const expr = this.parseAssignmentExpression();
      this.expect(")");
      const tq = tType.removeQualifiers();
      // For GC structs, require heap-form spelling (matches __ref_cast).
      if (tq.isGCStruct()) {
        this.error(tok, `__cast target takes the heap form '__struct ${tq.tagName}' (no '*'), got '${tType.toString()}'`);
      }
      // Result value type and codegen-target are the ref form for GC struct heap;
      // for everything else the user-spelled type is already a value type.
      const valueType = tq.isGCStructHeap() ? tq.pointer() : tq;
      const sq = expr.type.removeQualifiers();
      // Validate combinations at parse time. The codegen path handles the
      // mechanics; here we just reject combos that don't have a defined
      // conversion (e.g. prim ↔ extern, prim → GC struct, etc.).
      const isPrim = (t) => t.isArithmetic();
      const isEqref = (t) => t === Types.TEQREF;
      const isExternref = (t) => t === Types.TEXTERNREF || t === Types.TREFEXTERN;
      const ok = (sq === valueType) ||
        (isPrim(sq) && isPrim(tq)) ||
        (isPrim(sq) && isEqref(tq)) ||                        // box
        (isEqref(sq) && isPrim(tq)) ||                        // unbox
        (sq.isGCRef() && isEqref(tq)) ||                      // upcast
        (isEqref(sq) && valueType.isGCRef()) ||               // downcast
        (sq.isGCRef() && valueType.isGCRef()) ||              // GC sidecast/downcast
        (sq.isGCRef() && isExternref(tq)) ||                   // GC → extern bridge
        (isExternref(sq) && tq === Types.TEQREF);             // extern → any bridge
      if (!ok) {
        this.error(tok,
          `__cast: no conversion defined from '${expr.type.toString()}' to '${tType.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), valueType, Types.IntrinsicKind.CAST, [expr], valueType);
    }

    // __array_copy(dst, dst_off, src, src_off, count) — bulk copy between GC arrays
    if (this.matchKW(Lexer.Keyword.X_ARRAY_COPY)) {
      const tok = this.peek(-1);
      this.expect("(");
      const dst = this.parseAssignmentExpression();
      this.expect(",");
      const dstOff = this.parseAssignmentExpression();
      this.expect(",");
      const src = this.parseAssignmentExpression();
      this.expect(",");
      const srcOff = this.parseAssignmentExpression();
      this.expect(",");
      const count = this.parseAssignmentExpression();
      this.expect(")");
      if (!dst.type.removeQualifiers().isGCArray()) {
        this.error(tok, `__array_copy dst must be a __array(...), got '${dst.type.toString()}'`);
      }
      if (!src.type.removeQualifiers().isGCArray()) {
        this.error(tok, `__array_copy src must be a __array(...), got '${src.type.toString()}'`);
      }
      const dstElem = dst.type.removeQualifiers().baseType;
      const srcElem = src.type.removeQualifiers().baseType;
      if (dstElem.removeQualifiers() !== srcElem.removeQualifiers()) {
        this.error(tok,
          `__array_copy element type mismatch: dst is '${dst.type.toString()}', src is '${src.type.toString()}'`);
      }
      return new AST.EIntrinsic(Lexer.Loc.fromTok(tok), Types.TVOID, Types.IntrinsicKind.ARRAY_COPY, [dst, dstOff, src, srcOff, count]);
    }

    // __builtin(kind, args...)
    if (this.matchKW(Lexer.Keyword.X_BUILTIN)) {
      const builtinTok = this.peek(-1);
      this.expect("(");
      const kindTok = this.expectKind(Lexer.TokenKind.IDENT);
      const kindName = kindTok.text;
      const args = [];
      while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      this.expect(")");
      let ik = Types.IntrinsicKind[kindName.toUpperCase()] || kindName;
      // Map common names
      if (kindName === "alloca") ik = Types.IntrinsicKind.ALLOCA;
      else if (kindName === "memory_copy") ik = Types.IntrinsicKind.MEMORY_COPY;
      else if (kindName === "memory_fill") ik = Types.IntrinsicKind.MEMORY_FILL;
      else if (kindName === "heap_base") ik = Types.IntrinsicKind.HEAP_BASE;
      let retType = Types.TVOID;
      if (ik === Types.IntrinsicKind.ALLOCA) retType = Types.TVOID.pointer();
      else if (ik === Types.IntrinsicKind.HEAP_BASE || ik === Types.IntrinsicKind.MEMORY_SIZE || ik === Types.IntrinsicKind.MEMORY_GROW) retType = Types.TULONG;
      return new AST.EIntrinsic(Lexer.Loc.fromTok(builtinTok), retType, ik, args);
    }

    // __wasm(type, (args...), instruction, ...)
    if (this.matchKW(Lexer.Keyword.X_WASM)) {
      const wasmTok = this.peek(-1);
      this.expect("(");
      const retSpecs = this.parseDeclSpecifiers();
      let retType = retSpecs.type;
      while (this.matchText("*")) {
        if (retType.isGCStruct()) {
          this.error(this.peek(-1), `'${retType.toString()}' is already a reference; '__struct Foo **' is not allowed`);
          break;
        }
        retType = retType.pointer();
      }
      const args = [];
      const bytes = [];
      // Parse required argument list
      this.expect(",");
      this.expect("(");
      if (!this.atText(")")) {
        args.push(this.parseAssignmentExpression());
        while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      }
      this.expect(")");
      // Parse instructions
      while (this.matchText(",")) {
        const instrTok = this.advance();
        if (instrTok.text === "op") {
          let first = true;
          while (this.atKind(Lexer.TokenKind.INT)) {
            const bv = Number(this.advance().integer) & 0xff;
            // Function-index-bearing opcodes (call / return_call /
            // ref.func) are refused at the head of an op group: raw
            // bytes are emitted VERBATIM, and the WAST tree-shake
            // (todos/0214) renumbers function indices — it can neither
            // see nor rewrite a reference hidden in bytes. Loud refusal
            // beats a silent miscompile. (A function index was never a
            // stable, source-knowable quantity anyway.)
            if (first && (bv === 0x10 || bv === 0x12 || bv === 0xD2)) {
              this.error(instrTok, "__wasm op: opcodes that reference a function index (call/return_call/ref.func) are not supported in raw bytes");
            }
            first = false;
            bytes.push(bv);
          }
        } else if (instrTok.text === "lebU") {
          const numTok = this.advance();
          if (numTok.kind !== Lexer.TokenKind.INT) this.error(numTok, "Expected integer after lebU");
          lebU(bytes, Number(numTok.integer));
        } else if (instrTok.text === "lebI") {
          const negative = this.matchText("-");
          const numTok = this.advance();
          if (numTok.kind !== Lexer.TokenKind.INT) this.error(numTok, "Expected integer after lebI");
          let val = Number(numTok.integer);
          if (negative) val = -val;
          lebI(bytes, val);
        } else if (instrTok.text === "i32") {
          const negative = this.matchText("-");
          const numTok = this.advance();
          if (numTok.kind !== Lexer.TokenKind.INT) this.error(numTok, "Expected integer after i32");
          let val = Number(numTok.integer) | 0;
          if (negative) val = -val;
          bytes.push(0x41); // i32.const
          lebI(bytes, val);
        } else if (instrTok.text === "i64") {
          const negative = this.matchText("-");
          const numTok = this.advance();
          if (numTok.kind !== Lexer.TokenKind.INT) this.error(numTok, "Expected integer after i64");
          let val = BigInt(numTok.integer);
          if (negative) val = -val;
          bytes.push(0x42); // i64.const
          lebI64(bytes, val);
        } else if (instrTok.text === "f32") {
          const negative = this.matchText("-");
          const numTok = this.advance();
          let val;
          if (numTok.kind === Lexer.TokenKind.INT) val = Number(numTok.integer);
          else if (numTok.kind === Lexer.TokenKind.FLOAT) val = numTok.floating;
          else this.error(numTok, "Expected number after f32");
          if (negative) val = -val;
          bytes.push(0x43); // f32.const
          const f32buf = new ArrayBuffer(4);
          new Float32Array(f32buf)[0] = val;
          for (const b of new Uint8Array(f32buf)) bytes.push(b);
        } else if (instrTok.text === "f64") {
          const negative = this.matchText("-");
          const numTok = this.advance();
          let val;
          if (numTok.kind === Lexer.TokenKind.INT) val = Number(numTok.integer);
          else if (numTok.kind === Lexer.TokenKind.FLOAT) val = numTok.floating;
          else this.error(numTok, "Expected number after f64");
          if (negative) val = -val;
          bytes.push(0x44); // f64.const
          const f64buf = new ArrayBuffer(8);
          new Float64Array(f64buf)[0] = val;
          for (const b of new Uint8Array(f64buf)) bytes.push(b);
        }
      }
      this.expect(")");
      return new AST.EWasm(Lexer.Loc.fromTok(wasmTok), retType, args, bytes);
    }

    // _Generic
    if (this.matchKW(Lexer.Keyword.GENERIC)) {
      const genericTok = this.peek(-1);
      this.expect("(");
      const controlExpr = this.parseAssignmentExpression();
      let result = null;
      let defaultExpr = null;
      while (this.matchText(",")) {
        if (this.matchKW(Lexer.Keyword.DEFAULT)) {
          this.expect(":");
          defaultExpr = this.parseAssignmentExpression();
        } else {
          const specs = this.parseDeclSpecifiers();
          let gType = specs.type;
          if (this.atText("*")) {
            const d = this.parseDeclarator(gType);
            gType = d.type;
          }
          this.expect(":");
          const gExpr = this.parseAssignmentExpression();
          // C17 6.5.1.1p2 (post-DR481): the controlling expression
          // undergoes lvalue conversion — arrays decay to element
          // pointers, functions to function pointers, qualifiers drop.
          let ctrlType = controlExpr.type.removeQualifiers();
          if (ctrlType.isArray() || ctrlType.isFunction()) ctrlType = ctrlType.decay();
          if (ctrlType.removeQualifiers() === gType.removeQualifiers()) result = gExpr;
        }
      }
      this.expect(")");
      if (!result && !defaultExpr) {
        this.error(this.peek(-1), "_Generic: no matching type and no 'default' association");
      }
      return result || defaultExpr || new AST.EInt(Lexer.Loc.fromTok(genericTok), Types.TINT, 0n);
    }

    this.error(t, `Unexpected token in expression: ${t.kind} '${t.text}'`);
  }

  parseStringLiteral() {
    // Determine string prefix from first token
    const startTok = this.peek();
    let prefix = startTok.flags.stringPrefix || Lexer.StringPrefix.NONE;
    const startLoc = Lexer.Loc.fromTok(startTok);
    const codepoints = [];
    while (this.atKind(Lexer.TokenKind.STRING)) {
      const tok = this.advance();
      // Upgrade prefix if any token has a wider prefix
      if (tok.flags.stringPrefix && tok.flags.stringPrefix !== Lexer.StringPrefix.NONE) {
        if (prefix === Lexer.StringPrefix.NONE || prefix === Lexer.StringPrefix.PREFIX_u8) prefix = tok.flags.stringPrefix;
      }
      const text = tok.text;
      const start = text.startsWith('"') ? 1 : (text.indexOf('"') + 1);
      const end = text.lastIndexOf('"');
      const inner = text.substring(start, end);
      const pos = { i: 0 };
      while (pos.i < inner.length) {
        // Hex (\xNN) and octal (\012) escapes denote raw byte values; raw
        // source characters, \u/\U universal character names, and simple
        // escapes (\n etc.) denote characters. The distinction matters for
        // narrow strings: a literal é (U+00E9) must encode as UTF-8 bytes
        // C3 A9, while \xe9 must stay the single byte E9.
        const isEscape = inner[pos.i] === "\\";
        const escKind = isEscape ? inner[pos.i + 1] : null;
        const cp = Lexer.unescape(inner, pos, inner.length);
        const isByte = isEscape && (escKind === "x" || (escKind >= "0" && escKind <= "7"));
        codepoints.push({ cp, isByte });
      }
    }
    if (prefix === Lexer.StringPrefix.PREFIX_u) {
      // UTF-16 string: element type is unsigned short (char16_t)
      const bytes = [];
      for (const { cp } of codepoints) Lexer.encodeUtf16LE(cp, bytes);
      bytes.push(0); bytes.push(0); // null terminator (2 bytes)
      const elemCount = bytes.length / 2;
      return new AST.EString(startLoc, Types.arrayOf(Types.TUSHORT, elemCount), bytes);
    }
    if (prefix === Lexer.StringPrefix.PREFIX_L) {
      // UTF-32 string: element type is int (wchar_t)
      const bytes = [];
      for (const { cp } of codepoints) Lexer.encodeUtf32LE(cp, bytes);
      bytes.push(0); bytes.push(0); bytes.push(0); bytes.push(0); // null terminator (4 bytes)
      const elemCount = bytes.length / 4;
      return new AST.EString(startLoc, Types.arrayOf(Types.TINT, elemCount), bytes);
    }
    if (prefix === Lexer.StringPrefix.PREFIX_U) {
      // UTF-32 string: element type is unsigned int (char32_t)
      const bytes = [];
      for (const { cp } of codepoints) Lexer.encodeUtf32LE(cp, bytes);
      bytes.push(0); bytes.push(0); bytes.push(0); bytes.push(0); // null terminator (4 bytes)
      const elemCount = bytes.length / 4;
      return new AST.EString(startLoc, Types.arrayOf(Types.TUINT, elemCount), bytes);
    }
    // Regular or u8 string: element type is char.
    // Byte escapes pass through verbatim; characters are UTF-8 encoded.
    const bytes = [];
    for (const { cp, isByte } of codepoints) {
      if (isByte) bytes.push(cp & 0xff);
      else if (cp <= 0x7f) bytes.push(cp);
      else Lexer.encodeUtf8(cp, bytes);
    }
    bytes.push(0);
    return new AST.EString(startLoc, Types.arrayOf(Types.TCHAR, bytes.length), bytes);
  }

  parseIntrinsic(ikind) {
    const kwTok = this.peek();
    this.advance();
    this.expect("(");
    const args = [];
    if (!this.atText(")")) {
      args.push(this.parseAssignmentExpression());
      while (this.matchText(",")) args.push(this.parseAssignmentExpression());
    }
    this.expect(")");
    let retType = Types.TVOID;
    if (ikind === Types.IntrinsicKind.VA_START || ikind === Types.IntrinsicKind.VA_END || ikind === Types.IntrinsicKind.VA_COPY) retType = Types.TVOID;
    return new AST.EIntrinsic(Lexer.Loc.fromTok(kwTok), retType, ikind, args);
  }

  parseVaArg() {
    const kwTok = this.peek();
    this.advance();
    this.expect("(");
    const ap = this.parseAssignmentExpression();
    this.expect(",");
    const specs = this.parseDeclSpecifiers();
    let argType = specs.type;
    if (this.atText("*")) {
      const d = this.parseDeclarator(argType);
      argType = d.type;
    }
    this.expect(")");
    if (argType.removeQualifiers().isRef()) {
      this.error(this.peek(-1),
        `va_arg cannot retrieve a reference type '${argType.toString()}' — vararg storage uses linear memory which can't hold GC references`);
    }
    return new AST.EIntrinsic(Lexer.Loc.fromTok(kwTok), argType, Types.IntrinsicKind.VA_ARG, [ap], argType);
  }

  // Matches CC's parsePostfixExpression (compiler.cc ~line 10495)
  parsePostfixExpression() {
    const expr = this.parsePrimaryExpression();
    return this.parsePostfixTail(expr);
  }

  _validateCond(expr, tok, ctxName) {
    // Controlling expressions (if/while/for/do/?:) must be scalar.
    // Arrays and functions decay to pointers first (if (arr) is the
    // decayed pointer's truth value). We extend C with refs (sugar for
    // !__ref_is_null), but reject structs / unions / void.
    if (expr.type.isArray() || expr.type.isFunction()) expr = maybeDecay(expr);
    if (!AST.isBoolContextType(expr.type)) {
      this.error(tok,
        `controlling expression of '${ctxName}' must be scalar, got '${expr.type.toString()}'`);
    }
    return expr;
  }

  // C23 `auto`: validate that the declarator is a plain identifier (no
  // pointer / array / function modifiers) and that an initializer is present.
  // Returns the inferred type (post lvalue/decay), or null if validation fails.
  _resolveAuto(baseType, declType, name, initExpr, declTok) {
    if (baseType !== Types.TAUTO) return null;
    // declType may have been "wrapped" by parseDeclarator if user wrote
    // `auto *x` etc. Detect by checking if declType differs from TAUTO.
    if (declType !== Types.TAUTO) {
      this.error(declTok, `'auto' cannot be combined with declarator modifiers (no '*', '[]', or '()' allowed)`);
      return Types.TINT;
    }
    if (!initExpr) {
      this.error(declTok, `'auto ${name}' requires an initializer`);
      return Types.TINT;
    }
    if (initExpr instanceof AST.EInitList) {
      this.error(declTok, `'auto ${name}' cannot be initialized from a braced initializer list`);
      return Types.TINT;
    }
    // Apply lvalue conversion (decay arrays/functions to pointers); strip
    // top-level qualifiers (matches C23 semantics).
    const initType = initExpr.type.decay().removeQualifiers();
    if (initType === Types.TVOID) {
      this.error(declTok, `'auto ${name}' cannot infer type 'void'`);
      return Types.TINT;
    }
    return initType;
  }

  // Matches CC's parseUnaryExpression (compiler.cc ~line 10538)
  parseUnaryExpression() {
    const PREFIX_OPS = {
      "++": "OP_PRE_INC", "--": "OP_PRE_DEC",
      "+": "OP_POS", "-": "OP_NEG", "~": "OP_BNOT", "!": "OP_LNOT",
    };
    for (const [text, op] of Object.entries(PREFIX_OPS)) {
      if (this.matchText(text)) {
        const loc = Lexer.Loc.fromTok(this.peek(-1));
        // ++/-- recurse into parseUnaryExpression; everything else into parseCastExpression.
        const e = (op === "OP_PRE_INC" || op === "OP_PRE_DEC")
          ? this.parseUnaryExpression() : this.parseCastExpression();
        return AST.makeUnary(loc, op, e);
      }
    }
    if (this.matchText("&")) {
      const loc = Lexer.Loc.fromTok(this.peek(-1));
      return AST.makeUnary(loc, "OP_ADDR", this.parseCastExpression());
    }
    if (this.matchText("*")) {
      const loc = Lexer.Loc.fromTok(this.peek(-1));
      return AST.makeUnary(loc, "OP_DEREF", this.parseCastExpression());
    }

    if (this.atKW(Lexer.Keyword.SIZEOF)) return this.parsePrimaryExpression(); // handled there
    if (this.atKW(Lexer.Keyword.ALIGNOF)) return this.parsePrimaryExpression();

    return this.parsePostfixExpression();
  }

  parseCastExpression() {
    if (this.atText("(")) {
      // Look ahead: is this a cast or a parenthesized expression?
      const startTok = this.peek();
      const saved = this.pos;
      this.advance();
      if (this.isTypeName()) {
        const specs = this.parseDeclSpecifiers();
        let castType = specs.type;
        if (this.atText("*") || this.atText("[") || this.atText("(")) {
          const d = this.parseDeclarator(castType);
          castType = d.type;
        }
        if (this.matchText(")")) {
          const startLoc = Lexer.Loc.fromTok(startTok);
          if (this.atText("{")) {
            // Compound literal: (type){...}
            let initList = this.parseInitList(castType);
            if (castType.isArray() && castType.arraySize === 0 &&
                initList.elements.length === 1 && initList.elements[0] instanceof AST.EString &&
                stringLiteralCanInitArray(castType, initList.elements[0])) {
              castType = initList.elements[0].type;
              initList = new AST.EInitList(initList.loc, castType,
                initList.elements, initList.designators, initList.unionMemberIndex);
            } else if (castType.isArray() && castType.arraySize === 0) {
              initList = normalizeInitList(initList, castType);
              castType = initList.type;
            } else if (castType.isAggregate()) {
              initList = normalizeInitList(initList, castType);
            }
            return this.parsePostfixTail(new AST.ECompoundLiteral(startLoc, castType, initList));
          }
          const expr = this.parseCastExpression();
          // GCC extension: cast-to-union — (union_type) expr → compound literal
          if (castType.isUnion()) {
            let initList = new AST.EInitList(startLoc, castType, [expr], []);
            initList = normalizeInitList(initList, castType);
            return this.parsePostfixTail(new AST.ECompoundLiteral(startLoc, castType, initList));
          }
          return AST.makeCast(startLoc, castType, expr);
        }
      }
      this.pos = saved;
    }
    return this.parseUnaryExpression();
  }

  parsePostfixTail(expr) {
    while (true) {
      if (this.matchText("(")) {
        // Function call
        const callTok = this.peek(-1);
        const args = [];
        if (!this.atText(")")) {
          do {
            args.push(this.parseAssignmentExpression());
          } while (this.matchText(","));
        }
        this.expect(")");
        expr = AST.makeCall(Lexer.Loc.fromTok(callTok), expr, args);
        continue;
      }
      if (this.matchText("[")) {
        const lbrTok = this.peek(-1);
        const index = this.parseExpression();
        this.expect("]");
        expr = AST.makeSubscript(Lexer.Loc.fromTok(lbrTok), expr, index);
        continue;
      }
      if (this.matchText(".")) {
        const dotLoc = Lexer.Loc.fromTok(this.peek(-1));
        const name = this.expectKind(Lexer.TokenKind.IDENT).text;
        expr = AST.makeMember(dotLoc, expr, name);
        continue;
      }
      if (this.matchText("->")) {
        const arrowLoc = Lexer.Loc.fromTok(this.peek(-1));
        const name = this.expectKind(Lexer.TokenKind.IDENT).text;
        expr = AST.makeArrow(arrowLoc, expr, name);
        continue;
      }
      if (this.matchText("++")) {
        expr = AST.makeUnary(Lexer.Loc.fromTok(this.peek(-1)), "OP_POST_INC", expr);
        continue;
      }
      if (this.matchText("--")) {
        expr = AST.makeUnary(Lexer.Loc.fromTok(this.peek(-1)), "OP_POST_DEC", expr);
        continue;
      }
      break;
    }
    return expr;
  }

  getBinaryPrecedence(op) {
    if (op === ",") return 1;
    if (op === "=" || op === "+=" || op === "-=" || op === "*=" || op === "/=" ||
        op === "%=" || op === "&=" || op === "|=" || op === "^=" || op === "<<=" || op === ">>=") return 2;
    if (op === "?") return 3;
    if (op === "||") return 4;
    if (op === "&&") return 5;
    if (op === "|") return 6;
    if (op === "^") return 7;
    if (op === "&") return 8;
    if (op === "==" || op === "!=") return 9;
    if (op === "<" || op === ">" || op === "<=" || op === ">=") return 10;
    if (op === "<<" || op === ">>") return 11;
    if (op === "+" || op === "-") return 12;
    if (op === "*" || op === "/" || op === "%") return 13;
    return 0;
  }

  isRightAssociative(op) {
    return op === "=" || op === "+=" || op === "-=" || op === "*=" || op === "/=" ||
        op === "%=" || op === "&=" || op === "|=" || op === "^=" || op === "<<=" || op === ">>=";
  }

  textToBop(op) {
    const map = {
      "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", "%": "MOD",
      "==": "EQ", "!=": "NE", "<": "LT", ">": "GT", "<=": "LE", ">=": "GE",
      "&&": "LAND", "||": "LOR", "&": "BAND", "|": "BOR", "^": "BXOR",
      "<<": "SHL", ">>": "SHR", "=": "ASSIGN",
      "+=": "ADD_ASSIGN", "-=": "SUB_ASSIGN", "*=": "MUL_ASSIGN",
      "/=": "DIV_ASSIGN", "%=": "MOD_ASSIGN", "&=": "BAND_ASSIGN",
      "|=": "BOR_ASSIGN", "^=": "BXOR_ASSIGN", "<<=": "SHL_ASSIGN", ">>=": "SHR_ASSIGN",
    };
    return map[op];
  }

  // C99 6.3.1.1: integer promotions for bitfield expressions

  inferArraySizeFromInit(arrayType, initExpr) {
    const elemSize = arrayType.baseType.size || 1;
    if (initExpr instanceof AST.EString) {
      return Types.arrayOf(arrayType.baseType, initExpr.value.length / elemSize);
    }
    if (initExpr instanceof AST.EInitList) {
      // For char/short/int arrays initialized with a single string literal
      const bt = arrayType.baseType.removeQualifiers();
      if ((bt === Types.TCHAR || bt === Types.TSCHAR || bt === Types.TUCHAR ||
           bt === Types.TSHORT || bt === Types.TUSHORT || bt === Types.TINT || bt === Types.TUINT) &&
          initExpr.elements.length === 1 &&
          initExpr.elements[0] instanceof AST.EString) {
        return Types.arrayOf(arrayType.baseType, initExpr.elements[0].value.length / elemSize);
      }
      return Types.arrayOf(arrayType.baseType, initExpr.elements.length);
    }
    return arrayType;
  }

  computeTernaryType(thenType, elseType) {
    if (thenType === elseType) {
      // Same-type arithmetic operands still undergo the usual arithmetic
      // conversions (C11 6.5.15p5) — `1 ? c1 : c2` has type int, not char.
      // The identity early-out is only for non-arithmetic types (pointers,
      // aggregates, refs), where no promotion applies.
      const uq = thenType.removeQualifiers();
      if (uq.isInteger() || uq.isFloatingPoint()) {
        return Types.usualArithmeticConversions(thenType, elseType);
      }
      return thenType;
    }
    const tIsRef = thenType.removeQualifiers().isRef();
    const eIsRef = elseType.removeQualifiers().isRef();
    if (tIsRef && eIsRef) return thenType;
    if (tIsRef) return thenType;          // (ref ? ref : 0) → ref (null branch)
    if (eIsRef) return elseType;
    if (thenType.isPointer() && elseType.isPointer()) {
      // C99 6.5.15.6: result is a pointer to a type with the union of
      // qualifiers from both operands. Picking either side as-is can
      // drop const/volatile and silently miscompile (e.g. lua's ternary
      // `(line == 0) ? "main" : pushfstring(...)`).
      const tBase = thenType.baseType, eBase = elseType.baseType;
      const wantConst = tBase.isConst || eBase.isConst;
      const wantVolatile = tBase.isVolatile || eBase.isVolatile;
      let base = tBase.removeQualifiers();
      if (wantConst) base = base.addConst();
      if (wantVolatile) base = base.toggleVolatile();
      return base.pointer();
    }
    if (thenType.isPointer()) return thenType;
    if (elseType.isPointer()) return elseType;
    return Types.usualArithmeticConversions(thenType, elseType);
  }

  parseBinaryExpression(minPrec) {
    let left = this.parseCastExpression();

    while (!this.atEnd()) {
      const opTok = this.peek();
      if (opTok.kind !== Lexer.TokenKind.PUNCT) break;
      const op = opTok.text;
      const prec = this.getBinaryPrecedence(op);
      if (prec === 0 || prec < minPrec) break;

      this.advance();

      // Ternary
      if (op === "?") {
        left = this._validateCond(left, opTok, "ternary");
        let thenExpr = this.parseExpression();
        this.expect(":");
        let elseExpr = this.parseBinaryExpression(3);
        // Decay array/function-typed branches; ternary results are
        // always pointer-typed (or scalar/aggregate).
        thenExpr = maybeDecay(thenExpr);
        elseExpr = maybeDecay(elseExpr);
        const resType = this.computeTernaryType(thenExpr.type, elseExpr.type);
        // Both branches must produce the same type — wrap each in an
        // implicit cast to resType when needed.
        thenExpr = maybeImplicitCast(thenExpr, resType);
        elseExpr = maybeImplicitCast(elseExpr, resType);
        left = new AST.ETernary(left.loc, resType, left, thenExpr, elseExpr);
        continue;
      }

      // Comma operator
      if (op === ",") {
        const exprs = [left];
        exprs.push(this.parseBinaryExpression(2)); // above comma precedence
        while (this.matchText(",")) {
          exprs.push(this.parseBinaryExpression(2));
        }
        left = new AST.EComma(left.loc, exprs[exprs.length - 1].type, exprs);
        continue;
      }

      const nextMinPrec = this.isRightAssociative(op) ? prec : prec + 1;
      const right = this.parseBinaryExpression(nextMinPrec);
      const bop = this.textToBop(op);
      // Parser-side warning for array-decay arithmetic (gated by --pedantic).
      if (this.warningFlags.pointerDecay && (bop === "ADD" || bop === "SUB")) {
        if ((left.type.isArray() && right.type.isInteger()) ||
            (right.type.isArray() && left.type.isInteger())) {
          this.warning(this.peek(-1), "array used in arithmetic expression; decaying to pointer");
        }
      }
      left = AST.makeBinary(left.loc, bop, left, right);
    }
    return left;
  }

  parseAssignmentExpression() { return this.parseBinaryExpression(2); }
  parseExpression() { return this.parseBinaryExpression(1); }

  // --- Init list parsing ---
  parseInitList(type) {
    const startTok = this.peek();
    this.expect("{");
    const elements = [];
    const designators = [];
    let hasDesignators = false;
    if (!this.atText("}")) {
      do {
        if (this.atText("}")) break;
        // Parse designators
        const desig = { steps: [] };
        let inDesig = false;
        if (this.atText(".") && this.peek(1)?.kind === Lexer.TokenKind.IDENT &&
            this.peek(2)?.kind === Lexer.TokenKind.PUNCT &&
            (this.peek(2)?.text === "=" || this.peek(2)?.text === "." || this.peek(2)?.text === "[")) {
          inDesig = true;
        } else if (this.atText("[")) {
          inDesig = true;
        }
        while (inDesig) {
          if (this.atText(".") && this.peek(1)?.kind === Lexer.TokenKind.IDENT) {
            this.advance(); // consume '.'
            const name = this.advance().text; // consume field name
            desig.steps.push({ kind: "FIELD", fieldName: name });
            hasDesignators = true;
          } else if (this.atText("[")) {
            this.advance(); // consume '['
            const indexExpr = this.parseAssignmentExpression();
            this.expect("]");
            desig.steps.push({ kind: "INDEX", indexExpr });
            hasDesignators = true;
          } else {
            break;
          }
          if (!this.atText(".") && !this.atText("[")) break;
        }
        if (desig.steps.length > 0) {
          this.expect("=");
        }
        designators.push(desig);
        if (this.atText("{")) {
          // Nested init list - determine element type for sub-list
          let elemType = Types.TINT;
          if (type.isArray()) elemType = type.baseType;
          else if (type.isTag() && type.tagDecl && type.tagDecl.members) {
            const varMembers = getVarMembers(type.tagDecl);
            if (elements.length < varMembers.length) {
              elemType = varMembers[elements.length].type;
            }
          }
          elements.push(this.parseInitList(elemType));
        } else {
          elements.push(this.parseAssignmentExpression());
        }
      } while (this.matchText(",") && !this.atText("}"));
    }
    this.expect("}");
    return new AST.EInitList(Lexer.Loc.fromTok(startTok), type, elements, hasDesignators ? designators : null);
  }

  // --- Statement parsing ---

  parseStatement() {
    return this._parseStatement(Lexer.Loc.fromTok(this.peek()));
  }

  _parseStatement(loc) {
    // Empty statement
    if (this.matchText(";")) return new AST.SEmpty(loc);

    // Compound statement
    if (this.atText("{")) return this.parseCompoundStatement();

    // if
    if (this.matchKW(Lexer.Keyword.IF)) {
      const kwTok = this.peek(-1);
      this.expect("(");
      let cond = this.parseExpression();
      cond = this._validateCond(cond, kwTok, "if");
      this.expect(")");
      const thenBranch = this.parseStatement();
      let elseBranch = null;
      if (this.matchKW(Lexer.Keyword.ELSE)) elseBranch = this.parseStatement();
      return new AST.SIf(loc, cond, thenBranch, elseBranch);
    }

    // while
    if (this.matchKW(Lexer.Keyword.WHILE)) {
      const kwTok = this.peek(-1);
      this.expect("(");
      let cond = this.parseExpression();
      cond = this._validateCond(cond, kwTok, "while");
      this.expect(")");
      return new AST.SWhile(loc, cond, this.parseStatement());
    }

    // do-while
    if (this.matchKW(Lexer.Keyword.DO)) {
      const kwTok = this.peek(-1);
      const body = this.parseStatement();
      this.expectKW(Lexer.Keyword.WHILE);
      this.expect("(");
      let cond = this.parseExpression();
      cond = this._validateCond(cond, kwTok, "do-while");
      this.expect(")");
      this.expect(";");
      return new AST.SDoWhile(loc, body, cond);
    }

    // for
    if (this.matchKW(Lexer.Keyword.FOR)) {
      const kwTok = this.peek(-1);
      this.expect("(");
      this.typeScope.push(); this.tagScope.push(); this.varScope.push();
      let init = null, cond = null, incr = null;
      if (!this.matchText(";")) {
        if (this.isTypeName()) {
          init = this.parseDeclarationStatement();
        } else {
          const eTok = this.peek();
          const e = this.parseExpression();
          this.expect(";");
          init = new AST.SExpr(Lexer.Loc.fromTok(eTok), e);
        }
      }
      if (!this.matchText(";")) {
        cond = this.parseExpression();
        cond = this._validateCond(cond, kwTok, "for");
        this.expect(";");
      }
      if (!this.atText(")")) incr = this.parseExpression();
      this.expect(")");
      const body = this.parseStatement();
      this.typeScope.pop(); this.tagScope.pop(); this.varScope.pop();
      return new AST.SFor(loc, init, cond, incr, body);
    }

    // switch
    if (this.matchKW(Lexer.Keyword.SWITCH)) {
      const switchTok = this.peek(-1);
      this.expect("(");
      const expr = this.parseExpression();
      const exprType = expr.type.removeQualifiers();
      if (exprType.isRef()) {
        this.error(switchTok, `cannot switch on reference type '${expr.type.toString()}'`);
      } else if (!exprType.isInteger()) {
        this.error(switchTok, `switch expression must have integer type, got '${expr.type.toString()}'`);
      }
      this.expect(")");
      // Body parses with `_inSwitch = true` so `case`/`default` labels
      // are accepted (they are SCase nodes in the body's statement list).
      // `_switchSeen` tracks case values + default within the enclosing
      // switch so we can diagnose duplicates. Nested switches save/restore.
      const savedInSwitch = this._inSwitch;
      const savedSeen = this._switchSeen;
      this._inSwitch = true;
      this._switchSeen = { values: new Map(), hasDefault: false };
      const body = this.parseStatement();
      this._inSwitch = savedInSwitch;
      this._switchSeen = savedSeen;
      return new AST.SSwitch(loc, expr, body);
    }

    // case — emits an SCase node and returns it. The next statement
    // in the enclosing compound is the case's target (same pattern
    // as SLabel for goto labels). Multiple cases for one target
    // (`case 1: case 2: foo();`) produce consecutive SCase nodes.
    if (this.matchKW(Lexer.Keyword.CASE)) {
      const caseTok = this.peek(-1);
      const caseExpr = this.parseAssignmentExpression();
      const loVal = constEvalInt(caseExpr);
      if (loVal === null) {
        this.error(caseTok, "case label must be an integer constant expression");
      }
      let lo = loVal ?? 0n;
      let hi = lo;
      // GNU case range extension: case low ... high:
      if (this.atText("...")) {
        this.advance();
        const highExpr = this.parseAssignmentExpression();
        const hiVal = constEvalInt(highExpr);
        if (hiVal === null) {
          this.error(caseTok, "case range upper bound must be an integer constant expression");
        }
        hi = hiVal ?? lo;
        if (hi < lo) {
          this.error(caseTok, `case range is empty (${lo} > ${hi})`);
        }
      }
      this.expect(":");
      if (!this._inSwitch) {
        this.error(caseTok, "'case' label not within a switch statement");
      } else if (loVal !== null) {
        // Duplicate-case detection. For ranges we enumerate up to a cap
        // so we don't blow memory on `case 0 ... 0xFFFFFFFFFFFFFFFF:`;
        // beyond the cap we skip the check (codegen still works).
        const span = hi - lo;
        if (span <= 1024n) {
          for (let v = lo; v <= hi; v++) {
            const key = String(v);
            if (this._switchSeen.values.has(key)) {
              this.error(caseTok, `duplicate case label value ${v}`);
              break;
            }
            this._switchSeen.values.set(key, caseTok);
          }
        }
      }
      return new AST.SCase(loc, lo, hi, false);
    }

    // default — same idea as case.
    if (this.matchKW(Lexer.Keyword.DEFAULT)) {
      const defTok = this.peek(-1);
      this.expect(":");
      if (!this._inSwitch) {
        this.error(defTok, "'default' label not within a switch statement");
      } else {
        if (this._switchSeen.hasDefault) {
          this.error(defTok, "duplicate 'default' label in switch");
        }
        this._switchSeen.hasDefault = true;
      }
      return new AST.SCase(loc, 0n, 0n, true);
    }

    // break
    if (this.matchKW(Lexer.Keyword.BREAK)) { this.expect(";"); return new AST.SBreak(loc); }

    // continue
    if (this.matchKW(Lexer.Keyword.CONTINUE)) { this.expect(";"); return new AST.SContinue(loc); }

    // return
    if (this.matchKW(Lexer.Keyword.RETURN)) {
      const retType = this.currentParsingFunc?.type.getReturnType() || null;
      if (this.matchText(";")) return AST.makeReturn(loc, null, retType);
      const expr = this.parseExpression();
      this.expect(";");
      return AST.makeReturn(loc, expr, retType);
    }

    // goto
    if (this.matchKW(Lexer.Keyword.GOTO)) {
      const tok = this.expectKind(Lexer.TokenKind.IDENT);
      const label = tok.text;
      this.expect(";");
      const sg = new AST.SGoto(Lexer.Loc.fromTok(tok), label);
      if (this.parsedLabels.has(label)) {
        // Backward goto — label already defined.
        const target = this.parsedLabels.get(label);
        // Promote labelKind based on what's already there:
        //   FORWARD (with prior forward gotos)         → BOTH
        //   BOTH    (already had both kinds)           → BOTH (stays)
        //   FORWARD (constructor default, no prior gotos) → LOOP
        //   LOOP    (already had only backward gotos)  → LOOP (stays)
        // The hasGotos check distinguishes "FORWARD because forward gotos
        // were resolved" from "FORWARD because that's just the default."
        if (target.hasGotos && target.labelKind === Types.LabelKind.FORWARD) {
          target.labelKind = Types.LabelKind.BOTH;
        } else if (target.labelKind !== Types.LabelKind.BOTH) {
          target.labelKind = Types.LabelKind.LOOP;
        }
        target.hasGotos = true;
        sg.target = target;
      } else {
        // Forward goto — label not yet seen
        if (!this.pendingGotos.has(label)) this.pendingGotos.set(label, []);
        this.pendingGotos.get(label).push(sg);
      }
      return sg;
    }

    // label: statement
    //
    // A labeled statement is `label : statement` — the label owns the
    // following statement. SLabel is only a position-marker, so we parse the
    // body here and return a [SLabel, body] "label group" compound. When the
    // group sits directly in a compound it is flattened back into sibling
    // markers (parseCompoundStatement), leaving the common case unchanged;
    // when it is the bare body of an `if`/`while`/`for`/`else` it stays a
    // compound so the body cannot detach from its guard (the bug:
    //   if (c) lbl: s;   was parsed as   if (c) lbl: ; ... s;   making s
    // unconditional). Reduced from TCC's parse_define.
    if (this.atKind(Lexer.TokenKind.IDENT) && this.peek(1)?.text === ":") {
      const labelTok = this.peek();
      const labelLoc = Lexer.Loc.fromTok(labelTok);
      const name = this.advance().text;
      this.advance(); // skip :
      if (this.parsedLabels.has(name)) {
        this.error(this.peek(-2), `Duplicate label '${name}'`);
      }
      const sl = new AST.SLabel(labelLoc, name, null);
      this.parsedLabels.set(name, sl);
      // Resolve pending forward gotos
      if (this.pendingGotos.has(name)) {
        sl.labelKind = Types.LabelKind.FORWARD;
        sl.hasGotos = true;
        for (const sg of this.pendingGotos.get(name)) {
          sg.target = sl;
        }
        this.pendingGotos.delete(name);
      }
      // A label at the very end of a compound (`lbl: }`) has no following
      // statement — accepted as `lbl: ;` (GNU extension). Don't try to parse a
      // statement off the closing brace.
      const body = this.atText("}") ? new AST.SEmpty(labelLoc) : this.parseStatement();
      const group = new AST.SCompound(labelLoc, [sl, body], [sl], /*isLabelGroup*/ true);
      sl.enclosingBlock = group;
      return group;
    }

    // __try/__catch
    if (this.matchKW(Lexer.Keyword.X_TRY)) {
      const tryBody = this.parseCompoundStatement();
      const catches = [];
      while (this.matchKW(Lexer.Keyword.X_CATCH)) {
        if (this.atText("{")) {
          // catch_all
          const body = this.parseCompoundStatement();
          catches.push({ tag: null, bindings: [], body });
        } else {
          // __catch TagName(binding1, binding2) { ... }
          const tagName = this.expectKind(Lexer.TokenKind.IDENT).text;
          const tag = this.findExceptionTag(tagName);
          this.expect("(");
          const bindings = [];
          if (!this.atText(")")) {
            bindings.push(this.expectKind(Lexer.TokenKind.IDENT).text);
            while (this.matchText(",")) {
              bindings.push(this.expectKind(Lexer.TokenKind.IDENT).text);
            }
          }
          this.expect(")");
          // Push scope and register binding variables
          this.typeScope.push(); this.tagScope.push(); this.varScope.push();
          const bindingVars = [];
          for (let i = 0; i < bindings.length; i++) {
            const paramType = (tag && tag.paramTypes && i < tag.paramTypes.length) ? tag.paramTypes[i] : Types.TINT;
            const bvar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
              bindings[i], paramType, Types.StorageClass.NONE, null);
            bvar.definition = bvar;
            this.varScope.set(bindings[i], bvar);
            bindingVars.push(bvar);
          }
          const body = this.parseCompoundStatement();
          this.typeScope.pop(); this.tagScope.pop(); this.varScope.pop();
          catches.push({ tag, bindings, bindingVars, body });
        }
      }
      if (catches.length === 0) {
        this.error(this.peek(), "__try without any __catch clauses");
      }
      for (let i = 0; i < catches.length - 1; i++) {
        if (!catches[i].tag) {
          this.error(this.peek(), "catch-all (__catch without type) must be the last catch clause");
        }
      }
      return new AST.STryCatch(loc, tryBody, catches);
    }

    // __throw
    if (this.matchKW(Lexer.Keyword.X_THROW)) {
      const throwTok = this.peek(-1);
      const tagName = this.expectKind(Lexer.TokenKind.IDENT).text;
      this.expect("(");
      const args = [];
      if (!this.atText(")")) {
        args.push(this.parseAssignmentExpression());
        while (this.matchText(",")) args.push(this.parseAssignmentExpression());
      }
      this.expect(")");
      this.expect(";");
      // Decay array/function-typed throw args; tag params are pointer types.
      for (let i = 0; i < args.length; i++) args[i] = maybeDecay(args[i]);
      let tag = this.findExceptionTag(tagName);
      if (!tag) {
        // Recovery: synthesize a placeholder tag with divergent param
        // types so SThrow has the uniform tag shape downstream code
        // expects.
        this.recoverableError(throwTok, `Unknown exception tag '${tagName}'`);
        tag = new AST.DExceptionTag(Lexer.Loc.fromTok(throwTok), tagName,
          args.map(() => Types.TDIVERGENT));
        tag.definition = tag;
      }
      // Insert implicit casts on args matching the tag's parameter types.
      for (let i = 0; i < args.length && i < tag.paramTypes.length; i++) {
        args[i] = maybeImplicitCast(args[i], tag.paramTypes[i]);
      }
      return new AST.SThrow(loc, tag, args);
    }

    // _Static_assert inside function body
    if (this.matchKW(Lexer.Keyword.STATIC_ASSERT)) {
      this.expect("(");
      const condExpr = this.parseAssignmentExpression();
      let msg = "";
      if (this.matchText(",")) {
        const msgTok = this.expectKind(Lexer.TokenKind.STRING);
        msg = msgTok.text.replace(/^"(.*)"$/, '$1');
      }
      this.expect(")");
      this.expect(";");
      const val = constEvalInt(condExpr);
      if (val === 0n) this.recoverableError(this.peek(-1) || this.peek(), `_Static_assert failed: ${msg}`);
      return new AST.SCompound(loc, []);
    }

    // Declaration statement
    if (this.isTypeName()) {
      return this.parseDeclarationStatement();
    }

    // Expression statement
    const expr = this.parseExpression();
    this.expect(";");
    return new AST.SExpr(loc, expr);
  }

  findExceptionTag(name) {
    for (const tag of this.parsedExceptionTags) {
      if (tag.name === name) return tag;
    }
    return null;
  }

  parseCompoundStatement() {
    const startTok = this.peek();
    this.expect("{");
    this.typeScope.push(); this.tagScope.push(); this.varScope.push();
    const statements = [];
    const compound = new AST.SCompound(Lexer.Loc.fromTok(startTok), statements);
    const savedCompound = this.currentCompound;
    this.currentCompound = compound;
    // Flatten a [SLabel, body] label group into sibling markers in this
    // compound, re-homing the label here. Recurses so chained labels
    // (`l1: l2: s;`) and nested groups also flatten fully — leaving the
    // in-compound label model (marker + following statements) byte-for-byte
    // identical to what direct parsing produced before label groups existed.
    const flattenInto = (stmt) => {
      if (stmt instanceof AST.SCompound && stmt.isLabelGroup) {
        for (const child of stmt.statements) {
          if (child instanceof AST.SLabel) {
            child.enclosingBlock = compound;
            compound.labels.push(child);
            statements.push(child);
          } else {
            flattenInto(child);
          }
        }
      } else {
        statements.push(stmt);
      }
    };
    while (!this.atEnd() && !this.atText("}")) {
      flattenInto(this.parseStatement());
    }
    this.currentCompound = savedCompound;
    this.expect("}");
    this.typeScope.pop(); this.tagScope.pop(); this.varScope.pop();
    return compound;
  }

  parseDeclarationStatement() {
    const startTok = this.peek();
    const startLoc = Lexer.Loc.fromTok(startTok);
    const declarations = [];
    const specs = this.parseDeclSpecifiers();
    let baseType = specs.type;

    if (this.matchText(";")) {
      // Anonymous struct/union/enum declaration
      return new AST.SDecl(startLoc, declarations);
    }

    let first = true;
    while (!this.atEnd()) {
      if (!first) { if (!this.matchText(",")) break; }
      first = false;

      const declTok = this.peek();
      const decl = this.parseDeclarator(baseType, specs.storageClass === Types.StorageClass.TYPEDEF);
      let type = decl.type;
      const name = decl.name || "__unnamed";

      // Parse __attribute__ after declarator
      const localAttrs = this.parseGCCAttributes();
      if (localAttrs.aligned > 0 && specs.requestedAlignment < localAttrs.aligned) {
        specs.requestedAlignment = localAttrs.aligned;
      }

      if (specs.storageClass === Types.StorageClass.TYPEDEF) {
        if (specs.requestedAlignment > 0) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a typedef");
        }
        const prevType = this.typeScope.getInCurrentScope(name);
        if (prevType && prevType.removeQualifiers() !== type.removeQualifiers()) {
          this.error(this.peek(), `redefinition of typedef '${name}'`);
        }
        this.typeScope.set(name, type);
        if (this.matchText(";")) return new AST.SDecl(startLoc, declarations);
        continue;
      }

      // Reject heap-form GC struct types in value-position slots.
      Types.validateNoHeapInValueType(type, msg => this.error(this.peek(), msg));

      // Local extern function declaration (e.g. extern int f(void);)
      if (type.isFunction()) {
        if (specs.requestedAlignment > 0) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a function declaration");
        }
        const funcDecl = new AST.DFunc({ filename: this.peek().filename, line: this.peek().line },
          name, type, [], specs.storageClass, false, null);
        funcDecl.importModule = specs.importModule;
        funcDecl.importName = specs.importName;
        // C11 6.2.2p4 (via p5 for no-storage-class): a block-scope
        // re-declaration of a visible static function inherits its
        // internal linkage — keep the existing binding, drop the
        // redundant decl (todos/0219).
        const prevFn = this.varScope.get(name);
        if (prevFn instanceof AST.DFunc &&
            prevFn.storageClass === Types.StorageClass.STATIC &&
            specs.storageClass !== Types.StorageClass.STATIC &&
            specs.storageClass !== Types.StorageClass.IMPORT) {
          continue;
        }
        this.varScope.set(name, funcDecl);
        if (this.currentParsingFunc) {
          this.currentParsingFunc.externLocalFuncs.push(funcDecl);
        }
        // Don't include in declaration statement (diverted like C++ does)
        continue;
      }

      const dvar = new AST.DVar({ filename: this.peek().filename, line: this.peek().line },
        name, type, specs.storageClass, null);
      if (specs.requestedAlignment > 0) {
        if (specs.storageClass === Types.StorageClass.REGISTER) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a register variable");
        }
        if (specs.requestedAlignment < (type.align || 1)) {
          this.error(this.peek(), `_Alignas cannot reduce alignment below natural alignment of type '${type.toString()}'`);
        }
        dvar.requestedAlignment = specs.requestedAlignment;
      }
      // Local non-extern variables are always definitions
      if (specs.storageClass !== Types.StorageClass.EXTERN) dvar.definition = dvar;

      // Set allocClass
      if (type.isAggregate()) dvar.allocClass = Types.AllocClass.MEMORY;
      else if (specs.storageClass === Types.StorageClass.EXTERN) dvar.allocClass = Types.AllocClass.MEMORY;

      // C11 6.2.2p4: a block-scope `extern` re-declaration of a visible
      // FILE-scope static inherits its internal linkage and denotes that
      // same object — capture the prior binding before this declarator
      // shadows it (consumed at the extern divert below, todos/0219).
      // Identity with the level-0 binding, not a level check: an earlier
      // extern in an enclosing block re-bound the SAME file-scope decl at
      // its own level, while a static LOCAL (no linkage, 6.2.2p6 — not
      // inherited) is a different node.
      let priorFileStatic = null;
      if (specs.storageClass === Types.StorageClass.EXTERN) {
        const vis = this.varScope.get(name);
        if (vis instanceof AST.DVar &&
            vis.storageClass === Types.StorageClass.STATIC &&
            this.varScope.stack[0].get(name) === vis) {
          priorFileStatic = vis;
        }
      }
      // Add to scope before parsing initializer (C11 §6.2.1p7: scope begins
      // after the declarator, so sizeof(*p) in `T *p = malloc(sizeof(*p))` is valid).
      this.varScope.set(name, dvar);

      // Parse initializer
      if (this.matchText("=")) {
        const eqTok = this.peek(-1);
        if (this.atText("{")) {
          if (baseType === Types.TAUTO) {
            this.error(declTok, `'auto ${name}' cannot be initialized from a braced initializer list`);
          }
          dvar.initExpr = this.parseInitList(type);
        } else {
          dvar.initExpr = this.parseAssignmentExpression();
          // C23 `auto`: infer type from init before applying any other checks.
          if (baseType === Types.TAUTO) {
            type = this._resolveAuto(baseType, type, name, dvar.initExpr, declTok);
            dvar.type = type;
            // Re-evaluate allocClass: aggregates need MEMORY storage.
            if (type.isAggregate()) dvar.allocClass = Types.AllocClass.MEMORY;
          }
        }
        // Handle string-initialized char array
        if (type.isArray() && type.arraySize === 0 && dvar.initExpr &&
            dvar.initExpr instanceof AST.EString) {
          type = dvar.initExpr.type;
          dvar.type = type;
        } else if (type.isArray() && (type.arraySize || 0) > 0 && dvar.initExpr &&
                   dvar.initExpr instanceof AST.EString &&
                   dvar.initExpr.type && dvar.initExpr.type.isArray() &&
                   dvar.initExpr.type.arraySize - 1 > type.arraySize) {
          // C11 6.7.9p14: the string may exceed the array only by its NUL —
          // silently truncating used to hide real overflows.
          this.recoverableError(eqTok,
            `initializer string (${dvar.initExpr.type.arraySize - 1} chars) is too long for '${type.toString()}'`);
        }
        // Normalize init list
        if (dvar.initExpr && dvar.initExpr instanceof AST.EInitList) {
          if (type.isArray() && type.arraySize === 0) {
            dvar.initExpr = normalizeInitList(dvar.initExpr, type);
            type = dvar.initExpr.type;
            dvar.type = type;
          } else if (type.isAggregate()) {
            dvar.initExpr = normalizeInitList(dvar.initExpr, type);
            // C11 6.7.2.1: a flexible array member is ignored by
            // initialization; the gcc/clang extension allows FAM init only
            // for STATIC storage, where the object is sized with the extra
            // (computeInitAllocSize). An automatic slot is plain sizeOf, so
            // the FAM element stores would run past the frame slot — gcc
            // and clang both reject this (todos/0205).
            if (specs.storageClass !== Types.StorageClass.STATIC &&
                initListInitializesFAM(type, dvar.initExpr)) {
              this.recoverableError(eqTok,
                "initialization of a flexible array member in an automatic-storage object");
            }
          } else {
            // C99 §6.7.8p11: a scalar may be brace-initialized.
            // `int x = {0}` is legal; unwrap to the single element
            // so codegen never sees EInitList for a non-aggregate.
            if (dvar.initExpr.elements.length === 1) {
              dvar.initExpr = dvar.initExpr.elements[0];
            } else if (dvar.initExpr.elements.length === 0) {
              this.error(eqTok, "empty brace initializer for scalar");
            } else {
              this.error(eqTok, "excess elements in scalar initializer");
            }
          }
        }
        // Insert an implicit cast for scalar inits whose source type
        // doesn't match the declared type. Aggregate / EInitList inits
        // handle conversion per-element via normalizeInitList.
        if (dvar.initExpr && !type.isAggregate() &&
            !(dvar.initExpr instanceof AST.EInitList)) {
          // Initializing a pointer from an array/function decays first.
          if (type.isPointer()) dvar.initExpr = maybeDecay(dvar.initExpr);
          dvar.initExpr = maybeImplicitCast(dvar.initExpr, type);
        }
      }

      // Catch `auto x;` (no initializer).
      if (baseType === Types.TAUTO && dvar.type === Types.TAUTO) {
        this.error(declTok, `'auto ${name}' requires an initializer`);
        dvar.type = Types.TINT;
      }

      // Divert static/extern locals: treat them as globals for allocation/linking
      if (this.currentParsingFunc) {
        if (specs.storageClass === Types.StorageClass.STATIC) {
          this.currentParsingFunc.staticLocals.push(dvar);
          // Don't include in declaration statement
        } else if (specs.storageClass === Types.StorageClass.EXTERN) {
          if (priorFileStatic instanceof AST.DVar &&
              priorFileStatic.storageClass === Types.StorageClass.STATIC) {
            // C11 6.2.2p4: re-binds the visible file-scope static; not an
            // external-linkage declaration at all (todos/0219).
            this.varScope.replaceInCurrentScope(name, priorFileStatic);
          } else {
            this.currentParsingFunc.externLocals.push(dvar);
          }
        } else {
          declarations.push(dvar);
        }
      } else {
        declarations.push(dvar);
      }
    }
    this.expect(";");
    return new AST.SDecl(startLoc, declarations);
  }

  // --- External declaration parsing ---

  parseExternalDeclaration(unit) {
    const loc = Lexer.Loc.fromTok(this.peek());
    // Empty declaration: a bare `;` at file scope. C2x makes this
    // standard; GCC and clang accept it in C99/C11 as an extension. We
    // accept it silently so projects that use `MACRO;` where MACRO
    // expands to empty (e.g. SQLite's SQLITE_EXTENSION_INIT1 inside the
    // amalgamated shell.c) compile cleanly.
    if (this.matchText(";")) return;
    const specs = this.parseDeclSpecifiers();
    let baseType = specs.type;

    // Handle bare tag declaration: struct Foo { ... };
    if (this.matchText(";")) return;

    if (baseType === Types.TAUTO) {
      this.error(this.peek(), "'auto' type inference is only supported at function scope");
    }

    let first = true;
    while (true) {
      if (!first) { if (!this.matchText(",")) break; }
      first = false;

      const decl = this.parseDeclarator(baseType, specs.storageClass === Types.StorageClass.TYPEDEF);
      let type = decl.type;
      const name = decl.name || "__unnamed";

      // Parse __attribute__ after declarator
      const declAttrs = this.parseGCCAttributes();
      if (declAttrs.aligned > 0 && specs.requestedAlignment < declAttrs.aligned) {
        specs.requestedAlignment = declAttrs.aligned;
      }

      if (specs.storageClass === Types.StorageClass.TYPEDEF) {
        if (specs.requestedAlignment > 0) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a typedef");
        }
        const prevType = this.typeScope.get(name);
        if (prevType && prevType.removeQualifiers() !== type.removeQualifiers()) {
          this.error(this.peek(), `redefinition of typedef '${name}'`);
        }
        this.typeScope.set(name, type);
        continue;
      }

      // Reject heap-form GC struct types at any value-position slot of the
      // declared variable / function (return type, params).
      Types.validateNoHeapInValueType(type, msg => this.error(this.peek(), msg));

      // K&R parameter declarations: parse type declarations between ')' and '{'
      if (decl._isKnR && type.isFunction() &&
          !this.atText("{") && !this.atText(";") && !this.atText(",")) {
        const knrParamNames = decl._paramNames || [];
        const knrParamTypes = [...(type.paramTypes || [])];
        while (!this.atText("{") && !this.atEnd()) {
          const pSpecs = this.parseDeclSpecifiers();
          do {
            const pDecl = this.parseDeclarator(pSpecs.type);
            const finalType = pDecl.type.decay();
            const idx = knrParamNames.indexOf(pDecl.name);
            if (idx >= 0) knrParamTypes[idx] = finalType;
          } while (this.matchText(","));
          this.expect(";");
        }
        // C89 6.5.2.2p6: the unprototyped-call ABI is in DEFAULT-PROMOTED
        // terms — callers through empty-parens decls promote float args to
        // double, so a K&R `float` parameter is RECEIVED as double. Promote
        // the function type's param slot (the wasm signature) to match those
        // call sites; the parameter variable keeps its declared float type
        // via _knrDeclaredTypes and codegen demotes the incoming double at
        // function entry (todos/0159). Sub-int params need no promotion
        // here — char/short/int share the i32 wasm type.
        decl._knrDeclaredTypes = [...knrParamTypes];
        for (let i = 0; i < knrParamTypes.length; i++) {
          if (knrParamTypes[i].removeQualifiers() === Types.TFLOAT) knrParamTypes[i] = Types.TDOUBLE;
        }
        type = Types.functionType(type.returnType, knrParamTypes, type.isVarArg, false);
        decl.type = type;
      }

      // For functions: every GC struct/array referenced in the signature must
      // be complete. WASM function signatures need a concrete type idx, and
      // there's no way to encode `(ref null incomplete)`. Recurse through
      // pointer/array/function types so a typedef like
      //   typedef __struct Foo *(*Fp)(int); Fp get_fp(void);
      // also gets caught when Foo is incomplete.
      if (type.isFunction()) {
        const seen = new Set();
        const checkComplete = (t) => {
          if (!t || seen.has(t)) return;
          seen.add(t);
          const u = t.removeQualifiers();
          if (u.isGCStruct() && !u.isComplete) {
            this.error(this.peek(), `function '${name}' references incomplete GC struct '${u.tagName}' in its signature; define '${u.tagName}' first`);
          }
          if (u.isPointer() || u.isArray()) checkComplete(u.baseType);
          else if (u.isGCArray()) checkComplete(u.baseType);
          else if (u.isFunction()) {
            checkComplete(u.returnType);
            for (const pt of (u.paramTypes || [])) checkComplete(pt);
          }
        };
        checkComplete(type.returnType);
        for (const pt of (type.paramTypes || [])) checkComplete(pt);
      }

      // Check if this is a function definition
      if (type.isFunction() && this.atText("{")) {
        if (specs.requestedAlignment > 0) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a function declaration");
        }
        const funcDecl = new AST.DFunc(loc, name, type,
          [], specs.storageClass, specs.isInline, null);
        funcDecl.importModule = specs.importModule;
        funcDecl.importName = specs.importName;
        funcDecl.fnAttrs = this._mkFnAttrs(specs.attrFlags, declAttrs.flags);

        // Update previous declaration's definition pointer
        const prev = this.varScope.get(name);
        if (prev && prev instanceof AST.DFunc) {
          if (!prev.type.isCompatibleWith(funcDecl.type)) {
            this.error(this.peek(), `conflicting types for '${name}' (previously declared as '${prev.type.toString()}', now defined as '${funcDecl.type.toString()}')`);
          }
          prev.definition = funcDecl;
          // Attributes on an earlier prototype apply to the definition
          // (gcc semantics, per-TU) — todos/0214.
          funcDecl.fnAttrs = this._mergeFnAttrs(funcDecl.fnAttrs, prev.fnAttrs);
        }

        // Register function in scope before pushing param scope (so it persists globally)
        this.varScope.set(name, funcDecl);

        // Push scope for parameters
        this.typeScope.push(); this.tagScope.push(); this.varScope.push();
        const paramTypes = type.paramTypes || [];
        const params = [];
        if (decl._paramNames) {
          for (let i = 0; i < decl._paramNames.length; i++) {
            const pname = decl._paramNames[i] || ("__param" + i);
            // K&R defs: the variable keeps its DECLARED type (float) while
            // the function type carries the promoted ABI slot (double) —
            // sizeof/&param semantics stay C89-correct; codegen converts at
            // entry (todos/0159).
            const ptype = (decl._knrDeclaredTypes && i < decl._knrDeclaredTypes.length)
              ? decl._knrDeclaredTypes[i]
              : (i < paramTypes.length ? paramTypes[i] : Types.TINT);
            const pvar = new AST.DVar(loc, pname, ptype, Types.StorageClass.AUTO, null);
            if (ptype.isAggregate()) pvar.allocClass = Types.AllocClass.MEMORY;
            pvar.definition = pvar; // parameters are always definitions
            params.push(pvar);
            this.varScope.set(pname, pvar);
          }
        } else {
          // No param names available (abstract declarator)
          for (let i = 0; i < paramTypes.length; i++) {
            const pvar = new AST.DVar(loc, "__param" + i, paramTypes[i], Types.StorageClass.AUTO, null);
            if (paramTypes[i].isAggregate()) pvar.allocClass = Types.AllocClass.MEMORY;
            pvar.definition = pvar; // parameters are always definitions
            params.push(pvar);
          }
        }
        funcDecl.parameters = params;

        const savedFunc = this.currentParsingFunc;
        this.currentParsingFunc = funcDecl;
        this.parsedLabels.clear();
        this.pendingGotos.clear();

        funcDecl.body = this.parseCompoundStatement();

        // Check for unresolved gotos
        for (const [name] of this.pendingGotos) {
          this.recoverableError(this.peek(), `Undefined label '${name}'`);
        }
        this.pendingGotos.clear();
        this.parsedLabels.clear();
        this.currentParsingFunc = savedFunc;
        this.typeScope.pop(); this.tagScope.pop(); this.varScope.pop();

        // Categorize
        if (specs.storageClass === Types.StorageClass.IMPORT) unit.importedFunctions.push(funcDecl);
        else if (specs.storageClass === Types.StorageClass.STATIC) unit.staticFunctions.push(funcDecl);
        else unit.definedFunctions.push(funcDecl);

        // Move extern locals to unit
        for (const v of funcDecl.externLocals) unit.localExternVariables.push(v);
        for (const f of funcDecl.externLocalFuncs) unit.localDeclaredFunctions.push(f);

        return; // function definition ends the declarator list
      }

      // Function declaration (no body)
      if (type.isFunction()) {
        if (specs.requestedAlignment > 0) {
          this.error(this.peek(-1), "_Alignas cannot be applied to a function declaration");
        }
        const funcDecl = new AST.DFunc(loc, name, type,
          [], specs.storageClass, specs.isInline, null);
        funcDecl.importModule = specs.importModule;
        funcDecl.importName = specs.importName;
        funcDecl.fnAttrs = this._mkFnAttrs(specs.attrFlags, declAttrs.flags);

        // Build parameter list
        const paramTypes = type.paramTypes || [];
        if (decl._paramNames) {
          for (let i = 0; i < decl._paramNames.length; i++) {
            const pname = decl._paramNames[i] || ("__param" + i);
            const ptype = i < paramTypes.length ? paramTypes[i] : Types.TINT;
            const pvar = new AST.DVar(loc, pname, ptype, Types.StorageClass.AUTO, null);
            if (ptype.isAggregate()) pvar.allocClass = Types.AllocClass.MEMORY;
            funcDecl.parameters.push(pvar);
          }
        } else {
          for (let i = 0; i < paramTypes.length; i++) {
            const pvar = new AST.DVar(loc, "__param" + i, paramTypes[i], Types.StorageClass.AUTO, null);
            if (paramTypes[i].isAggregate()) pvar.allocClass = Types.AllocClass.MEMORY;
            funcDecl.parameters.push(pvar);
          }
        }

        const prevFunc = this.varScope.get(name);
        if (prevFunc && prevFunc instanceof AST.DFunc && !prevFunc.type.isCompatibleWith(funcDecl.type)) {
          this.error(this.peek(), `conflicting types for '${name}' (previously declared as '${prevFunc.type.toString()}', now declared as '${funcDecl.type.toString()}')`);
        }
        if (prevFunc && prevFunc instanceof AST.DFunc) {
          // Redeclarations accumulate attributes (gcc semantics); a decl
          // AFTER the definition also back-propagates onto it.
          funcDecl.fnAttrs = this._mergeFnAttrs(funcDecl.fnAttrs, prevFunc.fnAttrs);
          const def = prevFunc.definition ||
            (prevFunc.body ? prevFunc : null);
          if (def) def.fnAttrs = this._mergeFnAttrs(def.fnAttrs, funcDecl.fnAttrs);
        }
        // Plain re-declaration of an existing import: keep the original
        // import decl in scope. Otherwise the new EXTERN would shadow
        // it, all callers would bind to the new node, and the per-TU
        // tree-shake would drop the import as unreached (it isn't —
        // the callers just point at its replacement). Example: SQLite's
        // shell.c writes `extern int isatty(int);` after <unistd.h>
        // already provided `__import int isatty(int);`.
        if (prevFunc && prevFunc instanceof AST.DFunc &&
            prevFunc.storageClass === Types.StorageClass.IMPORT &&
            specs.storageClass !== Types.StorageClass.IMPORT &&
            specs.storageClass !== Types.StorageClass.STATIC) {
          continue;  // drop redundant re-declaration, keep import binding
        }
        // C11 6.2.2p4 (via p5 for no-storage-class): a re-declaration of
        // an internal-linkage (static) function inherits internal linkage
        // — it names the SAME function, not a new external one. Keep the
        // static decl in scope and drop the redundant re-declaration so
        // callers keep binding the internal definition (`static int
        // f(void) {...} extern int f(void);` must link — todos/0219).
        if (prevFunc && prevFunc instanceof AST.DFunc &&
            prevFunc.storageClass === Types.StorageClass.STATIC &&
            specs.storageClass !== Types.StorageClass.STATIC &&
            specs.storageClass !== Types.StorageClass.IMPORT) {
          continue;
        }
        this.varScope.replace(name, funcDecl);
        if (specs.storageClass === Types.StorageClass.IMPORT) unit.importedFunctions.push(funcDecl);
        else unit.declaredFunctions.push(funcDecl);
        continue;
      }

      // Variable declaration
      const dvar = new AST.DVar(loc, name, type, specs.storageClass, null);
      // Check for conflicting variable declarations
      const prevVar = this.varScope.get(name);
      if (prevVar && prevVar instanceof AST.DVar && !prevVar.type.isCompatibleWith(type)) {
        this.error(this.peek(), `conflicting types for '${name}' (previously declared as '${prevVar.type.toString()}', now declared as '${type.toString()}')`);
      }
      if (specs.requestedAlignment > 0) {
        if (specs.requestedAlignment < (type.align || 1)) {
          this.error(this.peek(), `_Alignas cannot reduce alignment below natural alignment of type '${type.toString()}'`);
        }
        dvar.requestedAlignment = specs.requestedAlignment;
      }
      if (type.isAggregate() || type.isArray()) dvar.allocClass = Types.AllocClass.MEMORY;
      else if (specs.storageClass === Types.StorageClass.EXTERN) dvar.allocClass = Types.AllocClass.MEMORY;

      if (this.matchText("=")) {
        const eqTok = this.peek(-1);
        if (this.atText("{")) {
          dvar.initExpr = this.parseInitList(type);
        } else {
          dvar.initExpr = this.parseAssignmentExpression();
          // File-scope ref-typed globals: WASM constant init expressions
          // can only emit ref.null. Allocation (e.g. boxing a primitive)
          // is not allowed at module-init time.
          if (type.removeQualifiers().isRef() && !AST.isNullPointerConstant(dvar.initExpr) &&
              !dvar.initExpr.type.removeQualifiers().isRef()) {
            this.error(eqTok,
              `global '${name}': reference-typed globals can only be initialized to null/0 ` +
              `(WASM constant init expressions can't allocate); set the value in main() or a startup function`);
          }
        }
        // Handle string-initialized char array
        if (type.isArray() && type.arraySize === 0 && dvar.initExpr &&
            dvar.initExpr instanceof AST.EString) {
          type = Types.arrayOf(type.baseType, dvar.initExpr.type.arraySize);
          dvar.type = type;
        } else if (type.isArray() && (type.arraySize || 0) > 0 && dvar.initExpr &&
                   dvar.initExpr instanceof AST.EString &&
                   dvar.initExpr.type && dvar.initExpr.type.isArray() &&
                   dvar.initExpr.type.arraySize - 1 > type.arraySize) {
          // C11 6.7.9p14: the string may exceed the array only by its NUL —
          // silently truncating used to hide real overflows.
          this.recoverableError(eqTok,
            `initializer string (${dvar.initExpr.type.arraySize - 1} chars) is too long for '${type.toString()}'`);
        }
        // Normalize init list
        if (dvar.initExpr && dvar.initExpr instanceof AST.EInitList) {
          if (type.isArray() && type.arraySize === 0) {
            dvar.initExpr = normalizeInitList(dvar.initExpr, type);
            type = dvar.initExpr.type;
            dvar.type = type;
          } else if (type.isAggregate()) {
            dvar.initExpr = normalizeInitList(dvar.initExpr, type);
          } else {
            // C99 §6.7.8p11: a scalar may be brace-initialized.
            // `int x = {0}` is legal; unwrap to the single element
            // so codegen never sees EInitList for a non-aggregate.
            if (dvar.initExpr.elements.length === 1) {
              dvar.initExpr = dvar.initExpr.elements[0];
            } else if (dvar.initExpr.elements.length === 0) {
              this.error(eqTok, "empty brace initializer for scalar");
            } else {
              this.error(eqTok, "excess elements in scalar initializer");
            }
          }
        }
        // Insert an implicit cast for scalar inits whose source type
        // doesn't match the declared type. Aggregate / EInitList inits
        // handle conversion per-element via normalizeInitList.
        if (dvar.initExpr && !type.isAggregate() &&
            !(dvar.initExpr instanceof AST.EInitList)) {
          // Initializing a pointer from an array/function decays first.
          if (type.isPointer()) dvar.initExpr = maybeDecay(dvar.initExpr);
          dvar.initExpr = maybeImplicitCast(dvar.initExpr, type);
        }
      }

      // Check for previous declaration and update scope
      const prevDecl = this.varScope.get(name);
      // C11 6.2.2p7 (todos/0227 G22): a static (internal-linkage)
      // declaration after a visible declaration with EXTERNAL linkage
      // conflicts — the p4 inheritance only runs the other way
      // (static first, extern after — the divert below).
      if (specs.storageClass === Types.StorageClass.STATIC &&
          prevDecl instanceof AST.DVar &&
          (prevDecl.storageClass === Types.StorageClass.EXTERN ||
           prevDecl.storageClass === Types.StorageClass.NONE)) {
        this.recoverableError(this.peek(-1),
          `static declaration of '${name}' follows non-static declaration`);
      }
      if (prevDecl && prevDecl instanceof AST.DVar && specs.storageClass !== Types.StorageClass.EXTERN) {
        prevDecl.definition = dvar;
        // Propagate address-taken (MEMORY) allocation forward to the new
        // definition. `&prevDecl` (e.g. via OP_ADDR) promotes the earlier
        // DVar to MEMORY, but a later tentative re-declaration becomes the
        // definition that codegen allocates; without this it would stay
        // REGISTER and `emitAddressOf` would fail ("Cannot take address of
        // REGISTER variable"). The extern-declaration-then-definition case
        // is handled separately by setDefinition in linkTranslationUnits, so
        // restrict to non-extern earlier declarations (the tentative-def /
        // static case, e.g. TCC's `define_stack`) to avoid needlessly
        // forcing extern-forward-declared scalars into linear memory.
        if (prevDecl.allocClass === Types.AllocClass.MEMORY &&
            prevDecl.storageClass !== Types.StorageClass.EXTERN) {
          dvar.allocClass = Types.AllocClass.MEMORY;
        }
      }
      // C11 6.2.2p4: an `extern` re-declaration after a visible prior
      // declaration with internal linkage inherits that linkage — `static
      // int x = 4; extern int x;` re-declares the SAME static object, not
      // a new external one. Keep the static decl as the binding and drop
      // the redundant re-declaration (the import-re-declaration precedent
      // in the function path). With an initializer it is a second
      // DEFINITION of that internal object: give it internal linkage and
      // route it to the TU link scope — one object either way (the
      // redefinition diagnostic itself is a pre-existing gap shared with
      // `static int x = 4; static int x = 5;`, which clang rejects and
      // this compiler silently accepts).
      if (specs.storageClass === Types.StorageClass.EXTERN &&
          prevDecl instanceof AST.DVar &&
          prevDecl.storageClass === Types.StorageClass.STATIC) {
        if (dvar.initExpr == null) continue;
        dvar.storageClass = Types.StorageClass.STATIC;
        unit.definedVariables.push(dvar);
        continue;
      }
      // Use replace to update the scope entry (varScope.set fails if name already exists)
      this.varScope.replace(name, dvar);
      if (specs.storageClass === Types.StorageClass.EXTERN) unit.externVariables.push(dvar);
      else unit.definedVariables.push(dvar);
    }
    this.expect(";");
  }

  // Override parseDeclarator to capture param names for functions
  parseDeclarator(baseType, isTypedef) {
    let type = baseType;
    let ptrCount = 0;
    while (this.matchText("*")) {
      const starTok = this.peek(-1);
      // GC arrays don't take the `*` sugar — there's no C "pointer to array"
      // idiom to mirror. Reject it explicitly so users use `__array(T)` directly.
      if (type.isGCArray()) {
        this.error(starTok, `'__array(...)' types do not take a '*' — write '__array(T) name' (the array is already a reference)`);
      }
      // Double-`*` on a GC struct (`__struct Foo **`) — wasm has no `(ref ref T)`.
      if (type.isGCStruct()) {
        this.error(starTok, `'${type.toString()}' is already a reference; '__struct Foo **' is not allowed`);
        break;
      }
      ptrCount++;
      type = type.pointer();
      while (true) {
        if (this.matchKW(Lexer.Keyword.CONST)) { type = type.addConst(); continue; }
        if (this.matchKW(Lexer.Keyword.VOLATILE)) { type = type.addVolatile(); continue; }
        if (this.matchKW(Lexer.Keyword.RESTRICT)) continue;
        break;
      }
    }
    let name = null;
    let paramNames = null;

    // Parenthesized declarator: int (*fp)(...)
    if (this.atText("(") && !this.isStartOfParamList()) {
      this.advance();
      const saved = type;
      const inner = this.parseDeclarator(type);
      this.expect(")");
      type = this.parseDeclaratorSuffixWithNames(saved);
      const combined = this.combineDeclaratorTypes(inner.type, saved, type.type, inner._ptrCount);
      return { type: combined, name: inner.name, _paramNames: inner._paramNames || type._paramNames, _isKnR: inner._isKnR || type._isKnR, _ptrCount: ptrCount };
    }

    if (this.atKind(Lexer.TokenKind.IDENT)) {
      name = this.advance().text;
    }

    const suffix = this.parseDeclaratorSuffixWithNames(type);
    return { type: suffix.type, name, _paramNames: suffix._paramNames, _isKnR: suffix._isKnR, _ptrCount: ptrCount };
  }

  parseDeclaratorSuffixWithNames(type) {
    let paramNames = null;
    let isKnRResult = false;
    while (true) {
      if (this.atText("[")) {
        // Collect all consecutive array dimensions and apply in REVERSE order
        // because C's int arr[2][3] means array of 2 elements, each being int[3]
        const arrayDims = [];
        while (this.matchText("[")) {
          let size = 0;
          if (!this.atText("]")) {
            const sizeTok = this.peek();
            const sizeExpr = this.parseAssignmentExpression();
            const sz = constEvalInt(sizeExpr);
            if (sz == null) {
              // A size expression that isn't an integer constant would make
              // this a VLA. We define __STDC_NO_VLA__ — reject it instead of
              // silently compiling with size 0 (sizeof 0, row stride 0).
              this.error(sizeTok, "variable-length arrays are not supported");
            }
            // C11 6.7.6.2p1: the size must be greater than zero. Explicit
            // [0] stays accepted (GNU zero-length array); negative used to
            // silently produce a negative-size type (todos/0227 G22).
            if (sz < 0n) {
              this.error(sizeTok, `declared as an array with a negative size (${sz})`);
            }
            size = Number(sz);
          }
          this.expect("]");
          arrayDims.push(size);
        }
        if (type.removeQualifiers().isRef()) {
          this.error(this.peek(-1),
            `cannot have a C array of reference type '${type.toString()}' (refs live on the GC heap, not in linear memory) — use __array(${type.toString()}) instead`);
        }
        for (let i = arrayDims.length - 1; i >= 0; i--) {
          type = Types.arrayOf(type, arrayDims[i]);
        }
        continue;
      }
      if (this.matchText("(")) {
        const params = [];
        const pNames = [];
        let isVarArg = false;
        let hasUnspecifiedParams = false;
        let isKnR = false;
        if (this.atText(")")) {
          hasUnspecifiedParams = true; // f() means unspecified params
        } else if (this.atKW(Lexer.Keyword.VOID) && this.peek(1)?.text === ")") {
          this.advance(); // f(void) means zero params
        } else if (this._allowKnRDefinitions &&
                   this.peek().kind === Lexer.TokenKind.IDENT && !this.isTypeName() &&
                   (this.peek(1)?.text === "," || this.peek(1)?.text === ")")) {
          // K&R identifier list: f(a, b, c)
          isKnR = true;
          while (this.peek().kind === Lexer.TokenKind.IDENT) {
            const pName = this.advance().text;
            params.push(Types.TINT); // placeholder
            pNames.push(pName);
            if (!this.matchText(",")) break;
          }
        } else {
            while (true) {
              if (this.matchText("...")) { isVarArg = true; break; }
              const pSpecs = this.parseDeclSpecifiers();
              let pType = pSpecs.type;
              // C11 6.7.5p2: _Alignas shall not be specified in a declaration of a parameter
              if (pSpecs.requestedAlignment > 0) {
                this.error(this.peek(-1), "_Alignas cannot be applied to a function parameter");
              }
              // Parse parameter declarator
              let pName = null;
              // Handle pointer prefix. Qualifiers after `*` apply to the
              // pointer itself: `T *const` is a const pointer to T.
              while (this.matchText("*")) {
                const starTok = this.peek(-1);
                if (pType.isGCArray()) {
                  this.error(starTok, `'__array(...)' types do not take a '*' — write '__array(T) name' (the array is already a reference)`);
                }
                if (pType.isGCStruct()) {
                  this.error(starTok, `'${pType.toString()}' is already a reference; '__struct Foo **' is not allowed`);
                  break;
                }
                pType = pType.pointer();
                while (true) {
                  if (this.matchKW(Lexer.Keyword.CONST)) pType = pType.addConst();
                  else if (this.matchKW(Lexer.Keyword.VOLATILE)) pType = pType.toggleVolatile();
                  else if (this.matchKW(Lexer.Keyword.RESTRICT)) { /* restrict is a hint; we don't model it */ }
                  else break;
                }
              }
              // Handle parenthesized: void (*callback)(...)
              if (this.atText("(") && !this.isStartOfParamList()) {
                const inner = this.parseDeclarator(pType);
                pType = inner.type;
                pName = inner.name;
              } else {
                if (this.atKind(Lexer.TokenKind.IDENT)) pName = this.advance().text;
                // Array suffix on param -> first dim decays to pointer, rest are arrays
                if (this.atText("[")) {
                  if (pType.removeQualifiers().isRef()) {
                    this.error(this.peek(),
                      `cannot have a C array of reference type '${pType.toString()}' (refs live on the GC heap, not in linear memory) — use __array(${pType.toString()}) instead`);
                  }
                  const arrayDims = [];
                  let firstDim = true;
                  while (this.matchText("[")) {
                    if (firstDim) {
                      // C99: skip 'static' and qualifiers inside first array bracket
                      this.matchKW(Lexer.Keyword.STATIC);
                      while (this.matchKW(Lexer.Keyword.CONST) || this.matchKW(Lexer.Keyword.VOLATILE) || this.matchKW(Lexer.Keyword.RESTRICT)) {}
                      this.matchKW(Lexer.Keyword.STATIC);
                    }
                    let arrSize = 0;
                    if (!this.atText("]")) {
                      const sizeTok = this.peek();
                      const se = this.parseAssignmentExpression();
                      const sz = constEvalInt(se);
                      // The first dimension decays to a pointer, so its size
                      // never matters — but a non-constant inner dimension
                      // would make this a VLA with a silent stride of 0.
                      if (sz == null && !firstDim) {
                        this.error(sizeTok, "variable-length arrays are not supported");
                      }
                      // C11 6.7.6.2p1 (todos/0227 G22) — a decaying first
                      // dim's size is still a constraint violation if negative.
                      if (sz != null && sz < 0n) {
                        this.error(sizeTok, `declared as an array with a negative size (${sz})`);
                      }
                      arrSize = Number(sz ?? 0n); // null only when firstDim (decays)
                    }
                    this.expect("]");
                    if (firstDim) {
                      firstDim = false;
                      arrayDims.push(-1); // sentinel: first dim decays to pointer
                    } else {
                      arrayDims.push(arrSize);
                    }
                  }
                  // Build type from inner to outer (reverse), then decay first to pointer
                  for (let i = arrayDims.length - 1; i >= 1; i--) {
                    pType = Types.arrayOf(pType, arrayDims[i]);
                  }
                  pType = pType.pointer(); // first dim decays to pointer
                }
                // Function suffix on param -> decay to pointer
                if (this.atText("(")) {
                  pType = this.parseDeclaratorSuffixWithNames(pType).type;
                  pType = pType.pointer(); // func params decay to func pointers
                }
              }
              // GCC allows __attribute__ trailing a parameter declarator, e.g.
              // f(int x __attribute__((unused))). Parse and ignore it — the
              // attribute never affects the parameter's ABI type.
              if (this.atKW(Lexer.Keyword.X_ATTRIBUTE)) {
                this.parseGCCAttributes();
              }
              // C11 6.7.6.3p10 (todos/0227 G22): `void` is only valid as
              // the SOLE unnamed unqualified parameter. The literal
              // `f(void)` spelling was consumed before this loop; a
              // TYPEDEF'd void that satisfies the same constraints is the
              // same zero-parameter form (clang/gcc accept it). Anything
              // else — named, qualified, or alongside other parameters —
              // is a constraint violation.
              if (pType.removeQualifiers().isVoid()) {
                if (params.length === 0 && pName === null &&
                    !pType.isConst && !pType.isVolatile && this.atText(")")) {
                  break; // f(VOIDT) == f(void): zero parameters
                }
                this.error(this.peek(-1),
                  "parameter may not have 'void' type ('void' must be the sole unnamed parameter)");
              }
              params.push(pType.decay());
              pNames.push(pName);
              if (!this.matchText(",")) break;
            }
        }
        this.expect(")");
        type = Types.functionType(type, params, isVarArg, hasUnspecifiedParams);
        paramNames = pNames;
        isKnRResult = isKnR;
        continue;
      }
      break;
    }
    return { type, _paramNames: paramNames, _isKnR: isKnRResult };
  }
}

// ====================
// Parser — Entry Point
// ====================

function parseTokens(tokens, options) {
  const sink = { errors: [], warnings: [] };

  if (tokens.length === 0) {
    sink.errors.push(new Lexer.LexError("No tokens to parse", null, 0));
    return { translationUnit: AST.makeTUnit(null), errors: sink.errors, warnings: sink.warnings };
  }

  const unit = AST.makeTUnit(tokens[0].filename);
  const parser = new Parser(tokens, sink.errors, sink.warnings);
  if (options?.warningFlags) parser.warningFlags = options.warningFlags;
  if (options?.compilerOptions?.allowImplicitInt) parser._allowImplicitInt = true;
  if (options?.compilerOptions?.allowKnRDefinitions) parser._allowKnRDefinitions = true;
  if (options?.compilerOptions?.allowImplicitFunctionDecl) parser._allowImplicitFunctionDecl = true;
  if (options?.compilerOptions?.allowZeroLengthArrays) parser._allowZeroLengthArrays = true;
  if (options?.exceptionTagRegistry) parser._exceptionTagRegistry = options.exceptionTagRegistry;

  withDiag(sink, () => {
  try {
    while (!parser.atEnd()) {
      // __require_source
      if (parser.atKW(Lexer.Keyword.X_REQUIRE_SOURCE)) {
        parser.advance();
        parser.expect("(");
        const tok = parser.expectKind(Lexer.TokenKind.STRING);
        const filename = tok.text.substring(1, tok.text.length - 1);
        parser.requiredSources.add(filename);
        parser.expect(")");
        parser.expect(";");
        continue;
      }
      // __minstack
      if (parser.atKW(Lexer.Keyword.X_MINSTACK)) {
        parser.advance();
        parser.expect("(");
        const sizeExpr = parser.parseAssignmentExpression();
        parser.expect(")");
        parser.expect(";");
        const val = constEvalInt(sizeExpr);
        if (val !== null && val >= 0n) {
          unit.minStackBytes = Math.max(unit.minStackBytes, Number(val));
        }
        continue;
      }
      // __export
      if (parser.atKW(Lexer.Keyword.X_EXPORT)) {
        parser.advance();
        const exportNameTok = parser.expectKind(Lexer.TokenKind.IDENT);
        const exportName = exportNameTok.text;
        parser.expect("=");
        const funcNameTok = parser.expectKind(Lexer.TokenKind.IDENT);
        const funcName = funcNameTok.text;
        parser.expect(";");
        const decl = parser.varScope.get(funcName);
        if (decl && decl instanceof AST.DFunc) {
          parser.exportDirectives.push([exportName, decl]);
        }
        continue;
      }
      // __exception
      if (parser.atKW(Lexer.Keyword.X_EXCEPTION)) {
        parser.advance();
        const tagName = parser.expectKind(Lexer.TokenKind.IDENT).text;
        parser.expect("(");
        const paramTypes = [];
        if (!parser.atText(")")) {
          while (true) {
            const pSpecs = parser.parseDeclSpecifiers();
            let pType = pSpecs.type;
            while (parser.matchText("*")) {
              if (pType.isGCStruct()) {
                parser.error(parser.peek(-1), `'${pType.toString()}' is already a reference; '__struct Foo **' is not allowed`);
                break;
              }
              pType = pType.pointer();
            }
            if (parser.atKind(Lexer.TokenKind.IDENT)) parser.advance(); // skip param name
            paramTypes.push(pType);
            if (!parser.matchText(",")) break;
          }
        }
        parser.expect(")");
        parser.expect(";");
        for (const pt of paramTypes) {
          if (pt.isTag() && (pt.tagDecl?.tagKind === Types.TagKind.STRUCT || pt.tagDecl?.tagKind === Types.TagKind.UNION)) {
            parser.error(parser.peek(), `struct/union types are not allowed in __exception parameters`);
          }
        }
        // Cross-TU unification: reuse existing tag if registered
        const registry = parser._exceptionTagRegistry;
        let tag;
        if (registry && registry.has(tagName)) {
          tag = registry.get(tagName);
          // Check param type compatibility
          if (tag.paramTypes.length !== paramTypes.length ||
              tag.paramTypes.some((t, i) => t !== paramTypes[i])) {
            parser.recoverableError(parser.peek(-1),
              `Conflicting types for __exception tag '${tagName}'`);
          }
        } else {
          tag = new AST.DExceptionTag(Lexer.Loc.fromTok(parser.peek(-1)), tagName, paramTypes);
          tag.definition = tag;
          if (registry) registry.set(tagName, tag);
        }
        parser.parsedExceptionTags.push(tag);
        unit.exceptionTags.push(tag);
        continue;
      }
      parser.parseExternalDeclaration(unit);
    }
  } catch (e) {
    // FatalDiag: error is already in the sink, just stop parsing.
    if (e instanceof FatalDiag) return;
    // Programming bug: surface as a generic diagnostic.
    sink.errors.push(new Lexer.LexError(e.message, null, 0));
  }
  });

  unit.requiredSources = parser.requiredSources;
  unit.exportDirectives = parser.exportDirectives;

  return { translationUnit: unit, errors: sink.errors, warnings: sink.warnings };
}

function parseSource(filename, source, ppRegistry) {
  const result = Lexer.tokenize(filename, source, ppRegistry);
  if (result.errors.length > 0) {
    return { translationUnit: AST.makeTUnit(filename), errors: result.errors, warnings: result.warnings };
  }
  const parseResult = parseTokens(result.tokens);
  parseResult.warnings = [...result.warnings, ...parseResult.warnings];
  return parseResult;
}

// Module-scope shorthand for the IIFE-internal builders that get called
// from many parser sites — saves typing AST.maybeDecay(...) everywhere.
const maybeImplicitCast = AST.maybeImplicitCast;
const maybeDecay = AST.maybeDecay;

// ========== setjmp/longjmp lowering ==========

// Check if an expression is a call to a named function, return the ECall or null
// Find a direct call to `name` in `expr`. If `expr` is a comma expression,
// looks through to the last sub-expression and (on a match) collects the
// LEADING sub-expressions into `prefix` — they're side-effecting and must
// be evaluated before the call site is rewritten. Used to preserve calls
// like `nlr_push_tail(...)` in `nlr_push`'s expansion:
//   #define nlr_push(buf) (nlr_push_tail(buf), setjmp((buf)->jmpbuf))
// where setjmp lowering otherwise would silently drop nlr_push_tail.
//
// Returns { call, prefix } on match (prefix may be empty), or null.
function getNamedCallWithPrefix(expr, name) {
  const prefix = [];
  while (expr instanceof AST.EComma) {
    for (let i = 0; i < expr.expressions.length - 1; i++) prefix.push(expr.expressions[i]);
    expr = expr.expressions[expr.expressions.length - 1];
  }
  if (!(expr instanceof AST.ECall)) return null;
  let callee = expr.callee;
  if (callee instanceof AST.EDecay) callee = callee.operand;
  if (!(callee instanceof AST.EIdent)) return null;
  if (callee.name !== name) return null;
  return { call: expr, prefix };
}

function getNamedCall(expr, name) {
  const r = getNamedCallWithPrefix(expr, name);
  return r ? r.call : null;
}

// Detect setjmp patterns in an if-condition.
// Returns {call, zeroIsTrue, prefix, assignTarget} on match (prefix =
// side-effecting expressions to evaluate before the rewritten setjmp;
// assignTarget = the EIdent lvalue of an `(v = setjmp(buf))` form, which
// must receive 0 on the direct path and the longjmp value in the catch),
// or {call: null}.
//
// `(v = setjmp(buf))` is matched only for a plain-identifier LHS: the
// target is re-referenced in both the try prologue and the catch, and an
// arbitrary lvalue expression can't be safely evaluated twice.
function unwrapSetjmpAssign(expr) {
  const prefix = [];
  while (expr instanceof AST.EComma) {
    for (let i = 0; i < expr.expressions.length - 1; i++) prefix.push(expr.expressions[i]);
    expr = expr.expressions[expr.expressions.length - 1];
  }
  if (!(expr instanceof AST.EBinary) || expr.op !== "ASSIGN") return null;
  if (!(expr.left instanceof AST.EIdent)) return null;
  const r = getNamedCallWithPrefix(expr.right, "setjmp");
  if (!r) return null;
  return { call: r.call, prefix: [...prefix, ...r.prefix], assignTarget: expr.left };
}
function extractSetjmpCall(cond) {
  if (cond instanceof AST.EBinary) {
    if (cond.op === "EQ" || cond.op === "NE") {
      const zeroIsTrue = cond.op === "EQ";
      let r = getNamedCallWithPrefix(cond.left, "setjmp") || unwrapSetjmpAssign(cond.left);
      if (r && cond.right instanceof AST.EInt && cond.right.value === 0n)
        return { call: r.call, zeroIsTrue, prefix: r.prefix, assignTarget: r.assignTarget };
      r = getNamedCallWithPrefix(cond.right, "setjmp") || unwrapSetjmpAssign(cond.right);
      if (r && cond.left instanceof AST.EInt && cond.left.value === 0n)
        return { call: r.call, zeroIsTrue, prefix: r.prefix, assignTarget: r.assignTarget };
    }
  }
  // Pattern: setjmp(buf) used directly as condition (truthy = longjmp fired)
  const direct = getNamedCallWithPrefix(cond, "setjmp");
  if (direct) return { call: direct.call, zeroIsTrue: false, prefix: direct.prefix };
  // Pattern: (v = setjmp(buf)) used directly as condition
  const assign = unwrapSetjmpAssign(cond);
  if (assign) return { call: assign.call, zeroIsTrue: false, prefix: assign.prefix, assignTarget: assign.assignTarget };
  // Pattern: !setjmp(buf) / !(v = setjmp(buf))
  if (cond instanceof AST.EUnary && cond.op === "OP_LNOT") {
    const neg = getNamedCallWithPrefix(cond.operand, "setjmp") || unwrapSetjmpAssign(cond.operand);
    if (neg) return { call: neg.call, zeroIsTrue: true, prefix: neg.prefix, assignTarget: neg.assignTarget };
  }
  return { call: null, zeroIsTrue: false };
}

// Unique suffix for the retry scaffolding lowerSetjmpInCompound emits when
// statements follow a setjmp-if (see the comment there).
let __setjmpRetryCounter = 0;

// Build expression: buf[0]
function makeBufIdExpr(bufExpr) {
  const loc = bufExpr.loc;
  return AST.makeSubscript(loc, bufExpr, new AST.EInt(loc, Types.TINT, 0n));
}

// Build: buf[0] = ++counterVar
function makeSetBufIdStmt(bufExpr, counterVar) {
  const loc = bufExpr.loc;
  const lhs = makeBufIdExpr(bufExpr);
  const counterRef = new AST.EIdent(loc, Types.TINT, counterVar);
  const rhs = new AST.EUnary(loc, Types.TINT, "OP_PRE_INC", counterRef);
  const assign = new AST.EBinary(loc, Types.TINT, "ASSIGN", lhs, rhs);
  return new AST.SExpr(loc, assign);
}

// Build: __throw tag(idExpr, valExpr)
function makeThrowLongJump(tag, idExpr, valExpr) {
  // tag.paramTypes are [int, int]; idExpr / valExpr are already int in
  // practice but maybeImplicitCast is a no-op when types match anyway.
  const args = [idExpr, valExpr];
  if (tag && tag.paramTypes) {
    for (let i = 0; i < args.length && i < tag.paramTypes.length; i++) {
      args[i] = maybeImplicitCast(args[i], tag.paramTypes[i]);
    }
  }
  return new AST.SThrow(idExpr.loc, tag, args);
}

// Build catch body: { if (id != buf[0]) rethrow; <userBody> }
function makeCatchBody(tag, idVar, valVar, bufExpr, userBody) {
  const loc = bufExpr.loc;
  const idRef = new AST.EIdent(loc, Types.TINT, idVar);
  const myIdExpr = makeBufIdExpr(bufExpr);
  const cond = new AST.EBinary(loc, Types.TINT, "NE", idRef, myIdExpr);

  const idRef2 = new AST.EIdent(loc, Types.TINT, idVar);
  const valRef = new AST.EIdent(loc, Types.TINT, valVar);
  const rethrow = makeThrowLongJump(tag, idRef2, valRef);

  const rethrowIf = new AST.SIf(loc, cond, rethrow, null);
  return new AST.SCompound(loc, [rethrowIf, userBody]);
}

// Transform longjmp calls in a statement tree into __throw __LongJump(buf[0], val)
// Returns a replacement statement if changed, or the same statement if not.
function lowerLongjmpInStmt(stmt, tag) {
  switch (stmt.constructor) {
    case AST.SExpr: {
      const r = getNamedCallWithPrefix(stmt.expr, "longjmp");
      if (r && r.call.arguments.length === 2) {
        const idExpr = makeBufIdExpr(r.call.arguments[0]);
        const valExpr = r.call.arguments[1];
        const throwStmt = makeThrowLongJump(tag, idExpr, valExpr);
        if (r.prefix.length === 0) return throwStmt;
        // `(cleanup(), longjmp(b, 1))` — the leading comma operands are
        // side-effecting and sequenced BEFORE the jump (the very hazard
        // getNamedCallWithPrefix documents for the setjmp side); dropping
        // them silently deleted the cleanup call.
        const prefixStmts = r.prefix.map(e => new AST.SExpr(e.loc, e));
        return new AST.SCompound(stmt.loc, [...prefixStmts, throwStmt]);
      }
      return stmt;
    }
    case AST.SCompound: {
      // SCompound.statements is a mutable array — write through it
      // (frozen `this` doesn't lock array contents).
      for (let i = 0; i < stmt.statements.length; i++) {
        stmt.statements[i] = lowerLongjmpInStmt(stmt.statements[i], tag);
      }
      return stmt;
    }
    case AST.SIf: {
      const newThen = lowerLongjmpInStmt(stmt.thenBranch, tag);
      const newElse = stmt.elseBranch ? lowerLongjmpInStmt(stmt.elseBranch, tag) : null;
      return (newThen === stmt.thenBranch && newElse === stmt.elseBranch)
        ? stmt
        : new AST.SIf(stmt.loc, stmt.condition, newThen, newElse);
    }
    case AST.SWhile: {
      const newBody = lowerLongjmpInStmt(stmt.body, tag);
      return newBody === stmt.body ? stmt
        : new AST.SWhile(stmt.loc, stmt.condition, newBody);
    }
    case AST.SDoWhile: {
      const newBody = lowerLongjmpInStmt(stmt.body, tag);
      return newBody === stmt.body ? stmt
        : new AST.SDoWhile(stmt.loc, newBody, stmt.condition);
    }
    case AST.SFor: {
      const newInit = stmt.init ? lowerLongjmpInStmt(stmt.init, tag) : null;
      const newBody = lowerLongjmpInStmt(stmt.body, tag);
      return (newInit === stmt.init && newBody === stmt.body) ? stmt
        : new AST.SFor(stmt.loc, newInit, stmt.condition, stmt.increment, newBody);
    }
    case AST.SSwitch: {
      const newBody = lowerLongjmpInStmt(stmt.body, tag);
      return newBody === stmt.body ? stmt
        : new AST.SSwitch(stmt.loc, stmt.expr, newBody);
    }
    case AST.STryCatch: {
      const newTry = lowerLongjmpInStmt(stmt.tryBody, tag);
      let catchesChanged = false;
      const newCatches = stmt.catches.map(cc => {
        const newBody = lowerLongjmpInStmt(cc.body, tag);
        if (newBody === cc.body) return cc;
        catchesChanged = true;
        return { ...cc, body: newBody };
      });
      return (newTry === stmt.tryBody && !catchesChanged) ? stmt
        : new AST.STryCatch(stmt.loc, newTry, newCatches);
    }
    default:
      return stmt;
  }
}

// Lower setjmp patterns in a compound statement's children.
function lowerSetjmpInCompound(compound, tag, counterVar) {
  const stmts = compound.statements;

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];

    // Recurse into nested compounds first
    switch (stmt.constructor) {
      case AST.SCompound:
        lowerSetjmpInCompound(stmt, tag, counterVar);
        break;
      case AST.SIf:
        // Don't recurse into the if we're about to transform — check first
        break;
      case AST.SWhile:
        if (stmt.body instanceof AST.SCompound)
          lowerSetjmpInCompound(stmt.body, tag, counterVar);
        break;
      case AST.SDoWhile:
        if (stmt.body instanceof AST.SCompound)
          lowerSetjmpInCompound(stmt.body, tag, counterVar);
        break;
      case AST.SFor:
        if (stmt.body instanceof AST.SCompound)
          lowerSetjmpInCompound(stmt.body, tag, counterVar);
        break;
      case AST.SSwitch:
        if (stmt.body instanceof AST.SCompound)
          lowerSetjmpInCompound(stmt.body, tag, counterVar);
        break;
      case AST.SLabel:
        break;
      case AST.STryCatch:
        if (stmt.tryBody instanceof AST.SCompound)
          lowerSetjmpInCompound(stmt.tryBody, tag, counterVar);
        for (const cc of stmt.catches)
          if (cc.body instanceof AST.SCompound)
            lowerSetjmpInCompound(cc.body, tag, counterVar);
        break;
      default:
        break;
    }

    // Now check if this is an if-statement with setjmp in the condition
    if (!(stmt instanceof AST.SIf)) continue;

    const { call: setjmpCall, zeroIsTrue, prefix: setjmpPrefix, assignTarget } = extractSetjmpCall(stmt.condition);
    if (!setjmpCall) {
      // Not a setjmp if — but still recurse into its branches
      if (stmt.thenBranch instanceof AST.SCompound)
        lowerSetjmpInCompound(stmt.thenBranch, tag, counterVar);
      if (stmt.elseBranch && stmt.elseBranch instanceof AST.SCompound)
        lowerSetjmpInCompound(stmt.elseBranch, tag, counterVar);
      continue;
    }

    // Found a setjmp pattern! Transform it.
    const bufExpr = setjmpCall.arguments[0];

    // Create catch binding variables
    const idName = Lexer.intern("__setjmp_caught_id");
    const valName = Lexer.intern("__setjmp_caught_val");
    const loc = Lexer.Loc.generated();
    const idVar = new AST.DVar(loc, idName, Types.TINT, Types.StorageClass.NONE, null);
    idVar.definition = idVar;
    const valVar = new AST.DVar(loc, valName, Types.TINT, Types.StorageClass.NONE, null);
    valVar.definition = valVar;

    // Determine try-body and catch-body based on pattern.
    //
    // The jmp_buf stays armed until the function returns (C11 7.13.2.1),
    // so any statement FOLLOWING the setjmp-if in this compound can still
    // longjmp here — and after the jump is handled, control must resume
    // at those following statements again (the standard retry-loop idiom).
    // When such statements exist we build a guarded retry structure:
    //
    //   buf[0] = ++counter;
    //   int jumped = 0, caught = 0;
    //  retry:
    //   caught = 0;
    //   try { if (jumped) X; else Y;  ...remaining... }
    //   catch (id,val) { if (id != buf[0]) rethrow; caught = jumped = 1; }
    //   if (caught) goto retry;
    //
    // A plain backward goto (not a synthesized loop) so enclosing
    // break/continue targets inside the bodies are not captured. With no
    // remaining statements the simple try/catch shape below is already
    // exact.
    const stmtLoc = stmt.loc;
    const firstBody = zeroIsTrue ? stmt.thenBranch : (stmt.elseBranch || new AST.SEmpty(stmtLoc));
    const jumpBody = zeroIsTrue ? (stmt.elseBranch || new AST.SEmpty(stmtLoc)) : stmt.thenBranch;
    const remaining = stmts.splice(i + 1);

    let tryBody, catchUserBody, retryTail = null;
    if (remaining.length === 0) {
      tryBody = firstBody;
      catchUserBody = jumpBody;
    } else {
      const jumpedName = Lexer.intern(`__setjmp_jumped_${++__setjmpRetryCounter}`);
      const caughtName = Lexer.intern(`__setjmp_caught_${__setjmpRetryCounter}`);
      const retryName = Lexer.intern(`__setjmp_retry_${__setjmpRetryCounter}`);
      const jumpedVar = new AST.DVar(loc, jumpedName, Types.TINT, Types.StorageClass.NONE, null);
      jumpedVar.definition = jumpedVar;
      jumpedVar.initExpr = new AST.EInt(loc, Types.TINT, 0n);
      const caughtVar = new AST.DVar(loc, caughtName, Types.TINT, Types.StorageClass.NONE, null);
      caughtVar.definition = caughtVar;
      caughtVar.initExpr = new AST.EInt(loc, Types.TINT, 0n);
      const mkRef = (v) => new AST.EIdent(loc, Types.TINT, v);
      const mkSet = (v, n) => new AST.SExpr(loc,
        new AST.EBinary(loc, Types.TINT, "ASSIGN", mkRef(v), new AST.EInt(loc, Types.TINT, n)));

      const retryLabel = new AST.SLabel(loc, retryName, compound);
      retryLabel.hasGotos = true;
      const retryGoto = new AST.SGoto(loc, retryName);
      retryGoto.target = retryLabel;
      retryLabel.labelKind = Types.LabelKind.LOOP;

      tryBody = new AST.SCompound(stmtLoc, [
        new AST.SIf(stmtLoc, mkRef(jumpedVar), jumpBody, firstBody),
        ...remaining,
      ]);
      catchUserBody = new AST.SCompound(stmtLoc, [mkSet(caughtVar, 1n), mkSet(jumpedVar, 1n)]);
      retryTail = {
        decls: new AST.SDecl(loc, [jumpedVar, caughtVar]),
        label: retryLabel,
        resetCaught: mkSet(caughtVar, 0n),
        retryIf: new AST.SIf(loc, mkRef(caughtVar), retryGoto, null),
      };
    }

    // Recurse into the try body and catch body
    if (tryBody instanceof AST.SCompound)
      lowerSetjmpInCompound(tryBody, tag, counterVar);
    if (catchUserBody instanceof AST.SCompound)
      lowerSetjmpInCompound(catchUserBody, tag, counterVar);

    // For the `(v = setjmp(buf))` form, v carries the setjmp return value:
    // 0 on the direct path (assigned just before the try below), and the
    // longjmp value in the catch — coerced 0 -> 1 per C11 7.13.2.1p4.
    // Assign in the catch itself (not in jumpBody) so the value is fresh
    // on every jump, including re-entries through the retry scaffold.
    let assignZeroStmt = null;
    if (assignTarget) {
      const tType = assignTarget.type;
      const mkTargetRef = () => new AST.EIdent(loc, tType, assignTarget.decl);
      const mkAssign = (rhs) => new AST.SExpr(loc,
        new AST.EBinary(loc, tType, "ASSIGN", mkTargetRef(),
          new AST.ECast(loc, tType, tType, rhs)));
      assignZeroStmt = mkAssign(new AST.EInt(loc, Types.TINT, 0n));
      const valRef0 = new AST.EIdent(loc, Types.TINT, valVar);
      const valRef1 = new AST.EIdent(loc, Types.TINT, valVar);
      const coerced = new AST.ETernary(loc, Types.TINT,
        valRef0, valRef1, new AST.EInt(loc, Types.TINT, 1n));
      catchUserBody = new AST.SCompound(stmtLoc, [mkAssign(coerced), catchUserBody]);
    }

    // Build the catch body with rethrow logic
    const fullCatchBody = makeCatchBody(tag, idVar, valVar, bufExpr, catchUserBody);

    // Build the catch clause
    const cc = {
      tag,
      bindings: [idName, valName],
      bindingVars: [idVar, valVar],
      body: fullCatchBody,
    };

    // Build the STryCatch
    const tryCatch = new AST.STryCatch(stmtLoc, tryBody, [cc]);

    // Build: buf[0] = ++__setjmp_id_counter; try { ... } catch { ... }
    const setBufStmt = makeSetBufIdStmt(bufExpr, counterVar);

    // If the setjmp call was inside a comma expression, evaluate the
    // leading operands as SExpr statements first. The canonical case:
    //
    //   if ((nlr_push_tail(buf), setjmp(buf->jmpbuf)) == 0) { … }
    //
    // expanded from `nlr_push(buf)`. Without this, nlr_push_tail (which
    // pushes onto the thread-local nlr stack) would be silently dropped
    // and the next nlr_jump would target the wrong (stale) buf, ending
    // up in nlr_jump_fail's `while(1)`.
    const prefixStmts = (setjmpPrefix || []).map(e => new AST.SExpr(e.loc, e));

    // Replace the if-statement with [...prefix, setBuf, (retry scaffold,)
    // tryCatch(, retry check)]
    stmts[i] = setBufStmt;
    if (prefixStmts.length > 0) {
      stmts.splice(i, 0, ...prefixStmts);
      i += prefixStmts.length;
    }
    if (assignZeroStmt) {
      // Before the try (and before the retry label, so re-entries after a
      // handled jump don't clobber the caught value back to 0).
      stmts.splice(i + 1, 0, assignZeroStmt);
      i++;
    }
    if (retryTail) {
      stmts.splice(i + 1, 0,
        retryTail.decls, retryTail.label, retryTail.resetCaught, tryCatch, retryTail.retryIf);
      i += 5;
    } else {
      stmts.splice(i + 1, 0, tryCatch);
      // Skip the tryCatch we just inserted
      i++;
    }
  }
}

function lowerSetjmpLongjmp(unit, exceptionTagRegistry) {
  // Check if this unit uses setjmp.h by looking for setjmp/longjmp imports
  let hasSetjmp = false;
  for (const f of unit.importedFunctions) {
    if (f.name === "setjmp" || f.name === "longjmp") {
      hasSetjmp = true;
      break;
    }
  }
  if (!hasSetjmp) return;

  // Look up __LongJump tag (declared via __exception in setjmp.h, parsed into registry)
  const tagName = Lexer.intern("__LongJump");
  const tag = exceptionTagRegistry.get(tagName);
  if (!tag) throw new Error("__LongJump exception tag not found");

  // Remove setjmp/longjmp from importedFunctions so they don't become WASM imports
  unit.importedFunctions = unit.importedFunctions.filter(
    f => f.name !== "setjmp" && f.name !== "longjmp"
  );

  // Look up __setjmp_id_counter (declared extern in setjmp.h, defined in __setjmp.c)
  const counterName = Lexer.intern("__setjmp_id_counter");
  let counterVar = null;
  for (const v of unit.externVariables) {
    if (v.name === counterName) { counterVar = v; break; }
  }
  if (!counterVar) throw new Error("__setjmp_id_counter not found in externVariables");

  // Lower all function bodies. The irreducible lowering, if it later
  // fires on a setjmp-using function, recognizes the STryCatch shape we
  // emit here and segmentizes the try/catch contents inline — that way
  // gotos between the try and catch regions cross cleanly via state
  // transitions in the lifted while-switch.
  // Any setjmp call surviving the lowering sits in a position the
  // pattern-matcher doesn't recognize (e.g. `int r = setjmp(buf) + 1;`).
  // setjmp was just removed from importedFunctions, so codegen would die
  // with a raw "function 'setjmp' not found" JS error — report a proper
  // diagnostic instead.
  const findResidualSetjmp = (node) => {
    if (!node) return null;
    if (node instanceof AST.ECall) {
      let callee = node.callee;
      if (callee instanceof AST.EDecay) callee = callee.operand;
      if (callee instanceof AST.EIdent && callee.name === "setjmp") return node;
    }
    for (const c of (node.children || [])) {
      const r = findResidualSetjmp(c);
      if (r) return r;
    }
    return null;
  };

  const lowerFunc = (func) => {
    if (!func.body) return;
    if (func.body instanceof AST.SCompound) {
      lowerSetjmpInCompound(func.body, tag, counterVar);
    }
    func.body = lowerLongjmpInStmt(func.body, tag);
    const residual = findResidualSetjmp(func.body);
    if (residual) {
      fatalError(residual.loc,
        "unsupported use of setjmp — only forms like 'if (setjmp(buf))', " +
        "'if (!setjmp(buf))', 'if (setjmp(buf) == 0)', or " +
        "'if ((v = setjmp(buf)))' are supported");
    }
  };
  for (const f of unit.definedFunctions) lowerFunc(f);
  for (const f of unit.staticFunctions) lowerFunc(f);
}

return {
  dumpAst, printC, parseTokens, parseSource,
  gcSectionsPass,
  linkTranslationUnits,
  lowerSetjmpLongjmp,
};
})();

// ====================
// WAST — target-side wasm instruction layer (todos/0197)
// ====================
//
// A FLAT instruction sequence below the C AST: one node per wasm
// instruction, operands implicit on the wasm value stack. Control
// constructs are delimiter nodes (WBlock/WLoop/WIf/WTryTable ... WEnd) in
// the per-function array — no operand-expression tree, no nested body
// arrays. Branch nodes hold a LABEL IDENTITY (the structural node they
// target, or the per-function FUNC label), never a baked numeric depth:
// WastBuilder resolves br(depth) against its live control stack at build
// time (while the depth is valid), and serialize() re-derives the relative
// depth from its own walk stack — which is what makes later splice-based
// transforms (inlining, peephole) safe. Nodes are inert data (opcode
// family + immediates), dispatched by node.constructor like the AST.
//
// Stage 1 (todos/0197) is substrate only: WasmCode's byte encoders are
// RELOCATED here (byte-identical by construction) and Codegen's function
// bodies route through nodes. WasmCode itself is demoted to the tiny
// constant-expression byte arrays (global inits, data-segment offsets)
// and stays exported.

const WAST = (() => {

function appendF32(out, value) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true); // little-endian
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) out.push(bytes[i]);
}

function appendF64(out, value) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true); // little-endian
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 8; i++) out.push(bytes[i]);
}

// WASM type enums
const WasmNumType = Object.freeze({ I32: 0x7F, I64: 0x7E, F32: 0x7D, F64: 0x7C });

const WT_I32 = { tag: "num", num: WasmNumType.I32 };
const WT_I64 = { tag: "num", num: WasmNumType.I64 };
const WT_F32 = { tag: "num", num: WasmNumType.F32 };
const WT_F64 = { tag: "num", num: WasmNumType.F64 };
const WT_EXTERNREF = { tag: "ref", nullable: true, heap: 0x6F, heapIsIdx: false };
const WT_REFEXTERN = { tag: "ref", nullable: false, heap: 0x6F, heapIsIdx: false };
const WT_EQREF = { tag: "ref", nullable: true, heap: 0x6D, heapIsIdx: false };
// exnref (wasm EH proposal, same one as try_table): the in-flight
// exception captured by a catch_all_ref clause, re-raisable via
// throw_ref. Only the irreducible try-lowering's catch-all dispatcher
// uses it; it never surfaces as a C type.
const WT_EXNREF = { tag: "ref", nullable: true, heap: 0x69, heapIsIdx: false };
const WT_EMPTY = { tag: "empty" };

// GC ref to a defined struct/array type. heap = type index (positive integer).
function WT_GCREF(typeIdx, nullable) {
  return { tag: "ref", nullable: !!nullable, heap: typeIdx, heapIsIdx: true };
}

function wtIsNum(wt) { return wt.tag === "num"; }
function wtIsRef(wt) { return wt.tag === "ref"; }
function wtIsIntegral(wt) { return wtIsNum(wt) && (wt.num === WasmNumType.I32 || wt.num === WasmNumType.I64); }
function wtIsFloating(wt) { return wtIsNum(wt) && (wt.num === WasmNumType.F32 || wt.num === WasmNumType.F64); }
// Block types are a 3-way union: EMPTY | single valtype | function-type
// index (multi-value, e.g. a catch clause with >=2 tag params). The
// typeidx arm is encoded as a SIGNED LEB per the spec's blocktype rule;
// it only ever appears as a block type, never as a plain valtype.
function wtEmit(wt, buf) {
  if (wt.tag === "empty") buf.push(0x40);
  else if (wt.tag === "num") buf.push(wt.num);
  else if (wt.tag === "typeidx") lebI(buf, wt.idx);
  else if (wt.tag === "ref") {
    if (wt.heapIsIdx) {
      // Encoded as ref[null] (typeidx-as-signed-LEB)
      buf.push(wt.nullable ? 0x63 : 0x64);
      lebI(buf, wt.heap);
    } else if (wt.nullable) {
      buf.push(wt.heap);
    } else {
      buf.push(0x64);
      buf.push(wt.heap);
    }
  }
}
function wtEquals(a, b) {
  if (a.tag !== b.tag) return false;
  if (a.tag === "empty") return true;
  if (a.tag === "num") return a.num === b.num;
  if (a.tag === "typeidx") return a.idx === b.idx;
  if (a.tag === "ref") return a.nullable === b.nullable && a.heap === b.heap && !!a.heapIsIdx === !!b.heapIsIdx;
  return false;
}

// Memory opcodes
const MOP = Object.freeze({
  I32_LOAD: 0x28, I64_LOAD: 0x29, F32_LOAD: 0x2A, F64_LOAD: 0x2B,
  I32_LOAD8_S: 0x2C, I32_LOAD8_U: 0x2D, I32_LOAD16_S: 0x2E, I32_LOAD16_U: 0x2F,
  I64_LOAD8_S: 0x30, I64_LOAD8_U: 0x31, I64_LOAD16_S: 0x32, I64_LOAD16_U: 0x33,
  I64_LOAD32_S: 0x34, I64_LOAD32_U: 0x35,
  I32_STORE: 0x36, I64_STORE: 0x37, F32_STORE: 0x38, F64_STORE: 0x39,
  I32_STORE8: 0x3A, I32_STORE16: 0x3B, I64_STORE8: 0x3C, I64_STORE16: 0x3D, I64_STORE32: 0x3E,
});

// ALU opcodes
const ALU = Object.freeze({
  OP_EQZ: 0, OP_EQ: 1, OP_NE: 2, OP_LT: 3, OP_GT: 4, OP_LE: 5, OP_GE: 6,
  OP_CLZ: 7, OP_CTZ: 8, OP_POPCNT: 9,
  OP_ADD: 10, OP_SUB: 11, OP_MUL: 12, OP_DIV: 13, OP_REM: 14,
  OP_AND: 15, OP_OR: 16, OP_XOR: 17, OP_SHL: 18, OP_SHR_S: 19, OP_SHR_U: 20,
  OP_ROTL: 21, OP_ROTR: 22,
  OP_ABS: 23, OP_NEG: 24, OP_CEIL: 25, OP_FLOOR: 26, OP_TRUNC: 27, OP_NEAREST: 28, OP_SQRT: 29,
  OP_MIN: 30, OP_MAX: 31, OP_COPYSIGN: 32,
  OP_WRAP_I64: 33, OP_TRUNC_F32: 34, OP_TRUNC_F64: 35,
  OP_EXTEND_I32: 36, OP_CONVERT_I32: 37, OP_CONVERT_I64: 38,
  OP_DEMOTE_F64: 39, OP_PROMOTE_F32: 40,
  OP_REINTERPRET_F32: 41, OP_REINTERPRET_F64: 42, OP_REINTERPRET_I32: 43, OP_REINTERPRET_I64: 44,
});

function getaop(wt, op, sign) {
  if (!wtIsNum(wt)) throw new Error("getaop called with non-numeric WasmType");
  if (sign === undefined) sign = true;
  const n = wt.num;
  if (n === WasmNumType.I32) {
    switch (op) {
      case ALU.OP_EQZ: return 0x45; case ALU.OP_EQ: return 0x46; case ALU.OP_NE: return 0x47;
      case ALU.OP_LT: return sign ? 0x48 : 0x49; case ALU.OP_GT: return sign ? 0x4A : 0x4B;
      case ALU.OP_LE: return sign ? 0x4C : 0x4D; case ALU.OP_GE: return sign ? 0x4E : 0x4F;
      case ALU.OP_CLZ: return 0x67; case ALU.OP_CTZ: return 0x68; case ALU.OP_POPCNT: return 0x69;
      case ALU.OP_ADD: return 0x6A; case ALU.OP_SUB: return 0x6B; case ALU.OP_MUL: return 0x6C;
      case ALU.OP_DIV: return sign ? 0x6D : 0x6E; case ALU.OP_REM: return sign ? 0x6F : 0x70;
      case ALU.OP_AND: return 0x71; case ALU.OP_OR: return 0x72; case ALU.OP_XOR: return 0x73;
      case ALU.OP_SHL: return 0x74; case ALU.OP_SHR_S: return 0x75; case ALU.OP_SHR_U: return 0x76;
      case ALU.OP_ROTL: return 0x77; case ALU.OP_ROTR: return 0x78;
      case ALU.OP_WRAP_I64: return 0xA7;
      case ALU.OP_TRUNC_F32: return sign ? 0xA8 : 0xA9;
      case ALU.OP_TRUNC_F64: return sign ? 0xAA : 0xAB;
      case ALU.OP_REINTERPRET_F32: return 0xBC;
    }
  } else if (n === WasmNumType.I64) {
    switch (op) {
      case ALU.OP_EQZ: return 0x50; case ALU.OP_EQ: return 0x51; case ALU.OP_NE: return 0x52;
      case ALU.OP_LT: return sign ? 0x53 : 0x54; case ALU.OP_GT: return sign ? 0x55 : 0x56;
      case ALU.OP_LE: return sign ? 0x57 : 0x58; case ALU.OP_GE: return sign ? 0x59 : 0x5A;
      case ALU.OP_CLZ: return 0x79; case ALU.OP_CTZ: return 0x7A; case ALU.OP_POPCNT: return 0x7B;
      case ALU.OP_ADD: return 0x7C; case ALU.OP_SUB: return 0x7D; case ALU.OP_MUL: return 0x7E;
      case ALU.OP_DIV: return sign ? 0x7F : 0x80; case ALU.OP_REM: return sign ? 0x81 : 0x82;
      case ALU.OP_AND: return 0x83; case ALU.OP_OR: return 0x84; case ALU.OP_XOR: return 0x85;
      case ALU.OP_SHL: return 0x86; case ALU.OP_SHR_S: return 0x87; case ALU.OP_SHR_U: return 0x88;
      case ALU.OP_ROTL: return 0x89; case ALU.OP_ROTR: return 0x8A;
      case ALU.OP_EXTEND_I32: return sign ? 0xAC : 0xAD;
      case ALU.OP_TRUNC_F32: return sign ? 0xAE : 0xAF;
      case ALU.OP_TRUNC_F64: return sign ? 0xB0 : 0xB1;
      case ALU.OP_REINTERPRET_F64: return 0xBD;
    }
  } else if (n === WasmNumType.F32) {
    switch (op) {
      case ALU.OP_EQ: return 0x5B; case ALU.OP_NE: return 0x5C;
      case ALU.OP_LT: return 0x5D; case ALU.OP_GT: return 0x5E;
      case ALU.OP_LE: return 0x5F; case ALU.OP_GE: return 0x60;
      case ALU.OP_ABS: return 0x8B; case ALU.OP_NEG: return 0x8C;
      case ALU.OP_CEIL: return 0x8D; case ALU.OP_FLOOR: return 0x8E;
      case ALU.OP_TRUNC: return 0x8F; case ALU.OP_NEAREST: return 0x90; case ALU.OP_SQRT: return 0x91;
      case ALU.OP_ADD: return 0x92; case ALU.OP_SUB: return 0x93; case ALU.OP_MUL: return 0x94;
      case ALU.OP_DIV: return 0x95; case ALU.OP_MIN: return 0x96; case ALU.OP_MAX: return 0x97;
      case ALU.OP_COPYSIGN: return 0x98;
      case ALU.OP_CONVERT_I32: return sign ? 0xB2 : 0xB3;
      case ALU.OP_CONVERT_I64: return sign ? 0xB4 : 0xB5;
      case ALU.OP_DEMOTE_F64: return 0xB6;
      case ALU.OP_REINTERPRET_I32: return 0xBE;
    }
  } else if (n === WasmNumType.F64) {
    switch (op) {
      case ALU.OP_EQ: return 0x61; case ALU.OP_NE: return 0x62;
      case ALU.OP_LT: return 0x63; case ALU.OP_GT: return 0x64;
      case ALU.OP_LE: return 0x65; case ALU.OP_GE: return 0x66;
      case ALU.OP_ABS: return 0x99; case ALU.OP_NEG: return 0x9A;
      case ALU.OP_CEIL: return 0x9B; case ALU.OP_FLOOR: return 0x9C;
      case ALU.OP_TRUNC: return 0x9D; case ALU.OP_NEAREST: return 0x9E; case ALU.OP_SQRT: return 0x9F;
      case ALU.OP_ADD: return 0xA0; case ALU.OP_SUB: return 0xA1; case ALU.OP_MUL: return 0xA2;
      case ALU.OP_DIV: return 0xA3; case ALU.OP_MIN: return 0xA4; case ALU.OP_MAX: return 0xA5;
      case ALU.OP_COPYSIGN: return 0xA6;
      case ALU.OP_CONVERT_I32: return sign ? 0xB7 : 0xB8;
      case ALU.OP_CONVERT_I64: return sign ? 0xB9 : 0xBA;
      case ALU.OP_PROMOTE_F32: return 0xBB;
      case ALU.OP_REINTERPRET_I64: return 0xBF;
    }
  }
  throw new Error(`Invalid type/op combination: num=${n} op=${op}`);
}

// The trunc_sat subop table (WASM 2.0 §5.4.5, 0xFC prefix + LEB subop):
//   0: i32.trunc_sat_f32_s   1: i32.trunc_sat_f32_u
//   2: i32.trunc_sat_f64_s   3: i32.trunc_sat_f64_u
//   4: i64.trunc_sat_f32_s   5: i64.trunc_sat_f32_u
//   6: i64.trunc_sat_f64_s   7: i64.trunc_sat_f64_u
function truncSatSubop(dstWt, srcWt, sign) {
  if (wtEquals(dstWt, WT_I32) && wtEquals(srcWt, WT_F32)) return sign ? 0 : 1;
  if (wtEquals(dstWt, WT_I32) && wtEquals(srcWt, WT_F64)) return sign ? 2 : 3;
  if (wtEquals(dstWt, WT_I64) && wtEquals(srcWt, WT_F32)) return sign ? 4 : 5;
  if (wtEquals(dstWt, WT_I64) && wtEquals(srcWt, WT_F64)) return sign ? 6 : 7;
  throw new Error("truncSat: unsupported src/dst pair");
}

// WasmCode builder — DEMOTED (todos/0197): direct byte emission, kept for
// the tiny 2-instruction constant expressions (global inits, data-segment
// offsets) where a node layer has zero value. Function bodies build WAST
// nodes via WastBuilder instead.
class WasmCode {
  constructor(bytes) { this.bytes = bytes; }
  push(byte) { this.bytes.push(byte); }

  // Control flow (0x00 - 0x11)
  unreachable() { this.push(0x00); }
  nop() { this.push(0x01); }
  block(bt) { this.push(0x02); wtEmit(bt || WT_EMPTY, this.bytes); }
  loop(bt) { this.push(0x03); wtEmit(bt || WT_EMPTY, this.bytes); }
  if_(bt) { this.push(0x04); wtEmit(bt, this.bytes); }
  else_() { this.push(0x05); }
  end() { this.push(0x0B); }
  br(labelIdx) { this._checkBrDepth(labelIdx, "br"); this.push(0x0C); lebU(this.bytes, labelIdx); }
  brIf(labelIdx) { this._checkBrDepth(labelIdx, "brIf"); this.push(0x0D); lebU(this.bytes, labelIdx); }
  brTable(labels, defaultLabel) {
    for (const l of labels) this._checkBrDepth(l, "brTable entry");
    this._checkBrDepth(defaultLabel, "brTable default");
    this.push(0x0E);
    lebU(this.bytes, labels.length);
    for (const l of labels) lebU(this.bytes, l);
    lebU(this.bytes, defaultLabel);
  }
  // Catch internal codegen bugs that would emit a `br` with an out-of-range
  // depth — the wasm validator would reject the module at instantiation
  // time with a cryptic "invalid branch depth: <huge number>" message
  // (negative deltas LEB-encode to ~0xFFFFFFFD). Failing here points
  // directly at the offending emit site instead, so stale entries in
  // gotoLabelDepths / breakTarget / continueTarget surface as a clear
  // diagnostic rather than silent miscompilation.
  _checkBrDepth(d, opName) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 0xFFFFFF) {
      throw new Error(
        `internal codegen error: ${opName} depth ${d} is out of range ` +
        `(likely a stale entry in gotoLabelDepths / breakTarget / continueTarget)`);
    }
  }
  ret() { this.push(0x0F); }
  call(funcIdx) { this.push(0x10); lebU(this.bytes, funcIdx); }
  callIndirect(typeIdx) { this.push(0x11); lebU(this.bytes, typeIdx); this.push(0x00); }

  // Locals and globals (0x20 - 0x24)
  localGet(idx) { this.push(0x20); lebU(this.bytes, idx); }
  localSet(idx) { this.push(0x21); lebU(this.bytes, idx); }
  localTee(idx) { this.push(0x22); lebU(this.bytes, idx); }
  globalGet(idx) { this.push(0x23); lebU(this.bytes, idx); }
  globalSet(idx) { this.push(0x24); lebU(this.bytes, idx); }

  // Memory operations
  mop(opcode, offset, align) { this.push(opcode); lebU(this.bytes, align); lebU(this.bytes, offset); }
  memorySize() { this.push(0x3F); this.push(0x00); }
  memoryGrow() { this.push(0x40); this.push(0x00); }
  memoryCopy() { this.push(0xFC); lebU(this.bytes, 10); this.push(0x00); this.push(0x00); }
  memoryFill() { this.push(0xFC); lebU(this.bytes, 11); this.push(0x00); }

  // Non-trapping float→int conversion (WASM 2.0 §5.4.5). NaN→0,
  // out-of-range saturates to IMIN/IMAX.
  truncSat(dstWt, srcWt, sign) {
    const subop = truncSatSubop(dstWt, srcWt, sign);
    this.push(0xFC); lebU(this.bytes, subop);
  }

  // Numeric constants
  i32Const(value) { this.push(0x41); lebI(this.bytes, Number(value) | 0); }
  i64Const(value) {
    this.push(0x42);
    if (typeof value === "bigint") lebI64(this.bytes, value);
    else lebI64(this.bytes, BigInt(value));
  }
  f32Const(value) { this.push(0x43); appendF32(this.bytes, value); }
  f64Const(value) { this.push(0x44); appendF64(this.bytes, value); }

  // ALU operations
  aop(wt, op, sign) { this.push(getaop(wt, op, sign)); }

  // Exception handling
  throw_(tagIdx) { this.push(0x08); lebU(this.bytes, tagIdx); }
  throwRef() { this.push(0x0A); }
  tryTable(blockType, catches) {
    this.push(0x1F);
    wtEmit(blockType, this.bytes);
    lebU(this.bytes, catches.length);
    for (const [kind, tagIdx, labelIdx] of catches) {
      this.push(kind);
      if (kind === 0x00 || kind === 0x01) lebU(this.bytes, tagIdx);
      lebU(this.bytes, labelIdx);
    }
  }

  // Drop
  drop() { this.push(0x1A); }

  // Reference types
  refNull(heapType) { this.push(0xD0); this.push(heapType); }
  refNullIdx(typeIdx) { this.push(0xD0); lebI(this.bytes, typeIdx); }
  refIsNull() { this.push(0xD1); }
  refEq() { this.push(0xD3); }
  refTest(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x14); lebI(this.bytes, typeIdx); }
  refTestNull(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x15); lebI(this.bytes, typeIdx); }
  refCast(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x16); lebI(this.bytes, typeIdx); }
  refCastNull(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x17); lebI(this.bytes, typeIdx); }
  // ref.cast (ref null eq) — heap type encoded as the abstract `eq` byte (0x6D).
  refCastNullEq() { this.push(0xFB); lebU(this.bytes, 0x17); this.push(0x6D); }
  // Bridges between WASM's `extern` and `any` heap-type universes. Both are
  // (near-)zero-cost retags — no copy, just a type-system cast.
  anyConvertExtern() { this.push(0xFB); lebU(this.bytes, 0x1A); }
  externConvertAny() { this.push(0xFB); lebU(this.bytes, 0x1B); }

  // GC opcodes (0xFB ...)
  structNew(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x00); lebU(this.bytes, typeIdx); }
  structNewDefault(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x01); lebU(this.bytes, typeIdx); }
  structGet(typeIdx, fieldIdx) { this.push(0xFB); lebU(this.bytes, 0x02); lebU(this.bytes, typeIdx); lebU(this.bytes, fieldIdx); }
  structGetS(typeIdx, fieldIdx) { this.push(0xFB); lebU(this.bytes, 0x03); lebU(this.bytes, typeIdx); lebU(this.bytes, fieldIdx); }
  structGetU(typeIdx, fieldIdx) { this.push(0xFB); lebU(this.bytes, 0x04); lebU(this.bytes, typeIdx); lebU(this.bytes, fieldIdx); }
  structSet(typeIdx, fieldIdx) { this.push(0xFB); lebU(this.bytes, 0x05); lebU(this.bytes, typeIdx); lebU(this.bytes, fieldIdx); }
  arrayNew(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x06); lebU(this.bytes, typeIdx); }
  arrayNewDefault(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x07); lebU(this.bytes, typeIdx); }
  arrayNewFixed(typeIdx, n) { this.push(0xFB); lebU(this.bytes, 0x08); lebU(this.bytes, typeIdx); lebU(this.bytes, n); }
  arrayGet(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x0B); lebU(this.bytes, typeIdx); }
  arrayGetS(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x0C); lebU(this.bytes, typeIdx); }
  arrayGetU(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x0D); lebU(this.bytes, typeIdx); }
  arraySet(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x0E); lebU(this.bytes, typeIdx); }
  arrayLen() { this.push(0xFB); lebU(this.bytes, 0x0F); }
  arrayFill(typeIdx) { this.push(0xFB); lebU(this.bytes, 0x10); lebU(this.bytes, typeIdx); }
  arrayCopy(dstTypeIdx, srcTypeIdx) {
    this.push(0xFB); lebU(this.bytes, 0x11);
    lebU(this.bytes, dstTypeIdx); lebU(this.bytes, srcTypeIdx);
  }
}

// ---- WAST node classes ----
//
// Thin family nodes: one class per instruction FAMILY, not per opcode —
// WAop/WMop/WGCOp lean on the getaop/MOP/subop tables above. Immediates
// only; result types are implied by the opcode tables. `target` fields on
// branch/catch entries are label identities: the WBlock/WLoop/WIf/
// WTryTable node they branch to, or the builder's per-function FUNC label
// sentinel ({ isFuncLabel: true }, depth == full nesting).

class WBlock { constructor(bt) { this.bt = bt; } }
class WLoop { constructor(bt) { this.bt = bt; } }
class WIf { constructor(bt) { this.bt = bt; } }
class WElse { }
class WEnd { }
// catches: [{ kind, tagIdx, target }] — kind/tagIdx as in the binary
// format (0x00 catch / 0x01 catch_ref take a tag; 0x02/0x03 don't).
class WTryTable { constructor(bt, catches) { this.bt = bt; this.catches = catches; } }
class WBr { constructor(target) { this.target = target; } }
class WBrIf { constructor(target) { this.target = target; } }
class WBrTable { constructor(targets, defaultTarget) { this.targets = targets; this.defaultTarget = defaultTarget; } }
class WReturn { }
class WCall { constructor(funcIdx) { this.funcIdx = funcIdx; } }
class WCallIndirect { constructor(typeIdx, tableIdx) { this.typeIdx = typeIdx; this.tableIdx = tableIdx; } }
class WConst { constructor(wt, value) { this.wt = wt; this.value = value; } }
class WLocalGet { constructor(idx) { this.idx = idx; } }
class WLocalSet { constructor(idx) { this.idx = idx; } }
class WLocalTee { constructor(idx) { this.idx = idx; } }
class WGlobalGet { constructor(idx) { this.idx = idx; } }
class WGlobalSet { constructor(idx) { this.idx = idx; } }
class WAop { constructor(wt, op, sign) { this.wt = wt; this.op = op; this.sign = sign; } }
class WMop { constructor(opcode, offset, align) { this.opcode = opcode; this.offset = offset; this.align = align; } }
class WTruncSat { constructor(subop) { this.subop = subop; } }
class WMemorySize { }
class WMemoryGrow { }
class WMemoryCopy { }
class WMemoryFill { }
class WDrop { }
class WNop { }
class WUnreachable { }
class WThrow { constructor(tagIdx) { this.tagIdx = tagIdx; } }
class WThrowRef { }
// Reference-type long tail. kind selects the encoding (they mix raw-byte,
// signed-LEB and 0xFB-prefixed forms, so they can't share WGCOp's shape):
// "null" | "nullIdx" | "isNull" | "eq" | "test" | "testNull" | "cast" |
// "castNull" | "castNullEq" | "anyExtern" | "externAny"
class WRefOp { constructor(kind, imm) { this.kind = kind; this.imm = imm; } }
// GC ops: 0xFB prefix + LEB subop + unsigned-LEB immediates, uniformly.
class WGCOp { constructor(subop, imms) { this.subop = subop; this.imms = imms; } }
// The EWasm escape hatch: pre-encoded bytes emitted verbatim. Stack-opaque
// — an optimization BARRIER in later stages. Real __wasm() carriers are
// flat single instructions (no control flow), so it is structurally safe.
// INVARIANT (todos/0214): raw bytes never encode a FUNCTION INDEX
// (call/return_call/ref.func) — the tree-shake renumbers function indices
// and treats WRaw as reference-free; the __wasm parser rejects those
// opcodes at op-group heads. Local indices in raw bytes are fine (function-
// local; the inliner refuses raw-bearing callees for exactly that reason).
class WRaw { constructor(bytes) { this.bytes = bytes; } }
// Zero-width source-map marker: serialize() reports the body-relative byte
// offset it lands on via the onSrcLoc callback.
class WSrcLoc { constructor(fileIdx, line) { this.fileIdx = fileIdx; this.line = line; } }

// ---- WastBuilder ----
//
// Same method surface as WasmCode — the ~545 Codegen `this.body.*` call
// sites change zero characters — but appends nodes instead of bytes.
// block/loop/if_/tryTable push their node onto a live control stack,
// end() pops it, and br(depth) resolves the numeric depth against that
// stack AT BUILD TIME (the only moment it is valid) into a label identity.
// The stack bottom is the FUNC label: br to depth == nesting targets the
// function body itself.
class WastBuilder {
  constructor() {
    this.nodes = [];
    this.funcLabel = { isFuncLabel: true };
    this.ctrl = [this.funcLabel];
    this._lastLoc = null;
  }
  _append(n) { this.nodes.push(n); }

  // Raw byte escape hatch (EWasm): consecutive pushes coalesce into one
  // WRaw node, emitted verbatim by serialize().
  push(byte) {
    const last = this.nodes[this.nodes.length - 1];
    if (last instanceof WRaw) last.bytes.push(byte);
    else this._append(new WRaw([byte]));
  }

  // Subsumes WasmCode._checkBrDepth: a depth that doesn't land on the live
  // control stack is the same class of internal bug, caught at the same
  // moment (the emit site), with the label resolution as a bonus.
  _resolveDepth(d, opName) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d >= this.ctrl.length) {
      throw new Error(
        `internal codegen error: ${opName} depth ${d} is out of range ` +
        `(likely a stale entry in gotoLabelDepths / breakTarget / continueTarget)`);
    }
    return this.ctrl[this.ctrl.length - 1 - d];
  }

  // Control flow
  unreachable() { this._append(new WUnreachable()); }
  nop() { this._append(new WNop()); }
  block(bt) { const n = new WBlock(bt || WT_EMPTY); this._append(n); this.ctrl.push(n); }
  loop(bt) { const n = new WLoop(bt || WT_EMPTY); this._append(n); this.ctrl.push(n); }
  if_(bt) { const n = new WIf(bt); this._append(n); this.ctrl.push(n); }
  // else must sit directly inside an if that hasn't taken one yet — a
  // second else_() on the same if is an emitter bug; catch it here at the
  // producing site instead of as V8's opaque module rejection
  // (todos/0227 W2; validate() enforces the same rule for pass output).
  else_() {
    const top = this.ctrl[this.ctrl.length - 1];
    if (!(top instanceof WIf)) {
      throw new Error("internal codegen error: else_() outside an if");
    }
    if (!this._elseTaken) this._elseTaken = new Set();
    if (this._elseTaken.has(top)) {
      throw new Error("internal codegen error: second else_() in one if");
    }
    this._elseTaken.add(top);
    this._append(new WElse());
  }
  end() {
    if (this.ctrl.length <= 1) {
      throw new Error("internal codegen error: end() with no open control construct");
    }
    this._append(new WEnd());
    const closed = this.ctrl.pop();
    if (this._elseTaken) this._elseTaken.delete(closed);
  }
  br(labelIdx) { this._append(new WBr(this._resolveDepth(labelIdx, "br"))); }
  brIf(labelIdx) { this._append(new WBrIf(this._resolveDepth(labelIdx, "brIf"))); }
  brTable(labels, defaultLabel) {
    this._append(new WBrTable(
      labels.map((l) => this._resolveDepth(l, "brTable entry")),
      this._resolveDepth(defaultLabel, "brTable default")));
  }
  ret() { this._append(new WReturn()); }
  call(funcIdx) { this._append(new WCall(funcIdx)); }
  callIndirect(typeIdx) { this._append(new WCallIndirect(typeIdx, 0)); }

  // Locals and globals
  localGet(idx) { this._append(new WLocalGet(idx)); }
  localSet(idx) { this._append(new WLocalSet(idx)); }
  localTee(idx) { this._append(new WLocalTee(idx)); }
  globalGet(idx) { this._append(new WGlobalGet(idx)); }
  globalSet(idx) { this._append(new WGlobalSet(idx)); }

  // Memory operations
  mop(opcode, offset, align) { this._append(new WMop(opcode, offset, align)); }
  memorySize() { this._append(new WMemorySize()); }
  memoryGrow() { this._append(new WMemoryGrow()); }
  memoryCopy() { this._append(new WMemoryCopy()); }
  memoryFill() { this._append(new WMemoryFill()); }
  truncSat(dstWt, srcWt, sign) { this._append(new WTruncSat(truncSatSubop(dstWt, srcWt, sign))); }

  // Numeric constants
  i32Const(value) { this._append(new WConst(WT_I32, value)); }
  i64Const(value) { this._append(new WConst(WT_I64, value)); }
  f32Const(value) { this._append(new WConst(WT_F32, value)); }
  f64Const(value) { this._append(new WConst(WT_F64, value)); }

  // ALU operations
  aop(wt, op, sign) { this._append(new WAop(wt, op, sign)); }

  // Exception handling. tryTable's catch label indices are relative to the
  // context OUTSIDE the try_table (codegen computes them before the
  // try_table's own label exists), so resolve first, then open the label.
  throw_(tagIdx) { this._append(new WThrow(tagIdx)); }
  throwRef() { this._append(new WThrowRef()); }
  tryTable(blockType, catches) {
    const resolved = catches.map(([kind, tagIdx, labelIdx]) =>
      ({ kind, tagIdx, target: this._resolveDepth(labelIdx, "tryTable catch") }));
    const n = new WTryTable(blockType, resolved);
    this._append(n);
    this.ctrl.push(n);
  }

  // Drop
  drop() { this._append(new WDrop()); }

  // Reference types
  refNull(heapType) { this._append(new WRefOp("null", heapType)); }
  refNullIdx(typeIdx) { this._append(new WRefOp("nullIdx", typeIdx)); }
  refIsNull() { this._append(new WRefOp("isNull")); }
  refEq() { this._append(new WRefOp("eq")); }
  refTest(typeIdx) { this._append(new WRefOp("test", typeIdx)); }
  refTestNull(typeIdx) { this._append(new WRefOp("testNull", typeIdx)); }
  refCast(typeIdx) { this._append(new WRefOp("cast", typeIdx)); }
  refCastNull(typeIdx) { this._append(new WRefOp("castNull", typeIdx)); }
  refCastNullEq() { this._append(new WRefOp("castNullEq")); }
  anyConvertExtern() { this._append(new WRefOp("anyExtern")); }
  externConvertAny() { this._append(new WRefOp("externAny")); }

  // GC opcodes (0xFB ...)
  structNew(typeIdx) { this._append(new WGCOp(0x00, [typeIdx])); }
  structNewDefault(typeIdx) { this._append(new WGCOp(0x01, [typeIdx])); }
  structGet(typeIdx, fieldIdx) { this._append(new WGCOp(0x02, [typeIdx, fieldIdx])); }
  structGetS(typeIdx, fieldIdx) { this._append(new WGCOp(0x03, [typeIdx, fieldIdx])); }
  structGetU(typeIdx, fieldIdx) { this._append(new WGCOp(0x04, [typeIdx, fieldIdx])); }
  structSet(typeIdx, fieldIdx) { this._append(new WGCOp(0x05, [typeIdx, fieldIdx])); }
  arrayNew(typeIdx) { this._append(new WGCOp(0x06, [typeIdx])); }
  arrayNewDefault(typeIdx) { this._append(new WGCOp(0x07, [typeIdx])); }
  arrayNewFixed(typeIdx, n) { this._append(new WGCOp(0x08, [typeIdx, n])); }
  arrayGet(typeIdx) { this._append(new WGCOp(0x0B, [typeIdx])); }
  arrayGetS(typeIdx) { this._append(new WGCOp(0x0C, [typeIdx])); }
  arrayGetU(typeIdx) { this._append(new WGCOp(0x0D, [typeIdx])); }
  arraySet(typeIdx) { this._append(new WGCOp(0x0E, [typeIdx])); }
  arrayLen() { this._append(new WGCOp(0x0F, [])); }
  arrayFill(typeIdx) { this._append(new WGCOp(0x10, [typeIdx])); }
  arrayCopy(dstTypeIdx, srcTypeIdx) { this._append(new WGCOp(0x11, [dstTypeIdx, srcTypeIdx])); }

  // Source-map marker (zero-width). Consecutive same-(file,line) records
  // dedup here, mirroring the old _recordSourceLoc last-entry check.
  srcLoc(fileIdx, line) {
    if (this._lastLoc && this._lastLoc.fileIdx === fileIdx && this._lastLoc.line === line) return;
    const n = new WSrcLoc(fileIdx, line);
    this._lastLoc = n;
    this._append(n);
  }
}

// ---- Serializer ----
//
// The byte-encoding logic RELOCATED from WasmCode into one
// switch(node.constructor) walk. The active-label stack re-derives every
// branch depth from label identity (subsuming _checkBrDepth: an unknown
// label throws at the offending node), and WSrcLoc markers report their
// body-relative byte offset through opts.onSrcLoc.
function serialize(fnNodes, out, opts) {
  const onSrcLoc = opts && opts.onSrcLoc;
  const base = out.length;
  const stack = []; // active label identities, innermost last (FUNC label implicit)

  function depthOf(target, opName) {
    if (target && target.isFuncLabel) return stack.length;
    const i = stack.lastIndexOf(target);
    if (i < 0) {
      throw new Error(`internal codegen error: ${opName} targets a label that is not on the active control stack`);
    }
    return stack.length - 1 - i;
  }

  for (const n of fnNodes) {
    switch (n.constructor) {
      case WLocalGet: out.push(0x20); lebU(out, n.idx); break;
      case WLocalSet: out.push(0x21); lebU(out, n.idx); break;
      case WLocalTee: out.push(0x22); lebU(out, n.idx); break;
      case WGlobalGet: out.push(0x23); lebU(out, n.idx); break;
      case WGlobalSet: out.push(0x24); lebU(out, n.idx); break;
      case WConst:
        switch (n.wt.num) {
          case WasmNumType.I32: out.push(0x41); lebI(out, Number(n.value) | 0); break;
          case WasmNumType.I64:
            out.push(0x42);
            if (typeof n.value === "bigint") lebI64(out, n.value);
            else lebI64(out, BigInt(n.value));
            break;
          case WasmNumType.F32: out.push(0x43); appendF32(out, n.value); break;
          case WasmNumType.F64: out.push(0x44); appendF64(out, n.value); break;
          default: throw new Error("WAST serialize: WConst with non-numeric type");
        }
        break;
      case WAop: out.push(getaop(n.wt, n.op, n.sign)); break;
      case WMop: out.push(n.opcode); lebU(out, n.align); lebU(out, n.offset); break;
      case WBlock: out.push(0x02); wtEmit(n.bt, out); stack.push(n); break;
      case WLoop: out.push(0x03); wtEmit(n.bt, out); stack.push(n); break;
      case WIf: out.push(0x04); wtEmit(n.bt, out); stack.push(n); break;
      case WElse: out.push(0x05); break;
      case WEnd:
        if (stack.length === 0) throw new Error("WAST serialize: end with no open control construct");
        out.push(0x0B);
        stack.pop();
        break;
      case WBr: out.push(0x0C); lebU(out, depthOf(n.target, "br")); break;
      case WBrIf: out.push(0x0D); lebU(out, depthOf(n.target, "brIf")); break;
      case WBrTable:
        out.push(0x0E);
        lebU(out, n.targets.length);
        for (const t of n.targets) lebU(out, depthOf(t, "brTable entry"));
        lebU(out, depthOf(n.defaultTarget, "brTable default"));
        break;
      case WReturn: out.push(0x0F); break;
      case WCall: out.push(0x10); lebU(out, n.funcIdx); break;
      case WCallIndirect: out.push(0x11); lebU(out, n.typeIdx); out.push(n.tableIdx); break;
      case WTryTable:
        // Catch labels resolve in the context OUTSIDE the try_table's own
        // label — push it only after the handler entries are encoded.
        out.push(0x1F);
        wtEmit(n.bt, out);
        lebU(out, n.catches.length);
        for (const c of n.catches) {
          out.push(c.kind);
          if (c.kind === 0x00 || c.kind === 0x01) lebU(out, c.tagIdx);
          lebU(out, depthOf(c.target, "tryTable catch"));
        }
        stack.push(n);
        break;
      case WThrow: out.push(0x08); lebU(out, n.tagIdx); break;
      case WThrowRef: out.push(0x0A); break;
      case WUnreachable: out.push(0x00); break;
      case WNop: out.push(0x01); break;
      case WDrop: out.push(0x1A); break;
      case WMemorySize: out.push(0x3F); out.push(0x00); break;
      case WMemoryGrow: out.push(0x40); out.push(0x00); break;
      case WMemoryCopy: out.push(0xFC); lebU(out, 10); out.push(0x00); out.push(0x00); break;
      case WMemoryFill: out.push(0xFC); lebU(out, 11); out.push(0x00); break;
      case WTruncSat: out.push(0xFC); lebU(out, n.subop); break;
      case WRefOp:
        switch (n.kind) {
          case "null": out.push(0xD0); out.push(n.imm); break;
          case "nullIdx": out.push(0xD0); lebI(out, n.imm); break;
          case "isNull": out.push(0xD1); break;
          case "eq": out.push(0xD3); break;
          case "test": out.push(0xFB); lebU(out, 0x14); lebI(out, n.imm); break;
          case "testNull": out.push(0xFB); lebU(out, 0x15); lebI(out, n.imm); break;
          case "cast": out.push(0xFB); lebU(out, 0x16); lebI(out, n.imm); break;
          case "castNull": out.push(0xFB); lebU(out, 0x17); lebI(out, n.imm); break;
          case "castNullEq": out.push(0xFB); lebU(out, 0x17); out.push(0x6D); break;
          case "anyExtern": out.push(0xFB); lebU(out, 0x1A); break;
          case "externAny": out.push(0xFB); lebU(out, 0x1B); break;
          default: throw new Error(`WAST serialize: unknown WRefOp kind '${n.kind}'`);
        }
        break;
      case WGCOp:
        out.push(0xFB);
        lebU(out, n.subop);
        for (const imm of n.imms) lebU(out, imm);
        break;
      case WRaw:
        for (const b of n.bytes) out.push(b);
        break;
      case WSrcLoc:
        if (onSrcLoc) onSrcLoc(out.length - base, n.fileIdx, n.line);
        break;
      default:
        throw new Error(`WAST serialize: unknown node ${n.constructor && n.constructor.name}`);
    }
  }
  if (stack.length !== 0) {
    throw new Error(`WAST serialize: ${stack.length} unclosed control construct(s)`);
  }
}

// ---- Flat validator ----
//
// Cheap structural insurance, run after building each function body in
// Stage 1 (and after every transform in later stages): control balance,
// else only inside if, every branch target on the active control stack
// (or this function's FUNC label), block types shaped like the 3-way
// EMPTY | valtype | typeidx union. Arity/stack typing is deliberately NOT
// checked here — the engine-level WebAssembly.validate backstop covers it.
function validate(fnNodes, funcLabel) {
  const stack = [];
  const elseSeen = new Set();
  function checkTarget(t, what) {
    if (t && t.isFuncLabel) {
      if (funcLabel && t !== funcLabel) {
        throw new Error(`WAST validate: ${what} targets a foreign function's label`);
      }
      return;
    }
    if (stack.lastIndexOf(t) < 0) {
      throw new Error(`WAST validate: ${what} targets a label that is not on the active control stack`);
    }
  }
  function checkBt(bt, what) {
    if (!bt || (bt.tag !== "empty" && bt.tag !== "num" && bt.tag !== "ref" && bt.tag !== "typeidx")) {
      throw new Error(`WAST validate: ${what} has an invalid block type`);
    }
  }
  for (const n of fnNodes) {
    switch (n.constructor) {
      case WBlock: checkBt(n.bt, "block"); stack.push(n); break;
      case WLoop: checkBt(n.bt, "loop"); stack.push(n); break;
      case WIf: checkBt(n.bt, "if"); stack.push(n); break;
      case WTryTable:
        checkBt(n.bt, "try_table");
        for (const c of n.catches) checkTarget(c.target, "try_table catch");
        stack.push(n);
        break;
      case WElse: {
        const top = stack[stack.length - 1];
        if (!(top instanceof WIf)) {
          throw new Error("WAST validate: else outside an if");
        }
        // One else per if (todos/0227 W2): a duplicate would otherwise
        // surface as V8's opaque rejection of the serialized module.
        if (elseSeen.has(top)) {
          throw new Error("WAST validate: second else in one if");
        }
        elseSeen.add(top);
        break;
      }
      case WEnd:
        if (stack.length === 0) throw new Error("WAST validate: end with no open control construct");
        elseSeen.delete(stack.pop());
        break;
      case WBr: checkTarget(n.target, "br"); break;
      case WBrIf: checkTarget(n.target, "brIf"); break;
      case WBrTable:
        for (const t of n.targets) checkTarget(t, "brTable entry");
        checkTarget(n.defaultTarget, "brTable default");
        break;
    }
  }
  if (stack.length !== 0) {
    throw new Error(`WAST validate: ${stack.length} unclosed control construct(s)`);
  }
}

// ---- Passes ----

function mopIsLoad(opcode) { return opcode >= MOP.I32_LOAD && opcode <= MOP.I64_LOAD32_U; }
function mopIsStore(opcode) { return opcode >= MOP.I32_STORE && opcode <= MOP.I64_STORE32; }

// Offset-fold peephole (todos/0200). Codegen materializes every address
// displacement as an explicit `i32.const k; i32.add` and emits ALL loads/
// stores with memarg offset 0, so the offset immediate is free real estate.
// Collapse the adjacent pair into it:
//
//   loads:  [.., WConst i32 k, WAop i32.add,    WMop load  off=0]
//        -> [..,                               WMop load  off=k]
//   stores: [.., WConst i32 k, WAop i32.add, V, WMop store off=0]
//        -> [..,                            V, WMop store off=k]
//
// A load pops exactly its address, so an immediately-preceding add IS the
// address producer. A store pops [value, addr] with the VALUE on top: the
// node just before the WMop produced the value, and the address's const+add
// sits one node further back — folding the adjacent triple on a store would
// rewrite the value, not the address. So the store form only fires when V
// is ONE pure single-push producer (WConst/WLocalGet/WGlobalGet); complex
// value sequences would need stack-effect analysis to locate the address
// producer, out of scope for an adjacency peephole.
//
// k is normalized exactly as serialize() emits it (Number(v) | 0) and must
// be >= 0: a negative displacement relies on i32.add's mod-2^32 wrap, which
// the non-wrapping (33-bit effective address) memarg offset would turn into
// a trap. For k >= 0 the fold assumes base+k doesn't wrap — only wrapped/UB
// pointer arithmetic could make it (no object spans the top of the 4GB
// space), the same assumption every production wasm compiler makes.
//
// Matching exact class sequences makes every barrier automatic: WRaw
// (opaque stack effect), control/label nodes, and WSrcLoc markers all fail
// the match, so nothing folds across them. Nothing MOVES — two nodes are
// deleted and an immediate rewritten — so label identities and the
// relative order of all surviving nodes are untouched. The fold site loops
// only while k == 0 left the offset foldable again (a chain of `+0` adds),
// which is what makes a SECOND run of the pass a guaranteed no-op.
function foldMemOffsets(nodes) {
  let folds = 0;
  const out = [];
  for (const n of nodes) {
    out.push(n);
    if (!(n instanceof WMop) || n.offset !== 0) continue;
    const isLoad = mopIsLoad(n.opcode);
    if (!isLoad && !mopIsStore(n.opcode)) continue;
    for (;;) {
      const ai = out.length - 2 - (isLoad ? 0 : 1); // WAop position
      if (ai < 1) break;
      if (!isLoad) {
        const v = out[out.length - 2];
        if (!(v instanceof WConst || v instanceof WLocalGet || v instanceof WGlobalGet)) break;
      }
      const a = out[ai], c = out[ai - 1];
      if (!(a instanceof WAop) || a.op !== ALU.OP_ADD || !wtEquals(a.wt, WT_I32)) break;
      if (!(c instanceof WConst) || !wtEquals(c.wt, WT_I32)) break;
      const k = Number(c.value) | 0; // serialize()'s own normalization
      if (k < 0) break;
      out.splice(ai - 1, 2); // drop WConst + WAop; base producer (and V) stay put
      n.offset = k;
      folds++;
      if (k !== 0) break;
    }
  }
  return { nodes: out, folds };
}

// ---- Whole-body inliner (todos/0201) ----
//
// Replace an eligible direct WCall with the callee's body spliced into the
// caller. The substrate's symbolic label identities are what make this a
// LOCAL transform: a cloned branch resolves against its own cloned
// block/loop/if, a WReturn (or a branch to the callee's FUNC label)
// becomes a WBr to the fresh wrapper block, and the serializer re-derives
// every depth on its walk — no depth arithmetic anywhere.
//
// Per site, with k = callee param count and offset = the caller's current
// local count (params + declared):
//   [args..., WCall f]  ->  [args...,
//                            WLocalSet(offset+k-1) ... WLocalSet(offset+0),
//                            WBlock(f's wasm result type),
//                              <f's body: local idx +offset,
//                               WReturn -> WBr(L),
//                               funcLabel branch targets -> L>,
//                            WEnd]
// The reverse-order drain binds the already-evaluated args (exactly once,
// in source order — they were emitted as the WCall's preceding siblings)
// into the renumbered param locals; the caller's locals vector grows by
// f's param types + its declared RLE locals (params share the callee's
// local index space but live in the signature, not the decl vector, so
// the renumber base is params+declared, not declared alone). A callee
// with the STANDARD fixed frame (fixed frameSize + savedSp save/restore;
// savedSp renumbered like any local) splices VERBATIM: its self-contained
// prologue/epilogue produces a correctly NESTED dynamic frame per inline
// site — correct, not merged (frame merging is a later optimization).
// Every cloned node is a FRESH instance: node lists share no elements, so
// a later per-function pass that mutates an immediate (foldMemOffsets
// writes WMop.offset) can never corrupt a sibling copy.
//
// Ordering: Tarjan SCC completion order over the WCall-derived call graph
// = callees before callers on the DAG part, so nested inlines compose (a
// spliced callee body already contains ITS inlines). Recursion is refused
// only at the SITE level (caller == callee); a same-SCC callee splices a
// SINGLE snapshot of its current body — its internal calls stay real
// calls, so each splice is semantics-preserving regardless of recursion,
// and termination is structural (one walk over each caller's original
// nodes; spliced content is never re-scanned). The relaxation is
// deliberate (todos/0201): SameBoy's whole main loop is one SCC closed by
// the run-once SGB-border boot edge (GB_borrow_sgb_border->GB_run_frame),
// so an SCC-wide refusal would exclude every hot callee.
//
// Refusals (silent per-site skip — the WCall stays a call; counted in
// stats.refused by reason): imported target, missing wast/fnMeta (raw
// hand-built bodies), self-recursion, variadic (dynamic arg-block ABI),
// alloca (dynamic stack growth), over-aligned/masked frameBase,
// struct-by-value return (sret ABI + caller-deferred SP restoration),
// exception constructs (WTryTable/WThrow), WRaw (opaque bytes embed
// un-relocatable local indices), multi-value results, and the two budget
// caps. Budgets are DELIBERATELY CONSERVATIVE (coordinator decision,
// todos/0201): inline the small callees that fall out of the
// representation cleanly; do NOT chase the big SameBoy hot callees
// (GB_read_memory ~397 real nodes, GB_advance_cycles ~534, cycle_write
// ~1211) at dozens of sites — documented deferred work with real V8
// tier-up risk, not a bug. Inlined-away functions are deleted by the
// tree-shake pass that follows (todos/0214) — never by the inliner itself.
//
// Policy extensions (todos/0214):
// - fnMeta.noinline (__attribute__((noinline))) is a hard per-callee
//   refusal, counted in stats.refused.noinline — even single-use.
// - fnMeta.alwaysInline (__attribute__((always_inline))) bypasses the
//   two SIZE budgets (calleeCap/callerGrowth). The soundness refusals and
//   localCap (a wasm ENGINE limit, not a tuning knob) still apply.
// - fnMeta.inlineHint (the plain `inline` keyword) raises the effective
//   callee cap to hintCalleeCap — a bias, not a mandate.
// - SINGLE-USE bypass: a callee whose only reference in the whole module
//   is this one WCall site (not exported, not address-taken — i.e. the
//   shake can delete it afterwards) inlines regardless of the size
//   budgets: its body MOVES rather than duplicates, so net module size
//   can only shrink. Site counts are maintained live — a splice adds the
//   clone's calls to their targets' counts, a consumed site decrements —
//   so later decisions see the true post-rewrite reference counts.
const inlineDefaults = {
  enabled: true,
  calleeCap: 64,      // max real (non-WSrcLoc) nodes in an inlinable callee
  hintCalleeCap: 256, // effective calleeCap for `inline`-hinted callees
  singleUse: true,    // budget bypass for deletable single-site callees
  callerGrowth: 1000, // max real nodes a caller may GAIN from inlining
  // Max locals (params + declared) a caller may REACH via inlining. Each
  // site adds k params + ALL the callee's declared locals — body-size
  // budgets don't see that (a tiny body can declare thousands of locals:
  // ext_regex has a ~12.5k-local helper), and wasm engines hard-fail a
  // function at 50,000 locals ("local count too large"). 45000 leaves
  // margin while changing no current-corpus decision (todos/0209).
  localCap: 45000,
};

function realNodeCount(nodes) {
  let c = 0;
  for (const n of nodes) if (!(n instanceof WSrcLoc)) c++;
  return c;
}

// Append a local run to a caller's RLE locals vector, merging with the
// tail entry when the type matches (pure encoding compactness).
function pushLocalRLE(locals, type, count) {
  const last = locals[locals.length - 1];
  if (last && wtEquals(last.type, type)) last.count += count;
  else locals.push({ type, count });
}

// Clone a callee body for splicing: fresh node instances throughout,
// local indices shifted by `offset`, control-node label identities mapped
// original->clone (a branch target is always an ENCLOSING construct, so
// it precedes the branch in the flat list and the map is populated by the
// time a branch needs it), WReturn and funcLabel-targeted branches
// retargeted to `wrapLabel`. WRaw / WTryTable / WThrow never reach here
// (refused by eligibility); an unknown node class fails loud.
// WSrcLoc markers are DROPPED from the clone: the c.sourcemap format is a
// flat offset->line table with no inline-frame concept, so a callee line
// inside the caller's byte range would read as cross-function leakage
// (tests/sourcemap/line_numbers pins that invariant). Inlined
// instructions therefore attribute to the CALL SITE — the caller's last
// marker before the splice.
function cloneInlineBody(nodes, offset, wrapLabel) {
  const map = new Map();
  const mapT = (t) => {
    if (t && t.isFuncLabel) return wrapLabel;
    const c = map.get(t);
    if (!c) throw new Error("WAST inline: branch targets a label outside the callee body");
    return c;
  };
  const out = [];
  for (const n of nodes) {
    let c;
    switch (n.constructor) {
      case WLocalGet: c = new WLocalGet(n.idx + offset); break;
      case WLocalSet: c = new WLocalSet(n.idx + offset); break;
      case WLocalTee: c = new WLocalTee(n.idx + offset); break;
      case WBlock: c = new WBlock(n.bt); map.set(n, c); break;
      case WLoop: c = new WLoop(n.bt); map.set(n, c); break;
      case WIf: c = new WIf(n.bt); map.set(n, c); break;
      case WElse: c = new WElse(); break;
      case WEnd: c = new WEnd(); break;
      case WBr: c = new WBr(mapT(n.target)); break;
      case WBrIf: c = new WBrIf(mapT(n.target)); break;
      case WBrTable: c = new WBrTable(n.targets.map(mapT), mapT(n.defaultTarget)); break;
      case WReturn: c = new WBr(wrapLabel); break;
      case WCall: c = new WCall(n.funcIdx); break;
      case WCallIndirect: c = new WCallIndirect(n.typeIdx, n.tableIdx); break;
      case WConst: c = new WConst(n.wt, n.value); break;
      case WGlobalGet: c = new WGlobalGet(n.idx); break;
      case WGlobalSet: c = new WGlobalSet(n.idx); break;
      case WAop: c = new WAop(n.wt, n.op, n.sign); break;
      case WMop: c = new WMop(n.opcode, n.offset, n.align); break;
      case WTruncSat: c = new WTruncSat(n.subop); break;
      case WMemorySize: c = new WMemorySize(); break;
      case WMemoryGrow: c = new WMemoryGrow(); break;
      case WMemoryCopy: c = new WMemoryCopy(); break;
      case WMemoryFill: c = new WMemoryFill(); break;
      case WDrop: c = new WDrop(); break;
      case WNop: c = new WNop(); break;
      case WUnreachable: c = new WUnreachable(); break;
      case WRefOp: c = new WRefOp(n.kind, n.imm); break;
      case WGCOp: c = new WGCOp(n.subop, n.imms.slice()); break;
      case WSrcLoc: continue; // call-site attribution (see header comment)
      default:
        throw new Error(`WAST inline: cannot clone node ${n.constructor && n.constructor.name}`);
    }
    out.push(c);
  }
  return out;
}

function inlineFunctions(wmod, optsIn) {
  const opts = Object.assign({}, inlineDefaults, optsIn || {});
  const stats = {
    inlined: 0,
    singleUse: 0,     // budget-bypassed single-site inlines (subset of inlined)
    alwaysInline: 0,  // budget-bypassed always_inline inlines (subset of inlined)
    refused: { self: 0, imported: 0, noBody: 0, noinline: 0, variadic: 0,
               alloca: 0, overAligned: 0, structRet: 0, eh: 0, raw: 0,
               multiResult: 0, budgetCallee: 0, budgetCaller: 0,
               budgetLocals: 0 },
  };
  if (!opts.enabled) return stats;
  const defs = wmod.funcDefs;
  const nImp = wmod.funcImports ? wmod.funcImports.length : 0;
  const N = defs.length;

  // Roots the tree-shake can never delete: function exports and
  // address-taken functions (table index escaped as a value). A rooted
  // callee gets no single-use bypass — inlining it would DUPLICATE the
  // body, not move it. Hand-built test modules may lack both fields.
  const rooted = new Set();
  for (const e of (wmod.exports || [])) {
    if (e.kind === 0x00 && e.index >= nImp) rooted.add(e.index - nImp);
  }
  for (const fi of (wmod.addrTakenFuncs || [])) {
    if (fi >= nImp) rooted.add(fi - nImp);
  }

  // Call-graph adjacency over defined-function indices, plus the global
  // per-callee site count that feeds the single-use bypass.
  const adj = [];
  const siteCount = new Int32Array(N);
  let anySite = false;
  for (let i = 0; i < N; i++) {
    const s = new Set();
    if (defs[i].wast) {
      for (const n of defs[i].wast) {
        if (n instanceof WCall) {
          anySite = true;
          if (n.funcIdx >= nImp) {
            s.add(n.funcIdx - nImp);
            siteCount[n.funcIdx - nImp]++;
          }
        }
      }
    }
    adj.push(s);
  }
  if (!anySite) return stats;

  // Iterative Tarjan. An SCC completes only after every SCC it points to
  // (its callees) has completed, so concatenating members in completion
  // order yields the callee-before-caller processing order.
  const order = [];
  {
    const idx = new Int32Array(N).fill(-1);
    const low = new Int32Array(N);
    const onstk = new Uint8Array(N);
    const stk = [];
    let counter = 0;
    for (let s = 0; s < N; s++) {
      if (idx[s] !== -1) continue;
      const work = [[s, null, 0]]; // [node, adjacency array, cursor]
      while (work.length) {
        const fr = work[work.length - 1];
        const v = fr[0];
        if (fr[1] === null) {
          idx[v] = low[v] = counter++;
          stk.push(v); onstk[v] = 1;
          fr[1] = [...adj[v]];
        }
        let advanced = false;
        while (fr[2] < fr[1].length) {
          const w = fr[1][fr[2]++];
          if (idx[w] === -1) { work.push([w, null, 0]); advanced = true; break; }
          if (onstk[w] && idx[w] < low[v]) low[v] = idx[w];
        }
        if (advanced) continue;
        if (low[v] === idx[v]) {
          for (;;) { const w = stk.pop(); onstk[w] = 0; order.push(w); if (w === v) break; }
        }
        work.pop();
        if (work.length) {
          const p = work[work.length - 1][0];
          if (low[v] < low[p]) low[p] = low[v];
        }
      }
    }
  }

  // Per-callee hazard scan, cached by body identity (a body rewritten by
  // an earlier iteration gets a fresh scan).
  const scanCache = new Map();
  function scanCallee(ei) {
    const def = defs[ei];
    let s = scanCache.get(ei);
    if (s && s.wast === def.wast) return s;
    let real = 0, eh = false, raw = false;
    for (const n of def.wast) {
      if (n instanceof WSrcLoc) continue;
      real++;
      if (n instanceof WTryTable || n instanceof WThrow || n instanceof WThrowRef) eh = true;
      else if (n instanceof WRaw) raw = true;
    }
    s = { wast: def.wast, real, eh, raw };
    scanCache.set(ei, s);
    return s;
  }

  for (const di of order) {
    const def = defs[di];
    if (!def.wast) continue;
    let hasSite = false;
    for (const n of def.wast) if (n instanceof WCall) { hasSite = true; break; }
    if (!hasSite) continue;
    const callerReal = realNodeCount(def.wast);
    const budget = callerReal + opts.callerGrowth;
    let cur = callerReal;
    let localCount = wmod.typeDefs[def.typeId].params.length +
                     def.locals.reduce((a, l) => a + l.count, 0);
    const out = [];
    let rewrote = false;
    for (const n of def.wast) {
      if (!(n instanceof WCall)) { out.push(n); continue; }
      const refuse = (why) => { stats.refused[why]++; out.push(n); };
      if (n.funcIdx < nImp) { refuse('imported'); continue; }
      const ei = n.funcIdx - nImp;
      if (ei === di) { refuse('self'); continue; }
      const callee = defs[ei];
      const meta = callee.fnMeta;
      if (!callee.wast || !meta) { refuse('noBody'); continue; }
      if (meta.noinline) { refuse('noinline'); continue; }
      if (meta.variadic) { refuse('variadic'); continue; }
      if (meta.usesAlloca) { refuse('alloca'); continue; }
      if (meta.overAligned) { refuse('overAligned'); continue; }
      if (meta.structRet) { refuse('structRet'); continue; }
      const ct = wmod.typeDefs[callee.typeId];
      if (ct.results.length > 1) { refuse('multiResult'); continue; }
      const scan = scanCallee(ei);
      if (scan.eh) { refuse('eh'); continue; }
      if (scan.raw) { refuse('raw'); continue; }
      // Size budgets — bypassed for a deletable single-site callee (the
      // body moves, net size shrinks) and for always_inline (user
      // mandate). Soundness refusals above and localCap below are never
      // bypassed.
      const singleUse = opts.singleUse && siteCount[ei] === 1 && !rooted.has(ei);
      const bypass = singleUse || meta.alwaysInline;
      const k = ct.params.length;
      const added = k + 2 + scan.real - 1; // sets + block/end, minus the call
      if (!bypass) {
        const cap = meta.inlineHint ? opts.hintCalleeCap : opts.calleeCap;
        if (scan.real > cap) { refuse('budgetCallee'); continue; }
        if (cur + added > budget) { refuse('budgetCaller'); continue; }
      }
      // Local budget: this site grows the caller by k params + every
      // callee local. Refuse it if the caller would cross localCap —
      // the hard guard that keeps the emitted function under the wasm
      // 50,000-local engine limit no matter how the node-count budgets
      // are tuned (todos/0209).
      const calleeLocals = callee.locals.reduce((a, l) => a + l.count, 0);
      if (localCount + k + calleeLocals > opts.localCap) { refuse('budgetLocals'); continue; }

      const offset = localCount;
      for (const p of ct.params) pushLocalRLE(def.locals, p, 1);
      for (const l of callee.locals) pushLocalRLE(def.locals, l.type, l.count);
      localCount += k;
      for (const l of callee.locals) localCount += l.count;
      const wrap = new WBlock(ct.results.length === 1 ? ct.results[0] : WT_EMPTY);
      for (let j = k - 1; j >= 0; j--) out.push(new WLocalSet(offset + j));
      out.push(wrap);
      for (const cn of cloneInlineBody(callee.wast, offset, wrap)) {
        // Live site-count maintenance: the clone's calls are NEW sites.
        if (cn instanceof WCall && cn.funcIdx >= nImp) siteCount[cn.funcIdx - nImp]++;
        out.push(cn);
      }
      out.push(new WEnd());
      siteCount[ei]--; // this site is consumed
      cur += added;
      stats.inlined++;
      if (singleUse) stats.singleUse++;
      else if (meta.alwaysInline) stats.alwaysInline++;
      rewrote = true;
    }
    if (rewrote) {
      def.wast = out;
      validate(out, null);
    }
  }
  return stats;
}

// ---- Tree-shake (todos/0214) ----
//
// Delete defined functions unreachable from the roots over the WCall
// graph, then remap every function index the deletion renumbered. Runs
// after the inliner (which is what strands bodies), and also collects
// functions that were ALREADY dead at this level — extern-linkage but
// never referenced (the per-TU AST shake keeps those; codegen is the
// first whole-program view).
//
// ROOTS: function exports and address-taken functions. Address-taken is
// the load-bearing one — a C function pointer is the function's TABLE
// slot (funcIdx+1) baked as a plain i32 constant into code and DATA
// SEGMENTS (vtables, callback arrays), unfindable post-hoc. Codegen
// records every escape (emitAddressOf, function-designator-as-value, the
// constEval address policy that bakes static initializers) into
// wmod.addrTakenFuncs; speculative constEval attempts over-approximate,
// which only KEEPS functions — safe. A function reached only through
// call_indirect is therefore rooted by construction.
//
// THE REMAP RULE — table slots are immutable. Deleting function i shifts
// every defined function above i down in the FUNCTION index space; the
// baked pointer constants make the TABLE index space unshiftable. So:
// survivors keep their ORIGINAL slot (the element section goes from one
// identity run to skip-the-holes runs via wmod.tableLayout, and the
// table keeps its pre-shake size); deleted functions leave NULL slots,
// unreachable because anything address-taken is a root. The function-
// index rewrite then covers, exhaustively: WCall immediates (the only
// WAST node class carrying a function index — WCallIndirect carries
// type/table indices, WRefOp/WGCOp imms are type indices), the export
// section, and the name section (funcNames + localNames). No start
// section exists; sourcemap entries are recorded at serialize time,
// after this pass. A live WCall that would map to a deleted target
// throws — reachability makes it impossible; never emit a wrong index.
//
// REFUSAL OVER CLEVERNESS: the whole pass aborts (stats.aborted, loud in
// passStats) if any funcDef lacks a wast tree — a raw BYTE body could
// embed call immediates we can neither enumerate for reachability nor
// rewrite (never occurs in the current pipeline; belt-and-braces for
// future hand-built bodies). In-tree WRaw nodes are NOT a hazard: the
// EWasm escape hatch guarantees raw bytes never encode a function index
// (see the WRaw class comment — enforced at __wasm parse time), so a
// WRaw-bearing function has no hidden edges and nothing in it needs the
// remap.
const shakeDefaults = {
  enabled: true,
};

function treeShakeFunctions(wmod, optsIn) {
  const opts = Object.assign({}, shakeDefaults, optsIn || {});
  const stats = { deleted: 0, kept: wmod.funcDefs.length, aborted: null };
  if (!opts.enabled) { stats.aborted = 'disabled'; return stats; }
  const defs = wmod.funcDefs;
  const nImp = wmod.funcImports ? wmod.funcImports.length : 0;
  const N = defs.length;
  for (const def of defs) {
    if (!def.wast) { stats.aborted = 'rawBody'; return stats; }
  }

  // Roots: function exports + address-taken functions.
  const live = new Uint8Array(N);
  const q = [];
  const root = (defIdx) => {
    if (defIdx >= 0 && defIdx < N && !live[defIdx]) { live[defIdx] = 1; q.push(defIdx); }
  };
  for (const e of (wmod.exports || [])) {
    if (e.kind === 0x00 && e.index >= nImp) root(e.index - nImp);
  }
  for (const fi of (wmod.addrTakenFuncs || [])) {
    if (fi >= nImp) root(fi - nImp);
  }
  // Reachability over WCall edges (transitively dead chains fall out of
  // the one sweep — no fixpoint needed).
  while (q.length) {
    const di = q.pop();
    for (const n of defs[di].wast) {
      if (n instanceof WCall && n.funcIdx >= nImp) root(n.funcIdx - nImp);
    }
  }

  const newIdx = new Int32Array(N).fill(-1);
  let nn = 0;
  for (let i = 0; i < N; i++) if (live[i]) newIdx[i] = nn++;
  if (nn === N) return stats; // nothing dead — emit stays byte-identical

  // Single rewrite pass over every index-bearing site.
  for (let i = 0; i < N; i++) {
    if (!live[i]) continue;
    for (const n of defs[i].wast) {
      if (n instanceof WCall && n.funcIdx >= nImp) {
        const t = newIdx[n.funcIdx - nImp];
        if (t < 0) throw new Error("WAST shake: live function calls a deleted function");
        n.funcIdx = nImp + t;
      }
    }
  }
  if (wmod.exports) {
    for (const e of wmod.exports) {
      if (e.kind === 0x00 && e.index >= nImp) {
        const t = newIdx[e.index - nImp];
        if (t < 0) throw new Error("WAST shake: export references a deleted function");
        e.index = nImp + t;
      }
    }
  }
  if (wmod.funcNames) {
    wmod.funcNames = wmod.funcNames.filter(
      (en) => en.idx < nImp || newIdx[en.idx - nImp] >= 0);
    for (const en of wmod.funcNames) {
      if (en.idx >= nImp) en.idx = nImp + newIdx[en.idx - nImp];
    }
  }
  if (wmod.localNames) {
    wmod.localNames = wmod.localNames.filter(
      (en) => en.funcIdx < nImp || newIdx[en.funcIdx - nImp] >= 0);
    for (const en of wmod.localNames) {
      if (en.funcIdx >= nImp) en.funcIdx = nImp + newIdx[en.funcIdx - nImp];
    }
  }

  // Table layout: survivors at their original slots, holes where deleted
  // functions sat, size unchanged (slot values are baked constants).
  const oldTotal = nImp + N;
  const segments = [];
  let run = null;
  for (let oldFi = 0; oldFi < oldTotal; oldFi++) {
    let nfi;
    if (oldFi < nImp) {
      nfi = oldFi;
    } else {
      const t = newIdx[oldFi - nImp];
      if (t < 0) { run = null; continue; }
      nfi = nImp + t;
    }
    if (!run) { run = { slot: 1 + oldFi, funcs: [] }; segments.push(run); }
    run.funcs.push(nfi);
  }
  wmod.tableLayout = { size: oldTotal + 1, segments };

  wmod.funcDefs = defs.filter((_, i) => live[i]);
  stats.deleted = N - nn;
  stats.kept = nn;
  return stats;
}

// ---- Pass hook ----
//
// The post-codegen, pre-serialize seam (todos/0198). When this runs, every
// emitted function's node list sits complete on wmod.funcDefs[i].wast (all
// func/global/type indices were assigned in the pre-pass) and nothing has
// been serialized yet, so cross-function transforms (inlining) and local
// ones (peephole) both belong here. A pass that rewrites a function must
// re-run validate() on it (the per-function funcLabel isn't persisted on
// the funcDef, so the re-validation passes null — every structural check
// except the foreign-func-label one still runs).
// Order matters (todos/0201/0214): the INLINER runs first (it's what
// strands dead bodies), then the tree-shake deletes + remaps, then
// foldMemOffsets — so const+add displacements newly exposed inside
// inlined bodies fold too. The shake re-validates every survivor it
// rewrote (WCall immediates only — structure untouched, but the pass
// convention is rewrite ⇒ re-validate).
// Telemetry lands on wmod.passStats and mirrors to WAST.lastPassStats
// (read by benches/tests after a compile; the compiler itself stays quiet).
function runPasses(wmod) {
  const inline = inlineFunctions(wmod);
  const shake = treeShakeFunctions(wmod);
  if (shake.deleted > 0) {
    for (const def of wmod.funcDefs) validate(def.wast, null);
  }
  let offsetFolds = 0;
  for (const def of wmod.funcDefs) {
    if (!def.wast) continue;
    const r = foldMemOffsets(def.wast);
    if (r.folds > 0) {
      def.wast = r.nodes;
      validate(def.wast, null);
      offsetFolds += r.folds;
    }
  }
  wmod.passStats = { offsetFolds, inline, shake };
  lastPassStats.offsetFolds = offsetFolds;
  lastPassStats.inline = inline;
  lastPassStats.shake = shake;
}
const lastPassStats = { offsetFolds: 0, inline: null, shake: null };

return {
  // Relocated target-side tables and encoders (consumed by Codegen)
  WasmNumType, WT_I32, WT_I64, WT_F32, WT_F64, WT_EXTERNREF, WT_REFEXTERN,
  WT_EQREF, WT_EXNREF, WT_EMPTY, WT_GCREF,
  wtIsNum, wtIsRef, wtIsIntegral, wtIsFloating, wtEmit, wtEquals,
  MOP, ALU, getaop, appendF32, appendF64,
  WasmCode,
  // WAST proper
  WastBuilder, serialize, validate, runPasses, lastPassStats,
  inlineFunctions, inlineDefaults,
  treeShakeFunctions, shakeDefaults,
  WBlock, WLoop, WIf, WElse, WEnd, WTryTable, WBr, WBrIf, WBrTable,
  WReturn, WCall, WCallIndirect, WConst, WLocalGet, WLocalSet, WLocalTee,
  WGlobalGet, WGlobalSet, WAop, WMop, WTruncSat, WMemorySize, WMemoryGrow,
  WMemoryCopy, WMemoryFill, WDrop, WNop, WUnreachable, WThrow, WThrowRef, WRefOp,
  WGCOp, WRaw, WSrcLoc,
};

})();

// ====================
// WASM
// ====================

const Codegen = (() => {

// Target-side wasm type/opcode tables, byte encoders and the demoted
// WasmCode byte builder were relocated into the WAST module (todos/0197);
// Codegen consumes them unchanged.
const {
  WasmNumType, WT_I32, WT_I64, WT_F32, WT_F64, WT_EXTERNREF, WT_REFEXTERN,
  WT_EQREF, WT_EXNREF, WT_EMPTY, WT_GCREF, wtIsNum, wtIsRef, wtIsIntegral,
  wtIsFloating, wtEmit, wtEquals, MOP, ALU, getaop, appendF32, appendF64,
  WasmCode, WastBuilder,
} = WAST;

function alwaysReturns(stmt) {
  switch (stmt.constructor) {
    case AST.SReturn:
    case AST.SThrow:
      return true;
    case AST.SCompound:
      if (stmt.labels && stmt.labels.length > 0) return false;
      return stmt.statements.some(alwaysReturns);
    case AST.SIf:
      return stmt.elseBranch !== null
        && alwaysReturns(stmt.thenBranch)
        && alwaysReturns(stmt.elseBranch);
    default:
      return false;
  }
}

// __gcstr dedup key: the literal's content bytes (NUL terminator dropped)
// decoded as UTF-8. The parser already validated the bytes with a fatal
// decoder, and strict UTF-8 decode is injective, so key equality is exactly
// content-byte equality.
const _gcstrUtf8Decoder = new TextDecoder("utf-8");
function gcstrKey(estr) {
  return _gcstrUtf8Decoder.decode(new Uint8Array(estr.value.slice(0, -1)));
}

// ====================
// WASM Module State
// ====================

class WasmModule {
  constructor() {
    this.typeDefs = [];         // section 1 (function/struct/array types)
    this.funcTypeIndices = new Map(); // WasmFunctionType key -> index
    this.gcStructTypeIndices = new Map(); // struct fields key -> index
    this.gcArrayTypeIndices = new Map();  // array elem key -> index
    // Per-module cache mapping C GC type -> wasm type index. Kept here
    // (rather than as a field on the type object) because some GC types
    // — notably `gcArrayOf(T)` for singleton T — are interned on the
    // shared Types module and would otherwise carry indices from a
    // previous compile.
    this.gcTypeIdxByType = new Map();
    this.funcImports = [];      // section 2
    this.funcDefs = [];         // section 3 & 10
    this.memories = [];         // section 5
    this.globalImports = [];    // section 2 (kind 0x03); global idx space [0, globalImports.length)
    this.globals = [];          // section 6
    this.exports = [];          // section 7
    this.dataSegments = [];     // section 11
    this.tags = [];             // section 13
    this.funcNames = [];        // for name custom section: [{idx, name}]
    this.globalNames = [];      // for name custom section: [{idx, name}]
    this.typeNames = [];        // for name custom section subsection 4: [{idx, name}]
    this.fieldNames = [];       // for name custom section subsection 10: [{typeIdx, fields:[{idx, name}]}]
    this.localNames = [];       // for name custom section: [{funcIdx, locals: [{idx, name}]}]
    this.sourceMapFiles = [];   // for c.sourcemap custom section
    this.sourceMapEntries = []; // [{funcIdx (def-relative), entries: [{offset, fileIdx, line}]}]
    this.embeddedSources = null; // for c.sources custom section (-g2)
    // Function indices whose TABLE index (funcIdx+1) escaped as a value —
    // baked into code or data segments. Roots for the WAST tree-shake
    // (todos/0214): these can be reached via call_indirect and their
    // table slots must survive.
    this.addrTakenFuncs = new Set();
    // Set by the tree-shake when it deletes functions: {size, segments:
    // [{slot, funcs}]} — survivors at their ORIGINAL table slots, holes
    // where deleted functions sat. null → the identity table/element
    // emission below, byte-identical to pre-0214 output.
    this.tableLayout = null;
  }

  addFunctionTypeId(params, results) {
    const wtKey = t => t.tag === "ref" ? `ref:${t.nullable?1:0}:${t.heapIsIdx?'i':'h'}:${t.heap}` : `${t.tag}:${t.num||''}`;
    const key = params.map(wtKey).join(",") + "->" + results.map(wtKey).join(",");
    if (this.funcTypeIndices.has(key)) return this.funcTypeIndices.get(key);
    const id = this.typeDefs.length;
    this.typeDefs.push({ kind: "func", params, results });
    this.funcTypeIndices.set(key, id);
    return id;
  }

  reserveGCStructTypeId() {
    const id = this.typeDefs.length;
    this.typeDefs.push({ kind: "struct", fields: null });
    return id;
  }
  reserveGCArrayTypeId() {
    const id = this.typeDefs.length;
    this.typeDefs.push({ kind: "array", elem: null });
    return id;
  }

  // Setters for GC type bodies populated after reservation.
  setGCStructFields(typeIdx, fields, parentIdx) {
    this.typeDefs[typeIdx].fields = fields;
    if (parentIdx !== undefined && parentIdx >= 0) this.typeDefs[typeIdx].parentIdx = parentIdx;
  }
  setGCArrayElem(typeIdx, elem) { this.typeDefs[typeIdx].elem = elem; }

  addFunctionImport(moduleName, functionName, typeId) {
    const id = this.funcImports.length;
    this.funcImports.push({ moduleName, functionName, typeId });
    return id;
  }

  addFunctionDefinition(typeId) {
    const id = this.funcImports.length + this.funcDefs.length;
    // body: serialized bytes; wast: the function's WAST node list, set by
    // emitFunctionBody and serialized into body by emit()'s code-section
    // writer (todos/0198); fnMeta: ABI facts for the inliner, stamped with
    // the tree (todos/0201).
    this.funcDefs.push({ typeId, locals: [], body: [], wast: null, fnMeta: null });
    return id;
  }

  addMemory(minPages, maxPages) {
    const id = this.memories.length;
    this.memories.push({ minPages, maxPages: maxPages || 0 });
    return id;
  }

  // Imported globals occupy [0, globalImports.length) of the global index
  // space; defined globals sit above them. addGlobal bakes the offset into
  // the index it returns, so EVERY import must be registered before the
  // first defined global — enforced here, because a late import would
  // silently shift indices already burned into function bodies.
  // `nameBytes` is the import name as raw UTF-8 bytes (import names aren't
  // restricted to ASCII, and emitString's charCodeAt would mangle them).
  addGlobalImport(moduleName, nameBytes, type, isMutable) {
    if (this.globals.length > 0) {
      throw new Error("addGlobalImport: all global imports must be registered before the first defined global");
    }
    const id = this.globalImports.length;
    this.globalImports.push({ moduleName, nameBytes, type, isMutable });
    return id;
  }

  addGlobal(type, initExpr, isMutable) {
    const id = this.globalImports.length + this.globals.length;
    this.globals.push({ type, initExpr, isMutable });
    return id;
  }

  addGlobalI32(value, isMutable) {
    const initExpr = [];
    const code = new WasmCode(initExpr);
    code.i32Const(value);
    code.end();
    return this.addGlobal(WT_I32, initExpr, isMutable);
  }

  addGlobalI64(value, isMutable) {
    const initExpr = [];
    const code = new WasmCode(initExpr);
    code.i64Const(value);
    code.end();
    return this.addGlobal(WT_I64, initExpr, isMutable);
  }

  addGlobalF32(value, isMutable) {
    const initExpr = [];
    const code = new WasmCode(initExpr);
    code.f32Const(value);
    code.end();
    return this.addGlobal(WT_F32, initExpr, isMutable);
  }

  addGlobalF64(value, isMutable) {
    const initExpr = [];
    const code = new WasmCode(initExpr);
    code.f64Const(value);
    code.end();
    return this.addGlobal(WT_F64, initExpr, isMutable);
  }

  addGlobalExternref(isMutable) {
    const initExpr = [];
    const code = new WasmCode(initExpr);
    code.refNull(0x6F);
    code.end();
    return this.addGlobal(WT_EXTERNREF, initExpr, isMutable);
  }

  patchGlobalI32(id, value) {
    const g = this.globals[id - this.globalImports.length];
    g.initExpr = [];
    const code = new WasmCode(g.initExpr);
    code.i32Const(value);
    code.end();
  }

  addExport(name, kind, index) {
    this.exports.push({ name, kind, index });
  }

  addTag(funcTypeIdx) {
    const idx = this.tags.length;
    this.tags.push({ typeIdx: funcTypeIdx });
    return idx;
  }

  addDataSegment(offset, data) {
    const offsetExpr = [];
    const code = new WasmCode(offsetExpr);
    code.i32Const(offset);
    code.end();
    this.dataSegments.push({ memoryIndex: 0, offsetExpr, data });
  }

  // Emit full WASM binary as a Uint8Array
  emit() {
    // WAST pass seam (todos/0198): must run before ANY section is written —
    // passes may add locals or types, and sections 1/3 precede the code
    // section that serializes the trees.
    WAST.runPasses(this);

    const out = [];
    // WASM magic + version
    out.push(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00);

    const emitSection = (id, content) => {
      out.push(id);
      lebU(out, content.length);
      for (const b of content) out.push(b);
    };
    const emitString = (buf, str) => {
      lebU(buf, str.length);
      for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
    };

    let buf;

    // Type section (1).
    // Strategy: don't renumber types — eager registration already places
    // mutually-recursive types at consecutive indices (registration is driven
    // by reachability: registering type T pre-reserves T's idx, then recurses
    // into its references; back edges hit the pre-reserved idx, so an SCC's
    // members end up at consecutive indices). All we do here is GROUP them
    // into rec groups based on SCC analysis. Singleton non-recursive types
    // become singleton rec groups (or bare composites for func types).
    // WASM canonicalizes minimal rec groups by structural shape, so two
    // singleton structs with identical shapes get unified — this fixes
    // cross-TU recursive type identity.
    buf = [];
    const N = this.typeDefs.length;

    // ---- Phase 1: collect reference edges ----
    const edgesOut = Array.from({length: N}, () => []);
    const collectRefs = (td) => {
      const refs = [];
      const visitWT = (wt) => {
        if (wt && wt.tag === "ref" && wt.heapIsIdx) refs.push(wt.heap);
      };
      if (td.kind === "func") {
        for (const p of td.params) visitWT(p);
        for (const r of td.results) visitWT(r);
      } else if (td.kind === "struct") {
        if (td.parentIdx !== undefined) refs.push(td.parentIdx);
        if (td.fields) for (const f of td.fields) visitWT(f.wt);
      } else if (td.kind === "array") {
        if (td.elem) visitWT(td.elem.wt);
      }
      return refs;
    };
    for (let i = 0; i < N; i++) edgesOut[i] = collectRefs(this.typeDefs[i]);

    // ---- Phase 2: Tarjan SCC (iterative to avoid call-stack blowup) ----
    const indices = new Int32Array(N).fill(-1);
    const lowlinks = new Int32Array(N);
    const onStack = new Uint8Array(N);
    const sccOf = new Int32Array(N).fill(-1);  // sccOf[v] = SCC id (in discovery order)
    const stack = [];
    let nextIdx = 0;
    let nextSccId = 0;
    for (let root = 0; root < N; root++) {
      if (indices[root] !== -1) continue;
      // Iterative DFS using explicit stack of [v, edgeIdx]
      const dfsStack = [[root, 0]];
      indices[root] = nextIdx; lowlinks[root] = nextIdx; nextIdx++;
      stack.push(root); onStack[root] = 1;
      while (dfsStack.length) {
        const frame = dfsStack[dfsStack.length - 1];
        const u = frame[0];
        const ei = frame[1];
        const out = edgesOut[u];
        if (ei < out.length) {
          frame[1] = ei + 1;
          const w = out[ei];
          if (indices[w] === -1) {
            indices[w] = nextIdx; lowlinks[w] = nextIdx; nextIdx++;
            stack.push(w); onStack[w] = 1;
            dfsStack.push([w, 0]);
          } else if (onStack[w]) {
            if (indices[w] < lowlinks[u]) lowlinks[u] = indices[w];
          }
        } else {
          dfsStack.pop();
          if (lowlinks[u] === indices[u]) {
            const sccId = nextSccId++;
            let w;
            do { w = stack.pop(); onStack[w] = 0; sccOf[w] = sccId; } while (w !== u);
          }
          if (dfsStack.length) {
            const p = dfsStack[dfsStack.length - 1][0];
            if (lowlinks[u] < lowlinks[p]) lowlinks[p] = lowlinks[u];
          }
        }
      }
    }

    // ---- Phase 3: walk typeDefs in order, group consecutive same-SCC entries ----
    // We assert (and rely on) eager registration's invariant: if v and u are
    // in the same SCC, they are at consecutive indices. So we just scan and
    // chunk by sccOf changing.
    const groups = [];  // each: [startIdx, endIdxExclusive]
    let gi = 0;
    while (gi < N) {
      const sid = sccOf[gi];
      let gj = gi + 1;
      while (gj < N && sccOf[gj] === sid) gj++;
      groups.push([gi, gj]);
      gi = gj;
    }

    // ---- Phase 4: emit ----
    const emitStorage = (s, b) => {
      if (s.packed === "i8") b.push(0x78);
      else if (s.packed === "i16") b.push(0x77);
      else wtEmit(s.wt, b);
      b.push(s.mutable ? 0x01 : 0x00);
    };
    const emitOneTypeDef = (td, b) => {
      if (td.kind === "func") {
        b.push(0x60);
        lebU(b, td.params.length);
        for (const p of td.params) wtEmit(p, b);
        lebU(b, td.results.length);
        for (const r of td.results) wtEmit(r, b);
      } else if (td.kind === "struct") {
        // Always wrap GC structs in `sub` (open, 0x50) so they can be extended.
        // Bare composite types are treated as `final` by V8.
        b.push(0x50);
        if (td.parentIdx !== undefined) { lebU(b, 1); lebU(b, td.parentIdx); }
        else lebU(b, 0);
        b.push(0x5F);
        lebU(b, td.fields.length);
        for (const f of td.fields) emitStorage(f, b);
      } else if (td.kind === "array") {
        b.push(0x5E);
        emitStorage(td.elem, b);
      }
    };
    // Each group becomes one rec group (even singletons — being in a rec
    // group is what enables WASM canonicalization across instances).
    lebU(buf, groups.length);
    for (const [start, end] of groups) {
      buf.push(0x4E);
      lebU(buf, end - start);
      for (let k = start; k < end; k++) emitOneTypeDef(this.typeDefs[k], buf);
    }
    emitSection(1, buf);

    // Import section (2)
    buf = [];
    lebU(buf, this.funcImports.length + this.globalImports.length);
    for (const imp of this.funcImports) {
      emitString(buf, imp.moduleName);
      emitString(buf, imp.functionName);
      buf.push(0x00); // func import kind
      lebU(buf, imp.typeId);
    }
    for (const imp of this.globalImports) {
      emitString(buf, imp.moduleName);
      lebU(buf, imp.nameBytes.length);      // raw UTF-8 name (see addGlobalImport)
      for (const b of imp.nameBytes) buf.push(b);
      buf.push(0x03); // global import kind
      wtEmit(imp.type, buf);
      buf.push(imp.isMutable ? 0x01 : 0x00);
    }
    emitSection(2, buf);

    // Function section (3)
    buf = [];
    lebU(buf, this.funcDefs.length);
    for (const def of this.funcDefs) lebU(buf, def.typeId);
    emitSection(3, buf);

    // Table section (4). With a tree-shake tableLayout the size is the
    // PRE-shake function count + 1 — baked function-pointer constants
    // (old slots) must stay in range even though the slots are null.
    buf = [];
    const totalFuncs = this.funcImports.length + this.funcDefs.length;
    const tableSize = this.tableLayout ? this.tableLayout.size : totalFuncs + 1;
    lebU(buf, 1); buf.push(0x70); buf.push(0x00); lebU(buf, tableSize);
    emitSection(4, buf);

    // Memory section (5)
    buf = [];
    lebU(buf, this.memories.length);
    for (const mem of this.memories) {
      const hasMax = mem.maxPages !== 0;
      buf.push(hasMax ? 0x01 : 0x00);
      lebU(buf, mem.minPages);
      if (hasMax) lebU(buf, mem.maxPages);
    }
    emitSection(5, buf);

    // Tag section (13) - before globals
    if (this.tags.length > 0) {
      buf = [];
      lebU(buf, this.tags.length);
      for (const tag of this.tags) { buf.push(0x00); lebU(buf, tag.typeIdx); }
      emitSection(13, buf);
    }

    // Global section (6)
    buf = [];
    lebU(buf, this.globals.length);
    for (const g of this.globals) {
      wtEmit(g.type, buf);
      buf.push(g.isMutable ? 0x01 : 0x00);
      for (const b of g.initExpr) buf.push(b);
    }
    emitSection(6, buf);

    // Export section (7)
    buf = [];
    lebU(buf, this.exports.length);
    for (const exp of this.exports) {
      emitString(buf, exp.name);
      buf.push(exp.kind);
      lebU(buf, exp.index);
    }
    emitSection(7, buf);

    // Element section (9). Identity map (table[i+1] = func i) — or, after
    // a tree-shake, one active segment per surviving run: original slots,
    // remapped function indices, holes (null slots) where deleted
    // functions sat (todos/0214).
    buf = [];
    if (this.tableLayout) {
      const segs = this.tableLayout.segments;
      lebU(buf, segs.length);
      for (const seg of segs) {
        lebU(buf, 0);
        buf.push(0x41); lebI(buf, seg.slot); buf.push(0x0B);
        lebU(buf, seg.funcs.length);
        for (const fi of seg.funcs) lebU(buf, fi);
      }
    } else if (totalFuncs > 0) {
      lebU(buf, 1); lebU(buf, 0);
      buf.push(0x41); lebI(buf, 1); buf.push(0x0B);
      lebU(buf, totalFuncs);
      for (let i = 0; i < totalFuncs; i++) lebU(buf, i);
    } else {
      lebU(buf, 0);
    }
    emitSection(9, buf);

    // Code section (10)
    buf = [];
    lebU(buf, this.funcDefs.length);
    var funcBodyOffsets = [];
    for (var fi = 0; fi < this.funcDefs.length; fi++) {
      const def = this.funcDefs[fi];
      const funcBody = [];
      lebU(funcBody, def.locals.length);
      for (const loc of def.locals) {
        lebU(funcBody, loc.count);
        wtEmit(loc.type, funcBody);
      }
      var preambleSize = funcBody.length;
      // Function bodies arrive as WAST node lists (todos/0198); serialize
      // here — after runPasses — appending into def.body. Source-map
      // entries are recorded now (byte offsets exist only at serialize
      // time); the rebasing below sorts by absolute offset, so push order
      // doesn't matter. def.body without a tree is the raw-bytes path
      // (kept for hand-built bodies).
      if (def.wast) {
        const smEntries = [];
        WAST.serialize(def.wast, def.body, {
          onSrcLoc: (offset, fileIdx, line) => {
            smEntries.push({ offset: offset, fileIdx: fileIdx, line: line });
          },
        });
        def.wast = null;
        if (smEntries.length > 0) {
          this.sourceMapEntries.push({ funcIdx: fi, entries: smEntries });
        }
      }
      for (const b of def.body) funcBody.push(b);
      funcBody.push(0x0B); // end
      var sizeFieldStart = buf.length;
      lebU(buf, funcBody.length);
      var sizeFieldLen = buf.length - sizeFieldStart;
      funcBodyOffsets.push({ sectionRelOffset: buf.length + preambleSize });
      for (const b of funcBody) buf.push(b);
    }
    var codeSectionContentStart = out.length + 1 + lebSize(buf.length);
    emitSection(10, buf);

    // Data section (11)
    buf = [];
    lebU(buf, this.dataSegments.length);
    for (const seg of this.dataSegments) {
      lebU(buf, seg.memoryIndex);
      for (const b of seg.offsetExpr) buf.push(b);
      lebU(buf, seg.data.length);
      for (const b of seg.data) buf.push(b);
    }
    emitSection(11, buf);

    // Name custom section (0)
    if (this.funcNames.length > 0 || this.globalNames.length > 0 || this.localNames.length > 0 ||
        this.typeNames.length > 0 || this.fieldNames.length > 0) {
      buf = [];
      emitString(buf, "name");
      if (this.funcNames.length > 0) {
        const sub = [];
        lebU(sub, this.funcNames.length);
        for (const entry of this.funcNames) {
          lebU(sub, entry.idx);
          emitString(sub, entry.name);
        }
        buf.push(0x01);
        lebU(buf, sub.length);
        for (const b of sub) buf.push(b);
      }
      if (this.localNames.length > 0) {
        const sub = [];
        lebU(sub, this.localNames.length);
        for (const fn of this.localNames) {
          lebU(sub, fn.funcIdx);
          lebU(sub, fn.locals.length);
          for (const loc of fn.locals) {
            lebU(sub, loc.idx);
            emitString(sub, loc.name);
          }
        }
        buf.push(0x02);
        lebU(buf, sub.length);
        for (const b of sub) buf.push(b);
      }
      // Subsection 4: type names
      if (this.typeNames.length > 0) {
        const sub = [];
        // Sort by idx so the namemap is in ascending order (some tools require this)
        const sorted = this.typeNames.slice().sort((a, b) => a.idx - b.idx);
        lebU(sub, sorted.length);
        for (const entry of sorted) {
          lebU(sub, entry.idx);
          emitString(sub, entry.name);
        }
        buf.push(0x04);
        lebU(buf, sub.length);
        for (const b of sub) buf.push(b);
      }
      if (this.globalNames.length > 0) {
        const sub = [];
        lebU(sub, this.globalNames.length);
        for (const entry of this.globalNames) {
          lebU(sub, entry.idx);
          emitString(sub, entry.name);
        }
        buf.push(0x07);
        lebU(buf, sub.length);
        for (const b of sub) buf.push(b);
      }
      // Subsection 10: field names (indirect namemap)
      if (this.fieldNames.length > 0) {
        const sub = [];
        const sorted = this.fieldNames.slice().sort((a, b) => a.typeIdx - b.typeIdx);
        lebU(sub, sorted.length);
        for (const entry of sorted) {
          lebU(sub, entry.typeIdx);
          lebU(sub, entry.fields.length);
          for (const f of entry.fields) {
            lebU(sub, f.idx);
            emitString(sub, f.name);
          }
        }
        buf.push(0x0A);
        lebU(buf, sub.length);
        for (const b of sub) buf.push(b);
      }
      emitSection(0, buf);
    }

    // c.sourcemap custom section
    if (this.sourceMapEntries.length > 0) {
      buf = [];
      emitString(buf, "c.sourcemap");
      // File table
      lebU(buf, this.sourceMapFiles.length);
      for (const f of this.sourceMapFiles) emitString(buf, f);
      // Flatten all entries with absolute offsets
      var allEntries = [];
      for (const fse of this.sourceMapEntries) {
        var baseOffset = codeSectionContentStart + funcBodyOffsets[fse.funcIdx].sectionRelOffset;
        for (const e of fse.entries) {
          allEntries.push({ offset: baseOffset + e.offset, fileIdx: e.fileIdx, line: e.line });
        }
      }
      allEntries.sort((a, b) => a.offset - b.offset);
      // Delta-encoded entries
      lebU(buf, allEntries.length);
      var prevOffset = 0, prevFile = 0, prevLine = 0;
      for (var i = 0; i < allEntries.length; i++) {
        var e = allEntries[i];
        if (i === 0) {
          lebU(buf, e.offset);
          lebU(buf, e.fileIdx);
          lebU(buf, e.line);
        } else {
          lebU(buf, e.offset - prevOffset);
          lebI(buf, e.fileIdx - prevFile);
          lebI(buf, e.line - prevLine);
        }
        prevOffset = e.offset;
        prevFile = e.fileIdx;
        prevLine = e.line;
      }
      emitSection(0, buf);
    }

    // c.sources custom section (-g2: embed source files)
    if (this.embeddedSources) {
      buf = [];
      emitString(buf, "c.sources");
      var json = JSON.stringify(this.embeddedSources);
      for (var i = 0; i < json.length; i++) {
        var code = json.charCodeAt(i);
        if (code < 0x80) { buf.push(code); }
        else if (code < 0x800) { buf.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F)); }
        else { buf.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)); }
      }
      emitSection(0, buf);
    }

    return new Uint8Array(out);
  }
}

// ====================
// Code Generator
// ====================

const EXPR_VALUE = "value";
const EXPR_DROP = "drop";

const LV_REGISTER = "register";
const LV_MEMORY = "memory";
const LV_GC_STRUCT_FIELD = "gc_struct_field";
const LV_GC_ARRAY_ELEM = "gc_array_elem";
const LV_ADDR_LOCAL = "addr_local";
const LV_ADDR_STATIC = "addr_static";
const LV_ADDR_FRAME = "addr_frame";

function isStructOrUnion(type) {
  return type.isAggregate() && !type.isArray();
}

function cToWasmType(type, wmod) {
  type = type.removeQualifiers();
  if (type === Types.TEXTERNREF) return WT_EXTERNREF;
  if (type === Types.TREFEXTERN) return WT_REFEXTERN;
  if (type === Types.TEQREF) return WT_EQREF;
  if (type.isWasmGCType()) {
    if (!wmod) throw new Error(`cToWasmType: GC type '${type.toString()}' requires wmod for registration`);
    return WT_GCREF(getOrCreateGCWasmTypeIdx(wmod, type), true);
  }
  if (type === Types.TFLOAT) return WT_F32;
  if (type === Types.TDOUBLE || type === Types.TLDOUBLE) return WT_F64;
  if (type === Types.TLLONG || type === Types.TULLONG) return WT_I64;
  return WT_I32;
}

function gcStorageTypeOf(wmod, t) {
  const ut = t.removeQualifiers();
  if (ut === Types.TCHAR || ut === Types.TSCHAR || ut === Types.TUCHAR || ut === Types.TBOOL) {
    return { wt: WT_I32, mutable: true, packed: "i8" };
  }
  if (ut === Types.TSHORT || ut === Types.TUSHORT) {
    return { wt: WT_I32, mutable: true, packed: "i16" };
  }
  return { wt: cToWasmType(t, wmod), mutable: true, packed: null };
}

// Cache key for a single WASM value type (numeric or ref).
function wtKey(wt) {
  if (wt.tag === "ref") return `ref:${wt.nullable?1:0}:${wt.heapIsIdx?'i':'h'}:${wt.heap}`;
  return `${wt.tag}:${wt.num||''}`;
}

// Cache key for a struct field / array elem storage type. Mutability is always
// true today; packed encoding distinguishes i8/i16 from i32 (signedness does
// not affect WASM storage, so it's intentionally not part of the key).
function gcStorageKey(s) {
  const tag = s.packed ? s.packed : wtKey(s.wt);
  return s.mutable ? tag : tag + ":imm";
}

// Helpers used by codegen to choose struct.get/array.get variants for packed fields.
function isSignedSubI32(t) {
  const ut = t.removeQualifiers();
  return ut === Types.TCHAR || ut === Types.TSCHAR || ut === Types.TSHORT;
}
function isPackedSubI32(t) {
  const ut = t.removeQualifiers();
  return ut === Types.TCHAR || ut === Types.TSCHAR || ut === Types.TUCHAR ||
         ut === Types.TBOOL || ut === Types.TSHORT || ut === Types.TUSHORT;
}

// Register a GC TypeInfo into the WasmModule and return its WASM type index.
// Deps are registered FIRST (so they get lower indices). Cycles are detected
// via a per-wmod "in-progress" set: if recursion re-enters a type currently
// being processed, we pre-reserve a placeholder idx so the cyclic ref has
// something to point at. SCC members end up at consecutive indices.
//
// Structural dedup happens BEFORE reservation — we compute the structural
// key from already-registered deps, then check the cache. If hit, no idx
// is reserved (no zombie typeDefs). If miss, reserve and populate.
// Compiler-internal box struct registry. For boxing primitives into __eqref,
// we need a dedicated GC struct type per primitive. We make the field IMMUTABLE
// so these boxes don't structurally collide with user-defined mutable structs
// of the same shape (preserving __ref_test discrimination).
function getOrCreateBoxStructIdx(wmod, primWt) {
  const fields = [{ wt: primWt, mutable: false, packed: null }];
  const key = 'S(' + fields.map(gcStorageKey).join(',') + ')';
  if (wmod.gcStructTypeIndices.has(key)) return wmod.gcStructTypeIndices.get(key);
  const idx = wmod.reserveGCStructTypeId();
  wmod.setGCStructFields(idx, fields);
  wmod.gcStructTypeIndices.set(key, idx);
  const name = primWt === WT_I64 ? '__Box_i64' : primWt === WT_F64 ? '__Box_f64' : '__Box';
  wmod.typeNames.push({ idx, name });
  wmod.fieldNames.push({ typeIdx: idx, fields: [{ idx: 0, name: 'v' }] });
  return idx;
}

// Map a numeric C type to the wasm storage type used for its box.
// Only two box types: __Box_i64 (all integers) and __Box_f64 (all floats).
// This lets cross-width unboxing work within the same category
// (e.g. box a float, unbox as double).
function boxStorageWtFor(type) {
  type = type.removeQualifiers();
  if (type === Types.TFLOAT || type === Types.TDOUBLE || type === Types.TLDOUBLE) return WT_F64;
  if (type.isInteger()) return WT_I64;
  return null;
}

function getOrCreateGCWasmTypeIdx(wmod, type) {
  type = type.removeQualifiers();
  // Normalize struct ref form to heap form — wasm type idx lives on the heap.
  if (type.isGCStruct()) type = type.baseType;
  const cached = wmod.gcTypeIdxByType.get(type);
  if (cached !== undefined) return cached;

  if (!wmod._gcInProgress) wmod._gcInProgress = new Set();
  if (!wmod._gcPendingIdx) wmod._gcPendingIdx = new Map();

  if (wmod._gcInProgress.has(type)) {
    // Cycle — must reserve a placeholder so the recursive ref resolves.
    let pending = wmod._gcPendingIdx.get(type);
    if (pending === undefined) {
      pending = type.isGCStructHeap()
        ? wmod.reserveGCStructTypeId()
        : wmod.reserveGCArrayTypeId();
      wmod._gcPendingIdx.set(type, pending);
    }
    return pending;
  }

  wmod._gcInProgress.add(type);

  let idx;
  if (type.isGCStructHeap()) {
    if (!type.isComplete) {
      wmod._gcInProgress.delete(type);
      throw new Error(`Cannot use incomplete GC struct '${type.tagName}'`);
    }
    // Register deps (parent + field types) first.
    const parentIdx = type.parentType ? getOrCreateGCWasmTypeIdx(wmod, type.parentType) : -1;
    const fields = type.tagDecl.members.map(m => gcStorageTypeOf(wmod, m.type));
    const key = 'S(' + (parentIdx >= 0 ? `p${parentIdx},` : '') +
                fields.map(gcStorageKey).join(',') + ')';
    const pending = wmod._gcPendingIdx.get(type);
    if (pending !== undefined) {
      // Cyclic: must use the pre-reserved placeholder. Cache it under the
      // structural key, but a future identical type with NO cycle won't
      // dedup against this (its own key would include a different
      // placeholder idx) — that's fine, WASM rec-group canonicalization
      // handles the cross-canonical-form unification at instantiation.
      idx = pending;
      wmod._gcPendingIdx.delete(type);
      wmod.gcTypeIdxByType.set(type, idx);
      wmod.setGCStructFields(idx, fields, parentIdx);
      if (!wmod.gcStructTypeIndices.has(key)) wmod.gcStructTypeIndices.set(key, idx);
      if (type.tagName && !type.tagName.startsWith('__anon_gc_')) {
        wmod.typeNames.push({ idx, name: type.tagName });
        const fieldEntries = [];
        for (let i = 0; i < type.tagDecl.members.length; i++) {
          const m = type.tagDecl.members[i];
          if (m.name) fieldEntries.push({ idx: i, name: m.name });
        }
        if (fieldEntries.length > 0) wmod.fieldNames.push({ typeIdx: idx, fields: fieldEntries });
      }
    } else if (wmod.gcStructTypeIndices.has(key)) {
      // Cache hit, no reservation needed — no zombie typeDef.
      idx = wmod.gcStructTypeIndices.get(key);
      wmod.gcTypeIdxByType.set(type, idx);
    } else {
      idx = wmod.reserveGCStructTypeId();
      wmod.gcTypeIdxByType.set(type, idx);
      wmod.setGCStructFields(idx, fields, parentIdx);
      wmod.gcStructTypeIndices.set(key, idx);
      // Record names for the name custom section. First struct registered with
      // this shape wins the name (subsequent dedupe-hit registrations don't
      // override). Anonymous tags (`__anon_gc_*`) are skipped — those are
      // compiler-internal and don't help debuggers.
      if (type.tagName && !type.tagName.startsWith('__anon_gc_')) {
        wmod.typeNames.push({ idx, name: type.tagName });
        const fieldEntries = [];
        for (let i = 0; i < type.tagDecl.members.length; i++) {
          const m = type.tagDecl.members[i];
          if (m.name) fieldEntries.push({ idx: i, name: m.name });
        }
        if (fieldEntries.length > 0) wmod.fieldNames.push({ typeIdx: idx, fields: fieldEntries });
      }
    }
  } else if (type.isGCArray()) {
    const elem = gcStorageTypeOf(wmod, type.baseType);
    const key = 'A(' + gcStorageKey(elem) + ')';
    const pending = wmod._gcPendingIdx.get(type);
    if (pending !== undefined) {
      idx = pending;
      wmod._gcPendingIdx.delete(type);
      wmod.gcTypeIdxByType.set(type, idx);
      wmod.setGCArrayElem(idx, elem);
      if (!wmod.gcArrayTypeIndices.has(key)) wmod.gcArrayTypeIndices.set(key, idx);
    } else if (wmod.gcArrayTypeIndices.has(key)) {
      idx = wmod.gcArrayTypeIndices.get(key);
      wmod.gcTypeIdxByType.set(type, idx);
    } else {
      idx = wmod.reserveGCArrayTypeId();
      wmod.gcTypeIdxByType.set(type, idx);
      wmod.setGCArrayElem(idx, elem);
      wmod.gcArrayTypeIndices.set(key, idx);
    }
  } else {
    wmod._gcInProgress.delete(type);
    throw new Error(`getOrCreateGCWasmTypeIdx: not a GC type: ${type.toString()}`);
  }

  wmod._gcInProgress.delete(type);
  return idx;
}

function vaSlotSize(type) {
  const sz = type.size;
  return (sz + 7) & ~7;
}

// ── Shared constant-expression evaluator ────────────────────────────────────
// Used by both the default backend and the GUC backend. Walks an Expr tree
// and either returns a value descriptor:
//   { kind: "int",   intVal: BigInt }
//   { kind: "float", floatVal: Number }
//   { kind: "addr",  addrVal: Number }
// or null when the expression is not a constant.
//
// The `policy` argument resolves the four kinds of address LEAVES the C
// language allows in a constant expression — string literals, global
// variables, function pointers, and file-scope compound literals — to a
// numeric address. The default backend supplies concrete addresses
// (translation-time-known); the GUC backend supplies a null-policy because
// its addresses are not numbers — they're deferred IR tokens (MutableBytesAddr,
// FuncIndex) substituted at codegen-time. Returning null from a leaf simply
// causes that branch to evaluate to null, so the integer / float / sizeof /
// arithmetic / ternary / cast subset still works for both backends.
//
// Policy interface (each method returns a number or null):
//   getStringAddr(uint8Array)    — address of a string literal
//   getGlobalAddr(varDecl)       — address of a global variable's storage
//   getFuncAddr(funcDef)         — funcref-table index of a function
//   getCompoundLitAddr(expr)     — address of a file-scope compound literal
const NULL_ADDR_POLICY = {
  getStringAddr: () => null,
  getGlobalAddr: () => null,
  getFuncAddr: () => null,
  getCompoundLitAddr: () => null,
};

function constEvalAddr(expr, policy) {
  if (!expr) return null;
  // Decay wraps an array/function lvalue with the decayed pointer type;
  // its address-of value is the operand's base address.
  if (expr instanceof AST.EDecay) return constEvalAddr(expr.operand, policy);
  // Cast from integer to pointer: (type*)intval
  if (expr instanceof AST.ECast || expr instanceof AST.EImplicitCast) {
    const inner = constEvalExpr(expr.expr, policy);
    if (inner && inner.kind === "int") return Number(inner.intVal);
    if (inner && inner.kind === "addr") return inner.addrVal;
    return null;
  }
  // Arrow: base->member → addr(base) + offset, where base is pointer
  if (expr instanceof AST.EArrow) {
    const baseVal = constEvalExpr(expr.base, policy);
    if (baseVal && (baseVal.kind === "addr" || baseVal.kind === "int")) {
      const baseAddr = baseVal.kind === "addr" ? baseVal.addrVal : Number(baseVal.intVal);
      return baseAddr + expr.memberDecl.byteOffset;
    }
    return null;
  }
  // Member lvalue: base.member → addr(base) + offset. Needed for nested
  // chains like &g.inner.field — the OP_ADDR case peels one member and
  // recurses here with the inner EMember as the base; without this the
  // chain fell through to constEvalExpr (which has no EMember case) and
  // the initializer silently became 0 (found via micropython's
  // MP_STATE_VM(...) ROM tables: &mp_state_ctx.vm.mp_sys_argv_obj).
  if (expr instanceof AST.EMember) {
    const baseAddr = constEvalAddr(expr.base, policy);
    if (baseAddr !== null) return baseAddr + expr.memberDecl.byteOffset;
    return null;
  }
  // Subscript lvalue: base[idx] → addr(base) + idx * elemSize, for
  // chains like &g.arr[2].field.
  if (expr instanceof AST.ESubscript) {
    const baseAddr = constEvalAddr(expr.array, policy);
    const idx = constEvalExpr(expr.index, policy);
    if (baseAddr !== null && idx && idx.kind === "int") {
      return baseAddr + Number(idx.intVal) * expr.type.size;
    }
    return null;
  }
  // General: try constEvalExpr and extract address
  const v = constEvalExpr(expr, policy);
  if (v && v.kind === "addr") return v.addrVal;
  if (v && v.kind === "int") return Number(v.intVal);
  return null;
}

function constEvalExpr(expr, policy) {
  if (!expr) return null;
  switch (expr.constructor) {
    case AST.EInt: return { kind: "int", intVal: expr.value };
    case AST.EFloat: return { kind: "float", floatVal: expr.value };
    case AST.EString: {
      const addr = policy.getStringAddr(expr.value);
      if (addr === null || addr === undefined) return null;
      return { kind: "addr", addrVal: addr };
    }
    case AST.EIdent: {
      if (expr.decl && expr.decl instanceof AST.DEnumConst) {
        return { kind: "int", intVal: BigInt(expr.decl.value) };
      }
      if (expr.decl && expr.decl instanceof AST.DFunc) {
        const func = expr.decl.definition || expr.decl;
        const tIdx = policy.getFuncAddr(func);
        if (tIdx !== null && tIdx !== undefined) return { kind: "addr", addrVal: tIdx };
      }
      if (expr.decl && expr.decl instanceof AST.DVar) {
        const varDecl = expr.decl.definition || expr.decl;
        const addr = policy.getGlobalAddr(varDecl);
        if (addr !== null && addr !== undefined) return { kind: "addr", addrVal: addr };
      }
      return null;
    }
    case AST.EUnary: {
      if (expr.op === "OP_ADDR") {
        const inner = expr.operand;
        // &var → address
        if (inner instanceof AST.EIdent && inner.decl) {
          if (inner.decl instanceof AST.DVar) {
            const varDecl = inner.decl.definition || inner.decl;
            const addr = policy.getGlobalAddr(varDecl);
            if (addr !== null && addr !== undefined) return { kind: "addr", addrVal: addr };
          }
          if (inner.decl instanceof AST.DFunc) {
            const func = inner.decl.definition || inner.decl;
            const tIdx = policy.getFuncAddr(func);
            if (tIdx !== null && tIdx !== undefined) return { kind: "addr", addrVal: tIdx };
          }
        }
        // &(base->member) or &(base.member) → base_addr + member offset
        if (inner instanceof AST.EArrow || inner instanceof AST.EMember) {
          const baseAddr = constEvalAddr(inner.base, policy);
          if (baseAddr !== null) {
            return { kind: "addr", addrVal: baseAddr + inner.memberDecl.byteOffset };
          }
        }
        // &(base[index]) → base_addr + index * elemSize
        if (inner instanceof AST.ESubscript) {
          const baseAddr = constEvalAddr(inner.array, policy);
          const idx = constEvalExpr(inner.index, policy);
          if (baseAddr !== null && idx && idx.kind === "int") {
            const elemSize = inner.type.size;
            return { kind: "addr", addrVal: baseAddr + Number(idx.intVal) * elemSize };
          }
        }
        // &(compound_literal) → address of file-scope compound literal
        if (inner instanceof AST.ECompoundLiteral) {
          const addr = policy.getCompoundLitAddr(inner);
          if (addr !== null && addr !== undefined) return { kind: "addr", addrVal: addr };
        }
        return null;
      }
      const v = constEvalExpr(expr.operand, policy);
      if (!v) return null;
      if (expr.op === "OP_POS") return v;
      if (expr.op === "OP_NEG") {
        if (v.kind === "int") return { kind: "int", intVal: Types.truncateConstInt(-v.intVal, expr.type) };
        if (v.kind === "float") return { kind: "float", floatVal: -v.floatVal };
      }
      if (expr.op === "OP_BNOT") {
        if (v.kind === "int") return { kind: "int", intVal: Types.truncateConstInt(~v.intVal, expr.type) };
      }
      if (expr.op === "OP_LNOT") {
        if (v.kind === "int") return { kind: "int", intVal: v.intVal === 0n ? 1n : 0n };
        if (v.kind === "float") return { kind: "int", intVal: v.floatVal === 0.0 ? 1n : 0n };
      }
      return null;
    }
    case AST.EBinary: {
      // Short-circuit LAND/LOR
      if (expr.op === "LAND") {
        const l = constEvalExpr(expr.left, policy);
        if (!l) return null;
        const lv = l.kind === "int" ? l.intVal : l.kind === "float" ? (l.floatVal !== 0.0 ? 1n : 0n) : null;
        if (lv === null) return null;
        if (lv === 0n) return { kind: "int", intVal: 0n };
        const r = constEvalExpr(expr.right, policy);
        if (!r) return null;
        const rv = r.kind === "int" ? r.intVal : r.kind === "float" ? (r.floatVal !== 0.0 ? 1n : 0n) : null;
        if (rv === null) return null;
        return { kind: "int", intVal: rv !== 0n ? 1n : 0n };
      }
      if (expr.op === "LOR") {
        const l = constEvalExpr(expr.left, policy);
        if (!l) return null;
        const lv = l.kind === "int" ? l.intVal : l.kind === "float" ? (l.floatVal !== 0.0 ? 1n : 0n) : null;
        if (lv === null) return null;
        if (lv !== 0n) return { kind: "int", intVal: 1n };
        const r = constEvalExpr(expr.right, policy);
        if (!r) return null;
        const rv = r.kind === "int" ? r.intVal : r.kind === "float" ? (r.floatVal !== 0.0 ? 1n : 0n) : null;
        if (rv === null) return null;
        return { kind: "int", intVal: rv !== 0n ? 1n : 0n };
      }
      const l = constEvalExpr(expr.left, policy);
      const r = constEvalExpr(expr.right, policy);
      if (!l || !r) return null;
      // Check for address arithmetic first
      const hasAddr = (l.kind === "addr" || r.kind === "addr");
      const hasFloat = (l.kind === "float" || r.kind === "float");
      if (!hasAddr && !hasFloat && l.kind === "int" && r.kind === "int") {
        const lv = l.intVal, rv = r.intVal;
        let result;
        switch (expr.op) {
          case "ADD": result = lv + rv; break;
          case "SUB": result = lv - rv; break;
          case "MUL": result = lv * rv; break;
          case "DIV": result = rv === 0n ? null : lv / rv; break;
          case "MOD": result = rv === 0n ? null : lv % rv; break;
          case "BAND": result = lv & rv; break;
          case "BOR": result = lv | rv; break;
          case "BXOR": result = lv ^ rv; break;
          // Out-of-range shift counts are UB and would blow up BigInt —
          // decline to fold and let runtime semantics stand.
          case "SHL": result = (rv < 0n || rv >= 64n) ? null : lv << rv; break;
          case "SHR": result = (rv < 0n || rv >= 64n) ? null : lv >> rv; break;
          case "EQ": result = lv === rv ? 1n : 0n; break;
          case "NE": result = lv !== rv ? 1n : 0n; break;
          case "LT": result = lv < rv ? 1n : 0n; break;
          case "GT": result = lv > rv ? 1n : 0n; break;
          case "LE": result = lv <= rv ? 1n : 0n; break;
          case "GE": result = lv >= rv ? 1n : 0n; break;
          default: return null;
        }
        if (result === null) return null;
        // Wrap to the expression's C type so every intermediate agrees
        // with runtime arithmetic (no-op for pointer-typed expressions).
        return { kind: "int", intVal: Types.truncateConstInt(result, expr.type) };
      }
      if (!hasAddr && hasFloat) {
        const lv = l.kind === "float" ? l.floatVal : Number(l.intVal);
        const rv = r.kind === "float" ? r.floatVal : Number(r.intVal);
        // f32-typed arithmetic must round each operation to f32, exactly
        // like the runtime's f32 instructions.
        const round = expr.type.removeQualifiers() === Types.TFLOAT ? Math.fround : (x) => x;
        switch (expr.op) {
          case "ADD": return { kind: "float", floatVal: round(lv + rv) };
          case "SUB": return { kind: "float", floatVal: round(lv - rv) };
          case "MUL": return { kind: "float", floatVal: round(lv * rv) };
          case "DIV": return { kind: "float", floatVal: round(lv / rv) }; // IEEE 754: div by zero = infinity
          case "EQ": return { kind: "int", intVal: lv === rv ? 1n : 0n };
          case "NE": return { kind: "int", intVal: lv !== rv ? 1n : 0n };
          case "LT": return { kind: "int", intVal: lv < rv ? 1n : 0n };
          case "GT": return { kind: "int", intVal: lv > rv ? 1n : 0n };
          case "LE": return { kind: "int", intVal: lv <= rv ? 1n : 0n };
          case "GE": return { kind: "int", intVal: lv >= rv ? 1n : 0n };
          default: return null;
        }
      }
      if (hasAddr) {
        // addr + int, addr - int (pointer arithmetic: scale by pointee size)
        if (l.kind === "addr" && r.kind === "int" && (expr.op === "ADD" || expr.op === "SUB")) {
          const elemType = AST.pointerArithElemType(expr.left.type, expr.right.type);
          const elemSize = elemType ? elemType.sizeofResult() : 1;  // void*: gcc ext, 1; empty struct: 0
          const offset = Number(r.intVal) * elemSize;
          return { kind: "addr", addrVal: expr.op === "ADD" ? l.addrVal + offset : l.addrVal - offset };
        }
        // int + addr
        if (r.kind === "addr" && l.kind === "int" && expr.op === "ADD") {
          const elemType = AST.pointerArithElemType(expr.left.type, expr.right.type);
          const elemSize = elemType ? elemType.sizeofResult() : 1;  // void*: gcc ext, 1; empty struct: 0
          return { kind: "addr", addrVal: r.addrVal + Number(l.intVal) * elemSize };
        }
        // addr - addr (pointer difference)
        if (l.kind === "addr" && r.kind === "addr" && expr.op === "SUB") {
          const elemType = AST.pointerArithElemType(expr.left.type, expr.right.type);
          const elemSize = elemType ? elemType.sizeofResult() : 1;  // void*: gcc ext, 1
          // Stride 0 (empty-struct pointee): the difference is 0 (gcc/clang).
          if (elemSize === 0) return { kind: "int", intVal: 0n };
          return { kind: "int", intVal: BigInt(Math.trunc((l.addrVal - r.addrVal) / elemSize)) };
        }
        // addr comparisons
        if (l.kind === "addr" && r.kind === "addr") {
          switch (expr.op) {
            case "EQ": return { kind: "int", intVal: l.addrVal === r.addrVal ? 1n : 0n };
            case "NE": return { kind: "int", intVal: l.addrVal !== r.addrVal ? 1n : 0n };
            case "LT": return { kind: "int", intVal: l.addrVal < r.addrVal ? 1n : 0n };
            case "GT": return { kind: "int", intVal: l.addrVal > r.addrVal ? 1n : 0n };
            case "LE": return { kind: "int", intVal: l.addrVal <= r.addrVal ? 1n : 0n };
            case "GE": return { kind: "int", intVal: l.addrVal >= r.addrVal ? 1n : 0n };
          }
        }
      }
      return null;
    }
    case AST.ETernary: {
      const cond = constEvalExpr(expr.condition, policy);
      if (!cond) return null;
      let cv;
      if (cond.kind === "int") cv = cond.intVal !== 0n;
      else if (cond.kind === "float") cv = cond.floatVal !== 0.0;
      else return null;
      return constEvalExpr(cv ? expr.thenExpr : expr.elseExpr, policy);
    }
    case AST.ECast:
    case AST.EImplicitCast: {
      const v = constEvalExpr(expr.expr, policy);
      if (!v) return null;
      const t = expr.type.removeQualifiers();
      // Scalar conversions follow C11 6.3.1, matching the front end's
      // ConstEval.convert exactly: _Bool tests != 0 before truncating,
      // (float) re-rounds to f32, (long double) is a real conversion,
      // float→int saturates like the wasm runtime's trunc_sat. These items
      // carry no C type, but their BigInt/number values are already in
      // correct signed magnitude, so value-based conversion is exact.
      if (t === Types.TBOOL) {
        const truthy = v.kind === "int" ? v.intVal !== 0n
                     : v.kind === "float" ? v.floatVal !== 0 : null;
        if (truthy === null) return v; // addr → bool: leave for the caller
        return { kind: "int", intVal: truthy ? 1n : 0n };
      }
      if (t.isFloatingPoint() && (v.kind === "int" || v.kind === "float")) {
        let x = v.kind === "int" ? Number(v.intVal) : v.floatVal;
        if (t === Types.TFLOAT) x = Math.fround(x);
        return { kind: "float", floatVal: x };
      }
      if ((t.isInteger() || t.isPointer()) && v.kind === "int") {
        return { kind: "int", intVal: Types.truncateConstInt(v.intVal, t) };
      }
      if (t.isInteger() && v.kind === "float") {
        return { kind: "int", intVal: ConstEval.saturatingTruncToInt(v.floatVal, t) };
      }
      return v;
    }
    case AST.ESizeofExpr: return { kind: "int", intVal: BigInt(expr.expr.type.sizeofResult()) };
    case AST.ESizeofType: return { kind: "int", intVal: BigInt(expr.operandType.sizeofResult()) };
    case AST.EAlignofExpr: return { kind: "int", intVal: BigInt(expr.expr.type.align) };
    case AST.EAlignofType: return { kind: "int", intVal: BigInt(expr.operandType.align) };
    case AST.ECompoundLiteral: {
      // For scalar compound literals like (int){42}, extract the value
      if (!expr.type.isAggregate() && !expr.type.isArray() && expr.initList &&
          expr.initList.elements.length > 0) {
        return constEvalExpr(expr.initList.elements[0], policy);
      }
      // For aggregate/array compound literals, return the address
      const addr = policy.getCompoundLitAddr(expr);
      if (addr !== null && addr !== undefined) return { kind: "addr", addrVal: addr };
      return null;
    }
    case AST.EDecay: {
      // Bare identifiers (globals, functions) and string literals resolve
      // directly as values. Member/subscript array lvalues (`s.b`,
      // `t.inner.m`, `r.rows[1]` — todos/0220) have no value case; their
      // decay IS the address of the first element, which constEvalAddr
      // already resolves for the &s.b[k] spelling — so both spellings fold
      // through the same addr arithmetic.
      const v = constEvalExpr(expr.operand, policy);
      if (v) return v;
      const addr = constEvalAddr(expr.operand, policy);
      if (addr === null || addr === undefined) return null;
      return { kind: "addr", addrVal: addr };
    }
    case AST.EMember:
    case AST.EArrow:
    case AST.ESubscript: {
      // An ARRAY-typed lvalue used as a value is an implicit array-to-
      // pointer decay — init-list elements carry no EDecay wrapper
      // (normalizeInitList doesn't insert one), so `int *p[1] = {s.b};`
      // lands here raw (todos/0220). Non-array lvalues stay non-constant:
      // a global's STORED value is runtime state, not a constant.
      if (!expr.type.isArray()) return null;
      const addr = constEvalAddr(expr, policy);
      if (addr === null || addr === undefined) return null;
      return { kind: "addr", addrVal: addr };
    }
    default: return null;
  }
}

function getWasmFunctionTypeIdForCFunctionType(wmod, funcType) {
  // Variadic functions use a single i32 param (arg block pointer) and no WASM return.
  if (funcType.isVarArg) {
    return wmod.addFunctionTypeId([WT_I32], []);
  }
  const params = [];
  const retType = funcType.getReturnType();
  if (isStructOrUnion(retType)) params.push(WT_I32); // hidden return ptr
  for (const pt of funcType.getParamTypes()) params.push(cToWasmType(pt, wmod));
  const results = [cToWasmType(retType, wmod)];
  return wmod.addFunctionTypeId(params, results);
}

class CodeGenerator {
  constructor(wmod, options) {
    this.wmod = wmod;
    this.compilerOptions = options?.compilerOptions || {};
    this.warningFlags = options?.warningFlags || {};
    this.writeErr = options?.writeErr
      || (typeof process !== 'undefined' && process.stderr ? (s) => process.stderr.write(s) : (s) => console.error(s));
    this.funcDefToWasmFuncIdx = new Map();
    this.funcDefToTableIdx = new Map();
    this.globalVarToWasmGlobalIdx = new Map();
    this.globalArrayAddrs = new Map();
    this.fileScopeCompoundLiteralAddrs = new Map();
    this.stackPages = 1;
    this.staticDataOffset = 0;
    this.staticData = [];
    this.stringLiteralAddrs = new Map();
    // __gcstr dedup: literal content (decoded UTF-8) → imported-global idx.
    // Populated by generateCode's pre-scan BEFORE any defined global exists.
    this.gcstrGlobalIdx = new Map();
    this.stackPointerGlobalIdx = 0;
    this.heapBaseGlobalIdx = 0;
    // Per-function state
    this.body = null;
    this.localVarToWasmLocalIdx = new Map();
    this.localArrayOffsets = new Map();
    this.paramMemoryOffsets = new Map();
    this.compoundLiteralOffsets = new Map();
    this.frameSize = 0;
    this.frameAlign = 16;
    this.frameBaseLocalIdx = -1;
    this.savedSpLocalIdx = 0;
    this.currentFuncLocals = null;
    this.nextLocalIdx = 0;
    this.freeLocalsByType = new Map();
    this.localScopeStack = [];
    this.structRetDeferred = 0;
    this.callNesting = 0;
    this.blockDepth = 0;
    this.breakTarget = 0;
    this.continueTarget = 0;
    // SLabel → blockDepth at which its block was opened. Maintained by
    // emitStmt's COMPOUND / SWITCH cases as they emit `block()`/`loop()`
    // for forward and loop labels; the GOTO case looks up the target's
    // depth and emits `br(blockDepth - targetDepth)`. Targets out of
    // scope produce a goto error appended to `gotoErrors`.
    this.gotoLabelDepths = new Map();
    this.gotoErrors = []; // {message, filename, line}
    this.exceptionToWasmTagIdx = new Map();
    this.currentFuncDef = null;
    this.vaArgsLocalIdx = 0;
    this.hasVaArgs = false;
    this.argBlockLocalIdx = 0;
    this.vaRetSlotSize = 0;
    this.vaParamInfos = [];
    this.vaStartOffset = 0;
    this.structRetPtrLocalIdx = 0;
    this.hasStructReturn = false;
    this.localIdxNames = new Map();
    // Source map tracking. sourceMapEntries ({funcIdx, entries}) are
    // produced by the code-section writer when it serializes each
    // function's WAST tree (todos/0198); codegen only places WSrcLoc
    // markers, gated on emitSrcLocMarkers.
    this.sourceMapEntries = [];
    this.sourceMapFiles = [];
    this.sourceMapFileIndex = new Map();
    this.emitSrcLocMarkers = false;
  }

  // --- Local allocator ---
  _recordSourceLoc(loc) {
    if (!loc || !this.emitSrcLocMarkers || !this.body) return;
    var fileIdx = this.sourceMapFileIndex.get(loc.filename);
    if (fileIdx === undefined) {
      fileIdx = this.sourceMapFiles.length;
      this.sourceMapFiles.push(loc.filename);
      this.sourceMapFileIndex.set(loc.filename, fileIdx);
    }
    // Zero-width WAST marker; serialization reports its byte offset via
    // the onSrcLoc callback (todos/0197).
    this.body.srcLoc(fileIdx, loc.line);
  }

  _trackLocalName(idx, name) {
    if (!name) return;
    let s = this.localIdxNames.get(idx);
    if (!s) { s = new Set(); this.localIdxNames.set(idx, s); }
    s.add(name);
  }
  _wtKey(wt) {
    if (wt.tag === "ref") return `ref:${wt.nullable?1:0}:${wt.heapIsIdx?'i':'h'}:${wt.heap}`;
    return `${wt.tag}:${wt.num||''}`;
  }

  allocLocal(wt) {
    const key = this._wtKey(wt);
    const free = this.freeLocalsByType.get(key);
    if (free && free.length > 0) {
      const idx = free.pop();
      if (this.localScopeStack.length > 0) {
        this.localScopeStack[this.localScopeStack.length - 1].push([key, idx]);
      }
      return idx;
    }
    const idx = this.nextLocalIdx++;
    const locals = this.currentFuncLocals;
    if (locals.length > 0 && this._wtKey(locals[locals.length - 1].type) === key) {
      locals[locals.length - 1].count++;
    } else {
      locals.push({ type: wt, count: 1 });
    }
    if (this.localScopeStack.length > 0) {
      this.localScopeStack[this.localScopeStack.length - 1].push([key, idx]);
    }
    return idx;
  }

  pushLocalScope() { this.localScopeStack.push([]); }
  popLocalScope() {
    const scope = this.localScopeStack.pop();
    if (this.compilerOptions.noReuseLocals) return;
    for (const [key, idx] of scope) {
      if (!this.freeLocalsByType.has(key)) this.freeLocalsByType.set(key, []);
      this.freeLocalsByType.get(key).push(idx);
    }
  }

  // --- Size/Align helpers ---
  sizeOf(type) { return type.size; }
  alignOf(type) { return type.align; }

  // --- String literal deduplication ---
  getStringAddress(valueArray) {
    // valueArray is a Uint8Array or regular array of bytes
    const key = Array.from(valueArray).join(",");
    if (this.stringLiteralAddrs.has(key)) return this.stringLiteralAddrs.get(key);
    const baseAddr = this.stackPages * 65536;
    const addr = baseAddr + this.staticDataOffset;
    this.stringLiteralAddrs.set(key, addr);
    for (const b of valueArray) this.staticData.push(b);
    this.staticDataOffset += valueArray.length;
    return addr;
  }

  // --- Static memory allocation ---
  allocateStatic(size, align) {
    if (!align) align = 4;
    const alignedOffset = (this.staticDataOffset + align - 1) & ~(align - 1);
    const padding = alignedOffset - this.staticDataOffset;
    for (let i = 0; i < padding; i++) this.staticData.push(0);
    this.staticDataOffset = alignedOffset;
    const baseAddr = this.stackPages * 65536;
    const addr = baseAddr + this.staticDataOffset;
    for (let i = 0; i < size; i++) this.staticData.push(0);
    this.staticDataOffset += size;
    return addr;
  }

  computeFAMExtraSize(type, initExpr) {
    if (!type.isTag() || !initExpr || !(initExpr instanceof AST.EInitList)) return 0;
    const tag = type.tagDecl;
    if (!tag || tag.tagKind !== Types.TagKind.STRUCT) return 0;
    const members = tag.members.filter(m => m instanceof AST.DVar);
    let famMember = null, famIdx = -1;
    for (let i = 0; i < members.length; i++) {
      if (members[i].type.isArray() && members[i].type.arraySize === 0) {
        famMember = members[i];
        famIdx = i;
      }
    }
    if (!famMember || famIdx < 0 || famIdx >= initExpr.elements.length) return 0;
    const famElem = initExpr.elements[famIdx];
    const elemType = famMember.type.baseType;
    const elemSize = this.sizeOf(elemType);
    if (famElem instanceof AST.EString) return famElem.value.length * elemSize;
    if (famElem instanceof AST.EInitList) return famElem.elements.length * elemSize;
    return elemSize;
  }

  computeInitAllocSize(type, initExpr) {
    return this.sizeOf(type) + this.computeFAMExtraSize(type, initExpr);
  }

  // --- Frame address ---
  emitFrameAddr(offset) {
    if (this.frameBaseLocalIdx >= 0) {
      // Over-aligned frame: base was masked in the prologue and lives in
      // its own local; offsets are relative to that base directly.
      this.body.localGet(this.frameBaseLocalIdx);
      if (offset !== 0) {
        this.body.i32Const(offset);
        this.body.aop(WT_I32, ALU.OP_ADD);
      }
      return;
    }
    this.body.localGet(this.savedSpLocalIdx);
    const adj = offset - this.frameSize;
    if (adj !== 0) {
      this.body.i32Const(adj);
      this.body.aop(WT_I32, ALU.OP_ADD);
    }
  }

  // --- Field offset ---
  getFieldOffset(tag, field) { return field.byteOffset; }

  // --- Write scalar to static data ---
  writeConstValueToStatic(offset, type, val) {
    const ut = type.removeQualifiers();
    if (ut.isFloatingPoint() && val.kind === "int") {
      val = { kind: "float", floatVal: Number(val.intVal) };
    } else if (ut.isInteger() && ut !== Types.TBOOL && val.kind === "float") {
      // Match runtime trunc_sat semantics (see ConstEval.convert).
      val = { kind: "int", intVal: ConstEval.saturatingTruncToInt(val.floatVal, ut) };
    } else if (ut === Types.TBOOL && val.kind === "float") {
      val = { kind: "int", intVal: val.floatVal !== 0 ? 1n : 0n };
    }
    const size = this.sizeOf(type);
    if (val.kind === "int") {
      let v = val.intVal;
      for (let b = 0; b < size; b++) {
        this.staticData[offset + b] = Number(v & 0xFFn);
        v >>= 8n;
      }
    } else if (val.kind === "float") {
      if (size === 4) {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setFloat32(0, val.floatVal, true);
        const bytes = new Uint8Array(buf);
        for (let b = 0; b < 4; b++) this.staticData[offset + b] = bytes[b];
      } else if (size === 8) {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setFloat64(0, val.floatVal, true);
        const bytes = new Uint8Array(buf);
        for (let b = 0; b < 8; b++) this.staticData[offset + b] = bytes[b];
      }
    } else if (val.kind === "addr") {
      let v = val.addrVal;
      for (let b = 0; b < size && b < 4; b++) {
        this.staticData[offset + b] = v & 0xFF;
        v >>>= 8;
      }
    }
  }

  writeStringLiteralToStatic(strValue, arrayType, offset) {
    const copySize = this.sizeOf(arrayType);
    // For incomplete arrays (FAM), copySize is 0; use full string length
    const len = copySize === 0 ? strValue.length : Math.min(copySize, strValue.length);
    for (let i = 0; i < len; i++) this.staticData[offset + i] = strValue[i];
  }

  // A function's table index escaping as a VALUE (into code or a data
  // segment) makes it reachable via call_indirect — record it as a
  // tree-shake root (todos/0214). Speculative constEval attempts
  // over-approximate; that only keeps functions alive, which is safe.
  _funcAddrEscape(func) {
    const tIdx = this.funcDefToTableIdx.get(func);
    if (tIdx !== undefined) this.wmod.addrTakenFuncs.add(tIdx - 1);
    return tIdx;
  }

  // Build the address-resolution policy used by the shared module-scope
  // `constEvalExpr` / `constEvalAddr` evaluators. Caches per-instance so we
  // don't reallocate the policy object on every constant evaluation.
  _getConstEvalPolicy() {
    if (!this.__constEvalPolicy) {
      this.__constEvalPolicy = {
        getStringAddr: (v) => this.getStringAddress(v),
        getGlobalAddr: (vd) => {
          const a = this.globalArrayAddrs.get(vd);
          return a !== undefined ? a : null;
        },
        getFuncAddr: (fn) => {
          const a = this._funcAddrEscape(fn);
          return a !== undefined ? a : null;
        },
        getCompoundLitAddr: (e) => {
          const a = this.fileScopeCompoundLiteralAddrs.get(e);
          return a !== undefined ? a : null;
        },
      };
    }
    return this.__constEvalPolicy;
  }

  // Evaluate an expression as an address (returns a number or null)
  _constEvalAddr(expr) {
    return constEvalAddr(expr, this._getConstEvalPolicy());
  }

  // --- ConstEval for codegen ---
  makeConstEval() {
    return {
      evaluate: (expr) => this._constEvalExpr(expr),
    };
  }

  _constEvalExpr(expr) {
    return constEvalExpr(expr, this._getConstEvalPolicy());
  }

  // --- Populate init list into static data ---
  populateInitListStatic(initList, type, baseOffset) {
    if (type.isArray()) {
      const elemType = type.baseType;
      const elemSize = this.sizeOf(elemType);
      // A char array initialized by a (optionally brace-wrapped) string literal
      // arrives as a single EString element whose element type is scalar (not an
      // array). Write the string across the whole array rather than treating it
      // as element 0. (`elemType.isArray()` below handles arrays-of-char-arrays
      // like `char m[][6] = {"ab","cd"}`, a different case.)
      if (initList.elements.length === 1 &&
          initList.elements[0] instanceof AST.EString &&
          stringLiteralCanInitArray(type, initList.elements[0])) {
        this.writeStringLiteralToStatic(initList.elements[0].value, type, baseOffset);
        return;
      }
      for (let i = 0; i < initList.elements.length; i++) {
        const elemOffset = baseOffset + i * elemSize;
        const elem = initList.elements[i];
        if (elem instanceof AST.EInitList) {
          this.populateInitListStatic(elem, elemType, elemOffset);
        } else if (elem instanceof AST.EString && elemType.isArray()) {
          this.writeStringLiteralToStatic(elem.value, elemType, elemOffset);
        } else {
          const val = this._constEvalExpr(elem);
          if (val) this.writeConstValueToStatic(elemOffset, elemType, val);
          else if (this._staticInitErrSink && elem) this._staticInitErrSink.push({ loc: elem.loc });
        }
      }
    } else if (type.isTag()) {
      const tag = type.tagDecl;
      if (!tag) return;
      if (tag.tagKind === Types.TagKind.STRUCT) {
        let elemIdx = 0;
        for (const member of tag.members) {
          if (!(member instanceof AST.DVar)) continue;
          if (member.bitWidth >= 0 && !member.name) continue;
          const fieldOffset = baseOffset + member.byteOffset;
          if (elemIdx < initList.elements.length) {
            const elem = initList.elements[elemIdx];

            if (member.bitWidth >= 0) {
              const val = this._constEvalExpr(elem);
              if (val) {
                // Whole read-modify-write in BigInt: JS Number shifts are
                // mod-32, which zeroed width-32 fields and scrambled 8-byte
                // storage units. BigInt keeps 64-bit units and bw == 32/64
                // masks exact. (The runtime store path already does this.)
                const bw = BigInt(member.bitWidth);
                const bo = BigInt(member.bitOffset);
                // RMW only the layout-assigned access window (todos/0216):
                // in a packed struct the declared unit's tail bytes can
                // belong to the NEXT object in static data.
                const unitSize = member.bfAccessBytes > 0 ? member.bfAccessBytes : this.sizeOf(member.type);
                const mask = (1n << bw) - 1n;
                const bits = BigInt.asUintN(64, val.intVal) & mask;
                let unit = 0n;
                for (let b = 0; b < unitSize; b++) unit |= BigInt(this.staticData[fieldOffset + b]) << BigInt(b * 8);
                unit = (unit & ~(mask << bo)) | (bits << bo);
                for (let b = 0; b < unitSize; b++) this.staticData[fieldOffset + b] = Number((unit >> BigInt(b * 8)) & 0xFFn);
              }
              else if (this._staticInitErrSink && elem) this._staticInitErrSink.push({ loc: elem.loc });
            } else if (elem instanceof AST.EInitList) {
              this.populateInitListStatic(elem, member.type, fieldOffset);
            } else if (elem instanceof AST.EString && member.type.isArray()) {
              this.writeStringLiteralToStatic(elem.value, member.type, fieldOffset);
            } else {
              const val = this._constEvalExpr(elem);
              if (val) this.writeConstValueToStatic(fieldOffset, member.type, val);
              else if (this._staticInitErrSink && elem) this._staticInitErrSink.push({ loc: elem.loc });
            }
          }
          elemIdx++;
        }
      } else if (tag.tagKind === Types.TagKind.UNION) {

        if (initList.elements.length > 0 && initList.elements[0] !== null) {
          const targetIdx = initList.unionMemberIndex >= 0 ? initList.unionMemberIndex : 0;
          let varIdx = 0;
          for (const member of tag.members) {
            if (!(member instanceof AST.DVar)) continue;
            if (varIdx++ !== targetIdx) continue;
            const elem = initList.elements[0];
            if (elem instanceof AST.EInitList) {
              this.populateInitListStatic(elem, member.type, baseOffset);
            } else if (elem instanceof AST.EString && member.type.isArray()) {
              this.writeStringLiteralToStatic(elem.value, member.type, baseOffset);
            } else {
              const val = this._constEvalExpr(elem);
              if (val) this.writeConstValueToStatic(baseOffset, member.type, val);
              else if (this._staticInitErrSink && elem) this._staticInitErrSink.push({ loc: elem.loc });
            }
            break;
          }
        }
      }
    }
  }

  allocateInitListStatic(initList, aggType) {
    const totalSize = this.sizeOf(aggType);
    const addr = this.allocateStatic(totalSize, this.alignOf(aggType));
    const baseOffset = addr - (this.stackPages * 65536);
    this.populateInitListStatic(initList, aggType, baseOffset);
    return addr;
  }

  // --- Runtime init list stores ---
  emitInitListRuntimeStores(initList, type, baseLocalIdx, baseOffset) {
    if (type.isArray()) {
      const elemType = type.baseType;
      const elemSize = this.sizeOf(elemType);
      for (let i = 0; i < initList.elements.length; i++) {
        const elemOffset = baseOffset + i * elemSize;
        const elem = initList.elements[i];
        if (elem === null) continue;  // sparse slot — zero-initialized by EInitList's bzero
        if (elem instanceof AST.EInitList) {
          this.emitInitListRuntimeStores(elem, elemType, baseLocalIdx, elemOffset);
        } else {
          const val = this._constEvalExpr(elem);
          if (!val) {
            if (elemType.isAggregate()) {
              this.body.localGet(baseLocalIdx);
              if (elemOffset) { this.body.i32Const(elemOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
              this.emitExpr(elem);
              this.body.i32Const(this.sizeOf(elemType));
              this.body.memoryCopy();
            } else {
              this.body.localGet(baseLocalIdx);
              if (elemOffset) { this.body.i32Const(elemOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
              this.emitExpr(elem);
              this.emitConversion(elem.type, elemType);
              this.emitStore(elemType);
            }
          }
        }
      }
    } else if (type.isTag()) {
      const tag = type.tagDecl;
      if (!tag) return;
      if (tag.tagKind === Types.TagKind.STRUCT) {
        let elemIdx = 0;
        for (const member of tag.members) {
          if (!(member instanceof AST.DVar)) continue;
          if (member.bitWidth >= 0 && !member.name) continue;
          const fieldOffset = baseOffset + member.byteOffset;
          if (elemIdx < initList.elements.length) {
            const elem = initList.elements[elemIdx];
            if (elem === null) { elemIdx++; continue; }  // sparse slot — zero-init
            if (member.bitWidth >= 0) {
              const val = this._constEvalExpr(elem);
              if (!val) {
                this.body.localGet(baseLocalIdx);
                if (fieldOffset) { this.body.i32Const(fieldOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
                this.emitExpr(elem);
                this.emitConversion(elem.type, member.type);
                this.emitBitFieldStore(member);
              }
            } else if (elem instanceof AST.EInitList) {
              this.emitInitListRuntimeStores(elem, member.type, baseLocalIdx, fieldOffset);
            } else {
              const val = this._constEvalExpr(elem);
              if (!val) {
                if (member.type.isAggregate()) {
                  this.body.localGet(baseLocalIdx);
                  if (fieldOffset) { this.body.i32Const(fieldOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
                  this.emitExpr(elem);
                  this.body.i32Const(this.sizeOf(member.type));
                  this.body.memoryCopy();
                } else {
                  this.body.localGet(baseLocalIdx);
                  if (fieldOffset) { this.body.i32Const(fieldOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
                  this.emitExpr(elem);
                  this.emitConversion(elem.type, member.type);
                  this.emitStore(member.type);
                }
              }
            }
          }
          elemIdx++;
        }
      } else if (tag.tagKind === Types.TagKind.UNION) {
        if (initList.elements.length > 0 && initList.elements[0] !== null) {
          const targetIdx = initList.unionMemberIndex >= 0 ? initList.unionMemberIndex : 0;
          let varIdx = 0;
          for (const member of tag.members) {
            if (!(member instanceof AST.DVar)) continue;
            if (varIdx++ !== targetIdx) continue;
            const elem = initList.elements[0];
            if (elem instanceof AST.EInitList) {
              this.emitInitListRuntimeStores(elem, member.type, baseLocalIdx, baseOffset);
            } else {
              const val = this._constEvalExpr(elem);
              if (!val) {
                if (member.type.isAggregate()) {
                  this.body.localGet(baseLocalIdx);
                  if (baseOffset) { this.body.i32Const(baseOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
                  this.emitExpr(elem);
                  this.body.i32Const(this.sizeOf(member.type));
                  this.body.memoryCopy();
                } else {
                  this.body.localGet(baseLocalIdx);
                  if (baseOffset) { this.body.i32Const(baseOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
                  this.emitExpr(elem);
                  this.emitConversion(elem.type, member.type);
                  this.emitStore(member.type);
                }
              }
            }
            break;
          }
        }
      }
    }
  }

  // --- Init to frame slot ---
  emitStringToFrameSlot(strValue, arrayType, frameOffset) {
    const arraySize = this.sizeOf(arrayType);
    const strLen = strValue.length;
    const copyLen = Math.min(arraySize, strLen);
    const srcAddr = this.getStringAddress(strValue);
    this.emitFrameAddr(frameOffset);
    this.body.i32Const(srcAddr);
    this.body.i32Const(copyLen);
    this.body.memoryCopy();
    if (copyLen < arraySize) {
      this.emitFrameAddr(frameOffset + copyLen);
      this.body.i32Const(0);
      this.body.i32Const(arraySize - copyLen);
      this.body.memoryFill();
    }
  }
  emitInitToFrameSlot(type, initExpr, frameOffset) {
    if (type.isArray() && initExpr instanceof AST.EString) {
      this.emitStringToFrameSlot(initExpr.value, type, frameOffset);
      return;
    }
    if (type.isAggregate() && initExpr instanceof AST.EInitList) {
      const il = initExpr;
      if (type.isArray() && il.elements.length === 1 && il.elements[0] instanceof AST.EString &&
          stringLiteralCanInitArray(type, il.elements[0])) {
        this.emitStringToFrameSlot(il.elements[0].value, type, frameOffset);
        return;
      }
      const srcAddr = this.allocateInitListStatic(il, type);
      this.emitFrameAddr(frameOffset);
      this.body.i32Const(srcAddr);
      this.body.i32Const(this.sizeOf(type));
      this.body.memoryCopy();
      this.pushLocalScope();
      const baseAddrLocal = this.allocLocal(WT_I32);
      this.emitFrameAddr(frameOffset);
      this.body.localSet(baseAddrLocal);
      this.emitInitListRuntimeStores(il, type, baseAddrLocal, 0);
      this.popLocalScope();
      return;
    }
    if (isStructOrUnion(type)) {
      this.emitFrameAddr(frameOffset);
      this.emitExpr(initExpr);
      this.body.i32Const(this.sizeOf(type));
      this.body.memoryCopy();
      return;
    }
    // Scalar
    this.emitFrameAddr(frameOffset);
    this.emitExpr(initExpr);
    this.emitStore(type);
  }

  emitCompoundLiteralInit(cl) {
    const offset = this.compoundLiteralOffsets.get(cl);
    if (cl.type.isAggregate()) {
      this.emitInitToFrameSlot(cl.type, cl.initList, offset);
    } else {
      const initExpr = (!cl.initList.elements || cl.initList.elements.length === 0)
        ? new AST.EInt(cl.loc, Types.TINT, 0n) : cl.initList.elements[0];
      this.emitInitToFrameSlot(cl.type, initExpr, offset);
    }
  }

  // --- Assign locals for a function ---
  assignLocals(funcDef) {
    const funcIdx = this.funcDefToWasmFuncIdx.get(funcDef);
    const defIdx = funcIdx - this.wmod.funcImports.length;
    this.currentFuncLocals = this.wmod.funcDefs[defIdx].locals;
    this.currentFuncLocals.length = 0;
    this.freeLocalsByType.clear();
    this.localScopeStack = [];
    this.localVarToWasmLocalIdx.clear();
    this.localIdxNames = new Map();

    let localIdx = 0;
    this.hasVaArgs = !!funcDef.type.isVarArg;
    this.vaParamInfos = [];
    this.vaStartOffset = 0;
    this.vaRetSlotSize = 0;
    this.paramEntryConversions = [];

    if (this.hasVaArgs) {
      // New variadic convention: single WASM parameter = arg block pointer.
      this.argBlockLocalIdx = localIdx++;
      this.nextLocalIdx = localIdx;

      const retType = funcDef.type.getReturnType();
      this.vaRetSlotSize = (retType === Types.TVOID) ? 0 : vaSlotSize(retType);

      let paramOffset = this.vaRetSlotSize;
      for (const param of funcDef.parameters) {
        const wt = isStructOrUnion(param.type) ? WT_I32 : cToWasmType(param.type, this.wmod);
        const paramLocalIdx = this.allocLocal(wt);
        this.localVarToWasmLocalIdx.set(param, paramLocalIdx);
        this._trackLocalName(paramLocalIdx, param.name);
        const slotSz = vaSlotSize(param.type);
        this.vaParamInfos.push({ var: param, localIdx: paramLocalIdx, offset: paramOffset });
        paramOffset += slotSz;
      }
      this.vaStartOffset = paramOffset;
      this.vaArgsLocalIdx = this.allocLocal(WT_I32);
      this.hasStructReturn = false;
    } else {
      this.hasStructReturn = isStructOrUnion(funcDef.type.getReturnType());
      if (this.hasStructReturn) this.structRetPtrLocalIdx = localIdx++;
      for (const param of funcDef.parameters) {
        this.localVarToWasmLocalIdx.set(param, localIdx);
        this._trackLocalName(localIdx, param.name);
        localIdx++;
      }
      this.nextLocalIdx = localIdx;
      // K&R promoted-ABI params (todos/0159): the signature slot carries the
      // default-promoted type (double for a declared float — C89 6.5.2.2p6)
      // while the parameter VARIABLE keeps its declared type. When the wasm
      // types differ, give the param its own local of the declared type; the
      // prologue converts the incoming promoted value into it.
      const sigParamTypes = funcDef.type.getParamTypes();
      const paramBase = this.hasStructReturn ? 1 : 0;
      for (let i = 0; i < funcDef.parameters.length && i < sigParamTypes.length; i++) {
        const param = funcDef.parameters[i];
        if (isStructOrUnion(param.type) || isStructOrUnion(sigParamTypes[i])) continue;
        const wtDecl = cToWasmType(param.type, this.wmod);
        if (wtEquals(wtDecl, cToWasmType(sigParamTypes[i], this.wmod))) continue;
        const declLocal = this.allocLocal(wtDecl);
        this.paramEntryConversions.push({
          sigLocal: paramBase + i, declLocal,
          fromType: sigParamTypes[i], toType: param.type,
        });
        this.localVarToWasmLocalIdx.set(param, declLocal);
        this._trackLocalName(declLocal, param.name);
      }
    }

    // Collect MEMORY vars
    const memoryVars = [];
    const addMemoryDecls = (decls) => {
      for (const decl of decls) {
        if (decl instanceof AST.DVar && decl.storageClass !== Types.StorageClass.STATIC) {
          const def = decl.definition || decl;
          if (def === decl && def.allocClass === Types.AllocClass.MEMORY) memoryVars.push(decl);
        }
      }
    };
    const stack = [funcDef.body];
    while (stack.length > 0) {
      const stmt = stack.pop();
      if (!stmt) continue;
      switch (stmt.constructor) {
        case AST.SDecl: addMemoryDecls(stmt.declarations); break;
        case AST.SCompound:
          for (let i = stmt.statements.length - 1; i >= 0; i--) stack.push(stmt.statements[i]);
          break;
        case AST.SIf:
          stack.push(stmt.thenBranch);
          if (stmt.elseBranch) stack.push(stmt.elseBranch);
          break;
        case AST.SWhile: stack.push(stmt.body); break;
        case AST.SDoWhile: stack.push(stmt.body); break;
        case AST.SFor:
          if (stmt.init && stmt.init instanceof AST.SDecl) addMemoryDecls(stmt.init.declarations);
          stack.push(stmt.body);
          break;
        case AST.SSwitch:
          for (let i = stmt.body.statements.length - 1; i >= 0; i--) stack.push(stmt.body.statements[i]);
          break;
        case AST.STryCatch:
          stack.push(stmt.tryBody);
          for (const cc of stmt.catches) stack.push(cc.body);
          break;
      }
    }

    // Memory parameters
    const memoryParams = [];
    for (const param of funcDef.parameters) {
      const def = param.definition || param;
      if (def.allocClass === Types.AllocClass.MEMORY) memoryParams.push(param);
    }

    // Compute frame layout
    this.localArrayOffsets.clear();
    this.paramMemoryOffsets.clear();
    this.compoundLiteralOffsets.clear();
    this.frameSize = 0;
    this.frameAlign = 16;
    this.frameBaseLocalIdx = -1;
    // Eager peek: do we have any frame-scope compound literals?
    let hasFrameCompoundLiterals = false;
    if (funcDef.body) {
      for (const cl of funcDef.body.referencedCompoundLiterals) {
        if (!this.fileScopeCompoundLiteralAddrs.has(cl)) {
          hasFrameCompoundLiterals = true;
          break;
        }
      }
    }
    if (memoryVars.length > 0 || memoryParams.length > 0 || hasFrameCompoundLiterals) {
      this.savedSpLocalIdx = this.allocLocal(WT_I32);
      let offset = 0;
      let maxAlign = 16;
      for (const v of memoryVars) {
        let a = this.alignOf(v.type);
        if (v.requestedAlignment > 0 && v.requestedAlignment > a) a = v.requestedAlignment;
        if (a > maxAlign) maxAlign = a;
        offset = (offset + a - 1) & ~(a - 1);
        this.localArrayOffsets.set(v, offset);
        offset += this.sizeOf(v.type);
      }
      for (const p of memoryParams) {
        const a = this.alignOf(p.type);
        offset = (offset + a - 1) & ~(a - 1);
        this.paramMemoryOffsets.set(p, offset);
        offset += this.sizeOf(p.type);
      }
      // Frame-scope compound literals: walk the body's bag. Anything
      // already allocated as a file-scope (static-storage) literal is
      // skipped — its address is global, not frame-relative.
      if (funcDef.body) {
        for (const cl of funcDef.body.referencedCompoundLiterals) {
          if (this.fileScopeCompoundLiteralAddrs.has(cl)) continue;
          if (this.compoundLiteralOffsets.has(cl)) continue;
          const a = this.alignOf(cl.type);
          offset = (offset + a - 1) & ~(a - 1);
          this.compoundLiteralOffsets.set(cl, offset);
          offset += this.sizeOf(cl.type);
        }
      }
      this.frameSize = (offset + 15) & ~15;
      // Over-aligned frame: some local requested alignment beyond the
      // stack's guaranteed 16 (__attribute__((aligned(N)))). The prologue
      // masks the frame base down to maxAlign and frame addressing switches
      // from savedSp-relative to a dedicated base local.
      if (maxAlign > 16) {
        this.frameAlign = maxAlign;
        this.frameBaseLocalIdx = this.allocLocal(WT_I32);
      }
    }

    // Warn when a single function's stack frame is at or above the
    // effective WASM stack size — calling it once is guaranteed to
    // underflow the stack pointer into linear-memory zero, which
    // silently corrupts memory and surfaces as a confusing trap in
    // whatever libc call happens next (we burned an hour finding this
    // in the Quake port). Off only via -Wno-large-stack-frame.
    if (this.warningFlags.largeStackFrame && this.frameSize > 0) {
      const stackBytes = this.stackPages * 65536;
      if (this.frameSize >= stackBytes) {
        const loc = funcDef.loc || {};
        const fname = loc.filename || "<unknown>";
        const line = loc.line || 0;
        this.writeErr(
          `${fname}:${line}: warning: function '${funcDef.name}' has a ` +
          `${this.frameSize}-byte stack frame, ` +
          `which meets or exceeds the ${stackBytes}-byte WASM stack — ` +
          `calling it will trap. Consider __minstack(N); at file scope, ` +
          `or move large locals to the heap [-Wlarge-stack-frame]\n`
        );
      }
    }
  }

  // --- Emit function body ---
  emitFunctionBody(funcDef) {
    const funcIdx = this.funcDefToWasmFuncIdx.get(funcDef);
    this.assignLocals(funcDef);
    const defIdx = funcIdx - this.wmod.funcImports.length;
    // Function bodies build WAST nodes (todos/0197); the sequence is
    // validated at the end of this method and stored on
    // wmod.funcDefs[defIdx].wast — serialization is deferred to
    // WasmModule.emit's code-section writer so the WAST pass hook can run
    // over the finished trees first (todos/0198).
    this.body = new WAST.WastBuilder();
    this.currentFuncDef = funcDef;
    this.emitSrcLocMarkers = !!this.compilerOptions.emitNames;
    this.structRetDeferred = 0;
    this.usesAlloca = false;
    this.callNesting = 0;
    this.blockDepth = 0;
    this.gotoLabelDepths.clear();
    const gotoErrLenAtEntry = this.gotoErrors.length;

    this._recordSourceLoc(funcDef.loc);

    // Variadic function prologue: load fixed params from arg block
    if (this.hasVaArgs) {
      for (const pi of this.vaParamInfos) {
        if (isStructOrUnion(pi.var.type)) {
          this.body.localGet(this.argBlockLocalIdx);
          if (pi.offset > 0) { this.body.i32Const(pi.offset); this.body.aop(WT_I32, ALU.OP_ADD); }
          this.body.localSet(pi.localIdx);
        } else {
          this.body.localGet(this.argBlockLocalIdx);
          if (pi.offset > 0) { this.body.i32Const(pi.offset); this.body.aop(WT_I32, ALU.OP_ADD); }
          this.emitVaArgLoad(pi.var.type);
          this.body.localSet(pi.localIdx);
        }
      }
      this.body.localGet(this.argBlockLocalIdx);
      if (this.vaStartOffset > 0) { this.body.i32Const(this.vaStartOffset); this.body.aop(WT_I32, ALU.OP_ADD); }
      this.body.localSet(this.vaArgsLocalIdx);
    }

    // K&R promoted-ABI entry conversions (todos/0159, see assignLocals):
    // move each promoted signature param into its declared-type local —
    // before the frame prologue, so MEMORY-param copies read the converted
    // local.
    for (const pc of this.paramEntryConversions) {
      this.body.localGet(pc.sigLocal);
      this.emitConversion(pc.fromType, pc.toType);
      this.body.localSet(pc.declLocal);
    }

    // Stack frame prologue
    if (this.frameSize > 0) {
      this.body.globalGet(this.stackPointerGlobalIdx);
      this.body.localSet(this.savedSpLocalIdx);
      this.body.localGet(this.savedSpLocalIdx);
      this.body.i32Const(this.frameSize);
      this.body.aop(WT_I32, ALU.OP_SUB);
      if (this.frameBaseLocalIdx >= 0) {
        // Over-aligned frame: round the base down to frameAlign (consumes up
        // to frameAlign-1 extra stack bytes) and keep it in a local — the
        // epilogue still restores savedSp, so this needs no unwinding.
        this.body.i32Const(-this.frameAlign);
        this.body.aop(WT_I32, ALU.OP_AND);
        this.body.localSet(this.frameBaseLocalIdx);
        this.body.localGet(this.frameBaseLocalIdx);
      }
      this.body.globalSet(this.stackPointerGlobalIdx);
      // Copy MEMORY parameters
      for (const [paramVar, offset] of this.paramMemoryOffsets) {
        this.emitFrameAddr(offset);
        const paramIt = this.localVarToWasmLocalIdx.get(paramVar);
        if (paramIt !== undefined) {
          if (isStructOrUnion(paramVar.type)) {
            this.body.localGet(paramIt);
            this.body.i32Const(this.sizeOf(paramVar.type));
            this.body.memoryCopy();
          } else {
            this.body.localGet(paramIt);
            this.emitStore(paramVar.type);
          }
        }
      }
    }

    this.emitStmt(funcDef.body);

    // Epilogue
    this._recordSourceLoc(funcDef.loc);
    if (alwaysReturns(funcDef.body)) {
      this.body.unreachable();
    } else {
      if (this.frameSize > 0) {
        this.body.localGet(this.savedSpLocalIdx);
        this.body.globalSet(this.stackPointerGlobalIdx);
      }
      if (this.hasVaArgs) {
        // Variadic: WASM function returns void
      } else {
        const retType = funcDef.type.getReturnType();
        const wasmRetType = cToWasmType(retType, this.wmod);
        if (wtIsRef(wasmRetType) && !wasmRetType.nullable) this.body.unreachable();
        else if (wtIsRef(wasmRetType) && wasmRetType.heapIsIdx) this.body.refNullIdx(wasmRetType.heap);
        else if (wtIsRef(wasmRetType)) this.body.refNull(wasmRetType.heap);
        else if (wtEquals(wasmRetType, WT_I32)) this.body.i32Const(0);
        else if (wtEquals(wasmRetType, WT_I64)) this.body.i64Const(0n);
        else if (wtEquals(wasmRetType, WT_F32)) this.body.f32Const(0.0);
        else if (wtEquals(wasmRetType, WT_F64)) this.body.f64Const(0.0);
        else this.body.i32Const(0);
      }
      this.body.ret();
    }

    // Validate and store the WAST node sequence on the funcDef; the
    // code-section writer serializes it (and records source-map entries —
    // byte offsets exist only there) after the pass hook runs.
    if (this.gotoErrors.length > gotoErrLenAtEntry) {
      // This structured attempt hit out-of-scope gotos: the driver either
      // rolls it back and re-emits through the loop-switch lowering, or
      // surfaces the errors and exits — the nodes are discarded either
      // way. The node sequence may be legitimately unbalanced here
      // (forward-label blocks opened but never closed), so don't
      // validate or store it.
    } else {
      try {
        WAST.validate(this.body.nodes, this.body.funcLabel);
      } catch (e) {
        e.message = `in function '${funcDef.name}': ` + e.message;
        throw e;
      }
      this.wmod.funcDefs[defIdx].wast = this.body.nodes;
      // ABI facts the WAST inliner can't reconstruct from nodes alone
      // (todos/0201) — stamped only alongside a stored tree, so a raw or
      // discarded body never carries stale metadata.
      this.wmod.funcDefs[defIdx].fnMeta = {
        variadic: this.hasVaArgs,
        frameSize: this.frameSize,
        overAligned: this.frameBaseLocalIdx >= 0,
        structRet: this.hasStructReturn,
        usesAlloca: this.usesAlloca,
        // Inline-policy hints (todos/0214): noinline = hard refusal,
        // alwaysInline = bypass the size budgets, inlineHint = the plain
        // `inline` keyword (raised effective calleeCap).
        noinline: !!(funcDef.fnAttrs && funcDef.fnAttrs.noinline),
        alwaysInline: !!(funcDef.fnAttrs && funcDef.fnAttrs.alwaysInline),
        inlineHint: !!funcDef.isInline,
      };
    }

    this.emitSrcLocMarkers = false;
    this.body = null;

    if (this.compilerOptions.emitNames && this.localIdxNames.size > 0) {
      const locals = [];
      for (const [idx, names] of this.localIdxNames) {
        locals.push({ idx, name: [...names].join(",") });
      }
      locals.sort((a, b) => a.idx - b.idx);
      this.wmod.localNames.push({ funcIdx, locals });
    }
  }

  // --- Statement emission ---
  emitStmt(stmt) {
    if (!stmt) return;
    if (stmt.loc) this._recordSourceLoc(stmt.loc);
    switch (stmt.constructor) {
      case AST.SCompound: {
        this.pushLocalScope();
        const stmts = stmt.statements;
        // Open forward-label blocks. Forward labels' scope = from the start
        // of the compound up to the label statement itself.
        const forwardLabels = [];
        for (const s of stmts) {
          if (s instanceof AST.SLabel && s.hasGotos && !s.isSwitchLevel) {
            if (s.labelKind === Types.LabelKind.FORWARD || s.labelKind === Types.LabelKind.BOTH)
              forwardLabels.push(s);
          }
        }
        for (let i = forwardLabels.length - 1; i >= 0; i--) {
          this.body.block();
          this.blockDepth++;
          this.gotoLabelDepths.set(forwardLabels[i], this.blockDepth);
        }
        const openLoopLabels = [];
        for (const s of stmts) {
          if (s instanceof AST.SLabel) {
            if (!s.hasGotos) continue;
            if (s.labelKind === Types.LabelKind.FORWARD || s.labelKind === Types.LabelKind.BOTH) {
              for (let j = openLoopLabels.length - 1; j >= 0; j--) {
                this.gotoLabelDepths.delete(openLoopLabels[j]);
                this.blockDepth--;
                this.body.end();
              }
              openLoopLabels.length = 0;
              this.gotoLabelDepths.delete(s);
              this.blockDepth--;
              this.body.end();
            }
            if (s.labelKind === Types.LabelKind.LOOP || s.labelKind === Types.LabelKind.BOTH) {
              this.body.loop();
              this.blockDepth++;
              this.gotoLabelDepths.set(s, this.blockDepth);
              openLoopLabels.push(s);
            }
          } else {
            this.emitStmt(s);
          }
        }
        for (let j = openLoopLabels.length - 1; j >= 0; j--) {
          this.gotoLabelDepths.delete(openLoopLabels[j]);
          this.blockDepth--;
          this.body.end();
        }
        this.popLocalScope();
        break;
      }
      case AST.SExpr:
        this.emitExpr(stmt.expr, EXPR_DROP);
        break;
      case AST.SDecl: {
        for (const decl of stmt.declarations) {
          if (decl instanceof AST.DVar) {
            if (decl.storageClass !== Types.StorageClass.STATIC && decl.definition === decl &&
                decl.allocClass === Types.AllocClass.REGISTER) {
              const _li = this.allocLocal(cToWasmType(decl.type, this.wmod));
              this.localVarToWasmLocalIdx.set(decl, _li);
              this._trackLocalName(_li, decl.name);
              // If GOTO_NORMALIZER's hoist transform separated this DVar's
              // declaring compound from compounds containing its uses, its
              // wasm-local slot must NOT be freed at the declaring compound's
              // popLocalScope — the uses outlast that scope. Untrack here so
              // the slot stays "live" for the rest of the function.
              if (GOTO_NORMALIZER.HOIST_PROMOTED_DVARS.has(decl)) {
                const stack = this.localScopeStack;
                if (stack.length > 0) {
                  const top = stack[stack.length - 1];
                  for (let i = top.length - 1; i >= 0; i--) {
                    if (top[i][1] === _li) { top.splice(i, 1); break; }
                  }
                }
              }
            }
            if (decl.initExpr) {
              const lait = this.localArrayOffsets.get(decl);
              if (lait !== undefined) {
                this.emitInitToFrameSlot(decl.type, decl.initExpr, lait);
              } else {
                const lit = this.localVarToWasmLocalIdx.get(decl);
                if (lit !== undefined) {
                  this.emitExpr(decl.initExpr);
                  this.body.localSet(lit);
                }
              }
            }
          }
        }
        break;
      }
      case AST.SReturn: {
        if (this.hasVaArgs) {
          const retType = this.currentFuncDef.type.getReturnType();
          if (stmt.expr && isStructOrUnion(retType)) {
            this.body.localGet(this.argBlockLocalIdx);
            this.emitExpr(stmt.expr);
            this.body.i32Const(this.sizeOf(retType));
            this.body.memoryCopy();
          } else if (stmt.expr) {
            this.body.localGet(this.argBlockLocalIdx);
            this.emitExpr(stmt.expr);
            this.emitVaArgStore(retType);
          }
        } else if (stmt.expr && this.hasStructReturn) {
          this.body.localGet(this.structRetPtrLocalIdx);
          this.emitExpr(stmt.expr);
          this.body.i32Const(this.sizeOf(this.currentFuncDef.type.getReturnType()));
          this.body.memoryCopy();
          this.body.localGet(this.structRetPtrLocalIdx);
        } else if (stmt.expr) {
          this.emitExpr(stmt.expr);
          const retType = this.currentFuncDef.type.getReturnType();
        } else {
          if (!this.hasVaArgs) {
            const retType = this.currentFuncDef.type.getReturnType();
            if (retType.removeQualifiers() === Types.TREFEXTERN) this.body.unreachable();
            else if (retType.removeQualifiers() === Types.TEXTERNREF) this.body.refNull(0x6F);
            else this.body.i32Const(0);
          }
        }
        if (this.frameSize > 0) {
          this.body.localGet(this.savedSpLocalIdx);
          this.body.globalSet(this.stackPointerGlobalIdx);
        }
        this.body.ret();
        break;
      }
      case AST.SIf: {
        this.emitExpr(stmt.condition);
        this.emitConditionToI32(stmt.condition.type);
        if (stmt.elseBranch) {
          this.body.if_(WT_EMPTY); this.blockDepth++;
          this.emitStmt(stmt.thenBranch);
          this.body.else_();
          this.emitStmt(stmt.elseBranch);
          this.blockDepth--; this.body.end();
        } else {
          this.body.if_(WT_EMPTY); this.blockDepth++;
          this.emitStmt(stmt.thenBranch);
          this.blockDepth--; this.body.end();
        }
        break;
      }
      case AST.SWhile: {
        const savedBreak = this.breakTarget, savedContinue = this.continueTarget;
        this.body.block(); this.blockDepth++; this.breakTarget = this.blockDepth;
        this.body.loop(); this.blockDepth++; this.continueTarget = this.blockDepth;
        this.emitExpr(stmt.condition);
        this.emitConditionToI32(stmt.condition.type);
        this.body.aop(WT_I32, ALU.OP_EQZ);
        this.body.brIf(this.blockDepth - this.breakTarget);
        this.emitStmt(stmt.body);
        this.body.br(this.blockDepth - this.continueTarget);
        this.blockDepth--; this.body.end();
        this.blockDepth--; this.body.end();
        this.breakTarget = savedBreak; this.continueTarget = savedContinue;
        break;
      }
      case AST.SDoWhile: {
        const savedBreak = this.breakTarget, savedContinue = this.continueTarget;
        this.body.block(); this.blockDepth++; this.breakTarget = this.blockDepth;
        this.body.loop(); this.blockDepth++;
        const loopDepth = this.blockDepth;
        this.body.block(); this.blockDepth++; this.continueTarget = this.blockDepth;
        this.emitStmt(stmt.body);
        this.blockDepth--; this.body.end();
        this.emitExpr(stmt.condition);
        this.emitConditionToI32(stmt.condition.type);
        this.body.brIf(this.blockDepth - loopDepth);
        this.blockDepth--; this.body.end();
        this.blockDepth--; this.body.end();
        this.breakTarget = savedBreak; this.continueTarget = savedContinue;
        break;
      }
      case AST.SFor: {
        const savedBreak = this.breakTarget, savedContinue = this.continueTarget;
        this.pushLocalScope();
        if (stmt.init) this.emitStmt(stmt.init);
        this.body.block(); this.blockDepth++; this.breakTarget = this.blockDepth;
        this.body.loop(); this.blockDepth++;
        const loopTarget = this.blockDepth;
        if (stmt.condition) {
          this.emitExpr(stmt.condition);
          this.emitConditionToI32(stmt.condition.type);
          this.body.aop(WT_I32, ALU.OP_EQZ);
          this.body.brIf(this.blockDepth - this.breakTarget);
        }
        this.body.block(); this.blockDepth++; this.continueTarget = this.blockDepth;
        this.emitStmt(stmt.body);
        this.blockDepth--; this.body.end();
        if (stmt.increment) this.emitExpr(stmt.increment, EXPR_DROP);
        this.body.br(this.blockDepth - loopTarget);
        this.blockDepth--; this.body.end();
        this.blockDepth--; this.body.end();
        this.popLocalScope();
        this.breakTarget = savedBreak; this.continueTarget = savedContinue;
        break;
      }
      case AST.SBreak:
        this.body.br(this.blockDepth - this.breakTarget);
        break;
      case AST.SContinue:
        this.body.br(this.blockDepth - this.continueTarget);
        break;
      case AST.SSwitch: {
        const sw = stmt;
        const savedBreak = this.breakTarget;

        // Top-level SCase nodes (direct statements of sw.body) in
        // source order. Structured codegen can only dispatch to these
        // positions; any SCase buried inside a nested compound is a
        // Duff's-device pattern (SQLite VDBE) and requires the
        // loop-switch lowering fallback.
        const topLevelCases = [];
        for (let si = 0; si < sw.body.statements.length; si++) {
          const s = sw.body.statements[si];
          if (s instanceof AST.SCase) topLevelCases.push({ caseNode: s, stmtPos: si });
        }
        if (sw.body.caseBag.size > topLevelCases.length) {
          const loc = sw.loc || {};
          this.gotoErrors.push({
            message: `switch contains nested case label(s); requires loop-switch lowering ` +
                     `(in function '${this.currentFuncDef?.name || '?'}')`,
            filename: loc.filename || '?',
            line: loc.line || 0,
          });
          this.body.unreachable();
          break;
        }

        let defaultIdx = -1;
        for (let i = 0; i < topLevelCases.length; i++) {
          if (topLevelCases[i].caseNode.isDefault) { defaultIdx = i; break; }
        }

        // C11 6.8.4.2: statements before the first case label are
        // unreachable, but declarations among them are in scope for the
        // WHOLE switch body (busybox awk.c: `switch (tc) { var *v;
        // case ...: v = ...`). Case-body emission below starts at the
        // first case's position, so register those locals here —
        // initializers are skipped, exactly like jumping past a
        // declaration with goto. MEMORY-class decls already got frame
        // slots from the prepass walker, which does descend into switch
        // bodies; only REGISTER-class locals need rescuing.
        {
          const preambleEnd = topLevelCases.length > 0
            ? topLevelCases[0].stmtPos : sw.body.statements.length;
          for (let si = 0; si < preambleEnd; si++) {
            const s = sw.body.statements[si];
            if (!(s instanceof AST.SDecl)) continue;
            for (const decl of s.declarations) {
              if (decl instanceof AST.DVar &&
                  decl.storageClass !== Types.StorageClass.STATIC &&
                  decl.definition === decl &&
                  decl.allocClass === Types.AllocClass.REGISTER &&
                  !this.localVarToWasmLocalIdx.has(decl)) {
                const li = this.allocLocal(cToWasmType(decl.type, this.wmod));
                this.localVarToWasmLocalIdx.set(decl, li);
                this._trackLocalName(li, decl.name);
              }
            }
          }
        }

        // Collect forward labels and their statement positions in switch body
        const switchFwdLabels = [];
        for (let si = 0; si < sw.body.statements.length; si++) {
          const s = sw.body.statements[si];
          if (s instanceof AST.SLabel && s.hasGotos) {
            if (s.labelKind === Types.LabelKind.FORWARD || s.labelKind === Types.LabelKind.BOTH)
              switchFwdLabels.push({ label: s, stmtPos: si });
          }
          if (s instanceof AST.SCompound) {
            for (const cs of s.statements) {
              if (cs instanceof AST.SLabel && cs.hasGotos) {
                if (cs.labelKind === Types.LabelKind.FORWARD || cs.labelKind === Types.LabelKind.BOTH) {
                  switchFwdLabels.push({ label: cs, stmtPos: si });
                  // Mark so the inner COMPOUND emit doesn't open its own
                  // forward-label block — the switch-level block we're
                  // about to open subsumes it.
                  cs.isSwitchLevel = true;
                }
              }
            }
          }
        }
        const numCases = topLevelCases.length;
        const numFwdBlocks = switchFwdLabels.length;

        // Compute adjusted br index for each case.
        // A forward label at stmtPos P is interleaved between cases with
        // stmtPos <= P (inner) and cases with stmtPos > P (outer).
        const caseBrIdx = new Array(numCases);
        for (let i = 0; i < numCases; i++) {
          let adj = 0;
          for (const fl of switchFwdLabels) {
            if (fl.stmtPos < topLevelCases[i].stmtPos) adj++;
          }
          caseBrIdx[i] = i + adj;
        }

        // Open break block
        this.body.block(); this.blockDepth++; this.breakTarget = this.blockDepth;

        // Open case blocks and forward label blocks interleaved.
        // Sort by stmtPos descending (higher pos = outermost).
        const blockEntries = [];
        for (let i = 0; i < numCases; i++) {
          blockEntries.push({ pos: topLevelCases[i].stmtPos, isForward: false, idx: i });
        }
        for (let i = 0; i < switchFwdLabels.length; i++) {
          blockEntries.push({ pos: switchFwdLabels[i].stmtPos, isForward: true, idx: i });
        }
        blockEntries.sort((a, b) => {
          if (a.pos !== b.pos) return b.pos - a.pos;
          if (a.isForward !== b.isForward) return a.isForward ? -1 : 1;
          return b.idx - a.idx;
        });
        for (const e of blockEntries) {
          this.body.block(); this.blockDepth++;
          if (e.isForward) {
            this.gotoLabelDepths.set(switchFwdLabels[e.idx].label, this.blockDepth);
          }
        }

        // Dispatch
        {
          this.pushLocalScope();
          const switchWt = this.getBinaryWasmType(sw.expr.type);
          const switchLocal = this.allocLocal(switchWt);
          this.emitExpr(sw.expr);
          this.body.localSet(switchLocal);

          // Enumerate (value → caseIdx) pairs, expanding any GNU case
          // ranges (`case lo ... hi:`). Each value gets one entry; the
          // density check + br_table treat them as individual values.
          const valueEntries = []; // [{ value: BigInt, caseIdx: number }]
          for (let i = 0; i < numCases; i++) {
            const cn = topLevelCases[i].caseNode;
            if (cn.isDefault) continue;
            for (let v = cn.lo; v <= cn.hi; v++) {
              valueEntries.push({ value: v, caseIdx: i });
            }
          }

          let dense = false;
          let minVal = 0, maxVal = 0, range = 0;
          if (wtEquals(switchWt, WT_I32)) {
            let min = 0x7FFFFFFF, max = -0x80000000;
            for (const ve of valueEntries) {
              const v = Number(ve.value) | 0;
              if (v < min) min = v;
              if (v > max) max = v;
            }
            minVal = min; maxVal = max;
            const nonDefaultCount = valueEntries.length;
            range = nonDefaultCount > 0 ? (maxVal - minVal + 1) >>> 0 : 0;
            dense = nonDefaultCount >= 4 && range <= 512 &&
                (nonDefaultCount * 10 / range) >= 4; // density >= 40%
          }

          if (this.compilerOptions.debugSwitch && sw.loc && this.writeErr) {
            this.writeErr(`${sw.loc.filename}:${sw.loc.line}: switch: ${dense ? "br_table" : "br_if"}\n`);
          }

          if (dense) {
            // br_table path: build a jump table
            const fallbackIdx = defaultIdx >= 0 ? caseBrIdx[defaultIdx] : numCases + numFwdBlocks;
            const table = new Array(range).fill(fallbackIdx);
            for (const ve of valueEntries) {
              table[((Number(ve.value) | 0) - minVal) >>> 0] = caseBrIdx[ve.caseIdx];
            }
            this.body.localGet(switchLocal);
            this.body.i32Const(minVal);
            this.body.aop(WT_I32, ALU.OP_SUB);
            this.body.brTable(table, fallbackIdx);
          } else {
            // Linear br_if chain for sparse switches
            for (const ve of valueEntries) {
              this.body.localGet(switchLocal);
              if (wtEquals(switchWt, WT_I32)) {
                this.body.i32Const(BigInt(Number(ve.value) | 0));
                this.body.aop(WT_I32, ALU.OP_EQ);
              } else {
                this.body.i64Const(ve.value);
                this.body.aop(WT_I64, ALU.OP_EQ);
              }
              this.body.brIf(caseBrIdx[ve.caseIdx]);
            }
            if (defaultIdx >= 0) this.body.br(caseBrIdx[defaultIdx]);
            else this.body.br(numCases + numFwdBlocks);
          }
          this.popLocalScope();
        }
        // Case bodies. `openLoopLabels` is the set of BOTH/LOOP labels
        // currently bound to wasm `loop` blocks. Critically, these are
        // *per-case*: a BOTH label that lives in case N's body is in
        // scope only during case N. Before transitioning to case N+1
        // we must close the loop blocks and delete the labels from
        // `gotoLabelDepths`, otherwise the next case would inherit
        // stale depth entries (the next case's leading `end()` would
        // drop blockDepth below the registered depth, and a `goto L`
        // would either land on the wrong target or trigger the
        // depth>blockDepth defensive check).
        let openLoopLabels = [];
        for (let i = 0; i < numCases; i++) {
          // Cleanup any per-case loop labels left from the previous
          // iteration's body before closing this iteration's case
          // dispatch block.
          for (let k = openLoopLabels.length - 1; k >= 0; k--) {
            this.gotoLabelDepths.delete(openLoopLabels[k]);
            this.blockDepth--; this.body.end();
          }
          openLoopLabels.length = 0;
          this.blockDepth--; this.body.end();
          const startIdx = topLevelCases[i].stmtPos;
          const endIdx = (i + 1 < numCases) ? topLevelCases[i + 1].stmtPos : sw.body.statements.length;
          for (let j = startIdx; j < endIdx; j++) {
            const s = sw.body.statements[j];
            if (s instanceof AST.SCase) continue;  // dispatch marker, no code
            if (s instanceof AST.SLabel) {
              if (!s.hasGotos) continue;
              if (s.labelKind === Types.LabelKind.FORWARD || s.labelKind === Types.LabelKind.BOTH) {
                for (let k = openLoopLabels.length - 1; k >= 0; k--) {
                  this.gotoLabelDepths.delete(openLoopLabels[k]);
                  this.blockDepth--; this.body.end();
                }
                openLoopLabels.length = 0;
                this.gotoLabelDepths.delete(s);
                this.blockDepth--; this.body.end();
              }
              if (s.labelKind === Types.LabelKind.LOOP || s.labelKind === Types.LabelKind.BOTH) {
                this.body.loop(); this.blockDepth++;
                this.gotoLabelDepths.set(s, this.blockDepth);
                openLoopLabels.push(s);
              }
            } else {
              this.emitStmt(s);
            }
          }
        }
        for (let k = openLoopLabels.length - 1; k >= 0; k--) {
          this.gotoLabelDepths.delete(openLoopLabels[k]);
          this.blockDepth--; this.body.end();
        }
        // Any switch-level forward labels still in the map (their case
        // body fell through without crossing a forward-label statement)
        // go out of scope when we close the break block.
        for (const fl of switchFwdLabels) this.gotoLabelDepths.delete(fl.label);
        this.blockDepth--; this.body.end();
        this.breakTarget = savedBreak;
        break;
      }
      case AST.SGoto: {
        const target = stmt.target;
        const depth = target ? this.gotoLabelDepths.get(target) : undefined;
        // Treat both "label not in map" and "label registered at a
        // deeper scope than we're currently at" as out-of-scope. The
        // second case can occur when a label's block-opening was issued
        // by a parent compound but we've descended into a sibling that
        // doesn't structurally enclose it — the depth value is stale
        // relative to our current emission position.
        if (depth === undefined || depth > this.blockDepth) {
          const loc = stmt.loc || {};
          this.gotoErrors.push({
            message: `goto '${stmt.label}': target label not in scope (in function '${this.currentFuncDef?.name || '?'}') ` +
                     `(label may be in a nested block, or a loop label's scope was closed by a forward label)`,
            filename: loc.filename || '?',
            line: loc.line || 0,
          });
          this.body.unreachable();
        } else {
          this.body.br(this.blockDepth - depth);
        }
        break;
      }
      case AST.SLabel: break; // handled in COMPOUND
      case AST.SCase: break;  // dispatch marker, handled in SSwitch
      case AST.SEmpty: break;
      case AST.SThrow: {
        if (!stmt.tag) {
          // Tag-less rethrow, synthesized only by the irreducible
          // catch-all dispatcher: re-raise the exnref captured by the
          // enclosing catch_all_ref clause.
          if (this._catchAllExnrefLocal === undefined) {
            throw new Error("internal: tag-less SThrow outside a catch_all_ref clause");
          }
          this.body.localGet(this._catchAllExnrefLocal);
          this.body.throwRef();
          this.body.unreachable();
          break;
        }
        const tagIdx = this.exceptionToWasmTagIdx.get(stmt.tag);
        for (let i = 0; i < stmt.args.length; i++) this.emitExpr(stmt.args[i]);
        this.body.throw_(tagIdx);
        this.body.unreachable();
        break;
      }
      case AST.STryCatch: {
        const tc = stmt;
        const numCatches = tc.catches.length;
        const savedSpLocal = this.allocLocal(WT_I32);
        this.body.globalGet(this.stackPointerGlobalIdx);
        this.body.localSet(savedSpLocal);
        this.body.block(); this.blockDepth++;
        const endDepth = this.blockDepth;
        const catchBlockDepths = [];
        for (let i = numCatches - 1; i >= 0; i--) {
          const cc = tc.catches[i];
          if (cc.catchAllRethrow) this.body.block(WT_EXNREF);
          else if (!cc.tag || cc.tag.paramTypes.length === 0) this.body.block();
          else if (cc.tag.paramTypes.length === 1) this.body.block(cToWasmType(cc.tag.paramTypes[0], this.wmod));
          else {
            // Multi-value catch payload: block type = function-type index
            // (the 3-way blocktype union's third arm, first-class since
            // todos/0197 — this was a raw byte push before).
            const results = cc.tag.paramTypes.map(pt => cToWasmType(pt, this.wmod));
            const typeIdx = this.wmod.addFunctionTypeId([], results);
            this.body.block({ tag: "typeidx", idx: typeIdx });
          }
          this.blockDepth++;
          catchBlockDepths[i] = this.blockDepth;
        }
        const catches = [];
        for (let i = 0; i < numCatches; i++) {
          const cc = tc.catches[i];
          const labelIdx = this.blockDepth - catchBlockDepths[i];
          if (cc.catchAllRethrow) catches.push([0x03, 0, labelIdx]);       // catch_all_ref
          else if (!cc.tag) catches.push([0x02, 0, labelIdx]);             // catch_all
          else catches.push([0x00, this.exceptionToWasmTagIdx.get(cc.tag), labelIdx]);
        }
        this.body.tryTable(WT_EMPTY, catches);
        this.blockDepth++;
        this.emitStmt(tc.tryBody);
        this.blockDepth--; this.body.end();
        this.body.br(this.blockDepth - endDepth);
        for (let i = 0; i < numCatches; i++) {
          this.blockDepth--; this.body.end();
          const cc = tc.catches[i];
          this.pushLocalScope();
          let savedExnrefLocal;
          if (cc.catchAllRethrow) {
            // catch_all_ref delivered the in-flight exception as an
            // exnref on the stack — but BEFORE the stack-pointer
            // restore below can run, so capture it first.
            const exnLocal = this.allocLocal(WT_EXNREF);
            this.body.localSet(exnLocal);
            savedExnrefLocal = this._catchAllExnrefLocal;
            this._catchAllExnrefLocal = exnLocal;
          }
          this.body.localGet(savedSpLocal);
          this.body.globalSet(this.stackPointerGlobalIdx);
          if (cc.tag && cc.tag.paramTypes.length > 0) {
            const bindLocals = [];
            for (let j = 0; j < cc.bindingVars.length; j++) {
              const localIdx = this.allocLocal(cToWasmType(cc.tag.paramTypes[j], this.wmod));
              this.localVarToWasmLocalIdx.set(cc.bindingVars[j], localIdx);
              this._trackLocalName(localIdx, cc.bindingVars[j].name);
              bindLocals.push(localIdx);
            }
            for (let j = bindLocals.length - 1; j >= 0; j--) this.body.localSet(bindLocals[j]);
          }
          this.emitStmt(cc.body);
          if (cc.catchAllRethrow) this._catchAllExnrefLocal = savedExnrefLocal;
          this.popLocalScope();
          if (i + 1 < numCatches) this.body.br(this.blockDepth - endDepth);
        }
        this.blockDepth--; this.body.end();
        break;
      }
      default:
        throw new Error(`emitStmt: unhandled statement ${stmt.constructor.name}`);
    }
  }

  // --- Type helpers ---
  getBinaryWasmType(type) {
    type = type.removeQualifiers();
    if (type === Types.TEXTERNREF) return WT_EXTERNREF;
    if (type === Types.TREFEXTERN) return WT_REFEXTERN;
    if (type === Types.TEQREF) return WT_EQREF;
    if (type.isWasmGCType()) {
      return WT_GCREF(getOrCreateGCWasmTypeIdx(this.wmod, type), true);
    }
    if (type === Types.TFLOAT) return WT_F32;
    if (type === Types.TDOUBLE || type === Types.TLDOUBLE) return WT_F64;
    if (type === Types.TLLONG || type === Types.TULLONG) return WT_I64;
    return WT_I32;
  }

  isUnsignedType(type) {
    const t = type.removeQualifiers();
    // Pointers order and widen as unsigned addresses on wasm32: signed
    // i32.lt_s comparisons break for objects above 2 GiB (memory can grow
    // to 4 GiB), and pointer→u64 must zero-extend (clang's wasm32 ABI).
    // Pointer difference doesn't route through here (emitDivByElemSize is
    // explicitly signed).
    return t.isUnsigned() || t.isPointer();
  }

  // --- Pointer scaling helpers ---
  // sizeof(pointee) for pointer arithmetic. void* (and function pointers)
  // scale by 1 — the gcc/clang extension (sizeof(void)==1). Without the
  // clamp, void* + n multiplied by 0 (silent no-op) and void* difference
  // divided by 0 (trap) — see tests/unit/conformance/void_ptr_arith.
  // A COMPLETE zero-size pointee (GNU empty struct) is NOT clamped: gcc
  // and clang keep the genuine stride 0 there — `p + n` stays put and a
  // pointer difference is 0 (todos/0227 G23, empty_struct_ptr_arith).
  // That makes the stride exactly the sizeof-operator result.
  ptrArithElemSize(elemType) {
    return elemType.sizeofResult();
  }
  // Multiply the i32 value already on top of the stack by sizeof(elemType).
  emitScaleByElemSize(elemType) {
    const elemSize = this.ptrArithElemSize(elemType);
    if (elemSize !== 1) {
      this.body.i32Const(elemSize);
      this.body.aop(WT_I32, ALU.OP_MUL);
    }
  }
  // Divide the i32 value already on top of the stack by sizeof(elemType)
  // (signed). Stride 0 (empty-struct pointee) can't divide — the result
  // is 0 regardless of the byte difference, so multiply by 0 instead.
  emitDivByElemSize(elemType) {
    const elemSize = this.ptrArithElemSize(elemType);
    if (elemSize === 0) {
      this.body.i32Const(0);
      this.body.aop(WT_I32, ALU.OP_MUL);
    } else if (elemSize !== 1) {
      this.body.i32Const(elemSize);
      this.body.aop(WT_I32, ALU.OP_DIV, true);
    }
  }
  // Emit an integer expression as a byte offset for pointer arithmetic:
  // emit, narrow i64→i32 if needed, then scale by sizeof(elemType).
  emitPointerOffset(intExpr, elemType) {
    this.emitExpr(intExpr);
    if (wtEquals(this.getBinaryWasmType(intExpr.type), WT_I64)) {
      this.body.aop(WT_I32, ALU.OP_WRAP_I64);
    }
    this.emitScaleByElemSize(elemType);
  }

  // --- Load/Store ---
  // After an address has been pushed for an lvalue, emit a load iff
  // the value should be materialized (i.e. it's a scalar). Aggregates
  // (struct/union/array) propagate as addresses — loading them here
  // would be wrong; callers consume the address. Functions are also
  // address-only at the wasm level (the call sequence reads the table
  // index directly). Centralizes the rule that was repeated across
  // EIdent / ESubscript / EMember / EArrow / OP_DEREF emit cases.
  emitLoadIfScalar(type) {
    if (!type.isAggregate() && !type.isFunction()) this.emitLoad(type);
  }
  emitLoad(type) {
    type = type.removeQualifiers();
    if (type === Types.TCHAR || type === Types.TSCHAR) this.body.mop(MOP.I32_LOAD8_S, 0, 0);
    else if (type === Types.TUCHAR || type === Types.TBOOL) this.body.mop(MOP.I32_LOAD8_U, 0, 0);
    else if (type === Types.TSHORT) this.body.mop(MOP.I32_LOAD16_S, 0, 1);
    else if (type === Types.TUSHORT) this.body.mop(MOP.I32_LOAD16_U, 0, 1);
    else if (type === Types.TINT || type === Types.TUINT || type === Types.TLONG ||
             type === Types.TULONG || type.isPointer()) this.body.mop(MOP.I32_LOAD, 0, 2);
    else if (type === Types.TLLONG || type === Types.TULLONG) this.body.mop(MOP.I64_LOAD, 0, 3);
    else if (type === Types.TFLOAT) this.body.mop(MOP.F32_LOAD, 0, 2);
    else if (type === Types.TDOUBLE || type === Types.TLDOUBLE) this.body.mop(MOP.F64_LOAD, 0, 3);
    else throw new Error(`emitLoad: unsupported type: ${type.kind}`);
  }

  emitStore(type) {
    type = type.removeQualifiers();
    if (type === Types.TCHAR || type === Types.TSCHAR || type === Types.TUCHAR || type === Types.TBOOL)
      this.body.mop(MOP.I32_STORE8, 0, 0);
    else if (type === Types.TSHORT || type === Types.TUSHORT) this.body.mop(MOP.I32_STORE16, 0, 1);
    else if (type === Types.TINT || type === Types.TUINT || type === Types.TLONG ||
             type === Types.TULONG || type.isPointer()) this.body.mop(MOP.I32_STORE, 0, 2);
    else if (type === Types.TLLONG || type === Types.TULLONG) this.body.mop(MOP.I64_STORE, 0, 3);
    else if (type === Types.TFLOAT) this.body.mop(MOP.F32_STORE, 0, 2);
    else if (type === Types.TDOUBLE || type === Types.TLDOUBLE) this.body.mop(MOP.F64_STORE, 0, 3);
    else throw new Error(`emitStore: unsupported type: ${type.kind}`);
  }

  // --- Bitfield load/store ---
  // The unit access width is the layout-assigned window (bfAccessBytes:
  // the narrowest power-of-2 span from the unit start covering the
  // member's bits — todos/0216), falling back to the declared type's
  // size (union members, older layouts). The window is what keeps a
  // packed struct's RMW inside the struct. Loads are zero-extending;
  // the mask/shift math below owns signedness.
  _bfUnitBytes(field) {
    return field.bfAccessBytes > 0 ? field.bfAccessBytes : field.type.size;
  }
  _bfUnitLoad(bytes) {
    if (bytes === 1) this.body.mop(MOP.I32_LOAD8_U, 0, 0);
    else if (bytes === 2) this.body.mop(MOP.I32_LOAD16_U, 0, 1);
    else if (bytes === 8) this.body.mop(MOP.I64_LOAD, 0, 3);
    else this.body.mop(MOP.I32_LOAD, 0, 2);
  }
  _bfUnitStore(bytes) {
    if (bytes === 1) this.body.mop(MOP.I32_STORE8, 0, 0);
    else if (bytes === 2) this.body.mop(MOP.I32_STORE16, 0, 1);
    else if (bytes === 8) this.body.mop(MOP.I64_STORE, 0, 3);
    else this.body.mop(MOP.I32_STORE, 0, 2);
  }
  emitBitFieldLoad(field) {
    const bw = field.bitWidth, bo = field.bitOffset;
    // An enum bit-field extends per its enum's compatible-type signedness
    // (C11 6.7.2.2p4), not the erased `int`: an all-non-negative enum is
    // unsigned int in clang/gcc, so the field zero-extends (todos/0189).
    const isUnsigned = field.enumBitField
      ? field.enumBitField.enumIsUnsigned()
      : this.isUnsignedType(field.type);
    const unitBytes = this._bfUnitBytes(field);
    // i32 path covers 1/2/4-byte windows; i64 path covers 8-byte storage
    // (8-byte units never narrow, so the value domain matches the type).
    const use64 = unitBytes === 8;
    this._bfUnitLoad(unitBytes);
    if (!use64) {
      if (bo !== 0) { this.body.i32Const(bo); this.body.aop(WT_I32, ALU.OP_SHR_U); }
      if (bw < 32) { this.body.i32Const((1 << bw) - 1); this.body.aop(WT_I32, ALU.OP_AND); }
      if (!isUnsigned && bw < 32) {
        const shift = 32 - bw;
        this.body.i32Const(shift); this.body.aop(WT_I32, ALU.OP_SHL);
        this.body.i32Const(shift); this.body.aop(WT_I32, ALU.OP_SHR_S);
      }
    } else {
      // 64-bit storage unit.
      if (bo !== 0) { this.body.i64Const(BigInt(bo)); this.body.aop(WT_I64, ALU.OP_SHR_U); }
      if (bw < 64) {
        const mask = (1n << BigInt(bw)) - 1n;
        this.body.i64Const(mask); this.body.aop(WT_I64, ALU.OP_AND);
      }
      if (!isUnsigned && bw < 64) {
        const shift = BigInt(64 - bw);
        this.body.i64Const(shift); this.body.aop(WT_I64, ALU.OP_SHL);
        this.body.i64Const(shift); this.body.aop(WT_I64, ALU.OP_SHR_S);
      }
    }
  }

  emitBitFieldStore(field) {
    const bw = field.bitWidth, bo = field.bitOffset;
    const unitBytes = this._bfUnitBytes(field);
    const unitBits = unitBytes * 8;  // 8, 16, 32, or 64
    const use64 = unitBytes === 8;
    // Full-width store: no read-modify-write needed.
    if (bw >= unitBits) { this._bfUnitStore(unitBytes); return; }

    if (!use64) {
      const mask = ((1 << bw) - 1) << bo;
      this.pushLocalScope();
      const valLocal = this.allocLocal(WT_I32);
      const addrLocal = this.allocLocal(WT_I32);
      this.body.localSet(valLocal);
      this.body.localSet(addrLocal);
      this.body.localGet(addrLocal);
      this._bfUnitLoad(unitBytes);
      this.body.i32Const(~mask);
      this.body.aop(WT_I32, ALU.OP_AND);
      this.body.localGet(valLocal);
      this.body.i32Const((1 << bw) - 1);
      this.body.aop(WT_I32, ALU.OP_AND);
      if (bo !== 0) { this.body.i32Const(bo); this.body.aop(WT_I32, ALU.OP_SHL); }
      this.body.aop(WT_I32, ALU.OP_OR);
      this.body.localSet(valLocal);
      this.body.localGet(addrLocal);
      this.body.localGet(valLocal);
      this._bfUnitStore(unitBytes);
      this.popLocalScope();
    } else {
      // 64-bit storage unit. Same shape as the i32 path but with i64 ops
      // and BigInt-encoded mask constants. The mask must use BigInt
      // throughout: JS bitwise ops on `Number` truncate to 32 bits.
      const widthMask = (1n << BigInt(bw)) - 1n;
      const mask = widthMask << BigInt(bo);
      const notMask = (~mask) & 0xFFFFFFFFFFFFFFFFn;  // clamp to 64 bits
      this.pushLocalScope();
      const valLocal = this.allocLocal(WT_I64);
      const addrLocal = this.allocLocal(WT_I32);
      this.body.localSet(valLocal);
      this.body.localSet(addrLocal);
      this.body.localGet(addrLocal);
      this._bfUnitLoad(unitBytes);
      this.body.i64Const(notMask);
      this.body.aop(WT_I64, ALU.OP_AND);
      this.body.localGet(valLocal);
      this.body.i64Const(widthMask);
      this.body.aop(WT_I64, ALU.OP_AND);
      if (bo !== 0) { this.body.i64Const(BigInt(bo)); this.body.aop(WT_I64, ALU.OP_SHL); }
      this.body.aop(WT_I64, ALU.OP_OR);
      this.body.localSet(valLocal);
      this.body.localGet(addrLocal);
      this.body.localGet(valLocal);
      this._bfUnitStore(unitBytes);
      this.popLocalScope();
    }
  }

  // --- VaArg load/store ---
  emitVaArgStore(type) {
    const wt = cToWasmType(type);
    if (wtEquals(wt, WT_I32)) this.body.mop(MOP.I32_STORE, 0, 2);
    else if (wtEquals(wt, WT_I64)) this.body.mop(MOP.I64_STORE, 0, 3);
    else if (wtEquals(wt, WT_F32)) this.body.mop(MOP.F32_STORE, 0, 2);
    else if (wtEquals(wt, WT_F64)) this.body.mop(MOP.F64_STORE, 0, 3);
  }

  // Release a variadic call's arg block: SP = base + blockSize, which also
  // reclaims the tracked struct-return temps deferred while evaluating the
  // arguments (deferredDelta of them sit directly below the block). The
  // release is CONDITIONAL on SP sitting exactly at base - deferredDelta —
  // i.e. only tracked movement happened during argument evaluation. A
  // callee that used alloca() returns with an UNTRACKED retained SP bump
  // (the caller-frees contract: the alloca'd region below the block must
  // survive this whole call), so on mismatch we leave SP alone and the
  // block leaks until the function epilogue — the alloca contract's
  // designated free point (todos/0208).
  emitVaBlockRelease(argBlockBase, blockSize, deferredDelta) {
    this.body.globalGet(this.stackPointerGlobalIdx);
    this.body.localGet(argBlockBase);
    if (deferredDelta > 0) {
      this.body.i32Const(deferredDelta);
      this.body.aop(WT_I32, ALU.OP_SUB);
    }
    this.body.aop(WT_I32, ALU.OP_EQ);
    this.body.if_(WT_EMPTY); this.blockDepth++;
    this.body.localGet(argBlockBase);
    this.body.i32Const(blockSize);
    this.body.aop(WT_I32, ALU.OP_ADD);
    this.body.globalSet(this.stackPointerGlobalIdx);
    this.blockDepth--; this.body.end();
  }

  emitVaArgLoad(type) {
    type = type.removeQualifiers();
    if (isStructOrUnion(type)) return; // struct: address IS the value
    if (type === Types.TCHAR || type === Types.TSCHAR) this.body.mop(MOP.I32_LOAD8_S, 0, 0);
    else if (type === Types.TUCHAR || type === Types.TBOOL) this.body.mop(MOP.I32_LOAD8_U, 0, 0);
    else if (type === Types.TSHORT) this.body.mop(MOP.I32_LOAD16_S, 0, 1);
    else if (type === Types.TUSHORT) this.body.mop(MOP.I32_LOAD16_U, 0, 1);
    else {
      const wt = cToWasmType(type);
      if (wtEquals(wt, WT_I32)) this.body.mop(MOP.I32_LOAD, 0, 2);
      else if (wtEquals(wt, WT_I64)) this.body.mop(MOP.I64_LOAD, 0, 3);
      else if (wtEquals(wt, WT_F32)) this.body.mop(MOP.F32_LOAD, 0, 2);
      else if (wtEquals(wt, WT_F64)) this.body.mop(MOP.F64_LOAD, 0, 3);
    }
  }

  // --- Condition/bool helpers ---
  emitConditionToI32(condType) {
    const wt = this.getBinaryWasmType(condType);
    // Ref → bool: not-null is true. Use ref.is_null then invert.
    if (wtIsRef(wt)) { this.body.refIsNull(); this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_EQ); }
    else if (wtEquals(wt, WT_F32)) { this.body.f32Const(0.0); this.body.aop(WT_F32, ALU.OP_NE); }
    else if (wtEquals(wt, WT_F64)) { this.body.f64Const(0.0); this.body.aop(WT_F64, ALU.OP_NE); }
    else if (wtEquals(wt, WT_I64)) { this.body.i64Const(0n); this.body.aop(WT_I64, ALU.OP_NE); }
  }

  emitBoolNormalize(type) {
    const wt = this.getBinaryWasmType(type);
    if (wtIsRef(wt)) { this.body.refIsNull(); this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_EQ); }
    else if (wtEquals(wt, WT_F32)) { this.body.f32Const(0.0); this.body.aop(WT_F32, ALU.OP_NE); }
    else if (wtEquals(wt, WT_F64)) { this.body.f64Const(0.0); this.body.aop(WT_F64, ALU.OP_NE); }
    else if (wtEquals(wt, WT_I64)) { this.body.i64Const(0n); this.body.aop(WT_I64, ALU.OP_NE); }
    else { this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_NE); }
  }

  // Emit float→int conversion. Defaults to saturating semantics
  // (WASM 2.0 trunc_sat: NaN→0, overflow→clamped INT_MIN/MAX), which
  // matches what most C runtimes do in practice and avoids surprise
  // traps from `(int)1e16` etc. With --trapping-float-conversions
  // (compilerOptions.trappingFloatConversions), revert to the WASM 1.0
  // trapping trunc that crashes on out-of-range — useful when you want
  // C99 §6.3.1.4 UB-as-crash for fuzzing/diagnostics.
  _emitFloatToInt(dstWt, srcWt, sign) {
    if (this.compilerOptions.trappingFloatConversions) {
      const aluOp = wtEquals(srcWt, WT_F32) ? ALU.OP_TRUNC_F32 : ALU.OP_TRUNC_F64;
      this.body.aop(dstWt, aluOp, sign);
    } else {
      this.body.truncSat(dstWt, srcWt, sign);
    }
  }

  // Emit narrowing for sub-i32 types (char, short).
  // WASM locals are always i32, so we must explicitly truncate after
  // any operation that may leave high bits set.
  emitSubIntNarrowing(toType) {
    toType = toType.removeQualifiers();
    if (toType === Types.TCHAR || toType === Types.TSCHAR) {
      this.body.i32Const(24); this.body.aop(WT_I32, ALU.OP_SHL);
      this.body.i32Const(24); this.body.aop(WT_I32, ALU.OP_SHR_S);
    } else if (toType === Types.TUCHAR) {
      this.body.i32Const(0xFF); this.body.aop(WT_I32, ALU.OP_AND);
    } else if (toType === Types.TSHORT) {
      this.body.i32Const(16); this.body.aop(WT_I32, ALU.OP_SHL);
      this.body.i32Const(16); this.body.aop(WT_I32, ALU.OP_SHR_S);
    } else if (toType === Types.TUSHORT) {
      this.body.i32Const(0xFFFF); this.body.aop(WT_I32, ALU.OP_AND);
    }
  }

  // --- Type conversion ---
  _isNullPointerConstantCG(expr) {
    if (!expr) return false;
    if (expr instanceof AST.EInt && expr.value === 0n) return true;
    if (expr instanceof AST.EImplicitCast || expr instanceof AST.ECast) {
      return this._isNullPointerConstantCG(expr.expr);
    }
    return false;
  }

  emitConversion(fromType, toType, fromExpr) {
    const fromWasm = this.getBinaryWasmType(fromType);
    const toWasm = this.getBinaryWasmType(toType);
    toType = toType.removeQualifiers();
    if (toType.isRef() && !wtIsRef(fromWasm)) {
      // Source is non-ref. Parse-time validation has already gated this:
      //   - Null pointer constant (literal 0 / NULL) → emit ref.null of target
      //   - Primitive into __eqref → auto-box (allocate internal box struct)
      //   - Other combinations would have errored at parse time.
      // We need the source expression to tell which branch this is.
      const fq = fromType.removeQualifiers();
      const isNullConst = fromExpr && this._isNullPointerConstantCG(fromExpr);
      if (toType === Types.TEQREF && fq.isArithmetic() && !isNullConst) {
        // Box: widen value to box storage type, then struct.new.
        const primWt = boxStorageWtFor(fq);
        const boxIdx = getOrCreateBoxStructIdx(this.wmod, primWt);
        const srcWt = this.getBinaryWasmType(fromType);
        if (!wtEquals(srcWt, primWt)) {
          if (wtEquals(primWt, WT_I64)) this.body.aop(WT_I64, ALU.OP_EXTEND_I32, !this.isUnsignedType(fromType));
          else if (wtEquals(primWt, WT_F64)) this.body.aop(WT_F64, ALU.OP_PROMOTE_F32);
        }
        this.body.structNew(boxIdx);
        return;
      }
      // Otherwise: ref.null of the target ref type.
      this.body.drop();
      if (toWasm.heapIsIdx) this.body.refNullIdx(toWasm.heap);
      else this.body.refNull(toWasm.heap);
      return;
    }
    if (toType === Types.TBOOL) {
      // Refs as bool are rejected at parse time (use __ref_is_null instead).
      if (wtEquals(fromWasm, WT_I32)) { this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_NE); }
      else if (wtEquals(fromWasm, WT_I64)) { this.body.i64Const(0n); this.body.aop(WT_I64, ALU.OP_NE); }
      else if (wtEquals(fromWasm, WT_F32)) { this.body.f32Const(0.0); this.body.aop(WT_F32, ALU.OP_NE); }
      else if (wtEquals(fromWasm, WT_F64)) { this.body.f64Const(0.0); this.body.aop(WT_F64, ALU.OP_NE); }
      return;
    }
    if (wtEquals(fromWasm, toWasm)) {
      if (wtEquals(fromWasm, WT_I32)) this.emitSubIntNarrowing(toType);
      return;
    }
    const fromSigned = !this.isUnsignedType(fromType);
    const toSigned = !this.isUnsignedType(toType);
    if (wtEquals(fromWasm, WT_I32) && wtEquals(toWasm, WT_I64)) this.body.aop(WT_I64, ALU.OP_EXTEND_I32, fromSigned);
    else if (wtEquals(fromWasm, WT_I64) && wtEquals(toWasm, WT_I32)) { this.body.aop(WT_I32, ALU.OP_WRAP_I64); this.emitSubIntNarrowing(toType); }
    else if (wtEquals(fromWasm, WT_I32) && wtEquals(toWasm, WT_F32)) this.body.aop(WT_F32, ALU.OP_CONVERT_I32, fromSigned);
    else if (wtEquals(fromWasm, WT_I32) && wtEquals(toWasm, WT_F64)) this.body.aop(WT_F64, ALU.OP_CONVERT_I32, fromSigned);
    else if (wtEquals(fromWasm, WT_I64) && wtEquals(toWasm, WT_F32)) this.body.aop(WT_F32, ALU.OP_CONVERT_I64, fromSigned);
    else if (wtEquals(fromWasm, WT_I64) && wtEquals(toWasm, WT_F64)) this.body.aop(WT_F64, ALU.OP_CONVERT_I64, fromSigned);
    else if (wtEquals(fromWasm, WT_F32) && wtEquals(toWasm, WT_I32)) { this._emitFloatToInt(WT_I32, WT_F32, toSigned); this.emitSubIntNarrowing(toType); }
    else if (wtEquals(fromWasm, WT_F32) && wtEquals(toWasm, WT_I64)) this._emitFloatToInt(WT_I64, WT_F32, toSigned);
    else if (wtEquals(fromWasm, WT_F64) && wtEquals(toWasm, WT_I32)) { this._emitFloatToInt(WT_I32, WT_F64, toSigned); this.emitSubIntNarrowing(toType); }
    else if (wtEquals(fromWasm, WT_F64) && wtEquals(toWasm, WT_I64)) this._emitFloatToInt(WT_I64, WT_F64, toSigned);
    else if (wtEquals(fromWasm, WT_F32) && wtEquals(toWasm, WT_F64)) this.body.aop(WT_F64, ALU.OP_PROMOTE_F32);
    else if (wtEquals(fromWasm, WT_F64) && wtEquals(toWasm, WT_F32)) this.body.aop(WT_F32, ALU.OP_DEMOTE_F64);
  }

  // --- LValue ---
  emitLValue(expr) {
    if (expr instanceof AST.EIdent && expr.decl && expr.decl instanceof AST.DVar) {
      const varDecl = expr.decl.definition || expr.decl;
      const lit = this.localVarToWasmLocalIdx.get(varDecl);
      const git = this.globalVarToWasmGlobalIdx.get(varDecl);
      if ((lit !== undefined || git !== undefined) && varDecl.allocClass !== Types.AllocClass.MEMORY) {
        return { kind: LV_REGISTER, type: varDecl.type, regIndex: lit !== undefined ? lit : git, regIsGlobal: git !== undefined };
      }
      const gait = this.globalArrayAddrs.get(varDecl);
      if (gait !== undefined) return { kind: LV_MEMORY, type: varDecl.type, addrSource: LV_ADDR_STATIC, addrImmediate: gait };
      const lait = this.localArrayOffsets.get(varDecl);
      if (lait !== undefined) return { kind: LV_MEMORY, type: varDecl.type, addrSource: LV_ADDR_FRAME, addrImmediate: lait };
      const pait = this.paramMemoryOffsets.get(varDecl);
      if (pait !== undefined) return { kind: LV_MEMORY, type: varDecl.type, addrSource: LV_ADDR_FRAME, addrImmediate: pait };
      throw new Error(`emitLValue: variable '${varDecl.name}' not found`);
    }
    if (expr instanceof AST.EMember) {
      const baseT = expr.base.type.removeQualifiers();
      if (baseT.isGCStruct()) {
        const refWt = this.getBinaryWasmType(baseT);
        this.emitExpr(expr.base);
        const refLocal = this.allocLocal(refWt);
        this.body.localSet(refLocal);
        return {
          kind: LV_GC_STRUCT_FIELD, type: expr.type,
          gcTypeIdx: getOrCreateGCWasmTypeIdx(this.wmod, baseT),
          gcFieldIdx: expr.memberDecl.byteOffset,
          savedRefLocal: refLocal,
        };
      }
      this.emitAddressOf(expr);
      const lv = { kind: LV_MEMORY, type: expr.type, bitField: expr.memberDecl.bitWidth >= 0 ? expr.memberDecl : null, addrSource: LV_ADDR_LOCAL };
      lv.savedLocal = this.allocLocal(WT_I32);
      this.body.localSet(lv.savedLocal);
      return lv;
    }
    if (expr instanceof AST.EArrow) {
      this.emitAddressOf(expr);
      const lv = { kind: LV_MEMORY, type: expr.type, bitField: expr.memberDecl.bitWidth >= 0 ? expr.memberDecl : null, addrSource: LV_ADDR_LOCAL };
      lv.savedLocal = this.allocLocal(WT_I32);
      this.body.localSet(lv.savedLocal);
      return lv;
    }
    if (expr instanceof AST.ESubscript) {
      const arrT = expr.array.type.removeQualifiers();
      if (arrT.isGCArray()) {
        const refWt = this.getBinaryWasmType(arrT);
        this.emitExpr(expr.array);
        const refLocal = this.allocLocal(refWt);
        this.body.localSet(refLocal);
        this.emitExpr(expr.index);
        if (wtEquals(this.getBinaryWasmType(expr.index.type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
        const idxLocal = this.allocLocal(WT_I32);
        this.body.localSet(idxLocal);
        return {
          kind: LV_GC_ARRAY_ELEM, type: expr.type,
          gcTypeIdx: getOrCreateGCWasmTypeIdx(this.wmod, arrT),
          savedRefLocal: refLocal, savedIdxLocal: idxLocal,
        };
      }
      this.emitExpr(expr.array);
      this.emitPointerOffset(expr.index, expr.type);
      this.body.aop(WT_I32, ALU.OP_ADD);
      const lv = { kind: LV_MEMORY, type: expr.type, addrSource: LV_ADDR_LOCAL };
      lv.savedLocal = this.allocLocal(WT_I32);
      this.body.localSet(lv.savedLocal);
      return lv;
    }
    if (expr instanceof AST.EUnary && expr.op === "OP_DEREF") {
      this.emitExpr(expr.operand);
      const lv = { kind: LV_MEMORY, type: expr.type, addrSource: LV_ADDR_LOCAL };
      lv.savedLocal = this.allocLocal(WT_I32);
      this.body.localSet(lv.savedLocal);
      return lv;
    }
    if (expr instanceof AST.ECompoundLiteral) {
      // C11 6.5.2.5p4: a compound literal IS an lvalue. Its backing
      // storage is the same slot emitAddressOf uses — a static
      // allocation at file scope, a frame slot at block scope.
      // Materialize the initializer into the slot, then hand back the
      // slot's address; `&`, assignment and ++/-- all flow through the
      // normal lvalue paths from here.
      const fsAddr = this.fileScopeCompoundLiteralAddrs.get(expr);
      if (fsAddr !== undefined) {
        return { kind: LV_MEMORY, type: expr.type, addrSource: LV_ADDR_STATIC, addrImmediate: fsAddr };
      }
      this.emitCompoundLiteralInit(expr);
      return { kind: LV_MEMORY, type: expr.type, addrSource: LV_ADDR_FRAME, addrImmediate: this.compoundLiteralOffsets.get(expr) };
    }
    // Sema's lvalue checks (makeBinary/makeUnary) reject every non-lvalue
    // before codegen — reaching here is a compiler invariant violation,
    // not a user error.
    throw new Error(`internal: emitLValue on non-lvalue expression ${expr.constructor.name} (sema should have rejected this)`);
  }

  lvaluePush(lv) {
    if (lv.kind === LV_REGISTER) return;
    if (lv.kind === LV_MEMORY) {
      if (lv.addrSource === LV_ADDR_LOCAL) this.body.localGet(lv.savedLocal);
      else if (lv.addrSource === LV_ADDR_STATIC) this.body.i32Const(lv.addrImmediate);
      else if (lv.addrSource === LV_ADDR_FRAME) this.emitFrameAddr(lv.addrImmediate);
    } else if (lv.kind === LV_GC_STRUCT_FIELD) {
      this.body.localGet(lv.savedRefLocal);
    } else if (lv.kind === LV_GC_ARRAY_ELEM) {
      this.body.localGet(lv.savedRefLocal);
      this.body.localGet(lv.savedIdxLocal);
    }
  }

  lvalueLoad(lv) {
    if (lv.kind === LV_REGISTER) {
      if (lv.regIsGlobal) this.body.globalGet(lv.regIndex);
      else this.body.localGet(lv.regIndex);
    } else if (lv.kind === LV_MEMORY) {
      if (lv.bitField) this.emitBitFieldLoad(lv.bitField);
      else this.emitLoad(lv.type);
    } else if (lv.kind === LV_GC_STRUCT_FIELD) {
      if (isPackedSubI32(lv.type)) {
        if (isSignedSubI32(lv.type)) this.body.structGetS(lv.gcTypeIdx, lv.gcFieldIdx);
        else this.body.structGetU(lv.gcTypeIdx, lv.gcFieldIdx);
      } else this.body.structGet(lv.gcTypeIdx, lv.gcFieldIdx);
    } else if (lv.kind === LV_GC_ARRAY_ELEM) {
      if (isPackedSubI32(lv.type)) {
        if (isSignedSubI32(lv.type)) this.body.arrayGetS(lv.gcTypeIdx);
        else this.body.arrayGetU(lv.gcTypeIdx);
      } else this.body.arrayGet(lv.gcTypeIdx);
    }
  }

  lvalueStore(lv) {
    if (lv.kind === LV_REGISTER) {
      if (lv.regIsGlobal) this.body.globalSet(lv.regIndex);
      else this.body.localSet(lv.regIndex);
    } else if (lv.kind === LV_MEMORY) {
      if (lv.bitField) this.emitBitFieldStore(lv.bitField);
      else this.emitStore(lv.type);
    } else if (lv.kind === LV_GC_STRUCT_FIELD) {
      this.body.structSet(lv.gcTypeIdx, lv.gcFieldIdx);
    } else if (lv.kind === LV_GC_ARRAY_ELEM) {
      this.body.arraySet(lv.gcTypeIdx);
    }
  }

  lvaluePushAndLoad(lv) { this.lvaluePush(lv); this.lvalueLoad(lv); }

  // --- Address-of ---
  emitAddressOf(expr) {
    if (expr instanceof AST.EIdent) {
      if (expr.decl instanceof AST.DFunc) {
        const func = expr.decl.definition || expr.decl;
        const tIdx = this._funcAddrEscape(func);
        this.body.i32Const(tIdx);
        return;
      }
      if (expr.decl instanceof AST.DVar) {
        const varDecl = expr.decl.definition || expr.decl;
        const gait = this.globalArrayAddrs.get(varDecl);
        if (gait !== undefined) { this.body.i32Const(gait); return; }
        const lait = this.localArrayOffsets.get(varDecl);
        if (lait !== undefined) { this.emitFrameAddr(lait); return; }
        const pait = this.paramMemoryOffsets.get(varDecl);
        if (pait !== undefined) { this.emitFrameAddr(pait); return; }
        throw new Error(`Cannot take address of REGISTER variable '${varDecl.name}'`);
      }
    }
    if (expr instanceof AST.EMember) {
      this.emitAddressOf(expr.base);
      const tag = expr.base.type.tagDecl;
      const offset = this.getFieldOffset(tag, expr.memberDecl);
      if (offset) { this.body.i32Const(offset); this.body.aop(WT_I32, ALU.OP_ADD); }
      return;
    }
    if (expr instanceof AST.EArrow) {
      this.emitExpr(expr.base);
      const baseType = expr.base.type.baseType;
      const tag = baseType.tagDecl;
      const offset = this.getFieldOffset(tag, expr.memberDecl);
      if (offset) { this.body.i32Const(offset); this.body.aop(WT_I32, ALU.OP_ADD); }
      return;
    }
    if (expr instanceof AST.ESubscript) {
      this.emitExpr(expr.array);
      this.emitPointerOffset(expr.index, expr.type);
      this.body.aop(WT_I32, ALU.OP_ADD);
      return;
    }
    if (expr instanceof AST.EUnary && expr.op === "OP_DEREF") {
      this.emitExpr(expr.operand);
      return;
    }
    if (expr instanceof AST.ECompoundLiteral) {
      const fsAddr = this.fileScopeCompoundLiteralAddrs.get(expr);
      if (fsAddr !== undefined) { this.body.i32Const(fsAddr); }
      else {
        this.emitCompoundLiteralInit(expr);
        this.emitFrameAddr(this.compoundLiteralOffsets.get(expr));
      }
      return;
    }
    throw new Error(`emitAddressOf: unsupported expression ${expr.constructor.name}`);
  }

  // --- Binary ALU op ---
  // THE op → ALU opcode+signedness table: the sole place a C binary op
  // picks a wasm ALU opcode. Plain binaries pass their op directly;
  // compound assigns route through baseOpOfCompound (so a signedness fix
  // here covers both forms — compares never arrive from the compound
  // path). SHR selects OP_SHR_U/OP_SHR_S explicitly because ALU has no
  // flag-form OP_SHR; DIV/MOD/compares pass signedness as aop's flag.
  emitBinaryAluOp(op, wt, isUnsigned) {
    switch (op) {
      case "ADD": this.body.aop(wt, ALU.OP_ADD); break;
      case "SUB": this.body.aop(wt, ALU.OP_SUB); break;
      case "MUL": this.body.aop(wt, ALU.OP_MUL); break;
      case "DIV": this.body.aop(wt, ALU.OP_DIV, !isUnsigned); break;
      case "MOD": this.body.aop(wt, ALU.OP_REM, !isUnsigned); break;
      case "EQ": this.body.aop(wt, ALU.OP_EQ); break;
      case "NE": this.body.aop(wt, ALU.OP_NE); break;
      case "LT": this.body.aop(wt, ALU.OP_LT, !isUnsigned); break;
      case "GT": this.body.aop(wt, ALU.OP_GT, !isUnsigned); break;
      case "LE": this.body.aop(wt, ALU.OP_LE, !isUnsigned); break;
      case "GE": this.body.aop(wt, ALU.OP_GE, !isUnsigned); break;
      case "BAND": this.body.aop(wt, ALU.OP_AND); break;
      case "BOR": this.body.aop(wt, ALU.OP_OR); break;
      case "BXOR": this.body.aop(wt, ALU.OP_XOR); break;
      case "SHL": this.body.aop(wt, ALU.OP_SHL); break;
      case "SHR": this.body.aop(wt, isUnsigned ? ALU.OP_SHR_U : ALU.OP_SHR_S); break;
      default: throw new Error(`emitBinaryAluOp: unsupported op ${op}`);
    }
  }

  // --- Assignment ---
  emitAssignment(expr, ctx) {
    const lhs = expr.left, rhs = expr.right, op = expr.op;
    const lhsType = lhs.type;
    const wantValue = ctx === EXPR_VALUE;
    this.pushLocalScope();
    const lv = this.emitLValue(lhs);
    if (op === "ASSIGN") {
      if (lv.kind !== LV_REGISTER && isStructOrUnion(lhsType)) {
        this.lvaluePush(lv); this.emitExpr(rhs);
        this.body.i32Const(this.sizeOf(lhsType)); this.body.memoryCopy();
        if (wantValue) this.lvaluePush(lv);
      } else {
        this.lvaluePush(lv); this.emitExpr(rhs);
        this.emitConversion(rhs.type, lhsType, rhs);
        if (wantValue && !lv.bitField) {
          const vt = this.allocLocal(cToWasmType(lhsType, this.wmod));
          this.body.localTee(vt); this.lvalueStore(lv); this.body.localGet(vt);
        } else {
          this.lvalueStore(lv);
          if (wantValue) this.lvaluePushAndLoad(lv);
        }
      }
    } else {
      const rhsType = rhs.type;
      let opType = lhsType;
      if (!lhsType.isPointer()) {
        // Shifts compute in the PROMOTED LEFT type (C11 6.5.7p3 via
        // 6.5.16.2p3) — usual arithmetic conversions would let an
        // unsigned right operand turn `int >>= n` into a logical shift.
        // UAC(lhs, lhs) is exactly "promoted lhs".
        opType = (op === "SHL_ASSIGN" || op === "SHR_ASSIGN")
          ? Types.usualArithmeticConversions(lhsType, lhsType)
          : Types.usualArithmeticConversions(lhsType, rhsType);
      }
      const opWt = this.getBinaryWasmType(opType);
      const isUnsigned = this.isUnsignedType(opType);
      this.lvaluePush(lv); this.lvaluePushAndLoad(lv);
      this.emitConversion(lhsType, opType);
      this.emitExpr(rhs);
      this.emitConversion(rhsType, opType);
      if (lhsType.isPointer() && (op === "ADD_ASSIGN" || op === "SUB_ASSIGN")) {
        this.emitScaleByElemSize(lhsType.baseType);
      }
      this.emitBinaryAluOp(AST.baseOpOfCompound(op), opWt, isUnsigned);
      if (opType !== lhsType) this.emitConversion(opType, lhsType);
      // Same rule as emitIncDec: the assignment's value has the lvalue's
      // type after conversion (6.5.16p3) — narrow/_Bool-normalize for
      // memory lvalues too, not just register ones.
      if (lhsType.isInteger() && lhsType.size < Types.TINT.size) {
        this.emitConversion(Types.TINT, lhsType);
      }
      if (wantValue && !lv.bitField) {
        const vt = this.allocLocal(this.getBinaryWasmType(lhsType));
        this.body.localTee(vt); this.lvalueStore(lv); this.body.localGet(vt);
      } else {
        this.lvalueStore(lv);
        if (wantValue) this.lvaluePushAndLoad(lv);
      }
    }
    this.popLocalScope();
  }

  // --- Inc/Dec ---
  emitIncDec(expr, ctx) {
    const operand = expr.operand;
    const isIncrement = expr.op === "OP_PRE_INC" || expr.op === "OP_POST_INC";
    const isPre = expr.op === "OP_PRE_INC" || expr.op === "OP_PRE_DEC";
    const wantValue = ctx === EXPR_VALUE;
    const type = operand.type;
    this.pushLocalScope();
    const lv = this.emitLValue(operand);
    const wt = this.getBinaryWasmType(type);
    const emitDelta = () => {
      if (type.isPointer()) {
        const d = this.ptrArithElemSize(type.baseType);
        if (wtEquals(wt, WT_I32)) this.body.i32Const(d); else this.body.i64Const(BigInt(d));
      } else if (wtEquals(wt, WT_F32)) this.body.f32Const(1.0);
      else if (wtEquals(wt, WT_F64)) this.body.f64Const(1.0);
      else if (wtEquals(wt, WT_I64)) this.body.i64Const(1n);
      else this.body.i32Const(1);
    };
    // The value of ++E/E-- is the new/old value of E *as E's type* (C11
    // 6.5.3.1): narrow-type wraparound and _Bool's !=0 normalization apply
    // no matter where E lives. Gating this on LV_REGISTER used to make
    // `++*p` on char 127 yield 128 (and store 2 into a _Bool — the memory
    // store truncates bits, but 2 & 0xff is still 2).
    const needsNarrowing = wtEquals(wt, WT_I32) &&
      type.isInteger() && type.size < Types.TINT.size && !type.isPointer();
    if (isPre) {
      this.lvaluePush(lv); this.lvaluePushAndLoad(lv);
      emitDelta();
      this.body.aop(wt, isIncrement ? ALU.OP_ADD : ALU.OP_SUB);
      if (needsNarrowing) this.emitConversion(Types.TINT, type);
      if (wantValue && !lv.bitField) {
        const vt = this.allocLocal(wt);
        this.body.localTee(vt); this.lvalueStore(lv); this.body.localGet(vt);
      } else {
        this.lvalueStore(lv);
        if (wantValue) this.lvaluePushAndLoad(lv);
      }
    } else {
      this.lvaluePush(lv); this.lvaluePushAndLoad(lv);
      let oldTemp = 0;
      if (wantValue) { oldTemp = this.allocLocal(wt); this.body.localTee(oldTemp); }
      emitDelta();
      this.body.aop(wt, isIncrement ? ALU.OP_ADD : ALU.OP_SUB);
      if (needsNarrowing) this.emitConversion(Types.TINT, type);
      this.lvalueStore(lv);
      if (wantValue) this.body.localGet(oldTemp);
    }
    this.popLocalScope();
  }

  // --- Expression emission ---
  emitExpr(expr, ctx) {
    if (!ctx) ctx = EXPR_VALUE;
    switch (expr.constructor) {
      case AST.EInt: {
        const type = expr.type;
        if (type === Types.TLLONG || type === Types.TULLONG) {
          this.body.i64Const(expr.value);
        } else {
          this.body.i32Const(Number(BigInt.asIntN(32, expr.value)));
        }
        break;
      }
      case AST.EFloat: {
        if (expr.type.removeQualifiers() === Types.TFLOAT) this.body.f32Const(expr.value);
        else this.body.f64Const(expr.value);
        break;
      }
      case AST.EString: {
        const addr = this.getStringAddress(expr.value);
        this.body.i32Const(addr);
        break;
      }
      case AST.EIdent: {
        if (expr.decl instanceof AST.DVar) {
          const varDecl = expr.decl.definition || expr.decl;
          const gait = this.globalArrayAddrs.get(varDecl);
          if (gait !== undefined) {
            this.body.i32Const(gait);
            this.emitLoadIfScalar(varDecl.type);
            break;
          }
          const lait = this.localArrayOffsets.get(varDecl);
          if (lait !== undefined) {
            this.emitFrameAddr(lait);
            this.emitLoadIfScalar(varDecl.type);
            break;
          }
          const pait = this.paramMemoryOffsets.get(varDecl);
          if (pait !== undefined) {
            this.emitFrameAddr(pait);
            this.emitLoadIfScalar(varDecl.type);
            break;
          }
          const lit = this.localVarToWasmLocalIdx.get(varDecl);
          if (lit !== undefined) { this.body.localGet(lit); }
          else {
            const git = this.globalVarToWasmGlobalIdx.get(varDecl);
            if (git !== undefined) this.body.globalGet(git);
            else throw new Error(`emitExpr: variable '${varDecl.name}' not found`);
          }
        } else if (expr.decl instanceof AST.DEnumConst) {
          this.body.i32Const(expr.decl.value);
        } else if (expr.decl instanceof AST.DFunc) {
          const func = expr.decl.definition || expr.decl;
          const tIdx = this._funcAddrEscape(func);
          this.body.i32Const(tIdx);
        }
        break;
      }
      case AST.EBinary: {
        const meta = AST.BinOp[expr.op];
        if (meta.isAssign) {
          this.emitAssignment(expr, ctx);
          return;
        }
        const leftType = expr.left.type, rightType = expr.right.type;
        const isComparison = meta.isCompare;
        const wt = this.getBinaryWasmType(isComparison ? leftType : expr.type);
        const isUnsigned = this.isUnsignedType(leftType);
        // Pointer arithmetic — element type is whichever side is a
        // pointer/array (only one side for ADD; left side for SUB).
        const elemType = AST.pointerArithElemType(leftType, rightType);
        if (expr.op === "ADD" && elemType) {
          const leftIsPtr = leftType.isPointer() || leftType.isArray();
          const ptrExpr = leftIsPtr ? expr.left : expr.right;
          const intExpr = leftIsPtr ? expr.right : expr.left;
          this.emitExpr(ptrExpr);
          this.emitPointerOffset(intExpr, elemType);
          this.body.aop(WT_I32, ALU.OP_ADD);
          break;
        }
        if (expr.op === "SUB" && elemType) {
          if (rightType.isPointer() || rightType.isArray()) {
            this.emitExpr(expr.left); this.emitExpr(expr.right);
            this.body.aop(WT_I32, ALU.OP_SUB);
            this.emitDivByElemSize(elemType);
          } else {
            this.emitExpr(expr.left);
            this.emitPointerOffset(expr.right, elemType);
            this.body.aop(WT_I32, ALU.OP_SUB);
          }
          break;
        }
        // Short-circuit
        if (expr.op === "LAND") {
          this.emitExpr(expr.left); this.emitBoolNormalize(leftType);
          this.body.if_(WT_I32);
          this.emitExpr(expr.right); this.emitBoolNormalize(rightType);
          this.body.else_(); this.body.i32Const(0); this.body.end();
          break;
        }
        if (expr.op === "LOR") {
          this.emitExpr(expr.left); this.emitBoolNormalize(leftType);
          this.body.if_(WT_I32); this.body.i32Const(1);
          this.body.else_(); this.emitExpr(expr.right); this.emitBoolNormalize(rightType); this.body.end();
          break;
        }
        // Refs in == / != : null compare against literal 0, or identity
        // between two refs (= ref.eq).
        const lRef = leftType.removeQualifiers().isRef();
        const rRef = rightType.removeQualifiers().isRef();
        if (isComparison && (lRef || rRef)) {
          if (lRef && rRef) {
            // Identity compare via ref.eq
            this.emitExpr(expr.left); this.emitExpr(expr.right);
            this.body.refEq();
            if (expr.op === "NE") { this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_EQ); }
          } else {
            // Null compare: emit ref.is_null on the ref operand.
            const refExpr = lRef ? expr.left : expr.right;
            this.emitExpr(refExpr);
            this.body.refIsNull();
            if (expr.op === "NE") { this.body.i32Const(0); this.body.aop(WT_I32, ALU.OP_EQ); }
          }
          break;
        }
        this.emitExpr(expr.left); this.emitExpr(expr.right);
        this.emitBinaryAluOp(expr.op, wt, isUnsigned);
        break;
      }
      case AST.EUnary: {
        const operandType = expr.operand.type;
        switch (expr.op) {
          case "OP_NEG": {
            const wt = this.getBinaryWasmType(operandType);
            if (wtEquals(wt, WT_F32) || wtEquals(wt, WT_F64)) {
              this.emitExpr(expr.operand); this.body.aop(wt, ALU.OP_NEG);
            } else {
              if (wtEquals(wt, WT_I32)) this.body.i32Const(0); else this.body.i64Const(0n);
              this.emitExpr(expr.operand); this.body.aop(wt, ALU.OP_SUB);
            }
            break;
          }
          case "OP_POS": this.emitExpr(expr.operand); break;
          case "OP_LNOT": {
            this.emitExpr(expr.operand);
            const wt = this.getBinaryWasmType(operandType);
            if (wtIsRef(wt)) { this.body.refIsNull(); }
            else if (wtEquals(wt, WT_F32)) { this.body.f32Const(0.0); this.body.aop(WT_F32, ALU.OP_EQ); }
            else if (wtEquals(wt, WT_F64)) { this.body.f64Const(0.0); this.body.aop(WT_F64, ALU.OP_EQ); }
            else this.body.aop(wt, ALU.OP_EQZ);
            break;
          }
          case "OP_BNOT": {
            const wt = this.getBinaryWasmType(operandType);
            this.emitExpr(expr.operand);
            if (wtEquals(wt, WT_I32)) this.body.i32Const(-1); else this.body.i64Const(-1n);
            this.body.aop(wt, ALU.OP_XOR);
            break;
          }
          case "OP_PRE_INC": case "OP_PRE_DEC": case "OP_POST_INC": case "OP_POST_DEC":
            this.emitIncDec(expr, ctx); return;
          case "OP_DEREF":
            this.emitExpr(expr.operand);
            this.emitLoadIfScalar(expr.type);
            break;
          case "OP_ADDR":
            this.emitAddressOf(expr.operand);
            break;
        }
        break;
      }
      case AST.ECall: {
        const funcDecl = expr.funcDecl;
        if (funcDecl) {
          const funcDef = funcDecl.definition || funcDecl;
          const funcType = funcDef.type;
          const funcIdx = this.funcDefToWasmFuncIdx.get(funcDef);
          if (funcIdx === undefined) throw new Error(`emitExpr: function '${funcDef.name}' not found`);
          if (funcType.isVarArg) {
            // Variadic call — new convention: all args + return in arg block
            const varRetType = funcType.getReturnType();
            const paramTypes = funcType.getParamTypes();
            const numFixed = paramTypes.length;

            const varStructRet = isStructOrUnion(varRetType);
            const retSlotSize = (varRetType === Types.TVOID) ? 0 : vaSlotSize(varRetType);

            // Compute arg block layout
            let blockSize = retSlotSize;
            const argOffsets = [];
            for (let i = 0; i < expr.arguments.length; i++) {
              argOffsets.push(blockSize);
              let argType;
              if (i < numFixed) {
                argType = paramTypes[i];
              } else {
                argType = expr.arguments[i].type;
                if (argType.removeQualifiers() === Types.TFLOAT) argType = Types.TDOUBLE;
              }
              blockSize += vaSlotSize(argType);
            }
            blockSize = (blockSize + 7) & ~7;

            this.callNesting++;

            // Allocate arg block
            this.body.globalGet(this.stackPointerGlobalIdx);
            this.body.i32Const(blockSize);
            this.body.aop(WT_I32, ALU.OP_SUB);
            this.body.globalSet(this.stackPointerGlobalIdx);

            this.pushLocalScope();
            const argBlockBase = this.allocLocal(WT_I32);
            this.body.globalGet(this.stackPointerGlobalIdx);
            this.body.localSet(argBlockBase);

            const deferredAtVaAlloc = this.structRetDeferred;

            // Store each argument
            for (let i = 0; i < expr.arguments.length; i++) {
              const arg = expr.arguments[i];
              const isFixed = i < numFixed;
              let storeType;
              if (isFixed) {
                storeType = paramTypes[i];
              } else {
                storeType = arg.type;
                if (storeType.removeQualifiers() === Types.TFLOAT) storeType = Types.TDOUBLE;
              }

              this.body.localGet(argBlockBase);
              if (argOffsets[i] > 0) { this.body.i32Const(argOffsets[i]); this.body.aop(WT_I32, ALU.OP_ADD); }

              if (isStructOrUnion(storeType)) {
                this.emitExpr(arg);
                this.body.i32Const(this.sizeOf(storeType));
                this.body.memoryCopy();
              } else {
                this.emitExpr(arg);
                this.emitVaArgStore(storeType);
              }

              // NB: argBlockBase stays FIXED — the block never moves, and
              // per-arg store addresses are pushed before each evaluation.
              // (It used to be recomputed from live SP here, which went
              // stale when a callee's alloca() retained an untracked SP
              // bump — the callee then got a garbage block pointer,
              // todos/0208.)
            }

            // Push arg block pointer and call
            this.body.localGet(argBlockBase);
            this.body.call(funcIdx);

            // Load return value from arg block
            if (varStructRet) {
              this.body.localGet(argBlockBase);
              this.structRetDeferred += blockSize;
            } else if (varRetType !== Types.TVOID) {
              this.body.localGet(argBlockBase);
              this.emitVaArgLoad(varRetType);
              this.emitVaBlockRelease(argBlockBase, blockSize,
                this.structRetDeferred - deferredAtVaAlloc);
              // The release also reclaims the struct-return temps deferred
              // while evaluating the arguments — drop them from the counter
              // so the callNesting==0 fixup doesn't restore them a second
              // time and leak SP upward.
              this.structRetDeferred = deferredAtVaAlloc;
            } else {
              this.emitVaBlockRelease(argBlockBase, blockSize,
                this.structRetDeferred - deferredAtVaAlloc);
              this.body.i32Const(0);
              // See scalar-return branch above.
              this.structRetDeferred = deferredAtVaAlloc;
            }

            this.popLocalScope();

            this.callNesting--;
            if (this.callNesting === 0 && this.structRetDeferred > 0) {
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(this.structRetDeferred);
              this.body.aop(WT_I32, ALU.OP_ADD);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.structRetDeferred = 0;
            }
          } else {
            // Non-variadic direct call
            const callRetType = funcType.getReturnType();
            const callParamTypes = funcType.getParamTypes();
            // Calls bound through an UNPROTOTYPED decl (`int f();`, implicit
            // decls): sema pushed default-promoted args with no arity check,
            // but the wasm call must match the DEFINITION's signature
            // exactly. Diagnose arg-count skew (C89 UB — an invalid module
            // is never the right outcome) and reconcile promoted scalar
            // types per-arg below (todos/0159).
            const viaUnprototyped = !!funcDecl.type.removeQualifiers().hasUnspecifiedParams;
            if (viaUnprototyped && expr.arguments.length !== callParamTypes.length) {
              const what = funcDef.body
                ? `the definition takes ${callParamTypes.length}`
                : `no visible definition types the call`;
              this.gotoErrors.push({
                message: `call to unprototyped function '${funcDef.name}' with ` +
                         `${expr.arguments.length} argument(s), but ${what} ` +
                         `(in function '${this.currentFuncDef?.name || '?'}')`,
                filename: expr.loc?.filename || '?',
                line: expr.loc?.line || 0,
              });
              this.body.unreachable();
              break;
            }
            const structRet = isStructOrUnion(callRetType);
            let structRetAllocSize = 0;
            this.callNesting++;
            if (structRet) {
              const retSize = this.sizeOf(callRetType);
              structRetAllocSize = (retSize + 15) & ~15;
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(structRetAllocSize);
              this.body.aop(WT_I32, ALU.OP_SUB);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.body.globalGet(this.stackPointerGlobalIdx);
            }
            for (let i = 0; i < expr.arguments.length; i++) {
              this.emitExpr(expr.arguments[i]);
              if (viaUnprototyped && i < callParamTypes.length &&
                  !isStructOrUnion(expr.arguments[i].type) && !isStructOrUnion(callParamTypes[i])) {
                // Promoted arg vs the definition's declared param: demote
                // f64 back to a prototyped f32 param, widen/wrap int sizes.
                // Same-wasm-type pairs are a no-op inside emitConversion
                // except sub-int narrowing, which the callee's own loads
                // already handle — so gate on a real wasm-type difference.
                const wtArg = this.getBinaryWasmType(expr.arguments[i].type);
                const wtParam = this.getBinaryWasmType(callParamTypes[i]);
                if (!wtEquals(wtArg, wtParam)) {
                  this.emitConversion(expr.arguments[i].type, callParamTypes[i], expr.arguments[i]);
                }
              }
            }
            this.body.call(funcIdx);
            if (structRet) this.structRetDeferred += structRetAllocSize;
            this.callNesting--;
            if (this.callNesting === 0 && this.structRetDeferred > 0) {
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(this.structRetDeferred);
              this.body.aop(WT_I32, ALU.OP_ADD);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.structRetDeferred = 0;
            }
          }
        } else {
          // Indirect call. expr.callee is already decayed by the parser
          // (see parsePostfixTail: ECall callee path), so callee.type is
          // a plain pointer-to-function (or function type itself).
          const calleeType = expr.callee.type;
          let funcType = calleeType.isPointer() ? calleeType.baseType : calleeType;
          funcType = funcType.removeQualifiers();
          // Empty-parens function-pointer call (todos/0159): the pointer
          // type carries no params, but sema default-promoted the args
          // (C89 6.5.2.2p6). Type the call_indirect off the promoted
          // ARGUMENT types — the C89 contract is that a matching callee
          // (prototyped in promoted types, or K&R whose signature is
          // promoted, see the K&R param promotion) agrees exactly; a
          // non-matching callee is UB and traps at the call_indirect
          // signature check instead of producing an invalid module.
          if (funcType.hasUnspecifiedParams && !funcType.isVarArg) {
            funcType = Types.functionType(funcType.getReturnType(),
              expr.arguments.map(a => a.type), false);
          }
          const callRetType = funcType.getReturnType();
          const typeId = getWasmFunctionTypeIdForCFunctionType(this.wmod, funcType);
          if (funcType.isVarArg) {
            // Variadic indirect call: same frame-based ABI as direct vararg calls,
            // but ending with call_indirect instead of call.
            const paramTypes = funcType.getParamTypes();
            const numFixed = paramTypes.length;
            const varRetType = callRetType;
            const varStructRet = isStructOrUnion(varRetType);
            const retSlotSize = (varRetType === Types.TVOID) ? 0 : vaSlotSize(varRetType);
            let blockSize = retSlotSize;
            const argOffsets = [];
            for (let i = 0; i < expr.arguments.length; i++) {
              argOffsets.push(blockSize);
              let argType = i < numFixed ? paramTypes[i] : expr.arguments[i].type;
              if (argType.removeQualifiers() === Types.TFLOAT) argType = Types.TDOUBLE;
              blockSize += vaSlotSize(argType);
            }
            blockSize = (blockSize + 7) & ~7;
            this.callNesting++;
            this.body.globalGet(this.stackPointerGlobalIdx);
            this.body.i32Const(blockSize);
            this.body.aop(WT_I32, ALU.OP_SUB);
            this.body.globalSet(this.stackPointerGlobalIdx);
            this.pushLocalScope();
            const argBlockBase = this.allocLocal(WT_I32);
            this.body.globalGet(this.stackPointerGlobalIdx);
            this.body.localSet(argBlockBase);
            const deferredAtVaAlloc = this.structRetDeferred;
            for (let i = 0; i < expr.arguments.length; i++) {
              let storeType = i < numFixed ? paramTypes[i] : expr.arguments[i].type;
              if (storeType.removeQualifiers() === Types.TFLOAT) storeType = Types.TDOUBLE;
              this.body.localGet(argBlockBase);
              if (argOffsets[i] > 0) { this.body.i32Const(argOffsets[i]); this.body.aop(WT_I32, ALU.OP_ADD); }
              if (isStructOrUnion(storeType)) {
                this.emitExpr(expr.arguments[i]);
                this.body.i32Const(this.sizeOf(storeType));
                this.body.memoryCopy();
              } else {
                this.emitExpr(expr.arguments[i]);
                this.emitVaArgStore(storeType);
              }
              // NB: argBlockBase stays FIXED — the block never moves, and
              // per-arg store addresses are pushed before each evaluation.
              // (It used to be recomputed from live SP here, which went
              // stale when a callee's alloca() retained an untracked SP
              // bump — the callee then got a garbage block pointer,
              // todos/0208.)
            }
            this.body.localGet(argBlockBase);
            this.emitExpr(expr.callee);
            this.body.callIndirect(typeId);
            if (varStructRet) {
              this.body.localGet(argBlockBase);
              this.structRetDeferred += blockSize;
            } else if (varRetType !== Types.TVOID) {
              this.body.localGet(argBlockBase);
              this.emitVaArgLoad(varRetType);
              this.emitVaBlockRelease(argBlockBase, blockSize,
                this.structRetDeferred - deferredAtVaAlloc);
              // See the direct variadic call path for the counter reset.
              this.structRetDeferred = deferredAtVaAlloc;
            } else {
              this.emitVaBlockRelease(argBlockBase, blockSize,
                this.structRetDeferred - deferredAtVaAlloc);
              this.body.i32Const(0);
              // See scalar-return branch above.
              this.structRetDeferred = deferredAtVaAlloc;
            }
            this.popLocalScope();
            this.callNesting--;
            if (this.callNesting === 0 && this.structRetDeferred > 0) {
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(this.structRetDeferred);
              this.body.aop(WT_I32, ALU.OP_ADD);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.structRetDeferred = 0;
            }
          } else {
            // Non-vararg indirect call
            const structRet = isStructOrUnion(callRetType);
            let structRetAllocSize = 0;
            this.callNesting++;
            if (structRet) {
              const retSize = this.sizeOf(callRetType);
              structRetAllocSize = (retSize + 15) & ~15;
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(structRetAllocSize);
              this.body.aop(WT_I32, ALU.OP_SUB);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.body.globalGet(this.stackPointerGlobalIdx);
            }
            for (let i = 0; i < expr.arguments.length; i++) this.emitExpr(expr.arguments[i]);
            this.emitExpr(expr.callee);
            this.body.callIndirect(typeId);
            if (structRet) this.structRetDeferred += structRetAllocSize;
            this.callNesting--;
            if (this.callNesting === 0 && this.structRetDeferred > 0) {
              this.body.globalGet(this.stackPointerGlobalIdx);
              this.body.i32Const(this.structRetDeferred);
              this.body.aop(WT_I32, ALU.OP_ADD);
              this.body.globalSet(this.stackPointerGlobalIdx);
              this.structRetDeferred = 0;
            }
          }
        }
        break;
      }
      case AST.ESubscript: {
        const arrType = expr.array.type.removeQualifiers();
        if (arrType.isGCArray()) {
          const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, arrType);
          this.emitExpr(expr.array);
          this.emitExpr(expr.index);
          if (wtEquals(this.getBinaryWasmType(expr.index.type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
          if (isPackedSubI32(arrType.baseType)) {
            if (isSignedSubI32(arrType.baseType)) this.body.arrayGetS(typeIdx);
            else this.body.arrayGetU(typeIdx);
          } else this.body.arrayGet(typeIdx);
          break;
        }
        const elemType = expr.type;
        this.emitExpr(expr.array);
        this.emitPointerOffset(expr.index, elemType);
        this.body.aop(WT_I32, ALU.OP_ADD);
        this.emitLoadIfScalar(elemType);
        break;
      }
      case AST.EMember: {
        const baseType = expr.base.type.removeQualifiers();
        if (baseType.isGCStruct()) {
          const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, baseType);
          this.emitExpr(expr.base);
          if (isPackedSubI32(expr.memberDecl.type)) {
            if (isSignedSubI32(expr.memberDecl.type)) this.body.structGetS(typeIdx, expr.memberDecl.byteOffset);
            else this.body.structGetU(typeIdx, expr.memberDecl.byteOffset);
          } else this.body.structGet(typeIdx, expr.memberDecl.byteOffset);
          break;
        }
        this.emitExpr(expr.base);
        const field = expr.memberDecl;
        const tag = baseType.tagDecl;
        const offset = this.getFieldOffset(tag, field);
        if (offset) { this.body.i32Const(offset); this.body.aop(WT_I32, ALU.OP_ADD); }
        if (field.bitWidth >= 0) this.emitBitFieldLoad(field);
        else this.emitLoadIfScalar(expr.type);
        break;
      }
      case AST.EArrow: {
        this.emitExpr(expr.base);
        const field = expr.memberDecl;
        const baseType = expr.base.type.baseType;
        const tag = baseType.tagDecl;
        const offset = this.getFieldOffset(tag, field);
        if (offset) { this.body.i32Const(offset); this.body.aop(WT_I32, ALU.OP_ADD); }
        if (field.bitWidth >= 0) this.emitBitFieldLoad(field);
        else this.emitLoadIfScalar(expr.type);
        break;
      }
      case AST.ESizeofExpr:
        this.body.i32Const(expr.expr.type.sizeofResult()); break;
      case AST.ESizeofType:
        this.body.i32Const(expr.operandType.sizeofResult()); break;
      case AST.EAlignofExpr:
        this.body.i32Const(this.alignOf(expr.expr.type)); break;
      case AST.EAlignofType:
        this.body.i32Const(this.alignOf(expr.operandType)); break;
      case AST.EImplicitCast: {
        if (ctx === EXPR_DROP) { this.emitExpr(expr.expr, EXPR_DROP); return; }
        this.emitExpr(expr.expr);
        this.emitConversion(expr.expr.type, expr.type, expr.expr);
        break;
      }
      case AST.EDecay: {
        // Operand has array or function type; emitting it produces the
        // base address (for arrays) or table index (for functions), which
        // is exactly the decayed pointer value.
        this.emitExpr(expr.operand, ctx);
        break;
      }
      case AST.ECast: {
        this.emitExpr(expr.expr);
        this.emitConversion(expr.expr.type, expr.targetType);
        break;
      }
      case AST.ETernary: {
        const resultType = cToWasmType(expr.type, this.wmod);
        this.emitExpr(expr.condition);
        this.emitConditionToI32(expr.condition.type);
        this.body.if_(resultType);
        this.emitExpr(expr.thenExpr);
        if (expr.thenExpr.type !== expr.type) this.emitConversion(expr.thenExpr.type, expr.type);
        this.body.else_();
        this.emitExpr(expr.elseExpr);
        if (expr.elseExpr.type !== expr.type) this.emitConversion(expr.elseExpr.type, expr.type);
        this.body.end();
        break;
      }
      case AST.EIntrinsic: {
        switch (expr.intrinsicKind) {
          case Types.IntrinsicKind.VA_START:
            this.emitAddressOf(expr.args[0]);
            this.body.localGet(this.vaArgsLocalIdx);
            this.body.mop(MOP.I32_STORE, 0, 2);
            this.body.i32Const(0);
            break;
          case Types.IntrinsicKind.VA_ARG: {
            const slotSize = vaSlotSize(expr.argType);
            this.emitAddressOf(expr.args[0]);
            this.body.mop(MOP.I32_LOAD, 0, 2);
            this.pushLocalScope();
            const vaArgTemp = this.allocLocal(WT_I32);
            this.body.localTee(vaArgTemp);
            this.emitAddressOf(expr.args[0]);
            this.body.localGet(vaArgTemp);
            this.body.i32Const(slotSize);
            this.body.aop(WT_I32, ALU.OP_ADD);
            this.body.mop(MOP.I32_STORE, 0, 2);
            this.emitVaArgLoad(expr.argType);
            this.popLocalScope();
            break;
          }
          case Types.IntrinsicKind.VA_END:
            this.emitExpr(expr.args[0]); this.body.drop();
            this.body.i32Const(0); break;
          case Types.IntrinsicKind.VA_COPY:
            this.emitAddressOf(expr.args[0]);
            this.emitExpr(expr.args[1]);
            this.body.mop(MOP.I32_STORE, 0, 2);
            this.body.i32Const(0);
            break;
          case Types.IntrinsicKind.MEMORY_SIZE:
            this.body.memorySize(); break;
          case Types.IntrinsicKind.MEMORY_GROW:
            this.emitExpr(expr.args[0]); this.body.memoryGrow(); break;
          case Types.IntrinsicKind.MEMORY_COPY:
            this.emitExpr(expr.args[0]); this.emitExpr(expr.args[1]); this.emitExpr(expr.args[2]);
            this.body.memoryCopy(); this.body.i32Const(0); break;
          case Types.IntrinsicKind.MEMORY_FILL:
            this.emitExpr(expr.args[0]); this.emitExpr(expr.args[1]); this.emitExpr(expr.args[2]);
            this.body.memoryFill(); this.body.i32Const(0); break;
          case Types.IntrinsicKind.HEAP_BASE:
            this.body.globalGet(this.heapBaseGlobalIdx); break;
          case Types.IntrinsicKind.ALLOCA:
            this.usesAlloca = true; // dynamic frame: excluded from WAST inlining (todos/0201)
            this.body.globalGet(this.stackPointerGlobalIdx);
            this.emitExpr(expr.args[0]);
            this.body.i32Const(15); this.body.aop(WT_I32, ALU.OP_ADD);
            this.body.i32Const(-16); this.body.aop(WT_I32, ALU.OP_AND);
            this.body.aop(WT_I32, ALU.OP_SUB);
            this.body.globalSet(this.stackPointerGlobalIdx);
            this.body.globalGet(this.stackPointerGlobalIdx);
            break;
          case Types.IntrinsicKind.UNREACHABLE:
            this.body.unreachable(); break;
          case Types.IntrinsicKind.REF_IS_NULL:
            this.emitExpr(expr.args[0]); this.body.refIsNull(); break;
          case Types.IntrinsicKind.REF_EQ:
            this.emitExpr(expr.args[0]); this.emitExpr(expr.args[1]); this.body.refEq(); break;
          case Types.IntrinsicKind.REF_NULL: {
            const wt = this.getBinaryWasmType(expr.argType);
            if (wt.heapIsIdx) this.body.refNullIdx(wt.heap);
            else this.body.refNull(wt.heap);
            break;
          }
          case Types.IntrinsicKind.REF_TEST: {
            this.emitExpr(expr.args[0]);
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, expr.argType);
            this.body.refTest(typeIdx);
            break;
          }
          case Types.IntrinsicKind.REF_TEST_NULL: {
            this.emitExpr(expr.args[0]);
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, expr.argType);
            this.body.refTestNull(typeIdx);
            break;
          }
          case Types.IntrinsicKind.REF_CAST: {
            this.emitExpr(expr.args[0]);
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, expr.argType);
            this.body.refCast(typeIdx);
            break;
          }
          case Types.IntrinsicKind.REF_CAST_NULL: {
            this.emitExpr(expr.args[0]);
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, expr.argType);
            this.body.refCastNull(typeIdx);
            break;
          }
          case Types.IntrinsicKind.ARRAY_LEN: {
            this.emitExpr(expr.args[0]);
            this.body.arrayLen();
            break;
          }
          case Types.IntrinsicKind.GC_NEW_ARRAY: {
            const arrType = expr.type;
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, arrType);
            for (let i = 0; i < expr.args.length; i++) {
              this.emitExpr(expr.args[i]);
              this.emitConversion(expr.args[i].type, expr.argType, expr.args[i]);
            }
            this.body.arrayNewFixed(typeIdx, expr.args.length);
            break;
          }
          case Types.IntrinsicKind.ARRAY_FILL: {
            // [arr, off, val, n] → array.fill typeIdx
            const arrType = expr.args[0].type.removeQualifiers();
            const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, arrType);
            this.emitExpr(expr.args[0]);
            this.emitExpr(expr.args[1]);
            if (wtEquals(this.getBinaryWasmType(expr.args[1].type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            this.emitExpr(expr.args[2]);
            this.emitConversion(expr.args[2].type, arrType.baseType, expr.args[2]);
            this.emitExpr(expr.args[3]);
            if (wtEquals(this.getBinaryWasmType(expr.args[3].type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            this.body.arrayFill(typeIdx);
            this.body.i32Const(0); // expression result (void → i32 0 by convention)
            break;
          }
          case Types.IntrinsicKind.REF_AS_EXTERN: {
            this.emitExpr(expr.args[0]);
            this.body.externConvertAny();
            break;
          }
          case Types.IntrinsicKind.REF_AS_EQ: {
            // extern → any (cheap) then ref.cast to eq (traps if value isn't
            // eq-compatible — which it should be for anything that originated
            // inside this WASM module via __ref_as_extern).
            this.emitExpr(expr.args[0]);
            this.body.anyConvertExtern();
            this.body.refCastNullEq();
            break;
          }
          case Types.IntrinsicKind.GC_STR: {
            const idx = this.gcstrGlobalIdx.get(gcstrKey(expr.args[0]));
            if (idx === undefined) {
              // generateCode's pre-scan walks every body and static-storage
              // initializer before the first defined global; reaching here
              // means a code path synthesized a GC_STR node it never saw.
              throw new Error(`internal: __gcstr literal not pre-registered`);
            }
            this.body.globalGet(idx);
            break;
          }
          case Types.IntrinsicKind.CAST: {
            const target = expr.argType;
            const srcType = expr.args[0].type;
            const sq = srcType.removeQualifiers();
            const tq = target.removeQualifiers();
            // Identity
            if (sq === tq) { this.emitExpr(expr.args[0]); break; }
            const isPrim = (t) => t.isArithmetic();
            const isEqref = (t) => t === Types.TEQREF;
            const isExternref = (t) => t === Types.TEXTERNREF || t === Types.TREFEXTERN;
            // prim → prim: numeric conversion
            if (isPrim(sq) && isPrim(tq)) {
              this.emitExpr(expr.args[0]);
              this.emitConversion(srcType, target);
              break;
            }
            // prim → __eqref: box. Widen to box storage type, struct.new.
            if (isPrim(sq) && isEqref(tq)) {
              const primWt = boxStorageWtFor(sq);
              if (!primWt) throw new Error(`__cast: unsupported primitive '${sq.toString()}' for eqref boxing`);
              const boxIdx = getOrCreateBoxStructIdx(this.wmod, primWt);
              this.emitExpr(expr.args[0]);
              const srcWt = this.getBinaryWasmType(srcType);
              if (!wtEquals(srcWt, primWt)) {
                if (wtEquals(primWt, WT_I64)) this.body.aop(WT_I64, ALU.OP_EXTEND_I32, !this.isUnsignedType(srcType));
                else if (wtEquals(primWt, WT_F64)) this.body.aop(WT_F64, ALU.OP_PROMOTE_F32);
              }
              this.body.structNew(boxIdx);
              break;
            }
            // __eqref → prim: unbox. ref.cast to box, struct.get, narrow.
            if (isEqref(sq) && isPrim(tq)) {
              const primWt = boxStorageWtFor(tq);
              if (!primWt) throw new Error(`__cast: unsupported primitive '${tq.toString()}' for eqref unboxing`);
              const boxIdx = getOrCreateBoxStructIdx(this.wmod, primWt);
              this.emitExpr(expr.args[0]);
              this.body.refCastNull(boxIdx);
              this.body.structGet(boxIdx, 0);
              // Narrow from box storage type to the precise C target type.
              if (tq === Types.TDOUBLE || tq === Types.TLDOUBLE) { /* f64 → f64: OK */ }
              else if (tq === Types.TFLOAT) { this.body.aop(WT_F32, ALU.OP_DEMOTE_F64); }
              else if (tq === Types.TLLONG || tq === Types.TULLONG) { /* i64 → i64: OK */ }
              else if (tq.isInteger()) {
                this.body.aop(WT_I32, ALU.OP_WRAP_I64);
                this.emitSubIntNarrowing(tq);
              }
              break;
            }
            // GC ref → __eqref: implicit subtype upcast (no opcode needed).
            if (sq.isGCRef() && isEqref(tq)) { this.emitExpr(expr.args[0]); break; }
            // __eqref → GC ref: ref.cast.
            if (isEqref(sq) && tq.isGCRef()) {
              const idx = getOrCreateGCWasmTypeIdx(this.wmod, tq);
              this.emitExpr(expr.args[0]);
              this.body.refCastNull(idx);
              break;
            }
            // GC ref → GC ref: ref.cast (same as __ref_cast).
            if (sq.isGCRef() && tq.isGCRef()) {
              const idx = getOrCreateGCWasmTypeIdx(this.wmod, tq);
              this.emitExpr(expr.args[0]);
              this.body.refCastNull(idx);
              break;
            }
            // GC ref → externref: extern.convert_any.
            if (sq.isGCRef() && isExternref(tq)) {
              this.emitExpr(expr.args[0]);
              this.body.externConvertAny();
              break;
            }
            // externref → __eqref: any.convert_extern then ref.cast (ref null eq).
            // The cast traps if the externref value isn't eq-compatible.
            if (isExternref(sq) && tq === Types.TEQREF) {
              this.emitExpr(expr.args[0]);
              this.body.anyConvertExtern();
              this.body.refCastNullEq();
              break;
            }
            throw new Error(`__cast codegen: unhandled combo '${srcType.toString()}' → '${target.toString()}'`);
          }
          case Types.IntrinsicKind.ARRAY_COPY: {
            // [dst, dstOff, src, srcOff, n] → array.copy dstTypeIdx srcTypeIdx
            const dstType = expr.args[0].type.removeQualifiers();
            const srcType = expr.args[2].type.removeQualifiers();
            const dstIdx = getOrCreateGCWasmTypeIdx(this.wmod, dstType);
            const srcIdx = getOrCreateGCWasmTypeIdx(this.wmod, srcType);
            this.emitExpr(expr.args[0]);
            this.emitExpr(expr.args[1]);
            if (wtEquals(this.getBinaryWasmType(expr.args[1].type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            this.emitExpr(expr.args[2]);
            this.emitExpr(expr.args[3]);
            if (wtEquals(this.getBinaryWasmType(expr.args[3].type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            this.emitExpr(expr.args[4]);
            if (wtEquals(this.getBinaryWasmType(expr.args[4].type), WT_I64)) this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            this.body.arrayCopy(dstIdx, srcIdx);
            this.body.i32Const(0);
            break;
          }
        }
        break;
      }
      case AST.EWasm: {
        for (const arg of expr.args) this.emitExpr(arg);
        for (const b of expr.bytes) this.body.push(b);
        break;
      }
      case AST.EComma: {
        for (let i = 0; i < expr.expressions.length; i++) {
          const isLast = i + 1 === expr.expressions.length;
          this.emitExpr(expr.expressions[i], isLast ? ctx : EXPR_DROP);
        }
        return;
      }
      case AST.ECompoundLiteral: {
        const fsAddr = this.fileScopeCompoundLiteralAddrs.get(expr);
        if (fsAddr !== undefined) {
          this.body.i32Const(fsAddr);
        } else {
          this.emitCompoundLiteralInit(expr);
          this.emitFrameAddr(this.compoundLiteralOffsets.get(expr));
        }
        this.emitLoadIfScalar(expr.type);
        break;
      }
      case AST.EGCNew: {
        const t = expr.type;
        const typeIdx = getOrCreateGCWasmTypeIdx(this.wmod, t);
        if (t.isGCStruct()) {
          if (expr.args.length === 0) {
            this.body.structNewDefault(typeIdx);
          } else {
            const fields = t.tagDecl.members;
            for (let i = 0; i < expr.args.length; i++) {
              this.emitExpr(expr.args[i]);
              this.emitConversion(expr.args[i].type, fields[i].type, expr.args[i]);
            }
            this.body.structNew(typeIdx);
          }
        } else { // GC_ARRAY
          if (expr.args.length === 1) {
            this.emitExpr(expr.args[0]);
            // length must be i32
            if (wtEquals(this.getBinaryWasmType(expr.args[0].type), WT_I64)) {
              this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            }
            this.body.arrayNewDefault(typeIdx);
          } else {
            // [init, length]
            this.emitExpr(expr.args[1]);
            this.emitConversion(expr.args[1].type, t.baseType, expr.args[1]);
            this.emitExpr(expr.args[0]);
            if (wtEquals(this.getBinaryWasmType(expr.args[0].type), WT_I64)) {
              this.body.aop(WT_I32, ALU.OP_WRAP_I64);
            }
            this.body.arrayNew(typeIdx);
          }
        }
        break;
      }
      default: {
        const fname = this.currentFuncDef ? (this.currentFuncDef.name || '<anonymous>') : '<unknown>';
        const floc = this.currentFuncDef ? (this.currentFuncDef.loc ? this.currentFuncDef.loc.file + ':' + this.currentFuncDef.loc.line : '') : '';
        throw new Error(`emitExpr: unhandled expression ${expr.constructor.name} in function ${fname} (${floc})`);
      }
    }
    if (ctx === EXPR_DROP) this.body.drop();
  }
}

// ====================
// generateCode orchestration
// ====================

// Walk a unit's globals to collect every ECompoundLiteral reachable
// from a static-storage init context (regular globals + static locals).
// These get static addresses; their counterparts inside function bodies
// (frame-scope) are collected separately per-function. The bag does
// the recursion — we just enumerate the entry points.
function collectFileScopeCompoundLiterals(unit) {
  const out = new Set();
  const collect = (expr) => {
    if (!expr) return;
    for (const cl of expr.referencedCompoundLiterals) out.add(cl);
  };
  for (const v of unit.definedVariables) collect(v.initExpr);
  for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
    for (const v of (func.staticLocals || [])) collect(v.initExpr);
  }
  return out;
}

// --gc-spill-locals: force scalar pointer/integer locals into the
// linear-memory shadow stack instead of wasm locals. Conservative
// garbage collectors (micropython's gc, Boehm-style) find roots by
// scanning the C stack — wasm locals live outside linear memory and are
// invisible to any scan, so a heap pointer held only in a wasm local
// across a collection gets swept as garbage (found via micropython's
// string_format2: a vstr buffer was collected while still referenced
// from a local). Spilling named locals closes the main hole; values on
// the wasm OPERAND stack between nested calls remain a narrow residual
// window.
function spillScalarLocals(units) {
  const spill = (d) => {
    if (!(d instanceof AST.DVar)) return;
    if (d.storageClass === Types.StorageClass.STATIC ||
        d.storageClass === Types.StorageClass.EXTERN) return;
    const t = d.type.removeQualifiers();
    // GC reference types cannot live in linear memory; floats carry no
    // pointer bits worth scanning.
    if (t.isRef && t.isRef()) return;
    if (t.isPointer() || t.isInteger()) d.allocClass = Types.AllocClass.MEMORY;
  };
  const walk = (node) => {
    if (!node) return;
    if (node instanceof AST.SDecl) {
      for (const d of node.declarations) spill(d);
    }
    if (node.children) for (const c of node.children) walk(c);
  };
  // A function that allocates with the ALLOCA intrinsic must not get a
  // frame: the frame epilogue restores SP, which would free the alloca'd
  // block before the caller sees it (alloca() relies on returning with
  // the SP bump intact; the CALLER's epilogue is what frees it).
  const usesAlloca = (node) => {
    if (!node) return false;
    if (node instanceof AST.EIntrinsic && node.intrinsicKind === Types.IntrinsicKind.ALLOCA) return true;
    if (node.children) for (const c of node.children) if (usesAlloca(c)) return true;
    return false;
  };
  for (const unit of units) {
    for (const f of [...unit.definedFunctions, ...unit.staticFunctions]) {
      if (!f.body) continue;
      if (usesAlloca(f.body)) continue;
      for (const p of f.parameters) spill(p);
      walk(f.body);
    }
  }
}

function generateCode(units, outputFile, options) {
  const writeErr = options && options.writeErr
    ? options.writeErr
    : (typeof process !== 'undefined' && process.stderr ? (s) => process.stderr.write(s) : () => {});
  const fatalExit = options && options.fatalExit
    ? options.fatalExit
    : (typeof process !== 'undefined' && process.exit ? (code) => process.exit(code) : (code) => { throw new Error(`Fatal error (exit code ${code})`); });
  if (options && options.compilerOptions && options.compilerOptions.gcSpillLocals) {
    spillScalarLocals(units);
  }
  const wmod = new WasmModule();
  const cg = new CodeGenerator(wmod, options);

  // Apply __minstack directives: take max across all TUs, round up to pages
  let maxMinStack = 0;
  for (const unit of units) maxMinStack = Math.max(maxMinStack, unit.minStackBytes || 0);
  if (maxMinStack > 0) {
    const minPages = Math.ceil(maxMinStack / 65536);
    cg.stackPages = Math.max(cg.stackPages, minPages);
  }

  // Register __gcstr imported string-constant globals (todos/0041).
  // Imported globals sit at the BOTTOM of the global index space, so every
  // one must be known before the first defined global — addGlobal bakes the
  // import count into the indices it hands out, and function bodies burn
  // those indices in as they're emitted (addGlobalImport throws if a
  // defined global already exists). The inliner has already run, so this
  // walk sees the final AST; a literal registered for a function the
  // emitter later drops is just an unused import (imports resolve at
  // compile via importedStringConstants — no runtime cost).
  {
    const scanned = new Set();
    const scan = (node) => {
      if (!node) return;
      if (node instanceof AST.EIntrinsic && node.intrinsicKind === Types.IntrinsicKind.GC_STR) {
        const key = gcstrKey(node.args[0]);
        if (!cg.gcstrGlobalIdx.has(key)) {
          const nameBytes = node.args[0].value.slice(0, -1);   // drop the NUL
          const idx = wmod.addGlobalImport("#", nameBytes, WT_REFEXTERN, false);
          cg.gcstrGlobalIdx.set(key, idx);
          if (options.compilerOptions.emitNames) wmod.globalNames.push({ idx, name: "__gcstr" });
        }
      }
      if (node.children) for (const c of node.children) scan(c);
    };
    for (const unit of units) {
      for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
        const fdef = func.definition || func;
        if (fdef !== func || scanned.has(fdef)) continue;
        scanned.add(fdef);
        if (fdef.body) scan(fdef.body);
        for (const v of (fdef.staticLocals || [])) scan(v.initExpr);
      }
      for (const v of [...unit.definedVariables, ...unit.externVariables, ...unit.localExternVariables]) {
        scan((v.definition || v).initExpr);
      }
    }
  }

  // Stack pointer global
  const initialSp = cg.stackPages * 65536;
  cg.stackPointerGlobalIdx = wmod.addGlobalI32(initialSp, true);
  cg.heapBaseGlobalIdx = wmod.addGlobalI32(0, false);
  if (options.compilerOptions.emitNames) {
    wmod.globalNames.push({ idx: cg.stackPointerGlobalIdx, name: "__stack_pointer" });
    wmod.globalNames.push({ idx: cg.heapBaseGlobalIdx, name: "__heap_base" });
  }

  // Register imports
  for (const unit of units) {
    for (const func of unit.importedFunctions) {
      const fdef = func.definition || func;
      const typeId = getWasmFunctionTypeIdForCFunctionType(wmod, fdef.type);
      const mod = fdef.importModule || func.importModule || "c";
      const nm = fdef.importName || func.importName || fdef.name;
      const funcIdx = wmod.addFunctionImport(mod, nm, typeId);
      cg.funcDefToWasmFuncIdx.set(fdef, funcIdx);
      cg.funcDefToTableIdx.set(fdef, funcIdx + 1);
      if (options.compilerOptions.emitNames) wmod.funcNames.push({ idx: funcIdx, name: fdef.name });
    }
  }

  // Register function definitions
  let foundMain = false;
  for (const unit of units) {
    for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
      const fdef = func.definition || func;
      if (fdef !== func) continue;
      const typeId = getWasmFunctionTypeIdForCFunctionType(wmod, fdef.type);
      const funcIdx = wmod.addFunctionDefinition(typeId);
      cg.funcDefToWasmFuncIdx.set(fdef, funcIdx);
      cg.funcDefToTableIdx.set(fdef, funcIdx + 1);
      if (options.compilerOptions.emitNames) wmod.funcNames.push({ idx: funcIdx, name: fdef.name });
      if (fdef.name === "main") { foundMain = true; wmod.addExport("main", 0x00, funcIdx); }
      if (fdef.name === "alloca") wmod.addExport("alloca", 0x00, funcIdx);
    }
  }
  if (!foundMain) {
    writeErr("Error: no 'main' function defined\n");
    fatalExit(1);
  }

  // Register exception tags
  for (const unit of units) {
    for (const tag of (unit.exceptionTags || [])) {
      if (cg.exceptionToWasmTagIdx.has(tag)) continue;
      const params = tag.paramTypes.map(pt => cToWasmType(pt, wmod));
      const typeId = wmod.addFunctionTypeId(params, []);
      const tagIdx = wmod.addTag(typeId);
      cg.exceptionToWasmTagIdx.set(tag, tagIdx);
    }
  }

  // Process __export directives
  for (const unit of units) {
    for (const [exportName, func] of unit.exportDirectives) {
      const fdef = func.definition || func;
      const funcIdx = cg.funcDefToWasmFuncIdx.get(fdef);
      if (funcIdx !== undefined) wmod.addExport(exportName, 0x00, funcIdx);
    }
  }

  // Allocate MEMORY addresses
  for (const unit of units) {
    for (const v of [...unit.definedVariables, ...unit.externVariables, ...unit.localExternVariables]) {
      if (v.storageClass === Types.StorageClass.EXTERN && v.definition !== v) continue;
      const varDef = v.definition || v;
      if (varDef.allocClass === Types.AllocClass.MEMORY && !cg.globalArrayAddrs.has(varDef)) {
        let align = cg.alignOf(varDef.type);
        if (varDef.requestedAlignment > 0 && varDef.requestedAlignment > align) align = varDef.requestedAlignment;
        const size = varDef.initExpr ? cg.computeInitAllocSize(varDef.type, varDef.initExpr)
                                    : cg.sizeOf(varDef.type);
        const addr = cg.allocateStatic(size, align);
        cg.globalArrayAddrs.set(varDef, addr);
      }
    }
    for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
      const fdef = func.definition;
      if (!fdef) continue;
      for (const varDef of (fdef.staticLocals || [])) {
        if (varDef.allocClass === Types.AllocClass.MEMORY && !cg.globalArrayAddrs.has(varDef)) {
          let align = cg.alignOf(varDef.type);
          if (varDef.requestedAlignment > 0 && varDef.requestedAlignment > align) align = varDef.requestedAlignment;
          const addr = cg.allocateStatic(cg.sizeOf(varDef.type), align);
          cg.globalArrayAddrs.set(varDef, addr);
        }
      }
    }
    // File-scope compound literals: discover via the bag from every
    // global init expression (regular globals + static locals, whose
    // initExprs are evaluated as constant expressions at file scope).
    const fileScopeCLs = collectFileScopeCompoundLiterals(unit);
    for (const cl of fileScopeCLs) {
      if (cg.fileScopeCompoundLiteralAddrs.has(cl)) continue;
      const addr = cg.allocateStatic(cg.sizeOf(cl.type), cg.alignOf(cl.type));
      cg.fileScopeCompoundLiteralAddrs.set(cl, addr);
    }
  }

  // Diagnose non-constant initializers for static-storage objects (C11
  // 6.7.9p4: they "shall be constant expressions or string literals" — gcc/clang
  // reject this too). Collected across all static-init population below and
  // reported before any function body is emitted. The sink is active only for
  // this window: the local-aggregate runtime-init path (emitted with function
  // bodies) legitimately reuses populateInitListStatic for non-constant elements
  // and must not trip it.
  const staticInitErrors = [];
  cg._staticInitErrSink = staticInitErrors;

  // Initialize file-scope compound literals
  for (const unit of units) {
    for (const cl of collectFileScopeCompoundLiterals(unit)) {
      const addr = cg.fileScopeCompoundLiteralAddrs.get(cl);
      if (addr === undefined) continue; // already initialized in another TU pass
      const baseOffset = addr - (cg.stackPages * 65536);
      if (cl.type.isArray() && cl.initList.elements.length === 1 && cl.initList.elements[0] instanceof AST.EString &&
          stringLiteralCanInitArray(cl.type, cl.initList.elements[0])) {
        cg.writeStringLiteralToStatic(cl.initList.elements[0].value, cl.type, baseOffset);
      } else if (cl.type.isAggregate() || cl.type.isArray()) {
        cg.populateInitListStatic(cl.initList, cl.type, baseOffset);
      } else {
        const initExpr = cl.initList.elements.length === 0 ? new AST.EInt(cl.loc, cl.type, 0n) : cl.initList.elements[0];
        const val = cg._constEvalExpr(initExpr);
        if (val) cg.writeConstValueToStatic(baseOffset, cl.type, val);
        else if (cg._staticInitErrSink) cg._staticInitErrSink.push({ loc: (initExpr && initExpr.loc) || cl.loc });
      }
    }
  }

  // Helper: register a global variable (REGISTER or initialize MEMORY)
  const registerGlobalVar = (varDef) => {
    if (varDef.allocClass === Types.AllocClass.MEMORY) {
      const addr = cg.globalArrayAddrs.get(varDef);
      const baseOffset = addr - (cg.stackPages * 65536);
      if (varDef.initExpr && varDef.initExpr instanceof AST.EInitList) {
        cg.populateInitListStatic(varDef.initExpr, varDef.type, baseOffset);
      } else if (varDef.initExpr && varDef.initExpr instanceof AST.ECompoundLiteral && varDef.type.isAggregate()) {
        cg.populateInitListStatic(varDef.initExpr.initList, varDef.type, baseOffset);
      } else if (varDef.initExpr && varDef.type.isArray() && varDef.initExpr instanceof AST.EString) {
        const str = varDef.initExpr.value;
        const copySize = cg.sizeOf(varDef.type);
        const len = Math.min(copySize, str.length);
        for (let i = 0; i < len; i++) cg.staticData[baseOffset + i] = str[i];
      } else if (varDef.initExpr && !varDef.type.isAggregate()) {
        const val = cg._constEvalExpr(varDef.initExpr);
        if (val) cg.writeConstValueToStatic(baseOffset, varDef.type, val);
        else if (cg._staticInitErrSink) cg._staticInitErrSink.push({ loc: varDef.initExpr.loc });
      }
    } else if (varDef.type.removeQualifiers().isRef()) {
      const rt = varDef.type.removeQualifiers();
      // `__gcstr("...")` is the one non-null ref constant: global.get of an
      // immutable imported global is a valid wasm constant expression. It
      // also gives __refextern its one valid global initializer.
      const unwrapGcstr = (e) =>
        (e instanceof AST.EIntrinsic && e.intrinsicKind === Types.IntrinsicKind.GC_STR) ? e :
        (e instanceof AST.EImplicitCast || e instanceof AST.ECast) ? unwrapGcstr(e.expr) : null;
      const gcstrInit = varDef.initExpr ? unwrapGcstr(varDef.initExpr) : null;
      if (gcstrInit && (rt === Types.TEXTERNREF || rt === Types.TREFEXTERN)) {
        const importIdx = cg.gcstrGlobalIdx.get(gcstrKey(gcstrInit.args[0]));
        if (importIdx === undefined) throw new Error(`internal: __gcstr literal not pre-registered`);
        const initExpr = [];
        const code = new WasmCode(initExpr);
        code.globalGet(importIdx);
        code.end();
        const globalIdx = wmod.addGlobal(rt === Types.TREFEXTERN ? WT_REFEXTERN : WT_EXTERNREF, initExpr, true);
        cg.globalVarToWasmGlobalIdx.set(varDef, globalIdx);
        if (options.compilerOptions.emitNames) wmod.globalNames.push({ idx: globalIdx, name: varDef.name });
        return;
      }
      if (rt === Types.TREFEXTERN) {
        throw new Error(`Cannot declare global '__refextern' variable '${varDef.name}' — non-nullable refs have no valid initializer other than __gcstr("..."). Use '__externref' instead.`);
      }
      // WASM globals can only have constant initializers (ref.null and
      // __gcstr are the only ref-typed constants we support). Reject other
      // non-null initializers for global ref types — user must initialize
      // in main / a startup fn.
      if (varDef.initExpr) {
        const isNullConst = (e) =>
          (e instanceof AST.EInt && e.value === 0n) ||
          (e instanceof AST.EImplicitCast && isNullConst(e.expr)) ||
          (e instanceof AST.ECast && isNullConst(e.expr));
        if (!isNullConst(varDef.initExpr)) {
          throw new Error(
            `global '${varDef.name}': reference-typed globals can only be initialized to null/0 ` +
            `(WASM constant init expressions can't allocate); set the value in main() or a startup function`);
        }
      }
      if (rt.isGCRef()) {
        const refWt = cToWasmType(rt, wmod);
        const initExpr = [];
        const code = new WasmCode(initExpr);
        // For concrete GC types (struct/array), heap is a type idx — use
        // the LEB-encoded form. For abstract heap types like __eqref (heap
        // byte 0x6D), use the single-byte form via refNull.
        if (refWt.heapIsIdx) code.refNullIdx(refWt.heap);
        else code.refNull(refWt.heap);
        code.end();
        const globalIdx = wmod.addGlobal(refWt, initExpr, true);
        cg.globalVarToWasmGlobalIdx.set(varDef, globalIdx);
        if (options.compilerOptions.emitNames) wmod.globalNames.push({ idx: globalIdx, name: varDef.name });
      } else {
        const globalIdx = wmod.addGlobalExternref(true);
        cg.globalVarToWasmGlobalIdx.set(varDef, globalIdx);
        if (options.compilerOptions.emitNames) wmod.globalNames.push({ idx: globalIdx, name: varDef.name });
      }
    } else {
      const wt = cToWasmType(varDef.type, wmod);
      // Determine initial value
      let globalIdx;
      if (varDef.initExpr && varDef.initExpr instanceof AST.EInt) {
        const val = Types.truncateConstInt(varDef.initExpr.value, varDef.type);
        if (wtEquals(wt, WT_F32)) globalIdx = wmod.addGlobalF32(Number(val), true);
        else if (wtEquals(wt, WT_F64)) globalIdx = wmod.addGlobalF64(Number(val), true);
        else if (wtEquals(wt, WT_I64)) globalIdx = wmod.addGlobalI64(val, true);
        else globalIdx = wmod.addGlobalI32(Number(val), true);
      } else if (varDef.initExpr && varDef.initExpr instanceof AST.EFloat) {
        if (wtEquals(wt, WT_F32)) globalIdx = wmod.addGlobalF32(varDef.initExpr.value, true);
        else globalIdx = wmod.addGlobalF64(varDef.initExpr.value, true);
      } else if (varDef.initExpr && varDef.initExpr instanceof AST.EString) {
        const addr = cg.getStringAddress(varDef.initExpr.value);
        globalIdx = wmod.addGlobalI32(addr, true);
      } else if (varDef.initExpr) {
        const val = cg._constEvalExpr(varDef.initExpr);
        if (val && (val.kind === "int" || val.kind === "float" || val.kind === "addr")) {
          const numVal = val.kind === "int" ? Number(val.intVal) :
                         val.kind === "float" ? val.floatVal : val.addrVal;
          // i64 globals must take the BigInt directly — routing a 64-bit
          // constant through a JS double loses bits above 2^53.
          const i64Val = val.kind === "int" ? BigInt.asIntN(64, val.intVal) :
                         val.kind === "float" ? ConstEval.saturatingTruncToInt(val.floatVal, Types.TLLONG) :
                         BigInt(val.addrVal);
          if (wtEquals(wt, WT_F32)) globalIdx = wmod.addGlobalF32(numVal, true);
          else if (wtEquals(wt, WT_F64)) globalIdx = wmod.addGlobalF64(numVal, true);
          else if (wtEquals(wt, WT_I64)) globalIdx = wmod.addGlobalI64(i64Val, true);
          else globalIdx = wmod.addGlobalI32(numVal | 0, true);
        } else {
          // Non-constant initializer for a static-storage scalar (e.g. a
          // function call) — not a constant expression (C11 6.7.9p4). Record
          // the diagnostic; the zero-fill below keeps codegen well-formed until
          // compilation fails on the collected errors.
          if (cg._staticInitErrSink) cg._staticInitErrSink.push({ loc: varDef.initExpr.loc });
          if (wtEquals(wt, WT_I64)) globalIdx = wmod.addGlobalI64(0n, true);
          else if (wtEquals(wt, WT_F32)) globalIdx = wmod.addGlobalF32(0.0, true);
          else if (wtEquals(wt, WT_F64)) globalIdx = wmod.addGlobalF64(0.0, true);
          else globalIdx = wmod.addGlobalI32(0, true);
        }
      } else {
        if (wtEquals(wt, WT_I64)) globalIdx = wmod.addGlobalI64(0n, true);
        else if (wtEquals(wt, WT_F32)) globalIdx = wmod.addGlobalF32(0.0, true);
        else if (wtEquals(wt, WT_F64)) globalIdx = wmod.addGlobalF64(0.0, true);
        else globalIdx = wmod.addGlobalI32(0, true);
      }
      cg.globalVarToWasmGlobalIdx.set(varDef, globalIdx);
      if (options.compilerOptions.emitNames) wmod.globalNames.push({ idx: globalIdx, name: varDef.name });
    }
  };

  // Register global variables
  for (const unit of units) {
    for (const v of [...unit.definedVariables, ...unit.externVariables, ...unit.localExternVariables]) {
      if (v.storageClass === Types.StorageClass.EXTERN && v.definition !== v) continue;
      const varDef = v.definition || v;
      registerGlobalVar(varDef);
    }
  }

  // Register static local variables
  for (const unit of units) {
    for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
      const fdef = func.definition;
      if (!fdef) continue;
      for (const varDef of (fdef.staticLocals || [])) registerGlobalVar(varDef);
    }
  }

  // Done populating static storage — close the diagnostic window before
  // function bodies (whose local-aggregate inits may carry non-constant
  // elements legitimately) are emitted, and fail on any collected errors.
  cg._staticInitErrSink = null;
  if (staticInitErrors.length > 0) {
    for (const e of staticInitErrors) {
      const at = e.loc && e.loc.filename ? `${e.loc.filename}:${e.loc.line}: ` : "";
      writeErr(`${at}error: initializer element is not a compile-time constant\n`);
    }
    fatalExit(1);
    return;
  }

  // Emit function bodies. Default path: structured codegen for every
  // function. If a function accumulates "goto target not in scope"
  // errors during its emit, roll back its byte/locals output, run the
  // loop-switch lowering on it, and re-emit. Functions whose structured
  // emit succeeds pay no extra cost beyond two length-snapshots.
  const noLowering = !!options?.compilerOptions?.noIrreducibleLowering;
  const forceLowering = !!options?.compilerOptions?.forceIrreducibleLowering;
  const verbose = !!options?.compilerOptions?.verbose;
  const dumpIrredSegments = !!options?.compilerOptions?.dumpIrredSegments;
  const loweredFnNames = [];
  for (const unit of units) {
    for (const func of [...unit.definedFunctions, ...unit.staticFunctions]) {
      const fdef = func.definition || func;
      if (fdef !== func) continue;
      const defIdx = cg.funcDefToWasmFuncIdx.get(fdef) - wmod.funcImports.length;
      const wd = wmod.funcDefs[defIdx];

      if (forceLowering) {
        // --force-dispatch-loop: skip the optimistic structured-first
        // path; lower every function into a loop-switch state machine
        // up front. Used for benchmarking dispatch-loop vs structured
        // codegen on the same source.
        if (verbose) {
          writeErr(`[irreducible] lowering '${fdef.name}' (forced)\n`);
        }
        IRREDUCIBLE_LOWERING.lower(fdef, dumpIrredSegments ? writeErr : null);
        cg.emitFunctionBody(fdef);
        loweredFnNames.push(fdef.name);
        continue;
      }

      // Snapshot the small handful of arrays the emitter appends to.
      // Per-function CodeGenerator state (locals, frame layout, scope
      // maps) is cleared at the start of every emitFunctionBody, so it
      // doesn't need rollback — only these module-level arrays do.
      // (Bytes and source-map entries no longer need snapshots: both are
      // produced from the WAST tree at serialize time, todos/0198.)
      const localsLen = wd.locals.length;
      const errLen = cg.gotoErrors.length;
      const lnLen = wmod.localNames.length;

      cg.emitFunctionBody(fdef);

      if (!noLowering && cg.gotoErrors.length > errLen) {
        // Structured emit hit out-of-scope gotos. Discard this function's
        // node list (emitFunctionBody already skipped storing one for the
        // unbalanced attempt), roll back the side arrays, lower the
        // function body into a loop-switch state machine, and re-emit.
        // The lowered body has only structured control flow, so the
        // second emit won't error.
        wd.wast = null;
        wd.locals.length = localsLen;
        cg.gotoErrors.length = errLen;
        wmod.localNames.length = lnLen;
        if (verbose) {
          writeErr(`[irreducible] lowering '${fdef.name}' (retry after structured emit failed)\n`);
        }
        IRREDUCIBLE_LOWERING.lower(fdef, dumpIrredSegments ? writeErr : null);
        cg.emitFunctionBody(fdef);
        loweredFnNames.push(fdef.name);
      }
    }
  }
  if (verbose && loweredFnNames.length > 0) {
    writeErr(
      `note: ${loweredFnNames.length} function(s) required loop-switch lowering ` +
      `(irreducible / unresolved cross-block gotos):\n`);
    for (const n of loweredFnNames) writeErr(`  - ${n}\n`);
  }

  // Surface goto errors collected during emit. Out-of-scope gotos already
  // produced wasm `unreachable` opcodes inline; we just write the
  // diagnostics and exit. (Mirrors how the parser pass surfaces them.)
  if (cg.gotoErrors.length > 0) {
    for (const err of cg.gotoErrors) {
      writeErr(`${err.filename}:${err.line}: error: ${err.message}\n`);
    }
    fatalExit(1);
  }

  // Finalize memory
  const staticDataStart = cg.stackPages * 65536;
  const heapBase = (staticDataStart + cg.staticDataOffset + 7) & ~7;
  let minPages = Math.ceil(heapBase / 65536);
  if (minPages < cg.stackPages) minPages = cg.stackPages;
  const memoryIdx = wmod.addMemory(minPages);
  wmod.addExport("memory", 0x02, memoryIdx);
  wmod.addExport("__indirect_function_table", 0x01, 0);
  // Emit static data as sparse active segments, skipping long runs of zeros.
  // WASM zero-inits linear memory, so omitted zeros read back as 0 — a zeroed
  // global (e.g. a stdio buffer or an uninitialized array) then costs no binary
  // bytes. Short zero runs stay inline: each extra segment costs ~6-10 header
  // bytes (memidx + i32.const offset expr + length leb), so only break the span
  // on a zero run long enough to pay for a new segment. Trailing zeros in a span
  // are dropped (the segment ends at its last non-zero byte). An all-zero
  // staticData emits no segments at all.
  if (cg.staticData.length > 0) {
    const data = cg.staticData;
    const MIN_ZERO_RUN = 64;
    const n = data.length;
    let i = 0;
    while (i < n) {
      while (i < n && data[i] === 0) i++;        // skip leading zeros (free)
      if (i >= n) break;
      const spanStart = i;
      let lastNonZero = i;
      while (i < n) {
        if (data[i] !== 0) { lastNonZero = i++; continue; }
        let zr = i;
        while (zr < n && data[zr] === 0) zr++;   // measure the zero run
        if (zr - i >= MIN_ZERO_RUN || zr >= n) break;  // long/trailing run ends span
        i = zr;                                  // short run: absorb and continue
      }
      wmod.addDataSegment(staticDataStart + spanStart, data.slice(spanStart, lastNonZero + 1));
      // i now sits at the breaking zero run (or n); the outer loop skips it.
    }
  }
  wmod.patchGlobalI32(cg.heapBaseGlobalIdx, heapBase);
  wmod.addExport("__heap_base", 0x03, cg.heapBaseGlobalIdx);

  // Transfer source map data
  wmod.sourceMapFiles = cg.sourceMapFiles;
  wmod.sourceMapEntries = cg.sourceMapEntries;

  // Embed sources for -g2 — only files referenced by the source map
  if (options.compilerOptions.embedSources && options.sourceBuffers) {
    var sources = {};
    for (const f of cg.sourceMapFiles) {
      var content = options.sourceBuffers.get(f);
      if (content) sources[f] = content;
    }
    wmod.embeddedSources = sources;
  }

  const bytes = wmod.emit();

  // Backstop: ask the WASM engine whether we produced legal bytecode.
  // This is a LAST-RESORT diagnostic, not the primary one. It exists
  // because invalid WASM produced by a codegen bug is *much* nicer to
  // hit at compile time than at instantiation time on the user's machine.
  //
  // It is NOT a substitute for frontend / codegen checks:
  //   - The error points at a byte offset in the emitted module, not at
  //     C source. ("local.set[0] expected i32, found i64 @+160") That's
  //     near-useless to a user of the compiler.
  //   - Every error this catches should be considered a missing check
  //     somewhere upstream. Fix the upstream gap; don't lean on this.
  //
  // Skip entirely if WebAssembly isn't available (older runtimes, sandboxes).
  // Disabled with `--no-wasm-validate` if it ever becomes a hot-path concern.
  if (!options.compilerOptions.noWasmValidate &&
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.validate === 'function' &&
      !WebAssembly.validate(bytes)) {
    let detail = '(no detail available)';
    try { new WebAssembly.Module(bytes); }
    catch (e) { detail = e.message; }
    writeErr(
      `internal compiler error: emitted invalid WebAssembly: ${detail}\n` +
      `This is a codegen bug — please report. Frontend / codegen checks ` +
      `should catch this class of issue; the WASM validator is only a backstop.\n`);
    fatalExit(1);
  }
  return bytes;
}

return {
  generateCode,
};
})();

// ====================
// ====================
// Stdlib (Loaded from stdlib.js)
// ====================

const Stdlib = (() => {
  let factory;
  if (typeof require !== "undefined" && typeof module !== "undefined") {
    try {
      factory = require("./stdlib.js");
    } catch (e) {
      // Fallback
    }
  }
  if (!factory && typeof self !== "undefined") factory = self.createStdlib;
  if (!factory && typeof window !== "undefined") factory = window.createStdlib;
  if (!factory && typeof globalThis !== "undefined") factory = globalThis.createStdlib;
  if (typeof factory === "function") {
    return factory(Lexer, Parser, FatalDiag, withDiag, INLINER, GOTO_NORMALIZER);
  }
  throw new Error("Stdlib module factory not found. Ensure stdlib.js is loaded or available.");
})();

// ====================
// HTML Output
// ====================

const HtmlOutput = (() => {

function generate({ wasmBinary, hostJsSource, opfsFiles, runArgs, programName, xtermSources }) {
  const strippedHostJs = hostJsSource.replace(/^#!.*\n/, '');
  const safeHostJs = strippedHostJs.replace(/<\/script>/gi, '<\\/script>');
  const wasmBase64 = Buffer.from(wasmBinary).toString('base64');
  const opfsEntries = opfsFiles.map(f => ({
    path: f.destPath,
    data: Buffer.from(f.bytes).toString('base64'),
  }));
  const hasXterm = !!xtermSources;
  const safeXtermJs = hasXterm ? xtermSources.xtermJs.replace(/<\/script>/gi, '<\\/script>') : '';
  const safeXtermFitJs = hasXterm ? xtermSources.xtermFitJs.replace(/<\/script>/gi, '<\\/script>') : '';

  const workerScript = `
${strippedHostJs}

var sdlRef = null;
var wasmInstance = null;
var decoder = new TextDecoder();
var stdinResolve = null;
var termSizeResolve = null;
var stdinReadyResolve = null;
var stdinNotifyResolvers = [];

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type === 'run') doRun(msg);
  else if (msg.type === 'keydown' || msg.type === 'keyup') {
    if (sdlRef) sdlRef.pushKeyEvent(msg.handle, msg.eventType, msg.scancode, msg.sym);
  } else if (msg.type === 'mousedown' || msg.type === 'mouseup') {
    if (sdlRef) sdlRef.pushMouseButtonEvent(msg.handle, msg.eventType, msg.button, msg.x, msg.y);
  } else if (msg.type === 'mousemove') {
    if (sdlRef) sdlRef.pushMouseMotionEvent(msg.handle, msg.x, msg.y);
  } else if (msg.type === 'wheel') {
    if (sdlRef) sdlRef.pushMouseWheelEvent(msg.handle, msg.x, msg.y);
  } else if (msg.type === 'quit') {
    if (sdlRef) sdlRef.pushQuitEvent(1);
  } else if (msg.type === 'stdin-response') {
    if (stdinResolve) { var r = stdinResolve; stdinResolve = null; r(msg.data ? new Uint8Array(msg.data) : null); }
  } else if (msg.type === 'terminal-size') {
    if (termSizeResolve) { var r = termSizeResolve; termSizeResolve = null; r({ rows: msg.rows, cols: msg.cols }); }
  } else if (msg.type === 'stdin-ready-response') {
    if (stdinReadyResolve) { var r = stdinReadyResolve; stdinReadyResolve = null; r(msg.ready); }
  } else if (msg.type === 'stdin-data-available') {
    var resolvers = stdinNotifyResolvers;
    stdinNotifyResolvers = [];
    for (var ri = 0; ri < resolvers.length; ri++) resolvers[ri]();
  }
};

async function doRun(msg) {
  var opts = {
    bytes: msg.bytes,
    args: msg.args && msg.args.length > 0 ? msg.args : undefined,
    useBrowserFS: true,
    writeOut: function(buf) {
      var text = (buf instanceof Uint8Array) ? decoder.decode(buf) : String(buf);
      self.postMessage({ type: 'stdout', text: text });
    },
    writeErr: function(buf) {
      var text = (buf instanceof Uint8Array) ? decoder.decode(buf) : String(buf);
      self.postMessage({ type: 'stderr', text: text });
    },
    onReady: function(info) { sdlRef = info.sdl; wasmInstance = info.instance; },
    requestStdin: function(maxBytes) {
      return new Promise(function(resolve) {
        stdinResolve = resolve;
        self.postMessage({ type: 'stdin-request', maxBytes: maxBytes });
      });
    },
    requestTerminalSize: function() {
      return new Promise(function(resolve) {
        termSizeResolve = resolve;
        self.postMessage({ type: 'terminal-size-request' });
      });
    },
    requestStdinReady: function() {
      return new Promise(function(resolve) {
        stdinReadyResolve = resolve;
        self.postMessage({ type: 'stdin-ready-request' });
      });
    },
    requestStdinNotify: function() {
      return new Promise(function(resolve) {
        stdinNotifyResolvers.push(resolve);
      });
    },
  };
  if (msg.canvas) {
    opts.getBrowserSDL = msg.canvas;
    opts.notifyWindow = function(m) { self.postMessage(m); };
  }
  if (msg.sharedAudioBuffer) {
    opts.sharedAudioBuffer = { sharedBuffer: msg.sharedAudioBuffer, bufferSize: msg.audioBufferSize };
    opts.notifyAudio = function(m) { self.postMessage(m); };
  }
  try {
    var exitCode = await runModule(opts);
    self.postMessage({ type: 'exit', exitCode: exitCode });
  } catch(err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}
`;

  const xtermStyleTag = hasXterm ? `<style>${xtermSources.xtermCss}</style>` : '';
  const xtermScriptTags = hasXterm ? `<script>${safeXtermJs}<\/script>\n<script>${safeXtermFitJs}<\/script>` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(programName)}</title>
${xtermStyleTag}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;color:#0f0;font-family:monospace;height:100vh;display:flex;flex-direction:column;overflow:hidden}
#overlay{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;z-index:10;cursor:pointer}
#overlay span{font-size:28px;color:#fff}
#canvas-container{flex:1;display:none;align-items:center;justify-content:center;background:#000;min-height:0}
#canvas{image-rendering:pixelated;object-fit:contain;width:100%;height:100%}
#terminal{flex:1;display:none}
#output{flex:1;padding:8px;overflow-y:auto;white-space:pre-wrap;font-size:14px;display:none}
#log-panel{display:none;flex-direction:column;max-height:40vh;border-top:1px solid #333}
#log-toolbar{display:flex;gap:4px;padding:4px 8px;background:#111;flex-shrink:0}
#log-toolbar button{background:#222;color:#aaa;border:1px solid #444;padding:2px 8px;font-size:11px;font-family:monospace;cursor:pointer}
#log-toolbar button.active{color:#fff;border-color:#888}
#log-toolbar button:hover{background:#333}
#log-content{flex:1;overflow-y:auto;padding:4px 8px;font-size:12px;white-space:pre-wrap;background:#0a0a0a;min-height:0}
#log-content .log-out{color:#0f0}
#log-content .log-err{color:#f44}
#status{position:fixed;bottom:8px;right:8px;padding:4px 12px;font-size:12px;color:#aaa;background:rgba(0,0,0,0.7);border:1px solid #333;border-radius:4px;display:none;opacity:1;transition:opacity 0.5s ease;pointer-events:none;z-index:20}
</style>
</head>
<body>
<div id="overlay" tabindex="0"><span>Click to Start</span></div>
<div id="canvas-container"><canvas id="canvas"></canvas></div>
<div id="terminal"></div>
<pre id="output"></pre>
<div id="log-panel">
  <div id="log-toolbar">
    <button id="log-toggle">Console</button>
    <button id="log-stdout" class="active">stdout</button>
    <button id="log-stderr" class="active">stderr</button>
    <label id="volume-label" style="margin-left:auto;display:flex;align-items:center;gap:4px;color:#aaa;font-size:12px">Vol<input id="volume-slider" type="range" min="0" max="100" value="40" style="width:80px;vertical-align:middle"><span id="volume-pct">40%</span></label>
  </div>
  <div id="log-content"></div>
</div>
<div id="status"></div>
${xtermScriptTags}
<script>${safeHostJs}<\/script>
<script>
window.onerror = function(msg, url, line, col, err) {
  document.getElementById('status').style.display = 'block';
  document.getElementById('status').textContent = 'JS Error: ' + msg + ' (line ' + line + ')';
  console.error('[global error]', msg, url, line, col, err);
};
window.onunhandledrejection = function(e) {
  document.getElementById('status').style.display = 'block';
  document.getElementById('status').textContent = 'Unhandled rejection: ' + (e.reason && e.reason.message || e.reason);
  console.error('[unhandled rejection]', e.reason);
};
(function() {
  var WASM_BASE64 = ${JSON.stringify(wasmBase64)};
  var OPFS_FILES = ${JSON.stringify(opfsEntries)};
  var RUN_ARGS = ${JSON.stringify(runArgs)};
  var PROGRAM_NAME = ${JSON.stringify(programName)};
  var HAS_XTERM = ${hasXterm};

  var overlay = document.getElementById('overlay');
  var canvasContainer = document.getElementById('canvas-container');
  var canvas = document.getElementById('canvas');
  var terminalEl = document.getElementById('terminal');
  var output = document.getElementById('output');
  var logPanel = document.getElementById('log-panel');
  var logContent = document.getElementById('log-content');
  var logToggle = document.getElementById('log-toggle');
  var logStdoutBtn = document.getElementById('log-stdout');
  var logStderrBtn = document.getElementById('log-stderr');
  var volumeSlider = document.getElementById('volume-slider');
  var status = document.getElementById('status');
  var worker = null;
  var audioReceiver = null;
  var hasSDL = false;
  var sdlCanvasW = 0, sdlCanvasH = 0;
  var term = null;
  var stdinLine = '';
  var stdinResolve = null;
  var stdinRawMode = false;
  var stdinRawBuffer = [];
  var opostMode = true;
  var logExpanded = false;
  var showStdout = true;
  var showStderr = true;

  logToggle.addEventListener('click', function() {
    logExpanded = !logExpanded;
    logContent.style.display = logExpanded ? 'block' : 'none';
    logToggle.textContent = logExpanded ? 'Console \\u25BC' : 'Console \\u25B6';
  });
  logStdoutBtn.addEventListener('click', function() {
    showStdout = !showStdout;
    logStdoutBtn.classList.toggle('active', showStdout);
    updateLogVisibility();
  });
  logStderrBtn.addEventListener('click', function() {
    showStderr = !showStderr;
    logStderrBtn.classList.toggle('active', showStderr);
    updateLogVisibility();
  });
  var volumePct = document.getElementById('volume-pct');
  volumeSlider.addEventListener('input', function() {
    var v = volumeSlider.value / 100;
    volumePct.textContent = volumeSlider.value + '%';
    if (audioReceiver) audioReceiver.setVolume(v * v);
  });
  function updateLogVisibility() {
    var entries = logContent.children;
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i];
      if (el.classList.contains('log-out')) el.style.display = showStdout ? '' : 'none';
      else if (el.classList.contains('log-err')) el.style.display = showStderr ? '' : 'none';
    }
  }

  var ANSI_GREEN = '\\x1b[32m';
  var ANSI_RED = '\\x1b[31m';
  var ANSI_RESET = '\\x1b[0m';

  var fitAddon = null;
  if (HAS_XTERM && typeof Terminal === 'function') {
    term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Menlo', 'Consolas', 'Courier New', monospace",
      theme: { background: '#0d0d1a', foreground: '#b0f0b0', cursor: '#b0f0b0' },
    });
    if (typeof FitAddon === 'function') {
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalEl);
      window.addEventListener('resize', function() { fitAddon.fit(); });
    } else {
      term.open(terminalEl);
    }
    term.onData(function(data) {
      if (stdinRawMode) {
        var encoder = new TextEncoder();
        var bytes = encoder.encode(data);
        if (stdinResolve) {
          var resolve = stdinResolve;
          stdinResolve = null;
          resolve(bytes);
        } else {
          for (var b = 0; b < bytes.length; b++) stdinRawBuffer.push(bytes[b]);
        }
        if (worker) worker.postMessage({ type: 'stdin-data-available' });
        return;
      }
      if (!stdinResolve) return;
      for (var i = 0; i < data.length; i++) {
        var ch = data[i];
        if (ch === '\\r') {
          term.write('\\r\\n');
          var line = stdinLine + '\\n';
          stdinLine = '';
          var resolve = stdinResolve;
          stdinResolve = null;
          var encoder = new TextEncoder();
          resolve(encoder.encode(line));
        } else if (ch === '\\x7f' || ch === '\\b') {
          if (stdinLine.length > 0) {
            stdinLine = stdinLine.slice(0, -1);
            term.write('\\b \\b');
          }
        } else if (ch >= ' ') {
          stdinLine += ch;
          term.write(ch);
        }
      }
    });
  }

  var sdlNamedKeysyms = {
    'Enter':13,'Escape':27,'Backspace':8,'Tab':9,' ':32,'Delete':127
  };
  var sdlScancodeMap = {
    'ArrowUp':82,'ArrowDown':81,'ArrowLeft':80,'ArrowRight':79,
    'ShiftLeft':225,'ShiftRight':229,'ControlLeft':224,'ControlRight':228,
    'AltLeft':226,'AltRight':230,
    'F1':58,'F2':59,'F3':60,'F4':61,'F5':62,'F6':63,
    'F7':64,'F8':65,'F9':66,'F10':67,'F11':68,'F12':69
  };
  function sdlKeysym(e) {
    if (typeof e.key==='string'&&e.key.length===1) return e.key.charCodeAt(0);
    if (sdlNamedKeysyms[e.key]!==undefined) return sdlNamedKeysyms[e.key];
    return (sdlScancodeMap[e.code]||0)|0x40000000;
  }
  function sdlScancode(e) { return sdlScancodeMap[e.code]||0; }

  function onKeydown(e) {
    if (!worker||!hasSDL) return;
    e.preventDefault();
    worker.postMessage({type:'keydown',handle:1,eventType:0x300,scancode:sdlScancode(e),sym:sdlKeysym(e)});
  }
  function onKeyup(e) {
    if (!worker||!hasSDL) return;
    e.preventDefault();
    worker.postMessage({type:'keyup',handle:1,eventType:0x301,scancode:sdlScancode(e),sym:sdlKeysym(e)});
  }
  function canvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var cw = sdlCanvasW || canvas.width || rect.width;
    var ch = sdlCanvasH || canvas.height || rect.height;
    var aspect = cw / ch;
    var rw, rh, ox, oy;
    if (rect.width / rect.height > aspect) {
      rh = rect.height; rw = rh * aspect; ox = (rect.width - rw) / 2; oy = 0;
    } else {
      rw = rect.width; rh = rw / aspect; ox = 0; oy = (rect.height - rh) / 2;
    }
    return {x:Math.round((e.offsetX-ox)*cw/rw), y:Math.round((e.offsetY-oy)*ch/rh)};
  }
  function onMousedown(e) {
    if (!worker||!hasSDL) return;
    var c=canvasCoords(e);
    worker.postMessage({type:'mousedown',handle:1,eventType:0x401,button:e.button+1,x:c.x,y:c.y});
  }
  function onMouseup(e) {
    if (!worker||!hasSDL) return;
    var c=canvasCoords(e);
    worker.postMessage({type:'mouseup',handle:1,eventType:0x402,button:e.button+1,x:c.x,y:c.y});
  }
  function onMousemove(e) {
    if (!worker||!hasSDL) return;
    var c=canvasCoords(e);
    worker.postMessage({type:'mousemove',handle:1,x:c.x,y:c.y});
  }
  function onWheel(e) {
    if (!worker||!hasSDL) return;
    e.preventDefault();
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 20;
    else if (e.deltaMode === 2) dy *= 600;
    worker.postMessage({type:'wheel',handle:1,x:0,y:Math.round(dy)});
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function writeOutput(text, isErr) {
    if (hasSDL) {
      var span = document.createElement('span');
      span.className = isErr ? 'log-err' : 'log-out';
      span.textContent = text;
      if (isErr && !showStderr) span.style.display = 'none';
      if (!isErr && !showStdout) span.style.display = 'none';
      logContent.appendChild(span);
      if (logExpanded) logContent.scrollTop = logContent.scrollHeight;
      return;
    }
    if (term) {
      if (!opostMode) {
        term.write(text);
      } else {
        var escaped = text.replace(/\\n/g, '\\r\\n');
        term.write((isErr ? ANSI_RED : ANSI_GREEN) + escaped + ANSI_RESET);
      }
    } else {
      output.style.display = 'block';
      var span = document.createElement('span');
      if (isErr) span.style.color = '#f44';
      span.textContent = text;
      output.appendChild(span);
      output.scrollTop = output.scrollHeight;
    }
  }

  var statusTimer = null;
  function setStatus(text) {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if (!text) { status.style.display = 'none'; return; }
    status.textContent = text;
    status.style.display = 'block';
    status.style.opacity = '1';
    statusTimer = setTimeout(function() {
      status.style.opacity = '0';
      statusTimer = setTimeout(function() { status.style.display = 'none'; }, 500);
    }, 2000);
  }

  async function writeToOPFS(path, data) {
    var root = await navigator.storage.getDirectory();
    var parts = path.split('/').filter(Boolean);
    var dir = root;
    for (var i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    var writable = await fh.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async function start() {
    overlay.style.display = 'none';
    if (term) { term.clear(); terminalEl.style.display = 'block'; if (fitAddon) fitAddon.fit(); term.focus(); }
    setStatus('Writing files...');

    var wasmBytes = base64ToBytes(WASM_BASE64);

    for (var i = 0; i < OPFS_FILES.length; i++) {
      var fileData = base64ToBytes(OPFS_FILES[i].data);
      await writeToOPFS(OPFS_FILES[i].path, fileData);
    }

    setStatus('Starting...');
    var workerSource = ${JSON.stringify(workerScript)};
    var blob = new Blob([workerSource], { type: 'application/javascript' });
    var workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);

    var newCanvas = document.createElement('canvas');
    newCanvas.id = 'canvas';
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height;
    canvas.replaceWith(newCanvas);
    canvas = newCanvas;
    var offscreen = canvas.transferControlToOffscreen();

    var sharedAudio = null;
    audioReceiver = null;
    if (typeof SharedArrayBuffer !== 'undefined' && typeof createSharedAudioBuffer === 'function') {
      sharedAudio = createSharedAudioBuffer();
      audioReceiver = createAudioReceiver({
        sharedBuffer: sharedAudio.sharedBuffer,
        bufferSize: sharedAudio.bufferSize
      });
    }

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.type === 'stdout') {
        writeOutput(msg.text, false);
      } else if (msg.type === 'stderr') {
        writeOutput(msg.text, true);
      } else if (msg.type === 'exit') {
        setStatus(msg.exitCode === 0 ? 'Exited.' : 'Exit code: ' + msg.exitCode);
        cleanup();
      } else if (msg.type === 'sdl-window') {
        hasSDL = true;
        sdlCanvasW = msg.width || 800;
        sdlCanvasH = msg.height || 600;
        if (term) terminalEl.style.display = 'none';
        canvasContainer.style.display = 'flex';
        logPanel.style.display = 'flex';
        logContent.style.display = 'none';
        logToggle.textContent = 'Console \\u25B6';
        setStatus('');
      } else if (msg.type === 'error') {
        writeOutput('Runtime error: ' + msg.message + '\\n', true);
        setStatus('');
        cleanup();
      } else if (msg.type === 'stdin-request') {
        if (term) {
          if (stdinRawMode) {
            if (stdinRawBuffer.length > 0) {
              var chunk = new Uint8Array(stdinRawBuffer);
              stdinRawBuffer = [];
              worker.postMessage({ type: 'stdin-response', data: Array.from(chunk) });
            } else {
              worker.postMessage({ type: 'stdin-response', data: null });
            }
          } else {
            stdinResolve = function(data) {
              worker.postMessage({ type: 'stdin-response', data: data ? Array.from(data) : null });
            };
          }
        }
      } else if (msg.type === 'termios-mode') {
        stdinRawMode = !msg.icanon;
        opostMode = msg.opost;
      } else if (msg.type === 'terminal-size-request') {
        var rows = 24, cols = 80;
        if (term) { rows = term.rows; cols = term.cols; }
        worker.postMessage({ type: 'terminal-size', rows: rows, cols: cols });
      } else if (msg.type === 'stdin-ready-request') {
        var ready = stdinRawMode ? stdinRawBuffer.length > 0 : stdinLine.length > 0;
        worker.postMessage({ type: 'stdin-ready-response', ready: ready });
      } else if (msg.type && msg.type.startsWith('audio-')) {
        if (audioReceiver) audioReceiver.handleMessage(msg);
      }
    };

    worker.onerror = function(e) {
      writeOutput('Worker error: ' + e.message + '\\n', true);
      setStatus('');
      cleanup();
    };

    function cleanup() {
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('keyup', onKeyup, true);
      canvas.removeEventListener('mousedown', onMousedown);
      canvas.removeEventListener('mouseup', onMouseup);
      canvas.removeEventListener('mousemove', onMousemove);
      canvas.removeEventListener('wheel', onWheel);
      if (audioReceiver) audioReceiver.close();
      worker = null;
      stdinRawMode = false;
      stdinRawBuffer = [];
      opostMode = true;
      stdinLine = '';
      hasSDL = false;
      overlay.style.display = 'flex';
      overlay.focus();
    }

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('keyup', onKeyup, true);
    canvas.addEventListener('mousedown', onMousedown);
    canvas.addEventListener('mouseup', onMouseup);
    canvas.addEventListener('mousemove', onMousemove);
    canvas.addEventListener('wheel', onWheel, {passive:false});

    var transfer = [wasmBytes.buffer, offscreen];
    var msg = {
      type: 'run',
      bytes: wasmBytes,
      args: [PROGRAM_NAME].concat(RUN_ARGS),
      canvas: offscreen
    };
    if (sharedAudio) {
      msg.sharedAudioBuffer = sharedAudio.sharedBuffer;
      msg.audioBufferSize = sharedAudio.bufferSize;
    }
    worker.postMessage(msg, transfer);
    setStatus('Running...');
  }

  function safeStart() {
    start().catch(function(err) {
      console.error('[main] start() error:', err);
      setStatus('Error: ' + (err.message || err));
      document.getElementById('output').style.display = 'block';
      document.getElementById('output').textContent = 'Fatal: ' + (err.stack || err.message || err);
    });
  }
  overlay.addEventListener('click', safeStart);
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') safeStart();
  });
  overlay.focus();
})();
</script>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

return { generate };
})();

// ====================
// JS Output (Node.js)
// ====================

const JsOutput = (() => {

function generate({ wasmBinary, hostJsSource, opfsFiles, runArgs, programName }) {
  const strippedHostJs = hostJsSource.replace(/^#!.*\n/, '');
  const wasmBase64 = Buffer.from(wasmBinary).toString('base64');
  const opfsEntries = opfsFiles.map(f => ({
    path: f.destPath,
    data: Buffer.from(f.bytes).toString('base64'),
  }));

  const hostBody = strippedHostJs.replace(/\/\/\s*-+\s*\n\/\/\s*Dual-purpose logic[\s\S]*$/, '');

  let dataFileSetup = '';
  if (opfsEntries.length > 0) {
    dataFileSetup = `
// Write embedded data files to disk
var __opfsFiles = ${JSON.stringify(opfsEntries)};
var __tmpDir = __require("os").tmpdir();
var __dataDir = __require("path").join(__tmpDir, "cjs-" + process.pid);
__require("fs").mkdirSync(__dataDir, { recursive: true });
for (var __i = 0; __i < __opfsFiles.length; __i++) {
  var __dest = __require("path").join(__dataDir, __opfsFiles[__i].path);
  __require("fs").mkdirSync(__require("path").dirname(__dest), { recursive: true });
  __require("fs").writeFileSync(__dest, Buffer.from(__opfsFiles[__i].data, "base64"));
}
process.chdir(__dataDir);
`;
  }

  const js = `#!/usr/bin/env node
// Generated by c-compiler
var __require = require;
${hostBody}
var __wasmBase64 = ${JSON.stringify(wasmBase64)};
var __wasmBytes = Buffer.from(__wasmBase64, "base64");
${dataFileSetup}
var __args = [${JSON.stringify(programName)}].concat(process.argv.slice(2));
runModule({
  bytes: __wasmBytes,
  args: __args,
  fs: __require("fs"),
  getSDL: function () { return __require("@kmamal/sdl"); },
}).then(function (exitCode) {
  process.exit(exitCode);
}).catch(function (e) {
  process.stderr.write("Fatal: " + e.message + "\\n");
  if (e.stack) process.stderr.write(e.stack + "\\n");
  process.exit(1);
});
`;

  return Buffer.from(js, 'utf-8');
}

return { generate };
})();

function main() {
  const fs = require("fs");
  const path = require("path");
  function expandProjectJson(jsonPath, isInclude) {
    const proj = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const projDir = path.dirname(path.resolve(jsonPath));
    const projType = proj.type || "bin";
    if (projType !== "bin" && projType !== "lib") {
      process.stderr.write(`Error in ${jsonPath}: unknown type "${projType}" (expected "bin" or "lib")\n`);
      process.exit(1);
    }
    if (projType === "lib" && !isInclude) {
      process.stderr.write(`Error: ${jsonPath} is a library project and cannot be compiled directly. It can only be included as a dependency from another project.\n`);
      process.exit(1);
    }
    const result = [];
    if (proj.deps) {
      for (const dep of proj.deps) {
        result.push(...expandProjectJson(path.resolve(projDir, dep), true));
      }
    }
    if (proj.includes) {
      for (const inc of proj.includes) result.push("-I" + path.resolve(projDir, inc));
    }
    if (proj.compilerArgs) {
      for (const ca of proj.compilerArgs) {
        if (ca.startsWith("-I")) result.push("-I" + path.resolve(projDir, ca.substring(2)));
        else result.push(ca);
      }
    }
    if (proj.sources) {
      for (const src of proj.sources) result.push(path.resolve(projDir, src));
    }
    if (proj.dataFiles) {
      for (const [src, dest] of Object.entries(proj.dataFiles)) {
        const resolved = path.resolve(projDir, src);
        if (!fs.existsSync(resolved)) {
          process.stderr.write(`Error in ${jsonPath}:\n  Data file not found: ${resolved}\n`);
          process.exit(1);
        }
        result.push("--opfs-file", resolved + ":" + dest);
      }
    }
    if (proj.runArgs) {
      for (const ra of proj.runArgs) result.push("--run-arg", ra);
    }
    return result;
  }

  const rawArgs = process.argv.slice(2);
  const args = [];
  for (const arg of rawArgs) {
    if (!arg.startsWith("-") && arg.endsWith(".json")) {
      try {
        args.push(...expandProjectJson(arg, false));
      } catch (e) {
        process.stderr.write(`Error reading project file ${arg}: ${e.message}\n`);
        process.exit(1);
      }
    } else {
      args.push(arg);
    }
  }

  let action = "compile";
  let outputFile = "a.wasm";
  const inputFiles = [];
  const opfsFiles = [];
  const runArgs = [];
  const warningFlags = { pointerDecay: false, circularDependency: false };
  const compilerOptions = { debugSwitch: false, allowImplicitInt: false, allowEmptyParams: false, allowKnRDefinitions: false, allowImplicitFunctionDecl: false, allowUndefined: false, gcSections: false, gcNoExportRoots: false, noUndefined: false, timeReport: false, requireSources: [] };
  let noXterm = false;
  const pp = Stdlib.createDefaultPPRegistry();

  // Set up file reader
  pp.fileReader = (filePath) => {
    try {
      return Lexer.spliceLines(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-a" || args[i] === "--action") {
      action = args[++i];
    } else if (args[i].startsWith("-D")) {
      const def = args[i].substring(2);
      const eqIdx = def.indexOf("=");
      if (eqIdx >= 0) {
        pp.defines.set(def.substring(0, eqIdx), def.substring(eqIdx + 1));
      } else {
        pp.defines.set(def, "1");
      }
    } else if (args[i].startsWith("-I")) {
      pp.includePaths.push(args[i].substring(2));
    } else if (args[i] === "-o") {
      outputFile = args[++i];
    } else if (args[i].startsWith("-W")) {
      const wflag = args[i].substring(2);
      if (wflag === "pointer-decay") warningFlags.pointerDecay = true;
      else if (wflag === "no-pointer-decay") warningFlags.pointerDecay = false;
      else if (wflag === "circular-dependency") warningFlags.circularDependency = true;
      else if (wflag === "no-circular-dependency") warningFlags.circularDependency = false;
    } else if (args[i] === "-g" || args[i] === "-g1") {
      compilerOptions.emitNames = true;
    } else if (args[i] === "-g2") {
      compilerOptions.emitNames = true;
      compilerOptions.embedSources = true;
    } else if (args[i] === "--no-reuse-locals") {
      compilerOptions.noReuseLocals = true;
    } else if (args[i] === "--compiler-debug-switch") {
      compilerOptions.debugSwitch = true;
    } else if (args[i] === "--allow-implicit-int") {
      compilerOptions.allowImplicitInt = true;
    } else if (args[i] === "--allow-empty-params") {
      compilerOptions.allowEmptyParams = true;
    } else if (args[i] === "--allow-knr-definitions") {
      compilerOptions.allowKnRDefinitions = true;
    } else if (args[i] === "--allow-implicit-function-decl") {
      compilerOptions.allowImplicitFunctionDecl = true;
    } else if (args[i] === "--allow-undefined") {
      compilerOptions.allowUndefined = true;
    } else if (args[i] === "--time-report") {
      compilerOptions.timeReport = true;
    } else if (args[i] === "--allow-old-c") {
      compilerOptions.allowImplicitInt = true;
      compilerOptions.allowEmptyParams = true;
      compilerOptions.allowKnRDefinitions = true;
      compilerOptions.allowImplicitFunctionDecl = true;
    } else if (args[i] === "--gc-sections") {
      compilerOptions.gcSections = true;
    } else if (args[i] === "--gc-no-export-roots") {
      compilerOptions.gcNoExportRoots = true;
    } else if (args[i] === "--no-undefined") {
      compilerOptions.noUndefined = true;
    } else if (args[i] === "--require-source") {
      if (i + 1 >= args.length) {
        process.stderr.write("Error: --require-source requires an argument\n");
        process.exit(1);
      }
      compilerOptions.requireSources.push(args[++i]);
    } else if (args[i] === "--opfs-file") {
      if (i + 1 >= args.length) {
        process.stderr.write("Error: --opfs-file requires src:dest argument\n");
        process.exit(1);
      }
      const arg = args[++i];
      const colonIdx = arg.indexOf(":");
      if (colonIdx < 0) {
        process.stderr.write("Error: --opfs-file requires src:dest format (e.g. data/file.dat:/file.dat)\n");
        process.exit(1);
      }
      opfsFiles.push({ srcPath: arg.substring(0, colonIdx), destPath: arg.substring(colonIdx + 1) });
    } else if (args[i] === "--run-arg") {
      if (i + 1 >= args.length) {
        process.stderr.write("Error: --run-arg requires an argument\n");
        process.exit(1);
      }
      runArgs.push(args[++i]);
    } else if (args[i] === "--no-xterm") {
      noXterm = true;
    } else if (args[i].startsWith("-")) {
      // Silently ignore unknown options
    } else {
      inputFiles.push(args[i]);
    }
  }

  if (!inputFiles.length && action === "compile") {
    process.stderr.write("Usage: node compiler.js [-a <lex|parse|link|compile>] [-o output.wasm|.html|.js] [-Dname[=val]] [-Ipath] <files...>\n");
    process.exit(1);
  }

  if (action === "lex") {
    for (const file of inputFiles) {
      const source = fs.readFileSync(file, "utf-8");
      const filename = Lexer.intern(file);
      const result = Lexer.tokenize(filename, source, pp);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          process.stderr.write(`${err.filename}:${err.line}: error: ${err.message}\n`);
        }
        process.exit(1);
      }
      for (const t of result.tokens) {
        if (t.kind === Lexer.TokenKind.EOS) continue;
        process.stdout.write(Lexer.formatToken(t) + "\n");
      }
    }
  } else if (action === "parse" || action === "link" || action === "compile") {
    const hrtime = () => {
      const [s, ns] = process.hrtime();
      return s * 1000 + ns / 1e6;
    };
    const timing = compilerOptions.timeReport ? { lexMs: 0, parseMs: 0 } : null;
    const units = Stdlib.parseAllUnits(fs, pp, inputFiles, { warningFlags, compilerOptions, timing });

    if (action === "parse") {
      process.stdout.write(Parser.dumpAst(units));
    } else if (action === "link") {
      const linkResult = Parser.linkTranslationUnits(units, compilerOptions);
      if (linkResult.errors.length > 0) {
        process.stderr.write(`Got ${linkResult.errors.length} link errors.\n`);
        for (const err of linkResult.errors) {
          process.stderr.write(`Link error: ${err.message}\n`);
          if (err.locations) for (const loc of err.locations) {
            if (loc?.filename) process.stderr.write(`  at ${loc.filename}:${loc.line}\n`);
          }
        }
        process.exit(1);
      }
      process.stdout.write(Parser.dumpAst(units));
    } else if (action === "compile") {
      let t0 = hrtime();
      const linkResult = Parser.linkTranslationUnits(units, compilerOptions);
      const linkMs = hrtime() - t0;
      if (linkResult.errors.length > 0) {
        process.stderr.write(`Got ${linkResult.errors.length} link errors.\n`);
        for (const err of linkResult.errors) {
          process.stderr.write(`Link error: ${err.message}\n`);
          if (err.locations) for (const loc of err.locations) {
            if (loc?.filename) process.stderr.write(`  at ${loc.filename}:${loc.line}\n`);
          }
        }
        process.exit(1);
      }
      // After linking with --allow-undefined, move promoted extern functions
      // from declaredFunctions to importedFunctions so codegen emits wasm imports.
      if (compilerOptions.allowUndefined) {
        for (const unit of units) {
          const kept = [];
          for (const func of unit.declaredFunctions) {
            if (func.storageClass === Types.StorageClass.IMPORT) {
              unit.importedFunctions.push(func);
            } else {
              kept.push(func);
            }
          }
          unit.declaredFunctions = kept;
        }
      }
      if (compilerOptions.gcSections) Parser.gcSectionsPass(units, compilerOptions);
      t0 = hrtime();
      const codegenOpts = { compilerOptions };
      if (compilerOptions.embedSources) codegenOpts.sourceBuffers = pp.sourceBuffers;
      const wasmBinary = Codegen.generateCode(units, outputFile, codegenOpts);
      const codegenMs = hrtime() - t0;
      t0 = hrtime();
      if (outputFile.endsWith(".html") || outputFile.endsWith(".js")) {
        const hostJsPath = path.join(path.dirname(process.argv[1]), "host.js");
        const hostJsSource = fs.readFileSync(hostJsPath, "utf-8");
        const resolvedOpfsFiles = opfsFiles.map(f => ({
          destPath: f.destPath,
          bytes: fs.readFileSync(f.srcPath),
        }));
        if (outputFile.endsWith(".html")) {
          const programName = path.basename(outputFile, ".html");
          let xtermSources = null;
          if (!noXterm) {
            const xtermDir = path.join(path.dirname(process.argv[1]), "vendor", "xterm");
            try {
              xtermSources = {
                xtermJs: fs.readFileSync(path.join(xtermDir, "xterm.js"), "utf-8"),
                xtermFitJs: fs.readFileSync(path.join(xtermDir, "xterm-addon-fit.js"), "utf-8"),
                xtermCss: fs.readFileSync(path.join(xtermDir, "xterm.css"), "utf-8"),
              };
            } catch (e) {}
          }
          const htmlBinary = HtmlOutput.generate({ wasmBinary, hostJsSource, opfsFiles: resolvedOpfsFiles, runArgs, programName, xtermSources });
          fs.writeFileSync(outputFile, htmlBinary);
        } else {
          const programName = path.basename(outputFile, ".js");
          const jsBinary = JsOutput.generate({ wasmBinary, hostJsSource, opfsFiles: resolvedOpfsFiles, runArgs, programName });
          fs.writeFileSync(outputFile, jsBinary);
          fs.chmodSync(outputFile, 0o755);
        }
      } else {
        fs.writeFileSync(outputFile, wasmBinary);
      }
      const writeMs = hrtime() - t0;

      if (compilerOptions.timeReport) {
        const lexMs = timing.lexMs;
        const parseMs = timing.parseMs;
        const totalMs = lexMs + parseMs + linkMs + codegenMs + writeMs;
        const pct = (v) => (v / totalMs * 100).toFixed(1);
        const fmt = (v) => v.toFixed(1).padStart(8);
        process.stderr.write(
          `===== Time Report =====\n` +
          `  Lex:     ${fmt(lexMs)} ms (${pct(lexMs).padStart(5)}%)\n` +
          `  Parse:   ${fmt(parseMs)} ms (${pct(parseMs).padStart(5)}%)\n` +
          `  Link:    ${fmt(linkMs)} ms (${pct(linkMs).padStart(5)}%)\n` +
          `  Codegen: ${fmt(codegenMs)} ms (${pct(codegenMs).padStart(5)}%)\n` +
          `  Write:   ${fmt(writeMs)} ms (${pct(writeMs).padStart(5)}%)\n` +
          `  Total:   ${fmt(totalMs)} ms\n`
        );
      }
    }
  } else {
    process.stderr.write(`Unknown action: ${action}\n`);
    process.exit(1);
  }
}


// ====================
// Exports
// ====================

var _exports = {
  // Lexer
  intern: Lexer.intern,
  TokenKind: Lexer.TokenKind,
  Keyword: Lexer.Keyword,
  StringPrefix: Lexer.StringPrefix,
  TokenFlags: Lexer.TokenFlags,
  Token: Lexer.Token,
  LexError: Lexer.LexError,
  LexResult: Lexer.LexResult,
  lex: Lexer.lex,
  unescape: Lexer.unescape,
  decodeCodepoint: Lexer.decodeCodepoint,
  unescapeCodepoint: Lexer.unescapeCodepoint,
  encodeUtf16LE: Lexer.encodeUtf16LE,
  encodeUtf32LE: Lexer.encodeUtf32LE,
  parseHexFloat: Lexer.parseHexFloat,
  postProcess: Lexer.postProcess,
  spliceLines: Lexer.spliceLines,
  PPRegistry: Lexer.PPRegistry,
  preprocess: Lexer.preprocess,
  cloneToken: Lexer.cloneToken,
  tokenize: Lexer.tokenize,
  formatToken: Lexer.formatToken,
  encodeUtf8: Lexer.encodeUtf8,
  // Types
  TypeKind: Types.TypeKind,
  TagKind: Types.TagKind,
  StorageClass: Types.StorageClass,
  ExprKind: Types.ExprKind,
  StmtKind: Types.StmtKind,
  DeclKind: Types.DeclKind,
  TypeInfo: Types.TypeInfo,
  LabelKind: Types.LabelKind,
  usualArithmeticConversions: Types.usualArithmeticConversions,
  // Parser
  parseTokens: Parser.parseTokens,
  parseSource: Parser.parseSource,
  dumpAst: Parser.dumpAst,
  filterUnusedDeclarations: Parser.filterUnusedDeclarations,
  linkTranslationUnits: Parser.linkTranslationUnits,
  lowerSetjmpLongjmp: Parser.lowerSetjmpLongjmp,
  annotateImplicitCasts: Parser.annotateImplicitCasts,
  annotateExpr: Parser.annotateExpr,
  annotateStmt: Parser.annotateStmt,
  gcSectionsPass: Parser.gcSectionsPass,
  // Pipeline
  createDefaultPPRegistry: Stdlib.createDefaultPPRegistry,
  parseAllUnits: Stdlib.parseAllUnits,
  generateCode: Codegen.generateCode,
  getStdlibHeaders: Stdlib.getStdlibHeaders,
  getStdlibSources: Stdlib.getStdlibSources,
};

if (typeof module !== 'undefined') {
  module.exports = _exports;
}
if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.CompilerJS = _exports;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}

})();
