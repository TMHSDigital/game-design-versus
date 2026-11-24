import type { Knowledge, RawData } from './data';
import { BLEND_POLE, isBinary, type Axis, type Expr } from './ontology';

const FORBIDDEN = /[—\p{Extended_Pictographic}]/u;

/** Walks any JSON value and reports strings containing an em dash or emoji. */
export function findForbiddenChars(value: unknown, path: string): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      if (FORBIDDEN.test(v)) hits.push(`${p}: ${v.slice(0, 60)}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [key, x] of Object.entries(v)) walk(x, `${p}.${key}`);
    }
  };
  walk(value, path);
  return hits;
}

export function validateExpr(expr: Expr, axisById: Map<string, Axis>, where: string): string[] {
  const errs: string[] = [];
  const walk = (e: Expr) => {
    const keys = Object.keys(e).filter((k) => (e as Record<string, unknown>)[k] !== undefined);
    if (keys.length === 0) errs.push(`${where}: empty expression`);
    e.all?.forEach(walk);
    e.any?.forEach(walk);
    if (e.not) walk(e.not);
    if (e.axis !== undefined) {
      const a = axisById.get(e.axis);
      if (!a) {
        errs.push(`${where}: unknown axis ${e.axis}`);
        return;
      }
      if (e.in === undefined && e.lean === undefined) errs.push(`${where}: axis test on ${e.axis} needs in or lean`);
      if (e.lean !== undefined && !isBinary(a)) errs.push(`${where}: lean on non-bipolar axis ${e.axis}`);
      for (const p of e.in ?? []) if (!a.poles.some((x) => x.id === p)) errs.push(`${where}: ${e.axis} has no pole ${p}`);
    } else if (e.in !== undefined || e.lean !== undefined) {
      errs.push(`${where}: in or lean without axis`);
    }
  };
  walk(expr);
  return errs;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const id of ids) (seen.has(id) ? d : seen).add(id);
  return [...d];
}

export function validateKnowledge(k: Knowledge, raw: RawData): string[] {
  const errs: string[] = [];
  for (const d of dupes(k.axes.map((a) => a.id))) errs.push(`duplicate axis id ${d}`);
  for (const d of dupes(k.modules.map((m) => m.id))) errs.push(`duplicate module id ${d}`);
  for (const d of dupes(k.archetypes.map((a) => a.id))) errs.push(`duplicate archetype id ${d}`);
  for (const d of dupes(k.tensions.map((t) => t.id))) errs.push(`duplicate tension id ${d}`);
  for (const d of dupes(k.allComparisons.map((c) => c.id))) errs.push(`duplicate comparison id ${d}`);

  for (const m of k.modules) {
    if (m.appliesWhen) errs.push(...validateExpr(m.appliesWhen, k.axisById, `module ${m.id}`));
    for (const g of m.gates ?? []) {
      const a = k.axisById.get(g);
      if (!a || a.kind !== 'gate') errs.push(`module ${m.id}: gate ${g} is not a gate axis`);
    }
  }
  for (const a of k.axes) {
    if (!k.moduleById.has(a.module)) errs.push(`axis ${a.id}: unknown module ${a.module}`);
    for (const d of dupes(a.poles.map((p) => p.id))) errs.push(`axis ${a.id}: duplicate pole ${d}`);
    if (a.appliesWhen) errs.push(...validateExpr(a.appliesWhen, k.axisById, `axis ${a.id} appliesWhen`));
    for (const s of a.sets ?? []) errs.push(...validateExpr(s.when, k.axisById, `axis ${a.id} sets ${s.flag}`));
    if (a.kind === 'gate' && !(a.sets && a.sets.length > 0)) errs.push(`axis ${a.id}: gate axes must set a flag`);
    if (!a.questionTemplate.trim()) errs.push(`axis ${a.id}: empty template`);
  }
  for (const t of k.tensions) errs.push(...validateExpr(t.when, k.axisById, `tension ${t.id}`));
  for (const ar of k.archetypes) {
    for (const [axisId, v] of Object.entries(ar.profile)) {
      const a = k.axisById.get(axisId);
      if (!a) {
        errs.push(`archetype ${ar.id}: unknown axis ${axisId}`);
        continue;
      }
      if (typeof v === 'number' && !isBinary(a)) errs.push(`archetype ${ar.id}: numeric value on ${axisId}`);
      if (typeof v !== 'number') {
        if (isBinary(a)) errs.push(`archetype ${ar.id}: pole value on bipolar ${axisId}`);
        for (const p of Array.isArray(v) ? v : [v]) if (!a.poles.some((x) => x.id === p)) errs.push(`archetype ${ar.id}: ${axisId} has no pole ${p}`);
      }
    }
  }

  const validGenres = new Set(k.axisById.get('genre.family')?.poles.map((p) => p.id) ?? []);
  const validPlatforms = new Set(k.axisById.get('frame.platform')?.poles.map((p) => p.id) ?? []);
  for (const c of k.allComparisons) {
    const a = k.axisById.get(c.axis);
    const where = `comparison ${c.id}`;
    if (!a) {
      errs.push(`${where}: unknown axis ${c.axis}`);
      continue;
    }
    if (!c.id.startsWith(`cmp.${c.axis}.`)) errs.push(`${where}: id must start with cmp.${c.axis}.`);
    const file = k.fileOf.get(c.id);
    if (file && file !== a.module) errs.push(`${where}: belongs in comparisons/${a.module}.json, found in ${file}.json`);
    for (const o of c.options) {
      const ok = a.poles.some((p) => p.id === o.pole) || (isBinary(a) && o.pole === BLEND_POLE);
      if (!ok) errs.push(`${where}: option ${o.game} has unknown pole ${o.pole}`);
    }
    if (dupes(c.options.map((o) => o.game.toLowerCase())).length) errs.push(`${where}: a game appears twice`);
    if (isBinary(a)) {
      const [pa, pb] = a.poles;
      if (!c.options.some((o) => o.pole === pa?.id) || !c.options.some((o) => o.pole === pb?.id)) {
        errs.push(`${where}: a bipolar comparison needs one option on each pole`);
      }
    } else if (dupes(c.options.map((o) => o.pole)).length) {
      errs.push(`${where}: categorical options must cover distinct poles`);
    }
    if (c.sources.length < c.options.length) errs.push(`${where}: needs at least one source per option`);
    for (const g of c.tags.genres) if (!validGenres.has(g)) errs.push(`${where}: unknown genre tag ${g}`);
    for (const p of c.tags.platforms) if (!validPlatforms.has(p)) errs.push(`${where}: unknown platform tag ${p}`);
    if (c.verification.status === 'verified' && !/^\d{4}-\d{2}-\d{2}/.test(c.verification.checkedAt)) {
      errs.push(`${where}: checkedAt must be an ISO date`);
    }
  }
  void raw;
  return errs;
}
