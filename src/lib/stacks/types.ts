// clike: JS/TS, Java, C#, Go, Rust, Kotlin, Swift, Dart, C++, PHP (// comments)
// hash: Python, Ruby, GDScript (# comments)
export type Syntax = "clike" | "hash" | "lua" | "markup" | "css";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Milliseconds from the start of the session; must increase message to message. */
  delay: number;
}

export interface StackSnippet {
  filename: string;
  syntax: Syntax;
  languageLabel: string;
  code: string;
}

export interface StackConfig {
  id: string;
  project: string;
  /** True when `project` came from the user; it must then be shown verbatim everywhere. */
  customProject?: boolean;
  branch: string;
  indent: string;
  files: string[];
  snippets: [StackSnippet, StackSnippet];
  chat: ChatMessage[];
}
