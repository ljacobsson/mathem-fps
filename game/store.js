import * as THREE from './vendor/three/build/three.module.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { Atlas } from './images.js';
import { approxVolume } from './data.js';
import { buildCart } from './cart.js';

export const LAYOUT = {
  aisleW: 2.9,
  gondolaD: 1.2,
  wallD: 0.62,
  length: 13.75,
  bay: 1.25,
  front: 13,
  back: 4.6,
  height: 5.6,
  endcapD: 0.55,
};
const SHELF_LEVELS = [0.14, 0.52, 0.9, 1.28, 1.66];
const ENDCAP_LEVELS = [0.14, 0.56, 0.98];
const SHELF_D = 0.5;
export const DEPTH_COPIES = 3;
const DEPTH_STEP = 0.135;
const FRONT_INSET = 0.055;

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Collects geometry per material and merges it into as few draw calls as possible. */
class Builder {
  constructor() { this.buckets = new Map(); }
  add(mat, geo) {
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, (b = []));
    b.push(geo);
    return geo;
  }
  box(mat, x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0) || 0.001, Math.abs(y1 - y0) || 0.001, Math.abs(z1 - z0) || 0.001);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(mat, g);
  }
  build(parent, { cast = true, receive = true } = {}) {
    for (const [mat, list] of this.buckets) {
      let geos = list;
      if (geos.some((g) => !g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = cast && !mat.userData.noShadow;
      mesh.receiveShadow = receive;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

function facePoint(f, s, d, y = 0, out = new THREE.Vector3()) {
  return out.copy(f.origin).addScaledVector(f.tangent, s).addScaledVector(f.normal, d).setY(y);
}

function faceBox(b, mat, f, s0, s1, d0, d1, y0, y1) {
  const a = facePoint(f, s0, d0), c = facePoint(f, s1, d1);
  return b.box(mat, Math.min(a.x, c.x), Math.max(a.x, c.x), y0, y1, Math.min(a.z, c.z), Math.max(a.z, c.z));
}

function facePlane(b, mat, f, s, d, y, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  g.applyQuaternion(f.quat);
  const p = facePoint(f, s, d, y);
  g.translate(p.x, p.y, p.z);
  return b.add(mat, g);
}

function makeFace({ origin, tangent, normal, length, levels, kind, top }) {
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return { origin, tangent, normal, length, levels, kind, top, quat, slots: [], slotsByLevel: levels.map(() => []) };
}

export function productMaterial(map, instanced = true) {
  const m = new THREE.MeshStandardMaterial({
    map, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0, envMapIntensity: 0.5,
  });
  if (instanced) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = aUv.xy + uv * aUv.zw;');
    };
    m.customProgramCacheKey = () => 'mathem-aUv';
  }
  return m;
}

/** A plane mesh for a single product (held in hand or lying in the cart). */
export function makeItemMesh(entry, set) {
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const uv = g.attributes.uv;
  const [u0, v0, du, dv] = entry.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  const m = new THREE.Mesh(g, set.itemMaterial);
  m.scale.set(entry.w, entry.h, 1);
  m.castShadow = true;
  return m;
}

function sizeFor(p, aspect) {
  const v = approxVolume(p.extra);
  let s = v ? 0.085 + 0.15 * Math.cbrt(v) : 0.2;
  s = clamp(s, 0.1, 0.34) * (0.95 + T.rand() * 0.1);
  let w, h;
  if (aspect >= 1) { w = s; h = s / aspect; } else { h = s; w = s * aspect; }
  if (w > 0.42) { h *= 0.42 / w; w = 0.42; }
  if (w < 0.05) { h *= 0.05 / w; w = 0.05; }
  return { w, h };
}

export class ProductSet {
  constructor(key, title, color) {
    this.key = key;
    this.title = title;
    this.color = color;
    this.faces = [];
    this.entries = [];
    this.slots = [];
    this.ready = false;
  }

  populate(products, bitmaps, parent) {
    const atlas = new Atlas();
    const tags = new T.TagAtlas();
    this.atlas = atlas;
    products.forEach((p, i) => {
      if (!bitmaps[i]) return;
      const a = atlas.add(bitmaps[i]);
      if (!a) return;
      const tag = tags.add(p, this.color);
      this.entries.push({ p, set: this, uv: a.uv, aspect: a.aspect, color: a.color, tag, ...sizeFor(p, a.aspect) });
    });
    const n = this.entries.length;
    if (!n) return;

    let cursor = 0;
    const slots = [];
    const runs = [];
    for (const f of this.faces) {
      const nb = Math.max(1, Math.round(f.length / LAYOUT.bay));
      const bw = f.length / nb;
      for (let bi = 0; bi < nb; bi++) {
        for (let li = 0; li < f.levels.length; li++) {
          const ceil = li < f.levels.length - 1 ? f.levels[li + 1] - 0.03 : f.top;
          const clearance = ceil - f.levels[li] - 0.03;
          let x = bi * bw + 0.035;
          const end = (bi + 1) * bw - 0.035;
          for (let guard = 0; guard < 60; guard++) {
            const e = this.entries[cursor % n];
            const k = Math.min(1, clearance / e.h);
            const w = e.w * k, h = e.h * k;
            const fw = w + 0.016;
            if (x + fw > end) break;
            let facings = clamp(Math.round(0.3 / fw), 1, 4);
            facings = Math.min(facings, Math.floor((end - x) / fw));
            runs.push({ e, f, s: x + (fw * facings) / 2, y: f.levels[li] });
            for (let j = 0; j < facings; j++) {
              const slot = { set: this, face: f, level: li, entry: e, s: x + fw * (j + 0.5), y: f.levels[li], w, h, remaining: DEPTH_COPIES, instances: [], matrices: [] };
              slots.push(slot);
              f.slots.push(slot);
              f.slotsByLevel[li].push(slot);
            }
            x += facings * fw;
            cursor++;
          }
        }
      }
    }
    this.slots = slots;

    // Product cut-outs: one instanced mesh for the whole category.
    const count = slots.length * DEPTH_COPIES;
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    geo.setAttribute('aUv', uvAttr);
    const mesh = new THREE.InstancedMesh(geo, productMaterial(atlas.texture), count);
    mesh.receiveShadow = true;
    const q = new THREE.Quaternion(), jq = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let idx = 0;
    for (const slot of slots) {
      const f = slot.face;
      for (let k = 0; k < DEPTH_COPIES; k++) {
        facePoint(f, slot.s + (T.rand() - 0.5) * 0.006, -FRONT_INSET - k * DEPTH_STEP, slot.y + 0.001, p);
        jq.setFromAxisAngle(UP, (T.rand() - 0.5) * 0.08);
        q.copy(f.quat).multiply(jq);
        sc.set(slot.w, slot.h, 1);
        const m = new THREE.Matrix4().compose(p, q, sc);
        mesh.setMatrixAt(idx, m);
        uvAttr.setXYZW(idx, ...slot.entry.uv);
        slot.instances.push(idx);
        slot.matrices.push(m);
        idx++;
      }
    }
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    parent.add(mesh);

    // Shelf-edge price tags
    const tgeo = new THREE.PlaneGeometry(0.088, 0.044);
    const tuv = new THREE.InstancedBufferAttribute(new Float32Array(runs.length * 4), 4);
    tgeo.setAttribute('aUv', tuv);
    const tmat = productMaterial(tags.texture);
    tmat.alphaTest = 0;
    tmat.alphaToCoverage = false;
    tmat.side = THREE.FrontSide;
    tmat.roughness = 0.35;
    const tmesh = new THREE.InstancedMesh(tgeo, tmat, runs.length);
    runs.forEach((r, i) => {
      facePoint(r.f, r.s, 0.0205, r.y - 0.02, p);
      tmesh.setMatrixAt(i, new THREE.Matrix4().compose(p, r.f.quat, new THREE.Vector3(1, 1, 1)));
      tuv.setXYZW(i, ...r.e.tag);
    });
    tmesh.computeBoundingSphere();
    parent.add(tmesh);
    this.tagMesh = tmesh;

    this.itemMaterial = productMaterial(atlas.texture, false);
    this.ready = true;
  }

  /** Removes the front-most copy in a slot. Returns its world matrix. */
  take(slot) {
    if (slot.remaining <= 0) return null;
    const k = DEPTH_COPIES - slot.remaining;
    slot.remaining--;
    this.mesh.setMatrixAt(slot.instances[k], ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    return slot.matrices[k];
  }

  restore(slot) {
    if (slot.remaining >= DEPTH_COPIES) return;
    slot.remaining++;
    const k = DEPTH_COPIES - slot.remaining;
    this.mesh.setMatrixAt(slot.instances[k], slot.matrices[k]);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });
}

export function buildStore(scene, categories, { posterBitmaps = [] } = {}) {
  T.resetRand(4242);
  const root = new THREE.Group();
  scene.add(root);
  const b = new Builder();
  const colliders = [];
  const addCollider = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ });

  const mats = {
    shelf: stdMat(0xf2f2f0, { roughness: 0.35, metalness: 0.3 }),
    upright: stdMat(0xc9ccd1, { roughness: 0.35, metalness: 0.6 }),
    peg: stdMat(0xffffff, { map: T.toTexture(T.pegboardTexture(), { repeat: [24, 8] }), roughness: 0.7 }),
    coolerBack: stdMat(0x24323d, { roughness: 0.5, metalness: 0.2 }),
    freezerBack: stdMat(0x2b4a63, { roughness: 0.3, metalness: 0.3 }),
    wood: stdMat(0xffffff, { map: T.toTexture(T.woodTexture(), { repeat: [6, 1] }), roughness: 0.75 }),
    woodBack: stdMat(0xf0e4d0, { roughness: 0.8 }),
    led: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe8f4ff, emissiveIntensity: 2.2 }),
    ledWarm: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2dc, emissiveIntensity: 2.4 }),
    kick: stdMat(0x2a2230, { roughness: 0.5 }),
    wall: stdMat(0xe4ddd1, { roughness: 0.9 }),
    wallDark: stdMat(0x2a2331, { roughness: 0.9 }),
    ceiling: stdMat(0x1f1a24, { roughness: 1 }),
    duct: stdMat(0x3a3440, { roughness: 0.5, metalness: 0.6 }),
    chrome: stdMat(0xdfe3e8, { roughness: 0.2, metalness: 0.9 }),
    plum: stdMat(T.BRAND.night, { roughness: 0.45 }),
    egg: stdMat(T.BRAND.eggyolk, { roughness: 0.45 }),
    belt: stdMat(0x18181b, { roughness: 0.9 }),
    white: stdMat(0xffffff, { roughness: 0.4 }),
    cardboard: stdMat(0xffffff, { map: T.toTexture(T.cardboardTexture()), roughness: 0.9 }),
    pallet: stdMat(0xffffff, { map: T.toTexture(T.woodTexture()), roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
    frame: stdMat(0x2b2b30, { roughness: 0.4, metalness: 0.6 }),
    leaf: stdMat(0x3b7a35, { roughness: 0.8, flatShading: true }),
    leaf2: stdMat(0x2e6b3a, { roughness: 0.8, flatShading: true }),
    pot: stdMat(0xd9cfc1, { roughness: 0.7 }),
    pumpkin: stdMat(0xf07a12, { roughness: 0.6 }),
    stem: stdMat(0x5a7a2a, { roughness: 0.7 }),
    red: stdMat(0xd7262e, { roughness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6fd3ff, emissiveIntensity: 1.2 }),
    green: new THREE.MeshStandardMaterial({ color: 0x103314, emissive: 0x44ff77, emissiveIntensity: 2 }),
  };
  mats.led.userData.noShadow = mats.ledWarm.userData.noShadow = mats.glass.userData.noShadow = true;

  // ------------------------------------------------------------------ layout
  const n = categories.length;
  const nAisles = Math.max(1, Math.ceil(n / 2));
  const { aisleW, gondolaD, wallD, length: Lz, front, back, height, endcapD } = LAYOUT;
  const gondolas = [];
  const aisles = [];
  let x = 0;
  gondolas.push({ x0: 0, x1: wallD, wall: -1 });
  x = wallD;
  for (let k = 0; k < nAisles; k++) {
    aisles.push({ index: k, x: x + aisleW / 2 });
    x += aisleW;
    if (k < nAisles - 1) { gondolas.push({ x0: x, x1: x + gondolaD }); x += gondolaD; }
  }
  gondolas.push({ x0: x, x1: x + wallD, wall: 1 });
  x += wallD;
  const W = x;
  const off = -W / 2;
  for (const g of gondolas) { g.x0 += off; g.x1 += off; }
  for (const a of aisles) a.x += off;
  const zF = Lz / 2, zB = -Lz / 2;
  const bounds = { minX: -W / 2, maxX: W / 2, minZ: zB - back, maxZ: zF + front };

  // ------------------------------------------------------------------ product sets & faces
  const sets = new Map();
  const promo = new ProductSet('promo', 'Extrapriser', '#e5262d');
  sets.set('promo', promo);
  const faces = [];
  categories.forEach((c, i) => {
    const theme = T.categoryTheme(c.title, i);
    c.color = theme.color;
    c.style = theme.style;
    sets.set(c.id, new ProductSet(c.id, c.title, theme.color));
  });

  const shelfStyle = (style, color) => {
    const accent = stdMat(color, { roughness: 0.4 });
    if (style === 'cooler') return { shelf: mats.shelf, back: mats.coolerBack, accent, led: mats.led };
    if (style === 'freezer') return { shelf: mats.shelf, back: mats.freezerBack, accent, led: mats.led, frost: true };
    if (style === 'wood') return { shelf: mats.wood, back: mats.woodBack, accent, led: mats.ledWarm };
    return { shelf: mats.shelf, back: mats.peg, accent };
  };

  function buildShelfFace(f, style, title, color) {
    const st = shelfStyle(style, color);
    const len = f.length;
    const lv = f.levels;
    const top = f.top;
    faceBox(b, mats.kick, f, 0, len, -SHELF_D, -0.005, 0, lv[0] - 0.03);
    faceBox(b, st.accent, f, 0, len, -0.005, 0.004, 0.02, lv[0] - 0.05);
    faceBox(b, st.back, f, 0, len, -SHELF_D - 0.03, -SHELF_D, lv[0] - 0.03, top + 0.02);
    for (const y of lv) {
      faceBox(b, st.shelf, f, 0, len, -SHELF_D, 0, y - 0.028, y);
      faceBox(b, st.accent, f, 0, len, 0, 0.019, y - 0.048, y + 0.008);
    }
    if (st.led) {
      for (let i = 1; i < lv.length; i++) faceBox(b, st.led, f, 0, len, -0.05, -0.02, lv[i] - 0.04, lv[i] - 0.03);
      faceBox(b, st.led, f, 0, len, -0.12, -0.04, top - 0.02, top - 0.005);
    }
    if (st.frost) faceBox(b, mats.white, f, 0, len, -SHELF_D, 0.02, 0.0, 0.02);
    const nb = Math.max(1, Math.round(len / LAYOUT.bay));
    for (let i = 0; i <= nb; i++) {
      const s = clamp((i * len) / nb, 0.02, len - 0.02);
      faceBox(b, mats.upright, f, s - 0.018, s + 0.018, -SHELF_D - 0.005, -SHELF_D + 0.035, 0, top + 0.02);
    }
    if (f.kind === 'aisle') {
      // end panels so the shelf ends read as solid units
      for (const s0 of [-0.025, len]) faceBox(b, mats.kick, f, s0, s0 + 0.025, -SHELF_D - 0.03, 0.03, 0, top + 0.02);
      // header board
      const tex = T.toTexture(T.headerCanvas(title, color));
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = Math.max(1, Math.round(len / 3.2));
      const hm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
      facePlane(b, hm, f, len / 2, 0.01, top + 0.2, len, 0.3);
      faceBox(b, mats.kick, f, 0, len, -0.04, 0.005, top + 0.03, top + 0.05);
      faceBox(b, mats.kick, f, 0, len, -0.04, 0.005, top + 0.35, top + 0.37);
    }
  }

  const aisleTop = SHELF_LEVELS.at(-1) + 0.38;
  const aisleFaces = [];
  aisles.forEach((a, k) => {
    const gl = gondolas[k], gr = gondolas[k + 1];
    const left = makeFace({
      origin: new THREE.Vector3(gl.x1, 0, zF), tangent: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(1, 0, 0),
      length: Lz, levels: SHELF_LEVELS, kind: 'aisle', top: aisleTop,
    });
    const right = makeFace({
      origin: new THREE.Vector3(gr.x0, 0, zF), tangent: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(-1, 0, 0),
      length: Lz, levels: SHELF_LEVELS, kind: 'aisle', top: aisleTop,
    });
    const lc = categories[2 * k], rc = categories[2 * k + 1];
    a.left = lc || null;
    a.right = rc || null;
    for (const [face, cat] of [[left, lc], [right, rc]]) {
      const set = cat ? sets.get(cat.id) : promo;
      face.set = set;
      face.title = cat ? cat.title : promo.title;
      face.aisle = k;
      set.faces.push(face);
      faces.push(face);
      aisleFaces.push(face);
      buildShelfFace(face, cat ? cat.style : 'standard', face.title, cat ? cat.color : promo.color);
    }
    a.leftTitle = left.title;
    a.rightTitle = right.title;
    a.leftColor = lc ? lc.color : promo.color;
    a.rightColor = rc ? rc.color : promo.color;
  });

  // Gondola bodies, caps, end caps
  gondolas.forEach((g, gi) => {
    if (g.wall) {
      addCollider(g.x0 - (g.wall < 0 ? 1 : 0), g.x1 + (g.wall > 0 ? 1 : 0), zB - 0.05, zF + 0.05);
      const sx = g.wall < 0 ? g.x0 : g.x1;
      // side panels at the ends of wall units
      for (const z of [zF, zB]) b.box(mats.kick, Math.min(sx, g.wall < 0 ? g.x1 : g.x0), Math.max(sx, g.wall < 0 ? g.x1 : g.x0), 0, aisleTop + 0.4, z - 0.02, z + 0.02);
      return;
    }
    b.box(mats.kick, g.x0 + 0.02, g.x1 - 0.02, aisleTop, aisleTop + 0.02, zB, zF);
    addCollider(g.x0, g.x1, zB - endcapD - 0.02, zF + endcapD + 0.02);
    for (const end of [1, -1]) {
      const zEdge = end > 0 ? zF : zB;
      const f = makeFace({
        origin: new THREE.Vector3(end > 0 ? g.x0 + 0.04 : g.x1 - 0.04, 0, zEdge + end * endcapD),
        tangent: new THREE.Vector3(end, 0, 0), normal: new THREE.Vector3(0, 0, end),
        length: gondolaD - 0.08, levels: ENDCAP_LEVELS, kind: 'endcap', top: ENDCAP_LEVELS.at(-1) + 0.38,
      });
      const set = end > 0 ? promo : sets.get(categories[Math.min(n - 1, 2 * gi - 1)]?.id) || promo;
      f.set = set;
      f.title = set.title;
      set.faces.push(f);
      faces.push(f);
      buildShelfFace(f, 'standard', set.title, end > 0 ? '#e5262d' : set.color);
      // backboard for the poster
      faceBox(b, mats.kick, f, -0.04, f.length + 0.04, -SHELF_D - 0.05, -SHELF_D - 0.03, 0, 2.32);
      faceBox(b, mats.upright, f, -0.04, 0.0, -SHELF_D - 0.05, 0.02, 0, 2.32);
      faceBox(b, mats.upright, f, f.length, f.length + 0.04, -SHELF_D - 0.05, 0.02, 0, 2.32);
      let pc;
      if (end > 0) pc = T.promoSignCanvas('EXTRAPRIS', 'Aktuella kampanjer');
      else {
        const cat = categories[Math.min(n - 1, 2 * gi - 1)];
        pc = T.posterCanvas(cat?.title || 'Mathem', 'Upptäck', cat?.color || '#ffa424', posterBitmaps[Math.min(n - 1, 2 * gi - 1)]);
      }
      const tex = T.toTexture(pc);
      const pm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
      const isPoster = end < 0;
      facePlane(b, pm, f, f.length / 2, -SHELF_D + 0.035, isPoster ? 1.86 : 1.72, isPoster ? 0.6 : 0.96, isPoster ? 0.9 : 0.48);
    }
  });

  // ------------------------------------------------------------------ shell: floor, walls, ceiling
  const floorTex = T.toTexture(T.floorTexture(), { repeat: [W / 2.4, (bounds.maxZ - bounds.minZ) / 2.4], aniso: 16 });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, bounds.maxZ - bounds.minZ).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0xd9d3ca, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.55 }),
  );
  floor.position.set(0, 0, (bounds.minZ + bounds.maxZ) / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const D = bounds.maxZ - bounds.minZ;
  const zc = (bounds.minZ + bounds.maxZ) / 2;
  // walls: light lower part, dark upper part
  const wallH = 2.7;
  b.box(mats.wall, -W / 2 - 0.2, -W / 2, 0, wallH, bounds.minZ, bounds.maxZ);
  b.box(mats.wall, W / 2, W / 2 + 0.2, 0, wallH, bounds.minZ, bounds.maxZ);
  b.box(mats.wall, -W / 2, W / 2, 0, wallH, bounds.minZ - 0.2, bounds.minZ);
  b.box(mats.wallDark, -W / 2 - 0.2, -W / 2, wallH, height, bounds.minZ, bounds.maxZ);
  b.box(mats.wallDark, W / 2, W / 2 + 0.2, wallH, height, bounds.minZ, bounds.maxZ);
  b.box(mats.wallDark, -W / 2, W / 2, wallH, height, bounds.minZ - 0.2, bounds.minZ);
  // trim line
  b.box(mats.egg, -W / 2, W / 2, wallH - 0.06, wallH, bounds.minZ, bounds.minZ + 0.02);
  b.box(mats.egg, -W / 2, -W / 2 + 0.02, wallH - 0.06, wallH, bounds.minZ, bounds.maxZ);
  b.box(mats.egg, W / 2 - 0.02, W / 2, wallH - 0.06, wallH, bounds.minZ, bounds.maxZ);
  addCollider(-W / 2 - 5, -W / 2 + 0.25, bounds.minZ - 5, bounds.maxZ + 5);
  addCollider(W / 2 - 0.25, W / 2 + 5, bounds.minZ - 5, bounds.maxZ + 5);
  addCollider(-W / 2 - 5, W / 2 + 5, bounds.minZ - 5, bounds.minZ + 0.25);
  addCollider(-W / 2 - 5, W / 2 + 5, bounds.maxZ - 0.25, bounds.maxZ + 5);

  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), mats.ceiling);
  ceil.position.set(0, height, zc);
  root.add(ceil);
  // ducts & light strips
  for (const dz of [zB - 2, zc - 3, zF + 6]) {
    const g = new THREE.CylinderGeometry(0.35, 0.35, W, 20).rotateZ(Math.PI / 2).translate(0, height - 0.55, dz);
    b.add(mats.duct, g);
  }
  for (const a of aisles) {
    b.box(mats.led, a.x - 0.07, a.x + 0.07, 4.18, 4.22, zB + 0.4, zF - 0.4);
    b.box(mats.frame, a.x - 0.1, a.x + 0.1, 4.22, 4.27, zB + 0.4, zF - 0.4);
    b.box(mats.frame, a.x - 0.005, a.x + 0.005, 4.27, height, zB + 1, zB + 1.02);
    b.box(mats.frame, a.x - 0.005, a.x + 0.005, 4.27, height, zF - 1.02, zF - 1);
  }
  for (const lz of [zB - 2.3, zF + 2.5, zF + 6.5, zF + 10.5]) {
    for (let lx = -W / 2 + 2.5; lx < W / 2 - 2; lx += 5) {
      b.box(mats.led, lx - 1.1, lx + 1.1, 4.3, 4.34, lz - 0.1, lz + 0.1);
      b.box(mats.frame, lx - 1.13, lx + 1.13, 4.34, 4.38, lz - 0.13, lz + 0.13);
    }
  }

  // ------------------------------------------------------------------ aisle signs
  aisles.forEach((a, k) => {
    for (const [z, facing] of [[zF - 0.35, 1], [zB + 0.35, -1]]) {
      const ltitle = facing > 0 ? a.leftTitle : a.rightTitle;
      const rtitle = facing > 0 ? a.rightTitle : a.leftTitle;
      const lcol = facing > 0 ? a.leftColor : a.rightColor;
      const rcol = facing > 0 ? a.rightColor : a.leftColor;
      const front = T.toTexture(T.aisleSignCanvas(k + 1, ltitle, rtitle, lcol, rcol));
      const backc = T.toTexture(T.aisleSignCanvas(k + 1, rtitle, ltitle, rcol, lcol));
      const sw = 2.5, sh = 0.625;
      const pf = new THREE.PlaneGeometry(sw, sh);
      if (facing < 0) pf.rotateY(Math.PI);
      pf.translate(a.x, 3.35, z + facing * 0.012);
      b.add(new THREE.MeshBasicMaterial({ map: front }), pf);
      const pb = new THREE.PlaneGeometry(sw, sh);
      if (facing > 0) pb.rotateY(Math.PI);
      pb.translate(a.x, 3.35, z - facing * 0.012);
      b.add(new THREE.MeshBasicMaterial({ map: backc }), pb);
      b.box(mats.frame, a.x - sw / 2, a.x + sw / 2, 3.35 + sh / 2, 3.35 + sh / 2 + 0.03, z - 0.015, z + 0.015);
      for (const s of [-1, 1]) b.box(mats.frame, a.x + s * (sw / 2 - 0.15) - 0.004, a.x + s * (sw / 2 - 0.15) + 0.004, 3.35 + sh / 2, height, z - 0.004, z + 0.004);
    }
  });

  // ------------------------------------------------------------------ front zone: checkouts, entrance
  const checkouts = [];
  const nCheck = 4;
  const doorX = 4;
  const frontWall = bounds.maxZ;
  const cz0 = zF + 5.6, cz1 = zF + 8.2;
  for (let i = 0; i < nCheck; i++) {
    const cx = -W / 2 + 3.2 + i * 3.1; // counter centre
    const x0 = cx - 0.45, x1 = cx + 0.45;
    // counter body + belt
    b.add(mats.white, new RoundedBoxGeometry(0.9, 0.86, cz1 - cz0, 3, 0.04).translate(cx, 0.43, (cz0 + cz1) / 2));
    b.box(mats.plum, x0 - 0.005, x1 + 0.005, 0.05, 0.62, cz0 + 0.04, cz1 - 0.04);
    b.box(mats.egg, x0 - 0.008, x1 + 0.008, 0.62, 0.66, cz0 + 0.04, cz1 - 0.04);
    b.box(mats.belt, x0 + 0.12, x1 - 0.05, 0.86, 0.9, cz0 + 0.05, cz0 + 1.65);
    b.box(mats.chrome, x1 - 0.06, x1 - 0.02, 0.86, 0.94, cz0 + 0.05, cz0 + 1.65);
    b.box(mats.chrome, x0 + 0.08, x0 + 0.12, 0.86, 0.94, cz0 + 0.05, cz0 + 1.65);
    // scanner glass + bagging area
    b.box(mats.screen, x0 + 0.2, x1 - 0.12, 0.86, 0.875, cz0 + 1.75, cz0 + 2.05);
    // register screen on a pole
    b.box(mats.chrome, x0 + 0.05, x0 + 0.08, 0.86, 1.25, cz0 + 1.9, cz0 + 1.93);
    b.add(mats.screen, new THREE.BoxGeometry(0.04, 0.22, 0.3).translate(x0 + 0.08, 1.32, cz0 + 1.91));
    b.box(mats.frame, x0 + 0.06, x0 + 0.075, 1.2, 1.44, cz0 + 1.75, cz0 + 2.07);
    // card terminal on the customer side
    b.box(mats.frame, x1 - 0.18, x1 - 0.04, 0.9, 1.06, cz0 + 2.1, cz0 + 2.18);
    // lane light pole
    b.add(mats.chrome, new THREE.CylinderGeometry(0.025, 0.025, 1.4, 10).translate(x1 - 0.06, 1.6, cz0 + 0.1));
    const nc = T.textCanvas(String(i + 1), { size: 120, color: '#ffffff', pad: 30 });
    const numTex = T.toTexture(nc);
    const lamp = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: numTex, map: numTex, emissiveIntensity: 1.4 });
    const cyl = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 24, 1, true).translate(x1 - 0.06, 2.4, cz0 + 0.1);
    b.add(lamp, cyl);
    b.add(mats.green, new THREE.CylinderGeometry(0.165, 0.165, 0.03, 24).translate(x1 - 0.06, 2.52, cz0 + 0.1));
    // impulse rack at lane entry
    b.box(mats.frame, x1 + 0.0, x1 + 0.08, 0, 1.2, cz0 - 0.9, cz0 - 0.05);
    for (const y of [0.3, 0.6, 0.9, 1.2]) b.box(mats.egg, x1 - 0.02, x1 + 0.1, y - 0.02, y, cz0 - 0.9, cz0 - 0.05);
    addCollider(x0 - 0.95, x1 + 0.02, cz0 - 0.05, cz1 + 0.05);
    addCollider(x1 - 0.02, x1 + 0.12, cz0 - 0.92, cz0 - 0.03);
    checkouts.push({
      index: i, x0, x1, z0: cz0, z1: cz1,
      laneX: x1 + 0.62,
      cashier: new THREE.Vector3(x0 - 0.42, 0, cz0 + 1.9),
      queueStart: new THREE.Vector3(x1 + 0.62, 0, cz0 - 1.4),
      register: new THREE.Vector3(x1 + 0.62, 0, cz0 + 1.6),
      exit: new THREE.Vector3(x1 + 0.62, 0, cz1 + 1.2),
    });
  }
  // "Kassa" sign above checkouts
  {
    const c = T.textCanvas('KASSOR', { size: 140, color: T.BRAND.eggyolk, pad: 40 });
    const tex = T.toTexture(c);
    const w = 3.6, h = (w * c.height) / c.width;
    const g = new THREE.PlaneGeometry(w, h).translate(-W / 2 + 7.8, 3.6, cz0 - 0.4);
    b.add(new THREE.MeshBasicMaterial({ map: tex, transparent: true }), g);
  }

  // Front wall with glass entrance + daylight
  const hour = new Date().getHours();
  const night = hour < 6 || hour >= 19;
  const [oc, octx] = T.canvas(512, 256);
  const og = octx.createLinearGradient(0, 0, 0, 256);
  if (night) { og.addColorStop(0, '#0b1230'); og.addColorStop(0.7, '#27305a'); og.addColorStop(1, '#4a4a5a'); }
  else { og.addColorStop(0, '#bfe3ff'); og.addColorStop(0.65, '#f4fbff'); og.addColorStop(1, '#d9d4c8'); }
  octx.fillStyle = og;
  octx.fillRect(0, 0, 512, 256);
  if (night) for (let i = 0; i < 12; i++) { octx.fillStyle = 'rgba(255,220,150,.9)'; octx.beginPath(); octx.arc(20 + i * 44, 200, 4, 0, 7); octx.fill(); }
  const outside = new THREE.MeshBasicMaterial({ map: T.toTexture(oc), color: night ? 0xffffff : 0xffffff });
  outside.color.multiplyScalar(night ? 1 : 1.5);
  const outsidePlane = new THREE.Mesh(new THREE.PlaneGeometry(W, 6).rotateY(Math.PI), outside);
  outsidePlane.position.set(0, 2.8, frontWall + 2.5);
  root.add(outsidePlane);
  const dw = 3.2;
  const winY0 = 0.0, winY1 = 2.6;
  // wall segments around door + window band
  b.box(mats.wall, -W / 2, -W / 2 + 1.5, 0, wallH, frontWall, frontWall + 0.2);
  b.box(mats.wall, -W / 2 + 1.5, doorX - dw / 2 - 2, 0, 0.9, frontWall, frontWall + 0.2);
  b.box(mats.wall, doorX + dw / 2 + 2, W / 2 - 1.5, 0, 0.9, frontWall, frontWall + 0.2);
  b.box(mats.wall, W / 2 - 1.5, W / 2, 0, wallH, frontWall, frontWall + 0.2);
  b.box(mats.wall, doorX - dw / 2 - 2, doorX - dw / 2, 0, wallH, frontWall, frontWall + 0.2);
  b.box(mats.wall, doorX + dw / 2, doorX + dw / 2 + 2, 0, wallH, frontWall, frontWall + 0.2);
  b.box(mats.wallDark, -W / 2, W / 2, wallH, height, frontWall, frontWall + 0.2);
  b.box(mats.egg, -W / 2, W / 2, wallH - 0.06, wallH, frontWall - 0.02, frontWall);
  // window glass
  for (const [a0, a1] of [[-W / 2 + 1.5, doorX - dw / 2 - 2], [doorX + dw / 2 + 2, W / 2 - 1.5]]) {
    b.box(mats.glass, a0, a1, 0.9, winY1, frontWall + 0.08, frontWall + 0.1);
    for (let xx = a0; xx <= a1 + 0.01; xx += (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 2.4))) b.box(mats.frame, xx - 0.04, xx + 0.04, 0.9, winY1, frontWall + 0.05, frontWall + 0.12);
    b.box(mats.frame, a0, a1, 0.88, 0.92, frontWall + 0.05, frontWall + 0.12);
  }
  // doors (animated)
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(dw / 2, 2.4, 0.03), mats.glass);
  const doorR = doorL.clone();
  doorL.position.set(doorX - dw / 4, 1.2, frontWall + 0.1);
  doorR.position.set(doorX + dw / 4, 1.2, frontWall + 0.1);
  const doorFrameGeo = [];
  doorFrameGeo.push(new THREE.BoxGeometry(dw / 2, 0.06, 0.05).translate(0, 1.18, 0), new THREE.BoxGeometry(dw / 2, 0.06, 0.05).translate(0, -1.18, 0));
  doorFrameGeo.push(new THREE.BoxGeometry(0.05, 2.4, 0.05).translate(dw / 4 - 0.02, 0, 0), new THREE.BoxGeometry(0.05, 2.4, 0.05).translate(-dw / 4 + 0.02, 0, 0));
  const dfg = mergeGeometries(doorFrameGeo);
  doorL.add(new THREE.Mesh(dfg, mats.frame));
  doorR.add(new THREE.Mesh(dfg, mats.frame));
  root.add(doorL, doorR);
  b.box(mats.frame, doorX - dw / 2, doorX + dw / 2, 2.4, 2.6, frontWall, frontWall + 0.2);
  {
    const c = T.textCanvas('VÄLKOMMEN IN', { size: 90, color: T.BRAND.eggyolk, pad: 30 });
    const w = 2.6, h = (w * c.height) / c.width;
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(doorX, 2.95, frontWall - 0.02);
    b.add(new THREE.MeshBasicMaterial({ map: T.toTexture(c), transparent: true }), g);
  }
  // door is not walkable (you can't leave the store in the game)
  addCollider(doorX - dw / 2 - 0.1, doorX + dw / 2 + 0.1, frontWall - 0.6, frontWall + 1);
  // entrance mat
  const matC = T.textCanvas('mathem', { size: 160, color: 'rgba(255,164,36,.85)', pad: 40 });
  const [mc, mctx] = T.canvas(1024, 512);
  mctx.fillStyle = '#2a2230';
  mctx.fillRect(0, 0, 1024, 512);
  mctx.drawImage(matC, 512 - matC.width / 2, 256 - matC.height / 2);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6).rotateX(-Math.PI / 2), stdMat(0xffffff, { map: T.toTexture(mc), roughness: 1 }));
  mat.rotation.y = Math.PI;
  mat.position.set(doorX, 0.004, frontWall - 1.2);
  mat.receiveShadow = true;
  root.add(mat);

  // Back wall lettering
  {
    const c = T.textCanvas('MATHEM', { size: 260, color: T.BRAND.eggyolk, pad: 30 });
    const w = 9, h = (w * c.height) / c.width;
    const tex = T.toTexture(c);
    const g = new THREE.PlaneGeometry(w, h).translate(0, 3.7, bounds.minZ + 0.03);
    b.add(new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0xffa424, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.5 }), g);
  }

  // Back wall: category murals and a staff door
  {
    const wz = bounds.minZ + 0.025;
    const spots = [-16.5, -12.5, -8.5, 8.5, 12.5, 16.5].filter((x) => Math.abs(x) < W / 2 - 1.5);
    spots.forEach((px, i) => {
      const ci = (i * 3 + 1) % n;
      const cat = categories[ci];
      const tex = T.toTexture(T.posterCanvas(cat.title, 'Avdelning', cat.color, posterBitmaps[ci]));
      const pm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
      b.add(pm, new THREE.PlaneGeometry(1.2, 1.8).translate(px, 2.05, wz));
      b.box(mats.frame, px - 0.64, px + 0.64, 1.1, 1.14, wz - 0.02, wz + 0.02);
      b.box(mats.frame, px - 0.64, px + 0.64, 2.96, 3.0, wz - 0.02, wz + 0.02);
      // spotlight above each mural
      b.box(mats.frame, px - 0.04, px + 0.04, 3.05, 3.12, wz, wz + 0.25);
      b.box(mats.ledWarm, px - 0.035, px + 0.035, 3.04, 3.05, wz + 0.17, wz + 0.24);
    });
    const dx = 5.5;
    b.box(mats.frame, dx - 0.65, dx + 0.65, 0, 2.25, wz - 0.02, wz + 0.04);
    b.box(mats.plum, dx - 0.58, dx + 0.58, 0, 2.15, wz + 0.04, wz + 0.06);
    for (const s0 of [-1, 1]) b.add(mats.glass, new THREE.CircleGeometry(0.11, 20).translate(dx + s0 * 0.29, 1.5, wz + 0.065));
    b.box(mats.chrome, dx - 0.58, dx + 0.58, 0.95, 1.0, wz + 0.06, wz + 0.08);
    const pc = T.textCanvas('PERSONAL', { size: 60, color: T.BRAND.milk, pad: 16 });
    b.add(new THREE.MeshBasicMaterial({ map: T.toTexture(pc), transparent: true }), new THREE.PlaneGeometry(0.9, (0.9 * pc.height) / pc.width).translate(dx, 2.4, wz + 0.01));
  }

  // ------------------------------------------------------------------ props
  const boxes = [];
  const addBox = (x0, y0, z0, w, h, d, rot = 0) => boxes.push({ p: new THREE.Vector3(x0, y0 + h / 2, z0), s: new THREE.Vector3(w, h, d), r: rot });
  // overstock on top of gondolas
  for (const g of gondolas) {
    if (g.wall) continue;
    for (let z = zB + 0.6; z < zF - 0.6; z += 0.7 + T.rand() * 1.4) {
      const w = 0.4 + T.rand() * 0.4, h = 0.25 + T.rand() * 0.35;
      addBox((g.x0 + g.x1) / 2 + (T.rand() - 0.5) * 0.3, aisleTop + 0.02, z, Math.min(w, gondolaD - 0.1), h, 0.35 + T.rand() * 0.3, (T.rand() - 0.5) * 0.3);
      if (T.rand() < 0.35) addBox((g.x0 + g.x1) / 2, aisleTop + 0.02 + h, z, 0.35, 0.22, 0.3, T.rand());
    }
  }
  // pallets with boxes in the back corridor and front zone
  const pallet = (px, pz, rows = 3) => {
    b.box(mats.pallet, px - 0.6, px + 0.6, 0, 0.14, pz - 0.4, pz + 0.4);
    for (let r = 0; r < rows; r++) for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) {
      if (r === rows - 1 && T.rand() < 0.3) continue;
      addBox(px - 0.4 + ix * 0.4, 0.14 + r * 0.32, pz - 0.19 + iz * 0.38, 0.38, 0.31, 0.36, (T.rand() - 0.5) * 0.06);
    }
    addCollider(px - 0.65, px + 0.65, pz - 0.45, pz + 0.45);
  };
  for (const px of [-W / 2 + 3, -W / 2 + 6, W / 2 - 3, W / 2 - 6.5]) pallet(px, bounds.minZ + 0.9, 2 + ((T.rand() * 2) | 0));
  const promoSpots = [[-4, zF + 3.0], [12, zF + 3.0]];
  const promoSigns = [];
  for (const [px, pz] of promoSpots) {
    pallet(px, pz, 3);
    b.add(mats.chrome, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8).translate(px, 1.75, pz));
    promoSigns.push([px, pz]);
  }
  promoSigns.forEach(([px, pz], i) => {
    const tex = T.toTexture(T.promoSignCanvas('EXTRAPRIS', 'Se kampanjhyllorna'));
    const g = new THREE.PlaneGeometry(1.0, 0.5);
    const sm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 });
    b.add(sm, g.translate(px, 2.55, pz));
  });

  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.cardboard, boxes.length);
  boxes.forEach((bx, i) => boxMesh.setMatrixAt(i, new THREE.Matrix4().compose(bx.p, new THREE.Quaternion().setFromAxisAngle(UP, bx.r), bx.s)));
  boxMesh.castShadow = boxMesh.receiveShadow = true;
  root.add(boxMesh);

  // plants by the entrance
  const plant = (px, pz, s = 1) => {
    b.add(mats.pot, new THREE.CylinderGeometry(0.32 * s, 0.25 * s, 0.6 * s, 18).translate(px, 0.3 * s, pz));
    for (let i = 0; i < 7; i++) {
      const r = (0.25 + T.rand() * 0.25) * s;
      const g = new THREE.IcosahedronGeometry(r, 0).translate(px + (T.rand() - 0.5) * 0.5 * s, (0.8 + T.rand() * 1.1) * s, pz + (T.rand() - 0.5) * 0.5 * s);
      b.add(i % 2 ? mats.leaf : mats.leaf2, g);
    }
    addCollider(px - 0.35 * s, px + 0.35 * s, pz - 0.35 * s, pz + 0.35 * s);
  };
  plant(doorX - dw / 2 - 0.8, frontWall - 0.8, 1.1);
  plant(doorX + dw / 2 + 0.8, frontWall - 0.8, 1.1);
  plant(W / 2 - 1.2, zF + 1.4, 1.3);

  // seasonal display
  const month = new Date().getMonth();
  if (month === 9 || month === 10 || month === 11) {
    const px = 13.5, pz = zF + 9.5;
    b.box(mats.pallet, px - 1.1, px + 1.1, 0, 0.5, pz - 0.7, pz + 0.7);
    const tint = month === 9 ? mats.pumpkin : mats.red;
    for (let i = 0; i < 22; i++) {
      const r = 0.14 + T.rand() * 0.1;
      const g = new THREE.SphereGeometry(r, 14, 10);
      g.scale(1, 0.78, 1);
      const yy = 0.5 + r * 0.7 + (i > 13 ? 0.2 : 0) + (i > 19 ? 0.18 : 0);
      const gx = px + (T.rand() - 0.5) * (i > 13 ? 1.2 : 1.9), gz = pz + (T.rand() - 0.5) * (i > 13 ? 0.7 : 1.1);
      g.translate(gx, yy, gz);
      b.add(tint, g);
      if (month === 9) b.add(mats.stem, new THREE.CylinderGeometry(0.015, 0.02, 0.07, 6).translate(gx, yy + r * 0.8, gz));
    }
    const label = month === 9 ? 'HALLOWEEN' : month === 10 ? 'HÖSTMYS' : 'GOD JUL';
    const c = T.promoSignCanvas(label, month === 9 ? 'Pumpor & godis' : 'Säsongens favoriter');
    const tex = T.toTexture(c);
    b.add(mats.chrome, new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8).translate(px, 1.25, pz));
    b.add(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 }), new THREE.PlaneGeometry(1.2, 0.6).translate(px, 2.2, pz));
    addCollider(px - 1.15, px + 1.15, pz - 0.75, pz + 0.75);
  }

  // wet floor sign in the back corridor
  {
    const tex = T.toTexture(T.wetFloorCanvas());
    const sm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.4 });
    const wx = aisles[Math.min(2, aisles.length - 1)].x + 0.6, wz = zB - 2.2;
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.32, 0.6);
      g.rotateX(s * 0.22);
      g.translate(0, 0.3, s * 0.07);
      g.rotateY(0.6);
      g.translate(wx, 0, wz);
      b.add(sm, g);
    }
    addCollider(wx - 0.25, wx + 0.25, wz - 0.25, wz + 0.25);
  }

  // cart corral with parked carts
  const corral = [];
  {
    const cx = doorX + dw / 2 + 2.6, cz = frontWall - 2.5;
    for (let i = 0; i < 4; i++) {
      const c = buildCart({ detailed: false });
      c.group.position.set(cx, 0, cz - i * 0.32);
      c.group.rotation.y = Math.PI;
      root.add(c.group);
      corral.push(c.group);
    }
    b.box(mats.chrome, cx - 0.4, cx - 0.37, 0, 0.9, cz - 2.0, cz + 0.4);
    b.box(mats.chrome, cx + 0.37, cx + 0.4, 0, 0.9, cz - 2.0, cz + 0.4);
    b.box(mats.chrome, cx - 0.4, cx - 0.37, 0.88, 0.92, cz - 2.0, cz + 0.4);
    b.box(mats.chrome, cx + 0.37, cx + 0.4, 0.88, 0.92, cz - 2.0, cz + 0.4);
    addCollider(cx - 0.45, cx + 0.45, cz - 2.05, cz + 0.45);
  }
  // basket stack
  {
    const bx = doorX - dw / 2 - 2.2, bz = frontWall - 2.2;
    for (let i = 0; i < 6; i++) b.add(mats.red, new RoundedBoxGeometry(0.5, 0.12, 0.36, 2, 0.02).translate(bx, 0.06 + i * 0.07, bz));
    addCollider(bx - 0.3, bx + 0.3, bz - 0.22, bz + 0.22);
  }

  b.build(root);

  // ------------------------------------------------------------------ queries
  const ray = new THREE.Vector3(), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  function pick(origin, dir, maxDist) {
    let best = null;
    for (const f of faces) {
      if (!f.slots.length) continue;
      const denom = dir.dot(f.normal);
      if (denom > -1e-3) continue;
      tmp.copy(f.origin).addScaledVector(f.normal, -FRONT_INSET);
      const t = tmp.sub(origin).dot(f.normal) / denom;
      if (t < 0 || t > maxDist || (best && t > best.t)) continue;
      hit.copy(origin).addScaledVector(dir, t);
      const s = ray.copy(hit).sub(f.origin).dot(f.tangent);
      if (s < -0.05 || s > f.length + 0.05) continue;
      let li = -1;
      for (let i = f.levels.length - 1; i >= 0; i--) if (hit.y >= f.levels[i] - 0.02) { li = i; break; }
      if (li < 0) continue;
      const ceil = li < f.levels.length - 1 ? f.levels[li + 1] - 0.03 : f.top;
      if (hit.y > ceil) continue;
      let slot = null, bestD = 0.08;
      for (const sl of f.slotsByLevel[li]) {
        if (sl.remaining <= 0) continue;
        const d = Math.abs(sl.s - s) - sl.w / 2;
        if (d < bestD) { bestD = d; slot = sl; }
      }
      if (slot) best = { slot, t, point: hit.clone() };
    }
    return best;
  }

  function slotWorld(slot, out = new THREE.Vector3()) {
    const k = Math.min(DEPTH_COPIES - 1, DEPTH_COPIES - slot.remaining);
    return facePoint(slot.face, slot.s, -FRONT_INSET - k * DEPTH_STEP, slot.y, out);
  }

  function locate(px, pz) {
    if (pz > zB && pz < zF) {
      for (const a of aisles) if (Math.abs(px - a.x) < aisleW / 2 + 0.1) return { type: 'aisle', aisle: a };
      return null;
    }
    if (pz >= zF && pz < cz0 - 0.5) return { type: 'zone', name: 'Kampanjtorget' };
    if (pz >= cz0 - 0.5 && px < -W / 2 + 3.2 + nCheck * 3.1) return { type: 'zone', name: 'Kassor' };
    if (pz >= cz0 - 0.5) return { type: 'zone', name: 'Entré' };
    return { type: 'zone', name: 'Bakre gången' };
  }

  let doorOpen = 0;
  function update(dt, agents) {
    let near = false;
    for (const a of agents) {
      if (Math.abs(a.x - doorX) < 2.5 && a.z > frontWall - 3.2) { near = true; break; }
    }
    doorOpen += ((near ? 1 : 0) - doorOpen) * Math.min(1, dt * 3);
    doorL.position.x = doorX - dw / 4 - doorOpen * (dw / 2 - 0.1);
    doorR.position.x = doorX + dw / 4 + doorOpen * (dw / 2 - 0.1);
  }

  return {
    root,
    bounds,
    colliders,
    aisles,
    faces,
    sets,
    checkouts,
    gondolas,
    doorX,
    frontWall,
    zFront: zF,
    zBack: zB,
    checkoutZ: [cz0, cz1],
    start: { x: doorX, z: frontWall - 3.2, yaw: 0 },
    pick,
    slotWorld,
    locate,
    update,
  };
}
