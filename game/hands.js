import * as THREE from './vendor/three/build/three.module.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BASKET } from './cart.js';
import { makeItemMesh } from './store.js';

// Hand-local frame: wrist at the origin, fingers along -Z, palm facing -Y.
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const skin = new THREE.MeshStandardMaterial({ color: 0xeab79a, roughness: 0.55, metalness: 0 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b1838, roughness: 0.85 });
const cuff = new THREE.MeshStandardMaterial({ color: 0xffa424, roughness: 0.7 });
const nail = new THREE.MeshStandardMaterial({ color: 0xf4d2c2, roughness: 0.3 });

function segment(r0, r1, len, mat) {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, len, 4, 10);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -len / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function buildHand(side) {
  const root = new THREE.Group();
  const vis = new THREE.Group();
  vis.scale.setScalar(1.18);
  root.add(vis);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.03, 0.096, 3, 0.012), skin);
  palm.position.set(0, 0, -0.05);
  palm.castShadow = true;
  vis.add(palm);
  const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.06, 3, 8).rotateZ(Math.PI / 2), skin);
  knuckles.position.set(0, 0.002, -0.094);
  vis.add(knuckles);

  const fingers = [];
  const spec = [
    [-0.03, 0.068], [-0.01, 0.076], [0.01, 0.072], [0.03, 0.058],
  ];
  for (const [fx, len] of spec) {
    const j1 = new THREE.Group();
    j1.position.set(fx * side, 0, -0.098);
    j1.rotation.y = -fx * side * 0.6;
    const s1 = segment(0.0095, 0.009, len * 0.52, skin);
    j1.add(s1);
    const j2 = new THREE.Group();
    j2.position.set(0, 0, -len * 0.52);
    const s2 = segment(0.0088, 0.008, len * 0.4, skin);
    j2.add(s2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), nail);
    tip.position.set(0, 0.004, -len * 0.4 - 0.004);
    tip.scale.set(1, 0.5, 1);
    j2.add(tip);
    j1.add(j2);
    vis.add(j1);
    fingers.push({ j1, j2 });
  }
  const tb = new THREE.Group();
  tb.position.set(-0.042 * side, -0.006, -0.03);
  tb.rotation.set(-0.25, -0.8 * side, -0.5 * side);
  const t1 = segment(0.012, 0.011, 0.035, skin);
  tb.add(t1);
  const tj = new THREE.Group();
  tj.position.set(0, 0, -0.035);
  tj.add(segment(0.0105, 0.0095, 0.03, skin));
  tb.add(tj);
  vis.add(tb);

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 14).rotateX(Math.PI / 2), skin);
  wrist.position.set(0, 0, 0.012);
  vis.add(wrist);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.04, 16, 1, true).rotateX(Math.PI / 2), cuff);
  c.position.set(0, 0, 0.055);
  c.material.side = THREE.DoubleSide;
  vis.add(c);

  // Holder: where a held product's top-centre sits. Products are gripped from the
  // top, so they hang below the palm with their front facing back toward the wrist
  // (plane frame == hand frame).
  const holder = new THREE.Object3D();
  holder.position.set(0, -0.026, -0.06);
  root.add(holder);
  holder.updateMatrix();

  return {
    root, holder, fingers, thumb: tj, thumbBase: tb, side,
    setCurl(c) {
      for (const f of fingers) { f.j1.rotation.x = -c * 1.45; f.j2.rotation.x = -c * 1.6; }
      tj.rotation.x = -c * 0.9;
      tb.rotation.x = -0.25 - c * 0.5;
    },
  };
}

function buildArm() {
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.042, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5), sleeve);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5), sleeve);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.047, 12, 10), sleeve);
  for (const m of [upper, fore, elbow]) m.castShadow = true;
  return { upper, fore, elbow };
}

const FWD = new THREE.Vector3(0, 0, -1);
function placeBone(mesh, a, b) {
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(FWD, d.divideScalar(len || 1));
  mesh.scale.set(1, 1, len);
}

const A = 0.33, B = 0.31;
function solveIK(S, T, pole, out) {
  const d = T.clone().sub(S);
  let dist = d.length();
  const dir = d.divideScalar(dist || 1);
  const k = dist > (A + B) * 0.995 ? dist / ((A + B) * 0.995) : 1;
  const a = A * k, b = B * k;
  dist = Math.max(Math.abs(a - b) + 1e-3, dist);
  const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(S).addScaledVector(dir, a * cosA).addScaledVector(bend, a * Math.sqrt(1 - cosA * cosA));
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export class Hands {
  constructor(scene, cart, audio, camera) {
    this.scene = scene;
    this.camera = camera;
    this.cart = cart;
    this.audio = audio;
    this.right = buildHand(1);
    this.left = buildHand(-1);
    this.armR = buildArm();
    this.armL = buildArm();
    for (const o of [this.right.root, this.left.root, ...Object.values(this.armR), ...Object.values(this.armL)]) scene.add(o);
    this.holderInv = new THREE.Matrix4().copy(this.right.holder.matrix).invert();
    this.queue = [];
    this.action = null;
    this.lean = new THREE.Vector3();
    this.leanTarget = new THREE.Vector3();
    this.cartItems = [];
    this.falling = [];
    this.right.setCurl(0.8);
    this.left.setCurl(0.8);
  }

  get busy() { return !!this.action || this.queue.length > 0; }

  gripPose(side) {
    const g = this.cart.group;
    _v.set(0.155 * side, 1.034, 0.072);
    const pos = _v.clone().applyMatrix4(g.matrixWorld);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0.12 * side, 'YXZ'));
    q.premultiply(g.quaternion);
    return { pos, quat: q };
  }

  /** Wrist pose that puts the holder (held item's top-centre) at a world frame. */
  poseFromHolder(pos, planeUp, planeNormal) {
    const x = new THREE.Vector3().crossVectors(planeUp, planeNormal).normalize();
    const y = new THREE.Vector3().crossVectors(planeNormal, x).normalize();
    _m.makeBasis(x, y, planeNormal).setPosition(pos);
    _m.multiply(this.holderInv);
    const out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    _m.decompose(out.pos, out.quat, _s);
    return out;
  }

  /** Queue a pick from a shelf slot. Returns false if the queue is full. */
  pick(slot, store, onPicked) {
    if (this.queue.length >= 2) return false;
    this.queue.push({ type: 'pick', slot, store, onPicked });
    return true;
  }

  removeLast(onRemoved) {
    if (!this.cartItems.length || this.queue.length >= 2) return false;
    this.queue.push({ type: 'remove', onRemoved });
    return true;
  }

  startPick({ slot, store, onPicked }) {
    const set = slot.set;
    const entry = slot.entry;
    if (slot.remaining <= 0) return null;
    const cartG = this.cart.group;
    const f = slot.face;
    const w = slot.w, h = slot.h;
    // Where it lands in the cart (cart-local), lying flat with its top toward the front.
    // `rest` is the item's bottom edge; its top points toward the front of the basket.
    const hx = Math.max(0, BASKET.x - 0.03 - w / 2);
    const zMin = Math.min(BASKET.zFront + 0.03 + h, BASKET.zBack - 0.03);
    const rest = new THREE.Vector3(
      (Math.random() * 2 - 1) * hx,
      BASKET.floor + 0.012 + Math.min(0.3, this.cartItems.length * 0.011),
      THREE.MathUtils.lerp(zMin, BASKET.zBack - 0.03, Math.random()),
    );
    const yaw = (Math.random() - 0.5) * 0.5;
    let item = null;
    let shelfMatrix = null;

    const shelfPose = () => {
      const p = store.slotWorld(slot).addScaledVector(UP, h).addScaledVector(f.normal, 0.012);
      return this.poseFromHolder(p, UP, f.normal);
    };
    const cartForward = () => _v.set(0, 0, -1).applyQuaternion(cartG.quaternion).clone();
    const dropPose = () => {
      const fwd = cartForward();
      // hang the item just above where its bottom edge will land, then let go
      const top = rest.clone().applyMatrix4(cartG.matrixWorld).addScaledVector(UP, h + 0.1);
      return this.poseFromHolder(top, UP, fwd.negate());
    };
    const grip = () => this.gripPose(1);
    // Bring it up in front of the face for a moment before it goes in the cart.
    const showPose = () => {
      const cam = this.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const top = cam.position.clone().addScaledVector(fwd, 0.5).addScaledVector(up, h / 2 - 0.06).addScaledVector(right, -0.05);
      const n = fwd.clone().negate().addScaledVector(right, -0.15).normalize();
      return this.poseFromHolder(top, up, n);
    };

    return {
      segments: [
        { dur: 0.36, from: grip, to: shelfPose, curl: [0.8, 0.05], lift: 0.06 },
        {
          dur: 0.12, from: shelfPose, to: shelfPose, curl: [0.05, 0.62],
          end: () => {
            shelfMatrix = set.take(slot);
            if (!shelfMatrix) return;
            item = makeItemMesh(entry, set);
            this.scene.add(item);
            item.userData.shelf = shelfMatrix.clone();
            this.audio?.pick();
          },
        },
        { dur: 0.32, from: shelfPose, to: showPose, curl: [0.62, 0.62], lift: 0.04, tick: (t) => this.carryItem(item, t) },
        { dur: 0.22, from: showPose, to: showPose, curl: [0.62, 0.62], tick: () => this.carryItem(item, 1) },
        { dur: 0.42, from: showPose, to: dropPose, curl: [0.62, 0.62], lift: 0.08, tick: () => this.carryItem(item, 1) },
        {
          dur: 0.1, from: dropPose, to: dropPose, curl: [0.62, 0.1],
          tick: () => this.carryItem(item, 1),
          end: () => {
            if (!item) return;
            this.dropIntoCart(item, rest, yaw, { slot, entry, set });
            onPicked?.(entry, slot);
          },
        },
        { dur: 0.32, from: dropPose, to: grip, curl: [0.1, 0.8], lift: 0.05 },
      ],
    };
  }

  startRemove({ onRemoved }) {
    const rec = this.cartItems.pop();
    if (!rec) return null;
    const cartG = this.cart.group;
    const { mesh } = rec;
    this.falling = this.falling.filter((f) => f.item !== mesh);
    const fwd = () => _v.set(0, 0, -1).applyQuaternion(cartG.quaternion).clone();
    const itemPose = () => {
      mesh.updateWorldMatrix(true, false);
      const top = new THREE.Vector3(0, 1, 0).applyMatrix4(mesh.matrixWorld);
      return this.poseFromHolder(top.addScaledVector(UP, 0.012), fwd(), UP);
    };
    const tossPose = () => {
      const p = new THREE.Vector3(0.2, 1.42, -0.5).applyMatrix4(cartG.matrixWorld);
      return this.poseFromHolder(p.addScaledVector(UP, mesh.scale.y * 0.5), UP, fwd().negate());
    };
    let item = null;
    const grip = () => this.gripPose(1);
    return {
      segments: [
        { dur: 0.32, from: grip, to: itemPose, curl: [0.8, 0.05], lift: 0.12 },
        {
          dur: 0.1, from: itemPose, to: itemPose, curl: [0.05, 0.62],
          end: () => {
            item = mesh;
            this.scene.attach(item);
            item.updateMatrix();
            item.userData.shelf = item.matrix.clone();
          },
        },
        { dur: 0.42, from: itemPose, to: tossPose, curl: [0.62, 0.62], lift: 0.1, tick: (t) => this.carryItem(item, t) },
        {
          dur: 0.18, from: tossPose, to: tossPose, curl: [0.62, 0.0],
          tick: (t) => { this.carryItem(item, 1); item.scale.multiplyScalar(1 - t * 0.5); },
          end: () => {
            this.scene.remove(item);
            if (rec.slot) rec.set.restore(rec.slot);
            this.audio?.whoosh();
            onRemoved?.(rec.entry);
          },
        },
        { dur: 0.3, from: tossPose, to: grip, curl: [0.0, 0.8] },
      ],
    };
  }

  carryItem(item, t) {
    if (!item) return;
    // Blend from where the item was to where the hand holds it.
    const k = ease(clamp01(t / 0.3));
    const holder = this.right.holder;
    this.right.root.updateMatrixWorld(true);
    _m.copy(holder.matrixWorld);
    _m2.makeTranslation(0, -item.scale.y, 0);
    _m.multiply(_m2);
    const handPos = new THREE.Vector3(), handQ = new THREE.Quaternion();
    _m.decompose(handPos, handQ, _s);
    const shelfPos = new THREE.Vector3(), shelfQ = new THREE.Quaternion(), shelfS = new THREE.Vector3();
    item.userData.shelf.decompose(shelfPos, shelfQ, shelfS);
    item.position.lerpVectors(shelfPos, handPos, k);
    item.quaternion.slerpQuaternions(shelfQ, handQ, k);
  }

  dropIntoCart(item, rest, yaw, meta) {
    const contents = this.cart.contents;
    contents.attach(item);
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ'));
    // The plane's bottom edge is at its origin; we lie it down with its top pointing forward.
    this.falling.push({ item, v: 0, rest, target, from: item.quaternion.clone(), t: 0, yaw });
    this.cartItems.push({ mesh: item, ...meta });
  }

  update(dt, body, viewYaw = body.yaw) {
    // The torso twists toward where you look while reaching, otherwise it faces the cart.
    const want = this.action ? viewYaw : body.yaw;
    if (this.shoulderYaw === undefined) this.shoulderYaw = want;
    let d = want - this.shoulderYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.shoulderYaw += d * Math.min(1, dt * 7);
    body = { ...body, yaw: this.shoulderYaw };
    // Shoulders hang off the body, which faces the cart.
    const cartG = this.cart.group;
    cartG.updateMatrixWorld(true);
    if (!this.action && this.queue.length) {
      const next = this.queue.shift();
      const act = next.type === 'pick' ? this.startPick(next) : this.startRemove(next);
      if (act) this.action = { ...act, i: 0, t: 0 };
    }

    let rightPose = this.gripPose(1);
    let curl = 0.8;
    if (this.action) {
      const a = this.action;
      const seg = a.segments[a.i];
      a.t += dt;
      const t = clamp01(a.t / seg.dur);
      const e = ease(t);
      const p0 = seg.from(), p1 = seg.to();
      const pos = p0.pos.clone().lerp(p1.pos, e);
      if (seg.lift) pos.y += Math.sin(Math.PI * e) * seg.lift;
      rightPose = { pos, quat: p0.quat.clone().slerp(p1.quat, e) };
      curl = THREE.MathUtils.lerp(seg.curl[0], seg.curl[1], e);
      this.right.root.position.copy(rightPose.pos);
      this.right.root.quaternion.copy(rightPose.quat);
      seg.tick?.(t);
      if (t >= 1) {
        seg.end?.();
        a.i++;
        a.t = 0;
        if (a.i >= a.segments.length) this.action = null;
      }
    }
    this.right.root.position.copy(rightPose.pos);
    this.right.root.quaternion.copy(rightPose.quat);
    this.right.setCurl(curl);
    const lp = this.gripPose(-1);
    this.left.root.position.copy(lp.pos);
    this.left.root.quaternion.copy(lp.quat);

    // Lean toward far shelf targets so arms don't over-stretch.
    const sR = this.shoulder(body, 1);
    const reach = rightPose.pos.distanceTo(sR);
    if (reach > (A + B) * 0.92 && this.action) {
      _v.copy(rightPose.pos).sub(sR).setY(0);
      const excess = Math.min(0.3, reach - (A + B) * 0.92);
      this.leanTarget.copy(_v.normalize().multiplyScalar(excess));
    } else this.leanTarget.set(0, 0, 0);
    this.lean.lerp(this.leanTarget, Math.min(1, dt * 8));

    this.placeArm(this.armR, this.shoulder(body, 1), this.right, 1, body);
    this.placeArm(this.armL, this.shoulder(body, -1), this.left, -1, body);

    // Items falling into the basket
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.v += 9.8 * dt;
      const restPos = f.rest;
      const it = f.item;
      it.position.x += (restPos.x - it.position.x) * Math.min(1, dt * 10);
      it.position.z += (restPos.z - it.position.z) * Math.min(1, dt * 10);
      it.position.y -= f.v * dt;
      it.quaternion.slerpQuaternions(f.from, f.target, ease(clamp01(f.t / 0.25)));
      if (it.position.y <= restPos.y) {
        it.position.y = restPos.y;
        if (f.v > 1.2) { f.v = -f.v * 0.25; this.audio?.drop(); } else {
          it.quaternion.copy(f.target);
          this.falling.splice(i, 1);
        }
      }
    }
  }

  shoulder(body, side) {
    return new THREE.Vector3(side * 0.19, 1.36, 0.02)
      .applyAxisAngle(UP, body.yaw)
      .add(_v.set(body.x, 0, body.z))
      .add(this.lean);
  }

  placeArm(arm, S, hand, side, body) {
    hand.root.updateMatrixWorld(true);
    const wrist = new THREE.Vector3(0, 0, 0.07).applyMatrix4(hand.root.matrixWorld);
    const pole = new THREE.Vector3(side * 0.8, -1, 0.5).applyAxisAngle(UP, body.yaw);
    const E = solveIK(S, wrist, pole, new THREE.Vector3());
    placeBone(arm.upper, S, E);
    placeBone(arm.fore, E, wrist);
    arm.elbow.position.copy(E);
  }

  clearCart() {
    for (const r of this.cartItems) r.mesh.removeFromParent();
    this.cartItems.length = 0;
    this.falling.length = 0;
  }
}
