import { MotionDetector } from './motion.js';
import { audio } from './audio.js';
import { FONT } from './fx.js';
import { bubblesGame } from './games/bubbles.js';
import { starsGame } from './games/stars.js';
import { flowersGame } from './games/flowers.js';
import { musicGame } from './games/music.js';
import { rhythmGame } from './games/rhythm.js';

const GAMES = [bubblesGame, starsGame, flowersGame, musicGame, rhythmGame];
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
  motionAt: (nx, ny, r) => motion.motionAt(nx, ny, r),
};

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
  // 5 games: row0 = 3 items, row1 = 2 items
  const r = Math.min(W * 0.1, H * 0.13);
  const cols0 = 3;
  const cols1 = 2;
  const gap = Math.min(r * 2.6, (W - r * 2) / (cols0 - 1));
  return GAMES.map((game, i) => {
    const row = i < cols0 ? 0 : 1;
    const col = i < cols0 ? i : i - cols0;
    const totalInRow = row === 0 ? cols0 : cols1;
    const rowX = W / 2 + (col - (totalInRow - 1) / 2) * gap;
    const rowY = H * 0.44 + row * (r * 2.6);
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
  const m = app.motionAt(btn.x / app.W, btn.y / app.H, (btn.r / app.W) * 0.8);
  let h = holds.get(btn.id) || 0;
  const before = h;
  if (m > 0.35) h += dt;
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
  g.fillText('あそびたい えの まえで てを ふってね', W / 2, H * 0.31);

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
  if (state === 'menu') menuFrame(dt);
  else gameFrame(dt);
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
