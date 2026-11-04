import test from 'node:test';
import assert from 'node:assert/strict';
import { correctedCenterOffset, createViewportCenter } from '../src/viewport-center.js';

test('center correction uses the displayed rectangle and preserves any existing translation', () => {
  assert.equal(correctedCenterOffset({ left: 280, width: 300 }, 1000), 70);
  assert.equal(correctedCenterOffset({ left: 350, width: 300 }, 1000, 0, 70), 70);
  assert.equal(correctedCenterOffset({ left: 410, width: 300 }, 800, 100, 70), 10);
});

test('an initially centered frame needs no visible correction on startup or repeated alignment', () => {
  const writes = [];
  const wrapper = { style: { setProperty: (name, value) => writes.push([name, value]), removeProperty() {} } };
  const stage = { getBoundingClientRect: () => ({ left: 350, width: 300, top: 190, height: 500 }) };
  const header = { getBoundingClientRect: () => ({ bottom: 80, height: 80 }) };
  const root = { clientWidth: 1000, clientHeight: 800 };
  const view = { innerWidth: 1000, innerHeight: 800, addEventListener() {} };
  const mobile = { matches: false, addEventListener() {} };
  const documentBefore = globalThis.document; globalThis.document = {};
  try {
    const control = createViewportCenter({ stage, wrapper, header, root, view, mobile,
      requestFrame: () => 1, Observer: class { observe() {} } });
    control.align(); assert.deepEqual(writes, []);
  } finally { globalThis.document = documentBefore; }
});

test('centers between header divider and viewport bottom across resize, offset and mobile transitions', () => {
  const events = {}, viewportEvents = {}, frames = [], values = {};
  let baseLeft = 280, baseTop = 100, headerBottom = 80;
  const root = { clientWidth: 1000, clientHeight: 800 }, mobile = { matches: false, addEventListener: (event, fn) => { events.mobile = fn; } };
  const view = { innerWidth: 1000, innerHeight: 800, addEventListener: (event, fn) => { events[event] = fn; },
    visualViewport: { width: 1000, height: 800, offsetLeft: 0, offsetTop: 0, addEventListener: (event, fn) => { viewportEvents[event] = fn; } } };
  const wrapper = { style: { setProperty: (name, value) => { values[name] = value; }, removeProperty: name => { delete values[name]; } } };
  const header = { getBoundingClientRect: () => ({ bottom: headerBottom, height: 80 }) };
  const stage = { getBoundingClientRect: () => ({ left: baseLeft + (parseFloat(values['--viewport-center-shift']) || 0), width: 300,
    top: baseTop + (parseFloat(values['--viewport-center-shift-y']) || 0), height: 500 }) };
  const documentBefore = globalThis.document; globalThis.document = {};
  try {
    const control = createViewportCenter({ stage, wrapper, header, root, view, mobile,
      requestFrame: fn => { frames.push(fn); return frames.length; }, Observer: class { observe() {} } });
    assert.equal(values['--viewport-center-shift'], '70px');
    assert.equal(values['--viewport-center-shift-y'], '90px');
    control.align(); assert.equal(values['--viewport-center-shift'], '70px'); assert.equal(values['--viewport-center-shift-y'], '90px');
    baseLeft = 410; baseTop = 120; view.visualViewport.width = 1200; view.visualViewport.height = 900; events.resize(); viewportEvents.resize();
    assert.equal(frames.length, 1); frames.shift()();
    assert.equal(values['--viewport-center-shift'], '40px');
    assert.equal(values['--viewport-center-shift-y'], '120px');
    view.visualViewport.width = 800; view.visualViewport.height = 700; view.visualViewport.offsetLeft = 100; view.visualViewport.offsetTop = 50; viewportEvents.scroll(); frames.shift()();
    assert.equal(values['--viewport-center-shift'], '-60px');
    assert.equal(values['--viewport-center-shift-y'], '45px');
    mobile.matches = true; events.mobile(); frames.shift()(); assert.equal(values['--viewport-center-shift'], undefined); assert.equal(values['--viewport-center-shift-y'], undefined);
    mobile.matches = false; events.mobile(); frames.shift()(); assert.equal(values['--viewport-center-shift'], '-60px'); assert.equal(values['--viewport-center-shift-y'], '45px');
    headerBottom = 20; control.align(); assert.equal(values['--viewport-center-shift-y'], '30px');
  } finally { globalThis.document = documentBefore; }
});
