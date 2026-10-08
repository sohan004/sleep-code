"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/stacks/types";

export interface ShownMessage {
  role: ChatMessage["role"];
  text: string;
  done: boolean;
}

const sleep = (ms: number, signal: { cancelled: boolean }) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (signal.cancelled ? reject(new Error("cancelled")) : resolve()), ms)
  );

/** Plays a stack's scripted conversation on a loop, streaming assistant replies. */
export function useChatScript(messages: ChatMessage[]) {
  const [shown, setShown] = useState<ShownMessage[]>([]);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const signal = { cancelled: false };
    const run = async () => {
      while (!signal.cancelled) {
        setShown([]);
        let elapsed = 0;
        for (const msg of messages) {
          await sleep(Math.max(1500, msg.delay - elapsed), signal);
          if (msg.role === "user") {
            setShown((prev) => [...prev, { role: "user", text: msg.content, done: true }]);
          } else {
            setThinking(true);
            await sleep(1200 + Math.random() * 1000, signal);
            setThinking(false);
            setShown((prev) => [...prev, { role: "assistant", text: "", done: false }]);
            for (let i = 0; i < msg.content.length; i += 3) {
              await sleep(22, signal);
              const text = msg.content.slice(0, i + 3);
              setShown((prev) => [...prev.slice(0, -1), { role: "assistant", text, done: false }]);
            }
            setShown((prev) => [...prev.slice(0, -1), { role: "assistant", text: msg.content, done: true }]);
          }
          elapsed = msg.delay;
        }
        // Linger on the finished conversation before "starting a new chat", so the replay isn't obvious
        await sleep(60000 + Math.random() * 60000, signal);
      }
    };
    run().catch(() => {});
    return () => {
      signal.cancelled = true;
    };
  }, [messages]);

  return { shown, thinking };
}

interface ThreadProps {
  messages: ChatMessage[];
  assistantName: string;
  assistantColor: string;
  emptyHint: string;
  /** "bubbles" puts user turns in a filled box (VS Code, Cursor); "plain" labels both sides (JetBrains, Xcode). */
  variant?: "bubbles" | "plain";
}

export function ChatThread({ messages, assistantName, assistantColor, emptyHint, variant = "bubbles" }: ThreadProps) {
  const { shown, thinking } = useChatScript(messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, thinking]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
      {shown.length === 0 && !thinking && (
        <div className="mt-16 text-center text-[12px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-[18px]"
            style={{ background: "var(--ui-widget)" }}
          >
            ✦
          </div>
          {emptyHint}
        </div>
      )}

      {shown.map((m, i) => (
        <div key={i}>
          <div className="mb-1.5 flex items-center gap-2">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: m.role === "user" ? "#6b6b6b" : assistantColor }}
            >
              {m.role === "user" ? "Y" : "✦"}
            </div>
            <span className="text-[12px] font-semibold" style={{ color: "var(--ui-fg)" }}>
              {m.role === "user" ? "You" : assistantName}
            </span>
          </div>
          <div
            className={`text-[13px] leading-[1.55] whitespace-pre-wrap ${
              m.role === "user" && variant === "bubbles" ? "rounded-md px-3 py-2" : "pl-7"
            }`}
            style={{
              color: "var(--ui-fg)",
              background: m.role === "user" && variant === "bubbles" ? "var(--ui-widget)" : undefined,
            }}
          >
            <MessageContent content={m.text} />
            {!m.done && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-blink align-middle" style={{ background: "var(--ui-fg)" }} />
            )}
          </div>
        </div>
      ))}

      {thinking && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ui-muted)" }}>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
            style={{ background: assistantColor }}
          >
            ✦
          </div>
          <span className="animate-pulse">Thinking…</span>
        </div>
      )}
    </div>
  );
}

const INLINE = /(`[^`\n]+`|\*\*(?:`[^`\n]*`|[^*\n`])+\*\*|(?<![*\w])\*(?![\s*])[^*\n]+?\*(?![*\w]))/g;

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded px-1 font-mono text-[12px] wrap-anywhere"
              style={{ fontVariantLigatures: "none", background: "var(--ui-widget)", color: "var(--syn-string)" }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              <Inline text={part.slice(2, -2)} />
            </strong>
          );
        }
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?(?:```|$))/g);
  return (
    <>
      {parts.map((raw, i) => {
        const part = parts[i - 1]?.startsWith("```") ? raw.replace(/^\n/, "") : raw;
        if (part.startsWith("```")) {
          const body = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
          return (
            <code
              key={i}
              className="my-2 block overflow-x-auto rounded-md border p-2.5 font-mono text-[12px] leading-normal whitespace-pre"
              style={{
                fontVariantLigatures: "none",
                borderColor: "var(--ui-border)",
                background: "var(--ui-editor)",
                color: "var(--syn-plain)",
              }}
            >
              {body}
            </code>
          );
        }
        return <Inline key={i} text={part} />;
      })}
    </>
  );
}
