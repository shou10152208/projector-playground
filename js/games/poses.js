import { Particles, FloatTexts, rand, pick, FONT, drawBanner } from '../fx.js';

// まねっこポーズ — おてほんと おなじ ポーズを とる あそび。
// からだにんしき（app.bodies）が つかえる ときだけ 判定できる。

const vis = (pt) => pt && pt.v > 0.4;

// 各ポーズ: label / おてほんの腕の位置(肩からの相対, 体スケール単位) / 判定関数
const POSES = [
  {
    id: 'up',
    label: 'りょうてを うえに！',
    arms: [[-0.5, -1.5], [0.5, -1.5]],
    check(b) {
      if (!vis(b.head) || !vis(b.lWrist) || !vis(b.rWrist)) return false;
      const m = b.shoulderW * 0.2;
      return b.lWrist.y < b.head.y - m && b.rWrist.y < b.head.y - m;
    },
  },
  {
    id: 'wide',
    label: 'りょうてを よこに ひろげて！',
    arms: [[-1.1, -0.05], [1.1, -0.05]],
    check(b) {
      if (!vis(b.lWrist) || !vis(b.rWrist) || !vis(b.lShoulder) || !vis(b.rShoulder)) return false;
      const midX = (b.lShoulder.x + b.rShoulder.x) / 2;
      const midY = (b.lShoulder.y + b.rShoulder.y) / 2;
      const xs = [b.lWrist.x - midX, b.rWrist.x - midX];
      const flatL = Math.abs(b.lWrist.y - midY) < b.shoulderW * 0.75;
      const flatR = Math.abs(b.rWrist.y - midY) < b.shoulderW * 0.75;
      return Math.min(...xs) < -b.shoulderW && Math.max(...xs) > b.shoulderW && flatL && flatR;
    },
  },
  {
    id: 'oneUp',
    label: 'かたてを ピン！と うえに',
    arms: [[-0.45, 0.55], [0.5, -1.5]],
    check(b) {
      if (!vis(b.head) || !vis(b.lWrist) || !vis(b.rWrist) || !vis(b.lShoulder) || !vis(b.rShoulder)) return false;
      const m = b.shoulderW * 0.2;
      const midY = (b.lShoulder.y + b.rShoulder.y) / 2;
      const lUp = b.lWrist.y < b.head.y - m;
      const rUp = b.rWrist.y < b.head.y - m;
      const lDown = b.lWrist.y > midY + b.shoulderW * 0.25;
      const rDown = b.rWrist.y > midY + b.shoulderW * 0.25;
      return (lUp && rDown) || (rUp && lDown);
    },
  },
  {
    id: 'head',
    label: 'てを あたまに のせて！',
    arms: [[-0.24, -1.28], [0.24, -1.28]],
    check(b) {
      if (!vis(b.head) || !vis(b.lWrist) || !vis(b.rWrist)) return false;
      const d = b.shoulderW * 0.85;
      const near = (w) => Math.hypot(w.x - b.head.x, w.y - b.head.y - b.shoulderW * 0.1) < d;
      return near(b.lWrist) && near(b.rWrist);
    },
  },
];

const HOLD_NEED = 0.9;   // このあいだ ポーズを キープで せいこう
const TIME_LIMIT = 12;   // 1ポーズの せいげん じかん

export const posesGame = {
  id: 'poses',
  label: 'まねっこ',
  emoji: '🤸',
  color: '#3dbf8a',

  init() {
    this.parts = new Particles(500);
    this.texts = new FloatTexts();
    this.score = 0;
    this.round = 0;
    this.state = 'show'; // show | play | success
    this.stateT = 0;
    this.holdT = 0;
    this.timeLeft = TIME_LIMIT;
    this.pose = pick(POSES);
    this.lastPoseId = this.pose.id;
    this.matchedCount = 0;
    this.noBodyT = 0;
  },

  _nextPose() {
    this.round++;
    let cand = POSES.filter((p) => p.id !== this.lastPoseId);
    this.pose = pick(cand);
    this.lastPoseId = this.pose.id;
    this.state = 'show';
    this.stateT = 0;
    this.holdT = 0;
    this.timeLeft = TIME_LIMIT;
  },

  update(dt, app) {
    this.parts.update(dt);
    this.texts.update(dt);
    this.stateT += dt;

    // からだが みえているか
    const bodies = app.bodies || [];
    if (bodies.length) this.noBodyT = 0;
    else this.noBodyT += dt;

    if (this.state === 'show') {
      if (this.stateT > 1.6) {
        this.state = 'play';
        this.stateT = 0;
        app.audio.tick();
      }
      return;
    }

    if (this.state === 'play') {
      // ポーズ判定は からだにんしき が ある ときだけ進む
      if (app.poseAvailable && app.poseAvailable()) {
        this.timeLeft -= dt;
        this.matchedCount = bodies.filter((b) => this.pose.check(b)).length;
        if (this.matchedCount > 0) {
          this.holdT += dt;
          if (this.holdT >= HOLD_NEED) this._success(app);
        } else {
          this.holdT = Math.max(0, this.holdT - dt * 1.5);
        }
        if (this.timeLeft <= 0 && this.state === 'play') {
          // しっぱいでは なく「つぎ いってみよう」
          this.texts.add(app.W / 2, app.H * 0.45, 'つぎ いってみよう！', '#8ad4ff', Math.min(70, app.W * 0.05));
          app.audio.tick();
          this._nextPose();
        }
      }
      return;
    }

    if (this.state === 'success' && this.stateT > 1.5) {
      this._nextPose();
    }
  },

  _success(app) {
    const bonus = this.matchedCount >= 2 ? 2 : 1;
    this.score += bonus;
    this.state = 'success';
    this.stateT = 0;
    app.audio.fanfare();
    const msg = this.matchedCount >= 2 ? 'みんな そろった！' : pick(['できたね！', 'かんぺき！', 'じょうず！']);
    this.texts.add(app.W / 2, app.H * 0.4, msg, '#ffb830', Math.min(90, app.W * 0.06));
    for (let i = 0; i < 5; i++) {
      this.parts.burst(rand(0.2, 0.8) * app.W, rand(0.25, 0.6) * app.H, {
        count: 16,
        color: () => `hsl(${rand(0, 360)}, 90%, 70%)`,
        speed: 320, size: 8, life: 1.0,
      });
    }
  },

  draw(g, app) {
    const { W, H, t } = app;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#d8f7e8');
    bg.addColorStop(1, '#a8e8d0');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // にんしき できない ときの ごあんない
    if (!(app.poseAvailable && app.poseAvailable())) {
      this._centerText(g, app, 'この あそびは カメラの「からだにんしき」が ひつよう だよ', H * 0.42, '#2a8a68');
      this._centerText(g, app, 'せってい で からだにんしき を ON に してね', H * 0.52, '#5aa88a', 0.7);
      return;
    }

    const S = Math.min(W, H);

    if (this.state === 'show') {
      // おてほんを おおきく
      const a = Math.min(1, this.stateT * 3);
      g.globalAlpha = a;
      this._centerText(g, app, this.pose.label, H * 0.16, '#1d7a58');
      this._drawFigure(g, W / 2, H * 0.58, S * 0.22, this.pose, t, '#1d7a58');
      g.globalAlpha = 1;
    } else if (this.state === 'play') {
      // おてほんは 左上に ちいさく、判定リングを 中央に
      this._centerText(g, app, this.pose.label, H * 0.12, '#1d7a58');
      this._drawFigure(g, S * 0.16, H * 0.33, S * 0.1, this.pose, t, '#1d7a58');

      // のこりじかん
      const ts = Math.max(22, S * 0.05);
      g.font = `bold ${ts}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = this.timeLeft < 4 ? '#e86a5a' : '#2a8a68';
      g.fillText(`${Math.ceil(this.timeLeft)}`, W - S * 0.12, H * 0.2);

      // ホールドの リング
      if (this.holdT > 0) {
        const prog = Math.min(1, this.holdT / HOLD_NEED);
        const rr = S * 0.13;
        g.save();
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = S * 0.02;
        g.beginPath();
        g.arc(W / 2, H * 0.55, rr, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = '#ffb830';
        g.lineCap = 'round';
        g.beginPath();
        g.arc(W / 2, H * 0.55, rr, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        g.stroke();
        g.restore();
        this._centerText(g, app, 'そのまま キープ！', H * 0.55, '#e88a2a', 0.9);
      }

      if (this.noBodyT > 1.5) {
        this._centerText(g, app, 'カメラの まえに たってね', H * 0.75, '#e86a5a');
      }
    } else if (this.state === 'success') {
      this._drawFigure(g, W / 2, H * 0.58, S * 0.22 * (1 + Math.sin(t * 10) * 0.03), this.pose, t, '#ffb830');
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
    const label = `🤸 ${this.score}`;
    g.strokeText(label, W / 2, H * 0.02);
    g.fillStyle = '#1d7a58';
    g.fillText(label, W / 2, H * 0.02);

    if (this.round === 0 && this.state !== 'success') {
      drawBanner(g, W, H, 'おてほんと おなじ ポーズを まねしてね！', 1);
    }
  },

  _centerText(g, app, text, y, color, alpha = 1) {
    const s = Math.max(20, Math.min(app.W * 0.04, 40));
    g.save();
    g.globalAlpha = alpha;
    g.font = `bold ${s}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = s * 0.28;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.strokeText(text, app.W / 2, y);
    g.fillStyle = color;
    g.fillText(text, app.W / 2, y);
    g.restore();
  },

  // おてほんの ぼうにんげん。s = 体スケール（肩の高さ基準）
  _drawFigure(g, x, y, s, pose, t, color) {
    const sway = Math.sin(t * 2) * s * 0.02;
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(4, s * 0.13);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const headY = y - s * 1.15;
    const shY = y - s * 0.72;   // かたの たかさ
    const hipY = y + s * 0.25;

    // あたま
    g.beginPath();
    g.arc(x + sway, headY, s * 0.3, 0, Math.PI * 2);
    g.fill();
    // どう
    g.beginPath();
    g.moveTo(x + sway, headY + s * 0.3);
    g.lineTo(x, hipY);
    g.stroke();
    // あし
    g.beginPath();
    g.moveTo(x, hipY);
    g.lineTo(x - s * 0.35, y + s * 1.0);
    g.moveTo(x, hipY);
    g.lineTo(x + s * 0.35, y + s * 1.0);
    g.stroke();
    // うで（ポーズごと）
    for (let i = 0; i < 2; i++) {
      const shX = x + (i === 0 ? -1 : 1) * s * 0.22;
      const [dx, dy] = pose.arms[i]; // 肩からの相対位置
      g.beginPath();
      g.moveTo(shX, shY);
      g.lineTo(x + dx * s, shY + dy * s);
      g.stroke();
      // て
      g.beginPath();
      g.arc(x + dx * s, shY + dy * s, s * 0.12, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  },
};
