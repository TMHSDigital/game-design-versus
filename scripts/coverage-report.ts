import { buildKnowledge, rawData } from '../src/engine/data';
import { coverageReport, formatCoverage } from '../src/engine/coverage';

const strict = !process.argv.includes('--no-fail');
const json = process.argv.includes('--json');
const r = coverageReport(buildKnowledge(rawData(), { allowUnverified: false }));
console.log(json ? JSON.stringify(r, null, 2) : formatCoverage(r));
if (strict && r.failures.length) process.exit(1);
