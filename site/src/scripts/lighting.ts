// The living light. A soft warm-white light drifts in on load and settles at the top-right, then keeps breathing and
// leans a little towards the cursor. Everything reads from that one light:
//  - a WebGL layer behind the page lights the paper: whiter near the light, deeper towards the bottom-left, with grain
//  - every lit element gets its own shadow direction (away from the light) and a proximity value (--p)
//  - ink near the light warms towards dark red; white and dark surfaces get a soft local glow where the light falls
// Reduced motion: the page is simply lit, with no drift.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- the light ----------------
// Where the light settles (a fraction of the viewport) follows the real sun over Delhi: it rises on the left, stands
// high at noon and sets on the right, and a low sun throws longer shadows (LEN). After dark it is the desk lamp, at the
// design's top-right. ?sun=17.5 previews an hour of the day (Delhi time).
function delhiSun() {
  const rad = Math.PI / 180, LAT = 28.61 * rad, LON = 77.21;
  const preview = parseFloat(new URLSearchParams(location.search).get('sun') ?? '');
  const now = new Date();
  if (!isNaN(preview)) {                       // that hour today in Delhi (UTC+5:30)
    const ist = new Date(now.getTime() + 5.5 * 3600e3);
    now.setTime(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) + (preview - 5.5) * 3600e3);
  }
  const d = now.getTime() / 86400e3 - 10957.5;                          // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;                           // mean anomaly
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;   // ecliptic longitude
  const e = 23.439 * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const H = (280.46061837 + 360.98564736629 * d + LON) * rad - ra;      // hour angle
  const alt = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H));   // from north, clockwise
  return { alt: alt / rad, east: Math.sin(az) };                        // east: 1 in the east, -1 in the west
}
const sun = delhiSun();
const day = sun.alt > 0;
const high = Math.min(Math.max(sun.alt, 0) / 50, 1);                    // 0 on the horizon, 1 from 50° up
const REST = day ? { x: 0.5 - sun.east * 0.4, y: 0.3 - high * 0.22 } : { x: 0.86, y: 0.08 };
const LEN = day ? 1.7 - high * 0.7 : 1;                                 // shadow length: long at dawn and dusk
// phones: tilting the handset moves the light, like turning a sheet of paper under a lamp
const tilt = { x: 0, y: 0, on: false };
const light = { x: reduce ? REST.x : 0.55, y: reduce ? REST.y : 0.45, power: reduce ? 1 : 0 };
const pointer = { x: REST.x, y: REST.y, seen: false };
addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth; pointer.y = e.clientY / innerHeight; pointer.seen = true; }, { passive: true });

// ---------------- WebGL paper layer ----------------
const canvas = document.createElement('canvas');
canvas.className = 'light-layer';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false });

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function paperColour(): [number, number, number] {
  // the page's own fill, so case studies (#fcfbf8) and the home page (#f8f7f0) each keep their paper
  const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || ['248', '247', '240'];
  return [toLinear(+m[0] / 255), toLinear(+m[1] / 255), toLinear(+m[2] / 255)];
}

let draw: ((t: number) => void) | null = null;
if (gl) {
  const vs = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const fs = `
    precision mediump float;
    uniform vec2 res, lightPos;          // pixels, origin top-left
    uniform vec3 paper;                  // linear rgb
    uniform float power, time, scroll, newsprint, dpr;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
      float diag = length(res);
      float d = length(px - lightPos) / diag;                     // 0 at the light, ~1 across the screen
      // the paper: white around the light, a clearly deeper, warmer beige towards the far corner
      vec3 white = vec3(1.0, 0.995, 0.985);
      vec3 shade = paper * vec3(0.80, 0.765, 0.70);
      float near = exp(-d * 2.4) * power;
      float far = smoothstep(0.2, 1.1, d) * power;
      vec3 c = mix(paper, white, near);
      c = mix(c, shade, far);
      // a faint bloom right at the source
      c += vec3(1.0, 0.97, 0.92) * exp(-d * 9.0) * 0.18 * power;
      // paper tooth: fine, still grain, plus a slow cloudiness so the surface feels like paper, not a gradient
      float g = (hash(floor(px)) - 0.5) * 0.0126 + (noise(px * 0.004 + time * 0.01) - 0.5) * 0.0126;
      c += g;

      // newsprint (home page only): a fine 45° halftone screen whose dots grow where the paper is darker, short paper
      // fibres and the odd ink speck. It is printed on the page, so it scrolls with the content.
      if (newsprint > 0.5) {
        vec2 q = (px / dpr) + vec2(0.0, scroll);                   // css pixels, page space
        vec2 h = mat2(0.7071, -0.7071, 0.7071, 0.7071) * q / 3.6;  // a 3.6px screen at 45 degrees
        vec2 cell = fract(h) - 0.5;
        float tone = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));      // darker paper, bigger dots
        float r = 0.16 + tone * 0.9;
        float dotInk = smoothstep(r + 0.12, r - 0.12, length(cell));
        c *= 1.0 - dotInk * 0.0525;          // grain strengths: +5% (dots, fibres, specks, tooth)
        // fibres: thin, mostly horizontal strands
        vec2 fq = mat2(0.985, -0.17, 0.17, 0.985) * q;
        float fib = 1.0 - smoothstep(0.0, 0.035, abs(noise(vec2(fq.x * 0.035, fq.y * 0.9)) - 0.5));
        c *= 1.0 - fib * 0.042 * noise(fq * 0.01);
        // specks of ink
        float speck = step(0.999, hash(floor(q / 1.6)));
        c *= 1.0 - speck * 0.231;
      }
      // back to sRGB
      c = pow(max(c, 0.0), vec3(1.0 / 2.2));
      gl_FragColor = vec4(c, 1.0);
    }`;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('res'), uLight = u('lightPos'), uPaper = u('paper'), uPower = u('power'), uTime = u('time');
    const uScroll = u('scroll'), uNews = u('newsprint'), uDpr = u('dpr');
    const newsprint = document.querySelector('.page') ? 1 : 0;     // the home page's canvas
    const paper = paperColour();
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    addEventListener('resize', resize);
    draw = t => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uLight, light.x * canvas.width, light.y * canvas.height);
      gl.uniform3f(uPaper, paper[0], paper[1], paper[2]);
      gl.uniform1f(uPower, light.power);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uScroll, scrollY);
      gl.uniform1f(uNews, newsprint);
      gl.uniform1f(uDpr, canvas.width / innerWidth);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    document.documentElement.classList.add('has-light');
  }
}

// ---------------- the elements that react ----------------
// surfaces get a local glow; containers carry the proximity that warms the ink inside them
const SURFACES = '.swad__body, .letter, .footer__panel, .c-why, .hero__card, .note, .tabs';
const DARK = '.nav__resume, .hero__resume, .swad-resume, .swad__visual, .about__media, .l-send, .footer__band, .red-block, .hero-band';
const CONTAINERS = 'header, section, article, aside, footer, figure, .at, .swad-canvas > *, .hero > *, .work > *, .about > *, .contact > *';
type Lit = { el: HTMLElement; x: number; y: number; w: number; h: number };
let lit: Lit[] = [];
function collect() {
  const els = new Set<HTMLElement>([
    ...document.querySelectorAll<HTMLElement>(SURFACES),
    ...document.querySelectorAll<HTMLElement>(DARK),
    ...document.querySelectorAll<HTMLElement>(CONTAINERS),
  ]);
  document.querySelectorAll<HTMLElement>(SURFACES).forEach(e => e.classList.add('lit-surface'));
  document.querySelectorAll<HTMLElement>(DARK).forEach(e => e.classList.add('lit-dark'));
  lit = [...els].map(el => { el.classList.add('lit'); return { el, x: 0, y: 0, w: 0, h: 0 }; });
  measure();
}
function measure() {
  // positions in page coordinates, so scrolling only needs the scroll offset
  for (const l of lit) {
    const r = l.el.getBoundingClientRect();
    l.x = r.left + scrollX; l.y = r.top + scrollY; l.w = r.width; l.h = r.height;
  }
}

function applyToElements() {
  const lx = light.x * innerWidth, ly = light.y * innerHeight;
  const diag = Math.hypot(innerWidth, innerHeight);
  const top = scrollY, bottom = scrollY + innerHeight;
  for (const l of lit) {
    if (l.y > bottom + 200 || l.y + l.h < top - 200) continue;          // off screen: leave it
    const cx = l.x - scrollX + l.w / 2, cy = l.y - top + l.h / 2;
    const dx = cx - lx, dy = cy - ly, dist = Math.hypot(dx, dy) || 1;
    // shadow: away from the light, scaled so a block exactly down-left of it casts the design's (-20, 20)
    const sx = (dx / dist) * Math.SQRT2 * LEN, sy = (dy / dist) * Math.SQRT2 * LEN;
    const p = Math.exp(-dist / (diag * 0.7)) * light.power;            // 1 at the light, fading across the page
    const s = l.el.style;
    s.setProperty('--sx', sx.toFixed(3));
    s.setProperty('--sy', sy.toFixed(3));
    s.setProperty('--p', p.toFixed(3));
    s.setProperty('--llx', `${(lx - (l.x - scrollX)).toFixed(0)}px`);   // the light, in this element's coordinates
    s.setProperty('--lly', `${(ly - (l.y - top)).toFixed(0)}px`);
  }
}

// ---------------- the loop ----------------
let start = performance.now(), lastMeasure = 0, running = true;
function frame(now: number) {
  if (!running) return;
  const t = (now - start) / 1000;
  if (!reduce) {
    // entrance: drift up to the corner and brighten over ~2s
    const e = Math.min(t / 2.2, 1), ease = 1 - Math.pow(1 - e, 3);
    const breathe = { x: Math.sin(t * 0.21) * 0.012, y: Math.cos(t * 0.17) * 0.01 };
    const lean = pointer.seen ? { x: (pointer.x - REST.x) * 0.06, y: (pointer.y - REST.y) * 0.06 } : { x: 0, y: 0 };
    const tx = REST.x + breathe.x + lean.x + tilt.x, ty = REST.y + breathe.y + lean.y + tilt.y;
    const k = e < 1 ? ease : tilt.on ? 0.12 : 0.04;                                      // after the entrance, follow gently
    light.x += (tx - light.x) * (e < 1 ? 0.06 : k);
    light.y += (ty - light.y) * (e < 1 ? 0.06 : k);
    light.power = ease * (0.97 + 0.03 * Math.sin(t * 0.5))               // a very slow breath in the brightness
      + ((window as any).__beat || 0) * 0.1;                             // and, with the record on, a pulse on the beat
  }
  if (now - lastMeasure > 1000) { measure(); lastMeasure = now; }     // catch layout shifts (fonts, images)
  draw?.(t);
  applyToElements();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) requestAnimationFrame(frame);
});
addEventListener('resize', measure);

// ---------------- tilt (phones and tablets) ----------------
// gamma: left / right roll; beta: front / back pitch, about 45° when a phone is held to read
if (!reduce && matchMedia('(pointer: coarse)').matches && 'DeviceOrientationEvent' in window) {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const listen = () => addEventListener('deviceorientation', e => {
    if (e.gamma == null || e.beta == null) return;
    tilt.on = true;
    tilt.x = clamp(e.gamma / 35) * 0.45;
    tilt.y = clamp((e.beta - 45) / 35) * 0.3;
  });
  const ask = (DeviceOrientationEvent as any).requestPermission as (() => Promise<string>) | undefined;
  if (!ask) listen();                                                    // Android: no permission needed
  else {
    // iOS only gives motion after a tap, so a small chip offers it once
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tilt-chip';
    chip.textContent = 'Tilt to move the light';
    chip.addEventListener('click', () => { ask().then(r => { if (r === 'granted') listen(); }).catch(() => {}); chip.remove(); });
    document.body.append(chip);
    setTimeout(() => chip.remove(), 12000);
  }
}

collect();
document.fonts?.ready.then(measure);
requestAnimationFrame(frame);
