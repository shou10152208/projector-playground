export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const FONT =
  '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';

export class Particles {
  constructor(max = 500) {
    this.list = [];
    this.max = max;
  }

  burst(x, y, { count = 12, color = '#fff', speed = 200, size = 6, life = 0.8, gravity = 300 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * rand(0.3, 1);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * rand(0.6, 1),
        max: life,
        size: size * rand(0.5, 1.2),
        color: typeof color === 'function' ? color() : color,
        gravity,
      });
    }
  }

  update(dt) {
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    for (const p of this.list) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(g) {
    for (const p of this.list) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

export class FloatTexts {
  constructor() {
    this.list = [];
  }

  add(x, y, text, color = '#fff', size = 64) {
    this.list.push({ x, y, text, color, size, life: 1.4, max: 1.4 });
  }

  update(dt) {
    this.list = this.list.filter((t) => (t.life -= dt) > 0);
    for (const t of this.list) t.y -= 60 * dt;
  }

  draw(g) {
    for (const t of this.list) {
      g.globalAlpha = Math.min(1, t.life / (t.max * 0.5));
      g.font = `bold ${t.size}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = t.size * 0.18;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
  }
}

export function drawStar(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

export function drawBanner(g, W, H, text, alpha = 1) {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, alpha);
  const size = Math.max(22, Math.min(40, W * 0.026));
  g.font = `bold ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + size * 2;
  const h = size * 2.1;
  const x = W / 2 - w / 2;
  const y = H - h - size;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillText(text, W / 2, y + h / 2);
  g.restore();
}
