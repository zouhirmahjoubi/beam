/**
 * The page shown after Share ends the headset session: the puzzle's link with
 * Copy and Share buttons. Plain DOM, since the headset view is gone by then,
 * and the link also goes in the address bar.
 */
const STYLE = `
#share-page { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(12, 16, 22, 0.55); font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; z-index: 10; }
#share-page .card { width: 100%; max-width: 420px; box-sizing: border-box; padding: 28px 24px 24px;
  background: #fff; color: #14181f; border-radius: 16px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25); }
#share-page h1 { margin: 0 0 6px; font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
#share-page p { margin: 0 0 18px; color: #4a5361; }
#share-page input { width: 100%; box-sizing: border-box; padding: 12px; margin: 0 0 16px; border: 1px solid #d5dae1;
  border-radius: 10px; font: 14px ui-monospace, 'Cascadia Mono', monospace; color: #14181f; background: #f6f8fa; }
#share-page .row { display: flex; gap: 10px; flex-wrap: wrap; }
#share-page button { flex: 1 1 0; min-width: 110px; min-height: 44px; padding: 0 16px; border-radius: 10px;
  font: 600 15px system-ui, -apple-system, 'Segoe UI', sans-serif; cursor: pointer; border: 1px solid #14181f; background: #fff; color: #14181f; }
#share-page button.primary { background: #14181f; color: #fff; }
#share-page .row.three .primary { flex-basis: 100%; }
#share-page button:focus-visible { outline: 3px solid #4aa8ff; outline-offset: 2px; }
`;

export function showSharePage(url: string): void {
  document.getElementById('share-page')?.remove();
  window.history.replaceState(null, '', url);

  const page = document.createElement('div');
  page.id = 'share-page';
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-labelledby', 'share-title');
  page.innerHTML = `<style>${STYLE}</style>
    <div class="card">
      <h1 id="share-title">Your puzzle is ready</h1>
      <p>Send this link to a friend with a headset. It opens your puzzle on their desk.</p>
      <input readonly aria-label="Puzzle link" />
      <div class="row">
        <button class="primary" data-act="copy">Copy link</button>
        <button data-act="share" hidden>Share</button>
        <button data-act="close">Close</button>
      </div>
    </div>`;
  const input = page.querySelector('input')!;
  input.value = url;
  const copy = page.querySelector<HTMLButtonElement>('[data-act="copy"]')!;
  const share = page.querySelector<HTMLButtonElement>('[data-act="share"]')!;
  share.hidden = typeof navigator.share !== 'function';
  // Three buttons: Copy link takes its own row, Share and Close split the next one.
  if (!share.hidden) page.querySelector('.row')!.classList.add('three');

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Copied';
    } catch {
      // No clipboard access: select the link so it can be copied by hand.
      input.select();
    }
  });
  share.addEventListener('click', () => {
    navigator.share({ title: 'Palmlight puzzle', url }).catch(() => undefined);
  });
  page.querySelector('[data-act="close"]')!.addEventListener('click', () => page.remove());
  input.addEventListener('focus', () => input.select());

  document.body.appendChild(page);
  copy.focus();
}
