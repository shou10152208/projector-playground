// カメラ映像のフレーム差分から「動き」を検出する。
// 映像を粗いグリッドに縮小し、前フレームとの差をセルごとのエネルギー(0..1)として保持する。
export class MotionDetector {
  constructor({ gridW = 64, gridH = 36 } = {}) {
    this.gridW = gridW;
    this.gridH = gridH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = gridW;
    this.canvas.height = gridH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.cells = new Float32Array(gridW * gridH);
    this.prev = null;
    this.sensitivity = 0.5;
  }

  setSensitivity(v) {
    this.sensitivity = Math.min(1, Math.max(0, v));
  }

  update(video) {
    if (!video || video.readyState < 2) return;
    const { gridW, gridH, ctx } = this;
    // 鏡映しにして、プレイヤーから見た左右と画面上の左右を一致させる
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -gridW, 0, gridW, gridH);
    ctx.restore();
    const frame = ctx.getImageData(0, 0, gridW, gridH).data;
    if (this.prev) {
      const prev = this.prev;
      const threshold = 100 - this.sensitivity * 75;
      for (let i = 0; i < this.cells.length; i++) {
        const j = i * 4;
        const diff =
          Math.abs(frame[j] - prev[j]) +
          Math.abs(frame[j + 1] - prev[j + 1]) +
          Math.abs(frame[j + 2] - prev[j + 2]);
        const hit = diff > threshold ? 1 : 0;
        this.cells[i] = Math.min(1, this.cells[i] * 0.82 + hit);
      }
      this.prev.set(frame);
    } else {
      this.prev = new Uint8ClampedArray(frame);
    }
  }

  // 正規化座標 (nx, ny) の周辺 radius (画面幅に対する割合) の動きの強さを返す
  motionAt(nx, ny, radius = 0.04) {
    const { gridW, gridH, cells } = this;
    const cx = nx * gridW;
    const cy = ny * gridH;
    const rx = Math.max(1, radius * gridW);
    const ry = Math.max(1, radius * gridH);
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(gridW - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(gridH - 1, Math.ceil(cy + ry));
    let best = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = cells[y * gridW + x];
        if (v > best) best = v;
      }
    }
    return best;
  }
}
