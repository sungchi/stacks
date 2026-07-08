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
  bestPileTargetForCard,
  campaignStageStatus,
  catalogSummary,
  codexEntries,
  defaultMetaProfile,
  discardNumberCards,
  handPreviewSummary,
  isCampaignStageUnlocked,
  newCampaignRun,
  playCardToPile,
  purchaseMetaUpgrade,
  purchaseRunShop,
  priorityPileTargetForCard,
  recordCampaignResult,
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
const perfMonitor = createPerformanceMonitor("Stacks (스택스)");
const CARD_FLIGHT_MS = 420;
const LANDING_MOTION_MS = 620;

const ui = {
  profile: loadProfile(),
  state: null,
  settings: loadSettings(),
  selectedHandIndex: 1,
  discardMode: false,
  discardSelection: new Set(),
  modal: null,
  toast: null,
  motion: null,
  drag: null,
  suppressNextClick: false,
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
    modal: ui.modal ?? null,
    motion: ui.motion?.type ?? null,
  };
}

function clampSelectedHand() {
  if (!ui.state.hand.length) {
    ui.selectedHandIndex = null;
    return;
  }
  if (!ui.selectedHandIndex || ui.selectedHandIndex > ui.state.hand.length) ui.selectedHandIndex = 1;
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
    } else if (name === "reject") {
      playMidiTone(ctx, 47, { duration: 0.09, gain: 0.018, type: "sawtooth" });
      playMidiTone(ctx, 42, { delay: 0.055, duration: 0.11, gain: 0.014, type: "sawtooth" });
    } else if (name === "deal") {
      playMidiTone(ctx, 60, { duration: 0.045, gain: 0.012, type: "square" });
      playMidiTone(ctx, 67, { delay: 0.04, duration: 0.045, gain: 0.01, type: "square" });
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

function selectedTarget() {
  if (!ui.selectedHandIndex) return { bestIndex: null, bestPreview: null, previews: [] };
  return bestPileTargetForCard(ui.state, ui.selectedHandIndex);
}

function rewardPresentationBlocked() {
  return ui.motion?.type === "landing";
}

function visiblePileCardsForRender(pile, pileNumber) {
  const motion = ui.motion;
  if (motion?.type !== "landing" || motion.settled || motion.pileIndex !== pileNumber || !motion.card?.id) return pile.cards;
  return pile.cards.filter((card) => card.id !== motion.card.id);
}

function maybeFinalizeRun() {
  if (!["won", "game_over"].includes(ui.state.phase) || ui.state.resultRecorded) return;
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

function startStage(stageIndex) {
  if (!isCampaignStageUnlocked(ui.profile.numberCampaign, stageIndex)) {
    showToast("아직 잠긴 스테이지입니다.");
    return;
  }
  ui.profile.numberCampaign.lastSelectedStage = stageIndex;
  ui.state = newCampaignRun(ui.profile, stageIndex);
  ui.selectedHandIndex = 1;
  ui.discardMode = false;
  ui.discardSelection.clear();
  ui.modal = null;
  queueMotion({ type: "deal", dealtIds: ui.state.hand.map((card) => card.id) }, 520);
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

function cardFace(card, artClass) {
  return `
    <span class="card-add">${cardAddMarkup(card)}</span>
    <span class="card-kind">${escapeHtml(card.categoryLabel)}</span>
    ${cardArt(card, artClass)}
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
        <span class="eyebrow">Stacks (스택스) 4.1</span>
        <h1>Stacks (스택스)</h1>
      </div>
      <nav class="top-actions" aria-label="주요 메뉴">
        <button class="tool-button" type="button" data-action="open-stages">스테이지</button>
        <button class="tool-button" type="button" data-action="open-store">상점</button>
        <button class="tool-button" type="button" data-action="open-codex">도감</button>
        <button class="icon-button" type="button" data-action="open-settings" aria-label="설정">S</button>
      </nav>
    </header>
  `;
}

function renderHud() {
  const state = ui.state;
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
  if (ui.state.phase !== "play") return "";
  const summary = handPreviewSummary(ui.state);
  if (!summary.bestIndex) return "";
  return `
    <section class="recommend-band" aria-label="추천">
      <div>
        <span class="eyebrow">다음 추천</span>
        <strong>${summary.bestCardName} -> ${summary.bestPileLabel}</strong>
      </div>
      <div class="recommend-score">
        <span>${summary.bestLabel}</span>
        <strong>+${summary.bestReputation}</strong>
      </div>
      <button class="tool-button recommend-button" type="button" data-action="auto-play">추천 놓기</button>
    </section>
  `;
}

function renderPiles() {
  const state = ui.state;
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
          const stack = visibleCards.slice(-4);
          return `
            <button class="pile-cell ${isBest ? "is-recommended" : ""} ${preview?.breaksCombo ? "is-break" : ""} ${landing ? "is-landing" : ""} ${landing && ui.motion?.brokeCombo ? "is-landing-break" : ""}" type="button" data-action="play-pile" data-pile-index="${pileNumber}" ${state.phase !== "play" ? "disabled" : ""}>
              <div class="pile-head">
                <span>${escapeHtml(pile.label)}</span>
                <strong>${pile.comboStep || 0}흐름</strong>
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
                <strong>${preview ? `+${preview.expectedReputation}` : pile.baseTotal}</strong>
              </div>
              ${preview ? `<div class="pile-preview"><span>${escapeHtml(preview.primaryLabel)}</span><span>x${preview.nextMultiplier}</span></div>` : ""}
              ${landing ? `<span class="score-pop ${ui.motion?.brokeCombo ? "is-break" : ""}">+${ui.motion.points ?? 0}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderHand() {
  return `
    <section class="hand-area" aria-label="손패">
      <div class="hand-toolbar">
        <div>
          <span class="eyebrow">손패</span>
          <strong>${ui.discardMode ? "갈아엎기 선택" : "카드 선택"}</strong>
        </div>
        <div class="hand-actions">
          <button class="tool-button ${ui.discardMode ? "is-active" : ""}" type="button" data-action="toggle-discard" ${ui.state.phase !== "play" ? "disabled" : ""}>갈아엎기</button>
          ${ui.discardMode ? `<button class="primary-button" type="button" data-action="apply-discard">선택 ${ui.discardSelection.size}</button>` : ""}
        </div>
      </div>
      <div class="hand-row">
        ${ui.state.hand.map((card, index) => {
          const handIndex = index + 1;
          const selected = ui.selectedHandIndex === handIndex;
          const discardSelected = ui.discardSelection.has(handIndex);
          const dealt = ui.motion?.dealtIds?.includes(card.id);
          const rejected = ui.motion?.type === "reject" && ui.motion.handIndex === handIndex;
          const fan = index - (ui.state.hand.length - 1) / 2;
          return `
            <button class="hand-card ${selected ? "is-selected" : ""} ${discardSelected ? "is-discard-selected" : ""} ${dealt ? "is-dealt" : ""} ${rejected ? "is-rejected" : ""}" type="button" data-action="select-card" data-hand-index="${handIndex}" aria-label="${card.digit} ${escapeHtml(card.cardName)} ${escapeHtml(card.categoryLabel)}" style="--color:${colorCss(card.color)}; --fan:${fan}" ${ui.state.phase !== "play" ? "disabled" : ""}>
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

function renderResultPanel() {
  if (!["won", "game_over"].includes(ui.state.phase)) return "";
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
  const runOptions = ui.state.phase === "play" ? runShopOptions(ui.state) : [];
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
          <div class="section-title"><span>런 코인 ${ui.state.shopCoins}</span><strong>이번 런</strong></div>
          <div class="store-list">
            ${runOptions.length ? runOptions.map((option, index) => `
              <button class="store-row" type="button" data-action="buy-run-shop" data-shop-index="${index + 1}" ${ui.state.shopCoins < option.cost ? "disabled" : ""}>
                ${cardArt({ imageId: option.imageId, cardName: option.name, digit: option.digit ?? "" }, "store-art")}
                <span><b>${escapeHtml(option.name)}</b><small>${escapeHtml(option.line)} · ${escapeHtml(option.previewLine)}</small></span>
                <strong>${option.cost}</strong>
              </button>
            `).join("") : `<p class="empty-text">완료된 런에서는 보급을 쓸 수 없습니다.</p>`}
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
        <button class="tool-button danger" type="button" data-action="reset-storage">저장 초기화</button>
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
            ${renderRecommendation()}
          </aside>
          <section class="table-surface" aria-label="게임 보드">
            ${renderResultPanel()}
            ${renderPiles()}
            ${renderHand()}
          </section>
        </div>
        ${renderRewardOverlay()}
        ${renderModal()}
        ${renderToast()}
        ${renderMotionLayer()}
      </main>
    `;
    document.body.dataset.phase = state.phase;
    document.body.classList.toggle("no-motion-body", !motionAllowed());
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

function playFromHandToPile(handIndex, pileIndex, opts = {}) {
  if (ui.state.phase !== "play") return { ok: false, reason: "not_playing" };
  const playedCard = ui.state.hand[handIndex - 1] ? { ...ui.state.hand[handIndex - 1] } : null;
  const sourceRect = rectSnapshot(opts.sourceRect) ?? handCardRect(handIndex);
  const targetRect = rectSnapshot(opts.targetRect) ?? pileCellRect(pileIndex);
  const beforeHand = ui.state.hand.map((card) => card.id);
  const result = perfMonitor.measure("game.playCard", () => playCardToPile(ui.state, handIndex, pileIndex), {
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
  ui.selectedHandIndex = Math.min(handIndex, Math.max(1, ui.state.hand.length));
  ui.discardSelection.clear();
  queueMotion({
    type: "landing",
    pileIndex: result.preview?.pileIndex ?? pileIndex,
    points: result.preview?.expectedReputation ?? 0,
    brokeCombo: result.preview?.breaksCombo === true,
    dealtIds,
    source: sourceRect,
    target: targetRect,
    card: playedCard,
  }, LANDING_MOTION_MS);
  playSfx("place", { preview: result.preview });
  if (ui.state.phase === "reward" || ui.state.phase === "won") {
    window.setTimeout(() => playSfx("reward"), ui.motion?.type === "landing" ? LANDING_MOTION_MS : 150);
  }
  persist();
  render();
  return result;
}

function playBestCard(handIndex) {
  const targetIndex = handIndex ?? handPreviewSummary(ui.state).bestIndex;
  const target = bestPileTargetForCard(ui.state, targetIndex);
  return playFromHandToPile(targetIndex, target.bestIndex ?? 1);
}

function quickPlayPriorityTarget(handIndex, sourceRect = null) {
  if (ui.state.phase !== "play" || ui.discardMode) return false;
  const target = priorityPileTargetForCard(ui.state, handIndex);
  if (!target.bestIndex) return false;
  const result = playFromHandToPile(handIndex, target.bestIndex, {
    sourceRect: sourceRect ?? handCardRect(handIndex),
    targetRect: pileCellRect(target.bestIndex),
  });
  return result.ok === true;
}

function handleAction(action, button) {
  if (action === "select-card") {
    const index = Number(button.dataset.handIndex);
    if (ui.discardMode) {
      if (ui.discardSelection.has(index)) ui.discardSelection.delete(index);
      else ui.discardSelection.add(index);
      playSfx("select");
    } else {
      if (quickPlayPriorityTarget(index, rectSnapshot(button.getBoundingClientRect()))) return;
      ui.selectedHandIndex = index;
      playSfx("select");
    }
  } else if (action === "play-pile") {
    if (ui.state.phase === "play" && ui.selectedHandIndex) {
      playFromHandToPile(ui.selectedHandIndex, Number(button.dataset.pileIndex));
    }
  } else if (action === "auto-play") {
    playBestCard(ui.selectedHandIndex);
  } else if (action === "toggle-discard") {
    ui.discardMode = !ui.discardMode;
    ui.discardSelection.clear();
  } else if (action === "apply-discard") {
    const beforeIds = new Set(ui.state.hand.map((card) => card.id));
    const result = perfMonitor.measure("game.discard", () => discardNumberCards(ui.state, [...ui.discardSelection]), performanceDetail());
    if (!result.ok) {
      playSfx("reject");
      showToast(result.reason);
    } else {
      const dealtIds = ui.state.hand.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
      queueMotion({ type: "deal", dealtIds }, 520);
      playSfx("deal");
    }
    ui.discardMode = false;
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
  } else if (action === "open-stages") {
    ui.modal = "stages";
  } else if (action === "open-store") {
    ui.modal = "store";
  } else if (action === "open-codex") {
    ui.modal = "codex";
  } else if (action === "open-settings") {
    ui.modal = "settings";
  } else if (action === "close-modal") {
    ui.modal = null;
  } else if (action === "select-stage") {
    startStage(Number(button.dataset.stageIndex));
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
    startStage(ui.state.stageIndex ?? ui.profile.numberCampaign.lastSelectedStage);
    return;
  } else if (action === "toggle-setting") {
    const key = button.dataset.setting;
    ui.settings[key] = button.checked;
    saveSettings(ui.settings);
  } else if (action === "reset-storage") {
    resetAllStorage();
    ui.profile = defaultMetaProfile();
    ui.state = newCampaignRun(ui.profile, 1);
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
  target?.classList.add("is-drop-target", preview?.breaksCombo ? "is-drop-danger" : "is-drop-valid");
  drag.ghost?.classList.add(preview?.breaksCombo ? "is-over-break" : "is-over-valid");
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
  const handIndex = Number(sourceEl.dataset.handIndex);
  const card = ui.state.hand[handIndex - 1];
  if (!card) return;
  const stopDragStart = perfMonitor.start("drag.start", performanceDetail());
  const sourceRect = sourceEl.getBoundingClientRect();
  const { previews } = bestPileTargetForCard(ui.state, handIndex);
  const ghost = document.createElement("div");
  ghost.className = `drag-card ${sourceEl.classList.contains("is-selected") ? "is-selected" : ""}`;
  ghost.innerHTML = sourceEl.innerHTML;
  ghost.style.setProperty("--color", colorCss(card.color));
  document.body.appendChild(ghost);
  sourceEl.classList.add("is-drag-source");
  document.body.classList.add("is-card-dragging");
  ui.selectedHandIndex = handIndex;
  ui.suppressNextClick = true;
  ui.drag = {
    pointerId: event.pointerId,
    handIndex,
    card,
    previews,
    sourceEl,
    sourceRect,
    ghost,
    offsetX: event.clientX - sourceRect.left,
    offsetY: event.clientY - sourceRect.top,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    overPileIndex: null,
  };
  updateDragGhost();
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
  if (dx * dx + dy * dy > 36) drag.moved = true;
  perfMonitor.measure("drag.move", () => {
    updateDragGhost();
    updateDropTarget(event.clientX, event.clientY);
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
        playFromHandToPile(ui.selectedHandIndex, pile);
      }
    } else if (key === "enter" || key === " ") {
      if (ui.state.phase === "play") {
        playBestCard(ui.selectedHandIndex ?? handPreviewSummary(ui.state).bestIndex);
      }
    } else if (key === "n") {
      startStage(ui.state.stageIndex ?? 1);
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
      ui.modal = null;
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
