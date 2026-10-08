import type { StackConfig } from "./stacks/types";

const pascal = (s: string) => s.replace(/(^|[-_ .])(\w)/g, (_, __, c: string) => c.toUpperCase());

/**
 * The product/scheme/solution name IDEs show (Xcode scheme, Visual Studio solution, .csproj, etc.).
 * A user-supplied project name always wins and is shown exactly as typed; otherwise use the app
 * target folder if the tree has one (e.g. "Wayfarer/"), else a PascalCase form of the repo name.
 */
export function appName(config: Pick<StackConfig, "project" | "files" | "customProject">): string {
  if (config.customProject) return config.project;
  // Only Apple projects name the scheme after a top-level target folder of Swift sources
  const target = config.files
    .filter((f) => f.endsWith(".swift"))
    .map((f) => f.split("/")[0])
    .find((d) => /^[A-Z]/.test(d) && !/Tests?$/.test(d) && !d.includes("."));
  return target ?? pascal(config.project);
}
