const DEFAULT_SAMPLE_LIMIT = 180;
const DEFAULT_SLOW_THRESHOLD_MS = 16.7;

function currentTimeMs() {
  const perf = globalThis.performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function safeDetail(getDetail, root) {
  const base = root
    ? { nodeCount: root.getElementsByTagName("*").length }
    : {};
  if (typeof getDetail !== "function") return base;
  try {
    return { ...base, ...getDetail() };
  } catch {
    return base;
  }
}

export function createPerformanceMonitor(label = "app", opts = {}) {
  const sampleLimit = Math.max(1, opts.sampleLimit ?? DEFAULT_SAMPLE_LIMIT);
  const slowThresholdMs = opts.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;
  const now = opts.now ?? currentTimeMs;
  const metrics = new Map();
  const sampleStore = [];
  let enabled = opts.enabled ?? true;
  let sequence = 0;

  function metricFor(name) {
    if (!metrics.has(name)) {
      metrics.set(name, {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: 0,
        slowCount: 0,
      });
    }
    return metrics.get(name);
  }

  function record(name, durationMs, detail = {}) {
    if (!enabled) return null;
    const ms = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const metric = metricFor(name);
    metric.count += 1;
    metric.totalMs += ms;
    metric.maxMs = Math.max(metric.maxMs, ms);
    metric.lastMs = ms;
    if (ms >= slowThresholdMs) metric.slowCount += 1;

    const sample = {
      id: ++sequence,
      name,
      ms: roundMs(ms),
      at: roundMs(now()),
      detail,
    };
    sampleStore.push(sample);
    if (sampleStore.length > sampleLimit) sampleStore.shift();
    return sample;
  }

  function start(name, detail = {}) {
    const startMs = now();
    let done = false;
    return (extraDetail = {}) => {
      if (done) return null;
      done = true;
      return record(name, now() - startMs, { ...detail, ...extraDetail });
    };
  }

  function measure(name, fn, detail = {}) {
    const stop = start(name, detail);
    try {
      return fn();
    } finally {
      stop();
    }
  }

  async function measureAsync(name, fn, detail = {}) {
    const stop = start(name, detail);
    try {
      return await fn();
    } finally {
      stop();
    }
  }

  function summary() {
    const out = {};
    for (const [name, metric] of metrics.entries()) {
      out[name] = {
        count: metric.count,
        avgMs: roundMs(metric.totalMs / metric.count),
        maxMs: roundMs(metric.maxMs),
        lastMs: roundMs(metric.lastMs),
        totalMs: roundMs(metric.totalMs),
        slowCount: metric.slowCount,
      };
    }
    return {
      label,
      enabled,
      sampleLimit,
      slowThresholdMs,
      sampleCount: sampleStore.length,
      metrics: out,
    };
  }

  function samples(name = null, limit = 20) {
    const size = Math.max(1, Math.min(sampleLimit, Number(limit) || 20));
    const list = name
      ? sampleStore.filter((sample) => sample.name === name)
      : sampleStore;
    return list.slice(-size);
  }

  function reset() {
    metrics.clear();
    sampleStore.length = 0;
    sequence = 0;
  }

  function setEnabled(value = true) {
    enabled = value !== false;
    return enabled;
  }

  return {
    record,
    start,
    measure,
    measureAsync,
    summary,
    samples,
    reset,
    setEnabled,
    isEnabled: () => enabled,
  };
}

export function installPerformanceTools({
  namespace = "gardenStacksPerf",
  monitor,
  render,
  root,
  getDetail,
} = {}) {
  if (!monitor || typeof window === "undefined") return null;

  const api = {
    summary: () => monitor.summary(),
    samples: (name = null, limit = 20) => monitor.samples(name, limit),
    reset: () => {
      monitor.reset();
      return monitor.summary();
    },
    enable: (value = true) => {
      monitor.setEnabled(value);
      return monitor.summary();
    },
    measureRender: (count = 1) => {
      const iterations = Math.max(1, Math.min(120, Number(count) || 1));
      const stop = monitor.start("manual.renderBatch", { iterations });
      for (let index = 0; index < iterations; index += 1) render?.();
      const sample = stop(safeDetail(getDetail, root));
      return { sample, summary: monitor.summary() };
    },
    measureNextFrame: (name = "frame") => {
      if (typeof window.requestAnimationFrame !== "function") return Promise.resolve(null);
      const stop = monitor.start(`manual.${name}`);
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve(stop(safeDetail(getDetail, root)));
          });
        });
      });
    },
  };

  window[namespace] = api;
  globalThis[namespace] = api;
  window.document?.documentElement?.setAttribute("data-perf-tools", namespace);
  return api;
}
