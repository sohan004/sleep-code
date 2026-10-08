import { IdeLogo } from "@/components/IdeLogo";
import { ChatThread } from "../ChatThread";
import { CodePane } from "../CodePane";
import { ProjectTree } from "../FileExplorer";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icons";
import { TerminalOutput } from "../TerminalOutput";
import { WindowControls } from "../WindowControls";
import type { LayoutProps } from "./types";

const MENUS = ["File", "Edit", "View", "Git", "Project", "Build", "Debug", "Test", "Analyze", "Tools", "Extensions", "Window", "Help"];
const BOTTOM_TABS = ["Terminal", "Output", "Error List", "Package Manager Console"];

const pascal = (s: string) => s.replace(/(^|[-_ .])(\w)/g, (_, __, c: string) => c.toUpperCase());

/** Visual Studio 2022: menu + toolbar, Solution Explorer and Copilot Chat on the right. */
export function VisualStudioLayout({ config, session, snippet, ide, cursorLine, cursorCol }: LayoutProps) {
  const solution = pascal(config.project);
  const running = session.terminal.input === null;
  const errors = session.squiggle ? 1 : 0;
  const stem = snippet.filename.split("/").pop()!.replace(/\.[^.]+$/, "");

  return (
    <>
      {/* Menu bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 pl-2 text-[12px]" style={{ background: "var(--ui-titlebar)", color: "var(--ui-fg)" }}>
        <span className="mr-1">
          <IdeLogo ide={ide} size={18} />
        </span>
        {MENUS.map((m) => (
          <span key={m} className="px-1.5">
            {m}
          </span>
        ))}
        <span className="ml-3 flex h-[22px] w-48 items-center gap-1.5 rounded px-2" style={{ background: "var(--ui-input)", color: "var(--ui-muted)" }}>
          <Icon name="search" size={12} /> Search
        </span>
        <span className="ml-2 rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--ui-widget)" }}>
          {solution}
        </span>
        <div className="flex-1" />
        <WindowControls />
      </div>

      {/* Toolbar */}
      <div
        className="flex h-[30px] shrink-0 items-center gap-3 border-b px-3 text-[12px]"
        style={{ background: "var(--ui-titlebar)", borderColor: "var(--ui-border)", color: "var(--ui-fg)" }}
      >
        <span style={{ color: "var(--ui-muted)" }}>◀ ▶</span>
        <span className="rounded px-1.5" style={{ background: "var(--ui-input)" }}>
          Debug ⌄
        </span>
        <span className="rounded px-1.5" style={{ background: "var(--ui-input)" }}>
          Any CPU ⌄
        </span>
        <span className="flex items-center gap-1.5">
          {running ? <Icon name="stop" size={12} color="#e5534b" /> : <Icon name="play" size={13} color="#5fb865" />}
          {solution} ⌄
        </span>
        <span style={{ color: "#e2873a" }}>🔥</span>
        <span style={{ color: "var(--ui-muted)" }}>⟳ ▷ ⬚</span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5" style={{ color: "var(--ui-muted)" }}>
          <Icon name="sparkle" size={13} /> GitHub Copilot ⌄
        </span>
        <span style={{ color: "var(--ui-muted)" }}>Live Share</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Editor column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-7 shrink-0 items-end gap-0.5 px-1" style={{ background: "var(--ui-sidebar)" }}>
            {config.snippets.map((s) => {
              const active = s.filename === snippet.filename;
              return (
                <div
                  key={s.filename}
                  className="flex h-[26px] items-center gap-1.5 rounded-t border-t-2 px-2.5 text-[12px]"
                  style={{
                    borderColor: active ? "var(--ui-accent)" : "transparent",
                    background: active ? "var(--ui-editor)" : "var(--ui-widget)",
                    color: active ? "var(--ui-fg)" : "var(--ui-muted)",
                  }}
                >
                  <FileIcon name={s.filename} />
                  {s.filename.split("/").pop()}
                  {active && session.dirty ? "*" : ""}
                  <span className="ml-1 text-[11px]">✕</span>
                </div>
              );
            })}
          </div>
          <div className="flex h-7 shrink-0 items-center gap-2 border-b px-2 text-[12px]" style={{ borderColor: "var(--ui-border)", background: "var(--ui-editor)", color: "var(--ui-fg)" }}>
            {[solution, `${solution}.${stem}`, "(Global Scope)"].map((label) => (
              <span key={label} className="flex min-w-0 flex-1 items-center justify-between rounded border px-2 py-0.5" style={{ borderColor: "var(--ui-border)" }}>
                <span className="truncate">{label}</span>
                <span style={{ color: "var(--ui-muted)" }}>⌄</span>
              </span>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <CodePane
              key={snippet.filename}
              doc={session.doc}
              cursor={session.cursor}
              selection={session.selection}
              squiggle={session.squiggle}
              syntax={snippet.syntax}
            />
          </div>
          <div className="flex h-6 shrink-0 items-center gap-4 border-t px-3 text-[11px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
            <span>100 %</span>
            <span style={{ color: errors ? "var(--ui-error)" : "#5fb865" }}>{errors ? "⊗ 1" : "✓ No issues found"}</span>
            <div className="flex-1" />
            <span>
              Ln: {cursorLine} Ch: {cursorCol}
            </span>
            <span>SPC</span>
            <span>CRLF</span>
          </div>

          {session.terminal.open && (
            <div className="flex h-[230px] shrink-0 flex-col border-t" style={{ borderColor: "var(--ui-border)", background: "var(--ui-panel)" }}>
              <div className="flex h-7 shrink-0 items-center justify-between px-2 text-[12px]" style={{ background: "var(--ui-sidebar)" }}>
                <span className="font-semibold">Terminal</span>
                <span style={{ color: "var(--ui-muted)" }}>⌄ ⊟ ✕</span>
              </div>
              <div className="flex h-6 shrink-0 items-center gap-2 px-2 text-[11px]" style={{ color: "var(--ui-muted)" }}>
                <span className="rounded px-1.5" style={{ background: "var(--ui-input)" }}>
                  Developer PowerShell ⌄
                </span>
                <span>+ ⧉ ⚙</span>
              </div>
              <TerminalOutput
                lines={session.terminal.lines}
                input={session.terminal.input}
                project={config.project}
                branch={config.branch}
                dirtyRepo={session.modified.length > 0}
                shell="pwsh"
              />
              <div className="flex h-6 shrink-0 items-end gap-0.5 px-1 text-[11px]" style={{ background: "var(--ui-sidebar)" }}>
                {BOTTOM_TABS.map((t, i) => (
                  <span
                    key={t}
                    className="px-2 py-0.5"
                    style={{ background: i === 0 ? "var(--ui-panel)" : undefined, color: i === 0 ? "var(--ui-accent)" : "var(--ui-muted)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right dock: Solution Explorer over Copilot Chat */}
        <div className="flex w-[320px] shrink-0 flex-col border-l" style={{ borderColor: "var(--ui-border)", background: "var(--ui-sidebar)" }}>
          <div className="flex h-[48%] min-h-0 flex-col border-b" style={{ borderColor: "var(--ui-border)" }}>
            <div className="flex h-7 shrink-0 items-center justify-between px-2 text-[12px] font-semibold">
              Solution Explorer
              <span className="font-normal" style={{ color: "var(--ui-muted)" }}>⌄ ⊟ ✕</span>
            </div>
            <div className="mx-2 mb-1 flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[11px]" style={{ background: "var(--ui-input)", color: "var(--ui-muted)" }}>
              Search Solution Explorer (Ctrl+;)
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto text-[12px]">
              <div className="flex h-[22px] items-center gap-1.5 pl-2">
                <span style={{ color: "#9b4f96" }}>◈</span> Solution &apos;{solution}&apos; (1 of 1 project)
              </div>
              <div className="flex h-[22px] items-center gap-1.5 pl-5 font-semibold">
                <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>▾</span>
                <span style={{ color: "#9b4f96" }}>▣</span> {solution}
              </div>
              <div className="pl-5">
                <ProjectTree files={config.files} activeFile={snippet.filename} modified={[]} variant="jetbrains" rowHeight={22} />
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-7 shrink-0 items-center justify-between px-2 text-[12px] font-semibold">
              {ide.assistant.title}
              <span className="font-normal" style={{ color: "var(--ui-muted)" }}>⌄ ⊟ ✕</span>
            </div>
            <ChatThread
              messages={config.chat}
              assistantName={ide.assistant.name}
              assistantColor="#8957e5"
              emptyHint="Ask Copilot about your solution."
              variant="plain"
            />
            <div className="p-2">
              <div className="rounded border px-2 py-1.5 text-[11px]" style={{ borderColor: "var(--ui-border)", background: "var(--ui-input)", color: "var(--ui-muted)" }}>
                Ask Copilot · #{snippet.filename.split("/").pop()} · {ide.assistant.model} ⌄
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 px-3 text-[12px]" style={{ background: "var(--ui-statusbar)", color: "var(--ui-status-fg)" }}>
        <span>{running ? "Build started…" : "Ready"}</span>
        <div className="flex-1" />
        <span>↑ 0</span>
        <span>✎ {session.modified.length}</span>
        <span>⎇ {config.branch}</span>
        <span>{solution}</span>
        <span>🔔</span>
      </div>
    </>
  );
}
