// Center horizontally in the viewport and vertically below the header divider.
// The previous translation is included because getBoundingClientRect reflects it.
export function correctedCenterOffset(rect, viewportWidth, viewportLeft = 0, previousOffset = 0) {
  return previousOffset + viewportLeft + viewportWidth / 2 - (rect.left + rect.width / 2);
}

export function createViewportCenter({ stage, wrapper, header = null, root = document.documentElement, view = window,
  mobile = matchMedia('(max-width: 740px), (max-height: 560px) and (hover: none) and (pointer: coarse)'),
  requestFrame = requestAnimationFrame, Observer = ResizeObserver }) {
  let offsetX = 0, offsetY = 0, frame = 0;
  function align() {
    frame = 0;
    if (mobile.matches) {
      offsetX = offsetY = 0; wrapper.style.removeProperty('--viewport-center-shift');
      wrapper.style.removeProperty('--viewport-center-shift-y');
      return;
    }
    const rect = stage.getBoundingClientRect(), viewport = view.visualViewport;
    const width = viewport?.width || root.clientWidth || view.innerWidth;
    const height = viewport?.height || root.clientHeight || view.innerHeight;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(rect.left) || rect.width <= 0) return;
    const nextX = correctedCenterOffset(rect, width, left, offsetX);
    if (Math.abs(nextX - offsetX) > .01) {
      offsetX = nextX; wrapper.style.setProperty('--viewport-center-shift', `${offsetX}px`);
    }
    if (Number.isFinite(height) && height > 0 && Number.isFinite(rect.top) && rect.height > 0) {
      const headerRect = header?.getBoundingClientRect();
      const headerBottom = headerRect?.height > 0 && Number.isFinite(headerRect.bottom) ? headerRect.bottom : top;
      const contentTop = Math.max(top, Math.min(top + height, headerBottom));
      const contentHeight = top + height - contentTop;
      if (contentHeight > 0) {
        const nextY = correctedCenterOffset({ left: rect.top, width: rect.height }, contentHeight, contentTop, offsetY);
        if (Math.abs(nextY - offsetY) > .01) {
          offsetY = nextY; wrapper.style.setProperty('--viewport-center-shift-y', `${offsetY}px`);
        }
      }
    }
  }
  function schedule() { if (!frame) frame = requestFrame(align); }
  const observer = new Observer(schedule);
  observer.observe(root); observer.observe(stage); if (header) observer.observe(header);
  view.addEventListener('resize', schedule);
  view.visualViewport?.addEventListener('resize', schedule);
  view.visualViewport?.addEventListener('scroll', schedule);
  mobile.addEventListener('change', schedule);
  document.fonts?.ready.then(schedule).catch(() => {});
  align();
  return { align, schedule };
}
