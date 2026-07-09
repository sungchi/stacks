import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultMetaProfile,
  newCampaignRun,
  newEndlessRun,
} from "../src/game/number-solitaire.js";
import {
  DEFAULT_PLAY_MODE,
  initialRunForRequest,
  requestedPlayMode,
} from "../src/game/run-mode.js";

test("endless is the default play mode", () => {
  const profile = defaultMetaProfile();
  const savedCampaign = newCampaignRun(profile, 1);
  const state = initialRunForRequest(savedCampaign, profile, requestedPlayMode(""), { seed: 77 });

  assert.equal(DEFAULT_PLAY_MODE, "endless");
  assert.equal(state.mode, "endless");
  assert.equal(state.seed, 77);
  assert.notEqual(state, savedCampaign);
});

test("mode aliases select endless and explicit campaign preserves campaign access", () => {
  const profile = defaultMetaProfile();
  const savedEndless = newEndlessRun(profile, { seed: 33 });
  const savedCampaign = newCampaignRun(profile, 2);

  assert.equal(requestedPlayMode("?mode=latest"), "endless");
  assert.equal(requestedPlayMode("?run=infinite"), "endless");
  assert.equal(requestedPlayMode("?rules=number"), "campaign");
  assert.equal(initialRunForRequest(savedEndless, profile, "endless"), savedEndless);
  assert.equal(initialRunForRequest(savedCampaign, profile, "campaign"), savedCampaign);
  assert.equal(initialRunForRequest(savedEndless, profile, "campaign").mode, "number");
  assert.equal(initialRunForRequest(null, profile, "campaign").mode, "number");
});
