"use client";

import Link from "next/link";

const menus = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];

export function MenuBar({ title }: { title: string }) {
  return (
    <div className="flex h-[35px] shrink-0 items-center border-b border-[#2b2b2b] bg-[#181818] text-[13px] text-[#cccccc]">
      <div className="flex w-10 items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#3b9bea" d="M17 2 8 10.5 3.5 7 2 7.8v8.4l1.5.8L8 13.5 17 22l5-2.4V4.4z" />
          <path fill="#1e1e1e" d="M17 7.2v9.6L10.6 12z" />
        </svg>
      </div>

      <nav className="flex items-center">
        {menus.map((m) => (
          <span key={m} className="cursor-default rounded px-2 py-0.5 hover:bg-[#2b2b2b]">
            {m}
          </span>
        ))}
      </nav>

      <div className="flex flex-1 justify-center px-4">
        <div className="flex h-[22px] w-full max-w-[440px] items-center justify-center gap-2 rounded-md border border-[#3c3c3c] bg-[#222222] text-[12px] text-[#9d9d9d]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {title}
        </div>
      </div>

      <div className="flex h-full items-center">
        <span className="flex h-full w-[46px] items-center justify-center hover:bg-[#2b2b2b]">—</span>
        <span className="flex h-full w-[46px] items-center justify-center hover:bg-[#2b2b2b]">▢</span>
        <Link
          href="/"
          aria-label="Close"
          className="flex h-full w-[46px] items-center justify-center hover:bg-[#c42b1c] hover:text-white"
        >
          ✕
        </Link>
      </div>
    </div>
  );
}
