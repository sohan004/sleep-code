"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_STACK } from "@/lib/catalog";
import { STACK_LOADERS } from "@/lib/stacks/registry";
import type { StackConfig } from "@/lib/stacks/types";
import { ActivityBar } from "./ActivityBar";
import { ChatPanel } from "./ChatPanel";
import { CodePane } from "./CodePane";
import { EditorTabs } from "./EditorTabs";
import { FileExplorer } from "./FileExplorer";
import { MenuBar } from "./MenuBar";
import { MiniMap } from "./MiniMap";
import { StatusBar } from "./StatusBar";
import { TerminalPanel } from "./TerminalPanel";
import { useCodingSession } from "./useCodingSession";

const LEGACY_TECH: Record<string, string> = { python: "fastapi", go: "gin", rust: "axum" };

export function EditorShell() {
  const params = useSearchParams();
  const requested = params.get("stack") ?? LEGACY_TECH[params.get("tech") ?? ""] ?? params.get("tech") ?? "";
  const stackId = Object.hasOwn(STACK_LOADERS, requested) ? requested : DEFAULT_STACK;
  return <StackLoader key={stackId} stackId={stackId} />;
}

function StackLoader({ stackId }: { stackId: string }) {
  const [config, setConfig] = useState<StackConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    STACK_LOADERS[stackId]().then((m) => {
      if (!cancelled) setConfig(m.default);
    });
    return () => {
      cancelled = true;
    };
  }, [stackId]);

  if (!config) return <div className="h-screen w-screen bg-[#1f1f1f]" />;
  return <Editor config={config} stackId={stackId} />;
}

function Editor({ config, stackId }: { config: StackConfig; stackId: string }) {
  const session = useCodingSession(config, stackId);
  const snippet = config.snippets[session.active];
  const [pointerHidden, setPointerHidden] = useState(false);

  const before = session.doc.slice(0, session.cursor);
  const cursorLine = before.split("\n").length;
  const cursorCol = session.cursor - (before.lastIndexOf("\n") + 1) + 1;

  useEffect(() => {
    document.title = `${session.dirty ? "● " : ""}${snippet.filename.split("/").pop()} - ${config.project}`;
  }, [snippet.filename, config.project, session.dirty]);

  // Like macOS, hide the pointer while "typing" so it doesn't sit frozen in the middle of the screen
  useEffect(() => {
    let timer = setTimeout(() => setPointerHidden(true), 2500);
    const onMove = () => {
      setPointerHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setPointerHidden(true), 2500);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  const enterFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div
      onClick={enterFullscreen}
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[#1f1f1f] text-[13px] text-[#cccccc] select-none ${
        pointerHidden ? "cursor-none" : ""
      }`}
    >
      <MenuBar title={config.project} />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        <FileExplorer
          project={config.project}
          files={config.files}
          activeFile={snippet.filename}
          modified={session.modified}
        />
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
              dirtyRepo={session.modified.length > 0}
              problems={session.squiggle ? 1 : 0}
            />
          )}
        </div>
        <ChatPanel messages={config.chat} contextFile={snippet.filename} />
      </div>
      <StatusBar
        language={snippet.languageLabel}
        indent={config.indent}
        line={cursorLine}
        col={cursorCol}
        branch={config.branch}
        dirtyRepo={session.modified.length > 0}
        errors={session.squiggle ? 1 : 0}
        warnings={2}
      />
    </div>
  );
}
