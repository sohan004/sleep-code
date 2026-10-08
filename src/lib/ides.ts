export type IdeFamily = "vscode" | "jetbrains" | "xcode" | "vs";

export interface Ide {
  id: string;
  label: string;
  family: IdeFamily;
  defaultTheme: string;
  /** Short product mark shown in the logo tile (JetBrains-style) or menu. */
  mark: string;
  /** Logo tile gradient [from, to]. */
  colors: [string, string];
  assistant: { title: string; name: string; model: string };
}

export const IDES: Ide[] = [
  {
    id: "vscode",
    label: "VS Code",
    family: "vscode",
    defaultTheme: "dark-modern",
    mark: "VS",
    colors: ["#0065a9", "#2489ca"],
    assistant: { title: "Chat", name: "Copilot", model: "Claude Sonnet 4.5" },
  },
  {
    id: "cursor",
    label: "Cursor",
    family: "vscode",
    defaultTheme: "cursor-dark",
    mark: "⌘",
    colors: ["#1a1a1a", "#4a4a4a"],
    assistant: { title: "Agent", name: "Cursor", model: "claude-4.5-sonnet" },
  },
  {
    id: "intellij",
    label: "IntelliJ IDEA",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "IJ",
    colors: ["#fe315d", "#087cfa"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "android-studio",
    label: "Android Studio",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "AS",
    colors: ["#073042", "#3ddc84"],
    assistant: { title: "Gemini", name: "Gemini", model: "Gemini 2.5 Pro" },
  },
  {
    id: "pycharm",
    label: "PyCharm",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "PC",
    colors: ["#21d789", "#fcf84a"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "webstorm",
    label: "WebStorm",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "WS",
    colors: ["#07c3f2", "#087cfa"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "phpstorm",
    label: "PhpStorm",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "PS",
    colors: ["#b345f1", "#ff318c"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "goland",
    label: "GoLand",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "GO",
    colors: ["#0d7bf7", "#b74af7"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "rider",
    label: "Rider",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "RD",
    colors: ["#c90f5e", "#fcae1e"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "rubymine",
    label: "RubyMine",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "RM",
    colors: ["#fe2857", "#fc801d"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "clion",
    label: "CLion",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "CL",
    colors: ["#21d789", "#009ae5"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "rustrover",
    label: "RustRover",
    family: "jetbrains",
    defaultTheme: "jetbrains-dark",
    mark: "RR",
    colors: ["#ff8a00", "#e83a6d"],
    assistant: { title: "AI Assistant", name: "AI Assistant", model: "Claude Sonnet 4.5" },
  },
  {
    id: "xcode",
    label: "Xcode",
    family: "xcode",
    defaultTheme: "xcode-dark",
    mark: "X",
    colors: ["#1c7cf4", "#4fb4ff"],
    assistant: { title: "Coding Assistant", name: "Claude", model: "Claude Sonnet 4.5" },
  },
  {
    id: "visual-studio",
    label: "Visual Studio 2022",
    family: "vs",
    defaultTheme: "vs-dark",
    mark: "VS",
    colors: ["#5c2d91", "#9b4f96"],
    assistant: { title: "GitHub Copilot Chat", name: "GitHub Copilot", model: "Claude Sonnet 4.5" },
  },
];

export const IDE_BY_ID = Object.fromEntries(IDES.map((i) => [i.id, i])) as Record<string, Ide>;
export const DEFAULT_IDE = "vscode";

const RECOMMENDED: Record<string, string> = {
  "jetpack-compose": "android-studio",
  flutter: "android-studio",
  swiftui: "xcode",
  uikit: "xcode",
  "aspnet-core": "rider",
  maui: "visual-studio",
  xamarin: "visual-studio",
  unity: "rider",
  unreal: "visual-studio",
  cryengine: "visual-studio",
  "spring-boot": "intellij",
  hibernate: "intellij",
  quarkus: "intellij",
  django: "pycharm",
  flask: "pycharm",
  fastapi: "pycharm",
  pyramid: "pycharm",
  laravel: "phpstorm",
  symfony: "phpstorm",
  gin: "goland",
  fiber: "goland",
  echo: "goland",
  rails: "rubymine",
  axum: "rustrover",
};

/** The IDE a developer on this stack would most plausibly have open; VS Code otherwise. */
export function recommendedIde(stackId: string): string {
  return RECOMMENDED[stackId] ?? DEFAULT_IDE;
}
