// Case study motion, from the frame-by-frame notes in Figma ("phase 2"). Each behaviour is a data attribute in the
// page markup, so every case study can use the same vocabulary:
//
//   data-slide="left|right"   text slides in subtly from that side as it enters (on phones: a soft rise);
//                             data-delay staggers side-by-side columns
//   data-wipe="left|right"    "image wipes and slides", drawn along the site's rules: a hairline draws across the top
//                             from that side, then the image opens down from it and settles
//   data-stage                "zoom in parallax" (Falcon): the hero's picture holds while the hero and Context scroll by,
//                             its [data-stage-leave] layers (the engineers) go, then the view pushes into the monitor
//                             until the live screen fills the window and holds (data-stage-hold); [data-stage-hide]
//                             marks the sections it stands in for
//   data-zoom="pass"          an image strip settles from a slight zoom as it scrolls past (no hold)
//   data-sticky="id"          "sticky image": the image holds while the text scrolls; each [data-step="id"] that
//                             arrives turns it to its next frame ([data-frame] inside, or the images of the
//                             [data-sticky-join="id"] boxes, which are merged into it). A numbered rail on the image
//                             shows where you are and jumps to a step.
//   data-morph                "re-type text" as a morph: two sections with the same layout become one held scene; the
//                             headings blur into each other and the body hands over line by line
//                             ([data-morph-item="a|b"]); the left side slides across ([data-morph-left="a|b"])
//   data-room="N"             make N design px of scroll room after this section, for a hold that needs it
//
// The holds (pins) and reveals are for desktops; phones keep the plain reading order with gentle reveals. With
// reduced motion nothing here runs and the page reads as it is laid out.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { lite } from './perf';

gsap.registerPlugin(ScrollTrigger, SplitText);

const canvas = document.querySelector<HTMLElement>('.canvas');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the canvas pages (Falcon, Diviniti) flow as one column up to 1199px; Swad's grid is laid out for desktops from 901px
const DESKTOP = canvas?.classList.contains('swad') ? '(min-width: 901px)' : '(min-width: 1200px)';

if (canvas && !reduce) {
  const ease = 'expo.out';
  const u = () => canvas.getBoundingClientRect().width / 1728;        // one design pixel, in CSS px
  const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
  const yOf = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--y')) || 0;
  const setY = (el: HTMLElement, y: number) => el.style.setProperty('--y', String(y));
  const lenis = () => (window as any).__lenis as { resize(): void; scrollTo(y: number, o?: object): void } | undefined;

  // ---- text slides in (all sizes) ----
  $$('[data-slide]').forEach(el => {
    const side = el.dataset.slide === 'right' ? 1 : -1;
    const desktop = matchMedia(DESKTOP).matches;
    gsap.fromTo(el, desktop ? { opacity: 0, x: side * 48 } : { opacity: 0, y: 32 }, {
      opacity: 1, x: 0, y: 0, duration: 1.1, ease, delay: parseFloat(el.dataset.delay || '0'),
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  gsap.matchMedia().add(DESKTOP, () => {
    const undo: (() => void)[] = [];
    document.documentElement.classList.add('case-motion');
    undo.push(() => document.documentElement.classList.remove('case-motion'));

    // ---- room for holds: push everything below a section down, and grow the page ----
    const blocks = $$(':scope > [style*="--y"]', canvas);
    const canvasH = () => parseFloat(canvas.style.height.match(/([\d.]+)/)?.[1] ?? 'NaN');
    const makeRoom = (from: number, d: number) => {
      blocks.forEach(b => { const y = yOf(b); if (y >= from) setY(b, y + d); });
      if (!isNaN(canvasH())) canvas.style.height = `calc(${canvasH() + d} * var(--u))`;
      undo.push(() => {
        blocks.forEach(b => { const y = yOf(b); if (y >= from + d) setY(b, y - d); });
        if (!isNaN(canvasH())) canvas.style.height = `calc(${canvasH() - d} * var(--u))`;
      });
    };
    // room is made from the bottom of the page up, so earlier shifts don't move later thresholds
    $$('[data-room]').map(el => ({ el, end: yOf(el) + (parseFloat(el.style.getPropertyValue('--h')) || 0) }))
      .sort((a, b) => b.end - a.end)
      .forEach(({ el, end }) => {
        // the room starts at the first block below the section's top that isn't part of it (its own rules etc. stay)
        const from = Math.min(end, ...blocks.filter(b => yOf(b) > yOf(el) && b.matches('.c-rule')).map(yOf).filter(y => y < end + 400));
        makeRoom(from, parseFloat(el.dataset.room!));
      });

    // ---- a block with a screen to itself (data-alone): when it sits in the middle of the window, nothing above or
    // below it is in view. The room depends on the window's height, so it is measured here rather than drawn. ----
    $$('[data-alone]').forEach(el => {
      const vh = innerHeight / u();                                          // the window's height, in design px
      const h = el.offsetHeight / u();
      const need = (vh - h) / 2 + 40;                                        // the clear space each side needs
      const bottomOf = (b: HTMLElement) => yOf(b) + b.offsetHeight / u();
      const others = blocks.filter(b => b !== el && !el.contains(b) && !b.contains(el) && b.offsetHeight > 0);
      const above = Math.max(0, ...others.filter(b => yOf(b) < yOf(el)).map(bottomOf));
      const gapAbove = yOf(el) - above;
      if (gapAbove < need) makeRoom(yOf(el), need - gapAbove);
      const end = bottomOf(el);
      const below = Math.min(...others.filter(b => yOf(b) >= end - 1).map(yOf));
      if (isFinite(below) && below - end < need) makeRoom(below, need - (below - end));
    });

    // ---- reveals along a rule: the hairline draws across, then the image opens down from it ----
    $$('[data-wipe]').forEach(el => {
      const fromLeft = el.dataset.wipe === 'left';
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 35%', scrub: 0.6 } });
      // the rule sits on the block's top edge, on the canvas (blocks placed by design coordinates only)
      if (el.style.getPropertyValue('--x')) {
        const line = document.createElement('span');
        line.className = 'at reveal-line' + (el.classList.contains('red-block') ? ' reveal-line--accent' : '');
        line.setAttribute('aria-hidden', 'true');
        ['--x', '--y', '--w'].forEach(p => line.style.setProperty(p, el.style.getPropertyValue(p)));
        el.before(line);
        undo.push(() => line.remove());
        tl.fromTo(line, { scaleX: 0, transformOrigin: fromLeft ? 'left center' : 'right center' }, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, 0);
      }
      tl.fromTo(el, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.7, ease: 'power2.out' }, 0.3);
      const img = el.querySelector('img');
      if (img) tl.fromTo(img, { scale: 1.08 }, { scale: 1, duration: 0.7, ease: 'power2.out' }, 0.3);
    });

    // ---- zoom: a camera push with depth ----
    $$('[data-zoom="pass"]').forEach(scene => {
      gsap.fromTo(scene.querySelector('img'), { scale: 1.18 }, { scale: 1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // ---- the stage (Falcon): the hero's picture holds while the hero and Context scroll by; [data-stage-leave] layers
    // (the engineers, the hero facts) go; then the view pushes into the monitor until its screen fills the window, and
    // holds there for data-stage-hold design px so the screen can be used. The sections it covers are [data-stage-hide].
    $$('[data-stage]').forEach(stage => {
      const art = stage.querySelector<HTMLElement>('.stage__art')!;
      const screen = stage.querySelector<HTMLElement>('.stage__screen')!;
      const play = stage.querySelector<HTMLElement>('.stage__play');
      const hero = document.querySelector<HTMLElement>('.hero')!;
      const leave = $$('[data-stage-leave]');
      const hidden = $$('[data-stage-hide]');
      const hold = parseFloat(stage.dataset.stageHold || '700');
      // the covered sections end where the last hidden block ends; the hold's room starts there
      const coverEnd = Math.max(...hidden.map(h => yOf(h) + (parseFloat(h.style.getPropertyValue('--h')) || 0)));
      const last = hidden.reduce((a, b) => (yOf(b) > yOf(a) ? b : a));     // the push ends as this section arrives
      makeRoom(coverEnd, hold);

      // everything is measured in CSS px on each refresh (the hero may be scaled to fit the window, the page shifted)
      let G = { heroH: 1, zoomAt: 2, total: 3, left: 0, k: 1, tx: 0, ty: 0 };
      const measure = () => {
        const W = stage.offsetWidth, H = innerHeight;
        const ax = art.offsetLeft, ay = art.offsetTop, sx = screen.offsetLeft, sy = screen.offsetTop, sw = screen.offsetWidth, sh = screen.offsetHeight;
        // the screen ends up framed: a margin on every side, and room under it for "See in motion"
        const gapX = Math.max(32, W * 0.05), gapTop = Math.max(24, H * 0.05), under = 92;
        const k = Math.min((W - 2 * gapX) / sw, (H - gapTop - under) / sh);
        const x0 = (W - sw * k) / 2, y0 = gapTop + Math.max(0, (H - gapTop - under - sh * k) / 2);
        const heroH = hero.offsetHeight, zoomAt = last.offsetTop;
        G = { heroH, zoomAt, total: zoomAt + hold * u(), left: ax + (art.offsetWidth * 876) / 1728, k, tx: x0 - ax - sx * k, ty: y0 - ay - sy * k };
        if (play) { play.style.top = `${Math.round(y0 + sh * k + 22)}px`; play.style.bottom = 'auto'; }
      };
      const io = gsap.parseEase('power2.inOut'), inn = gsap.parseEase('power2.in');
      const clamp = gsap.utils.clamp(0, 1);
      const render = (y: number) => {
        // the engineers step out of frame (and soften) while the hero scrolls away; its facts fade with them
        const a = inn(clamp(y / (G.heroH * 0.85)));
        leave.forEach(el => el.closest('.stage')
          ? gsap.set(el, { xPercent: 9 * a, scale: 1 + 0.06 * a, opacity: 1 - a, ...(lite ? {} : { filter: `blur(${8 * a}px)` }) })   // a blur redrawn every scrolled frame: not on lite
          : gsap.set(el, { opacity: 1 - clamp(y / (G.heroH * 0.5)), y: -24 * clamp(y / (G.heroH * 0.5)) }));
        // then the picture opens to the whole window and the camera pushes into the screen
        const t = clamp((y - G.heroH) / Math.max(1, G.zoomAt - G.heroH)), e = io(t);
        // a window taller than the hero: the picture ends with the hero until it opens up
        const under = Math.max(0, stage.offsetHeight - G.heroH);
        gsap.set(stage, { clipPath: `inset(0px 0px ${under * (1 - e)}px ${G.left * (1 - e)}px)` });
        gsap.set(art, { x: G.tx * e, y: G.ty * e, scale: 1 + (G.k - 1) * e });
        stage.classList.toggle('is-live', t >= 0.9);                   // "See in motion" arrives as the push settles
      };
      measure();
      ScrollTrigger.create({
        trigger: stage, start: 'top top', end: () => { measure(); return `+=${G.total}`; }, pin: true, pinSpacing: false,
        onUpdate: self => render(self.scroll() - self.start),
        onRefresh: self => render(Math.max(0, self.scroll() - self.start)),
      });
      render(0);
    });

    // ---- sticky images, with a numbered rail ----
    $$('[data-sticky]').forEach(box => {
      const id = box.dataset.sticky!;
      const joins = $$(`[data-sticky-join="${id}"]`);
      // merge the joined boxes' images into this one as frames
      const moved = joins.map(j => {
        const img = j.querySelector('img')!;
        img.setAttribute('data-frame', '');
        box.appendChild(img);
        j.style.visibility = 'hidden';
        return { j, img };
      });
      undo.push(() => moved.forEach(({ j, img }) => { img.removeAttribute('data-frame'); img.classList.remove('is-on'); j.appendChild(img); j.style.visibility = ''; }));
      const frames = $$('[data-frame]', box);
      const steps = $$(`[data-step="${id}"]`);

      // the rail: one number per picture (with joined images the first picture counts), the line fills as you go
      const joined = joins.length > 0;
      const count = joined ? frames.length + 1 : steps.length;
      const rail = document.createElement('nav');
      rail.className = 'sticky-rail';
      rail.setAttribute('aria-label', 'Steps in this section');
      const fill = document.createElement('span');
      fill.className = 'sticky-rail__fill';
      const buttons = Array.from({ length: count }, (_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = String(i + 1).padStart(2, '0');
        b.setAttribute('aria-label', `Go to step ${i + 1} of ${count}`);
        return b;
      });
      rail.append(...buttons.flatMap((b, i) => (i ? [Object.assign(document.createElement('i'), { className: 'sticky-rail__gap' }), b] : [b])), fill);
      box.appendChild(rail);
      undo.push(() => rail.remove());

      const show = (k: number) => {
        frames.forEach((f, i) => f.classList.toggle('is-on', i === k));
        if (k >= 0) box.dataset.active = String(k); else delete box.dataset.active;
        const at = joined ? k + 1 : k;                                 // which number is lit
        buttons.forEach((b, i) => { b.classList.toggle('is-on', i === at); b.toggleAttribute('aria-current', i === at); });
        fill.style.transform = `scaleX(${count > 1 ? Math.max(0, at) / (count - 1) : 1})`;
      };
      show(-1);

      // hold from where it starts until the last joined box would have arrived (or for its data-room)
      const distance = joined ? yOf(joins[joins.length - 1]) - yOf(box) : parseFloat(box.dataset.room || '0');
      const pin = ScrollTrigger.create({ trigger: box, start: box.dataset.stickyStart || 'top top', end: () => `+=${distance * u()}`, pin: true, pinSpacing: false });
      const LINE = 0.62;                                               // a step arrives as its top crosses this line
      steps.forEach((step, k) => ScrollTrigger.create({
        trigger: step, start: `top ${LINE * 100}%`,
        onEnter: () => show(k), onLeaveBack: () => show(k - 1),
      }));
      // a number jumps to its step (with joined images, 01 is the start of the hold)
      buttons.forEach((b, i) => b.addEventListener('click', () => {
        const step = joined ? steps[i - 1] : steps[i];
        const y = step ? step.getBoundingClientRect().top + scrollY - innerHeight * LINE + 4 : pin.start + 1;
        const l = lenis();
        l ? l.scrollTo(y, { duration: 1.2 }) : scrollTo({ top: y, behavior: 'smooth' });
      }));
    });

    // ---- morph: one layout, two sections ----
    $$('[data-morph]').forEach(scene => {
      const sceneH = parseFloat(scene.style.getPropertyValue('--h'));
      const half = sceneH / 2;
      const inB = $$('[data-morph-item="b"], [data-morph-left="b"], [data-morph-hide]', scene);
      // the second section lays itself over the first, and the scene becomes one screen tall
      inB.forEach(el => setY(el, yOf(el) - half));
      scene.style.setProperty('--h', String(half));
      $$('[data-morph-hide]', scene).forEach(el => (el.style.visibility = 'hidden'));
      // the second section is driven by the scene, not by the page's reveals
      $$('[data-morph-item="b"], [data-morph-left="b"]', scene).forEach(el => { gsap.killTweensOf(el); gsap.set(el, { opacity: 1, x: 0, y: 0 }); });

      // headings (and the quote) morph as one piece; body copy hands over line by line
      const items = $$('[data-morph-item]', scene).map(el => {
        const body = el.matches('p.c-body');
        const split = body ? SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'auto' }) : null;
        return { el, b: el.dataset.morphItem === 'b', parts: split ? split.lines : [el], body, split };
      });
      undo.push(() => {
        items.forEach(i => i.split?.revert());
        inB.forEach(el => setY(el, yOf(el) + half));
        scene.style.setProperty('--h', String(sceneH));
        $$('[data-morph-hide]', scene).forEach(el => (el.style.visibility = ''));
      });
      // the principles start hidden: headings out of focus, lines below their masks
      items.filter(i => i.b).forEach(i => gsap.set(i.parts, i.body ? { yPercent: 100 } : { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.06em' }));

      const leftA = scene.querySelector<HTMLElement>('[data-morph-left="a"]')!;
      const leftB = scene.querySelector('[data-morph-left="b"]');
      // the findings' heading slides in with the scroll (not on a timer), so it can never still be arriving while the
      // scene is already sliding it out
      // (the same for the findings on the right, which slide in from the other side)
      const arrive = (el: Element, side: number) => {
        gsap.killTweensOf(el);
        gsap.fromTo(el, { x: side * 48, opacity: 0 }, { x: 0, opacity: 1, ease: 'power2.out',
          scrollTrigger: { trigger: scene, start: 'top 85%', end: 'top 35%', scrub: 0.5 } });
      };
      arrive(leftA, -1);
      items.filter(i => !i.b).forEach(i => arrive(i.el, 1));

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        // it holds once the scene's content (its first 737 design px, the length of its rule) is centred in the window,
        // or at the top when that content is taller than the window
        scrollTrigger: { trigger: scene, start: () => `top ${Math.max(0, innerHeight / 2 - 368.5 * u())}px`, end: () => `+=${half * u()}`, pin: true, pinSpacing: false, scrub: 0.6 },
      });
      tl.to({}, { duration: 0.1 });                                    // a beat to read the findings
      const a = items.filter(i => !i.b), b = items.filter(i => i.b);
      // the findings leave: headings blur and open up, body lines rise out of their masks (from-to, so scrolling back
      // always restores them whole, even if their slide-in was still running)
      a.forEach((i, n) => tl.fromTo(i.parts, i.body
        ? { yPercent: 0 } : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0em' }, i.body
        ? { yPercent: -100, duration: 0.16, stagger: 0.012, ease: 'power2.in', immediateRender: false }
        : { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.06em', duration: 0.16, immediateRender: false }, 0.1 + n * 0.02));
      // the left side slides across (from-to, so scrolling back restores the findings)
      tl.fromTo(leftA, { yPercent: 0, opacity: 1 }, { yPercent: -18, opacity: 0, duration: 0.16, ease: 'power2.in', immediateRender: false }, 0.18)
        .fromTo(leftB, { yPercent: 18, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.36);
      // the principles arrive: headings come into focus and close up, body lines rise into place
      b.forEach((i, n) => tl.to(i.parts, i.body
        ? { yPercent: 0, duration: 0.18, stagger: 0.014, ease: 'power2.out' }
        : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0em', duration: 0.18 }, 0.34 + n * 0.025));
      tl.to({}, { duration: 0.12 });                                   // and a beat to read them
    });

    // the page is now taller: the smooth scroll must learn its new length before the triggers measure
    lenis()?.resize();
    ScrollTrigger.refresh();
    return () => { undo.reverse().forEach(f => f()); lenis()?.resize(); ScrollTrigger.refresh(); };
  });

  if (import.meta.env.DEV) (window as any).__ST = ScrollTrigger;      // for checking the holds while developing
}
