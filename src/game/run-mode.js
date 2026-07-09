import {
  newCampaignRun,
  newEndlessRun,
} from "./number-solitaire.js";

export const DEFAULT_PLAY_MODE = "endless";

export function requestedPlayMode(search = "") {
  const params = new URLSearchParams(search);
  const mode = (params.get("mode") ?? params.get("run") ?? params.get("rules") ?? "").toLowerCase();
  if (["endless", "infinite", "auto", "latest"].includes(mode)) return "endless";
  if (["campaign", "stage", "number"].includes(mode)) return "campaign";
  return null;
}

export function initialRunForRequest(saved, profile, mode, opts = {}) {
  const resolvedMode = mode ?? DEFAULT_PLAY_MODE;
  if (resolvedMode === "campaign") {
    return saved && saved.mode !== "endless"
      ? saved
      : newCampaignRun(profile, profile.numberCampaign.lastSelectedStage);
  }
  return saved?.mode === "endless"
    ? saved
    : newEndlessRun(profile, opts);
}
