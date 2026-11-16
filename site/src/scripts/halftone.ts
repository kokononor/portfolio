// Halftone arrivals. A photograph marked data-halftone first appears as a newspaper halftone (coarse black dots on a
// 45° screen, bigger where the picture is darker) and then resolves into the photograph as it comes into view, like a
// print coming into focus. The halftone is a copy of the picture under a dot screen (styles in global.css); once it
// has faded it is removed. With reduced motion nothing is added and the photograph is simply there.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll<HTMLElement>('[data-halftone]').forEach(box => {
    const img = box.querySelector('img');
    if (!img) return;
    const ht = document.createElement('div');
    ht.className = 'ht';
    ht.setAttribute('aria-hidden', 'true');
    const copy = new Image();
    copy.alt = '';
    copy.style.objectPosition = getComputedStyle(img).objectPosition;
    const show = () => { copy.src = img.currentSrc || img.src; };
    img.complete ? show() : img.addEventListener('load', show, { once: true });
    ht.append(copy, document.createElement('i'));
    img.after(ht);                                       // above the picture, under anything drawn over it
    new IntersectionObserver((entries, io) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(() => ht.classList.add('is-out'), 900);  // hold the print for a beat, then resolve
      ht.addEventListener('transitionend', () => ht.remove(), { once: true });
    }, { threshold: 0.35 }).observe(box);
  });
}
