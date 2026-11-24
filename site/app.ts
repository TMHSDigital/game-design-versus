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

function mountStart(root: HTMLElement): void {
  root.innerHTML = `
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
    <p class="small">About 35 to 45 questions to reach clarity 0.80. Stop whenever you like; the brief marks what is still open.</p>`;
  const form = root.querySelector('form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const btn = form.querySelector('button') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Loading the library...';
    try {
      const { mountDemo } = await import('./demo');
      mountDemo(root, { title: String(data.get('title') ?? '').trim(), pitch: String(data.get('pitch') ?? '').trim() });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Start the interview';
      root.insertAdjacentHTML('beforeend', '<p class="small err">The demo failed to load. Reload the page and try again.</p>');
    }
  });
}

wireCopyButtons();
const demoRoot = document.getElementById('demo-root');
if (demoRoot) mountStart(demoRoot);
