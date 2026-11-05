// Copies the parts of three.js the game needs into game/vendor/three, rewriting
// bare 'three' imports to relative paths (content scripts can't use import maps).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules/three');
const dst = path.join(root, 'game/vendor/three');

const entries = [
  'build/three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
];

fs.rmSync(dst, { recursive: true, force: true });
const seen = new Set();
const importRe = /(\bfrom\s*|\bimport\s*)(['"])([^'"]+)\2/g;

function copy(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  let code = fs.readFileSync(path.join(src, rel), 'utf8');
  const dir = path.posix.dirname(rel);
  code = code.replace(importRe, (m, kw, q, spec) => {
    if (spec === 'three') {
      let r = path.posix.relative(dir, 'build/three.module.js');
      if (!r.startsWith('.')) r = './' + r;
      copy('build/three.module.js');
      return `${kw}${q}${r}${q}`;
    }
    if (spec.startsWith('.')) copy(path.posix.normalize(path.posix.join(dir, spec)));
    return m;
  });
  const out = path.join(dst, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
}

entries.forEach(copy);
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dst, 'LICENSE'));
console.log(`vendored ${seen.size} files:\n  ` + [...seen].join('\n  '));
