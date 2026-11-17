// Falcon, in motion (components/FalconFilm.astro): a 10-second, looping 3D film, rendered live with three.js.
//
// One master clock drives everything. The scene, the camera and the type over it are pure functions of t (seconds,
// 0–10): any frame can be drawn on its own (seek), the film is the same on every play, and nothing runs on its own
// timer. Each track ends on the value it starts with (values that change while hidden are put back while hidden), the
// camera rides a closed spline, and check() proves the loop by comparing the scene's state and the rendered pixels
// at t = 0 and t = 10. Frame n of 300 (30 fps) is t = n / 30.
//
// Picture: an HDR pipeline (half-float, 4× MSAA), no tone curve (UI colours stay exactly as designed), bloom only on
// true highlights (above 1.0: speculars, the red signal, the light on the glass), then grain, vignette and a touch of
// lens fringing. The display is modelled here (bevelled aluminium body, flush black glass, hinge, a stand bent from one
// sheet); every UI card is a bevelled glass slab with the interface on its face.
//
// Story (verified against the case study, the paper and the changelog):
//   0–2 s   five sources float apart, each its own tab: HPSM tickets, topology, sessions, syslog, VIPAM
//   2–4 s   they gather into three decks: the three root causes; a red signal runs through them
//   4–6.5   the display rises from the floor; the sources become the dashboard's parts in an exploded view and
//           settle onto the glass; rows populate, the root-cause bars draw, a light runs round the recommendation
//   6.5–9   the product, from behind the engineers; a light sweeps the glass
//   9–10    it comes apart into the five lines it began as
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import engineersUrl from '../assets/falcon/hero-engineers.png?url';
import { BARS, FRAG_RADIUS, FRAG_SIZE, LAYERS, RADIUS, drawFragment, drawLayer, type Rect } from './falcon-film-source';

export const DURATION = 10;

// ------------------------------------------------------------------ easing and tracks
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u, sy = (u: number) => ((ay * u + by) * u + cy) * u, dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) { const e = sx(u) - x, d = dx(u); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; u -= e / d; }
    let lo = 0, hi = 1;
    for (let i = 0; i < 24 && Math.abs(sx(u) - x) > 1e-6; i++) { if (sx(u) < x) lo = u; else hi = u; u = (lo + hi) / 2; }
    return sy(u);
  };
};
type Ease = (x: number) => number;
const OUT = bezier(0.22, 1, 0.36, 1), IO = bezier(0.65, 0, 0.35, 1), IN = bezier(0.55, 0, 0.75, 0.2), LIN: Ease = x => x;
type V = number | number[];
type K = [number, V, Ease?];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixV = (a: V, b: V, k: number): V => (typeof a === 'number' ? lerp(a, b as number, k) : a.map((x, i) => lerp(x, (b as number[])[i], k)));
function kf(t: number, keys: K[]): V {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e = OUT] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return t1 === t0 ? v1 : mixV(v0, v1, e((t - t0) / (t1 - t0))); }
  }
  return keys[keys.length - 1][1];
}
const n = (t: number, keys: K[]) => kf(t, keys) as number;
const v = (t: number, keys: K[]) => kf(t, keys) as number[];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------------ the world (metres-ish; the screen is 1.6 × 0.9)
const PX = 0.001;                                   // one dashboard px
const SC = new THREE.Vector3(0, 0.8, 0);            // the screen's centre; its glass is at z = 0
const onScreen = ([x, y, w, h]: Rect, pad = 0): [number, number, number, number] =>
  [(x + w / 2) * PX - 0.8, SC.y + 0.45 - (y + h / 2) * PX, (w + pad * 2) * PX, (h + pad * 2) * PX];

// the five sources, floating apart: position, rotation, width
type Pose = number[];                                // [x, y, z, rx, ry, rz, width]
const FRAG: Pose[] = [
  [-1.12, 1.2, -0.1, 0.06, 0.42, -0.02, 0.7],
  [-0.3, 1.44, -0.9, -0.05, 0.16, 0.01, 0.52],
  [0.2, 0.93, 0.42, 0.04, -0.26, 0.01, 0.56],
  [1.02, 0.6, -0.3, -0.06, -0.44, 0.02, 0.72],
  [1.16, 1.34, 0.18, 0.05, -0.52, -0.01, 0.46],
];
const ARRIVE = [[-0.45, 0, 0.1], [0, 0.35, -0.3], [0.1, -0.25, 0.45], [0.45, 0, 0], [0.25, 0.3, 0]];   // each from its own side
const SEED: Pose[] = FRAG.map((p, i) => [p[0] + ARRIVE[i][0], p[1] + ARRIVE[i][1], p[2] + ARRIVE[i][2], p[3], p[4], p[5], p[6] * 0.8]);
// three decks, one per root cause: the second source of a cause sits just behind the first, its top edge showing
const GROUP = [0, 0, 1, 1, 2], GROUP_X = [-0.98, 0, 0.98];
const COL: Pose[] = GROUP.map((g, i) => { const j = i === 1 || i === 3 ? 1 : 0; return [GROUP_X[g] + j * 0.035, 1.13 + j * 0.05, 0.4 - j * 0.07, 0.04, -0.1, 0, 0.56 * (1 - j * 0.04)]; });
// which part of the dashboard each source becomes: tickets → Recent Activity, topology → Region Wise Activity,
// sessions → the top bar (one search across every source), syslog → Root Cause Table, VIPAM → Recommended Investigation
const BECOMES = ['recent', 'region', 'top', 'rct', 'rec'];
const PAD = 10;
const FLIPZ = 0.0088;                                 // the depth between a card's two faces
// how far each part floats off the glass in the exploded view, and the order they settle in
const LIFT: Record<string, number> = { side: 0.1, top: 0.13, kpi0: 0.2, kpi1: 0.22, kpi2: 0.24, kpi3: 0.26, recent: 0.15, region: 0.28, rec: 0.36, rct: 0.19, chat: 0.44 };
const ORDER = ['side', 'top', 'kpi0', 'kpi1', 'kpi2', 'kpi3', 'recent', 'region', 'rec', 'rct', 'chat'];
const SETTLE = (name: string) => 5.35 + ORDER.indexOf(name) * 0.075;
const flatZ = (name: string) => 0.003 + ORDER.indexOf(name) * 0.0006;
const layerPose = (name: string, z: number): Pose => { const [x, y, w] = onScreen(LAYERS[name], PAD); return [x, y, z, 0, 0, 0, w]; };

// the camera rides a closed spline through these (time, position, target)
const CAM: [number, number[], number[]][] = [
  [0, [0.58, 1.14, 3.45], [0.05, 0.96, 0]],
  [2.0, [0.18, 1.06, 2.95], [0.02, 0.98, 0]],
  [3.3, [0.06, 1.04, 3.3], [0, 0.98, 0.2]],
  [5.0, [-2.0, 1.14, 2.5], [0.06, 0.84, 0.1]],
  [6.7, [-0.7, 1.04, 2.95], [0.02, 0.98, 0]],
  [8.7, [0.04, 1.02, 2.7], [0, 1.0, 0]],
];
function camAt(t: number) {
  const N = CAM.length, T = DURATION;
  let i = N - 1;
  for (let k = 0; k < N; k++) if (t >= CAM[k][0]) i = k;
  const at = (k: number) => CAM[((k % N) + N) % N];
  const time = (k: number) => at(k)[0] + Math.floor(k / N) * T;
  const t0 = time(i), t1 = time(i + 1), dt = t1 - t0, u = (t - t0) / dt;
  const h = (which: 1 | 2) => {
    const p = (k: number) => at(k)[which];
    const m = (k: number) => p(k + 1).map((x, j) => (x - p(k - 1)[j]) / (time(k + 1) - time(k - 1)));
    const a = p(i), b = p(i + 1), ma = m(i), mb = m(i + 1);
    const u2 = u * u, u3 = u2 * u;
    return a.map((_, j) => (2 * u3 - 3 * u2 + 1) * a[j] + (u3 - 2 * u2 + u) * dt * ma[j] + (-2 * u3 + 3 * u2) * b[j] + (u3 - u2) * dt * mb[j]);
  };
  return { pos: h(1), target: h(2) };
}

// ------------------------------------------------------------------ geometry helpers
function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
/** a bevelled slab whose front face sits at z = −0.0004 (the UI plane goes at z = 0) */
function slabGeometry(w: number, h: number, r: number, depth: number) {
  const b = Math.min(0.0024, r * 0.45, depth * 0.3);
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, h - 2 * b, Math.max(r - b, 0.0004)),
    { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments: 24 });
  g.translate(0, 0, -(depth - b) - 0.0004);
  return g;
}

// ------------------------------------------------------------------ texture helpers
const paint = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')!); return c; };
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b51b03';

// ------------------------------------------------------------------ the scene
interface Built { apply(t: number): void; render(): void; resize(): void; snapshot(): number[]; canvas: HTMLCanvasElement; quality(pr?: number, samples?: number): number; samples(): number; frameMs(t: number): number }

async function build(root: HTMLElement, canvas: HTMLCanvasElement): Promise<Built> {
  const INK = 0xf3efe8, MUTE = 0x9a948b;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  let PR = Math.min(Math.max(devicePixelRatio, 1.5), 2);     // supersampled on 1× screens (lowered by quality() if the GPU can't hold 60 fps)
  renderer.setPixelRatio(PR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;   // UI colours exactly as designed; only true highlights (>1) bloom
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // only the display casts a shadow: redrawn only when it moves (see apply)
  let shadowAt = NaN;
  renderer.localClippingEnabled = true;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const RED = new THREE.Color(accent());
  const hdr = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
  const rgba = (hex: string, a: number) => { const c = new THREE.Color(hex); const s = c.getStyle(THREE.SRGBColorSpace).match(/\d+/g)!; return `rgba(${s[0]},${s[1]},${s[2]},${a})`; };
  const ACC = accent();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 60);

  // ---- the room: a painted backdrop (the film's ground), and an environment for the reflections
  const ellipse = (g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) => {
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(-rx * 4, -rx * 4, rx * 8, rx * 8); g.restore();
  };
  const backdrop = paint(1920, 1080, g => {
    g.fillStyle = '#080706'; g.fillRect(0, 0, 1920, 1080);
    ellipse(g, 960, 378, 1728, 756, [[0, '#231d19'], [0.55, '#120f0d'], [1, 'rgba(8,7,6,0)']]);
    ellipse(g, 960, 1274, 1344, 594, [[0, rgba(ACC, 0.5)], [0.38, rgba(ACC, 0.16)], [0.72, rgba(ACC, 0)]]);
  });
  scene.background = tex(backdrop);
  const pmrem = new THREE.PMREMGenerator(renderer);
  {
    // a black studio with softboxes: the long highlights that read as machined aluminium, and one red strip behind
    const env = new THREE.Scene(); env.background = new THREE.Color(0x030303);
    const box = (w: number, h: number, k: number, color = new THREE.Color(1, 1, 1)) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: hdr(color, k), side: THREE.DoubleSide }));
    const top = box(5, 2.2, 3.2); top.position.set(0, 4, 0.5); top.rotation.x = Math.PI / 2; env.add(top);
    const left = box(0.5, 4, 5); left.position.set(-4, 1.6, 1.2); left.rotation.y = Math.PI / 2; env.add(left);
    const right = box(0.5, 4, 3.5); right.position.set(4, 1.6, 0.6); right.rotation.y = -Math.PI / 2; env.add(right);
    const front = box(3.5, 1.2, 0.7); front.position.set(0, 1.2, 5); front.rotation.y = Math.PI; env.add(front);
    const red = box(6, 0.5, 6, RED); red.position.set(0, 0.4, -4); env.add(red);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
  }

  // ---- light: a soft key from above left for the shadows, and a red rim from behind
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  scene.environmentIntensity = 1;
  key.position.set(-2.2, 4.2, 3.0); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.radius = 6; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.2, near: 0.5, far: 10 });
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x1a1512, 0.2));
  {
    const rim = new THREE.DirectionalLight(RED, 4.5); rim.position.set(2.6, 1.4, -2.4); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(RED, 2.2); rim2.position.set(-2.8, 0.6, -1.8); scene.add(rim2);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // ---- the display, modelled here: a generic studio display, no branding
  const display = new THREE.Group(); scene.add(display);
  const floorClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];   // it rises out of the floor
  const alu = new THREE.MeshPhysicalMaterial({ color: 0xb4b6ba, metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.22,
    clippingPlanes: floorClip, clipShadows: true });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    clippingPlanes: floorClip, clipShadows: true });
  const BW = 1.652, BH = 0.952, BR = 0.02, BD = 0.027;
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(BW - 0.012, BH - 0.012, BR - 0.006), { depth: BD - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 12, curveSegments: 32 });
  bodyGeo.translate(0, 0, -(BD - 0.006) - 0.0006);
  const body = new THREE.Mesh(bodyGeo, alu); body.position.y = SC.y; body.castShadow = true; display.add(body);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(BW - 0.006, BH - 0.006, BR - 0.003), 32), glass);
  front.position.set(0, SC.y, 0.0001); display.add(front);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.27, 64, 1), alu);
  hinge.rotation.z = Math.PI / 2; hinge.position.set(0, 0.64, -0.041); hinge.castShadow = true; display.add(hinge);
  // the stand: one aluminium sheet, from the hinge down and back, bent round into a foot that reaches forward
  {
    const A = new THREE.Vector2(-0.041, 0.64), C = new THREE.Vector2(0.075, 0.012), Bk = new THREE.Vector2(-0.255, 0.012), half = 0.006;
    const d1 = Bk.clone().sub(A).normalize(), n1 = new THREE.Vector2(-d1.y, d1.x), d2 = new THREE.Vector2(1, 0), n2 = new THREE.Vector2(0, 1);
    const off = (p: THREE.Vector2, nrm: THREE.Vector2, k: number) => p.clone().add(nrm.clone().multiplyScalar(k));
    const meet = (p: THREE.Vector2, dp: THREE.Vector2, q: THREE.Vector2, dq: THREE.Vector2) => { const den = dp.x * dq.y - dp.y * dq.x; const s = ((q.x - p.x) * dq.y - (q.y - p.y) * dq.x) / den; return p.clone().add(dp.clone().multiplyScalar(s)); };
    const Qi = meet(off(A, n1, half), d1, off(C, n2, half), d2), Qo = meet(off(A, n1, -half), d1, off(C, n2, -half), d2);
    const ri = 0.03, ro = 0.045;
    const s = new THREE.Shape();
    const go = (q: THREE.Vector2) => s.lineTo(q.x, q.y);
    const a0 = off(A, n1, half); s.moveTo(a0.x, a0.y);
    go(off(Qi, d1, -ri)); const qi = off(Qi, d2, ri); s.quadraticCurveTo(Qi.x, Qi.y, qi.x, qi.y);
    go(off(C, n2, half)); go(off(C, n2, -half));
    go(off(Qo, d2, ro)); const qo = off(Qo, d1, -ro); s.quadraticCurveTo(Qo.x, Qo.y, qo.x, qo.y);
    go(off(A, n1, -half)); s.closePath();
    const width = 0.3, bev = 0.0025;
    const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 8, curveSegments: 48 });
    g.rotateY(-Math.PI / 2); g.translate((width - 2 * bev) / 2, 0, 0);
    const stand = new THREE.Mesh(g, alu); stand.castShadow = true; display.add(stand);
  }
  // soft light and shadow the display brings with it
  const glow = (rgb: string, a: number) => tex(paint(256, 256, g => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); for (let k = 0; k <= 16; k++) { const x = k / 16; r.addColorStop(x, `rgba(${rgb},${(a * Math.pow(1 - x, 2.2)).toFixed(4)})`); } g.fillStyle = r; g.fillRect(0, 0, 256, 256); }));
  const flatMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, clippingPlanes: floorClip });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), flatMat(glow('10,8,6', 0.7)));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0, 0.0012, -0.09); display.add(contact);
  const glowMats: THREE.Material[] = [contact.material as THREE.Material];
  {
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.9), flatMat(glow('255,236,220', 0.13)));
    halo.position.set(0, 0.98, -0.45); halo.renderOrder = -1; display.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), flatMat(glow('255,238,224', 0.15)));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.0015, 0.5); pool.renderOrder = -1; display.add(pool);
    glowMats.push(halo.material as THREE.Material, pool.material as THREE.Material);
  }
  // the screen: the dashboard's page (background, refresh note, scroll bar)
  const base = await drawLayer('base', 2, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: tex(base.canvas), clippingPlanes: floorClip }));
  screen.position.set(0, SC.y, 0.0007); display.add(screen);
  // a light sweeping the glass (HDR, so its brightest band blooms)
  const sweepMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPos: { value: -1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float uPos; void main(){ float d = (vUv.x * .8 + vUv.y * .45) - uPos; float a = exp(-d*d/.014) * .16 + exp(-d*d/.0006) * .16; gl_FragColor = vec4(vec3(1.7), a); }',
  });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), sweepMat);
  sweep.position.set(0, SC.y, 0.06); sweep.renderOrder = 70; scene.add(sweep);

  // ---- the dashboard's parts: each a bevelled glass slab with its interface on the face
  const shadowTex = tex(paint(256, 160, g => { g.filter = 'blur(14px)'; g.fillStyle = 'rgba(20,14,8,1)'; g.beginPath(); g.roundRect(34, 34, 188, 92, 12); g.fill(); }));
  const EDGE: Record<string, number> = { top: 0xf6f1ea, side: 0xf3f1ee, kpi0: 0xf25a2c, kpi1: 0xf0a30a, kpi2: 0x5b5ceb, kpi3: 0x17b39b };
  // the slabs write depth, so a line passing behind a card is hidden by it
  const edgeMat = (color: number) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, depthWrite: true });
  interface Part { g: THREE.Group; face: THREE.Mesh; faceMat: THREE.MeshBasicMaterial; slab?: THREE.Mesh; slabMat?: THREE.MeshPhysicalMaterial; shadow: THREE.Mesh; shadowMat: THREE.MeshBasicMaterial; aspect: number; w: number }
  const makePart = (c: HTMLCanvasElement, w: number, h: number, contentW: number, contentH: number, radius: number, edge: number | null, order: number): Part => {
    const g = new THREE.Group();
    const faceMat = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat); face.renderOrder = order + 1; g.add(face);
    let slab: THREE.Mesh | undefined, slabMat: THREE.MeshPhysicalMaterial | undefined;
    if (edge !== null) { slabMat = edgeMat(edge); slab = new THREE.Mesh(slabGeometry(contentW, contentH, radius, 0.008), slabMat); slab.renderOrder = order; g.add(slab); }
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat); shadow.renderOrder = 2; scene.add(shadow);
    return { g, face, faceMat, slab, slabMat, shadow, shadowMat, aspect: h / w, w };
  };
  const setPart = (p: Part, op: number, flatten: number) => {
    p.faceMat.opacity = op; p.face.visible = op > 0.001;
    if (p.slab && p.slabMat) { p.slabMat.opacity = op; p.slab.visible = op > 0.001; p.slab.scale.z = lerp(1, 0.04, flatten); }
  };
  const SCALE = 3;
  const names = ['side', 'top', 'kpi0', 'kpi1', 'kpi2', 'kpi3', 'recent', 'region', 'rec', 'rct', 'chat'];
  const parts: Record<string, Part> = {};
  await Promise.all(names.map(async nm => {
    const { canvas: c } = await drawLayer(nm, SCALE, PAD);
    const [, , w, h] = LAYERS[nm];
    parts[nm] = makePart(c, (w + 2 * PAD) * PX, (h + 2 * PAD) * PX, w * PX, h * PX, (RADIUS[nm] ?? 0) * PX, nm === 'chat' ? null : (EDGE[nm] ?? 0xf4f2ef), 10 + ORDER.indexOf(nm) * 2);
  }));
  const fragCanvases = await Promise.all(FRAG_SIZE.map((_, i) => drawFragment(i, SCALE)));

  // a part's shadow lies on the glass under it, softer and further off the higher it floats
  const setShadow = (p: Part, x: number, y: number, z: number, w: number, op: number, rise: number) => {
    const lift = clamp01((z - 0.004) / 0.12);
    p.shadow.position.set(x + 0.18 * z, y - 0.3 * z, 0.0014);
    p.shadow.scale.set(w * (1.18 + 0.4 * lift), w * p.aspect * (1.32 + 0.4 * lift), 1);
    p.shadowMat.opacity = (0.4) * lift * op * rise;
    p.shadow.visible = p.shadowMat.opacity > 0.001;
  };

  // the five sources: each a group holding the source slab, the part it becomes, and its outline
  const unitRect = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0)]);
  const frags = FRAG.map((F, i) => {
    const g = new THREE.Group(); scene.add(g);
    const [pw, ph] = FRAG_SIZE[i], Fw = F[6], s = Fw / pw;
    const src = makePart(fragCanvases[i], Fw, ph * s, Fw, ph * s, FRAG_RADIUS * s, 0x2b2623, 30);
    g.add(src.g); scene.remove(src.shadow);
    const fShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 });
    const fShadow = new THREE.Mesh(new THREE.PlaneGeometry(Fw * 1.1, ph * s * 1.22), fShadowMat); fShadow.position.set(0.02, -0.035, -0.06); fShadow.renderOrder = 29; src.g.add(fShadow);
    // the part it becomes is mounted on the back of the card: the card turns over on its way to the screen
    const p = parts[BECOMES[i]]; p.g.rotation.y = Math.PI; p.g.position.z = -FLIPZ; g.add(p.g);
    const outline = new THREE.LineLoop(unitRect, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }));
    outline.renderOrder = 31; g.add(outline);
    return { g, src, fShadow, fShadowMat, Fw, fAspect: ph / pw, p, outline, name: BECOMES[i], faceZ: 0 };
  });
  const others = names.filter(nm => !BECOMES.includes(nm)).map(nm => { scene.add(parts[nm].g); return nm; });

  // rows and root-cause bars, drawn in after their cards settle
  const rows = await Promise.all([0, 1, 2, 3, 4].map(async i => {
    const { canvas: c } = await drawLayer(`row${i}`, SCALE, 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false }); const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const [x, y, w, h] = onScreen(LAYERS[`row${i}`]); m.scale.set(w, h, 1); m.position.set(x, y, 0); m.renderOrder = 50; scene.add(m);
    return { m, mat };
  }));
  const barTex = tex(paint(256, 4, g => { const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#f04533'); gr.addColorStop(1, '#fa991f'); g.fillStyle = gr; g.fillRect(0, 0, 256, 4); }));
  const bars = BARS.map(r => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0.5, 0, 0);
    const mat = new THREE.MeshBasicMaterial({ map: barTex, transparent: true, depthWrite: false }); const m = new THREE.Mesh(geo, mat);
    const [cx, cy, w, h] = onScreen(r); m.position.set(cx - w / 2, cy, 0); m.renderOrder = 51; scene.add(m);
    return { m, mat, w, h };
  });
  // the recommendation lights up: a light running round its card's edge, Falcon's red at its head, amber behind
  const RING_PAD = 22, ringSize = [346 + RING_PAD * 2, 548 + RING_PAD * 2];
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uAng: { value: 0 }, uOp: { value: 0 }, uSize: { value: new THREE.Vector2(ringSize[0], ringSize[1]) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform vec2 uSize; uniform float uAng; uniform float uOp;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
      void main(){
        vec2 p = (vUv - .5) * uSize;
        float d = sdRound(p, vec2(173., 274.), 10.);
        float line = 1. - smoothstep(.6, 2.2, abs(d));
        float glow = exp(-abs(d) / 7.) * .45;
        float a = fract(atan(p.y, p.x) / 6.2831853 - uAng);
        vec3 col = mix(vec3(.98, .6, .12), vec3(.91, .22, .18), a) * (1. + 1.6 * line * a);
        gl_FragColor = vec4(col, (line + glow) * pow(a, 1.4) * uOp);
      }`,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(ringSize[0] * PX, ringSize[1] * PX), ringMat); ring.renderOrder = 52; scene.add(ring);
  const [rx, ry] = onScreen([1196, 127, 346, 548]);

  // ---- the engineers: the case study's own silhouettes, in the foreground and out of focus
  const eng = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = engineersUrl; });
  const cut = (sx: number, sw: number) => paint(sw, eng.height, g => { g.filter = 'blur(11px)'; g.drawImage(eng, sx, 0, sw, eng.height, 0, 0, sw, eng.height); });
  const people = [[0, 680, -0.48, 0.92, 1.3], [850, 598, 0.46, 0.94, 1.32]].map(([sx, sw, x, top, z]) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex(cut(sx, sw)), transparent: true, depthWrite: false, color: 0x000000 });
    const h = 0.95, w = h * sw / eng.height;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, top - h / 2, z); m.renderOrder = 80; scene.add(m);
    return { m, mat };
  });

  // ---- lines: the cut connections between sources, the data drifting on them, the red signal and its trails
  const fragCentre = (i: number) => new THREE.Vector3(FRAG[i][0], FRAG[i][1], FRAG[i][2]);
  const cuts = [[0, 1], [1, 2], [2, 3], [4, 3]].map(([a, b]) => {
    const A = fragCentre(a), B = fragCentre(b), dir = B.clone().sub(A);
    const p0 = A.clone().add(dir.clone().multiplyScalar(0.32)), p1 = A.clone().add(dir.clone().multiplyScalar(0.62));
    p1.y += 0.05;
    const curve = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(p1.x, p0.y, (p0.z + p1.z) / 2), p1], false, 'catmullrom', 0);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: MUTE, transparent: true, opacity: 0.6 }));
    line.renderOrder = 32; scene.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 32, 24), new THREE.MeshBasicMaterial({ color: INK, transparent: true }));
    dot.renderOrder = 33; scene.add(dot);
    return { line, curve, dot };
  });
  const fat = (pts: THREE.Vector3[], width: number, color: THREE.Color, op = 1) => {
    const geo = new LineGeometry(); geo.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
    const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity: op, worldUnits: false });
    const l = new Line2(geo, mat); l.renderOrder = 35; scene.add(l);
    return { l, mat, segs: pts.length - 1, base: op };
  };
  const SIG = hdr(RED, 3.2), HOME = new THREE.Vector3(1.5, 0.32, 0.75);   // where the red signal rests
  const trailCurve = new THREE.CatmullRomCurve3([HOME, fragCentre(3), fragCentre(4), fragCentre(2), fragCentre(1), fragCentre(0)], false, 'centripetal');
  const trailPts = trailCurve.getPoints(220);
  const trail = fat(trailPts, 2.4, SIG);
  const L0 = new THREE.Vector3(-1.32, 0.8, 0.4), L1 = new THREE.Vector3(1.32, 0.8, 0.4);
  const sweepPts = Array.from({ length: 161 }, (_, i) => L0.clone().lerp(L1, i / 160));
  const redLine = fat(sweepPts, 2.6, SIG);
  const thin = fat(sweepPts, 1, new THREE.Color(INK), 0.3); thin.l.renderOrder = 34;
  const signal = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: hdr(RED, 5) }));
  signal.renderOrder = 36; scene.add(signal);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex(paint(128, 128, g => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, rgba(ACC, 0.45)); r.addColorStop(1, rgba(ACC, 0)); g.fillStyle = r; g.fillRect(0, 0, 128, 128); })),
    transparent: true, depthWrite: false,
  }));
  halo.renderOrder = 35; scene.add(halo);
  const [ex, ey] = onScreen([1213, 152, 1, 1]);
  const REC_EYE = [ex, ey, LIFT.rec * 1.4];
  const MIDP = [0, SC.y, 0.35];

  // ---- post: HDR (half float, 4× MSAA) → bloom on highlights above 1 → tone map → grain, vignette, fringing
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(PR);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(16, 16), 0.7, 0.55, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // FXAA stands in for MSAA on GPUs that need it switched off (see quality())
  const fxaa = new ShaderPass(FXAAShader); fxaa.enabled = false; composer.addPass(fxaa);
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 0.55 }, uGrain: { value: 0.035 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uVig; uniform float uGrain; varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec2 c = vUv - .5; float r = dot(c, c);
        float ca = .0016 * r * 4.;
        vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
        col *= 1. - r * uVig;
        col += (hash(floor(vUv * uRes) + fract(uTime * 7.31) * 131.) - .5) * uGrain;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  composer.addPass(finish);

  // ------------------------------------------------------------------ the film at t
  const OPEN = (i: number) => 0.1 + i * 0.12;
  const vis = (m: THREE.Object3D, mat: { opacity: number }, op: number) => { mat.opacity = op; m.visible = op > 0.001; };

  function apply(t: number) {
    const c = camAt(t);
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    camera.lookAt(c.target[0], c.target[1], c.target[2]);
    finish.uniforms.uTime.value = t % DURATION;

    // the display rises out of the floor, turning to face us; at the end it sinks back
    const rise = n(t, [[3.5, 0], [4.5, 1, OUT], [9.0, 1], [9.45, 0, IN]]);
    display.visible = rise > 0.001;
    display.position.y = (rise - 1) * 1.45;
    display.rotation.y = (1 - rise) * 0.35;
    if (rise !== shadowAt) { shadowAt = rise; renderer.shadowMap.needsUpdate = true; }
    glowMats.forEach(m => { m.opacity = rise; });
    sweepMat.uniforms.uPos.value = n(t, [[7.1, -0.6], [8.5, 1.9, IO], [8.51, -0.6, LIN]]);
    sweep.visible = rise > 0.999;

    // the sources → the parts they become
    frags.forEach((f, i) => {
      const o = OPEN(i), nm = f.name, s = SETTLE(nm);
      const P = layerPose(nm, LIFT[nm]), F = layerPose(nm, flatZ(nm)), OUTP = layerPose(nm, LIFT[nm] * 1.5);
      const pose = v(t, [[0, SEED[i]], [o, SEED[i]], [o + 1.0, FRAG[i], OUT], [2.0 + i * 0.05, FRAG[i]], [2.7 + i * 0.04, COL[i], IO], [3.55, COL[i]],
        [4.55 + i * 0.06, P, IO], [s, P], [s + 0.6, F, OUT], [9.0, F], [9.28, OUTP, OUT], [9.95, SEED[i], IO]]);
      const sy = n(t, [[o + 0.12, 0.006], [o + 0.85, 1, OUT], [9.42, 1], [9.92, 0.006, IO]]);
      const morph = n(t, [[3.95 + i * 0.06, 0], [4.45 + i * 0.06, 1, IO], [9.05, 1], [9.4, 0, IO]]);
      const panel = n(t, [[o + 0.25, 0], [o + 0.85, 1, OUT], [9.55, 1], [9.9, 0, IN]]);
      const flat = n(t, [[s, 0], [s + 0.6, 1, OUT], [9.0, 1], [9.2, 0, LIN]]);
      // the group carries position, turn (plus the flip) and the collapse to a line; each slab keeps its own width.
      // After the flip the part's face sits FLIPZ in front of the group, so the group steps back by that much.
      const flip = Math.PI * morph, front = Math.cos(flip) >= 0;
      f.g.position.set(pose[0], pose[1], pose[2] - FLIPZ * morph); f.g.rotation.set(pose[3], pose[4] + flip, pose[5]); f.g.scale.set(1, sy, 1);
      f.faceZ = pose[2];
      const Sw = SEED[i][6], Fw = FRAG[i][6], Cw = COL[i][6];
      const fw = n(t, [[0, Sw], [o, Sw], [o + 1.0, Fw, OUT], [2.0 + i * 0.05, Fw], [2.7 + i * 0.04, Cw, IO], [4.6, Cw], [4.61, Fw, LIN], [9.3, Fw], [9.95, Sw, IO]]);
      const lw = pose[6];
      f.src.g.scale.setScalar(fw / f.Fw);
      f.p.g.scale.setScalar(lw / f.p.w);
      f.outline.scale.set(fw, fw * f.fAspect, 1);
      setPart(f.src, front ? panel : 0, 0);
      vis(f.fShadow, f.fShadowMat, front ? 0.35 * panel : 0);
      setPart(f.p, front ? 0 : 1, flat);
      vis(f.outline, f.outline.material as THREE.LineBasicMaterial, front ? 0.55 * (1 - 0.92 * panel) : 0);
      setShadow(f.p, pose[0], pose[1], pose[2], pose[6], front ? 0 : 1, rise);
    });
    // the parts with no source: the sidebar, the KPI cards one by one, the chat button
    others.forEach((nm, j) => {
      const p = parts[nm], a = 4.55 + j * 0.08, s = SETTLE(nm);
      const z = n(t, [[a, LIFT[nm] + 0.6], [a + 0.6, LIFT[nm], OUT], [s, LIFT[nm]], [s + 0.6, flatZ(nm), OUT], [9.0, flatZ(nm)], [9.28, LIFT[nm] * 1.5, OUT], [9.4, LIFT[nm] * 1.5], [9.41, LIFT[nm] + 0.6, LIN]]);
      const op = n(t, [[a, 0], [a + 0.45, 1, OUT], [9.08, 1], [9.36, 0, IN]]);
      const flat = n(t, [[s, 0], [s + 0.6, 1, OUT], [9.0, 1], [9.2, 0, LIN]]);
      const pose = layerPose(nm, z);
      p.g.position.set(pose[0], pose[1], z);
      setPart(p, op, flat);
      setShadow(p, pose[0], pose[1], z, pose[6], op, rise);
    });
    // rows populate, bars draw, the recommendation lights
    const recentZ = frags[0].faceZ;
    rows.forEach((r, i) => {
      const a = 6.0 + i * 0.08;
      r.m.position.z = recentZ + 0.002 + n(t, [[a, 0.06], [a + 0.55, 0, OUT], [9.25, 0], [9.26, 0.06, LIN]]);
      vis(r.m, r.mat, n(t, [[a, 0], [a + 0.4, 1, OUT], [9.0, 1], [9.2, 0, IN]]));
    });
    const regionZ = frags[1].faceZ;
    bars.forEach((b, i) => {
      const k = n(t, [[6.05 + i * 0.07, 0], [6.85 + i * 0.07, 1, OUT], [9.25, 1], [9.26, 0, LIN]]);
      b.m.scale.set(Math.max(1e-4, b.w * k), b.h, 1); b.m.position.z = regionZ + 0.002;
      vis(b.m, b.mat, k > 0 ? n(t, [[9.0, 1], [9.2, 0, IN]]) : 0);
    });
    const lit = n(t, [[6.3, 0], [6.55, 1, OUT], [7.55, 1], [7.95, 0, IO]]);
    ring.position.set(rx, ry, frags[4].faceZ + 0.003);
    ringMat.uniforms.uAng.value = n(t, [[6.3, 0], [7.95, 1.3, IO], [7.96, 0, LIN]]);
    ringMat.uniforms.uOp.value = lit; ring.visible = lit > 0.001;

    // the engineers
    const e = n(t, [[6.9, 0], [7.6, 1, OUT], [8.95, 1], [9.3, 0, IN]]);
    people.forEach(p => vis(p.m, p.mat, 0.88 * e));

    // cut connections and drifting data
    cuts.forEach((cu, k) => {
      const drawn = n(t, [[0.45 + k * 0.12, 0], [1.25 + k * 0.12, 1, OUT], [2.3, 1], [2.31, 0, LIN]]);
      cu.line.geometry.setDrawRange(0, Math.round(81 * drawn));
      vis(cu.line, cu.line.material as THREE.LineBasicMaterial, n(t, [[0, 0.6], [2.0, 0.6], [2.3, 0, LIN], [2.31, 0.6, LIN]]));
      const u = n(t, [[0.75 + k * 0.15, 0], [1.85 + k * 0.1, 1, IO], [2.1, 1], [2.11, 0, LIN]]);
      cu.dot.position.copy(cu.curve.getPoint(u));
      vis(cu.dot, cu.dot.material as THREE.MeshBasicMaterial, n(t, [[0.7 + k * 0.15, 0], [0.85 + k * 0.15, 1, LIN], [1.8 + k * 0.1, 1], [1.95 + k * 0.1, 0, LIN]]));
    });

    // the red signal
    const tr = n(t, [[1.35, 0], [2.15, 1, IO], [2.5, 1], [2.51, 0, LIN]]);
    trail.l.geometry.instanceCount = Math.round(trail.segs * tr);
    trail.mat.opacity = n(t, [[2.15, 1], [2.45, 0, LIN], [2.5, 0], [2.51, 1, LIN]]); trail.l.visible = tr > 0 && trail.mat.opacity > 0;
    const sw = n(t, [[2.78, 0], [3.48, 1, IO], [3.95, 1], [3.96, 0, LIN]]);
    redLine.l.geometry.instanceCount = Math.round(redLine.segs * sw);
    redLine.mat.opacity = n(t, [[3.55, 1], [3.9, 0, LIN], [3.95, 0], [3.96, 1, LIN]]); redLine.l.visible = sw > 0 && redLine.mat.opacity > 0;
    const th = n(t, [[2.4, 0], [2.95, 1, OUT], [3.86, 1], [3.87, 0, LIN]]);
    thin.l.geometry.instanceCount = Math.round(thin.segs * th);
    thin.mat.opacity = thin.base * n(t, [[3.5, 1], [3.85, 0, LIN], [3.86, 1, LIN]]); thin.l.visible = th > 0 && thin.mat.opacity > 0;
    let sp: number[];
    if (t > 1.35 && t < 2.15) { const q = trailCurve.getPoint(tr); sp = [q.x, q.y, q.z]; }
    else sp = v(t, [[0, HOME.toArray()], [1.35, HOME.toArray()], [2.15, trailPts[trailPts.length - 1].toArray(), LIN], [2.2, trailPts[trailPts.length - 1].toArray()],
      [2.7, L0.toArray(), IO], [2.78, L0.toArray()], [3.48, L1.toArray(), IO], [3.56, L1.toArray()], [4.05, MIDP, IO], [9.15, MIDP], [9.16, REC_EYE, LIN], [9.3, REC_EYE], [9.95, HOME.toArray(), IO]]);
    const r = 0.011 * n(t, [[3.95, 1], [4.3, 0, IN], [9.16, 0], [9.34, 1, OUT]]);
    signal.position.set(sp[0], sp[1], sp[2]); signal.scale.setScalar(Math.max(r, 1e-5)); signal.visible = r > 1e-4;
    halo.position.copy(signal.position); halo.scale.setScalar(r * 8); halo.visible = signal.visible;
  }

  const resize = () => {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w * PR, h * PR);
    finish.uniforms.uRes.value.set(w * PR, h * PR);
    fxaa.material.uniforms.resolution.value.set(1 / (w * PR), 1 / (h * PR));
    camera.aspect = w / h; camera.updateProjectionMatrix();
    [trail, redLine, thin].forEach(x => x.mat.resolution.set(w * PR, h * PR));
  };
  resize();

  // the state that must close the loop: every object's transform, visibility and opacity
  const snapshot = () => {
    const out: number[] = [];
    scene.traverse(o => {
      out.push(...o.matrixWorld.elements, o.visible ? 1 : 0);
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) out.push(m.opacity);
      if ((o as Line2).isLine2) out.push((o as Line2).geometry.instanceCount);
    });
    out.push(...camera.matrixWorld.elements);
    return out;
  };
  // quality: the render resolution, and a timing of one frame (CPU + GPU, waited for) to choose it by
  const quality = (pr?: number, samples?: number) => {
    if (samples !== undefined && samples !== composer.renderTarget1.samples) { [composer.renderTarget1, composer.renderTarget2].forEach(rt => { rt.samples = samples; rt.dispose(); }); fxaa.enabled = samples === 0; }
    if (pr) { PR = pr; renderer.setPixelRatio(PR); composer.setPixelRatio(PR); resize(); }
    return PR;
  };
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const frameMs = (t: number) => { const a = performance.now(); apply(t); composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - a; };
  return { apply, render: () => composer.render(), resize, snapshot, canvas, quality, frameMs, samples: () => composer.renderTarget1.samples };
}

// ------------------------------------------------------------------ the type over the scene (DOM), same clock
type Binding = { el: HTMLElement; k: string; f: (t: number) => string; last?: string };
const line = (a: number, b: number): K[] => [[a, 135], [a + 0.62, 0, OUT], [b, 0], [b + 0.42, -135, IN], [b + 0.43, 135, LIN]];
function typeBindings(root: HTMLElement) {
  const B: Binding[] = [];
  root.querySelectorAll<HTMLElement>('[data-ff="ln"]').forEach(el => {
    const a = +el.dataset.in!, b = +el.dataset.out!;
    B.push({ el, k: 'transform', f: t => `translateY(${n(t, line(a, b)).toFixed(2)}%)` });
  });
  const under = root.querySelector<HTMLElement>('[data-ff="under"]');
  if (under) B.push({ el: under, k: 'transform', f: t => `scaleX(${n(t, [[7.6, 0], [8.3, 1, OUT], [9.45, 1], [9.46, 0, LIN]]).toFixed(3)})` });
  return B;
}

// ------------------------------------------------------------------ the player
export interface Film { seek(t: number): void; play(): void; pause(): void; check(): Promise<string[]>; readonly t: number; readonly quality: string; ready: Promise<void>;
  hooks: { canvas: HTMLCanvasElement; stage: HTMLElement; root: HTMLElement; quality(pr: number, samples: number): number; samples(): number; resize(): void } }

export function mountFalconFilms() {
  document.querySelectorAll<HTMLElement>('[data-falcon-film]').forEach(root => {
    if ((root as any).__film) return;
    const stage = root.querySelector<HTMLElement>('[data-ff="stage"]')!;
    const canvas = root.querySelector<HTMLCanvasElement>('[data-ff="gl"]')!;
    const B = typeBindings(root);
    let scene: Built | null = null, now = 0;

    const draw = (t: number, wrap = true) => {
      now = wrap ? ((t % DURATION) + DURATION) % DURATION : t;
      for (const b of B) { const val = b.f(now); if (val !== b.last) { b.last = val; b.el.style.setProperty(b.k, val); } }
      if (scene) { scene.apply(now); scene.render(); }
    };

    let raf = 0, prev: number | null = null, clock = 0, wanted = true, inView = false;
    const tick = (ms: number) => {
      if (prev !== null) clock += Math.min(ms - prev, 100) / 1000;   // a dropped tab resumes where it was, not ahead
      prev = ms; draw(clock); raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf && wanted && inView && scene && !document.hidden) { prev = null; raf = requestAnimationFrame(tick); } };
    const halt = () => { cancelAnimationFrame(raf); raf = 0; };
    new ResizeObserver(() => { stage.style.setProperty('--ff-s', String(root.clientWidth / 1920)); if (scene) { scene.resize(); draw(now); } }).observe(root);

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ready = build(root, canvas).then(s => {
      // warm up: draw the film through once while it is still hidden, so every texture and shader is on the GPU
      // before the first frame anyone sees (otherwise the first pass stutters as each part first appears)
      for (let t = 0; t < DURATION; t += 0.5) { s.apply(t); s.render(); }
      // hold 60 fps: time the heaviest moment (the exploded view) and step the resolution down only as far as needed
      // (three frames first, unmeasured: a new render target or shader settles in, then the median of seven)
      const cost = () => { [5.0, 5.1, 5.2].forEach(t => s.frameMs(t)); const m = [5.3, 5.45, 5.6, 5.75, 5.9, 6.05, 6.2].map(t => s.frameMs(t)).sort((a, b) => a - b); return m[3]; };
      const top = s.quality();
      const tiers: [number, number][] = ([[2, 4], [1.75, 4], [1.5, 4], [1.25, 4], [1, 4], [1, 2], [1, 0]] as [number, number][]).filter(([pr]) => pr <= top);
      for (const [pr, samples] of tiers) { s.quality(pr, samples); if (cost() <= 15) break; }
      scene = s; root.classList.add('is-ready'); draw(still ? 8.2 : 0); run();
    });
    const film: Film = {
      seek(t) { clock = t; draw(t); },
      play() { wanted = true; run(); },
      pause() { wanted = false; halt(); },
      // the loop, proved: the scene's state and the rendered pixels at t = 0 and t = 10 (empty when they match)
      async check() {
        await ready;
        const bad: string[] = [];
        B.forEach(b => { if (b.f(0) !== b.f(DURATION)) bad.push(`type ${b.k}: ${b.f(0)} ≠ ${b.f(DURATION)}`); });
        draw(0, false); const s0 = scene!.snapshot(), p0 = scene!.canvas.toDataURL();
        draw(DURATION, false); const s1 = scene!.snapshot(), p1 = scene!.canvas.toDataURL();
        const diff = s0.findIndex((x, i) => Math.abs(x - s1[i]) > 1e-5);
        if (s0.length !== s1.length || diff >= 0) bad.push(`scene state differs at value ${diff}: ${s0[diff]} ≠ ${s1[diff]}`);
        if (p0 !== p1) bad.push('rendered pixels differ');
        draw(clock);
        return bad;
      },
      get t() { return now; },
      get quality() { return scene ? `${scene.quality()}× resolution, ${scene.samples()}× MSAA` : 'loading'; },
      // for the MP4 export (scripts/falcon-film-export.ts)
      hooks: { canvas, stage, root, quality: (pr: number, samples: number) => scene!.quality(pr || undefined, samples), samples: () => scene!.samples(), resize: () => scene!.resize() },
      ready,
    };
    (root as any).__film = film;
    if (still) wanted = false;
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView ? run() : halt(); }).observe(root);
    document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  });
}
