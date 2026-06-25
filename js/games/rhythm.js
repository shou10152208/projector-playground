import { Particles, FloatTexts, rand, FONT } from '../fx.js';

// ---- Beat / onset detection (pure Web Audio, no external lib) ----

async function analyzeAudio(buffer) {
  const sr = buffer.sampleRate;
  const hop = Math.floor(sr * 0.01);       // 10ms hop
  const win = Math.floor(sr * 0.04);       // 40ms window
  const ch = buffer.getChannelData(0);
  const maxFrames = Math.floor((ch.length - win) / hop);

  // RMS energy per frame
  const energy = new Float32Array(maxFrames);
  for (let i = 0; i < maxFrames; i++) {
    let sum = 0;
    const off = i * hop;
    for (let j = off; j < off + win; j++) sum += ch[j] * ch[j];
    energy[i] = Math.sqrt(sum / win);
  }

  // Onset strength = positive flux
  const onset = new Float32Array(maxFrames);
  for (let i = 1; i < maxFrames; i++) {
    onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  }

  // Normalize
  let maxO = 0;
  for (let i = 0; i < maxFrames; i++) if (onset[i] > maxO) maxO = onset[i];
  if (maxO > 0) for (let i = 0; i < maxFrames; i++) onset[i] /= maxO;

  // Peak pick with adaptive threshold and min distance
  const minDistFrames = Math.floor(0.08 / (hop / sr)); // 80ms
  const threshold = 0.25;
  const peakTimes = [];
  const peakStrengths = [];

  for (let i = 1; i < maxFrames - 1; i++) {
    if (onset[i] >= threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
      const lastIdx = peakTimes.length - 1;
      if (lastIdx < 0 || i - Math.round(peakTimes[lastIdx] / (hop / sr)) >= minDistFrames) {
        peakTimes.push(i * hop / sr);
        peakStrengths.push(onset[i]);
      }
    }
  }

  // Estimate BPM via interval histogram
  let bpm = 120;
  if (peakTimes.length > 4) {
    const intervals = [];
    for (let i = 1; i < Math.min(peakTimes.length, 200); i++) {
      const iv = peakTimes[i] - peakTimes[i - 1];
      if (iv > 0.25 && iv < 2.0) intervals.push(iv);
    }
    // Histogram in 20ms bins
    const hist = {};
    for (const iv of intervals) {
      const key = Math.round(iv * 50) / 50;
      hist[key] = (hist[key] || 0) + 1;
    }
    const best = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    if (best) {
      const rawBpm = 60 / parseFloat(best[0]);
      // Normalize to 60-180 BPM range
      bpm = rawBpm;
      while (bpm < 60) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      bpm = Math.round(bpm);
    }
  }

  return { peakTimes, peakStrengths, bpm, duration: ch.length / sr };
}

function buildChart(peakTimes, peakStrengths, difficulty) {
  // Filter by strength threshold per difficulty
  const thresholds = { easy: 0.55, normal: 0.35, hard: 0.15 };
  const thresh = thresholds[difficulty];

  // Sort by strength descending, cap density
  const pairs = peakTimes.map((t, i) => ({ t, s: peakStrengths[i] }))
    .filter(p => p.s >= thresh)
    .sort((a, b) => b.s - a.s);

  // For easy: take top 30%, normal: 60%, hard: 100% of filtered
  const keepRatio = { easy: 0.3, normal: 0.6, hard: 1.0 };
  const keep = Math.ceil(pairs.length * keepRatio[difficulty]);
  const kept = pairs.slice(0, keep).sort((a, b) => a.t - b.t);

  // Assign lanes, avoid same lane twice in a row
  const notes = [];
  let lastLane = -1;
  for (const p of kept) {
    let lane;
    do { lane = Math.floor(Math.random() * 3); } while (lane === lastLane && Math.random() < 0.7);
    lastLane = lane;
    notes.push({ time: p.t, lane, strength: p.s });
  }
  return notes;
}

// ---- Judgment windows ----
const WINDOWS = { perfect: 0.09, good: 0.16 };
const LANE_COLORS = ['#ff5c8a', '#4db8ff', '#4ddb6e'];
const LANE_LABELS = ['ひだり', 'まんなか', 'みぎ'];
const FALL_SPEEDS = { easy: 280, normal: 400, hard: 560 };

// ---- Game ----

export const rhythmGame = {
  id: 'rhythm',
  label: 'リズム',
  emoji: '🎵',
  color: '#ff5c8a',

  init(app) {
    this.state = 'idle';
    this.parts = new Particles(800);
    this.texts = new FloatTexts();
    this.chart = null;
    this.audioBuffer = null;
    this.audioSource = null;
    this.startTime = 0;
    this.songTime = 0;
    this.duration = 0;
    this.bpm = 120;
    this.difficulty = 'normal';
    this.notes = [];
    this.notePool = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.goods = 0;
    this.misses = 0;
    this.countdown = 0;
    this.laneGlow = [0, 0, 0];
    this.laneHit = [0, 0, 0];
    this.beatFlash = 0;
    this.errorMsg = '';
    this._setupFileInput(app);
  },

  _setupFileInput(app) {
    let inp = document.getElementById('rhythm-file-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.id = 'rhythm-file-input';
      inp.type = 'file';
      inp.accept = 'audio/*';
      inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(inp);
    }
    this._fileInput = inp;
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      inp.value = '';
      await this._loadFile(file, app);
    };
  },

  async _loadFile(file, app) {
    this.state = 'loading';
    this.errorMsg = '';
    try {
      const arrayBuf = await file.arrayBuffer();
      app.audio.init();
      const audioBuf = await app.audio.ctx.decodeAudioData(arrayBuf);
      this.audioBuffer = audioBuf;
      const result = await analyzeAudio(audioBuf);
      this.bpm = result.bpm;
      this.duration = result.duration;
      this._analysisResult = result;
      this.state = 'difficulty';
    } catch (err) {
      this.errorMsg = 'ファイルを よみこめませんでした。MP3か WAVを えらんでね。';
      this.state = 'idle';
    }
  },

  _startGame(app) {
    const { peakTimes, peakStrengths } = this._analysisResult;
    this.chart = buildChart(peakTimes, peakStrengths, this.difficulty);
    this.notePool = this.chart.map(n => ({ ...n, hit: false, missed: false }));
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.goods = 0;
    this.misses = 0;
    this.laneGlow = [0, 0, 0];
    this.laneHit = [0, 0, 0];
    this.countdown = 3;
    this.state = 'countdown';
    this._countdownT = 0;
  },

  _playAudio(app) {
    if (this.audioSource) { try { this.audioSource.stop(); } catch {} }
    const src = app.audio.ctx.createBufferSource();
    src.buffer = this.audioBuffer;
    src.connect(app.audio.master);
    src.start(0);
    this.audioSource = src;
    this.startTime = app.audio.ctx.currentTime;
  },

  update(dt, app) {
    this.parts.update(dt);
    this.texts.update(dt);
    for (let i = 0; i < 3; i++) {
      this.laneGlow[i] = Math.max(0, this.laneGlow[i] - dt * 4);
      this.laneHit[i] = Math.max(0, this.laneHit[i] - dt * 6);
    }
    this.beatFlash = Math.max(0, this.beatFlash - dt * 5);

    if (this.state === 'countdown') {
      this._countdownT += dt;
      if (this._countdownT >= 1) {
        this._countdownT -= 1;
        this.countdown--;
        if (this.countdown <= 0) {
          this.state = 'playing';
          this._playAudio(app);
        }
      }
    }

    if (this.state === 'playing') {
      this.songTime = app.audio.ctx.currentTime - this.startTime;

      // Beat flash
      const beatLen = 60 / this.bpm;
      const beatPhase = (this.songTime % beatLen) / beatLen;
      if (beatPhase < 0.05) this.beatFlash = 0.4;

      // Lane motion detection
      const { W, H } = app;
      const hitZoneY = H * 0.82;
      const laneXs = [W * 0.2, W * 0.5, W * 0.8];
      for (let i = 0; i < 3; i++) {
        const m = app.motionAt(laneXs[i] / W, hitZoneY / H, 0.13);
        if (m > 0.3) {
          this.laneGlow[i] = Math.min(1, this.laneGlow[i] + dt * 10);
          this._tryJudge(i, app);
        }
      }

      // Mark misses for notes past window
      for (const n of this.notePool) {
        if (!n.hit && !n.missed && this.songTime > n.time + WINDOWS.good) {
          n.missed = true;
          this.combo = 0;
          this.misses++;
        }
      }

      // End when song finishes
      if (this.songTime >= this.duration + 2) {
        this.state = 'result';
        if (this.audioSource) try { this.audioSource.stop(); } catch {}
      }
    }
  },

  _tryJudge(lane, app) {
    const { W, H } = app;
    const laneXs = [W * 0.2, W * 0.5, W * 0.8];

    for (const n of this.notePool) {
      if (n.hit || n.missed || n.lane !== lane) continue;
      const diff = Math.abs(this.songTime - n.time);
      if (diff <= WINDOWS.perfect) {
        n.hit = true;
        this.combo++;
        this.perfects++;
        this.score += Math.floor(1000 * (1 + this.combo * 0.1));
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.laneHit[lane] = 1;
        this.texts.add(laneXs[lane], H * 0.7, 'PERFECT！', '#ffe066', 44);
        this.parts.burst(laneXs[lane], H * 0.82, { count: 22, color: LANE_COLORS[lane], speed: 380, size: 9, life: 0.8 });
        app.audio.chime(Math.floor(this.perfects % 8));
        return;
      } else if (diff <= WINDOWS.good) {
        n.hit = true;
        this.combo++;
        this.goods++;
        this.score += Math.floor(500 * (1 + this.combo * 0.05));
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.laneHit[lane] = 0.6;
        this.texts.add(laneXs[lane], H * 0.7, 'GOOD', '#aef', 36);
        this.parts.burst(laneXs[lane], H * 0.82, { count: 10, color: '#aef', speed: 220, size: 7, life: 0.6 });
        return;
      }
    }
  },

  draw(g, app) {
    const { W, H } = app;
    g.fillStyle = '#0d0d1a';
    g.fillRect(0, 0, W, H);

    if (this.state === 'idle') this._drawIdle(g, app);
    else if (this.state === 'loading') this._drawLoading(g, app);
    else if (this.state === 'difficulty') this._drawDifficulty(g, app);
    else if (this.state === 'countdown') this._drawCountdown(g, app);
    else if (this.state === 'playing') this._drawPlaying(g, app);
    else if (this.state === 'result') this._drawResult(g, app);
  },

  _drawIdle(g, app) {
    const { W, H, t } = app;

    const titleSize = Math.min(W * 0.07, H * 0.1);
    g.font = `bold ${titleSize}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = titleSize * 0.2;
    g.strokeStyle = '#fff';
    g.strokeText('🎵 リズムゲーム', W / 2, H * 0.22);
    g.fillStyle = '#ff5c8a';
    g.fillText('🎵 リズムゲーム', W / 2, H * 0.22);

    const sub = Math.max(18, Math.min(W * 0.035, 28));
    g.font = `bold ${sub}px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillText('おんがくファイルを えらんでね（MP3・WAV）', W / 2, H * 0.36);

    // Upload button
    const bw = Math.min(W * 0.45, 280);
    const bh = Math.min(H * 0.1, 64);
    const bx = W / 2 - bw / 2;
    const by = H * 0.46;
    const pulse = 1 + Math.sin(t * 2.5) * 0.03;

    g.save();
    g.translate(W / 2, by + bh / 2);
    g.scale(pulse, pulse);
    g.shadowColor = '#ff5c8a';
    g.shadowBlur = 24;
    g.fillStyle = '#ff5c8a';
    g.beginPath();
    g.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    g.fill();
    g.restore();

    g.font = `bold ${Math.max(18, bh * 0.38)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('📂 ファイルを えらぶ', W / 2, by + bh / 2);

    this._uploadBtnRect = { x: bx, y: by, w: bw, h: bh };

    if (this.errorMsg) {
      g.font = `bold ${Math.max(15, sub * 0.85)}px ${FONT}`;
      g.fillStyle = '#ff8a8a';
      g.fillText(this.errorMsg, W / 2, H * 0.64);
    }

    const hint = Math.max(14, Math.min(W * 0.028, 22));
    g.font = `${hint}px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillText('クリックまたは タッチで ファイルを えらべます', W / 2, H * 0.78);
  },

  _drawLoading(g, app) {
    const { W, H, t } = app;
    g.font = `bold ${Math.min(W * 0.055, 40)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('ビートを かぞえてるよ…', W / 2, H * 0.45);

    // Spinner
    g.save();
    g.translate(W / 2, H * 0.6);
    g.rotate(t * 3);
    for (let i = 0; i < 8; i++) {
      g.globalAlpha = (i + 1) / 8;
      g.fillStyle = '#ff5c8a';
      g.beginPath();
      g.arc(0, -28, 7, 0, Math.PI * 2);
      g.fill();
      g.rotate(Math.PI / 4);
    }
    g.restore();
    g.globalAlpha = 1;
  },

  _drawDifficulty(g, app) {
    const { W, H, t } = app;

    const ts = Math.min(W * 0.06, H * 0.09);
    g.font = `bold ${ts}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = ts * 0.2;
    g.strokeStyle = '#fff';
    g.strokeText('むずかしさを えらんでね', W / 2, H * 0.2);
    g.fillStyle = '#ff5c8a';
    g.fillText('むずかしさを えらんでね', W / 2, H * 0.2);

    const info = Math.max(16, Math.min(W * 0.03, 22));
    g.font = `${info}px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`BPM: ${this.bpm}　ながさ: ${Math.floor(this.duration / 60)}ふん${Math.floor(this.duration % 60)}びょう`, W / 2, H * 0.32);

    const diffs = [
      { id: 'easy',   label: 'かんたん', emoji: '⭐',    color: '#4ddb6e', desc: 'のんびり あそべる' },
      { id: 'normal', label: 'ふつう',   emoji: '⭐⭐',  color: '#4db8ff', desc: 'ちょうどいい' },
      { id: 'hard',   label: 'むずかしい', emoji: '⭐⭐⭐', color: '#ff5c8a', desc: 'つわものむけ' },
    ];

    const bw = Math.min(W * 0.26, 160);
    const bh = Math.min(H * 0.18, 110);
    const gap = Math.min(W * 0.04, 20);
    const totalW = diffs.length * bw + (diffs.length - 1) * gap;
    const sx = (W - totalW) / 2;
    const sy = H * 0.42;

    this._diffBtns = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      const bx = sx + i * (bw + gap);
      const active = this.difficulty === d.id;
      const bob = Math.sin(t * 1.5 + i * 1.2) * 4;

      g.save();
      g.shadowColor = d.color;
      g.shadowBlur = active ? 30 : 10;
      g.fillStyle = active ? d.color : 'rgba(255,255,255,0.12)';
      g.strokeStyle = d.color;
      g.lineWidth = active ? 3 : 1.5;
      g.beginPath();
      g.roundRect(bx, sy + bob, bw, bh, 16);
      g.fill();
      g.stroke();
      g.restore();

      const es = Math.max(28, bh * 0.28);
      g.font = `${es}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(d.emoji, bx + bw / 2, sy + bob + bh * 0.3);

      const ls = Math.max(16, bh * 0.2);
      g.font = `bold ${ls}px ${FONT}`;
      g.fillStyle = '#fff';
      g.fillText(d.label, bx + bw / 2, sy + bob + bh * 0.58);

      const ds = Math.max(12, bh * 0.14);
      g.font = `${ds}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(d.desc, bx + bw / 2, sy + bob + bh * 0.78);

      this._diffBtns.push({ id: d.id, x: bx, y: sy, w: bw, h: bh + 10 });
    }

    // Start button
    const sbw = Math.min(W * 0.38, 220);
    const sbh = Math.min(H * 0.09, 56);
    const sbx = W / 2 - sbw / 2;
    const sby = H * 0.74;
    const pulse = 1 + Math.sin(t * 2.8) * 0.025;

    g.save();
    g.translate(W / 2, sby + sbh / 2);
    g.scale(pulse, pulse);
    g.shadowColor = '#ff5c8a';
    g.shadowBlur = 28;
    g.fillStyle = '#ff5c8a';
    g.beginPath();
    g.roundRect(-sbw / 2, -sbh / 2, sbw, sbh, sbh / 2);
    g.fill();
    g.restore();

    g.font = `bold ${Math.max(18, sbh * 0.42)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('▶ スタート！', W / 2, sby + sbh / 2);
    this._startBtn = { x: sbx, y: sby, w: sbw, h: sbh };
  },

  _drawCountdown(g, app) {
    const { W, H, t } = app;
    const n = this.countdown;
    const scale = 1 + (1 - this._countdownT) * 0.5;
    const alpha = Math.min(1, this._countdownT * 3);

    g.save();
    g.globalAlpha = alpha;
    g.translate(W / 2, H / 2);
    g.scale(scale, scale);
    const fs = Math.min(W, H) * 0.35;
    g.font = `bold ${fs}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = fs * 0.15;
    g.strokeStyle = '#fff';
    g.strokeText(n > 0 ? String(n) : 'GO！', 0, 0);
    g.fillStyle = n > 0 ? '#ff5c8a' : '#4ddb6e';
    g.fillText(n > 0 ? String(n) : 'GO！', 0, 0);
    g.restore();
  },

  _drawPlaying(g, app) {
    const { W, H, t } = app;
    const laneXs = [W * 0.2, W * 0.5, W * 0.8];
    const laneW = W * 0.22;
    const hitY = H * 0.82;
    const noteR = Math.min(W * 0.06, 36);
    const speed = FALL_SPEEDS[this.difficulty];

    // Beat flash background
    if (this.beatFlash > 0) {
      g.globalAlpha = this.beatFlash * 0.12;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    // Lane tracks
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.12 + this.laneGlow[i] * 0.2;
      g.fillStyle = LANE_COLORS[i];
      g.fillRect(laneXs[i] - laneW / 2, 0, laneW, H);
      g.globalAlpha = 1;
    }

    // Hit zone
    for (let i = 0; i < 3; i++) {
      const gl = this.laneHit[i];
      g.save();
      g.shadowColor = LANE_COLORS[i];
      g.shadowBlur = 20 + gl * 40;
      g.strokeStyle = LANE_COLORS[i];
      g.lineWidth = 3 + gl * 3;
      g.globalAlpha = 0.5 + gl * 0.5;
      g.beginPath();
      g.arc(laneXs[i], hitY, noteR * 1.3, 0, Math.PI * 2);
      g.stroke();
      g.restore();

      // Lane label
      const ls = Math.max(13, noteR * 0.45);
      g.font = `bold ${ls}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = LANE_COLORS[i];
      g.globalAlpha = 0.7;
      g.fillText(LANE_LABELS[i], laneXs[i], hitY + noteR * 2);
      g.globalAlpha = 1;
    }

    // Notes
    for (const n of this.notePool) {
      if (n.hit || n.missed) continue;
      const timeTillHit = n.time - this.songTime;
      if (timeTillHit > H / speed + 0.3) continue;
      const y = hitY - timeTillHit * speed;
      if (y < -noteR * 2) continue;

      const col = LANE_COLORS[n.lane];
      const x = laneXs[n.lane];
      g.save();
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, noteR, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 3;
      g.stroke();
      g.restore();

      // Inner glow
      g.globalAlpha = 0.5;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x - noteR * 0.28, y - noteR * 0.28, noteR * 0.3, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    this.parts.draw(g);
    this.texts.draw(g);

    // HUD
    this._drawHUD(g, app);
  },

  _drawHUD(g, app) {
    const { W, H } = app;
    // Score
    const ss = Math.max(20, Math.min(W * 0.045, 36));
    g.font = `bold ${ss}px ${FONT}`;
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    g.lineWidth = ss * 0.22;
    g.strokeStyle = '#000';
    g.strokeText(`${this.score.toLocaleString()}`, W - 16, 14);
    g.fillStyle = '#ffe066';
    g.fillText(`${this.score.toLocaleString()}`, W - 16, 14);

    // Combo
    if (this.combo >= 3) {
      const cs = Math.max(16, Math.min(W * 0.035, 28));
      g.font = `bold ${cs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.strokeText(`${this.combo} COMBO`, W / 2, 14);
      g.fillStyle = '#ff5c8a';
      g.fillText(`${this.combo} COMBO`, W / 2, 14);
    }

    // Progress bar
    const prog = Math.min(1, this.songTime / this.duration);
    const bh = 6;
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, H - bh, W, bh);
    g.fillStyle = '#ff5c8a';
    g.fillRect(0, H - bh, W * prog, bh);
  },

  _drawResult(g, app) {
    const { W, H, t } = app;
    this.parts.draw(g);

    const total = this.perfects + this.goods + this.misses;
    const acc = total > 0 ? Math.round(((this.perfects + this.goods * 0.5) / total) * 100) : 0;
    const rank = acc >= 95 ? 'S' : acc >= 80 ? 'A' : acc >= 60 ? 'B' : 'C';
    const rankColors = { S: '#ffe066', A: '#4db8ff', B: '#4ddb6e', C: '#aaa' };

    const ts = Math.min(W * 0.065, H * 0.1);
    g.font = `bold ${ts}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = ts * 0.2;
    g.strokeStyle = '#fff';
    g.strokeText('リザルト', W / 2, H * 0.13);
    g.fillStyle = '#ff5c8a';
    g.fillText('リザルト', W / 2, H * 0.13);

    // Rank
    const rs = Math.min(W * 0.18, H * 0.22);
    const rankBob = Math.sin(t * 2) * 5;
    g.font = `bold ${rs}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = '#fff';
    g.lineWidth = rs * 0.1;
    g.strokeText(rank, W / 2, H * 0.33 + rankBob);
    g.fillStyle = rankColors[rank];
    g.fillText(rank, W / 2, H * 0.33 + rankBob);

    const ss = Math.max(16, Math.min(W * 0.038, 28));
    const lines = [
      `スコア: ${this.score.toLocaleString()}`,
      `PERFECT: ${this.perfects}　GOOD: ${this.goods}　MISS: ${this.misses}`,
      `さいこうコンボ: ${this.maxCombo}　せいかくさ: ${acc}%`,
    ];
    g.font = `bold ${ss}px ${FONT}`;
    g.fillStyle = '#fff';
    for (let i = 0; i < lines.length; i++) {
      g.fillText(lines[i], W / 2, H * 0.53 + i * ss * 1.8);
    }

    // Retry button
    const bw = Math.min(W * 0.38, 220);
    const bh = Math.min(H * 0.09, 52);
    const bx = W / 2 - bw / 2;
    const by = H * 0.74;
    const pulse = 1 + Math.sin(t * 2.5) * 0.025;
    g.save();
    g.translate(W / 2, by + bh / 2);
    g.scale(pulse, pulse);
    g.shadowColor = '#4db8ff';
    g.shadowBlur = 24;
    g.fillStyle = '#4db8ff';
    g.beginPath();
    g.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    g.fill();
    g.restore();
    g.font = `bold ${Math.max(17, bh * 0.4)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('もう いっかい', W / 2, by + bh / 2);
    this._retryBtn = { x: bx, y: by, w: bw, h: bh };

    if (acc >= 95) {
      this.parts.burst(W / 2, H / 2, { count: 4, color: () => `hsl(${Math.random() * 360},90%,70%)`, speed: 220, size: 7, life: 1.2 });
    }
  },

  handlePointer(px, py, app) {
    if (this.state === 'idle') {
      const b = this._uploadBtnRect;
      if (b && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        this._fileInput.click();
      }
    } else if (this.state === 'difficulty') {
      if (this._diffBtns) {
        for (const d of this._diffBtns) {
          if (px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h) {
            this.difficulty = d.id;
          }
        }
      }
      const sb = this._startBtn;
      if (sb && px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) {
        this._startGame(app);
      }
    } else if (this.state === 'result') {
      const rb = this._retryBtn;
      if (rb && px >= rb.x && px <= rb.x + rb.w && py >= rb.y && py <= rb.y + rb.h) {
        this.state = 'difficulty';
      }
    }
  },
};
