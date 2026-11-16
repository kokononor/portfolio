// Dog-ears. A reader who leaves a case study part-way has, in effect, folded the corner of the page: the place is
// kept in this browser only (localStorage; nothing is sent anywhere). Back on the home page that study's card shows a
// folded corner and a "Pick up at …" link, which opens the study at the section they had reached. Reading to the end
// (or nearly) unfolds the corner.
type Mark = { at: number; of: number; title: string };
const KEY = 'dogears';
const read = (): Record<string, Mark> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (m: Record<string, Mark>) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };
const path = location.pathname.replace(/\/+$/, '');

if (path.startsWith('/work/')) {
  // ---- in a case study: keep the place ----
  const heads = [...document.querySelectorAll<HTMLElement>('main h2')];
  const long = () => document.documentElement.scrollHeight - innerHeight;
  const go = (y: number) => { const l = (window as any).__lenis; l ? l.scrollTo(y, { duration: 1.6 }) : scrollTo({ top: y }); };
  // opened from a "Pick up" link: go to the kept place once the page has its full length (pins add to it)
  const kept = read()[path];
  if (location.hash === '#pick-up' && kept) {
    const jump = () => setTimeout(() => go(kept.at / kept.of * long()), 700);
    document.readyState === 'complete' ? jump() : addEventListener('load', jump);
    history.replaceState(null, '', path);
  }
  let timer = 0;
  const keep = () => {
      const marks = read(), done = scrollY / Math.max(1, long());
      if (done < 0.1) return;                                           // barely begun: any earlier place stands
      if (done > 0.9) delete marks[path];                               // read to the end: the corner unfolds
      else {
        const line = innerHeight * 0.5;
        const head = heads.filter(h => h.getBoundingClientRect().top < line).pop();
        marks[path] = { at: Math.round(scrollY), of: Math.round(long()), title: (head?.textContent || '').trim().slice(0, 60) };
      }
      write(marks);
  };
  addEventListener('scroll', () => { clearTimeout(timer); timer = window.setTimeout(keep, 400); }, { passive: true });
  addEventListener('pagehide', keep);                                   // and once more on the way out
} else {
  // ---- on the home page: fold the corner of each card that was left part-way ----
  const marks = read();
  document.querySelectorAll<HTMLAnchorElement>('.case__more').forEach(more => {
    const mark = marks[new URL(more.href).pathname.replace(/\/+$/, '')];
    const card = more.closest<HTMLElement>('.falcon, .swad__body, .story');
    if (!mark || !card) return;
    const fold = document.createElement('span');
    fold.className = 'dogear';
    fold.setAttribute('aria-hidden', 'true');
    card.append(fold);
    const a = document.createElement('a');
    a.className = 'case__pickup';
    a.href = more.getAttribute('href') + '#pick-up';
    a.textContent = mark.title ? `Pick up at “${mark.title}”` : 'Pick up where you stopped';
    more.after(a);
  });
}
