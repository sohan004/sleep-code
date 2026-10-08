import { IdeLogo } from "@/components/IdeLogo";
import { ChatThread } from "../ChatThread";
import { CodePane } from "../CodePane";
import { ProjectTree } from "../FileExplorer";
import { FileIcon } from "../FileIcon";
import { Icon, type IconName } from "../Icons";
import { TerminalOutput } from "../TerminalOutput";
import { WindowControls } from "../WindowControls";
import type { LayoutProps } from "./types";

const initials = (s: string) =>
  s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function StripeButton({ icon, active, title }: { icon: IconName; active?: boolean; title: string }) {
  return (
    <span
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md"
      style={{ background: active ? "var(--ui-list-active)" : undefined, color: active ? "var(--ui-fg)" : "var(--ui-muted)" }}
    >
      <Icon name={icon} size={18} />
    </span>
  );
}

/** JetBrains "New UI": IntelliJ IDEA, Android Studio, PyCharm, WebStorm, Rider, etc. */
export function JetBrainsLayout({ config, session, snippet, ide, cursorLine, cursorCol }: LayoutProps) {
  const android = ide.id === "android-studio";
  const running = session.terminal.input === null;
  const runConfig = android ? "app" : snippet.filename.split("/").pop()!.replace(/\.[^.]+$/, "");

  return (
    <>
      {/* Main toolbar */}
      <div
        className="flex h-10 shrink-0 items-center gap-3 border-b pl-2 text-[13px]"
        style={{ background: "var(--ui-titlebar)", borderColor: "var(--ui-border)", color: "var(--ui-fg)" }}
      >
        <span title={ide.label}>
          <IdeLogo ide={ide} size={22} />
        </span>
        <span style={{ color: "var(--ui-muted)" }}>≡</span>
        <span className="flex items-center gap-2 rounded-md px-1.5 py-1 font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white" style={{ background: "#3d8c6a" }}>
            {initials(config.project)}
          </span>
          {config.project} <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>⌄</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1">
          <Icon name="git" size={14} />
          {config.branch} <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>⌄</span>
        </span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1">
          {android ? <Icon name="box" size={14} color="#3ddc84" /> : <FileIcon name={snippet.filename} />}
          {runConfig}
          {android && <span style={{ color: "var(--ui-muted)" }}>· Pixel 8 API 35</span>}
          <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>⌄</span>
        </span>
        <span className="flex items-center gap-3" style={{ color: "var(--ui-muted)" }}>
          {running ? <Icon name="stop" size={14} color="#e5534b" /> : <Icon name="play" size={15} color="#5fb865" />}
          <Icon name="bug" size={16} color="#5fb865" />
          <Icon name="more" size={16} />
        </span>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--ui-border)" }} />
        <span className="flex items-center gap-3" style={{ color: "var(--ui-muted)" }}>
          <Icon name="sparkle" size={16} />
          <Icon name="search" size={16} />
          <Icon name="gear" size={16} />
        </span>
        <WindowControls />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left tool window stripe */}
        <div
          className="flex w-10 shrink-0 flex-col items-center gap-1 border-r py-2"
          style={{ background: "var(--ui-activity)", borderColor: "var(--ui-border)" }}
        >
          <StripeButton icon="folder" active title="Project" />
          <StripeButton icon="commit" title="Commit" />
          <StripeButton icon="structure" title="Structure" />
          {android && <StripeButton icon="box" title="Resource Manager" />}
          <div className="flex-1" />
          {android && <StripeButton icon="logcat" title="Logcat" />}
          <StripeButton icon="services" title="Services" />
          <StripeButton icon="terminal" active title="Terminal" />
          <StripeButton icon="problems" title="Problems" />
          <StripeButton icon="git" title="Git" />
        </div>

        {/* Project tool window */}
        <div
          className="flex w-64 shrink-0 flex-col overflow-hidden border-r text-[13px]"
          style={{ background: "var(--ui-sidebar)", borderColor: "var(--ui-border)" }}
        >
          <div className="flex h-9 shrink-0 items-center justify-between px-3 font-semibold">
            <span>
              {android ? "Android" : "Project"} <span className="text-[10px] font-normal" style={{ color: "var(--ui-muted)" }}>⌄</span>
            </span>
            <span className="flex gap-2 font-normal" style={{ color: "var(--ui-muted)" }}>
              ⊕ ⇅ ⋮ —
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            <div className="flex h-6 items-center gap-1 pl-2 whitespace-nowrap">
              <span className="w-4 shrink-0 text-center text-[10px]" style={{ color: "var(--ui-muted)" }}>▾</span>
              <span className="shrink-0" style={{ color: "#9aa7b0" }}>▰</span>
              <span className="shrink-0 font-semibold">{config.project}</span>
              <span className="ml-1 min-w-0 truncate text-[12px]" style={{ color: "var(--ui-muted)" }}>
                ~/code/{config.project}
              </span>
            </div>
            <div className="pl-3">
              <ProjectTree files={config.files} activeFile={snippet.filename} modified={session.modified} variant="jetbrains" rowHeight={24} />
            </div>
          </div>
        </div>

        {/* Editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[38px] shrink-0 items-stretch border-b" style={{ borderColor: "var(--ui-border)", background: "var(--ui-editor)" }}>
            {config.snippets.map((s) => {
              const active = s.filename === snippet.filename;
              const modified = session.modified.includes(s.filename);
              return (
                <div
                  key={s.filename}
                  className="flex items-center gap-1.5 border-b-2 px-3 text-[13px]"
                  style={{
                    borderColor: active ? "var(--ui-accent)" : "transparent",
                    color: modified ? "var(--ui-modified)" : active ? "var(--ui-fg)" : "var(--ui-muted)",
                  }}
                >
                  <FileIcon name={s.filename} />
                  {s.filename.split("/").pop()}
                  <span className="ml-1 text-[11px]" style={{ color: "var(--ui-muted)" }}>×</span>
                </div>
              );
            })}
          </div>
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <CodePane
              key={snippet.filename}
              doc={session.doc}
              cursor={session.cursor}
              selection={session.selection}
              squiggle={session.squiggle}
              syntax={snippet.syntax}
              highlight="fill"
            />
            <div className="pointer-events-none absolute top-2 right-5 flex items-center gap-2 text-[12px]">
              {session.squiggle ? (
                <span style={{ color: "var(--ui-error)" }}>⊗ 1</span>
              ) : (
                <span style={{ color: "#5fb865" }}>✓</span>
              )}
              <span style={{ color: "#e2b340" }}>⚠ 2</span>
              <span style={{ color: "var(--ui-muted)" }}>⌃ ⌄</span>
            </div>
          </div>

          {session.terminal.open && (
            <div className="flex h-[250px] shrink-0 flex-col border-t" style={{ borderColor: "var(--ui-border)", background: "var(--ui-editor)" }}>
              <div className="flex h-9 shrink-0 items-center gap-3 px-3 text-[13px]">
                <span className="font-semibold">Terminal</span>
                <span className="flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ background: "var(--ui-list-active)" }}>
                  Local <span style={{ color: "var(--ui-muted)" }}>×</span>
                </span>
                <span style={{ color: "var(--ui-muted)" }}>+ ⌄</span>
                <div className="flex-1" />
                <span style={{ color: "var(--ui-muted)" }}>⋮ —</span>
              </div>
              <TerminalOutput
                lines={session.terminal.lines}
                input={session.terminal.input}
                project={config.project}
                branch={config.branch}
                dirtyRepo={session.modified.length > 0}
              />
            </div>
          )}
        </div>

        {/* AI Assistant / Gemini tool window */}
        <aside
          className="flex w-[340px] shrink-0 flex-col border-l"
          style={{ background: "var(--ui-sidebar)", borderColor: "var(--ui-border)" }}
        >
          <div className="flex h-9 shrink-0 items-center justify-between px-3 text-[13px] font-semibold">
            <span>{ide.assistant.title}</span>
            <span className="font-normal" style={{ color: "var(--ui-muted)" }}>
              + ⟲ ⋮ —
            </span>
          </div>
          <ChatThread
            messages={config.chat}
            assistantName={ide.assistant.name}
            assistantColor={android ? "#4285f4" : "#7b61ff"}
            emptyHint={android ? "Ask Gemini about your Android code." : "Ask AI Assistant anything about your code."}
            variant="plain"
          />
          <div className="border-t p-3" style={{ borderColor: "var(--ui-border)" }}>
            <div className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ui-border)", background: "var(--ui-input)", color: "var(--ui-muted)" }}>
              <div className="mb-2 text-[13px]">Type your prompt here</div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">@ {snippet.filename.split("/").pop()}</span>
                <span className="shrink-0">{ide.assistant.model} ▾</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right stripe */}
        <div
          className="flex w-10 shrink-0 flex-col items-center gap-1 border-l py-2"
          style={{ background: "var(--ui-activity)", borderColor: "var(--ui-border)" }}
        >
          <StripeButton icon="sparkle" active title={ide.assistant.title} />
          <StripeButton icon="bell" title="Notifications" />
          <StripeButton icon="database" title={android ? "Device Manager" : "Database"} />
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex h-6 shrink-0 items-center gap-1 border-t px-3 text-[12px]"
        style={{ background: "var(--ui-statusbar)", color: "var(--ui-status-fg)", borderColor: "var(--ui-border)" }}
      >
        {[config.project, ...snippet.filename.split("/")].map((p, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            {i === arr.length - 1 && <FileIcon name={p} />}
            {p}
            {i < arr.length - 1 && <span className="mx-0.5">›</span>}
          </span>
        ))}
        <div className="flex-1" />
        <span className="flex items-center gap-4">
          {running && (
            <span className="flex items-center gap-2">
              Running…
              <span className="h-1 w-16 overflow-hidden rounded" style={{ background: "var(--ui-widget)" }}>
                <span className="block h-full w-1/2 animate-pulse" style={{ background: "var(--ui-accent)" }} />
              </span>
            </span>
          )}
          <span>
            {cursorLine}:{cursorCol}
          </span>
          <span>LF</span>
          <span>UTF-8</span>
          <span>{config.indent.startsWith("Tab") ? "Tab" : `${config.indent.replace("Spaces: ", "")} spaces`}</span>
          <span>🔓</span>
        </span>
      </div>
    </>
  );
}
