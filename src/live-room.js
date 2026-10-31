const $ = id => document.getElementById(id);
const iconHeart = '<svg aria-hidden="true"><use href="#i-heart"/></svg>';
const sampleComments = [
  ['Mia', '这根星光拖尾好漂亮 ✨'], ['Luna', '极光配色也好看'], ['Noah', '主播笑得越开心，烟花越热闹'],
  ['Oliver', '接住了一点星光！'], ['Aria', '雨滴和涟漪好有氛围'], ['Kai', '再来一场烟花吧 🎆']
];
export function createLiveRoom({ onLeave, onEnter, reduceMotion }) {
  let closed = false, likes = 12800, commentIndex = 0, giftTimer, toastTimer;
  let openPanelElement = null, returnFocus = null;
  const formatLikes = n => `${(n / 1000).toFixed(1)}K`;
  function toast(message) {
    clearTimeout(toastTimer); $('room-toast').textContent = message; $('room-toast').hidden = false;
    toastTimer = setTimeout(() => { $('room-toast').hidden = true; }, 2300);
  }
  function addComment(name, message, own = false) {
    const row = document.createElement('p'), badge = document.createElement('span');
    const author = document.createElement('strong'), body = document.createElement('span');
    badge.className = `comment-badge ${own ? 'own' : commentIndex % 2 ? 'blue' : 'violet'}`; badge.textContent = own ? '我' : String(7 + commentIndex % 5);
    author.textContent = name; body.textContent = message;
    row.append(badge, author, body); $('room-comments').append(row);
    while ($('room-comments').children.length > 4) $('room-comments').firstElementChild.remove();
  }
  function closePanel(restore = true) {
    if (!openPanelElement) return;
    openPanelElement.hidden = true; openPanelElement = null;
    $('gift-trigger').setAttribute('aria-expanded', 'false');
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  function openPanel(id, trigger) {
    closePanel(false); returnFocus = trigger; openPanelElement = $(id); openPanelElement.hidden = false;
    if (id === 'gift-panel') $('gift-trigger').setAttribute('aria-expanded', 'true');
    if (id === 'share-panel') $('share-url').value = location.origin + location.pathname;
    openPanelElement.querySelector('section button')?.focus({ preventScroll: true });
  }
  function showGift(name, sender = '你', symbol = '✷') {
    clearTimeout(giftTimer); $('gift-sender').textContent = sender;
    $('gift-message').textContent = `送出${name}`; $('gift-notice-art').textContent = symbol;
    $('gift-notice').querySelector('.gift-sender-avatar').textContent = sender.slice(0, 1);
    $('gift-notice').hidden = false;
    giftTimer = setTimeout(() => { $('gift-notice').hidden = true; }, 4400);
  }
  function heart() {
    likes++; $('room-like-count').textContent = `${formatLikes(likes)} 点赞`; $('room-like-short').textContent = formatLikes(likes);
    $('room-like').setAttribute('aria-label', `为模拟直播点赞，当前${likes}次`);
    const layer = $('floating-hearts');
    if (layer.children.length >= 14) layer.firstElementChild.remove();
    const el = document.createElement('span'); el.className = `floating-heart${reduceMotion() ? ' still-heart' : ''}`;
    el.innerHTML = iconHeart; el.style.setProperty('--drift', `${Math.round(Math.random() * 44 - 22)}px`);
    el.style.setProperty('--heart-color', ['#fe2c55', '#ff86b7', '#d49fff'][likes % 3]); layer.append(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 2800);
  }
  $('room-follow').addEventListener('click', e => {
    const follow = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(follow)); e.currentTarget.textContent = follow ? '已关注' : '关注';
    toast(follow ? '已关注 Bloom Studio（模拟）' : '已取消关注（模拟）');
  });
  $('gift-trigger').addEventListener('click', e => openPanel('gift-panel', e.currentTarget));
  $('room-share').addEventListener('click', e => openPanel('share-panel', e.currentTarget));
  document.querySelectorAll('[data-close-panel]').forEach(el => el.addEventListener('click', () => closePanel()));
  document.querySelectorAll('[data-gift]').forEach(el => el.addEventListener('click', () => closePanel()));
  $('room-like').addEventListener('click', heart);
  $('gift-heart').addEventListener('click', () => { heart(); showGift('心动', '你', '♥'); });
  $('room-comment-form').addEventListener('submit', e => {
    e.preventDefault(); const input = $('room-comment-input'), message = input.value.trim();
    if (!message) { input.focus(); return; }
    addComment('你', message, true); input.value = ''; input.blur(); toast('评论已发送（模拟）');
  });
  $('copy-room-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('share-url').value); toast('演示链接已复制'); closePanel(); }
    catch { $('share-url').focus(); $('share-url').select(); toast('请复制选中的链接'); }
  });
  $('room-exit').addEventListener('click', () => {
    closePanel(false); closed = true; onLeave(); $('room-ended').hidden = false;
    $('room-reenter').focus({ preventScroll: true });
  });
  $('room-reenter').addEventListener('click', () => {
    closed = false; $('room-ended').hidden = true; onEnter(); $('gift-trigger').focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (!openPanelElement) return;
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
    if (e.key === 'Tab') {
      const focusable = [...openPanelElement.querySelectorAll('button, input, [tabindex="0"]')].filter(el => !el.disabled && !el.hidden);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  const timer = setInterval(() => {
    if (document.hidden || closed || openPanelElement) return;
    const [name, message] = sampleComments[commentIndex++ % sampleComments.length];
    addComment(name, message); $('room-join-name').textContent = ['Oliver', 'Emma', 'Kai'][commentIndex % 3];
  }, 6500);
  window.addEventListener('pagehide', () => { clearInterval(timer); clearTimeout(giftTimer); clearTimeout(toastTimer); });
  return { showGift, get closed() { return closed; } };
}
