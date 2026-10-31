import { clamp } from './geometry.js';

export class ExpressionState {
  constructor() { this.sensitivity = 1; this.reset(); }
  reset() {
    this.smile = 0; this.jaw = 0; this.label = 'no-face'; this.candidate = ''; this.since = 0;
    this.lastTime = null; this.lastBurst = -Infinity; this.armed = true; this.releaseSince = null;
  }
  update(signal, now) {
    if (!signal) {
      this.smile = 0; this.jaw = 0; this.label = 'no-face'; this.candidate = ''; this.lastTime = null;
      this.releaseSince ??= now;
      if (now - this.releaseSince >= 350) this.armed = true;
      return this.result(false);
    }
    const elapsed = this.lastTime === null ? 80 : clamp(now - this.lastTime, 0, 200);
    this.lastTime = now;
    const alpha = 1 - Math.exp(-elapsed / 85);
    this.smile += (clamp(signal.smile, 0, 1) - this.smile) * alpha;
    this.jaw += (clamp(signal.jaw, 0, 1) - this.jaw) * alpha;
    const smileEnter = .43 / this.sensitivity, smileExit = .30 / this.sensitivity;
    const laugh = this.smile >= .58 / this.sensitivity && this.jaw >= .20 / this.sensitivity;
    if (this.smile < .43 / this.sensitivity || this.jaw < .12 / this.sensitivity) {
      this.releaseSince ??= now;
      if (now - this.releaseSince >= 300) this.armed = true;
    } else this.releaseSince = null;
    const next = laugh ? 'laugh' : this.smile > (this.label === 'smile' || this.label === 'laugh' ? smileExit : smileEnter) ? 'smile' : 'neutral';
    if (next !== this.candidate) { this.candidate = next; this.since = now; }
    let burst = false;
    if (now - this.since >= (next === 'laugh' ? 230 : 140)) {
      this.label = next;
      if (next === 'laugh' && this.armed && now - this.lastBurst >= 2100) {
        burst = true; this.lastBurst = now; this.armed = false;
      }
    }
    return this.result(burst);
  }
  result(burst) {
    return { label: this.label, smile: this.smile, jaw: this.jaw, burst,
      rain: this.label === 'smile' || this.label === 'laugh' ? clamp((this.smile - .2) * 1.35, .1, 1) : 0 };
  }
}
