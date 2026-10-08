"use client";

import { useEffect, useRef, useState } from "react";
import { isKeyword } from "@/lib/highlight";
import type { StackConfig } from "@/lib/stacks/types";
import {
  commitMessage,
  getToolchain,
  problemMessage,
  T,
  type CodeError,
  type Ctx,
  type TermLine,
} from "@/lib/terminal/toolchains";

export interface Squiggle {
  start: number;
  end: number;
  message: string;
}

export interface SessionState {
  active: number;
  doc: string;
  cursor: number;
  selection: [number, number] | null;
  squiggle: Squiggle | null;
  dirty: boolean;
  modified: string[];
  terminal: {
    open: boolean;
    lines: TermLine[];
    /** Text being typed after the prompt; null while a command is running. */
    input: string | null;
  };
}

interface PendingTypo {
  start: number;
  wrong: string;
  correct: string;
  linesSince: number;
  fixAfterLines: number;
}

// Edits start below the import/header area so they land in real logic
const HEADER_LINES = 12;
const MAX_TERMINAL_LINES = 400;
const CANCELLED = Symbol("cancelled");
const IMPORT_LINE = /^\s*(import|from|use|using|#include|require|package|namespace|@|local\s+\w+\s*=\s*require)/;

const rnd = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const chance = (p: number) => Math.random() < p;
const lineStartOffset = (doc: string, line: number) => {
  let offset = 0;
  for (let i = 0; i < line; i++) offset = doc.indexOf("\n", offset) + 1;
  return offset;
};

function promptSegs(cfg: StackConfig, dirty: boolean, cmd: string): TermLine {
  return [
    ["➜  ", T.green],
    [cfg.project, T.cyan],
    [" git:(", T.blue],
    [cfg.branch, T.red],
    [")", T.blue],
    ...(dirty ? ([[" ✗", T.yellow]] as TermLine) : []),
    [" " + cmd],
  ];
}

/** Terminal history from "earlier in the day" so the panel already has logs when the editor opens. */
function seedTerminal(cfg: StackConfig, stackId: string): TermLine[] {
  const ctx: Ctx = { project: cfg.project, files: cfg.files, editedFile: cfg.snippets[0].filename };
  const tc = getToolchain(stackId, ctx);
  const lines: TermLine[] = [
    promptSegs(cfg, false, "git pull --rebase"),
    [["Successfully rebased and updated refs/heads/" + cfg.branch + "."]],
    promptSegs(cfg, false, tc.check),
    ...tc.checkPass(ctx),
  ];
  if (tc.test) lines.push(promptSegs(cfg, false, tc.test), ...tc.testPass(ctx));
  return lines;
}

export function initialSession(config: StackConfig, stackId: string): SessionState {
  const doc = config.snippets[0].code;
  return {
    active: 0,
    doc,
    cursor: lineStartOffset(doc, Math.min(HEADER_LINES + 4, doc.split("\n").length - 1)),
    selection: null,
    squiggle: null,
    dirty: false,
    modified: [],
    terminal: { open: true, lines: seedTerminal(config, stackId), input: "" },
  };
}

const indentWidthRaw = (line: string) => line.match(/^[ \t]*/)?.[0].length ?? 0;

function indentWidth(line: string) {
  return (line.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
}

/** Picks a run of complete statements in the middle of a file to remove and then re-type. */
function pickBlock(code: string): { s: number; e: number } {
  const lines = code.split("\n");
  const n = lines.length;
  const closes = (l: string) => /^\s*([}\])]|end\b)/.test(l);
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = rnd(Math.min(HEADER_LINES, n - 8), n - 5);
    const first = lines[s];
    if (!first?.trim() || closes(first) || indentWidth(first) === 0) continue;
    const I = indentWidth(first);
    let e = s;
    while (e + 1 < n - 1 && e - s < 14) {
      const next = lines[e + 1];
      if (!next.trim() || indentWidth(next) > I) e++;
      else if (indentWidth(next) === I && closes(next) && indentWidth(lines[e]) > I) {
        e++;
        if (e - s >= 3) break;
      } else if (indentWidth(next) === I && e - s < 4 && !closes(next)) e++;
      else break;
    }
    while (e > s && !lines[e].trim()) e--;
    if (e - s >= 2) return { s, e };
  }
  return { s: Math.max(1, n - 8), e: Math.max(2, n - 4) };
}

function misspell(word: string): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const p = rnd(1, word.length - 2);
    if (word[p] !== word[p + 1]) return word.slice(0, p) + word[p + 1] + word[p] + word.slice(p + 2);
  }
  return word.slice(0, -1);
}

function lineInfo(doc: string, offset: number) {
  const before = doc.slice(0, offset);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = doc.indexOf("\n", offset);
  return { line, col: offset - lineStart + 1, lineText: doc.slice(lineStart, lineEnd === -1 ? undefined : lineEnd) };
}

export function useCodingSession(config: StackConfig, stackId: string, speed = 1): SessionState {
  const [state, setState] = useState(() => initialSession(config, stackId));
  const startRef = useRef(state);

  useEffect(() => {
    const ctrl = { cancelled: false };
    runSession(config, stackId, setState, ctrl, startRef.current, speed).catch((err) => {
      if (err !== CANCELLED) throw err;
    });
    return () => {
      ctrl.cancelled = true;
    };
  }, [config, stackId, speed]);

  return state;
}

export async function runSession(
  cfg: StackConfig,
  stackId: string,
  emit: (s: SessionState) => void,
  ctrl: { cancelled: boolean },
  start: SessionState = initialSession(cfg, stackId),
  speed = 1
) {
  const s: SessionState = { ...start, terminal: { ...start.terminal }, modified: [...start.modified] };
  const publish = () => emit({ ...s, terminal: { ...s.terminal }, modified: [...s.modified] });
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) =>
      setTimeout(() => (ctrl.cancelled ? reject(CANCELLED) : resolve()), ms / speed)
    );

  const file = () => cfg.snippets[s.active];
  const syntax = () => file().syntax;
  const ctxFor = (editedFile: string): Ctx => ({ project: cfg.project, files: cfg.files, editedFile });

  // ---------- editing primitives ----------

  let sinceSave = 0;
  const markModified = () => {
    s.dirty = true;
    if (!s.modified.includes(file().filename)) s.modified.push(file().filename);
  };

  // Keeps an outstanding typo's position correct when text changes before it
  const shiftMarks = (at: number, delta: number) => {
    if (!pending || at > pending.start) return;
    pending.start += delta;
    if (s.squiggle) s.squiggle = { ...s.squiggle, start: s.squiggle.start + delta, end: s.squiggle.end + delta };
  };

  const insert = (text: string) => {
    shiftMarks(s.cursor, text.length);
    s.doc = s.doc.slice(0, s.cursor) + text + s.doc.slice(s.cursor);
    s.cursor += text.length;
    markModified();
    publish();
  };

  const backspace = () => {
    shiftMarks(s.cursor - 1, -1);
    s.doc = s.doc.slice(0, s.cursor - 1) + s.doc.slice(s.cursor);
    s.cursor -= 1;
    publish();
  };

  const deleteSelection = () => {
    if (!s.selection) return;
    const [a, b] = s.selection;
    shiftMarks(a, -(b - a));
    s.doc = s.doc.slice(0, a) + s.doc.slice(b);
    s.cursor = a;
    s.selection = null;
    markModified();
    publish();
  };

  const lineStarts = () => {
    const starts = [0];
    for (let i = 0; i < s.doc.length; i++) if (s.doc[i] === "\n") starts.push(i + 1);
    return starts;
  };

  const lineOf = (offset: number, starts = lineStarts()) => {
    let l = 0;
    while (l + 1 < starts.length && starts[l + 1] <= offset) l++;
    return l;
  };

  /** Moves the caret like holding an arrow key for short hops, or a click for long ones. */
  const moveCursorTo = async (target: number) => {
    const starts = lineStarts();
    const from = lineOf(s.cursor, starts);
    const to = lineOf(target, starts);
    const col = s.cursor - starts[from];
    const steps = Math.abs(to - from);
    if (steps > 0 && steps <= 18) {
      const dir = to > from ? 1 : -1;
      for (let l = from + dir; l !== to; l += dir) {
        const lineLen = (starts[l + 1] ?? s.doc.length + 1) - starts[l] - 1;
        s.cursor = starts[l] + Math.min(col, lineLen);
        publish();
        await sleep(rnd(45, 85));
      }
    } else if (steps > 18) {
      await sleep(rnd(400, 900));
    }
    s.cursor = target;
    publish();
    await sleep(rnd(300, 700));
  };

  const save = async () => {
    if (!s.dirty) return;
    await sleep(rnd(150, 400));
    s.dirty = false;
    sinceSave = 0;
    publish();
  };

  // Roughly 5–8 characters a second with hesitations, closer to how people actually write code
  const charDelay = (c: string) => {
    let d = 85 + Math.random() * 110;
    if (c === " ") d = 60 + Math.random() * 70;
    else if ("{}();[]<>".includes(c)) d = 150 + Math.random() * 170;
    else if (/[A-Z]/.test(c)) d += 60;
    else if (/[^\w\s]/.test(c)) d += 50;
    if (chance(0.02)) d += 1000 + Math.random() * 2500;
    return d;
  };

  // ---------- typos ----------

  let pending: PendingTypo | null = null;

  const toCodeError = (p: PendingTypo): CodeError => {
    const info = lineInfo(s.doc, p.start);
    return {
      file: file().filename,
      line: info.line,
      col: info.col,
      wrong: p.wrong,
      correct: p.correct,
      lineText: info.lineText,
      prefix: s.doc[p.start - 1] ?? "",
    };
  };

  const showSquiggle = () => {
    if (!pending || s.squiggle) return;
    s.squiggle = { start: pending.start, end: pending.start + pending.wrong.length, message: problemMessage(toCodeError(pending)) };
    publish();
  };

  const canLeaveTypo = (word: string, rest: string) => {
    if (!["clike", "hash", "lua"].includes(syntax())) return false;
    const lineStart = s.doc.lastIndexOf("\n", s.cursor - 1) + 1;
    const prefix = s.doc.slice(lineStart, s.cursor);
    if (IMPORT_LINE.test(prefix)) return false;
    const comment = { clike: "//", hash: "#", lua: "--" }[syntax() as "clike" | "hash" | "lua"];
    if (prefix.includes(comment)) return false;
    for (const q of ['"', "'", "`"]) if ((prefix.split(q).length - 1) % 2 === 1) return false;
    const prev = prefix.slice(-1);
    if (/[.:>@\\]/.test(prev)) return false;
    if (/^\s*(=(?!=)|:(?!:))/.test(rest)) return false;
    return new RegExp(`\\b${word}\\b`).test(s.doc.slice(0, s.cursor));
  };

  /** Types a few wrong characters, notices, backspaces. Returns how many correct characters are on screen. */
  const quickTypo = async (word: string) => {
    const wrong = misspell(word);
    let p = 0;
    while (p < word.length && word[p] === wrong[p]) p++;
    const upto = Math.min(wrong.length, p + rnd(1, 3));
    for (const c of wrong.slice(0, upto)) {
      insert(c);
      await sleep(charDelay(c));
    }
    await sleep(rnd(400, 900));
    for (let k = upto; k > p; k--) {
      backspace();
      await sleep(rnd(90, 160));
    }
    await sleep(rnd(150, 400));
    return p;
  };

  const fixPending = async () => {
    if (!pending) return;
    const p = pending;
    const resumeAt = s.cursor;
    await sleep(rnd(700, 1500));
    await moveCursorTo(p.start + p.wrong.length);
    s.selection = [p.start, p.start + p.wrong.length];
    publish();
    await sleep(rnd(400, 800));
    pending = null;
    s.squiggle = null;
    deleteSelection();
    for (const c of p.correct) {
      insert(c);
      await sleep(rnd(90, 170));
    }
    await sleep(rnd(500, 1000));
    const delta = p.correct.length - p.wrong.length;
    await moveCursorTo(resumeAt > p.start ? resumeAt + delta : resumeAt);
  };

  // ---------- typing ----------

  const typeText = async (text: string) => {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const prevInDoc = s.doc[s.cursor - 1] ?? "";

      if (/[A-Za-z_]/.test(ch) && !/[A-Za-z0-9_$]/.test(prevInDoc === "$" ? "" : prevInDoc)) {
        const word = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)![0];
        if (word.length >= 5 && !isKeyword(word)) {
          if (!pending && chance(0.022) && canLeaveTypo(word, text.slice(i + word.length))) {
            const wrong = misspell(word);
            const start = s.cursor;
            for (const c of wrong) {
              insert(c);
              await sleep(charDelay(c));
            }
            pending = { start, wrong, correct: word, linesSince: 0, fixAfterLines: chance(0.5) ? rnd(1, 4) : Infinity };
            i += word.length;
            continue;
          }
          if (chance(0.035)) {
            i += await quickTypo(word);
            continue;
          }
        }
      }

      if (ch === "\n") {
        const indent = text.slice(i + 1).match(/^[ \t]*/)?.[0] ?? "";
        insert("\n" + indent);
        i += 1 + indent.length;
        sinceSave++;
        if (pending) {
          showSquiggle();
          pending.linesSince++;
          if (pending.linesSince >= pending.fixAfterLines) await fixPending();
        }
        if (sinceSave > rnd(4, 9)) await save();
        await sleep(400 + Math.random() * 800 + (chance(0.12) ? 1500 + Math.random() * 3000 : 0));
        continue;
      }

      insert(ch);
      i++;
      await sleep(charDelay(ch));
    }
    if (pending) {
      await sleep(rnd(500, 1000));
      showSquiggle();
    }
  };

  // ---------- terminal ----------

  const pushLines = (lines: TermLine[]) => {
    s.terminal.lines = [...s.terminal.lines, ...lines].slice(-MAX_TERMINAL_LINES);
  };

  const runCommand = async (cmd: string, output: TermLine[], slow = false) => {
    if (!s.terminal.open) {
      s.terminal.open = true;
      publish();
      await sleep(rnd(500, 900));
    }
    await sleep(rnd(600, 1400));
    for (let k = 1; k <= cmd.length; k++) {
      s.terminal.input = cmd.slice(0, k);
      publish();
      await sleep(cmd[k - 1] === " " ? rnd(50, 110) : rnd(70, 150));
    }
    await sleep(rnd(300, 700));
    pushLines([promptSegs(cfg, s.modified.length > 0, cmd)]);
    s.terminal.input = null;
    publish();
    await sleep(slow ? rnd(1500, 4000) : rnd(250, 900));
    for (const line of output) {
      pushLines([line]);
      publish();
      await sleep(line.length === 0 ? rnd(40, 120) : rnd(slow ? 120 : 40, slow ? 600 : 220));
    }
    s.terminal.input = "";
    publish();
  };

  // ---------- edits on existing code ----------

  const overlapsTypo = (a: number, b: number) =>
    !!pending && a < pending.start + pending.wrong.length && b > pending.start;

  const lineEndOffset = (starts: number[], l: number) => (l + 1 < starts.length ? starts[l + 1] - 1 : s.doc.length);

  /** Selects a run of statements line by line, deletes them, then writes them again. */
  const editBlock = async (): Promise<number> => {
    let { s: first, e: last } = pickBlock(s.doc);
    let starts = lineStarts();
    let from = starts[first] + indentWidthRaw(s.doc.slice(starts[first], lineEndOffset(starts, first)));
    let to = lineEndOffset(starts, last);
    if (overlapsTypo(from, to)) {
      await fixPending();
      ({ s: first, e: last } = pickBlock(s.doc));
      starts = lineStarts();
      from = starts[first] + indentWidthRaw(s.doc.slice(starts[first], lineEndOffset(starts, first)));
      to = lineEndOffset(starts, last);
      if (overlapsTypo(from, to)) return 0;
    }
    const text = s.doc.slice(from, to);
    await moveCursorTo(from);
    await sleep(rnd(500, 1200));
    for (let l = first; l <= last; l++) {
      const end = l === last ? to : lineEndOffset(starts, l);
      s.selection = [from, end];
      s.cursor = end;
      publish();
      await sleep(rnd(110, 200));
    }
    await sleep(rnd(500, 1100));
    deleteSelection();
    await sleep(rnd(1200, 3000));
    await typeText(text);
    return last - first + 1;
  };

  /** Shift+End from a sensible point mid-line, delete, retype the rest of the line. */
  const editTail = async (): Promise<number> => {
    const starts = lineStarts();
    const comment = { clike: "//", hash: "#", lua: "--", markup: "<!--", css: "/*" }[syntax()];
    for (let attempt = 0; attempt < 30; attempt++) {
      const l = rnd(Math.min(HEADER_LINES, starts.length - 3), starts.length - 2);
      const lineText = s.doc.slice(starts[l], lineEndOffset(starts, l));
      const trimmed = lineText.trim();
      if (trimmed.length < 24 || trimmed.startsWith(comment) || IMPORT_LINE.test(lineText)) continue;
      const indent = indentWidthRaw(lineText);
      const m = lineText.slice(indent).match(/(\(|\s=\s|:\s|=>\s|,\s)/);
      if (!m || m.index === undefined) continue;
      const cut = indent + m.index + m[0].length;
      if (lineText.length - cut < 8) continue;
      const from = starts[l] + cut;
      const to = lineEndOffset(starts, l);
      if (overlapsTypo(from, to)) continue;
      const text = s.doc.slice(from, to);
      await moveCursorTo(from);
      await sleep(rnd(500, 1000));
      s.selection = [from, to];
      s.cursor = to;
      publish();
      await sleep(rnd(500, 900));
      deleteSelection();
      await sleep(rnd(900, 2200));
      await typeText(text);
      return 1;
    }
    return 0;
  };

  // ---------- main loop ----------

  let fileIdx = 0;
  let cycle = 0;

  for (;;) {
    const snip = cfg.snippets[fileIdx];
    if (cycle > 0) {
      s.active = fileIdx;
      s.doc = snip.code;
      const n = s.doc.split("\n").length;
      s.cursor = lineStartOffset(s.doc, rnd(Math.min(HEADER_LINES, n - 1), Math.min(HEADER_LINES + 12, n - 1)));
      s.selection = null;
      s.squiggle = null;
      s.dirty = false;
      pending = null;
      publish();
    }

    await sleep(cycle === 0 ? rnd(1500, 3000) : rnd(2500, 5000));
    let insertedLines = 0;
    const edits = rnd(1, 3);
    for (let k = 0; k < edits; k++) {
      if (pending && chance(0.5)) await fixPending();
      insertedLines += chance(0.6) ? await editBlock() : await editTail();
      if (k < edits - 1) {
        await save();
        await sleep(rnd(1500, 4000));
      }
    }
    await save();
    await sleep(rnd(800, 2000));

    const ctx = ctxFor(snip.filename);
    const tc = getToolchain(stackId, ctx);
    if (pending) {
      await runCommand(tc.check, tc.checkFail(toCodeError(pending), ctx), true);
      await sleep(rnd(1800, 3500));
      await fixPending();
      await save();
      await sleep(rnd(500, 1200));
      await runCommand(tc.check, tc.checkPass(ctx), true);
    } else {
      await runCommand(tc.check, tc.checkPass(ctx), true);
    }
    if (tc.test && chance(0.75)) {
      await sleep(rnd(500, 1500));
      await runCommand(tc.test, tc.testPass(ctx), true);
    }

    if (cycle % 2 === 1 || chance(0.25)) {
      await sleep(rnd(800, 2000));
      const changed = [...s.modified];
      if (chance(0.5)) await runCommand("git status -s", changed.map((f) => [[" M ", T.red], [f]] as TermLine));
      await runCommand(`git add ${changed.join(" ")}`, []);
      const { msg, stat } = commitMessage(snip.filename, Math.max(1, insertedLines));
      const hash = Math.random().toString(16).slice(2, 9);
      s.modified = [];
      await runCommand(`git commit -m "${msg}"`, [[[`[${cfg.branch} ${hash}] ${msg}`]], [[stat]]]);
    }

    await sleep(rnd(1500, 4000));
    if (chance(0.1)) {
      s.terminal.lines = [];
      publish();
    }
    fileIdx = (fileIdx + 1) % cfg.snippets.length;
    cycle++;
  }
}
