// 人体（ポーズ）認識 — MediaPipe PoseLandmarker のラッパー。
// 星守の夜(projector-adventure)と同じ vendor 同梱バンドルを動的 import で読む。
// 読込・初期化に失敗しても呼び出し側が catch して従来のうごき検出だけで動作する。

const BUNDLE_URL = new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;
const WASM_PATH = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_PATH = new URL('../vendor/mediapipe/pose_landmarker_lite.task', import.meta.url).href;

// BlazePose ランドマーク番号（使うものだけ）
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
};

export class PoseInput {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.ready = false;
    this.lastResults = null;
    this._lastVideoTime = -1;
    this._lastTs = 0;
  }

  async init(maxPoses = 2) {
    const { PoseLandmarker, FilesetResolver } = await import(BUNDLE_URL);
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const makeOptions = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numPoses: maxPoses,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, makeOptions('GPU'));
    } catch (e) {
      console.warn('[pose] GPU初期化に失敗、CPUで再試行', e);
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, makeOptions('CPU'));
    }
    this.ready = true;
  }

  // 毎フレーム呼ぶ。姿勢配列（[ [33ランドマーク], ... ]）か null を返す。
  detect(nowMs) {
    if (!this.ready || !this.landmarker) return null;
    if (this.video.readyState < 2 || !this.video.videoWidth) {
      return this.lastResults ? this.lastResults.landmarks : null;
    }
    // 同じ映像フレームを二度処理しない
    if (this.video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = this.video.currentTime;
      const ts = Math.max(nowMs, this._lastTs + 1);
      this._lastTs = ts;
      try {
        this.lastResults = this.landmarker.detectForVideo(this.video, ts);
      } catch (e) {
        // タイムスタンプ系の一時エラーは無視して継続
        console.debug('[pose] detect skip', e?.message || e);
      }
    }
    return this.lastResults ? this.lastResults.landmarks : null;
  }
}
