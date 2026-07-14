export const HARVEST_ADD_STEP_MS = 300;
export const HARVEST_MULTIPLIER_START_MS = 1050;
export const HARVEST_LINK_STEP_MS = 120;
export const HARVEST_FINAL_DELAY_MS = 1400;
export const HARVEST_FEEDBACK_DURATION_MS = 1950;
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
  const cardChainMultiplier = Math.max(1, Math.min(4, safeInt(harvest?.cardChain?.length, 1)));
  const cardChain = cardChainMultiplier > 1 ? {
    multiplier: cardChainMultiplier,
    delayMs: reducedMotion ? 0 : HARVEST_MULTIPLIER_START_MS,
    winner: cardChainMultiplier === multiplier,
  } : null;
  const connectionEvents = Array.from(harvest?.connection?.pileIndices ?? []).slice(1).map((pileIndex, index) => {
    const connectionMultiplier = index + 2;
    return {
      pileIndex: safeInt(pileIndex, -1),
      multiplier: connectionMultiplier,
      delayMs: reducedMotion ? 0 : HARVEST_MULTIPLIER_START_MS + index * HARVEST_LINK_STEP_MS,
      winner: connectionMultiplier === multiplier,
    };
  });
  const species = harvest?.speciesMatch?.matched === true ? {
    multiplier: 5,
    speciesId: String(harvest.speciesMatch.speciesId ?? ""),
    delayMs: reducedMotion ? 0 : HARVEST_MULTIPLIER_START_MS,
    winner: multiplier === 5,
  } : null;

  return {
    reducedMotion,
    additions,
    cardChain,
    connectionEvents,
    species,
    final: {
      multiplier,
      points: Math.max(0, safeInt(harvest?.points)),
      delayMs: reducedMotion ? 0 : HARVEST_FINAL_DELAY_MS,
    },
    durationMs: reducedMotion ? HARVEST_REDUCED_DURATION_MS : HARVEST_FEEDBACK_DURATION_MS,
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
    feedback?.species?.delayMs,
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
    { stage: "final", note: 84, delay: finalDelay, duration: 0.18, gain: 0.19 },
  );
  return tones;
}
