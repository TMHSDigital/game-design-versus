import { knowledge } from '../src/engine/data';
import { PERSONAS, runHybrid, runPersona } from '../src/engine/simulate';
import { ENGINE } from '../src/engine/config';

const verbose = process.argv.includes('--trace');
const k = knowledge();
let ok = true;
console.log('persona              questions  clarity  stop  top-3 archetypes                                   match  irrelevant');
for (const p of PERSONAS) {
  const t0 = Date.now();
  const r = runPersona(k, p);
  // Brief ready: stopped on its own (no length or budget reason), core settled, within 36 questions.
  const pass = r.stopRecommended && r.coreReady && r.stopReasons.length === 0 && r.questions <= 36 && r.irrelevantAsked.length === 0 && r.matchRank >= 1 && r.matchRank <= 3;
  ok &&= pass;
  console.log(
    `${p.id.padEnd(20)} ${String(r.questions).padStart(9)}  ${r.clarity.toFixed(3)}  ${r.stopRecommended ? 'yes ' : 'no  '}  ${r.topArchetypes.slice(0, 3).join(', ').padEnd(50)} ${String(r.matchRank).padStart(5)}  ${r.irrelevantAsked.length}  ${pass ? 'PASS' : 'FAIL'} (${Date.now() - t0} ms)`,
  );
  if (verbose) console.log('  ' + r.trace.map((t) => `${t.axis}=${t.choice}`).join(' | '));
}

// Hybrid users: two archetypes mixed, with blends, "not sure" and no-preference answers, 4 questions per round.
for (const mix of ['module', 'axis'] as const) {
  const rs = Array.from({ length: 20 }, (_, i) => runHybrid(k, { seed: i + 1, mix }));
  const qs = rs.map((r) => r.questions).sort((a, b) => a - b);
  const capped = rs.filter((r) => r.stopReasons.some((x) => x.startsWith(`reached ${ENGINE.maxQuestions}`))).length;
  const soft = rs.filter((r) => r.stopReasons.some((x) => x.includes('recommended length'))).length;
  const pass = capped === 0 && rs.every((r) => r.stopRecommended);
  ok &&= pass;
  console.log(`hybrids (${mix} mix, 20 users): questions median ${qs[10]}, max ${qs.at(-1)}; core ready ${rs.filter((r) => r.coreReady).length}/20; stopped at the recommended length ${soft}; hit the ${ENGINE.maxQuestions} cap ${capped}  ${pass ? 'PASS' : 'FAIL'}`);
}
if (!ok) process.exit(1);
