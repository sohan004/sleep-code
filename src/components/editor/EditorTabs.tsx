import { FileIcon } from "./FileIcon";

interface Props {
  tabs: string[];
  activeTab: string;
  dirty: boolean;
  modified: string[];
  breadcrumbs?: boolean;
}

/** VS Code-style tab strip with breadcrumbs. */
export function EditorTabs({ tabs, activeTab, dirty, modified, breadcrumbs = true }: Props) {
  return (
    <div className="shrink-0">
      <div
        className="flex h-[35px] items-stretch overflow-x-auto border-b"
        style={{ borderColor: "var(--ui-border)", background: "var(--ui-sidebar)" }}
      >
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const name = tab.split("/").pop()!;
          const isModified = modified.includes(tab);
          return (
            <div
              key={tab}
              className="-mb-px flex max-w-[320px] shrink-0 items-center gap-1.5 border-t border-r pr-2 pl-3 text-[13px]"
              style={{
                borderRightColor: "var(--ui-border)",
                borderTopColor: isActive ? "var(--ui-accent)" : "transparent",
                background: isActive ? "var(--ui-editor)" : "transparent",
                color: isModified ? "var(--ui-modified)" : isActive ? "var(--ui-fg)" : "var(--ui-muted)",
              }}
            >
              <FileIcon name={name} />
              <span className="truncate">{name}</span>
              {isModified && <span className="text-[11px]">M</span>}
              <span className="ml-1 w-4 text-center text-[12px]" style={{ color: isActive ? "var(--ui-fg)" : "transparent" }}>
                {isActive && dirty ? "●" : "×"}
              </span>
            </div>
          );
        })}
      </div>
      {breadcrumbs && (
        <div className="flex h-[22px] items-center gap-1 px-4 text-[12px]" style={{ background: "var(--ui-editor)", color: "var(--ui-muted)" }}>
          {activeTab.split("/").map((part, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i === arr.length - 1 && <FileIcon name={part} />}
              {part}
              {i < arr.length - 1 && <span>›</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
