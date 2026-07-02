import { MotionDetector } from './motion.js';
import { PoseInput, LM } from './pose.js';
import { audio } from './audio.js';
import { FONT } from './fx.js';
import { bubblesGame } from './games/bubbles.js';
import { starsGame } from './games/stars.js';
import { flowersGame } from './games/flowers.js';
import { musicGame } from './games/music.js';
import { rhythmGame } from './games/rhythm.js';
import { molesGame } from './games/moles.js';
import { posesGame } from './games/poses.js';

const GAMES = [bubblesGame, starsGame, molesGame, flowersGame, musicGame, posesGame, rhythmGame];
const HOLD_TIME = 1.3;
const BACK_HOLD = 1.6;

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const video = document.getElementById('cam');
const motion = new MotionDetector();

// 動き検出の入力源。通常はカメラ映像、テスト時(?fakecam)は合成映像。
const params = new URLSearchParams(location.search);
const fakeCam = params.has('fakecam');
let camSource = video;
let fakeCanvas = null;

function setupFakeCam() {
  fakeCanvas = document.createElement('canvas');
  fakeCanvas.width = 640;
  fakeCanvas.height = 480;
  fakeCanvas.readyState = 4; // motion.update / drawPreview の readyState チェック用
  camSource = fakeCanvas;
}

function drawFakeCam() {
  const c = fakeCanvas.getContext('2d');
  c.fillStyle = '#202830';
  c.fillRect(0, 0, 640, 480);
  c.fillStyle = '#e8d0b0';
  for (let i = 0; i < 2; i++) {
    const x = 320 + Math.sin(app.t * 1.7 + i * 2) * 250;
    const y = 240 + Math.cos(app.t * 2.3 + i * 3) * 170;
    c.beginPath();
    c.arc(x, y, 55, 0, Math.PI * 2);
    c.fill();
  }
}

const app = {
  W: 0,
  H: 0,
  t: 0,
  audio,
  motionAt: (nx, ny, r) => bodyGatedMotion(nx, ny, r),
  hands: [],                    // 認識中の手カーソル [{x,y,body}]（スクリーンpx・鏡映済み）
  bodies: [],                   // 名前付きランドマーク [{head,lWrist,rWrist,lShoulder,rShoulder,lHip,rHip,shoulderW}]
  handsActive: () => handsActive(),
  poseAvailable: () => !!pose && poseOn,
};

// ---- 人体認識（ポーズ） ----
// カメラ映像から人のランドマークを取り、(1) 手の位置でメニューを選べるようにし、
// (2) 「動き」を人体の近くだけに限定して、影や光などの誤反応を防ぐ。
let pose = null;              // PoseInput（初期化成功時のみ）
let poseOn = true;            // 設定のトグル
let bodies = [];              // 今フレームの人体 [{points:[{nx,ny,v}], hands:[{x,y}]}]
let lastBodyT = -10;          // 最後に人体が見えた時刻（app.t）
let everSawBody = false;      // 一度でも人体を認識できたか（できない環境ではゲートしない）
const handSmooth = new Map(); // "体idx:手idx" -> {x,y} 手カーソルの平滑化

async function tryPose() {
  if (fakeCam || pose) return; // テスト用合成映像ではポーズ認識を使わない
  try {
    const p = new PoseInput(video);
    await p.init(2);
    pose = p;
  } catch (err) {
    console.warn('[pose] 人体認識は無効（うごき検出のみで動作します）:', err);
  }
}

function handsActive() {
  return !!pose && poseOn && app.t - lastBodyT < 1.0;
}

function updateBodies(now) {
  bodies = [];
  app.hands = [];
  app.bodies = [];
  if (!pose || !poseOn) return;
  const all = pose.detect(now);
  if (all && all.length) {
    for (let bi = 0; bi < all.length; bi++) {
      const lm = all[bi];
      if (!lm || lm.length < 25) continue;
      // 鏡映（自分が見たままの左右）で正規化座標に
      const points = lm.map((p) => ({ nx: 1 - p.x, ny: p.y, v: p.visibility ?? 1 }));
      const hands = [];
      [LM.L_WRIST, LM.R_WRIST].forEach((li, hi) => {
        const pt = points[li];
        const key = `${bi}:${hi}`;
        if (pt.v < 0.4) {
          handSmooth.delete(key);
          return;
        }
        const tx = pt.nx * app.W;
        const ty = pt.ny * app.H;
        let s = handSmooth.get(key);
        if (!s) {
          s = { x: tx, y: ty };
          handSmooth.set(key, s);
        }
        s.x += (tx - s.x) * 0.55;
        s.y += (ty - s.y) * 0.55;
        hands.push({ x: s.x, y: s.y });
      });
      bodies.push({ points, hands });
      for (const h of hands) app.hands.push({ x: h.x, y: h.y, body: bi });

      // ゲーム用の名前付きランドマーク（まねっこポーズ等が使う）
      const named = (li) => {
        const pt = points[li];
        return { x: pt.nx * app.W, y: pt.ny * app.H, v: pt.v };
      };
      const lSh = named(LM.L_SHOULDER);
      const rSh = named(LM.R_SHOULDER);
      app.bodies.push({
        head: named(LM.NOSE),
        lWrist: named(LM.L_WRIST),
        rWrist: named(LM.R_WRIST),
        lShoulder: lSh,
        rShoulder: rSh,
        lHip: named(LM.L_HIP),
        rHip: named(LM.R_HIP),
        shoulderW: Math.max(30, Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y)),
      });
    }
  }
  if (bodies.length) {
    lastBodyT = app.t;
    everSawBody = true;
  }
}

// ポーズ認識が使えるときは、人体ランドマークの近くで起きた動きだけを有効にする。
// 使えないとき（初期化失敗・トグルOFF・fakecam）は従来どおり生の動きを返す。
function bodyGatedMotion(nx, ny, r) {
  const m = motion.motionAt(nx, ny, r);
  if (!pose || !poseOn || m <= 0) return m;
  // この環境で一度も人体を認識できていないなら、ゲートせず従来動作を保つ
  // （カメラの画角や照明で認識できない場合に遊べなくなるのを防ぐ）
  if (!everSawBody) return m;
  if (app.t - lastBodyT > 1.0) return 0; // 誰も見えていない間の動きはノイズ扱い
  if (!bodies.length) return m;          // 一瞬の見失い（1秒未満）は素通し
  const th = Math.max(r * app.W * 1.6, Math.min(app.W, app.H) * 0.16);
  const th2 = th * th;
  for (const b of bodies) {
    for (const pt of b.points) {
      if (pt.v < 0.3) continue;
      const dx = (pt.nx - nx) * app.W;
      const dy = (pt.ny - ny) * app.H;
      if (dx * dx + dy * dy < th2) return m;
    }
  }
  return 0;
}

const HAND_CURSOR_COLORS = ['255,111,165', '77,184,255', '255,210,63', '124,255,107'];

function drawHandCursors() {
  for (const hd of app.hands) {
    const c = HAND_CURSOR_COLORS[hd.body % HAND_CURSOR_COLORS.length];
    const r = Math.min(app.W, app.H) * 0.03;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const grad = g.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, r * 2.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.35, `rgba(${c},0.55)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(hd.x, hd.y, r * 2.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${c},0.9)`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(hd.x, hd.y, r * 0.75, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

let state = 'menu';
let current = null;
let stream = null;
let previewOn = false;
let running = false;
const holds = new Map();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  app.W = window.innerWidth;
  app.H = window.innerHeight;
  canvas.width = app.W * dpr;
  canvas.height = app.H * dpr;
  canvas.style.width = `${app.W}px`;
  canvas.style.height = `${app.H}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---- 動きで押すボタン（しばらく手をかざすと決定） ----

function menuButtons() {
  const { W, H } = app;
  // ゲーム数に応じて 2 行に割り付ける（例: 7個 → 4 + 3）
  const n = GAMES.length;
  const cols0 = Math.ceil(n / 2);
  const r = Math.min((W * 0.82) / (cols0 * 2.6), H * 0.115);
  const gap = Math.min(r * 2.7, (W - r * 2) / Math.max(1, cols0 - 1));
  return GAMES.map((game, i) => {
    const row = i < cols0 ? 0 : 1;
    const col = i < cols0 ? i : i - cols0;
    const totalInRow = row === 0 ? cols0 : n - cols0;
    const rowX = W / 2 + (col - (totalInRow - 1) / 2) * gap;
    const rowY = H * 0.44 + row * (r * 2.7);
    return {
      id: game.id,
      game,
      r,
      x: rowX,
      y: rowY + Math.sin(app.t * 1.4 + i * 2.1) * H * 0.01,
    };
  });
}

function backButton() {
  const r = Math.min(app.W, app.H) * 0.06;
  return { id: 'back', x: r * 1.4, y: r * 1.4, r };
}

function updateHold(btn, dt, holdTime, onComplete) {
  // 人体認識中: 手カーソルをボタンにかざしている間たまる（誤反応しない）。
  // それ以外: ボタン位置の「動き」でたまる（従来どおり）。
  let engaged;
  if (handsActive()) {
    engaged = app.hands.some(
      (hd) => (hd.x - btn.x) ** 2 + (hd.y - btn.y) ** 2 <= (btn.r * 1.15) ** 2
    );
  } else {
    engaged = app.motionAt(btn.x / app.W, btn.y / app.H, (btn.r / app.W) * 0.8) > 0.35;
  }
  let h = holds.get(btn.id) || 0;
  const before = h;
  if (engaged) h += dt;
  else h = Math.max(0, h - dt * 2);
  if (before < holdTime * 0.3 && h >= holdTime * 0.3) audio.tick();
  if (before < holdTime * 0.7 && h >= holdTime * 0.7) audio.tick();
  if (h >= holdTime) {
    holds.set(btn.id, 0);
    onComplete();
    return 1;
  }
  holds.set(btn.id, h);
  return h / holdTime;
}

function drawHoldRing(x, y, r, progress, color) {
  if (progress <= 0) return;
  g.strokeStyle = color;
  g.lineWidth = Math.max(5, r * 0.09);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r + g.lineWidth, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  g.stroke();
}

// ---- メニュー ----

function menuFrame(dt) {
  const { W, H, t } = app;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fff3c4');
  bg.addColorStop(1, '#ffd9e8');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 14; i++) {
    const x = W * ((i * 0.137 + 0.07) % 1);
    const y = H * ((i * 0.617 + 0.13) % 1) + Math.sin(t * 0.8 + i) * 18;
    g.fillStyle = `hsla(${(i * 47) % 360}, 85%, 82%, 0.4)`;
    g.beginPath();
    g.arc(x, y, Math.min(W, H) * (0.02 + (i % 4) * 0.012), 0, Math.PI * 2);
    g.fill();
  }

  const titleSize = Math.min(W * 0.08, H * 0.13);
  g.font = `bold ${titleSize}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = titleSize * 0.22;
  g.strokeStyle = '#fff';
  const ty = H * 0.17 + Math.sin(t * 2) * 6;
  g.strokeText('からだで あそぼ！', W / 2, ty);
  g.fillStyle = '#ff6fa5';
  g.fillText('からだで あそぼ！', W / 2, ty);

  const subSize = Math.max(20, titleSize * 0.3);
  g.font = `bold ${subSize}px ${FONT}`;
  g.fillStyle = '#8a6d4f';
  const subMsg = handsActive()
    ? 'あそびたい えに てを かざしてね'
    : 'あそびたい えの まえで てを ふってね';
  g.fillText(subMsg, W / 2, H * 0.31);

  for (const btn of menuButtons()) {
    const progress = updateHold(btn, dt, HOLD_TIME, () => startGame(btn.game));

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.18)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 10;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.font = `${btn.r * 0.95}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(btn.game.emoji, btn.x, btn.y + btn.r * 0.05);

    const ls = Math.max(20, btn.r * 0.3);
    g.font = `bold ${ls}px ${FONT}`;
    g.lineWidth = ls * 0.25;
    g.strokeStyle = '#fff';
    g.strokeText(btn.game.label, btn.x, btn.y + btn.r + ls * 1.1);
    g.fillStyle = btn.game.color;
    g.fillText(btn.game.label, btn.x, btn.y + btn.r + ls * 1.1);

    if (progress > 0 && progress < 1) {
      drawHoldRing(btn.x, btn.y, btn.r, progress, btn.game.color);
    }
  }
}

// ---- ゲーム中（もどるボタン付き） ----

function gameFrame(dt) {
  current.update(dt, app);
  current.draw(g, app);

  const btn = backButton();
  const progress = updateHold(btn, dt, BACK_HOLD, backToMenu);
  g.save();
  g.globalAlpha = 0.85;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.font = `${btn.r * 0.8}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🏠', btn.x, btn.y + btn.r * 0.05);
  const ls = Math.max(14, btn.r * 0.32);
  g.font = `bold ${ls}px ${FONT}`;
  g.lineJoin = 'round';
  g.lineWidth = ls * 0.25;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.strokeText('もどる', btn.x, btn.y + btn.r + ls);
  g.fillStyle = '#666';
  g.fillText('もどる', btn.x, btn.y + btn.r + ls);
  if (progress > 0 && progress < 1) {
    drawHoldRing(btn.x, btn.y, btn.r, progress, '#ff6fa5');
  }
  g.restore();
}

function startGame(game) {
  audio.select();
  holds.clear();
  current = game;
  current.init(app);
  state = 'game';
}

function backToMenu() {
  audio.select();
  holds.clear();
  // ゲーム側の後片付け（リズムゲームのファイル入力・曲再生の停止など）
  if (current && current.dispose) current.dispose(app);
  current = null;
  state = 'menu';
}

// ---- 入力（マウス / タッチ / キーボードでも操作できる） ----

canvas.addEventListener('pointerdown', (e) => {
  const x = e.clientX;
  const y = e.clientY;
  if (state === 'menu') {
    for (const btn of menuButtons()) {
      if ((x - btn.x) ** 2 + (y - btn.y) ** 2 <= btn.r ** 2) {
        startGame(btn.game);
        return;
      }
    }
  } else {
    const btn = backButton();
    if ((x - btn.x) ** 2 + (y - btn.y) ** 2 <= btn.r ** 2) {
      backToMenu();
      return;
    }
    if (current && current.handlePointer) current.handlePointer(x, y, app);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state === 'game') backToMenu();
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  const n = parseInt(e.key, 10);
  if (state === 'menu' && n >= 1 && n <= GAMES.length) startGame(GAMES[n - 1]);
});

// ---- カメラ ----

async function startCamera(deviceId) {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

const cameraSelect = document.getElementById('camera-select');

async function populateCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `カメラ ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
    const currentId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
    if (currentId) cameraSelect.value = currentId;
  } catch {
    // 一覧が取れなくても既定のカメラで遊べる
  }
}

cameraSelect.addEventListener('change', () => {
  startCamera(cameraSelect.value).catch(() => {});
});

// ---- せってい ----

const settingsPanel = document.getElementById('settings');
const gearBtn = document.getElementById('gear-btn');

gearBtn.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});
document.getElementById('close-settings').addEventListener('click', () => {
  settingsPanel.hidden = true;
});
document.getElementById('sensitivity').addEventListener('input', (e) => {
  motion.setSensitivity(e.target.value / 100);
});
document.getElementById('preview-toggle').addEventListener('change', (e) => {
  previewOn = e.target.checked;
});
document.getElementById('pose-toggle').addEventListener('change', (e) => {
  poseOn = e.target.checked;
});
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

function drawPreview() {
  if (!previewOn || camSource.readyState < 2) return;
  const w = Math.min(260, app.W * 0.25);
  const h = (w * 9) / 16;
  const x = app.W - w - 14;
  const y = app.H - h - 14;

  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.clip();
  g.translate(x + w, y);
  g.scale(-1, 1);
  g.drawImage(camSource, 0, 0, w, h);
  g.restore();

  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.clip();
  const cw = w / motion.gridW;
  const ch = h / motion.gridH;
  g.fillStyle = '#36ff8c';
  for (let cy = 0; cy < motion.gridH; cy++) {
    for (let cx = 0; cx < motion.gridW; cx++) {
      const v = motion.cells[cy * motion.gridW + cx];
      if (v < 0.15) continue;
      g.globalAlpha = v * 0.55;
      g.fillRect(x + cx * cw, y + cy * ch, cw + 0.5, ch + 0.5);
    }
  }
  g.restore();

  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.stroke();
}

// ---- メインループ ----

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.t += dt;
  if (fakeCam) drawFakeCam();
  motion.update(camSource);
  updateBodies(now);
  if (state === 'menu') menuFrame(dt);
  else gameFrame(dt);
  drawHandCursors();
  drawPreview();
  requestAnimationFrame(frame);
}

// ---- スタート ----

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const cameraError = document.getElementById('camera-error');

function showCameraError(err) {
  // スマホで http だと isSecureContext が false になり、カメラが使えない
  if (!window.isSecureContext || !navigator.mediaDevices) {
    cameraError.innerHTML =
      'カメラを つかうには <b>https</b> で ひらく ひつようが あります。<br />' +
      'スマホの ばあいは アドレスが <b>https://</b> で はじまって いるか たしかめてね。';
  } else if (err && err.name === 'NotAllowedError') {
    cameraError.innerHTML =
      'カメラが きょかされて いません。<br />' +
      'ブラウザの せっていで カメラを「きょか」して、もういちど「はじめる」を おしてね。';
  } else if (err && err.name === 'NotFoundError') {
    cameraError.innerHTML = 'カメラが みつかりませんでした。<br />Webカメラが つながって いるか たしかめてね。';
  }
  cameraError.hidden = false;
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  cameraError.hidden = true;
  audio.init();
  try {
    if (!navigator.mediaDevices) throw new Error('no mediaDevices (insecure context?)');
    await startCamera();
  } catch (err) {
    showCameraError(err);
    startBtn.disabled = false;
    return;
  }
  startScreen.hidden = true;
  gearBtn.hidden = false;
  populateCameraList();
  tryPose(); // 裏で人体認識を起動（失敗してもうごき検出だけで遊べる）
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

// 自動テスト用: ?autostart=1 で起動直後にカメラ開始(本番動作には影響しない)。
// #<ゲームID> を付けるとそのゲームを直接ひらく。
if (params.has('autostart')) {
  const autostart = async () => {
    if (fakeCam) {
      // カメラを使わず合成映像で即起動(getUserMedia 不要)
      audio.init();
      setupFakeCam();
      startScreen.hidden = true;
      gearBtn.hidden = false;
      if (!running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    } else {
      startBtn.click();
    }
    const wanted = GAMES.find((gm) => gm.id === location.hash.slice(1));
    if (wanted) {
      await new Promise((r) => setTimeout(r, fakeCam ? 50 : 800));
      if (state === 'menu') startGame(wanted);
    }
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', autostart);
  else autostart();
}
