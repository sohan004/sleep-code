"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

export function requestFullscreen() {
  if (typeof document !== "undefined" && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

// Fullscreen must be requested inside the click itself; client-side navigation keeps the same document, so it persists.
export function StartLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        requestFullscreen();
        onClick?.(e);
      }}
    />
  );
}
