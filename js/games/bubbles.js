import { Particles, FloatTexts, rand, pick, FONT, drawBanner } from '../fx.js';

const PRAISE = ['すごい！', 'やったね！', 'じょうず！', 'ぱちん！'];

export const bubblesGame = {
  id: 'bubbles',
  label: 'しゃぼんだま',
  emoji: '🫧',
  color: '#4db8ff',

  init() {
    this.bubbles = [];
    this.parts = new Particles();
    this.texts = new FloatTexts();
    this.score = 0;
    this.spawnT = 0;
    this.hintT = 7;
  },

  spawn(app) {
    const r = rand(0.04, 0.1) * Math.min(app.W, app.H);
    this.bubbles.push({
      x: rand(r, app.W - r),
      y: app.H + r,
      r,
      vy: rand(70, 150) * (app.H / 900),
      hue: rand(0, 360),
      wob: rand(0, Math.PI * 2),
      age: 0,
    });
  },

  update(dt, app) {
    const { W, H } = app;
    this.hintT -= dt;
    this.spawnT -= dt;
    const want = Math.min(10, 4 + Math.floor(this.score / 8));
    if (this.spawnT <= 0 && this.bubbles.length < want) {
      this.spawn(app);
      this.spawnT = rand(0.25, 0.7);
    }

    for (const b of this.bubbles) {
      b.age += dt;
      b.wob += dt * 2;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.wob) * 30 * dt;
      if (b.age > 0.4 && app.motionAt(b.x / W, b.y / H, (b.r / W) * 0.8) > 0.5) {
        b.popped = true;
      }
    }

    for (const b of this.bubbles) if (b.popped) this.popBubble(b, app);
    this.bubbles = this.bubbles.filter((b) => !b.popped && b.y > -b.r);

    this.parts.update(dt);
    this.texts.update(dt);
  },

  popBubble(b, app) {
    this.score++;
    app.audio.pop(b.r / (Math.min(app.W, app.H) * 0.1));
    this.parts.burst(b.x, b.y, {
      count: 16,
      color: () => `hsl(${b.hue + rand(-30, 30)}, 90%, 75%)`,
      speed: b.r * 6,
      size: b.r * 0.12 + 3,
      life: 0.7,
      gravity: 250,
    });
    if (this.score % 10 === 0) {
      app.audio.fanfare();
      this.texts.add(b.x, b.y - b.r, pick(PRAISE), '#ff6fa5', Math.min(90, app.W * 0.06));
    }
  },

  draw(g, app) {
    const { W, H, t } = app;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7ec8ff');
    sky.addColorStop(1, '#d9f2ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // たいよう
    g.fillStyle = 'rgba(255, 230, 120, 0.9)';
    g.beginPath();
    g.arc(W * 0.85, H * 0.15, Math.min(W, H) * 0.07, 0, Math.PI * 2);
    g.fill();

    // くも
    const k = Math.min(W, H) / 800;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 14 + i * 430) % (W + 320)) - 160;
      const cy = H * (0.1 + i * 0.09);
      g.beginPath();
      g.ellipse(cx, cy, 75 * k, 30 * k, 0, 0, Math.PI * 2);
      g.ellipse(cx - 48 * k, cy + 11 * k, 48 * k, 21 * k, 0, 0, Math.PI * 2);
      g.ellipse(cx + 48 * k, cy + 11 * k, 48 * k, 21 * k, 0, 0, Math.PI * 2);
      g.fill();
    }

    for (const b of this.bubbles) this.drawBubble(g, b, t);
    this.parts.draw(g);
    this.texts.draw(g);

    g.font = `bold ${Math.min(64, W * 0.045)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    const label = `🫧 ${this.score}`;
    g.strokeText(label, W / 2, H * 0.03);
    g.fillStyle = '#1b7fd4';
    g.fillText(label, W / 2, H * 0.03);

    if (this.hintT > 0) {
      drawBanner(g, W, H, 'からだを うごかして しゃぼんだまを わってね！', this.hintT);
    }
  },

  drawBubble(g, b, t) {
    const hue = (b.hue + t * 40) % 360;
    const grad = g.createRadialGradient(
      b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1,
      b.x, b.y, b.r
    );
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.7, `hsla(${hue}, 80%, 80%, 0.25)`);
    grad.addColorStop(1, `hsla(${(hue + 60) % 360}, 90%, 70%, 0.55)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.18, b.r * 0.1, -0.6, 0, Math.PI * 2);
    g.fill();
  },
};
