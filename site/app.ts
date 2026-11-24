/// <reference lib="dom" />
// Page behavior for the project site. Bundled by scripts/build-site.mjs into _site/app.js.

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

wireCopyButtons();
