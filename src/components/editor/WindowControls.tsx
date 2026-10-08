import Link from "next/link";

/** Window buttons; "close" is the discreet way back to the SleepCode home page. */
export function WindowControls({ style = "windows" }: { style?: "windows" | "mac" }) {
  if (style === "mac") {
    return (
      <div className="flex items-center gap-2 px-3">
        <Link href="/" aria-label="Close" className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
    );
  }
  return (
    <div className="flex h-full items-center" style={{ color: "var(--ui-fg)" }}>
      <span className="flex h-full w-[46px] items-center justify-center">—</span>
      <span className="flex h-full w-[46px] items-center justify-center">▢</span>
      <Link href="/" aria-label="Close" className="flex h-full w-[46px] items-center justify-center hover:bg-[#c42b1c] hover:text-white">
        ✕
      </Link>
    </div>
  );
}
