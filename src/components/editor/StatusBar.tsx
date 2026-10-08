interface Props {
  language: string;
  indent: string;
  line: number;
  col: number;
  branch: string;
  dirtyRepo: boolean;
  errors: number;
  warnings: number;
}

export function StatusBar({ language, indent, line, col, branch, dirtyRepo, errors, warnings }: Props) {
  return (
    <div className="flex h-[22px] shrink-0 items-center gap-4 overflow-hidden bg-[#0078d4] pr-2 text-[12px] text-white select-none">
      <div className="flex h-full items-center gap-3">
        <span className="flex h-full items-center bg-[#16825d] px-2.5">⋊</span>
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
        <span>✦ Copilot</span>
        <span>🔔</span>
      </div>
    </div>
  );
}
