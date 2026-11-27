/// <reference lib="dom" />
// The playable interview. Loaded on demand by app.ts; bundles the real engine and the verified library.
import { VersusDemo, demoKnowledge, type DemoQuestion, type DemoAnswerResult } from '../src/web/demo';
import type { Choice } from '../src/engine/session';
import { renderMarkdown } from './markdown';
import { clearSaved, saveDemo, type SavedDemo } from './saved';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const REPO = 'https://github.com/TMHSDigital/game-design-versus';

/** Source links for a library comparison, plus a prefilled issue to report a wrong description. */
const sourcesHtml = (q: DemoQuestion): string => {
  if (!q.comparisonId) return '';
  const links = (q.sources ?? [])
    .filter((x) => /^https?:\/\//i.test(x.url))
    .map((x) => {
      // The site name keeps the line short; the note (often the option's own description) becomes the tooltip.
      let host = x.url;
      try {
        host = new URL(x.url).hostname.replace(/^www\./, '');
      } catch {
        // Keep the raw URL.
      }
      return `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"${x.note ? ` title="${esc(x.note)}"` : ''}>${esc(host)}</a>`;
    });
  const title = `Comparison ${q.comparisonId}: `;
  const body = `Comparison: \`${q.comparisonId}\`\nQuestion: ${q.prompt}\n\nWhat is wrong, and a source that shows it:\n`;
  const report = `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return `<p class="sources">${links.length ? `<span>Sources:</span>${links.join('')}` : ''}<a href="${esc(report)}" target="_blank" rel="noopener noreferrer">Report this comparison</a></p>`;
};

type Log = { kind: 'skip' | 'unlock' | 'tension'; text: string; probe?: string };

export function mountDemo(root: HTMLElement, opts: { title?: string; pitch?: string }, saved?: SavedDemo): void {
  const k = demoKnowledge();
  let demo = new VersusDemo(k, { title: opts.title || 'My game', pitch: opts.pitch || undefined });
  if (saved) {
    try {
      demo = VersusDemo.restore(k, saved);
      opts = { title: saved.title, pitch: saved.pitch };
    } catch {
      clearSaved();
    }
  }
  let current: DemoQuestion | undefined;
  let log: Log[] = [];

  // Saved after every answer and undo, so a reload can pick the interview up again.
  const persist = () => {
    const questionCount = demo.summary().questionCount;
    if (questionCount === 0) clearSaved();
    else saveDemo({ ...demo.snapshot(), questionCount, title: opts.title, pitch: opts.pitch });
  };

  const ask = () => {
    [current] = demo.next(1);
    render();
  };

  const record = (choice: Choice, selected?: string[], note?: string) => {
    if (!current) return;
    const r: DemoAnswerResult = demo.answer(current.questionId, choice, selected, note);
    const fresh: Log[] = [
      ...r.skippedModules.map((m) => ({ kind: 'skip' as const, text: `${m}: skipped` })),
      ...r.unlockedModules.map((m) => ({ kind: 'unlock' as const, text: `${m}: now in play` })),
      ...r.newTensions.map((t) => ({ kind: 'tension' as const, text: t.message, probe: t.probe })),
    ];
    const seen = new Set<string>();
    log = [...fresh, ...log].filter((l) => !seen.has(l.text) && seen.add(l.text)).slice(0, 6);
    persist();
    ask();
  };

  const finish = () => {
    const { markdown } = demo.brief();
    const s = demo.summary();
    root.innerHTML = `
      <div class="brief-view">
        <div class="brief-bar">
          <span>Brief after ${s.questionCount} questions, clarity ${s.clarity.toFixed(2)}</span>
          <span class="brief-actions">
            <button type="button" class="btn" data-act="copy">Copy Markdown</button>
            <button type="button" class="btn" data-act="download">Download .md</button>
            <button type="button" class="btn" data-act="session">Download session (.json)</button>
            <button type="button" class="btn" data-act="back">Keep answering</button>
            <button type="button" class="btn ghost" data-act="restart">Start over</button>
          </span>
        </div>
        <p class="small">To keep going with your coding agent, download the session and ask it to continue the file with <code>versus_import</code>.</p>
        <article class="md">${renderMarkdown(markdown)}</article>
      </div>`;
    root.querySelector('[data-act="copy"]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(markdown);
        b.textContent = 'Copied';
      } catch {
        b.textContent = 'Copy failed';
      }
    });
    const slug = (opts.title || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
    const download = (text: string, type: string, name: string) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    root.querySelector('[data-act="download"]')?.addEventListener('click', () => download(markdown, 'text/markdown', `${slug}-brief.md`));
    root.querySelector('[data-act="session"]')?.addEventListener('click', () => {
      download(JSON.stringify(demo.exportSession(), null, 2) + '\n', 'application/json', `${slug}-session.json`);
    });
    root.querySelector('[data-act="back"]')?.addEventListener('click', ask);
    root.querySelector('[data-act="restart"]')?.addEventListener('click', () => {
      demo = new VersusDemo(k, { title: opts.title || 'My game', pitch: opts.pitch || undefined });
      log = [];
      clearSaved();
      ask();
    });
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const optionCard = (q: DemoQuestion, i: number) => {
    const o = q.options[i]!;
    const tone = i === 0 ? 'a' : i === 1 ? 'b' : 'c';
    const head = o.game ? esc(o.game) : esc(o.label);
    const body = o.how && o.how !== o.label ? `<span class="how">${esc(o.how)}</span>` : '';
    const pole = `${esc(o.poleLabel)}${o.game && o.year ? `<span class="year">${o.year}</span>` : ''}`;
    return `<button type="button" class="side ${tone}" data-choice="${o.key}">
      ${o.game ? `<span class="pole">${pole}</span>` : ''}<span class="game">${head}</span>${body}</button>`;
  };

  const questionHtml = (q: DemoQuestion) => {
    if (q.multi) {
      const limit = q.kind === 'rank' ? q.keep ?? 3 : undefined;
      return `
        <fieldset class="multi" ${limit ? `data-limit="${limit}"` : ''}>
          <legend class="sr">${esc(q.prompt)}</legend>
          ${q.options.map((o) => `
            <label class="check"><input type="checkbox" value="${o.key}">
              <span><b>${esc(o.game ?? o.label)}</b>${o.how ? `<span class="how">${esc(o.how)}</span>` : ''}</span></label>`).join('')}
        </fieldset>
        <div class="extras">
          <button type="button" class="btn primary" data-multi="go">Continue</button>
          <button type="button" class="btn" data-multi="none">None of these</button>
          <button type="button" class="btn ghost" data-choice="skip">Skip</button>
        </div>`;
    }
    const split = q.options.length === 2;
    const bins = q.bins
      ? `<div class="mini-bins" role="img" aria-label="Current belief from ${esc(q.options[0]?.poleLabel)} to ${esc(q.options[1]?.poleLabel)}: ${q.bins.map((b) => b.toFixed(2)).join(', ')}">
          ${q.bins.map((b, i) => `<i class="${i < 2 ? 'a' : i > 2 ? 'b' : ''}" style="--h:${Math.max(b, 0.04)}"></i>`).join('')}
         </div>
         <p class="bins-cap"><span>${esc(q.options[0]?.poleLabel)}</span><span>current belief</span><span>${esc(q.options[1]?.poleLabel)}</span></p>`
      : '';
    const unsure = q.comparison
      ? `<button type="button" class="btn" data-choice="unsure">Don't know these games</button>`
      : '';
    const extras = q.binary
      ? `<button type="button" class="btn" data-choice="blend">Blend of both</button>
         <button type="button" class="btn" data-choice="na">Not in my game</button>`
      : `<button type="button" class="btn" data-choice="neither">None of these</button>`;
    return `
      <div class="${split ? 'versus' : 'versus three'}">
        ${q.options.map((_, i) => optionCard(q, i)).join('')}
        ${split ? '<span class="vs" aria-hidden="true">VS</span>' : ''}
      </div>
      ${sourcesHtml(q)}
      ${bins}
      <div class="extras">${extras}${unsure}
        <button type="button" class="btn" data-act="other" aria-expanded="false" aria-controls="gdv-other">Something else...</button>
        <button type="button" class="btn ghost" data-choice="no_pref">No preference</button>
        <button type="button" class="btn ghost" data-choice="skip">Skip</button>
      </div>
      <form class="other" id="gdv-other" hidden>
        <label for="gdv-other-text">In your own words</label>
        <input id="gdv-other-text" maxlength="300" autocomplete="off" required>
        <button type="submit" class="btn primary">Record</button>
      </form>`;
  };

  const render = () => {
    const s = demo.summary();
    // Progress toward a ready brief: core decisions settled, full once the server recommends stopping.
    const pct = s.stopRecommended ? 1 : s.core.total ? Math.min(0.95, s.core.settled / s.core.total) : 0;
    const settled = s.settled;
    const q = current;
    const main = q
      ? `<p class="q-meta"><span>${esc(q.moduleLabel)}</span><span>Question ${s.questionCount + 1}</span></p>
         <h3 class="q-prompt">${esc(q.prompt)}</h3>
         ${questionHtml(q)}`
      : `<p class="q-meta"><span>Done</span></p><h3 class="q-prompt">No questions left to ask.</h3>`;
    root.innerHTML = `
      <div class="play">
        <div class="stage" aria-live="polite">${main}</div>
        <aside class="panel" aria-label="Session">
          <div class="clar">
            <div class="clar-row"><span>Core decisions</span><b>${s.core.settled} / ${s.core.total}</b></div>
            <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" aria-label="Progress toward a ready brief"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>
            <p class="small">${s.stopRecommended ? 'The brief is ready. Keep going to refine details, or write it now.' : `Clarity ${s.clarity.toFixed(2)}. The brief is ready once the core is settled.`}</p>
          </div>
          <button type="button" class="btn ${s.stopRecommended ? 'primary' : ''} wide" data-act="finish" ${s.questionCount === 0 ? 'disabled' : ''}>Write the brief</button>
          <button type="button" class="btn ghost wide" data-act="undo" ${s.canUndo ? '' : 'disabled'}>Undo last answer</button>
          ${log.length ? `<ul class="log">${log.map((l) => `<li class="${l.kind}">${esc(l.text)}${l.probe ? `<span class="probe">${esc(l.probe)}</span>` : ''}</li>`).join('')}</ul>` : ''}
          ${s.questionCount > 0 ? `
            <h4>Closest archetypes</h4>
            <ol class="arch">${s.archetypes.map((a) => `<li><span>${esc(a.label)}</span><span>${Math.round(a.p * 100)}%</span></li>`).join('')}</ol>` : ''}
          ${settled.length ? `<h4>Settled</h4><ul class="settled">${settled.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </aside>
      </div>`;

    root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => b.addEventListener('click', () => record(b.dataset.choice as Choice)));
    root.querySelector('[data-act="finish"]')?.addEventListener('click', finish);
    root.querySelector('[data-act="undo"]')?.addEventListener('click', () => {
      if (demo.undo()) {
        persist();
        ask();
      }
    });
    const other = root.querySelector<HTMLFormElement>('form.other');
    const otherBtn = root.querySelector<HTMLButtonElement>('[data-act="other"]');
    if (other && otherBtn) {
      otherBtn.addEventListener('click', () => {
        other.hidden = !other.hidden;
        otherBtn.setAttribute('aria-expanded', String(!other.hidden));
        if (!other.hidden) other.querySelector('input')?.focus();
      });
      other.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = (other.querySelector('input') as HTMLInputElement).value.trim();
        if (text) record('neither', undefined, text);
      });
    }
    const set = root.querySelector<HTMLFieldSetElement>('fieldset.multi');
    if (set) {
      const limit = Number(set.dataset.limit) || Infinity;
      const boxes = [...set.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
      boxes.forEach((x) => x.addEventListener('change', () => {
        const n = boxes.filter((y) => y.checked).length;
        boxes.forEach((y) => (y.disabled = !y.checked && n >= limit));
      }));
      root.querySelector('[data-multi="go"]')?.addEventListener('click', () => record('neither', boxes.filter((x) => x.checked).map((x) => x.value)));
      root.querySelector('[data-multi="none"]')?.addEventListener('click', () => record('neither', []));
    }
    root.querySelector<HTMLElement>('.stage button, .stage input')?.focus({ preventScroll: true });
  };

  ask();
}
