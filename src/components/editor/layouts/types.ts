import type { Ide } from "@/lib/ides";
import type { StackConfig, StackSnippet } from "@/lib/stacks/types";
import type { SessionState } from "../useCodingSession";

export interface LayoutProps {
  config: StackConfig;
  session: SessionState;
  snippet: StackSnippet;
  ide: Ide;
  cursorLine: number;
  cursorCol: number;
}
