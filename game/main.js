import * as THREE from './vendor/three/build/three.module.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { loadCategories, loadCategoryProducts, loadDiscounts, addToRealCart, formatPrice } from './data.js';
import { loadBitmaps } from './images.js';
import { ensureFonts, highlightCanvas, toTexture } from './textures.js';
import { buildStore } from './store.js';
import { buildCart } from './cart.js';
import { GodMode } from './godmode.js';
import { Hands } from './hands.js';
import { Player } from './player.js';
import { Crowd } from './npc.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';

const REACH = 2.5;
const LIST_SIZE = 5;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.32 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0 - uAmount, 1.0, v);
      c.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = c;
    }`,
};

export async function startGame({ onExit } = {}) {
  const game = new Game(onExit);
  game.init().catch((err) => {
    console.error('[IRL mode]', err);
    game.hud.progress(0, 1, `Något gick fel: ${err.message}`);
  });
  return { stop: () => game.stop(), instance: game };
}

class Game {
  constructor(onExit) {
    this.onExit = onExit;
    this.hud = new Hud();
    this.disposers = [];
    this.cartLines = new Map();
    this.list = [];
    this.playing = false;
    this.started = false;
    this.clock = new THREE.Timer();
    this.time = 0;
    this.paTimer = 35;
    this.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }

  listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.disposers.push(() => target.removeEventListener(type, fn, opts));
  }

  async init() {
    const { hud } = this;
    // ---------------------------------------------------------- renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pr = this.maxPR;
    renderer.setPixelRatio(this.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    hud.mount(renderer.domElement);

    hud.on('.exit', () => this.exit());
    hud.on('.start', () => this.begin());
    hud.on('.resume', () => this.lock());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d1823);
    scene.fog = new THREE.Fog(0x2a2430, 26, 70);
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.28;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.03, 120);
    this.camera = camera;

    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x5a5048, 0.85));
    const sun = new THREE.DirectionalLight(0xfff8f0, 1.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -13;
    sc.right = sc.top = 13;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(this.pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.6, 1.05);
    composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader);
    composer.addPass(this.vignette);
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.listen(window, 'resize', () => this.resize());
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);

    // ---------------------------------------------------------- data
    hud.progress(0.05, 1, 'Hämtar kategorier från mathem.se…');
    const [categories] = await Promise.all([loadCategories(), ensureFonts()]);
    if (this.stopped) return;
    const discountsP = loadDiscounts().catch(() => []);
    const posters = await Promise.race([
      loadBitmaps(categories.map((c) => c.image)),
      new Promise((r) => setTimeout(() => r([]), 5000)),
    ]);
    if (this.stopped) return;

    // ---------------------------------------------------------- world
    const store = buildStore(scene, categories, { posterBitmaps: posters });
    this.store = store;
    const cart = buildCart({ detailed: true });
    cart.group.scale.setScalar(1.06);
    scene.add(cart.group);
    this.cart = cart;
    this.player = new Player(store.start, cart);
    this.hands = new Hands(scene, cart, null, camera);
    this.crowd = new Crowd(scene, store, this.player, { count: 13 });
    this.crowd.onSay = (npc, text) => this.hud.say(npc.id, text);
    this.god = new GodMode({ scene, store, cart, crowd: this.crowd, player: this.player, hud, audio: () => this.audio });
    this.crowd.onScan = (c, npc) => {
      if (!this.audio) return;
      const d = Math.hypot(this.player.x - c.register.x, this.player.z - c.register.z);
      if (d < 7) for (let i = 0; i < Math.min(8, npc.itemsInCart + 2); i++) this.audio.beep(i * 0.35 + Math.random() * 0.1);
    };
    const hl = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: toTexture(highlightCanvas()), transparent: true, depthWrite: false, toneMapped: false }),
    );
    hl.material.color.setScalar(2.2);
    hl.visible = false;
    scene.add(hl);
    this.highlight = hl;
    this.player.update(0, store.colliders, [], false);

    this.setupInput();

    // ---------------------------------------------------------- products, streamed in
    // Always load the section nearest the player next, so the aisle you're in
    // (or walking toward) fills first. End-cap offers count as near the front.
    const queue = [
      ...categories.map((c, i) => ({ key: c.id, x: store.aisles[Math.floor(i / 2)].x, z: 0, load: () => loadCategoryProducts(c) })),
      { key: 'promo', x: this.player.x, z: store.zFront, load: () => discountsP },
    ];
    const nextJob = () => {
      const { x, z } = this.player;
      let bi = 0, bd = Infinity;
      queue.forEach((j, i) => {
        const d = Math.abs(j.x - x) + Math.abs(j.z - z) * 0.3;
        if (d < bd) { bd = d; bi = i; }
      });
      return queue.splice(bi, 1)[0];
    };
    let done = 0;
    const total = queue.length;
    let readyShown = false;
    const markReady = () => {
      if (readyShown || this.stopped) return;
      readyShown = true;
      hud.ready();
    };
    setTimeout(markReady, 12000);
    const worker = async () => {
      while (queue.length && !this.stopped) {
        const job = nextJob();
        const set = store.sets.get(job.key);
        try {
          const products = await job.load();
          const bitmaps = await loadBitmaps(products.map((p) => p.image));
          if (this.stopped) return;
          set.populate(products, bitmaps, store.root);
        } catch (err) {
          console.warn('[IRL mode] category failed', job.key, err);
        }
        done++;
        hud.progress(done, total, done < total ? `Fyller hyllorna… ${done}/${total} avdelningar` : `${this.countProducts()} varor på plats`);
        if (done >= Math.min(total, 3)) markReady();
        if (!this.list.length && done >= Math.min(total, 8)) this.makeList();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!this.list.length) this.makeList();
    markReady();
  }

  countProducts() {
    let n = 0;
    for (const s of this.store.sets.values()) n += s.entries.length;
    return n;
  }

  makeList() {
    const sets = [...this.store.sets.values()].filter((s) => s.ready && s.key !== 'promo' && s.slots.length);
    const picks = [];
    const shuffled = sets.sort(() => Math.random() - 0.5);
    for (const s of shuffled) {
      if (picks.length >= LIST_SIZE) break;
      const entries = s.entries.filter((e) => s.slots.some((sl) => sl.entry === e));
      if (!entries.length) continue;
      const e = entries[(Math.random() * entries.length) | 0];
      const face = s.slots.find((sl) => sl.entry === e).face;
      picks.push({ entry: e, done: false, aisle: face.aisle !== undefined ? face.aisle + 1 : null });
    }
    this.list = picks;
    this.listStart = null;
  }

  // The canvas lives in a shadow root, so document.pointerLockElement is retargeted to the host.
  isLocked() {
    return this.hud.shadow.pointerLockElement === this.renderer.domElement || document.pointerLockElement === this.renderer.domElement;
  }

  setupInput() {
    const canvas = this.renderer.domElement;
    const player = this.player;
    const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyR', 'KeyM', 'Space', 'Tab']);
    this.listen(window, 'keydown', (e) => {
      if (!this.started) return;
      if (gameKeys.has(e.code)) { e.preventDefault(); e.stopPropagation(); }
      if (e.code === 'Escape' && this.isLocked()) { document.exitPointerLock(); return; }
      if (!this.playing) return;
      player.keys.add(e.code);
      if (e.repeat) return;
      if (e.key?.length === 1) {
        this.typed = ((this.typed || '') + e.key.toUpperCase()).slice(-5);
        if (this.typed === 'IDDQD') { this.typed = ''; this.god.toggle(); }
      }
      if (e.code === 'KeyR') this.removeLast();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyM') {
        const m = this.audio?.toggleMute();
        this.hud.toast(m ? 'Ljud av' : 'Ljud på');
      }
    }, true);
    this.listen(window, 'keyup', (e) => {
      player.keys.delete(e.code);
      if (this.started && gameKeys.has(e.code)) e.stopPropagation();
    }, true);
    this.listen(window, 'blur', () => player.keys.clear());
    this.listen(document, 'mousemove', (e) => {
      if (this.playing && this.isLocked()) player.look(e.movementX, e.movementY);
    });
    this.listen(canvas, 'mousedown', (e) => {
      if (!this.started) return;
      if (!this.isLocked()) { this.lock(); return; }
      if (e.button === 0) this.tryPick();
      if (e.button === 2) this.removeLast();
    });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(document, 'pointerlockchange', () => {
      const locked = this.isLocked();
      this.playing = locked;
      if (!locked) player.keys.clear();
      if (this.started) this.hud.showPause(!locked && !this.hud.modalOpen);
    });
  }

  lock() {
    const canvas = this.renderer.domElement;
    const fallback = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {} };
    try {
      const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
      p?.catch?.(fallback);
    } catch { fallback(); }
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.audio = new Audio();
    this.hands.audio = this.audio;
    this.hud.showIntro(false);
    this.hud.showHud(true);
    this.listStart = this.time;
    this.lock();
    setTimeout(() => this.announce(true), 2500);
  }

  announce(welcome = false) {
    if (!this.audio || this.stopped) return;
    const promo = this.store.sets.get('promo');
    let text;
    if (welcome || !promo?.entries.length) text = 'Hej och välkommen till Mathem! Trevlig handling.';
    else {
      const e = promo.entries[(Math.random() * promo.entries.length) | 0].p;
      const kr = Math.floor(e.price), ore = Math.round((e.price - kr) * 100);
      text = `Hej alla kunder! Just nu: ${e.brand ? e.brand + ' ' : ''}${e.name}${e.promo ? ', ' + e.promo : ` för bara ${kr} kronor${ore ? ' och ' + ore : ''}`}. Spana in våra kampanjhyllor!`;
    }
    this.hud.toast('📢 ' + text, 'pa', 7000);
    this.audio.announce(text);
  }

  tryPick() {
    const t = this.target;
    if (!t) return;
    if (this.hands.pick(t.slot, this.store, (entry) => this.added(entry))) {
      this.target = null;
    }
  }

  added(entry) {
    const line = this.cartLines.get(entry.p.id) || { entry, qty: 0 };
    line.qty++;
    this.cartLines.delete(entry.p.id);
    this.cartLines.set(entry.p.id, line);
    this.updateCart(true);
    this.hud.toast(`+ ${entry.p.fullName} · ${formatPrice(entry.p.price)}`);
    const li = this.list.find((i) => !i.done && i.entry.p.id === entry.p.id);
    if (li) {
      li.done = true;
      this.audio?.success();
      if (this.list.every((i) => i.done)) {
        this.hud.confetti();
        const t = Math.floor(this.time - (this.listStart ?? 0));
        this.hud.toast(`Inköpslistan klar på ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}! 🎉`, 'pa', 5000);
      }
    }
  }

  removeLast() {
    this.hands.removeLast((entry) => {
      const line = this.cartLines.get(entry.p.id);
      if (!line) return;
      line.qty--;
      if (line.qty <= 0) this.cartLines.delete(entry.p.id);
      const li = this.list.find((i) => i.done && i.entry.p.id === entry.p.id);
      if (li && !this.cartLines.has(entry.p.id)) li.done = false;
      this.updateCart(false);
      this.hud.toast(`− ${entry.p.fullName}`);
    });
  }

  updateCart(added) {
    const lines = [...this.cartLines.values()];
    const total = lines.reduce((s, l) => s + l.qty * l.entry.p.price, 0);
    this.hud.cart(lines, total, added);
  }

  checkoutAt() {
    const p = this.player;
    for (const c of this.store.checkouts) {
      if (Math.abs(p.x - c.laneX) < 0.9 && p.z > c.z0 - 0.8 && p.z < c.z1 + 0.4) return c;
    }
    return null;
  }

  interact() {
    const c = this.checkoutAt();
    if (!c) return;
    const lines = [...this.cartLines.values()];
    if (!lines.length) { this.hud.toast('Vagnen är tom – plocka något först!'); return; }
    c.playerScanning = true;
    document.exitPointerLock();
    const total = lines.reduce((s, l) => s + l.qty * l.entry.p.price, 0);
    this.hud.receipt(lines, total, {
      beep: () => this.audio?.beep(),
      onReal: async () => {
        await addToRealCart(lines.map((l) => ({ id: l.entry.p.id, quantity: l.qty })));
        this.audio?.success();
        this.hud.confetti();
      },
      onClose: () => { c.playerScanning = false; this.lock(); },
      onClear: () => {
        c.playerScanning = false;
        for (const r of this.hands.cartItems) if (r.slot) r.set.restore(r.slot);
        this.hands.clearCart();
        this.cartLines.clear();
        for (const i of this.list) i.done = false;
        this.updateCart(false);
        this.lock();
      },
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  adaptResolution(dt) {
    this.frameAcc = (this.frameAcc || 0) + dt;
    this.frames = (this.frames || 0) + 1;
    if (this.frameAcc < 1.5) return;
    const avg = this.frameAcc / this.frames;
    this.frameAcc = 0;
    this.frames = 0;
    let pr = this.pr;
    if (avg > 1 / 45 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
    else if (avg < 1 / 75 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + 0.1);
    if (pr !== this.pr) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
      this.resize();
    }
  }

  loop() {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.manual) this.tick(dt);
  }

  tick(dt) {
    this.time += dt;
    const { store, player, camera } = this;
    if (store) {
      const circles = this.crowd.circles();
      const moved = player.update(dt, store.colliders, circles, this.playing, { ghostNpcs: this.god.on });
      if (moved.bumped && !this.god.on) { this.crowd.bumped(moved.bumped); this.audio?.bump(); }
      this.god.react(dt, moved);
      this.god.update(dt, this.time);
      this.hands.update(dt, player.body, player.yaw);
      player.applyCamera(camera, this.hands.lean, this.god.shake);
      this.crowd.update(dt, this.time);
      store.update(dt, this.crowd.agents());
      this.audio?.setCartSpeed(player.speed);
      this.updateTarget();
      this.updateHud(dt);
      // keep the shadow frustum centred on the player, snapped to texels
      const snap = 26 / 2048;
      const cx = Math.round(player.x / snap) * snap, cz = Math.round(player.z / snap) * snap;
      this.sun.position.set(cx + 3, 16, cz + 2);
      this.sun.target.position.set(cx, 0, cz);
      if (this.started) {
        this.paTimer -= dt;
        if (this.paTimer <= 0) { this.paTimer = 75 + Math.random() * 45; this.announce(); }
      }
    } else {
      // slow orbit while loading
      camera.position.set(Math.sin(this.time * 0.1) * 6, 3, 18 + Math.cos(this.time * 0.1) * 3);
      camera.lookAt(0, 1.5, 0);
    }
    this.vignette.uniforms.uTime.value = this.time;
    this.composer.render(dt);
    if (!this.manual) this.adaptResolution(dt);
  }

  updateTarget() {
    const cam = this.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const busy = this.hands.action;
    const hit = (this.playing || !this.started) && !busy ? this.store.pick(cam.position, dir, REACH) : null;
    this.target = hit;
    const hl = this.highlight;
    if (hit) {
      const s = hit.slot;
      const p = this.store.slotWorld(s);
      p.addScaledVector(s.face.normal, 0.02).setY(s.y + s.h / 2);
      hl.position.copy(p);
      hl.quaternion.copy(s.face.quat);
      hl.scale.set(s.w + 0.07, s.h + 0.07, 1);
      hl.visible = true;
      hl.material.opacity = 0.75 + Math.sin(this.time * 8) * 0.25;
    } else hl.visible = false;
    this.hud.target(hit && this.started ? hit.slot.entry : null);
  }

  updateHud(dt) {
    if (!this.started) return;
    const { hud, player, store } = this;
    hud.location(store.locate(player.x, player.z));
    const c = this.checkoutAt();
    const n = [...this.cartLines.values()].reduce((s, l) => s + l.qty, 0);
    hud.setPrompt(c ? (n ? `<kbd>E</kbd> &nbsp;Betala ${n} ${n === 1 ? 'vara' : 'varor'} i kassa ${c.index + 1}` : 'Plocka varor och kom tillbaka hit för att betala') : '');
    this.listTick = (this.listTick || 0) - dt;
    if (this.listTick <= 0) {
      this.listTick = 0.1;
      const done = this.list.length && this.list.every((i) => i.done);
      if (!done && this.list.length) this.listEnd = this.time;
      hud.shoppingList(this.list, (this.listEnd ?? this.time) - (this.listStart ?? this.time));
      const targets = [];
      for (const i of this.list) {
        if (i.done) continue;
        const sl = i.entry.set.slots.find((s) => s.entry === i.entry && s.remaining > 0);
        if (sl) { const p = store.slotWorld(sl); targets.push({ x: p.x, z: p.z }); }
      }
      hud.drawMap(store, player, this.crowd.npcs, targets, this.time);
    }
    const cam = this.camera;
    const v = new THREE.Vector3();
    const byId = new Map(this.crowd.npcs.map((n) => [n.id, n]));
    hud.updateBubbles((id) => {
      const npc = byId.get(id);
      if (!npc) return null;
      v.set(npc.x, 1.95 * npc.p.scale, npc.z);
      const d = v.distanceTo(cam.position);
      if (d > 14) return null;
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, d };
    });
  }

  exit() {
    this.stop();
    this.onExit?.();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    if (this.isLocked()) document.exitPointerLock();
    this.audio?.dispose();
    this.god?.dispose();
    this.scene?.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
    });
    this.composer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.hud.destroy();
    document.documentElement.style.overflow = this.prevOverflow;
  }
}
