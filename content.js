// Injects the "Toggle IRL mode" button and lazily loads the 3D store on demand.
(() => {
  if (window.__mathemIrl) return;
  window.__mathemIrl = true;

  let game = null;
  let busy = false;

  const host = document.createElement('div');
  host.id = 'mathem-irl-toggle';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button {
        position: fixed; top: 14px; right: 14px; z-index: 2147483647;
        display: flex; align-items: center; gap: 10px;
        padding: 10px 16px 10px 12px; border: 0; border-radius: 999px; cursor: pointer;
        font: 700 14px/1 ABCGintoNord-Bold, ABCGintoVariable-Regular, system-ui, sans-serif;
        letter-spacing: .01em; color: #fff; background: #4338ca;
        box-shadow: 0 6px 20px rgba(30,27,75,.3), inset 0 -2px 0 rgba(0,0,0,.18);
        transition: transform .15s ease, box-shadow .15s ease, background .2s ease;
      }
      button:hover { transform: translateY(-1px); background: #4f46e5; box-shadow: 0 10px 26px rgba(30,27,75,.38), inset 0 -2px 0 rgba(0,0,0,.18); }
      button:active { transform: translateY(1px); }
      button.on { background: #1e1b4b; color: #c7d2fe; box-shadow: 0 6px 20px rgba(0,0,0,.5), inset 0 0 0 2px #818cf8; }
      .icon { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,.2); }
      button.on .icon { background: rgba(129,140,248,.2); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: .35; transition: all .2s; }
      button.on .dot { background: #7dff9b; opacity: 1; box-shadow: 0 0 8px #7dff9b; }
      button.busy .dot { animation: pulse .8s infinite alternate; opacity: 1; }
      /* phones: icon only, so it doesn't cover the Mathem logo */
      button.compact { padding: 9px; gap: 0; }
      button.compact .label { display: none; }
      button.compact .dot { position: absolute; top: 3px; right: 3px; width: 9px; height: 9px; box-shadow: 0 0 0 2px #4338ca; }
      button.compact.on .dot { box-shadow: 0 0 0 2px #1e1b4b, 0 0 8px #7dff9b; }
      @keyframes pulse { to { transform: scale(1.6); opacity: .3; } }
    </style>
    <button type="button" aria-label="Toggle IRL mode" title="Toggle IRL mode – unofficial fan project, not affiliated with or endorsed by Mathem">
      <span class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 8H6"/></svg></span>
      <span class="label">Toggle IRL mode</span>
      <span class="dot"></span>
    </button>`;
  const btn = root.querySelector('button');

  function render() {
    btn.classList.toggle('on', !!game);
    btn.classList.toggle('busy', busy);
    place();
  }

  // Mathem shows its own cart button in the top-right corner once the cart has
  // items (top row on desktop, second row on phones). Sit in the corner when
  // that spot is free, otherwise park just to the left of their cart button.
  const MARGIN = 14, GAP = 10;
  // Width of the visible page, excluding a classic scrollbar (innerWidth includes it).
  const viewportWidth = () => document.documentElement.clientWidth || innerWidth;

  // Is this element really what's painted at its centre (not off-screen or covered)?
  function isVisible(el, r) {
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === host || el.contains(hit) || hit.contains(el));
  }

  function findSiteCart() {
    const vw = viewportWidth();
    let best = null;
    const nodes = document.querySelectorAll('[class*="CartIconWithPrice"], [class*="CartI"], header button, header a, button[aria-label*="arukorg"]');
    for (const el of nodes) {
      // The slide-in mini cart sits just off-screen and is full of cart-ish elements.
      if (host.contains(el) || el.closest('[class*="MiniCart"]')) continue;
      const looksLikeCart =
        /cart/i.test(el.className?.toString() || '') ||
        /varukorg/i.test(el.getAttribute('aria-label') || '') ||
        (/\d+,\d{2}\s*kr/.test(el.textContent || '') && el.querySelector('svg'));
      if (!looksLikeCart) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.height > 90 || r.top < 0 || r.top > 160 || r.left < 0 || r.right > vw + 1) continue;
      if (!isVisible(el, r)) continue;
      if (!best || r.right > best.right) best = r;
    }
    return best;
  }
  function place() {
    btn.classList.toggle('compact', innerWidth < 640);
    const vw = viewportWidth();
    let right = MARGIN, top = MARGIN;
    const cart = game ? null : findSiteCart();
    if (cart) {
      const w = btn.offsetWidth, h = btn.offsetHeight;
      const mine = { left: vw - MARGIN - w, right: vw - MARGIN, top: MARGIN, bottom: MARGIN + h };
      const overlaps = mine.left < cart.right + GAP && mine.right > cart.left - GAP && mine.top < cart.bottom && mine.bottom > cart.top;
      if (overlaps) {
        right = vw - cart.left + GAP;
        top = Math.max(4, cart.top + cart.height / 2 - h / 2);
      }
    }
    btn.style.right = `${Math.round(right)}px`;
    btn.style.top = `${Math.round(top)}px`;
  }
  let placeQueued = false;
  const queuePlace = () => {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => { placeQueued = false; place(); });
  };
  addEventListener('resize', queuePlace);
  addEventListener('scroll', queuePlace, { passive: true });
  setInterval(queuePlace, 1000);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (busy) return;
    if (game) {
      game.stop();
      game = null;
      window.__mathemIrlGame = null;
      render();
      return;
    }
    busy = true;
    render();
    try {
      const mod = await import(chrome.runtime.getURL('game/main.js'));
      game = await mod.startGame({
        onExit: () => { game = null; window.__mathemIrlGame = null; render(); },
      });
      // Only visible in the extension's isolated world (handy for automated tests).
      window.__mathemIrlGame = game;
    } catch (err) {
      console.error('[IRL mode] failed to start', err);
      game = null;
    } finally {
      busy = false;
      render();
    }
  });

  // Keep the button mounted even if the SPA re-renders the document.
  const mount = () => { if (!host.isConnected) document.documentElement.appendChild(host); };
  mount();
  place();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });
})();
