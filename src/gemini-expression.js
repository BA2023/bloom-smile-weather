// Gemini recognition; sensitivity 1 retains the original thresholds exactly.
export class GeminiExpressionStateMachine {
  constructor() {
    this.smoothSmile = 0.72;
    this.smoothJaw = 0.52;
    this.alpha = 0.32;
    this.sensitivity = 1;
    this.state = 'fireworks';
    this.lastFireworkTime = 0;
    this.fireworkCooldownMs = 340;
  }

  update(rawSmile, rawJaw, nowMs) {
    this.smoothSmile += (rawSmile - this.smoothSmile) * this.alpha;
    this.smoothJaw += (rawJaw - this.smoothJaw) * this.alpha;

    const s = this.smoothSmile;
    const j = this.smoothJaw;
    const sensitivity = this.sensitivity;

    let nextState = this.state;

    if (this.state === 'fireworks') {
      if (s < 0.45 / sensitivity || j < 0.23 / sensitivity) {
        nextState = s >= 0.28 / sensitivity ? 'rain' : 'neutral';
      }
    } else if (this.state === 'rain') {
      if (s > 0.52 / sensitivity && j > 0.30 / sensitivity) {
        nextState = 'fireworks';
      } else if (s < 0.25 / sensitivity) {
        nextState = 'neutral';
      }
    } else {
      if (s > 0.52 / sensitivity && j > 0.30 / sensitivity) {
        nextState = 'fireworks';
      } else if (s > 0.32 / sensitivity && j <= 0.30 / sensitivity) {
        nextState = 'rain';
      }
    }

    const stateChanged = nextState !== this.state;
    this.state = nextState;

    let shouldLaunchFirework = false;
    if (this.state === 'fireworks' && nowMs - this.lastFireworkTime > this.fireworkCooldownMs) {
      shouldLaunchFirework = true;
      this.lastFireworkTime = nowMs;
    }

    return {
      state: this.state,
      stateChanged,
      shouldLaunchFirework,
      smile: s,
      jaw: j,
    };
  }
}

const labels = { neutral: 'neutral', rain: 'smile', fireworks: 'laugh' };
const states = { neutral: 'neutral', smile: 'rain', laugh: 'fireworks' };

// The default profile matches the reference; sensitivity scales its entry and exit gates.
export class GeminiExpressionState {
  constructor() { this._sensitivity = 1; this.reset(); }
  reset() { this.machine = new GeminiExpressionStateMachine(); this.machine.sensitivity = this._sensitivity; this.signal = { smile: .78, jaw: .56 }; }
  get sensitivity() { return this._sensitivity; }
  set sensitivity(value) { this._sensitivity = Number.isFinite(value) ? Math.max(.75, Math.min(1.25, value)) : 1; this.machine.sensitivity = this._sensitivity; }
  get smile() { return this.machine.smoothSmile; }
  set smile(value) { this.machine.smoothSmile = value; }
  get jaw() { return this.machine.smoothJaw; }
  set jaw(value) { this.machine.smoothJaw = value; }
  get label() { return labels[this.machine.state]; }
  set label(value) { this.machine.state = states[value] || 'neutral'; }
  get lastBurst() { return this.machine.lastFireworkTime; }
  set lastBurst(value) { this.machine.lastFireworkTime = value; }
  advance(signal, now) { return this.update(signal, now); }
  update(signal, now) {
    if (signal) this.signal = signal;
    const result = this.machine.update(this.signal.smile, this.signal.jaw, now);
    return this.result(result.shouldLaunchFirework);
  }
  result(burst) {
    return { label: this.label, smile: this.smile, jaw: this.jaw, burst,
      rain: this.machine.state === 'rain' ? Math.min(1, (this.smile - .25) * 2.2) : 0 };
  }
}
