export function demoCue(time) {
  const t = ((time % 10) + 10) % 10;
  return { phase: t >= 5.4 && t < 8.1 ? 'laugh' : t >= 2.4 && t < 5.4 ? 'smile' : 'neutral',
    rain: t >= 5.4 && t < 8.1 ? .85 : t >= 2.4 && t < 5.4 ? .65 : 0 };
}

// Scripted AI storyboard illustration, deliberately separate from live face inference.
export function createDemoScene({ stage, reduceMotion }) {
  const video = document.getElementById('demo-host'), toggle = document.getElementById('demo-scene-toggle');
  const replay = document.getElementById('demo-scene-play'), note = document.getElementById('demo-scene-note');
  let enabled = false, active = false, attempted = false, previous = -1;
  function play() {
    if (!active || reduceMotion() || document.hidden) return;
    attempted = true; video.play().catch(() => {});
  }
  function sync(visible) {
    const next = visible && enabled;
    if (next !== active) {
      active = next; attempted = false; previous = video.currentTime - .01;
      stage.classList.toggle('demo-scene', active);
    }
    replay.disabled = !active || reduceMotion();
    if (!active || reduceMotion() || document.hidden) { if (!video.paused) video.pause(); attempted = false; }
    else if (!attempted) play();
    return active;
  }
  function setEnabled(value) {
    const next = Boolean(value);
    if (next && !enabled) { video.currentTime = 0; previous = -1; }
    enabled = next;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '关闭AI主播' : '开启AI主播';
    replay.hidden = note.hidden = !enabled;
    if (!enabled) sync(false);
  }
  function sample(width, height) {
    const time = video.currentTime, cue = demoCue(time);
    if (time < previous) previous = -1;
    const bursts = !video.paused ? [5.45, 6.2, 6.95].filter(at => previous < at && time >= at).length : 0;
    previous = time;
    const contain = width > height;
    video.style.objectFit = contain ? 'contain' : 'cover';
    const scale = contain ? Math.min(width / 360, height / 640) : Math.max(width / 360, height / 640);
    return { phase: video.paused ? 'neutral' : cue.phase, rain: video.paused ? 0 : cue.rain, bursts,
      head: { x: width * .5, y: 640 * .45 * scale + (height - 640 * scale) / 2,
        rx: 360 * .29 * scale, ry: 640 * .235 * scale, angle: 0 } };
  }
  replay.addEventListener('click', () => { video.currentTime = 0; previous = -1; attempted = false; play(); });
  stage.addEventListener('pointerdown', () => { if (active && video.paused) play(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); attempted = false; });
  setEnabled(false);
  return { sync, sample, setEnabled, get enabled() { return enabled; } };
}
