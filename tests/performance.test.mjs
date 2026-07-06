import assert from "node:assert/strict";
import { test } from "node:test";

import { createPerformanceMonitor } from "../src/performance.js";

test("performance monitor records bounded timing samples and summaries", () => {
  let now = 0;
  const monitor = createPerformanceMonitor("test", {
    now: () => now,
    sampleLimit: 2,
    slowThresholdMs: 4,
  });

  const stopRender = monitor.start("render", { phase: "play" });
  now += 5;
  stopRender({ nodeCount: 42 });

  const value = monitor.measure("persist", () => {
    now += 2;
    return "saved";
  });

  assert.equal(value, "saved");
  assert.deepEqual(monitor.samples("render", 1)[0].detail, {
    phase: "play",
    nodeCount: 42,
  });

  const summary = monitor.summary();
  assert.equal(summary.label, "test");
  assert.equal(summary.metrics.render.count, 1);
  assert.equal(summary.metrics.render.avgMs, 5);
  assert.equal(summary.metrics.render.slowCount, 1);
  assert.equal(summary.metrics.persist.avgMs, 2);

  monitor.record("keyboard", 1);
  assert.deepEqual(monitor.samples(null, 5).map((sample) => sample.name), ["persist", "keyboard"]);

  monitor.reset();
  assert.equal(monitor.summary().sampleCount, 0);
  assert.deepEqual(monitor.summary().metrics, {});
});
