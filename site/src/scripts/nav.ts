// The sticky nav:
//  - it takes a frosted ground once the page leaves the very top (.is-stuck)
//  - it publishes its height as --nav-h, so sections fit the screen below it and #links stop under it
//  - the link for the section being read is underlined (aria-current)
//  - on phones the links live in a full-screen menu behind the toggle
const nav = document.querySelector<HTMLElement>('.nav');
if (nav) {
  const root = document.documentElement;
  const toggle = nav.querySelector<HTMLButtonElement>('.nav__toggle')!;
  const menu = document.getElementById('menu')!;

  // ---- stuck state and height ----
  const stick = () => nav.classList.toggle('is-stuck', nav.hasAttribute('data-solid') || scrollY > 8 || nav.classList.contains('is-open'));
  // measured in its stuck state, which is how it sits over every section after the hero
  const measure = () => {
    const was = nav.classList.contains('is-stuck');
    nav.style.transition = 'none';
    nav.classList.add('is-stuck');
    root.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    nav.classList.toggle('is-stuck', was);
    nav.offsetHeight;                              // apply the restore before transitions come back
    nav.style.transition = '';
  };
  addEventListener('scroll', stick, { passive: true });
  addEventListener('resize', measure);
  stick();
  measure();
  document.fonts.ready.then(measure);

  // ---- the section being read: the one crossing a line 40% down the screen ----
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-section]')];
  const sections = [...new Set(links.map(a => a.dataset.section!))]
    .map(id => document.getElementById(id))
    .filter((s): s is HTMLElement => !!s);
  let active: string | undefined;
  const mark = () => {
    const line = innerHeight * 0.4;
    const id = sections.find(s => { const r = s.getBoundingClientRect(); return r.top <= line && r.bottom > line; })?.id;
    if (id === active) return;
    active = id;
    links.forEach(a => {
      const on = a.dataset.section === id;
      a.classList.toggle('is-active', on);
      on ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current');
    });
  };
  addEventListener('scroll', mark, { passive: true });
  addEventListener('resize', mark);
  mark();

  // ---- phone menu ----
  const lenis = () => (window as any).__lenis as { stop(): void; start(): void } | undefined;
  const focusables = () => [toggle, ...menu.querySelectorAll<HTMLElement>('a')];
  const open = () => {
    menu.hidden = false;
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    root.classList.add('menu-open');
    lenis()?.stop();
    stick();
    menu.querySelector<HTMLElement>('a')?.focus();
  };
  const close = (refocus = true) => {
    if (menu.hidden) return;
    menu.hidden = true;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    root.classList.remove('menu-open');
    lenis()?.start();
    stick();
    if (refocus) toggle.focus();
  };
  toggle.addEventListener('click', () => (menu.hidden ? open() : close()));
  // a link closes the menu first, then the page glides to it (scripts/motion.ts)
  menu.addEventListener('click', e => { if ((e.target as Element).closest('a')) close(false); }, true);
  addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    // keep focus inside the toggle + menu while it is open
    const f = focusables(), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // the menu is for phones only: leaving that width closes it
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) close(false); });
}
