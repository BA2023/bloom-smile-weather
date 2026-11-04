// The stage fills the mobile visual viewport, including after keyboard/browser-bar changes.
export function createMobileRoom({ closePanels }) {
  const root = document.documentElement;
  const mobile = matchMedia('(max-width: 740px), (max-height: 560px) and (hover: none) and (pointer: coarse)');
  const content = document.getElementById('room-settings-content');
  const interaction = document.getElementById('interaction-guide');
  const controls = document.querySelector('.intro-controls');
  const mobileAccess = document.getElementById('mobile-access');
  const statusCard = document.getElementById('realtime-status-card');
  const expressionCard = document.getElementById('expression-card');
  const monitor = document.getElementById('studio-monitor');
  const fullscreenButton = document.getElementById('room-fullscreen');
  const hint = document.getElementById('room-display-hint');
  const dynamicHeight = Boolean(window.CSS?.supports?.('height', '100dvh'));
  const homes = [interaction, controls, mobileAccess, statusCard, expressionCard, monitor].map(element => {
    const anchor = document.createComment('Desktop settings position');
    element.before(anchor);
    return { element, anchor };
  });
  let frame = 0, wasMobile = false;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFullscreen = () => Boolean(
    (root.requestFullscreen && document.fullscreenEnabled) ||
    (root.webkitRequestFullscreen && document.webkitFullscreenEnabled !== false)
  );
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

  function updateFullscreen() {
    fullscreenButton.hidden = !canFullscreen();
    fullscreenButton.textContent = fullscreenElement() ? '退出全屏' : '全屏观看';
    hint.textContent = standalone() ? '已在独立窗口中打开。' :
      canFullscreen() ? '点击全屏观看，让这一场占满视野。' :
      '想隐藏浏览器工具栏，可将 BLOOM 添加到主屏幕，再从主屏幕打开。';
  }
  function syncViewport(activeElement = document.activeElement) {
    if (!mobile.matches) {
      root.style.removeProperty('--room-height');
      root.style.removeProperty('--room-top');
      root.style.removeProperty('--quick-settings-height');
      root.classList.remove('room-short');
      root.classList.remove('room-keyboard');
      return;
    }
    const viewport = window.visualViewport;
    // Preserve browser pinch-to-zoom; do not reflow content around the magnified viewport.
    if (viewport && Math.abs(viewport.scale - 1) > .01) return;
    const height = Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport.height : innerHeight;
    const editing = !activeElement?.readOnly && !activeElement?.disabled && (activeElement?.tagName === 'TEXTAREA' ||
      (activeElement?.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(activeElement.type || 'text')));
    // Let the browser track its own dynamic height. A permission/toolbar-time
    // VisualViewport sample must not pin a stale pixel height over 100dvh.
    if (!dynamicHeight || editing) {
      root.style.setProperty('--room-height', height + 'px');
      root.style.setProperty('--room-top', String(Math.max(0, viewport?.offsetTop || 0)) + 'px');
    } else {
      root.style.removeProperty('--room-height');
      root.style.removeProperty('--room-top');
    }
    root.style.setProperty('--quick-settings-height', '0px');
    root.classList.toggle('room-keyboard', Boolean(editing));
    root.classList.toggle('room-short', (dynamicHeight && !editing ? innerHeight : height) < 480 && innerWidth < 500);
  }
  function scheduleViewport() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; syncViewport(); });
  }
  function refreshViewport(event) {
    syncViewport(event?.type === 'focusout' ? event.relatedTarget || null : undefined);
    scheduleViewport();
  }
  function syncLayout() {
    const isMobile = mobile.matches;
    if (isMobile !== wasMobile) {
      closePanels(false);
      if (isMobile) {
        content.append(interaction);
        content.append(controls);
        content.append(mobileAccess);
        content.append(statusCard);
        content.append(expressionCard);
        content.append(monitor);
      } else {
        homes.forEach(({ element, anchor }) => anchor.after(element));
      }
      wasMobile = isMobile;
    }
    updateFullscreen();
    refreshViewport();
  }
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (fullscreenElement()) {
        await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      } else if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      }
      closePanels();
    } catch {
      hint.textContent = '当前浏览器未能进入全屏。可添加到主屏幕后打开，获得独立窗口体验。';
    }
    updateFullscreenLabel();
  });
  function updateFullscreenLabel() {
    fullscreenButton.textContent = fullscreenElement() ? '退出全屏' : '全屏观看';
    refreshViewport();
  }
  mobile.addEventListener('change', syncLayout);
  window.addEventListener('resize', refreshViewport);
  window.addEventListener('orientationchange', refreshViewport);
  window.addEventListener('pageshow', refreshViewport);
  window.visualViewport?.addEventListener('resize', refreshViewport);
  window.visualViewport?.addEventListener('scroll', refreshViewport);
  document.addEventListener('focusin', refreshViewport);
  document.addEventListener('focusout', refreshViewport);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshViewport(); });
  for (const name of ['loadedmetadata', 'loadeddata', 'resize', 'playing']) document.getElementById('camera').addEventListener(name, refreshViewport);
  document.addEventListener('fullscreenchange', updateFullscreenLabel);
  document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);
  syncLayout();
  return { refreshViewport };
}
