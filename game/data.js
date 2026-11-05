// Mathem (Oda platform) JSON API. Same-origin from the content script, so the
// user's session cookies apply and prices/assortment match what the site shows.

const API = `${location.origin}/api/v1/`;
const MAX_PRODUCTS = 48;
const MAX_SUBCATEGORIES = 4;

// Be a polite client: few requests in flight, spaced out, and results cached
// between launches so reopening the store doesn't hit the API again.
const MAX_IN_FLIGHT = 2;
const MIN_SPACING_MS = 100;
const TTL_MENU = 12 * 3600e3;
const TTL_PRODUCTS = 3 * 3600e3;
const CACHE_VERSION = 1;

const cache = new Map();
let inFlight = 0;
let lastStart = 0;
const waiting = [];

async function throttle() {
  while (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => waiting.push(r));
  inFlight++;
  const wait = lastStart + MIN_SPACING_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_SPACING_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
function release() {
  inFlight--;
  waiting.shift()?.();
}

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = (async () => {
    await throttle();
    try {
      const r = await fetch(API + path, {
        credentials: 'include',
        headers: { accept: 'application/json', 'x-client-app': 'tienda-web' },
      });
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return await r.json();
    } finally {
      release();
    }
  })();
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

/** Persists the (small, already normalised) result of `fn` in extension storage. */
async function persisted(key, ttl, fn) {
  const store = globalThis.chrome?.storage?.local;
  const k = `irl:v${CACHE_VERSION}:${key}`;
  if (store) {
    try {
      const hit = (await store.get(k))[k];
      if (hit && Date.now() - hit.t < ttl && hit.v) return hit.v;
    } catch {}
  }
  const v = await fn();
  if (store && v && (!Array.isArray(v) || v.length)) store.set({ [k]: { t: Date.now(), v } }).catch(() => {});
  return v;
}

export function loadCategories() {
  return persisted('categories', TTL_MENU, fetchCategories);
}

export function loadCategoryProducts(cat) {
  return persisted(`products:${cat.id}`, TTL_PRODUCTS, () => fetchCategoryProducts(cat));
}

export function loadDiscounts() {
  return persisted('discounts', TTL_PRODUCTS, fetchDiscounts);
}

async function fetchCategories() {
  const menu = await getJSON('app-components/megamenu/');
  const block =
    menu.blocks.find((b) => b.id === 'megamenu-category-blocks') ||
    menu.blocks.find((b) => b.component === 'list' && Array.isArray(b.items));
  return block.items
    .map((it) => it.data)
    .filter((d) => d && d.id && d.title)
    .map((d) => ({
      id: String(d.id),
      title: d.title,
      total: Number(d.total_items) || 0,
      url: d.target?.uri,
      image: d.leading_image?.thumbnail?.url || d.leading_image?.large?.url || null,
    }));
}

export function normalizeProduct(p, extra = {}) {
  const img = p.images?.[0];
  return {
    id: p.id,
    fullName: p.full_name,
    brand: p.brand || '',
    name: p.name || p.full_name,
    extra: p.name_extra || '',
    price: Number(p.gross_price) || 0,
    unitPrice: p.gross_unit_price ? Number(p.gross_unit_price) : null,
    unitAbbr: p.unit_price_quantity_abbreviation || '',
    oldPrice: p.discount?.is_discounted ? Number(p.discount.undiscounted_gross_price) || null : null,
    promo: p.promotions?.[0]?.title || (p.discount?.is_discounted ? p.discount.description_short : null),
    available: p.availability?.is_available !== false,
    image: img?.thumbnail?.url || img?.large?.url || null,
    imageLarge: img?.large?.url || null,
    url: p.front_url || (p.absolute_url ? location.origin + p.absolute_url : null),
    ...extra,
  };
}

function productsFromBlocks(blocks, extra) {
  const out = [];
  for (const b of blocks || []) {
    for (const p of b.products || []) out.push(normalizeProduct(p, { sub: b.title || extra.sub, ...extra }));
    for (const it of b.items || []) {
      if (it.item_type === 'product' && it.item) out.push(normalizeProduct(it.item, { sub: b.title, ...extra }));
    }
  }
  return out;
}

// A top-level category page lists its subcategories; each subcategory page lists
// a few products per sub-subcategory. Sample round-robin across subcategories so
// a shelf shows the breadth of the category rather than 64 kinds of lettuce.
async function fetchCategoryProducts(cat) {
  const top = await getJSON(`app-components/products/${cat.id}/`);
  const direct = productsFromBlocks(top.blocks, { catId: cat.id });
  const subs = [];
  for (const b of top.blocks || []) {
    for (const it of b.items || []) {
      if (it.type === 'image-strip-link' && it.data?.id) subs.push({ id: it.data.id, title: it.data.title });
    }
  }
  const groups = await Promise.all(
    subs.slice(0, MAX_SUBCATEGORIES).map((s) =>
      getJSON(`app-components/products/${s.id}/`)
        .then((page) => productsFromBlocks(page.blocks, { catId: cat.id, sub: s.title, subGroup: s.title }))
        .catch(() => []),
    ),
  );
  if (direct.length) groups.unshift(direct);

  const seen = new Set();
  const lists = groups.map((g) => g.filter((p) => p.image && p.available));
  const quota = Math.max(4, Math.ceil(MAX_PRODUCTS / Math.max(1, lists.length)));
  const picked = [];
  for (const list of lists) {
    let n = 0;
    for (const p of list) {
      if (n >= quota || picked.length >= MAX_PRODUCTS) break;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      picked.push(p);
      n++;
    }
  }
  // Top up from whatever is left if some subcategories were thin.
  for (const list of lists) {
    for (const p of list) {
      if (picked.length >= MAX_PRODUCTS) break;
      if (!seen.has(p.id)) { seen.add(p.id); picked.push(p); }
    }
  }
  // Keep subcategories contiguous on the shelf.
  const order = new Map();
  picked.forEach((p) => { if (!order.has(p.sub)) order.set(p.sub, order.size); });
  return picked.sort((a, b) => order.get(a.sub) - order.get(b.sub));
}

async function fetchDiscounts() {
  const page = await getJSON('app-components/app-products-discounted/');
  const seen = new Set();
  return productsFromBlocks(page.blocks, { catId: 'promo' })
    .filter((p) => p.image && p.available && !seen.has(p.id) && seen.add(p.id))
    .slice(0, MAX_PRODUCTS);
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Adds items to the user's real Mathem cart (same endpoint the site uses).
export async function addToRealCart(items) {
  const res = await fetch(API + 'cart/items/', {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-client-app': 'tienda-web',
      ...(csrfToken() ? { 'x-csrftoken': csrfToken() } : {}),
    },
    body: JSON.stringify({ items: items.map(({ id, quantity }) => ({ product_id: id, quantity })) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Parses "Sverige, 65 g" / "1,5 l" / "6 x 33 cl" into an approximate volume in litres.
export function approxVolume(extra) {
  if (!extra) return null;
  const s = extra.toLowerCase().replace(/ /g, ' ');
  let mult = 1;
  const multi = s.match(/(\d+)\s*(?:x|st\s*x|-pack|p\b)/);
  if (multi) mult = Math.min(12, Number(multi[1]));
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml)\b/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  const scale = { kg: 1, g: 0.001, l: 1, dl: 0.1, cl: 0.01, ml: 0.001 }[m[2]];
  return v * scale * mult;
}

export const formatPrice = (n) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
