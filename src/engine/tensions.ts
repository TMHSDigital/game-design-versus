import type { Knowledge } from './data';
import { evalExpr, type GateContext } from './gating';
import type { Tension } from './ontology';

/** Tension rules whose condition is definitely true (undetermined rules do not fire). */
export function evaluateTensions(k: Knowledge, ctx: GateContext): Tension[] {
  return k.tensions.filter((t) => evalExpr(t.when, ctx) === true);
}
