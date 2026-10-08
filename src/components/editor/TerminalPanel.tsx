import type { TermLine } from "@/lib/terminal/toolchains";
import { TerminalOutput } from "./TerminalOutput";

interface Props {
  lines: TermLine[];
  input: string | null;
  project: string;
  branch: string;
  dirtyRepo: boolean;
  problems: number;
}

const TABS = ["Problems", "Output", "Debug Console", "Terminal", "Ports"];

/** VS Code bottom panel. */
export function TerminalPanel({ problems, ...output }: Props) {
  return (
    <div className="flex h-[260px] shrink-0 flex-col border-t" style={{ borderColor: "var(--ui-border)", background: "var(--ui-panel)" }}>
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] tracking-wide uppercase">
        <div className="flex h-full items-center gap-5">
          {TABS.map((t) => (
            <span
              key={t}
              className="flex h-full items-center gap-1.5 border-b"
              style={{
                borderColor: t === "Terminal" ? "var(--ui-accent)" : "transparent",
                color: t === "Terminal" ? "var(--ui-fg)" : "var(--ui-muted)",
              }}
            >
              {t}
              {t === "Problems" && problems > 0 && (
                <span className="rounded-full px-1.5 text-[10px] leading-4" style={{ background: "var(--ui-widget)", color: "var(--ui-fg)" }}>
                  {problems}
                </span>
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[13px] normal-case" style={{ color: "var(--ui-muted)" }}>
          <span className="text-[12px]">⌥ zsh</span>
          <span>+</span>
          <span>⌄</span>
          <span>🗑</span>
          <span>⋯</span>
          <span>⌃</span>
          <span>✕</span>
        </div>
      </div>
      <TerminalOutput {...output} />
    </div>
  );
}
