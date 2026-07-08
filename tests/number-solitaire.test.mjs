import assert from "node:assert/strict";
import { test } from "node:test";

import { DIGITS, REWARDS, cardImagePath } from "../src/game/catalog.js";
import {
  applyReward,
  campaignStageRunOptions,
  cardAbilitySummary,
  catalogSummary,
  checkEndlessEnd,
  codexEntries,
  defaultMetaProfile,
  discardEndlessCards,
  discardNumberCards,
  endlessStarterDeck,
  endlessHandPreviewSummary,
  evaluateEndlessPilePlay,
  evaluatePilePlay,
  getComboMatches,
  handPreviewSummary,
  isCircularNeighbor,
  makeCard,
  metaUpgradeStatus,
  newCampaignRun,
  newEndlessRun,
  newGame,
  offerRewards,
  playEndlessCardToPile,
  playCardToPile,
  priorityPileTargetForCard,
  purchaseMetaUpgrade,
  purchaseRunShop,
  recordCampaignResult,
  recordEndlessResult,
  rewardEffectSummary,
  restoreState,
  runShopOptions,
  snapshotState,
  starterDeck,
  uniqueBestPileTargetForCard,
} from "../src/game/number-solitaire.js";
import {
  loadProfile,
  loadRun,
  saveProfile,
  saveRun,
} from "../src/game/storage.js";

function memoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("starts a campaign number-solitaire run with the required defaults", () => {
  const profile = defaultMetaProfile();
  const state = newCampaignRun(profile, 1);

  assert.equal(state.version, "4.1-web-number-solitaire");
  assert.equal(state.mode, "number");
  assert.equal(state.phase, "play");
  assert.equal(state.stageIndex, 1);
  assert.equal(state.activeLand, "meadow");
  assert.equal(state.targetReputation, 295);
  assert.equal(state.playsRemaining, 18);
  assert.equal(state.discardsRemaining, 3);
  assert.equal(state.shopCoins, 2);
  assert.equal(state.hand.length, 5);
  assert.equal(state.deck.length, 15);
  assert.equal(state.piles.length, 4);
});

test("starts an endless run with score pressure instead of stage pressure", () => {
  const profile = defaultMetaProfile();
  profile.numberEndless.bestScore = 900;
  const state = newEndlessRun(profile, { seed: 11 });

  assert.equal(state.mode, "endless");
  assert.equal(state.phase, "play");
  assert.equal(state.score, 0);
  assert.equal(state.bestScore, 900);
  assert.equal(state.discardsRemaining, 3);
  assert.equal(state.hand.length, 5);
  const endlessDeck = endlessStarterDeck();
  assert.equal(endlessDeck.length, 50);
  assert.deepEqual(
    Object.groupBy(endlessDeck, (card) => card.ability).normal.map((card) => card.digit),
    [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9],
  );
  assert.equal(Object.groupBy(endlessDeck, (card) => card.ability).bridge.length, 6);
  assert.equal(Object.groupBy(endlessDeck, (card) => card.ability).graft.length, 5);
  assert.equal(Object.groupBy(endlessDeck, (card) => card.ability).prune.length, 3);
  assert.equal(state.deck.length, 45);
  assert.equal(state.compostPile.length, 0);
  assert.equal(state.piles.length, 4);
  assert.equal(state.piles[0].capacity, 10);
  assert.ok(endlessHandPreviewSummary(state).bestIndex >= 1);
  assert.equal(cardAbilitySummary(makeCard(3, 1)).text, "일반. 원형 이웃수로 세로/층 줄기를 잇는다.");
});

test("endless opening shuffle changes when the run seed changes", () => {
  const first = newEndlessRun(defaultMetaProfile(), { seed: 11 });
  const second = newEndlessRun(defaultMetaProfile(), { seed: 12 });

  assert.notDeepEqual(
    first.hand.map((card) => `${card.digit}:${card.ability}`),
    second.hand.map((card) => `${card.digit}:${card.ability}`),
  );
});

test("catalog has ten complete garden cards and source-backed image paths", () => {
  assert.equal(DIGITS.length, 10);
  assert.equal(starterDeck().length, 20);
  for (const item of DIGITS) {
    assert.equal(typeof item.cardName, "string");
    assert.ok(item.category);
    assert.ok(item.color);
    assert.ok(item.imageId);
    assert.ok(cardImagePath(item.imageId).endsWith(`${item.imageId}.png`));
  }
});

test("combo matching and pile preview score the main number relationships", () => {
  assert.deepEqual(getComboMatches(4, 5), ["neighbor", "sum9"]);
  assert.deepEqual(getComboMatches(7, 7), ["same", "parity"]);
  assert.deepEqual(getComboMatches(2, 6), ["parity"]);

  const state = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 999,
    hand: [makeCard(4, 1), makeCard(5, 1)],
    deck: [],
  });
  const first = playCardToPile(state, 1, 1);
  assert.equal(first.ok, true);
  assert.equal(first.preview.expectedReputation, 25);
  assert.equal(state.reputation, 25);

  const preview = evaluatePilePlay(state, 1, state.hand[0]);
  assert.equal(preview.primaryKey, "double");
  assert.equal(preview.connected, true);
  assert.equal(preview.nextComboStep, 2);
  assert.equal(preview.nextMultiplier, 6);
  assert.equal(preview.expectedReputation, 102);
});

test("endless stacks circular neighbors before balancing unrelated cards", () => {
  assert.equal(isCircularNeighbor(9, 0), true);
  assert.equal(isCircularNeighbor(0, 9), true);
  assert.equal(isCircularNeighbor(0, 8), false);

  const chainState = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(5, 1), makeCard(6, 1), makeCard(7, 1)],
    deck: [],
    handSize: 3,
  });

  for (let i = 0; i < 3; i += 1) {
    const result = playEndlessCardToPile(chainState, 1, 4);
    assert.equal(result.ok, true);
    assert.equal(result.preview.pileIndex, 1);
    assert.equal(result.preview.verticalConnected, i > 0);
  }

  assert.deepEqual(chainState.piles.map((pile) => pile.cards.length), [3, 0, 0, 0]);
  assert.deepEqual(chainState.piles[0].cards.map((card) => card.digit), [5, 6, 7]);
  assert.equal(chainState.score, 0);

  const spreadState = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(1, 1), makeCard(3, 1), makeCard(5, 1), makeCard(7, 1)],
    deck: [],
    handSize: 4,
  });

  for (let i = 0; i < 4; i += 1) {
    const result = playEndlessCardToPile(spreadState, 1, 4);
    assert.equal(result.ok, true);
    assert.equal(result.preview.pileIndex, i + 1);
  }

  assert.deepEqual(spreadState.piles.map((pile) => pile.cards.length), [1, 1, 1, 1]);
  assert.deepEqual(spreadState.piles.map((pile) => pile.cards[0].digit), [1, 3, 5, 7]);
});

test("endless layer combo harvests five connected cards and sends them to compost", () => {
  const state = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    handSize: 0,
    hand: [makeCard(3, 1)],
    deck: [],
    piles: [
      { cards: [makeCard(1, 1), makeCard(2, 1)] },
      { cards: [makeCard(8, 1)] },
      { cards: [makeCard(9, 1), makeCard(4, 1)] },
      { cards: [makeCard(9, 2), makeCard(5, 1)] },
    ],
  });

  const result = playEndlessCardToPile(state, 1, 4);
  assert.equal(result.ok, true);
  assert.equal(result.preview.pileIndex, 2);
  assert.equal(result.preview.verticalConnected, false);
  assert.equal(result.preview.layerConnections, 2);

  assert.equal(state.lastHarvest.score, 450);
  assert.equal(state.score, 450);
  assert.equal(state.bestHarvestScore, 450);
  assert.equal(state.harvestCount, 1);
  assert.deepEqual(state.piles.map((pile) => pile.cards.length), [0, 1, 1, 1]);
  assert.equal(state.compostPile.length, 5);
  assert.deepEqual([...state.compostPile].map((card) => card.digit).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("endless P0 abilities bridge, graft, and prune change connection previews", () => {
  const bridgeState = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(4, 1, { ability: "bridge" })],
    deck: [],
    piles: [
      { cards: [makeCard(1, 1), makeCard(2, 1), makeCard(3, 1), makeCard(9, 1)] },
      { cards: [makeCard(7, 1), makeCard(7, 2), makeCard(7, 3), makeCard(7, 4)] },
      { cards: [makeCard(8, 1), makeCard(8, 2), makeCard(8, 3), makeCard(8, 4)] },
      { cards: [makeCard(6, 1), makeCard(6, 2), makeCard(6, 3), makeCard(6, 4)] },
    ],
  });
  const bridge = evaluateEndlessPilePlay(bridgeState, 1, bridgeState.hand[0]);
  assert.equal(bridge.primaryKey, "bridge");
  assert.equal(bridge.componentSize, 4);
  assert.equal(bridge.extraEdges.some((edge) => edge.kind === "bridge"), true);

  const graftState = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(5, 1, { ability: "graft" })],
    deck: [],
    piles: [
      { cards: [makeCard(1, 1)] },
      { cards: [makeCard(3, 1)] },
      { cards: [makeCard(6, 1)] },
      { cards: [makeCard(8, 1)] },
    ],
  });
  const graft = evaluateEndlessPilePlay(graftState, 1, graftState.hand[0]);
  assert.equal(graft.primaryKey, "graft");
  assert.equal(graft.componentSize, 2);
  assert.equal(graft.extraEdges.some((edge) => edge.kind === "graft"), true);

  const pruneState = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    handSize: 0,
    hand: [makeCard(4, 1, { ability: "prune" })],
    deck: [],
    piles: [
      { cards: [makeCard(1, 1), makeCard(2, 1), makeCard(3, 1), makeCard(8, 1)] },
      { cards: [makeCard(8, 2), makeCard(8, 3), makeCard(8, 4), makeCard(8, 5)] },
      { cards: [makeCard(7, 1), makeCard(7, 2), makeCard(7, 3), makeCard(7, 4)] },
      { cards: [makeCard(6, 1), makeCard(6, 2), makeCard(6, 3), makeCard(6, 4)] },
    ],
  });
  const prune = playEndlessCardToPile(pruneState, 1, 4);
  assert.equal(prune.ok, true);
  assert.equal(prune.preview.primaryKey, "prune");
  assert.equal(prune.preview.pruneTop, true);
  assert.equal(prune.preview.pileIndex, 1);
  assert.equal(pruneState.lastPlay.prunedCard.digit, 8);
  assert.deepEqual(pruneState.piles[0].cards.map((card) => card.digit), [1, 2, 3, 4]);
  assert.deepEqual(pruneState.compostPile.map((card) => card.digit), [8]);
});

test("endless capacity blocks non-harvest placement and game over waits for swaps", () => {
  const fullPile = {
    cards: Array.from({ length: 10 }, (_, index) => makeCard(4, index + 1)),
    lastDigit: 4,
    comboStep: 0,
    addTotal: 0,
    multiplyTotal: 0,
  };
  const state = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(7, 1)],
    handSize: 1,
    deck: [],
    compostPile: [],
    discards: 0,
    piles: [fullPile, fullPile, fullPile, fullPile],
  });

  const preview = evaluateEndlessPilePlay(state, 1, state.hand[0]);
  assert.equal(preview.playable, false);
  assert.equal(preview.reason, "pile_full");
  assert.equal(checkEndlessEnd(state), "lost");
  assert.equal(state.phase, "game_over");
});

test("endless hand swaps move cards to compost and refill from deck", () => {
  const state = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    handSize: 2,
    hand: [makeCard(1, 1), makeCard(2, 1)],
    deck: [makeCard(3, 1), makeCard(4, 1)],
  });

  const result = discardEndlessCards(state, [1, 2]);
  assert.equal(result.ok, true);
  assert.equal(state.discardsRemaining, 2);
  assert.deepEqual(state.hand.map((card) => card.digit), [3, 4]);
  assert.deepEqual(state.compostPile.map((card) => card.digit), [1, 2]);
});

test("playing cards updates hand, pile, reputation, and stage end state", () => {
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 120,
    hand: [makeCard(4, 1), makeCard(5, 1)],
    deck: [],
  });

  assert.equal(handPreviewSummary(state).bestIndex, 1);
  assert.equal(playCardToPile(state, 1, 1).ok, true);
  assert.equal(state.hand.length, 1);
  assert.equal(state.piles[0].cards.length, 1);
  assert.equal(state.playsRemaining, 17);

  const second = playCardToPile(state, 1, 1);
  assert.equal(second.ok, true);
  assert.equal(state.reputation, 127);
  assert.equal(state.phase, "reward");
  assert.equal(state.rewardReason, "stageClear");
  assert.equal(state.rewardOptions.length, 3);
});

test("unique best pile target distinguishes auto-playable cards from ties", () => {
  const tied = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 999,
    hand: [makeCard(1, 1)],
    deck: [],
  });

  const tiedTarget = uniqueBestPileTargetForCard(tied, 1);
  assert.equal(tiedTarget.isUniqueBest, false);
  assert.equal(tiedTarget.bestIndex, null);
  assert.equal(tiedTarget.bestCount, 4);

  const unique = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 999,
    hand: [makeCard(4, 1), makeCard(5, 1)],
    deck: [],
  });
  assert.equal(playCardToPile(unique, 1, 1).ok, true);

  const uniqueTarget = uniqueBestPileTargetForCard(unique, 1);
  assert.equal(uniqueTarget.isUniqueBest, true);
  assert.equal(uniqueTarget.bestIndex, 1);
  assert.equal(uniqueTarget.bestPreview.primaryKey, "double");
});

test("priority pile target follows original quick-play order", () => {
  const open = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 999,
    hand: [makeCard(1, 1)],
    deck: [],
  });

  const openTarget = priorityPileTargetForCard(open, 1);
  assert.equal(openTarget.priority, "open");
  assert.equal(openTarget.bestIndex, 1);

  const connected = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 999,
    hand: [makeCard(4, 1), makeCard(5, 1)],
    deck: [],
  });
  assert.equal(playCardToPile(connected, 1, 2).ok, true);

  const connectedTarget = priorityPileTargetForCard(connected, 1);
  assert.equal(connectedTarget.priority, "connected");
  assert.equal(connectedTarget.bestIndex, 2);
  assert.equal(connectedTarget.bestPreview.glow, "gold");
});

test("discard action consumes one discard, refills, and moves selected cards", () => {
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(1, 1), makeCard(2, 1), makeCard(3, 1)],
    deck: [makeCard(4, 1), makeCard(5, 1)],
  });

  const result = discardNumberCards(state, [1, 3]);
  assert.equal(result.ok, true);
  assert.equal(state.discardsRemaining, 2);
  assert.equal(state.hand.length, 3);
  assert.equal(state.discardPile.length, 2);
  assert.deepEqual(state.hand.map((card) => card.digit), [2, 4, 5]);
});

test("first five combo opens discovery reward and rewards can change the deck", () => {
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 9999,
    hand: [makeCard(1, 1), makeCard(2, 1), makeCard(3, 1), makeCard(4, 1), makeCard(5, 1)],
    deck: [makeCard(8, 1)],
  });

  for (let i = 0; i < 5; i += 1) {
    playCardToPile(state, 1, 1);
  }

  assert.equal(state.phase, "reward");
  assert.equal(state.rewardReason, "firstFiveCombo");
  assert.equal(state.discoveryRoute.comboStep, 5);

  state.rewardOptions = [REWARDS[0]];
  const before = state.deck.length + state.hand.length;
  const reward = applyReward(state, 1);
  assert.equal(reward.ok, true);
  assert.equal(state.phase, "play");
  assert.equal(state.deck.length + state.hand.length, before + 1);
  assert.equal(state.numberCodex.discoveredRewards[REWARDS[0].id], true);
});

test("stage clear reward consumes same-play discovery reward", () => {
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    targetReputation: 900,
    hand: [makeCard(1, 1), makeCard(2, 1), makeCard(3, 1), makeCard(4, 1), makeCard(5, 1)],
    deck: [],
  });

  for (let i = 0; i < 5; i += 1) {
    playCardToPile(state, 1, 1);
  }

  assert.equal(state.reputation >= state.targetReputation, true);
  assert.equal(state.bestComboStep, 5);
  assert.equal(state.phase, "reward");
  assert.equal(state.rewardReason, "stageClear");
  assert.equal(state.pendingDiscoveryReward, false);

  state.rewardOptions = [REWARDS[0]];
  const reward = applyReward(state, 1);
  assert.equal(reward.ok, true);
  assert.equal(state.phase, "won");
  assert.equal(state.rewardOptions.length, 0);
  assert.equal(state.pendingDiscoveryReward, false);
});

test("reward summaries expose direct rule effects", () => {
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    hand: [makeCard(1, 1)],
    deck: [makeCard(2, 1), makeCard(2, 2), makeCard(4, 1)],
  });

  const addTwo = rewardEffectSummary(state, REWARDS.find((reward) => reward.id === "discoverCloverStep"));
  assert.equal(addTwo.line, "카드 추가: 2 꽃망울/식물");
  assert.equal(addTwo.targetDigit, 2);

  const sumNine = rewardEffectSummary(state, REWARDS.find((reward) => reward.id === "discoverBeeRoute"));
  assert.equal(sumNine.line, "합 9 콤보 +10%");
  assert.equal(sumNine.targetCombo, "sum9");

  const staleSumNine = rewardEffectSummary(state, {
    id: "discoverBeeRoute",
    name: "꿀벌 항로",
    kind: "comboBonus",
    combo: "sum9",
    amount: 0.1,
    description: "옛 설명",
  });
  assert.equal(staleSumNine.detail, "이번 런 동안 합 9 콤보 점수를 10% 올립니다.");

  const trimDeck = rewardEffectSummary(state, REWARDS.find((reward) => reward.id === "discoverSeedSorting"));
  assert.equal(trimDeck.line, "덱 정리: 2 꽃망울/식물");
  assert.equal(trimDeck.targetDigit, 2);
});

test("run shop and meta store mutate the correct resources", () => {
  const state = newCampaignRun(defaultMetaProfile(), 1);
  const options = runShopOptions(state);
  assert.equal(options.length, 5);

  const result = purchaseRunShop(state, 1);
  assert.equal(result.ok, true);
  assert.equal(state.shopCoins, 0);
  assert.equal(state.deck[0].digit, options[0].digit);

  const profile = defaultMetaProfile();
  profile.numberMoney = 20;
  const status = metaUpgradeStatus(profile, "starterSprout");
  assert.equal(status.affordable, true);
  const purchase = purchaseMetaUpgrade(profile, "starterSprout");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.profile.numberUpgrades.starterSprout, 1);

  const boostedRun = campaignStageRunOptions(1, { meta: purchase.profile, seed: 1 });
  assert.equal(boostedRun.deck.length, 21);
});

test("campaign result records payout, bests, clear state, and next unlock", () => {
  const profile = defaultMetaProfile();
  const state = newGame({
    shuffle: false,
    skipRefill: true,
    campaignEnabled: true,
    stageIndex: 1,
    targetReputation: 20,
    reputation: 25,
    bestComboStep: 5,
  });
  state.phase = "won";

  const result = recordCampaignResult(profile, state);
  assert.equal(result.cleared, true);
  assert.equal(result.payout, 6);
  assert.equal(result.profile.numberMoney, 6);
  assert.equal(result.profile.numberCampaign.cleared[1], true);
  assert.equal(result.profile.numberCampaign.highestUnlockedStage, 2);
  assert.equal(result.profile.numberCampaign.bestReputation[1], 25);
});

test("endless result records best score, harvest, and survival turns", () => {
  const profile = defaultMetaProfile();
  profile.numberEndless.bestScore = 100;
  const state = newEndlessRun(profile, {
    shuffle: false,
    skipRefill: true,
    score: 450,
    bestHarvestScore: 450,
    bestPotentialScore: 460,
    turnCount: 5,
  });
  state.phase = "game_over";

  const result = recordEndlessResult(profile, state);
  assert.equal(result.improved, true);
  assert.equal(result.profile.numberEndless.bestScore, 450);
  assert.equal(result.profile.numberEndless.bestHarvestScore, 450);
  assert.equal(result.profile.numberEndless.bestPotentialScore, 460);
  assert.equal(result.profile.numberEndless.bestSurvivalTurns, 5);
  assert.equal(result.profile.numberEndless.runs, 1);
});

test("snapshot restore and storage round-trip preserve run and profile", () => {
  const storage = memoryStorage();
  const profile = defaultMetaProfile();
  profile.numberMoney = 7;
  const state = newCampaignRun(profile, 1);
  playCardToPile(state, 1, 1);

  const restored = restoreState(snapshotState(state));
  assert.equal(restored.reputation, state.reputation);
  assert.equal(restored.hand.length, state.hand.length);
  assert.equal(restored.piles[0].cards.length, 1);

  assert.equal(saveProfile(profile, storage), true);
  assert.equal(saveRun(state, storage), true);
  assert.equal(loadProfile(storage).numberMoney, 7);
  assert.equal(loadRun(storage).reputation, state.reputation);
});

test("snapshot restore and storage round-trip preserve endless run state", () => {
  const storage = memoryStorage();
  const state = newEndlessRun(defaultMetaProfile(), {
    shuffle: false,
    skipRefill: true,
    score: 123,
    handSize: 1,
    hand: [makeCard(6, 1)],
    compostPile: [makeCard(1, 1), makeCard(2, 1)],
    deck: [],
  });

  const restored = restoreState(snapshotState(state));
  assert.equal(restored.mode, "endless");
  assert.equal(restored.score, 123);
  assert.equal(restored.hand.length, 1);
  assert.equal(restored.compostPile.length, 2);

  assert.equal(saveRun(state, storage), true);
  const loaded = loadRun(storage);
  assert.equal(loaded.mode, "endless");
  assert.equal(loaded.score, 123);
  assert.equal(loaded.compostPile.length, 2);
});

test("codex summary separates seen and discovered rewards", () => {
  const state = newCampaignRun(defaultMetaProfile(), 1);
  offerRewards(state, "stageClear");
  const summaryAfterOffer = catalogSummary(state);
  assert.equal(summaryAfterOffer.discoveries.seen, 3);
  assert.equal(summaryAfterOffer.discoveries.discovered, 0);

  const entries = codexEntries(state);
  assert.equal(entries.digits.length, 10);
  assert.equal(entries.lands.length, 3);
  assert.equal(entries.discoveries.length, 8);
});
