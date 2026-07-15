import test from "node:test";
import assert from "node:assert/strict";

import {
  canStartPointerCarry,
  dragGhostPosition,
  exceedsPointerDragThreshold,
  handCardPointerEffect,
  isPointerDragCancellation,
  pointerDragThreshold,
  selectionAfterPointerGesture,
} from "../src/ui/pointer-drag.js";

test("pointer drag thresholds allow touch slop without weakening mouse input", () => {
  assert.equal(pointerDragThreshold("mouse"), 6);
  assert.equal(pointerDragThreshold("pen"), 8);
  assert.equal(pointerDragThreshold("touch"), 10);
  assert.equal(exceedsPointerDragThreshold("touch", 6, 0), false);
  assert.equal(exceedsPointerDragThreshold("touch", 8, 7), true);
  assert.equal(exceedsPointerDragThreshold("mouse", 6, 0), false);
  assert.equal(exceedsPointerDragThreshold("mouse", 7, 0), true);
});

test("pointer cancellation never shares the normal drop path", () => {
  assert.equal(isPointerDragCancellation("pointercancel"), true);
  assert.equal(isPointerDragCancellation("lostpointercapture"), true);
  assert.equal(isPointerDragCancellation("pointerup"), false);
});

test("pointer selection distinguishes taps, drags, and canceled gestures", () => {
  assert.equal(selectionAfterPointerGesture(null, 2), 2);
  assert.equal(selectionAfterPointerGesture(2, 2), null);
  assert.equal(selectionAfterPointerGesture(1, 2), 2);
  assert.equal(selectionAfterPointerGesture(1, 2, { moved: true }), 2);
  assert.equal(selectionAfterPointerGesture(1, 2, { canceled: true }), 1);
});

test("click carry only starts for a fine hover mouse pointer", () => {
  assert.equal(canStartPointerCarry("mouse", true), true);
  assert.equal(canStartPointerCarry("mouse", false), false);
  assert.equal(canStartPointerCarry("touch", true), false);
  assert.equal(canStartPointerCarry("pen", true), false);
});

test("drag ghost coordinates remain integer transform values", () => {
  assert.deepEqual(dragGhostPosition(101.8, 205.2, 20.4, 35.7), { x: 81, y: 170 });
});

test("each hand card derives a bounded angle from its own pointer position", () => {
  const bounds = { left: 0, top: 0, width: 1000, height: 800 };
  assert.deepEqual(handCardPointerEffect(500, 400, bounds), {
    shineX: 50,
    shineY: 50,
    tiltX: 0,
    tiltY: 0,
  });
  assert.deepEqual(handCardPointerEffect(1200, -100, bounds), {
    shineX: 100,
    shineY: 0,
    tiltX: 8,
    tiltY: 8,
  });
  assert.equal(handCardPointerEffect(150, 50, { left: 0, top: 0, width: 100, height: 100 }).tiltY, 8);
  assert.equal(handCardPointerEffect(150, 50, { left: 100, top: 0, width: 100, height: 100 }).tiltY, 0);
});
