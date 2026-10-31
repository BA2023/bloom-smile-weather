import { ParticleEngine, PALETTES } from './particles.js?v=depth-3';
import { CameraTracker } from './tracking.js';
import { ExpressionState } from './expression.js';
import { clamp, headEllipse } from './geometry.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('effects'), video = $('camera');
const engine = new ParticleEngine(canvas, $('foreground-effects')), expressions = new ExpressionState();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion-toggle').checked = reduced; engine.lightMotion = reduced;
let mode = 'preview', currentHead = null, targetHead = null, lastSignal = 0, pending = false, startAttempt = 0;
let previewRain = false, lastFrame = performance.now(), nextAuto = lastFrame + 600;
let fpsTime = 0, fpsFrames = 0, fps = 0, lowFrames = 0, lastUi = 0;
let expressionResult = { label: 'no-face', smile: 0, jaw: 0, rain: 0 };
let ghost = { x: .50, y: .53 }, paused = document.hidden;

function measure() {
  const rect = stage.getBoundingClientRect(); engine.resize(rect.width, rect.height);
  positionForeground();
  if (mode === 'camera') { targetHead = null; currentHead = null; }
}
function positionForeground() {
  const rect = stage.getBoundingClientRect(), front = $('foreground-effects');
  Object.assign(front.style, { left: `${rect.left - rect.width * .64}px`, top: `${rect.top - rect.height * .24}px`, width: `${rect.width * 2.28}px`, height: `${rect.height * 1.48}px` });
}
new ResizeObserver(measure).observe(stage);
window.addEventListener('scroll', positionForeground, { passive: true });

function banner(text, error = false) {
  $('status-banner').textContent = text; $('status-banner').hidden = !text;
  $('status-banner').classList.toggle('error', error);
}
function previewState(errorText = '') {
  mode = 'preview'; pending = false; currentHead = targetHead = null;
  engine.preview = true; expressions.reset();
  $('stage').classList.remove('camera-active'); $('mode-badge').classList.remove('live');
  video.setAttribute('aria-hidden', 'true');
  $('mode-label').textContent = '艺术预演'; $('start-camera').hidden = false; $('start-camera').disabled = false;
  $('start-camera').innerHTML = '开启摄像头<span aria-hidden="true">↗</span>';
  $('stop-camera').hidden = true; $('preview-actions').hidden = false;
  $('camera-disclosure').innerHTML = '仅使用摄像头 · 无需麦克风 · 画面不上传<span>当前为艺术预演，尚未开启摄像头</span>';
  $('control-description').textContent = '准备好，点亮你的第一场星焰。';
  setExpression('✧', '先看一场星焰', '拖动轮廓接星光，或开启镜头');
  nextAuto = performance.now() + 5500; banner(errorText, !!errorText);
}
function setExpression(symbol, name, detail) {
  $('expression-symbol').textContent = symbol; $('expression-name').textContent = name; $('expression-detail').textContent = detail;
}
function onState(state) {
  if (state === 'permission') banner('请允许使用摄像头。你也可以结束连接，继续欣赏预演。');
  if (state === 'loading') banner('正在准备表情识别，首次加载需要一点时间…');
  if (state === 'ready') {
    mode = 'camera'; pending = false; engine.preview = false; engine.rainStrength = 0; engine.events.length = 0;
    $('stage').classList.add('camera-active'); $('mode-badge').classList.add('live'); $('mode-label').textContent = '实时互动';
    video.setAttribute('aria-hidden', 'false');
    $('start-camera').hidden = true; $('preview-actions').hidden = true; $('stop-camera').textContent = '结束体验';
    $('camera-disclosure').innerHTML = '摄像头已开启 · 视频帧仅在本机处理<span>微笑下雨，大笑绽放 · 支持头部碰撞</span>';
    $('control-description').textContent = '看向镜头，先给自己一个微笑。';
    setExpression('◌', '正在寻找你的笑意', '让脸部完整出现在画面中'); banner(''); lastSignal = performance.now();
  }
  if (state === 'ended' || state === 'tracking-error') previewState(state === 'ended' ? '摄像头连接已中断。可以重新开启体验。' : '表情识别暂时中断。请重新开启摄像头，或继续预演。');
}
function onSignal(signal) {
  if (mode !== 'camera') return;
  const now = performance.now(); lastSignal = now;
  expressionResult = expressions.update(signal, now);
  if (signal && video.videoWidth) {
    targetHead = headEllipse(signal.points, video.videoWidth, video.videoHeight, engine.width, engine.height);
  } else { targetHead = null; currentHead = null; }
  engine.rainStrength = expressionResult.rain;
  if (expressionResult.burst) engine.celebrate(targetHead, 1);
  const labels = {
    'no-face': ['◌', '暂时没有看见你', '靠近一点，让脸部完整入镜'],
    neutral: ['◡', '这一刻，等你微笑', '轻轻微笑，让细雨落下'],
    smile: ['╲', '笑意，化作一场细雨', '再笑开一点，星焰就要绽放'],
    laugh: ['✷', '这一场，为你绽放', '晃动头部，接住下落的星光']
  };
  setExpression(...labels[expressionResult.label]);
}
const camera = new CameraTracker(video, onSignal, onState);

$('start-camera').addEventListener('click', async () => {
  if (pending) return;
  const attempt = ++startAttempt;
  pending = true; $('start-camera').disabled = true; $('start-camera').textContent = '正在连接…';
  $('stop-camera').hidden = false; $('stop-camera').textContent = '取消连接';
  try { await camera.start(); }
  catch (error) {
    if (!pending || attempt !== startAttempt) return;
    camera.stop();
    const messages = { NotAllowedError: '摄像头权限未开启。请在浏览器地址栏允许摄像头后重试。', NotFoundError: '没有找到摄像头。请连接摄像头，或继续欣赏预演。', NotReadableError: '摄像头可能被其他应用占用。关闭占用后再试。' };
    console.error('Camera startup failed:', error);
    previewState(messages[error.name] || '暂时无法准备摄像头或识别模型。请检查网络后重试。');
  }
});
$('stop-camera').addEventListener('click', () => { startAttempt++; camera.stop(); previewState(); });
$('preview-burst').addEventListener('click', () => {
  engine.celebrate(currentHead); nextAuto = performance.now() + 6500;
  setExpression('✷', `${PALETTES[engine.paletteKey].name}星焰，正在绽放`, '艺术预演 · 摄像头尚未开启');
});
$('preview-rain').addEventListener('click', () => {
  previewRain = !previewRain; $('preview-rain').setAttribute('aria-pressed', String(previewRain));
  setExpression(previewRain ? '╲' : '✧', previewRain ? '一场光的细雨' : '先看一场星焰', '艺术预演 · 摄像头尚未开启');
});
document.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click', () => {
  engine.setPalette(button.dataset.palette);
  document.querySelectorAll('[data-palette]').forEach(b => {
    b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button));
  });
  if (mode === 'preview') { engine.celebrate(currentHead); nextAuto = performance.now() + 6500; }
}));
$('debug-toggle').addEventListener('change', e => { engine.debug = e.target.checked; $('debug-panel').hidden = !e.target.checked; });
$('motion-toggle').addEventListener('change', e => { engine.lightMotion = e.target.checked; });
$('sensitivity').addEventListener('input', e => {
  expressions.sensitivity = Number(e.target.value);
  $('sensitivity-value').textContent = e.target.value > 1.03 ? '灵敏' : e.target.value < .97 ? '稳健' : '标准';
});
function moveGhost(event) {
  if (mode !== 'preview') return;
  if (event.target.closest('button, input, a, summary')) return;
  const rect = stage.getBoundingClientRect();
  ghost = { x: clamp((event.clientX - rect.left) / rect.width, .18, .82), y: clamp((event.clientY - rect.top) / rect.height, .34, .68) };
}
stage.addEventListener('pointermove', moveGhost);
stage.addEventListener('pointerdown', moveGhost);
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && mode === 'preview' && !['BUTTON', 'INPUT', 'SUMMARY'].includes(document.activeElement.tagName)) {
    e.preventDefault(); $('preview-burst').click();
  }
});
document.addEventListener('visibilitychange', () => {
  paused = document.hidden; lastFrame = performance.now(); nextAuto = lastFrame + 3500;
  if (paused) { engine.rainStrength = 0; currentHead = targetHead = null; expressions.reset(); }
});
window.addEventListener('pagehide', () => camera.stop());

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const elapsed = Math.max(.001, (now - lastFrame) / 1000);
  const dt = Math.min(elapsed, .034); lastFrame = now;
  if (mode === 'preview') {
    const base = Math.min(engine.width * .19, engine.height * .115);
    targetHead = { x: ghost.x * engine.width, y: ghost.y * engine.height, rx: base, ry: base * 1.38, angle: Math.sin(now * .0004) * .025 };
    engine.rainStrength = previewRain ? .65 : 0;
    if (now >= nextAuto && !engine.lightMotion) { engine.celebrate(currentHead || targetHead); nextAuto = now + 6400; }
  } else {
    camera.sample(now);
    if (now - lastSignal > 550) { engine.rainStrength = 0; targetHead = null; currentHead = null; }
  }
  if (targetHead) {
    if (!currentHead) currentHead = { ...targetHead, vx: 0, vy: 0 };
    const oldX = currentHead.x, oldY = currentHead.y, blend = 1 - Math.exp(-dt * 16);
    for (const key of ['x', 'y', 'rx', 'ry']) currentHead[key] += (targetHead[key] - currentHead[key]) * blend;
    let da = targetHead.angle - currentHead.angle;
    while (da > Math.PI / 2) da -= Math.PI;
    while (da < -Math.PI / 2) da += Math.PI;
    currentHead.angle += da * blend;
    currentHead.vx = (currentHead.x - oldX) / dt; currentHead.vy = (currentHead.y - oldY) / dt;
  }
  engine.update(dt, currentHead); engine.draw(currentHead);
  fpsTime += elapsed; fpsFrames++;
  if (fpsTime >= 1) {
    fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    if (fps < 35) lowFrames++; else lowFrames = 0;
    if (lowFrames >= 3 && engine.limit > 450) { engine.limit = Math.max(450, Math.floor(engine.limit * .8)); lowFrames = 0; }
  }
  if (now - lastUi > 250) {
    $('fps').textContent = fps ? `${fps} FPS` : '采样中';
    $('particle-count').textContent = engine.count + engine.flybys.length;
    $('collision-count').textContent = engine.collisions;
    $('inference-time').textContent = camera.active ? `${camera.inferenceMs.toFixed(1)} ms` : '—';
    $('tracker-mode').textContent = camera.mode;
    $('expression-values').textContent = mode === 'camera' ? `${expressionResult.smile.toFixed(2)} / ${expressionResult.jaw.toFixed(2)}` : '预演';
    lastUi = now;
  }
}
measure(); requestAnimationFrame(frame);
