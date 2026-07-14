import { createRng, shuffleInPlace } from "./random.js";
import { translateText } from "../i18n.js";

export const HOURLY_MODE = "hourly";
export const HOURLY_RULES_VERSION = "hourly-four-harvest-v2";
export const HOURLY_ASSET_VERSION = "seed-art-v1";
export const HOURLY_HAND_SIZE = 5;
export const HOURLY_DECK_SIZE = 40;
export const HOURLY_PILE_COUNT = 4;
export const HOURLY_HARVEST_SIZE = 4;
export const HOURLY_REDRAW_LIMIT = 3;
export const HOURLY_CLOCKWISE_ORDER = [0, 1, 3, 2];
export const HOURLY_GARDEN_LABELS = Object.freeze(["A", "B", "D", "C"]);
export const HOURLY_SHARE_URL = "https://plan9.kr/stacks";

const CARDS = "public/assets/garden-stacks/generated/cards";
const SPECIES = "public/assets/garden-stacks/generated/species";

export const HOURLY_ART_VARIANTS = {
  0: [
    ["meadow", "초지", `${CARDS}/floor_meadow.png`],
    ["forest", "숲길", `${CARDS}/floor_forest.png`],
    ["wetland", "물가", `${CARDS}/floor_wetland.png`],
    ["shade-walk", "그늘길", `${CARDS}/floor_forest_shade_walk.png`],
  ],
  1: [
    ["dandelion", "민들레", `${SPECIES}/bio_0001_dandelion.png`],
    ["white-clover", "흰토끼풀", `${SPECIES}/bio_0002_white_clover.png`],
    ["yarrow", "서양톱풀", `${SPECIES}/bio_0011_common_yarrow.png`],
    ["red-clover", "붉은토끼풀", `${SPECIES}/bio_0012_red_clover.png`],
  ],
  2: [
    ["sunflower", "해바라기", `${SPECIES}/bio_0003_common_sunflower.png`],
    ["hydrangea", "수국", `${SPECIES}/bio_0004_bigleaf_hydrangea.png`],
    ["lawn-daisy", "잔디데이지", `${SPECIES}/bio_0030_lawn_daisy.png`],
    ["oxeye-daisy", "큰데이지", `${SPECIES}/bio_0039_oxeye_daisy.png`],
  ],
  3: [
    ["honey-bee", "꿀벌", `${SPECIES}/bio_0008_western_honey_bee.png`],
    ["bumble-bee", "뒤영벌", `${SPECIES}/bio_0657_common_eastern_bumble_bee.png`],
    ["carpenter-bee", "목수벌", `${SPECIES}/bio_0669_eastern_carpenter_bee.png`],
    ["lady-beetle", "무당벌레", `${SPECIES}/bio_0658_seven_spotted_lady_beetle.png`],
  ],
  4: [
    ["watering", "물주기", `${CARDS}/hand_watering.png`],
    ["soil-test", "흙살피기", `${CARDS}/work_soil_test.png`],
    ["puddle", "빗물받기", `${CARDS}/work_temporary_puddle.png`],
    ["conservation", "정원돌봄", `${CARDS}/plan_conservation_work.png`],
  ],
  5: [
    ["maple", "단풍나무", `${SPECIES}/bio_0005_japanese_maple.png`],
    ["oak", "상수리나무", `${SPECIES}/bio_0006_sawtooth_oak.png`],
    ["white-oak", "흰참나무", `${SPECIES}/bio_0133_white_oak.png`],
    ["birch", "자작나무", `${SPECIES}/bio_0162_silver_birch.png`],
  ],
  6: [
    ["small-white", "배추흰나비", `${SPECIES}/bio_0009_small_white.png`],
    ["monarch", "제왕나비", `${SPECIES}/bio_0656_monarch.png`],
    ["red-admiral", "붉은줄나비", `${SPECIES}/bio_0659_red_admiral.png`],
    ["swallowtail", "호랑나비", `${SPECIES}/bio_0662_eastern_tiger_swallowtail.png`],
  ],
  7: [
    ["pruning", "가지치기", `${CARDS}/hand_pruning.png`],
    ["flora-watch", "꽃살피기", `${CARDS}/work_flora_comparison.png`],
    ["survey", "정원조사", `${CARDS}/work_region_ecology_survey.png`],
    ["habitat", "꽃자리", `${CARDS}/plan_pollinator_habitat.png`],
  ],
  8: [
    ["reed", "갈대", `${SPECIES}/bio_0007_common_reed.png`],
    ["cattail", "부들", `${SPECIES}/bio_0156_broadleaf_cattail.png`],
    ["waterlily", "수련", `${SPECIES}/bio_0444_american_white_waterlily.png`],
    ["watercress", "물냉이", `${SPECIES}/bio_0586_watercress.png`],
  ],
  9: [
    ["mallard", "청둥오리", `${SPECIES}/bio_0793_mallard.png`],
    ["sparrow", "참새", `${SPECIES}/bio_0794_house_sparrow.png`],
    ["robin", "울새", `${SPECIES}/bio_0796_american_robin.png`],
    ["cardinal", "홍관조", `${SPECIES}/bio_0799_northern_cardinal.png`],
  ],
};

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

export function hourlyGardenLabel(pileIndex) {
  return HOURLY_GARDEN_LABELS[safeInt(pileIndex, -1)] ?? "?";
}

export function kstHourSeed(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  return `${year}${month}${day}${hour}`;
}

export function secondsUntilNextHour(date = new Date()) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return Math.max(0, Math.ceil((next.getTime() - date.getTime()) / 1000));
}

export function formatDuration(totalSeconds) {
  const safe = Math.max(0, safeInt(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function variantFor(seed, digit, occurrence) {
  const variants = HOURLY_ART_VARIANTS[digit] ?? HOURLY_ART_VARIANTS[0];
  const order = variants.map((_, index) => index);
  shuffleInPlace(order, createRng(`${seed}:${HOURLY_RULES_VERSION}:${HOURLY_ASSET_VERSION}:${digit}`));
  const variant = variants[order[occurrence % order.length]] ?? variants[0];
  return {
    variantId: `${digit}:${variant[0]}`,
    cardName: variant[1],
    imagePath: variant[2],
  };
}

export function createHourlyDeck(seed) {
  const cards = [];
  for (let digit = 0; digit <= 9; digit += 1) {
    for (let occurrence = 0; occurrence < 4; occurrence += 1) {
      cards.push({
        id: `${seed}:${digit}:${occurrence}`,
        digit,
        occurrence,
        ...variantFor(seed, digit, occurrence),
      });
    }
  }
  return shuffleInPlace(cards, createRng(`${seed}:${HOURLY_RULES_VERSION}:deck`));
}

export function clockwisePileIndices(startIndex) {
  const safe = Math.max(0, Math.min(HOURLY_PILE_COUNT - 1, safeInt(startIndex)));
  const position = HOURLY_CLOCKWISE_ORDER.indexOf(safe);
  return Array.from({ length: HOURLY_PILE_COUNT }, (_, offset) => (
    HOURLY_CLOCKWISE_ORDER[(position + offset) % HOURLY_PILE_COUNT]
  ));
}

function circularDirection(from, to) {
  if (to === (from + 1) % 10) return 1;
  if (to === (from + 9) % 10) return -1;
  return 0;
}

export function gardenConnection(piles, triggerIndex, triggerDigit = null) {
  const order = clockwisePileIndices(triggerIndex);
  const firstPile = piles[triggerIndex] ?? [];
  const firstDigit = triggerDigit ?? firstPile[firstPile.length - 1]?.digit;
  if (firstDigit == null) return { length: 1, direction: 0, pileIndices: [triggerIndex], digits: [] };

  const pileIndices = [triggerIndex];
  const digits = [Number(firstDigit)];
  let direction = 0;
  let previous = Number(firstDigit);

  for (const pileIndex of order.slice(1)) {
    const pile = piles[pileIndex] ?? [];
    const digit = pile[pile.length - 1]?.digit;
    if (digit == null) break;
    if (!direction) direction = circularDirection(previous, Number(digit));
    if (!direction || Number(digit) !== (previous + direction + 10) % 10) break;
    pileIndices.push(pileIndex);
    digits.push(Number(digit));
    previous = Number(digit);
  }

  return {
    length: pileIndices.length,
    direction: pileIndices.length >= 2 ? direction : 0,
    pileIndices,
    digits,
  };
}

export function thresholdsForMaximum(maxScore) {
  const maximum = Math.max(1, safeInt(maxScore, 1));
  const rounded = (ratio) => Math.max(10, Math.floor((maximum * ratio) / 10) * 10);
  let one = rounded(0.35);
  let two = Math.max(one + 10, rounded(0.6));
  let three = Math.max(two + 10, rounded(0.8));
  if (three >= maximum) three = Math.max(three, maximum);
  if (two >= three) two = Math.max(10, three - 10);
  if (one >= two) one = Math.max(10, two - 10);
  return { one, two, three, perfect: maximum };
}

export function starsForScore(score, thresholds) {
  const points = Math.max(0, safeInt(score));
  if (points >= thresholds.three) return 3;
  if (points >= thresholds.two) return 2;
  if (points >= thresholds.one) return 1;
  return 0;
}

export function previewHourlyPlacement(state, handIndex, pileIndex) {
  const hand = state?.hand ?? [];
  const piles = state?.piles ?? [];
  const card = hand[safeInt(handIndex)];
  const targetIndex = safeInt(pileIndex, -1);
  if (state?.phase !== "play") return { ok: false, reason: "not_playing" };
  if (!card) return { ok: false, reason: "missing_card" };
  if (targetIndex < 0 || targetIndex >= HOURLY_PILE_COUNT) return { ok: false, reason: "missing_pile" };

  const target = piles[targetIndex] ?? [];
  const countAfter = target.length + 1;
  if (countAfter < HOURLY_HARVEST_SIZE) {
    return {
      ok: true,
      card: copy(card),
      pileIndex: targetIndex,
      countAfter,
      cardsUntilHarvest: HOURLY_HARVEST_SIZE - countAfter,
      harvest: false,
      points: 0,
      connection: { length: 1, direction: 0, pileIndices: [targetIndex], digits: [card.digit] },
    };
  }

  const nextPiles = piles.map((pile) => [...pile]);
  nextPiles[targetIndex].push(card);
  const chainSum = nextPiles[targetIndex].reduce((sum, item) => sum + Number(item.digit), 0);
  const connection = gardenConnection(nextPiles, targetIndex, card.digit);
  const points = chainSum * connection.length;
  return {
    ok: true,
    card: copy(card),
    pileIndex: targetIndex,
    countAfter,
    cardsUntilHarvest: 0,
    harvest: true,
    chainSum,
    points,
    connection,
  };
}

function refillHourlyHand(state) {
  while (state.hand.length < HOURLY_HAND_SIZE && state.deck.length) {
    state.hand.push(state.deck.shift());
  }
}

export function canRedrawHourlyHand(state) {
  return state?.phase === "play"
    && safeInt(state.redrawsLeft) > 0
    && Array.isArray(state.deck)
    && state.deck.length > 0
    && Array.isArray(state.hand)
    && state.hand.length > 0;
}

export function redrawHourlyHand(state) {
  if (state?.phase !== "play") return { ok: false, reason: "not_playing" };
  if (safeInt(state.redrawsLeft) <= 0) return { ok: false, reason: "no_redraws" };
  if (!state.deck?.length || !state.hand?.length) return { ok: false, reason: "no_new_cards" };

  const previousHand = state.hand.splice(0);
  state.deck.push(...previousHand);
  refillHourlyHand(state);
  state.redrawsLeft -= 1;
  state.redrawsUsed += 1;
  state.updatedAt = Date.now();
  return {
    ok: true,
    previousHand: copy(previousHand),
    hand: copy(state.hand),
    redrawsLeft: state.redrawsLeft,
    state,
  };
}

export function playHourlyCard(state, handIndex, pileIndex) {
  const preview = previewHourlyPlacement(state, handIndex, pileIndex);
  if (!preview.ok) return preview;
  const card = state.hand.splice(safeInt(handIndex), 1)[0];
  state.piles[preview.pileIndex].push(card);
  state.cardsPlayed += 1;
  state.lastHarvest = null;

  if (preview.harvest) {
    const cards = state.piles[preview.pileIndex].splice(0);
    state.score += preview.points;
    state.harvests += 1;
    state.lastHarvest = {
      pileIndex: preview.pileIndex,
      cards: copy(cards),
      chainSum: preview.chainSum,
      connection: copy(preview.connection),
      points: preview.points,
    };
  }

  refillHourlyHand(state);
  state.stars = starsForScore(state.score, state.thresholds);
  state.perfect = state.score >= state.maximumScore;
  state.updatedAt = Date.now();
  if (!state.deck.length && !state.hand.length) {
    state.phase = "result";
    state.completedAt = Date.now();
  }
  return { ok: true, card: copy(card), preview: copy(preview), harvest: copy(state.lastHarvest), state };
}

function compactPile(cards) {
  return cards.reduce((pile, digit) => ({
    count: pile.count + 1,
    sum: pile.sum + Number(digit),
    top: Number(digit),
  }), { count: 0, sum: 0, top: -1 });
}

function compactConnection(piles, triggerIndex, digit) {
  const order = clockwisePileIndices(triggerIndex);
  let length = 1;
  let direction = 0;
  let previous = digit;
  for (const pileIndex of order.slice(1)) {
    const next = piles[pileIndex]?.top ?? -1;
    if (next < 0) break;
    if (!direction) direction = circularDirection(previous, next);
    if (!direction || next !== (previous + direction + 10) % 10) break;
    length += 1;
    previous = next;
  }
  return length;
}

function compactKey(hand, queue, piles, redrawsLeft) {
  return `${[...hand].sort((a, b) => a - b).join("")}|${queue}|${redrawsLeft}|${piles.map((pile) => `${pile.count},${pile.sum},${pile.top}`).join("/")}`;
}

function solverHeuristic(state) {
  let ready = 0;
  let occupancy = 0;
  for (const pile of state.piles) {
    occupancy += pile.count;
    if (pile.count === 3) ready += pile.sum * 2 + Math.max(0, pile.top);
  }
  return state.score * 1000 + ready * 10 - occupancy + state.redrawsLeft;
}

function solverPlayTransition(state, digit, handIndex, pileIndex) {
  const piles = state.piles.map((pile) => ({ ...pile }));
  const pile = piles[pileIndex];
  let gain = 0;
  if (pile.count === 3) {
    gain = (pile.sum + digit) * compactConnection(piles, pileIndex, digit);
    piles[pileIndex] = { count: 0, sum: 0, top: -1 };
  } else {
    piles[pileIndex] = { count: pile.count + 1, sum: pile.sum + digit, top: digit };
  }

  const hand = state.hand.filter((_, index) => index !== handIndex);
  let queue = state.queue;
  if (queue.length) {
    hand.push(Number(queue[0]));
    queue = queue.slice(1);
  }
  return {
    hand,
    queue,
    piles,
    score: state.score + gain,
    redrawsLeft: state.redrawsLeft,
    trail: { action: { type: "play", digit, pileIndex }, previous: state.trail },
  };
}

function solverRedrawTransition(state) {
  if (state.redrawsLeft <= 0 || !state.queue.length || !state.hand.length) return null;
  const rotated = `${state.queue}${state.hand.join("")}`;
  return {
    hand: [...rotated.slice(0, HOURLY_HAND_SIZE)].map(Number),
    queue: rotated.slice(HOURLY_HAND_SIZE),
    piles: state.piles,
    score: state.score,
    redrawsLeft: state.redrawsLeft - 1,
    trail: { action: { type: "redraw" }, previous: state.trail },
  };
}

function solverRedrawOptions(state) {
  const options = [state];
  let next = state;
  while (next.redrawsLeft > 0 && next.queue.length) {
    next = solverRedrawTransition(next);
    if (!next) break;
    options.push(next);
  }
  return options;
}

function materializeSolverPath(trail) {
  const path = [];
  let current = trail;
  while (current) {
    path.push(current.action);
    current = current.previous;
  }
  return path.reverse();
}

export function solveHourlyHarvestMaximum(seed, options = {}) {
  const beamWidth = Math.max(250, safeInt(options.beamWidth, 6000));
  const deckDigits = createHourlyDeck(seed).map((card) => card.digit);
  const emptyPile = () => ({ count: 0, sum: 0, top: -1 });
  let beam = [{
    hand: deckDigits.slice(0, HOURLY_HAND_SIZE),
    queue: deckDigits.slice(HOURLY_HAND_SIZE).join(""),
    piles: [emptyPile(), emptyPile(), emptyPile(), emptyPile()],
    score: 0,
    redrawsLeft: HOURLY_REDRAW_LIMIT,
    trail: null,
  }];
  let exploredStates = 0;

  for (let turn = 0; turn < HOURLY_DECK_SIZE; turn += 1) {
    const unique = new Map();
    for (const state of beam) {
      for (const option of solverRedrawOptions(state)) {
        const seenDigits = new Set();
        for (let handIndex = 0; handIndex < option.hand.length; handIndex += 1) {
          const digit = option.hand[handIndex];
          if (seenDigits.has(digit)) continue;
          seenDigits.add(digit);
          for (let pileIndex = 0; pileIndex < HOURLY_PILE_COUNT; pileIndex += 1) {
            const next = solverPlayTransition(option, digit, handIndex, pileIndex);
            const key = compactKey(next.hand, next.queue, next.piles, next.redrawsLeft);
            const previous = unique.get(key);
            if (!previous || next.score > previous.score) unique.set(key, next);
            exploredStates += 1;
          }
        }
      }
    }
    beam = [...unique.values()]
      .sort((a, b) => solverHeuristic(b) - solverHeuristic(a) || b.score - a.score)
      .slice(0, beamWidth);
  }

  const best = beam.sort((a, b) => b.score - a.score)[0];
  return {
    seed,
    maximumScore: best?.score ?? 1,
    thresholds: thresholdsForMaximum(best?.score ?? 1),
    path: materializeSolverPath(best?.trail),
    exploredStates,
    verified: true,
    solverVersion: `${HOURLY_RULES_VERSION}:beam-${beamWidth}`,
  };
}

export function newHourlyRun(seed, options = {}) {
  const solution = options.solution ?? solveHourlyHarvestMaximum(seed, options);
  const deck = createHourlyDeck(seed);
  const state = {
    version: HOURLY_RULES_VERSION,
    mode: HOURLY_MODE,
    seed,
    phase: "play",
    deck,
    hand: [],
    piles: Array.from({ length: HOURLY_PILE_COUNT }, () => []),
    score: 0,
    maximumScore: solution.maximumScore,
    thresholds: copy(solution.thresholds),
    solverVersion: solution.solverVersion,
    solverVerified: solution.verified === true,
    cardsPlayed: 0,
    harvests: 0,
    redrawsLeft: HOURLY_REDRAW_LIMIT,
    redrawsUsed: 0,
    stars: 0,
    perfect: false,
    lastHarvest: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
  };
  refillHourlyHand(state);
  return state;
}

export function snapshotHourlyRun(state) {
  if (state?.mode !== HOURLY_MODE) return null;
  return copy(state);
}

export function restoreHourlyRun(snapshot) {
  if (!snapshot || snapshot.mode !== HOURLY_MODE || snapshot.version !== HOURLY_RULES_VERSION) return null;
  const state = copy(snapshot);
  if (!Array.isArray(state.hand) || !Array.isArray(state.deck) || !Array.isArray(state.piles) || state.piles.length !== 4) return null;
  state.score = Math.max(0, safeInt(state.score));
  state.cardsPlayed = Math.max(0, safeInt(state.cardsPlayed));
  state.harvests = Math.max(0, safeInt(state.harvests));
  state.redrawsLeft = Math.max(0, Math.min(HOURLY_REDRAW_LIMIT, safeInt(state.redrawsLeft, HOURLY_REDRAW_LIMIT)));
  state.redrawsUsed = Math.max(0, Math.min(HOURLY_REDRAW_LIMIT, safeInt(state.redrawsUsed, HOURLY_REDRAW_LIMIT - state.redrawsLeft)));
  state.maximumScore = Math.max(1, safeInt(state.maximumScore, 1));
  state.thresholds = thresholdsForMaximum(state.maximumScore);
  state.stars = starsForScore(state.score, state.thresholds);
  state.perfect = state.score >= state.maximumScore;
  state.phase = state.phase === "result" ? "result" : "play";
  return state;
}

export function replayHourlySolution(seed, solution) {
  const run = newHourlyRun(seed, { solution });
  for (const action of solution.path ?? []) {
    if (action.type === "redraw") {
      const result = redrawHourlyHand(run);
      if (!result.ok) return { ok: false, reason: result.reason, state: run };
      continue;
    }
    if (action.type && action.type !== "play") return { ok: false, reason: "unknown_solution_action", state: run };
    const handIndex = run.hand.findIndex((card) => card.digit === action.digit);
    if (handIndex < 0) return { ok: false, reason: "missing_solution_card", state: run };
    const result = playHourlyCard(run, handIndex, action.pileIndex);
    if (!result.ok) return { ok: false, reason: result.reason, state: run };
  }
  return {
    ok: run.phase === "result" && run.score === solution.maximumScore,
    score: run.score,
    state: run,
  };
}

export function hourlyResultShareText(state, url = HOURLY_SHARE_URL, language = "ko") {
  const result = state.perfect
    ? "PERFECT"
    : "★".repeat(state.stars) || translateText(language, "share.statusInProgress");
  return translateText(language, "share.result", {
    seed: state.seed,
    result,
    score: state.score,
    maximum: state.maximumScore,
    url,
  });
}

export function hourlyRunStorageKey(seed) {
  return `garden-stacks:hourly-v2:${seed}:run`;
}

export function hourlyBestStorageKey(seed) {
  return `garden-stacks:hourly-v2:${seed}:best`;
}

export function hourlySolutionStorageKey(seed) {
  return `garden-stacks:hourly-v2:${seed}:solution`;
}

export const HOURLY_ACTIVE_SEED_KEY = "garden-stacks:hourly-v2:active-seed";
