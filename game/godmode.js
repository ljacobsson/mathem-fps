import * as THREE from './vendor/three/build/three.module.js';
import { addGlow } from './cart.js';
import { makeItemMesh } from './store.js';
import { collideBoxes } from './npc.js';

// IDDQD. Glowing cart, groceries fly off the shelves you ram, shoppers you hit
// fly backwards and run for it (nobody gets hurt, they just leave the store).

const MAX_DEBRIS = 350;
const G = 9.8;
const UP = new THREE.Vector3(0, 1, 0);

export class GodMode {
  constructor({ scene, store, cart, crowd, player, hud, audio }) {
    Object.assign(this, { scene, store, crowd, player, hud });
    this.audio = audio; // function returning the (lazily created) Audio
    this.glow = addGlow(cart);
    this.on = false;
    this.debris = [];
    this.cooldown = 0;
    this.shake = 0;
    this.clinks = 0;
    crowd.onThud = (npc) => {
      if (Math.hypot(npc.x - player.x, npc.z - player.z) < 12) this.audio()?.bump();
    };
  }

  toggle() {
    this.on = !this.on;
    this.glow.set(this.on);
    this.hud.doomMessage(this.on ? 'Degreelessness Mode On' : 'Degreelessness Mode Off');
    this.hud.godMode(this.on);
    const a = this.audio();
    if (a) this.on ? a.powerUp() : a.powerDown();
  }

  /** Called after the player moved, with what it bumped into this frame. */
  react(dt, { hits, contacts, impactSpeed }) {
    this.cooldown -= dt;
    if (!this.on) return;
    // ram a shelf → groceries everywhere
    let best = null;
    for (const h of hits) if (!best || h.speed > best.speed) best = h;
    if (best && best.speed > 0.7 && this.cooldown <= 0) {
      this.cooldown = 0.22;
      this.crash(best);
    }
    // hit a shopper → they fly
    if (impactSpeed > 0.4) {
      for (const npc of contacts) {
        let dx = npc.x - this.player.x, dz = npc.z - this.player.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        if (this.crowd.launch(npc, dx, dz, 4.5 + impactSpeed * 1.3)) {
          this.shake = Math.max(this.shake, 0.05);
          this.audio()?.bump();
          this.audio()?.whoosh();
        }
      }
    }
  }

  crash(hit) {
    const { store } = this;
    const radius = 0.45 + hit.speed * 0.13;
    const hp = new THREE.Vector3(hit.x, 0, hit.z);
    const picks = [];
    for (const f of store.faces) {
      if (!f.slots.length) continue;
      if (f.normal.x * hit.nx + f.normal.z * hit.nz < 0.7) continue; // facing us
      const rel = hp.clone().sub(f.origin);
      if (Math.abs(rel.dot(f.normal)) > 0.35) continue; // this face's front
      const s = rel.dot(f.tangent);
      for (const slot of f.slots) {
        if (slot.remaining <= 0 || Math.abs(slot.s - s) > radius) continue;
        // low shelves take the hit; higher ones only shake loose sometimes
        const p = slot.y < 1.1 ? 0.85 : 0.25 + hit.speed * 0.08;
        if (Math.random() < p) picks.push(slot);
      }
    }
    picks.sort(() => Math.random() - 0.5);
    let n = 0;
    for (const slot of picks.slice(0, 10 + Math.round(hit.speed * 3))) {
      const copies = Math.random() < hit.speed / 4 ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        const m = slot.set.take(slot);
        if (!m) break;
        this.spawnDebris(slot, m, hit);
        n++;
      }
    }
    this.shake = Math.max(this.shake, Math.min(0.09, 0.025 + hit.speed * 0.018));
    const a = this.audio();
    if (a) n ? a.crash(n) : a.bump();
    if (n) {
      const where = store.locate(hit.x, hit.z);
      const lines = ['Oj!', 'Vad gör du?!', 'Akta hyllorna!', 'Herregud!'];
      if (where?.type === 'aisle') lines.push(`Personal till gång ${where.aisle.index + 1}!`);
      for (const npc of this.crowd.npcs) {
        if (Math.hypot(npc.x - hit.x, npc.z - hit.z) < 5 && Math.random() < 0.5) npc.say(lines[(Math.random() * lines.length) | 0], true);
      }
    }
  }

  spawnDebris(slot, matrix, hit) {
    const mesh = makeItemMesh(slot.entry, slot.set);
    matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.scene.add(mesh);
    const f = slot.face;
    const out = 0.8 + Math.random() * 1.6 + hit.speed * 0.35;
    const v = f.normal.clone().multiplyScalar(out)
      .addScaledVector(f.tangent, (Math.random() - 0.5) * 1.8)
      .addScaledVector(UP, 0.4 + Math.random() * 1.6);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.debris.push({ mesh, v, axis, w: 4 + Math.random() * 8, rest: false, t: 0 });
    while (this.debris.length > MAX_DEBRIS) {
      const old = this.debris.shift();
      old.mesh.removeFromParent();
      old.mesh.geometry.dispose();
    }
  }

  update(dt, t) {
    this.glow.update(dt, t);
    this.shake *= Math.exp(-dt * 9);
    this.clinks = Math.max(0, this.clinks - dt * 12);
    const colliders = this.store.colliders;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      const m = d.mesh;
      if (d.rest) {
        if (d.settle < 1) {
          d.settle = Math.min(1, d.settle + dt * 6);
          m.quaternion.slerpQuaternions(d.from, d.to, d.settle);
          m.position.x += d.v.x * dt;
          m.position.z += d.v.z * dt;
          d.v.multiplyScalar(Math.exp(-dt * 10));
        }
        continue;
      }
      d.v.y -= G * dt;
      m.position.addScaledVector(d.v, dt);
      m.rotateOnWorldAxis(d.axis, d.w * dt);
      const o = { x: m.position.x, z: m.position.z };
      const h = collideBoxes(o, 0.04, colliders);
      if (h && m.position.y < 2.4) {
        m.position.x = o.x;
        m.position.z = o.z;
        const vn = d.v.x * h.nx + d.v.z * h.nz;
        if (vn < 0) { d.v.x -= 1.4 * vn * h.nx; d.v.z -= 1.4 * vn * h.nz; }
      }
      if (m.position.y <= 0.01 && d.v.y < 0) {
        m.position.y = 0.01;
        if (d.v.y < -1.3) {
          d.v.y *= -0.32;
          d.v.x *= 0.55;
          d.v.z *= 0.55;
          d.w *= 0.5;
          if (this.clinks < 6) { this.clinks++; this.audio()?.clink(); }
        } else {
          // come to rest lying flat, label up
          d.rest = true;
          d.settle = 0;
          d.from = m.quaternion.clone();
          d.to = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ'));
          m.position.y = 0.003 + (i % 24) * 0.0006; // avoid z-fighting in piles
          m.castShadow = false;
        }
      }
    }
  }

  dispose() {
    for (const d of this.debris) d.mesh.removeFromParent();
    this.debris.length = 0;
  }
}
