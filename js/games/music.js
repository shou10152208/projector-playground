import { Particles, rand, FONT } from '../fx.js';

// Pentatonic C major across 2 octaves (6 zones)
const ZONES = [
  { freq: 523.25, label: 'ド', emoji: '🔴', color: '#ff5c5c', hue: 0 },
  { freq: 587.33, label: 'レ', emoji: '🟠', color: '#ff9f40', hue: 30 },
  { freq: 659.25, label: 'ミ', emoji: '🟡', color: '#ffe040', hue: 55 },
  { freq: 392.00, label: 'ソ', emoji: '🟢', color: '#4ddb6e', hue: 140 },
  { freq: 440.00, label: 'ラ', emoji: '🔵', color: '#4db8ff', hue: 210 },
  { freq: 261.63, label: 'ド', emoji: '🟣', color: '#c47aff', hue: 275 },
];

const INSTRUMENTS = [
  { id: 'piano',   label: 'ピアノ',   emoji: '🎹' },
  { id: 'marimba', label: 'まりんば', emoji: '🪘' },
  { id: 'bell',    label: 'ベル',     emoji: '🔔' },
];

function playNote(audio, freq, instrument) {
  if (!audio.ctx) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  if (instrument === 'piano') {
    osc.type = 'triangle';
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  } else if (instrument === 'marimba') {
    osc.type = 'sine';
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  } else { // bell
    osc.type = 'triangle';
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.28, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
  }

  osc.frequency.value = freq;
  osc.connect(env).connect(audio.master);
  osc.start(t);
  osc.stop(t + 2.1);

  // Overtone for richness
  if (instrument !== 'marimba') {
    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    env2.gain.setValueAtTime(0, t);
    env2.gain.linearRampToValueAtTime(0.06, t + 0.01);
    env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc2.connect(env2).connect(audio.master);
    osc2.start(t);
    osc2.stop(t + 0.7);
  }
}

export const musicGame = {
  id: 'music',
  label: 'おとあそび',
  emoji: '🎹',
  color: '#c47aff',

  init() {
    this.parts = new Particles(600);
    this.ripples = [];
    this.instrument = 'marimba';
    this.triggered = new Array(6).fill(false);
    this.glow = new Array(6).fill(0);
    this.instrHold = 0;
    this.instrIdx = 1; // marimba
    this.hintT = 5;
  },

  _zones(app) {
    const { W, H } = app;
    const cols = 3;
    const rows = 2;
    const pad = Math.min(W, H) * 0.06;
    const cellW = (W - pad * 2) / cols;
    const cellH = (H * 0.72 - pad) / rows;
    const r = Math.min(cellW, cellH) * 0.38;
    return ZONES.map((z, i) => ({
      ...z,
      x: pad + cellW * (i % cols) + cellW / 2,
      y: H * 0.1 + cellH * Math.floor(i / cols) + cellH / 2,
      r,
    }));
  },

  update(dt, app) {
    this.parts.update(dt);
    this.ripples = this.ripples.filter(r => (r.life -= dt) > 0);
    for (const r of this.ripples) r.radius += r.speed * dt;

    const zones = this._zones(app);
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const m = app.motionAt(z.x / app.W, z.y / app.H, (z.r / app.W) * 0.9);
      if (m > 0.3) {
        this.glow[i] = Math.min(1, this.glow[i] + dt * 8);
        if (!this.triggered[i]) {
          this.triggered[i] = true;
          playNote(app.audio, z.freq, this.instrument);
          this.parts.burst(z.x, z.y, {
            count: 18, color: z.color, speed: 320, size: 8, life: 0.9,
          });
          this.ripples.push({ x: z.x, y: z.y, radius: z.r * 0.6, speed: z.r * 3, life: 0.7, max: 0.7, color: z.color });
        }
      } else {
        this.glow[i] = Math.max(0, this.glow[i] - dt * 5);
        this.triggered[i] = false;
      }
    }

    if (this.hintT > 0) this.hintT -= dt;
  },

  draw(g, app) {
    const { W, H, t } = app;

    // Background
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0a2e');
    bg.addColorStop(1, '#0d1a3a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Subtle shimmer dots
    for (let i = 0; i < 20; i++) {
      const x = W * ((i * 0.137 + 0.05) % 1);
      const y = H * ((i * 0.513 + 0.07) % 1);
      g.fillStyle = `hsla(${(i * 37 + t * 20) % 360}, 80%, 75%, ${0.1 + 0.08 * Math.sin(t * 1.5 + i)})`;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }

    const zones = this._zones(app);

    // Ripples
    for (const r of this.ripples) {
      g.globalAlpha = (r.life / r.max) * 0.5;
      g.strokeStyle = r.color;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // Zone circles
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const gl = this.glow[i];
      const bob = Math.sin(t * 1.2 + i * 1.1) * 4;

      // Glow halo
      if (gl > 0) {
        g.save();
        g.shadowColor = z.color;
        g.shadowBlur = 40 * gl;
        g.fillStyle = z.color;
        g.globalAlpha = 0.25 * gl;
        g.beginPath();
        g.arc(z.x, z.y + bob, z.r * 1.3, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      // Circle fill
      const grad = g.createRadialGradient(z.x, z.y + bob - z.r * 0.3, z.r * 0.1, z.x, z.y + bob, z.r);
      grad.addColorStop(0, `hsl(${z.hue}, 80%, 75%)`);
      grad.addColorStop(1, `hsl(${z.hue}, 60%, 40%)`);
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.4)';
      g.shadowBlur = 16;
      g.shadowOffsetY = 6;
      g.fillStyle = grad;
      g.globalAlpha = 0.85 + 0.15 * gl;
      g.beginPath();
      g.arc(z.x, z.y + bob, z.r * (1 + gl * 0.08), 0, Math.PI * 2);
      g.fill();
      g.restore();

      // Emoji
      const emojiSize = z.r * 0.72;
      g.font = `${emojiSize}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(z.emoji, z.x, z.y + bob - z.r * 0.05);

      // Label
      const ls = Math.max(18, z.r * 0.28);
      g.font = `bold ${ls}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.lineJoin = 'round';
      g.lineWidth = ls * 0.28;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(z.label, z.x, z.y + bob + z.r * 0.75);
      g.fillStyle = '#fff';
      g.fillText(z.label, z.x, z.y + bob + z.r * 0.75);
    }

    this.parts.draw(g);

    // Instrument selector strip at bottom
    this._drawInstrSelector(g, app);

    // Hint
    if (this.hintT > 0) {
      g.globalAlpha = Math.min(1, this.hintT);
      const hs = Math.max(18, Math.min(W * 0.035, 28));
      g.font = `bold ${hs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = hs * 0.28;
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText('まるの まえで てを うごかして おとを だそう！', W / 2, H * 0.95);
      g.fillStyle = '#ffe';
      g.fillText('まるの まえで てを うごかして おとを だそう！', W / 2, H * 0.95);
      g.globalAlpha = 1;
    }
  },

  _drawInstrSelector(g, app) {
    const { W, H } = app;
    const n = INSTRUMENTS.length;
    const bw = Math.min(W * 0.22, 120);
    const bh = Math.min(H * 0.065, 44);
    const gap = 12;
    const totalW = n * bw + (n - 1) * gap;
    const sx = (W - totalW) / 2;
    const sy = H * 0.885;

    for (let i = 0; i < n; i++) {
      const inst = INSTRUMENTS[i];
      const bx = sx + i * (bw + gap);
      const active = inst.id === this.instrument;

      g.save();
      g.fillStyle = active ? 'rgba(196,122,255,0.9)' : 'rgba(255,255,255,0.15)';
      g.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.3)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(bx, sy, bw, bh, bh / 2);
      g.fill();
      g.stroke();
      g.restore();

      const fs = Math.max(14, bh * 0.42);
      g.font = `bold ${fs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.7)';
      g.fillText(`${inst.emoji} ${inst.label}`, bx + bw / 2, sy + bh / 2);

      // Clickable
      if (!this._instrRects) this._instrRects = [];
      this._instrRects[i] = { x: bx, y: sy, w: bw, h: bh, id: inst.id };
    }
  },

  handlePointer(px, py) {
    if (!this._instrRects) return;
    for (const r of this._instrRects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        this.instrument = r.id;
      }
    }
  },
};
