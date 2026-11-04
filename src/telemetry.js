import { clamp } from './geometry.js';

// Compact stage status keeps the displayed input separate from the actual effect.
export function liveCapsuleState({ mode, style, pending, startupState, closed, manual, scripted, label, effect, facePresent, stale, waiting }) {
  if (closed) return { source: '已离开', expression: '互动结束', effect: '可重新进入', tone: 'off' };
  if (pending) return { source: '镜头', expression: '准备中', effect: { permission: '等待授权', starting: '开启摄像头', loading: '加载识别' }[startupState] || '加载识别', tone: 'pending' };
  const source = manual ? '预演' : mode === 'camera' ? '镜头' : scripted ? 'AI演示' : '预演';
  if (mode === 'camera' && !manual && (waiting || facePresent !== true || (style === 'bloom' && stale))) {
    return { source, expression: waiting || facePresent === null ? '等待识别' : '未检测到人脸', effect: style === 'gemini' && facePresent === false && !waiting ? '保留上次效果' : '请正对镜头', tone: 'off' };
  }
  return { source, expression: { neutral: '平静', smile: '微笑', laugh: '大笑' }[label] || '平静',
    effect: { rain: '流光细雨', fireworks: '烟花绽放', mixed: '雨中烟花' }[effect] || '等待微笑',
    tone: ['rain', 'fireworks', 'mixed'].includes(effect) ? effect : 'neutral' };
}

// Measures completed inference work and actual animation JS cost, without FPS clamps or filler samples.
export class RuntimeTelemetry {
  constructor() { this.reset(); }
  reset() {
    this.costTotal = this.costCount = 0; this.frameCost = null; this.history = [];
    this.inferenceHz = null; this.inferenceStart = null; this.inferenceBaseline = 0;
  }
  record(costMs) {
    if (Number.isFinite(costMs) && costMs >= 0) { this.costTotal += costMs; this.costCount++; }
  }
  read(now, camera) {
    if (this.costCount) {
      this.frameCost = this.costTotal / this.costCount;
      this.history.push(this.frameCost); if (this.history.length > 48) this.history.shift();
      this.costTotal = this.costCount = 0;
    }
    if (!camera.active) { this.inferenceStart = null; this.inferenceHz = null; }
    else if (this.inferenceStart === null || camera.frames < this.inferenceBaseline) {
      this.inferenceStart = now; this.inferenceBaseline = camera.frames; this.inferenceHz = null;
    } else if (now - this.inferenceStart >= 1000) {
      this.inferenceHz = (camera.frames - this.inferenceBaseline) * 1000 / (now - this.inferenceStart);
      this.inferenceStart = now; this.inferenceBaseline = camera.frames;
    }
    const ceiling = Math.max(16.7, ...this.history);
    const points = this.history.map((value, i) => `${(i * 240 / 47).toFixed(1)},${(36 - value / ceiling * 32).toFixed(1)}`).join(' ');
    return { frameCost: this.frameCost, inferenceHz: this.inferenceHz, points, guideY: 36 - 16.7 / ceiling * 32 };
  }
}

export function expressionTelemetry({ style, mode, pending, manual, scripted, simulated = null, facePresent, stale, expression, sensitivity = 1, closed = false }) {
  const gemini = style === 'gemini';
  const available = !closed && !pending && (gemini || (!manual && mode === 'camera' && facePresent === true && !stale));
  const source = closed ? '已离开' : pending ? '等待识别' : manual ? '预演信号' : mode === 'camera' ?
    facePresent === false && gemini ? '沿用上次信号' : facePresent ? '实时信号' : gemini ? '预设初值' : '无识别信号' :
    gemini || simulated ? scripted ? '脚本信号' : '预演信号' : '无识别信号';
  return { source, available, smile: available ? clamp(expression.smile, 0, 1) : null,
    jaw: available ? clamp(expression.jaw, 0, 1) : null,
    label: !closed && !pending && !gemini && simulated ? simulated : available ? expression.label : null,
    gates: gemini ? [.32 / sensitivity, .52 / sensitivity, .30 / sensitivity] : [.43 / sensitivity, .58 / sensitivity, .20 / sensitivity] };
}
