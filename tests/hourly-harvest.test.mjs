import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HOURLY_CLOCKWISE_ORDER,
  HOURLY_ART_VARIANTS,
  HOURLY_REDRAW_LIMIT,
  canRedrawHourlyHand,
  createHourlyDeck,
  formatDuration,
  gardenConnection,
  hourlyResultShareText,
  kstHourSeed,
  newHourlyRun,
  playHourlyCard,
  previewHourlyPlacement,
  redrawHourlyHand,
  replayHourlySolution,
  restoreHourlyRun,
  secondsUntilNextHour,
  snapshotHourlyRun,
  solveHourlyHarvestMaximum,
  starsForScore,
  thresholdsForMaximum,
} from "../src/game/hourly-harvest.js";

function card(digit, id = `card-${digit}`) {
  return { id, digit, variantId: `v-${digit}`, cardName: `카드 ${digit}`, imagePath: `/card-${digit}.png` };
}

function ruleState() {
  return {
    mode: "hourly",
    phase: "play",
    hand: [card(5, "played-5")],
    deck: [],
    piles: [
      [card(2, "a"), card(8, "b"), card(4, "c")],
      [card(6, "d")],
      [card(2, "e")],
      [card(7, "f")],
    ],
    score: 0,
    cardsPlayed: 39,
    harvests: 0,
    thresholds: thresholdsForMaximum(500),
    maximumScore: 500,
  };
}

test("KST hourly seed and countdown match the malitmot-style boundary", () => {
  const date = new Date("2026-07-13T14:15:30Z");
  assert.equal(kstHourSeed(date), "2026071323");
  assert.equal(secondsUntilNextHour(date), 2670);
  assert.equal(formatDuration(2670), "44:30");
  assert.equal(formatDuration(8), "00:08");
});

test("hourly deck is deterministic and seed art varies without changing digits", () => {
  const first = createHourlyDeck("2026071308");
  const repeated = createHourlyDeck("2026071308");
  const nextHour = createHourlyDeck("2026071309");

  assert.equal(first.length, 40);
  assert.deepEqual(first, repeated);
  assert.deepEqual([...first].map((item) => item.digit).sort(), [...nextHour].map((item) => item.digit).sort());
  assert.notDeepEqual(
    first.map((item) => item.variantId),
    nextHour.map((item) => item.variantId),
  );
  for (let digit = 0; digit <= 9; digit += 1) {
    assert.equal(new Set(first.filter((item) => item.digit === digit).map((item) => item.variantId)).size, 4);
  }
});

test("all forty hourly art variants exist in runtime assets", () => {
  const variants = Object.values(HOURLY_ART_VARIANTS).flat();
  assert.equal(variants.length, 40);
  for (const [, label, imagePath] of variants) {
    assert.equal(fs.existsSync(imagePath), true, `${label}: ${imagePath}`);
  }
});

test("clockwise connection starts at the played garden and fixes direction", () => {
  assert.deepEqual(HOURLY_CLOCKWISE_ORDER, [0, 1, 3, 2]);
  const state = ruleState();
  const nextPiles = state.piles.map((pile) => [...pile]);
  nextPiles[0].push(state.hand[0]);
  const connection = gardenConnection(nextPiles, 0, 5);
  assert.deepEqual(connection, {
    length: 3,
    direction: 1,
    pileIndices: [0, 1, 3],
    digits: [5, 6, 7],
  });

  nextPiles[3] = [card(5, "direction-break")];
  assert.equal(gardenConnection(nextPiles, 0, 5).length, 2);
});

test("four cards always harvest by sum and clockwise gardens multiply it", () => {
  const state = ruleState();
  const preview = previewHourlyPlacement(state, 0, 0);
  assert.equal(preview.harvest, true);
  assert.equal(preview.chainSum, 19);
  assert.equal(preview.connection.length, 3);
  assert.equal(preview.points, 57);

  const result = playHourlyCard(state, 0, 0);
  assert.equal(result.ok, true);
  assert.equal(state.score, 57);
  assert.equal(state.harvests, 1);
  assert.equal(state.piles[0].length, 0);
  assert.equal(state.piles[1][0].digit, 6);
  assert.equal(state.piles[3][0].digit, 7);
  assert.equal(state.phase, "result");
});

test("non-harvest placement remains legal in every garden", () => {
  const state = ruleState();
  state.piles = [[], [], [], []];
  const preview = previewHourlyPlacement(state, 0, 2);
  assert.equal(preview.ok, true);
  assert.equal(preview.harvest, false);
  assert.equal(preview.cardsUntilHarvest, 3);
});

test("hourly hand can be redrawn three times without discarding cards", () => {
  const solution = { maximumScore: 300, thresholds: thresholdsForMaximum(300), solverVersion: "test", verified: true };
  const state = newHourlyRun("2026071312", { solution });
  const originalHandIds = state.hand.map((item) => item.id);
  const originalCardIds = [...state.hand, ...state.deck].map((item) => item.id).sort();

  for (let remaining = HOURLY_REDRAW_LIMIT - 1; remaining >= 0; remaining -= 1) {
    assert.equal(canRedrawHourlyHand(state), true);
    const result = redrawHourlyHand(state);
    assert.equal(result.ok, true);
    assert.equal(state.redrawsLeft, remaining);
    assert.equal(state.cardsPlayed, 0);
    assert.equal(state.hand.length, 5);
  }

  assert.notDeepEqual(state.hand.map((item) => item.id), originalHandIds);
  assert.deepEqual([...state.hand, ...state.deck].map((item) => item.id).sort(), originalCardIds);
  assert.equal(canRedrawHourlyHand(state), false);
  assert.deepEqual(redrawHourlyHand(state), { ok: false, reason: "no_redraws" });
});

test("star thresholds are rounded and PERFECT remains separate", () => {
  const thresholds = thresholdsForMaximum(347);
  assert.deepEqual(thresholds, { one: 120, two: 200, three: 270, perfect: 347 });
  assert.equal(starsForScore(119, thresholds), 0);
  assert.equal(starsForScore(120, thresholds), 1);
  assert.equal(starsForScore(270, thresholds), 3);
});

test("deterministic solver target replays to its verified score", () => {
  const solution = solveHourlyHarvestMaximum("2026071310", { beamWidth: 250 });
  const replay = replayHourlySolution("2026071310", solution);
  assert.equal(solution.path.filter((action) => action.type === "play").length, 40);
  assert.ok(solution.path.filter((action) => action.type === "redraw").length <= HOURLY_REDRAW_LIMIT);
  assert.equal(solution.verified, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.score, solution.maximumScore);
});

test("hourly snapshot restore and share text preserve the challenge result", () => {
  const solution = solveHourlyHarvestMaximum("2026071311", { beamWidth: 250 });
  const run = newHourlyRun("2026071311", { solution });
  redrawHourlyHand(run);
  const restored = restoreHourlyRun(snapshotHourlyRun(run));
  assert.equal(restored.seed, run.seed);
  assert.equal(restored.hand[0].variantId, run.hand[0].variantId);
  assert.equal(restored.redrawsLeft, 2);
  assert.equal(restored.redrawsUsed, 1);
  assert.match(hourlyResultShareText(restored, "https://example.com"), /^스택스 #2026071311 도전중 0점 \/ 최대 \d+점 https:\/\/example\.com$/);
});
