"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import { tokenizeLine } from "@/lib/highlight";
import type { Syntax } from "@/lib/stacks/types";
import type { Squiggle } from "./useCodingSession";

interface Props {
  doc: string;
  cursor: number;
  selection: [number, number] | null;
  squiggle: Squiggle | null;
  syntax: Syntax;
}

const LINE_HEIGHT = 20;
type Range = [number, number] | null;

const Caret = () => (
  <span className="relative inline-block h-4.5 w-0 align-middle">
    <span className="absolute top-0 left-0 h-full w-0.5 animate-blink bg-[#aeafad]" />
  </span>
);

const CodeLine = memo(function CodeLine({
  text,
  syntax,
  caret,
  sel,
  err,
}: {
  text: string;
  syntax: Syntax;
  caret: number;
  sel: Range;
  err: Range;
}) {
  const tokens = tokenizeLine(text, syntax);
  const cuts = new Set<number>([caret, ...(sel ?? []), ...(err ?? [])].filter((c) => c > 0));
  const out: ReactNode[] = [];
  let col = 0;
  let key = 0;
  const inRange = (r: Range, c: number) => !!r && c >= r[0] && c < r[1];

  for (const [tokText, color] of tokens) {
    let rest = tokText;
    while (rest.length) {
      let len = rest.length;
      for (const c of cuts) if (c > col && c < col + len) len = c - col;
      const piece = rest.slice(0, len);
      if (caret === col) out.push(<Caret key={key++} />);
      const isErr = inRange(err, col);
      out.push(
        <span
          key={key++}
          style={{
            color,
            backgroundColor: inRange(sel, col) ? "#264f78" : undefined,
            textDecoration: isErr ? "underline wavy #f14c4c" : undefined,
            textDecorationSkipInk: isErr ? "none" : undefined,
            textUnderlineOffset: isErr ? 4 : undefined,
          }}
        >
          {piece}
        </span>
      );
      col += len;
      rest = rest.slice(len);
    }
  }
  if (caret === col) out.push(<Caret key={key++} />);
  return <>{out}</>;
});

function clip(range: [number, number] | null, start: number, end: number): Range {
  if (!range) return null;
  const a = Math.max(range[0], start);
  const b = Math.min(range[1], end);
  return a < b ? [a - start, b - start] : null;
}

export function CodePane({ doc, cursor, selection, squiggle, syntax }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = doc.split("\n");
  const starts: number[] = [];
  let acc = 0;
  for (const l of lines) {
    starts.push(acc);
    acc += l.length + 1;
  }
  let cursorLine = 0;
  while (cursorLine + 1 < starts.length && starts[cursorLine + 1] <= cursor) cursorLine++;
  const totalRows = Math.max(lines.length + 12, 40);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = cursorLine * LINE_HEIGHT;
    const margin = LINE_HEIGHT * 5;
    if (top < el.scrollTop + margin || top > el.scrollTop + el.clientHeight - margin) {
      const target = Math.max(0, top - el.clientHeight / 3);
      el.scrollTo({ top: target, behavior: Math.abs(target - el.scrollTop) > el.clientHeight ? "auto" : "smooth" });
    }
  }, [cursorLine]);

  const squiggleRange: [number, number] | null = squiggle ? [squiggle.start, squiggle.end] : null;

  return (
    <div
      ref={scrollRef}
      className="relative min-w-0 flex-1 overflow-auto bg-[#1f1f1f] font-mono text-[14px]"
      style={{ lineHeight: `${LINE_HEIGHT}px`, fontVariantLigatures: "none", tabSize: 4 }}
    >
      <div className="min-w-max py-1">
        {Array.from({ length: totalRows }, (_, i) => {
          const isCurrent = i === cursorLine;
          const text = lines[i];
          const start = starts[i] ?? 0;
          const end = start + (text?.length ?? 0);
          return (
            <div key={i} className="flex" style={{ height: LINE_HEIGHT }}>
              <div
                className={`sticky left-0 z-10 w-16 shrink-0 bg-[#1f1f1f] pr-6 text-right select-none ${
                  isCurrent ? "text-[#cccccc]" : "text-[#6e7681]"
                }`}
              >
                {i + 1}
              </div>
              <div className={`flex-1 pr-8 whitespace-pre ${isCurrent ? "outline -outline-offset-1 outline-[#282828]" : ""}`}>
                {text !== undefined && (
                  <CodeLine
                    text={text}
                    syntax={syntax}
                    caret={isCurrent ? cursor - start : -1}
                    sel={clip(selection, start, end)}
                    err={clip(squiggleRange, start, end)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
