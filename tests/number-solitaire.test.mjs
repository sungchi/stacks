import assert from "node:assert/strict";
import { test } from "node:test";

import { DIGITS, REWARDS, cardImagePath } from "../src/game/catalog.js";
import {
  applyReward,
  campaignStageRunOptions,
  catalogSummary,
  codexEntries,
  defaultMetaProfile,
  discardNumberCards,
  evaluatePilePlay,
  getComboMatches,
  handPreviewSummary,
  makeCard,
  metaUpgradeStatus,
  newCampaignRun,
  newGame,
  offerRewards,
  playCardToPile,
  priorityPileTargetForCard,
  purchaseMetaUpgrade,
  purchaseRunShop,
  recordCampaignResult,
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
