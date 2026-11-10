// Converts the absolute-layout JSX that Figma's design context returns into static HTML for an Astro page, with every
// design pixel expressed as `calc(N * var(--u))` so the page scales with the window exactly like the rest of the site.
// Only the small Tailwind vocabulary Figma emits for absolute layouts is supported; anything else is reported.
//
// Usage: node tools/figma-jsx-to-astro.mjs <design.jsx> <out.html> [--cut-from <designY>] [--assets <dir> --asset-url <prefix>]
//   --cut-from  drop top-level layers at or below this y (e.g. the footer, which the site renders as a component)
import fs from 'node:fs';

const [, , src, dst, ...rest] = process.argv;
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const code = fs.readFileSync(src, 'utf8');

// ---------- asset constants: imgFoo -> local URL ----------
const assets = {};
for (const m of code.matchAll(/const (img\w+) = `\$\{assetPathPrefix\}\/([\w.]+)`/g)) {
  assets[m[1]] = `${opt['asset-url'] || ''}${m[1]}.${m[2].split('.').pop()}`;
}

// ---------- a tiny JSX parser for Figma's output ----------
const body = code.slice(code.indexOf('return (') + 8, code.lastIndexOf(');'));
let i = 0;
const ws = () => { while (/\s/.test(body[i])) i++; };
function parseAttrs() {
  const attrs = {};
  for (;;) {
    ws();
    if (body[i] === '/' || body[i] === '>') return attrs;
    const name = body.slice(i).match(/^[\w-]+/)[0];
    i += name.length;
    if (body[i] !== '=') { attrs[name] = true; continue; }
    i++;
    if (body[i] === '"') { const end = body.indexOf('"', i + 1); attrs[name] = body.slice(i + 1, end); i = end + 1; }
    else if (body[i] === '{') {           // {expr} with balanced braces
      let depth = 0, j = i;
      do { if (body[j] === '{') depth++; else if (body[j] === '}') depth--; j++; } while (depth);
      attrs[name] = { expr: body.slice(i + 1, j - 1) };
      i = j;
    }
  }
}
function parseNode() {
  ws();
  if (body.startsWith('</', i)) return null;                                              // the parent closes here
  if (body[i] === '<' && !/[A-Za-z]/.test(body[i + 1])) { i++; return { text: '<' }; }   // a literal '<' in the copy
  if (body.startsWith('<', i)) {
    i++;
    const tag = body.slice(i).match(/^[\w.]+/)[0];
    i += tag.length;
    const attrs = parseAttrs();
    if (body[i] === '/') { i += 2; return { tag, attrs, children: [] }; }
    i++;
    const children = [];
    for (;;) {
      ws();
      if (body.startsWith('</', i)) { i = body.indexOf('>', i) + 1; break; }
      const before = i;
      const n = parseNode();
      if (n) children.push(n);
      if (i === before) i++;
    }
    return { tag, attrs, children };
  }
  if (body[i] === '{') {                    // {`text`} or {"text"}
    let depth = 0, j = i;
    do { if (body[j] === '{') depth++; else if (body[j] === '}') depth--; j++; } while (depth);
    const expr = body.slice(i + 1, j - 1).trim();
    i = j;
    const m = expr.match(/^`([\s\S]*)`$/) || expr.match(/^"([\s\S]*)"$/);
    return m ? { text: m[1] } : null;
  }
  let end = body.indexOf('<', i);
  while (end >= 0 && !/[A-Za-z/]/.test(body[end + 1])) end = body.indexOf('<', end + 1);
  const brace = body.indexOf('{', i);
  const stop = Math.min(end < 0 ? body.length : end, brace < 0 ? body.length : brace);
  const text = body.slice(i, stop);
  i = stop;
  return text.trim() ? { text: text.replace(/\s+/g, ' ').trim() } : null;
}
const root = parseNode();

// ---------- Tailwind -> CSS ----------
const unknown = new Set();
const px = v => `calc(${v} * var(--u))`;
const len = v => {                          // 104px | calc(50%+12px) | 1/2 | 0 | 50%
  if (/^-?[\d.]+px$/.test(v)) return px(parseFloat(v));
  // space the operators first, then scale the pixel values (so the hyphens in var(--u) are left alone)
  if (/^calc\(/.test(v)) return v.replace(/([+-])/g, ' $1 ').replace(/\(\s+-\s+/g, '(-').replace(/([\d.]+)px/g, (_, n) => `${n} * var(--u)`);
  if (v === '0') return '0';
  if (v === 'full') return '100%';
  if (/^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/'); return `${(a / b) * 100}%`; }
  if (/%$/.test(v)) return v;
  return null;
};
const colour = v => { const m = v.match(/#[0-9a-fA-F]{3,8}/); return m ? m[0] : v.replace(/^color:/, ''); };
const FONTS = {
  'DM_Sans:Light': ['var(--sans)', 300, 'normal'], 'DM_Sans:Light_Italic': ['var(--sans)', 300, 'italic'],
  'DM_Sans:Regular': ['var(--sans)', 400, 'normal'], 'DM_Sans:Medium': ['var(--sans)', 500, 'normal'],
  'Fraunces:Light': ['var(--serif)', 300, 'normal'], 'Fraunces:Light_Italic': ['var(--serif)', 300, 'italic'],
  'Fraunces:Italic': ['var(--serif)', 400, 'italic'], 'DM_Mono:Regular': ['var(--mono)', 400, 'normal'],
};
function css(cls = '') {
  const s = {};
  let gradFrom, gradTo, borderSides = null, borderColour;
  for (const c of cls.split(/\s+/).filter(Boolean)) {
    let m;
    if (c === 'absolute' || c === 'relative') s.position = c;
    else if (c === 'contents') s.display = 'contents';
    else if (c === 'block') s.display = 'block';
    else if (c === 'overflow-clip') s.overflow = 'clip';
    else if (c === 'max-w-none') s['max-width'] = 'none';
    else if (c === 'size-full') { s.width = '100%'; s.height = '100%'; }
    else if (c === 'inset-0') s.inset = '0';
    else if ((m = c.match(/^inset-\[(.+)\]$/))) s.inset = m[1].split('_').join(' ');
    else if ((m = c.match(/^(left|top|right|bottom)-(\[.+\]|0|1\/2|full)$/))) s[m[1]] = len(m[2].replace(/^\[|\]$/g, ''));
    else if ((m = c.match(/^(w|h|size)-(\[.+\]|0|full)$/))) {
      const v = len(m[2].replace(/^\[|\]$/g, ''));
      if (m[1] !== 'h') s.width = v;
      if (m[1] !== 'w') s.height = v;
    }
    else if ((m = c.match(/^text-\[([\d.]+)px\]$/))) {
      const n = parseFloat(m[1]);
      s['font-size'] = n <= 20 ? `max(${Math.round(n * 0.75)}px, ${px(n)})` : px(n);
    }
    else if ((m = c.match(/^text-\[(.+)\]$/))) s.color = colour(m[1]);
    else if (c === 'text-center' || c === 'text-right') s['text-align'] = c.slice(5);
    else if (c === 'uppercase') s['text-transform'] = 'uppercase';
    else if ((m = c.match(/^font-\['(.+)'\]$/))) {
      const f = FONTS[m[1]];
      if (f) { s['font-family'] = f[0]; s['font-weight'] = f[1]; s['font-style'] = f[2]; } else unknown.add(c);
    }
    else if (c === 'font-light') s['font-weight'] ??= 300;
    else if (c === 'font-medium') s['font-weight'] = 500;
    else if (c === 'font-normal') s['font-weight'] = 400;
    else if (c === 'italic') s['font-style'] = 'italic';
    else if ((m = c.match(/^leading-\[(.+)\]$/))) s['line-height'] = /px$/.test(m[1]) ? px(parseFloat(m[1])) : m[1];
    else if (c === 'whitespace-nowrap' || c === 'whitespace-pre-wrap' || c === 'whitespace-pre') s['white-space'] = c.slice(11);
    else if ((m = c.match(/^bg-\[(.+)\]$/))) s.background = colour(m[1]);
    else if (c === 'bg-gradient-to-b') s._grad = 'to bottom';
    else if ((m = c.match(/^from-\[(.+)\]$/))) gradFrom = m[1];
    else if ((m = c.match(/^to-\[(.+)\]$/))) gradTo = m[1];
    else if ((m = c.match(/^rounded-\[(.+)\]$/))) s['border-radius'] = len(m[1]);
    else if (c === 'border') borderSides = 'all';
    else if (c === 'border-t') borderSides = 'top';
    else if (c === 'border-solid' || c === 'border-dashed') s._bstyle = c.slice(7);
    else if ((m = c.match(/^border-\[(.+)\]$/))) borderColour = colour(m[1]);
    else if (c === '-translate-x-1/2') s.transform = 'translateX(-50%)';
    else if (c === '-translate-x-full') s.transform = 'translateX(-100%)';
    else if (c === '-translate-y-1/2') s.transform = (s.transform ? s.transform + ' ' : '') + 'translateY(-50%)';
    else if (/^\[word-break|^\[text-underline|^decoration-|^pointer-events|^object-|^not-italic|^shrink-0|^content-stretch|^relative$/.test(c)) {}
    else unknown.add(c);
  }
  if (s._grad) { s.background = `linear-gradient(${s._grad}, ${gradFrom}, ${gradTo})`; delete s._grad; }
  if (borderSides) {
    const b = `1px ${s._bstyle || 'solid'} ${borderColour || 'currentColor'}`;
    if (borderSides === 'all') s.border = b; else s['border-top'] = b;
  }
  delete s._bstyle;
  return s;
}

// ---------- emit HTML ----------
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const topOf = n => {
  const m = (n.attrs?.className || '').match(/(?:^|\s)top-\[(-?[\d.]+)px\]/);
  return m ? parseFloat(m[1]) : (/(?:^|\s)top-0(\s|$)/.test(n.attrs?.className || '') ? 0 : null);
};
function emit(n, depth = 0) {
  if (n.text !== undefined) return esc(n.text);
  const a = n.attrs;
  const style = css(a.className);
  if (a.style && a.style.expr) {
    const bg = a.style.expr.match(/backgroundImage:\s*"([^"]+)"/);
    if (bg) style['background-image'] = bg[1];
  }
  const styleStr = Object.entries(style).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join('; ');
  const name = a['data-name'] ? ` data-name="${esc(a['data-name'])}"` : '';
  if (n.tag === 'img') {
    const srcExpr = a.src && a.src.expr;
    const url = assets[srcExpr] || '';
    return `<img src="${url}" alt="" style="${styleStr}"${name} />`;
  }
  const tag = { div: 'div', p: 'p', span: 'span', ol: 'ol', ul: 'ul', li: 'li' }[n.tag] || 'div';
  // children in reading order: sort absolutely-positioned siblings by their top
  const kids = [...n.children];
  if (kids.every(k => k.text === undefined && topOf(k) !== null)) kids.sort((x, y) => topOf(x) - topOf(y));
  const inner = kids.map(k => emit(k, depth + 1)).join('');
  return `<${tag} style="${styleStr}"${name}>${inner}</${tag}>`;
}

// top level: drop layers from --cut-from down (the footer), keep the rest in reading order
let top = root.children;
if (opt['cut-from']) top = top.filter(k => (topOf(k) ?? 0) < parseFloat(opt['cut-from']));
top.sort((x, y) => (topOf(x) ?? 0) - (topOf(y) ?? 0));
const html = top.map(k => emit(k)).join('\n');
fs.writeFileSync(dst, html);
console.log(`wrote ${dst}: ${top.length} top-level layers, ${html.length} chars`);
if (unknown.size) console.log('unsupported classes:', [...unknown].join(' '));
