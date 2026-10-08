import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  commit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h6M15 12h6" />
    </>
  ),
  structure: <path d="M4 5h6M4 12h10M4 19h7M14 5h6M18 12h2M15 19h5" />,
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M12 15h5" />
    </>
  ),
  problems: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  git: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 8v8M18 10a6 6 0 0 1-6 6H8" />
    </>
  ),
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  play: <path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  bug: (
    <>
      <rect x="8" y="7" width="8" height="12" rx="4" />
      <path d="M12 7V4M8 11H4M20 11h-4M8 15H4.5M19.5 15H16M9 5l1.5 2M15 5l-1.5 2" />
    </>
  ),
  more: <path d="M12 6h.01M12 12h.01M12 18h.01" strokeWidth="3" />,
  sparkle: <path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  services: <path d="M5 5h14v5H5zM5 14h14v5H5zM8 7.5h.01M8 16.5h.01" />,
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  inspector: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  warning: <path d="M12 4 2.5 20h19zM12 10v4M12 17h.01" />,
  logcat: <path d="M4 6h16M4 10h10M4 14h16M4 18h8" />,
  hammer: <path d="M14 6 9 11l-5 5 3 3 5-5 5-5zM14 6l3-3 4 4-3 3" />,
  box: <path d="M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" />,
  filter: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
};

export function Icon({ name, size = 16, className, color }: { name: keyof typeof PATHS; size?: number; className?: string; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={color ? { color } : undefined}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

export type IconName = keyof typeof PATHS;
