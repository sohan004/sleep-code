"use client";

interface Props {
  code: string;
}

export function MiniMap({ code }: Props) {
  const lines = code.split("\n").slice(-120); // show last 120 lines

  return (
    <div className="w-24 bg-[#1e1e1e] border-l border-[#2d2d2d] shrink-0 overflow-hidden relative select-none">
      <div className="p-1 opacity-40">
        {lines.map((line, i) => {
          const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
          const text = line.trimStart();
          const width = Math.min(Math.max(text.length, 2), 80);
          // Colour based on first char heuristic
          let bg = "bg-[#d4d4d4]";
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) bg = "bg-[#6a9955]";
          else if (line.includes('"') || line.includes("'")) bg = "bg-[#ce9178]";
          else if (/^\s*(import|export|from|const|let|function|async|def|fn|pub|use|type|interface)\b/.test(line))
            bg = "bg-[#569cd6]";
          return (
            <div key={i} className="h-[2px] mb-px" style={{ paddingLeft: `${indent * 0.5}px` }}>
              {text && (
                <div
                  className={`h-full rounded-full opacity-70 ${bg}`}
                  style={{ width: `${Math.min(width * 0.8, 80)}px` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Viewport indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#4f4f4f]/20 border-y border-[#4f4f4f]/30 pointer-events-none" />
    </div>
  );
}
