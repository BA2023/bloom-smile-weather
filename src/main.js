import { ParticleEngine, PALETTES } from './particles.js?v=live-7';
import { CameraTracker } from './tracking.js';
import { ExpressionState } from './expression.js';
import { clamp, headEllipse } from './geometry.js';
import { createLiveRoom } from './live-room.js?v=live-7';

const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('effects'), video = $('camera');
const engine = new ParticleEngine(canvas, $('foreground-effects')), expressions = new ExpressionState();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion-toggle').checked = reduced; engine.lightMotion = reduced;
let mode = 'preview', currentHead = null, targetHead = null, lastSignal = 0, pending = false, startAttempt = 0;
let giftRainUntil = 0, pendingGiftBurst = false;
let previewRain = false, lastFrame = performance.now(), nextAuto = lastFrame + 600;
let fpsTime = 0, fpsFrames = 0, fps = 0, lowFrames = 0, lastUi = 0;
let expressionResult = { label: 'no-face', smile: 0, jaw: 0, rain: 0 };
let ghost = { x: .50, y: .53 }, paused = document.hidden;

function measure() {
  const rect = stage.getBoundingClientRect(); engine.resize(rect.width, rect.height);
  if (mode === 'camera') { targetHead = null; currentHead = null; }
}
new ResizeObserver(measure).observe(stage);

function banner(text, error = false) {
  $('status-banner').textContent = text; $('status-banner').hidden = !text;
  $('status-banner').classList.toggle('error', error);
}
function previewState(errorText = '') {
  mode = 'preview'; pending = false; currentHead = targetHead = null;
  engine.preview = true; expressions.reset(); giftRainUntil = 0; previewRain = false; pendingGiftBurst = false;
  $('stage').classList.remove('camera-active'); $('mode-badge').classList.remove('live');
  video.setAttribute('aria-hidden', 'true');
  $('mode-label').textContent = '特效预演'; $('start-camera').hidden = false; $('start-camera').disabled = false;
  $('start-camera').innerHTML = '<svg aria-hidden="true"><use href="#i-camera"/></svg>开启镜头';
  $('stop-camera').hidden = true; $('preview-actions').hidden = false;
  $('camera-disclosure').innerHTML = '模拟直播间 · 互动仅在本机<span>开启镜头后体验表情特效，画面不上传</span>';
  setExpression('✧', '让笑意点亮这一场', '点礼物预演，或开启镜头微笑');
  nextAuto = performance.now() + 5500; banner(errorText, !!errorText);
}
function setExpression(symbol, name, detail) {
  $('expression-symbol').textContent = symbol; $('expression-name').textContent = name; $('expression-detail').textContent = detail;
}
function onState(state) {
  if (state === 'permission') banner('请允许使用摄像头。你也可以结束连接，继续欣赏预演。');
  if (state === 'loading') banner('正在准备表情识别，首次加载需要一点时间…');
  if (state === 'ready') {
    mode = 'camera'; pending = false; previewRain = false; giftRainUntil = 0; engine.preview = false; engine.rainStrength = 0; engine.events.length = 0;
    $('stage').classList.add('camera-active'); $('mode-badge').classList.add('live'); $('mode-label').textContent = '实时互动';
    video.setAttribute('aria-hidden', 'false');
    $('start-camera').hidden = true; $('preview-actions').hidden = false; $('stop-camera').textContent = '关闭镜头';
    $('camera-disclosure').innerHTML = '模拟直播间 · 镜头仅在本机<span>微笑下雨，大笑绽放 · 画面不上传</span>';
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
  if (expressionResult.burst && engine.celebrate(targetHead, 1)) liveRoom.showGift('流光烟花', '你的笑容');
  const labels = {
    'no-face': ['◌', '暂时没有看见你', '靠近一点，让脸部完整入镜'],
    neutral: ['◡', '这一刻，等你微笑', '轻轻微笑，让细雨落下'],
    smile: ['╲', '笑意，化作一场细雨', '再笑开一点，星焰就要绽放'],
    laugh: ['✷', '这一场，为你绽放', '晃动头部，接住下落的星光']
  };
  setExpression(...labels[expressionResult.label]);
}
const camera = new CameraTracker(video, onSignal, onState);
const liveRoom = createLiveRoom({
  onLeave: () => { startAttempt++; camera.stop(); previewState(); },
  onEnter: () => { lastFrame = performance.now(); nextAuto = lastFrame + 600; },
  reduceMotion: () => engine.lightMotion
});

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
  if (!engine.celebrate(currentHead)) pendingGiftBurst = true;
  liveRoom.showGift('流光烟花', '你');
  nextAuto = performance.now() + 6500;
  setExpression('✷', `${PALETTES[engine.paletteKey].name}星焰，正在绽放`, mode === 'camera' ? '晃动头部，接住下落的星光' : '开启镜头，用笑容点亮烟花');
});
$('preview-rain').addEventListener('click', () => {
  if (mode === 'camera') giftRainUntil = performance.now() + 6000;
  else previewRain = !previewRain;
  $('preview-rain').setAttribute('aria-pressed', String(mode === 'camera' || previewRain));
  if (mode === 'camera' || previewRain) liveRoom.showGift('流光细雨', '你', '╲');
  setExpression('╲', mode === 'camera' || previewRain ? '一场光的细雨' : '让笑意点亮这一场', mode === 'camera' ? '继续微笑，让细雨随笑意渐浓' : '开启镜头，微笑就有回应');
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
  if (event.target.closest('button, input, a, summary, [data-room-ui]')) return;
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
  if (paused || liveRoom.closed) { lastFrame = now; return; }
  const elapsed = Math.max(.001, (now - lastFrame) / 1000);
  const dt = Math.min(elapsed, .034); lastFrame = now;
  if (mode === 'preview') {
    const base = Math.min(engine.width * .19, engine.height * .115);
    targetHead = { x: ghost.x * engine.width, y: ghost.y * engine.height, rx: base, ry: base * 1.38, angle: Math.sin(now * .0004) * .025 };
    engine.rainStrength = previewRain ? .65 : 0;
    if (now >= nextAuto && !engine.lightMotion) { if (engine.celebrate(currentHead || targetHead)) liveRoom.showGift('流光烟花', 'Mia'); nextAuto = now + 6400; }
  } else {
    camera.sample(now);
    if (now - lastSignal > 550) { targetHead = null; currentHead = null; }
    engine.rainStrength = Math.max(now - lastSignal <= 550 ? expressionResult.rain : 0, now < giftRainUntil ? .8 : 0);
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
  if (pendingGiftBurst && !engine.rockets.length && !engine.events.length) {
    pendingGiftBurst = !engine.celebrate(currentHead);
  }
  engine.update(dt, currentHead); engine.draw(currentHead);
  fpsTime += elapsed; fpsFrames++;
  if (fpsTime >= 1) {
    fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    if (fps < 35) lowFrames++; else lowFrames = 0;
    if (lowFrames >= 3 && engine.limit > 450) { engine.limit = Math.max(450, Math.floor(engine.limit * .8)); lowFrames = 0; }
  }
  if (now - lastUi > 250) {
    $('preview-rain').setAttribute('aria-pressed', String(mode === 'camera' ? now < giftRainUntil : previewRain));
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
