import {
  CAMPAIGN_STAGES,
  COLORS,
  COMBO_LABELS,
  DIGITS,
  LANDS,
  META_UPGRADE_ORDER,
  cardImagePath,
  categoryLabel,
  colorCss,
  colorLabel,
  landLabel,
  rewardById,
  stageByIndex,
} from "./game/catalog.js";
import {
  applyReward,
  bestEndlessPileTargetForCard,
  bestPileTargetForCard,
  campaignStageStatus,
  catalogSummary,
  codexEntries,
  defaultMetaProfile,
  discardEndlessCards,
  discardNumberCards,
  endlessHandPreviewSummary,
  endlessToolSummary,
  evaluateEndlessToolTargets,
  handPreviewSummary,
  isCampaignStageUnlocked,
  newCampaignRun,
  newEndlessRun,
  chooseEndlessToolReward,
  playEndlessCardWithTool,
  playEndlessCardToPile,
  playCardToPile,
  priorityEndlessPileTargetForCard,
  purchaseMetaUpgrade,
  purchaseRunShop,
  priorityPileTargetForCard,
  recordCampaignResult,
  recordEndlessResult,
  rewardEffectSummary,
  runShopOptions,
  skipEndlessToolReward,
  storeOptions,
  useEndlessPruneTool,
} from "./game/number-solitaire.js";
import {
  clearRun,
  loadProfile,
  loadRun,
  loadSettings,
  resetAllStorage,
  saveProfile,
  saveRun,
  saveSettings,
} from "./game/storage.js";
import {
  initialRunForRequest,
  requestedPlayMode,
} from "./game/run-mode.js";
import {
  createPerformanceMonitor,
  installPerformanceTools,
} from "./performance.js";

const app = document.querySelector("#app");
const perfMonitor = createPerformanceMonitor("Stacks (스택스)");
const CARD_FLIGHT_MS = 420;
const HAND_SHIFT_DELAY_MS = 80;
const HAND_SHIFT_STAGGER_MS = 22;
const HAND_SHIFT_MS = 240;
const HAND_REFILL_DELAY_MS = 420;
const HAND_REFILL_MS = 430;
const LANDING_MOTION_MS = HAND_REFILL_DELAY_MS + HAND_REFILL_MS + 120;
const HARVEST_MOTION_MS = CARD_FLIGHT_MS + 1120;
const HARVEST_REWARD_SFX_DELAY_MS = CARD_FLIGHT_MS + 180;

const ui = {
  profile: loadProfile(),
  state: null,
  settings: loadSettings(),
  selectedHandIndex: null,
  discardMode: false,
  discardSelection: new Set(),
  modal: null,
  toast: null,
  motion: null,
  drag: null,
  suppressNextClick: false,
  hoveredHandIndex: null,
  armedToolIndex: null,
  hoverSfxHandIndex: null,
  handHoverLockUntil: 0,
  handHoverUnlockTimer: null,
};

const audio = {
  context: null,
};

ui.state = initialRunForRequest(
  loadRun(),
  ui.profile,
  requestedPlayMode(window.location.search),
  { seed: freshRunSeed() },
);
if (!ui.state) ui.state = newEndlessRun(defaultMetaProfile(), { seed: freshRunSeed() });

function performanceDetail() {
  return {
    phase: ui.state?.phase ?? "unknown",
    handCount: ui.state?.hand?.length ?? 0,
    modal: ui.modal ?? null,
    motion: ui.motion?.type ?? null,
  };
}

function clampSelectedHand() {
  if (!ui.state.hand.length) {
    ui.selectedHandIndex = null;
    return;
  }
  if (ui.selectedHandIndex && !ui.state.hand[ui.selectedHandIndex - 1]) ui.selectedHandIndex = null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function motionAllowed() {
  return ui.settings.animations && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function soundAllowed() {
  return ui.settings.sfx !== false;
}

function dealMotionDuration(count = 1) {
  return 620 + Math.max(0, count - 1) * 82;
}

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function audioContext() {
  if (!soundAllowed()) return null;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!audio.context) audio.context = new AudioContextClass({ latencyHint: "interactive" });
    return audio.context;
  } catch {
    return null;
  }
}

function playMidiTone(ctx, note, opts = {}) {
  const start = ctx.currentTime + (opts.delay ?? 0);
  const duration = opts.duration ?? 0.08;
  const gainValue = opts.gain ?? 0.018;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(midiFrequency(note), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playSfx(name, detail = {}) {
  const ctx = audioContext();
  if (!ctx) return;
  const run = () => {
    if (name === "select") {
      playMidiTone(ctx, 76, { duration: 0.045, gain: 0.012, type: "triangle" });
    } else if (name === "hover") {
      playMidiTone(ctx, 72, { duration: 0.035, gain: 0.007, type: "triangle" });
      playMidiTone(ctx, 79, { delay: 0.028, duration: 0.045, gain: 0.006, type: "triangle" });
    } else if (name === "reject") {
      playMidiTone(ctx, 47, { duration: 0.09, gain: 0.018, type: "sawtooth" });
      playMidiTone(ctx, 42, { delay: 0.055, duration: 0.11, gain: 0.014, type: "sawtooth" });
    } else if (name === "deal") {
      const count = Math.max(1, Math.min(5, Math.floor(Number(detail.count) || 1)));
      const notes = [57, 60, 64, 67, 72];
      notes.slice(0, count).forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.045, duration: 0.055, gain: 0.0095, type: "square" });
      });
    } else if (name === "reward") {
      [72, 76, 79, 84].forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.055, duration: 0.12, gain: 0.014, type: "triangle" });
      });
    } else if (name === "place") {
      if (detail.preview?.breaksCombo) {
        playMidiTone(ctx, 55, { duration: 0.065, gain: 0.014, type: "triangle" });
        playMidiTone(ctx, 50, { delay: 0.06, duration: 0.09, gain: 0.012, type: "triangle" });
        return;
      }
      const notes = detail.preview?.glow === "gold" ? [72, 79, 84] : detail.preview?.glow === "yellow" ? [67, 72, 76] : [60, 67, 72];
      notes.forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.045, duration: 0.09, gain: 0.013, type: "triangle" });
      });
    }
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}

function queueMotion(motion, duration = 520) {
  if (!motionAllowed()) return;
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  ui.motion = { ...motion, id };
  if (motion.type === "landing" || motion.type === "deal") {
    lockHandHover(duration + 140);
  }
  if (motion.type === "landing" && duration > CARD_FLIGHT_MS) {
    window.setTimeout(() => {
      if (ui.motion?.id === id && ui.motion.type === "landing") {
        ui.motion = { ...ui.motion, settled: true };
        render();
      }
    }, CARD_FLIGHT_MS);
  }
  window.setTimeout(() => {
    if (ui.motion?.id === id) {
      ui.motion = null;
      render();
    }
  }, duration);
}

function clearMotion() {
  ui.motion = null;
}

function showToast(message) {
  ui.toast = { message, id: Date.now() };
  render();
  window.setTimeout(() => {
    if (ui.toast?.message === message) {
      ui.toast = null;
      render();
    }
  }, 1800);
}

function persist() {
  if (!ui.settings.autosave) return;
  perfMonitor.measure("persist", () => {
    saveProfile(ui.profile);
    saveRun(ui.state);
    saveSettings(ui.settings);
  }, performanceDetail());
}

function selectedCard() {
  return ui.selectedHandIndex ? ui.state.hand[ui.selectedHandIndex - 1] : null;
}

function isEndlessRun(state = ui.state) {
  return state?.mode === "endless";
}

function armedToolEntry() {
  if (!isEndlessRun() || !ui.armedToolIndex) return null;
  const item = ui.state.tools?.[ui.armedToolIndex - 1];
  const detail = endlessToolSummary(item);
  return item && detail ? { ...detail, index: ui.armedToolIndex } : null;
}

function clearToolSelection() {
  ui.armedToolIndex = null;
  ui.selectedHandIndex = null;
  ui.hoveredHandIndex = null;
}

function gameplayInteractionBlocked() {
  return ui.motion != null;
}

function toolTargetPreviews() {
  const tool = armedToolEntry();
  if (!tool) return [];
  if (tool.id === "prune") return evaluateEndlessToolTargets(ui.state, tool.id);
  const handIndex = ui.hoveredHandIndex ?? ui.selectedHandIndex;
  return handIndex ? evaluateEndlessToolTargets(ui.state, tool.id, handIndex) : [];
}

function currentHandSummary() {
  return isEndlessRun() ? endlessHandPreviewSummary(ui.state) : handPreviewSummary(ui.state);
}

function currentBestTarget(handIndex) {
  return isEndlessRun() ? bestEndlessPileTargetForCard(ui.state, handIndex) : bestPileTargetForCard(ui.state, handIndex);
}

function currentPriorityTarget(handIndex) {
  return isEndlessRun() ? priorityEndlessPileTargetForCard(ui.state, handIndex) : priorityPileTargetForCard(ui.state, handIndex);
}

function playCurrentCard(handIndex, pileIndex) {
  return isEndlessRun() ? playEndlessCardToPile(ui.state, handIndex, pileIndex) : playCardToPile(ui.state, handIndex, pileIndex);
}

function discardCurrentCards(indices) {
  return isEndlessRun() ? discardEndlessCards(ui.state, indices) : discardNumberCards(ui.state, indices);
}

function previewPoints(preview) {
  return isEndlessRun() ? (preview?.harvestScore ?? 0) : (preview?.expectedReputation ?? 0);
}

function hasPlayableTarget(handIndex) {
  const { previews } = currentBestTarget(handIndex);
  return previews.some((preview) => preview && preview.playable !== false);
}

function hasPlayableToolTarget(handIndex) {
  const tool = armedToolEntry();
  if (!tool || tool.id === "prune") return false;
  return evaluateEndlessToolTargets(ui.state, tool.id, handIndex).some((preview) => preview.playable);
}

function rejectUnplayableHand(handIndex) {
  ui.selectedHandIndex = null;
  ui.discardSelection.clear();
  queueMotion({ type: "reject", handIndex }, 360);
  playSfx("reject");
  showToast("놓을 수 있는 정원 더미가 없습니다.");
}

function selectedTarget() {
  const tool = armedToolEntry();
  if (tool) {
    return { bestIndex: null, bestPreview: null, previews: toolTargetPreviews() };
  }
  const handIndex = isEndlessRun() && ui.state.phase === "play" && !ui.discardMode && ui.hoveredHandIndex
    ? ui.hoveredHandIndex
    : ui.selectedHandIndex;
  if (!handIndex) return { bestIndex: null, bestPreview: null, previews: [] };
  const target = currentBestTarget(handIndex);
  if (isEndlessRun()) {
    return {
      ...target,
      previews: target.bestPreview ? [target.bestPreview] : [],
    };
  }
  return target;
}

function endlessPreviewLabel(preview) {
  if (!preview) return "";
  if (preview.playable) return preview.primaryLabel;
  if (preview.reason === "height_locked") return "높이 제한";
  if (preview.reason === "pile_full") return "가득 참";
  if (preview.reason === "no_graft_target") return "접붙임 없음";
  if (preview.reason === "empty_pile") return "빈 정원";
  return "배치 불가";
}

function rewardPresentationBlocked() {
  return ui.motion?.type === "landing";
}

function handHoverLocked() {
  return ui.drag != null
    || ui.motion?.type === "landing"
    || ui.motion?.type === "deal"
    || Date.now() < (ui.handHoverLockUntil ?? 0);
}

function lockHandHover(duration = 0) {
  ui.handHoverLockUntil = Math.max(ui.handHoverLockUntil ?? 0, Date.now() + duration);
  ui.hoverSfxHandIndex = null;
  ui.hoveredHandIndex = null;
  app.querySelectorAll(".hand-card.is-hovered").forEach((node) => node.classList.remove("is-hovered"));
  if (ui.handHoverUnlockTimer) window.clearTimeout(ui.handHoverUnlockTimer);
  const delay = Math.max(0, ui.handHoverLockUntil - Date.now() + 20);
  ui.handHoverUnlockTimer = window.setTimeout(() => {
    ui.handHoverUnlockTimer = null;
    render();
  }, delay);
}

function visiblePileCardsForRender(pile, pileNumber) {
  const motion = ui.motion;
  if (motion?.type !== "landing" || motion.settled || motion.pileIndex !== pileNumber || !motion.card?.id) return pile.cards;
  return pile.cards.filter((card) => card.id !== motion.card.id);
}

function maybeFinalizeRun() {
  if (!["won", "game_over"].includes(ui.state.phase) || ui.state.resultRecorded) return;
  if (isEndlessRun()) {
    if (ui.state.phase !== "game_over") return;
    const result = recordEndlessResult(ui.profile, ui.state);
    ui.profile = result.profile;
    ui.state.resultRecorded = true;
    ui.state.resultImproved = result.improved;
    ui.state.resultBestScore = result.bestScore;
    ui.state.message = result.improved
      ? `새 최고 점수 ${result.score}점`
      : `최종 점수 ${result.score}점`;
    persist();
    return;
  }
  const result = recordCampaignResult(ui.profile, ui.state);
  ui.profile = result.profile;
  ui.state.resultRecorded = true;
  ui.state.resultPayout = result.payout;
  ui.state.resultCleared = result.cleared;
  ui.state.message = result.cleared
    ? `${result.stage.name} 클리어 · 씨앗 ${result.payout} 획득`
    : `재도전 씨앗 ${result.payout} 획득`;
  persist();
}

function freshRunSeed() {
  const randomPart = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff);
  const clockPart = Math.floor((globalThis.performance?.now?.() ?? 0) * 1000);
  return `${Date.now()}:${clockPart}:${randomPart}`;
}

function startEndlessMode() {
  ui.state = newEndlessRun(ui.profile, { seed: freshRunSeed() });
  ui.selectedHandIndex = null;
  ui.armedToolIndex = null;
  ui.hoveredHandIndex = null;
  ui.discardMode = false;
  ui.discardSelection.clear();
  ui.modal = null;
  const dealtIds = ui.state.hand.map((card) => card.id);
  queueMotion({ type: "deal", dealtIds }, dealMotionDuration(dealtIds.length));
  playSfx("deal", { count: dealtIds.length });
  persist();
  render();
}

function startStage(stageIndex) {
  if (!isCampaignStageUnlocked(ui.profile.numberCampaign, stageIndex)) {
    showToast("아직 잠긴 스테이지입니다.");
    return;
  }
  ui.profile.numberCampaign.lastSelectedStage = stageIndex;
  ui.state = newCampaignRun(ui.profile, stageIndex);
  ui.selectedHandIndex = null;
  ui.armedToolIndex = null;
  ui.hoveredHandIndex = null;
  ui.discardMode = false;
  ui.discardSelection.clear();
  ui.modal = null;
  const dealtIds = ui.state.hand.map((card) => card.id);
  queueMotion({ type: "deal", dealtIds }, dealMotionDuration(dealtIds.length));
  playSfx("deal", { count: dealtIds.length });
  persist();
  render();
}

function startNextStage() {
  const next = Math.min(CAMPAIGN_STAGES.length, (ui.state.stageIndex ?? 1) + 1);
  startStage(next);
}

function cardArt(card, className = "") {
  const alt = card ? `${card.cardName} ${card.digit}` : "카드";
  const src = cardImagePath(card?.imageId ?? "card_locked_unknown");
  return `<img class="${className}" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
}

function toolArt(toolOrId, className = "") {
  const tool = endlessToolSummary(toolOrId);
  const src = cardImagePath(tool?.imageId ?? "card_locked_unknown");
  return `<img class="${className}" src="${src}" alt="${escapeHtml(tool?.label ?? "도구")}" loading="lazy" decoding="async" />`;
}

function rewardArt(item, className = "") {
  return `<img class="${className}" src="${cardImagePath(item?.imageId ?? "card_locked_unknown")}" alt="${escapeHtml(item?.name ?? "발견")}" loading="lazy" decoding="async" />`;
}

function cardAddMarkup(card) {
  const digit = Math.max(0, Math.min(9, Math.floor(Number(card?.digit) || 0)));
  return digit === 0
    ? `<span class="card-add-number">0</span>`
    : `<span class="card-add-prefix">+</span><span class="card-add-number">${digit}</span>`;
}

function cardMultiplyMarkup(card) {
  const digit = Math.max(0, Math.min(9, Math.floor(Number(card?.digit) || 0)));
  const value = 9 - digit;
  return value === 0
    ? `<span class="card-multiply-number">0</span>`
    : `<span class="card-multiply-prefix">x</span><span class="card-multiply-number">${value}</span>`;
}

function cardAriaLabel(card) {
  return `${card?.digit ?? ""} ${card?.cardName ?? "카드"}`.trim();
}

function cardFace(card, artClass) {
  return `
    <span class="card-add">${cardAddMarkup(card)}</span>
    <span class="card-identity">
      ${cardArt(card, artClass)}
      <span class="card-name">${escapeHtml(card?.cardName ?? "카드")}</span>
    </span>
    <span class="card-multiply">${cardMultiplyMarkup(card)}</span>
  `;
}

function rewardChoiceText(reward) {
  const current = rewardById(reward?.id) ?? reward;
  const effect = rewardEffectSummary(ui.state, current);
  return {
    name: current?.name ?? "보상",
    line: effect.line || current?.short || current?.name || "보상 선택",
    detail: effect.detail || current?.description || "",
  };
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <span class="eyebrow">Stacks (스택스) 4.2</span>
        <h1>Stacks (스택스)</h1>
      </div>
      <nav class="top-actions" aria-label="주요 메뉴">
        <button class="tool-button" type="button" data-action="open-stages">스테이지</button>
        <button class="tool-button ${isEndlessRun() ? "is-active" : ""}" type="button" data-action="new-endless">무한</button>
        <button class="tool-button" type="button" data-action="open-store">상점</button>
        <button class="tool-button" type="button" data-action="open-codex">도감</button>
        <button class="icon-button" type="button" data-action="open-settings" aria-label="설정">S</button>
      </nav>
    </header>
  `;
}

function renderHud() {
  const state = ui.state;
  if (isEndlessRun(state)) {
    const best = Math.max(ui.profile.numberEndless?.bestScore ?? 0, state.bestScore ?? 0, state.score ?? 0);
    return `
      <section class="hud-band" aria-label="런 상태">
        <div class="stage-line">
          <div>
            <span class="eyebrow">무한 정원</span>
            <strong>수확 점수 모드</strong>
          </div>
          <span class="money-pill">최고 ${best}</span>
        </div>
        <div class="progress" aria-label="현재 점수">
          <div class="progress-meta">
            <span>점수</span>
            <strong>${state.score}</strong>
          </div>
          <div class="progress-track"><span style="width:${Math.min(100, Math.round(((state.score ?? 0) / Math.max(1, best)) * 100))}%"></span></div>
        </div>
        <div class="stat-grid">
          <div><span>교체</span><strong>${state.discardsRemaining}</strong></div>
          <div><span>수확</span><strong>${state.harvestCount ?? 0}</strong></div>
          <div><span>턴</span><strong>${state.turnCount ?? 0}</strong></div>
          <div><span>퇴비</span><strong>${state.compostPile?.length ?? 0}</strong></div>
        </div>
        <button class="tool-button deck-view-button" type="button" data-action="open-deck">덱 보기</button>
        <p class="message-line">${escapeHtml(state.message)}</p>
      </section>
    `;
  }
  const progress = pct(state.reputation, state.targetReputation);
  const land = LANDS[state.activeLand] ?? LANDS.meadow;
  const stage = stageByIndex(state.stageIndex ?? 1);
  return `
    <section class="hud-band" aria-label="런 상태">
      <div class="stage-line">
        <div>
          <span class="eyebrow">${escapeHtml(stage.name)}</span>
          <strong>${escapeHtml(land.label)} · ${escapeHtml(land.short)}</strong>
        </div>
        <span class="money-pill">씨앗 ${ui.profile.numberMoney}</span>
      </div>
      <div class="progress" aria-label="목표 평판">
        <div class="progress-meta">
          <span>평판</span>
          <strong>${state.reputation}/${state.targetReputation}</strong>
        </div>
        <div class="progress-track"><span style="width:${progress}%"></span></div>
      </div>
      <div class="stat-grid">
        <div><span>내기</span><strong>${state.playsRemaining}</strong></div>
        <div><span>갈아엎기</span><strong>${state.discardsRemaining}</strong></div>
        <div><span>런 코인</span><strong>${state.shopCoins}</strong></div>
        <div><span>최고 흐름</span><strong>${state.bestComboStep}</strong></div>
      </div>
      <p class="message-line">${escapeHtml(state.message)}</p>
    </section>
  `;
}

function renderRecommendation() {
  if (ui.state.phase !== "play" || armedToolEntry()) return "";
  const summary = currentHandSummary();
  if (!summary.bestIndex) return "";
  const scoreLine = isEndlessRun()
    ? summary.bestHarvestScore > 0 ? `+${summary.bestHarvestScore}` : `${summary.bestPotentialScore} 예열`
    : `+${summary.bestReputation}`;
  return `
    <section class="recommend-band" aria-label="추천">
      <div>
        <span class="eyebrow">다음 추천</span>
        <strong>${summary.bestCardName} -> ${summary.bestPileLabel}</strong>
      </div>
      <div class="recommend-score">
        <span>${summary.bestLabel}</span>
        <strong>${scoreLine}</strong>
      </div>
      <button class="tool-button recommend-button" type="button" data-action="auto-play">추천 놓기</button>
    </section>
  `;
}

function renderPiles() {
  const state = ui.state;
  const endless = isEndlessRun(state);
  const tool = armedToolEntry();
  const { bestIndex, previews } = selectedTarget();
  const previewByPile = new Map(previews.map((preview) => [preview.pileIndex, preview]));
  return `
    <section class="piles-area" aria-label="4정원 더미">
      <div class="piles-grid">
        ${state.piles.map((pile, index) => {
          const pileNumber = index + 1;
          const preview = previewByPile.get(pileNumber);
          const visibleCards = visiblePileCardsForRender(pile, pileNumber);
          const top = visibleCards[visibleCards.length - 1];
          const isBest = bestIndex === pileNumber && ui.state.phase === "play";
          const landing = ui.motion?.type === "landing" && ui.motion.settled && ui.motion.pileIndex === pileNumber;
          const toolMotion = ui.motion?.type === "tool" && ui.motion.pileIndex === pileNumber;
          const harvested = landing && ui.motion?.harvested;
          const showScore = landing && (!endless || (ui.motion?.points ?? 0) > 0);
          const stack = visibleCards.slice(-4);
          const footValue = endless
            ? preview
              ? preview.toolId === "prune" ? (preview.playable ? "1칸" : "-") : preview.harvestReady ? `+${preview.harvestScore}` : preview.playable ? `${preview.nextAddTotal}x${preview.nextMultiplyTotal}` : "-"
              : `${pile.addTotal ?? 0}x${pile.multiplyTotal ?? 0}`
            : preview ? `+${preview.expectedReputation}` : pile.baseTotal;
          const previewContent = pilePreviewContent(preview);
          return `
            <button class="pile-cell ${isBest ? "is-recommended" : ""} ${preview?.breaksCombo ? "is-break" : ""} ${tool && preview?.playable ? "is-tool-target" : ""} ${tool?.id === "relocate" && preview?.playable ? "is-relocate-target" : ""} ${tool?.id === "graft" && preview?.playable ? "is-graft-target" : ""} ${tool?.id === "prune" && preview?.playable ? "is-prune-target" : ""} ${landing ? "is-landing" : ""} ${harvested ? "is-landing-harvest" : ""} ${landing && ui.motion?.brokeCombo ? "is-landing-break" : ""} ${toolMotion ? "is-tool-landing" : ""}" type="button" data-action="play-pile" data-pile-index="${pileNumber}" aria-label="정원 ${pileNumber}${preview ? `, ${escapeHtml(endlessPreviewLabel(preview))}` : ""}" ${state.phase !== "play" ? "disabled" : ""}>
              <div class="pile-head">
                <span>${escapeHtml(pile.label)}</span>
                <strong>${endless ? `${pile.cards?.length ?? 0}/${pile.capacity ?? state.pileCapacity}` : `${pile.comboStep || 0}흐름`}</strong>
              </div>
              <div class="pile-stack" aria-hidden="true">
                ${stack.length
                  ? stack.map((card, cardIndex) => `
                    <span class="mini-card" style="--i:${cardIndex}; --color:${colorCss(card.color)}">
                      <span class="card-add">${cardAddMarkup(card)}</span>
                      ${cardArt(card, "mini-card-art")}
                      <span class="card-multiply">${cardMultiplyMarkup(card)}</span>
                    </span>
                  `).join("")
                  : `<span class="empty-pile">${landLabel(state.activeLand)}</span>`}
              </div>
              <div class="pile-foot">
                <span>${top ? escapeHtml(top.cardName) : "비어 있음"}</span>
                <strong>${footValue}</strong>
              </div>
              <div class="pile-preview" ${previewContent ? "" : "hidden"}>${previewContent}</div>
              ${harvested ? `<span class="harvest-ring" aria-hidden="true"></span>
                <span class="harvest-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>` : ""}
              ${showScore ? `<span class="score-pop ${ui.motion?.brokeCombo ? "is-break" : ""} ${harvested ? "is-harvest" : ""}">
                ${harvested ? `<span>수확</span><strong>+${ui.motion.points ?? 0}</strong><em>${escapeHtml(ui.motion.formula ?? "")}</em>` : `+${ui.motion.points ?? 0}`}
              </span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderTools() {
  if (!isEndlessRun()) return "";
  const armed = armedToolEntry();
  return `
    <section class="tool-belt ${armed ? "is-armed" : ""}" aria-label="정원 도구">
      <div class="tool-belt-head">
        <span class="eyebrow">정원 도구</span>
        <strong>${escapeHtml(armed ? armed.text : "보관함 2칸")}</strong>
        ${armed ? `<button class="tool-cancel" type="button" data-action="cancel-tool">취소</button>` : ""}
      </div>
      <div class="tool-slots">
        ${Array.from({ length: 2 }, (_, index) => {
          const toolIndex = index + 1;
          const item = ui.state.tools?.[index];
          const tool = endlessToolSummary(item);
          if (!tool) return `<span class="tool-slot is-empty" aria-label="빈 도구 슬롯"></span>`;
          const selected = ui.armedToolIndex === toolIndex;
          return `
            <button class="tool-slot ${selected ? "is-selected" : ""}" type="button" data-action="select-tool" data-tool-index="${toolIndex}" aria-pressed="${selected}" aria-label="${escapeHtml(`${tool.label}, 1회 남음. ${tool.description}${selected ? " 준비됨" : ""}`)}" ${ui.state.phase !== "play" ? "disabled" : ""}>
              ${toolArt(tool, "tool-art")}
              <span>${escapeHtml(tool.label)}</span>
              <small class="tool-use">1회</small>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderHand() {
  const endless = isEndlessRun();
  const handMotion = ui.motion?.type === "landing" ? ui.motion : null;
  const handFlowReady = handMotion?.settled === true;
  const playedHandIndex = handMotion?.playedHandIndex ?? 0;
  return `
    <section class="hand-area" aria-label="손패">
      <div class="hand-toolbar">
        <div>
          <span class="eyebrow">손패</span>
          <strong>${endless ? "수확 흐름 선택" : ui.discardMode ? "갈아엎기 선택" : "카드 선택"}</strong>
        </div>
        <div class="hand-actions">
          <button class="tool-button ${ui.discardMode ? "is-active" : ""}" type="button" data-action="${endless ? "apply-discard" : "toggle-discard"}" ${ui.state.phase !== "play" ? "disabled" : ""}>${endless ? "교체" : "갈아엎기"}</button>
          ${!endless && ui.discardMode ? `<button class="primary-button" type="button" data-action="apply-discard">선택 ${ui.discardSelection.size}</button>` : ""}
        </div>
      </div>
      <div class="hand-row">
        ${ui.state.hand.map((card, index) => {
          const handIndex = index + 1;
          const selected = ui.selectedHandIndex === handIndex;
          const hovered = ui.hoveredHandIndex === handIndex;
          const discardSelected = ui.discardSelection.has(handIndex);
          const dealtIndex = ui.motion?.type === "deal" ? (ui.motion.dealtIds?.indexOf(card.id) ?? -1) : -1;
          const beforeIndex = handMotion?.beforeHandIds?.indexOf(card.id) ?? -1;
          const shifted = beforeIndex >= playedHandIndex && beforeIndex > index;
          const shiftOrder = shifted ? Math.max(0, beforeIndex - playedHandIndex) : 0;
          const shiftDelay = HAND_SHIFT_DELAY_MS + shiftOrder * HAND_SHIFT_STAGGER_MS;
          const refillIndex = handMotion?.dealtIds?.indexOf(card.id) ?? -1;
          const refilling = refillIndex >= 0;
          const preShift = shifted && !handFlowReady;
          const preRefill = refilling && !handFlowReady;
          const activeShift = shifted && handFlowReady;
          const activeRefill = refilling && handFlowReady;
          const dealt = dealtIndex >= 0;
          const dealCount = ui.motion?.dealtIds?.length ?? 0;
          const dealX = dealt ? Math.round((dealtIndex - (dealCount - 1) / 2) * -14) : 0;
          const dealDelay = dealt ? dealtIndex * 82 : 0;
          const dealRotate = dealt ? Math.round((dealtIndex - (dealCount - 1) / 2) * 2) : 0;
          const rejected = ui.motion?.type === "reject" && ui.motion.handIndex === handIndex;
          const fan = index - (ui.state.hand.length - 1) / 2;
          return `
            <button class="hand-card ${selected ? "is-selected" : ""} ${hovered ? "is-hovered" : ""} ${discardSelected ? "is-discard-selected" : ""} ${preShift ? "is-hand-pre-shift" : ""} ${preRefill ? "is-hand-pre-refill" : ""} ${activeShift ? "is-hand-shifting" : ""} ${activeRefill ? "is-hand-refill" : ""} ${dealt ? "is-dealt" : ""} ${rejected ? "is-rejected" : ""}" type="button" data-action="select-card" data-hand-index="${handIndex}" aria-label="${escapeHtml(cardAriaLabel(card))}" style="--color:${colorCss(card.color)}; --fan:${fan}; --deal-index:${Math.max(0, dealtIndex)}; --deal-delay:${dealDelay}ms; --deal-x:${dealX}px; --deal-rotate:${dealRotate}deg; --hand-shift-delay:${shiftDelay}ms; --hand-shift-duration:${HAND_SHIFT_MS}ms; --hand-refill-delay:${HAND_REFILL_DELAY_MS}ms; --hand-refill-duration:${HAND_REFILL_MS}ms" ${ui.state.phase !== "play" ? "disabled" : ""}>
              ${cardFace(card, "card-art")}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderRewardOverlay() {
  if (ui.state.phase !== "reward" || rewardPresentationBlocked()) return "";
  const reason = ui.state.rewardReason === "firstFiveCombo" ? "새 발견" : "스테이지 보상";
  return `
    <section class="modal-backdrop is-inline" aria-label="보상">
      <div class="modal reward-modal">
        <div class="modal-head">
          <div>
            <span class="eyebrow">${reason}</span>
            <h2>정원 기록을 고르세요</h2>
          </div>
        </div>
        <div class="reward-grid">
          ${ui.state.rewardOptions.map((reward, index) => {
            const text = rewardChoiceText(reward);
            return `
              <button class="reward-option" type="button" data-action="choose-reward" data-reward-index="${index + 1}">
                ${rewardArt(reward, "reward-art")}
                <span>${escapeHtml(text.name)}</span>
                <strong>${escapeHtml(text.line)}</strong>
                <small>${escapeHtml(text.detail)}</small>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderToolRewardOverlay() {
  if (ui.state.phase !== "tool_reward" || rewardPresentationBlocked()) return "";
  const reward = ui.state.pendingToolReward;
  if (!reward) return "";
  const selected = endlessToolSummary(reward.selectedToolId);
  const full = (ui.state.tools?.length ?? 0) >= 2;
  return `
    <section class="modal-backdrop is-inline tool-reward-backdrop" aria-label="도구 보상">
      <div class="modal reward-modal tool-reward-modal">
        <div class="modal-head"><div><span class="eyebrow">수확 ${reward.harvestCount}</span><h2>${selected && full ? `${selected.label}와 바꿀 도구` : "정원 도구를 고르세요"}</h2></div></div>
        ${selected && full ? `
          <div class="tool-replace-row">
            ${ui.state.tools.map((item, index) => {
              const tool = endlessToolSummary(item);
              return `<button class="tool-replace-option" type="button" data-action="replace-tool-reward" data-tool-id="${selected.id}" data-replace-index="${index + 1}">
                ${toolArt(tool, "tool-reward-art")}
                <span>${escapeHtml(tool.label)}</span><small>${escapeHtml(`${selected.label}로 교체`)}</small>
              </button>`;
            }).join("")}
          </div>
          <button class="tool-button" type="button" data-action="skip-tool-reward">건너뛰기</button>
        ` : `
          <div class="tool-reward-row">
            ${reward.options.map((id) => {
              const tool = endlessToolSummary(id);
              return `<button class="tool-reward-option" type="button" data-action="choose-tool-reward" data-tool-id="${tool.id}">
                ${toolArt(tool, "tool-reward-art")}
                <span>${escapeHtml(tool.label)}</span><strong>${escapeHtml(tool.role)}</strong><small>${escapeHtml(tool.description)}</small>
              </button>`;
            }).join("")}
          </div>
          ${full ? `<button class="tool-button" type="button" data-action="skip-tool-reward">건너뛰기</button>` : ""}
        `}
      </div>
    </section>
  `;
}

function renderResultPanel() {
  if (!["won", "game_over"].includes(ui.state.phase)) return "";
  if (isEndlessRun()) {
    return `
      <section class="result-band is-loss">
        <div>
          <span class="eyebrow">${ui.state.resultImproved ? "새 기록" : "기록 종료"}</span>
          <strong>${escapeHtml(ui.state.failureReason ?? "더 이상 놓을 수 없습니다.")}</strong>
        </div>
        <span class="money-pill">${ui.state.score}점</span>
        <div class="result-actions">
          <button class="primary-button" type="button" data-action="restart-run">다시</button>
          <button class="tool-button" type="button" data-action="open-stages">스테이지</button>
        </div>
      </section>
    `;
  }
  const cleared = ui.state.phase === "won";
  return `
    <section class="result-band ${cleared ? "is-win" : "is-loss"}">
      <div>
        <span class="eyebrow">${cleared ? "클리어" : "재도전"}</span>
        <strong>${cleared ? "정원길을 열었습니다." : escapeHtml(ui.state.failureReason ?? "목표 평판 미달")}</strong>
      </div>
      <span class="money-pill">+${ui.state.resultPayout ?? 0} 씨앗</span>
      <div class="result-actions">
        ${cleared && (ui.state.stageIndex ?? 1) < CAMPAIGN_STAGES.length ? `<button class="primary-button" type="button" data-action="next-stage">다음</button>` : ""}
        <button class="tool-button" type="button" data-action="restart-run">다시</button>
      </div>
    </section>
  `;
}

function renderStagesModal() {
  return `
    <div class="modal">
      <div class="modal-head">
        <div>
          <span class="eyebrow">월드맵</span>
          <h2>스테이지</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">X</button>
      </div>
      <div class="stage-grid">
        <button class="stage-tile ${isEndlessRun() ? "cleared" : "unlocked"}" type="button" data-action="new-endless">
          <span>E</span>
          <strong>무한 정원</strong>
          <small>수확 점수 · 최고 ${ui.profile.numberEndless?.bestScore ?? 0}</small>
        </button>
        ${CAMPAIGN_STAGES.map((stage) => {
          const status = campaignStageStatus(ui.profile.numberCampaign, stage.index);
          const locked = status === "locked";
          return `
            <button class="stage-tile ${status}" type="button" data-action="select-stage" data-stage-index="${stage.index}" ${locked ? "disabled" : ""}>
              <span>${stage.index}</span>
              <strong>${escapeHtml(stage.name)}</strong>
              <small>${landLabel(stage.activeLand)} · 목표 ${stage.targetReputation}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderStoreModal() {
  const runOptions = ui.state.phase === "play" && !isEndlessRun() ? runShopOptions(ui.state) : [];
  const metaOptions = storeOptions(ui.profile);
  return `
    <div class="modal modal-wide">
      <div class="modal-head">
        <div>
          <span class="eyebrow">상점</span>
          <h2>런 보급과 메타 성장</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">X</button>
      </div>
      <div class="store-layout">
        <section>
          <div class="section-title"><span>런 코인 ${ui.state.shopCoins ?? 0}</span><strong>이번 런</strong></div>
          <div class="store-list">
            ${runOptions.length ? runOptions.map((option, index) => `
              <button class="store-row" type="button" data-action="buy-run-shop" data-shop-index="${index + 1}" ${ui.state.shopCoins < option.cost ? "disabled" : ""}>
                ${cardArt({ imageId: option.imageId, cardName: option.name, digit: option.digit ?? "" }, "store-art")}
                <span><b>${escapeHtml(option.name)}</b><small>${escapeHtml(option.line)} · ${escapeHtml(option.previewLine)}</small></span>
                <strong>${option.cost}</strong>
              </button>
            `).join("") : `<p class="empty-text">${isEndlessRun() ? "무한 정원은 현재 런 보급 없이 진행됩니다." : "완료된 런에서는 보급을 쓸 수 없습니다."}</p>`}
          </div>
        </section>
        <section>
          <div class="section-title"><span>씨앗 ${ui.profile.numberMoney}</span><strong>메타 성장</strong></div>
          <div class="store-list">
            ${metaOptions.map((option) => `
              <button class="store-row" type="button" data-action="buy-meta" data-upgrade-id="${option.id}" ${option.maxed || !option.affordable ? "disabled" : ""}>
                <span class="upgrade-mark">${option.level}/${option.max}</span>
                <span><b>${escapeHtml(option.name)}</b><small>${escapeHtml(option.description)}</small></span>
                <strong>${option.maxed ? "MAX" : option.nextCost}</strong>
              </button>
            `).join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderCodexModal() {
  const summary = catalogSummary(ui.state);
  const entries = codexEntries(ui.state);
  const nextGoal = entries.discoveries.find((item) => item.status !== "discovered") ?? entries.discoveries[0];
  return `
    <div class="modal modal-wide">
      <div class="modal-head">
        <div>
          <span class="eyebrow">도감</span>
          <h2>발견 기록</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">X</button>
      </div>
      <section class="codex-hero">
        ${rewardArt(nextGoal, "codex-hero-art")}
        <div>
          <span class="eyebrow">다음 발견</span>
          <strong>${escapeHtml(nextGoal?.name ?? "정원 기록")}</strong>
          <p>${escapeHtml(nextGoal?.codexNote ?? nextGoal?.description ?? "")}</p>
        </div>
      </section>
      <div class="codex-summary">
        <span>숫자 ${summary.digits.known}/${summary.digits.total}</span>
        <span>족보 ${summary.combos.known}/${summary.combos.total}</span>
        <span>땅 ${summary.lands.known}/${summary.lands.total}</span>
        <span>발견 ${summary.discoveries.discovered}/${summary.discoveries.total}</span>
      </div>
      <div class="codex-grid">
        ${entries.discoveries.map((item) => `
          <div class="codex-item ${item.status}">
            ${rewardArt(item, "codex-item-art")}
            <span>${item.status === "hidden" ? "???" : escapeHtml(item.name)}</span>
            <small>${item.status === "discovered" ? "완료" : item.status === "seen" ? "후보" : "숨김"}</small>
          </div>
        `).join("")}
      </div>
      <div class="rule-strip">
        ${DIGITS.map((item) => `<span style="--color:${colorCss(item.color)}">${item.digit} ${escapeHtml(item.cardName)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderSettingsModal() {
  return `
    <div class="modal">
      <div class="modal-head">
        <div>
          <span class="eyebrow">설정</span>
          <h2>플레이 설정</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">X</button>
      </div>
      <div class="settings-list">
        <label><input type="checkbox" data-action="toggle-setting" data-setting="animations" ${ui.settings.animations ? "checked" : ""} /> 애니메이션</label>
        <label><input type="checkbox" data-action="toggle-setting" data-setting="cardGlow" ${ui.settings.cardGlow ? "checked" : ""} /> 카드 강조</label>
        <label><input type="checkbox" data-action="toggle-setting" data-setting="sfx" ${ui.settings.sfx !== false ? "checked" : ""} /> 효과음</label>
        <label><input type="checkbox" data-action="toggle-setting" data-setting="autosave" ${ui.settings.autosave ? "checked" : ""} /> 자동 저장</label>
      </div>
      <div class="danger-zone">
        <button class="tool-button" type="button" data-action="new-run">새 런</button>
        <button class="tool-button" type="button" data-action="new-endless">새 무한</button>
        <button class="tool-button danger" type="button" data-action="reset-storage">저장 초기화</button>
      </div>
    </div>
  `;
}

function renderDeckModal() {
  const deck = ui.state.deck ?? [];
  const compost = ui.state.compostPile ?? [];
  return `
    <div class="modal modal-wide deck-modal">
      <div class="modal-head">
        <div>
          <span class="eyebrow">무한 정원</span>
          <h2>덱 보기</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">X</button>
      </div>
      <div class="deck-summary">
        <span>남은 덱 ${deck.length}</span>
        <span>퇴비 ${compost.length}</span>
      </div>
      <div class="deck-list" role="list">
        ${deck.length ? deck.map((card, index) => `
            <div class="deck-row" role="listitem">
              <b>${index + 1}</b>
              <span class="deck-digit">${card.digit}</span>
              <span><strong>${escapeHtml(card.cardName)}</strong><small>${escapeHtml(card.categoryLabel)} · ${escapeHtml(card.colorLabel)}</small></span>
            </div>
          `).join("") : `<p class="empty-text">덱이 비어 있습니다. 다음 뽑기 전에 퇴비가 섞입니다.</p>`}
      </div>
    </div>
  `;
}

function renderModal() {
  if (!ui.modal) return "";
  const content = ui.modal === "stages"
    ? renderStagesModal()
    : ui.modal === "store"
      ? renderStoreModal()
      : ui.modal === "codex"
        ? renderCodexModal()
        : ui.modal === "deck"
          ? renderDeckModal()
          : renderSettingsModal();
  return `<section class="modal-backdrop">${content}</section>`;
}

function renderToast() {
  return ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast.message)}</div>` : "";
}

function renderMotionLayer() {
  const motion = ui.motion;
  if (motion?.type !== "landing" || motion.settled || !motion.source || !motion.target || !motion.card) return "";
  const { source, target, card } = motion;
  const tx = target.left + target.width * 0.5 - (source.left + source.width * 0.5);
  const ty = target.top + target.height * 0.66 - (source.top + source.height * 0.5);
  return `
    <div class="motion-layer" aria-hidden="true">
      <div class="flight-card" style="--x:${source.left}px; --y:${source.top}px; --w:${source.width}px; --h:${source.height}px; --tx:${tx}px; --ty:${ty}px; --color:${colorCss(card.color)}">
        ${cardFace(card, "card-art")}
      </div>
    </div>
  `;
}

function render() {
  const stopRender = perfMonitor.start("render", performanceDetail());
  clampSelectedHand();
  maybeFinalizeRun();
  const state = ui.state;
  try {
    app.innerHTML = `
      <main class="shell ${ui.settings.animations ? "" : "no-motion"} ${ui.settings.cardGlow ? "" : "no-glow"}">
        ${renderTopbar()}
        <div class="play-layout">
          <aside class="left-rail">
            ${renderHud()}
          </aside>
          <section class="table-surface" aria-label="게임 보드">
            ${renderResultPanel()}
            ${renderPiles()}
            ${renderTools()}
            ${renderHand()}
          </section>
        </div>
        ${renderRewardOverlay()}
        ${renderToolRewardOverlay()}
        ${renderModal()}
        ${renderToast()}
        ${renderMotionLayer()}
      </main>
    `;
    document.body.dataset.phase = state.phase;
    document.body.dataset.mode = state.mode ?? "number";
    document.body.classList.toggle("no-motion-body", !motionAllowed());
    document.body.classList.toggle("is-hand-hover-locked", handHoverLocked());
  } finally {
    stopRender({
      ...performanceDetail(),
      nodeCount: app.getElementsByTagName("*").length,
    });
  }
}

function actionButton(target) {
  return target.closest("[data-action]");
}

function rectSnapshot(rect) {
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function handCardRect(handIndex) {
  return rectSnapshot(app.querySelector(`.hand-card[data-hand-index="${handIndex}"]`)?.getBoundingClientRect());
}

function pileCellRect(pileIndex) {
  return rectSnapshot(app.querySelector(`.pile-cell[data-pile-index="${pileIndex}"]`)?.getBoundingClientRect());
}

function handleHandHoverEnter(handIndex, cardEl = null) {
  if (handHoverLocked() || ui.state.phase !== "play" || ui.discardMode || !ui.state.hand?.[handIndex - 1]) return;
  if (isEndlessRun()) {
    if (ui.hoveredHandIndex === handIndex) return;
    ui.hoveredHandIndex = handIndex;
    applyHandHoverPreview();
    playSfx("hover");
    return;
  }
  app.querySelectorAll(".hand-card.is-hovered").forEach((node) => {
    if (node !== cardEl) node.classList.remove("is-hovered");
  });
  cardEl?.classList.add("is-hovered");
  if (ui.hoverSfxHandIndex === handIndex) return;
  ui.hoverSfxHandIndex = handIndex;
  playSfx("hover");
}

function handleHandHoverLeave(handIndex, cardEl = null) {
  if (isEndlessRun() && ui.hoveredHandIndex === handIndex) {
    if (cardEl && !cardEl.isConnected) return;
    ui.hoveredHandIndex = null;
    applyHandHoverPreview();
    return;
  }
  cardEl?.classList.remove("is-hovered");
  if (ui.hoverSfxHandIndex === handIndex) ui.hoverSfxHandIndex = null;
}

function pilePreviewContent(preview) {
  if (!preview) return "";
  if (isEndlessRun()) {
    const result = preview.toolId === "prune"
      ? preview.playable ? "1칸 확보" : "-"
      : preview.harvestReady
        ? "수확"
        : preview.playable ? `${preview.cardsToHarvest}장` : "-";
    return `<span>${escapeHtml(endlessPreviewLabel(preview))}</span><span>${result}</span>`;
  }
  return `<span>${escapeHtml(preview.primaryLabel)}</span><span>x${preview.nextMultiplier}</span>`;
}

function applyHandHoverPreview() {
  const tool = armedToolEntry();
  const { bestIndex, previews } = selectedTarget();
  const previewByPile = new Map(previews.map((preview) => [preview.pileIndex, preview]));
  app.querySelectorAll(".hand-card[data-hand-index]").forEach((card) => {
    const handIndex = Number(card.dataset.handIndex);
    card.classList.toggle("is-hovered", ui.hoveredHandIndex === handIndex);
    card.classList.toggle("is-selected", ui.selectedHandIndex === handIndex);
  });
  app.querySelectorAll(".pile-cell[data-pile-index]").forEach((pile) => {
    const pileIndex = Number(pile.dataset.pileIndex);
    const preview = previewByPile.get(pileIndex);
    pile.classList.toggle("is-recommended", bestIndex === pileIndex && ui.state.phase === "play");
    pile.classList.toggle("is-break", preview?.breaksCombo === true);
    pile.classList.toggle("is-tool-target", Boolean(tool && preview?.playable));
    pile.classList.toggle("is-relocate-target", Boolean(tool?.id === "relocate" && preview?.playable));
    pile.classList.toggle("is-graft-target", Boolean(tool?.id === "graft" && preview?.playable));
    pile.classList.toggle("is-prune-target", Boolean(tool?.id === "prune" && preview?.playable));
    pile.setAttribute("aria-label", `정원 ${pileIndex}${preview ? `, ${endlessPreviewLabel(preview)}` : ""}`);
    const previewSlot = pile.querySelector(".pile-preview");
    if (previewSlot) {
      const content = pilePreviewContent(preview);
      previewSlot.innerHTML = content;
      previewSlot.hidden = !content;
    }
  });
}

function playFromHandToPile(handIndex, pileIndex, opts = {}) {
  if (ui.state.phase !== "play") return { ok: false, reason: "not_playing" };
  const playedCard = ui.state.hand[handIndex - 1] ? { ...ui.state.hand[handIndex - 1] } : null;
  const sourceRect = rectSnapshot(opts.sourceRect) ?? handCardRect(handIndex);
  const targetRect = rectSnapshot(opts.targetRect) ?? pileCellRect(pileIndex);
  const beforeHand = ui.state.hand.map((card) => card.id);
  const toolIndex = opts.toolIndex ?? null;
  const result = perfMonitor.measure("game.playCard", () => toolIndex
    ? playEndlessCardWithTool(ui.state, toolIndex, handIndex, pileIndex)
    : playCurrentCard(handIndex, pileIndex), {
    ...performanceDetail(),
    handIndex,
    pileIndex,
    toolIndex,
  });
  if (!result.ok) {
    queueMotion({ type: "reject", handIndex }, 360);
    playSfx("reject");
    showToast(result.reason);
    return result;
  }
  const beforeIds = new Set(beforeHand);
  const dealtIds = ui.state.hand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
  if (toolIndex) clearToolSelection();
  else ui.selectedHandIndex = null;
  ui.discardSelection.clear();
  const motionDuration = result.harvest ? HARVEST_MOTION_MS : LANDING_MOTION_MS;
  queueMotion({
    type: "landing",
    pileIndex: result.preview?.pileIndex ?? pileIndex,
    points: previewPoints(result.preview),
    harvested: result.harvest != null,
    formula: result.harvest ? `${result.harvest.addTotal} x ${result.harvest.multiplyTotal}` : result.preview?.scoreFormula,
    brokeCombo: result.preview?.breaksCombo === true,
    dealtIds,
    beforeHandIds: beforeHand,
    playedHandIndex: handIndex,
    source: sourceRect,
    target: targetRect,
    card: playedCard,
    toolId: result.tool?.id ?? null,
  }, motionDuration);
  playSfx("place", { preview: result.preview });
  if (ui.state.phase === "reward" || ui.state.phase === "won" || result.harvest) {
    const rewardDelay = result.harvest
      ? HARVEST_REWARD_SFX_DELAY_MS
      : ui.motion?.type === "landing" ? LANDING_MOTION_MS : 150;
    window.setTimeout(() => playSfx("reward"), rewardDelay);
  }
  persist();
  render();
  return result;
}

function playPruneTool(pileIndex) {
  const tool = armedToolEntry();
  if (!tool || tool.id !== "prune") return { ok: false, reason: "wrong_tool" };
  const result = perfMonitor.measure("game.tool", () => useEndlessPruneTool(ui.state, tool.index, pileIndex), {
    ...performanceDetail(),
    toolId: tool.id,
    pileIndex,
  });
  if (!result.ok) {
    playSfx("reject");
    showToast(result.reason);
    return result;
  }
  clearToolSelection();
  queueMotion({ type: "tool", toolId: "prune", pileIndex, removedCard: result.removedCard }, 520);
  playSfx("place", { preview: result.preview });
  persist();
  render();
  return result;
}

function playBestCard(handIndex) {
  const targetIndex = handIndex ?? currentHandSummary().bestIndex;
  if (!targetIndex) return { ok: false, reason: "no_card" };
  const target = currentBestTarget(targetIndex);
  if (!target.bestIndex) {
    rejectUnplayableHand(targetIndex);
    return { ok: false, reason: "no_playable_pile" };
  }
  return playFromHandToPile(targetIndex, target.bestIndex);
}

function quickPlayPriorityTarget(handIndex, sourceRect = null) {
  if (ui.state.phase !== "play" || ui.discardMode || armedToolEntry()) return false;
  const target = currentPriorityTarget(handIndex);
  if (!target.bestIndex) return false;
  const result = playFromHandToPile(handIndex, target.bestIndex, {
    sourceRect: sourceRect ?? handCardRect(handIndex),
    targetRect: pileCellRect(target.bestIndex),
  });
  return result.ok === true;
}

function handleAction(action, button) {
  if (gameplayInteractionBlocked() && [
    "select-card",
    "play-pile",
    "select-tool",
    "cancel-tool",
    "auto-play",
    "toggle-discard",
    "apply-discard",
  ].includes(action)) return;
  if (action === "select-card") {
    const index = Number(button.dataset.handIndex);
    if (ui.discardMode) {
      if (ui.discardSelection.has(index)) ui.discardSelection.delete(index);
      else ui.discardSelection.add(index);
      playSfx("select");
    } else {
      const tool = armedToolEntry();
      if (tool) {
        if (tool.id === "prune") {
          showToast("가지치기할 정원을 고르세요.");
          return;
        }
        if (!hasPlayableToolTarget(index)) {
          rejectUnplayableHand(index);
          return;
        }
        ui.selectedHandIndex = index;
        ui.hoveredHandIndex = index;
        playSfx("select");
        render();
        return;
      }
      if (isEndlessRun()) {
        if (!hasPlayableTarget(index)) {
          rejectUnplayableHand(index);
          return;
        }
        playBestCard(index);
        return;
      }
      if (quickPlayPriorityTarget(index, rectSnapshot(button.getBoundingClientRect()))) return;
      if (!hasPlayableTarget(index)) {
        rejectUnplayableHand(index);
        return;
      }
      ui.selectedHandIndex = index;
      playSfx("select");
    }
  } else if (action === "play-pile") {
    const tool = armedToolEntry();
    const pileIndex = Number(button.dataset.pileIndex);
    if (ui.state.phase === "play" && tool?.id === "prune") {
      playPruneTool(pileIndex);
    } else if (ui.state.phase === "play" && tool && ui.selectedHandIndex) {
      playFromHandToPile(ui.selectedHandIndex, pileIndex, { toolIndex: tool.index });
    } else if (ui.state.phase === "play" && ui.selectedHandIndex) {
      playFromHandToPile(ui.selectedHandIndex, pileIndex);
    }
  } else if (action === "select-tool") {
    const index = Number(button.dataset.toolIndex);
    ui.armedToolIndex = ui.armedToolIndex === index ? null : index;
    ui.selectedHandIndex = null;
    ui.hoveredHandIndex = null;
    ui.discardMode = false;
    ui.discardSelection.clear();
    playSfx("select");
  } else if (action === "cancel-tool") {
    clearToolSelection();
  } else if (action === "auto-play") {
    clearToolSelection();
    playBestCard(ui.selectedHandIndex);
  } else if (action === "toggle-discard") {
    ui.discardMode = !ui.discardMode;
    ui.discardSelection.clear();
  } else if (action === "apply-discard") {
    const beforeIds = new Set(ui.state.hand.map((card) => card.id));
    const indices = isEndlessRun() ? ui.state.hand.map((_, index) => index + 1) : [...ui.discardSelection];
    const result = perfMonitor.measure("game.discard", () => discardCurrentCards(indices), performanceDetail());
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else {
      const dealtIds = ui.state.hand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
      queueMotion({ type: "deal", dealtIds }, dealMotionDuration(dealtIds.length));
      playSfx("deal", { count: dealtIds.length });
    }
    ui.discardMode = false;
    ui.armedToolIndex = null;
    ui.discardSelection.clear();
    persist();
  } else if (action === "choose-reward") {
    const result = perfMonitor.measure("game.reward", () => applyReward(ui.state, Number(button.dataset.rewardIndex)), performanceDetail());
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else {
      playSfx("reward");
    }
    persist();
  } else if (action === "choose-tool-reward") {
    const result = chooseEndlessToolReward(ui.state, button.dataset.toolId);
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else if (!result.pendingReplacement) {
      playSfx("reward");
    }
    persist();
  } else if (action === "replace-tool-reward") {
    const result = chooseEndlessToolReward(ui.state, button.dataset.toolId, Number(button.dataset.replaceIndex));
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else {
      playSfx("reward");
    }
    persist();
  } else if (action === "skip-tool-reward") {
    const result = skipEndlessToolReward(ui.state);
    if (!result.ok) showToast(result.reason);
    persist();
  } else if (action === "open-stages") {
    ui.modal = "stages";
  } else if (action === "open-store") {
    ui.modal = "store";
  } else if (action === "open-codex") {
    ui.modal = "codex";
  } else if (action === "open-deck") {
    ui.modal = "deck";
  } else if (action === "open-settings") {
    ui.modal = "settings";
  } else if (action === "close-modal") {
    ui.modal = null;
  } else if (action === "select-stage") {
    startStage(Number(button.dataset.stageIndex));
    return;
  } else if (action === "new-endless") {
    startEndlessMode();
    return;
  } else if (action === "buy-run-shop") {
    const result = purchaseRunShop(ui.state, Number(button.dataset.shopIndex));
    if (!result.ok) showToast(result.reason);
    persist();
  } else if (action === "buy-meta") {
    const result = purchaseMetaUpgrade(ui.profile, button.dataset.upgradeId);
    if (result.ok) ui.profile = result.profile;
    else showToast(result.reason);
    persist();
  } else if (action === "next-stage") {
    startNextStage();
    return;
  } else if (action === "restart-run" || action === "new-run") {
    if (isEndlessRun()) {
      startEndlessMode();
      return;
    }
    startStage(ui.state.stageIndex ?? ui.profile.numberCampaign.lastSelectedStage);
    return;
  } else if (action === "toggle-setting") {
    const key = button.dataset.setting;
    ui.settings[key] = button.checked;
    saveSettings(ui.settings);
  } else if (action === "reset-storage") {
    resetAllStorage();
    ui.profile = defaultMetaProfile();
    ui.state = newEndlessRun(ui.profile, { seed: freshRunSeed() });
    ui.armedToolIndex = null;
    ui.selectedHandIndex = null;
    ui.hoveredHandIndex = null;
    ui.settings = loadSettings();
    ui.modal = null;
    clearMotion();
    clearRun();
  }
  render();
}

function clearDropTargets() {
  document.querySelectorAll(".pile-cell.is-drop-target, .pile-cell.is-drop-valid, .pile-cell.is-drop-danger").forEach((node) => {
    node.classList.remove("is-drop-target", "is-drop-valid", "is-drop-danger");
  });
}

function pileFromPoint(x, y) {
  const target = document.elementFromPoint(x, y)?.closest(".pile-cell[data-pile-index]");
  if (!target || target.disabled) return null;
  return Number(target.dataset.pileIndex) || null;
}

function updateDragGhost() {
  const drag = ui.drag;
  if (!drag?.ghost) return;
  const left = Math.round(drag.x - drag.offsetX);
  const top = Math.round(drag.y - drag.offsetY - 3);
  drag.ghost.style.setProperty("--drag-x", `${left}px`);
  drag.ghost.style.setProperty("--drag-y", `${top}px`);
  drag.ghost.style.setProperty("--drag-w", `${Math.round(drag.sourceRect.width)}px`);
  drag.ghost.style.setProperty("--drag-h", `${Math.round(drag.sourceRect.height)}px`);
}

function ensureDragGhost() {
  const drag = ui.drag;
  if (!drag || drag.ghost) return;
  const ghost = document.createElement("div");
  ghost.className = `drag-card is-ready ${drag.sourceEl.classList.contains("is-selected") ? "is-selected" : ""}`;
  ghost.innerHTML = drag.sourceEl.innerHTML;
  ghost.style.setProperty("--color", colorCss(drag.card.color));
  drag.ghost = ghost;
  updateDragGhost();
  document.body.appendChild(ghost);
  drag.sourceEl.classList.add("is-drag-source");
  document.body.classList.add("is-card-dragging");
}

function updateDropTarget(x, y) {
  const drag = ui.drag;
  if (!drag) return null;
  const pileIndex = pileFromPoint(x, y);
  if (drag.overPileIndex === pileIndex) return pileIndex;
  clearDropTargets();
  drag.overPileIndex = pileIndex;
  drag.ghost?.classList.remove("is-over-valid", "is-over-break");
  if (!pileIndex) return null;
  const target = document.querySelector(`.pile-cell[data-pile-index="${pileIndex}"]`);
  const preview = drag.previews.find((item) => item.pileIndex === pileIndex);
  target?.classList.add("is-drop-target", preview?.breaksCombo || preview?.playable === false ? "is-drop-danger" : "is-drop-valid");
  drag.ghost?.classList.add(preview?.breaksCombo || preview?.playable === false ? "is-over-break" : "is-over-valid");
  return pileIndex;
}

function endDragVisuals() {
  const drag = ui.drag;
  clearDropTargets();
  drag?.sourceEl?.classList.remove("is-drag-source");
  drag?.ghost?.remove();
  document.body.classList.remove("is-card-dragging");
  ui.drag = null;
}

function beginCardDrag(event, sourceEl) {
  if (ui.state.phase !== "play" || ui.discardMode || sourceEl.disabled) return;
  if (isEndlessRun()) return;
  const handIndex = Number(sourceEl.dataset.handIndex);
  const card = ui.state.hand[handIndex - 1];
  if (!card) return;
  if (!hasPlayableTarget(handIndex)) return;
  const stopDragStart = perfMonitor.start("drag.start", performanceDetail());
  const sourceRect = sourceEl.getBoundingClientRect();
  const { previews } = currentBestTarget(handIndex);
  ui.selectedHandIndex = handIndex;
  ui.suppressNextClick = true;
  ui.drag = {
    pointerId: event.pointerId,
    handIndex,
    card,
    previews,
    sourceEl,
    sourceRect,
    ghost: null,
    offsetX: event.clientX - sourceRect.left,
    offsetY: event.clientY - sourceRect.top,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    overPileIndex: null,
  };
  if (event.pointerId != null) sourceEl.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  stopDragStart({ handIndex });
}

function moveCardDrag(event) {
  const drag = ui.drag;
  if (!drag) return;
  if (drag.pointerId != null && event.pointerId != null && drag.pointerId !== event.pointerId) return;
  if (drag.pointerId != null && event.pointerId == null) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (dx * dx + dy * dy > 36) {
    drag.moved = true;
    ensureDragGhost();
  }
  perfMonitor.measure("drag.move", () => {
    updateDragGhost();
    if (drag.moved) updateDropTarget(event.clientX, event.clientY);
  }, {
    ...performanceDetail(),
    handIndex: drag.handIndex,
  });
  event.preventDefault();
}

function releaseCardDrag(event) {
  const drag = ui.drag;
  if (!drag) return;
  if (drag.pointerId != null && event.pointerId != null && drag.pointerId !== event.pointerId) return;
  if (drag.pointerId != null && event.pointerId == null) return;
  const pileIndex = event.type === "pointercancel" ? null : pileFromPoint(event.clientX, event.clientY);
  const moved = drag.moved;
  const handIndex = drag.handIndex;
  const sourceRect = drag.sourceRect;
  const canceled = event.type === "pointercancel";
  endDragVisuals();
  event.preventDefault();
  if (pileIndex) {
    playFromHandToPile(handIndex, pileIndex, { sourceRect });
    return;
  }
  if (moved) {
    queueMotion({ type: "reject", handIndex }, 360);
    playSfx("reject");
    showToast("정원 더미 위에 놓아야 합니다.");
    return;
  }
  if (canceled) {
    ui.selectedHandIndex = handIndex;
    render();
    return;
  }
  if (quickPlayPriorityTarget(handIndex, sourceRect)) return;
  ui.selectedHandIndex = handIndex;
  playSfx("select");
  render();
}

app.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card) return;
  beginCardDrag(event, card);
});

app.addEventListener("mousedown", (event) => {
  if (ui.drag || event.button !== 0) return;
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card) return;
  beginCardDrag(event, card);
});

app.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch" || handHoverLocked()) return;
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || card.disabled || card.contains(event.relatedTarget)) return;
  handleHandHoverEnter(Number(card.dataset.handIndex), card);
});

app.addEventListener("pointerout", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || (event.relatedTarget && card.contains(event.relatedTarget))) return;
  handleHandHoverLeave(Number(card.dataset.handIndex), card);
});

app.addEventListener("focusin", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card) return;
  handleHandHoverEnter(Number(card.dataset.handIndex), card);
});

app.addEventListener("focusout", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || card.contains(event.relatedTarget)) return;
  handleHandHoverLeave(Number(card.dataset.handIndex), card);
});

window.addEventListener("pointermove", moveCardDrag);
window.addEventListener("pointerup", releaseCardDrag);
window.addEventListener("pointercancel", releaseCardDrag);
window.addEventListener("mousemove", moveCardDrag);
window.addEventListener("mouseup", releaseCardDrag);

app.addEventListener("click", (event) => {
  if (ui.suppressNextClick) {
    ui.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = actionButton(event.target);
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  perfMonitor.measure("action", () => handleAction(action, button), { ...performanceDetail(), action });
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-action='toggle-setting']")) {
    perfMonitor.measure("action", () => handleAction("toggle-setting", target), {
      ...performanceDetail(),
      action: "toggle-setting",
    });
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  perfMonitor.measure("keyboard", () => {
    if (gameplayInteractionBlocked() && ["1", "2", "3", "4", "5", "6", "7", "q", "w", "e", "r", "enter", " "].includes(key)) return;
    if (key === "6" || key === "7") {
      const toolIndex = Number(key) - 5;
      if (ui.state.phase === "play" && ui.state.tools?.[toolIndex - 1]) {
        ui.armedToolIndex = ui.armedToolIndex === toolIndex ? null : toolIndex;
        ui.selectedHandIndex = null;
        ui.hoveredHandIndex = null;
        render();
      }
    } else if (key >= "1" && key <= "5") {
      const index = Number(key);
      if (ui.state.hand[index - 1] && armedToolEntry()?.id !== "prune") ui.selectedHandIndex = index;
      render();
    } else if (["q", "w", "e", "r"].includes(key)) {
      const pile = { q: 1, w: 2, e: 3, r: 4 }[key];
      const tool = armedToolEntry();
      if (ui.state.phase === "play" && tool?.id === "prune") {
        playPruneTool(pile);
      } else if (ui.state.phase === "play" && tool && ui.selectedHandIndex) {
        playFromHandToPile(ui.selectedHandIndex, pile, { toolIndex: tool.index });
      } else if (ui.state.phase === "play" && ui.selectedHandIndex) {
        if (isEndlessRun()) playBestCard(ui.selectedHandIndex);
        else playFromHandToPile(ui.selectedHandIndex, pile);
      }
    } else if (key === "enter" || key === " ") {
      if (ui.state.phase === "play" && !armedToolEntry()) {
        playBestCard(ui.selectedHandIndex ?? currentHandSummary().bestIndex);
      }
    } else if (key === "n") {
      if (isEndlessRun()) startEndlessMode();
      else startStage(ui.state.stageIndex ?? 1);
    } else if (key === "m") {
      ui.modal = "stages";
      render();
    } else if (key === "s") {
      ui.modal = "store";
      render();
    } else if (key === "c") {
      ui.modal = "codex";
      render();
    } else if (key === "escape") {
      if (armedToolEntry()) clearToolSelection();
      else ui.modal = null;
      render();
    }
  }, { ...performanceDetail(), key });
});

installPerformanceTools({
  monitor: perfMonitor,
  render,
  root: app,
  getDetail: performanceDetail,
});

persist();
render();
