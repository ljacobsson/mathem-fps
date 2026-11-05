import * as THREE from './vendor/three/build/three.module.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildCart, BASKET } from './cart.js';
import { makeItemMesh } from './store.js';

const SKIN = ['#f3cfb3', '#e8b48f', '#d39a72', '#b07650', '#8c5a3c', '#6b4129', '#f7dccb'];
const HAIR = ['#1c1410', '#3b2516', '#6b4423', '#a8743f', '#d9b36c', '#e7d3a1', '#8f2f1c', '#9a9a9a', '#e9e6e1', '#2a2a40'];
const SHIRT = ['#3d6fd1', '#e5484d', '#2f9e5b', '#f2c94c', '#8b5cf6', '#f2994a', '#1f2937', '#f5f5f4', '#0ea5a4', '#db2777', '#7c2d12', '#64748b', '#a3e635', '#fda4af'];
const PANTS = ['#27364f', '#1e3a8a', '#111827', '#57534e', '#a8a29e', '#3f3f46', '#78350f', '#334155', '#c2b280'];
const SHOES = ['#f5f5f5', '#111111', '#7c4a26', '#e5484d', '#1d4ed8'];

const BUMP = ['Oj, förlåt!', 'Akta!', 'Hallå där!', 'Ursäkta!', 'Hoppsan!', 'Ser du inte vart du går?', 'Aj, min tå!'];
const BLOCKED = ['Ursäkta, får jag komma förbi?', 'Ursäkta…', 'Kan jag smita förbi?', 'Förlåt, jag ska bara…'];
const CHAT = ['Var ligger mjölken?', 'Åh, extrapris!', 'Glömde inköpslistan igen…', 'Mmm, kanelbullar.', 'Har ni havremjölk?',
  'Fredagsmys!', 'Hej hej!', 'Snygg vagn!', 'Ska det vara tacos idag?', 'Var är kaffet?!', 'Så mycket att välja på…',
  'Hej! Handlar du också?', 'Tror vi behöver mer kaffe.'];
const SCREAM = ['AAAAH!', 'Hjälp!!', 'Aaaj!', 'Vad i hela friden?!', 'NEEEJ!', 'Wooah!'];
const FLEE = ['Spring!!', 'Han har en gudvagn!', 'Ring vakten!', 'Rädda er!', 'Jag ska bara hem!', 'Inte min vagn!!', 'Hjälp, en galning!'];
const WITNESS = ['Oj!', 'Vad gör du?!', 'Herregud!', 'Är du galen?', 'Hallå!?', 'Någon ring vakten!'];
const PANIC_STATES = new Set(['airborne', 'down', 'getup', 'flee']);
const G = 9.8;

/** Pushes a circle out of the store's boxes. Returns the push normal, if any. */
export function collideBoxes(o, r, colliders) {
  let hit = null;
  for (const b of colliders) {
    const qx = Math.max(b.minX, Math.min(o.x, b.maxX)), qz = Math.max(b.minZ, Math.min(o.z, b.maxZ));
    const dx = o.x - qx, dz = o.z - qz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    let nx, nz;
    if (d < 1e-5) {
      const pen = [o.x - b.minX, b.maxX - o.x, o.z - b.minZ, b.maxZ - o.z];
      const m = pen.indexOf(Math.min(...pen));
      nx = [-1, 1, 0, 0][m]; nz = [0, 0, -1, 1][m];
      o.x += nx * (pen[m] + r); o.z += nz * (pen[m] + r);
    } else {
      nx = dx / d; nz = dz / d;
      o.x += nx * (r - d); o.z += nz * (r - d);
    }
    hit = { nx, nz };
  }
  return hit;
}

const STAFF_CHAT = ['Välkommen in!', 'Hittar du det du söker?', 'Säg till om du behöver hjälp!', 'Nyinkommet i gång 1!', 'Fyller på hyllorna…'];

const UP = new THREE.Vector3(0, 1, 0);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const matCache = new Map();
function mat(color, rough = 0.75) {
  const k = color + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k);
}

const GEO = {
  leg: new THREE.CapsuleGeometry(0.065, 0.62, 4, 10).translate(0, -0.37, 0),
  shoe: new RoundedBoxGeometry(0.12, 0.08, 0.24, 2, 0.03).translate(0, -0.74, -0.04),
  torso: new RoundedBoxGeometry(0.38, 0.58, 0.23, 3, 0.09),
  arm: new THREE.CapsuleGeometry(0.052, 0.5, 4, 10).translate(0, -0.3, 0),
  hand: new THREE.SphereGeometry(0.052, 10, 8).translate(0, -0.6, 0),
  head: new THREE.SphereGeometry(0.115, 20, 16),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
  eye: new THREE.SphereGeometry(0.014, 8, 6),
  nose: new THREE.SphereGeometry(0.018, 8, 6),
  hairShort: new THREE.SphereGeometry(0.124, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new RoundedBoxGeometry(0.24, 0.26, 0.1, 2, 0.04),
  bun: new THREE.SphereGeometry(0.06, 10, 8),
  cap: new THREE.SphereGeometry(0.127, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
  brim: new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).rotateY(Math.PI),
  glasses: new THREE.TorusGeometry(0.024, 0.005, 6, 14),
  basket: new RoundedBoxGeometry(0.42, 0.2, 0.3, 2, 0.02),
  basketHandle: new THREE.TorusGeometry(0.14, 0.008, 6, 16, Math.PI),
  apron: new THREE.PlaneGeometry(0.3, 0.42),
  box: new THREE.BoxGeometry(1, 1, 1),
};

function buildPerson({ staff = false } = {}) {
  const root = new THREE.Group();
  const scale = staff ? 1 : 0.9 + Math.random() * 0.18;
  const skin = mat(pick(SKIN), 0.6);
  const shirt = mat(staff ? '#ffa424' : pick(SHIRT));
  const pants = mat(staff ? '#2b1838' : pick(PANTS));
  const hairM = mat(pick(HAIR), 0.85);
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const hipY = 0.8;
  const hips = new THREE.Group();
  hips.position.y = hipY;
  body.add(hips);
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.095, 0, 0);
    g.add(new THREE.Mesh(GEO.leg, pants), new THREE.Mesh(GEO.shoe, mat(pick(SHOES), 0.5)));
    hips.add(g);
    return g;
  });
  const torso = new THREE.Group();
  hips.add(torso);
  const tm = new THREE.Mesh(GEO.torso, shirt);
  tm.position.y = 0.3;
  torso.add(tm);
  if (staff) {
    const apron = new THREE.Mesh(GEO.apron, mat('#2b1838'));
    apron.position.set(0, 0.2, -0.118);
    apron.rotation.y = Math.PI;
    torso.add(apron);
  }
  const neck = new THREE.Mesh(GEO.neck, skin);
  neck.position.y = 0.62;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.76;
  torso.add(head);
  head.add(new THREE.Mesh(GEO.head, skin));
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(GEO.eye, mat('#1b1b1b', 0.3));
    e.position.set(s * 0.04, 0.02, -0.103);
    head.add(e);
    return e;
  });
  const nose = new THREE.Mesh(GEO.nose, skin);
  nose.position.set(0, -0.012, -0.115);
  head.add(nose);
  const style = staff ? 'cap' : pick(['short', 'short', 'long', 'bun', 'bald', 'cap', 'long']);
  if (style !== 'bald') {
    const h = new THREE.Mesh(style === 'cap' ? GEO.cap : GEO.hairShort, style === 'cap' ? mat(staff ? '#2b1838' : pick(SHIRT)) : hairM);
    h.position.y = 0.012;
    h.rotation.x = -0.15;
    head.add(h);
    if (style === 'cap') {
      const brim = new THREE.Mesh(GEO.brim, h.material);
      brim.position.set(0, 0.03, -0.09);
      head.add(brim);
    }
    if (style === 'long') {
      const l = new THREE.Mesh(GEO.hairLong, hairM);
      l.position.set(0, -0.08, 0.07);
      head.add(l);
    }
    if (style === 'bun') {
      const bn = new THREE.Mesh(GEO.bun, hairM);
      bn.position.set(0, 0.11, 0.07);
      head.add(bn);
    }
  }
  if (Math.random() < 0.25) {
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(GEO.glasses, mat('#111', 0.3));
      g.position.set(s * 0.04, 0.02, -0.112);
      head.add(g);
    }
  }
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.235, 0.53, 0);
    g.add(new THREE.Mesh(GEO.arm, shirt), new THREE.Mesh(GEO.hand, skin));
    torso.add(g);
    return g;
  });
  // Only the big parts cast shadows; eyes, noses and glasses aren't worth a draw call each.
  for (const o of [...legs, torso, ...arms]) o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  head.children[0].castShadow = true;
  return { root, body, hips, torso, head, legs, arms, eyes, scale };
}

/** Waypoint graph over the store's corridors. */
function buildGraph(store) {
  const nodes = new Map();
  const add = (id, x, z) => nodes.set(id, { id, x, z, edges: [] });
  const link = (a, b) => { nodes.get(a).edges.push(b); nodes.get(b).edges.push(a); };
  const zFb = store.zFront + 1.75, zBb = store.zBack - 2.0;
  store.aisles.forEach((a, k) => {
    add('F' + k, a.x, zFb);
    add('B' + k, a.x, zBb);
    link('F' + k, 'B' + k);
    if (k > 0) { link('F' + k, 'F' + (k - 1)); link('B' + k, 'B' + (k - 1)); }
  });
  const nearestAisle = (x) => store.aisles.reduce((best, a) => (Math.abs(a.x - x) < Math.abs(best.x - x) ? a : best)).index;
  add('E', store.doorX, store.frontWall - 2.8);
  add('H', store.doorX, store.zFront + 3.9);
  add('OUT', store.doorX, store.frontWall + 0.8);
  link('E', 'H');
  link('E', 'OUT');
  link('H', 'F' + nearestAisle(store.doorX));
  store.checkouts.forEach((c, i) => {
    add('Q' + i, c.laneX, c.queueStart.z);
    add('X' + i, c.laneX, c.exit.z);
    link('Q' + i, 'F' + nearestAisle(c.laneX));
    link('X' + i, 'E');
  });
  return nodes;
}

function route(nodes, from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = new Set([from]);
  while (open.size) {
    let u = null;
    for (const id of open) if (u === null || dist.get(id) < dist.get(u)) u = id;
    open.delete(u);
    if (u === to) break;
    const nu = nodes.get(u);
    for (const v of nu.edges) {
      const nv = nodes.get(v);
      const d = dist.get(u) + Math.hypot(nu.x - nv.x, nu.z - nv.z);
      if (!dist.has(v) || d < dist.get(v)) { dist.set(v, d); prev.set(v, u); open.add(v); }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]);
    if (p === undefined) return [from];
    path.unshift(p);
  }
  return path;
}

let nextId = 1;

class Npc {
  constructor(world, { staff = false, kind } = {}) {
    this.id = nextId++;
    this.world = world;
    this.staff = staff;
    this.kind = kind || (staff ? 'staff' : Math.random() < 0.62 ? 'cart' : 'basket');
    this.p = buildPerson({ staff });
    world.scene.add(this.p.root);
    this.x = 0; this.z = 0; this.yaw = 0;
    this.speed = 0;
    this.maxSpeed = staff ? 1.1 : 0.95 + Math.random() * 0.45;
    this.phase = Math.random() * 10;
    this.waypoints = [];
    this.wait = 0;
    this.blocked = 0;
    this.sidestep = 0;
    this.sayCooldown = 2 + Math.random() * 8;
    this.blink = Math.random() * 4;
    this.armPose = 0; // 0 = natural swing, 1 = reach toward shelf
    this.reachSide = 1;
    this.state = 'walk';
    this.itemsInCart = 0;
    if (this.kind === 'cart') {
      this.cart = buildCart({ detailed: false });
      world.scene.add(this.cart.group);
    } else if (this.kind === 'basket') {
      const b = new THREE.Group();
      const bm = new THREE.Mesh(GEO.basket, mat('#d7262e', 0.45));
      bm.position.y = -0.12;
      const hm = new THREE.Mesh(GEO.basketHandle, mat('#2a2a2a', 0.4));
      hm.rotation.y = Math.PI / 2;
      b.add(bm, hm);
      b.position.set(0, -0.62, 0);
      b.rotation.y = Math.PI / 2;
      this.p.arms[1].add(b);
      this.basket = b;
    }
  }

  get radius() { return 0.32; }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
  }

  /** Points used for collision with the player: body, plus cart if any. */
  circles() {
    if (this.state === 'airborne') return [];
    const c = [{ x: this.x, z: this.z, r: 0.3 }];
    if (this.cart) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      c.push({ x: this.x + fx * 0.75, z: this.z + fz * 0.75, r: 0.36 });
    }
    return c;
  }

  say(text, force = false) {
    if (!force && this.sayCooldown > 0) return;
    this.sayCooldown = 6 + Math.random() * 6;
    this.world.onSay?.(this, text);
  }

  addItemToCart() {
    const set = this.world.randomSet(this.browseAisle);
    if (!set) return;
    const entry = set.entries[(Math.random() * set.entries.length) | 0];
    const holder = this.cart ? this.cart.contents : null;
    if (!holder) return;
    const m = makeItemMesh(entry, set);
    m.castShadow = false;
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    m.position.set((Math.random() - 0.5) * 0.3, BASKET.floor + 0.01 + this.itemsInCart * 0.012, -0.3 - Math.random() * 0.4);
    holder.add(m);
    this.itemsInCart++;
  }

  /** Hit by a god-mode cart: fly backwards (away along dx,dz), land, get up, flee. Nobody dies. */
  launch(dx, dz, power) {
    if (this.state === 'queue') {
      const q = this.queueCheckout.queue;
      q.splice(q.indexOf(this), 1);
    }
    if (this.cart) {
      this.world.abandonCart(this.cart, dx * power * 0.55, dz * power * 0.55);
      this.cart = null;
    }
    this.state = 'airborne';
    this.waypoints = [];
    this.vx = dx * power;
    this.vz = dz * power;
    this.vy = 3.4 + Math.random() * 1.4;
    this.air = 0;
    this.tumble = 0;
    this.spin = (6 + Math.random() * 4) * (Math.random() < 0.85 ? 1 : -1);
    this.pivot = 0.9;
    this.speed = 0;
    this.armPose = 0;
    this.yaw = Math.atan2(dx, dz); // face where the hit came from, fly backwards
    this.say(pick(SCREAM), true);
  }

  updatePanic(dt) {
    const p = this.p;
    const colliders = this.world.store.colliders;
    if (this.state === 'airborne') {
      this.vy -= G * dt;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.air += this.vy * dt;
      this.tumble += this.spin * dt;
      const hit = collideBoxes(this, 0.3, colliders);
      if (hit) {
        // bonk off shelves and walls
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        if (vn < 0) { this.vx -= 1.5 * vn * hit.nx; this.vz -= 1.5 * vn * hit.nz; this.vx *= 0.5; this.vz *= 0.5; this.world.onThud?.(this); }
      }
      if (this.air <= 0 && this.vy < 0) {
        this.air = 0;
        if (this.vy < -3) { this.vy *= -0.3; this.vx *= 0.5; this.vz *= 0.5; this.world.onThud?.(this); }
        else {
          this.state = 'down';
          this.t = 0;
          // land on the back: nearest "lying" angle to the current spin
          this.fromTumble = Math.round((this.tumble - Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 2;
        }
      }
    } else if (this.state === 'down') {
      this.t += dt;
      this.vx *= Math.exp(-6 * dt);
      this.vz *= Math.exp(-6 * dt);
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      collideBoxes(this, 0.3, colliders);
      this.pivot += (0.13 - this.pivot) * Math.min(1, dt * 12);
      this.tumble += (this.fromTumble - this.tumble) * Math.min(1, dt * 14);
      if (this.t > 0.9) { this.state = 'getup'; this.t = 0; }
    } else if (this.state === 'getup') {
      this.t += dt;
      const k = Math.min(1, this.t / 0.45);
      this.tumble = this.fromTumble * (1 - k * k * (3 - 2 * k));
      if (k >= 1) {
        this.tumble = 0;
        this.state = 'flee';
        this.t = 0;
        this.fleeFor = 4 + Math.random() * 2.5;
        this.say(pick(FLEE), true);
      }
    } else if (this.state === 'flee') {
      this.t += dt;
      // run away from the player, sliding along shelves
      const pl = this.world.player;
      let ax = this.x - pl.x, az = this.z - pl.z;
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      const sp = 3.8;
      this.x += ax * sp * dt;
      this.z += az * sp * dt;
      collideBoxes(this, 0.3, colliders);
      this.world.confine(this);
      this.yaw = lerpAngle(this.yaw, Math.atan2(-ax, -az), Math.min(1, dt * 8));
      this.phase += dt * 16;
      if (this.t > 1.5 && Math.random() < dt * 0.4) this.say(pick(FLEE));
      if (this.t > this.fleeFor) {
        // shaken: hurry out of the store
        this.state = 'walk';
        this.maxSpeed = 1.7;
        this.waypoints = this.world.pathTo(this.world.nodeNearest(this.x, this.z), 'OUT', this).concat([{ action: 'leave' }]);
      }
    }

    // pose
    const fleeing = this.state === 'flee';
    const swing = fleeing ? Math.sin(this.phase) * 0.9 : 0;
    p.legs[0].rotation.x = this.state === 'airborne' ? -0.6 : swing;
    p.legs[1].rotation.x = this.state === 'airborne' ? 0.4 : -swing;
    const flail = Math.sin(this.phase * 1.3 + 1) * 0.5;
    const armsUp = this.state === 'airborne' || fleeing ? Math.PI * 0.85 : 0.3;
    p.arms[0].rotation.set(armsUp + flail, 0, -0.35);
    p.arms[1].rotation.set(armsUp - flail, 0, 0.35);
    if (this.state === 'airborne') this.phase += dt * 20;
    p.torso.rotation.set(fleeing ? -0.25 : 0, 0, 0);
    p.hips.position.y = 0.8;
    // rotate the body around a pivot (hips in the air, near the floor when lying down)
    const pv = this.pivot * p.scale;
    const t = this.tumble || 0;
    p.body.rotation.x = t;
    p.body.position.set(0, pv - pv * Math.cos(t), -pv * Math.sin(t));
    p.head.rotation.y = 0;
    p.eyes[0].scale.y = p.eyes[1].scale.y = this.state === 'down' ? 0.15 : 1.3;
    p.root.position.set(this.x, this.air || 0, this.z);
    p.root.rotation.y = this.yaw;
    if (this.state !== 'airborne' && this.state !== 'down' && this.state !== 'getup') this.pivot = 0.9;
  }

  update(dt, t, agents) {
    this.sayCooldown -= dt;
    const p = this.p;
    if (PANIC_STATES.has(this.state)) {
      this.updatePanic(dt);
      return;
    }
    if (p.body.rotation.x) { p.body.rotation.x = 0; p.body.position.set(0, 0, 0); }
    let moving = false;
    if (this.state === 'walk' && this.waypoints.length) {
      const wp = this.waypoints[0];
      if (wp.action) {
        this.runAction(wp, dt);
      } else {
        if (wp.sx === undefined) {
          // Segment direction is fixed when the waypoint becomes current. Deriving the
          // keep-right offset from it (not from the live heading) avoids orbiting the point.
          const l = Math.hypot(wp.x - this.x, wp.z - this.z) || 1;
          wp.sx = (wp.x - this.x) / l;
          wp.sz = (wp.z - this.z) / l;
          wp.t = 0;
          wp.limit = 4 + (l / this.maxSpeed) * 3;
        }
        wp.t += dt;
        // keep right, like everyone should
        const lane = wp.noLane ? 0 : 0.38;
        const tx = wp.x - wp.sz * lane, tz = wp.z + wp.sx * lane;
        let dx = tx - this.x, dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        const passed = dx * wp.sx + dz * wp.sz < 0;
        if (d < 0.35 || passed || wp.t > wp.limit) {
          this.waypoints.shift();
        } else {
          let ux = dx / d, uz = dz / d;
          // avoidance: slow down for anyone ahead, and veer right to pass them
          let factor = 1;
          let blocker = null;
          const fwdReach = this.cart ? 1.6 : 1.1;
          this.ghost = Math.max(0, (this.ghost || 0) - dt);
          for (const a of agents) {
            if (a === this || (this.ghost > 0 && !a.isPlayer)) continue;
            const ax = a.x - this.x, az = a.z - this.z;
            const ad = Math.hypot(ax, az);
            if (ad > fwdReach + 0.4) continue;
            const ahead = (ax * ux + az * uz) / (ad || 1);
            if (ahead < 0.55) continue;
            const f = THREE.MathUtils.clamp((ad - (fwdReach - 0.5)) / 0.6, 0, 1);
            if (f < factor) { factor = f; blocker = a; }
          }
          if (blocker) {
            // both parties veer to their own right, so head-on meetings resolve themselves
            const veer = 1 - factor;
            const vx = ux * (1 - veer * 0.5) - uz * veer * 0.9, vz = uz * (1 - veer * 0.5) + ux * veer * 0.9;
            const vl = Math.hypot(vx, vz);
            ux = vx / vl; uz = vz / vl;
            factor = Math.max(factor, blocker.isPlayer ? 0 : 0.35);
          }
          if (factor < 0.4) {
            this.blocked += dt;
            if (blocker?.isPlayer && this.blocked > 1.2) this.say(pick(BLOCKED));
            // last resort against gridlock: briefly stop yielding to other shoppers
            if (this.blocked > 3 && !blocker?.isPlayer) { this.ghost = 2; this.blocked = 0; }
          } else this.blocked = Math.max(0, this.blocked - dt * 2);
          const target = this.maxSpeed * factor;
          this.speed += (target - this.speed) * Math.min(1, dt * 4);
          this.x += ux * this.speed * dt;
          this.z += uz * this.speed * dt;
          this.world.confine(this);
          const yaw = Math.atan2(-ux, -uz);
          this.yaw = lerpAngle(this.yaw, yaw, Math.min(1, dt * (this.cart ? 3 : 6)));
          moving = this.speed > 0.05;
        }
      }
    } else if (this.state === 'queue') {
      this.updateQueue(dt);
      moving = this.speed > 0.05;
    } else if (!this.waypoints.length && this.state === 'walk') {
      this.world.plan(this);
    }

    // animation
    const sp = moving ? this.speed : 0;
    this.phase += dt * (2.2 + sp * 3.2) * (sp > 0.05 ? 1 : 0);
    const swing = Math.sin(this.phase) * Math.min(1, sp / 1.1) * 0.55;
    p.legs[0].rotation.x = swing;
    p.legs[1].rotation.x = -swing;
    p.hips.position.y = 0.8 + Math.abs(Math.cos(this.phase)) * 0.02 * Math.min(1, sp);
    p.torso.rotation.y = swing * 0.12;
    this.armPoseCur = THREE.MathUtils.lerp(this.armPoseCur || 0, this.armPose, Math.min(1, dt * 5));
    const r = this.armPoseCur;
    if (this.cart) {
      p.arms[0].rotation.set(1.2 + r * (this.reachSide < 0 ? 0.55 : 0), 0, r * (this.reachSide < 0 ? -0.5 : 0));
      p.arms[1].rotation.set(1.2 + r * (this.reachSide > 0 ? 0.55 : 0), 0, r * (this.reachSide > 0 ? 0.5 : 0));
      p.torso.rotation.x = -0.12;
    } else {
      const free = this.basket ? 0 : 1;
      p.arms[0].rotation.set(-swing * 0.9 * (1 - r) + r * 1.65, 0, -0.08);
      p.arms[1].rotation.set(swing * 0.9 * free * (1 - r) + 0.05 * (1 - free), 0, 0.12 * (1 - free) + 0.08);
      p.torso.rotation.x = 0;
    }
    // blink
    this.blink -= dt;
    const bl = this.blink < 0.12 ? 0.15 : 1;
    p.eyes[0].scale.y = p.eyes[1].scale.y = bl;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    // head looks toward the player if near
    const pl = this.world.player;
    const pd = Math.hypot(pl.x - this.x, pl.z - this.z);
    let headYaw = 0;
    if (pd < 4) {
      const ang = Math.atan2(-(pl.x - this.x), -(pl.z - this.z));
      headYaw = THREE.MathUtils.clamp(wrapAngle(ang - this.yaw), -1, 1);
      if (pd < 2.5 && Math.random() < dt * 0.08) this.say(this.staff ? pick(STAFF_CHAT) : this.chatLine());
    }
    p.head.rotation.y = THREE.MathUtils.lerp(p.head.rotation.y, headYaw, Math.min(1, dt * 4));

    p.root.position.set(this.x, 0, this.z);
    p.root.rotation.y = this.yaw;
    if (this.cart) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.cart.group.position.set(this.x + fx * 0.42 * p.scale, 0, this.z + fz * 0.42 * p.scale);
      this.cart.group.rotation.y = this.yaw;
    }
  }

  chatLine() {
    const a = this.browseAisle;
    if (a && Math.random() < 0.4) {
      const t = (Math.random() < 0.5 ? a.leftTitle : a.rightTitle) || '';
      if (t) return `Behöver lite ${t.split(/[,&]/)[0].trim().toLowerCase()}.`;
    }
    return pick(CHAT);
  }

  runAction(wp, dt) {
    if (wp.action === 'browse') {
      // side is in world X; convert to the NPC's own left/right for its walking direction
      const localSide = wp.side * (Math.cos(wp.dirYaw) > 0 ? 1 : -1);
      if (wp.t === undefined) { wp.t = 0; this.reachSide = localSide; }
      wp.t += dt;
      this.speed = 0;
      // turn toward the shelf
      const shelfYaw = wp.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const turned = this.cart ? lerpAngle(this.yaw, wp.dirYaw - localSide * 0.5, Math.min(1, dt * 2)) : lerpAngle(this.yaw, shelfYaw, Math.min(1, dt * 4));
      this.yaw = turned;
      this.armPose = wp.t > 0.5 && wp.t < wp.dur - 0.3 ? 1 : 0;
      if (!wp.added && wp.t > wp.dur * 0.6) { wp.added = true; this.addItemToCart(); }
      if (wp.t >= wp.dur) { this.armPose = 0; this.waypoints.shift(); }
    } else if (wp.action === 'checkout') {
      this.waypoints.shift();
      this.world.joinQueue(this, wp.checkout);
    } else if (wp.action === 'leave') {
      this.waypoints.shift();
      this.world.despawn(this);
    } else if (wp.action === 'wait') {
      wp.t = (wp.t || 0) + dt;
      this.speed = 0;
      if (wp.t >= wp.dur) this.waypoints.shift();
    }
  }

  updateQueue(dt) {
    const c = this.queueCheckout;
    const idx = c.queue.indexOf(this);
    const target = c.register.clone().add(new THREE.Vector3(0, 0, -idx * (this.cart ? 1.7 : 1.1)));
    const dx = target.x - this.x, dz = target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.08) {
      const s = Math.min(this.maxSpeed * 0.7, d * 2);
      this.speed = s;
      this.x += (dx / d) * s * dt;
      this.z += (dz / d) * s * dt;
    } else this.speed = 0;
    this.yaw = lerpAngle(this.yaw, Math.PI, Math.min(1, dt * 4)); // face +Z (toward the exit)
    if (idx === 0 && d < 0.3) {
      this.payTime = (this.payTime || 0) + dt;
      if (this.payTime > 1 && !this.scanStarted) { this.scanStarted = true; this.world.onScan?.(c, this); }
      if (this.payTime > 4.5 + this.itemsInCart * 0.15) {
        c.queue.shift();
        this.state = 'walk';
        this.waypoints = this.world.pathTo(`X${c.index}`, 'OUT', this).concat([{ action: 'leave' }]);
        this.cart?.contents.clear();
      }
    }
  }

  dispose() {
    this.p.root.removeFromParent();
    this.cart?.group.removeFromParent();
  }
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function lerpAngle(a, b, t) { return a + wrapAngle(b - a) * t; }

export class Crowd {
  constructor(scene, store, player, { count = 14 } = {}) {
    this.scene = scene;
    this.store = store;
    this.player = player;
    this.target = count;
    this.npcs = [];
    this.graph = buildGraph(store);
    this.spawnTimer = 0;
    this.loose = [];
    this.onSay = null;
    this.onScan = null;
    store.checkouts.forEach((c) => { c.queue = []; });
    // Cashiers stand still behind their counters.
    this.cashiers = store.checkouts.map((c) => {
      const p = buildPerson({ staff: true });
      p.root.position.copy(c.cashier);
      p.root.rotation.y = -Math.PI / 2; // face the lane (+X)
      p.arms[0].rotation.x = 0.9;
      p.arms[1].rotation.x = 0.7;
      scene.add(p.root);
      return { p, c, t: Math.random() * 10 };
    });
    // Start with a store that's already busy.
    for (let i = 0; i < Math.round(count * 0.7); i++) this.spawn(true);
    for (let i = 0; i < 2; i++) this.spawn(true, { staff: true });
  }

  randomSet(aisle) {
    const sets = [...this.store.sets.values()].filter((s) => s.ready && s.entries.length);
    if (aisle) {
      const own = this.store.faces.filter((f) => f.aisle === aisle.index && f.set.ready).map((f) => f.set);
      if (own.length) return pick(own);
    }
    return sets.length ? pick(sets) : null;
  }

  nodeNearest(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.graph.values()) {
      if (n.id === 'OUT') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best.id;
  }

  pathTo(from, to, npc) {
    const ids = route(this.graph, from, to);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const n = this.graph.get(ids[i]);
      const prev = ids[i - 1];
      // Insert browse stops on aisle traversals.
      if (prev && /^[FB]\d+$/.test(prev) && /^[FB]\d+$/.test(ids[i]) && prev.slice(1) === ids[i].slice(1)) {
        const aisle = this.store.aisles[Number(ids[i].slice(1))];
        const p0 = this.graph.get(prev);
        const stops = npc.staff ? 2 : Math.random() < 0.85 ? 1 + ((Math.random() * 2) | 0) : 0;
        const zs = Array.from({ length: stops }, () => THREE.MathUtils.lerp(this.store.zBack + 1.2, this.store.zFront - 1.2, Math.random()))
          .sort((a, b) => (n.z > p0.z ? a - b : b - a));
        const dirYaw = n.z < p0.z ? 0 : Math.PI;
        for (const z of zs) {
          const side = Math.random() < 0.5 ? -1 : 1;
          out.push({ x: aisle.x + side * 0.35, z, noLane: true });
          out.push({ action: 'browse', side, dirYaw, dur: npc.staff ? 4 + Math.random() * 3 : 1.6 + Math.random() * 1.6 });
          npc.browseAisle = aisle;
        }
      }
      out.push({ x: n.x, z: n.z, noLane: n.id === 'OUT' || n.id === 'E' || /^[QX]/.test(n.id) });
    }
    return out;
  }

  plan(npc) {
    const start = this.nodeNearest(npc.x, npc.z);
    const nA = this.store.aisles.length;
    const visits = npc.staff ? 2 : 2 + ((Math.random() * 3) | 0);
    let cur = start;
    let wps = [];
    for (let i = 0; i < visits; i++) {
      const k = (Math.random() * nA) | 0;
      const fromFront = this.graph.get(cur).z > 0;
      const a = fromFront ? 'F' + k : 'B' + k, b = fromFront ? 'B' + k : 'F' + k;
      wps = wps.concat(this.pathTo(cur, a, npc), this.pathTo(a, b, npc).slice(1));
      cur = b;
    }
    if (npc.staff) {
      npc.waypoints = wps;
      return;
    }
    // pick the checkout with the shortest queue
    const c = this.store.checkouts.reduce((best, c) => (c.queue.length < best.queue.length ? c : best));
    wps = wps.concat(this.pathTo(cur, 'Q' + c.index, npc), [{ action: 'checkout', checkout: c }]);
    npc.waypoints = wps;
  }

  /** Keeps veering shoppers out of the shelves. */
  confine(npc) {
    const s = this.store;
    if (npc.z > s.zBack - 0.6 && npc.z < s.zFront + 0.6) {
      let best = s.aisles[0];
      for (const a of s.aisles) if (Math.abs(a.x - npc.x) < Math.abs(best.x - npc.x)) best = a;
      npc.x = THREE.MathUtils.clamp(npc.x, best.x - 0.85, best.x + 0.85);
    }
    npc.x = THREE.MathUtils.clamp(npc.x, s.bounds.minX + 0.6, s.bounds.maxX - 0.6);
  }

  joinQueue(npc, c) {
    npc.state = 'queue';
    npc.queueCheckout = c;
    npc.payTime = 0;
    npc.scanStarted = false;
    c.queue.push(npc);
  }

  spawn(inside = false, opts = {}) {
    const npc = new Npc(this, opts);
    if (inside) {
      const a = pick(this.store.aisles);
      const z = THREE.MathUtils.lerp(this.store.zBack + 1, this.store.zFront - 1, Math.random());
      npc.place(a.x + (Math.random() < 0.5 ? -0.4 : 0.4), z, Math.random() < 0.5 ? 0 : Math.PI);
      npc.browseAisle = a;
    } else {
      const out = this.graph.get('OUT');
      npc.place(out.x + (Math.random() - 0.5) * 0.6, out.z + 1.5, 0);
      npc.waypoints = [{ x: out.x, z: out.z, noLane: true }, ...this.pathTo('E', 'E', npc)];
    }
    this.npcs.push(npc);
    return npc;
  }

  despawn(npc) {
    npc.dispose();
    this.npcs = this.npcs.filter((n) => n !== npc);
  }

  /** A god-mode cart hit someone. */
  launch(npc, dx, dz, power) {
    if (PANIC_STATES.has(npc.state)) return false;
    npc.launch(dx, dz, power);
    // bystanders react
    for (const n of this.npcs) {
      if (n === npc || PANIC_STATES.has(n.state)) continue;
      if (Math.hypot(n.x - npc.x, n.z - npc.z) < 6 && Math.random() < 0.6) n.say(pick(WITNESS), true);
    }
    return true;
  }

  abandonCart(cart, vx, vz) {
    this.loose.push({ g: cart.group, vx, vz, w: (Math.random() - 0.5) * 5, t: 0 });
  }

  updateLoose(dt) {
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const c = this.loose[i];
      c.t += dt;
      const g = c.g;
      const o = { x: g.position.x, z: g.position.z };
      o.x += c.vx * dt;
      o.z += c.vz * dt;
      const hit = collideBoxes(o, 0.4, this.store.colliders);
      if (hit) {
        const vn = c.vx * hit.nx + c.vz * hit.nz;
        if (vn < 0) { c.vx -= 1.6 * vn * hit.nx; c.vz -= 1.6 * vn * hit.nz; c.w += (Math.random() - 0.5) * 4; }
      }
      g.position.x = o.x;
      g.position.z = o.z;
      g.rotation.y += c.w * dt;
      const f = Math.exp(-1.2 * dt);
      c.vx *= f; c.vz *= f; c.w *= f;
      // tidy away abandoned carts after a while
      if (c.t > 25) g.scale.setScalar(Math.max(0.001, 1 - (c.t - 25)));
      if (c.t > 26) { g.removeFromParent(); this.loose.splice(i, 1); }
    }
  }

  agents() { return [...this.npcs, this.player]; }

  update(dt, t) {
    const agents = this.agents();
    for (const n of this.npcs) n.update(dt, t, agents);
    this.updateLoose(dt);
    const shoppers = this.npcs.filter((n) => !n.staff).length;
    this.spawnTimer -= dt;
    if (shoppers < this.target && this.spawnTimer <= 0) {
      this.spawn(false);
      this.spawnTimer = 4 + Math.random() * 5;
    }
    for (const c of this.cashiers) {
      c.t += dt;
      const busy = c.c.queue[0]?.scanStarted || c.c.playerScanning;
      const s = busy ? Math.sin(c.t * 7) * 0.35 : Math.sin(c.t * 0.8) * 0.05;
      c.p.arms[1].rotation.set(0.8 + s, 0, busy ? Math.cos(c.t * 7) * 0.2 : 0);
      c.p.head.rotation.y = busy ? 0.4 : Math.sin(c.t * 0.3) * 0.5;
      c.p.eyes[0].scale.y = c.p.eyes[1].scale.y = (c.t % 4) < 0.12 ? 0.15 : 1;
    }
  }

  /** Collision circles of all NPCs (for the player). */
  circles() {
    const out = [];
    for (const n of this.npcs) for (const c of n.circles()) out.push({ ...c, npc: n });
    for (const c of this.cashiers) out.push({ x: c.p.root.position.x, z: c.p.root.position.z, r: 0.3 });
    return out;
  }

  bumped(npc) {
    if (npc) npc.say(pick(BUMP), npc.sayCooldown < 3);
  }

  dispose() {
    for (const n of this.npcs) n.dispose();
    for (const c of this.cashiers) c.p.root.removeFromParent();
    for (const c of this.loose) c.g.removeFromParent();
  }
}
