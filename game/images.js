import * as THREE from './vendor/three/build/three.module.js';

const BATCH = 10;
const CONCURRENCY = 3;

let active = 0;
const waiting = [];
async function slot(fn) {
  if (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const bitmapCache = new Map();

/** Loads images through the extension service worker. Resolves to ImageBitmap|null per url. */
export async function loadBitmaps(urls) {
  const todo = urls.filter((u) => u && !bitmapCache.has(u));
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const p = slot(() => chrome.runtime.sendMessage({ type: 'mathem-irl:fetch-images', urls: batch })).then(
      (results) =>
        Promise.all(
          results.map((r) =>
            r?.data ? createImageBitmap(new Blob([decodeBase64(r.data)], { type: r.type })).catch(() => null) : null,
          ),
        ),
    );
    batch.forEach((u, j) => bitmapCache.set(u, p.then((list) => list[j]).catch(() => null)));
  }
  return Promise.all(urls.map((u) => (u ? bitmapCache.get(u) : null)));
}

/**
 * Removes the white studio background from a product photo by flood-filling
 * near-white pixels from the edges, so items stand on the shelf as cut-outs.
 */
function cutout(ctx, size) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const n = size * size;
  const isBg = (i) => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    if (a < 10) return true;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mn > 228 && mx - mn < 22;
  };
  const mark = new Uint8Array(n);
  const stack = [];
  for (let i = 0; i < size; i++) {
    stack.push(i, (size - 1) * size + i, i * size, i * size + size - 1);
  }
  let removed = 0;
  while (stack.length) {
    const i = stack.pop();
    if (mark[i] || !isBg(i)) continue;
    mark[i] = 1;
    removed++;
    const x = i % size, y = (i / size) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < size - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - size);
    if (y < size - 1) stack.push(i + size);
  }
  const keepRatio = 1 - removed / n;
  if (keepRatio < 0.06) return null; // probably a white product; keep the full photo
  for (let i = 0; i < n; i++) {
    if (mark[i]) { d[i * 4 + 3] = 0; continue; }
    // Soften the fringe: light pixels touching the background get partial alpha.
    const x = i % size, y = (i / size) | 0;
    const edge =
      (x > 0 && mark[i - 1]) || (x < size - 1 && mark[i + 1]) || (y > 0 && mark[i - size]) || (y < size - 1 && mark[i + size]);
    if (edge) {
      const l = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
      if (l > 200) d[i * 4 + 3] = 110;
    }
  }
  // Bounding box + average colour of what's left.
  let x0 = size, y0 = size, x1 = 0, y1 = 0, r = 0, g = 0, b = 0, c = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (d[i * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if ((x + y) % 3 === 0) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; c++; }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1, color: c ? [r / c, g / c, b / c] : [200, 200, 200] };
}

export class Atlas {
  constructor({ cols = 8, rows = 8, cell = 128 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * cell;
    this.canvas.height = rows * cell;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.scratch = document.createElement('canvas');
    this.scratch.width = this.scratch.height = cell;
    this.sctx = this.scratch.getContext('2d', { willReadFrequently: true });
    this.count = 0;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }

  get full() { return this.count >= this.cols * this.rows; }

  /** Draws a bitmap into the next cell. Returns UV rect + pixel aspect, or null. */
  add(bitmap, { cut = true } = {}) {
    if (this.full) return null;
    const { cell } = this;
    const pad = 3;
    const s = this.sctx;
    s.clearRect(0, 0, cell, cell);
    let info = { x0: 0, y0: 0, x1: cell, y1: cell, color: [220, 220, 220] };
    if (bitmap) {
      const k = Math.min((cell - pad * 2) / bitmap.width, (cell - pad * 2) / bitmap.height);
      const w = bitmap.width * k, h = bitmap.height * k;
      s.drawImage(bitmap, (cell - w) / 2, (cell - h) / 2, w, h);
      info = { x0: (cell - w) / 2, y0: (cell - h) / 2, x1: (cell + w) / 2, y1: (cell + h) / 2, color: [220, 220, 220] };
      if (cut) {
        const c = cutout(s, cell);
        if (c) info = c;
        else {
          s.clearRect(0, 0, cell, cell);
          s.drawImage(bitmap, (cell - w) / 2, (cell - h) / 2, w, h);
        }
      }
    }
    const idx = this.count++;
    const cx = (idx % this.cols) * cell, cy = Math.floor(idx / this.cols) * cell;
    this.ctx.drawImage(this.scratch, cx, cy);
    this.texture.needsUpdate = true;
    const W = this.canvas.width, H = this.canvas.height;
    const u0 = (cx + info.x0) / W, u1 = (cx + info.x1) / W;
    // CanvasTexture is flipY'd: canvas row 0 is v = 1.
    const v1 = 1 - (cy + info.y0) / H, v0 = 1 - (cy + info.y1) / H;
    return {
      uv: [u0, v0, u1 - u0, v1 - v0],
      aspect: (info.x1 - info.x0) / (info.y1 - info.y0),
      color: info.color,
    };
  }
}
