import { knowledge } from '../src/engine/data';
import { PERSONAS, runPersona } from '../src/engine/simulate';

const verbose = process.argv.includes('--trace');
const k = knowledge();
let ok = true;
console.log('persona              questions  clarity  stop  top-3 archetypes                                   match  irrelevant');
for (const p of PERSONAS) {
  const t0 = Date.now();
  const r = runPersona(k, p);
  const pass = r.reached && r.questions <= 45 && r.irrelevantAsked.length === 0 && r.matchRank >= 1 && r.matchRank <= 3;
  ok &&= pass;
  console.log(
    `${p.id.padEnd(20)} ${String(r.questions).padStart(9)}  ${r.clarity.toFixed(3)}  ${r.stopRecommended ? 'yes ' : 'no  '}  ${r.topArchetypes.slice(0, 3).join(', ').padEnd(50)} ${String(r.matchRank).padStart(5)}  ${r.irrelevantAsked.length}  ${pass ? 'PASS' : 'FAIL'} (${Date.now() - t0} ms)`,
  );
  if (verbose) console.log('  ' + r.trace.map((t) => `${t.axis}=${t.choice}`).join(' | '));
}
if (!ok) process.exit(1);
