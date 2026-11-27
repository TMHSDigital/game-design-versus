/// <reference lib="dom" />
// The demo's saved interview in localStorage. Storage can be missing or blocked (private windows, previews), so every
// access is wrapped and the demo works without it. Kept free of engine imports so app.ts stays small.
import type { DemoSnapshot } from '../src/web/demo';

const KEY = 'gdv-demo-session';

export type SavedDemo = DemoSnapshot & { questionCount: number; title?: string; pitch?: string };

export function loadSaved(): SavedDemo | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as SavedDemo;
    return Array.isArray(v?.events) && v.events[0]?.type === 'start' && typeof v.questionCount === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
}

export function saveDemo(v: SavedDemo): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Storage full or blocked: the interview still runs, it just will not survive a reload.
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
