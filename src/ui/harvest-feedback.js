import {
  HOURLY_MAX_CHAIN_MULTIPLIER,
  HOURLY_SAME_TYPE_MULTIPLIER,
} from "../game/hourly-harvest.js";

export const HARVEST_ADD_STEP_MS = 300;
export const HARVEST_MULTIPLIER_START_MS = 1050;
export const HARVEST_LINK_STEP_MS = 120;
export const HARVEST_FINAL_DELAY_MS = 1600;
export const HARVEST_FINAL_GAP_MS = 300;
export const HARVEST_FINAL_DISPLAY_MS = 1100;
export const HARVEST_FEEDBACK_DURATION_MS = HARVEST_FINAL_DELAY_MS + HARVEST_FINAL_DISPLAY_MS + 100;
export const HARVEST_REDUCED_DURATION_MS = 450;

const HARVEST_ADDITION_NOTES = Object.freeze([60, 64, 67, 72]);
const HARVEST_MULTIPLIER_NOTES = Object.freeze([74, 77, 81, 84]);

function safeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

export function createHourlyHarvestFeedback(harvest, options = {}) {
  const reducedMotion = options.reducedMotion === true;
  const multiplier = Math.max(1, safeInt(harvest?.multiplier, 1));
  const additions = Array.from(harvest?.cards ?? []).slice(0, 4).map((card, index) => ({
    cardId: String(card?.id ?? ""),
    digit: safeInt(card?.digit),
    delayMs: reducedMotion ? 0 : index * HARVEST_ADD_STEP_MS,
  }));
  const chainMultiplier = Math.max(1, Math.min(
    HOURLY_MAX_CHAIN_MULTIPLIER,
    safeInt(harvest?.chain?.multiplier, 1),
  ));
  const chainPositions = Array.from(harvest?.chain?.positions ?? []).slice(0, chainMultiplier);
  const finalChainIndex = chainPositions.length - 1;
  const lastHarvestPosition = chainPositions.filter((position) => position?.source === "harvest").at(-1);
  const cardChainMultiplier = lastHarvestPosition
    ? Math.max(1, Math.min(HOURLY_MAX_CHAIN_MULTIPLIER, safeInt(lastHarvestPosition.chainIndex, 0) + 1))
    : 1;
  const cardChain = cardChainMultiplier > 1 ? {
    multiplier: cardChainMultiplier,
    delayMs: reducedMotion ? 0 : HARVEST_MULTIPLIER_START_MS,
    winner: lastHarvestPosition.chainIndex === finalChainIndex && chainMultiplier === multiplier,
  } : null;
  const connectionDelayOffset = cardChain ? 1 : 0;
  const connectionEvents = chainPositions.filter((position) => (
    position?.source === "garden" && safeInt(position.chainIndex, 0) > 0
  )).map((position, index) => {
    const connectionMultiplier = Math.max(2, Math.min(
      HOURLY_MAX_CHAIN_MULTIPLIER,
      safeInt(position.chainIndex, 0) + 1,
    ));
    return {
      pileIndex: safeInt(position.pileIndex, -1),
      multiplier: connectionMultiplier,
      delayMs: reducedMotion
        ? 0
        : HARVEST_MULTIPLIER_START_MS + (index + connectionDelayOffset) * HARVEST_LINK_STEP_MS,
      winner: safeInt(position.chainIndex, -1) === finalChainIndex && chainMultiplier === multiplier,
    };
  });
  const comboType = harvest?.typeMatch?.matched === true ? {
    multiplier: HOURLY_SAME_TYPE_MULTIPLIER,
    comboTypeId: String(harvest.typeMatch.comboTypeId ?? ""),
    delayMs: reducedMotion ? 0 : HARVEST_MULTIPLIER_START_MS,
    winner: multiplier === HOURLY_SAME_TYPE_MULTIPLIER,
  } : null;
  const multiplierDelays = [
    cardChain?.delayMs,
    comboType?.delayMs,
    ...connectionEvents.map((event) => event.delayMs),
  ].filter(Number.isFinite);
  const lastMultiplierDelay = multiplierDelays.length
    ? Math.max(...multiplierDelays)
    : HARVEST_MULTIPLIER_START_MS;
  const finalDelayMs = reducedMotion
    ? 0
    : Math.max(HARVEST_FINAL_DELAY_MS, lastMultiplierDelay + HARVEST_FINAL_GAP_MS);
  const finalDurationMs = reducedMotion ? HARVEST_REDUCED_DURATION_MS : HARVEST_FINAL_DISPLAY_MS;

  return {
    reducedMotion,
    additions,
    cardChain,
    connectionEvents,
    comboType,
    final: {
      multiplier,
      points: Math.max(0, safeInt(harvest?.points)),
      delayMs: finalDelayMs,
      durationMs: finalDurationMs,
    },
    durationMs: reducedMotion ? HARVEST_REDUCED_DURATION_MS : finalDelayMs + finalDurationMs + 100,
  };
}

export function createHourlyHarvestTonePlan(feedback) {
  const tones = (feedback?.additions ?? []).map((event, index) => ({
    stage: "addition",
    note: HARVEST_ADDITION_NOTES[index] ?? HARVEST_ADDITION_NOTES.at(-1),
    delay: event.delayMs / 1000,
    duration: 0.085,
    gain: 0.16,
  }));
  const multiplierDelays = new Set([
    feedback?.cardChain?.delayMs,
    feedback?.comboType?.delayMs,
    ...(feedback?.connectionEvents ?? []).map((event) => event.delayMs),
  ].filter(Number.isFinite));
  [...multiplierDelays].sort((a, b) => a - b).forEach((delayMs, index) => {
    tones.push({
      stage: "multiplier",
      note: HARVEST_MULTIPLIER_NOTES[index] ?? HARVEST_MULTIPLIER_NOTES.at(-1),
      delay: delayMs / 1000,
      duration: 0.11,
      gain: 0.17,
    });
  });
  const finalDelay = (feedback?.final?.delayMs ?? HARVEST_FINAL_DELAY_MS) / 1000;
  tones.push(
    { stage: "final-bass", note: 48, delay: finalDelay, duration: 0.16, gain: 0.14 },
    { stage: "final", note: 88, delay: finalDelay, duration: 0.18, gain: 0.19 },
  );
  return tones;
}
