import type { ReactNode } from "react";
import type { Syntax } from "./stacks/types";

// Colours resolve from the active theme's CSS variables (see lib/themes.ts)
const C = {
  comment: "var(--syn-comment)",
  string: "var(--syn-string)",
  keyword: "var(--syn-keyword)",
  control: "var(--syn-control)",
  type: "var(--syn-type)",
  func: "var(--syn-func)",
  number: "var(--syn-number)",
  variable: "var(--syn-variable)",
  tag: "var(--syn-tag)",
  attr: "var(--syn-attr)",
  plain: "var(--syn-plain)",
  bracket: "var(--syn-bracket)",
  meta: "var(--syn-meta)",
};

const KEYWORDS = new Set(
  (
    "const let var function async await class interface type extends implements new this super typeof keyof " +
    "public private protected internal static final abstract override virtual sealed partial readonly " +
    "void int long short float double bool boolean char byte string decimal uint object dynamic " +
    "val fun data companion lateinit suspend init constructor get set required late factory mixin " +
    "func struct enum protocol extension some any inout throws weak lazy mutating fn mut impl trait pub dyn " +
    "crate self Self def lambda local function nil null undefined None true false True False " +
    "namespace using module record operator explicit implicit auto template typename nullptr " +
    "signal onready export tool class_name extends var const and or not is as in of chan map go"
  ).split(" ")
);

const CONTROL = new Set(
  (
    "import from return if else elif elsif unless for foreach while do try catch except finally throw throws " +
    "raise switch case default break continue match when yield await use mod package require include " +
    "then end repeat until guard defer goto with pass rescue ensure begin select"
  ).split(" ")
);

const LINE_COMMENT: Record<Syntax, RegExp> = {
  clike: /^\/\/.*/,
  hash: /^#.*/,
  lua: /^--.*/,
  markup: /^<!--.*?(-->|$)/,
  css: /^\/\*.*?(\*\/|$)/,
};

export type Token = [text: string, color: string];

function tokenizeCode(line: string, syntax: Syntax): Token[] {
  const out: Token[] = [];
  let rest = line;
  let prevWord = "";
  while (rest.length) {
    let m: RegExpMatchArray | null;
    const take = (text: string, color: string) => {
      out.push([text, color]);
      rest = rest.slice(text.length);
    };
    if ((m = rest.match(LINE_COMMENT[syntax]))) take(m[0], C.comment);
    else if (syntax === "clike" && (m = rest.match(/^#\s*(include|define|pragma|if|ifdef|ifndef|endif|else)\b.*/)))
      take(m[0], C.meta);
    else if ((m = rest.match(/^(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/))) take(m[0], C.string);
    else if ((m = rest.match(/^(@[\w.]+|#\[[^\]]*\]?)/))) take(m[0], C.func);
    else if (syntax !== "lua" && (m = rest.match(/^<\/?[a-z][\w-]*/))) take(m[0], C.tag);
    else if ((m = rest.match(/^\$[A-Za-z_]\w*/))) take(m[0], C.variable);
    else if (
      syntax === "hash" &&
      /[\s(,[]$|^$/.test(out.at(-1)?.[0] ?? "") &&
      (m = rest.match(/^:[a-z_]\w*/))
    )
      take(m[0], C.type);
    else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const w = m[0];
      const isCall = /^\s*\(/.test(rest.slice(w.length));
      let color = C.variable;
      if (CONTROL.has(w)) color = C.control;
      else if (KEYWORDS.has(w)) color = C.keyword;
      else if (prevWord === "def" || prevWord === "func" || prevWord === "fn" || prevWord === "fun" || isCall)
        color = C.func;
      else if (/^[A-Z]/.test(w)) color = /^[A-Z0-9_]+$/.test(w) && w.length > 1 ? C.variable : C.type;
      take(w, color);
      prevWord = w;
      continue;
    } else if ((m = rest.match(/^\d[\d_.xXa-fA-F]*[fFdDmMuUlL]?/))) take(m[0], C.number);
    else if ((m = rest.match(/^\s+/))) {
      take(m[0], C.plain);
      continue;
    } else take(rest[0], /[{}()[\]]/.test(rest[0]) ? C.bracket : C.plain);
    prevWord = "";
  }
  return out;
}

function tokenizeMarkup(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  let inTag = false;
  while (rest.length) {
    let m: RegExpMatchArray | null;
    const take = (text: string, color: string) => {
      out.push([text, color]);
      rest = rest.slice(text.length);
    };
    if ((m = rest.match(LINE_COMMENT.markup))) take(m[0], C.comment);
    else if ((m = rest.match(/^<!?\/?[A-Za-z][\w:.-]*/))) {
      out.push(["<", "var(--ui-gutter)"]);
      rest = rest.slice(1);
      take(m[0].slice(1), m[0].includes(":") || /^<\/?[A-Z]/.test(m[0]) ? C.type : C.tag);
      inTag = true;
    } else if (inTag && (m = rest.match(/^\/?>/))) {
      take(m[0], "var(--ui-gutter)");
      inTag = false;
    } else if (inTag && (m = rest.match(/^[\w:@.#*()[\]-]+(?==)/))) take(m[0], C.attr);
    else if (inTag && (m = rest.match(/^("[^"]*"?|'[^']*'?)/))) take(m[0], C.string);
    else if ((m = rest.match(/^&\w+;/))) take(m[0], C.keyword);
    else if ((m = rest.match(/^[^<&]+/)) && !inTag) take(m[0], C.plain);
    else take(rest[0], C.plain);
  }
  return out;
}

function tokenizeCss(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  const take = (text: string, color: string) => {
    out.push([text, color]);
    rest = rest.slice(text.length);
  };
  const isDeclaration = /^\s*[-\w]+\s*:(?!:)/.test(line) && !/[{,]\s*$/.test(line);
  while (rest.length) {
    let m: RegExpMatchArray | null;
    if ((m = rest.match(LINE_COMMENT.css))) take(m[0], C.comment);
    else if ((m = rest.match(/^@[\w-]+/))) take(m[0], C.control);
    else if ((m = rest.match(/^("[^"]*"?|'[^']*'?)/))) take(m[0], C.string);
    else if (isDeclaration && (m = rest.match(/^\s*--?[\w-]+(?=\s*:)|^\s*[a-z-]+(?=\s*:)/))) take(m[0], C.attr);
    else if ((m = rest.match(/^#[0-9a-fA-F]{3,8}\b/)) && isDeclaration) take(m[0], C.number);
    else if ((m = rest.match(/^-?\d[\d.]*(px|rem|em|%|vh|vw|s|ms|fr|deg|ch)?/))) take(m[0], C.number);
    else if ((m = rest.match(/^var(?=\()|^[a-z-]+(?=\()/))) take(m[0], C.func);
    else if (!isDeclaration && (m = rest.match(/^[.#]?[A-Za-z_][\w-]*|^::?[\w-]+/)))
      take(m[0], m[0].startsWith(".") || m[0].startsWith("#") || m[0].startsWith(":") ? C.func : C.tag);
    else if (isDeclaration && (m = rest.match(/^[A-Za-z_][\w-]*/))) take(m[0], C.string);
    else take(rest[0], /[{}()]/.test(rest[0]) ? C.bracket : C.plain);
  }
  return out;
}

export function tokenizeLine(line: string, syntax: Syntax): Token[] {
  return syntax === "markup" ? tokenizeMarkup(line) : syntax === "css" ? tokenizeCss(line) : tokenizeCode(line, syntax);
}

export function isKeyword(word: string): boolean {
  return KEYWORDS.has(word) || CONTROL.has(word);
}

export function highlightLine(line: string, syntax: Syntax): ReactNode[] {
  const tokens = tokenizeLine(line, syntax);
  return tokens.map(([text, color], i) => (
    <span key={i} style={{ color }}>
      {text}
    </span>
  ));
}
