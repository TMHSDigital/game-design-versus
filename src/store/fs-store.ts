import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Question, SessionEvent } from '../engine/session';

export const SCHEMA_VERSION = 1;

/** The persisted file. The event log is the source of truth; everything else is a cache or bookkeeping. */
export type SessionFile = {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  events: SessionEvent[];
  /** Questions handed out by versus_next or versus_ask and not yet answered. */
  pending: Record<string, Question>;
  /** How many questions have been issued (keeps question ids unique). */
  issued: number;
};

/** %USERPROFILE%\.game-design-versus by default, overridable with GDV_HOME. Never the plugin root or plugin data dir. */
export function gdvHome(): string {
  return process.env.GDV_HOME && process.env.GDV_HOME.trim() ? process.env.GDV_HOME : join(homedir(), '.game-design-versus');
}

export function sessionsDir(): string {
  return join(gdvHome(), 'sessions');
}

const ID_RE = /^[a-z0-9-]{4,64}$/;

export function newSessionId(): string {
  const t = Date.now().toString(36);
  return `gdv-${t}-${randomBytes(3).toString('hex')}`;
}

function pathFor(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`invalid session id: ${id}`);
  return join(sessionsDir(), `${id}.json`);
}

/** Migration hook: upgrade older files to SCHEMA_VERSION. */
export function migrate(raw: Record<string, unknown>): SessionFile {
  const v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error(`session schemaVersion ${v} is newer than this server supports (${SCHEMA_VERSION})`);
  const f = raw as unknown as SessionFile;
  if (v < 1) {
    f.pending ??= {};
    f.issued ??= 0;
    f.schemaVersion = 1;
  }
  return f;
}

export function loadSession(id: string): SessionFile {
  const p = pathFor(id);
  if (!existsSync(p)) throw new Error(`session not found: ${id}`);
  return migrate(JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>);
}

/** Atomic write: temp file in the same directory, then rename over the target. */
export function saveSession(f: SessionFile): void {
  mkdirSync(sessionsDir(), { recursive: true });
  const p = pathFor(f.id);
  f.updatedAt = new Date().toISOString();
  const tmp = `${p}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(f, null, 2) + '\n', 'utf8');
  try {
    renameSync(tmp, p);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function sessionExists(id: string): boolean {
  return ID_RE.test(id) && existsSync(pathFor(id));
}

export function listSessions(): SessionFile[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  const out: SessionFile[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(loadSession(name.replace(/\.json$/, '')));
    } catch (e) {
      console.error(`[gdv] skipping unreadable session ${name}: ${(e as Error).message}`);
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
