import type { Knowledge } from './data';
import { FLAGS, type Axis, type Expr, type Flag, type Lean } from './ontology';

export type Tri = boolean | undefined;
export type AxisStatus = 'open' | 'decided' | 'flexible' | 'na';
/** What gating needs to know about an axis: its status, its lean (binary axes) or selected poles. */
export type AxisView = { status: AxisStatus; lean?: Lean; poles?: string[] };
export type Flags = Partial<Record<Flag, boolean>>;
export type GateContext = { flags: Flags; axis: (id: string) => AxisView | undefined };

/** Kleene three-valued evaluation: undefined means "not known yet". */
export function evalExpr(e: Expr, ctx: GateContext): Tri {
  const parts: Tri[] = [];
  if (e.all) parts.push(and(e.all.map((x) => evalExpr(x, ctx))));
  if (e.any) parts.push(or(e.any.map((x) => evalExpr(x, ctx))));
  if (e.not) {
    const v = evalExpr(e.not, ctx);
    parts.push(v === undefined ? undefined : !v);
  }
  if (e.flag) parts.push(ctx.flags[e.flag]);
  if (e.axis) parts.push(axisTest(e, ctx));
  return and(parts);
}

function axisTest(e: Expr, ctx: GateContext): Tri {
  const v = ctx.axis(e.axis as string);
  if (!v || v.status === 'open') return undefined;
  if (v.status === 'na') return false;
  if (e.lean !== undefined) return v.lean === undefined ? undefined : v.lean === e.lean;
  if (e.in !== undefined) return v.poles === undefined ? undefined : v.poles.some((p) => e.in?.includes(p));
  return undefined;
}

function and(xs: Tri[]): Tri {
  if (xs.some((x) => x === false)) return false;
  if (xs.every((x) => x === true)) return true;
  return undefined;
}
function or(xs: Tri[]): Tri {
  if (xs.some((x) => x === true)) return true;
  if (xs.every((x) => x === false)) return false;
  return undefined;
}

export function exprAxes(e: Expr, out: Set<string> = new Set()): Set<string> {
  if (e.axis) out.add(e.axis);
  e.all?.forEach((x) => exprAxes(x, out));
  e.any?.forEach((x) => exprAxes(x, out));
  if (e.not) exprAxes(e.not, out);
  return out;
}

export function exprFlags(e: Expr, out: Set<Flag> = new Set()): Set<Flag> {
  if (e.flag) out.add(e.flag);
  e.all?.forEach((x) => exprFlags(x, out));
  e.any?.forEach((x) => exprFlags(x, out));
  if (e.not) exprFlags(e.not, out);
  return out;
}

/**
 * A flag is true if any rule that sets it is true, false when every rule is false, otherwise undefined.
 * A rule that references an axis marked "na" (not in my game) is false.
 */
export function computeFlags(k: Knowledge, axis: (id: string) => AxisView | undefined, overrides: Flags = {}): Flags {
  let flags: Flags = { ...overrides };
  for (let pass = 0; pass < 3; pass++) {
    const next: Flags = {};
    for (const f of FLAGS) {
      if (overrides[f] !== undefined) {
        next[f] = overrides[f];
        continue;
      }
      // A resolved gate axis is authoritative for the flag it sets: "no combat" wins over unknown genre rules.
      const gate = k.axes.find((a) => a.kind === 'gate' && a.sets?.some((s) => s.flag === f) && (axis(a.id)?.status ?? 'open') !== 'open');
      if (gate) {
        const rule = gate.sets?.find((s) => s.flag === f);
        next[f] = axis(gate.id)?.status === 'na' || !rule ? false : evalExpr(rule.when, { flags, axis });
        continue;
      }
      const results: Tri[] = [];
      for (const a of k.axes) {
        for (const s of a.sets ?? []) {
          if (s.flag !== f) continue;
          const refs = exprAxes(s.when);
          if ([...refs].some((id) => axis(id)?.status === 'na')) results.push(false);
          else results.push(evalExpr(s.when, { flags, axis }));
        }
      }
      if (results.length) next[f] = or(results);
    }
    flags = next;
  }
  return flags;
}

/** Module appliesWhen AND axis appliesWhen, three-valued. */
export function applicability(k: Knowledge, a: Axis, ctx: GateContext): Tri {
  const m = k.moduleById.get(a.module);
  const parts: Tri[] = [];
  if (m?.appliesWhen) parts.push(evalExpr(m.appliesWhen, ctx));
  if (a.appliesWhen) parts.push(evalExpr(a.appliesWhen, ctx));
  return and(parts);
}

/** Flags each axis sets, and how many axes each flag controls (for the gate bonus). */
export function gateIndex(k: Knowledge): { setsFlags: Map<string, Flag[]>; controlled: Map<Flag, number> } {
  const setsFlags = new Map<string, Flag[]>();
  const controlled = new Map<Flag, number>();
  for (const a of k.axes) setsFlags.set(a.id, [...new Set((a.sets ?? []).map((s) => s.flag))]);
  for (const a of k.axes) {
    const m = k.moduleById.get(a.module);
    const fs = new Set<Flag>();
    if (m?.appliesWhen) exprFlags(m.appliesWhen, fs);
    if (a.appliesWhen) exprFlags(a.appliesWhen, fs);
    for (const f of fs) controlled.set(f, (controlled.get(f) ?? 0) + 1);
  }
  return { setsFlags, controlled };
}
