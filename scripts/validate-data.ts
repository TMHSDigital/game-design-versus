import { buildKnowledge, rawData } from '../src/engine/data';
import { findForbiddenChars, validateKnowledge } from '../src/engine/validate';

const raw = rawData();
let errors: string[] = [];
try {
  const k = buildKnowledge(raw, { allowUnverified: true });
  errors = validateKnowledge(k, raw);
  console.log(`axes ${k.axes.length}, modules ${k.modules.length}, archetypes ${k.archetypes.length}, tensions ${k.tensions.length}, comparisons ${k.allComparisons.length}`);
} catch (e) {
  errors.push(`schema: ${(e as Error).message}`);
}
errors.push(
  ...findForbiddenChars(raw.ontology, 'axes.json'),
  ...findForbiddenChars(raw.archetypes, 'archetypes.json'),
  ...findForbiddenChars(raw.tensions, 'tensions.json'),
  ...Object.entries(raw.comparisonFiles).flatMap(([f, v]) => findForbiddenChars(v, `comparisons/${f}.json`)),
);
if (errors.length) {
  console.log(`${errors.length} data errors:`);
  for (const e of errors.slice(0, 200)) console.log(`  ${e}`);
  process.exit(1);
}
console.log('data OK');
