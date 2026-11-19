// Case studies: a thin bar in the red under the sticky nav that fills as you read. One write per frame at most, and
// only while scrolling. (CSS scroll-driven animation would need no script, but the build's minifier folds it into an
// animation shorthand Chrome rejects.)
const main = document.querySelector('main.canvas, main.quick');
if (main) {
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  {
    let queued = false;
    const update = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--read', String(max > 0 ? Math.min(1, scrollY / max) : 0));
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }
}
export {};
