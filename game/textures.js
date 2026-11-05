import * as THREE from './vendor/three/build/three.module.js';

export const FONT_BOLD = 'ABCGintoNord-Bold, "Arial Black", system-ui, sans-serif';
export const FONT_REG = 'ABCGintoVariable-Regular, "Helvetica Neue", Arial, system-ui, sans-serif';

export const BRAND = {
  eggyolk: '#ffa424',
  plum: '#17001e',
  night: '#1d1429',
  milk: '#faf7f0',
  lettuce: '#dee9c6',
  banana: '#fff4db',
  pasta: '#ffe5b9',
  lavendel: '#efe6f9',
  squash: '#dbf1f0',
  daikon: '#f3eee6',
};

export async function ensureFonts() {
  const loads = ['64px ABCGintoNord-Bold', '32px ABCGintoVariable-Regular'].map((f) =>
    document.fonts.load(f).catch(() => null),
  );
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}

let seed = 1337;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const resetRand = (s) => { seed = s; };

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(c, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Shrinks font size until text fits in maxWidth. */
export function fitText(ctx, text, maxWidth, size, font, minSize = 10) {
  let s = size;
  do {
    ctx.font = `${s}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > minSize);
  return s;
}

export function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Large polished terrazzo tiles in Mathem's warm off-white. */
export function floorTexture() {
  const [c, ctx] = canvas(1024, 1024);
  const tile = 256;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const l = 236 + rand() * 8;
      ctx.fillStyle = `rgb(${l},${l - 4},${l - 12})`;
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }
  const flecks = ['#ffa424', '#c9b8a6', '#8e8478', '#dee9c6', '#5b4a63', '#ffffff', '#b9a48c'];
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = flecks[(rand() * flecks.length) | 0];
    ctx.globalAlpha = 0.25 + rand() * 0.5;
    const r = rand() < 0.94 ? 0.6 + rand() * 1.6 : 2 + rand() * 4;
    ctx.beginPath();
    ctx.ellipse(rand() * 1024, rand() * 1024, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(120,105,90,.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(1024, i * tile); ctx.stroke();
  }
  return c;
}

export function pegboardTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#f4f1ec';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(60,50,40,.28)';
  for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) {
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

/** White wire grid on transparent, for the cart basket. */
export function wireTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 7;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
  }
  ctx.lineWidth = 5;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  return c;
}

export function cardboardTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#c49a6c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(90,60,30,.08)' : 'rgba(255,240,220,.08)';
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 30, 1);
  }
  ctx.fillStyle = 'rgba(230,210,170,.85)';
  ctx.fillRect(112, 0, 32, 256);
  ctx.fillStyle = 'rgba(60,35,20,.6)';
  ctx.font = `28px ${FONT_BOLD}`;
  ctx.textAlign = 'center';
  ctx.fillText('MATHEM', 128, 200);
  ctx.font = `14px ${FONT_REG}`;
  ctx.fillText('↑ DENNA SIDA UPP ↑', 128, 60);
  return c;
}

export function woodTexture() {
  const [c, ctx] = canvas(256, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#c89a64');
  g.addColorStop(1, '#a87a46');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(90,55,25,${0.08 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    const y = rand() * 64;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + rand() * 8 - 4, 170, y + rand() * 8 - 4, 256, y);
    ctx.stroke();
  }
  return c;
}

const PALETTE = ['#ff8a00', '#2f9e5b', '#e5484d', '#2f7fc1', '#8b5cf6', '#e8a900', '#0f9f94', '#e0458f',
  '#6aa516', '#f26b1d', '#0b8fcc', '#a04fd6', '#d63b3b', '#1f9e4a', '#c89400', '#0aa3b8', '#c23fc9', '#4d8a12'];

const THEMES = [
  [/frukt|grönt/i, '#3f9b3a', 'wood'],
  [/mejeri|ost/i, '#2f86c9', 'cooler'],
  [/bröd|bageri/i, '#c27a2c', 'wood'],
  [/kött|chark|fågel/i, '#cf3a3a', 'cooler'],
  [/dryck/i, '#1f6fd1', 'standard'],
  [/fisk|skaldjur/i, '#0e9fb0', 'cooler'],
  [/fryst/i, '#5aa9e6', 'freezer'],
  [/glass|godis|snacks/i, '#e0458f', 'standard'],
  [/färdigmat|mellanmål/i, '#f26b1d', 'cooler'],
  [/barn|baby/i, '#8f6ad8', 'standard'],
  [/apotek|skönhet|hälsa/i, '#d6508b', 'standard'],
  [/kryddor/i, '#c98a00', 'standard'],
  [/djur/i, '#7a5b3a', 'standard'],
  [/hem|hushåll/i, '#4a6fa5', 'standard'],
  [/träning/i, '#13a37a', 'standard'],
  [/blommor|plantering/i, '#4d8a12', 'wood'],
  [/skafferi/i, '#b5651d', 'standard'],
];

export function categoryTheme(title, index) {
  for (const [re, color, style] of THEMES) if (re.test(title)) return { color, style };
  return { color: PALETTE[index % PALETTE.length], style: 'standard' };
}

/** Shelf-edge price labels, many per texture. */
export class TagAtlas {
  constructor() {
    this.cols = 8;
    this.rows = 8;
    this.cw = 128;
    this.ch = 64;
    [this.canvas, this.ctx] = canvas(this.cols * this.cw, this.rows * this.ch);
    this.count = 0;
    this.texture = toTexture(this.canvas);
  }

  add(p, accent) {
    if (this.count >= this.cols * this.rows) return null;
    const i = this.count++;
    const x = (i % this.cols) * this.cw, y = Math.floor(i / this.cols) * this.ch;
    const ctx = this.ctx;
    const sale = !!p.oldPrice || !!p.promo;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = sale ? '#ffe14d' : '#ffffff';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = sale ? '#e5262d' : accent;
    ctx.fillRect(0, 0, this.cw, 7);
    const [kr, ore] = p.price.toFixed(2).split('.');
    ctx.fillStyle = sale ? '#c4121a' : BRAND.plum;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `38px ${FONT_BOLD}`;
    const kw = ctx.measureText(kr).width;
    ctx.fillText(kr, 6, 46);
    ctx.font = `19px ${FONT_BOLD}`;
    ctx.fillText(ore, 8 + kw, 30);
    ctx.font = `11px ${FONT_REG}`;
    ctx.fillStyle = '#4a3b52';
    ctx.textAlign = 'right';
    ctx.fillText('kr', this.cw - 6, 30);
    ctx.textAlign = 'left';
    ctx.font = `10px ${FONT_REG}`;
    ctx.fillText(ellipsize(ctx, p.brand ? `${p.brand} ${p.name}` : p.name, this.cw - 10), 6, 59);
    if (sale && p.promo) {
      ctx.font = `10px ${FONT_BOLD}`;
      ctx.fillStyle = '#c4121a';
      ctx.textAlign = 'right';
      ctx.fillText(ellipsize(ctx, p.promo, 60), this.cw - 6, 46);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
    const W = this.canvas.width, H = this.canvas.height;
    return [x / W, 1 - (y + this.ch) / H, this.cw / W, this.ch / H];
  }
}

/** Hanging aisle sign: number badge + the two categories on either side. */
export function aisleSignCanvas(num, left, right, leftColor, rightColor) {
  const [c, ctx] = canvas(1536, 384);
  roundRect(ctx, 6, 6, 1524, 372, 48);
  ctx.fillStyle = BRAND.night;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,164,36,.9)';
  ctx.stroke();
  // number badge
  ctx.fillStyle = BRAND.eggyolk;
  ctx.beginPath(); ctx.arc(768, 192, 122, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BRAND.plum;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `150px ${FONT_BOLD}`;
  ctx.fillText(String(num), 768, 204);
  ctx.font = `30px ${FONT_BOLD}`;
  ctx.fillStyle = BRAND.eggyolk;
  ctx.fillText('GÅNG', 768, 40);
  const side = (title, color, x, arrow, align) => {
    if (!title) return;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    const ax = align === 'left' ? x : x - 60;
    ctx.beginPath(); ctx.arc(ax + 30, 192, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `40px ${FONT_BOLD}`;
    ctx.textAlign = 'center';
    ctx.fillText(arrow, ax + 30, 196);
    ctx.textAlign = align;
    ctx.fillStyle = BRAND.milk;
    const tx = align === 'left' ? x + 84 : x - 84;
    const words = title.split(/(?<=,)\s|\s(?=&)/);
    const lines = words.length > 1 && title.length > 16 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [title];
    const size = Math.min(...lines.map((l) => fitText(ctx, l, 520, 64, FONT_BOLD)));
    ctx.font = `${size}px ${FONT_BOLD}`;
    lines.forEach((l, i) => ctx.fillText(l, tx, 192 + (i - (lines.length - 1) / 2) * size * 1.1));
  };
  side(left, leftColor, 40, '←', 'left');
  side(right, rightColor, 1496, '→', 'right');
  return c;
}

/** Shelf header board running along the top of a shelf face. */
export function headerCanvas(title, color) {
  const [c, ctx] = canvas(1024, 96);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 96);
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, 'rgba(255,255,255,.18)');
  g.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = fitText(ctx, title.toUpperCase(), 760, 54, FONT_BOLD);
  ctx.font = `${s}px ${FONT_BOLD}`;
  ctx.fillText(title.toUpperCase(), 512, 52);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.arc(60, 48, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(964, 48, 9, 0, Math.PI * 2); ctx.fill();
  return c;
}

/** Tall poster on gondola end caps. */
export function posterCanvas(title, sub, color, bitmap) {
  const [c, ctx] = canvas(512, 768);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(420, 120, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, 700, 160, 0, Math.PI * 2); ctx.fill();
  if (bitmap) {
    ctx.save();
    roundRect(ctx, 56, 250, 400, 400, 200);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    const k = Math.min(360 / bitmap.width, 360 / bitmap.height);
    ctx.drawImage(bitmap, 256 - (bitmap.width * k) / 2, 450 - (bitmap.height * k) / 2, bitmap.width * k, bitmap.height * k);
    ctx.restore();
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `30px ${FONT_BOLD}`;
  ctx.fillText(sub, 48, 80);
  const words = title.split(' ');
  const lines = [];
  let line = '';
  ctx.font = `64px ${FONT_BOLD}`;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > 420 && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const size = Math.min(64, ...lines.map((l) => fitText(ctx, l, 420, 64, FONT_BOLD)));
  ctx.font = `${size}px ${FONT_BOLD}`;
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 48, 150 + i * size * 1.05));
  ctx.font = `26px ${FONT_BOLD}`;
  ctx.fillStyle = BRAND.plum;
  roundRect(ctx, 48, 686, 200, 48, 24);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = BRAND.plum;
  ctx.textBaseline = 'middle';
  ctx.fillText('mathem.se', 70, 711);
  return c;
}

export function textCanvas(text, { size = 200, font = FONT_BOLD, color = BRAND.eggyolk, pad = 20, stroke } = {}) {
  const [m, mctx] = canvas(8, 8);
  mctx.font = `${size}px ${font}`;
  const w = Math.ceil(mctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.3) + pad * 2;
  const [c, ctx] = canvas(w, h);
  ctx.font = `${size}px ${font}`;
  ctx.textBaseline = 'middle';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = size / 10; ctx.strokeText(text, pad, h / 2); }
  ctx.fillStyle = color;
  ctx.fillText(text, pad, h / 2);
  return c;
}

export function promoSignCanvas(text = 'EXTRAPRIS!', sub = 'Fynda medan det finns') {
  const [c, ctx] = canvas(512, 256);
  ctx.save();
  ctx.translate(256, 128);
  ctx.rotate(-0.04);
  ctx.fillStyle = '#e5262d';
  roundRect(ctx, -240, -110, 480, 220, 30);
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = fitText(ctx, text, 440, 96, FONT_BOLD);
  ctx.font = `${s}px ${FONT_BOLD}`;
  ctx.fillText(text, 0, -14);
  ctx.fillStyle = '#fff';
  ctx.font = `30px ${FONT_BOLD}`;
  ctx.fillText(sub, 0, 64);
  ctx.restore();
  return c;
}

export function highlightCanvas() {
  const [c, ctx] = canvas(256, 256);
  ctx.strokeStyle = '#ffa424';
  ctx.lineWidth = 10;
  ctx.shadowColor = '#ffa424';
  ctx.shadowBlur = 18;
  roundRect(ctx, 20, 20, 216, 216, 28);
  ctx.stroke();
  return c;
}

export function wetFloorCanvas() {
  const [c, ctx] = canvas(256, 384);
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(128, 40); ctx.lineTo(220, 200); ctx.lineTo(36, 200); ctx.closePath();
  ctx.lineWidth = 10; ctx.strokeStyle = '#111'; ctx.stroke();
  ctx.font = `90px ${FONT_BOLD}`;
  ctx.textAlign = 'center';
  ctx.fillText('!', 128, 182);
  ctx.font = `44px ${FONT_BOLD}`;
  ctx.fillText('HALT', 128, 270);
  ctx.fillText('GOLV', 128, 320);
  return c;
}
