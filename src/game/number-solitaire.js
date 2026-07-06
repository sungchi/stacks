import { createRng, shuffleInPlace } from "./random.js";
import {
  CAMPAIGN_STAGES,
  CATEGORY_ORDER,
  COLOR_ORDER,
  COMBO_LABELS,
  DIGITS,
  LANDS,
  META_UPGRADE_ORDER,
  META_UPGRADES,
  REWARDS,
  categoryLabel,
  categoryShort,
  colorLabel,
  colorShort,
  digitCard,
  rewardById,
  stageByIndex,
} from "./catalog.js";

export const VERSION = "4.1-web-number-solitaire";
export const STARTER_TARGET_REPUTATION = 295;
export const STARTER_PLAYS = 18;
export const STARTER_DISCARDS = 3;
export const HAND_SIZE = 5;
export const STARTER_SHOP_COINS = 2;
export const STAGE_CLEAR_BASE_PAYOUT = 4;
export const STAGE_FAILURE_PAYOUT = META_UPGRADES.starterSprout.cost[0];
export const PILE_COUNT = 4;

const TYPE_ORDER_NEXT = {
  terrain: "flora",
  flora: "fauna",
  fauna: "action",
  action: "terrain",
};

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max = null) {
  const parsed = Math.floor(Number(value) || min);
  if (parsed < min) return min;
  if (max != null && parsed > max) return max;
  return parsed;
}

function rounded(value) {
  return Math.floor(Number(value) + 0.5);
}

function nextRng(state, purpose = "rng") {
  const cursor = state.rngCursor ?? 0;
  state.rngCursor = cursor + 1;
  return createRng(`${state.seed ?? 4040}:${purpose}:${cursor}`);
}

function shuffle(state, list, purpose = "shuffle") {
  return shuffleInPlace(list, nextRng(state, purpose));
}

function cardCategory(card) {
  return card?.category ?? digitCard(card?.digit)?.category ?? null;
}

function cardColor(card) {
  return card?.color ?? digitCard(card?.digit)?.color ?? null;
}

function defaultPile(index) {
  return {
    id: `pile_${index}`,
    label: `정원 ${index}`,
    cards: [],
    lastDigit: null,
    baseTotal: 0,
    comboStep: 0,
    comboMultiplier: 1,
    bestComboStep: 0,
    nextScoreBonus: 0,
    history: [],
  };
}

function fallbackMultiplierForTopDigit(source) {
  let digit = source?.lastDigit;
  if (digit == null && source?.cards?.length) {
    digit = source.cards[source.cards.length - 1]?.digit;
  }
  return digit == null ? 1 : resetMultiplierForDigit(digit);
}

export function normalizePiles(piles) {
  const out = [];
  for (let i = 1; i <= PILE_COUNT; i += 1) {
    const source = piles?.[i - 1] ?? {};
    const pile = defaultPile(i);
    pile.id = source.id ?? pile.id;
    pile.label = source.label ?? pile.label;
    pile.cards = copy(source.cards ?? []);
    pile.lastDigit = source.lastDigit ?? source.last_digit ?? null;
    if (pile.lastDigit == null && pile.cards.length > 0) {
      pile.lastDigit = pile.cards[pile.cards.length - 1]?.digit ?? null;
    }
    pile.baseTotal = Math.max(0, Math.floor(Number(source.baseTotal ?? source.base_total) || 0));
    if (pile.baseTotal <= 0 && pile.cards.length > 0) {
      pile.baseTotal = pile.cards.reduce((sum, card) => sum + Math.max(0, Math.floor(Number(card.digit) || 0)), 0);
    }
    pile.comboStep = Math.max(0, Math.floor(Number(source.comboStep ?? source.combo_step) || 0));
    pile.comboMultiplier = Number(source.comboMultiplier ?? source.combo_multiplier) || fallbackMultiplierForTopDigit(pile);
    pile.bestComboStep = Math.max(0, Math.floor(Number(source.bestComboStep ?? source.best_combo_step ?? pile.comboStep) || 0));
    pile.nextScoreBonus = Math.max(0, Number(source.nextScoreBonus ?? source.next_score_bonus) || 0);
    pile.history = copy(source.history ?? []);
    out.push(pile);
  }
  return out;
}

function ensurePiles(state) {
  state.piles = normalizePiles(state?.piles);
  return state.piles;
}

export function makeCard(digit, serial = 1, opts = {}) {
  const archetype = digitCard(digit) ?? {};
  return {
    id: opts.id ?? `num_${digit}_${String(serial).padStart(2, "0")}`,
    digit: Number(digit),
    cardName: opts.cardName ?? archetype.cardName ?? `숫자 ${digit}`,
    category: opts.category ?? archetype.category,
    categoryLabel: categoryLabel(opts.category ?? archetype.category),
    color: opts.color ?? archetype.color,
    colorLabel: colorLabel(opts.color ?? archetype.color),
    assetKey: opts.assetKey ?? archetype.assetKey,
    imageId: opts.imageId ?? archetype.imageId,
    landMark: opts.landMark,
    bonus: opts.bonus,
    temporary: opts.temporary === true,
  };
}

export function starterDeck() {
  const deck = [];
  for (let copyIndex = 1; copyIndex <= 2; copyIndex += 1) {
    for (let digit = 0; digit <= 9; digit += 1) {
      deck.push(makeCard(digit, copyIndex));
    }
  }
  return deck;
}

export function ensureCodex(codex = {}) {
  const out = copy(codex) ?? {};
  out.knownDigits = out.knownDigits ?? {};
  out.knownCombos = out.knownCombos ?? {};
  out.knownLands = out.knownLands ?? {};
  out.seenRewards = out.seenRewards ?? {};
  out.discoveredRewards = out.discoveredRewards ?? {};
  for (const item of DIGITS) out.knownDigits[item.digit] = true;
  for (const id of ["same", "neighbor", "sum9", "parity", "double"]) out.knownCombos[id] = true;
  for (const id of Object.keys(LANDS)) out.knownLands[id] = true;
  return out;
}

export function defaultCampaignProgress() {
  return {
    highestUnlockedStage: 1,
    lastSelectedStage: 1,
    cleared: {},
    bestReputation: {},
    bestCombo: {},
    attempts: {},
  };
}

export function normalizeCampaignProgress(progress = {}) {
  const out = defaultCampaignProgress();
  out.highestUnlockedStage = clampInt(progress.highestUnlockedStage ?? progress.highest_unlocked_stage ?? 1, 1, CAMPAIGN_STAGES.length);
  out.lastSelectedStage = clampInt(progress.lastSelectedStage ?? progress.last_selected_stage ?? out.highestUnlockedStage, 1, CAMPAIGN_STAGES.length);
  for (let i = 1; i <= CAMPAIGN_STAGES.length; i += 1) {
    const key = String(i);
    if (progress.cleared?.[i] || progress.cleared?.[key]) out.cleared[i] = true;
    out.bestReputation[i] = Math.max(0, Math.floor(Number(progress.bestReputation?.[i] ?? progress.bestReputation?.[key] ?? progress.best_reputation?.[i] ?? progress.best_reputation?.[key]) || 0));
    out.bestCombo[i] = Math.max(0, Math.floor(Number(progress.bestCombo?.[i] ?? progress.bestCombo?.[key] ?? progress.best_combo?.[i] ?? progress.best_combo?.[key]) || 0));
    out.attempts[i] = Math.max(0, Math.floor(Number(progress.attempts?.[i] ?? progress.attempts?.[key]) || 0));
  }
  return out;
}

export function defaultMetaProfile() {
  return {
    version: VERSION,
    numberMoney: 0,
    numberUpgrades: {},
    numberCodex: ensureCodex(),
    numberCampaign: defaultCampaignProgress(),
  };
}

export function normalizeMetaProfile(profile = {}) {
  const out = defaultMetaProfile();
  out.numberMoney = Math.max(0, Math.floor(Number(profile.numberMoney ?? profile.number_money) || 0));
  out.numberUpgrades = {};
  const sourceUpgrades = profile.numberUpgrades ?? profile.number_upgrades ?? {};
  for (const id of META_UPGRADE_ORDER) {
    const level = Math.max(0, Math.floor(Number(sourceUpgrades[id]) || 0));
    if (level > 0) out.numberUpgrades[id] = Math.min(level, META_UPGRADES[id].max);
  }
  out.numberCodex = ensureCodex(profile.numberCodex ?? profile.number_codex ?? {});
  out.numberCampaign = normalizeCampaignProgress(profile.numberCampaign ?? profile.number_campaign ?? {});
  return out;
}

export function upgradeLevel(meta, id) {
  return Math.max(0, Math.floor(Number(normalizeMetaProfile(meta).numberUpgrades[id]) || 0));
}

export function metaUpgradeStatus(meta, id) {
  const normalized = normalizeMetaProfile(meta);
  const upgrade = META_UPGRADES[id];
  if (!upgrade) return null;
  const level = normalized.numberUpgrades[id] ?? 0;
  const nextCost = upgrade.cost[level] ?? null;
  return {
    ...upgrade,
    level,
    max: upgrade.max,
    nextCost,
    affordable: nextCost != null && normalized.numberMoney >= nextCost,
    maxed: level >= upgrade.max,
  };
}

export function storeOptions(meta) {
  return META_UPGRADE_ORDER.map((id) => metaUpgradeStatus(meta, id));
}

export function purchaseMetaUpgrade(meta, id) {
  const normalized = normalizeMetaProfile(meta);
  const status = metaUpgradeStatus(normalized, id);
  if (!status) return { ok: false, reason: "missing_upgrade", profile: normalized };
  if (status.maxed) return { ok: false, reason: "maxed", profile: normalized };
  if (!status.affordable) return { ok: false, reason: "not_enough_money", profile: normalized };
  normalized.numberMoney -= status.nextCost;
  normalized.numberUpgrades[id] = (normalized.numberUpgrades[id] ?? 0) + 1;
  return { ok: true, profile: normalized, upgrade: status };
}

export function campaignStageRunOptions(stageIndex = 1, opts = {}) {
  const meta = normalizeMetaProfile(opts.meta ?? {});
  const stage = stageByIndex(stageIndex);
  const deck = starterDeck();
  if (upgradeLevel(meta, "starterSprout") > 0) {
    deck.push(makeCard(1, 80, { id: "upgrade_starter_sprout_card" }));
  }
  return {
    seed: opts.seed ?? 4040 + stage.index * 101,
    activeLand: stage.activeLand,
    targetReputation: Math.max(120, stage.targetReputation - upgradeLevel(meta, "targetDiscount") * 20),
    plays: stage.plays + upgradeLevel(meta, "extraPlay"),
    discards: stage.discards + upgradeLevel(meta, "extraDiscard"),
    handSize: HAND_SIZE + upgradeLevel(meta, "handSize"),
    deck,
    stageIndex: stage.index,
    stageId: stage.id,
    stageLabel: stage.name,
    stageRouteKind: stage.routeKind,
    campaignEnabled: true,
    numberCodex: meta.numberCodex,
  };
}

export function isCampaignStageUnlocked(progress, stageIndex) {
  const normalized = normalizeCampaignProgress(progress);
  return stageByIndex(stageIndex).index <= normalized.highestUnlockedStage;
}

export function campaignStageStatus(progress, stageIndex) {
  const normalized = normalizeCampaignProgress(progress);
  const index = stageByIndex(stageIndex).index;
  if (normalized.cleared[index]) return "cleared";
  if (index <= normalized.highestUnlockedStage) return "unlocked";
  return "locked";
}

export function comboMultiplier(step) {
  return Math.max(1, Number(step) || 1);
}

export function resetMultiplierForDigit(digit) {
  const normalized = Math.max(0, Math.min(9, Math.floor(Number(digit) || 0)));
  return 9 - normalized;
}

export function getComboMatches(previousDigit, nextDigit) {
  if (previousDigit == null) return [];
  const prev = Number(previousDigit);
  const next = Number(nextDigit);
  const matches = [];
  if (prev === next) matches.push("same");
  if (Math.abs(prev - next) === 1) matches.push("neighbor");
  if (prev + next === 9) matches.push("sum9");
  if (prev % 2 === next % 2) matches.push("parity");
  return matches;
}

function containsMatch(matches, key) {
  return matches.includes(key);
}

export function primaryLabel(matches, previousDigit) {
  if (previousDigit == null) return { label: "새 흐름", key: "start" };
  if (containsMatch(matches, "neighbor") && containsMatch(matches, "sum9")) return { label: "더블", key: "double" };
  if (containsMatch(matches, "neighbor")) return { label: "이웃수", key: "neighbor" };
  if (containsMatch(matches, "same")) return { label: "같은수", key: "same" };
  if (containsMatch(matches, "sum9")) return { label: "합 9", key: "sum9" };
  if (containsMatch(matches, "parity")) return { label: "홀짝", key: "parity" };
  return { label: "새 흐름", key: "start" };
}

export function landPrefers(activeLand, matches) {
  const land = LANDS[activeLand ?? "meadow"];
  return matches.some((key) => land?.preferred?.[key]);
}

export function categoryAffinity(activeLand, card) {
  const land = LANDS[activeLand ?? "meadow"];
  const category = cardCategory(card);
  return {
    amount: land?.categoryAffinity?.[category] ?? 0,
    category,
  };
}

function pileColorSetBonus(pile, color) {
  if (!pile || !color) return { amount: 0, completed: false };
  const before = new Set();
  const after = new Set();
  for (const card of pile.cards ?? []) {
    const id = cardColor(card);
    if (id) {
      before.add(id);
      after.add(id);
    }
  }
  after.add(color);
  if (before.size < COLOR_ORDER.length && after.size >= COLOR_ORDER.length) {
    return { amount: 0.12, completed: true };
  }
  return { amount: 0, completed: false };
}

function numberBaseBonus({
  matches,
  sameColorBonus,
  colorShiftBonus,
  typeChainBonus,
  sameTypeBonus,
  colorSetBonus,
  categoryAffinityBonus,
  card,
}) {
  let bonus = 0;
  if (containsMatch(matches, "same")) bonus += 2;
  if (containsMatch(matches, "sum9")) bonus += 3;
  if (containsMatch(matches, "parity")) bonus += 1;
  if (sameColorBonus > 0) bonus += 1;
  if (colorShiftBonus > 0) bonus += 1;
  if (typeChainBonus > 0) bonus += 2;
  if (sameTypeBonus > 0) bonus += 1;
  if (colorSetBonus > 0) bonus += 3;
  if (categoryAffinityBonus > 0) bonus += 1;
  if (card?.bonus === "shiny") bonus += 2;
  return bonus;
}

function buildBonusIcons(preview) {
  const candidates = [];
  if ((preview.pileScoreBonus ?? 0) > 0) candidates.push({ label: "비료", weight: 45 });
  if (preview.colorSetCompleted) candidates.push({ label: "4색", weight: 40 });
  if ((preview.typeChainBonus ?? 0) > 0) candidates.push({ label: "순서", weight: 30 });
  if ((preview.sameColorBonus ?? 0) > 0) candidates.push({ label: "같은색", weight: 20 });
  if ((preview.colorShiftBonus ?? 0) > 0) candidates.push({ label: "색전환", weight: 15 });
  if ((preview.sameTypeBonus ?? 0) > 0) candidates.push({ label: "같은유형", weight: 10 });
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, 2).map((item) => item.label);
}

function evaluateNumberPlayWithPrevious(state, card, previousDigit, comboStep, previousCard, pile) {
  const matches = getComboMatches(previousDigit, card.digit);
  const connected = previousDigit == null || containsMatch(matches, "neighbor");
  const nextStep = previousDigit == null ? 1 : connected ? (comboStep ?? 0) + 1 : 1;
  const primary = primaryLabel(matches, previousDigit);
  const resetMultiplier = resetMultiplierForDigit(card.digit);
  const previousMultiplier = Number(pile?.comboMultiplier ?? state?.comboMultiplier) || 1;
  const baseMultiplier = connected && previousDigit != null ? Math.max(0, previousMultiplier) + 1 : resetMultiplier;
  const landBonus = landPrefers(state?.activeLand, matches);
  const affinity = categoryAffinity(state?.activeLand, card);
  const currentCategory = cardCategory(card);
  const previousCategory = cardCategory(previousCard);
  const currentColor = cardColor(card);
  const previousColor = cardColor(previousCard);
  const sameColorBonus = previousColor != null && currentColor === previousColor ? 0.06 : 0;
  const colorShiftBonus = previousColor != null && currentColor != null && currentColor !== previousColor ? 0.03 : 0;
  const typeChainBonus = previousCategory != null && TYPE_ORDER_NEXT[previousCategory] === currentCategory ? 0.08 : 0;
  const sameTypeBonus = previousCategory != null && previousCategory === currentCategory ? 0.04 : 0;
  const colorSet = pileColorSetBonus(pile, currentColor);
  const pileScoreBonus = pile?.nextScoreBonus ?? 0;
  const comboBonus = matches.reduce((sum, key) => sum + (state?.comboBonuses?.[key] ?? 0), 0);
  const ecologyBonus = sameColorBonus + colorShiftBonus + typeChainBonus + sameTypeBonus + colorSet.amount;
  const digitBase = Math.max(0, Math.floor(Number(card.digit) || 0));
  let baseBonus = numberBaseBonus({
    matches,
    sameColorBonus,
    colorShiftBonus,
    typeChainBonus,
    sameTypeBonus,
    colorSetBonus: colorSet.amount,
    categoryAffinityBonus: affinity.amount,
    card,
  });
  if (connected && landBonus) baseBonus += 1;
  if (connected && comboBonus > 0) baseBonus += Math.max(1, rounded(comboBonus * 10));
  if (connected && pileScoreBonus > 0) baseBonus += Math.max(1, rounded(pileScoreBonus * 10));
  const baseScore = digitBase + baseBonus;
  let pileBaseBefore = Math.max(0, Math.floor(Number(pile?.baseTotal) || 0));
  if (pile && pileBaseBefore <= 0 && pile.cards?.length) {
    pileBaseBefore = pile.cards.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.digit) || 0)), 0);
  }
  const pileBaseAfter = pileBaseBefore + baseScore;
  const scoreBasis = pileBaseAfter;
  const expectedReputation = rounded(scoreBasis * baseMultiplier);
  const preview = {
    playable: true,
    connected,
    breaksCombo: previousDigit != null && !connected,
    previousDigit,
    digit: card.digit,
    color: currentColor,
    colorLabel: colorLabel(currentColor),
    colorShort: colorShort(currentColor),
    previousColor,
    category: currentCategory,
    categoryLabel: categoryLabel(currentCategory),
    categoryShort: categoryShort(currentCategory),
    previousCategory,
    matches,
    primaryLabel: primary.label,
    primaryKey: primary.key,
    nextComboStep: nextStep,
    nextMultiplier: baseMultiplier,
    baseMultiplier,
    resetMultiplier,
    landBonus,
    categoryAffinityBonus: affinity.amount,
    categoryAffinity: affinity.category,
    comboBonus,
    sameColorBonus,
    colorShiftBonus,
    colorSetBonus: colorSet.amount,
    colorSetCompleted: colorSet.completed,
    pileScoreBonus,
    typeChainBonus,
    sameTypeBonus,
    ecologyBonus,
    baseScore,
    digitBase,
    baseBonus,
    pileBaseBefore,
    pileBaseAfter,
    scoreBasis,
    expectedReputation,
    scoreFormula: `${scoreBasis} × ${Math.floor(baseMultiplier)}`,
    glow: previousDigit == null
      ? "neutral"
      : !connected
        ? "break"
        : landBonus || primary.key === "double" || baseBonus >= 4 || pileScoreBonus > 0
          ? "gold"
          : "yellow",
  };
  preview.bonusIcons = buildBonusIcons(preview);
  return preview;
}

export function evaluateNumberPlay(state, card) {
  const previous = state?.comboHistory?.[state.comboHistory.length - 1];
  return evaluateNumberPlayWithPrevious(state, card, state?.lastDigit ?? null, state?.comboStep ?? 0, previous?.card ?? null, null);
}

export function evaluatePilePlay(state, pileIndex, card) {
  if (!state || !card) return null;
  const piles = ensurePiles(state);
  const index = clampInt(pileIndex, 1, PILE_COUNT);
  const pile = piles[index - 1];
  const previousCard = pile.cards?.[pile.cards.length - 1] ?? null;
  const preview = evaluateNumberPlayWithPrevious(state, card, pile.lastDigit, pile.comboStep, previousCard, pile);
  preview.pileIndex = index;
  preview.pileId = pile.id;
  preview.pileLabel = pile.label;
  preview.pileComboStep = pile.comboStep ?? 0;
  preview.pileCardCount = pile.cards?.length ?? 0;
  if (pile.lastDigit == null) preview.glow = "open";
  return preview;
}

export function evaluateAllPileTargets(state, handIndex) {
  const card = state?.hand?.[handIndex - 1];
  if (!card) return [];
  ensurePiles(state);
  return Array.from({ length: PILE_COUNT }, (_, i) => {
    const preview = evaluatePilePlay(state, i + 1, card);
    preview.handIndex = handIndex;
    preview.cardId = card.id;
    return preview;
  });
}

function pilePreviewScore(preview) {
  if (!preview) return -Infinity;
  return (preview.breaksCombo ? 0 : 100000)
    + (preview.glow === "gold" ? 6000 : preview.glow === "yellow" ? 3000 : preview.glow === "open" ? 900 : 0)
    + (preview.nextComboStep ?? 1) * 1000
    + (preview.expectedReputation ?? 0) * 10
    - (preview.pileCardCount ?? 0);
}

export function bestPileTargetForCard(state, handIndex) {
  const previews = evaluateAllPileTargets(state, handIndex);
  let bestIndex = null;
  let bestPreview = null;
  let bestScore = -Infinity;
  let bestCount = 0;
  for (const preview of previews) {
    const score = pilePreviewScore(preview);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = preview.pileIndex;
      bestPreview = preview;
      bestCount = 1;
    } else if (score === bestScore) {
      bestCount += 1;
    }
  }
  return { bestIndex, bestPreview, bestScore, bestCount, isUniqueBest: bestCount === 1, previews };
}

export function uniqueBestPileTargetForCard(state, handIndex) {
  const target = bestPileTargetForCard(state, handIndex);
  if (!target.isUniqueBest) {
    return { ...target, bestIndex: null, bestPreview: null };
  }
  return target;
}

export function priorityPileTargetForCard(state, handIndex) {
  const previews = evaluateAllPileTargets(state, handIndex);
  const connected = previews.find((preview) => preview
    && preview.connected
    && preview.previousDigit != null
    && preview.glow !== "neutral"
    && preview.glow !== "break");
  if (connected) return { bestIndex: connected.pileIndex, bestPreview: connected, previews, priority: "connected" };
  const open = previews.find((preview) => preview?.glow === "open");
  if (open) return { bestIndex: open.pileIndex, bestPreview: open, previews, priority: "open" };
  return { bestIndex: null, bestPreview: null, previews, priority: null };
}

export function getNumberHandPreviews(state) {
  ensurePiles(state);
  return (state.hand ?? []).map((card, index) => {
    const { bestPreview } = bestPileTargetForCard(state, index + 1);
    const preview = bestPreview ?? evaluateNumberPlay(state, card);
    return { ...preview, handIndex: index + 1, cardId: card.id };
  });
}

export function handPreviewSummary(state) {
  const previews = getNumberHandPreviews(state);
  const summary = {
    total: previews.length,
    comboSafe: 0,
    breakCount: 0,
    bestIndex: null,
    bestDigit: null,
    bestLabel: "-",
    bestCardName: "-",
    bestCategoryLabel: "-",
    bestRole: "",
    bestReputation: 0,
    bestMultiplier: 1,
    bestBreaksCombo: false,
    bestGlow: "neutral",
    bestPile: null,
    bestPileLabel: "-",
  };
  let bestScore = -Infinity;
  for (const preview of previews) {
    if (preview.breaksCombo) summary.breakCount += 1;
    else summary.comboSafe += 1;
    const score = (preview.breaksCombo ? 0 : 100000)
      + (preview.nextComboStep ?? 1) * 1000
      + (preview.expectedReputation ?? 0) * 10
      + (preview.glow === "gold" ? 4 : preview.glow === "yellow" ? 2 : 0);
    if (score > bestScore) {
      const card = state.hand?.[preview.handIndex - 1] ?? {};
      const archetype = digitCard(card.digit) ?? {};
      bestScore = score;
      summary.bestIndex = preview.handIndex;
      summary.bestDigit = preview.digit;
      summary.bestLabel = preview.breaksCombo ? "새 흐름" : preview.primaryLabel ?? "-";
      summary.bestCardName = card.cardName ?? archetype.cardName ?? "-";
      summary.bestCategoryLabel = card.categoryLabel ?? categoryLabel(card.category ?? archetype.category);
      summary.bestRole = archetype.role ?? "";
      summary.bestReputation = preview.expectedReputation ?? 0;
      summary.bestMultiplier = preview.nextMultiplier ?? 1;
      summary.bestBreaksCombo = preview.breaksCombo === true;
      summary.bestGlow = preview.glow ?? "neutral";
      summary.bestPile = preview.pileIndex;
      summary.bestPileLabel = preview.pileLabel ?? "-";
    }
  }
  return summary;
}

export function newGame(opts = {}) {
  const state = {
    version: VERSION,
    mode: "number",
    phase: "play",
    seed: opts.seed ?? 4040,
    rngCursor: opts.rngCursor ?? 0,
    activeLand: opts.activeLand ?? opts.active_land ?? "meadow",
    campaignEnabled: opts.campaignEnabled === true || opts.campaign_enabled === true,
    stageIndex: opts.stageIndex ?? opts.stage_index,
    stageId: opts.stageId ?? opts.stage_id,
    stageLabel: opts.stageLabel ?? opts.stage_label,
    stageRouteKind: opts.stageRouteKind ?? opts.stage_route_kind,
    targetReputation: opts.targetReputation ?? opts.target_reputation ?? STARTER_TARGET_REPUTATION,
    reputation: opts.reputation ?? 0,
    playsRemaining: opts.plays ?? opts.playsRemaining ?? opts.plays_remaining ?? STARTER_PLAYS,
    discardsRemaining: opts.discards ?? opts.discardsRemaining ?? opts.discards_remaining ?? STARTER_DISCARDS,
    handSize: opts.handSize ?? opts.hand_size ?? HAND_SIZE,
    deck: copy(opts.deck ?? starterDeck()),
    hand: copy(opts.hand ?? []),
    discardPile: copy(opts.discardPile ?? opts.discard_pile ?? []),
    piles: normalizePiles(opts.piles),
    lastDigit: opts.lastDigit ?? opts.last_digit ?? null,
    comboStep: opts.comboStep ?? opts.combo_step ?? 0,
    comboMultiplier: opts.comboMultiplier ?? opts.combo_multiplier ?? 1,
    bestComboStep: opts.bestComboStep ?? opts.best_combo_step ?? 0,
    comboHistory: copy(opts.comboHistory ?? opts.combo_history ?? []),
    comboBonuses: copy(opts.comboBonuses ?? opts.combo_bonuses ?? {}),
    discoveryRoute: copy(opts.discoveryRoute ?? opts.discovery_route ?? {}),
    shopCoins: opts.shopCoins ?? opts.shop_coins ?? STARTER_SHOP_COINS,
    shopPurchases: opts.shopPurchases ?? opts.shop_purchases ?? 0,
    shopHistory: copy(opts.shopHistory ?? opts.shop_history ?? []),
    numberCodex: ensureCodex(opts.numberCodex ?? opts.number_codex ?? {}),
    rewardsSeen: copy(opts.rewardsSeen ?? opts.rewards_seen ?? {}),
    rewardOptions: copy(opts.rewardOptions ?? opts.reward_options ?? []),
    rewardReason: opts.rewardReason ?? opts.reward_reason,
    pendingDiscoveryReward: opts.pendingDiscoveryReward ?? opts.pending_discovery_reward ?? false,
    message: opts.message ?? "숫자를 이어 현재 더미 배율을 지키세요.",
    lastPlay: copy(opts.lastPlay ?? opts.last_play ?? null),
    lastReward: copy(opts.lastReward ?? opts.last_reward ?? null),
    lastDiscard: copy(opts.lastDiscard ?? opts.last_discard ?? null),
    lastShop: copy(opts.lastShop ?? opts.last_shop ?? null),
    failureReason: opts.failureReason ?? opts.failure_reason,
    resultRecorded: opts.resultRecorded === true || opts.result_recorded === true,
  };
  if (opts.shuffle !== false) shuffle(state, state.deck, "opening-deck");
  if (opts.skipRefill !== true && opts.skip_refill !== true) refillHand(state);
  return state;
}

export function refillHand(state) {
  while ((state.hand?.length ?? 0) < (state.handSize ?? HAND_SIZE)) {
    if ((state.deck?.length ?? 0) === 0 && (state.discardPile?.length ?? 0) > 0) {
      state.deck = state.discardPile;
      state.discardPile = [];
      shuffle(state, state.deck, "discard-recycle");
    }
    if ((state.deck?.length ?? 0) === 0) break;
    state.hand.push(state.deck.shift());
  }
  return state;
}

export function checkNumberStageEnd(state) {
  if (state.reputation >= state.targetReputation) {
    state.pendingDiscoveryReward = false;
    state.phase = "reward";
    if (!state.rewardOptions?.length) offerRewards(state, "stageClear");
    return "won";
  }
  if (state.pendingDiscoveryReward) {
    state.pendingDiscoveryReward = false;
    state.phase = "reward";
    if (!state.rewardOptions?.length) offerRewards(state, "firstFiveCombo");
    return "reward";
  }
  if ((state.playsRemaining ?? 0) <= 0) {
    state.phase = "game_over";
    state.failureReason = "목표 평판 미달";
    return "lost";
  }
  if ((state.hand?.length ?? 0) === 0 && (state.deck?.length ?? 0) === 0 && (state.discardPile?.length ?? 0) === 0) {
    state.phase = "game_over";
    state.failureReason = "낼 카드 없음";
    return "lost";
  }
  state.phase = "play";
  return "play";
}

export function playCardToPile(state, handIndex, pileIndex) {
  if (!state || state.phase !== "play") return { ok: false, reason: "not_playing" };
  const card = state.hand?.[handIndex - 1];
  if (!card) return { ok: false, reason: "missing_card" };
  const targetIndex = clampInt(pileIndex, 1, PILE_COUNT);
  const preview = evaluatePilePlay(state, targetIndex, card);
  const pile = ensurePiles(state)[targetIndex - 1];
  state.hand.splice(handIndex - 1, 1);
  pile.cards.push(card);
  state.playsRemaining = Math.max(0, (state.playsRemaining ?? 0) - 1);
  state.reputation = (state.reputation ?? 0) + preview.expectedReputation;
  pile.lastDigit = card.digit;
  pile.baseTotal = preview.pileBaseAfter;
  pile.comboStep = preview.nextComboStep;
  pile.comboMultiplier = preview.nextMultiplier;
  pile.bestComboStep = Math.max(pile.bestComboStep ?? 0, pile.comboStep ?? 0);
  pile.nextScoreBonus = 0;
  state.lastDigit = card.digit;
  state.comboStep = pile.comboStep;
  state.comboMultiplier = pile.comboMultiplier;
  state.bestComboStep = Math.max(state.bestComboStep ?? 0, pile.comboStep ?? 0);
  state.lastPlay = {
    card: copy(card),
    preview: copy(preview),
    reputationGained: preview.expectedReputation,
    brokeCombo: preview.breaksCombo,
    pileIndex: targetIndex,
    pileLabel: pile.label,
  };
  pile.history.push(copy(state.lastPlay));
  state.comboHistory.push(copy(state.lastPlay));
  state.message = `${pile.label}에 ${preview.primaryLabel} ${card.digit}: +${preview.expectedReputation} 평판`;
  if (pile.comboStep >= 5 && !state.rewardsSeen.firstFiveCombo) {
    state.rewardsSeen.firstFiveCombo = true;
    state.discoveryRoute = {
      kind: "four_pile_ecology_route",
      reason: "firstFiveCombo",
      pileIndex: targetIndex,
      pileLabel: pile.label,
      comboStep: pile.comboStep,
      cards: pile.history.slice(-5),
      land: state.activeLand,
    };
    state.pendingDiscoveryReward = true;
  }
  const result = checkNumberStageEnd(state);
  if (result === "play") refillHand(state);
  return { ok: true, preview, result };
}

export function playNumberCard(state, handIndex) {
  const target = bestPileTargetForCard(state, handIndex);
  return playCardToPile(state, handIndex, target.bestIndex ?? 1);
}

export function discardNumberCards(state, indices) {
  if (!state || state.phase !== "play") return { ok: false, reason: "not_playing" };
  if ((state.discardsRemaining ?? 0) <= 0) return { ok: false, reason: "no_discards" };
  const unique = [...new Set(indices ?? [])]
    .map((index) => Math.floor(Number(index) || 0))
    .filter((index) => state.hand?.[index - 1])
    .sort((a, b) => b - a);
  if (unique.length === 0) return { ok: false, reason: "empty_selection" };
  const pending = [];
  for (const index of unique) {
    pending.push(state.hand.splice(index - 1, 1)[0]);
  }
  state.discardsRemaining -= 1;
  refillHand(state);
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    state.discardPile.push(pending[i]);
  }
  state.lastDiscard = { count: pending.length };
  state.message = `${pending.length}장을 갈아엎었습니다.`;
  const result = checkNumberStageEnd(state);
  return { ok: true, result };
}

function digitCardLabel(digit) {
  const card = digitCard(digit);
  return card ? `${digit} ${card.cardName}/${categoryShort(card.category)}` : String(digit);
}

function currentReward(reward) {
  return reward?.id ? (rewardById(reward.id) ?? reward) : reward;
}

function digitTotalCount(state, digit) {
  let count = 0;
  for (const zone of [state?.deck, state?.hand, state?.discardPile]) {
    for (const card of zone ?? []) {
      if (card.digit === digit) count += 1;
    }
  }
  return count;
}

function chooseAdaptiveDigit(state, reward) {
  const digits = reward?.digits ?? [];
  if (digits.length === 0) return reward?.digit ?? 0;
  for (const digit of digits) {
    if (state?.lastDigit != null && state.lastDigit + digit === 9) return digit;
  }
  let best = digits[0];
  let bestCount = digitTotalCount(state, best);
  for (const digit of digits.slice(1)) {
    const count = digitTotalCount(state, digit);
    if (count < bestCount || (count === bestCount && digit > best)) {
      best = digit;
      bestCount = count;
    }
  }
  return best;
}

function mostCommonDeckDigit(state) {
  const counts = new Map();
  for (const card of state?.deck ?? []) {
    counts.set(card.digit, (counts.get(card.digit) ?? 0) + 1);
  }
  let bestDigit = null;
  let bestCount = 0;
  for (const [digit, count] of counts) {
    if (count > bestCount || (count === bestCount && bestDigit != null && digit < bestDigit)) {
      bestDigit = digit;
      bestCount = count;
    }
  }
  return { digit: bestDigit, count: bestCount };
}

function removeFirstDeckDigit(state, digit) {
  const index = state?.deck?.findIndex((card) => card.digit === digit) ?? -1;
  if (index < 0) return null;
  return state.deck.splice(index, 1)[0];
}

function leastCommonColor(state) {
  const counts = Object.fromEntries(COLOR_ORDER.map((id) => [id, 0]));
  for (const zone of [state?.deck, state?.hand, state?.discardPile]) {
    for (const card of zone ?? []) {
      const id = cardColor(card);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return COLOR_ORDER.reduce((best, id) => (counts[id] < counts[best] ? id : best), COLOR_ORDER[0]);
}

function targetCategoryForGraft(state) {
  const last = state?.lastPlay?.card ? cardCategory(state.lastPlay.card) : null;
  return TYPE_ORDER_NEXT[last] ?? "flora";
}

function findTransformTarget(state, predicate) {
  for (const zoneName of ["hand", "deck", "discardPile"]) {
    const zone = state?.[zoneName] ?? [];
    const index = zone.findIndex(predicate);
    if (index >= 0) return { zoneName, zone, index, card: zone[index] };
  }
  return null;
}

export function rewardEffectSummary(state, reward) {
  reward = currentReward(reward);
  if (!reward) return { line: "", detail: "" };
  if (reward.kind === "addDigit") {
    return { line: `카드 추가: ${digitCardLabel(reward.digit)}`, detail: reward.description, targetDigit: reward.digit };
  }
  if (reward.kind === "chooseDigit") {
    const digit = chooseAdaptiveDigit(state, reward);
    return { line: `카드 추가: ${digitCardLabel(digit)}`, detail: `상황에 맞게 ${digit} 카드를 골랐습니다.`, targetDigit: digit };
  }
  if (reward.kind === "comboBonus") {
    return {
      line: `${COMBO_LABELS[reward.combo] ?? reward.combo} 콤보 +${rounded((reward.amount ?? 0) * 100)}%`,
      detail: reward.description,
      targetCombo: reward.combo,
    };
  }
  if (reward.kind === "removeDigit") {
    const target = mostCommonDeckDigit(state);
    return {
      line: target.digit == null ? "제거할 덱 카드 없음" : `덱 정리: ${digitCardLabel(target.digit)}`,
      detail: target.digit == null ? "덱이 비어 있어 제거하지 않습니다." : `덱에서 가장 많은 숫자 1장을 제거합니다. 현재 ${target.count}장`,
      targetDigit: target.digit,
    };
  }
  if (reward.kind === "colorGraft") {
    const color = leastCommonColor(state);
    return { line: `색상 접목: ${colorLabel(color)}`, detail: reward.description, targetColor: color };
  }
  if (reward.kind === "typeGraft") {
    const category = targetCategoryForGraft(state);
    return { line: `유형 접붙임: ${categoryLabel(category)}`, detail: reward.description, targetCategory: category };
  }
  return { line: reward.short ?? reward.name, detail: reward.description ?? "" };
}

export function offerRewards(state, reason = "stageClear") {
  state.rewardReason = reason;
  const pool = copy(REWARDS);
  shuffle(state, pool, `reward-${reason}`);
  state.rewardOptions = pool.slice(0, 3);
  state.numberCodex = ensureCodex(state.numberCodex);
  for (const reward of state.rewardOptions) {
    state.numberCodex.seenRewards[reward.id] = true;
  }
  return state.rewardOptions;
}

export function applyReward(state, index) {
  const reward = currentReward(state.rewardOptions?.[index - 1]);
  if (!reward) return { ok: false, reason: "missing_reward" };
  state.numberCodex = ensureCodex(state.numberCodex);
  const effect = rewardEffectSummary(state, reward);
  state.numberCodex.seenRewards[reward.id] = true;
  state.numberCodex.discoveredRewards[reward.id] = true;
  if (reward.kind === "addDigit") {
    state.deck.unshift(makeCard(reward.digit, 90 + state.deck.length, { id: `${reward.id}_card` }));
  } else if (reward.kind === "chooseDigit") {
    state.deck.unshift(makeCard(effect.targetDigit, 90 + state.deck.length, { id: `${reward.id}_card` }));
  } else if (reward.kind === "comboBonus") {
    state.comboBonuses[reward.combo] = (state.comboBonuses[reward.combo] ?? 0) + (reward.amount ?? 0);
  } else if (reward.kind === "removeDigit" && effect.targetDigit != null) {
    removeFirstDeckDigit(state, effect.targetDigit);
  } else if (reward.kind === "colorGraft") {
    const target = findTransformTarget(state, (card) => cardColor(card) !== effect.targetColor);
    if (target) {
      target.card.color = effect.targetColor;
      target.card.colorLabel = colorLabel(effect.targetColor);
    }
  } else if (reward.kind === "typeGraft") {
    const target = findTransformTarget(state, (card) => cardCategory(card) !== effect.targetCategory);
    if (target) {
      target.card.category = effect.targetCategory;
      target.card.categoryLabel = categoryLabel(effect.targetCategory);
    }
  }
  state.lastReward = { ...copy(reward), effect };
  state.rewardOptions = [];
  const wasStageClear = state.rewardReason === "stageClear";
  state.rewardReason = null;
  if (wasStageClear && state.reputation >= state.targetReputation) {
    state.phase = "won";
  } else if ((state.playsRemaining ?? 0) <= 0 && state.reputation < state.targetReputation) {
    state.phase = "game_over";
  } else if ((state.hand?.length ?? 0) === 0 && (state.deck?.length ?? 0) === 0 && (state.discardPile?.length ?? 0) === 0) {
    state.phase = "game_over";
  } else {
    state.phase = "play";
    refillHand(state);
  }
  state.message = effect.line;
  return { ok: true, reward, effect };
}

function shopDigitForLand(state) {
  if (state?.activeLand === "forest") return 5;
  if (state?.activeLand === "wetland") {
    if (state.lastDigit === 0) return 9;
    if (state.lastDigit === 9) return 0;
    return 9;
  }
  if (state?.lastDigit === 1) return 2;
  if (state?.lastDigit === 2) return 3;
  return 1;
}

function bestUpgradeHandIndex(state) {
  let bestIndex = null;
  let bestScore = -Infinity;
  for (let i = 0; i < (state?.hand?.length ?? 0); i += 1) {
    const card = state.hand[i];
    if (card.bonus === "shiny") continue;
    const { bestPreview } = bestPileTargetForCard(state, i + 1);
    const preview = bestPreview ?? evaluateNumberPlay(state, card);
    const score = (preview.breaksCombo ? 0 : 1000) + (preview.expectedReputation ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i + 1;
    }
  }
  return bestIndex;
}

function bestFertilizerPileIndex(state) {
  ensurePiles(state);
  let bestIndex = 1;
  let bestScore = -Infinity;
  for (let i = 0; i < state.piles.length; i += 1) {
    const pile = state.piles[i];
    const score = (pile.comboStep ?? 0) * 100 + (pile.cards?.length ?? 0) - ((pile.nextScoreBonus ?? 0) > 0 ? 10000 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i + 1;
    }
  }
  return bestIndex;
}

function bestClearPileIndex(state) {
  ensurePiles(state);
  let bestIndex = null;
  let bestScore = Infinity;
  let bestCount = 0;
  for (let i = 0; i < state.piles.length; i += 1) {
    const pile = state.piles[i];
    const count = pile.cards?.length ?? 0;
    if (count <= 0) continue;
    const reputationTotal = (pile.history ?? []).reduce((sum, item) => sum + (item.reputationGained ?? item.expectedReputation ?? 0), 0);
    const score = (pile.comboStep ?? 0) * 100 + reputationTotal + count;
    if (score < bestScore) {
      bestIndex = i + 1;
      bestScore = score;
      bestCount = count;
    }
  }
  return { index: bestIndex, count: bestCount };
}

function cloneStateForPreview(state) {
  return restoreState(snapshotState(state));
}

function applyShopPreviewEffect(state, option) {
  ensurePiles(state);
  if (option.kind === "buyDigit" && option.digit != null) {
    state.deck.unshift(makeCard(option.digit, 9900, { id: `shop_preview_${option.digit}` }));
  } else if (option.kind === "upgradeHand" && option.targetIndex && state.hand?.[option.targetIndex - 1]) {
    state.hand[option.targetIndex - 1].bonus = "shiny";
  } else if (option.kind === "pileFertilizer" && option.pileIndex && state.piles?.[option.pileIndex - 1]) {
    const pile = state.piles[option.pileIndex - 1];
    pile.nextScoreBonus = Math.max(pile.nextScoreBonus ?? 0, 0.2);
  } else if (option.kind === "trimDeck" && option.digit != null) {
    removeFirstDeckDigit(state, option.digit);
  } else if (option.kind === "clearPile" && option.pileIndex && state.piles?.[option.pileIndex - 1]) {
    const pile = state.piles[option.pileIndex - 1];
    pile.cards = [];
    pile.history = [];
    pile.lastDigit = null;
    pile.baseTotal = 0;
    pile.comboStep = 0;
    pile.comboMultiplier = 1;
    pile.bestComboStep = 0;
    pile.nextScoreBonus = 0;
  }
}

function bestPreviewScore(state) {
  return handPreviewSummary(state).bestReputation ?? 0;
}

function attachShopPreview(state, option) {
  const before = bestPreviewScore(state);
  const previewState = cloneStateForPreview(state);
  applyShopPreviewEffect(previewState, option);
  const after = bestPreviewScore(previewState);
  option.previewScoreBefore = before;
  option.previewScoreAfter = after;
  option.previewDelta = after - before;
  option.previewLine = option.previewDelta === 0
    ? `다음 최고수 ${before} 유지`
    : `다음 최고수 ${before} -> ${after} (${option.previewDelta > 0 ? "+" : ""}${option.previewDelta})`;
  return option;
}

export function runShopOptions(state) {
  const digit = shopDigitForLand(state);
  const digitInfo = digitCard(digit) ?? {};
  const upgradeIndex = bestUpgradeHandIndex(state);
  const upgradeCard = upgradeIndex ? state.hand?.[upgradeIndex - 1] : null;
  const remove = mostCommonDeckDigit(state);
  const fertilizerPile = bestFertilizerPileIndex(state);
  const clear = bestClearPileIndex(state);
  const options = [
    {
      id: "buyDigit",
      kind: "buyDigit",
      name: "원형 카드 구매",
      cost: 2,
      digit,
      imageId: digitInfo.imageId,
      line: digitCardLabel(digit),
      detail: "덱 위에 다음 루트용 카드 1장을 심습니다.",
    },
    {
      id: "upgradeHand",
      kind: "upgradeHand",
      name: "손패 반짝 강화",
      cost: 2,
      targetIndex: upgradeIndex,
      digit: upgradeCard?.digit,
      imageId: upgradeCard?.imageId,
      line: upgradeCard ? digitCardLabel(upgradeCard.digit) : "강화할 손패 없음",
      detail: "이번 런의 해당 카드 기본 평판을 +2 올립니다.",
    },
    {
      id: "pileFertilizer",
      kind: "pileFertilizer",
      name: "정원 비료",
      cost: 1,
      pileIndex: fertilizerPile,
      imageId: "floor_forest_shade_walk",
      line: `정원 ${fertilizerPile} 다음 내기 +2`,
      detail: "가장 좋은 흐름 더미에 다음 1회 기본점 비료를 뿌립니다.",
    },
    {
      id: "trimDeck",
      kind: "trimDeck",
      name: "덱 가지치기",
      cost: 1,
      digit: remove.digit,
      imageId: remove.digit != null ? digitCard(remove.digit)?.imageId : "reward_seed_bank",
      line: remove.digit != null ? digitCardLabel(remove.digit) : "정리할 덱 카드 없음",
      detail: remove.digit != null ? `덱에 많은 원형 1장을 정리합니다. 현재 ${remove.count}장` : "덱이 비어 있으면 살 수 없습니다.",
    },
    {
      id: "clearPile",
      kind: "clearPile",
      name: "빈터 정리",
      cost: 1,
      pileIndex: clear.index,
      imageId: "floor_meadow",
      line: clear.index != null ? `정원 ${clear.index} 비우기 · ${clear.count}장` : "정리할 정원 없음",
      detail: clear.index != null ? "막힌 더미를 버림더미로 옮기고 새 흐름 칸을 만듭니다." : "카드가 놓인 정원이 있어야 살 수 있습니다.",
    },
  ];
  return options.map((option) => attachShopPreview(state, option));
}

export function purchaseRunShop(state, optionIndex) {
  if (!state || state.phase !== "play") return { ok: false, reason: "not_playing" };
  const option = runShopOptions(state)[optionIndex - 1];
  if (!option) return { ok: false, reason: "missing_offer" };
  if ((state.shopCoins ?? 0) < option.cost) return { ok: false, reason: "not_enough_shop_coins" };
  if (option.kind === "buyDigit" && option.digit != null) {
    state.shopCoins -= option.cost;
    const card = makeCard(option.digit, 120 + (state.shopPurchases ?? 0), { id: `shop_buy_${option.digit}_${(state.shopPurchases ?? 0) + 1}` });
    state.deck.unshift(card);
    state.lastShop = { kind: option.kind, card: copy(card), cost: option.cost, line: `카드 추가: ${digitCardLabel(option.digit)}`, imageId: card.imageId };
  } else if (option.kind === "upgradeHand" && option.targetIndex && state.hand?.[option.targetIndex - 1]) {
    state.shopCoins -= option.cost;
    const card = state.hand[option.targetIndex - 1];
    card.bonus = "shiny";
    state.lastShop = { kind: option.kind, card: copy(card), cost: option.cost, line: `손패 강화: ${digitCardLabel(card.digit)}`, imageId: card.imageId };
  } else if (option.kind === "pileFertilizer" && option.pileIndex) {
    ensurePiles(state);
    const pile = state.piles[option.pileIndex - 1];
    if (!pile) return { ok: false, reason: "missing_pile" };
    state.shopCoins -= option.cost;
    pile.nextScoreBonus = Math.max(pile.nextScoreBonus ?? 0, 0.2);
    state.lastShop = { kind: option.kind, pileIndex: option.pileIndex, cost: option.cost, line: `더미 효과: 정원 ${option.pileIndex} 다음 내기 +2`, imageId: option.imageId };
  } else if (option.kind === "trimDeck" && option.digit != null) {
    const removed = removeFirstDeckDigit(state, option.digit);
    if (!removed) return { ok: false, reason: "missing_deck_card" };
    state.shopCoins -= option.cost;
    state.lastShop = { kind: option.kind, card: copy(removed), cost: option.cost, line: `덱 압축: ${digitCardLabel(removed.digit)}`, imageId: removed.imageId };
  } else if (option.kind === "clearPile" && option.pileIndex) {
    ensurePiles(state);
    const pile = state.piles[option.pileIndex - 1];
    if (!pile) return { ok: false, reason: "missing_pile" };
    const moved = pile.cards?.length ?? 0;
    if (moved <= 0) return { ok: false, reason: "missing_pile_cards" };
    state.shopCoins -= option.cost;
    state.discardPile.push(...pile.cards);
    pile.cards = [];
    pile.history = [];
    pile.lastDigit = null;
    pile.baseTotal = 0;
    pile.comboStep = 0;
    pile.comboMultiplier = 1;
    pile.bestComboStep = 0;
    pile.nextScoreBonus = 0;
    state.lastShop = { kind: option.kind, pileIndex: option.pileIndex, cardsMoved: moved, cost: option.cost, line: `더미 정리: 정원 ${option.pileIndex} ${moved}장`, imageId: option.imageId };
  } else {
    return { ok: false, reason: "unavailable_offer" };
  }
  state.shopPurchases = (state.shopPurchases ?? 0) + 1;
  state.shopHistory.push(copy(state.lastShop));
  state.message = `${state.lastShop.line} · 코인 ${state.shopCoins}`;
  return { ok: true, option };
}

export function catalogSummary(state) {
  const codex = ensureCodex(state?.numberCodex);
  const count = (map) => Object.values(map ?? {}).filter(Boolean).length;
  const digitCounts = Object.fromEntries(DIGITS.map((item) => [item.digit, 0]));
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, 0]));
  const colorCounts = Object.fromEntries(COLOR_ORDER.map((id) => [id, 0]));
  for (const zone of [state?.deck, state?.hand, state?.discardPile]) {
    for (const card of zone ?? []) {
      if (card.digit != null) digitCounts[card.digit] = (digitCounts[card.digit] ?? 0) + 1;
      const category = cardCategory(card);
      const color = cardColor(card);
      if (category) categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      if (color) colorCounts[color] = (colorCounts[color] ?? 0) + 1;
    }
  }
  return {
    digits: { known: count(codex.knownDigits), total: DIGITS.length },
    combos: { known: count(codex.knownCombos), total: 5 },
    lands: { known: count(codex.knownLands), total: Object.keys(LANDS).length },
    discoveries: { seen: count(codex.seenRewards), discovered: count(codex.discoveredRewards), total: REWARDS.length },
    digitCounts,
    categoryCounts,
    colorCounts,
  };
}

export function codexEntries(state) {
  const codex = ensureCodex(state?.numberCodex);
  return {
    digits: DIGITS.map((item) => ({
      ...item,
      status: codex.knownDigits[item.digit] ? "known" : "unknown",
      categoryLabel: categoryLabel(item.category),
      colorLabel: colorLabel(item.color),
      count: digitTotalCount(state, item.digit),
    })),
    combos: ["same", "neighbor", "sum9", "parity", "double"].map((id) => ({
      id,
      label: COMBO_LABELS[id],
      status: codex.knownCombos[id] ? "known" : "unknown",
    })),
    lands: Object.values(LANDS).map((land) => ({ ...land, status: codex.knownLands[land.id] ? "known" : "unknown" })),
    discoveries: REWARDS.map((reward) => ({
      ...reward,
      status: codex.discoveredRewards[reward.id] ? "discovered" : codex.seenRewards[reward.id] ? "seen" : "hidden",
    })),
  };
}

export function resultPayout(state, cleared, stageIndex = state?.stageIndex ?? 1) {
  const index = stageByIndex(stageIndex).index;
  if (cleared) return STAGE_CLEAR_BASE_PAYOUT + index + Math.floor(((state?.bestComboStep ?? 0) / 4));
  return STAGE_FAILURE_PAYOUT;
}

export function recordCampaignResult(profile, state) {
  const out = normalizeMetaProfile(profile);
  const stage = stageByIndex(state?.stageIndex ?? out.numberCampaign.lastSelectedStage);
  const cleared = state?.phase === "won" || (state?.reputation ?? 0) >= (state?.targetReputation ?? Infinity);
  const payout = resultPayout(state, cleared, stage.index);
  out.numberMoney += payout;
  out.numberCodex = ensureCodex(state?.numberCodex ?? out.numberCodex);
  out.numberCampaign.lastSelectedStage = stage.index;
  out.numberCampaign.attempts[stage.index] = (out.numberCampaign.attempts[stage.index] ?? 0) + 1;
  out.numberCampaign.bestReputation[stage.index] = Math.max(out.numberCampaign.bestReputation[stage.index] ?? 0, state?.reputation ?? 0);
  out.numberCampaign.bestCombo[stage.index] = Math.max(out.numberCampaign.bestCombo[stage.index] ?? 0, state?.bestComboStep ?? 0);
  if (cleared) {
    out.numberCampaign.cleared[stage.index] = true;
    out.numberCampaign.highestUnlockedStage = Math.max(out.numberCampaign.highestUnlockedStage, Math.min(CAMPAIGN_STAGES.length, stage.index + 1));
  }
  return { profile: out, payout, cleared, stage };
}

export function snapshotState(state) {
  return copy({
    ...state,
    version: VERSION,
    piles: normalizePiles(state?.piles),
  });
}

export function restoreState(snapshot) {
  if (!snapshot) return null;
  const state = newGame({
    ...snapshot,
    shuffle: false,
    skipRefill: true,
  });
  state.phase = snapshot.phase ?? state.phase;
  state.rngCursor = snapshot.rngCursor ?? 0;
  state.rewardReason = snapshot.rewardReason ?? null;
  state.pendingDiscoveryReward = snapshot.pendingDiscoveryReward === true;
  state.failureReason = snapshot.failureReason;
  state.resultRecorded = snapshot.resultRecorded === true;
  return state;
}

export function newCampaignRun(profile, stageIndex = null) {
  const normalized = normalizeMetaProfile(profile);
  const selected = stageIndex ?? normalized.numberCampaign.lastSelectedStage ?? normalized.numberCampaign.highestUnlockedStage ?? 1;
  const safeStage = isCampaignStageUnlocked(normalized.numberCampaign, selected) ? selected : normalized.numberCampaign.highestUnlockedStage;
  const opts = campaignStageRunOptions(safeStage, { meta: normalized });
  return newGame(opts);
}

export { rewardById };
