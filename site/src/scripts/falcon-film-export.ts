// Falcon, in motion → MP4. Renders the film (components/FalconFilm.astro) frame by frame, exactly: 300 frames at
// 30 fps, t = n / 30, so the file loops as seamlessly as the live film (frame 300 would be frame 0, and is left out).
//
// Each frame: the 3D scene at 1920 × 1080, supersampled (rendered at 2× and drawn down), with the type over it drawn
// in from the page's own markup and fonts (SVG foreignObject), then encoded as H.264 with WebCodecs and written into
// a fast-start MP4 (moov before mdat) by the small muxer below. Runs in a Chromium browser.
import type { Film } from './falcon-film';

export interface ExportOptions { width?: number; height?: number; fps?: number; seconds?: number; supersample?: number; samples?: number; bitrate?: number; onProgress?: (frame: number, total: number) => void }

// ------------------------------------------------------------------ the type over the scene, as an image
const toDataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(blob); });
};
async function overlayKit(root: HTMLElement) {
  const rules: string[] = [], faces: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRuleList;
    try { list = sheet.cssRules; } catch { continue; }
    for (const rule of [...list]) {
      if (rule instanceof CSSFontFaceRule) {
        const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        const range = rule.style.getPropertyValue('unicode-range');
        if (!/^(Fraunces Variable|DM Mono|DM Sans Variable)$/.test(fam) || (range && !/U\+0+-F\{?F/i.test(range) && !/U\+0000-00FF/i.test(range))) continue;
        const src = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (!src) continue;
        const abs = new URL(src, sheet.href ?? location.href).href;
        faces.push(rule.cssText.replace(/src:[^;]+;/, `src: url(${await toDataUrl(abs)}) format("woff2");`));
      } else if (rule instanceof CSSStyleRule && /\.(ff|ln)\b|\.ff[-_]|\.ln__/.test(rule.selectorText)) {
        rules.push(rule.cssText);
      }
    }
  }
  const cs = getComputedStyle(document.documentElement);
  const vars = ['--serif', '--mono', '--sans', '--accent', '--accent-deep', '--accent-on-dark', '--paper', '--muted', '--ink', '--white', '--hair']
    .map(v => `${v}: ${cs.getPropertyValue(v)};`).join(' ');
  const attrs = [...root.attributes].filter(a => a.name.startsWith('data-astro-cid')).map(a => `${a.name}=""`).join(' ');
  const css = `${faces.join('\n')}\n:root, .ffx { ${vars} }\n${rules.join('\n')}\n.ffx.ff { background: none !important; width: 1920px !important; height: 1080px; overflow: hidden; position: relative; }`;
  return { css, open: `<div class="${root.className} ffx" ${attrs}>`, close: '</div>' };
}
async function drawOverlay(kit: Awaited<ReturnType<typeof overlayKit>>, stage: HTMLElement, w: number, h: number) {
  const markup = new XMLSerializer().serializeToString(stage);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="1920" height="1080" transform="scale(${w / 1920})">`
    + `<div xmlns="http://www.w3.org/1999/xhtml"><style>${kit.css}</style>${kit.open}${markup}${kit.close}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  return { img, key: markup };
}

// ------------------------------------------------------------------ a minimal MP4 (ISO BMFF) writer for one H.264 track
const u8 = (...a: number[]) => new Uint8Array(a);
const u16 = (n: number) => u8((n >> 8) & 255, n & 255);
const u32 = (n: number) => u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const str = (s: string) => new TextEncoder().encode(s);
const cat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const box = (type: string, ...parts: Uint8Array[]) => { const body = cat(parts); return cat([u32(8 + body.length), str(type), body]); };
const full = (type: string, v: number, flags: number, ...parts: Uint8Array[]) => box(type, u8(v, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
const MATRIX = cat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

export function muxMp4(samples: { data: Uint8Array; key: boolean }[], avcC: Uint8Array, width: number, height: number, fps: number) {
  const N = samples.length, TS = fps * 1000, DELTA = 1000, mdur = Math.round((N / fps) * 1000);
  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const moov = (offset: number) => {
    const avc1 = box('avc1', new Uint8Array(6), u16(1), u16(0), u16(0), new Uint8Array(12), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0),
      u16(1), cat([u8(13), str('Falcon, H.264'), new Uint8Array(18)]), u16(0x0018), u16(0xffff), box('avcC', avcC), box('pasp', u32(1), u32(1)));
    const stbl = box('stbl',
      full('stsd', 0, 0, u32(1), avc1),
      full('stts', 0, 0, u32(1), u32(N), u32(DELTA)),
      full('stss', 0, 0, u32(samples.filter(s => s.key).length), ...samples.flatMap((s, i) => (s.key ? [u32(i + 1)] : []))),
      full('stsc', 0, 0, u32(1), u32(1), u32(N), u32(1)),
      full('stsz', 0, 0, u32(0), u32(N), ...samples.map(s => u32(s.data.length))),
      full('stco', 0, 0, u32(1), u32(offset)));
    const minf = box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(N * DELTA), u16(0x55c4), u16(0)),
      full('hdlr', 0, 0, u32(0), str('vide'), new Uint8Array(12), str('Falcon\0')), minf);
    const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(mdur), new Uint8Array(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16));
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(mdur), u32(0x00010000), u16(0x0100), new Uint8Array(10), MATRIX, new Uint8Array(24), u32(2));
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };
  // fast start: moov first, so the film can begin playing before it has all arrived
  const size = moov(0).length, offset = ftyp.length + size + 8;
  const data = cat(samples.map(s => s.data));
  return new Blob([ftyp, moov(offset), u32(8 + data.length), str('mdat'), data], { type: 'video/mp4' });
}

// ------------------------------------------------------------------ the export
type Hooks = { canvas: HTMLCanvasElement; stage: HTMLElement; root: HTMLElement; quality(pr: number, samples: number): number; samples(): number; resize(): void };

export async function exportFilm(film: Film & { hooks: Hooks }, o: ExportOptions = {}) {
  const W = o.width ?? 1920, H = o.height ?? 1080, FPS = o.fps ?? 30, N = Math.round((o.seconds ?? 10) * FPS);
  const SS = o.supersample ?? 2, MS = o.samples ?? 4, BITRATE = o.bitrate ?? 20e6;
  await film.ready;
  const { canvas, stage, root } = film.hooks;
  film.pause();
  // the film at its full frame size, rendered at SS× (restored afterwards)
  const before = { style: root.getAttribute('style'), pr: film.hooks.quality(0, film.hooks.samples()), samples: film.hooks.samples() };
  root.setAttribute('style', `${before.style ?? ''};width:${W}px;max-width:none;height:${H}px;aspect-ratio:auto`);
  stage.style.setProperty('--ff-s', String(W / 1920));
  film.hooks.quality(SS, MS);
  film.hooks.resize();

  const kit = await overlayKit(root);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d', { alpha: false })!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';

  const run = async (latencyMode: 'quality' | 'realtime') => {
    const chunks: { data: Uint8Array; key: boolean; ts: number }[] = [];
    let avcC: Uint8Array | null = null, failure: unknown = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        chunks.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
        if (meta?.decoderConfig?.description) avcC = new Uint8Array(meta.decoderConfig.description as ArrayBuffer);
      },
      error: e => { failure = e; },
    });
    enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: BITRATE, bitrateMode: 'variable', framerate: FPS, latencyMode, avc: { format: 'avc' } });
    let last: { img: HTMLImageElement; key: string } | null = null;
    for (let i = 0; i < N; i++) {
      film.seek(i / FPS);                                           // draws the scene and sets the type for frame i
      g.drawImage(canvas, 0, 0, W, H);                              // (same task as the render: the buffer is still there)
      const key = new XMLSerializer().serializeToString(stage);
      if (!last || last.key !== key) last = await drawOverlay(kit, stage, W, H);
      film.seek(i / FPS); g.drawImage(canvas, 0, 0, W, H);          // draw again: the await above may have let the buffer go
      g.drawImage(last.img, 0, 0, W, H);
      const frame = new VideoFrame(out, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(frame, { keyFrame: i % FPS === 0 });
      frame.close();
      while (enc.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 1));
      if (failure) throw failure;
      o.onProgress?.(i + 1, N);
    }
    await enc.flush(); enc.close();
    if (failure) throw failure;
    return { chunks, avcC: avcC as Uint8Array | null };
  };
  try {
    let r = await run('quality');
    // the muxer writes decode order = presentation order; if the encoder reordered frames, encode again without
    if (r.chunks.some((c, i) => i > 0 && c.ts <= r.chunks[i - 1].ts)) r = await run('realtime');
    if (!r.avcC) throw new Error('the encoder gave no avcC');
    return muxMp4(r.chunks, r.avcC, W, H, FPS);
  } finally {
    if (before.style === null) root.removeAttribute('style'); else root.setAttribute('style', before.style);
    film.hooks.quality(before.pr, before.samples);
    film.hooks.resize();
    stage.style.setProperty('--ff-s', String(root.clientWidth / 1920));
  }
}
