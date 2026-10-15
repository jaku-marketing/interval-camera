export const MAX_PHOTOS = 100;
export const MAX_BYTES = 100 * 1024 * 1024;

// The preview uses object-fit: cover; use the same central crop for the JPEG.
export function cropGeometry(sourceWidth, sourceHeight, orientation, maxLongEdge = 1280) {
  if (![sourceWidth, sourceHeight, maxLongEdge].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('映像のサイズを取得できません。カメラを開き直してください。');
  }
  if (!['portrait', 'landscape'].includes(orientation)) throw new Error('保存する向きが不正です。');
  const [rw, rh] = orientation === 'portrait' ? [3, 4] : [4, 3];
  const ratio = rw / rh;
  const sw = Math.min(sourceWidth, sourceHeight * ratio);
  const sh = sw / ratio;
  const unit = Math.floor(Math.min(sw / rw, sh / rh, maxLongEdge / Math.max(rw, rh)));
  if (unit < 1) throw new Error('映像が小さすぎます。');
  return { sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh, width: unit * rw, height: unit * rh };
}

export function canStorePhoto(items, bytes) {
  return items.length < MAX_PHOTOS && items.reduce((sum, item) => sum + item.blob.size, 0) + bytes <= MAX_BYTES;
}

export function photoFilename(date, id, mode) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\.\d+Z$/, 'Z');
  return `${mode === 'mock' ? 'mock' : 'photo'}_${stamp}_${id}.jpg`;
}

/** A single, cancellable schedule. Slow capture never creates parallel or catch-up shots. */
export class IntervalSession {
  constructor({ capture, onChange = () => {}, onError = () => {}, now = () => performance.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) }) {
    Object.assign(this, { capture, onChange, onError, now, setTimer, clearTimer });
    this.active = false;
    this.pending = false;
    this.count = 0;
    this.total = 0;
    this.timer = null;
    this.reason = 'ready';
  }
  get snapshot() {
    return { active: this.active, pending: this.pending, count: this.count, total: this.total,
      remainingMs: this.active ? Math.max(0, this.nextAt - this.now()) : 0, reason: this.reason };
  }
  emit() { this.onChange(this.snapshot); }
  start({ intervalMs, delayMs, total }) {
    if (this.active || this.pending) throw new Error('撮影処理が終わるまでお待ちください。');
    if (!Number.isFinite(intervalMs) || intervalMs < 1000 || !Number.isFinite(delayMs) || delayMs < 0 ||
      !Number.isInteger(total) || total < 1 || total > MAX_PHOTOS) throw new Error('撮影設定が不正です。');
    Object.assign(this, { intervalMs, total, count: 0, active: true, reason: 'running', nextAt: this.now() + delayMs });
    this.emit();
    this.timer = this.setTimer(() => this.tick(), 0);
  }
  stop(reason = 'stopped') {
    this.clearTimer(this.timer);
    this.timer = null;
    this.active = false;
    this.reason = reason;
    this.emit();
  }
  async tick() {
    if (!this.active || this.pending) return;
    this.emit();
    if (this.now() < this.nextAt) {
      this.timer = this.setTimer(() => this.tick(), Math.min(100, this.nextAt - this.now()));
      return;
    }
    const shotStarted = this.now();
    this.pending = true;
    this.emit();
    try {
      await this.capture();
      this.count += 1;
      if (this.active && this.count >= this.total) this.stop('complete');
    } catch (error) {
      this.stop('error');
      this.onError(error);
    } finally {
      this.pending = false;
      this.emit();
    }
    if (this.active) {
      const planned = shotStarted + this.intervalMs;
      this.nextAt = planned > this.now() ? planned : this.now() + this.intervalMs;
      this.timer = this.setTimer(() => this.tick(), 0);
    }
  }
}
