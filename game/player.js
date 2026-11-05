import * as THREE from './vendor/three/build/three.module.js';

const EYE = 1.6;
const WALK = 2.4, RUN = 4.2;
const CART_OFFSET = 0.52;
const MAX_CART_ANGLE = 1.85;

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Player {
  constructor(start, cart) {
    this.isPlayer = true;
    this.x = start.x;
    this.z = start.z;
    this.yaw = start.yaw;
    this.pitch = -0.3;
    this.cartYaw = start.yaw;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.bob = 0;
    this.cart = cart;
    this.keys = new Set();
    this.bumpCooldown = 0;
  }

  get body() { return { x: this.x, z: this.z, yaw: this.cartYaw }; }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.35, 1.2);
  }

  circles(x = this.x, z = this.z, cy = this.cartYaw) {
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    return [
      { x, z, r: 0.28 },
      { x: x + fx * (CART_OFFSET + 0.35), z: z + fz * (CART_OFFSET + 0.35), r: 0.3 },
      { x: x + fx * (CART_OFFSET + 0.8), z: z + fz * (CART_OFFSET + 0.8), r: 0.29 },
    ];
  }

  update(dt, colliders, others, active, { ghostNpcs = false } = {}) {
    const k = this.keys;
    let ix = 0, iz = 0;
    if (active) {
      if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    if (len) { ix /= len; iz /= len; }
    const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = (ix * c + iz * s) * sp, wz = (-ix * s + iz * c) * sp;
    const acc = len ? 9 : 7;
    this.vx += (wx - this.vx) * Math.min(1, dt * acc);
    this.vz += (wz - this.vz) * Math.min(1, dt * acc);

    // Cart follows where you walk; standing still lets you look around freely.
    const moving = Math.hypot(this.vx, this.vz);
    let diff = wrap(this.yaw - this.cartYaw);
    if (moving > 0.15 && iz <= 0) this.cartYaw += diff * Math.min(1, dt * 3.2 * Math.min(1, moving / WALK));
    diff = wrap(this.yaw - this.cartYaw);
    if (Math.abs(diff) > MAX_CART_ANGLE) this.cartYaw = wrap(this.yaw - Math.sign(diff) * MAX_CART_ANGLE);

    const px = this.x, pz = this.z;
    const pvx = this.vx, pvz = this.vz;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    let bumped = null;
    const hits = []; // shelf/wall impacts: where, which way, how hard
    const contacts = new Set();
    for (let iter = 0; iter < 4; iter++) {
      const circles = this.circles();
      for (let ci = 0; ci < circles.length; ci++) {
        const cc = circles[ci];
        for (const b of colliders) {
          const qx = Math.max(b.minX, Math.min(cc.x, b.maxX));
          const qz = Math.max(b.minZ, Math.min(cc.z, b.maxZ));
          let dx = cc.x - qx, dz = cc.z - qz;
          let d = Math.hypot(dx, dz);
          if (d >= cc.r) continue;
          let nx, nz;
          if (d < 1e-5) {
            // centre inside the box: push out along the shallowest axis
            const pen = [cc.x - b.minX, b.maxX - cc.x, cc.z - b.minZ, b.maxZ - cc.z];
            const m = pen.indexOf(Math.min(...pen));
            nx = [-1, 1, 0, 0][m]; nz = [0, 0, -1, 1][m];
            this.x += nx * (pen[m] + cc.r);
            this.z += nz * (pen[m] + cc.r);
          } else {
            nx = dx / d; nz = dz / d;
            const push = cc.r - d;
            this.x += nx * push;
            this.z += nz * push;
          }
          if (iter === 0) {
            const speed = -(pvx * nx + pvz * nz);
            if (speed > 0) hits.push({ x: qx, z: qz, nx, nz, speed, cart: ci > 0 });
          }
        }
        for (const o of others) {
          const dx = cc.x - o.x, dz = cc.z - o.z;
          const d = Math.hypot(dx, dz);
          const r = cc.r + o.r;
          if (d >= r || d < 1e-5) continue;
          if (o.npc) { bumped = o.npc; contacts.add(o.npc); }
          if (ghostNpcs && o.npc) continue; // god mode: shoppers don't stop you
          const push = (r - d) * 0.8;
          this.x += (dx / d) * push;
          this.z += (dz / d) * push;
        }
      }
    }
    // Effective velocity after collisions (for bob, audio and wheel spin)
    const ex = (this.x - px) / Math.max(dt, 1e-4), ez = (this.z - pz) / Math.max(dt, 1e-4);
    this.speed = Math.hypot(ex, ez);
    if (Math.hypot(this.vx, this.vz) > this.speed + 0.6) { this.vx = ex; this.vz = ez; }
    this.bumpCooldown -= dt;
    let bumpEvent = null;
    if (bumped && this.bumpCooldown <= 0 && moving > 0.8) { bumpEvent = bumped; this.bumpCooldown = 1.2; }

    this.bob += dt * this.speed * 2.6;
    // cart follows the body
    const fx = -Math.sin(this.cartYaw), fz = -Math.cos(this.cartYaw);
    const g = this.cart.group;
    g.position.set(this.x + fx * CART_OFFSET, 0, this.z + fz * CART_OFFSET);
    g.rotation.set(0, this.cartYaw, Math.sin(this.bob * 2.3) * 0.004 * Math.min(1, this.speed));
    const forwardSpeed = ex * fx + ez * fz;
    for (const w of this.cart.wheels) w.rotation.x -= (forwardSpeed * dt) / 0.055;
    return { bumped: bumpEvent, hits, contacts: [...contacts], impactSpeed: Math.hypot(pvx, pvz) };
  }

  applyCamera(camera, lean, shake = 0) {
    const amp = Math.min(1, this.speed / WALK);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    camera.position.set(this.x + lean.x + sx, EYE + Math.sin(this.bob * 2) * 0.022 * amp + lean.y + sy, this.z + lean.z);
    camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.005 * amp, 'YXZ');
  }
}
