// The cursor: a printer's registration mark (the hairline circle and cross that line up a print's plates) with the
// site's red at its centre, and a floating label: a small ink pill that trails the pointer and says what a click does
// (OPEN PROJECT, READ STORY, PLAY…).
//  - the dot is the pointer, exactly; the mark and the label follow with a little delay (eased, frame by frame)
//  - over links and buttons the mark opens and turns 45°; text fields keep the system's text cursor
//  - a label comes from the nearest [data-cursor="…"], or from the rules below for the site's own elements
// Mice and trackpads only (touch screens keep nothing extra), and it only animates while something is still moving.
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the site's own elements and what a click on them does
const RULES: [string, string | ((el: Element) => string)][] = [
  ['.story', 'Read story'],
  ['.falcon, .swad, .next', 'Open project'],
  ['.player', el => (el.getAttribute('aria-pressed') === 'true' ? 'Pause' : 'Play')],
  ['[data-falcon-play], [data-falcon-open]', 'Play'],
  ['.hero__portrait, .about__media', 'Discover'],
  ['a[href$=".pdf"], a[download]', 'Download'],
  ['a[target="_blank"]', 'Open ↗'],
];
const INTERACTIVE = 'a, button, [role="button"], label, summary, select, .falcon, .swad, .story, [data-cursor]';
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';

if (fine) {
  const root = document.createElement('div');
  root.className = 'cursor';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<span class="cursor__mark"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="11" /><path d="M20 2v12M20 26v12M2 20h12M26 20h12" /></svg></span>'
    + '<span class="cursor__dot"></span><span class="cursor__label"><i></i><b></b></span>';
  document.body.append(root);
  document.documentElement.classList.add('has-cursor');
  const mark = root.querySelector<HTMLElement>('.cursor__mark')!, dot = root.querySelector<HTMLElement>('.cursor__dot')!;
  const label = root.querySelector<HTMLElement>('.cursor__label')!, text = label.querySelector('b')!;

  const p = { x: -100, y: -100 }, m = { x: -100, y: -100 }, l = { x: -100, y: -100 };
  let raf = 0, last = '', target: Element | null = null;

  const labelFor = (el: Element | null) => {
    if (!el) return '';
    const own = el.closest('[data-cursor]');
    if (own) return own.getAttribute('data-cursor') || '';
    for (const [sel, word] of RULES) { const hit = el.closest(sel); if (hit) return typeof word === 'string' ? word : word(hit); }
    return '';
  };
  // what the pointer is over: the mark's state and the label's word
  const read = () => {
    const el = document.elementFromPoint(p.x, p.y);
    target = el;
    const typing = !!el?.closest(TEXT);
    root.classList.toggle('is-text', typing);
    root.classList.toggle('is-link', !typing && !!el?.closest(INTERACTIVE));
    const word = typing ? '' : labelFor(el);
    if (word !== last) {
      last = word;
      if (word) text.textContent = word;
      root.classList.toggle('has-label', !!word);
    }
  };
  const tick = () => {
    const k = reduce ? 1 : 0.22, kl = reduce ? 1 : 0.12;   // the mark follows a little behind; the label a little more
    m.x += (p.x - m.x) * k; m.y += (p.y - m.y) * k;
    l.x += (p.x - l.x) * kl; l.y += (p.y - l.y) * kl;
    dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    mark.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)`;
    label.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
    // keep going only while the mark or the label is still catching up
    raf = Math.abs(p.x - l.x) + Math.abs(p.y - l.y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    p.x = e.clientX; p.y = e.clientY;
    if (!root.classList.contains('is-on')) { m.x = l.x = p.x; m.y = l.y = p.y; root.classList.add('is-on'); }
    read(); wake();
  }, { passive: true });
  // the page moves under a still pointer (smooth scroll, reveals): look again at what is under it
  addEventListener('scroll', () => { if (root.classList.contains('is-on')) requestAnimationFrame(read); }, { passive: true });
  document.addEventListener('pointerdown', () => root.classList.add('is-down'));
  document.addEventListener('pointerup', () => { root.classList.remove('is-down'); requestAnimationFrame(read); });   // a click may change the label (Play ↔ Pause)
  document.documentElement.addEventListener('pointerleave', () => root.classList.remove('is-on'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) root.classList.remove('is-on'); });
  void target;
}
export {};   // a module: its names stay its own
