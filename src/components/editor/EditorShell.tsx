"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { DEFAULT_STACK } from "@/lib/catalog";
import { IDE_BY_ID, recommendedIde, type Ide, type IdeFamily } from "@/lib/ides";
import { parseIde, parseSpeed, parseTheme, sanitizeProject } from "@/lib/sessionPrefs";
import { STACK_LOADERS } from "@/lib/stacks/registry";
import type { StackConfig } from "@/lib/stacks/types";
import { THEME_BY_ID, themeVars } from "@/lib/themes";
import { JetBrainsLayout } from "./layouts/JetBrainsLayout";
import type { LayoutProps } from "./layouts/types";
import { VisualStudioLayout } from "./layouts/VisualStudioLayout";
import { VSCodeLayout } from "./layouts/VSCodeLayout";
import { XcodeLayout } from "./layouts/XcodeLayout";
import { useCodingSession } from "./useCodingSession";

const LEGACY_TECH: Record<string, string> = { python: "fastapi", go: "gin", rust: "axum" };

const LAYOUTS: Record<IdeFamily, (p: LayoutProps) => React.ReactNode> = {
  vscode: VSCodeLayout,
  jetbrains: JetBrainsLayout,
  xcode: XcodeLayout,
  vs: VisualStudioLayout,
};

export function EditorShell() {
  const params = useSearchParams();
  const requested = params.get("stack") ?? LEGACY_TECH[params.get("tech") ?? ""] ?? params.get("tech") ?? "";
  const stackId = Object.hasOwn(STACK_LOADERS, requested) ? requested : DEFAULT_STACK;
  const project = sanitizeProject(params.get("project"));
  const speed = parseSpeed(params.get("speed"));
  const ideId = parseIde(params.get("ide"), recommendedIde(stackId));
  const themeId = parseTheme(params.get("theme")) || IDE_BY_ID[ideId].defaultTheme;
  return (
    <StackLoader
      key={`${stackId}|${project}|${speed}|${ideId}`}
      stackId={stackId}
      project={project}
      speed={speed}
      ide={IDE_BY_ID[ideId]}
      themeId={themeId}
    />
  );
}

interface LoaderProps {
  stackId: string;
  project: string;
  speed: number;
  ide: Ide;
  themeId: string;
}

function StackLoader({ stackId, project, speed, ide, themeId }: LoaderProps) {
  const [config, setConfig] = useState<StackConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    STACK_LOADERS[stackId]().then((m) => {
      if (!cancelled) setConfig(project ? { ...m.default, project } : m.default);
    });
    return () => {
      cancelled = true;
    };
  }, [stackId, project]);

  const style = themeVars(THEME_BY_ID[themeId]) as CSSProperties;
  if (!config) return <div className="h-screen w-screen" style={{ ...style, background: "var(--ui-editor)" }} />;
  return <Editor config={config} stackId={stackId} speed={speed} ide={ide} style={style} />;
}

interface EditorProps {
  config: StackConfig;
  stackId: string;
  speed: number;
  ide: Ide;
  style: CSSProperties;
}

function Editor({ config, stackId, speed, ide, style }: EditorProps) {
  const session = useCodingSession(config, stackId, speed);
  const snippet = config.snippets[session.active];
  const [pointerHidden, setPointerHidden] = useState(false);

  const before = session.doc.slice(0, session.cursor);
  const cursorLine = before.split("\n").length;
  const cursorCol = session.cursor - (before.lastIndexOf("\n") + 1) + 1;

  useEffect(() => {
    const file = snippet.filename.split("/").pop();
    document.title =
      ide.family === "xcode"
        ? `${config.project} — ${file}`
        : ide.family === "jetbrains"
          ? `${config.project} – ${file}`
          : `${session.dirty ? "● " : ""}${file} - ${config.project}`;
  }, [snippet.filename, config.project, session.dirty, ide.family]);

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

  const Layout = LAYOUTS[ide.family];
  return (
    <div
      onClick={enterFullscreen}
      className={`flex h-screen w-screen flex-col overflow-hidden text-[13px] select-none ${pointerHidden ? "cursor-none" : ""}`}
      style={{
        ...style,
        background: "var(--ui-editor)",
        color: "var(--ui-fg)",
        fontFamily: ide.family === "xcode" ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', var(--font-sans)" : undefined,
      }}
    >
      <Layout config={config} session={session} snippet={snippet} ide={ide} cursorLine={cursorLine} cursorCol={cursorCol} />
    </div>
  );
}
