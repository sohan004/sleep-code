import { appName } from "@/lib/projectNames";
import { ChatThread } from "../ChatThread";
import { CodePane } from "../CodePane";
import { ProjectTree } from "../FileExplorer";
import { FileIcon } from "../FileIcon";
import { Icon } from "../Icons";
import { TerminalOutput } from "../TerminalOutput";
import { WindowControls } from "../WindowControls";
import type { LayoutProps } from "./types";

const NAVIGATORS = ["folder", "git", "structure", "search", "warning", "problems", "bug", "logcat", "sparkle"] as const;


/** Xcode 16-style window: toolbar, navigator, jump bar, debug console, assistant. */
export function XcodeLayout({ config, session, snippet, ide, cursorLine, cursorCol }: LayoutProps) {
  const scheme = appName(config);
  const runningKind = session.terminal.running;
  const running = runningKind === "build" || runningKind === "test";
  const last = session.lastBuild;
  const failed = !running && last?.ok === false;
  const time = last ? new Date(last.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const status = running
    ? `${runningKind === "test" ? "Testing" : "Building"} ${scheme}…`
    : !last
      ? "Ready"
      : `${last.kind === "test" ? "Test" : "Build"} ${last.ok ? "Succeeded" : "Failed"}`;

  return (
    <>
      {/* Toolbar */}
      <div
        className="flex h-[52px] shrink-0 items-center gap-3 border-b pr-2 text-[13px]"
        style={{ background: "var(--ui-titlebar)", borderColor: "var(--ui-border)", color: "var(--ui-fg)" }}
      >
        <WindowControls style="mac" />
        <span style={{ color: "var(--ui-muted)" }}>
          <Icon name="sidebar" size={17} />
        </span>
        <span className="ml-6 flex items-center gap-4" style={{ color: "var(--ui-muted)" }}>
          <Icon name="play" size={17} color="var(--ui-fg)" />
          <Icon name="stop" size={14} color={running ? "var(--ui-fg)" : "var(--ui-muted)"} />
        </span>
        <span className="ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]" style={{ background: "var(--ui-widget)" }}>
          <span className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white" style={{ background: "#1c7cf4" }}>
            A
          </span>
          {scheme}
          <span style={{ color: "var(--ui-muted)" }}>›</span>
          📱 iPhone 16 Pro
        </span>
        <div className="flex flex-1 justify-center">
          <div
            className="flex h-7 w-full max-w-[520px] items-center justify-between rounded-md px-3 text-[12px]"
            style={{ background: "var(--ui-input)", color: "var(--ui-muted)" }}
          >
            <span style={{ color: "var(--ui-fg)" }}>{scheme}</span>
            <span className="flex items-center gap-2">
              {running && <span className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--ui-muted)", borderTopColor: "transparent" }} />}
              <span style={{ color: failed ? "var(--ui-error)" : "var(--ui-fg)" }}>{status}</span>
              {time && <span>| Today at {time}</span>}
            </span>
            <span className="flex items-center gap-2">
              {failed && <span style={{ color: "var(--ui-error)" }}>⊗ 1</span>}
              <span style={{ color: "#e2b340" }}>⚠ 2</span>
            </span>
          </div>
        </div>
        <span className="flex items-center gap-4" style={{ color: "var(--ui-muted)" }}>
          <Icon name="plus" size={17} />
          <Icon name="inspector" size={17} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Navigator */}
        <div className="flex w-64 shrink-0 flex-col border-r text-[13px]" style={{ background: "var(--ui-sidebar)", borderColor: "var(--ui-border)" }}>
          <div className="flex h-8 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
            {NAVIGATORS.map((n, i) => (
              <Icon key={n} name={n} size={14} color={i === 0 ? "var(--ui-accent)" : undefined} />
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            <div className="flex h-6 items-center gap-1.5 pl-1 font-semibold">
              <span className="w-3 text-[10px]" style={{ color: "var(--ui-muted)" }}>▾</span>
              <span className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white" style={{ background: "#1c7cf4" }}>
                A
              </span>
              {scheme}
            </div>
            <ProjectTree files={config.files} activeFile={snippet.filename} modified={[]} variant="xcode" rowHeight={24} />
          </div>
          <div className="flex h-8 shrink-0 items-center gap-2 border-t px-3 text-[12px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
            <Icon name="plus" size={13} />
            <span className="flex flex-1 items-center gap-1.5 rounded px-2 py-0.5" style={{ background: "var(--ui-input)" }}>
              <Icon name="filter" size={11} /> Filter
            </span>
          </div>
        </div>

        {/* Editor + debug area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-7 shrink-0 items-stretch border-b text-[12px]" style={{ borderColor: "var(--ui-border)", background: "var(--ui-sidebar)" }}>
            {config.snippets.map((s) => {
              const active = s.filename === snippet.filename;
              return (
                <div
                  key={s.filename}
                  className="flex flex-1 items-center justify-center gap-1.5 border-r"
                  style={{
                    borderColor: "var(--ui-border)",
                    background: active ? "var(--ui-editor)" : undefined,
                    color: active ? "var(--ui-fg)" : "var(--ui-muted)",
                  }}
                >
                  <FileIcon name={s.filename} />
                  {s.filename.split("/").pop()}
                </div>
              );
            })}
          </div>
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b px-2 text-[12px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
            <Icon name="chevronLeft" size={13} />
            <Icon name="chevronRight" size={13} />
            <span className="ml-1" style={{ color: "var(--ui-fg)" }}>
              {scheme}
            </span>
            {snippet.filename.split("/").map((p, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                <span>›</span>
                {i === arr.length - 1 && <FileIcon name={p} />}
                <span style={{ color: i === arr.length - 1 ? "var(--ui-fg)" : undefined }}>{p}</span>
              </span>
            ))}
            <span>›</span>
            <span>No Selection</span>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <CodePane
              key={snippet.filename}
              doc={session.doc}
              cursor={session.cursor}
              selection={session.selection}
              squiggle={session.squiggle}
              syntax={snippet.syntax}
              highlight="fill"
            />
          </div>
          {session.terminal.open && (
            <div className="flex h-[230px] shrink-0 flex-col border-t" style={{ borderColor: "var(--ui-border)", background: "var(--ui-panel)" }}>
              <div className="flex h-7 shrink-0 items-center gap-3 border-b px-3 text-[12px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
                <Icon name="sidebar" size={13} />
                <span>{running ? (session.terminal.running === "test" ? "Testing" : "Building") : "Finished running"} {scheme} on iPhone 16 Pro</span>
                <div className="flex-1" />
                <span>
                  Line: {cursorLine} Col: {cursorCol}
                </span>
              </div>
              <div className="flex min-h-0 flex-1">
                <div className="w-56 shrink-0 border-r px-3 py-2 text-[12px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
                  <div className="mb-2">Auto ⌄</div>
                  <div className="text-center opacity-70">No Variables</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <TerminalOutput
                    lines={session.buildLog}
                    input={session.terminal.input}
                    project={config.project}
                    branch={config.branch}
                    dirtyRepo={false}
                    showPrompt={false}
                  />
                  <div className="flex h-7 shrink-0 items-center gap-2 border-t px-3 text-[12px]" style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}>
                    All Output ⌄
                    <div className="flex-1" />
                    <span className="flex items-center gap-1.5 rounded px-2 py-0.5" style={{ background: "var(--ui-input)" }}>
                      <Icon name="filter" size={11} /> Filter
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Coding assistant */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l" style={{ background: "var(--ui-sidebar)", borderColor: "var(--ui-border)" }}>
          <div className="flex h-8 shrink-0 items-center justify-between border-b px-3 text-[12px] font-semibold" style={{ borderColor: "var(--ui-border)" }}>
            <span>{ide.assistant.title}</span>
            <span className="font-normal" style={{ color: "var(--ui-muted)" }}>
              {ide.assistant.model} ⌄
            </span>
          </div>
          <ChatThread
            messages={config.chat}
            assistantName={ide.assistant.name}
            assistantColor="#d97757"
            emptyHint="Ask about your project, or describe a change."
            variant="plain"
          />
          <div className="border-t p-3" style={{ borderColor: "var(--ui-border)" }}>
            <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--ui-input)", color: "var(--ui-muted)" }}>
              Ask about {snippet.filename.split("/").pop()}…
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
