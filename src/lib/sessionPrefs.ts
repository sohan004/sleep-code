import { DEFAULT_IDE, IDE_BY_ID } from "./ides";
import { THEME_BY_ID } from "./themes";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.25;
export const DEFAULT_SPEED = 1;

export function parseSpeed(raw: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return DEFAULT_SPEED;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}

export function speedLabel(speed: number): string {
  if (speed <= 0.75) return "Relaxed";
  if (speed < 1.25) return "Natural";
  if (speed < 1.75) return "Quick";
  return "Fast";
}

/** Folder-style name: letters, digits, dot, dash, underscore; spaces become dashes. */
export function sanitizeProject(raw: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.-]+/, "")
    .slice(0, 40);
}

export function parseIde(raw: string | null, fallback = DEFAULT_IDE): string {
  return raw && Object.hasOwn(IDE_BY_ID, raw) ? raw : fallback;
}

/** Returns a theme id, or "" meaning "use the IDE's default theme". */
export function parseTheme(raw: string | null): string {
  return raw && Object.hasOwn(THEME_BY_ID, raw) ? raw : "";
}

export interface EditorPrefs {
  project?: string;
  speed?: number;
  ide?: string;
  theme?: string;
}

export function editorHref(stack: string, prefs: EditorPrefs = {}): string {
  const params = new URLSearchParams({ stack });
  const name = sanitizeProject(prefs.project ?? "");
  if (name) params.set("project", name);
  if (prefs.speed !== undefined && prefs.speed !== DEFAULT_SPEED) params.set("speed", String(prefs.speed));
  if (prefs.ide) params.set("ide", prefs.ide);
  if (prefs.theme) params.set("theme", prefs.theme);
  return `/editor?${params}`;
}
