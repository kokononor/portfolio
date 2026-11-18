// What the device can afford. Safari (every browser on iOS, and Safari on macOS) repaints CSS filters, blended layers
// and inherited custom properties far more slowly than Chromium, and it scrolls best natively, off the main thread.
// So on WebKit, and on low-end or data-saving devices, the site keeps its look but stops the continuous effects:
// the light settles and holds still, scroll is native, and nothing restyles the whole page while it scrolls.
// ?lite=1 / ?lite=0 force either way, for testing.
const ua = navigator.userAgent;
const forced = new URLSearchParams(location.search).get('lite');

/** Safari on macOS or any iOS browser (all WebKit) */
export const webkit = 'GestureEvent' in window
  || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(ua));

const conn = (navigator as any).connection;
const weak = (navigator.hardwareConcurrency || 8) <= 4 || !!conn?.saveData || ((navigator as any).deviceMemory ?? 8) <= 4;

/** keep the look, drop the per-frame work */
export const lite = forced === '1' ? true : forced === '0' ? false : webkit || weak;

if (lite) document.documentElement.classList.add('lite');
