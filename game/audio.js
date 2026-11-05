// Everything is synthesised with WebAudio: no audio assets to ship.

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Fmaj7 – Dm7 – Gm7 – C9: the most supermarket progression there is.
const CHORDS = [
  [53, [65, 69, 72, 76]],
  [50, [65, 69, 72, 74]],
  [55, [65, 70, 74, 77]],
  [48, [64, 67, 70, 74]],
];
const SCALE = [72, 74, 77, 79, 81, 84, 86];

// Best-sounding Swedish voices first: macOS (Alva, Klara, Oskar), Windows (Hedvig,
// Bengt, Sofie, Mattias), Google/Microsoft online voices, then anything sv-SE, then
// espeak-ng's base Swedish voice (Linux) before its novelty variants.
const PREFERRED = /alva|klara|oskar|hedvig|bengt|sofie|mattias|google|microsoft|natural|online/i;
function pickSwedishVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const sv = voices.filter((v) => /^sv([-_]|$)/i.test(v.lang || '') || /swedish|svenska/i.test(v.name));
  if (!sv.length) return null;
  const score = (v) =>
    (PREFERRED.test(v.name) ? 100 : 0) +
    (/espeak/i.test(v.name) ? (/\+/.test(v.name) ? -50 : -10) : 0) +
    (/^sv[-_]se$/i.test(v.lang) ? 5 : 0) +
    (v.localService ? 1 : 0);
  return sv.sort((a, b) => score(b) - score(a))[0];
}

export class Audio {
  constructor() {
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(c.destination);
    this.muted = false;

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.4);
    const wet = c.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);

    this.sfx = c.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);

    // music through "ceiling speakers"
    this.music = c.createGain();
    this.music.gain.value = 0.0;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    this.music.connect(hp).connect(lp);
    lp.connect(this.master);
    lp.connect(this.reverb);

    this.noise = this.noiseBuffer(2);
    this.startAmbience();
    this.startCart();
    this.beat = 0;
    this.nextTime = c.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 80);
    this.music.gain.setTargetAtTime(0.11, c.currentTime + 0.5, 2);

    // Voices load asynchronously; the first getVoices() call is usually empty.
    this.voice = null;
    this.onVoices = () => { this.voice = pickSwedishVoice(); };
    window.speechSynthesis?.addEventListener('voiceschanged', this.onVoices);
    this.onVoices();
  }

  impulse(sec) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  noiseBuffer(sec) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04; // brown-ish
      d[i] = w * 0.5 + last * 3;
    }
    return buf;
  }

  startAmbience() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    n.connect(lp).connect(g);
    n.start();
    for (const [f, v] of [[100, 0.012], [200, 0.006], [300, 0.002]]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(this.master);
      o.start();
    }
  }

  startCart() {
    const c = this.ctx;
    this.cartGain = c.createGain();
    this.cartGain.gain.value = 0;
    this.cartGain.connect(this.sfx);
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4;
    const rumble = c.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 160;
    const rg = c.createGain(); rg.gain.value = 0.9;
    // rattle = noise amplitude-modulated by a fast irregular LFO
    this.rattle = c.createGain();
    this.rattle.gain.value = 0.5;
    n.connect(bp).connect(this.rattle).connect(this.cartGain);
    n.connect(rumble).connect(rg).connect(this.cartGain);
    n.start();
  }

  setCartSpeed(v) {
    const t = this.ctx.currentTime;
    const target = Math.min(1, v / 3.5) * 0.32;
    this.cartGain.gain.setTargetAtTime(target, t, 0.08);
    this.rattle.gain.setValueAtTime(0.3 + Math.random() * 0.7, t);
  }

  schedule() {
    const c = this.ctx;
    const spb = 60 / 86 / 2; // eighth notes at 86 bpm
    while (this.nextTime < c.currentTime + 0.25) {
      const step = this.beat % 16;
      const chord = CHORDS[Math.floor(this.beat / 16) % CHORDS.length];
      const t = this.nextTime;
      if (step === 0 || step === 6 || step === 10) for (const m of chord[1]) this.ep(NOTE(m), t, step === 0 ? 0.05 : 0.03, 1.4);
      if (step === 0 || step === 8 || step === 11) this.bass(NOTE(chord[0] - 12 + (step === 11 ? 7 : 0)), t);
      if (step % 2 === 0 && Math.random() < 0.32) this.ep(NOTE(SCALE[(Math.random() * SCALE.length) | 0]), t, 0.04, 0.8);
      if (step % 4 === 2) this.hat(t);
      this.beat++;
      this.nextTime += spb;
    }
  }

  ep(freq, t, vol, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.music);
    for (const [mul, type, v] of [[1, 'sine', 1], [2, 'sine', 0.25], [4.01, 'sine', 0.06]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  bass(freq, t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.7);
  }

  hat(t) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(g).connect(this.music);
    n.start(t, Math.random());
    n.stop(t + 0.06);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide, at = 0, dest = this.sfx } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur, freq, { vol = 0.3, at = 0, type = 'lowpass', q = 1 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random());
    n.stop(t + dur + 0.02);
  }

  pick() {
    this.tone(520, 0.12, { vol: 0.12, slide: 880 });
    this.burst(0.05, 2500, { vol: 0.08, type: 'bandpass' });
  }

  drop() {
    this.burst(0.12, 700, { vol: 0.35 });
    this.tone(2350 + Math.random() * 400, 0.25, { vol: 0.03 });
    this.tone(3400 + Math.random() * 300, 0.18, { vol: 0.02 });
  }

  whoosh() {
    this.burst(0.25, 900, { vol: 0.2, type: 'bandpass', q: 0.7 });
    this.tone(700, 0.2, { vol: 0.06, slide: 240 });
  }

  beep(at = 0) {
    this.tone(1850, 0.09, { type: 'square', vol: 0.05, at });
  }

  bump() {
    this.burst(0.18, 300, { vol: 0.4 });
    this.tone(180, 0.15, { vol: 0.15, slide: 90 });
  }

  success() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(NOTE(72 + s), 0.5, { vol: 0.1, at: i * 0.09 }));
  }

  // Doom-ish power-up: fast square-wave arpeggio, up for on, down for off.
  powerUp() {
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) => this.tone(NOTE(60 + st), 0.09, { type: 'square', vol: 0.06, at: i * 0.045 }));
    this.tone(NOTE(84), 0.5, { type: 'square', vol: 0.05, at: 0.32 });
  }

  powerDown() {
    [24, 19, 16, 12, 7, 4, 0].forEach((st, i) => this.tone(NOTE(60 + st), 0.09, { type: 'square', vol: 0.05, at: i * 0.045 }));
  }

  crash(n) {
    this.burst(0.35, 600, { vol: 0.5 });
    this.burst(0.5, 2200, { vol: 0.18, type: 'bandpass', q: 0.6, at: 0.03 });
    for (let i = 0; i < Math.min(10, n); i++) {
      this.tone(1800 + Math.random() * 2600, 0.12 + Math.random() * 0.2, { vol: 0.03, at: 0.05 + Math.random() * 0.5 });
      this.burst(0.06, 900 + Math.random() * 1500, { vol: 0.12, at: 0.1 + Math.random() * 0.6, type: 'bandpass', q: 2 });
    }
  }

  clink() {
    this.burst(0.05, 1200 + Math.random() * 1200, { vol: 0.1, type: 'bandpass', q: 2 });
    this.tone(2400 + Math.random() * 2000, 0.1, { vol: 0.02 });
  }

  chime() {
    [[76, 0], [72, 0.45], [67, 0.9]].forEach(([m, at]) => {
      this.tone(NOTE(m), 1.6, { vol: 0.12, at });
      this.tone(NOTE(m) * 2.76, 0.6, { vol: 0.025, at });
    });
  }

  announce(text) {
    if (this.muted) return;
    this.chime();
    const synth = window.speechSynthesis;
    if (!synth) return;
    setTimeout(() => {
      if (this.muted || this.closed) return;
      const voice = this.voice || (this.voice = pickSwedishVoice());
      // Never let a non-Swedish voice read Swedish; the announcement is also shown on screen.
      if (!voice) {
        if (!this.warnedVoice) console.info('[IRL mode] no Swedish speech voice installed; announcements are text only');
        this.warnedVoice = true;
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = /espeak/i.test(voice.name) ? 0.92 : 1.0;
      u.volume = 0.75;
      synth.speak(u);
    }, 1500);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (this.muted) window.speechSynthesis?.cancel();
    return this.muted;
  }

  resume() { return this.ctx.resume(); }

  dispose() {
    this.closed = true;
    window.speechSynthesis?.removeEventListener('voiceschanged', this.onVoices);
    clearInterval(this.timer);
    window.speechSynthesis?.cancel();
    this.ctx.close();
  }
}
