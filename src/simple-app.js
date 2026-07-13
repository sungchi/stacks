import {
  HOURLY_ACTIVE_SEED_KEY,
  HOURLY_REDRAW_LIMIT,
  HOURLY_RULES_VERSION,
  canRedrawHourlyHand,
  formatDuration,
  hourlyBestStorageKey,
  hourlyResultShareText,
  hourlyRunStorageKey,
  hourlySolutionStorageKey,
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
} from "./game/hourly-harvest.js";
import {
  createPerformanceMonitor,
  installPerformanceTools,
} from "./performance.js";
import {
  dragGhostPosition,
  exceedsPointerDragThreshold,
  isPointerDragCancellation,
} from "./ui/pointer-drag.js";

const app = document.querySelector("#app");
const perfMonitor = createPerformanceMonitor("Stacks Hourly");
const SOLVER_BEAM_WIDTH = 2000;
const SOLVER_VERSION = `${HOURLY_RULES_VERSION}:beam-${SOLVER_BEAM_WIDTH}`;
const SNAP_MS = 150;
const DEAL_CARD_MS = 360;
const DEAL_STAGGER_MS = 70;
const HARVEST_MS = 620;
const LANDING_MS = 300;
const SFX_SETTING_KEY = "garden-stacks:hourly:sfx";
const FALLBACK_CARD_IMAGE = "public/assets/garden-stacks/generated/cards/card_locked_unknown.png";

const ui = {
  state: null,
  solution: null,
  selectedHandIndex: null,
  pendingSeed: "",
  helpOpen: false,
  resultOpen: false,
  toast: null,
  motion: null,
  deal: null,
  landingPulse: null,
  harvestPulse: null,
  drag: null,
  rejectedHandIndex: null,
  suppressNextClick: false,
  pendingDealSound: false,
  sfxEnabled: readSfxSetting(),
  loading: true,
};

const audio = {
  context: null,
};

function readSfxSetting() {
  try {
    return localStorage.getItem(SFX_SETTING_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSfxSetting(enabled) {
  try {
    localStorage.setItem(SFX_SETTING_KEY, enabled ? "on" : "off");
  } catch {
    // Sound preference can remain tab-local when storage is unavailable.
  }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function audioContext() {
  if (!ui.sfxEnabled) return null;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!audio.context) audio.context = new AudioContextClass({ latencyHint: "interactive" });
    return audio.context;
  } catch {
    return null;
  }
}

function playMidiTone(ctx, note, options = {}) {
  const start = ctx.currentTime + (options.delay ?? 0);
  const duration = options.duration ?? 0.07;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = options.type ?? "triangle";
  oscillator.frequency.setValueAtTime(midiFrequency(note), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.012, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playSfx(name, detail = {}) {
  const ctx = audioContext();
  if (!ctx) return;
  const run = () => {
    if (name === "deal") {
      const count = Math.max(1, Math.min(5, Number(detail.count) || 1));
      [57, 60, 64, 67, 72].slice(0, count).forEach((note, index) => {
        playMidiTone(ctx, note, { delay: index * 0.045, duration: 0.055, gain: 0.009, type: "square" });
      });
    } else if (name === "place") {
      playMidiTone(ctx, detail.harvest ? 55 : 62, { duration: 0.055, gain: 0.014 });
      playMidiTone(ctx, detail.harvest ? 72 : 69, { delay: 0.035, duration: 0.09, gain: 0.011 });
    } else if (name === "reject") {
      playMidiTone(ctx, 45, { duration: 0.08, gain: 0.012, type: "sawtooth" });
    }
  };
  if (ctx.state === "suspended") void ctx.resume().then(run).catch(() => {});
  else run();
}

function interactionLocked() {
  return Boolean(ui.motion || ui.deal);
}

function validSolutionPath(path) {
  if (!Array.isArray(path)) return false;
  const plays = path.filter((action) => !action.type || action.type === "play").length;
  const redraws = path.filter((action) => action.type === "redraw").length;
  return plays === 40 && redraws <= HOURLY_REDRAW_LIMIT && path.length === plays + redraws;
}

function activeSeed() {
  try {
    return localStorage.getItem(HOURLY_ACTIVE_SEED_KEY) ?? "";
  } catch {
    return "";
  }
}

function setActiveSeed(seed) {
  try {
    localStorage.setItem(HOURLY_ACTIVE_SEED_KEY, seed);
  } catch {
    // The game still works for the current tab when storage is unavailable.
  }
}

function loadSolution(seed) {
  const cached = readJson(hourlySolutionStorageKey(seed));
  if (cached?.seed === seed
    && cached.solverVersion === SOLVER_VERSION
    && validSolutionPath(cached.path)
    && cached.maximumScore > 0) {
    const replay = replayHourlySolution(seed, cached);
    if (replay.ok) return cached;
  }
  const stop = perfMonitor.start("solver.hourly", { seed, beamWidth: SOLVER_BEAM_WIDTH });
  const solution = solveHourlyHarvestMaximum(seed, { beamWidth: SOLVER_BEAM_WIDTH });
  const replay = replayHourlySolution(seed, solution);
  stop({ exploredStates: solution.exploredStates, maximumScore: solution.maximumScore, verified: replay.ok });
  if (!replay.ok) throw new Error("시간 게임 목표 경로를 검증하지 못했습니다.");
  writeJson(hourlySolutionStorageKey(seed), solution);
  return solution;
}

function saveRun() {
  if (!ui.state) return;
  writeJson(hourlyRunStorageKey(ui.state.seed), snapshotHourlyRun(ui.state));
  setActiveSeed(ui.state.seed);
}

function loadBest(seed) {
  const best = readJson(hourlyBestStorageKey(seed));
  return best && Number.isFinite(best.score) ? best : { score: 0, stars: 0, perfect: false, attempts: 0 };
}

function recordResult() {
  if (ui.state?.phase !== "result") return;
  const previous = loadBest(ui.state.seed);
  writeJson(hourlyBestStorageKey(ui.state.seed), {
    score: Math.max(previous.score ?? 0, ui.state.score),
    stars: Math.max(previous.stars ?? 0, ui.state.stars),
    perfect: previous.perfect === true || ui.state.perfect === true,
    attempts: Math.max(1, (previous.attempts ?? 0) + 1),
    completedAt: Date.now(),
  });
}

function createRun(seed) {
  ui.solution = loadSolution(seed);
  return newHourlyRun(seed, { solution: ui.solution });
}

function restoreOrCreateRun() {
  const currentSeed = kstHourSeed();
  const savedActiveSeed = activeSeed();
  const candidateSeed = savedActiveSeed || currentSeed;
  let state = restoreHourlyRun(readJson(hourlyRunStorageKey(candidateSeed)));
  if (!state) state = createRun(currentSeed);
  else ui.solution = loadSolution(state.seed);
  ui.state = state;
  ui.resultOpen = state.phase === "result";
  setActiveSeed(state.seed);
  ui.pendingSeed = currentSeed !== state.seed ? currentSeed : "";
  saveRun();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function requestedViewMode() {
  const params = new URLSearchParams(location.search);
  const view = (params.get("view") ?? "auto").toLowerCase();
  return ["mobile", "desktop"].includes(view) ? view : "auto";
}

function viewClass() {
  const requested = requestedViewMode();
  if (requested !== "auto") return `is-view-${requested}`;
  return matchMedia("(max-width: 640px)").matches ? "is-view-mobile" : "is-view-desktop";
}

function starsText(count, empty = "☆") {
  return `${"★".repeat(Math.max(0, count))}${empty.repeat(Math.max(0, 3 - count))}`;
}

function seedLabel(seed) {
  const text = String(seed);
  if (!/^\d{10}$/.test(text)) return `#${text}`;
  return `${Number(text.slice(4, 6))}월 ${Number(text.slice(6, 8))}일 ${text.slice(8, 10)}시`;
}

function currentTimerText() {
  return ui.pendingSeed ? "준비됨" : formatDuration(secondsUntilNextHour());
}

function selectedPreviews() {
  if (ui.selectedHandIndex == null || ui.state.phase !== "play") return [];
  return ui.state.piles.map((_, pileIndex) => previewHourlyPlacement(ui.state, ui.selectedHandIndex, pileIndex));
}

function previewLabel(preview) {
  if (!preview?.ok) return "";
  if (!preview.harvest) return `${preview.countAfter}/4 · ${preview.cardsUntilHarvest}장 남음`;
  if (preview.connection.length > 1) return `합 ${preview.chainSum} × 연결 ${preview.connection.length} = +${preview.points}`;
  return `연쇄 합 ${preview.chainSum} · +${preview.points}`;
}

function cardMarkup(card) {
  return `
    <span class="card-digit">${card.digit}</span>
    <img src="${escapeHtml(card.imagePath)}" alt="" draggable="false" />
    <strong>${escapeHtml(card.cardName)}</strong>
  `;
}

function renderHeader() {
  const best = loadBest(ui.state.seed);
  return `
    <header class="hourly-header">
      <div class="brand-lockup">
        <h1>Stacks</h1>
        <span>${escapeHtml(seedLabel(ui.state.seed))}</span>
      </div>
      <div class="header-actions">
        <button class="icon-button" type="button" data-action="help" aria-label="게임방법">?</button>
        <button class="text-button" type="button" data-action="share">결과공유</button>
        <div class="timer-box" aria-label="${ui.pendingSeed ? "새 게임 준비됨" : "다음 게임까지"}">
          <span>${ui.pendingSeed ? "새 게임" : "다음 게임"}</span>
          <strong data-timer>${currentTimerText()}</strong>
        </div>
      </div>
      <div class="score-line">
        <div><span>점수</span><strong>${ui.state.score}</strong></div>
        <div><span>별</span><strong>${starsText(ui.state.stars)}</strong></div>
        <div><span>수확</span><strong>${ui.state.harvests}</strong></div>
        <div><span>최고</span><strong>${best.score}</strong></div>
      </div>
      <div class="star-targets" aria-label="별 목표 점수">
        <span class="${ui.state.score >= ui.state.thresholds.one ? "is-earned" : ""}">★ ${ui.state.thresholds.one}</span>
        <span class="${ui.state.score >= ui.state.thresholds.two ? "is-earned" : ""}">★★ ${ui.state.thresholds.two}</span>
        <span class="${ui.state.score >= ui.state.thresholds.three ? "is-earned" : ""}">★★★ ${ui.state.thresholds.three}</span>
      </div>
    </header>
  `;
}

function renderPendingBanner() {
  if (!ui.pendingSeed) return "";
  return `
    <section class="new-game-banner" aria-live="polite">
      <div><strong>새 게임이 준비됐어요.</strong><span>${escapeHtml(seedLabel(ui.pendingSeed))} 정원</span></div>
      <button type="button" data-action="start-ready">시작</button>
    </section>
  `;
}

function renderGarden(pile, pileIndex, preview) {
  const isPulse = ui.harvestPulse?.pileIndex === pileIndex;
  const isLanding = ui.landingPulse?.pileIndex === pileIndex;
  const isConnected = preview?.harvest && preview.connection.pileIndices.includes(pileIndex);
  const slots = Array.from({ length: 4 }, (_, index) => {
    const card = pile[index];
    const isLandingCard = isLanding && ui.landingPulse?.cardId === card?.id;
    return card
      ? `<span class="garden-card ${isLandingCard ? "is-landing-card" : ""}" style="--slot:${index}">${cardMarkup(card)}</span>`
      : `<span class="garden-slot" aria-hidden="true">${index + 1}</span>`;
  }).join("");
  return `
    <button class="garden ${preview ? "is-target" : ""} ${preview?.harvest ? "will-harvest" : ""} ${isConnected ? "is-connected" : ""} ${isPulse ? "is-harvesting" : ""} ${isLanding ? "is-landing" : ""}" type="button" data-action="place-card" data-pile-index="${pileIndex}" ${ui.state.phase !== "play" || interactionLocked() ? "disabled" : ""}>
      <span class="garden-head"><strong>정원 ${pileIndex + 1}</strong><small>${pile.length}/4</small></span>
      <span class="garden-slots">${slots}</span>
      <span class="garden-preview">${escapeHtml(previewLabel(preview)) || "\u00a0"}</span>
    </button>
  `;
}

function renderBoard() {
  const previews = selectedPreviews();
  return `
    <section class="board-section" aria-label="네 정원">
      <div class="clockwise-label" aria-label="시계방향 정원 순서"><span>1</span><i>→</i><span>2</span><i>→</i><span>4</span><i>→</i><span>3</span></div>
      <div class="garden-grid">
        ${ui.state.piles.map((pile, index) => renderGarden(pile, index, previews[index])).join("")}
      </div>
      <p class="rule-line">네 장 연쇄는 합 · 시계방향 정원 연결은 곱</p>
    </section>
  `;
}

function renderHandCard(card, index) {
  const dealIndex = ui.deal?.cardIds.indexOf(card.id) ?? -1;
  const isDeal = dealIndex >= 0;
  const isSnapSource = ui.motion?.handIndex === index;
  const dealX = Math.round((dealIndex - 2) * -16);
  return `
    <button class="hand-card ${ui.selectedHandIndex === index ? "is-selected" : ""} ${ui.rejectedHandIndex === index ? "is-rejected" : ""} ${isDeal ? "is-dealt" : ""} ${isSnapSource ? "is-snap-source" : ""}" type="button" data-action="select-card" data-hand-index="${index}" aria-pressed="${ui.selectedHandIndex === index}" aria-label="${escapeHtml(`${card.cardName} ${card.digit}, 손패 ${index + 1}`)}" style="--deal-delay:${Math.max(0, dealIndex) * DEAL_STAGGER_MS}ms;--deal-x:${dealX}px" ${ui.state.phase !== "play" || interactionLocked() ? "disabled" : ""}>
      ${cardMarkup(card)}
    </button>
  `;
}

function renderHand() {
  const remaining = ui.state.deck.length + ui.state.hand.length;
  const canRedraw = canRedrawHourlyHand(ui.state) && !interactionLocked();
  return `
    <section class="hand-section" aria-label="손패">
      <div class="hand-head"><div><strong>손패</strong><span>카드를 정원으로 옮기세요</span></div><div><span>남은 카드</span><strong>${remaining}</strong></div></div>
      <div class="hand-row">
        ${ui.state.hand.map(renderHandCard).join("")}
      </div>
      <div class="run-actions">
        <button class="primary-action redraw-action" type="button" data-action="redraw" ${canRedraw ? "" : "disabled"}><span>카드 새로받기</span><strong>${ui.state.redrawsLeft}</strong><small>/${HOURLY_REDRAW_LIMIT}</small></button>
        <span>${ui.state.cardsPlayed}/40 사용</span>
      </div>
    </section>
  `;
}

function renderMotion() {
  if (!ui.motion) return "";
  const { source, target, card } = ui.motion;
  const x = target.left - source.left;
  const y = target.top - source.top;
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  return `<div class="snap-card" style="--snap-left:${source.left}px;--snap-top:${source.top}px;--snap-width:${source.width}px;--snap-x:${x}px;--snap-y:${y}px;--snap-scale-x:${scaleX};--snap-scale-y:${scaleY}">${cardMarkup(card)}</div>`;
}

function renderHelp() {
  if (!ui.helpOpen) return "";
  return `
    <div class="overlay" data-action="close-help">
      <section class="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header><h2 id="help-title">게임방법</h2><button type="button" data-action="close-help" aria-label="닫기">×</button></header>
        <ol>
          <li>손패 카드 한 장을 원하는 정원으로 옮깁니다.</li>
          <li>정원에 네 장이 쌓이면 네 숫자를 더해 수확합니다.</li>
          <li>놓은 정원부터 시계방향 숫자가 이어지면 연결 수만큼 곱합니다.</li>
          <li>카드 새로받기는 손패를 덱 뒤로 보내며 한 게임에 세 번 쓸 수 있습니다.</li>
          <li>40장을 모두 사용한 점수로 별을 받습니다.</li>
        </ol>
        <p><strong>예:</strong> 네 장 합 19 × 정원 연결 3 = 57점</p>
        <label class="sound-setting"><span>효과음</span><input type="checkbox" data-action="toggle-sound" ${ui.sfxEnabled ? "checked" : ""} /><i aria-hidden="true"></i></label>
        <div class="help-actions">
          <button type="button" data-action="retry">현재 게임 다시하기</button>
          <button class="primary-action" type="button" data-action="close-help">계속하기</button>
        </div>
      </section>
    </div>
  `;
}

function renderResult() {
  if (!ui.resultOpen || ui.state.phase !== "result") return "";
  const best = loadBest(ui.state.seed);
  return `
    <div class="overlay result-overlay">
      <section class="dialog result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <span class="result-seed">#${ui.state.seed}</span>
        <h2 id="result-title">${ui.state.perfect ? "PERFECT" : starsText(ui.state.stars)}</h2>
        <strong class="result-score">${ui.state.score}점</strong>
        <p>이번 시간 최고 ${best.score}</p>
        <div class="result-actions">
          <button type="button" data-action="share">결과공유</button>
          <button type="button" data-action="help">게임방법</button>
          ${ui.pendingSeed ? '<button type="button" data-action="start-ready">새 게임 시작</button>' : ""}
        </div>
      </section>
    </div>
  `;
}

function renderToast() {
  return ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast.message)}</div>` : "";
}

function render() {
  if (ui.loading || !ui.state) return;
  const stop = perfMonitor.start("render", { seed: ui.state.seed, phase: ui.state.phase });
  app.innerHTML = `
    <main class="hourly-shell ${viewClass()}">
      ${renderHeader()}
      ${renderPendingBanner()}
      ${renderBoard()}
      ${renderHand()}
      ${renderResult()}
      ${renderHelp()}
      ${renderToast()}
      ${renderMotion()}
    </main>
  `;
  document.body.dataset.mode = "hourly";
  stop({ nodeCount: app.getElementsByTagName("*").length });
}

function showToast(message) {
  const id = Date.now();
  ui.toast = { id, message };
  render();
  window.setTimeout(() => {
    if (ui.toast?.id !== id) return;
    ui.toast = null;
    document.querySelector(".toast")?.remove();
  }, 1800);
}

function selectCard(index) {
  if (interactionLocked() || ui.state.phase !== "play" || !ui.state.hand[index]) return;
  ui.selectedHandIndex = ui.selectedHandIndex === index ? null : index;
  render();
}

function rectSnapshot(rect) {
  return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

function finishPlacement(handIndex, pileIndex) {
  const result = perfMonitor.measure("game.place", () => playHourlyCard(ui.state, handIndex, pileIndex), { handIndex, pileIndex });
  ui.motion = null;
  ui.selectedHandIndex = null;
  if (!result.ok) {
    showToast("카드를 놓지 못했습니다.");
    return;
  }
  ui.landingPulse = { pileIndex, cardId: result.card.id };
  playSfx("place", { harvest: Boolean(result.harvest) });
  window.setTimeout(() => {
    if (ui.landingPulse?.cardId !== result.card.id) return;
    ui.landingPulse = null;
    document.querySelector(`[data-pile-index="${pileIndex}"]`)?.classList.remove("is-landing");
    document.querySelector(`[data-pile-index="${pileIndex}"] .garden-card.is-landing-card`)?.classList.remove("is-landing-card");
  }, LANDING_MS);
  if (result.harvest) {
    ui.harvestPulse = result.harvest;
    window.setTimeout(() => {
      ui.harvestPulse = null;
      render();
    }, HARVEST_MS);
  }
  if (ui.state.phase === "result") {
    recordResult();
    ui.resultOpen = true;
  }
  saveRun();
  render();
}

function placementTargetRect(pileIndex) {
  const slotIndex = Math.min(ui.state.piles[pileIndex]?.length ?? 0, 3);
  const slot = document.querySelector(`[data-pile-index="${pileIndex}"] .garden-slots > :nth-child(${slotIndex + 1})`);
  return rectSnapshot(slot?.getBoundingClientRect());
}

function placeCard(handIndex, pileIndex, sourceRect = null) {
  if (interactionLocked() || ui.state.phase !== "play") return;
  const preview = previewHourlyPlacement(ui.state, handIndex, pileIndex);
  if (!preview.ok) return;
  const source = sourceRect ?? rectSnapshot(document.querySelector(`[data-hand-index="${handIndex}"]`)?.getBoundingClientRect());
  const target = placementTargetRect(pileIndex);
  if (!source || !target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishPlacement(handIndex, pileIndex);
    return;
  }
  ui.motion = { type: "snap", card: ui.state.hand[handIndex], handIndex, pileIndex, source, target };
  ui.selectedHandIndex = null;
  render();
  window.setTimeout(() => finishPlacement(handIndex, pileIndex), SNAP_MS);
}

function startDealMotion(cards, options = {}) {
  const cardIds = cards.map((card) => card.id);
  ui.pendingDealSound = options.sound === false && cardIds.length > 0;
  if (options.sound !== false) playSfx("deal", { count: cardIds.length });
  if (!cardIds.length || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ui.deal = null;
    ui.pendingDealSound = false;
    return;
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  ui.deal = { id, cardIds };
  const duration = DEAL_CARD_MS + Math.max(0, cardIds.length - 1) * DEAL_STAGGER_MS;
  window.setTimeout(() => {
    if (ui.deal?.id !== id) return;
    ui.deal = null;
    ui.pendingDealSound = false;
    render();
  }, duration);
}

function playPendingDealSound() {
  if (!ui.pendingDealSound) return;
  ui.pendingDealSound = false;
  playSfx("deal", { count: ui.deal?.cardIds.length ?? ui.state?.hand.length ?? 5 });
}

function redrawCurrentHand() {
  if (interactionLocked() || !canRedrawHourlyHand(ui.state)) return;
  const result = perfMonitor.measure("game.redraw", () => redrawHourlyHand(ui.state));
  if (!result.ok) {
    showToast("지금은 카드를 새로 받을 수 없습니다.");
    return;
  }
  ui.selectedHandIndex = null;
  saveRun();
  startDealMotion(result.hand);
  render();
}

function retryCurrent() {
  ui.resultOpen = false;
  ui.helpOpen = false;
  ui.selectedHandIndex = null;
  ui.motion = null;
  ui.deal = null;
  ui.state = newHourlyRun(ui.state.seed, { solution: ui.solution ?? loadSolution(ui.state.seed) });
  saveRun();
  startDealMotion(ui.state.hand);
  render();
}

function startSeed(seed) {
  ui.loading = true;
  ui.resultOpen = false;
  ui.helpOpen = false;
  ui.selectedHandIndex = null;
  ui.motion = null;
  ui.deal = null;
  app.innerHTML = '<main class="hourly-loading"><strong>새 정원을 준비하는 중</strong><span>최대 점수를 계산하고 있어요.</span></main>';
  window.setTimeout(() => {
    ui.solution = loadSolution(seed);
    ui.state = newHourlyRun(seed, { solution: ui.solution });
    ui.pendingSeed = "";
    ui.loading = false;
    saveRun();
    startDealMotion(ui.state.hand);
    render();
  }, 30);
}

function shouldUseNativeShare() {
  const userAgent = navigator.userAgent ?? "";
  const iPadDesktop = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  return typeof navigator.share === "function" && (/Android|iPhone|iPad|iPod/i.test(userAgent) || iPadDesktop);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard copy failed");
}

async function copyShareText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  fallbackCopy(text);
}

async function shareResult() {
  const url = `${location.origin}${location.pathname}`;
  const text = hourlyResultShareText(ui.state, url);
  if (shouldUseNativeShare()) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await copyShareText(text);
    showToast("결과를 클립보드에 복사했어요.");
  } catch {
    showToast("공유 문구를 복사하지 못했습니다.");
  }
}

function beginDrag(event, cardButton) {
  if (event.button !== 0 || ui.drag || interactionLocked() || ui.state.phase !== "play") return;
  const stop = perfMonitor.start("drag.start", { pointerType: event.pointerType || "mouse" });
  const handIndex = Number(cardButton.dataset.handIndex);
  const rect = cardButton.getBoundingClientRect();
  ui.selectedHandIndex = handIndex;
  ui.drag = {
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    handIndex,
    sourceRect: rectSnapshot(rect),
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    ghost: null,
    moved: false,
    overPileIndex: null,
    frameId: null,
  };
  document.body.classList.add("is-card-dragging");
  if (event.pointerId != null) app.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", moveDrag, { passive: false });
  window.addEventListener("pointerup", endDrag, { passive: false });
  window.addEventListener("pointercancel", endDrag, { passive: false });
  render();
  event.preventDefault();
  stop({ handIndex });
}

function gardenFromPoint(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest(".garden[data-pile-index]");
  return target && !target.disabled ? target : null;
}

function clearDragTarget() {
  document.querySelectorAll(".garden.is-drag-over").forEach((item) => item.classList.remove("is-drag-over"));
}

function updateDragTarget(drag, target) {
  const pileIndex = target ? Number(target.dataset.pileIndex) : null;
  if (pileIndex === drag.overPileIndex) return;
  clearDragTarget();
  target?.classList.add("is-drag-over");
  drag.overPileIndex = pileIndex;
}

function updateDragFrame() {
  const drag = ui.drag;
  if (!drag) return;
  drag.frameId = null;
  perfMonitor.measure("drag.move", () => {
    if (drag.ghost) {
      const position = dragGhostPosition(drag.x, drag.y, drag.offsetX, drag.offsetY);
      drag.ghost.style.setProperty("--drag-x", `${position.x}px`);
      drag.ghost.style.setProperty("--drag-y", `${position.y}px`);
    }
    if (drag.moved) updateDragTarget(drag, gardenFromPoint(drag.x, drag.y));
  }, { handIndex: drag.handIndex, pointerType: drag.pointerType });
}

function scheduleDragFrame(drag) {
  if (drag.frameId != null) return;
  drag.frameId = window.requestAnimationFrame(updateDragFrame);
}

function ensureDragGhost(drag) {
  if (drag.ghost) return;
  const source = document.querySelector(`[data-hand-index="${drag.handIndex}"]`);
  const ghost = source?.cloneNode(true);
  if (!ghost) return;
  ghost.className = "drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.tabIndex = -1;
  ghost.style.setProperty("--drag-width", `${Math.round(drag.sourceRect.width)}px`);
  document.body.append(ghost);
  drag.ghost = ghost;
}

function moveDrag(event) {
  const drag = ui.drag;
  if (!drag || (drag.pointerId != null && drag.pointerId !== event.pointerId)) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && exceedsPointerDragThreshold(drag.pointerType, dx, dy)) {
    drag.moved = true;
    ensureDragGhost(drag);
  }
  if (drag.moved) scheduleDragFrame(drag);
  event.preventDefault();
}

function rejectDraggedCard(handIndex) {
  ui.rejectedHandIndex = handIndex;
  playSfx("reject");
  window.setTimeout(() => {
    if (ui.rejectedHandIndex === handIndex) ui.rejectedHandIndex = null;
    document.querySelector(`[data-hand-index="${handIndex}"]`)?.classList.remove("is-rejected");
  }, 360);
}

function clearDragSession(drag) {
  ui.drag = null;
  document.body.classList.remove("is-card-dragging");
  if (drag.frameId != null) window.cancelAnimationFrame(drag.frameId);
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  drag.ghost?.remove();
  clearDragTarget();
  if (drag.pointerId != null && app.hasPointerCapture?.(drag.pointerId)) {
    app.releasePointerCapture?.(drag.pointerId);
  }
}

function endDrag(event) {
  const drag = ui.drag;
  if (!drag || (drag.pointerId != null && drag.pointerId !== event.pointerId)) return;
  const canceled = isPointerDragCancellation(event.type);
  const target = !canceled && drag.moved ? gardenFromPoint(event.clientX, event.clientY) : null;
  if (drag.ghost) {
    const position = dragGhostPosition(event.clientX, event.clientY, drag.offsetX, drag.offsetY);
    drag.ghost.style.setProperty("--drag-x", `${position.x}px`);
    drag.ghost.style.setProperty("--drag-y", `${position.y}px`);
  }
  const dropSourceRect = rectSnapshot(drag.ghost?.getBoundingClientRect()) ?? drag.sourceRect;
  const stop = perfMonitor.start("drag.end", {
    handIndex: drag.handIndex,
    pointerType: drag.pointerType,
    moved: drag.moved,
  });
  clearDragSession(drag);
  event.preventDefault();
  if (canceled) {
    stop({ canceled: true, placed: false });
    return;
  }
  ui.suppressNextClick = true;
  window.setTimeout(() => {
    ui.suppressNextClick = false;
  }, 0);
  if (target) {
    stop({ canceled: false, placed: true, pileIndex: Number(target.dataset.pileIndex) });
    placeCard(drag.handIndex, Number(target.dataset.pileIndex), dropSourceRect);
    return;
  }
  if (drag.moved) {
    rejectDraggedCard(drag.handIndex);
    stop({ canceled: false, placed: false });
    showToast("정원 위에 카드를 놓으세요.");
  }
  else {
    stop({ canceled: false, placed: false });
    ui.selectedHandIndex = drag.handIndex;
    render();
  }
}

function handleAction(action, button) {
  if (action === "select-card") selectCard(Number(button.dataset.handIndex));
  else if (action === "place-card" && ui.selectedHandIndex != null) placeCard(ui.selectedHandIndex, Number(button.dataset.pileIndex));
  else if (action === "redraw") redrawCurrentHand();
  else if (action === "retry") retryCurrent();
  else if (action === "start-ready") startSeed(ui.pendingSeed || kstHourSeed());
  else if (action === "help") { ui.helpOpen = true; render(); }
  else if (action === "close-help") { ui.helpOpen = false; render(); }
  else if (action === "toggle-sound") {
    ui.sfxEnabled = button.checked;
    writeSfxSetting(ui.sfxEnabled);
    if (ui.sfxEnabled) playSfx("place");
  }
  else if (action === "share") shareResult();
}

app.addEventListener("click", (event) => {
  if (ui.suppressNextClick) {
    ui.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (ui.drag) return;
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.classList.contains("overlay") && event.target !== button) return;
  handleAction(button.dataset.action, button);
});

app.addEventListener("pointerdown", (event) => {
  playPendingDealSound();
  const card = event.target.closest(".hand-card[data-hand-index]");
  if (card) beginDrag(event, card);
});

app.addEventListener("lostpointercapture", endDrag);

app.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = FALLBACK_CARD_IMAGE;
}, true);

window.addEventListener("keydown", (event) => {
  playPendingDealSound();
  if (interactionLocked() || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key >= "1" && key <= "5") selectCard(Number(key) - 1);
  else if (["q", "w", "e", "r"].includes(key) && ui.selectedHandIndex != null) {
    placeCard(ui.selectedHandIndex, { q: 0, w: 1, e: 2, r: 3 }[key]);
  } else if (key === "escape") {
    ui.selectedHandIndex = null;
    ui.helpOpen = false;
    render();
  }
});

function updateClock() {
  const currentSeed = kstHourSeed();
  if (currentSeed !== ui.state.seed && currentSeed !== ui.pendingSeed) {
    ui.pendingSeed = currentSeed;
    render();
    return;
  }
  const timer = document.querySelector("[data-timer]");
  if (timer) timer.textContent = currentTimerText();
}

function bootstrap() {
  try {
    restoreOrCreateRun();
    ui.loading = false;
    if (ui.state.cardsPlayed === 0 && ui.state.redrawsUsed === 0) {
      startDealMotion(ui.state.hand, { sound: navigator.userActivation?.hasBeenActive === true });
    }
    render();
    window.setInterval(updateClock, 1000);
  } catch (error) {
    ui.loading = false;
    app.innerHTML = `<main class="hourly-error"><strong>게임을 준비하지 못했습니다.</strong><span>${escapeHtml(error.message)}</span><button type="button" onclick="location.reload()">새로고침</button></main>`;
  }
}

bootstrap();

installPerformanceTools({
  namespace: "gardenStacksPerf",
  monitor: perfMonitor,
  render,
  root: app,
  getDetail: () => ({ seed: ui.state?.seed, phase: ui.state?.phase, motion: ui.motion?.type ?? (ui.deal ? "deal" : null) }),
});
