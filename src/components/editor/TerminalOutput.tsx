"use client";

import { useEffect, useRef } from "react";
import { T, type TermLine } from "@/lib/terminal/toolchains";

interface Props {
  lines: TermLine[];
  input: string | null;
  project: string;
  branch: string;
  dirtyRepo: boolean;
  /** Xcode has no shell: show output only, no prompt. */
  showPrompt?: boolean;
  /** Visual Studio's Developer PowerShell renders prompts as `PS C:\src\project>`. */
  shell?: "zsh" | "pwsh";
}

const isPrompt = (l: TermLine) => l[0]?.[0] === "➜  ";

// Toolchain output uses macOS paths; on the Windows shell show them as C:\src\...
const toWindowsPaths = (text: string) =>
  text.replace(/(?:file:\/\/)?\/Users\/dev\/code\/([^\s'"\]]*)/g, (_, p: string) => "C:\\src\\" + p.replace(/\//g, "\\"));

function PwshPrompt({ project, cmd }: { project: string; cmd: string }) {
  return (
    <>
      <span>PS C:\src\{project}&gt;</span>
      <span style={{ color: "var(--term-yellow)" }}> {cmd.split(" ")[0]}</span>
      <span> {cmd.split(" ").slice(1).join(" ")}</span>
    </>
  );
}

export function TerminalOutput({ lines, input, project, branch, dirtyRepo, showPrompt = true, shell = "zsh" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, input]);

  const visible = showPrompt ? lines : lines.filter((l) => !isPrompt(l));

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-2 font-mono text-[13px] leading-[18px]"
      style={{ fontVariantLigatures: "none", color: "var(--term-fg)" }}
    >
      {visible.map((line, i) => (
        <div key={i} className="min-h-[18px] break-all whitespace-pre-wrap">
          {shell === "pwsh" && isPrompt(line) ? (
            <PwshPrompt project={project} cmd={(line.at(-1)?.[0] ?? "").trim()} />
          ) : (
            line.map(([text, color], j) => (
              <span key={j} style={{ color: color ?? "var(--term-fg)" }}>
                {shell === "pwsh" ? toWindowsPaths(text) : text}
              </span>
            ))
          )}
        </div>
      ))}
      {showPrompt && input !== null && shell === "pwsh" && (
        <div className="min-h-[18px] break-all whitespace-pre-wrap">
          <PwshPrompt project={project} cmd={input} />
          <span className="inline-block h-[15px] w-[8px] translate-y-[3px]" style={{ background: "var(--term-fg)" }} />
        </div>
      )}
      {showPrompt && input !== null && shell === "zsh" && (
        <div className="min-h-[18px] break-all whitespace-pre-wrap">
          <span style={{ color: T.green }}>➜  </span>
          <span style={{ color: T.cyan }}>{project}</span>
          <span style={{ color: T.blue }}> git:(</span>
          <span style={{ color: T.red }}>{branch}</span>
          <span style={{ color: T.blue }}>)</span>
          {dirtyRepo && <span style={{ color: T.yellow }}> ✗</span>}
          <span> {input}</span>
          <span className="inline-block h-[15px] w-[8px] translate-y-[3px]" style={{ background: "var(--term-fg)" }} />
        </div>
      )}
    </div>
  );
}
