"use client";

import { requestFullscreen, StartLink } from "@/components/StartLink";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATALOG } from "@/lib/catalog";

export function StackPicker() {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(CATALOG[0].id);
  const category = CATALOG.find((c) => c.id === categoryId)!;
  const [languageId, setLanguageId] = useState(category.languages[0].id);
  const language = category.languages.find((l) => l.id === languageId) ?? category.languages[0];
  const [frameworkId, setFrameworkId] = useState(language.frameworks[0].id);
  const framework = language.frameworks.find((f) => f.id === frameworkId) ?? language.frameworks[0];

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
      <div role="tablist" aria-label="Category" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATALOG.map((c) => {
          const selected = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={selected}
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
              onClick={() => setFrameworkId(f.id)}
              onDoubleClick={() => {
                requestFullscreen();
                router.push(`/editor?stack=${f.id}`);
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

      <div className="flex flex-col items-start justify-between gap-4 border-t border-zinc-800 pt-6 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-400">
          Ready: <span className="font-medium text-white">{framework.label}</span> · {language.label} · {category.label}
        </p>
        <StartLink
          href={`/editor?stack=${framework.id}`}
          className="w-full rounded-xl bg-indigo-600 px-8 py-3.5 text-center font-semibold text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-500 sm:w-auto"
        >
          Start coding drama →
        </StartLink>
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
