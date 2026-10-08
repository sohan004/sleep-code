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
        {ide.id === "cursor" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
            <path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7zm0 2.3 6.9 3.9L12 12 5.1 8.2zM5 9.9l6 3.4v6.6l-6-3.4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path fill="#3b9bea" d="M17 2 8 10.5 3.5 7 2 7.8v8.4l1.5.8L8 13.5 17 22l5-2.4V4.4z" />
            <path fill="var(--ui-titlebar)" d="M17 7.2v9.6L10.6 12z" />
          </svg>
        )}
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
