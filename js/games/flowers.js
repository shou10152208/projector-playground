import { Particles, rand, pick, drawBanner } from '../fx.js';

const HUES = [340, 20, 50, 200, 270, 0];

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const v = Math.min(1, Math.max(0, x));
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
}

export const flowersGame = {
  id: 'flowers',
  label: 'おはなばたけ',
  emoji: '🌼',
  color: '#ff7eb3',

  init() {
    this.flowers = [];
    this.butterflies = [];
    this.parts = new Particles(300);
    this.hintT = 8;
    this.soundT = 0;
    this.planted = 0;
  },

  update(dt, app) {
    const { W, H } = app;
    this.hintT -= dt;
    this.soundT -= dt;

    // ランダムな点を毎フレーム少しずつ調べ、動きのある場所に花を植える
    const minDist = Math.min(W, H) * 0.07;
    for (let i = 0; i < 14; i++) {
      const x = rand(0.03, 0.97) * W;
      const y = rand(0.18, 0.95) * H;
      if (app.motionAt(x / W, y / H, 0.02) < 0.6) continue;
      let near = false;
      for (const f of this.flowers) {
        const dx = f.x - x;
        const dy = f.y - y;
        if (dx * dx + dy * dy < minDist * minDist) {
          near = true;
          break;
        }
      }
      if (!near) this.plant(x, y, app);
    }

    for (const f of this.flowers) {
      f.grow = Math.min(1, f.grow + dt * 1.4);
      if (!f.bloomed && f.grow >= 1) {
        f.bloomed = true;
        this.parts.burst(f.x, f.y, {
          count: 6,
          color: `hsl(${f.hue}, 90%, 80%)`,
          speed: 60,
          size: 3,
          life: 0.6,
          gravity: -40,
        });
      }
      f.life -= dt;
    }
    this.flowers = this.flowers.filter((f) => f.life > -3);

    // 花が増えると ちょうちょが あつまってくる
    const want = Math.min(6, Math.floor(this.planted / 6));
    while (this.butterflies.length < want) {
      this.butterflies.push({
        x: rand(0, W),
        y: -30,
        tx: rand(0.2, 0.8) * W,
        ty: rand(0.2, 0.7) * H,
        t: rand(0, 10),
        hue: pick(HUES),
        retarget: rand(2, 5),
        dir: 1,
      });
    }
    for (const b of this.butterflies) {
      b.t += dt;
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.retarget = rand(2.5, 5);
        const f = this.flowers.length ? pick(this.flowers) : null;
        b.tx = f ? f.x : rand(0.1, 0.9) * W;
        b.ty = f ? f.y - 30 : rand(0.1, 0.6) * H;
      }
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      b.x += dx * 0.6 * dt + Math.sin(b.t * 3) * 25 * dt;
      b.y += dy * 0.6 * dt + Math.cos(b.t * 4.3) * 30 * dt;
      if (Math.abs(dx) > 5) b.dir = dx >= 0 ? 1 : -1;
    }

    this.parts.update(dt);
  },

  plant(x, y, app) {
    if (this.flowers.length >= 90) {
      const oldest = this.flowers.find((f) => f.life > 0);
      if (oldest) oldest.life = 0;
    }
    this.planted++;
    const size = Math.min(app.W, app.H) * rand(0.03, 0.055);
    this.flowers.push({
      x,
      y,
      size,
      stem: size * rand(1.6, 2.4),
      hue: pick(HUES),
      petals: pick([5, 6, 8]),
      grow: 0,
      bloomed: false,
      sway: rand(0, Math.PI * 2),
      life: rand(22, 30),
    });
    if (this.soundT <= 0) {
      this.soundT = 0.12;
      app.audio.bloom();
    }
  },

  draw(g, app) {
    const { W, H, t } = app;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#bfe8ff');
    sky.addColorStop(0.6, '#e8f7d9');
    sky.addColorStop(1, '#9ed98a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // たいよう
    g.fillStyle = 'rgba(255, 215, 100, 0.9)';
    g.beginPath();
    g.arc(W * 0.88, H * 0.12, Math.min(W, H) * 0.06, 0, Math.PI * 2);
    g.fill();

    const sorted = [...this.flowers].sort((a, b) => a.y - b.y);
    for (const f of sorted) this.drawFlower(g, f, t);

    for (const b of this.butterflies) this.drawButterfly(g, b);

    this.parts.draw(g);

    if (this.hintT > 0) {
      drawBanner(g, W, H, 'てを ふると おはなが さくよ', this.hintT);
    }
  },

  drawFlower(g, f, t) {
    const alpha = f.life >= 0 ? 1 : Math.max(0, 1 + f.life / 3);
    const sway = Math.sin(t * 1.6 + f.sway) * 4;
    const stemH = f.stem * Math.min(1, f.grow * 1.6);
    const baseX = f.x;
    const baseY = f.y + f.stem;
    const headX = f.x + sway;
    const headY = baseY - stemH;

    g.save();
    g.globalAlpha = alpha;

    g.strokeStyle = '#3e9b4f';
    g.lineWidth = Math.max(2, f.size * 0.12);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(baseX + sway * 0.4, baseY - stemH * 0.5, headX, headY);
    g.stroke();

    g.fillStyle = '#4cae5c';
    g.beginPath();
    g.ellipse(baseX - f.size * 0.4, baseY - stemH * 0.35, f.size * 0.35, f.size * 0.14, -0.6, 0, Math.PI * 2);
    g.ellipse(baseX + f.size * 0.4, baseY - stemH * 0.55, f.size * 0.35, f.size * 0.14, 0.6, 0, Math.PI * 2);
    g.fill();

    if (f.grow > 0.35) {
      const open = easeOutBack((f.grow - 0.35) / 0.65);
      const pr = f.size * open;
      g.fillStyle = `hsl(${f.hue}, 85%, 72%)`;
      for (let i = 0; i < f.petals; i++) {
        const ang = (i / f.petals) * Math.PI * 2 + f.sway;
        g.beginPath();
        g.ellipse(
          headX + Math.cos(ang) * pr * 0.55,
          headY + Math.sin(ang) * pr * 0.55,
          pr * 0.42,
          pr * 0.26,
          ang,
          0,
          Math.PI * 2
        );
        g.fill();
      }
      g.fillStyle = `hsl(${(f.hue + 40) % 360}, 90%, 60%)`;
      g.beginPath();
      g.arc(headX, headY, pr * 0.3, 0, Math.PI * 2);
      g.fill();
    }

    g.restore();
  },

  drawButterfly(g, b) {
    const flap = Math.abs(Math.sin(b.t * 14));
    const s = 16;
    g.save();
    g.translate(b.x, b.y);
    g.scale(b.dir, 1);
    g.fillStyle = `hsla(${b.hue}, 85%, 65%, 0.95)`;
    g.beginPath();
    g.ellipse(-s * 0.55, -s * 0.2, s * 0.6 * (0.35 + 0.65 * flap), s * 0.8, -0.5, 0, Math.PI * 2);
    g.ellipse(s * 0.55, -s * 0.2, s * 0.6 * (0.35 + 0.65 * flap), s * 0.8, 0.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#5b4032';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -s * 0.8);
    g.lineTo(0, s * 0.6);
    g.stroke();
    g.restore();
  },
};
