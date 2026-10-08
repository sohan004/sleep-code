"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/stacks/types";

interface Props {
  messages: ChatMessage[];
  contextFile: string;
}

interface Shown {
  role: ChatMessage["role"];
  text: string;
  done: boolean;
}

const sleep = (ms: number, signal: { cancelled: boolean }) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (signal.cancelled ? reject(new Error("cancelled")) : resolve()), ms)
  );

export function ChatPanel({ messages, contextFile }: Props) {
  const [shown, setShown] = useState<Shown[]>([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        await sleep(20000, signal);
      }
    };

    run().catch(() => {});
    return () => {
      signal.cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, thinking]);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-[#2b2b2b] bg-[#181818]">
      <div className="flex h-9 items-center justify-between border-b border-[#2b2b2b] px-4">
        <span className="text-[11px] font-semibold tracking-wide text-[#bbbbbb] uppercase">Chat</span>
        <div className="flex gap-3 text-[14px] text-[#9d9d9d]">
          <span title="New chat">+</span>
          <span title="History">⟲</span>
          <span title="More">⋯</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {shown.length === 0 && !thinking && (
          <div className="mt-16 text-center text-[12px] leading-relaxed text-[#6e6e6e]">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#2b2b2b] text-[18px]">
              ✦
            </div>
            Ask about your code, or type / for commands.
          </div>
        )}

        {shown.map((m, i) => (
          <div key={i}>
            <div className="mb-1.5 flex items-center gap-2">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  m.role === "user" ? "bg-[#5a5a5a]" : "bg-[#6c5ce7]"
                }`}
              >
                {m.role === "user" ? "Y" : "✦"}
              </div>
              <span className="text-[12px] font-semibold text-[#cccccc]">
                {m.role === "user" ? "You" : "Copilot"}
              </span>
            </div>
            <div
              className={`text-[13px] leading-[1.55] whitespace-pre-wrap text-[#cccccc] ${
                m.role === "user" ? "rounded-md bg-[#2b2b2b] px-3 py-2" : "pl-7"
              }`}
            >
              <MessageContent content={m.text} />
              {!m.done && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-blink bg-[#cccccc] align-middle" />}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-2 pl-0 text-[12px] text-[#9d9d9d]">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#6c5ce7] text-[10px] text-white">✦</div>
            <span className="animate-pulse">Working…</span>
          </div>
        )}
      </div>

      <div className="border-t border-[#2b2b2b] p-3">
        <div className="rounded-md border border-[#3c3c3c] bg-[#1f1f1f] px-3 py-2">
          <div className="text-[13px] text-[#6e6e6e]">Ask Copilot</div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#8b8b8b]">
            <span className="min-w-0 truncate">📎 {contextFile.split("/").pop()}</span>
            <span className="shrink-0">Claude Sonnet ▾ ➤</span>
          </div>
        </div>
      </div>
    </aside>
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
              className="rounded bg-[#2b2b2b] px-1 font-mono text-[12px] wrap-anywhere text-[#d7ba7d]"
              style={{ fontVariantLigatures: "none" }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-white">
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
              className="my-2 block overflow-x-auto rounded-md border border-[#2b2b2b] bg-[#1e1e1e] p-2.5 font-mono text-[12px] leading-[1.5] whitespace-pre text-[#d4d4d4]"
              style={{ fontVariantLigatures: "none" }}
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
