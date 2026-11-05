import { formatPrice } from './data.js';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { position: fixed; inset: 0; z-index: 2147483646; background: #120c17; overflow: hidden;
  font: 15px/1.35 ABCGintoVariable-Regular, "Helvetica Neue", Arial, system-ui, sans-serif; color: #faf7f0;
  user-select: none; -webkit-user-select: none; cursor: default; }
.root canvas.gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.bold { font-family: ABCGintoNord-Bold, "Arial Black", system-ui, sans-serif; letter-spacing: .01em; }
.glass { background: rgba(23, 0, 30, .55); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid rgba(255,255,255,.12); border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.hud { position: absolute; inset: 0; pointer-events: none; transition: opacity .3s; }
.hud.hidden { opacity: 0; }

.crosshair { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.crosshair i { position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.9);
  box-shadow: 0 0 0 1.5px rgba(0,0,0,.35); transition: all .15s ease; }
.crosshair.on i { left: -13px; top: -13px; width: 26px; height: 26px; background: transparent; border: 2.5px solid #ffa424; box-shadow: 0 0 12px rgba(255,164,36,.6); }

.tip { position: absolute; left: calc(50% + 36px); top: calc(50% - 20px); width: 300px; padding: 14px; display: flex; gap: 12px;
  opacity: 0; transform: translateX(-8px) scale(.98); transition: opacity .15s, transform .15s; }
.tip.on { opacity: 1; transform: none; }
.tip img { width: 76px; height: 76px; object-fit: contain; background: #fff; border-radius: 12px; flex: none; }
.tip .brand { font-size: 12px; opacity: .7; text-transform: uppercase; letter-spacing: .06em; }
.tip .name { font-size: 15px; margin: 2px 0; }
.tip .extra { font-size: 12px; opacity: .7; }
.tip .price { font-size: 22px; color: #ffa424; margin-top: 6px; display: flex; align-items: baseline; gap: 8px; }
.tip .old { font-size: 13px; opacity: .6; text-decoration: line-through; color: #faf7f0; }
.tip .unit { font-size: 11px; opacity: .6; }
.tip .promo { display: inline-block; background: #e5262d; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 999px; margin-top: 4px; }
.tip .hint { font-size: 11px; opacity: .55; margin-top: 6px; }
kbd { display: inline-block; min-width: 20px; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.18);
  border-bottom-width: 2px; font: 11px/1.2 ABCGintoNord-Bold, system-ui, sans-serif; text-align: center; color: #faf7f0; }

.loc { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); padding: 8px 18px 8px 8px; display: flex; align-items: center; gap: 12px;
  transition: opacity .4s, transform .4s; white-space: nowrap; }
.loc .num { width: 38px; height: 38px; border-radius: 50%; background: #ffa424; color: #17001e; display: grid; place-items: center; font-size: 18px; }
.loc .num.zone { width: auto; padding: 0 12px; border-radius: 999px; font-size: 13px; }
.loc .t { font-size: 15px; }
.loc .t small { display: block; font-size: 11px; opacity: .65; letter-spacing: .08em; text-transform: uppercase; }
.loc.pop { animation: pop .45s ease; }
@keyframes pop { 0% { transform: translateX(-50%) scale(.9); opacity: .2 } 100% { transform: translateX(-50%) scale(1); opacity: 1 } }

.cartw { position: absolute; right: 18px; bottom: 18px; padding: 14px 16px; min-width: 230px; }
.cartw .row { display: flex; align-items: center; gap: 12px; }
.cartw .ic { width: 42px; height: 42px; border-radius: 12px; background: #ffa424; color: #17001e; display: grid; place-items: center; position: relative; }
.cartw .ic b { position: absolute; top: -6px; right: -6px; background: #fff; color: #17001e; font-size: 11px; min-width: 20px; height: 20px; border-radius: 10px; display: grid; place-items: center; padding: 0 5px; }
.cartw .total { font-size: 22px; }
.cartw .lbl { font-size: 11px; opacity: .65; text-transform: uppercase; letter-spacing: .08em; }
.cartw .thumbs { display: flex; gap: 4px; margin-top: 10px; min-height: 0; }
.cartw .thumbs img { width: 30px; height: 30px; object-fit: contain; background: #fff; border-radius: 8px; animation: drop .35s ease; }
.cartw.bump { animation: bump .35s ease; }
@keyframes bump { 30% { transform: scale(1.06) } }
@keyframes drop { from { transform: translateY(-14px); opacity: 0 } }

.list { position: absolute; left: 18px; top: 18px; width: 270px; padding: 14px 14px 10px; transition: opacity .3s; }
.list h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }
.list h3 span { font-family: ABCGintoVariable-Regular, system-ui; font-size: 12px; letter-spacing: 0; text-transform: none; opacity: .7; }
.list .it { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,.08); transition: opacity .3s; }
.list .it img { width: 34px; height: 34px; object-fit: contain; background: #fff; border-radius: 8px; flex: none; }
.list .it .n { font-size: 12.5px; line-height: 1.2; flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.list .it .a { font-size: 11px; background: rgba(255,164,36,.18); color: #ffa424; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.list .it.done { opacity: .45; }
.list .it.done .n { text-decoration: line-through; }
.list .it.done .a { background: #2f9e5b; color: #fff; }
.list .foot { font-size: 11px; opacity: .55; margin-top: 6px; }

.map { position: absolute; left: 18px; bottom: 18px; padding: 10px; }
.map canvas { display: block; width: 230px; height: 190px; border-radius: 10px; }

.toasts { position: absolute; top: 76px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.toast { padding: 9px 16px; font-size: 14px; animation: tin .3s ease; max-width: 560px; text-align: center; }
.toast.pa { background: rgba(255,164,36,.92); color: #17001e; border: 0; }
.toast.out { opacity: 0; transform: translateY(-6px); transition: all .4s; }
@keyframes tin { from { opacity: 0; transform: translateY(-8px) } }

.bubble { position: absolute; transform: translate(-50%, -100%); background: #fff; color: #17001e; padding: 7px 12px; border-radius: 14px;
  font-size: 13px; white-space: nowrap; box-shadow: 0 6px 18px rgba(0,0,0,.3); animation: bin .25s ease; transition: opacity .3s; }
.bubble:after { content: ""; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: #fff; }
@keyframes bin { from { transform: translate(-50%, -80%) scale(.8); opacity: 0 } }

.prompt { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); padding: 12px 18px; font-size: 15px; opacity: 0; transition: opacity .2s; }
.prompt.on { opacity: 1; }
.doom { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font: 40px/1 Impact, "Arial Black", "Helvetica Neue", sans-serif; letter-spacing: .02em; color: #e8231a;
  text-shadow: 3px 3px 0 #3a0000, -1px -1px 0 #ff8a5c, 0 0 24px rgba(255,40,0,.55); opacity: 0; }
.doom.on { animation: doom 3.8s steps(1, end) forwards, doomfade 3.8s ease forwards; }
@keyframes doom { 0%, 6%, 12% { color: #ffd23a; } 3%, 9%, 15%, 100% { color: #e8231a; } }
@keyframes doomfade { 0% { opacity: 0; transform: translateX(-50%) scale(1.25); } 4% { opacity: 1; transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
.cartw.god { border-color: rgba(255,200,60,.8); box-shadow: 0 0 0 1px rgba(255,200,60,.5), 0 0 28px rgba(255,170,30,.55), 0 12px 40px rgba(0,0,0,.35); }
.cartw .godtag { display: none; margin-left: auto; font: 11px/1 Impact, "Arial Black", sans-serif; letter-spacing: .08em; color: #1a0f00;
  background: linear-gradient(#ffe27a, #ffb21e); padding: 4px 7px; border-radius: 6px; }
.cartw.god .godtag { display: inline-block; }
.flash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 60%, rgba(255,164,36,.25), transparent 60%); opacity: 0; transition: opacity .5s; }
.flash.on { opacity: 1; transition: none; }

.screen { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(1200px 700px at 50% 40%, rgba(29,20,41,.55), rgba(18,12,23,.92));
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: opacity .4s; pointer-events: auto; }
.screen.hidden { opacity: 0; pointer-events: none; }
.card { width: min(640px, 92vw); padding: 36px 40px; text-align: center; }
.logo { display: inline-flex; align-items: center; gap: 12px; font-size: 54px; color: #ffa424; line-height: 1; }
.logo span { font-size: 18px; background: #faf7f0; color: #17001e; padding: 6px 10px; border-radius: 10px; transform: rotate(-6deg); }
.sub { font-size: 18px; opacity: .85; margin: 14px 0 22px; }
.bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffa424, #ffd27a); transition: width .3s; border-radius: 4px; }
.status { font-size: 13px; opacity: .7; margin-top: 8px; min-height: 18px; }
.keys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 22px; text-align: left; margin: 24px 0; font-size: 13.5px; }
.keys div { display: flex; gap: 10px; align-items: center; }
.keys div kbd { flex: none; }
.btn { pointer-events: auto; font: 16px/1 ABCGintoNord-Bold, system-ui, sans-serif; border: 0; border-radius: 999px; padding: 15px 28px; cursor: pointer;
  background: #ffa424; color: #17001e; box-shadow: 0 8px 24px rgba(255,164,36,.3); transition: transform .12s, opacity .2s, background .2s; }
.btn:hover { transform: translateY(-1px); background: #ffb340; }
.btn:disabled { opacity: .4; cursor: progress; transform: none; }
.btn.ghost { background: rgba(255,255,255,.1); color: #faf7f0; box-shadow: none; }
.btn.ghost:hover { background: rgba(255,255,255,.18); }
.btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.fine { font-size: 12px; opacity: .6; margin-top: 18px; line-height: 1.6; }

.receipt { width: min(420px, 92vw); background: #fffdf8; color: #222; border-radius: 6px 6px 0 0; padding: 26px 26px 18px; position: relative;
  font: 13px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; box-shadow: 0 30px 80px rgba(0,0,0,.5); animation: rin .5s cubic-bezier(.2,.9,.3,1.2); }
.receipt:after { content: ""; position: absolute; left: 0; right: 0; bottom: -12px; height: 12px;
  background: linear-gradient(-45deg, transparent 8px, #fffdf8 0) 0 0/16px 12px, linear-gradient(45deg, transparent 8px, #fffdf8 0) 0 0/16px 12px; }
@keyframes rin { from { transform: translateY(40px); opacity: 0 } }
.receipt h2 { font: 26px/1 ABCGintoNord-Bold, system-ui, sans-serif; color: #17001e; text-align: center; margin: 0 0 4px; }
.receipt .meta { text-align: center; font-size: 11px; color: #777; margin-bottom: 14px; }
.receipt .lines { max-height: 40vh; overflow: auto; border-top: 1px dashed #bbb; border-bottom: 1px dashed #bbb; padding: 8px 0; }
.receipt .ln { display: flex; gap: 8px; animation: lin .2s ease; }
.receipt .ln .q { width: 26px; color: #888; }
.receipt .ln .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes lin { from { opacity: 0; transform: translateX(-6px) } }
.receipt .sum { display: flex; justify-content: space-between; font: 20px/1 ABCGintoNord-Bold, system-ui, sans-serif; color: #17001e; margin: 14px 0 6px; }
.receipt .barcode { height: 38px; margin: 12px auto 16px; width: 70%; background: repeating-linear-gradient(90deg, #222 0 2px, transparent 2px 4px, #222 4px 5px, transparent 5px 8px, #222 8px 11px, transparent 11px 12px); }
.receipt .btn { width: 100%; margin-top: 8px; }
.receipt .btn.ghost { background: #f1ece2; color: #17001e; }
.receipt .msg { text-align: center; font-size: 12.5px; margin-top: 10px; min-height: 18px; }
.receipt .msg.ok { color: #1f7a3f; }
.receipt .msg.err { color: #c4121a; }
.confetti { position: absolute; width: 10px; height: 14px; top: -20px; animation: fall linear forwards; }
@keyframes fall { to { transform: translateY(110vh) rotate(720deg); } }
`;

const KEYS = [
  ['W A S D', 'Gå'], ['Mus', 'Titta runt'], ['Shift', 'Spring'], ['Klick', 'Plocka vara'],
  ['R', 'Lägg tillbaka senaste'], ['E', 'Betala i kassan'], ['M', 'Ljud av/på'], ['Esc', 'Paus'],
];

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Hud {
  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'mathem-irl-game';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root = el('div', 'root');
    this.shadow.append(style, this.root);

    this.hud = el('div', 'hud hidden');
    this.cross = el('div', 'crosshair', '<i></i>');
    this.tip = el('div', 'tip glass');
    this.loc = el('div', 'loc glass');
    this.loc.style.opacity = '0';
    this.cartw = el('div', 'cartw glass', `
      <div class="row"><div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 8H6"/></svg><b>0</b></div>
      <div><div class="lbl">Din vagn</div><div class="total bold">0,00 kr</div></div><span class="godtag">IDDQD</span></div>
      <div class="thumbs"></div>`);
    this.list = el('div', 'list glass');
    this.list.style.display = 'none';
    this.map = el('div', 'map glass');
    this.mapCanvas = el('canvas');
    this.mapCanvas.width = 460;
    this.mapCanvas.height = 380;
    this.map.append(this.mapCanvas);
    this.toasts = el('div', 'toasts');
    this.bubbles = el('div');
    this.prompt = el('div', 'prompt glass');
    this.flashEl = el('div', 'flash');
    this.doomEl = el('div', 'doom');
    this.hud.append(this.flashEl, this.doomEl, this.bubbles, this.cross, this.tip, this.loc, this.cartw, this.list, this.map, this.toasts, this.prompt);

    this.intro = el('div', 'screen');
    this.intro.innerHTML = `
      <div class="card glass">
        <div class="logo bold">IRL <span class="bold">mode</span></div>
        <div class="sub">Mathems sortiment – i första person.</div>
        <div class="bar"><i></i></div>
        <div class="status">Öppnar butiken…</div>
        <div class="keys">${KEYS.map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div>
        <div class="btns"><button class="btn start" disabled>Fyller hyllorna…</button><button class="btn ghost exit">Avsluta</button></div>
        <div class="fine">Inofficiellt fanprojekt. Not affiliated with or endorsed by Mathem.<br>Sortiment och priser hämtas live från mathem.se</div>
      </div>`;
    this.pause = el('div', 'screen hidden');
    this.pause.innerHTML = `
      <div class="card glass">
        <div class="logo bold" style="font-size:40px">Pausad</div>
        <div class="keys">${KEYS.map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div>
        <div class="btns"><button class="btn resume">Fortsätt handla</button><button class="btn ghost exit">Avsluta IRL-läge</button></div>
      </div>`;
    this.modal = el('div', 'screen hidden');
    this.root.append(this.hud, this.intro, this.pause, this.modal);

    this.bubbleMap = new Map();
    this.lastLoc = '';
    this.tipKey = null;
  }

  mount(canvas) {
    canvas.classList.add('gl');
    this.root.prepend(canvas);
    document.documentElement.appendChild(this.host);
  }

  on(sel, fn) {
    for (const s of [this.intro, this.pause, this.modal]) s.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); }));
  }

  progress(done, total, text) {
    this.intro.querySelector('.bar i').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
    if (text) this.intro.querySelector('.status').textContent = text;
  }

  ready(label = 'Börja handla') {
    const b = this.intro.querySelector('.start');
    b.disabled = false;
    b.textContent = label;
  }

  showIntro(v) { this.intro.classList.toggle('hidden', !v); }
  showPause(v) { this.pause.classList.toggle('hidden', !v); }
  showHud(v) { this.hud.classList.toggle('hidden', !v); }

  target(entry) {
    this.cross.classList.toggle('on', !!entry);
    const key = entry ? entry.p.id : null;
    if (key === this.tipKey) return;
    this.tipKey = key;
    if (!entry) { this.tip.classList.remove('on'); return; }
    const p = entry.p;
    this.tip.innerHTML = `
      <img src="${esc(p.image)}" alt="">
      <div style="min-width:0">
        <div class="brand">${esc(p.brand)}</div>
        <div class="name bold">${esc(p.name)}</div>
        <div class="extra">${esc(p.extra)}</div>
        <div class="price bold">${formatPrice(p.price)}${p.oldPrice && p.oldPrice > p.price ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ''}</div>
        ${p.unitPrice ? `<div class="unit">${formatPrice(p.unitPrice)}/${esc(p.unitAbbr)}</div>` : ''}
        ${p.promo ? `<div class="promo bold">${esc(p.promo)}</div>` : ''}
        <div class="hint"><kbd>Klick</kbd> lägg i vagnen</div>
      </div>`;
    this.tip.classList.add('on');
  }

  location(info) {
    let key = '', html = '';
    if (info?.type === 'aisle') {
      const a = info.aisle;
      key = 'a' + a.index;
      html = `<div class="num bold">${a.index + 1}</div><div class="t bold"><small>Gång ${a.index + 1}</small>${esc(a.leftTitle)} · ${esc(a.rightTitle)}</div>`;
    } else if (info?.type === 'zone') {
      key = 'z' + info.name;
      html = `<div class="num zone bold">${esc(info.name)}</div><div class="t bold"><small>IRL mode</small>Välkommen!</div>`;
    }
    if (key === this.lastLoc) return;
    this.lastLoc = key;
    this.loc.innerHTML = html;
    this.loc.style.opacity = html ? '1' : '0';
    this.loc.classList.remove('pop');
    void this.loc.offsetWidth;
    this.loc.classList.add('pop');
  }

  cart(items, total, added) {
    const count = items.reduce((n, i) => n + i.qty, 0);
    this.cartw.querySelector('b').textContent = count;
    this.cartw.querySelector('.total').textContent = formatPrice(total);
    const th = this.cartw.querySelector('.thumbs');
    th.innerHTML = items.slice(-7).map((i) => `<img src="${esc(i.entry.p.image)}" alt="">`).join('');
    if (added) {
      this.cartw.classList.remove('bump');
      void this.cartw.offsetWidth;
      this.cartw.classList.add('bump');
    }
  }

  shoppingList(items, elapsed) {
    if (!items?.length) { this.list.style.display = 'none'; return; }
    this.list.style.display = '';
    const done = items.filter((i) => i.done).length;
    const t = Math.floor(elapsed);
    const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const html = `<h3 class="bold">Inköpslista <span>${done}/${items.length} · ${time}</span></h3>` +
      items.map((i) => `<div class="it ${i.done ? 'done' : ''}"><img src="${esc(i.entry.p.image)}" alt=""><div class="n">${esc(i.entry.p.fullName)}</div><div class="a bold">${i.done ? '✓' : i.aisle ? 'Gång ' + i.aisle : 'Kampanj'}</div></div>`).join('') +
      `<div class="foot">${done === items.length ? 'Klart! Gå till kassan 🎉' : 'Hitta varorna i butiken'}</div>`;
    if (html !== this._listHtml) { this.list.innerHTML = html; this._listHtml = html; }
  }

  toast(text, kind = '', ms = 3200) {
    const t = el('div', `toast glass bold ${kind}`, esc(text));
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  say(id, text) {
    let b = this.bubbleMap.get(id);
    if (!b) {
      b = { el: el('div', 'bubble bold'), until: 0 };
      this.bubbles.append(b.el);
      this.bubbleMap.set(id, b);
    }
    b.el.textContent = text;
    b.until = performance.now() + 3200;
  }

  updateBubbles(project) {
    const now = performance.now();
    for (const [id, b] of this.bubbleMap) {
      if (now > b.until) { b.el.remove(); this.bubbleMap.delete(id); continue; }
      const p = project(id);
      if (!p) { b.el.style.opacity = '0'; continue; }
      b.el.style.opacity = '1';
      b.el.style.left = `${p.x}px`;
      b.el.style.top = `${p.y}px`;
      b.el.style.fontSize = `${Math.max(11, Math.min(15, 15 - p.d * 0.4))}px`;
    }
  }

  setPrompt(html) {
    this.prompt.classList.toggle('on', !!html);
    if (html && html !== this._prompt) this.prompt.innerHTML = html;
    this._prompt = html;
  }

  doomMessage(text) {
    this.doomEl.textContent = text;
    this.doomEl.classList.remove('on');
    void this.doomEl.offsetWidth;
    this.doomEl.classList.add('on');
  }

  godMode(on) { this.cartw.classList.toggle('god', on); }

  flash() {
    this.flashEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove('on')));
  }

  confetti() {
    const colors = ['#ffa424', '#faf7f0', '#e5262d', '#2f9e5b', '#8b5cf6', '#3d6fd1'];
    for (let i = 0; i < 90; i++) {
      const c = el('div', 'confetti');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      this.root.append(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  /** Receipt modal. Returns controller with callbacks. */
  receipt(lines, total, { onReal, onClose, onClear, beep }) {
    const now = new Date();
    this.modal.innerHTML = `
      <div class="receipt">
        <h2>mathem</h2>
        <div class="meta">KVITTO · ${now.toLocaleDateString('sv-SE')} ${now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · KASSA ${1 + ((Math.random() * 4) | 0)}</div>
        <div class="lines"></div>
        <div class="sum"><span>TOTALT</span><span class="tot">0,00 kr</span></div>
        <div style="font-size:11px;color:#888;display:flex;justify-content:space-between"><span>varav moms (12%)</span><span>${formatPrice(total - total / 1.12)}</span></div>
        <div class="barcode"></div>
        <button class="btn real">Lägg i min Mathem-varukorg</button>
        <button class="btn ghost close">Fortsätt handla</button>
        <button class="btn ghost clear">Töm vagnen</button>
        <div class="msg"></div>
      </div>`;
    this.modal.classList.remove('hidden');
    const box = this.modal.querySelector('.lines');
    const tot = this.modal.querySelector('.tot');
    let i = 0, run = 0;
    const timer = setInterval(() => {
      if (i >= lines.length) { clearInterval(timer); return; }
      const l = lines[i++];
      run += l.qty * l.entry.p.price;
      const row = el('div', 'ln', `<span class="q">${l.qty}×</span><span class="nm">${esc(l.entry.p.fullName)}</span><span>${formatPrice(l.qty * l.entry.p.price)}</span>`);
      box.append(row);
      box.scrollTop = box.scrollHeight;
      tot.textContent = formatPrice(run);
      beep?.();
    }, 140);
    const msg = this.modal.querySelector('.msg');
    const realBtn = this.modal.querySelector('.real');
    realBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      realBtn.disabled = true;
      realBtn.textContent = 'Lägger till…';
      try {
        await onReal();
        msg.className = 'msg ok';
        msg.innerHTML = '✓ Varorna ligger nu i din varukorg på mathem.se';
        realBtn.textContent = 'Gå till varukorgen →';
        realBtn.disabled = false;
        realBtn.onclick = () => { window.location.href = '/se/cart/'; };
      } catch (err) {
        msg.className = 'msg err';
        msg.textContent = `Kunde inte lägga till (${err.message}). Är du inloggad?`;
        realBtn.disabled = false;
        realBtn.textContent = 'Försök igen';
      }
    }, { once: true });
    this.modal.querySelector('.close').addEventListener('click', (e) => { e.stopPropagation(); clearInterval(timer); this.closeModal(); onClose(); });
    this.modal.querySelector('.clear').addEventListener('click', (e) => { e.stopPropagation(); clearInterval(timer); this.closeModal(); onClear(); });
  }

  closeModal() { this.modal.classList.add('hidden'); this.modal.innerHTML = ''; }
  get modalOpen() { return !this.modal.classList.contains('hidden'); }

  drawMap(store, player, npcs, targets, t) {
    const c = this.mapCanvas;
    const ctx = c.getContext('2d');
    const { minX, maxX, minZ, maxZ } = store.bounds;
    const pad = 14;
    const s = Math.min((c.width - pad * 2) / (maxX - minX), (c.height - pad * 2) / (maxZ - minZ));
    const ox = (c.width - (maxX - minX) * s) / 2, oz = (c.height - (maxZ - minZ) * s) / 2;
    const X = (x) => ox + (x - minX) * s, Z = (z) => oz + (z - minZ) * s;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(250,247,240,.08)';
    ctx.beginPath();
    ctx.roundRect(X(minX), Z(minZ), (maxX - minX) * s, (maxZ - minZ) * s, 8);
    ctx.fill();
    for (const f of store.faces) {
      if (f.kind !== 'aisle') continue;
      const x0 = f.origin.x, x1 = f.origin.x - f.normal.x * 0.55;
      ctx.fillStyle = f.set.ready ? f.set.color : 'rgba(255,255,255,.2)';
      ctx.fillRect(X(Math.min(x0, x1)), Z(store.zBack), Math.abs(x1 - x0) * s, (store.zFront - store.zBack) * s);
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (const ck of store.checkouts) ctx.fillRect(X(ck.x0), Z(ck.z0), (ck.x1 - ck.x0) * s, (ck.z1 - ck.z0) * s);
    ctx.font = `bold 15px ABCGintoNord-Bold, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of store.aisles) {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillText(String(a.index + 1), X(a.x), Z(store.zFront + 0.9));
    }
    ctx.fillStyle = '#ffa424';
    ctx.fillRect(X(store.doorX - 1.6), Z(maxZ) - 4, 3.2 * s, 4);
    // targets
    const pulse = 4 + Math.sin(t * 5) * 1.5;
    for (const p of targets) {
      ctx.fillStyle = 'rgba(255,164,36,.35)';
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), pulse + 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffa424';
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(220,220,230,.75)';
    for (const n of npcs) { ctx.beginPath(); ctx.arc(X(n.x), Z(n.z), 3.2, 0, 7); ctx.fill(); }
    // player arrow
    ctx.save();
    ctx.translate(X(player.x), Z(player.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#17001e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  destroy() { this.host.remove(); }
}
