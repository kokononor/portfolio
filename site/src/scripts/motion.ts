// Motion for the whole site: one scroll engine (Lenis) driven by GSAP's ticker, so smooth scroll, scroll-triggered
// reveals and parallax all run on the same clock. Nothing moves when the visitor prefers reduced motion.
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';


gsap.registerPlugin(ScrollTrigger);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduce) {
  // ---- smooth scroll ----
  const lenis = new Lenis({ lerp: 0.1 });            // #links are handled by scripts/nav.ts, which stops below the sticky nav
  (window as any).__lenis = lenis;                 // shared with the back-to-top button
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // in-page links glide to their section; Lenis honours the page's scroll-padding-top (--nav-h, global.css), so each
  // stops just below the sticky nav. #top goes to the very top.
  document.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const target = a.hash === '#top' ? 0 : document.querySelector<HTMLElement>(a.hash);
    if (target === null) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: 1.4 });
    history.replaceState(null, '', a.hash);
  });

  const ease = 'expo.out';

  // ---- hero entrance: the rest of the hero settles in (the greeting animates itself, see greeting.ts) ----
  document.fonts.ready.then(() => {
    gsap.from('[data-hero-in]', { opacity: 0, y: 24, duration: 1.2, stagger: 0.08, ease, delay: 0.6 });
  });

  // ---- reveals: blocks fade up as they enter the viewport ----
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(el => {
    gsap.fromTo(el, { opacity: 0, y: 40 }, {
      opacity: 1, y: 0, duration: 1.2, ease,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // ---- parallax: images drift inside their frames; the big words slide against the scroll ----
  gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach(el => {
    const amount = parseFloat(el.dataset.parallax || '10');
    gsap.fromTo(el, { yPercent: -amount }, {
      yPercent: amount, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
  gsap.utils.toArray<HTMLElement>('[data-drift]').forEach(el => {
    const amount = parseFloat(el.dataset.drift || '6');
    gsap.fromTo(el, { xPercent: amount }, {
      xPercent: -amount, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}
