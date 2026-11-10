// Converts the Chibi_Avatar OBJ into a compact binary mesh for the hero scene:
//  - keeps only the Chibi_Head and Chibi_Body groups (drops the bow, display base and helper object)
//  - welds duplicate vertices into an indexed mesh
//  - paints colours by region, since the OBJ has no materials or textures
//  - lowers the T-pose arms into a relaxed flying pose
//  - scales her to a fixed height with her feet at the origin, facing +z
// Output layout (little-endian): uint32 vertexCount, uint32 indexCount, float32[3n] positions, uint8[4n] colours, uint32[] indices
// Usage: node tools/convert-fairy.cjs models/chibi.obj models/fairy.bin
const fs = require('fs');
const [, , src, dst] = process.argv;

const HEIGHT = 0.36;                 // finished height in scene units (the fairy group adds its own scale)
const KEEP = new Set(['Chibi_Head', 'Chibi_Body']);
const COLORS = {                      // sRGB
  skin: [242, 210, 186],
  hair: [196, 122, 58],              // warm honey-auburn
  dress: [122, 170, 84],             // leaf green
  dressDark: [86, 128, 60],          // petal edges and the skirt's underside
  shoes: [70, 98, 50],
};

// ---- parse ----
const lines = fs.readFileSync(src, 'utf8').split('\n');
const V = [];
const tris = []; // [i0, i1, i2, group]
let group = '';
for (const ln of lines) {
  if (ln.startsWith('v ')) { const p = ln.trim().split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
  else if (ln.startsWith('g ')) group = ln.slice(2).trim();
  else if (ln.startsWith('f ') && KEEP.has(group)) {
    const ids = ln.trim().split(/\s+/).slice(1).map(t => parseInt(t, 10) - 1);
    for (let k = 1; k + 1 < ids.length; k++) tris.push([ids[0], ids[k], ids[k + 1], group]); // fan-triangulate
  }
}

// ---- weld: one vertex per (position, group) so head and body keep separate colours at the neck ----
const key = (p, g) => `${g}|${p[0].toFixed(3)}|${p[1].toFixed(3)}|${p[2].toFixed(3)}`;
const map = new Map(), pos = [], grp = [], index = [];
for (const [a, b, c, g] of tris) {
  for (const i of [a, b, c]) {
    const k = key(V[i], g);
    let n = map.get(k);
    if (n === undefined) { n = pos.length; map.set(k, n); pos.push(V[i].slice()); grp.push(g); }
    index.push(n);
  }
}

// ---- paint regions (coordinates are the OBJ's own: feet at y 0, head top at y ~118, face towards +z) ----
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const colors = pos.map(([x, y, z], i) => {
  if (grp[i] === 'Chibi_Head') {
    // face and neck are the front, below the fringe; everything else on the head is hair (fringe, sides, ponytail)
    const face = z > 6 && y < 93 && Math.abs(x) < 15;
    const neck = y < 72;
    return face || neck ? COLORS.skin : COLORS.hair;
  }
  if (y < 6) return COLORS.shoes;
  if (y < 15 && Math.abs(x) < 9 && z > -4) return COLORS.skin;                 // legs below the hem
  if (y > 56 && Math.abs(x) > 11.5) return COLORS.skin;                         // arms
  if (y > 63 && Math.abs(x) < 6) return COLORS.skin;                            // neck and shoulders
  return z < -6 || y < 22 ? COLORS.dressDark : COLORS.dress;                     // petals at the hem and back read darker
});

// ---- pose: swing each arm down from the shoulder and a little forward ----
const ARM_DOWN = 62 * Math.PI / 180, ARM_FWD = 18 * Math.PI / 180, SHOULDER_X = 11, SHOULDER_Y = 62;
for (let i = 0; i < pos.length; i++) {
  if (grp[i] !== 'Chibi_Body') continue;      // only the arms move; the head is wide enough to catch the rule otherwise
  const p = pos[i];
  const ax = Math.abs(p[0]);
  if (p[1] < 52 || ax < SHOULDER_X - 1) continue;
  const w = smooth(SHOULDER_X - 1, SHOULDER_X + 4, ax);       // blend in across the shoulder so it does not crease
  const s = Math.sign(p[0]);
  // rotate about the shoulder in the XY plane (down), then about Y (forward)
  let dx = p[0] - s * SHOULDER_X, dy = p[1] - SHOULDER_Y;
  const a = -s * ARM_DOWN * w;
  [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  let dz = p[2];
  const f = s * ARM_FWD * w;
  [dx, dz] = [dx * Math.cos(f) - dz * Math.sin(f), dx * Math.sin(f) + dz * Math.cos(f)];
  p[0] = s * SHOULDER_X + dx; p[1] = SHOULDER_Y + dy; p[2] = dz;
}

// ---- normalise: feet at 0, centred, fixed height ----
let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0;
for (const p of pos) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); cx += p[0]; cz += p[2]; }
cx /= pos.length; cz /= pos.length;
const k = HEIGHT / (maxY - minY);

// ---- write ----
const n = pos.length, m = index.length;
const buf = Buffer.alloc(8 + n * 12 + n * 4 + m * 4);
buf.writeUInt32LE(n, 0);
buf.writeUInt32LE(m, 4);
let o = 8;
for (const p of pos) { buf.writeFloatLE((p[0] - cx) * k, o); buf.writeFloatLE((p[1] - minY) * k, o + 4); buf.writeFloatLE((p[2] - cz) * k, o + 8); o += 12; }
for (const c of colors) { buf.writeUInt8(c[0], o); buf.writeUInt8(c[1], o + 1); buf.writeUInt8(c[2], o + 2); buf.writeUInt8(255, o + 3); o += 4; }
for (const i of index) { buf.writeUInt32LE(i, o); o += 4; }
fs.writeFileSync(dst, buf);
console.log(`vertices ${n}, triangles ${m / 3}, ${(buf.length / 1024).toFixed(0)} KB -> ${dst}`);
