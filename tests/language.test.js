import test from 'node:test';
import assert from 'node:assert/strict';
import { initLanguage, setLanguage, translate } from '../src/language.js';

class Element {
  constructor(id = '') { this.nodeType = 1; this.id = id; this.children = []; this.attrs = {}; this.dataset = {}; this.handlers = {}; }
  append(node) { node.parentElement = this; this.children.push(node); return node; }
  hasAttribute(name) { return name in this.attrs; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  closest(selector) { return this.dataset.i18nIgnore ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll() { return this.children.flatMap(child => child.nodeType === 1 ? [child, ...child.querySelectorAll()] : []); }
}
class Text {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; }
}
function textNodes(element) {
  return element.children.flatMap(child => child.nodeType === 3 ? [child] : textNodes(child));
}

test('Chinese and English translation handles live labels and preserves whitespace', () => {
  assert.equal(translate('  特效预演  ', 'en'), '  Preview  ');
  assert.equal(translate('Preview', 'zh'), '特效预演');
  assert.equal(translate('12.8K 点赞', 'en'), '12.8K likes');
  assert.equal(translate('送出流光烟花', 'en'), 'Sent Glow Fireworks');
  assert.equal(translate('嘴角上扬程度', 'en'), 'Smile strength');
  assert.equal(translate('每秒识别次数', 'en'), 'Checks per second');
  assert.equal(translate('AI演示数据', 'en'), 'Scripted AI values');
  assert.equal(translate('打开互动面板', 'en'), 'Open controls');
  assert.equal(translate('Panel', 'zh'), '面板');
  assert.equal(translate('当前表情与特效状态', 'en'), 'Current expression and effects');
  assert.equal(translate('再送一次流光烟花，当前连送3次', 'en'), 'Send Glow Fireworks again, 3 sent');
  assert.equal(translate('  ', 'zh'), '  ');
});

test('language toggle persists, translates UI changes, and leaves user comments untouched', () => {
  const oldDocument = globalThis.document, oldObserver = globalThis.MutationObserver, oldStorage = globalThis.localStorage;
  const root = new Element(), button = root.append(new Element('language-toggle')), mobile = root.append(new Element('language-toggle-mobile'));
  const ui = root.append(new Element()), label = ui.append(new Text('特效预演')), dynamic = ui.append(new Text('等待绽放'));
  const camera = ui.append(new Element()); camera.setAttribute('aria-label', '开启镜头');
  const user = root.append(new Element()); user.dataset.i18nIgnore = 'true'; const comment = user.append(new Text('微笑'));
  const storage = new Map(), nodes = { 'language-toggle': button, 'language-toggle-mobile': mobile };
  let observer;
  globalThis.document = { documentElement: root, getElementById: id => nodes[id], createTreeWalker: element => {
    const list = textNodes(element); let index = 0; return { nextNode: () => list[index++] || null };
  } };
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  globalThis.MutationObserver = class { constructor(callback) { observer = callback; } observe() {} };
  try {
    initLanguage(); button.handlers.click();
    assert.equal(root.lang, 'en'); assert.equal(label.nodeValue, 'Preview'); assert.equal(camera.getAttribute('aria-label'), 'Open camera');
    assert.equal(comment.nodeValue, '微笑'); assert.equal(storage.get('bloom-language'), 'en'); assert.equal(mobile.dataset.language, 'en');
    dynamic.nodeValue = '等待授权'; observer([{ type: 'characterData', target: dynamic }]); assert.equal(dynamic.nodeValue, 'Permission');
    mobile.handlers.click(); assert.equal(root.lang, 'zh-CN'); assert.equal(label.nodeValue, '特效预演');
    assert.equal(dynamic.nodeValue, '等待授权'); assert.equal(camera.getAttribute('aria-label'), '开启镜头'); assert.equal(comment.nodeValue, '微笑');
    assert.equal(storage.get('bloom-language'), 'zh');
  } finally { globalThis.document = oldDocument; globalThis.MutationObserver = oldObserver; globalThis.localStorage = oldStorage; setLanguage('zh', { persist: false }); }
});
