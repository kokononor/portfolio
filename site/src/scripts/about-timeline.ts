// About: a self-playing timeline, one continuous flow at an even, readable speed.
//  - the red rule along the top runs left → right across the whole loop; each third of it is one chapter
//    (Education, Experience, Hobbies), and the tabs change as it passes each third
//  - in each chapter the red rule down the right runs top → bottom, then flows out at the bottom; as it passes an
//    entry, the entry lights up and the image box crossfades to its picture
//  - everything is drawn from one playhead, so pausing, skipping or clicking a tab never jumps the lines
//  - it plays while the section is on screen; the controls pause, play and step between chapters
// With reduced motion nothing plays: the controls and tabs step between chapters, drawn complete.
import { gsap } from 'gsap';

const section = document.querySelector<HTMLElement>('.about');
if (section) {
  const tabs = [...section.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')!)!);
  const top = section.querySelector<HTMLElement>('.rule--top-accent')!;
  const side = section.querySelector<HTMLElement>('.rule--side-accent')!;
  const track = section.querySelector<HTMLElement>('.rule--side')!;
  const toggle = section.querySelector<HTMLButtonElement>('[data-ctl="toggle"]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CHAPTER = 10;      // seconds per chapter: the side rule's run plus its run-out
  const FILL = 0.88;       // share of a chapter the side rule spends growing; the rest it flows out
  const OUT = 1.6;         // seconds for the top rule to flow out before the loop starts again
  const LOOP = CHAPTER * tabs.length + OUT;

  let current = -1;
  let depths: number[] = [];

  const span = (el: HTMLElement, a: number, b: number) => {
    el.style.setProperty('--a', a.toFixed(4));
    el.style.setProperty('--b', b.toFixed(4));
  };
  const showImage = (id: string | undefined) => {
    if (!id) return;
    section.querySelectorAll<HTMLElement>('.media__item').forEach(el => el.classList.toggle('is-on', el.dataset.img === id));
    section.querySelectorAll<HTMLElement>('[data-credit]').forEach(el => el.classList.toggle('is-on', el.dataset.credit === id));
  };
  const entriesOf = (i: number) => [...panels[i].querySelectorAll<HTMLElement>('.entry')];
  // where the side rule meets each entry (the middle of its heading), as a share of the rule's length.
  // On phones the rule is hidden (no height), so the entries' own column stands in for it; otherwise every
  // entry would count as reached at once and the picture would always be the last entry's.
  const column = section.querySelector<HTMLElement>('.about__panels')!;
  const measure = () => {
    const own = track.getBoundingClientRect();
    const t = own.height ? own : column.getBoundingClientRect();
    depths = entriesOf(current).map(e => {
      const r = (e.querySelector('h3, small') ?? e).getBoundingClientRect();
      return t.height ? gsap.utils.clamp(0, 1, (r.top + r.height / 2 - t.top) / t.height) : 0;
    });
  };
  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    measure();
  };

  // draw everything for a moment t (seconds) of the loop
  const render = (t: number) => {
    const chapters = CHAPTER * tabs.length;
    const i = Math.min(tabs.length - 1, Math.floor(t / CHAPTER));
    activate(i);
    span(top, t < chapters ? 0 : (t - chapters) / OUT, Math.min(1, t / chapters));

    const u = t < chapters ? (t - i * CHAPTER) / CHAPTER : 1;
    const reach = u < FILL ? u / FILL : 1;
    span(side, u < FILL ? 0 : (u - FILL) / (1 - FILL), reach);

    let img: string | undefined;
    entriesOf(i).forEach((e, k) => {
      const on = depths[k] <= reach;
      e.classList.toggle('is-reached', on);
      if (on && e.dataset.img) img = e.dataset.img;
    });
    showImage(img);
  };

  const chapterOf = () => Math.min(tabs.length - 1, Math.floor(clock.t / CHAPTER));
  const clock = { t: 0 };
  let goTo: (i: number) => void;

  if (reduce) {
    section.classList.add('is-static');
    // a chapter drawn complete: its rule full, every entry lit
    goTo = i => { clock.t = i * CHAPTER + CHAPTER * FILL - 0.001; render(clock.t); };
  } else {
    const play = gsap.to(clock, { t: LOOP, duration: LOOP, ease: 'none', repeat: -1, paused: true, onUpdate: () => render(clock.t) });
    let userPaused = false;
    let onScreen = false;
    const sync = () => {
      const run = onScreen && !userPaused;
      run ? play.play() : play.pause();
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.setAttribute('aria-label', userPaused ? 'Play timeline' : 'Pause timeline');
    };
    goTo = i => { play.seek(i * CHAPTER); render(clock.t); };
    section.classList.add('is-playing');   // entries wait in a lighter ink until the rule reaches them

    toggle.addEventListener('click', () => { userPaused = !userPaused; sync(); });
    // play while the section crosses the middle of the screen (a band, so a tall section on a short screen still counts)
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { rootMargin: '-35% 0px -35% 0px' }).observe(section);
    sync();
  }

  // a skip shows the new chapter's first picture straight away, even before the rule reaches it
  const jump = goTo;
  goTo = i => { jump(i); showImage(entriesOf(i).find(e => e.dataset.img)?.dataset.img); };

  const step = (d: number) => goTo((chapterOf() + d + tabs.length) % tabs.length);
  section.querySelector('[data-ctl="prev"]')!.addEventListener('click', () => step(-1));
  section.querySelector('[data-ctl="next"]')!.addEventListener('click', () => step(1));
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => goTo(i));
    t.addEventListener('keydown', e => {
      const d = ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      step(d);
      tabs[current].focus();
    });
  });
  addEventListener('resize', () => { measure(); render(clock.t); });

  if (reduce) goTo(0); else render(0);
}
