import {
  HOURLY_ACTIVE_SEED_KEY,
  HOURLY_REDRAW_LIMIT,
  canRedrawHourlyHand,
  formatDuration,
  hourlyDeckOverview,
  hourlyBestStorageKey,
  hourlyGardenLabel,
  hourlyResultShareText,
  hourlyRootUrl,
  hourlyRunStorageKey,
  kstHourSeed,
  newHourlyRun,
  playHourlyCard,
  previewHourlyPlacement,
  redrawHourlyHand,
  restoreHourlyRun,
  secondsUntilNextHour,
  snapshotHourlyRun,
} from "./game/hourly-harvest.js";
import {
  createPerformanceMonitor,
  installPerformanceTools,
} from "./performance.js";
import {
  canStartPointerCarry,
  dragGhostPosition,
  exceedsPointerDragThreshold,
  handCardPointerEffect,
  isPointerDragCancellation,
  selectionAfterPointerGesture,
} from "./ui/pointer-drag.js";
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  detectLanguage,
  normalizeLanguage,
  translateCardName,
  translateText,
} from "./i18n.js";
import {
  createHourlyHarvestFeedback,
  createHourlyHarvestTonePlan,
} from "./ui/harvest-feedback.js";

const app = document.querySelector("#app");
const perfMonitor = createPerformanceMonitor("Stacks Hourly");
const SNAP_MS = 150;
const DEAL_CARD_MS = 360;
const DEAL_STAGGER_MS = 70;
const DEAL_AFTER_PLAY_DELAY_MS = 120;
const LANDING_MS = 300;
const CARD_HOLO_MAX_TILT = 8;
const SFX_SETTING_KEY = "garden-stacks:hourly:sfx";
const HELP_SEEN_KEY = "garden-stacks:hourly:help-seen:v5";
const FALLBACK_CARD_IMAGE = "public/assets/garden-stacks/generated/cards/card_locked_unknown.png";

const ui = {
  state: null,
  selectedHandIndex: null,
  pendingSeed: "",
  newGameConfirmOpen: false,
  helpOpen: false,
  firstVisitHelp: false,
  resultOpen: false,
  remainingOpen: false,
  cardListSort: "digit",
  toast: null,
  motion: null,
  deal: null,
  landingPulse: null,
  harvestPulse: null,
  drag: null,
  carry: null,
  rejectedHandIndex: null,
  suppressNextClick: false,
  pendingDealSound: false,
  sfxEnabled: readSfxSetting(),
  language: readLanguageSetting(),
  loading: true,
};

const audio = {
  context: null,
  fallbackPlayer: null,
  fallbackPriming: false,
  fallbackUnlocked: false,
  wavCache: new Map(),
};

const WEB_AUDIO_GAIN_SCALE = 2;
const FALLBACK_AUDIO_VOLUME = 0.65;

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

function readLanguageSetting() {
  let stored = "";
  try {
    stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? "";
  } catch {
    // Browser language remains available when storage is unavailable.
  }
  return detectLanguage({
    stored,
    languages: navigator.languages ?? [],
    language: navigator.language,
  });
}

function writeLanguageSetting(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language preference can remain tab-local when storage is unavailable.
  }
}

function hasSeenHelp() {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markHelpSeen() {
  try {
    localStorage.setItem(HELP_SEEN_KEY, "1");
  } catch {
    // First-visit help can reappear when storage is unavailable.
  }
}

function t(key, variables) {
  return translateText(ui.language, key, variables);
}

function setLanguage(language) {
  const next = normalizeLanguage(language);
  if (!next || next === ui.language) return;
  ui.language = next;
  writeLanguageSetting(next);
  render();
}

function closeHelp() {
  ui.helpOpen = false;
  ui.firstVisitHelp = false;
  markHelpSeen();
  render();
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

function wavDataUri(tones, duration) {
  const sampleRate = 11025;
  const sampleCount = Math.max(1, Math.ceil(sampleRate * duration));
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    let sample = 0;
    for (const tone of tones) {
      const localTime = time - tone.delay;
      if (localTime < 0 || localTime > tone.duration) continue;
      const envelope = Math.sin(Math.PI * Math.min(1, localTime / 0.012)) * (1 - localTime / tone.duration);
      sample += Math.sin(2 * Math.PI * midiFrequency(tone.note) * localTime) * envelope * tone.gain;
    }
    view.setInt16(44 + sampleIndex * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  }

  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function fallbackSfxUri(name, detail = {}) {
  const feedback = detail.feedback;
  const key = `${name}:${detail.count ?? 0}:${feedback?.final?.multiplier ?? 1}:${feedback?.connectionEvents?.length ?? 0}:${feedback?.comboType ? 5 : 1}`;
  if (audio.wavCache.has(key)) return audio.wavCache.get(key);
  let tones = [];
  if (name === "deal") {
    const count = Math.max(1, Math.min(5, Number(detail.count) || 1));
    tones = [57, 60, 64, 67, 72].slice(0, count).map((note, index) => ({ note, delay: index * 0.045, duration: 0.08, gain: 0.18 }));
  } else if (name === "harvest") {
    tones = createHourlyHarvestTonePlan(feedback);
  } else if (name === "place") {
    tones = [{ note: 62, delay: 0, duration: 0.07, gain: 0.22 }, { note: 69, delay: 0.035, duration: 0.11, gain: 0.17 }];
  } else if (name === "reject") {
    tones = [{ note: 45, delay: 0, duration: 0.12, gain: 0.2 }];
  }
  const duration = Math.max(0.04, ...tones.map((tone) => tone.delay + tone.duration + 0.025));
  const uri = wavDataUri(tones, duration);
  audio.wavCache.set(key, uri);
  return uri;
}

function playFallbackSfx(name, detail = {}) {
  if (!ui.sfxEnabled || typeof window.Audio !== "function") return;
  const player = audio.fallbackPlayer ?? new window.Audio();
  audio.fallbackPlayer = player;
  player.pause();
  player.src = fallbackSfxUri(name, detail);
  player.currentTime = 0;
  player.volume = FALLBACK_AUDIO_VOLUME;
  const playback = player.play();
  document.body.dataset.audioFallbackState = "playing";
  if (playback?.catch) {
    void playback.catch((error) => {
      document.body.dataset.audioFallbackState = "blocked";
      document.body.dataset.audioError = error?.name ?? "fallback_play_failed";
    });
  }
}

function unlockAudioFallback() {
  if (audio.fallbackUnlocked || audio.fallbackPriming || typeof window.Audio !== "function") return;
  const player = audio.fallbackPlayer ?? new window.Audio();
  audio.fallbackPlayer = player;
  audio.fallbackPriming = true;
  player.src = wavDataUri([], 0.025);
  player.volume = 0;
  const playback = player.play();
  if (!playback?.then) {
    audio.fallbackPriming = false;
    return;
  }
  void playback.then(() => {
    player.pause();
    player.currentTime = 0;
    player.volume = FALLBACK_AUDIO_VOLUME;
    audio.fallbackPriming = false;
    audio.fallbackUnlocked = true;
    document.body.dataset.audioFallbackState = "ready";
  }).catch((error) => {
    audio.fallbackPriming = false;
    document.body.dataset.audioFallbackState = "blocked";
    document.body.dataset.audioError = error?.name ?? "fallback_unlock_failed";
  });
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

function audioSupportMode() {
  return typeof (window.AudioContext ?? window.webkitAudioContext) === "function" ? "web-audio" : "unavailable";
}

function primeWebAudio(ctx) {
  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    gain.gain.value = 0;
    source.connect(gain).connect(ctx.destination);
    source.start(0);
  } catch {
    // Some Web Audio implementations resume without requiring a silent source.
  }
}

function unlockAudioContext() {
  unlockAudioFallback();
  const ctx = audioContext();
  if (!ctx) {
    document.body.dataset.audioState = "unavailable";
    return;
  }
  document.body.dataset.audioState = ctx.state;
  if (ctx.state === "suspended") {
    primeWebAudio(ctx);
    void ctx.resume()
      .then(() => {
        document.body.dataset.audioState = ctx.state;
        delete document.body.dataset.audioError;
      })
      .catch((error) => {
        document.body.dataset.audioState = ctx.state;
        document.body.dataset.audioError = error?.name ?? "resume_failed";
      });
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
  if (!ctx) {
    playFallbackSfx(name, detail);
    return;
  }
  const run = () => {
    if (name === "deal") {
      const count = Math.max(1, Math.min(5, Number(detail.count) || 1));
      [57, 60, 64, 67, 72].slice(0, count).forEach((note, index) => {
        playMidiTone(ctx, note, { delay: index * 0.045, duration: 0.055, gain: 0.018 * WEB_AUDIO_GAIN_SCALE, type: "square" });
      });
    } else if (name === "harvest") {
      createHourlyHarvestTonePlan(detail.feedback).forEach((tone) => {
        playMidiTone(ctx, tone.note, {
          delay: tone.delay,
          duration: tone.duration,
          gain: tone.gain * 0.13 * WEB_AUDIO_GAIN_SCALE,
          type: "triangle",
        });
      });
    } else if (name === "place") {
      playMidiTone(ctx, 62, { duration: 0.055, gain: 0.028 * WEB_AUDIO_GAIN_SCALE });
      playMidiTone(ctx, 69, { delay: 0.035, duration: 0.09, gain: 0.022 * WEB_AUDIO_GAIN_SCALE });
    } else if (name === "reject") {
      playMidiTone(ctx, 45, { duration: 0.08, gain: 0.024 * WEB_AUDIO_GAIN_SCALE, type: "sawtooth" });
    }
  };
  if (ctx.state === "suspended") {
    let finished = false;
    const fallbackTimer = window.setTimeout(() => {
      if (finished || ctx.state === "running") return;
      finished = true;
      playFallbackSfx(name, detail);
    }, 80);
    void ctx.resume().then(() => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      if (ctx.state === "running") run();
      else playFallbackSfx(name, detail);
    }).catch(() => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      playFallbackSfx(name, detail);
    });
  } else {
    run();
  }
}

function interactionLocked() {
  return Boolean(ui.motion || ui.deal || ui.harvestPulse);
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

function saveRun() {
  if (!ui.state) return;
  writeJson(hourlyRunStorageKey(ui.state.seed), snapshotHourlyRun(ui.state));
  setActiveSeed(ui.state.seed);
}

function loadBest(seed) {
  const best = readJson(hourlyBestStorageKey(seed));
  return best && Number.isFinite(best.score) ? best : { score: 0, stars: 0, attempts: 0 };
}

function recordResult() {
  if (ui.state?.phase !== "result") return;
  const previous = loadBest(ui.state.seed);
  writeJson(hourlyBestStorageKey(ui.state.seed), {
    score: Math.max(previous.score ?? 0, ui.state.score),
    stars: Math.max(previous.stars ?? 0, ui.state.stars),
    attempts: Math.max(1, (previous.attempts ?? 0) + 1),
    completedAt: Date.now(),
  });
}

function createRun(seed) {
  return newHourlyRun(seed);
}

function restoreOrCreateRun() {
  const currentSeed = kstHourSeed();
  const savedActiveSeed = activeSeed();
  const candidateSeed = savedActiveSeed || currentSeed;
  let state = restoreHourlyRun(readJson(hourlyRunStorageKey(candidateSeed)));
  if (!state) state = createRun(currentSeed);
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
  return t("seed.label", {
    month: Number(text.slice(4, 6)),
    day: Number(text.slice(6, 8)),
    hour: text.slice(8, 10),
  });
}

function currentTimerText() {
  return ui.pendingSeed ? t("timer.ready") : formatDuration(secondsUntilNextHour());
}

function selectedPreviews() {
  if (ui.selectedHandIndex == null || ui.state.phase !== "play") return [];
  return ui.state.piles.map((_, pileIndex) => previewHourlyPlacement(ui.state, ui.selectedHandIndex, pileIndex));
}

function previewLabel(preview) {
  if (!preview?.ok) return "";
  if (!preview.harvest) {
    return t("preview.pending", {
      count: preview.countAfter,
      remaining: preview.cardsUntilHarvest,
    });
  }
  return t(preview.typeMatch?.matched ? "preview.sameType" : "preview.harvest", {
    sum: preview.chainSum,
    multiplier: preview.multiplier,
    points: preview.points,
  });
}

function cardDisplayName(card) {
  return translateCardName(ui.language, card.variantId, card.cardName);
}

function comboTypeDisplayName(card) {
  return t(`comboType.${card.comboTypeId}`);
}

function cardMarkup(card) {
  return `
    <span class="card-digit">${card.digit}</span>
    <span class="card-type">${escapeHtml(comboTypeDisplayName(card))}</span>
    <img src="${escapeHtml(card.imagePath)}" alt="${escapeHtml(cardDisplayName(card))}" draggable="false" />
    <strong class="card-name"><span>${escapeHtml(cardDisplayName(card))}</span></strong>
  `;
}

function renderHeader() {
  const visibleScore = Math.max(0, ui.state.score - (ui.harvestPulse?.points ?? 0));
  const timerBox = ui.pendingSeed
    ? `<button class="timer-box is-ready" type="button" data-action="confirm-ready" aria-label="${escapeHtml(t("timer.readyAria"))}"><span>${escapeHtml(t("timer.newGame"))}</span><strong data-timer>${escapeHtml(currentTimerText())}</strong></button>`
    : `<div class="timer-box" aria-label="${escapeHtml(t("timer.nextAria"))}"><span>${escapeHtml(t("timer.nextGame"))}</span><strong data-timer>${escapeHtml(currentTimerText())}</strong></div>`;
  return `
    <header class="hourly-header">
      <div class="brand-lockup">
        <h1>${escapeHtml(t("brand.name"))}</h1>
        <span>${escapeHtml(seedLabel(ui.state.seed))}</span>
      </div>
      <div class="header-actions">
        <button class="icon-button" type="button" data-action="help" aria-label="${escapeHtml(t("help.open"))}">?</button>
        <a class="icon-button discord-button" href="https://discord.gg/MA6xyVAkt" target="_blank" rel="noopener" aria-label="${escapeHtml(t("community.discord"))}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.08.08 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.3 18.3 0 0 0-5.48 0c-.17-.39-.41-.88-.62-1.25a.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06c0 .02.01.04.03.06a19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.04ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.98 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
          </svg>
        </a>
        <button class="text-button" type="button" data-action="share">${escapeHtml(t("share.button"))}</button>
        ${timerBox}
      </div>
      <div class="star-targets" aria-label="${escapeHtml(t("score.targetsAria"))}">
        <span class="current-score">${escapeHtml(t("score.score"))} <strong>${visibleScore}</strong></span>
        <span class="${visibleScore >= ui.state.thresholds.one ? "is-earned" : ""}">★ ${ui.state.thresholds.one}</span>
        <span class="${visibleScore >= ui.state.thresholds.two ? "is-earned" : ""}">★★ ${ui.state.thresholds.two}</span>
        <span class="${visibleScore >= ui.state.thresholds.three ? "is-earned" : ""}">★★★ ${ui.state.thresholds.three}</span>
      </div>
    </header>
  `;
}

function renderGarden(pile, pileIndex, preview) {
  const resolution = ui.harvestPulse?.pileIndex === pileIndex ? ui.harvestPulse : null;
  const feedback = ui.harvestPulse?.feedback;
  const displayPile = resolution?.cards ?? pile;
  const boardConnection = feedback?.connectionEvents.find((event) => event.pileIndex === pileIndex) ?? null;
  const isPulse = Boolean(resolution);
  const isLanding = ui.landingPulse?.pileIndex === pileIndex;
  const label = t("garden.title", { label: hourlyGardenLabel(pileIndex) });
  const placementPreview = previewLabel(preview);
  const slots = Array.from({ length: 4 }, (_, index) => {
    const card = displayPile[index];
    const isLandingCard = isLanding && ui.landingPulse?.cardId === card?.id;
    const addition = resolution?.feedback?.additions[index] ?? null;
    const connection = !resolution && index === pile.length - 1 ? boardConnection : null;
    return card
      ? `<span class="garden-card ${isLandingCard ? "is-landing-card" : ""} ${resolution ? "is-harvest-ghost" : ""} ${connection ? "has-board-multiplier" : ""}" style="--slot:${index}">${cardMarkup(card)}${addition ? `<span class="harvest-addition" style="--effect-delay:${addition.delayMs}ms" aria-hidden="true">+${addition.digit}</span>` : ""}${connection ? `<span class="board-chain-multiplier ${connection.winner ? "is-winner" : ""}" style="--effect-delay:${connection.delayMs}ms" aria-hidden="true">×${connection.multiplier}</span>` : ""}</span>`
      : `<span class="garden-slot" aria-hidden="true">${index + 1}</span>`;
  }).join("");
  const centerMultiplier = resolution?.feedback?.comboType
    ? `<span class="pile-chain-multiplier is-type ${resolution.feedback.comboType.winner ? "is-winner" : ""}" style="--effect-delay:${resolution.feedback.comboType.delayMs}ms" aria-hidden="true">${escapeHtml(t("harvest.sameType"))}</span>`
    : resolution?.feedback?.cardChain
      ? `<span class="pile-chain-multiplier ${resolution.feedback.cardChain.winner ? "is-winner" : ""}" style="--effect-delay:${resolution.feedback.cardChain.delayMs}ms" aria-hidden="true">×${resolution.feedback.cardChain.multiplier}</span>`
      : "";
  const accessibleLabel = resolution
    ? t("harvest.aria", { sum: resolution.chainSum, multiplier: resolution.multiplier, points: resolution.points })
    : `${label}${placementPreview ? `, ${placementPreview}` : ""}`;
  return `
    <button class="garden ${preview ? "is-target" : ""} ${boardConnection ? "is-score-connected" : ""} ${isPulse ? "is-harvesting is-resolving" : ""} ${isLanding ? "is-landing" : ""}" type="button" data-action="place-card" data-pile-index="${pileIndex}" aria-label="${escapeHtml(accessibleLabel)}" style="--final-delay:${feedback?.final?.delayMs ?? 0}ms" ${ui.state.phase !== "play" || interactionLocked() ? "disabled" : ""}>
      <span class="garden-head"><strong>${escapeHtml(label)}</strong><small>${resolution ? 4 : pile.length}/4</small></span>
      <span class="garden-slots">${slots}${centerMultiplier}</span>
      <span class="garden-preview">${escapeHtml(previewLabel(preview)) || "\u00a0"}</span>
    </button>
  `;
}

function renderHarvestBurst() {
  if (!ui.harvestPulse) return "";
  const pileIndex = ui.harvestPulse.pileIndex;
  const x = pileIndex % 2 === 0 ? 25 : 75;
  const y = pileIndex < 2 ? 25 : 75;
  const feedback = ui.harvestPulse.feedback;
  const style = `--burst-x:${x}%;--burst-y:${y}%;--effect-delay:${feedback.final.delayMs}ms;--effect-duration:${feedback.final.durationMs}ms;`;
  return `
    <span class="harvest-success-ring" style="${style}" aria-hidden="true"></span>
    <span class="harvest-success-sparks" style="${style}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="harvest-flying-score" style="${style}" aria-hidden="true"><strong>+${feedback.final.points}</strong></span>
    <span class="sr-only" role="status">${escapeHtml(t("harvest.aria", { sum: ui.harvestPulse.chainSum, multiplier: feedback.final.multiplier, points: feedback.final.points }))}</span>
  `;
}

function renderBoard() {
  const previews = selectedPreviews();
  return `
    <section class="board-section" aria-label="${escapeHtml(t("garden.region"))}">
      <div class="garden-grid">
        ${ui.state.piles.map((pile, index) => renderGarden(pile, index, previews[index])).join("")}
        ${renderHarvestBurst()}
      </div>
      <p class="rule-line">${escapeHtml(t("garden.rule"))}</p>
    </section>
  `;
}

function renderHandCard(card, index) {
  const dealIndex = ui.deal?.cardIds.indexOf(card.id) ?? -1;
  const isDeal = dealIndex >= 0;
  const isSnapSource = ui.motion?.handIndex === index;
  const dealX = Math.round((dealIndex - 2) * -16);
  const dealDelay = Math.max(0, ui.deal?.delayMs ?? 0) + Math.max(0, dealIndex) * DEAL_STAGGER_MS;
  return `
    <button class="hand-card ${ui.selectedHandIndex === index ? "is-selected" : ""} ${ui.carry?.handIndex === index ? "is-carry-source" : ""} ${ui.rejectedHandIndex === index ? "is-rejected" : ""} ${isDeal ? "is-dealt" : ""} ${isSnapSource ? "is-snap-source" : ""}" type="button" data-action="select-card" data-hand-index="${index}" aria-pressed="${ui.selectedHandIndex === index}" aria-label="${escapeHtml(t("hand.cardAria", { type: comboTypeDisplayName(card), species: cardDisplayName(card), digit: card.digit, index: index + 1 }))}" style="--deal-delay:${dealDelay}ms;--deal-x:${dealX}px" ${ui.state.phase !== "play" || interactionLocked() ? "disabled" : ""}>
      ${cardMarkup(card)}
    </button>
  `;
}

function renderHand() {
  const remaining = ui.state.deck.length + ui.state.hand.length;
  const canRedraw = canRedrawHourlyHand(ui.state) && !interactionLocked();
  return `
    <section class="hand-section" aria-label="${escapeHtml(t("hand.region"))}">
      <div class="hand-head"><div><strong>${escapeHtml(t("hand.title"))}</strong><span>${escapeHtml(t("hand.instruction"))}</span></div><button class="remaining-toggle" type="button" data-action="open-remaining" aria-haspopup="dialog"><span>${escapeHtml(t("hand.remaining"))}</span><strong>${remaining}</strong><small>/40</small></button></div>
      <div class="hand-row">
        ${ui.state.hand.map(renderHandCard).join("")}
      </div>
      <div class="run-actions">
        <button class="redraw-action" type="button" data-action="redraw" ${canRedraw ? "" : "disabled"}><span>${escapeHtml(t("hand.redraw"))}</span><strong>${ui.state.redrawsLeft}</strong><small>/${HOURLY_REDRAW_LIMIT}</small></button>
        <span class="cards-used">${escapeHtml(t("hand.used", { count: ui.state.cardsPlayed }))}</span>
      </div>
    </section>
  `;
}

function renderRemainingCards() {
  if (!ui.remainingOpen) return "";
  const remaining = ui.state.deck.length + ui.state.hand.length;
  const cards = hourlyDeckOverview(ui.state, ui.cardListSort);
  const items = cards.map((card) => `
    <li class="remaining-card ${card.used ? "is-used" : ""}" aria-label="${escapeHtml(t(card.used ? "deck.cardUsed" : "deck.cardRemaining", { name: cardDisplayName(card), digit: card.digit, type: comboTypeDisplayName(card) }))}">
      ${cardMarkup(card)}
    </li>
  `).join("");
  return `
    <div class="overlay" data-action="close-remaining">
      <section class="dialog remaining-dialog" role="dialog" aria-modal="true" aria-labelledby="remaining-title">
        <header>
          <div><h2 id="remaining-title">${escapeHtml(t("hand.remaining"))}</h2><span>${remaining}/40</span></div>
          <button type="button" data-action="close-remaining" aria-label="${escapeHtml(t("deck.close"))}">×</button>
        </header>
        <div class="remaining-toolbar">
          <div class="sort-control" role="group" aria-label="${escapeHtml(t("deck.sortLabel"))}">
            <button type="button" data-action="sort-remaining" data-sort-mode="digit" aria-pressed="${ui.cardListSort === "digit"}">${escapeHtml(t("deck.sortDigit"))}</button>
            <button type="button" data-action="sort-remaining" data-sort-mode="type" aria-pressed="${ui.cardListSort === "type"}">${escapeHtml(t("deck.sortType"))}</button>
          </div>
          <span class="used-legend"><i aria-hidden="true"></i>${escapeHtml(t("deck.usedLegend"))}</span>
        </div>
        <ol class="remaining-grid" aria-label="${escapeHtml(t("deck.listAria"))}">${items}</ol>
      </section>
    </div>
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
  const languageOptions = SUPPORTED_LANGUAGES.map((language) => `
    <label class="language-option">
      <input type="radio" name="game-language" value="${language}" data-action="set-language" ${ui.language === language ? "checked" : ""} />
      <span>${escapeHtml(t(`language.${language}`))}</span>
    </label>
  `).join("");
  return `
    <div class="overlay" data-action="close-help">
      <section class="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header><h2 id="help-title">${escapeHtml(t("help.title"))}</h2><button type="button" data-action="close-help" aria-label="${escapeHtml(t("help.close"))}">×</button></header>
        <ol>
          <li>${escapeHtml(t("help.rule1"))}</li>
          <li>${escapeHtml(t("help.rule2"))}</li>
          <li>${escapeHtml(t("help.rule3"))}</li>
          <li>${escapeHtml(t("help.rule4"))}</li>
          <li>${escapeHtml(t("help.rule5"))}</li>
          <li>${escapeHtml(t("help.rule6"))}</li>
        </ol>
        <p><strong>${escapeHtml(t("help.exampleLabel"))}</strong> ${escapeHtml(t("help.example"))}</p>
        <fieldset class="language-setting">
          <legend>${escapeHtml(t("help.language"))}</legend>
          <div>${languageOptions}</div>
        </fieldset>
        <label class="sound-setting"><span>${escapeHtml(t("help.sound"))}</span><input type="checkbox" data-action="toggle-sound" ${ui.sfxEnabled ? "checked" : ""} /><i aria-hidden="true"></i></label>
        <div class="help-actions">
          ${ui.firstVisitHelp ? "" : `<button type="button" data-action="retry">${escapeHtml(t("help.retry"))}</button>`}
          <button class="primary-action" type="button" data-action="close-help">${escapeHtml(t("help.continue"))}</button>
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
        <h2 id="result-title">${starsText(ui.state.stars)}</h2>
        <strong class="result-score">${escapeHtml(t("result.points", { score: ui.state.score }))}</strong>
        <p>${escapeHtml(t("result.best", { score: best.score }))}</p>
        <div class="result-actions">
          <button type="button" data-action="share">${escapeHtml(t("share.button"))}</button>
          <button type="button" data-action="help">${escapeHtml(t("help.open"))}</button>
          ${ui.pendingSeed ? `<button type="button" data-action="confirm-ready">${escapeHtml(t("result.startNew"))}</button>` : ""}
        </div>
      </section>
    </div>
  `;
}

function renderNewGameConfirm() {
  if (!ui.newGameConfirmOpen || !ui.pendingSeed) return "";
  return `
    <div class="overlay" data-action="cancel-ready">
      <section class="dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-confirm-title">
        <h2 id="new-game-confirm-title">${escapeHtml(t("newGame.confirmTitle"))}</h2>
        <p>${escapeHtml(t("newGame.confirmBody", { seed: seedLabel(ui.pendingSeed) }))}</p>
        <div>
          <button type="button" data-action="cancel-ready">${escapeHtml(t("newGame.cancel"))}</button>
          <button class="primary-action" type="button" data-action="start-ready">${escapeHtml(t("newGame.confirm"))}</button>
        </div>
      </section>
    </div>
  `;
}

function renderToast() {
  return ui.toast ? `<div class="toast" role="status">${escapeHtml(ui.toast.message)}</div>` : "";
}

function applyDocumentLanguage() {
  document.documentElement.lang = ui.language;
  document.title = t("document.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("document.description"));
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", t("document.title"));
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", t("document.description"));
  document.querySelector('meta[property="og:image:alt"]')?.setAttribute("content", t("document.thumbnailAlt"));
  document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", t("document.title"));
  document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", t("document.description"));
  document.querySelector('meta[name="twitter:image:alt"]')?.setAttribute("content", t("document.thumbnailAlt"));
}

function loadingMarkup() {
  return `<main class="hourly-loading" aria-busy="true" aria-live="polite"><strong>${escapeHtml(t("loading.title"))}</strong><span>${escapeHtml(t("loading.detail"))}</span></main>`;
}

function render() {
  if (ui.loading || !ui.state) return;
  const stop = perfMonitor.start("render", { seed: ui.state.seed, phase: ui.state.phase });
  applyDocumentLanguage();
  app.innerHTML = `
    <main class="hourly-shell ${viewClass()} ${ui.deal ? "is-dealing" : ""}">
      ${renderHeader()}
      ${renderBoard()}
      ${renderHand()}
      ${renderRemainingCards()}
      ${renderResult()}
      ${renderHelp()}
      ${renderNewGameConfirm()}
      ${renderToast()}
      ${renderMotion()}
    </main>
  `;
  document.body.dataset.mode = "hourly";
  document.body.dataset.language = ui.language;
  document.body.dataset.audioMode = audioSupportMode();
  document.body.dataset.audioFallback = typeof window.Audio === "function" ? "html-audio" : "unavailable";
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
  clearPointerCarry();
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
    showToast(t("toast.cannotPlace"));
    return;
  }
  ui.landingPulse = { pileIndex, cardId: result.card.id };
  const standardFeedback = result.harvest ? createHourlyHarvestFeedback(result.harvest) : null;
  const visualFeedback = result.harvest
    ? createHourlyHarvestFeedback(result.harvest, { reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches })
    : null;
  playSfx(result.harvest ? "harvest" : "place", { feedback: standardFeedback });
  startDealMotion(result.drawnCard ? [result.drawnCard] : [], { delayMs: DEAL_AFTER_PLAY_DELAY_MS });
  window.setTimeout(() => {
    if (ui.landingPulse?.cardId !== result.card.id) return;
    ui.landingPulse = null;
    document.querySelector(`[data-pile-index="${pileIndex}"]`)?.classList.remove("is-landing");
    document.querySelector(`[data-pile-index="${pileIndex}"] .garden-card.is-landing-card`)?.classList.remove("is-landing-card");
  }, LANDING_MS);
  if (result.harvest) {
    const harvestId = `${Date.now()}_${result.card.id}`;
    ui.harvestPulse = { ...result.harvest, feedback: visualFeedback, id: harvestId };
    window.setTimeout(() => {
      if (ui.harvestPulse?.id !== harvestId) return;
      ui.harvestPulse = null;
      render();
    }, visualFeedback.durationMs);
  }
  if (ui.state.phase === "result") {
    recordResult();
    if (result.harvest) {
      const completedAt = ui.state.completedAt;
      window.setTimeout(() => {
        if (ui.state.phase !== "result" || ui.state.completedAt !== completedAt) return;
        ui.resultOpen = true;
        render();
      }, visualFeedback.durationMs);
    } else {
      ui.resultOpen = true;
    }
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

function placeSelectedCard(pileIndex) {
  if (ui.selectedHandIndex == null) return;
  const handIndex = ui.selectedHandIndex;
  const source = rectSnapshot(ui.carry?.ghost?.getBoundingClientRect());
  clearPointerCarry();
  placeCard(handIndex, pileIndex, source);
}

function startDealMotion(cards, options = {}) {
  const cardIds = cards.map((card) => card.id);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  ui.pendingDealSound = options.sound === false && cardIds.length > 0;
  if (!cardIds.length || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (options.sound !== false && cardIds.length) playSfx("deal", { count: cardIds.length });
    ui.deal = null;
    ui.pendingDealSound = false;
    return;
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  ui.deal = { id, cardIds, delayMs };
  if (options.sound !== false) {
    if (delayMs > 0) {
      window.setTimeout(() => {
        if (ui.deal?.id === id) playSfx("deal", { count: cardIds.length });
      }, delayMs);
    } else {
      playSfx("deal", { count: cardIds.length });
    }
  }
  const duration = delayMs + DEAL_CARD_MS + Math.max(0, cardIds.length - 1) * DEAL_STAGGER_MS;
  window.setTimeout(() => {
    if (ui.deal?.id !== id) return;
    ui.deal = null;
    ui.pendingDealSound = false;
    // Re-rendering here would recreate every delayed harvest label and restart its timeline.
    if (!ui.harvestPulse) render();
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
    showToast(t("toast.redrawUnavailable"));
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
  ui.remainingOpen = false;
  ui.newGameConfirmOpen = false;
  ui.selectedHandIndex = null;
  ui.motion = null;
  ui.deal = null;
  ui.state = newHourlyRun(ui.state.seed);
  saveRun();
  startDealMotion(ui.state.hand);
  render();
}

function startSeed(seed) {
  ui.resultOpen = false;
  ui.helpOpen = false;
  ui.remainingOpen = false;
  ui.newGameConfirmOpen = false;
  ui.selectedHandIndex = null;
  ui.motion = null;
  ui.deal = null;
  ui.state = newHourlyRun(seed);
  ui.pendingSeed = "";
  saveRun();
  startDealMotion(ui.state.hand);
  render();
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
  const url = hourlyRootUrl(location.origin, location.pathname);
  const text = hourlyResultShareText(ui.state, url, ui.language);
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
    showToast(t("toast.copied"));
  } catch {
    showToast(t("toast.copyFailed"));
  }
}

function beginDrag(event, cardButton) {
  if (event.button !== 0 || ui.drag || interactionLocked() || ui.state.phase !== "play") return;
  clearPointerCarry();
  const stop = perfMonitor.start("drag.start", { pointerType: event.pointerType || "mouse" });
  const handIndex = Number(cardButton.dataset.handIndex);
  const rect = cardButton.getBoundingClientRect();
  const previousSelectedHandIndex = ui.selectedHandIndex;
  ui.selectedHandIndex = handIndex;
  ui.drag = {
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    handIndex,
    previousSelectedHandIndex,
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

function ensureDragGhost(session, extraClass = "") {
  if (session.ghost) return;
  const source = document.querySelector(`[data-hand-index="${session.handIndex}"]`);
  const ghost = source?.cloneNode(true);
  if (!ghost) return;
  source.classList.add("is-drag-source");
  ghost.className = `drag-ghost ${extraClass}`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.tabIndex = -1;
  ghost.style.setProperty("--drag-width", `${Math.round(session.sourceRect.width)}px`);
  document.body.append(ghost);
  session.ghost = ghost;
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
    document.body.classList.add("is-card-dragging");
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
  document.querySelector(`[data-hand-index="${drag.handIndex}"]`)?.classList.remove("is-drag-source");
  clearDragTarget();
  if (drag.pointerId != null && app.hasPointerCapture?.(drag.pointerId)) {
    app.releasePointerCapture?.(drag.pointerId);
  }
}

function hasFineHoverPointer() {
  return matchMedia("(hover: hover) and (pointer: fine)").matches;
}

let handPointerFrame = null;
let handPointerSample = null;

function applySharedHandPointerFrame() {
  handPointerFrame = null;
  const sample = handPointerSample;
  handPointerSample = null;
  if (!sample) return;
  const cardEffects = [...app.querySelectorAll(".hand-card[data-hand-index]")].map((card) => ({
    card,
    effect: handCardPointerEffect(
      sample.clientX,
      sample.clientY,
      card.getBoundingClientRect(),
      CARD_HOLO_MAX_TILT,
    ),
  }));
  cardEffects.forEach(({ card, effect }) => {
    if (card.classList.contains("is-selected")) {
      card.style.removeProperty("--holo-x");
      card.style.removeProperty("--holo-y");
      card.style.removeProperty("--holo-tilt-x");
      card.style.removeProperty("--holo-tilt-y");
      return;
    }
    card.style.setProperty("--holo-x", `${effect.shineX}%`);
    card.style.setProperty("--holo-y", `${effect.shineY}%`);
    card.style.setProperty("--holo-tilt-x", `${effect.tiltX}deg`);
    card.style.setProperty("--holo-tilt-y", `${effect.tiltY}deg`);
  });
}

function updateSharedHandPointer(event) {
  if (event.pointerType === "touch" || ui.drag || ui.carry) return;
  handPointerSample = { clientX: event.clientX, clientY: event.clientY };
  if (handPointerFrame == null) handPointerFrame = window.requestAnimationFrame(applySharedHandPointerFrame);
}

function updatePointerCarryFrame() {
  const carry = ui.carry;
  if (!carry) return;
  carry.frameId = null;
  perfMonitor.measure("drag.move", () => {
    const position = dragGhostPosition(carry.x, carry.y, carry.offsetX, carry.offsetY);
    carry.ghost?.style.setProperty("--drag-x", `${position.x}px`);
    carry.ghost?.style.setProperty("--drag-y", `${position.y}px`);
    updateDragTarget(carry, gardenFromPoint(carry.x, carry.y));
  }, { handIndex: carry.handIndex, pointerType: carry.pointerType, mode: "click-carry" });
}

function movePointerCarry(event) {
  const carry = ui.carry;
  if (!carry || event.pointerType === "touch") return;
  carry.x = event.clientX;
  carry.y = event.clientY;
  if (carry.frameId == null) carry.frameId = window.requestAnimationFrame(updatePointerCarryFrame);
}

function clearPointerCarry() {
  const carry = ui.carry;
  if (!carry) return;
  ui.carry = null;
  document.body.classList.remove("is-card-carrying");
  if (carry.frameId != null) window.cancelAnimationFrame(carry.frameId);
  window.removeEventListener("pointermove", movePointerCarry);
  carry.ghost?.remove();
  document.querySelector(`[data-hand-index="${carry.handIndex}"]`)?.classList.remove("is-drag-source", "is-carry-source");
  clearDragTarget();
}

function cancelPointerCarry(renderView = true) {
  if (!ui.carry) return;
  clearPointerCarry();
  ui.selectedHandIndex = null;
  if (renderView) render();
}

function startPointerCarry(drag, event) {
  ui.carry = {
    handIndex: drag.handIndex,
    pointerType: drag.pointerType,
    sourceRect: drag.sourceRect,
    x: event.clientX,
    y: event.clientY,
    offsetX: drag.offsetX,
    offsetY: drag.offsetY,
    ghost: null,
    overPileIndex: null,
    frameId: null,
  };
  document.body.classList.add("is-card-carrying");
  render();
  ensureDragGhost(ui.carry, "is-click-carry");
  window.addEventListener("pointermove", movePointerCarry, { passive: true });
  ui.carry.frameId = window.requestAnimationFrame(updatePointerCarryFrame);
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
    ui.selectedHandIndex = selectionAfterPointerGesture(drag.previousSelectedHandIndex, drag.handIndex, { canceled: true });
    render();
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
    ui.selectedHandIndex = selectionAfterPointerGesture(drag.previousSelectedHandIndex, drag.handIndex, { moved: true });
    rejectDraggedCard(drag.handIndex);
    stop({ canceled: false, placed: false });
    showToast(t("toast.dropOnGarden"));
  }
  else {
    stop({ canceled: false, placed: false });
    ui.selectedHandIndex = selectionAfterPointerGesture(drag.previousSelectedHandIndex, drag.handIndex);
    if (ui.selectedHandIndex === drag.handIndex && canStartPointerCarry(drag.pointerType, hasFineHoverPointer())) {
      startPointerCarry(drag, event);
    } else {
      render();
    }
  }
}

function handleAction(action, button) {
  if (action === "select-card") selectCard(Number(button.dataset.handIndex));
  else if (action === "place-card" && ui.selectedHandIndex != null) placeSelectedCard(Number(button.dataset.pileIndex));
  else if (action === "redraw") redrawCurrentHand();
  else if (action === "open-remaining") { ui.remainingOpen = true; render(); }
  else if (action === "close-remaining") { ui.remainingOpen = false; render(); }
  else if (action === "sort-remaining") {
    ui.cardListSort = button.dataset.sortMode === "type" ? "type" : "digit";
    render();
  }
  else if (action === "retry") retryCurrent();
  else if (action === "confirm-ready" && ui.pendingSeed) { ui.newGameConfirmOpen = true; render(); }
  else if (action === "cancel-ready") { ui.newGameConfirmOpen = false; render(); }
  else if (action === "start-ready") startSeed(ui.pendingSeed || kstHourSeed());
  else if (action === "help") { ui.firstVisitHelp = false; ui.helpOpen = true; render(); }
  else if (action === "close-help") closeHelp();
  else if (action === "set-language") setLanguage(button.value);
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
  if (!button || button.disabled) {
    cancelPointerCarry();
    return;
  }
  if (button.classList.contains("overlay") && event.target !== button) return;
  if (ui.carry && !["place-card", "select-card"].includes(button.dataset.action)) {
    cancelPointerCarry();
  }
  handleAction(button.dataset.action, button);
});

app.addEventListener("click", unlockAudioContext, true);

app.addEventListener("pointerdown", (event) => {
  unlockAudioContext();
  playPendingDealSound();
  const card = event.target.closest(".hand-card[data-hand-index]");
  if (card) beginDrag(event, card);
});

window.addEventListener("pointermove", updateSharedHandPointer, { passive: true });

app.addEventListener("lostpointercapture", endDrag);
window.addEventListener("pointerup", unlockAudioContext, true);

app.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = FALLBACK_CARD_IMAGE;
}, true);

window.addEventListener("keydown", (event) => {
  unlockAudioContext();
  playPendingDealSound();
  if (interactionLocked() || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key >= "1" && key <= "5") selectCard(Number(key) - 1);
  else if (["q", "w", "e", "r"].includes(key) && ui.selectedHandIndex != null) {
    placeSelectedCard({ q: 0, w: 1, e: 2, r: 3 }[key]);
  } else if (key === "escape") {
    clearPointerCarry();
    ui.selectedHandIndex = null;
    if (ui.newGameConfirmOpen) { ui.newGameConfirmOpen = false; render(); }
    else if (ui.remainingOpen) { ui.remainingOpen = false; render(); }
    else if (ui.helpOpen) closeHelp();
    else render();
  }
});

window.addEventListener("blur", () => cancelPointerCarry());

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
    applyDocumentLanguage();
    app.innerHTML = loadingMarkup();
    restoreOrCreateRun();
    ui.loading = false;
    ui.firstVisitHelp = !hasSeenHelp();
    ui.helpOpen = ui.firstVisitHelp;
    if (ui.state.cardsPlayed === 0 && ui.state.redrawsUsed === 0) {
      startDealMotion(ui.state.hand, { sound: navigator.userActivation?.hasBeenActive === true });
    }
    render();
    window.setInterval(updateClock, 1000);
  } catch (error) {
    ui.loading = false;
    console.error(error);
    applyDocumentLanguage();
    app.innerHTML = `<main class="hourly-error"><strong>${escapeHtml(t("error.title"))}</strong><button type="button" onclick="location.reload()">${escapeHtml(t("error.reload"))}</button></main>`;
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
