// The hero greeting cycles Namaste! → Hello! → Bonjour! every 5 seconds, as ink on newsprint.
// Fraunces is a variable face, so the motion is drawn with its axes rather than by moving letters:
//  - a new word arrives letter by letter as a soft, blurred hairline; ink then floods each letter (weight swells
//    past the final cut, the soft blot sharpens) and settles into the crisp light display weight
//  - the old word dries out: it thins back to a hairline, softens and fades
// Letters never move, so nothing travels over the nav or the subtitle; each letter keeps the width it has at its final
// weight, so the swell never nudges its neighbours. With reduced motion the words simply crossfade.
import { gsap } from 'gsap';

const HOLD = 5;                                  // seconds each word stays
const REST = { w: 300, s: 0 };                   // the display weight and softness (as .t-display)
const title = document.querySelector<HTMLElement>('[data-greet]');

if (title) {
  const words = (title.dataset.greet || title.textContent || '').split('|').map(w => w.trim()).filter(Boolean);
  // the visitor's own hello joins the cycle, right after Namaste: taken from their browser's language (nothing is
  // sent anywhere). Only greetings short enough for the line, in letters the display face has. ?hello=es previews one.
  const HELLO: Record<string, string> = {
    es: 'Hola!', de: 'Hallo!', it: 'Ciao!', pt: 'Olá!', nl: 'Hallo!', sv: 'Hej!', da: 'Hej!', nb: 'Hei!', no: 'Hei!', fi: 'Hei!',
    pl: 'Cześć!', tr: 'Merhaba!', id: 'Halo!', vi: 'Xin chào!', sw: 'Jambo!', tl: 'Kumusta!', ko: 'Annyeong!',
    zh: 'Ni hao!', ru: 'Privet!', ar: 'Salaam!', ur: 'Salaam!', ta: 'Vanakkam!', mr: 'Namaskar!', gu: 'Kem cho!', bn: 'Nomoskar!',
  };
  const tongue = (new URLSearchParams(location.search).get('hello') || navigator.language || '').toLowerCase().split('-')[0];
  const mine = HELLO[tongue];
  if (mine && !words.includes(mine)) words.splice(1, 0, mine);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  title.setAttribute('aria-label', words.join(' '));

  // every word gets its own layer in the same grid cell, so the line never jumps in height or position
  title.innerHTML = '';
  const layers = words.map(word => {
    const layer = document.createElement('span');
    layer.className = 'greet';
    layer.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const cell = document.createElement('span');
      cell.className = 'greet__cell';
      const c = document.createElement('span');
      c.className = 'greet__ch';
      c.textContent = ch === ' ' ? '\u00a0' : ch;      // a plain space would collapse inside its cell
      cell.appendChild(c);
      layer.appendChild(cell);
    }
    title.appendChild(layer);
    return { layer, cells: [...layer.querySelectorAll<HTMLElement>('.greet__cell')], chars: [...layer.querySelectorAll<HTMLElement>('.greet__ch')] };
  });
  type Layer = (typeof layers)[number];

  // pin each letter's cell to its width at rest (in em, so it holds as the title scales with the window)
  const pin = () => layers.forEach(l => {
    const size = parseFloat(getComputedStyle(l.layer).fontSize);
    l.cells.forEach(c => { c.style.width = ''; });
    gsap.set(l.chars, { '--w': REST.w, '--s': REST.s });
    l.cells.forEach(c => { c.style.width = `${c.getBoundingClientRect().width / size}em`; });
  });

  const hideAll = () => layers.forEach(l => gsap.set(l.layer, { autoAlpha: 0 }));
  let i = 0;

  const show = (l: Layer, delay = 0) => {
    gsap.set(l.layer, { autoAlpha: 1 });
    if (reduce) return gsap.fromTo(l.layer, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'power1.inOut', delay });
    const tl = gsap.timeline({ delay });
    // a hairline blot appears…
    tl.fromTo(l.chars, { '--w': 200, '--s': 60, opacity: 0 },
      { '--w': 360, '--s': 20, opacity: 1, duration: 0.55, ease: 'power2.out', stagger: 0.075 });
    // …and the ink settles into the crisp cut
    tl.to(l.chars, { '--w': REST.w, '--s': REST.s, duration: 1.1, ease: 'expo.out', stagger: 0.075 }, 0.45);
    return tl;
  };
  const hide = (l: Layer) => {
    if (reduce) return gsap.to(l.layer, { autoAlpha: 0, duration: 1.2, ease: 'power1.inOut' });
    return gsap.to(l.chars, {
      '--w': 200, '--s': 60, opacity: 0, duration: 0.7, ease: 'power2.in', stagger: 0.04,
      onComplete: () => { gsap.set(l.layer, { autoAlpha: 0 }); },
    });
  };

  const next = () => {
    const out = layers[i];
    i = (i + 1) % layers.length;
    hide(out);
    show(layers[i], reduce ? 0 : 0.55);          // the new word starts inking as the old one finishes drying
  };

  document.fonts.ready.then(() => {
    pin();
    hideAll();
    show(layers[0], 0.15);
    // pause the cycle while the hero is off screen or the tab is hidden
    let timer = 0;
    const start = () => { stop(); timer = window.setInterval(next, HOLD * 1000); };
    const stop = () => { if (timer) window.clearInterval(timer); timer = 0; };
    start();
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(title);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  });
}
