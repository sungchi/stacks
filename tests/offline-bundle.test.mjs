import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hourlyBundle = fs.readFileSync(new URL("../simple/simple.bundle.js", import.meta.url), "utf8");

test("hourly offline bundle includes the harvest feedback module", () => {
  assert.match(hourlyBundle, /\/\/ ---- src\/ui\/harvest-feedback\.js ----/);
  assert.match(hourlyBundle, /function createHourlyHarvestFeedback\(/);
});
