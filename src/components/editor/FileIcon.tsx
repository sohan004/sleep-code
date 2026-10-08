const ICONS: [RegExp, string, string][] = [
  [/\.(tsx|jsx)$/, "⚛", "#61dafb"],
  [/\.ts$/, "TS", "#3178c6"],
  [/\.(js|mjs|cjs)$/, "JS", "#f1e05a"],
  [/\.py$/, "py", "#3572a5"],
  [/\.go$/, "go", "#00add8"],
  [/\.rs$/, "rs", "#dea584"],
  [/\.vue$/, "V", "#41b883"],
  [/\.svelte$/, "S", "#ff3e00"],
  [/\.php$/, "php", "#8892bf"],
  [/\.java$/, "J", "#e76f00"],
  [/\.(cs|csproj)$/, "C#", "#9b4f96"],
  [/\.rb$/, "rb", "#cc342d"],
  [/\.(kt|kts)$/, "K", "#a97bff"],
  [/\.swift$/, "sw", "#f05138"],
  [/\.dart$/, "◢", "#40c4ff"],
  [/\.(cpp|cc|h|hpp)$/, "C+", "#659ad2"],
  [/\.gd$/, "gd", "#478cbf"],
  [/\.(lua|luau)$/, "lua", "#5b6ad4"],
  [/\.(html|xaml|xml)$/, "<>", "#e44d26"],
  [/\.(css|scss)$/, "#", "#42a5f5"],
  [/\.(json|lock)$/, "{}", "#cbcb41"],
  [/\.(toml|ya?ml|mod|gradle|ini|cfg|properties)$/, "⚙", "#9d9d9d"],
  [/\.(txt|env\.example)$/, "≡", "#9d9d9d"],
  [/\.md$/, "ⓘ", "#519aba"],
  [/^\.git|^Dockerfile$/, "◆", "#f05033"],
];

export function FileIcon({ name }: { name: string }) {
  const match = ICONS.find(([re]) => re.test(name));
  const label = match?.[1] ?? "•";
  const color = match?.[2] ?? "#9d9d9d";
  return (
    <span
      className="inline-flex w-5 shrink-0 justify-center font-mono text-[9px] leading-none font-bold tracking-tighter"
      style={{ color }}
    >
      {label}
    </span>
  );
}
