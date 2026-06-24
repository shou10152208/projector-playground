// Web Audio でその場で合成する効果音。音声ファイルは使わない。
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];

class Sound {
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  tone({ freq = 440, type = 'sine', dur = 0.25, gain = 0.3, when = 0, slide = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.15, gain = 0.2, when = 0, freq = 2500 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(this.master);
    src.start(t);
  }

  // しゃぼん玉。大きいほど低い音 (size: 0..1)
  pop(size = 0.5) {
    this.tone({ freq: 700 - size * 350, type: 'sine', dur: 0.12, gain: 0.35, slide: 300 });
    this.noise({ dur: 0.08, gain: 0.12, freq: 3000 });
  }

  chime(step = 0) {
    const f = PENTA[step % PENTA.length];
    this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.25 });
    this.tone({ freq: f * 2, type: 'sine', dur: 0.4, gain: 0.08 });
  }

  bloom() {
    const f = PENTA[Math.floor(Math.random() * 5)];
    this.tone({ freq: f, type: 'sine', dur: 0.6, gain: 0.12 });
  }

  fanfare() {
    [0, 2, 4, 7].forEach((step, i) => {
      this.tone({ freq: PENTA[step], type: 'triangle', dur: 0.35, gain: 0.22, when: i * 0.09 });
    });
  }

  tick() {
    this.tone({ freq: 1200, type: 'sine', dur: 0.05, gain: 0.06 });
  }

  select() {
    this.tone({ freq: 660, type: 'triangle', dur: 0.15, gain: 0.25 });
    this.tone({ freq: 990, type: 'triangle', dur: 0.3, gain: 0.25, when: 0.1 });
  }
}

export const audio = new Sound();
