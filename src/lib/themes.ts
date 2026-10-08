// Palettes approximate each theme's published colours; they're tuned for a convincing look, not pixel parity.

export interface ThemeUi {
  editor: string;
  sidebar: string;
  titlebar: string;
  activity: string;
  border: string;
  fg: string;
  muted: string;
  accent: string;
  listActive: string;
  hover: string;
  statusbar: string;
  statusFg: string;
  selection: string;
  cursor: string;
  gutter: string;
  gutterActive: string;
  lineHighlight: string;
  input: string;
  modified: string;
  error: string;
  panel: string;
  widget: string;
}

export interface ThemeSyntax {
  plain: string;
  comment: string;
  string: string;
  keyword: string;
  control: string;
  type: string;
  func: string;
  number: string;
  variable: string;
  tag: string;
  attr: string;
  bracket: string;
  meta: string;
}

export interface ThemeTerminal {
  fg: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  dim: string;
  white: string;
}

export interface Theme {
  id: string;
  label: string;
  kind: "dark" | "light";
  ui: ThemeUi;
  syntax: ThemeSyntax;
  terminal: ThemeTerminal;
}

const DARK_TERM: ThemeTerminal = {
  fg: "#cccccc",
  red: "#f14c4c",
  green: "#23d18b",
  yellow: "#e5e510",
  blue: "#3b8eea",
  magenta: "#d670d6",
  cyan: "#29b8db",
  dim: "#8b8b8b",
  white: "#e5e5e5",
};

const LIGHT_TERM: ThemeTerminal = {
  fg: "#3b3b3b",
  red: "#cd3131",
  green: "#107c10",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  dim: "#767676",
  white: "#1f1f1f",
};

const DARK_PLUS_SYNTAX: ThemeSyntax = {
  plain: "#d4d4d4",
  comment: "#6a9955",
  string: "#ce9178",
  keyword: "#569cd6",
  control: "#c586c0",
  type: "#4ec9b0",
  func: "#dcdcaa",
  number: "#b5cea8",
  variable: "#9cdcfe",
  tag: "#569cd6",
  attr: "#9cdcfe",
  bracket: "#ffd700",
  meta: "#c586c0",
};

export const THEMES: Theme[] = [
  {
    id: "dark-modern",
    label: "Dark Modern",
    kind: "dark",
    ui: {
      editor: "#1f1f1f", sidebar: "#181818", titlebar: "#181818", activity: "#181818", border: "#2b2b2b",
      fg: "#cccccc", muted: "#9d9d9d", accent: "#0078d4", listActive: "#37373d", hover: "#2a2d2e",
      statusbar: "#181818", statusFg: "#cccccc", selection: "#264f78", cursor: "#aeafad", gutter: "#6e7681",
      gutterActive: "#cccccc", lineHighlight: "#282828", input: "#313131", modified: "#e2c08d", error: "#f14c4c",
      panel: "#181818", widget: "#2b2b2b",
    },
    syntax: { ...DARK_PLUS_SYNTAX, plain: "#cccccc" },
    terminal: DARK_TERM,
  },
  {
    id: "dark-plus",
    label: "Dark+ (classic)",
    kind: "dark",
    ui: {
      editor: "#1e1e1e", sidebar: "#252526", titlebar: "#3c3c3c", activity: "#333333", border: "#3c3c3c",
      fg: "#cccccc", muted: "#969696", accent: "#007acc", listActive: "#37373d", hover: "#2a2d2e",
      statusbar: "#007acc", statusFg: "#ffffff", selection: "#264f78", cursor: "#aeafad", gutter: "#858585",
      gutterActive: "#c6c6c6", lineHighlight: "#282828", input: "#3c3c3c", modified: "#e2c08d", error: "#f14c4c",
      panel: "#1e1e1e", widget: "#2d2d30",
    },
    syntax: DARK_PLUS_SYNTAX,
    terminal: DARK_TERM,
  },
  {
    id: "light-modern",
    label: "Light Modern",
    kind: "light",
    ui: {
      editor: "#ffffff", sidebar: "#f8f8f8", titlebar: "#f8f8f8", activity: "#f8f8f8", border: "#e5e5e5",
      fg: "#3b3b3b", muted: "#767676", accent: "#005fb8", listActive: "#e4e6f1", hover: "#f2f2f2",
      statusbar: "#f8f8f8", statusFg: "#3b3b3b", selection: "#add6ff", cursor: "#000000", gutter: "#6e7681",
      gutterActive: "#171184", lineHighlight: "#eeeeee", input: "#ffffff", modified: "#895503", error: "#e51400",
      panel: "#f8f8f8", widget: "#f2f2f2",
    },
    syntax: {
      plain: "#3b3b3b", comment: "#008000", string: "#a31515", keyword: "#0000ff", control: "#af00db",
      type: "#267f99", func: "#795e26", number: "#098658", variable: "#001080", tag: "#800000",
      attr: "#e50000", bracket: "#0431fa", meta: "#af00db",
    },
    terminal: LIGHT_TERM,
  },
  {
    id: "monokai",
    label: "Monokai",
    kind: "dark",
    ui: {
      editor: "#272822", sidebar: "#1e1f1c", titlebar: "#1e1f1c", activity: "#272822", border: "#414339",
      fg: "#f8f8f2", muted: "#90908a", accent: "#f92672", listActive: "#414339", hover: "#3e3d32",
      statusbar: "#414339", statusFg: "#f8f8f2", selection: "#49483e", cursor: "#f8f8f0", gutter: "#90908a",
      gutterActive: "#c2c2bf", lineHighlight: "#3e3d32", input: "#414339", modified: "#e6db74", error: "#f92672",
      panel: "#1e1f1c", widget: "#3e3d32",
    },
    syntax: {
      plain: "#f8f8f2", comment: "#88846f", string: "#e6db74", keyword: "#66d9ef", control: "#f92672",
      type: "#a6e22e", func: "#a6e22e", number: "#ae81ff", variable: "#f8f8f2", tag: "#f92672",
      attr: "#a6e22e", bracket: "#f8f8f2", meta: "#f92672",
    },
    terminal: { ...DARK_TERM, red: "#f92672", green: "#a6e22e", yellow: "#e6db74", blue: "#66d9ef", magenta: "#ae81ff", cyan: "#a1efe4" },
  },
  {
    id: "dracula",
    label: "Dracula",
    kind: "dark",
    ui: {
      editor: "#282a36", sidebar: "#21222c", titlebar: "#21222c", activity: "#343746", border: "#191a21",
      fg: "#f8f8f2", muted: "#6272a4", accent: "#bd93f9", listActive: "#44475a", hover: "#3a3c4e",
      statusbar: "#191a21", statusFg: "#f8f8f2", selection: "#44475a", cursor: "#f8f8f0", gutter: "#6272a4",
      gutterActive: "#f8f8f2", lineHighlight: "#44475a", input: "#282a36", modified: "#ffb86c", error: "#ff5555",
      panel: "#21222c", widget: "#44475a",
    },
    syntax: {
      plain: "#f8f8f2", comment: "#6272a4", string: "#f1fa8c", keyword: "#ff79c6", control: "#ff79c6",
      type: "#8be9fd", func: "#50fa7b", number: "#bd93f9", variable: "#f8f8f2", tag: "#ff79c6",
      attr: "#50fa7b", bracket: "#f8f8f2", meta: "#ff79c6",
    },
    terminal: { ...DARK_TERM, fg: "#f8f8f2", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", dim: "#6272a4" },
  },
  {
    id: "one-dark-pro",
    label: "One Dark Pro",
    kind: "dark",
    ui: {
      editor: "#282c34", sidebar: "#21252b", titlebar: "#282c34", activity: "#282c34", border: "#181a1f",
      fg: "#abb2bf", muted: "#7f848e", accent: "#4d78cc", listActive: "#2c313a", hover: "#2c313a",
      statusbar: "#21252b", statusFg: "#9da5b4", selection: "#3e4451", cursor: "#528bff", gutter: "#495162",
      gutterActive: "#abb2bf", lineHighlight: "#2c313c", input: "#1d1f23", modified: "#e5c07b", error: "#e06c75",
      panel: "#21252b", widget: "#2c313a",
    },
    syntax: {
      plain: "#abb2bf", comment: "#7f848e", string: "#98c379", keyword: "#c678dd", control: "#c678dd",
      type: "#e5c07b", func: "#61afef", number: "#d19a66", variable: "#e06c75", tag: "#e06c75",
      attr: "#d19a66", bracket: "#abb2bf", meta: "#c678dd",
    },
    terminal: { ...DARK_TERM, fg: "#abb2bf", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2" },
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    kind: "dark",
    ui: {
      editor: "#0d1117", sidebar: "#010409", titlebar: "#010409", activity: "#0d1117", border: "#30363d",
      fg: "#e6edf3", muted: "#7d8590", accent: "#f78166", listActive: "#21262d", hover: "#161b22",
      statusbar: "#0d1117", statusFg: "#7d8590", selection: "#264f78", cursor: "#2f81f7", gutter: "#6e7681",
      gutterActive: "#e6edf3", lineHighlight: "#161b22", input: "#0d1117", modified: "#d29922", error: "#f85149",
      panel: "#010409", widget: "#161b22",
    },
    syntax: {
      plain: "#e6edf3", comment: "#8b949e", string: "#a5d6ff", keyword: "#ff7b72", control: "#ff7b72",
      type: "#ffa657", func: "#d2a8ff", number: "#79c0ff", variable: "#e6edf3", tag: "#7ee787",
      attr: "#79c0ff", bracket: "#e6edf3", meta: "#ff7b72",
    },
    terminal: { ...DARK_TERM, fg: "#e6edf3", red: "#ff7b72", green: "#3fb950", yellow: "#d29922", blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf" },
  },
  {
    id: "nord",
    label: "Nord",
    kind: "dark",
    ui: {
      editor: "#2e3440", sidebar: "#2e3440", titlebar: "#2e3440", activity: "#2e3440", border: "#3b4252",
      fg: "#d8dee9", muted: "#616e88", accent: "#88c0d0", listActive: "#3b4252", hover: "#3b4252",
      statusbar: "#3b4252", statusFg: "#d8dee9", selection: "#434c5e", cursor: "#d8dee9", gutter: "#4c566a",
      gutterActive: "#d8dee9", lineHighlight: "#3b4252", input: "#3b4252", modified: "#ebcb8b", error: "#bf616a",
      panel: "#2e3440", widget: "#3b4252",
    },
    syntax: {
      plain: "#d8dee9", comment: "#616e88", string: "#a3be8c", keyword: "#81a1c1", control: "#81a1c1",
      type: "#8fbcbb", func: "#88c0d0", number: "#b48ead", variable: "#d8dee9", tag: "#81a1c1",
      attr: "#8fbcbb", bracket: "#eceff4", meta: "#5e81ac",
    },
    terminal: { ...DARK_TERM, fg: "#d8dee9", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b", blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", dim: "#616e88" },
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    kind: "dark",
    ui: {
      editor: "#1e1e2e", sidebar: "#181825", titlebar: "#11111b", activity: "#11111b", border: "#313244",
      fg: "#cdd6f4", muted: "#7f849c", accent: "#cba6f7", listActive: "#313244", hover: "#24243a",
      statusbar: "#181825", statusFg: "#cdd6f4", selection: "#45475a", cursor: "#f5e0dc", gutter: "#7f849c",
      gutterActive: "#b4befe", lineHighlight: "#2a2b3c", input: "#181825", modified: "#f9e2af", error: "#f38ba8",
      panel: "#181825", widget: "#313244",
    },
    syntax: {
      plain: "#cdd6f4", comment: "#9399b2", string: "#a6e3a1", keyword: "#cba6f7", control: "#cba6f7",
      type: "#f9e2af", func: "#89b4fa", number: "#fab387", variable: "#cdd6f4", tag: "#89b4fa",
      attr: "#f9e2af", bracket: "#9399b2", meta: "#f38ba8",
    },
    terminal: { ...DARK_TERM, fg: "#cdd6f4", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af", blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", dim: "#7f849c" },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    kind: "dark",
    ui: {
      editor: "#1a1b26", sidebar: "#16161e", titlebar: "#16161e", activity: "#16161e", border: "#101014",
      fg: "#a9b1d6", muted: "#787c99", accent: "#3d59a1", listActive: "#202330", hover: "#1f2335",
      statusbar: "#16161e", statusFg: "#787c99", selection: "#283457", cursor: "#c0caf5", gutter: "#363b54",
      gutterActive: "#737aa2", lineHighlight: "#1e202e", input: "#14141b", modified: "#e0af68", error: "#f7768e",
      panel: "#16161e", widget: "#1f2335",
    },
    syntax: {
      plain: "#a9b1d6", comment: "#565f89", string: "#9ece6a", keyword: "#bb9af7", control: "#bb9af7",
      type: "#2ac3de", func: "#7aa2f7", number: "#ff9e64", variable: "#c0caf5", tag: "#f7768e",
      attr: "#bb9af7", bracket: "#9abdf5", meta: "#bb9af7",
    },
    terminal: { ...DARK_TERM, fg: "#a9b1d6", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68", blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", dim: "#565f89" },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    kind: "dark",
    ui: {
      editor: "#002b36", sidebar: "#00212b", titlebar: "#002c39", activity: "#003847", border: "#003847",
      fg: "#93a1a1", muted: "#586e75", accent: "#2aa198", listActive: "#005a6f", hover: "#004454",
      statusbar: "#00212b", statusFg: "#93a1a1", selection: "#274642", cursor: "#d30102", gutter: "#586e75",
      gutterActive: "#93a1a1", lineHighlight: "#073642", input: "#003847", modified: "#b58900", error: "#dc322f",
      panel: "#00212b", widget: "#073642",
    },
    syntax: {
      plain: "#839496", comment: "#586e75", string: "#2aa198", keyword: "#859900", control: "#859900",
      type: "#cb4b16", func: "#268bd2", number: "#d33682", variable: "#268bd2", tag: "#268bd2",
      attr: "#93a1a1", bracket: "#839496", meta: "#cb4b16",
    },
    terminal: { ...DARK_TERM, fg: "#93a1a1", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", dim: "#586e75" },
  },
  {
    id: "cursor-dark",
    label: "Cursor Dark",
    kind: "dark",
    ui: {
      editor: "#181818", sidebar: "#141414", titlebar: "#141414", activity: "#141414", border: "#2a2a2a",
      fg: "#e4e4e4", muted: "#8b8b8b", accent: "#e4e4e4", listActive: "#2a2a2a", hover: "#222222",
      statusbar: "#141414", statusFg: "#8b8b8b", selection: "#40404a", cursor: "#e4e4e4", gutter: "#5a5a5a",
      gutterActive: "#e4e4e4", lineHighlight: "#202020", input: "#1f1f1f", modified: "#e5c07b", error: "#f14c4c",
      panel: "#141414", widget: "#242424",
    },
    syntax: {
      plain: "#d6d6dd", comment: "#6d6d6d", string: "#e394dc", keyword: "#82d2ce", control: "#83d6c5",
      type: "#87c3ff", func: "#efb080", number: "#ebc88d", variable: "#d6d6dd", tag: "#87c3ff",
      attr: "#aaa0fa", bracket: "#d6d6dd", meta: "#a8cc7c",
    },
    terminal: DARK_TERM,
  },
  {
    id: "jetbrains-dark",
    label: "JetBrains Dark",
    kind: "dark",
    ui: {
      editor: "#1e1f22", sidebar: "#2b2d30", titlebar: "#2b2d30", activity: "#2b2d30", border: "#1e1f22",
      fg: "#dfe1e5", muted: "#868a91", accent: "#3574f0", listActive: "#2e436e", hover: "#393b40",
      statusbar: "#2b2d30", statusFg: "#a8adbd", selection: "#214283", cursor: "#ced0d6", gutter: "#4b5059",
      gutterActive: "#a1a3ab", lineHighlight: "#26282e", input: "#1e1f22", modified: "#70aeff", error: "#fa6675",
      panel: "#2b2d30", widget: "#393b40",
    },
    syntax: {
      plain: "#bcbec4", comment: "#7a7e85", string: "#6aab73", keyword: "#cf8e6d", control: "#cf8e6d",
      type: "#bcbec4", func: "#56a8f5", number: "#2aacb8", variable: "#bcbec4", tag: "#d5b778",
      attr: "#bababa", bracket: "#bcbec4", meta: "#b3ae60",
    },
    terminal: { ...DARK_TERM, fg: "#bcbec4", red: "#f75464", green: "#5fb865", yellow: "#d6ae58", blue: "#548af7", magenta: "#c94f97", cyan: "#2aacb8", dim: "#868a91" },
  },
  {
    id: "darcula",
    label: "Darcula",
    kind: "dark",
    ui: {
      editor: "#2b2b2b", sidebar: "#3c3f41", titlebar: "#3c3f41", activity: "#3c3f41", border: "#323232",
      fg: "#bbbbbb", muted: "#888888", accent: "#4a88c7", listActive: "#0d293e", hover: "#4b4f52",
      statusbar: "#3c3f41", statusFg: "#bbbbbb", selection: "#214283", cursor: "#bbbbbb", gutter: "#606366",
      gutterActive: "#a4a3a3", lineHighlight: "#323232", input: "#45494a", modified: "#6897bb", error: "#bc3f3c",
      panel: "#2b2b2b", widget: "#45494a",
    },
    syntax: {
      plain: "#a9b7c6", comment: "#808080", string: "#6a8759", keyword: "#cc7832", control: "#cc7832",
      type: "#a9b7c6", func: "#ffc66d", number: "#6897bb", variable: "#a9b7c6", tag: "#e8bf6a",
      attr: "#bababa", bracket: "#a9b7c6", meta: "#bbb529",
    },
    terminal: { ...DARK_TERM, fg: "#bbbbbb", red: "#ff6b68", green: "#a8c023", yellow: "#d6bf55", blue: "#5394ec", magenta: "#ae8abe", cyan: "#299999", dim: "#888888" },
  },
  {
    id: "intellij-light",
    label: "IntelliJ Light",
    kind: "light",
    ui: {
      editor: "#ffffff", sidebar: "#f7f8fa", titlebar: "#f7f8fa", activity: "#f7f8fa", border: "#ebecf0",
      fg: "#1e1f22", muted: "#6c707e", accent: "#3574f0", listActive: "#d4e2ff", hover: "#dfe1e5",
      statusbar: "#f7f8fa", statusFg: "#6c707e", selection: "#a6d2ff", cursor: "#000000", gutter: "#aeb3c2",
      gutterActive: "#767a8a", lineHighlight: "#f5f8fe", input: "#ffffff", modified: "#0a7aff", error: "#e55765",
      panel: "#f7f8fa", widget: "#ebecf0",
    },
    syntax: {
      plain: "#080808", comment: "#8c8c8c", string: "#067d17", keyword: "#0033b3", control: "#0033b3",
      type: "#000000", func: "#00627a", number: "#1750eb", variable: "#080808", tag: "#0033b3",
      attr: "#174ad4", bracket: "#080808", meta: "#9e880d",
    },
    terminal: LIGHT_TERM,
  },
  {
    id: "xcode-dark",
    label: "Xcode Default (Dark)",
    kind: "dark",
    ui: {
      editor: "#1f1f24", sidebar: "#262628", titlebar: "#2c2c2e", activity: "#262628", border: "#3a3a3c",
      fg: "#dfdfe0", muted: "#98989d", accent: "#0a84ff", listActive: "#2f4d84", hover: "#323236",
      statusbar: "#262628", statusFg: "#98989d", selection: "#515b70", cursor: "#ffffff", gutter: "#747478",
      gutterActive: "#dfdfe0", lineHighlight: "#23252b", input: "#1c1c1e", modified: "#98989d", error: "#ff453a",
      panel: "#1f1f24", widget: "#3a3a3c",
    },
    syntax: {
      plain: "#dfdfe0", comment: "#7f8c98", string: "#fc6a5d", keyword: "#fc5fa3", control: "#fc5fa3",
      type: "#5dd8ff", func: "#67b7a4", number: "#d0bf69", variable: "#dfdfe0", tag: "#fc5fa3",
      attr: "#67b7a4", bracket: "#dfdfe0", meta: "#fd8f3f",
    },
    terminal: { ...DARK_TERM, fg: "#dfdfe0", dim: "#98989d" },
  },
  {
    id: "xcode-light",
    label: "Xcode Default (Light)",
    kind: "light",
    ui: {
      editor: "#ffffff", sidebar: "#f5f5f5", titlebar: "#ececec", activity: "#f5f5f5", border: "#d6d6d6",
      fg: "#262626", muted: "#808080", accent: "#007aff", listActive: "#d0e4ff", hover: "#e8e8e8",
      statusbar: "#f5f5f5", statusFg: "#808080", selection: "#a4cdff", cursor: "#000000", gutter: "#a6a6a6",
      gutterActive: "#262626", lineHighlight: "#e8f2ff", input: "#ffffff", modified: "#808080", error: "#e0352b",
      panel: "#ffffff", widget: "#ececec",
    },
    syntax: {
      plain: "#000000", comment: "#5d6c79", string: "#c41a16", keyword: "#9b2393", control: "#9b2393",
      type: "#0b4f79", func: "#326d74", number: "#1c00cf", variable: "#000000", tag: "#9b2393",
      attr: "#326d74", bracket: "#000000", meta: "#643820",
    },
    terminal: LIGHT_TERM,
  },
  {
    id: "vs-dark",
    label: "Visual Studio Dark",
    kind: "dark",
    ui: {
      editor: "#1e1e1e", sidebar: "#252526", titlebar: "#1f1f1f", activity: "#2d2d30", border: "#3f3f46",
      fg: "#f1f1f1", muted: "#999999", accent: "#3399ff", listActive: "#3f3f46", hover: "#3e3e40",
      statusbar: "#007acc", statusFg: "#ffffff", selection: "#264f78", cursor: "#dcdcdc", gutter: "#2b91af",
      gutterActive: "#2b91af", lineHighlight: "#262626", input: "#333337", modified: "#d7ba7d", error: "#fc3e36",
      panel: "#1e1e1e", widget: "#333337",
    },
    syntax: {
      plain: "#dcdcdc", comment: "#57a64a", string: "#d69d85", keyword: "#569cd6", control: "#d8a0df",
      type: "#4ec9b0", func: "#dcdcaa", number: "#b5cea8", variable: "#9cdcfe", tag: "#569cd6",
      attr: "#92caf4", bracket: "#dcdcdc", meta: "#9b9b9b",
    },
    terminal: DARK_TERM,
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<string, Theme>;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** Flattens a theme into CSS custom properties: --ui-*, --syn-*, --term-*. */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.ui)) vars[`--ui-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(theme.syntax)) vars[`--syn-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(theme.terminal)) vars[`--term-${kebab(k)}`] = v;
  vars["--ui-scroll"] = theme.kind === "light" ? "#c4c4c4" : "#4a4a4a";
  return vars;
}
