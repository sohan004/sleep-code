import { IdeLogo } from "@/components/IdeLogo";
import type { Ide } from "@/lib/ides";
import { WindowControls } from "./WindowControls";

const menus = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];

/** VS Code / Cursor custom title bar with command centre. */
export function MenuBar({ title, ide }: { title: string; ide: Ide }) {
  return (
    <div
      className="flex h-[35px] shrink-0 items-center border-b text-[13px]"
      style={{ borderColor: "var(--ui-border)", background: "var(--ui-titlebar)", color: "var(--ui-fg)" }}
    >
      <div className="flex w-10 items-center justify-center">
        <IdeLogo ide={ide} size={16} />
      </div>

      <nav className="flex items-center">
        {menus.map((m) => (
          <span key={m} className="cursor-default rounded px-2 py-0.5">
            {m}
          </span>
        ))}
      </nav>

      <div className="flex flex-1 justify-center px-4">
        <div
          className="flex h-[22px] w-full max-w-[440px] items-center justify-center gap-2 rounded-md border text-[12px]"
          style={{ borderColor: "var(--ui-border)", background: "var(--ui-input)", color: "var(--ui-muted)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {title}
        </div>
      </div>

      <WindowControls />
    </div>
  );
}
