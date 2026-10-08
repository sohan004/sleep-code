"use client";

import { IdeLogo } from "@/components/IdeLogo";
import { requestFullscreen, StartLink } from "@/components/StartLink";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { CATALOG } from "@/lib/catalog";
import { IDE_BY_ID, IDES, recommendedIde } from "@/lib/ides";
import {
  DEFAULT_SPEED,
  editorHref,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  speedLabel,
} from "@/lib/sessionPrefs";
import { THEME_BY_ID, THEMES, themeVars } from "@/lib/themes";

export function StackPicker() {
  const router = useRouter();
  const [project, setProject] = useState("");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  // null = follow the stack's recommended IDE until the user picks one
  const [pickedIde, setPickedIde] = useState<string | null>(null);
  const [themeId, setThemeId] = useState("");
  const [categoryId, setCategoryId] = useState(CATALOG[0].id);
  const category = CATALOG.find((c) => c.id === categoryId)!;
  const [languageId, setLanguageId] = useState(category.languages[0].id);
  const language = category.languages.find((l) => l.id === languageId) ?? category.languages[0];
  const [frameworkId, setFrameworkId] = useState(language.frameworks[0].id);
  const framework = language.frameworks.find((f) => f.id === frameworkId) ?? language.frameworks[0];
  const recommended = recommendedIde(framework.id);
  const ideId = pickedIde ?? recommended;
  const ide = IDE_BY_ID[ideId];
  const effectiveTheme = THEME_BY_ID[themeId || ide.defaultTheme];
  const prefs = { project, speed, ide: ideId, theme: themeId };
  const href = (stack: string) => editorHref(stack, prefs);

  const pickCategory = (id: string) => {
    const next = CATALOG.find((c) => c.id === id)!;
    setCategoryId(id);
    setLanguageId(next.languages[0].id);
    setFrameworkId(next.languages[0].frameworks[0].id);
  };

  const pickLanguage = (id: string) => {
    const next = category.languages.find((l) => l.id === id)!;
    setLanguageId(id);
    setFrameworkId(next.frameworks[0].id);
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-8">
      <Step n={1} title="What do you build?" />
      <div role="radiogroup" aria-label="Category" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATALOG.map((c) => {
          const selected = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => radioKeys(e, CATALOG.map((x) => x.id), c.id, pickCategory)}
              onClick={() => pickCategory(c.id)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-500/15"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <div className="mb-2 text-2xl" aria-hidden>
                {c.icon}
              </div>
              <div className="font-semibold text-white">{c.label}</div>
              <div className="mt-0.5 text-xs text-zinc-400">{c.blurb}</div>
            </button>
          );
        })}
      </div>

      <Step n={2} title="Language" />
      <div role="radiogroup" aria-label="Language" className="mb-8 flex flex-wrap gap-2">
        {category.languages.map((l) => {
          const selected = l.id === language.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => radioKeys(e, category.languages.map((x) => x.id), l.id, pickLanguage)}
              onClick={() => pickLanguage(l.id)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <Step n={3} title="Framework" />
      <div role="radiogroup" aria-label="Framework" className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {language.frameworks.map((f) => {
          const selected = f.id === framework.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => radioKeys(e, language.frameworks.map((x) => x.id), f.id, setFrameworkId)}
              onClick={() => setFrameworkId(f.id)}
              onDoubleClick={() => {
                requestFullscreen();
                router.push(editorHref(f.id, { ...prefs, ide: pickedIde ?? recommendedIde(f.id) }));
              }}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                selected ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <span>
                <span className="block font-semibold text-white">{f.label}</span>
                <span className="block text-xs text-zinc-400">{f.tagline}</span>
              </span>
              <span
                aria-hidden
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                  selected ? "border-indigo-400 bg-indigo-400 shadow-[inset_0_0_0_2px_#18181b]" : "border-zinc-600"
                }`}
              />
            </button>
          );
        })}
      </div>

      <Step n={4} title="Session settings" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <label htmlFor="project-name" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Project name
          </label>
          <input
            id="project-name"
            type="text"
            value={project}
            onChange={(e) =>
              setProject(e.target.value.replace(/\s/g, "-").replace(/[^A-Za-z0-9._-]/g, "").replace(/^[.-]+/, ""))
            }
            placeholder="e.g. billing-api (optional)"
            maxLength={40}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-zinc-600 bg-zinc-950 px-3 py-2 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 hover:border-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Shown in the explorer, title bar and terminal. Leave empty for a realistic default.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-400">
            <label htmlFor="typing-speed">Typing speed</label>
            <span className="text-white">
              {speed.toFixed(2).replace(/0$/, "")}× · {speedLabel(speed)}
            </span>
          </div>
          <input
            id="typing-speed"
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-valuetext={`${speed} times, ${speedLabel(speed)}`}
            className="w-full accent-indigo-500"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>
      </div>

      <Step n={5} title="Editor & theme" />
      <div role="radiogroup" aria-label="Editor" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {IDES.map((i) => {
          const selected = i.id === ideId;
          return (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => radioKeys(e, IDES.map((x) => x.id), i.id, setPickedIde)}
              onClick={() => setPickedIde(i.id)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-2 pt-3 pb-2 text-center text-xs transition-colors ${
                selected ? "border-indigo-500 bg-indigo-500/10 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <IdeLogo ide={i} size={32} rounded={8} />
              <span className="leading-tight">{i.label}</span>
              {i.id === recommended && (
                <span className="absolute -top-2 rounded-full bg-emerald-600 px-1.5 text-[9px] font-semibold text-white">
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <label htmlFor="editor-theme" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Colour theme
          </label>
          <select
            id="editor-theme"
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">{ide.label} default ({THEME_BY_ID[ide.defaultTheme].label})</option>
            <optgroup label="Dark">
              {THEMES.filter((t) => t.kind === "dark").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Light">
              {THEMES.filter((t) => t.kind === "light").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="mt-1.5 text-[11px] text-zinc-500">Any theme works with any editor.</p>
        </div>
        <ThemePreview vars={themeVars(effectiveTheme) as CSSProperties} />
      </div>

      <div className="flex flex-col items-start justify-between gap-4 border-t border-zinc-800 pt-6 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-400">
          Ready: <span className="font-medium text-white">{framework.label}</span> · {ide.label} · {effectiveTheme.label}
        </p>
        <StartLink
          href={href(framework.id)}
          className="w-full rounded-xl bg-indigo-600 px-8 py-3.5 text-center font-semibold text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-500 sm:w-auto"
        >
          Start coding drama →
        </StartLink>
      </div>
    </div>
  );
}

/** Arrow-key navigation for a role="radio" group with a roving tab stop (WAI-ARIA radio group pattern). */
function radioKeys(e: KeyboardEvent<HTMLButtonElement>, ids: string[], current: string, select: (id: string) => void) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const next = ids[(ids.indexOf(current) + step + ids.length) % ids.length];
  select(next);
  const group = e.currentTarget.closest("[role=radiogroup]");
  requestAnimationFrame(() => group?.querySelector<HTMLElement>("[aria-checked=true]")?.focus());
}

function ThemePreview({ vars }: { vars: CSSProperties }) {
  const c = (v: string) => ({ color: `var(--syn-${v})` });
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border font-mono text-[12px] leading-5"
      style={{ ...vars, background: "var(--ui-editor)", borderColor: "var(--ui-border)" }}
    >
      <div className="flex h-6 items-center gap-1.5 px-3 text-[11px]" style={{ background: "var(--ui-sidebar)", color: "var(--ui-muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--ui-accent)" }} /> preview.ts
      </div>
      <div className="px-3 py-2 whitespace-pre">
        <div>
          <span style={c("control")}>import</span> <span style={c("plain")}>{"{ "}</span>
          <span style={c("variable")}>invoices</span>
          <span style={c("plain")}>{" }"}</span> <span style={c("control")}>from</span>{" "}
          <span style={c("string")}>&quot;./db&quot;</span>
        </div>
        <div style={c("comment")}>{"// total outstanding per customer"}</div>
        <div>
          <span style={c("keyword")}>const</span> <span style={c("variable")}>due</span>
          <span style={c("plain")}>: </span>
          <span style={c("type")}>Money</span> <span style={c("plain")}>= </span>
          <span style={c("func")}>sum</span>
          <span style={c("bracket")}>(</span>
          <span style={c("variable")}>rows</span>
          <span style={c("plain")}>, </span>
          <span style={c("number")}>0.1</span>
          <span style={c("bracket")}>)</span>
          <span style={c("plain")}>;</span>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">{n}</span>
      {title}
    </div>
  );
}
