// The record keeps playing between pages. The player itself lives in the home page's hero (scripts/record-player.ts);
// on every other page, if the visitor left the record on, the song picks up from where it had got to and a small
// "now playing" chip appears in the corner so it can be stopped. Nothing plays unless they started it themselves.
import { TRACK_URL, VOLUME, ON, AT } from './record-player';

const get = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} };

if (!document.querySelector('.player') && TRACK_URL && get(ON) === '1') {
  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.volume = VOLUME;
  audio.currentTime = parseFloat(get(AT) || '0') || 0;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'music-chip';
  chip.setAttribute('aria-label', 'Stop the music');
  chip.innerHTML = '<span class="music-chip__eq" aria-hidden="true"><i></i><i></i><i></i></span><span>Now playing · The Smiths</span><span class="music-chip__x" aria-hidden="true">×</span>';
  document.body.append(chip);

  // browsers may hold sound back until the visitor touches the new page: start then
  const start = () => audio.play().then(() => chip.classList.add('is-on'), () => {});
  const onGesture = (e: Event) => { if (!chip.contains(e.target as Node)) start(); };
  start().then(() => { if (audio.paused) ['pointerdown', 'keydown'].forEach(g => addEventListener(g, onGesture, { once: true, capture: true })); });

  chip.addEventListener('click', () => { audio.pause(); set(ON, '0'); chip.remove(); });
  addEventListener('pagehide', () => { if (get(ON) === '1') set(AT, String(audio.currentTime)); });
}
