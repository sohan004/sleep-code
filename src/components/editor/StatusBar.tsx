interface Props {
  language: string;
  indent: string;
  line: number;
  col: number;
  branch: string;
  dirtyRepo: boolean;
  errors: number;
  warnings: number;
  assistant: string;
}

/** VS Code / Cursor status bar. */
export function StatusBar({ language, indent, line, col, branch, dirtyRepo, errors, warnings, assistant }: Props) {
  return (
    <div
      className="flex h-[22px] shrink-0 items-center gap-4 overflow-hidden border-t pr-2 text-[12px] select-none"
      style={{ background: "var(--ui-statusbar)", color: "var(--ui-status-fg)", borderColor: "var(--ui-border)" }}
    >
      <div className="flex h-full items-center gap-3">
        <span className="flex h-full items-center px-2.5 text-white" style={{ background: "var(--ui-accent)" }}>
          ⋊
        </span>
        <span>
          ⎇ {branch}
          {dirtyRepo ? "*" : ""}
        </span>
        <span>⟳</span>
        <span className="flex items-center gap-2">
          <span>⊗ {errors}</span>
          <span>⚠ {warnings}</span>
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-4">
        <span>
          Ln {line}, Col {col}
        </span>
        <span>{indent}</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span>{"{ }"} {language}</span>
        <span>✦ {assistant}</span>
        <span>🔔</span>
      </div>
    </div>
  );
}
