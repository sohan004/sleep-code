import type { Ide } from "@/lib/ides";
import type { ChatMessage } from "@/lib/stacks/types";
import { ChatThread } from "./ChatThread";

interface Props {
  messages: ChatMessage[];
  contextFile: string;
  ide: Ide;
}

/** VS Code / Cursor secondary side bar chat. */
export function ChatPanel({ messages, contextFile, ide }: Props) {
  const cursor = ide.id === "cursor";
  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col border-l"
      style={{ borderColor: "var(--ui-border)", background: "var(--ui-sidebar)" }}
    >
      <div
        className="flex h-9 items-center justify-between border-b px-4"
        style={{ borderColor: "var(--ui-border)" }}
      >
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--ui-fg)" }}>
          {ide.assistant.title}
        </span>
        <div className="flex gap-3 text-[14px]" style={{ color: "var(--ui-muted)" }}>
          <span>+</span>
          <span>⟲</span>
          <span>⋯</span>
        </div>
      </div>

      <ChatThread
        messages={messages}
        assistantName={ide.assistant.name}
        assistantColor={cursor ? "#3a3a3a" : "#6c5ce7"}
        emptyHint={cursor ? "Plan, search, build anything" : "Ask about your code, or type / for commands."}
      />

      <div className="border-t p-3" style={{ borderColor: "var(--ui-border)" }}>
        <div className="rounded-md border px-3 py-2" style={{ borderColor: "var(--ui-border)", background: "var(--ui-input)" }}>
          <div className="text-[13px]" style={{ color: "var(--ui-muted)" }}>
            {cursor ? "Plan, search, build anything" : `Ask ${ide.assistant.name}`}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--ui-muted)" }}>
            <span className="min-w-0 truncate">
              {cursor ? "∞ Agent ▾" : "📎"} {contextFile.split("/").pop()}
            </span>
            <span className="shrink-0">{ide.assistant.model} ▾ ➤</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
