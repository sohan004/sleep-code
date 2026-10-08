import { ActivityBar } from "../ActivityBar";
import { ChatPanel } from "../ChatPanel";
import { CodePane } from "../CodePane";
import { EditorTabs } from "../EditorTabs";
import { FileExplorer } from "../FileExplorer";
import { MenuBar } from "../MenuBar";
import { MiniMap } from "../MiniMap";
import { StatusBar } from "../StatusBar";
import { TerminalPanel } from "../TerminalPanel";
import type { LayoutProps } from "./types";

export function VSCodeLayout({ config, session, snippet, ide, cursorLine, cursorCol }: LayoutProps) {
  const dirtyRepo = session.modified.length > 0;
  return (
    <>
      <MenuBar title={config.project} ide={ide} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar />
        <FileExplorer project={config.project} files={config.files} activeFile={snippet.filename} modified={session.modified} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <EditorTabs
            tabs={config.snippets.map((s) => s.filename)}
            activeTab={snippet.filename}
            dirty={session.dirty}
            modified={session.modified}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <CodePane
              key={snippet.filename}
              doc={session.doc}
              cursor={session.cursor}
              selection={session.selection}
              squiggle={session.squiggle}
              syntax={snippet.syntax}
            />
            <MiniMap code={session.doc} />
          </div>
          {session.terminal.open && (
            <TerminalPanel
              lines={session.terminal.lines}
              input={session.terminal.input}
              project={config.project}
              branch={config.branch}
              dirtyRepo={dirtyRepo}
              problems={session.squiggle ? 1 : 0}
            />
          )}
        </div>
        <ChatPanel messages={config.chat} contextFile={snippet.filename} ide={ide} />
      </div>
      <StatusBar
        language={snippet.languageLabel}
        indent={config.indent}
        line={cursorLine}
        col={cursorCol}
        branch={config.branch}
        dirtyRepo={dirtyRepo}
        errors={session.squiggle ? 1 : 0}
        warnings={2}
        assistant={ide.id === "cursor" ? "Cursor Tab" : "Copilot"}
      />
    </>
  );
}
