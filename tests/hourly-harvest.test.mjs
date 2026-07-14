import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HOURLY_CLOCKWISE_ORDER,
  HOURLY_GARDEN_LABELS,
  HOURLY_REDRAW_LIMIT,
  HOURLY_SAME_SPECIES_MULTIPLIER,
  HOURLY_SPECIES_COPIES,
  HOURLY_SPECIES_PER_DECK,
  HOURLY_SPECIES_POOL,
  canRedrawHourlyHand,
  createHourlyDeck,
  formatDuration,
  gardenConnection,
  hourlyGardenLabel,
  hourlyResultShareText,
  kstHourSeed,
  longestHourlyCardChain,
  newHourlyRun,
  playHourlyCard,
  previewHourlyPlacement,
  redrawHourlyHand,
  replayHourlySolution,
  restoreHourlyRun,
  sameSpeciesHarvest,
  secondsUntilNextHour,
  snapshotHourlyRun,
  solveHourlyHarvestMaximum,
  starsForScore,
  thresholdsForMaximum,
} from "../src/game/hourly-harvest.js";

test("garden labels read A B / D C and clockwise as A B C D", () => {
  assert.deepEqual(HOURLY_GARDEN_LABELS, ["A", "B", "D", "C"]);
  assert.deepEqual(HOURLY_CLOCKWISE_ORDER.map(hourlyGardenLabel), ["A", "B", "C", "D"]);
  assert.equal(hourlyGardenLabel(99), "?");
});

function card(digit, id = `card-${digit}`, speciesId = `species-${id}`) {
  return {
    id,
    digit,
    speciesId,
    speciesIndex: 0,
    category: "flora",
    variantId: `${digit}:${speciesId}`,
    cardName: speciesId,
    imagePath: `/card-${digit}.png`,
  };
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

test("hourly deck deterministically balances ten species across forty digit cards", () => {
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
  assert.equal(new Set(first.map((item) => item.speciesId)).size, HOURLY_SPECIES_PER_DECK);
  assert.equal(first.filter((item) => item.category === "flora").length, 20);
  assert.equal(first.filter((item) => item.category === "fauna").length, 20);
  assert.equal(first.every((item) => ["flora", "fauna"].includes(item.category)), true);
  for (let digit = 0; digit <= 9; digit += 1) {
    assert.equal(first.filter((item) => item.digit === digit).length, 4);
  }
  for (const speciesId of new Set(first.map((item) => item.speciesId))) {
    const speciesCards = first.filter((item) => item.speciesId === speciesId);
    assert.equal(speciesCards.length, HOURLY_SPECIES_COPIES);
    assert.equal(new Set(speciesCards.map((item) => item.digit)).size, HOURLY_SPECIES_COPIES);
  }
});

test("all hourly species candidates exist in runtime assets", () => {
  assert.equal(HOURLY_SPECIES_POOL.length, 28);
  for (const species of HOURLY_SPECIES_POOL) {
    assert.equal(fs.existsSync(species.imagePath), true, `${species.cardName}: ${species.imagePath}`);
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

test("longest card chain follows play order, fixes direction, and allows 9-0", () => {
  assert.deepEqual(longestHourlyCardChain([1, 2, 7, 8]), {
    length: 2,
    direction: 1,
    startIndex: 0,
    digits: [1, 2],
  });
  assert.deepEqual(longestHourlyCardChain([2, 2, 3, 4]), {
    length: 3,
    direction: 1,
    startIndex: 1,
    digits: [2, 3, 4],
  });
  assert.equal(longestHourlyCardChain([2, 2, 2, 2]).length, 1);
  assert.equal(longestHourlyCardChain([1, 2, 1, 0]).length, 3);
  assert.equal(longestHourlyCardChain([9, 0, 1, 2]).length, 4);
});

test("four-card sum uses the longer card chain or garden connection as multiplier", () => {
  const state = ruleState();
  const preview = previewHourlyPlacement(state, 0, 0);
  assert.equal(preview.harvest, true);
  assert.equal(preview.chainSum, 19);
  assert.equal(preview.cardChain.length, 2);
  assert.equal(preview.connection.length, 3);
  assert.equal(preview.multiplier, 3);
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

test("a four-card internal chain can beat a missing garden connection", () => {
  const state = ruleState();
  state.hand = [card(4, "played-4")];
  state.piles = [[card(1, "a"), card(2, "b"), card(3, "c")], [], [], []];
  const preview = previewHourlyPlacement(state, 0, 0);
  assert.equal(preview.chainSum, 10);
  assert.equal(preview.cardChain.length, 4);
  assert.equal(preview.connection.length, 1);
  assert.equal(preview.multiplier, 4);
  assert.equal(preview.points, 40);
});

test("four cards of the exact same species use a non-stacking five-times multiplier", () => {
  const state = ruleState();
  state.hand = [card(4, "played-4", "dandelion")];
  state.piles = [
    [card(1, "a", "dandelion"), card(2, "b", "dandelion"), card(3, "c", "dandelion")],
    [card(5, "d")],
    [card(7, "e")],
    [card(6, "f")],
  ];
  const preview = previewHourlyPlacement(state, 0, 0);
  assert.deepEqual(preview.speciesMatch, {
    matched: true,
    speciesId: "dandelion",
    multiplier: HOURLY_SAME_SPECIES_MULTIPLIER,
  });
  assert.equal(preview.cardChain.length, 4);
  assert.equal(preview.connection.length, 4);
  assert.equal(preview.multiplier, 5);
  assert.equal(preview.points, 50);

  const result = playHourlyCard(state, 0, 0);
  assert.equal(result.harvest.speciesMatch.matched, true);
  assert.equal(state.score, 50);
});

test("three matching species are not enough and a fourth different species keeps the normal multiplier", () => {
  assert.equal(sameSpeciesHarvest([
    card(1, "a", "dandelion"),
    card(2, "b", "dandelion"),
    card(3, "c", "dandelion"),
  ]).matched, false);

  const state = ruleState();
  state.hand = [card(4, "played-4", "sunflower")];
  state.piles = [[
    card(1, "a", "dandelion"),
    card(2, "b", "dandelion"),
    card(3, "c", "dandelion"),
  ], [], [], []];
  const preview = previewHourlyPlacement(state, 0, 0);
  assert.equal(preview.speciesMatch.matched, false);
  assert.equal(preview.multiplier, 4);
  assert.equal(preview.points, 40);
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
  assert.equal(restored.hand[0].speciesId, run.hand[0].speciesId);
  assert.equal(restored.redrawsLeft, 2);
  assert.equal(restored.redrawsUsed, 1);
  assert.match(hourlyResultShareText(restored, "https://example.com"), /^스택스 #2026071311 도전중 0점 \/ 최대 \d+점 https:\/\/example\.com$/);
});
