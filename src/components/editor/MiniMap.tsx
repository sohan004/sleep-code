interface Props {
  code: string;
}

function lineColor(line: string): string {
  const t = line.trimStart();
  if (t.startsWith("//") || t.startsWith("#") || t.startsWith("--")) return "var(--syn-comment)";
  if (/^(import|export|from|use|using|package|namespace|require|#include)\b/.test(t)) return "var(--syn-control)";
  if (/^(const|let|var|function|async|def|fn|pub|func|fun|class|interface|type|public|private|protected|struct|impl)\b/.test(t))
    return "var(--syn-keyword)";
  if (/["'`]/.test(t)) return "var(--syn-string)";
  return "var(--syn-plain)";
}

export function MiniMap({ code }: Props) {
  const lines = code.split("\n").slice(0, 220);
  return (
    <div
      aria-hidden
      className="relative w-24 shrink-0 overflow-hidden border-l select-none"
      style={{ background: "var(--ui-editor)", borderColor: "var(--ui-border)" }}
    >
      <div className="p-1 opacity-50">
        {lines.map((line, i) => {
          const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
          const text = line.trim();
          return (
            <div key={i} className="mb-px h-[2px]" style={{ paddingLeft: indent * 0.6 }}>
              {text && (
                <div
                  className="h-full rounded-full opacity-80"
                  style={{ width: Math.min(text.length * 0.9, 76), background: lineColor(line) }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute top-0 right-0 left-0 h-24"
        style={{ background: "color-mix(in srgb, var(--ui-fg) 8%, transparent)" }}
      />
    </div>
  );
}
