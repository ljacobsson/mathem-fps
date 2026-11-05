// Product images on images.mathem.se are served without CORS headers, so WebGL
// can't sample them directly. The service worker has host permission for that
// origin and proxies the bytes back to the content script as base64.
//
// To keep load on Mathem low, images are kept in the Cache API between launches
// (the URLs are content-addressed and signed, so they never go stale) and new
// ones are fetched at a normal browser pace (a few at a time, rate-capped).

const ALLOWED_HOST = 'images.mathem.se';
const CACHE_NAME = 'irl-images-v1';
const MAX_CACHED = 3000;
const MAX_IN_FLIGHT = 6; // what a browser uses per host
const MIN_SPACING_MS = 25; // ≈ 40 network requests per second at most

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'mathem-irl:fetch-images') return false;
  Promise.all(msg.urls.map(fetchImage)).then(sendResponse);
  return true;
});

let inFlight = 0;
let lastStart = 0;
const waiting = [];
async function throttled(fn) {
  while (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => waiting.push(r));
  inFlight++;
  const wait = lastStart + MIN_SPACING_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_SPACING_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

let cachePromise = null;
let putsSincePrune = 0;
const openCache = () => (cachePromise ||= caches.open(CACHE_NAME));

async function prune(cache) {
  const keys = await cache.keys(); // insertion order: oldest first
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_CACHED))) await cache.delete(k);
}

async function fetchImage(url) {
  try {
    if (new URL(url).hostname !== ALLOWED_HOST) throw new Error('host not allowed');
    const cache = await openCache();
    let res = await cache.match(url);
    if (!res) {
      res = await throttled(() => fetch(url, { headers: { Accept: 'image/webp,image/*;q=0.8' } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(url, res.clone());
      if (++putsSincePrune >= 200) { putsSincePrune = 0; prune(cache).catch(() => {}); }
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { type: res.headers.get('content-type') || 'image/jpeg', data: toBase64(buf) };
  } catch (err) {
    return { error: String(err) };
  }
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
