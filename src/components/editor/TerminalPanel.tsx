"use client";

import { useEffect, useRef } from "react";
import { T, type TermLine } from "@/lib/terminal/toolchains";

interface Props {
  lines: TermLine[];
  input: string | null;
  project: string;
  branch: string;
  dirtyRepo: boolean;
  problems: number;
}

const TABS = ["Problems", "Output", "Debug Console", "Terminal", "Ports"];

function Line({ line }: { line: TermLine }) {
  return (
    <div className="min-h-[18px] break-all whitespace-pre-wrap">
      {line.map(([text, color], i) => (
        <span key={i} style={{ color: color ?? "#cccccc" }}>
          {text}
        </span>
      ))}
    </div>
  );
}

export function TerminalPanel({ lines, input, project, branch, dirtyRepo, problems }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, input]);

  return (
    <div className="flex h-[260px] shrink-0 flex-col border-t border-[#2b2b2b] bg-[#181818]">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] tracking-wide uppercase">
        <div className="flex h-full items-center gap-5">
          {TABS.map((t) => (
            <span
              key={t}
              className={`flex h-full items-center gap-1.5 border-b ${
                t === "Terminal" ? "border-[#0078d4] text-[#e7e7e7]" : "border-transparent text-[#9d9d9d]"
              }`}
            >
              {t}
              {t === "Problems" && problems > 0 && (
                <span className="rounded-full bg-[#616161] px-1.5 text-[10px] leading-4 text-white">{problems}</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[13px] text-[#9d9d9d] normal-case">
          <span className="text-[12px]">⌥ zsh</span>
          <span>+</span>
          <span>⌄</span>
          <span>🗑</span>
          <span>⋯</span>
          <span>⌃</span>
          <span>✕</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pb-2 font-mono text-[13px] leading-[18px]"
        style={{ fontVariantLigatures: "none" }}
      >
        {lines.map((l, i) => (
          <Line key={i} line={l} />
        ))}
        {input !== null && (
          <div className="min-h-[18px] break-all whitespace-pre-wrap">
            <span style={{ color: T.green }}>➜  </span>
            <span style={{ color: T.cyan }}>{project}</span>
            <span style={{ color: T.blue }}> git:(</span>
            <span style={{ color: T.red }}>{branch}</span>
            <span style={{ color: T.blue }}>)</span>
            {dirtyRepo && <span style={{ color: T.yellow }}> ✗</span>}
            <span className="text-[#cccccc]"> {input}</span>
            <span className="inline-block h-[15px] w-[8px] translate-y-[3px] bg-[#cccccc]" />
          </div>
        )}
      </div>
    </div>
  );
}
