import { createRng, shuffleInPlace } from "./random.js";
import { translateText } from "../i18n.js";

export const HOURLY_MODE = "hourly";
export const HOURLY_RULES_VERSION = "hourly-four-harvest-v7";
export const HOURLY_ASSET_VERSION = "broad-life-groups-v1";
export const HOURLY_HAND_SIZE = 5;
export const HOURLY_DECK_SIZE = 40;
export const HOURLY_PILE_COUNT = 4;
export const HOURLY_HARVEST_SIZE = 4;
export const HOURLY_REDRAW_LIMIT = 3;
export const HOURLY_COMBO_TYPE_COUNT = 5;
export const HOURLY_COMBO_TYPE_SIZE = 8;
export const HOURLY_SAME_TYPE_MULTIPLIER = 5;
export const HOURLY_MAX_CHAIN_MULTIPLIER = 4;
export const HOURLY_SCORE_TARGETS = Object.freeze({ one: 200, two: 300, three: 500 });
export const HOURLY_CLOCKWISE_ORDER = [0, 1, 3, 2];
export const HOURLY_GARDEN_LABELS = Object.freeze(["A", "B", "D", "C"]);
export const HOURLY_SHARE_URL = "https://plan9.kr/stacks";

const SPECIES = "public/assets/garden-stacks/generated/species";
const CALIFORNIA_NEWT = Object.freeze({
  speciesId: "california-newt",
  cardName: "캘리포니아영원",
  imagePath: `${SPECIES}/bio_0966_california_newt.png`,
});

export const HOURLY_COMBO_TYPES = Object.freeze([
  {
    comboTypeId: "flower",
    category: "flora",
    variants: [
      { speciesId: "dandelion", cardName: "민들레", imagePath: `${SPECIES}/bio_0001_dandelion.png` },
      { speciesId: "white-clover", cardName: "흰토끼풀", imagePath: `${SPECIES}/bio_0002_white_clover.png` },
      { speciesId: "sunflower", cardName: "해바라기", imagePath: `${SPECIES}/bio_0003_common_sunflower.png` },
      { speciesId: "hydrangea", cardName: "수국", imagePath: `${SPECIES}/bio_0004_bigleaf_hydrangea.png` },
      { speciesId: "yarrow", cardName: "서양톱풀", imagePath: `${SPECIES}/bio_0011_common_yarrow.png` },
      { speciesId: "red-clover", cardName: "붉은토끼풀", imagePath: `${SPECIES}/bio_0012_red_clover.png` },
      { speciesId: "lawn-daisy", cardName: "잔디데이지", imagePath: `${SPECIES}/bio_0030_lawn_daisy.png` },
      { speciesId: "oxeye-daisy", cardName: "큰데이지", imagePath: `${SPECIES}/bio_0039_oxeye_daisy.png` },
    ],
  },
  {
    comboTypeId: "tree",
    category: "flora",
    variants: [
      { speciesId: "maple", cardName: "단풍나무", imagePath: `${SPECIES}/bio_0005_japanese_maple.png` },
      { speciesId: "box-elder", cardName: "네군도단풍", imagePath: `${SPECIES}/bio_0019_box_elder.png` },
      { speciesId: "red-maple", cardName: "붉은단풍나무", imagePath: `${SPECIES}/bio_0028_red_maple.png` },
      { speciesId: "norway-maple", cardName: "노르웨이단풍", imagePath: `${SPECIES}/bio_0037_norway_maple.png` },
      { speciesId: "oak", cardName: "상수리나무", imagePath: `${SPECIES}/bio_0006_sawtooth_oak.png` },
      { speciesId: "northern-red-oak", cardName: "루브라참나무", imagePath: `${SPECIES}/bio_0057_northern_red_oak.png` },
      { speciesId: "white-oak", cardName: "흰참나무", imagePath: `${SPECIES}/bio_0133_white_oak.png` },
      { speciesId: "english-oak", cardName: "유럽참나무", imagePath: `${SPECIES}/bio_0077_english_oak.png` },
    ],
  },
  {
    comboTypeId: "amphibian",
    category: "fauna",
    variants: [
      { speciesId: "green-frog", cardName: "초록개구리", imagePath: `${SPECIES}/bio_0954_green_frog.png` },
      { speciesId: "bullfrog", cardName: "황소개구리", imagePath: `${SPECIES}/bio_0955_american_bullfrog.png` },
      { speciesId: "wood-frog", cardName: "숲개구리", imagePath: `${SPECIES}/bio_0960_wood_frog.png` },
      { speciesId: "leopard-frog", cardName: "북방표범개구리", imagePath: `${SPECIES}/bio_0962_northern_leopard_frog.png` },
      { speciesId: "american-toad", cardName: "미국두꺼비", imagePath: `${SPECIES}/bio_0953_american_toad.png` },
      { speciesId: "red-backed-salamander", cardName: "붉은등도롱뇽", imagePath: `${SPECIES}/bio_0956_eastern_red_backed_salamander.png` },
      CALIFORNIA_NEWT,
      { speciesId: "eastern-newt", cardName: "동부영원", imagePath: `${SPECIES}/bio_0963_eastern_newt.png` },
    ],
  },
  {
    comboTypeId: "bird",
    category: "fauna",
    variants: [
      { speciesId: "mallard", cardName: "청둥오리", imagePath: `${SPECIES}/bio_0793_mallard.png` },
      { speciesId: "canada-goose", cardName: "캐나다기러기", imagePath: `${SPECIES}/bio_0795_canada_goose.png` },
      { speciesId: "great-blue-heron", cardName: "큰푸른왜가리", imagePath: `${SPECIES}/bio_0797_great_blue_heron.png` },
      { speciesId: "green-winged-teal", cardName: "쇠오리", imagePath: `${SPECIES}/bio_0868_green_winged_teal.png` },
      { speciesId: "sparrow", cardName: "참새", imagePath: `${SPECIES}/bio_0794_house_sparrow.png` },
      { speciesId: "robin", cardName: "울새", imagePath: `${SPECIES}/bio_0796_american_robin.png` },
      { speciesId: "cardinal", cardName: "홍관조", imagePath: `${SPECIES}/bio_0799_northern_cardinal.png` },
      { speciesId: "house-finch", cardName: "집양진이", imagePath: `${SPECIES}/bio_0801_house_finch.png` },
    ],
  },
  {
    comboTypeId: "insect",
    category: "fauna",
    variants: [
      { speciesId: "honey-bee", cardName: "꿀벌", imagePath: `${SPECIES}/bio_0008_western_honey_bee.png` },
      { speciesId: "bumble-bee", cardName: "뒤영벌", imagePath: `${SPECIES}/bio_0657_common_eastern_bumble_bee.png` },
      { speciesId: "carpenter-bee", cardName: "목수벌", imagePath: `${SPECIES}/bio_0669_eastern_carpenter_bee.png` },
      { speciesId: "lady-beetle", cardName: "무당벌레", imagePath: `${SPECIES}/bio_0658_seven_spotted_lady_beetle.png` },
      { speciesId: "small-white", cardName: "배추흰나비", imagePath: `${SPECIES}/bio_0009_small_white.png` },
      { speciesId: "monarch", cardName: "제왕나비", imagePath: `${SPECIES}/bio_0656_monarch.png` },
      { speciesId: "red-admiral", cardName: "붉은줄나비", imagePath: `${SPECIES}/bio_0659_red_admiral.png` },
      { speciesId: "swallowtail", cardName: "호랑나비", imagePath: `${SPECIES}/bio_0662_eastern_tiger_swallowtail.png` },
    ],
  },
]);

export const HOURLY_SPECIES_POOL = Object.freeze(HOURLY_COMBO_TYPES.flatMap((comboType) => (
  comboType.variants.map((species) => ({
    ...species,
    comboTypeId: comboType.comboTypeId,
    category: comboType.category,
  }))
)));

// Kept as an export alias for callers that used the earlier art-list name.
export const HOURLY_ART_VARIANTS = HOURLY_SPECIES_POOL;

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

export function createHourlyDeck(seed) {
  const selectedTypes = shuffleInPlace(
    [...HOURLY_COMBO_TYPES],
    createRng(`${seed}:${HOURLY_RULES_VERSION}:${HOURLY_ASSET_VERSION}:type-order`),
  );

  const digitOrder = shuffleInPlace(
    Array.from({ length: 10 }, (_, digit) => digit),
    createRng(`${seed}:${HOURLY_RULES_VERSION}:${HOURLY_ASSET_VERSION}:digit-order`),
  );
  const omittedDigits = shuffleInPlace(
    [...digitOrder],
    createRng(`${seed}:${HOURLY_RULES_VERSION}:${HOURLY_ASSET_VERSION}:omitted-digits`),
  );
  const occurrences = Array(10).fill(0);
  const cards = [];
  selectedTypes.forEach((comboType, comboTypeIndex) => {
    const variants = shuffleInPlace(
      [...comboType.variants],
      createRng(`${seed}:${HOURLY_RULES_VERSION}:${HOURLY_ASSET_VERSION}:${comboType.comboTypeId}`),
    );
    const omitted = new Set(omittedDigits.slice(comboTypeIndex * 2, comboTypeIndex * 2 + 2));
    const typeDigits = digitOrder.filter((digit) => !omitted.has(digit));
    typeDigits.forEach((digit, variantIndex) => {
      const occurrence = occurrences[digit];
      const species = variants[variantIndex];
      occurrences[digit] += 1;
      cards.push({
        id: `${seed}:${digit}:${occurrence}`,
        digit,
        occurrence,
        comboTypeIndex,
        comboTypeId: comboType.comboTypeId,
        speciesId: species.speciesId,
        category: comboType.category,
        variantId: `${digit}:${species.speciesId}`,
        cardName: species.cardName,
        imagePath: species.imagePath,
      });
    });
  });
  return shuffleInPlace(cards, createRng(`${seed}:${HOURLY_RULES_VERSION}:deck`));
}

export function hourlyDeckOverview(state, sortMode = "digit") {
  if (!state?.seed) return [];
  const remainingIds = new Set(
    [...(state.hand ?? []), ...(state.deck ?? [])].map((card) => String(card.id)),
  );
  const typeOrder = new Map(HOURLY_COMBO_TYPES.map((comboType, index) => [comboType.comboTypeId, index]));
  const cards = createHourlyDeck(state.seed).map((card) => ({
    ...card,
    used: !remainingIds.has(String(card.id)),
  }));
  const byDigit = (a, b) => a.digit - b.digit
    || (typeOrder.get(a.comboTypeId) ?? 99) - (typeOrder.get(b.comboTypeId) ?? 99)
    || a.speciesId.localeCompare(b.speciesId);
  const byType = (a, b) => (typeOrder.get(a.comboTypeId) ?? 99) - (typeOrder.get(b.comboTypeId) ?? 99)
    || a.digit - b.digit
    || a.speciesId.localeCompare(b.speciesId);
  return cards.sort(sortMode === "type" ? byType : byDigit);
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

export function longestHourlyCardChain(cards) {
  const digits = Array.from(cards ?? [], (card) => safeInt(card?.digit ?? card, -1))
    .filter((digit) => digit >= 0 && digit <= 9);
  if (!digits.length) return { length: 0, direction: 0, startIndex: -1, digits: [] };

  let best = { length: 1, direction: 0, startIndex: 0, digits: [digits[0]] };
  for (let startIndex = 0; startIndex < digits.length; startIndex += 1) {
    let direction = 0;
    let length = 1;
    for (let index = startIndex + 1; index < digits.length; index += 1) {
      const step = circularDirection(digits[index - 1], digits[index]);
      if (!step) break;
      if (!direction) direction = step;
      if (step !== direction) break;
      length += 1;
    }
    if (length > best.length) {
      best = {
        length,
        direction: length > 1 ? direction : 0,
        startIndex,
        digits: digits.slice(startIndex, startIndex + length),
      };
    }
  }
  return best;
}

export function sameTypeHarvest(cards) {
  const comboTypeIds = Array.from(cards ?? [], (card) => String(card?.comboTypeId ?? ""));
  const comboTypeId = comboTypeIds[0] ?? "";
  const matched = comboTypeIds.length === HOURLY_HARVEST_SIZE
    && Boolean(comboTypeId)
    && comboTypeIds.every((candidate) => candidate === comboTypeId);
  return {
    matched,
    comboTypeId: matched ? comboTypeId : null,
    multiplier: matched ? HOURLY_SAME_TYPE_MULTIPLIER : 1,
  };
}

export function hourlyHarvestPath(piles, triggerIndex, harvestedCards = null) {
  const targetIndex = safeInt(triggerIndex, -1);
  if (targetIndex < 0 || targetIndex >= HOURLY_PILE_COUNT) return [];
  const targetPile = piles?.[targetIndex] ?? [];
  const cards = Array.isArray(harvestedCards) ? harvestedCards : targetPile;
  const positions = cards.slice(0, HOURLY_HARVEST_SIZE).map((card, cardIndex) => ({
    source: "harvest",
    pileIndex: targetIndex,
    cardIndex,
    digit: safeInt(card?.digit ?? card, -1),
  })).filter((position) => position.digit >= 0 && position.digit <= 9);

  for (const pileIndex of clockwisePileIndices(targetIndex).slice(1)) {
    const pile = piles?.[pileIndex] ?? [];
    const cardIndex = pile.length - 1;
    const digit = safeInt(pile[cardIndex]?.digit, -1);
    if (digit < 0 || digit > 9) break;
    positions.push({ source: "garden", pileIndex, cardIndex, digit });
  }
  return positions;
}

export function longestHourlyHarvestChain(piles, triggerIndex, harvestedCards = null) {
  const path = hourlyHarvestPath(piles, triggerIndex, harvestedCards);
  const chain = longestHourlyCardChain(path.map((position) => position.digit));
  const positions = chain.startIndex < 0
    ? []
    : path.slice(chain.startIndex, chain.startIndex + chain.length).map((position, chainIndex) => ({
        ...position,
        chainIndex,
      }));
  return {
    ...chain,
    multiplier: Math.max(1, Math.min(HOURLY_MAX_CHAIN_MULTIPLIER, chain.length)),
    path,
    positions,
  };
}

export function hourlyScoreTargets() {
  return copy(HOURLY_SCORE_TARGETS);
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
    };
  }

  const nextPiles = piles.map((pile) => [...pile]);
  nextPiles[targetIndex].push(card);
  const chainSum = nextPiles[targetIndex].reduce((sum, item) => sum + Number(item.digit), 0);
  const chain = longestHourlyHarvestChain(nextPiles, targetIndex, nextPiles[targetIndex]);
  const typeMatch = sameTypeHarvest(nextPiles[targetIndex]);
  const multiplier = Math.max(chain.multiplier, typeMatch.multiplier);
  const points = chainSum * multiplier;
  return {
    ok: true,
    card: copy(card),
    pileIndex: targetIndex,
    countAfter,
    cardsUntilHarvest: 0,
    harvest: true,
    chainSum,
    chain,
    typeMatch,
    multiplier,
    points,
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
      chain: copy(preview.chain),
      typeMatch: copy(preview.typeMatch),
      multiplier: preview.multiplier,
      points: preview.points,
    };
  }

  const drawnCard = state.deck.length ? copy(state.deck[0]) : null;
  refillHourlyHand(state);
  state.stars = starsForScore(state.score, state.thresholds);
  state.updatedAt = Date.now();
  if (!state.deck.length && !state.hand.length) {
    state.phase = "result";
    state.completedAt = Date.now();
  }
  return { ok: true, card: copy(card), drawnCard, preview: copy(preview), harvest: copy(state.lastHarvest), state };
}

function solverCardToken(card) {
  return Number(card.digit) * HOURLY_COMBO_TYPE_COUNT + Number(card.comboTypeIndex);
}

function solverTokenDigit(token) {
  return Math.floor(Number(token) / HOURLY_COMBO_TYPE_COUNT);
}

function solverTokenType(token) {
  return Number(token) % HOURLY_COMBO_TYPE_COUNT;
}

function encodeSolverToken(token) {
  return String.fromCharCode(0x100 + Number(token));
}

function decodeSolverToken(character) {
  return character.charCodeAt(0) - 0x100;
}

function compactHarvestChainMultiplier(piles, triggerIndex, digit) {
  const target = piles[triggerIndex];
  const pathDigits = [...`${target.digits}${digit}`].map(Number);
  for (const pileIndex of clockwisePileIndices(triggerIndex).slice(1)) {
    const next = piles[pileIndex]?.top ?? -1;
    if (next < 0) break;
    pathDigits.push(next);
  }
  return Math.max(1, Math.min(
    HOURLY_MAX_CHAIN_MULTIPLIER,
    longestHourlyCardChain(pathDigits).length,
  ));
}

function compactKey(hand, queue, piles, redrawsLeft) {
  return `${[...hand].sort((a, b) => a - b).join(".")}|${queue}|${redrawsLeft}|${piles.map((pile) => pile.tokens).join("/")}`;
}

function solverHeuristic(state) {
  let ready = 0;
  let occupancy = 0;
  for (const pile of state.piles) {
    occupancy += pile.count;
    if (pile.count === 3) {
      const sameTypeReady = pile.types.length === 3
        && [...pile.types].every((comboType) => comboType === pile.types[0]);
      ready += pile.sum * 2 + Math.max(0, pile.top) + (sameTypeReady ? 50 : 0);
    }
  }
  return state.score * 1000 + ready * 10 - occupancy + state.redrawsLeft;
}

function solverPlayTransition(state, token, handIndex, pileIndex) {
  const digit = solverTokenDigit(token);
  const comboTypeIndex = solverTokenType(token);
  const piles = state.piles.map((pile) => ({ ...pile }));
  const pile = piles[pileIndex];
  let gain = 0;
  if (pile.count === 3) {
    const chainMultiplier = compactHarvestChainMultiplier(piles, pileIndex, digit);
    const sameType = pile.types.length === 3
      && [...pile.types].every((comboType) => Number(comboType) === comboTypeIndex);
    const multiplier = Math.max(
      chainMultiplier,
      sameType ? HOURLY_SAME_TYPE_MULTIPLIER : 1,
    );
    gain = (pile.sum + digit) * multiplier;
    piles[pileIndex] = { count: 0, sum: 0, top: -1, digits: "", types: "", tokens: "" };
  } else {
    piles[pileIndex] = {
      count: pile.count + 1,
      sum: pile.sum + digit,
      top: digit,
      digits: `${pile.digits}${digit}`,
      types: `${pile.types}${comboTypeIndex}`,
      tokens: `${pile.tokens}${encodeSolverToken(token)}`,
    };
  }

  const hand = state.hand.filter((_, index) => index !== handIndex);
  let queue = state.queue;
  if (queue.length) {
    hand.push(decodeSolverToken(queue[0]));
    queue = queue.slice(1);
  }
  return {
    hand,
    queue,
    piles,
    score: state.score + gain,
    redrawsLeft: state.redrawsLeft,
    trail: { action: { type: "play", digit, comboTypeIndex, pileIndex }, previous: state.trail },
  };
}

function solverRedrawTransition(state) {
  if (state.redrawsLeft <= 0 || !state.queue.length || !state.hand.length) return null;
  const rotated = `${state.queue}${state.hand.map(encodeSolverToken).join("")}`;
  return {
    hand: [...rotated.slice(0, HOURLY_HAND_SIZE)].map(decodeSolverToken),
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
  const deckTokens = createHourlyDeck(seed).map(solverCardToken);
  const emptyPile = () => ({ count: 0, sum: 0, top: -1, digits: "", types: "", tokens: "" });
  let beam = [{
    hand: deckTokens.slice(0, HOURLY_HAND_SIZE),
    queue: deckTokens.slice(HOURLY_HAND_SIZE).map(encodeSolverToken).join(""),
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
        const seenCards = new Set();
        for (let handIndex = 0; handIndex < option.hand.length; handIndex += 1) {
          const token = option.hand[handIndex];
          if (seenCards.has(token)) continue;
          seenCards.add(token);
          for (let pileIndex = 0; pileIndex < HOURLY_PILE_COUNT; pileIndex += 1) {
            const next = solverPlayTransition(option, token, handIndex, pileIndex);
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
    thresholds: hourlyScoreTargets(),
    path: materializeSolverPath(best?.trail),
    exploredStates,
    verified: true,
    solverVersion: `${HOURLY_RULES_VERSION}:beam-${beamWidth}`,
  };
}

export function newHourlyRun(seed, options = {}) {
  const solution = options.solution ?? null;
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
    thresholds: hourlyScoreTargets(),
    solverVersion: solution?.solverVersion ?? null,
    solverVerified: solution?.verified === true,
    cardsPlayed: 0,
    harvests: 0,
    redrawsLeft: HOURLY_REDRAW_LIMIT,
    redrawsUsed: 0,
    stars: 0,
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
  if (!Array.isArray(state.hand)
    || !Array.isArray(state.deck)
    || !Array.isArray(state.piles)
    || state.piles.length !== 4
    || state.piles.some((pile) => !Array.isArray(pile))) return null;
  const migrateSpecies = (card) => card?.speciesId === "european-toad"
    ? {
        ...card,
        ...CALIFORNIA_NEWT,
        variantId: `${safeInt(card.digit)}:${CALIFORNIA_NEWT.speciesId}`,
      }
    : card;
  state.hand = state.hand.map(migrateSpecies);
  state.deck = state.deck.map(migrateSpecies);
  state.piles = state.piles.map((pile) => pile.map(migrateSpecies));
  state.score = Math.max(0, safeInt(state.score));
  state.cardsPlayed = Math.max(0, safeInt(state.cardsPlayed));
  state.harvests = Math.max(0, safeInt(state.harvests));
  state.redrawsLeft = Math.max(0, Math.min(HOURLY_REDRAW_LIMIT, safeInt(state.redrawsLeft, HOURLY_REDRAW_LIMIT)));
  state.redrawsUsed = Math.max(0, Math.min(HOURLY_REDRAW_LIMIT, safeInt(state.redrawsUsed, HOURLY_REDRAW_LIMIT - state.redrawsLeft)));
  state.thresholds = hourlyScoreTargets();
  state.stars = starsForScore(state.score, state.thresholds);
  delete state.maximumScore;
  delete state.perfect;
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
    const handIndex = run.hand.findIndex((card) => (
      card.digit === action.digit && card.comboTypeIndex === action.comboTypeIndex
    ));
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
  const result = "★".repeat(state.stars) || translateText(language, "share.statusInProgress");
  return translateText(language, "share.result", {
    seed: state.seed,
    result,
    score: state.score,
    target: state.thresholds?.three ?? HOURLY_SCORE_TARGETS.three,
    url,
  });
}

export function hourlyRootUrl(origin, pathname = "/") {
  const base = String(origin ?? "").replace(/\/$/, "");
  const path = String(pathname || "/");
  const rootedPath = (path.startsWith("/") ? path : `/${path}`).replace(/\/simple\/?$/, "/");
  return `${base}${rootedPath}`;
}

export function hourlyRunStorageKey(seed) {
  return `garden-stacks:hourly-v7:${seed}:run`;
}

export function hourlyBestStorageKey(seed) {
  return `garden-stacks:hourly-v7:${seed}:best`;
}

export const HOURLY_ACTIVE_SEED_KEY = "garden-stacks:hourly-v7:active-seed";
