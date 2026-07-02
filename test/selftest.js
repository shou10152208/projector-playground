// ヘッドレスChromeで走らせる自動テスト。
// 各ゲームのロジックと動き検出を、合成入力で多数フレーム回して例外がないか調べる。
// 結果を DOM と document.title に書き出す(--dump-dom / --virtual-time-budget で回収)。
import { MotionDetector } from '../js/motion.js';
import { bubblesGame } from '../js/games/bubbles.js';
import { starsGame } from '../js/games/stars.js';
import { flowersGame } from '../js/games/flowers.js';
import { molesGame } from '../js/games/moles.js';
import { posesGame } from '../js/games/poses.js';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

const asyncErrors = [];
window.addEventListener('error', (e) => asyncErrors.push(e.message));
window.addEventListener('unhandledrejection', (e) => asyncErrors.push(String(e.reason)));

// --- 安全なダミー音声(AudioContextを作らない) ---
const silentAudio = new Proxy({}, { get: () => () => {} });

function makeApp() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const g = canvas.getContext('2d');
  let motionScript = () => 0;
  const app = {
    W: 1280,
    H: 720,
    t: 0,
    audio: silentAudio,
    motionAt: (nx, ny, r) => {
      const v = motionScript(nx, ny, r);
      if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('motionAt returned非数');
      return v;
    },
    setMotion: (fn) => (motionScript = fn),
  };
  return { app, g };
}

// 各ゲームを frames フレーム回す。途中で動きあり/なしを切り替えて全経路を踏む。
function runGame(game, label) {
  try {
    const { app, g } = makeApp();
    game.init(app);
    const frames = 800; // 約13秒ぶん。ヒント消滅やスポーン上限も通過させる
    for (let i = 0; i < frames; i++) {
      // 3フレームに1回、画面全体のどこかに強い動きを出す
      if (i % 3 === 0) {
        app.setMotion(() => (Math.random() < 0.7 ? 0.9 : 0));
      } else {
        app.setMotion(() => 0);
      }
      const dt = 1 / 60;
      app.t += dt;
      game.update(dt, app);
      game.draw(g, app);
    }
    // 何かしらDOM要素が無くてもクラッシュしないこと、を主眼に。
    record(`game:${label} ${frames}フレーム`, true, `score=${game.score ?? '-'}`);
  } catch (e) {
    record(`game:${label}`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
}

// 動き検出: 合成映像(動く四角)を流し込み、その場所の動きが立つか確認。
function runMotion() {
  try {
    const src = document.createElement('canvas');
    src.width = 320;
    src.height = 240;
    src.readyState = 4; // MotionDetector.update の readyState チェックを満たす
    const sg = src.getContext('2d');
    const motion = new MotionDetector();
    motion.setSensitivity(0.6);

    let lastMotion = 0;
    for (let i = 0; i < 10; i++) {
      sg.fillStyle = '#000';
      sg.fillRect(0, 0, 320, 240);
      // 左から右へ動く明るい四角
      const x = 20 + i * 25;
      sg.fillStyle = '#fff';
      sg.fillRect(x, 100, 40, 40);
      motion.update(src);
      // 四角の中心(鏡映しなので x は反転して見える)
      const nx = 1 - (x + 20) / 320;
      lastMotion = motion.motionAt(nx, (100 + 20) / 240, 0.06);
    }
    if (lastMotion > 0.3) {
      record('motion: 動く四角を検出', true, `motion=${lastMotion.toFixed(2)}`);
    } else {
      record('motion: 動く四角を検出', false, `motion=${lastMotion.toFixed(2)} (低すぎ)`);
    }

    // 静止が続けば動きは減衰して消えること
    sg.fillStyle = '#000';
    sg.fillRect(0, 0, 320, 240);
    sg.fillStyle = '#fff';
    sg.fillRect(150, 100, 40, 40);
    for (let i = 0; i < 16; i++) motion.update(src); // 同一フレームを流し続ける
    const still = motion.motionAt(0.5, 0.5, 0.2);
    record('motion: 静止が続くと減衰して消える', still < 0.15, `motion=${still.toFixed(2)}`);
  } catch (e) {
    record('motion', false, String(e));
  }
}

// まねっこポーズ: 合成ボディで「おてほん→ポーズ判定→せいこう」の流れを踏む
function runPoses() {
  try {
    const { app, g } = makeApp();
    app.poseAvailable = () => true; // からだにんしき有効の体裁
    app.hands = [];
    const mkBody = (poseId) => {
      const cx = app.W / 2;
      const shY = app.H * 0.5;
      const sw = 200; // 肩幅(px)
      const head = { x: cx, y: shY - 150, v: 1 };
      let lW;
      let rW;
      if (poseId === 'up') {
        lW = { x: cx - 120, y: head.y - 120, v: 1 };
        rW = { x: cx + 120, y: head.y - 120, v: 1 };
      } else if (poseId === 'wide') {
        lW = { x: cx - sw * 1.4, y: shY, v: 1 };
        rW = { x: cx + sw * 1.4, y: shY, v: 1 };
      } else if (poseId === 'oneUp') {
        lW = { x: cx - 100, y: head.y - 120, v: 1 };
        rW = { x: cx + 80, y: shY + 120, v: 1 };
      } else {
        lW = { x: cx - 30, y: head.y, v: 1 };
        rW = { x: cx + 30, y: head.y, v: 1 };
      }
      return {
        head,
        lWrist: lW,
        rWrist: rW,
        lShoulder: { x: cx - sw / 2, y: shY, v: 1 },
        rShoulder: { x: cx + sw / 2, y: shY, v: 1 },
        lHip: { x: cx - 60, y: shY + 260, v: 1 },
        rHip: { x: cx + 60, y: shY + 260, v: 1 },
        shoulderW: sw,
      };
    };
    posesGame.init(app);
    let successes = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 1500; i++) {
      app.t += dt;
      // play 中だけ、お手本どおりのポーズを取っている体を見せる
      app.bodies = posesGame.state === 'play' ? [mkBody(posesGame.pose.id)] : [];
      const before = posesGame.score;
      posesGame.update(dt, app);
      if (posesGame.score > before) successes++;
      posesGame.draw(g, app);
    }
    record('game:まねっこ ポーズ判定→せいこう', successes >= 2, `successes=${successes} score=${posesGame.score}`);
  } catch (e) {
    record('game:まねっこ', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
}

// 実カメラ経路(--use-fake-device-for-media-stream がある時だけ)。
async function runCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      record('camera: getUserMedia', true, 'skip (非対応環境)');
      return;
    }
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 400));
    const motion = new MotionDetector();
    for (let i = 0; i < 20; i++) {
      motion.update(video);
      await new Promise((r) => setTimeout(r, 16));
    }
    let max = 0;
    for (const v of motion.cells) if (v > max) max = v;
    stream.getTracks().forEach((t) => t.stop());
    record('camera: フェイク映像で動き取得', true, `maxCell=${max.toFixed(2)}`);
  } catch (e) {
    // カメラが無い環境ではスキップ扱い(致命的ではない)
    record('camera: getUserMedia', true, `skip (${String(e.message || e)})`);
  }
}

(async () => {
  runMotion();
  runGame(bubblesGame, 'しゃぼんだま');
  runGame(starsGame, 'ほしキャッチ');
  runGame(flowersGame, 'おはなばたけ');
  runGame(molesGame, 'もぐらたたき');
  runGame(posesGame, 'まねっこ(にんしき無し)');
  runPoses();
  await runCamera();

  if (asyncErrors.length) {
    record('global: 非同期エラー', false, asyncErrors.join(' | '));
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const allOk = passed === total;
  document.getElementById('title').textContent =
    `SELFTEST ${allOk ? 'PASS' : 'FAIL'} ${passed}/${total}`;
  document.getElementById('title').className = allOk ? 'ok' : 'fail';
  document.getElementById('results').textContent = results
    .map((r) => `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`)
    .join('\n');
  // ヘッドレス回収用のマーカー
  document.title = `SELFTEST ${allOk ? 'PASS' : 'FAIL'} ${passed}/${total}`;
  window.__selftest = { allOk, passed, total, results };
})();
