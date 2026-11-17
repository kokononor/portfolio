// The record player: it starts playing as the site loads; click to stop or play again.
//  play  → the record starts turning, the tone arm swings over and lowers onto it, the music fades in as it lands
//  stop  → the music fades out, the arm lifts back to its rest, the record coasts to a stop
// Browsers block sound until a visitor has interacted with the site, so when the autostart is refused the record
// waits and starts on the visitor's first click, tap or key press anywhere. Once someone stops it, it stays off for
// the rest of their visit.
//
// MUSIC: set TRACK_URL to your own file (e.g. put it in site/public/audio/ and use '/audio/your-track.mp3').
// Until then a placeholder plays: a soft lo-fi chord loop with vinyl crackle, generated in the browser.
import { gsap } from 'gsap';

// Not licensed: shipped by the site owner's choice. Set TRACK_URL to '' to fall back to the generated loop.
export const TRACK_URL = '/audio/heaven-knows-im-miserable-now.mp3';
const TRACK_NAME = "Heaven Knows I'm Miserable Now by The Smiths";   // read out with the play / pause label
export const VOLUME = 0.6;
// the record carries on between pages: whether it is playing, and how far into the song (see scripts/music.ts)
export const ON = 'music-on', AT = 'music-at';
const RPM_DEG = 200;                        // ~33⅓ rpm, in degrees per second
const ARM_PLAY = 34;                        // degrees the arm swings to sit over the record

const btn = document.querySelector<HTMLButtonElement>('.player');
if (btn) {
  const disc = btn.querySelector<SVGGElement>('.player__disc')!;
  const arm = btn.querySelector<SVGGElement>('.player__arm')!;
  gsap.set(disc, { svgOrigin: '84.5 80.5', rotation: 0 });
  gsap.set(arm, { svgOrigin: '158 51', rotation: 0 });

  // ---- the record turns at a speed that eases up and down, like a platter with weight ----
  const spin = { speed: 0 };
  let angle = 0;
  gsap.ticker.add((_, dt) => {
    if (spin.speed < 0.01) return;
    angle = (angle + spin.speed * dt / 1000) % 360;
    gsap.set(disc, { rotation: angle });
  });

  // ---- sound ----
  const sound = TRACK_URL ? fileSound(TRACK_URL) : placeholderSound();

  let playing = false;
  let tl: gsap.core.Timeline | null = null;
  const OFF = 'music-off';                  // set for the visit once the visitor stops the record
  const remember = (off: boolean) => { try { off ? sessionStorage.setItem(OFF, '1') : sessionStorage.removeItem(OFF); } catch {} };
  const stoppedBefore = () => { try { return sessionStorage.getItem(OFF) === '1'; } catch { return false; } };

  const setPlaying = (on: boolean) => {
    if (on === playing) return;
    playing = on;
    try { sessionStorage.setItem(ON, playing ? '1' : '0'); } catch {}
    btn.setAttribute('aria-pressed', String(playing));
    btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} music: ${TRACK_NAME}`);
    tl?.kill();
    if (playing) {
      tl = gsap.timeline()
        .to(spin, { speed: RPM_DEG, duration: 1.4, ease: 'power2.out' }, 0)
        .to(arm, { rotation: ARM_PLAY - 3, duration: 0.9, ease: 'power2.inOut' }, 0.15)   // swing over…
        .to(arm, { rotation: ARM_PLAY, duration: 0.35, ease: 'power1.out' })              // …and settle onto the groove
        .add(() => sound.start());
    } else {
      sound.stop();
      tl = gsap.timeline()
        .to(arm, { rotation: 0, duration: 1.0, ease: 'power2.inOut' }, 0.1)
        .to(spin, { speed: 0, duration: 2.2, ease: 'power2.out' }, 0.2);
    }
  };
  btn.addEventListener('click', () => {
    cancelWait();
    remember(playing);
    if (!playing) sound.prime();            // inside the click, so the browser lets the sound start
    setPlaying(!playing);
  });

  // ---- start as the site loads; if the browser refuses sound, start on the first interaction instead ----
  const GESTURES = ['pointerdown', 'keydown'] as const;
  const onFirstGesture = (e: Event) => {
    cancelWait();
    if (btn.contains(e.target as Node)) return;   // a click on the player itself starts it through its own handler
    sound.prime();
    setPlaying(true);
  };
  const cancelWait = () => GESTURES.forEach(g => removeEventListener(g, onFirstGesture, true));
  // the record plays as the site opens (or on the first click, tap or key press, where the browser holds sound back),
  // unless the visitor stopped it earlier in this visit; a song left playing on another page resumes where it was
  addEventListener('pagehide', () => { try { if (playing) sessionStorage.setItem(AT, String(sound.time())); } catch {} });
  let at = 0;
  try { at = parseFloat(sessionStorage.getItem(AT) || '0') || 0; } catch {}
  if (!stoppedBefore()) {
    sound.seek(at);
    sound.prime(false).then(ok => (ok ? setPlaying(true) : GESTURES.forEach(g => addEventListener(g, onFirstGesture, true))));
  }
}

// ---------------- your own track ----------------
function fileSound(url: string) {
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'none';                   // the 4 MB file is fetched when playback is asked for, not on every page load
  audio.volume = 0;
  // The music moves the page: once the song is really sounding, its low end is measured many times a second and
  // published as --beat (0 to 1) on the page, which the light (scripts/lighting.ts) and the greeting (Hero.astro)
  // lean on. The song is only routed through the analyser if the browser lets it run, so it can never go silent.
  let analyser: AnalyserNode | null = null, wired = false, level = 0, shown = -1;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const listen = () => {
    if (wired || still || !('AudioContext' in window)) return;
    wired = true;
    const ctx = new AudioContext();
    ctx.resume().then(() => {
      if (ctx.state !== 'running') { ctx.close(); wired = false; return; }
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.75;
      ctx.createMediaElementSource(audio).connect(node).connect(ctx.destination);
      analyser = node;
      const bins = new Uint8Array(node.frequencyBinCount);
      gsap.ticker.add(() => {
        let v = 0;
        if (!audio.paused) { node.getByteFrequencyData(bins); v = (bins[1] + bins[2] + bins[3] + bins[4]) / 4 / 255; }
        level += (v * v - level) * 0.25;                       // squared: quiet passages rest, the beat stands out
        const next = Math.round(level * 50) / 50;
        if (next !== shown) { shown = next; (window as any).__beat = next; document.documentElement.style.setProperty('--beat', String(next)); }
      });
    }).catch(() => { wired = false; });
  };
  return {
    // begin playback silently (the volume rises when the arm lands); resolves false if the browser refuses
    // Asking to play starts the download, so where the browser says sound is not allowed yet (most first visits) we
    // don't ask: the record waits for the visitor's first click, and only then is the file fetched.
    prime: (inGesture = true) => {
      if (!audio.paused) return Promise.resolve(true);
      const policy = (navigator as any).getAutoplayPolicy?.('mediaelement');   // Chrome, Firefox; absent in Safari
      if (!inGesture && policy && policy !== 'allowed') return Promise.resolve(false);
      return audio.play().then(() => true, () => false);
    },
    time: () => audio.currentTime,
    seek: (t: number) => { try { audio.currentTime = t; } catch {} },
    start() { audio.play().then(listen, () => {}); gsap.to(audio, { volume: VOLUME, duration: 1.2, ease: 'power1.out' }); },
    stop() { gsap.to(audio, { volume: 0, duration: 0.6, ease: 'power1.in', onComplete: () => audio.pause() }); },
  };
}

// ---------------- placeholder: lo-fi chords + vinyl crackle ----------------
function placeholderSound() {
  let ctx: AudioContext | null = null, master: GainNode, timer = 0, next = 0, bar = 0, crackle: AudioBufferSourceNode | null = null;
  const CHORDS = [                          // Cmaj7 · Am7 · Fmaj7 · G6, voiced low and warm
    [48, 52, 55, 59], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59],
  ];
  const BAR = 2.6;                          // seconds per chord
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  function setup() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1600;
    master.connect(tone).connect(ctx.destination);
  }
  function chord(at: number, notes: number[]) {
    for (const n of [notes[0] - 12, ...notes]) {
      for (const detune of [-6, 6]) {
        const o = ctx!.createOscillator(), g = ctx!.createGain();
        o.type = n < notes[0] ? 'sine' : 'triangle';
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const peak = n < notes[0] ? 0.09 : 0.035;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(peak, at + 0.35);
        g.gain.setTargetAtTime(peak * 0.6, at + 0.4, 0.8);
        g.gain.setTargetAtTime(0, at + BAR - 0.3, 0.25);
        o.connect(g).connect(master);
        o.start(at);
        o.stop(at + BAR + 1);
      }
    }
  }
  function startCrackle() {
    // a few seconds of hiss and sparse pops, looped
    const len = ctx!.sampleRate * 4, buf = ctx!.createBuffer(1, len, ctx!.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.012;
      if (Math.random() < 0.0004) d[i] += (Math.random() * 2 - 1) * 0.5;
    }
    crackle = ctx!.createBufferSource();
    crackle.buffer = buf;
    crackle.loop = true;
    const hp = ctx!.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    crackle.connect(hp).connect(master);
    crackle.start();
  }
  function schedule() {
    while (next < ctx!.currentTime + 1.5) { chord(next, CHORDS[bar % CHORDS.length]); next += BAR; bar++; }
  }
  return {
    time: () => 0,
    seek: (_t: number) => {},
    async prime(_inGesture = true) {
      if (!ctx) setup();
      await ctx!.resume().catch(() => {});
      return ctx!.state === 'running';
    },
    start() {
      if (!ctx) setup();
      ctx!.resume();
      next = ctx!.currentTime + 0.05;
      startCrackle();
      schedule();
      timer = window.setInterval(schedule, 400);
      master.gain.cancelScheduledValues(ctx!.currentTime);
      master.gain.setTargetAtTime(VOLUME, ctx!.currentTime, 0.4);
    },
    stop() {
      if (!ctx) return;
      window.clearInterval(timer);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      const c = crackle;
      setTimeout(() => { c?.stop(); }, 1200);
    },
  };
}
