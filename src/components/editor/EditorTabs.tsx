import { FileIcon } from "./FileIcon";

interface Props {
  tabs: string[];
  activeTab: string;
  dirty: boolean;
  modified: string[];
}

export function EditorTabs({ tabs, activeTab, dirty, modified }: Props) {
  const active = tabs.find((t) => t === activeTab);
  return (
    <div className="shrink-0">
      <div className="flex h-[35px] items-stretch overflow-x-auto border-b border-[#2b2b2b] bg-[#181818]">
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const name = tab.split("/").pop()!;
          return (
            <div
              key={tab}
              className={`flex max-w-[320px] shrink-0 items-center gap-1.5 border-r border-[#2b2b2b] pr-2 pl-3 text-[13px] ${
                isActive
                  ? "-mb-px border-t border-t-[#0078d4] bg-[#1f1f1f] text-white"
                  : "border-t border-t-transparent text-[#9d9d9d]"
              }`}
            >
              <FileIcon name={name} />
              <span className={`truncate ${modified.includes(tab) ? "text-[#e2c08d]" : ""}`}>{name}</span>
              {modified.includes(tab) && <span className="text-[11px] text-[#e2c08d]">M</span>}
              <span className={`ml-1 w-4 text-center text-[12px] ${isActive ? "text-[#cccccc]" : "text-transparent"}`}>
                {isActive && dirty ? "●" : "×"}
              </span>
            </div>
          );
        })}
      </div>
      {active && (
        <div className="flex h-[22px] items-center gap-1 bg-[#1f1f1f] px-4 text-[12px] text-[#a9a9a9]">
          {active.split("/").map((part, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i === arr.length - 1 && <FileIcon name={part} />}
              {part}
              {i < arr.length - 1 && <span className="text-[#6e6e6e]">›</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
