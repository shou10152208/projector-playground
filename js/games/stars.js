import { Particles, FloatTexts, rand, pick, FONT, drawBanner, drawStar } from '../fx.js';

const PRAISE = ['きらきら！', 'やったね！', 'すごい！'];

export const starsGame = {
  id: 'stars',
  label: 'ほしキャッチ',
  emoji: '⭐',
  color: '#ffb830',

  init() {
    this.stars = [];
    this.parts = new Particles();
    this.texts = new FloatTexts();
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.spawnT = 0;
    this.spawned = 0;
    this.hintT = 7;
    this.bg = Array.from({ length: 70 }, () => ({
      nx: Math.random(),
      ny: Math.random() * 0.85,
      r: rand(1, 2.6),
      ph: rand(0, Math.PI * 2),
    }));
  },

  update(dt, app) {
    const { W, H } = app;
    this.hintT -= dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    this.spawnT -= dt;
    const max = Math.min(9, 3 + Math.floor(this.score / 10));
    if (this.spawnT <= 0 && this.stars.length < max) {
      this.spawned++;
      const golden = this.spawned % 7 === 0;
      const r = Math.min(W, H) * (golden ? rand(0.05, 0.06) : rand(0.03, 0.045));
      this.stars.push({
        x: rand(r, W - r),
        y: -r,
        r,
        vy: H * rand(0.1, 0.17) * (golden ? 0.8 : 1),
        sway: rand(0, Math.PI * 2),
        rot: rand(0, Math.PI * 2),
        vr: rand(-1.5, 1.5),
        golden,
        age: 0,
        trailT: 0,
      });
      this.spawnT = rand(0.5, 1.1);
    }

    for (const s of this.stars) {
      s.age += dt;
      s.sway += dt * 1.8;
      s.rot += s.vr * dt;
      s.y += s.vy * dt;
      s.x += Math.sin(s.sway) * 40 * dt;
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.09;
        this.parts.burst(s.x, s.y, {
          count: 1,
          color: s.golden ? '#ffe066' : '#cfe9ff',
          speed: 20,
          size: s.r * 0.16,
          life: 0.6,
          gravity: 0,
        });
      }
      if (s.age > 0.3 && app.motionAt(s.x / W, s.y / H, (s.r / W) * 0.9) > 0.5) {
        s.caught = true;
      }
    }

    for (const s of this.stars) if (s.caught) this.catchStar(s, app);
    this.stars = this.stars.filter((s) => !s.caught && s.y < H + s.r * 2);

    this.parts.update(dt);
    this.texts.update(dt);
  },

  catchStar(s, app) {
    this.score += s.golden ? 3 : 1;
    this.combo = Math.min(7, this.combo + 1);
    this.comboT = 2;
    this.parts.burst(s.x, s.y, {
      count: s.golden ? 36 : 18,
      color: s.golden
        ? () => `hsl(${rand(0, 360)}, 95%, 70%)`
        : () => `hsl(${rand(40, 60)}, 100%, ${rand(65, 85)}%)`,
      speed: s.r * 8,
      size: s.r * 0.14 + 2,
      life: 0.9,
      gravity: 120,
    });
    if (s.golden) {
      app.audio.fanfare();
      this.texts.add(s.x, s.y - s.r, pick(PRAISE), '#ffd700', Math.min(90, app.W * 0.06));
    } else {
      app.audio.chime(this.combo);
    }
  },

  draw(g, app) {
    const { W, H, t } = app;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0c1445');
    sky.addColorStop(1, '#3b2d6e');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    for (const b of this.bg) {
      g.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + b.ph));
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(b.nx * W, b.ny * H, b.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // つき
    const mr = Math.min(W, H) * 0.07;
    const mx = W * 0.12;
    const my = H * 0.15;
    g.fillStyle = '#fff4c2';
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(220, 205, 150, 0.5)';
    g.beginPath();
    g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, Math.PI * 2);
    g.fill();

    this.parts.draw(g);

    for (const s of this.stars) {
      g.save();
      g.shadowColor = s.golden ? '#ffd700' : '#9fd0ff';
      g.shadowBlur = s.r * 0.8;
      drawStar(g, s.x, s.y, s.r, s.rot);
      const grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      if (s.golden) {
        grad.addColorStop(0, '#fffbe0');
        grad.addColorStop(1, '#ffb300');
      } else {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#ffd95e');
      }
      g.fillStyle = grad;
      g.fill();
      g.restore();
    }

    this.texts.draw(g);

    g.font = `bold ${Math.min(64, W * 0.045)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    const label = `⭐ ${this.score}`;
    g.strokeText(label, W / 2, H * 0.03);
    g.fillStyle = '#e8a200';
    g.fillText(label, W / 2, H * 0.03);

    if (this.hintT > 0) {
      drawBanner(g, W, H, 'おちてくる ほしに てを かざして キャッチ！', this.hintT);
    }
  },
};
