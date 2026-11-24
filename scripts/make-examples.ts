import { writeFileSync, mkdirSync } from 'node:fs';
import { knowledge } from '../src/engine/data';
import { PERSONAS, runPersona } from '../src/engine/simulate';
import { buildBrief, renderBriefMarkdown } from '../src/engine/brief';

// Regenerates examples/ from a deterministic persona run (physics brawler).
const k = knowledge();
const r = runPersona(k, PERSONAS[0]!, { seed: 7 });
const events = r.state.effective;
const first = events[0];
if (first?.type === 'start') {
  first.title = 'Steel and Momentum';
  first.pitch = 'A physics-driven medieval sword fighter where momentum, edge contact and armor decide every hit.';
}
const state = { ...r.state, title: 'Steel and Momentum', pitch: first?.type === 'start' ? first.pitch : undefined };
mkdirSync('examples', { recursive: true });
writeFileSync('examples/sample-session.json', JSON.stringify({ schemaVersion: 1, id: r.state.id, createdAt: r.state.createdAt, updatedAt: r.state.createdAt, events, pending: {}, issued: r.questions }, null, 2) + '\n');
writeFileSync('examples/GDD.sample.md', renderBriefMarkdown(buildBrief(k, state)));
console.log(`examples written: ${r.questions} questions, clarity ${r.clarity.toFixed(3)}`);
