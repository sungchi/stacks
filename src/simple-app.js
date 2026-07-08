import {
  CAMPAIGN_STAGES,
  DIGITS,
  LANDS,
  cardImagePath,
  colorCss,
  landLabel,
  rewardById,
  stageByIndex,
} from "./game/catalog.js";
import {
  applyReward,
  bestEndlessPileTargetForCard,
  bestPileTargetForCard,
  campaignStageStatus,
  cardAbilitySummary,
  catalogSummary,
  codexEntries,
  defaultMetaProfile,
  discardEndlessCards,
  discardNumberCards,
  endlessHandPreviewSummary,
  handPreviewSummary,
  isCampaignStageUnlocked,
  newCampaignRun,
  newEndlessRun,
  playEndlessCardToPile,
  playCardToPile,
  priorityEndlessPileTargetForCard,
  priorityPileTargetForCard,
  purchaseMetaUpgrade,
  purchaseRunShop,
  recordCampaignResult,
  recordEndlessResult,
  rewardEffectSummary,
  runShopOptions,
  storeOptions,
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
  createPerformanceMonitor,
  installPerformanceTools,
} from "./performance.js";

const app = document.querySelector("#app");
const perfMonitor = createPerformanceMonitor("Stacks (스택스) Simple");
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
  hoveredHandIndex: null,
  discardMode: false,
  discardSelection: new Set(),
  menuOpen: false,
  menuTab: "stages",
  toast: null,
  motion: null,
  drag: null,
  suppressNextClick: false,
  hoverPreviewTimer: null,
  handHoverLockUntil: 0,
  handHoverUnlockTimer: null,
};

const audio = {
  context: null,
};

ui.state = loadRun() ?? newCampaignRun(ui.profile, ui.profile.numberCampaign.lastSelectedStage);
if (!ui.state) ui.state = newCampaignRun(defaultMetaProfile(), 1);

function performanceDetail() {
  return {
    phase: ui.state?.phase ?? "unknown",
    handCount: ui.state?.hand?.length ?? 0,
    menuOpen: ui.menuOpen,
    menuTab: ui.menuTab,
    motion: ui.motion?.type ?? null,
  };
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

function requestedViewMode() {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") ?? params.get("layout") ?? params.get("device") ?? "").toLowerCase();
  return ["mobile", "desktop"].includes(view) ? view : "auto";
}

function clampSelectedHand() {
  if (!ui.state.hand.length) {
    ui.selectedHandIndex = null;
    ui.hoveredHandIndex = null;
    return;
  }
  if (ui.selectedHandIndex && !ui.state.hand[ui.selectedHandIndex - 1]) ui.selectedHandIndex = null;
  if (ui.hoveredHandIndex && !ui.state.hand[ui.hoveredHandIndex - 1]) ui.hoveredHandIndex = null;
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
  clearHoverPreview();
  if (ui.handHoverUnlockTimer) window.clearTimeout(ui.handHoverUnlockTimer);
  const delay = Math.max(0, ui.handHoverLockUntil - Date.now() + 20);
  ui.handHoverUnlockTimer = window.setTimeout(() => {
    ui.handHoverUnlockTimer = null;
    render();
  }, delay);
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
  const gainValue = opts.gain ?? 0.016;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "triangle";
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
      playMidiTone(ctx, 76, { duration: 0.045, gain: 0.011 });
    } else if (name === "hover") {
      playMidiTone(ctx, 72, { duration: 0.035, gain: 0.0065 });
      playMidiTone(ctx, 79, { delay: 0.028, duration: 0.045, gain: 0.0055 });
    } else if (name === "reject") {
      playMidiTone(ctx, 47, { duration: 0.09, gain: 0.017, type: "sawtooth" });
      playMidiTone(ctx, 42, { delay: 0.055, duration: 0.11, gain: 0.013, type: "sawtooth" });
    } else if (name === "deal") {
      const count = Math.max(1, Math.min(5, Math.floor(Number(detail.count) || 1)));
      const notes = [57, 60, 64, 67, 72];
      notes.slice(0, count).forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.045, duration: 0.055, gain: 0.009, type: "square" });
      });
    } else if (name === "reward") {
      [72, 76, 79, 84].forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.055, duration: 0.12, gain: 0.013 });
      });
    } else if (name === "place") {
      if (detail.preview?.breaksCombo) {
        playMidiTone(ctx, 55, { duration: 0.065, gain: 0.014 });
        playMidiTone(ctx, 50, { delay: 0.06, duration: 0.09, gain: 0.012 });
        return;
      }
      const notes = detail.preview?.glow === "gold" ? [72, 79, 84] : detail.preview?.glow === "yellow" ? [67, 72, 76] : [60, 67, 72];
      notes.forEach((note, i) => {
        playMidiTone(ctx, note, { delay: i * 0.045, duration: 0.09, gain: 0.012 });
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

function clearHoverPreview() {
  if (ui.hoverPreviewTimer) {
    window.clearTimeout(ui.hoverPreviewTimer);
    ui.hoverPreviewTimer = null;
  }
  ui.hoveredHandIndex = null;
}

function showToast(message) {
  const id = Date.now();
  ui.toast = { message, id };
  render();
  window.setTimeout(() => {
    if (ui.toast?.id === id) {
      ui.toast = null;
      render();
    }
  }, 1600);
}

function persist() {
  if (!ui.settings.autosave) return;
  perfMonitor.measure("persist", () => {
    saveProfile(ui.profile);
    saveRun(ui.state);
    saveSettings(ui.settings);
  }, performanceDetail());
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
    ui.state.message = result.improved ? `새 최고 점수 ${result.score}점` : `최종 점수 ${result.score}점`;
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

function isEndlessRun(state = ui.state) {
  return state?.mode === "endless";
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

function rejectUnplayableHand(handIndex) {
  ui.selectedHandIndex = null;
  clearHoverPreview();
  ui.discardSelection.clear();
  queueMotion({ type: "reject", handIndex }, 360);
  playSfx("reject");
  showToast("놓을 수 있는 정원 더미가 없습니다.");
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
  clearHoverPreview();
  ui.discardMode = false;
  ui.discardSelection.clear();
  ui.menuOpen = false;
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
  clearHoverPreview();
  ui.discardMode = false;
  ui.discardSelection.clear();
  ui.menuOpen = false;
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

function selectedTarget() {
  const handIndex = ui.state.phase === "play" && !ui.discardMode && ui.hoveredHandIndex
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

function visiblePileCardsForRender(pile, pileNumber) {
  const motion = ui.motion;
  if (motion?.type !== "landing" || motion.settled || motion.pileIndex !== pileNumber || !motion.card?.id) return pile.cards;
  return pile.cards.filter((card) => card.id !== motion.card.id);
}

function pilePreviewGlows(preview) {
  return ui.state.phase === "play" && ["gold", "yellow", "open"].includes(preview?.glow);
}

function endlessPreviewLabel(preview) {
  if (!preview) return "";
  if (preview.playable) return preview.primaryLabel;
  if (preview.reason === "height_locked") return "높이 제한";
  if (preview.reason === "pile_full") return "가득 참";
  return "배치 불가";
}

function pilePreviewContent(preview) {
  if (!preview) return "";
  if (isEndlessRun()) {
    return `<span>${escapeHtml(endlessPreviewLabel(preview))}</span><span>${preview.harvestReady ? "수확" : `${preview.cardsToHarvest}장`}</span>`;
  }
  return `<span>${escapeHtml(preview.primaryLabel)}</span><span>x${preview.nextMultiplier}</span>`;
}

function pilePreviewMarkup(preview) {
  const content = pilePreviewContent(preview);
  return `<div class="pile-preview" ${content ? "" : "hidden"}>${content}</div>`;
}

function cardArt(card, className = "") {
  const alt = card ? `${card.cardName} ${card.digit}` : "카드";
  const src = cardImagePath(card?.imageId ?? "card_locked_unknown");
  return `<img class="${className}" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
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

function cardAbilityMarkup(card) {
  const ability = cardAbilitySummary(card);
  return `<span class="card-ability"><strong>${escapeHtml(ability.label)}</strong><small>${escapeHtml(ability.description)}</small></span>`;
}

function cardFace(card, artClass, opts = {}) {
  return `
    <span class="card-add">${cardAddMarkup(card)}</span>
    <span class="card-kind">${escapeHtml(card.categoryLabel)}</span>
    ${cardArt(card, artClass)}
    ${opts.showAbility ? cardAbilityMarkup(card) : ""}
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

function renderStatus() {
  if (isEndlessRun()) {
    const best = Math.max(ui.profile.numberEndless?.bestScore ?? 0, ui.state.bestScore ?? 0, ui.state.score ?? 0);
    const progress = Math.min(100, Math.round(((ui.state.score ?? 0) / Math.max(1, best)) * 100));
    return `
      <header class="simple-status">
        <div class="title-lockup">
          <span>무한 정원</span>
          <strong>Stacks (스택스)</strong>
        </div>
        <div class="status-meter" aria-label="점수 ${ui.state.score}">
          <div><span>점수</span><b>${ui.state.score}</b></div>
          <div class="meter-track"><i style="width:${progress}%"></i></div>
        </div>
        <div class="status-pills" aria-label="런 상태">
          <span>최고 ${best}</span>
          <span>교체 ${ui.state.discardsRemaining}</span>
          <span>수확 ${ui.state.harvestCount ?? 0}</span>
          <span>퇴비 ${ui.state.compostPile?.length ?? 0}</span>
        </div>
        <button class="menu-trigger" type="button" data-action="open-deck" aria-label="덱 보기">덱</button>
        <button class="menu-trigger" type="button" data-action="open-menu" aria-label="메뉴 열기">메뉴</button>
      </header>
    `;
  }
  const stage = stageByIndex(ui.state.stageIndex ?? 1);
  const land = LANDS[ui.state.activeLand] ?? LANDS.meadow;
  const progress = pct(ui.state.reputation, ui.state.targetReputation);
  return `
    <header class="simple-status">
      <div class="title-lockup">
        <span>${escapeHtml(stage.name)}</span>
        <strong>Stacks (스택스)</strong>
      </div>
      <div class="status-meter" aria-label="평판 ${ui.state.reputation}/${ui.state.targetReputation}">
        <div><span>평판</span><b>${ui.state.reputation}/${ui.state.targetReputation}</b></div>
        <div class="meter-track"><i style="width:${progress}%"></i></div>
      </div>
      <div class="status-pills" aria-label="런 상태">
        <span>${escapeHtml(land.label)}</span>
        <span>놓기 ${ui.state.playsRemaining}</span>
        <span>교체 ${ui.state.discardsRemaining}</span>
        <span>씨앗 ${ui.profile.numberMoney}</span>
      </div>
      <button class="menu-trigger" type="button" data-action="open-menu" aria-label="메뉴 열기">메뉴</button>
    </header>
  `;
}

function renderPiles() {
  const { previews } = selectedTarget();
  const previewByPile = new Map(previews.map((preview) => [preview.pileIndex, preview]));
  return `
    <section class="pile-grid" aria-label="4정원 더미">
      ${ui.state.piles.map((pile, index) => {
        const pileNumber = index + 1;
        const preview = previewByPile.get(pileNumber);
        const landing = ui.motion?.type === "landing" && ui.motion.settled && ui.motion.pileIndex === pileNumber;
        const harvested = landing && ui.motion?.harvested;
        const showScore = landing && (!isEndlessRun() || (ui.motion?.points ?? 0) > 0);
          const stack = visiblePileCardsForRender(pile, pileNumber).slice(-4);
          const match = pilePreviewGlows(preview);
          return `
            <button class="pile-card ${match ? "is-match" : ""} ${preview?.breaksCombo ? "is-break" : ""} ${landing ? "is-landing" : ""} ${harvested ? "is-landing-harvest" : ""}" type="button" data-action="play-pile" data-pile-index="${pileNumber}" aria-label="정원 ${pileNumber}" ${ui.state.phase !== "play" ? "disabled" : ""}>
              <div class="mini-stack" aria-hidden="true">
              ${stack.length
                ? stack.map((card, cardIndex) => {
                  const fanX = Math.round((cardIndex - (stack.length - 1) / 2) * 25);
                  const fanRot = (cardIndex - (stack.length - 1) / 2) * 3.5;
                  return `
                  <span class="mini-card" style="--fan-x:${fanX}px; --fan-rot:${fanRot}deg; --color:${colorCss(card.color)}">
                    <span class="card-add">${cardAddMarkup(card)}</span>
                    ${cardArt(card, "mini-art")}
                    <span class="card-multiply">${cardMultiplyMarkup(card)}</span>
                  </span>
                `;
                }).join("")
                  : `<span class="empty-slot"></span>`}
              </div>
              ${pilePreviewMarkup(preview)}
              ${harvested ? `<span class="harvest-ring" aria-hidden="true"></span>
                <span class="harvest-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>` : ""}
              ${showScore ? `<span class="score-pop ${harvested ? "is-harvest" : ""}">
              ${harvested ? `<span>수확</span><strong>+${ui.motion.points ?? 0}</strong><em>${escapeHtml(ui.motion.formula ?? "")}</em>` : `+${ui.motion.points ?? 0}`}
            </span>` : ""}
          </button>
        `;
      }).join("")}
    </section>
  `;
}

function renderHand() {
  const handMotion = ui.motion?.type === "landing" ? ui.motion : null;
  const handFlowReady = handMotion?.settled === true;
  const playedHandIndex = handMotion?.playedHandIndex ?? 0;
  return `
    <section class="hand-panel" aria-label="손패">
      <div class="hand-head">
        <div>
          <span>손패</span>
          <strong>${ui.state.message ? escapeHtml(ui.state.message) : "카드를 놓아 흐름을 만드세요"}</strong>
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
          return `
            <button class="hand-card ${selected ? "is-selected" : ""} ${hovered ? "is-hovered" : ""} ${discardSelected ? "is-discard-selected" : ""} ${preShift ? "is-hand-pre-shift" : ""} ${preRefill ? "is-hand-pre-refill" : ""} ${activeShift ? "is-hand-shifting" : ""} ${activeRefill ? "is-hand-refill" : ""} ${dealt ? "is-dealt" : ""} ${rejected ? "is-rejected" : ""}" type="button" data-action="select-card" data-hand-index="${handIndex}" aria-label="${card.digit} ${escapeHtml(card.cardName)} ${escapeHtml(card.categoryLabel)}" style="--color:${colorCss(card.color)}; --deal-index:${Math.max(0, dealtIndex)}; --deal-delay:${dealDelay}ms; --deal-x:${dealX}px; --deal-rotate:${dealRotate}deg; --hand-shift-delay:${shiftDelay}ms; --hand-shift-duration:${HAND_SHIFT_MS}ms; --hand-refill-delay:${HAND_REFILL_DELAY_MS}ms; --hand-refill-duration:${HAND_REFILL_MS}ms" ${ui.state.phase !== "play" ? "disabled" : ""}>
              ${cardFace(card, "card-art", { showAbility: isEndlessRun() })}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderResultPanel() {
  if (!["won", "game_over"].includes(ui.state.phase)) return "";
  if (isEndlessRun()) {
    return `
      <section class="result-sheet is-loss">
        <div>
          <span>${ui.state.resultImproved ? "새 기록" : "기록 종료"}</span>
          <strong>${escapeHtml(ui.state.failureReason ?? "더 이상 놓을 수 없습니다.")}</strong>
        </div>
        <b>${ui.state.score}점</b>
        <button class="primary-button" type="button" data-action="restart-run">다시</button>
      </section>
    `;
  }
  const cleared = ui.state.phase === "won";
  return `
    <section class="result-sheet ${cleared ? "is-win" : "is-loss"}">
      <div>
        <span>${cleared ? "클리어" : "재도전"}</span>
        <strong>${cleared ? "정원길을 열었습니다." : escapeHtml(ui.state.failureReason ?? "목표 평판 미달")}</strong>
      </div>
      <b>+${ui.state.resultPayout ?? 0} 씨앗</b>
      ${cleared && (ui.state.stageIndex ?? 1) < CAMPAIGN_STAGES.length ? `<button class="primary-button" type="button" data-action="next-stage">다음</button>` : ""}
      <button class="plain-button" type="button" data-action="restart-run">다시</button>
    </section>
  `;
}

function renderRewardSheet() {
  if (ui.state.phase !== "reward" || rewardPresentationBlocked()) return "";
  return `
    <section class="sheet-backdrop" aria-label="보상">
      <div class="bottom-sheet">
        <div class="sheet-title">
          <span>${ui.state.rewardReason === "firstFiveCombo" ? "새 발견" : "스테이지 보상"}</span>
          <strong>하나를 고르세요</strong>
        </div>
        <div class="reward-row">
          ${ui.state.rewardOptions.map((reward, index) => {
            const text = rewardChoiceText(reward);
            return `
              <button class="reward-card" type="button" data-action="choose-reward" data-reward-index="${index + 1}">
                ${rewardArt(reward, "reward-art")}
                <span>${escapeHtml(text.name)}</span>
                <b>${escapeHtml(text.line)}</b>
                <small>${escapeHtml(text.detail)}</small>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderMenu() {
  if (!ui.menuOpen) return "";
  const summary = currentHandSummary();
  return `
    <section class="menu-backdrop">
      <div class="menu-panel">
        <div class="menu-head">
          <strong>메뉴</strong>
          <button class="icon-button" type="button" data-action="close-menu" aria-label="닫기">X</button>
        </div>
        <div class="menu-quick-actions">
          <button class="primary-button" type="button" data-action="auto-play" ${ui.state.phase !== "play" || !summary.bestIndex ? "disabled" : ""}>추천</button>
          <button class="plain-button" type="button" data-action="swap-hand" ${ui.state.phase !== "play" || ui.state.discardsRemaining <= 0 ? "disabled" : ""}>교체 5</button>
          <button class="plain-button" type="button" data-action="new-run">새 런</button>
          <button class="plain-button" type="button" data-action="new-endless">무한</button>
        </div>
        <div class="menu-tabs">
          ${["stages", "deck", "store", "codex", "settings"].map((tab) => `
            <button class="${ui.menuTab === tab ? "is-active" : ""}" type="button" data-action="set-menu-tab" data-tab="${tab}">${tabLabel(tab)}</button>
          `).join("")}
        </div>
        ${renderMenuContent()}
      </div>
    </section>
  `;
}

function tabLabel(tab) {
  return { stages: "스테이지", deck: "덱", store: "상점", codex: "도감", settings: "설정" }[tab] ?? tab;
}

function renderMenuContent() {
  if (ui.menuTab === "deck") return renderDeck();
  if (ui.menuTab === "store") return renderStore();
  if (ui.menuTab === "codex") return renderCodex();
  if (ui.menuTab === "settings") return renderSettings();
  return renderStages();
}

function renderDeck() {
  const deck = ui.state.deck ?? [];
  const compost = ui.state.compostPile ?? [];
  return `
    <div class="deck-stack">
      <div class="deck-counts">
        <span>남은 덱 ${deck.length}</span>
        <span>퇴비 ${compost.length}</span>
      </div>
      <div class="deck-list" role="list">
        ${deck.length ? deck.map((card, index) => {
          const ability = cardAbilitySummary(card);
          return `
            <div class="deck-row" role="listitem">
              <b>${index + 1}</b>
              <i>${card.digit}</i>
              <span><strong>${escapeHtml(card.cardName)}</strong><small>${escapeHtml(card.categoryLabel)} · ${escapeHtml(card.colorLabel)}</small></span>
              <span><strong>${escapeHtml(ability.label)}</strong><small>${escapeHtml(ability.description)}</small></span>
            </div>
          `;
        }).join("") : `<p class="empty-note">덱이 비어 있습니다. 다음 뽑기 전에 퇴비가 섞입니다.</p>`}
      </div>
    </div>
  `;
}

function renderStages() {
  return `
    <div class="stage-list">
      <button class="menu-row stage-row ${isEndlessRun() ? "cleared" : "unlocked"}" type="button" data-action="new-endless">
        <b>E</b>
        <span><strong>무한 정원</strong><small>수확 점수 · 최고 ${ui.profile.numberEndless?.bestScore ?? 0}</small></span>
      </button>
      ${CAMPAIGN_STAGES.map((stage) => {
        const status = campaignStageStatus(ui.profile.numberCampaign, stage.index);
        const locked = status === "locked";
        return `
          <button class="menu-row stage-row ${status}" type="button" data-action="select-stage" data-stage-index="${stage.index}" ${locked ? "disabled" : ""}>
            <b>${stage.index}</b>
            <span><strong>${escapeHtml(stage.name)}</strong><small>${landLabel(stage.activeLand)} · 목표 ${stage.targetReputation}</small></span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderStore() {
  const runOptions = ui.state.phase === "play" && !isEndlessRun() ? runShopOptions(ui.state) : [];
  const metaOptions = storeOptions(ui.profile);
  return `
    <div class="store-stack">
      <section>
        <h3>이번 런 · 코인 ${ui.state.shopCoins ?? 0}</h3>
        ${runOptions.length ? runOptions.map((option, index) => `
          <button class="menu-row store-row" type="button" data-action="buy-run-shop" data-shop-index="${index + 1}" ${ui.state.shopCoins < option.cost ? "disabled" : ""}>
            ${cardArt({ imageId: option.imageId, cardName: option.name, digit: option.digit ?? "" }, "row-art")}
            <span><strong>${escapeHtml(option.name)}</strong><small>${escapeHtml(option.previewLine)}</small></span>
            <b>${option.cost}</b>
          </button>
        `).join("") : `<p class="empty-note">${isEndlessRun() ? "무한 정원은 현재 런 보급 없이 진행됩니다." : "완료된 런에서는 보급을 쓸 수 없습니다."}</p>`}
      </section>
      <section>
        <h3>메타 성장 · 씨앗 ${ui.profile.numberMoney}</h3>
        ${metaOptions.map((option) => `
          <button class="menu-row store-row" type="button" data-action="buy-meta" data-upgrade-id="${option.id}" ${option.maxed || !option.affordable ? "disabled" : ""}>
            <b>${option.level}/${option.max}</b>
            <span><strong>${escapeHtml(option.name)}</strong><small>${escapeHtml(option.description)}</small></span>
            <b>${option.maxed ? "MAX" : option.nextCost}</b>
          </button>
        `).join("")}
      </section>
    </div>
  `;
}

function renderCodex() {
  const summary = catalogSummary(ui.state);
  const entries = codexEntries(ui.state);
  const nextGoal = entries.discoveries.find((item) => item.status !== "discovered") ?? entries.discoveries[0];
  return `
    <div class="codex-stack">
      <section class="codex-next">
        ${rewardArt(nextGoal, "codex-next-art")}
        <span><small>다음 발견</small><strong>${escapeHtml(nextGoal?.name ?? "정원 기록")}</strong></span>
      </section>
      <div class="codex-counts">
        <span>숫자 ${summary.digits.known}/${summary.digits.total}</span>
        <span>족보 ${summary.combos.known}/${summary.combos.total}</span>
        <span>땅 ${summary.lands.known}/${summary.lands.total}</span>
        <span>발견 ${summary.discoveries.discovered}/${summary.discoveries.total}</span>
      </div>
      <div class="codex-grid">
        ${entries.discoveries.map((item) => `
          <div class="codex-cell ${item.status}">
            ${rewardArt(item, "codex-art")}
            <span>${item.status === "hidden" ? "???" : escapeHtml(item.name)}</span>
          </div>
        `).join("")}
      </div>
      <div class="digit-strip">
        ${DIGITS.map((item) => `<span style="--color:${colorCss(item.color)}">${item.digit} ${escapeHtml(item.cardName)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="settings-stack">
      <label><input type="checkbox" data-action="toggle-setting" data-setting="animations" ${ui.settings.animations ? "checked" : ""} /> 애니메이션</label>
      <label><input type="checkbox" data-action="toggle-setting" data-setting="cardGlow" ${ui.settings.cardGlow ? "checked" : ""} /> 카드 강조</label>
      <label><input type="checkbox" data-action="toggle-setting" data-setting="sfx" ${ui.settings.sfx !== false ? "checked" : ""} /> 효과음</label>
      <label><input type="checkbox" data-action="toggle-setting" data-setting="autosave" ${ui.settings.autosave ? "checked" : ""} /> 자동 저장</label>
      <div class="danger-row">
        <button class="plain-button" type="button" data-action="new-run">새 런</button>
        <button class="plain-button" type="button" data-action="new-endless">새 무한</button>
        <button class="danger-button" type="button" data-action="reset-storage">저장 초기화</button>
      </div>
    </div>
  `;
}

function renderToast() {
  return ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast.message)}</div>` : "";
}

function renderMotionLayer() {
  const motion = ui.motion;
  if (motion?.type !== "landing" || motion.settled || !motion.source || !motion.target || !motion.card) return "";
  const { source, target, card } = motion;
  const tx = target.left + target.width * 0.5 - (source.left + source.width * 0.5);
  const ty = target.top + target.height * 0.5 - (source.top + source.height * 0.5);
  return `
    <div class="motion-layer" aria-hidden="true">
      <div class="flight-card" style="--x:${source.left}px; --y:${source.top}px; --w:${source.width}px; --h:${source.height}px; --tx:${tx}px; --ty:${ty}px; --color:${colorCss(card.color)}">
        ${cardFace(card, "card-art", { showAbility: isEndlessRun() })}
      </div>
    </div>
  `;
}

function render() {
  const stopRender = perfMonitor.start("render", performanceDetail());
  clampSelectedHand();
  maybeFinalizeRun();
  const viewMode = requestedViewMode();
  try {
    app.innerHTML = `
      <main class="simple-shell is-view-${viewMode} ${ui.settings.animations ? "" : "no-motion"} ${ui.settings.cardGlow ? "" : "no-glow"}">
        ${renderStatus()}
        ${renderResultPanel()}
        ${renderPiles()}
        ${renderHand()}
        ${renderRewardSheet()}
        ${renderMenu()}
        ${renderToast()}
        ${renderMotionLayer()}
      </main>
    `;
    document.body.dataset.phase = ui.state.phase;
    document.body.dataset.mode = ui.state.mode ?? "number";
    document.body.classList.toggle("no-motion-body", !motionAllowed());
    document.body.classList.toggle("is-hand-hover-locked", handHoverLocked());
  } finally {
    stopRender({
      ...performanceDetail(),
      viewMode,
      nodeCount: app.getElementsByTagName("*").length,
    });
  }
}

function actionButton(target) {
  return target.closest("[data-action]");
}

function setHoveredHandIndex(handIndex) {
  const next = handIndex && !handHoverLocked() && ui.state.phase === "play" && !ui.discardMode ? handIndex : null;
  if (ui.hoveredHandIndex === next) return;
  if (ui.hoverPreviewTimer) {
    window.clearTimeout(ui.hoverPreviewTimer);
    ui.hoverPreviewTimer = null;
  }
  if (!next) {
    ui.hoveredHandIndex = null;
    applyHandHoverPreview();
    return;
  }
  ui.hoverPreviewTimer = window.setTimeout(() => {
    ui.hoverPreviewTimer = null;
    ui.hoveredHandIndex = next;
    applyHandHoverPreview();
    playSfx("hover");
  }, 90);
}

function applyHandHoverPreview() {
  const { previews } = selectedTarget();
  const previewByPile = new Map(previews.map((preview) => [preview.pileIndex, preview]));
  app.querySelectorAll(".hand-card[data-hand-index]").forEach((card) => {
    const handIndex = Number(card.dataset.handIndex);
    card.classList.toggle("is-hovered", ui.hoveredHandIndex === handIndex);
    card.classList.toggle("is-selected", ui.selectedHandIndex === handIndex);
  });
  app.querySelectorAll(".pile-card[data-pile-index]").forEach((pile) => {
    const pileIndex = Number(pile.dataset.pileIndex);
    const preview = previewByPile.get(pileIndex);
    pile.classList.toggle("is-match", pilePreviewGlows(preview));
    pile.classList.toggle("is-break", preview?.breaksCombo === true);
    const previewSlot = pile.querySelector(".pile-preview");
    if (previewSlot) {
      const content = pilePreviewContent(preview);
      previewSlot.innerHTML = content;
      previewSlot.hidden = !content;
    }
  });
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

function pileLandingRect(pileIndex) {
  return rectSnapshot(app.querySelector(`.pile-card[data-pile-index="${pileIndex}"] .mini-stack`)?.getBoundingClientRect());
}

function pileCellRect(pileIndex) {
  return rectSnapshot(app.querySelector(`.pile-card[data-pile-index="${pileIndex}"]`)?.getBoundingClientRect());
}

function playFromHandToPile(handIndex, pileIndex, opts = {}) {
  if (ui.state.phase !== "play") return { ok: false, reason: "not_playing" };
  const playedCard = ui.state.hand[handIndex - 1] ? { ...ui.state.hand[handIndex - 1] } : null;
  const sourceRect = rectSnapshot(opts.sourceRect) ?? handCardRect(handIndex);
  const targetRect = rectSnapshot(opts.targetRect) ?? pileLandingRect(pileIndex) ?? pileCellRect(pileIndex);
  const beforeHand = ui.state.hand.map((card) => card.id);
  const result = perfMonitor.measure("game.playCard", () => playCurrentCard(handIndex, pileIndex), {
    ...performanceDetail(),
    handIndex,
    pileIndex,
  });
  if (!result.ok) {
    queueMotion({ type: "reject", handIndex }, 360);
    playSfx("reject");
    showToast(result.reason);
    return result;
  }
  const beforeIds = new Set(beforeHand);
  const dealtIds = ui.state.hand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
  ui.selectedHandIndex = null;
  clearHoverPreview();
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
  if (ui.state.phase !== "play" || ui.discardMode) return false;
  const target = currentPriorityTarget(handIndex);
  if (!target.bestIndex) return false;
  const result = playFromHandToPile(handIndex, target.bestIndex, {
    sourceRect: sourceRect ?? handCardRect(handIndex),
    targetRect: pileLandingRect(target.bestIndex) ?? pileCellRect(target.bestIndex),
  });
  return result.ok === true;
}

function swapWholeHand() {
  const beforeIds = new Set(ui.state.hand.map((card) => card.id));
  const indices = ui.state.hand.map((_, index) => index + 1);
  const result = perfMonitor.measure("game.discard", () => discardCurrentCards(indices), performanceDetail());
  if (!result.ok) {
    playSfx("reject");
    showToast(result.reason);
    return result;
  }
  const dealtIds = ui.state.hand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
  ui.selectedHandIndex = null;
  clearHoverPreview();
  ui.menuOpen = false;
  ui.discardMode = false;
  ui.discardSelection.clear();
  queueMotion({ type: "deal", dealtIds }, dealMotionDuration(dealtIds.length));
  playSfx("deal", { count: dealtIds.length });
  persist();
  return result;
}

function handleAction(action, button) {
  if (action === "select-card") {
    const index = Number(button.dataset.handIndex);
    if (quickPlayPriorityTarget(index, rectSnapshot(button.getBoundingClientRect()))) return;
    if (!hasPlayableTarget(index)) {
      rejectUnplayableHand(index);
      return;
    }
    ui.selectedHandIndex = index;
    playSfx("select");
  } else if (action === "play-pile") {
    if (ui.state.phase === "play" && ui.selectedHandIndex) {
      playFromHandToPile(ui.selectedHandIndex, Number(button.dataset.pileIndex));
    }
    return;
  } else if (action === "auto-play") {
    ui.menuOpen = false;
    playBestCard(ui.selectedHandIndex);
    return;
  } else if (action === "swap-hand" || action === "toggle-discard" || action === "apply-discard") {
    swapWholeHand();
  } else if (action === "choose-reward") {
    const result = perfMonitor.measure("game.reward", () => applyReward(ui.state, Number(button.dataset.rewardIndex)), performanceDetail());
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else {
      playSfx("reward");
    }
    persist();
  } else if (action === "open-menu") {
    ui.menuOpen = true;
  } else if (action === "open-deck") {
    ui.menuOpen = true;
    ui.menuTab = "deck";
  } else if (action === "close-menu") {
    ui.menuOpen = false;
  } else if (action === "set-menu-tab") {
    ui.menuTab = button.dataset.tab || "stages";
  } else if (action === "select-stage") {
    startStage(Number(button.dataset.stageIndex));
    return;
  } else if (action === "new-endless") {
    startEndlessMode();
    return;
  } else if (action === "buy-run-shop") {
    const result = purchaseRunShop(ui.state, Number(button.dataset.shopIndex));
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    }
    persist();
  } else if (action === "buy-meta") {
    const result = purchaseMetaUpgrade(ui.profile, button.dataset.upgradeId);
    if (result.ok) ui.profile = result.profile;
    else {
      playSfx("reject");
      showToast(result.reason);
    }
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
    clearRun();
    ui.profile = defaultMetaProfile();
    ui.state = newCampaignRun(ui.profile, 1);
    ui.settings = loadSettings();
    ui.menuOpen = false;
    clearMotion();
  }
  render();
}

function clearDropTargets() {
  document.querySelectorAll(".pile-card.is-drop-target, .pile-card.is-drop-valid, .pile-card.is-drop-danger").forEach((node) => {
    node.classList.remove("is-drop-target", "is-drop-valid", "is-drop-danger");
  });
}

function pileFromPoint(x, y) {
  const target = document.elementFromPoint(x, y)?.closest(".pile-card[data-pile-index]");
  if (!target || target.disabled) return null;
  return Number(target.dataset.pileIndex) || null;
}

function updateDragGhost() {
  const drag = ui.drag;
  if (!drag?.ghost) return;
  drag.ghost.style.setProperty("--drag-x", `${Math.round(drag.x - drag.offsetX)}px`);
  drag.ghost.style.setProperty("--drag-y", `${Math.round(drag.y - drag.offsetY - 3)}px`);
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
  const target = document.querySelector(`.pile-card[data-pile-index="${pileIndex}"]`);
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
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || handHoverLocked()) return;
  setHoveredHandIndex(Number(card.dataset.handIndex));
});

app.addEventListener("pointerout", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || (event.relatedTarget && card.contains(event.relatedTarget))) return;
  if (ui.hoveredHandIndex === Number(card.dataset.handIndex)) setHoveredHandIndex(null);
});

app.addEventListener("focusin", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card) return;
  setHoveredHandIndex(Number(card.dataset.handIndex));
});

app.addEventListener("focusout", (event) => {
  const card = event.target.closest(".hand-card[data-action='select-card']");
  if (!card || card.contains(event.relatedTarget)) return;
  if (ui.hoveredHandIndex === Number(card.dataset.handIndex)) setHoveredHandIndex(null);
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
    if (key >= "1" && key <= "5") {
      const index = Number(key);
      if (ui.state.hand[index - 1]) ui.selectedHandIndex = index;
      render();
    } else if (["q", "w", "e", "r"].includes(key)) {
      const pile = { q: 1, w: 2, e: 3, r: 4 }[key];
      if (ui.state.phase === "play" && ui.selectedHandIndex) {
        if (isEndlessRun()) playBestCard(ui.selectedHandIndex);
        else playFromHandToPile(ui.selectedHandIndex, pile);
      }
    } else if (key === "enter" || key === " ") {
      if (ui.state.phase === "play") playBestCard(ui.selectedHandIndex ?? currentHandSummary().bestIndex);
    } else if (key === "m") {
      ui.menuOpen = true;
      render();
    } else if (key === "escape") {
      ui.menuOpen = false;
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
