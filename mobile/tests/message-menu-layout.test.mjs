import test from 'node:test';
import assert from 'node:assert/strict';
import { messageMenuLayout } from '../src/lib/message-menu-layout.ts';

test('the reaction bar, selected bubble and menu stay inside safe screen bounds', () => {
  for (const width of [320, 390, 768]) for (const height of [568, 844]) {
    const viewport = { width, height, top: 44, bottom: 34, left: 0, right: 0 };
    for (const anchor of [
      { x: 10, y: 55, width: 240, height: 72 },
      { x: width - 260, y: height - 130, width: 250, height: 85 },
      { x: 20, y: 180, width: 1000, height: 1200 },
    ]) for (const outgoing of [false, true]) {
      const layout = messageMenuLayout(anchor, viewport, outgoing, true, 390);
      for (const element of [layout.bubble, layout.reactions, layout.menu]) {
        assert.ok(element.left >= 12);
        assert.ok(element.left + element.width <= width - 12);
        assert.ok(element.top >= viewport.top + 12);
      }
      assert.ok(layout.menu.top + layout.menu.maxHeight <= height - viewport.bottom - 12 + .01);
      assert.ok(layout.reactions.top + 48 <= layout.bubble.top);
      assert.ok(layout.bubble.top + layout.bubble.height < layout.menu.top);
    }
  }
});

test('keeps the original bubble position when there is space below it', () => {
  const layout = messageMenuLayout({ x: 48, y: 300, width: 220, height: 80 }, { width: 390, height: 844, top: 44, bottom: 34, left: 0, right: 0 }, false, true, 300);
  assert.equal(layout.bubble.top, 300);
  assert.equal(layout.bubble.left, 48);
  assert.equal(layout.menu.top, 390);
});
