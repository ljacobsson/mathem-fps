import * as THREE from './vendor/three/build/three.module.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { wireTexture, canvas, toTexture, BRAND, FONT_BOLD } from './textures.js';

// Cart-local frame: origin on the floor below the handle, basket extends toward -Z.
export const BASKET = { x: 0.235, zBack: -0.13, zFront: -0.85, floor: 0.555, top: 0.95 };

let shared = null;
function materials() {
  if (shared) return shared;
  const wire = toTexture(wireTexture(), { srgb: false });
  wire.wrapS = wire.wrapT = THREE.RepeatWrapping;
  const [lc, lctx] = canvas(512, 128);
  lctx.fillStyle = BRAND.eggyolk;
  lctx.fillRect(0, 0, 512, 128);
  lctx.fillStyle = BRAND.plum;
  lctx.font = `78px ${FONT_BOLD}`;
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText('MATHEM', 256, 70);
  shared = {
    wire: new THREE.MeshStandardMaterial({
      color: 0xdfe4ea, metalness: 0.85, roughness: 0.28, alphaMap: wire, alphaTest: 0.5, side: THREE.DoubleSide,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6eaee, metalness: 0.95, roughness: 0.18 }),
    plastic: new THREE.MeshStandardMaterial({ color: BRAND.eggyolk, roughness: 0.42, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.7 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.6, roughness: 0.4 }),
    logo: new THREE.MeshStandardMaterial({ map: toTexture(lc), roughness: 0.45 }),
  };
  return shared;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function tube(a, b, r = 0.011, seg = 8) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(_a.clone().add(_b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function quad(p0, p1, p2, p3, uvScale = [1, 1]) {
  // p0..p3 counter-clockwise; uv repeat for the wire texture.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
  const [u, v] = uvScale;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  g.computeVertexNormals();
  return g;
}

export function buildCart({ detailed = true, tint } = {}) {
  const m = materials();
  const group = new THREE.Group();
  const { x: hx, zBack: zb, zFront: zf, floor: yb, top: yt } = BASKET;
  const fx = hx - 0.03; // front is a bit narrower
  const zbb = zb - 0.04, zfb = zf + 0.05; // bottom is a bit shorter

  // Wire basket panels
  const panels = [
    quad([-hx, yb, zbb], [hx, yb, zbb], [hx, yt, zb], [-hx, yt, zb], [5, 1.6]),
    quad([fx, yb, zfb], [-fx, yb, zfb], [-fx, yt, zf], [fx, yt, zf], [5, 1.6]),
    quad([-hx, yb, zbb], [-hx, yt, zb], [-fx, yt, zf], [-fx, yb, zfb], [1.6, 7]),
    quad([hx, yb, zbb], [fx, yb, zfb], [fx, yt, zf], [hx, yt, zb], [7, 1.6]),
    quad([-hx, yb, zbb], [-fx, yb, zfb], [fx, yb, zfb], [hx, yb, zbb], [5, 7]),
    // lower tray
    quad([-0.2, 0.19, -0.16], [-0.2, 0.19, -0.8], [0.2, 0.19, -0.8], [0.2, 0.19, -0.16], [4, 6]),
  ];
  group.add(new THREE.Mesh(mergeGeometries(panels), m.wire));

  // Frame tubes
  const t = [];
  const rim = [[-hx, yt, zb], [hx, yt, zb], [fx, yt, zf], [-fx, yt, zf]];
  for (let i = 0; i < 4; i++) t.push(tube(rim[i], rim[(i + 1) % 4], 0.012));
  const bot = [[-hx, yb, zbb], [hx, yb, zbb], [fx, yb, zfb], [-fx, yb, zfb]];
  for (let i = 0; i < 4; i++) t.push(tube(bot[i], bot[(i + 1) % 4], 0.01));
  for (let i = 0; i < 4; i++) t.push(tube(bot[i], rim[i], 0.01));
  // handle arms
  t.push(tube([-hx, yt, zb], [-0.27, 1.0, 0.0], 0.013), tube([hx, yt, zb], [0.27, 1.0, 0.0], 0.013));
  t.push(tube([-0.27, 1.0, 0.0], [0.27, 1.0, 0.0], 0.014));
  // legs & chassis
  t.push(tube([-hx, yb, zbb], [-0.22, 0.13, -0.1], 0.013), tube([hx, yb, zbb], [0.22, 0.13, -0.1], 0.013));
  t.push(tube([-fx, yb, zfb], [-0.19, 0.13, -0.86], 0.013), tube([fx, yb, zfb], [0.19, 0.13, -0.86], 0.013));
  t.push(tube([-0.22, 0.13, -0.1], [-0.19, 0.13, -0.86], 0.014), tube([0.22, 0.13, -0.1], [0.19, 0.13, -0.86], 0.014));
  t.push(tube([-0.22, 0.13, -0.1], [0.22, 0.13, -0.1], 0.012));
  group.add(new THREE.Mesh(mergeGeometries(t), m.chrome));

  // Handle grip + plastic bits
  const plasticMat = tint ? m.plastic.clone() : m.plastic;
  if (tint) plasticMat.color.set(tint);
  const grip = new THREE.CylinderGeometry(0.02, 0.02, 0.46, 14);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, 1.0, 0);
  const capF = [-1, 1].map((s) => new THREE.SphereGeometry(0.03, 10, 8).translate(s * fx, yt, zf));
  const capB = [-1, 1].map((s) => new THREE.SphereGeometry(0.026, 10, 8).translate(s * 0.27, 1.0, 0));
  group.add(new THREE.Mesh(mergeGeometries([grip, ...capF, ...capB]), plasticMat));

  // Logo plate on the folding child seat at the back of the basket.
  const plate = new THREE.PlaneGeometry(0.34, 0.085);
  const plateMesh = new THREE.Mesh(plate, m.logo);
  plateMesh.position.set(0, yt - 0.07, zb - 0.004);
  plateMesh.rotation.x = -0.09;
  group.add(plateMesh);
  const plateFront = plateMesh.clone();
  plateFront.position.set(0, yt - 0.09, zf - 0.004);
  plateFront.rotation.set(0.05, Math.PI, 0);
  plateFront.scale.setScalar(1.15);
  group.add(plateFront);

  // Wheels
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.034, 10).rotateZ(Math.PI / 2);
  const forkGeo = new THREE.BoxGeometry(0.045, 0.07, 0.02).translate(0, 0.095, 0);
  const pos = [[-0.22, -0.12], [0.22, -0.12], [-0.19, -0.86], [0.19, -0.86]];
  const forks = [];
  for (const [x, z] of pos) {
    forks.push(forkGeo.clone().translate(x, 0, z));
    if (detailed) {
      const w = new THREE.Group();
      w.position.set(x, 0.058, z);
      w.add(new THREE.Mesh(wheelGeo, m.dark), new THREE.Mesh(hubGeo, m.hub));
      group.add(w);
      wheels.push(w);
    } else {
      forks.push(wheelGeo.clone().translate(x, 0.058, z));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(forks), detailed ? m.hub : m.dark));

  const contents = new THREE.Group();
  group.add(contents);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group, wheels, contents };
}

/**
 * God-mode aura: an additive, normal-extruded copy of every cart part (so wire
 * grids glow as grids), a light that spills onto the floor and shelves, and a
 * soft glow spot underneath. Hidden until enabled.
 */
export function addGlow(cart) {
  const color = new THREE.Color(1.0, 0.72, 0.18);
  const make = (alphaMap) => {
    const m = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, alphaMap: alphaMap || null,
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normal * 0.007;');
    };
    m.customProgramCacheKey = () => 'cart-glow' + (alphaMap ? '-a' : '');
    return m;
  };
  const solid = make(null);
  const wire = make(materials().wire.alphaMap);
  const glows = [];
  const sources = [];
  cart.group.traverse((o) => {
    if (!o.isMesh || o.userData.glow) return;
    let p = o.parent;
    while (p && p !== cart.group) { if (p === cart.contents) return; p = p.parent; }
    sources.push(o);
  });
  for (const o of sources) {
    const g = new THREE.Mesh(o.geometry, o.material.alphaMap ? wire : solid);
    g.userData.glow = true;
    g.renderOrder = 2;
    g.visible = false;
    o.add(g);
    glows.push(g);
  }
  // Present from the start with intensity 0, so toggling doesn't add a light
  // (which would force every material to recompile and stutter).
  // Above the cart: lights floor and shelves softly without a hot spot in the basket.
  const light = new THREE.PointLight(color, 0, 7, 1.2);
  light.position.set(0, 1.9, -0.5);
  cart.group.add(light);
  const [c, ctx] = canvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,200,80,1)');
  grad.addColorStop(0.4, 'rgba(255,170,40,.45)');
  grad.addColorStop(1, 'rgba(255,150,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const spot = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: toTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  spot.position.set(0, 0.006, -0.5);
  spot.visible = false;
  cart.group.add(spot);

  let on = false;
  let level = 0;
  return {
    set(v) { on = v; },
    get on() { return on; },
    update(dt, t) {
      level += ((on ? 1 : 0) - level) * Math.min(1, dt * 4);
      const visible = level > 0.01;
      for (const g of glows) g.visible = visible;
      spot.visible = visible;
      const pulse = 0.75 + Math.sin(t * 5) * 0.25;
      solid.opacity = 0.32 * level * pulse;
      wire.opacity = 0.14 * level * pulse;
      spot.material.opacity = 0.35 * level * pulse;
      light.intensity = 3.2 * level * pulse;
    },
  };
}
