import test from "node:test";
import assert from "node:assert/strict";

import {
  HARVEST_FEEDBACK_DURATION_MS,
  HARVEST_FINAL_DELAY_MS,
  HARVEST_FINAL_DISPLAY_MS,
  createHourlyHarvestFeedback,
  createHourlyHarvestTonePlan,
} from "../src/ui/harvest-feedback.js";

function harvest(overrides = {}) {
  return {
    cards: [0, 9, 5, 3].map((digit, index) => ({ id: `card-${index}`, digit })),
    cardChain: { length: 2 },
    connection: { pileIndices: [0, 1, 3, 2] },
    typeMatch: { matched: false, comboTypeId: null },
    multiplier: 4,
    points: 68,
    ...overrides,
  };
}

test("harvest feedback reveals four additions every 300ms and cumulative garden links", () => {
  const feedback = createHourlyHarvestFeedback(harvest());
  assert.deepEqual(feedback.additions.map((event) => [event.digit, event.delayMs]), [
    [0, 0],
    [9, 300],
    [5, 600],
    [3, 900],
  ]);
  assert.deepEqual(feedback.connectionEvents.map((event) => [event.pileIndex, event.multiplier]), [
    [1, 2],
    [3, 3],
    [2, 4],
  ]);
  assert.equal(feedback.cardChain.multiplier, 2);
  assert.equal(feedback.connectionEvents.at(-1).winner, true);
  assert.equal(feedback.final.delayMs, HARVEST_FINAL_DELAY_MS);
  assert.equal(feedback.final.durationMs, HARVEST_FINAL_DISPLAY_MS);
  assert.equal(feedback.durationMs, HARVEST_FEEDBACK_DURATION_MS);
  assert.ok(feedback.final.delayMs - feedback.connectionEvents.at(-1).delayMs >= 300);
  assert.ok(feedback.durationMs >= feedback.final.delayMs + feedback.final.durationMs);
});

test("same-type feedback wins at five without stacking other multipliers", () => {
  const feedback = createHourlyHarvestFeedback(harvest({
    cardChain: { length: 4 },
    typeMatch: { matched: true, comboTypeId: "flower" },
    multiplier: 5,
    points: 85,
  }));
  assert.equal(feedback.cardChain.winner, false);
  assert.equal(feedback.connectionEvents.at(-1).winner, false);
  assert.deepEqual(feedback.comboType, {
    multiplier: 5,
    comboTypeId: "flower",
    delayMs: 1050,
    winner: true,
  });
  assert.deepEqual(feedback.final, { multiplier: 5, points: 85, delayMs: 1600, durationMs: 1100 });
});

test("reduced motion resolves all labels immediately and shortens the input lock", () => {
  const feedback = createHourlyHarvestFeedback(harvest(), { reducedMotion: true });
  assert.equal(feedback.additions.every((event) => event.delayMs === 0), true);
  assert.equal(feedback.connectionEvents.every((event) => event.delayMs === 0), true);
  assert.equal(feedback.cardChain.delayMs, 0);
  assert.equal(feedback.final.delayMs, 0);
  assert.equal(feedback.final.durationMs, 450);
  assert.equal(feedback.durationMs, 450);
});

test("harvest combo melody rises through additions and multiplier beats", () => {
  const tones = createHourlyHarvestTonePlan(createHourlyHarvestFeedback(harvest()));
  const comboNotes = tones
    .filter((tone) => tone.stage === "addition" || tone.stage === "multiplier" || tone.stage === "final")
    .map((tone) => tone.note);
  assert.deepEqual(comboNotes, [60, 64, 67, 72, 74, 77, 81, 84]);
  assert.equal(comboNotes.every((note, index) => index === 0 || note > comboNotes[index - 1]), true);
});
