import { ParticleEngine, PALETTES } from './particles.js?v=larger-ripples-90';
import { GeminiParticleEngine } from './gemini-particles.js?v=single-preview-97';
import { GeminiExpressionState } from './gemini-expression.js?v=gemini-sensitivity-69';
import { geminiHeadEllipse } from './gemini-collider.js?v=gemini-complete-35';
import { CameraTracker } from './tracking.js?v=camera-brightness-70';
import { RuntimeTelemetry, expressionTelemetry, liveCapsuleState } from './telemetry.js?v=live-capsule-100';
import { ExpressionState } from './expression.js?v=responsive-live-15';
import { clamp, headEllipse, previewHeadMotion } from './geometry.js?v=preview-center-55';
import { createLiveRoom } from './live-room.js?v=interaction-audit-105';
import { createMobileRoom } from './mobile-room.js?v=mobile-height-102';
import { createDemoScene } from './demo-scene.js?v=gemini-complete-35';
import { createViewportCenter } from './viewport-center.js?v=content-center-30';
import { initLanguage, translate } from './language.js?v=live-capsule-100';

initLanguage();

// A fresh visit or refresh starts at the centered preview; explicit anchors still work.
if (!location.hash) {
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
}

const $ = id => document.getElementById(id);
initMotionHelp();
const stage = $('stage'), canvas = $('effects'), video = $('camera');
createViewportCenter({ stage, wrapper: $('stage-wrapper'), header: document.querySelector('.site-header') });
let engine = new ParticleEngine(canvas, $('foreground-effects')), expressions = new ExpressionState(), effectStyle = 'bloom';
const sensitivityByStyle = { bloom: Number($('sensitivity').value), gemini: 1 };
const effectEngines = { bloom: engine };
const particleScale = 1.25, naturalRain = true;
engine.particleScale = particleScale; engine.naturalRain = naturalRain;
let paletteCustomized = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion-toggle').checked = reduced; engine.lightMotion = reduced;
let mode = 'preview', currentHead = null, targetHead = null, lastSignal = 0, pending = false, startAttempt = 0, startupState = '';
let giftRainUntil = 0;
let manualUntil = 0;
let previewRain = false, previewNeutral = false, lastFrame = performance.now(), nextAuto = lastFrame + 600;
let expressionPreview = null;
const previewDurations = { neutral: 3000, rain: 4000, fireworks: 4500 };
let autoPreviewTime = 0, autoPreviewPhase = null;
let fpsTime = 0, fpsFrames = 0, fps = 0, lowFrames = 0, lastUi = 0;
let expressionResult = { label: 'no-face', smile: 0, jaw: 0, rain: 0 };
let simulatedLabel = null;
let facePresent = null, waitingForGeminiFace = false;
const telemetry = new RuntimeTelemetry();
let ghostPointer = null, paused = document.hidden;
let resumeCameraAfterNavigation = false;
const roomStatus = $('room-effect-status');
const statusLabels = { permission: '等待授权', starting: '开启摄像头', loading: '加载识别', idle: '等待绽放', neutral: '等待微笑', searching: '寻找人脸', rain: '流光细雨', fireworks: '烟花绽放', mixed: '雨中烟花' };

function updateRoomStatus(now) {
  const fireworks = engine.fireworksActive;
  const rain = engine.rainStrength > .03 || engine.rainEnvelope > .06;
  const state = pending ? (startupState || 'starting') : fireworks ? (rain ? 'mixed' : 'fireworks') : rain ? 'rain' :
    mode === 'camera' ? (now - lastSignal > 550 || expressionResult.label === 'no-face' ? 'searching' : 'neutral') : 'idle';
  if (roomStatus.dataset.state !== state) {
    roomStatus.dataset.state = state;
    roomStatus.textContent = statusLabels[state];
    document.body.dataset.effect = state;
  }
}

function measure() {
  const rect = stage.getBoundingClientRect(); engine.resize(rect.width, rect.height);
  if (mode === 'camera') { targetHead = null; currentHead = null; }
}
new ResizeObserver(measure).observe(stage);

function banner(text, error = false) {
  $('status-banner').textContent = text; $('status-banner').hidden = !text || !error;
  $('status-banner').classList.toggle('error', error);
}
function previewState(errorText = '') {
  finishExpressionPreview();
  facePresent = null; waitingForGeminiFace = false; telemetry.reset();
  mode = 'preview'; pending = false; startupState = ''; currentHead = targetHead = null;
  engine.preview = true; expressions.reset(); giftRainUntil = 0; previewRain = false; previewNeutral = false;
  manualUntil = 0;
  if (effectStyle === 'gemini' && !engine.manualMood) {
    expressions.smile = .08; expressions.jaw = .03; expressions.label = 'neutral';
  }
  autoPreviewTime = 0; autoPreviewPhase = null;
  $('stage').classList.remove('camera-active', 'camera-visible'); $('mode-badge').classList.remove('live');
  video.setAttribute('aria-hidden', 'true');
  $('mode-label').textContent = '特效预演'; $('start-camera').hidden = false; $('start-camera').disabled = false;
  $('start-camera').innerHTML = '<svg aria-hidden="true"><use href="#i-camera"/></svg>开启镜头';
  $('stop-camera').hidden = true; $('preview-actions').hidden = false;
  $('camera-disclosure').innerHTML = '模拟直播间 · 互动仅在本机<span>开启镜头后体验表情特效，画面不上传</span>';
  setExpression('✧', '让笑意点亮这一场', '点礼物预演，或开启镜头微笑');
  nextAuto = performance.now() + 5500; banner(errorText, !!errorText); updateRoomStatus(performance.now()); syncPreviewButtons();
}
function setExpression(symbol, name, detail) {
  $('expression-symbol').textContent = symbol; $('expression-name').textContent = name; $('expression-detail').textContent = detail;
}
function onState(state) {
  if (['permission', 'starting', 'loading'].includes(state)) {
    if (state === 'loading') pending = true;
    startupState = state; updateRoomStatus(performance.now());
  }
  if (state === 'permission') banner('请允许使用摄像头');
  if (state === 'starting') banner('正在开启镜头…');
  if (state === 'loading') {
    facePresent = null; telemetry.reset();
    mobileRoom.refreshViewport();
    $('stage').classList.add('camera-visible'); video.setAttribute('aria-hidden', 'false');
    engine.preview = false; targetHead = currentHead = null;
    banner('正在准备表情识别…');
    syncPreviewButtons();
  }
  if (state === 'ready') {
    mobileRoom.refreshViewport();
    finishExpressionPreview();
    waitingForGeminiFace = effectStyle === 'gemini';
    mode = 'camera'; pending = false; startupState = ''; previewRain = false; giftRainUntil = 0; engine.preview = false; engine.rainStrength = 0;
    $('stage').classList.add('camera-active'); $('mode-badge').classList.add('live'); $('mode-label').textContent = '实时互动';
    video.setAttribute('aria-hidden', 'false');
    $('start-camera').hidden = true; $('preview-actions').hidden = false; $('stop-camera').textContent = '关闭镜头';
    $('camera-disclosure').innerHTML = '模拟直播间 · 镜头仅在本机<span>微笑下雨，大笑绽放 · 画面不上传</span>';
    setExpression('◌', '正在寻找你的笑意', '让脸部完整出现在画面中'); banner(''); lastSignal = performance.now(); updateRoomStatus(lastSignal); syncPreviewButtons();
  }
  if (state === 'ended' || state === 'tracking-error') previewState(state === 'ended' ? '摄像头连接已中断。可以重新开启体验。' : '表情识别暂时中断。请重新开启摄像头，或继续预演。');
}
function onSignal(signal) {
  if (mode !== 'camera') return;
  facePresent = Boolean(signal && signal.facePresent !== false);
  const now = performance.now(); lastSignal = now;
  if (signal?.points?.length === 4 && video.videoWidth) {
    const project = effectStyle === 'gemini' ? geminiHeadEllipse : headEllipse;
    targetHead = project(signal.points, video.videoWidth, video.videoHeight, engine.width, engine.height);
  } else if (effectStyle !== 'gemini') { targetHead = null; currentHead = null; }
  else if (!targetHead) {
    const c = engine.collider;
    targetHead = { x:c.targetX,y:c.targetY,rx:c.targetRx,ry:c.targetRy,angle:c.targetAngle };
  }
  if (effectStyle === 'gemini') {
    if (waitingForGeminiFace && facePresent && Number.isFinite(signal.smile) && Number.isFinite(signal.jaw)) {
      expressions.smile = clamp(signal.smile, 0, 1); expressions.jaw = clamp(signal.jaw, 0, 1);
      expressions.label = 'neutral'; waitingForGeminiFace = false;
    }
    engine.signal = signal; return;
  }
  expressionResult = expressions.update(signal, now);
  if (!expressionPreview) engine.rainStrength = expressionResult.rain;
  if (!expressionPreview && expressionResult.burst && engine.celebrate(targetHead, 1)) liveRoom.showGift('流光烟花', '你的笑容');
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
  onLeave: () => {
    startAttempt++; camera.stop(); demoScene.setEnabled(false);
    clearEffects(); previewState();
    guidePreviews.forEach(button => { button.disabled = true; });
    updateTelemetry(performance.now()); fps = fpsTime = fpsFrames = 0;
    $('studio-source').textContent = translate('已离开'); $('studio-fps').textContent = '—';
    $('mode-label').textContent = roomStatus.textContent = translate('已离开'); $('start-camera').disabled = true;
  },
  onEnter: () => { guidePreviews.forEach(button => { button.disabled = false; }); lastFrame = performance.now(); startCamera(); },
  reduceMotion: () => engine.lightMotion
});
const mobileRoom = createMobileRoom({ closePanels: liveRoom.closePanel });
const demoScene = createDemoScene({ stage, reduceMotion: () => engine.lightMotion });

function clearEffects() {
  finishExpressionPreview();
  engine.clear();
  giftRainUntil = manualUntil = 0; previewRain = false; previewNeutral = false; expressions.reset(); expressionResult = expressions.result(false);
  currentHead = targetHead = null;
}
async function startCamera() {
  if (pending || mode === 'camera' || liveRoom.closed) return;
  liveRoom.closePanel();
  mobileRoom.refreshViewport();
  demoScene.setEnabled(false); clearEffects();
  $('mode-label').textContent = '镜头模式';
  const attempt = ++startAttempt;
  pending = true; startupState = 'starting'; $('start-camera').disabled = true; $('start-camera').hidden = true;
  $('stop-camera').hidden = false; $('stop-camera').textContent = '取消'; updateRoomStatus(performance.now()); syncPreviewButtons();
  try { await camera.start(); }
  catch (error) {
    if (!pending || attempt !== startAttempt) return;
    camera.stop();
    const messages = { NotAllowedError: '请允许摄像头后点击开启镜头重试，也可以开启AI主播演示。', NotFoundError: '没有找到摄像头。请连接摄像头，或开启AI主播演示。', NotReadableError: '摄像头可能被其他应用占用。关闭占用后再试。' };
    console.error('Camera startup failed:', error);
    previewState(messages[error.name] || '暂时无法准备摄像头或识别模型。请检查网络后重试。');
  }
}
$('start-camera').addEventListener('click', startCamera);
$('demo-scene-toggle').addEventListener('click', () => {
  if (liveRoom.closed) return;
  if (demoScene.enabled) return startCamera();
  startAttempt++; camera.stop(); clearEffects(); previewState();
  demoScene.setEnabled(true); demoScene.sync(!liveRoom.closed);
  $('mode-label').textContent = 'AI演示';
  liveRoom.closePanel();
});
$('stop-camera').addEventListener('click', () => { startAttempt++; camera.stop(); previewState(); liveRoom.closePanel(); });
$('demo-scene-play').addEventListener('click', () => liveRoom.closePanel());
$('preview-burst').addEventListener('click', () => {
  if (!startExpressionPreview('fireworks')) return;
  liveRoom.showGift('流光烟花', '你');
  updateRoomStatus(performance.now());
  setExpression('✷', `${PALETTES[engine.paletteKey]?.name || '彩色'}星焰，正在绽放`, mode === 'camera' ? '晃动头部，接住下落的星光' : '开启镜头，用笑容点亮烟花');
});
$('preview-rain').addEventListener('click', () => {
  if (!startExpressionPreview('rain')) return;
  liveRoom.showGift('流光细雨', '你', '╲');
  setExpression('╲', '一场光的细雨', mode === 'camera' ? '继续微笑，让细雨随笑意渐浓' : '开启镜头，微笑就有回应');
});
function syncPreviewButtons() {
  const mood = expressionPreview?.mood;
  const blocked = liveRoom.closed || pending;
  guidePreviews.forEach(button => { button.disabled = blocked; button.setAttribute('aria-pressed', String(mood === previewMoods[button.dataset.preview])); });
  $('preview-rain').disabled = $('preview-burst').disabled = blocked;
  $('preview-rain').setAttribute('aria-pressed', String(mood === 'rain'));
  $('preview-burst').setAttribute('aria-pressed', String(mood === 'fireworks'));
  $('demo-scene-toggle').disabled = liveRoom.closed;
}
function finishExpressionPreview(now = Math.max(performance.now(), lastFrame)) {
  if (!expressionPreview) return;
  expressionPreview = null;
  previewRain = previewNeutral = false; giftRainUntil = manualUntil = 0;
  engine.manualMood = null; engine.suppressExpressionBursts = false; engine.pendingExpressionBurst = false;
  engine.rainOverride = null; engine.syntheticMood = 'neutral'; engine.previewMood = null;
  autoPreviewTime = 0; autoPreviewPhase = null;
  if (effectStyle === 'gemini') {
    const signal = mode === 'camera' || demoScene.enabled ? engine.signal : null;
    expressions.smile = Number.isFinite(signal?.smile) ? clamp(signal.smile, 0, 1) : .08;
    expressions.jaw = Number.isFinite(signal?.jaw) ? clamp(signal.jaw, 0, 1) : .03;
    expressions.label = 'neutral'; expressions.lastBurst = now;
    engine.expressionResult = expressions.result(false);
  }
  syncPreviewButtons();
}
function startExpressionPreview(mood) {
  if (liveRoom.closed || pending || !(mood in previewDurations)) return false;
  const now = Math.max(performance.now(), lastFrame);
  if (engine.clearVisualEffects) engine.clearVisualEffects(); else engine.clear();
  expressionPreview = { mood, until: now + previewDurations[mood] };
  engine.manualMood = mood; engine.suppressExpressionBursts = true;
  engine.pendingExpressionBurst = false; engine.previewMood = mood;
  previewNeutral = mood === 'neutral'; previewRain = mood === 'rain'; giftRainUntil = 0;
  manualUntil = expressionPreview.until;
  if (mood === 'fireworks') { engine.showcaseSeeded = true; engine.celebrate(currentHead, 1, 3); }
  syncPreviewButtons(); if (!pending) banner(''); liveRoom.closePanel();
  return true;
}
function triggerExpressionPreview(mood) {
  if (mood === 'neutral') startExpressionPreview(mood);
  else $(mood === 'rain' ? 'preview-rain' : 'preview-burst').click();
}
const previewMoods = { 'preview-neutral': 'neutral', 'preview-rain': 'rain', 'preview-burst': 'fireworks' };
const guidePreviews = [...document.querySelectorAll('[data-preview]')];
guidePreviews.forEach(button => button.addEventListener('click', () => triggerExpressionPreview(previewMoods[button.dataset.preview])));
document.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click', () => {
  paletteCustomized = button.dataset.palette !== 'auto';
  engine.setPalette(button.dataset.palette);
  document.querySelectorAll('[data-palette]').forEach(b => {
    b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button));
  });
}));
$('head-halo').addEventListener('change', e => { engine.showColliderMesh = e.target.checked; });
$('motion-toggle').addEventListener('change', e => { engine.lightMotion = e.target.checked; });
function renderSensitivity(value) {
  const slider = $('sensitivity'); slider.value = String(value);
  slider.style.setProperty('--range-progress', `${clamp((value - .75) / .5, 0, 1) * 100}%`);
  $('sensitivity-value').textContent = translate(value > 1.03 ? '灵敏' : value < .97 ? '稳健' : '标准');
}
$('sensitivity').addEventListener('input', e => {
  const value = Number(e.target.value); sensitivityByStyle[effectStyle] = value;
  expressions.sensitivity = value; renderSensitivity(value);
});
const effectButtons = [...document.querySelectorAll('[data-effect-style]')];
function selectEffectStyle(key, { persist = true } = {}) {
  if (!['bloom', 'gemini'].includes(key) || key === effectStyle) return;
  finishExpressionPreview();
  ghostPointer = null; previewNeutral = false;
  const previous = engine, rain = previous.rainStrength;
  previous.clear();
  engine = effectEngines[key] ??= new GeminiParticleEngine(canvas, $('foreground-effects'));
  engine.clear();
  engine.particleScale = particleScale;
  engine.naturalRain = naturalRain;
  const palette = key === 'gemini' && !paletteCustomized ? 'auto' : previous.paletteKey === 'auto' ? engine.paletteKey : previous.paletteKey;
  engine.setPalette(palette);
  engine.lightMotion = previous.lightMotion; engine.showColliderMesh = $('head-halo').checked; engine.preview = previous.preview;
  engine.collisions = previous.collisions; engine.rainStrength = mode === 'preview' ? 0 : rain;
  expressions = key === 'gemini' ? new GeminiExpressionState() : new ExpressionState();
  expressions.sensitivity = sensitivityByStyle[key];
  if (key === 'gemini') engine.expressionState = expressions;
  if (mode === 'preview' && !demoScene.enabled) {
    previewRain = false; giftRainUntil = manualUntil = 0;
    autoPreviewTime = 0; autoPreviewPhase = null;
    if (key === 'gemini') {
      engine.syntheticMood = 'neutral';
      expressions.smile = .08; expressions.jaw = .03; expressions.label = 'neutral';
      engine.expressionResult = expressions.result(false);
    }
  }
  effectStyle = key; stage.dataset.effectStyle = key;
  renderSensitivity(sensitivityByStyle[key]);
  facePresent = null; waitingForGeminiFace = mode === 'camera' && key === 'gemini'; telemetry.reset();
  camera.setProfile(key).catch(error => console.error('Recognition profile failed:', error));
  $('palette-auto').hidden = key !== 'gemini';
  document.querySelectorAll('[data-palette]').forEach(button => {
    const selected = button.dataset.palette === engine.paletteKey;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  effectButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.effectStyle === key)));
  measure();
  fps = fpsTime = fpsFrames = lowFrames = 0; updateRoomStatus(performance.now());
  if (persist) try { localStorage.setItem('bloom-effect-style', key); } catch { /* Current-page switching still works. */ }
}
effectButtons.forEach(button => button.addEventListener('click', () => selectEffectStyle(button.dataset.effectStyle)));
function moveGhost(event) {
  if (mode !== 'preview' || !engine.preview) return;
  if (event.target.closest('button, input, a, summary, [data-room-ui]')) return;
  const rect = stage.getBoundingClientRect();
  if (effectStyle === 'gemini' && engine.preview) {
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (event.type === 'pointerdown') engine.tap(x, y); else engine.movePointer(x, y);
    return;
  }
  const x = clamp((event.clientX - rect.left) / rect.width, .18, .82);
  const previousX = ghostPointer ? ghostPointer.x * rect.width : currentHead?.x ?? rect.width * .5;
  ghostPointer = { x, y: clamp((event.clientY - rect.top) / rect.height, .34, .68),
    angle: clamp((x * rect.width - previousX) * .008, -.35, .35) };
}
stage.addEventListener('pointermove', moveGhost);
stage.addEventListener('pointerdown', moveGhost);
function releaseGhostPointer() { ghostPointer = null; if (effectStyle === 'gemini') engine.releasePointer(); }
stage.addEventListener('pointerleave', releaseGhostPointer);
stage.addEventListener('pointercancel', releaseGhostPointer);
stage.addEventListener('pointerup', event => { if (event.pointerType === 'touch') releaseGhostPointer(); });
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && mode === 'preview' && !['BUTTON', 'INPUT', 'SUMMARY'].includes(document.activeElement.tagName)) {
    e.preventDefault(); $('preview-burst').click();
  }
});
document.addEventListener('visibilitychange', () => {
  paused = document.hidden; lastFrame = performance.now(); nextAuto = lastFrame + 3500;
  telemetry.reset(); fps = fpsTime = fpsFrames = 0;
  if (paused) {
    engine.rainStrength = 0; currentHead = targetHead = null; expressions.reset();
    if (effectStyle === 'gemini') {
      expressions.smile = .08; expressions.jaw = .03; expressions.label = 'neutral';
      engine.expressionResult = expressions.result(false); engine.pendingExpressionBurst = false;
      if (mode === 'camera') { waitingForGeminiFace = true; facePresent = null; engine.signal = null; }
    }
  }
  if (!paused) restoreCameraAfterNavigation();
});
function restoreCameraAfterNavigation() {
  if (!resumeCameraAfterNavigation || document.hidden) return;
  resumeCameraAfterNavigation = false;
  if (!liveRoom.closed && !demoScene.enabled) startCamera();
}
window.addEventListener('pagehide', () => {
  resumeCameraAfterNavigation = !liveRoom.closed && !demoScene.enabled && (mode === 'camera' || pending);
  startAttempt++; camera.stop();
  if (resumeCameraAfterNavigation) previewState();
});
window.addEventListener('pageshow', event => {
  if (!event?.persisted) return;
  paused = document.hidden; lastFrame = performance.now();
  restoreCameraAfterNavigation();
});

function frame(now) {
  requestAnimationFrame(frame);
  if (paused || liveRoom.closed) { lastFrame = now; return; }
  const frameStart = performance.now();
  const elapsed = Math.max(.001, (now - lastFrame) / 1000);
  const dt = Math.min(elapsed, .1); lastFrame = now;
  simulatedLabel = null;
  if (expressionPreview && now >= expressionPreview.until) finishExpressionPreview(now);
  if (mode === 'preview') {
    const sceneVisible = demoScene.sync(!pending && !liveRoom.closed);
    const scene = sceneVisible ? demoScene.sample(engine.width, engine.height) : null;
    if (!pending) { engine.preview = !sceneVisible; const label = translate(sceneVisible ? 'AI演示' : '特效预演'); if ($('mode-label').textContent !== label) $('mode-label').textContent = label; }
    const base = Math.min(engine.width * .19, engine.height * .115);
    targetHead = pending ? null : scene?.head || { ...previewHeadMotion(engine.width, engine.height, engine.time, ghostPointer, engine.lightMotion), rx: base, ry: base * 1.38 };
    const automatic = !pending && !sceneVisible && !previewRain && !previewNeutral && !engine.manualMood && now >= manualUntil;
    let autoPhase = null;
    if (automatic) {
      autoPreviewTime = (autoPreviewTime + dt) % 10.5;
      autoPhase = autoPreviewTime < 3 ? 'neutral' : autoPreviewTime < 7 ? 'rain' : 'fireworks';
      if (effectStyle !== 'gemini' && autoPhase === 'fireworks' && autoPreviewPhase !== 'fireworks') engine.celebrate(currentHead || targetHead);
      autoPreviewPhase = autoPhase;
    } else autoPreviewPhase = null;
    if (!pending) simulatedLabel = scene?.phase || { neutral: 'neutral', rain: 'smile', fireworks: 'laugh' }[autoPhase || 'neutral'];
    if (effectStyle === 'gemini') {
      if (automatic) engine.syntheticMood = autoPhase;
      engine.signal = scene ? scene.phase === 'laugh' ? { smile: .78, jaw: .56 } : scene.phase === 'smile' ? { smile: .44, jaw: .10 } : { smile: .08, jaw: .03 } : null;
      engine.rainOverride = !pending && previewRain ? .65 : null;
    } else {
      engine.previewMood = expressionPreview?.mood || (previewNeutral ? 'neutral' : autoPhase);
      engine.rainStrength = pending || previewNeutral ? 0 : Math.max(previewRain || autoPhase === 'rain' ? .65 : 0, now >= manualUntil ? scene?.rain || 0 : 0);
      if (scene && !previewNeutral && now >= manualUntil && !engine.lightMotion) for (let i = 0; i < scene.bursts; i++) { engine.celebrate(targetHead); liveRoom.showGift('流光烟花', 'AI演示'); }
    }
  } else {
    demoScene.sync(false);
    camera.sample(now);
    if (effectStyle !== 'gemini' && now - lastSignal > 550) { targetHead = null; currentHead = null; }
    if (effectStyle === 'gemini') engine.rainOverride = now < giftRainUntil ? .8 : null;
    else engine.rainStrength = previewNeutral ? 0 : Math.max(now - lastSignal <= 550 ? expressionResult.rain : 0, now < giftRainUntil ? .8 : 0);
  }
  if (expressionPreview) {
    simulatedLabel = { neutral: 'neutral', rain: 'smile', fireworks: 'laugh' }[expressionPreview.mood];
    engine.rainStrength = expressionPreview.mood === 'rain' ? .65 : 0;
    if (effectStyle === 'gemini') engine.rainOverride = engine.rainStrength;
  }
  if (targetHead && effectStyle !== 'gemini') {
    if (!currentHead) currentHead = { ...targetHead, vx: 0, vy: 0 };
    const oldX = currentHead.x, oldY = currentHead.y, blend = 1 - Math.exp(-dt * 16);
    for (const key of ['x', 'y', 'rx', 'ry']) currentHead[key] += (targetHead[key] - currentHead[key]) * blend;
    let da = targetHead.angle - currentHead.angle;
    while (da > Math.PI / 2) da -= Math.PI;
    while (da < -Math.PI / 2) da += Math.PI;
    currentHead.angle += da * blend;
    currentHead.vx = (currentHead.x - oldX) / dt; currentHead.vy = (currentHead.y - oldY) / dt;
  }
  const waitingForTracking = mode === 'camera' && effectStyle === 'gemini' && waitingForGeminiFace && !engine.manualMood;
  engine.suspended = pending || waitingForTracking;
  engine.update(dt, effectStyle === 'gemini' ? targetHead : currentHead, now); engine.draw(currentHead);
  if (effectStyle === 'gemini') {
    expressionResult = engine.expressionResult;
    const c = engine.collider;
    currentHead = c.active ? { x: c.x, y: c.y, rx: c.rx, ry: c.ry, angle: c.angle, vx: c.vx * 60, vy: c.vy * 60 } : null;
    if (!pending) {
      const label = translate(engine.manualMood ? '手动预演' : mode === 'camera' ? '实时互动' : demoScene.enabled ? 'AI演示' : '特效预演');
      if ($('mode-label').textContent !== label) $('mode-label').textContent = label;
    }
  }
  telemetry.record(performance.now() - frameStart);
  fpsTime += elapsed; fpsFrames++;
  if (fpsTime >= 1) {
    fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    if (fps < 35) lowFrames++; else lowFrames = 0;
    if (lowFrames >= 3 && engine.limit > 450) { engine.limit = Math.max(450, Math.floor(engine.limit * .8)); lowFrames = 0; }
  }
  if (now - lastUi > 250) {
    updateRoomStatus(now);
    syncPreviewButtons();
    $('studio-source').textContent = $('mode-label').textContent;
    $('studio-effect').textContent = translate(statusLabels[roomStatus.dataset.state]);
    $('studio-fps').textContent = fps || '—';
    $('studio-collisions').textContent = engine.collisions;
    updateTelemetry(now);
    lastUi = now;
  }
}
function updateTelemetry(now) {
  const stats = telemetry.read(now, camera);
  const signal = expressionTelemetry({ style: effectStyle, mode, pending: pending || (mode === 'camera' && waitingForGeminiFace && !engine.manualMood), manual: engine.manualMood,
    scripted: demoScene.enabled, simulated: simulatedLabel, facePresent, stale: now - lastSignal > 550, expression: expressionResult, closed: liveRoom.closed,
    sensitivity: Number($('sensitivity').value) });
  const sourceNames = { '实时信号': '摄像头实时识别', '预演信号': '互动预演数据', '脚本信号': 'AI演示数据',
    '沿用上次信号': '保留上次识别', '无识别信号': '未获取表情数据', '预设初值': '初始演示数据', '等待识别': '正在准备识别' };
  const sourceName = translate(sourceNames[signal.source] || signal.source);
  $('signal-source').textContent = sourceName;
  for (const [key, value] of [['smile', signal.smile], ['jaw', signal.jaw]]) {
    $('signal-' + key).textContent = value === null ? '—' : value.toFixed(2);
    $('signal-' + key + '-fill').style.width = `${(value || 0) * 100}%`;
    const meter = $('signal-' + key + '-meter');
    if (value === null) { meter.removeAttribute('aria-valuenow'); meter.setAttribute('aria-valuetext', sourceName); }
    else { meter.setAttribute('aria-valuenow', value.toFixed(2)); meter.removeAttribute('aria-valuetext'); }
  }
  ['smile', 'laugh', 'jaw'].forEach((key, i) => {
    const marker = $('gate-' + key); marker.style.left = `${signal.gates[i] * 100}%`;
    marker.querySelector('b').textContent = signal.gates[i].toFixed(2);
  });
  let statusLabel = expressionPreview ? { neutral: 'neutral', rain: 'smile', fireworks: 'laugh' }[expressionPreview.mood] : signal.label;
  if (!statusLabel && effectStyle === 'bloom' && mode === 'preview' && !pending && !liveRoom.closed) {
    const mood = engine.previewMood || (engine.fireworksActive ? 'fireworks' : engine.rainStrength > .03 || engine.rainEnvelope > .06 ? 'rain' : 'neutral');
    statusLabel = { neutral: 'neutral', rain: 'smile', fireworks: 'laugh' }[mood];
  }
  for (const [id, label] of [['neutral', 'neutral'], ['rain', 'smile'], ['fireworks', 'laugh']]) {
    const element = $('signal-' + id), active = label === statusLabel;
    element.classList.toggle('active', active);
    if (active) element.setAttribute('aria-current', 'true'); else element.removeAttribute('aria-current');
  }
  const capsuleState = liveCapsuleState({ mode, style: effectStyle, pending, startupState, closed: liveRoom.closed,
    manual: expressionPreview?.mood, scripted: demoScene.enabled, label: statusLabel, effect: roomStatus.dataset.state,
    facePresent, stale: now - lastSignal > 550, waiting: waitingForGeminiFace });
  const capsule = $('live-state-capsule');
  capsule.dataset.tone = capsuleState.tone;
  capsule.dataset.source = expressionPreview ? 'preview' : mode;
  capsule.dataset.expression = statusLabel || 'unknown';
  for (const key of ['source', 'expression', 'effect']) {
    const element = $('capsule-' + key), text = translate(capsuleState[key]);
    if (element.textContent !== text) element.textContent = text;
  }
  const cost = stats.frameCost === null ? '—' : stats.frameCost.toFixed(1);
  const hz = stats.inferenceHz === null ? '—' : stats.inferenceHz.toFixed(1);
  const inference = camera.active ? camera.inferenceMs.toFixed(1) : '—';
  $('studio-inference-hz').textContent = hz; $('studio-frame-cost').textContent = cost;
  $('studio-inference-ms').textContent = inference;
  $('studio-pool').textContent = `${engine.count} / ${engine.limit}`;
  $('studio-pool-fill').style.width = `${clamp(engine.count / engine.limit, 0, 1) * 100}%`;
  $('studio-pool-meter').setAttribute('aria-valuemax', String(engine.limit));
  $('studio-pool-meter').setAttribute('aria-valuenow', String(engine.count));
  $('frame-history').setAttribute('points', stats.points);
  $('frame-guide').setAttribute('y1', stats.guideY); $('frame-guide').setAttribute('y2', stats.guideY);
  $('studio-head-speed').textContent = currentHead ? Math.hypot(currentHead.vx || 0, currentHead.vy || 0).toFixed(0) : '—';
  const trackers = { 'GPU · Gemini': '本机 GPU', 'CPU · Worker': '本机 CPU · 后台识别', 'CPU · 低频回退': '本机 CPU · 兼容模式' };
  const trackerName = translate(camera.active ? trackers[camera.mode] || camera.mode : '识别未开启');
  $('studio-tracker').textContent = trackerName;
}
function initMotionHelp() {
  const row = $('motion-setting'), button = $('motion-help-button'), tip = $('motion-help');
  let hovered = false, focused = false, pinned = false, dismissed = false, leaveTimer;
  function position() {
    if (tip.hidden) return;
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    tip.style.width = `${Math.min(200, width - 24)}px`;
    const anchor = button.getBoundingClientRect(), box = tip.getBoundingClientRect();
    const left = clamp(anchor.left + anchor.width / 2 - box.width / 2, x + 12, x + width - box.width - 12);
    const above = anchor.top - box.height - 8;
    const top = clamp(above >= y + 12 ? above : anchor.bottom + 8, y + 12, y + height - box.height - 12);
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
  }
  function render() {
    const visible = !dismissed && (hovered || focused || pinned);
    tip.hidden = !visible; button.setAttribute('aria-expanded', String(visible)); position();
  }
  function enter(event) {
    if (event.pointerType === 'touch') return;
    clearTimeout(leaveTimer); hovered = true; dismissed = false; render();
  }
  function leave() { clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { hovered = false; render(); }, 120); }
  function close() { clearTimeout(leaveTimer); hovered = focused = pinned = false; dismissed = true; render(); }
  row.addEventListener('pointerenter', enter); tip.addEventListener('pointerenter', enter);
  row.addEventListener('pointerleave', leave); tip.addEventListener('pointerleave', leave);
  row.addEventListener('focusin', () => { focused = true; dismissed = false; render(); });
  row.addEventListener('focusout', event => { focused = row.contains(event.relatedTarget); render(); });
  button.addEventListener('click', () => { pinned = !pinned; dismissed = !pinned; render(); });
  document.addEventListener('pointerdown', event => { if (!row.contains(event.target) && !tip.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('scroll', position, { capture: true, passive: true });
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  const observer = new ResizeObserver(position); observer.observe(row); observer.observe(tip);
  render();
}
let initialEffectStyle = 'gemini';
try {
  const remembered = localStorage.getItem('bloom-effect-style');
  if (['bloom', 'gemini'].includes(remembered)) initialEffectStyle = remembered;
} catch { /* Gemini remains the default when optional storage is unavailable. */ }
selectEffectStyle(initialEffectStyle, { persist: false });
measure(); requestAnimationFrame(frame);
// The default entry requests the local camera; browser permission remains mandatory.
startCamera();
