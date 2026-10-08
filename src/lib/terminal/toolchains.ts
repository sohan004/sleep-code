// Terminal output kept close to each real tool's format so a passing glance at the panel looks right.

export type Seg = [text: string, color?: string];
export type TermLine = Seg[];

export interface CodeError {
  file: string;
  line: number;
  col: number;
  wrong: string;
  correct: string;
  lineText: string;
  /** Character directly before the identifier, e.g. "$" for PHP variables. */
  prefix: string;
}

export interface Toolchain {
  check: string;
  test: string | null;
  checkFail: (e: CodeError, ctx: Ctx) => TermLine[];
  checkPass: (ctx: Ctx) => TermLine[];
  testPass: (ctx: Ctx) => TermLine[];
}

export interface Ctx {
  project: string;
  files: string[];
  editedFile: string;
}

// Resolved from the active theme's terminal palette
export const T = {
  red: "var(--term-red)",
  green: "var(--term-green)",
  yellow: "var(--term-yellow)",
  blue: "var(--term-blue)",
  cyan: "var(--term-cyan)",
  magenta: "var(--term-magenta)",
  dim: "var(--term-dim)",
  white: "var(--term-white)",
};

const L = (...segs: (Seg | string)[]): TermLine => segs.map((s) => (typeof s === "string" ? [s] : s));
const BLANK: TermLine = [];
const rnd = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const secs = (min: number, max: number) => (min + Math.random() * (max - min)).toFixed(2);
const base = (f: string) => f.split("/").pop()!;
const stem = (f: string) => base(f).replace(/\.[^.]+$/, "");
const pascal = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase());

function codeFrame(e: CodeError, gutter = true): TermLine[] {
  const n = String(e.line);
  const pad = " ".repeat(n.length);
  const caretPad = " ".repeat(Math.max(0, e.col - 1));
  return gutter
    ? [
        L([`${pad} |`, T.blue]),
        L([`${n} |`, T.blue], ` ${e.lineText}`),
        L([`${pad} |`, T.blue], ` ${caretPad}`, ["^".repeat(e.wrong.length), T.red]),
      ]
    : [L([n, T.dim], ` ${e.lineText}`), L(" ".repeat(n.length + 1) + caretPad, ["~".repeat(e.wrong.length), T.red])];
}

// ---------- message per language (also used for the squiggle tooltip / Problems panel) ----------

export function problemMessage(e: CodeError): string {
  const ext = base(e.file).split(".").pop() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "vue":
    case "svelte":
      return `Cannot find name '${e.wrong}'. Did you mean '${e.correct}'? ts(2552)`;
    case "js":
    case "jsx":
    case "mjs":
      return `'${e.wrong}' is not defined. eslint(no-undef)`;
    case "py":
      return `"${e.wrong}" is not defined Pylance(reportUndefinedVariable)`;
    case "php":
      return e.prefix === "$" ? `Undefined variable '$${e.wrong}'. intelephense(P1008)` : `Undefined symbol '${e.wrong}'.`;
    case "rb":
      return `undefined local variable or method '${e.wrong}'`;
    case "java":
      return `${e.wrong} cannot be resolved to a variable Java(33554515)`;
    case "cs":
      return `The name '${e.wrong}' does not exist in the current context CS0103`;
    case "go":
      return `undefined: ${e.wrong} compiler(UndeclaredName)`;
    case "rs":
      return `cannot find value \`${e.wrong}\` in this scope rustc(E0425)`;
    case "dart":
      return `Undefined name '${e.wrong}'. dart(undefined_identifier)`;
    case "kt":
      return `Unresolved reference '${e.wrong}'.`;
    case "swift":
      return `Cannot find '${e.wrong}' in scope`;
    case "cpp":
    case "h":
    case "hpp":
      return `use of undeclared identifier '${e.wrong}' clang(undeclared_var_use)`;
    case "gd":
      return `Identifier "${e.wrong}" not declared in the current scope.`;
    case "luau":
      return `Unknown global '${e.wrong}' Luau(UnknownGlobal)`;
    case "lua":
      return `Undefined global \`${e.wrong}\`. Lua Diagnostics.(undefined-global)`;
    default:
      return `'${e.wrong}' is not defined`;
  }
}

// ---------- building blocks ----------

const silentPass = () => [] as TermLine[];

const tsc: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => [
    L([e.file, T.cyan], ":", [String(e.line), T.yellow], ":", [String(e.col), T.yellow], " - ", ["error", T.red], [" TS2552: ", T.dim], `Cannot find name '${e.wrong}'. Did you mean '${e.correct}'?`),
    BLANK,
    ...codeFrame(e, false),
    BLANK,
    BLANK,
    L(`Found 1 error in ${e.file}`, [`:${e.line}`, T.dim]),
    BLANK,
  ],
  checkPass: silentPass,
};

const eslint: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e, c) => [
    BLANK,
    L([`/Users/dev/code/${c.project}/${e.file}`, T.white]),
    L(`  ${e.line}:${e.col}  `, ["error", T.red], `  '${e.wrong}' is not defined  `, ["no-undef", T.dim]),
    BLANK,
    L(["✖ 1 problem (1 error, 0 warnings)", T.red]),
    BLANK,
  ],
  checkPass: silentPass,
};

const isJs = (f: string) => /\.(js|jsx|mjs|cjs)$/.test(f);

/** Prefer a test file that actually exists in the project tree. */
function testFiles(c: Ctx, fallbackExt: string): [string, string] {
  const real = c.files.filter((f) => /(\.|_)(test|spec)\.|(^|\/)tests?\/test_/.test(f));
  const ext = isJs(c.editedFile) ? "js" : fallbackExt;
  const own = `src/${stem(c.editedFile)}.test.${ext}`;
  return [real[0] ?? own, real[1] ?? `src/lib/utils.test.${ext}`];
}

function vitest(c: Ctx): TermLine[] {
  const files = rnd(3, 7);
  const tests = rnd(18, 64);
  const [t1, t2] = testFiles(c, "ts");
  return [
    BLANK,
    L([" RUN ", T.cyan], ` v3.${rnd(0, 2)}.${rnd(0, 9)} `, [`/Users/dev/code/${c.project}`, T.dim]),
    BLANK,
    L([" ✓ ", T.green], `${t1} `, [`(${rnd(4, 12)} tests) ${rnd(12, 90)}ms`, T.dim]),
    L([" ✓ ", T.green], `${t2} `, [`(${rnd(3, 9)} tests) ${rnd(4, 30)}ms`, T.dim]),
    BLANK,
    L([" Test Files ", T.dim], [` ${files} passed`, T.green], [` (${files})`, T.dim]),
    L(["      Tests ", T.dim], [` ${tests} passed`, T.green], [` (${tests})`, T.dim]),
    L(["   Start at ", T.dim], ` ${new Date().toTimeString().slice(0, 8)}`),
    L(["   Duration ", T.dim], ` ${secs(0.8, 3.2)}s`),
    BLANK,
  ];
}

function jest(c: Ctx): TermLine[] {
  const suites = rnd(3, 9);
  const tests = rnd(20, 80);
  const [t1, t2] = testFiles(c, "ts");
  return [
    L([" PASS ", T.green], ` ${t1}`, [` (${secs(1, 4)} s)`, T.dim]),
    L([" PASS ", T.green], ` ${t2}`),
    BLANK,
    L(["Test Suites: ", T.white], [`${suites} passed`, T.green], `, ${suites} total`),
    L(["Tests:       ", T.white], [`${tests} passed`, T.green], `, ${tests} total`),
    L(["Snapshots:   ", T.white], "0 total"),
    L(["Time:        ", T.white], `${secs(2, 7)} s`),
    L(["Ran all test suites.", T.dim]),
  ];
}

const ruff: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => [
    L([e.file, T.white], [":", T.cyan], `${e.line}`, [":", T.cyan], `${e.col}`, [":", T.cyan], " ", ["F821", T.red], ` Undefined name \`${e.wrong}\``),
    BLANK,
    L("Found 1 error."),
  ],
  checkPass: () => [L(["All checks passed!", T.green])],
};

function pytest(c: Ctx): TermLine[] {
  const n = rnd(24, 96);
  return [
    L(["============================= test session starts ==============================", T.white]),
    L(`platform darwin -- Python 3.12.${rnd(3, 8)}, pytest-8.${rnd(1, 3)}.${rnd(0, 4)}, pluggy-1.5.0`),
    L(`rootdir: /Users/dev/code/${c.project}`),
    L(`collected ${n} items`),
    BLANK,
    L(`${c.files.find((f) => /test_.*\.py$|_test\.py$/.test(f)) ?? `tests/test_${stem(c.editedFile)}.py`} `, [".".repeat(rnd(8, 16)), T.green], [" [ 38%]", T.green]),
    L("tests/test_api.py ", [".".repeat(rnd(12, 24)), T.green], [" [100%]", T.green]),
    BLANK,
    L([`============================== ${n} passed in ${secs(1, 6)}s ==============================`, T.green]),
  ];
}

const phpstan: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => {
    const bar = " ------ " + "-".repeat(Math.max(40, e.file.length + 2));
    return [
      L(` ${rnd(30, 80)}/${rnd(80, 120)} [`, ["▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓", T.green], "] 100%"),
      BLANK,
      L(bar),
      L("  Line   ", [e.file, T.white]),
      L(bar),
      L(`  ${String(e.line).padEnd(6)} `, e.prefix === "$" ? `Undefined variable: $${e.wrong}` : `Call to undefined function ${e.wrong}().`),
      L(bar),
      BLANK,
      L([" [ERROR] Found 1 error ", T.red]),
      BLANK,
    ];
  },
  checkPass: () => [L(` ${rnd(80, 120)}/${rnd(80, 120)} [`, ["▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓", T.green], "] 100%"), BLANK, L([" [OK] No errors ", T.green]), BLANK],
};

function phpunit(): TermLine[] {
  const n = rnd(30, 120);
  return [
    L(`PHPUnit 11.${rnd(2, 5)}.${rnd(0, 9)} by Sebastian Bergmann and contributors.`),
    BLANK,
    L(`Runtime:       PHP 8.3.${rnd(4, 14)}`),
    BLANK,
    L([".".repeat(Math.min(n, 63)), T.green], `  ${Math.min(n, 63)} / ${n} (${Math.round((Math.min(n, 63) / n) * 100)}%)`),
    ...(n > 63 ? [L([".".repeat(n - 63), T.green], " ".repeat(65 - (n - 63)), `${n} / ${n} (100%)`)] : []),
    BLANK,
    L(`Time: 00:0${rnd(1, 9)}.${rnd(100, 999)}, Memory: ${rnd(28, 64)}.00 MB`),
    BLANK,
    L([` OK (${n} tests, ${n * rnd(2, 4)} assertions) `, T.green]),
  ];
}

function artisanTest(c: Ctx): TermLine[] {
  const n = rnd(30, 90);
  return [
    BLANK,
    L(["   PASS  ", T.green], `Tests\\Feature\\${pascal(stem(c.editedFile))}Test`),
    L(["  ✓ ", T.green], "it creates a record with valid data", [` ${secs(0.05, 0.3)}s`, T.dim]),
    L(["  ✓ ", T.green], "it rejects unauthorised users", [` ${secs(0.02, 0.1)}s`, T.dim]),
    L(["  ✓ ", T.green], "it validates the payload", [` ${secs(0.02, 0.1)}s`, T.dim]),
    BLANK,
    L(["  Tests:    ", T.dim], [`${n} passed`, T.green], ` (${n * 3} assertions)`),
    L(["  Duration: ", T.dim], `${secs(1, 5)}s`),
    BLANK,
  ];
}

function rubyFail(e: CodeError, runner: "rails" | "rspec"): TermLine[] {
  const cls = pascal(stem(e.file));
  const msg = `NameError: undefined local variable or method '${e.wrong}' for an instance of ${cls}`;
  return runner === "rails"
    ? [
        L(`Running ${rnd(40, 120)} tests in parallel using ${rnd(4, 10)} processes`),
        L(`Run options: --seed ${rnd(1000, 65000)}`),
        BLANK,
        L("# Running:"),
        BLANK,
        L([".".repeat(rnd(10, 30)), T.green], ["E", T.red]),
        BLANK,
        L(["Error:", T.red]),
        L(`${cls}Test#test_happy_path:`),
        L(msg),
        L(`    ${e.file}:${e.line}:in 'call'`),
        BLANK,
        L(["bin/rails test ", T.dim], `test/${e.file.replace(/^app\//, "").replace(/\.rb$/, "_test.rb")}:${rnd(8, 30)}`),
        BLANK,
        L(["1 runs, 0 assertions, 0 failures, 1 errors, 0 skips", T.red]),
      ]
    : [
        L([".".repeat(rnd(10, 30)), T.green], ["F", T.red]),
        BLANK,
        L("Failures:"),
        BLANK,
        L(`  1) ${cls} handles the request`),
        L(["     Failure/Error: ", T.red], e.lineText.trim()),
        BLANK,
        L(["     " + msg, T.red]),
        L([`     # ./${e.file}:${e.line}:in 'block in <class:${cls}>'`, T.cyan]),
        BLANK,
        L(["1 example, 1 failure", T.red]),
      ];
}

function rubyPass(runner: "rails" | "rspec"): TermLine[] {
  const n = rnd(40, 140);
  return runner === "rails"
    ? [
        L(`Running ${n} tests in parallel using ${rnd(4, 10)} processes`),
        L(`Run options: --seed ${rnd(1000, 65000)}`),
        BLANK,
        L("# Running:"),
        BLANK,
        L([".".repeat(Math.min(n, 70)), T.green]),
        BLANK,
        L(`Finished in ${secs(1, 6)}s, ${rnd(20, 80)}.${rnd(1000, 9999)} runs/s.`),
        L([`${n} runs, ${n * rnd(2, 4)} assertions, 0 failures, 0 errors, 0 skips`, T.green]),
      ]
    : [L([".".repeat(Math.min(n, 70)), T.green]), BLANK, L(`Finished in ${secs(0.5, 3)} seconds (files took ${secs(0.3, 1.2)} seconds to load)`), L([`${n} examples, 0 failures`, T.green])];
}

const maven = (pkgPath: (f: string) => string): Pick<Toolchain, "checkFail" | "checkPass"> => ({
  checkFail: (e, c) => [
    L(["[INFO] ", T.blue], "Scanning for projects..."),
    L(["[INFO] ", T.blue], ["--------------------< ", T.dim], `${javaPackage(e.file).split(".").slice(0, 2).join(".")}:${c.project}`, [" >--------------------", T.dim]),
    L(["[INFO] ", T.blue], "--- compiler:3.13.0:compile (default-compile) @ ", [c.project, T.cyan], " ---"),
    L(["[ERROR] ", T.red], "COMPILATION ERROR : "),
    L(["[ERROR] ", T.red], `/Users/dev/code/${c.project}/${pkgPath(e.file)}:[${e.line},${e.col}] cannot find symbol`),
    L(`  symbol:   variable ${e.wrong}`),
    L(`  location: class ${stem(e.file)}`),
    L(["[INFO] ", T.blue], "------------------------------------------------------------------------"),
    L(["[INFO] ", T.blue], ["BUILD FAILURE", T.red]),
    L(["[INFO] ", T.blue], "------------------------------------------------------------------------"),
    L(["[INFO] ", T.blue], `Total time:  ${secs(2, 6)} s`),
  ],
  checkPass: (c) => [
    L(["[INFO] ", T.blue], "Scanning for projects..."),
    L(["[INFO] ", T.blue], "--- compiler:3.13.0:compile (default-compile) @ ", [c.project, T.cyan], " ---"),
    L(["[INFO] ", T.blue], `Recompiling the module because of changed source code.`),
    L(["[INFO] ", T.blue], `Compiling ${rnd(20, 70)} source files with javac [debug release 21] to target/classes`),
    L(["[INFO] ", T.blue], "------------------------------------------------------------------------"),
    L(["[INFO] ", T.blue], ["BUILD SUCCESS", T.green]),
    L(["[INFO] ", T.blue], "------------------------------------------------------------------------"),
    L(["[INFO] ", T.blue], `Total time:  ${secs(2, 6)} s`),
  ],
});

function javaPackage(file: string): string {
  const m = file.match(/(?:src\/main\/java\/|^)((?:[a-z0-9_]+\/)+)[^/]+\.java$/);
  return m ? m[1].replace(/\/$/, "").replace(/\//g, ".").replace(/^src\.main\.java\./, "") : "com.example";
}

function mavenTest(c: Ctx): TermLine[] {
  const n = rnd(20, 90);
  return [
    L(["[INFO] ", T.blue], "-------------------------------------------------------"),
    L(["[INFO] ", T.blue], " T E S T S"),
    L(["[INFO] ", T.blue], "-------------------------------------------------------"),
    L(["[INFO] ", T.blue], `Running ${javaPackage(c.editedFile)}.${stem(c.editedFile)}Test`),
    L(["[INFO] ", T.blue], [`Tests run: ${rnd(4, 12)}, Failures: 0, Errors: 0, Skipped: 0`, T.green], `, Time elapsed: ${secs(0.2, 2)} s`),
    L(["[INFO] ", T.blue], "Results:"),
    L(["[INFO] ", T.blue], [`Tests run: ${n}, Failures: 0, Errors: 0, Skipped: 0`, T.green]),
    L(["[INFO] ", T.blue], ["BUILD SUCCESS", T.green]),
  ];
}

const dotnet: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e, c) => [
    L("  Determining projects to restore..."),
    L("  All projects are up-to-date for restore."),
    L([`/Users/dev/code/${c.project}/${e.file}(${e.line},${e.col}): `, T.white], ["error", T.red], ` CS0103: The name '${e.wrong}' does not exist in the current context [/Users/dev/code/${c.project}/${pascal(c.project)}.csproj]`),
    BLANK,
    L(["Build FAILED.", T.red]),
    BLANK,
    L("    0 Warning(s)"),
    L(["    1 Error(s)", T.red]),
    BLANK,
    L(`Time Elapsed 00:00:0${rnd(2, 9)}.${rnd(10, 99)}`),
  ],
  checkPass: (c) => [
    L("  Determining projects to restore..."),
    L("  All projects are up-to-date for restore."),
    L(`  ${pascal(c.project)} -> /Users/dev/code/${c.project}/bin/Debug/net9.0/${pascal(c.project)}.dll`),
    BLANK,
    L(["Build succeeded.", T.green]),
    L("    0 Warning(s)"),
    L("    0 Error(s)"),
    BLANK,
    L(`Time Elapsed 00:00:0${rnd(2, 9)}.${rnd(10, 99)}`),
  ],
};

function dotnetTest(c: Ctx): TermLine[] {
  const n = rnd(20, 80);
  return [
    L(`  ${pascal(c.project)}.Tests -> /Users/dev/code/${c.project}/tests/bin/Debug/net9.0/${pascal(c.project)}.Tests.dll`),
    L("Test run for ", [`${pascal(c.project)}.Tests.dll`, T.white], " (.NETCoreApp,Version=v9.0)"),
    L("A total of 1 test files matched the specified pattern."),
    BLANK,
    L(["Passed!", T.green], `  - Failed:     0, Passed:    ${n}, Skipped:     0, Total:    ${n}, Duration: ${rnd(200, 2000)} ms`),
  ];
}

const goVet = (c: Ctx): Pick<Toolchain, "checkFail" | "checkPass"> => ({
  checkFail: (e) => [
    L(`# example.com/${c.project}/${e.file.split("/").slice(0, -1).join("/")}`),
    L(`./${e.file}:${e.line}:${e.col}: undefined: ${e.wrong}`),
  ],
  checkPass: silentPass,
});

function goTest(c: Ctx): TermLine[] {
  const pkgs = [...new Set(c.files.filter((f) => f.endsWith(".go")).map((f) => f.split("/").slice(0, -1).join("/")))];
  return pkgs.map((p) =>
    p && Math.random() > 0.25
      ? L(["ok  ", T.green], `\texample.com/${c.project}/${p}\t${secs(0.1, 1.6)}s`)
      : L(["?   ", T.dim], `\texample.com/${c.project}/${p || "cmd"}\t[no test files]`)
  );
}

const cargo: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e, c) => [
    L(["    Checking ", T.green], `${c.project} v0.1.0 (/Users/dev/code/${c.project})`),
    L(["error[E0425]", T.red], [`: cannot find value \`${e.wrong}\` in this scope`, T.white]),
    L(["  --> ", T.blue], `${e.file}:${e.line}:${e.col}`),
    ...codeFrame(e),
    L(["   = ", T.blue], [`help: a local variable with a similar name exists: \`${e.correct}\``, T.white]),
    BLANK,
    L(["error", T.red], `: could not compile \`${c.project}\` (bin "${c.project}") due to 1 previous error`),
  ],
  checkPass: (c) => [
    L(["    Checking ", T.green], `${c.project} v0.1.0 (/Users/dev/code/${c.project})`),
    L(["    Finished ", T.green], `\`dev\` profile [unoptimized + debuginfo] target(s) in ${secs(1, 9)}s`),
  ],
};

function cargoTest(c: Ctx): TermLine[] {
  const n = rnd(12, 48);
  return [
    L(["   Compiling ", T.green], `${c.project} v0.1.0 (/Users/dev/code/${c.project})`),
    L(["    Finished ", T.green], `\`test\` profile [unoptimized + debuginfo] target(s) in ${secs(4, 20)}s`),
    L(["     Running ", T.green], `unittests src/main.rs (target/debug/deps/${c.project.replace(/-/g, "_")}-${Math.random().toString(16).slice(2, 18)})`),
    BLANK,
    L(`running ${n} tests`),
    L(`test handlers::tests::rejects_invalid_payload ... `, ["ok", T.green]),
    L(`test handlers::tests::returns_not_found ... `, ["ok", T.green]),
    BLANK,
    L("test result: ", ["ok", T.green], `. ${n} passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in ${secs(0.1, 2)}s`),
  ];
}

const flutterAnalyze: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e, c) => [
    L(`Analyzing ${c.project}...`),
    BLANK,
    L(["  error", T.red], ` • Undefined name '${e.wrong}' • ${e.file}:${e.line}:${e.col} • undefined_identifier`),
    BLANK,
    L(`1 issue found. (ran in ${secs(1.5, 4)}s)`),
  ],
  checkPass: (c) => [L(`Analyzing ${c.project}...`), L(`No issues found! (ran in ${secs(1.5, 4)}s)`)],
};

function flutterTest(): TermLine[] {
  const n = rnd(20, 70);
  return [L(`00:0${rnd(3, 9)} `, ["+" + n, T.green], ": All tests passed!")];
}

const gradle = (task: string): Pick<Toolchain, "checkFail" | "checkPass"> => ({
  checkFail: (e, c) => [
    L(["> Task :app:" + task, T.white], [" FAILED", T.red]),
    L(["e: ", T.red], `file:///Users/dev/code/${c.project}/${e.file}:${e.line}:${e.col} Unresolved reference '${e.wrong}'.`),
    BLANK,
    L(["FAILURE: Build failed with an exception.", T.red]),
    BLANK,
    L("* What went wrong:"),
    L(`Execution failed for task ':app:${task}'.`),
    L("> A failure occurred while executing org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction"),
    BLANK,
    L(["BUILD FAILED", T.red], ` in ${rnd(4, 20)}s`),
  ],
  checkPass: () => [L(["BUILD SUCCESSFUL", T.green], ` in ${rnd(4, 20)}s`), L(`${rnd(20, 40)} actionable tasks: ${rnd(2, 6)} executed, ${rnd(14, 34)} up-to-date`)],
});

function gradleTest(): TermLine[] {
  return [
    L(["> Task :app:testDebugUnitTest", T.white]),
    BLANK,
    L(["BUILD SUCCESSFUL", T.green], ` in ${rnd(10, 40)}s`),
    L(`${rnd(30, 60)} actionable tasks: ${rnd(4, 9)} executed, ${rnd(20, 50)} up-to-date`),
  ];
}

const xcode: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e, c) => [
    L(["▸ ", T.dim], "Compiling ", [base(e.file), T.white]),
    L(["❌ ", T.red], `/Users/dev/code/${c.project}/${e.file}:${e.line}:${e.col}: `, [`cannot find '${e.wrong}' in scope`, T.red]),
    L(e.lineText),
    L(" ".repeat(Math.max(0, e.col - 1)), ["^".repeat(e.wrong.length), T.green]),
    BLANK,
    L(["** BUILD FAILED **", T.red]),
  ],
  checkPass: (c) => [
    L(["▸ ", T.dim], "Compiling ", [base(c.editedFile), T.white]),
    L(["▸ ", T.dim], "Linking ", [pascal(c.project), T.white]),
    L(["▸ ", T.dim], "Signing ", [`${pascal(c.project)}.app`, T.white]),
    L(["▸ Build Succeeded", T.green]),
  ],
};

function xcodeTest(c: Ctx): TermLine[] {
  const n = rnd(18, 60);
  return [
    L(["Test Suite ", T.dim], `${pascal(c.project)}Tests.xctest started`),
    L(["    ✔ ", T.green], `test${pascal(stem(c.editedFile))}LoadsInitialState`, [` (${secs(0.01, 0.4)} seconds)`, T.dim]),
    L(["    ✔ ", T.green], "testRetryAfterNetworkFailure", [` (${secs(0.01, 0.4)} seconds)`, T.dim]),
    BLANK,
    L([`Executed ${n} tests, with 0 failures (0 unexpected) in ${secs(1, 6)} (${secs(1, 6)}) seconds`, T.green]),
  ];
}

const clangBuild = (target: (c: Ctx) => string): Pick<Toolchain, "checkFail" | "checkPass"> => ({
  checkFail: (e, c) => [
    L(`Building ${target(c)}...`),
    L(`[1/${rnd(3, 6)}] Compile [Apple] ${base(e.file).replace(/\.h$/, ".cpp")}`),
    L([`/Users/dev/code/${c.project}/${e.file}:${e.line}:${e.col}: `, T.white], ["error: ", T.red], [`use of undeclared identifier '${e.wrong}'`, T.white]),
    L(`  ${e.lineText.trim()}`),
    L(["1 error generated.", T.white]),
    L(["Result: Failed (OtherCompilationError)", T.red]),
    L(`Total execution time: ${secs(8, 40)} seconds`),
  ],
  checkPass: (c) => [
    L(`Building ${target(c)}...`),
    L(`[1/${rnd(3, 6)}] Compile [Apple] ${base(c.editedFile).replace(/\.h$/, ".cpp")}`),
    L(`[2/3] Link [Apple] lib${target(c)}.dylib`),
    L("[3/3] WriteMetadata " + target(c) + ".target"),
    L(["Result: Succeeded", T.green]),
    L(`Total execution time: ${secs(8, 40)} seconds`),
  ],
});

const godotCheck: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => [
    L(["SCRIPT ERROR: ", T.red], `Parse Error: Identifier "${e.wrong}" not declared in the current scope.`),
    L(["          at: ", T.dim], `GDScript::reload (res://${e.file}:${e.line})`),
    L(["ERROR: ", T.red], `Failed to load script "res://${e.file}" with error "Parse error".`),
  ],
  checkPass: () => [L("Godot Engine v4.4.stable.official.4c311cbee - https://godotengine.org"), BLANK],
};

function gutTest(): TermLine[] {
  const n = rnd(14, 50);
  return [
    L("---  Gut  ---"),
    L(`Tests             ${n}`),
    L([`Passing Tests     ${n}`, T.green]),
    L(`Asserts           ${n * rnd(2, 3)}`),
    L(`Time              ${secs(0.3, 2)}s`),
    BLANK,
    L(["---- All tests passed! ----", T.green]),
  ];
}

const luacheck: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => [
    L(`Checking ${e.file}`.padEnd(40), ["1 warning", T.yellow]),
    BLANK,
    L(`    ${e.file}:${e.line}:${e.col}: accessing undefined variable `, [`${e.wrong}`, T.white]),
    BLANK,
    L(["Total: ", T.white], ["1", T.yellow], " warning / 0 errors in ", `${rnd(5, 9)} files`),
  ],
  checkPass: () => [L(["Total: ", T.white], ["0", T.green], " warnings / ", ["0", T.green], ` errors in ${rnd(5, 9)} files`)],
};

const selene: Pick<Toolchain, "checkFail" | "checkPass"> = {
  checkFail: (e) => [
    L(["error[undefined_variable]", T.red], [`: \`${e.wrong}\` is not defined`, T.white]),
    L(["   ┌─ ", T.blue], `${e.file}:${e.line}:${e.col}`),
    ...codeFrame(e),
    BLANK,
    L("Results:"),
    L(["1 errors", T.red]),
    L("0 warnings"),
    L("0 parse errors"),
  ],
  checkPass: () => [L("Results:"), L("0 errors"), L("0 warnings"), L("0 parse errors")],
};

// ---------- per-stack wiring ----------

const tsStack = (check: string, test: string, runner: "vitest" | "jest"): Toolchain => ({
  check,
  test,
  checkFail: (e, c) => (/\.(js|jsx|mjs)$/.test(e.file) ? eslint : tsc).checkFail(e, c),
  checkPass: silentPass,
  testPass: runner === "vitest" ? vitest : jest,
});

const py = (test: string): Toolchain => ({ check: "ruff check .", test, ...ruff, testPass: pytest });
const php = (test: string, artisan = false): Toolchain => ({
  check: "vendor/bin/phpstan analyse --memory-limit=1G",
  test,
  ...phpstan,
  testPass: artisan ? artisanTest : phpunit,
});
const javaPath = (f: string) => (f.startsWith("src/") ? f : `src/main/java/${f}`);

function make(id: string, ctx: Ctx): Toolchain {
  const proj = pascal(ctx.project);
  switch (id) {
    case "nodejs":
    case "express":
    case "fastify":
    case "socketio":
      return tsStack("npx tsc --noEmit", "npm test", "vitest");
    case "nestjs":
      return tsStack("npx tsc --noEmit -p tsconfig.build.json", "npm run test -- --silent", "jest");
    case "react":
    case "svelte":
    case "phaser":
    case "threejs":
    case "babylonjs":
      return tsStack("npx tsc --noEmit", "npx vitest run", "vitest");
    case "vue":
      return tsStack("npx vue-tsc --noEmit", "npx vitest run", "vitest");
    case "sveltekit":
      return tsStack("npx svelte-check --threshold error", "npx vitest run", "vitest");
    case "angular":
      return tsStack("npx tsc --noEmit -p tsconfig.app.json", "npx ng test --watch=false", "jest");
    case "nextjs":
      return tsStack("npx tsc --noEmit", "npm run test -- --run", "vitest");
    case "nuxt":
      return tsStack("npx nuxi typecheck", "npx vitest run", "vitest");
    case "remix":
      return tsStack("npm run typecheck", "npx vitest run", "vitest");
    case "react-native":
    case "expo":
      return tsStack("npx tsc --noEmit", "npx jest --silent", "jest");
    case "ionic":
      return tsStack("npx tsc --noEmit -p tsconfig.app.json", "npx ng test --watch=false", "jest");
    case "html-css":
      return {
        check: 'npx prettier --check "**/*.{html,css}"',
        test: null,
        checkFail: () => [],
        checkPass: () => [L("Checking formatting..."), L("All matched files use Prettier code style!")],
        testPass: () => [],
      };
    case "django":
      return {
        ...py("python manage.py test --parallel"),
        testPass: () => {
          const n = rnd(40, 160);
          return [
            L(`Found ${n} test(s).`),
            L("Creating test database for alias 'default'..."),
            L(`Cloning test database for alias 'default'...`),
            L("System check identified no issues (0 silenced)."),
            L([".".repeat(Math.min(n, 70)), T.green]),
            L("----------------------------------------------------------------------"),
            L(`Ran ${n} tests in ${secs(2, 9)}s`),
            BLANK,
            L(["OK", T.green]),
            L("Destroying test database for alias 'default'..."),
          ];
        },
      };
    case "flask":
    case "fastapi":
    case "pyramid":
      return py("pytest -q");
    case "pygame":
    case "panda3d":
      return { ...py("pytest -q tests"), testPass: pytest };
    case "laravel":
      return php("php artisan test --parallel", true);
    case "symfony":
      return php("php bin/phpunit");
    case "codeigniter":
    case "cakephp":
      return php("vendor/bin/phpunit");
    case "rails":
      return { check: "bin/rails test", test: null, checkFail: (e) => rubyFail(e, "rails"), checkPass: () => rubyPass("rails"), testPass: () => [] };
    case "sinatra":
      return { check: "bundle exec rspec", test: null, checkFail: (e) => rubyFail(e, "rspec"), checkPass: () => rubyPass("rspec"), testPass: () => [] };
    case "spring-boot":
    case "quarkus":
      return { check: "./mvnw -q compile", test: "./mvnw test", ...maven(javaPath), testPass: mavenTest };
    case "hibernate":
      return { check: "mvn compile", test: "mvn test", ...maven(javaPath), testPass: mavenTest };
    case "aspnet-core":
    case "xamarin":
      return { check: "dotnet build", test: "dotnet test --no-build", ...dotnet, testPass: dotnetTest };
    case "maui":
      return { check: "dotnet build -f net9.0-android", test: "dotnet test tests --no-restore", ...dotnet, testPass: dotnetTest };
    case "unity":
      return { check: "dotnet build Assembly-CSharp.csproj -v q", test: null, ...dotnet, testPass: () => [] };
    case "gin":
    case "fiber":
    case "echo":
    case "gorilla-mux":
      return { check: "go vet ./...", test: "go test ./...", ...goVet(ctx), testPass: goTest };
    case "axum":
      return { check: "cargo check", test: "cargo test", ...cargo, testPass: cargoTest };
    case "flutter":
      return { check: "flutter analyze", test: "flutter test", ...flutterAnalyze, testPass: flutterTest };
    case "jetpack-compose":
      return { check: "./gradlew :app:compileDebugKotlin", test: "./gradlew testDebugUnitTest", ...gradle("compileDebugKotlin"), testPass: gradleTest };
    case "swiftui":
    case "uikit":
      return {
        check: `xcodebuild -scheme ${proj} -destination 'platform=iOS Simulator,name=iPhone 16' build | xcbeautify`,
        test: `xcodebuild -scheme ${proj} -destination 'platform=iOS Simulator,name=iPhone 16' test | xcbeautify`,
        ...xcode,
        testPass: xcodeTest,
      };
    case "unreal": {
      const uproject = ctx.files.find((f) => f.endsWith(".uproject"));
      const name = uproject ? stem(uproject) : proj;
      return {
        check: `"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" ${name}Editor Mac Development -Project="$PWD/${name}.uproject"`,
        test: null,
        ...clangBuild(() => `${name}Editor`),
        testPass: () => [],
      };
    }
    case "cryengine":
      return { check: "cmake --build build --config Profile --target Game", test: null, ...clangBuild(() => "Game"), testPass: () => [] };
    case "godot":
      return { check: `godot --headless --check-only --script res://${ctx.editedFile}`, test: "godot --headless -s addons/gut/gut_cmdln.gd -gexit", ...godotCheck, testPass: gutTest };
    case "love2d":
      return { check: "luacheck src main.lua", test: "busted", ...luacheck, testPass: () => [L(["●".repeat(rnd(14, 40)), T.green]), L([`${rnd(14, 40)} successes`, T.green], " / 0 failures / 0 errors / 0 pending : ", `${secs(0.05, 0.6)} seconds`)] };
    case "roblox":
      return { check: "selene src", test: "rojo build -o build.rbxlx", ...selene, testPass: (c) => [L(`Building project '${c.project}'`), L(`Built project to build.rbxlx`)] };
    default:
      return tsStack("npx tsc --noEmit", "npm test", "vitest");
  }
}

export function getToolchain(stackId: string, ctx: Ctx): Toolchain {
  const tc = make(stackId, ctx);
  // Plain JavaScript projects lint rather than type-check
  if (isJs(ctx.editedFile) && tc.check.startsWith("npx tsc")) return { ...tc, check: "npx eslint ." };
  return tc;
}

export function commitMessage(file: string, insertions: number): { msg: string; stat: string } {
  const area = stem(file).replace(/[._](server|client|controller|service|handler|component)$/i, "").toLowerCase();
  const verbs = [
    `feat(${area}): handle empty and duplicate inputs`,
    `fix(${area}): guard against missing records`,
    `refactor(${area}): extract validation into helper`,
    `feat(${area}): add pagination support`,
    `fix(${area}): correct rounding in totals`,
    `chore(${area}): tighten types and error handling`,
    `feat(${area}): emit event after successful update`,
    `test(${area}): cover failure path`,
  ];
  const msg = verbs[rnd(0, verbs.length - 1)];
  return { msg, stat: ` 1 file changed, ${insertions} insertions(+), ${rnd(0, 3)} deletions(-)` };
}
