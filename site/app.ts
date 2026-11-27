/// <reference lib="dom" />
// Page behavior for the project site. Bundled by scripts/build-site.mjs into _site/app.js. The interview engine and
// the comparison library load only when a visitor starts the demo.

function wireCopyButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('button.copy[data-copy]')) {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copy ?? '');
      if (!target) return;
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(target.textContent ?? '');
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Select and copy';
      }
      setTimeout(() => (btn.textContent = label), 1600);
    });
  }
}

import { clearSaved, loadSaved } from './saved';

function mountStart(root: HTMLElement): void {
  const saved = loadSaved();
  const resume = saved
    ? `<div class="resume">
        <button type="button" class="btn primary" data-act="resume">Resume your interview (${saved.questionCount} ${saved.questionCount === 1 ? 'question' : 'questions'})</button>
        <button type="button" class="btn ghost" data-act="discard">Discard it</button>
      </div>`
    : '';
  root.innerHTML = `${resume}
    <form class="start" novalidate>
      <div class="field">
        <label for="gdv-title">Working title <span>optional</span></label>
        <input id="gdv-title" name="title" maxlength="60" placeholder="Steel and Momentum" autocomplete="off">
      </div>
      <div class="field grow">
        <label for="gdv-pitch">One-line pitch <span>optional, goes into the brief</span></label>
        <input id="gdv-pitch" name="pitch" maxlength="200" placeholder="A physics-driven sword fighter where momentum decides every hit" autocomplete="off">
      </div>
      <button type="submit" class="btn primary">Start the interview</button>
    </form>
    <p class="small">Usually 25 to 45 questions until the brief is ready. Stop whenever you like; the brief marks what is still open.</p>`;
  const form = root.querySelector('form') as HTMLFormElement;
  const launch = async (btn: HTMLButtonElement, opts: { title?: string; pitch?: string }, resumeIt: boolean) => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading the library...';
    try {
      const { mountDemo } = await import('./demo');
      if (!resumeIt) clearSaved();
      mountDemo(root, opts, resumeIt ? saved : undefined);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = label;
      root.insertAdjacentHTML('beforeend', '<p class="small err">The demo failed to load. Reload the page and try again.</p>');
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    void launch(form.querySelector('button') as HTMLButtonElement, { title: String(data.get('title') ?? '').trim(), pitch: String(data.get('pitch') ?? '').trim() }, false);
  });
  root.querySelector<HTMLButtonElement>('[data-act="resume"]')?.addEventListener('click', (e) => {
    void launch(e.currentTarget as HTMLButtonElement, {}, true);
  });
  root.querySelector('[data-act="discard"]')?.addEventListener('click', () => {
    clearSaved();
    mountStart(root);
  });
}

wireCopyButtons();
const demoRoot = document.getElementById('demo-root');
if (demoRoot) mountStart(demoRoot);
