import { Particles, FloatTexts, rand, pick, FONT, drawBanner, drawStar } from '../fx.js';

const PRAISE = ['ぽかっ！', 'いいね！', 'めいちゅう！', 'すごい！'];

// あなの配置（3×2）。もぐらが顔を出したところを たたく（てを かざす）。
export const molesGame = {
  id: 'moles',
  label: 'もぐらたたき',
  emoji: '🐹',
  color: '#a5703d',

  init() {
    this.parts = new Particles(500);
    this.texts = new FloatTexts();
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.spawnT = 1.2;
    this.hintT = 7;
    this.spawned = 0;
    // holes は毎フレーム位置を計算し、状態だけ保持する
    this.holes = Array.from({ length: 6 }, () => ({
      mole: null, // { kind:'normal'|'gold'|'spiky', up:0..1, stayT, bonkedT, age }
      cooldown: rand(0, 1),
    }));
  },

  _holePos(i, app) {
    const { W, H } = app;
    const cols = 3;
    const pad = Math.min(W, H) * 0.08;
    const cellW = (W - pad * 2) / cols;
    const cellH = (H * 0.62 - pad) / 2;
    return {
      x: pad + cellW * (i % cols) + cellW / 2,
      y: H * 0.3 + cellH * Math.floor(i / cols) + cellH / 2,
      r: Math.min(cellW, cellH) * 0.3,
    };
  },

  update(dt, app) {
    this.hintT -= dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.parts.update(dt);
    this.texts.update(dt);

    // スポーン: スコアが上がるほど少し早く・複数同時に
    this.spawnT -= dt;
    const activeCount = this.holes.filter((h) => h.mole).length;
    const maxActive = Math.min(3, 1 + Math.floor(this.score / 12));
    if (this.spawnT <= 0 && activeCount < maxActive) {
      const free = this.holes.filter((h) => !h.mole && h.cooldown <= 0);
      if (free.length) {
        const hole = pick(free);
        this.spawned++;
        const roll = Math.random();
        const kind = roll < 0.12 && this.spawned > 4 ? 'gold'
          : roll > 0.82 && this.spawned > 6 ? 'spiky'
          : 'normal';
        hole.mole = {
          kind,
          up: 0,
          age: 0,
          bonkedT: 0,
          stayT: kind === 'gold' ? rand(1.0, 1.4) : rand(1.4, 2.4) * Math.max(0.55, 1 - this.score * 0.01),
        };
      }
      this.spawnT = rand(0.5, 1.1) * Math.max(0.5, 1 - this.score * 0.008);
    }

    for (let i = 0; i < this.holes.length; i++) {
      const hole = this.holes[i];
      hole.cooldown = Math.max(0, hole.cooldown - dt);
      const m = hole.mole;
      if (!m) continue;
      m.age += dt;

      if (m.bonkedT > 0) {
        // たたかれた後: 星を出しながら引っ込む
        m.bonkedT -= dt;
        m.up = Math.max(0, m.up - dt * 5);
        if (m.bonkedT <= 0) {
          hole.mole = null;
          hole.cooldown = rand(0.4, 1.0);
        }
        continue;
      }

      // 出る → とどまる → 引っ込む
      if (m.age < 0.25) m.up = Math.min(1, m.up + dt * 5);
      else if (m.age > 0.25 + m.stayT) {
        m.up -= dt * 4;
        if (m.up <= 0) {
          hole.mole = null;
          hole.cooldown = rand(0.3, 0.9);
        }
      }

      // 当たり判定（顔を出しているあいだだけ）
      if (m.up > 0.5 && m.age > 0.3) {
        const p = this._holePos(i, app);
        const hit = app.motionAt(p.x / app.W, (p.y - p.r * 0.4) / app.H, (p.r / app.W) * 0.9) > 0.45;
        if (hit) this._bonk(hole, m, p, app);
      }
    }
  },

  _bonk(hole, m, p, app) {
    m.bonkedT = 0.5;
    if (m.kind === 'spiky') {
      // トゲトゲは たたくと コンボが切れるだけ（ばつは かるく）
      this.combo = 0;
      app.audio.noise({ dur: 0.2, gain: 0.25, freq: 900 });
      this.texts.add(p.x, p.y - p.r, 'とげとげ！', '#8a8aff', Math.min(60, app.W * 0.04));
      this.parts.burst(p.x, p.y - p.r * 0.5, {
        count: 10, color: '#9a9aff', speed: 220, size: 5, life: 0.5,
      });
      return;
    }
    const pts = m.kind === 'gold' ? 3 : 1;
    this.score += pts;
    this.combo = Math.min(8, this.combo + 1);
    this.comboT = 2.5;
    app.audio.pop(0.7);
    app.audio.chime(this.combo);
    this.parts.burst(p.x, p.y - p.r * 0.6, {
      count: m.kind === 'gold' ? 30 : 16,
      color: m.kind === 'gold'
        ? () => `hsl(${rand(35, 60)}, 100%, ${rand(60, 80)}%)`
        : () => `hsl(${rand(20, 45)}, 80%, ${rand(55, 75)}%)`,
      speed: 300, size: 7, life: 0.8, gravity: 350,
    });
    if (m.kind === 'gold' || this.score % 10 === 0) {
      app.audio.fanfare();
      this.texts.add(p.x, p.y - p.r * 1.6, pick(PRAISE), '#ff9a3d', Math.min(80, app.W * 0.055));
    } else {
      this.texts.add(p.x, p.y - p.r * 1.3, `+${pts}`, '#fff', Math.min(50, app.W * 0.035));
    }
  },

  draw(g, app) {
    const { W, H, t } = app;
    // 背景: 空と草はら
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9fdcff');
    sky.addColorStop(0.45, '#d2f2c8');
    sky.addColorStop(1, '#7ec96a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // たいよう と くさ
    g.fillStyle = 'rgba(255, 225, 110, 0.95)';
    g.beginPath();
    g.arc(W * 0.9, H * 0.1, Math.min(W, H) * 0.06, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(70, 150, 60, 0.5)';
    for (let i = 0; i < 24; i++) {
      const gx = W * ((i * 0.171 + 0.02) % 1);
      const gy = H * (0.26 + ((i * 0.37) % 0.68));
      const gh = Math.min(W, H) * 0.02 * (1 + (i % 3) * 0.4);
      g.beginPath();
      g.ellipse(gx, gy, gh * 0.3, gh, Math.sin(t + i) * 0.15, 0, Math.PI * 2);
      g.fill();
    }

    for (let i = 0; i < this.holes.length; i++) {
      this._drawHole(g, this.holes[i], this._holePos(i, app), t);
    }

    this.parts.draw(g);
    this.texts.draw(g);

    // スコア
    g.font = `bold ${Math.min(64, W * 0.045)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    const label = `🐹 ${this.score}`;
    g.strokeText(label, W / 2, H * 0.03);
    g.fillStyle = '#7a4a1d';
    g.fillText(label, W / 2, H * 0.03);
    if (this.combo >= 3) {
      const cs = Math.min(36, W * 0.028);
      g.font = `bold ${cs}px ${FONT}`;
      g.lineWidth = cs * 0.22;
      g.strokeText(`${this.combo} れんぞく！`, W / 2, H * 0.03 + Math.min(64, W * 0.045) * 1.15);
      g.fillStyle = '#ff7c2a';
      g.fillText(`${this.combo} れんぞく！`, W / 2, H * 0.03 + Math.min(64, W * 0.045) * 1.15);
    }

    if (this.hintT > 0) {
      drawBanner(g, W, H, 'かおを だした もぐらを てで たたこう！（とげとげ に ちゅうい）', this.hintT);
    }
  },

  _drawHole(g, hole, p, t) {
    // あな
    g.fillStyle = '#4a2f18';
    g.beginPath();
    g.ellipse(p.x, p.y + p.r * 0.55, p.r * 1.05, p.r * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2b1a0c';
    g.beginPath();
    g.ellipse(p.x, p.y + p.r * 0.5, p.r * 0.9, p.r * 0.34, 0, 0, Math.PI * 2);
    g.fill();

    const m = hole.mole;
    if (m && m.up > 0.02) {
      // あなの中から出てくるようにクリップ
      g.save();
      g.beginPath();
      g.rect(p.x - p.r * 1.3, p.y + p.r * 0.55 - p.r * 3.2, p.r * 2.6, p.r * 3.2);
      g.clip();
      const rise = m.up * p.r * 1.5;
      const my = p.y + p.r * 0.55 - rise + Math.sin(t * 8) * (m.bonkedT > 0 ? 0 : 1.5);
      this._drawMole(g, m, p.x, my, p.r, t);
      g.restore();

      // たたかれた星
      if (m.bonkedT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * Math.PI * 2) / 3;
          const sx = p.x + Math.cos(a) * p.r * 0.9;
          const sy = p.y - p.r * 0.9 + Math.sin(a) * p.r * 0.3;
          g.fillStyle = '#ffe066';
          drawStar(g, sx, sy, p.r * 0.16, a);
          g.fill();
        }
      }
    }

    // あなのふち（手前側）
    g.fillStyle = '#5d3d1f';
    g.beginPath();
    g.ellipse(p.x, p.y + p.r * 0.62, p.r * 1.05, p.r * 0.3, 0, 0, Math.PI);
    g.fill();
  },

  _drawMole(g, m, x, y, r, t) {
    const body = m.kind === 'gold' ? '#e8b93a' : m.kind === 'spiky' ? '#7d7dd8' : '#96653a';
    const belly = m.kind === 'gold' ? '#ffe9a8' : m.kind === 'spiky' ? '#b9b9f0' : '#d9b285';
    const squash = m.bonkedT > 0 ? 0.72 : 1;

    // トゲ（spiky のみ）
    if (m.kind === 'spiky') {
      g.fillStyle = '#5c5cb8';
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.1 + (i / 6) * 0.8);
        const sx = x - Math.cos(a) * r * 0.85;
        const sy = y - r * 0.6 - Math.sin(a) * r * 0.85 * squash;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * r * 0.55, y - r * 0.6 - Math.sin(a) * r * 0.55 * squash);
        g.lineTo(sx, sy);
        g.lineTo(x - Math.cos(a + 0.25) * r * 0.55, y - r * 0.6 - Math.sin(a + 0.25) * r * 0.55 * squash);
        g.closePath();
        g.fill();
      }
    }

    // からだ
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(x, y - r * 0.55 * squash, r * 0.78, r * 0.95 * squash, 0, 0, Math.PI * 2);
    g.fill();
    // おなか
    g.fillStyle = belly;
    g.beginPath();
    g.ellipse(x, y - r * 0.35 * squash, r * 0.45, r * 0.55 * squash, 0, 0, Math.PI * 2);
    g.fill();
    // みみ
    g.fillStyle = body;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(x + s * r * 0.55, y - r * 1.25 * squash, r * 0.2, 0, Math.PI * 2);
      g.fill();
    }

    const ey = y - r * 0.85 * squash;
    if (m.bonkedT > 0) {
      // ×め
      g.strokeStyle = '#3a2410';
      g.lineWidth = Math.max(2, r * 0.07);
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        const cx = x + s * r * 0.3;
        g.beginPath();
        g.moveTo(cx - r * 0.1, ey - r * 0.1);
        g.lineTo(cx + r * 0.1, ey + r * 0.1);
        g.moveTo(cx + r * 0.1, ey - r * 0.1);
        g.lineTo(cx - r * 0.1, ey + r * 0.1);
        g.stroke();
      }
    } else {
      // め（きょろきょろ）
      const look = Math.sin(t * 1.7 + x) * r * 0.05;
      g.fillStyle = '#2a1a0a';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(x + s * r * 0.3 + look, ey, r * 0.11, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fff';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(x + s * r * 0.3 + look - r * 0.03, ey - r * 0.04, r * 0.04, 0, Math.PI * 2);
        g.fill();
      }
    }
    // はな と ほっぺ
    g.fillStyle = '#ff8a8a';
    g.beginPath();
    g.ellipse(x, ey + r * 0.22, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,130,130,0.45)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(x + s * r * 0.52, ey + r * 0.22, r * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  },
};
