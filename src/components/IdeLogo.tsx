import Image from "next/image";
import type { Ide } from "@/lib/ides";

// Real product logos are trademarks; set NEXT_PUBLIC_REAL_LOGOS=false to fall back to generic marks
const REAL_LOGOS = process.env.NEXT_PUBLIC_REAL_LOGOS !== "false";

export function IdeLogo({ ide, size = 20, rounded = 4 }: { ide: Ide; size?: number; rounded?: number }) {
  if (REAL_LOGOS) {
    return (
      <Image
        src={ide.logo}
        alt=""
        width={size}
        height={size}
        unoptimized
        draggable={false}
        className="shrink-0 select-none"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center font-black text-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        fontSize: Math.round(size * 0.38),
        background: `linear-gradient(135deg, ${ide.colors[0]}, ${ide.colors[1]})`,
      }}
    >
      {ide.mark}
    </span>
  );
}
