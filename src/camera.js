/**
 * Camera stream, JPEG capture and download/share flow adapted from CamDesk.
 * Copyright (c) 2026 Michael Schwartz. MIT; see LICENSE.camdesk.txt.
 * Modifications: explicit permission gesture, stale-request cleanup, audio disabled,
 * fixed aspect crop, frame readiness checks and error handling.
 */
import { cropGeometry } from './core.js';

export class CameraSource {
  constructor(video, onInterrupted) {
    this.video = video;
    this.onInterrupted = onInterrupted;
    this.generation = 0;
    this.stream = null;
  }
  get ready() {
    const track = this.stream?.getVideoTracks()[0];
    return track?.readyState === 'live' && !track.muted && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }
  async start(facingMode) {
    this.stop();
    if (!window.isSecureContext) throw new Error('実カメラにはHTTPSが必要です。iPhoneではHTTPSのテストURLを開いてください。');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザではカメラを利用できません。Safariで開いてください。');
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 }
    } });
    if (generation !== this.generation || document.hidden) {
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException('Camera request cancelled', 'AbortError');
    }
    this.stream = stream;
    this.video.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => this.onInterrupted('カメラの接続が切れました。開き直してください。'));
    track.addEventListener('mute', () => {
      if (this.stream === stream) this.onInterrupted('カメラ映像が中断されたため、撮影を停止しました。');
    });
    try {
      await Promise.race([
        this.video.play(),
        new Promise((_, reject) => { this.playTimeout = setTimeout(() => reject(new Error('カメラの再生が始まりませんでした。開き直してください。')), 10000); })
      ]);
      const started = performance.now();
      while (!this.ready && generation === this.generation && performance.now() - started < 8000) {
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
      if (!this.ready) throw new Error('カメラ映像を読み込めませんでした。開き直してください。');
      return track.label || 'Camera';
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    } finally { clearTimeout(this.playTimeout); }
  }
  stop() {
    this.generation += 1;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}

export async function captureJpeg(source, orientation) {
  const width = source.videoWidth ?? source.width;
  const height = source.videoHeight ?? source.height;
  if (source instanceof HTMLVideoElement && source.readyState < 2) throw new Error('カメラ映像がまだ準備できていません。');
  const geometry = cropGeometry(width, height, orientation);
  const canvas = document.createElement('canvas');
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像の作成に失敗しました。');
  ctx.drawImage(source, geometry.sx, geometry.sy, geometry.sw, geometry.sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('JPEGの作成に失敗しました。')), 'image/jpeg', 0.92));
  return { blob, width: canvas.width, height: canvas.height };
}

export function downloadPhoto(item) {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = item.filename;
  document.body.append(a);
  a.click();
  a.remove();
}

export function photoFile(item) { return new File([item.blob], item.filename, { type: 'image/jpeg' }); }

export function canSharePhoto(item) {
  try { return !!navigator.canShare?.({ files: [photoFile(item)] }); } catch { return false; }
}

export async function sharePhoto(item) {
  // Called directly inside a tap handler to retain iOS user activation.
  await navigator.share({ files: [photoFile(item)], title: 'BOOKSCAN' });
}

export function cameraError(error) {
  const messages = {
    NotAllowedError: 'カメラが許可されていません。Safariのサイト設定でカメラを許可して、もう一度開いてください。',
    NotFoundError: '利用できるカメラが見つかりません。モックで操作を試すこともできます。',
    NotReadableError: 'カメラを起動できません。他のカメラアプリを閉じて、もう一度お試しください。',
    OverconstrainedError: '指定したカメラ設定を利用できません。カメラを切り替えてください。',
    QuotaExceededError: '保存領域が足りません。必要な写真を書き出してから、アプリ内の写真を削除してください。'
  };
  return messages[error.name] || error.message || '処理に失敗しました。もう一度お試しください。';
}
