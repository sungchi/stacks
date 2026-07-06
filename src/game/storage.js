import {
  defaultMetaProfile,
  normalizeMetaProfile,
  restoreState,
  snapshotState,
} from "./number-solitaire.js";

export const PROFILE_KEY = "garden-stacks:number:v1:profile";
export const RUN_KEY = "garden-stacks:number:v1:run";
export const SETTINGS_KEY = "garden-stacks:number:v1:settings";

export function defaultSettings() {
  return {
    animations: true,
    cardGlow: true,
    sfx: true,
    autosave: true,
  };
}

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProfile(storage = globalThis.localStorage) {
  if (!storage) return defaultMetaProfile();
  return normalizeMetaProfile(readJson(storage, PROFILE_KEY) ?? {});
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  if (!storage) return false;
  return writeJson(storage, PROFILE_KEY, normalizeMetaProfile(profile));
}

export function loadRun(storage = globalThis.localStorage) {
  if (!storage) return null;
  return restoreState(readJson(storage, RUN_KEY));
}

export function saveRun(state, storage = globalThis.localStorage) {
  if (!storage || !state) return false;
  return writeJson(storage, RUN_KEY, snapshotState(state));
}

export function clearRun(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(RUN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(storage = globalThis.localStorage) {
  if (!storage) return defaultSettings();
  return { ...defaultSettings(), ...(readJson(storage, SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  if (!storage) return false;
  return writeJson(storage, SETTINGS_KEY, { ...defaultSettings(), ...settings });
}

export function resetAllStorage(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(PROFILE_KEY);
    storage?.removeItem(RUN_KEY);
    storage?.removeItem(SETTINGS_KEY);
    return true;
  } catch {
    return false;
  }
}
