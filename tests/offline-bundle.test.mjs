import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hourlyBundle = fs.readFileSync(new URL("../simple/simple.bundle.js", import.meta.url), "utf8");
const rootHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const simpleHtml = fs.readFileSync(new URL("../simple/index.html", import.meta.url), "utf8");
const ogImage = fs.readFileSync(new URL("../public/og/stacks-og.png", import.meta.url));

test("hourly offline bundle includes the harvest feedback module", () => {
  assert.match(hourlyBundle, /\/\/ ---- src\/ui\/harvest-feedback\.js ----/);
  assert.match(hourlyBundle, /function createHourlyHarvestFeedback\(/);
});

test("root and simple pages expose the Stacks social thumbnail", () => {
  for (const html of [rootHtml, simpleHtml]) {
    assert.match(html, /property="og:image" content="https:\/\/plan9\.kr\/stacks\/public\/og\/stacks-og\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
  }
  assert.equal(ogImage.readUInt32BE(16), 1200);
  assert.equal(ogImage.readUInt32BE(20), 630);
});

test("root and simple pages load the configured AdSense client asynchronously", () => {
  for (const html of [rootHtml, simpleHtml]) {
    assert.match(html, /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-0368183753784097" crossorigin="anonymous"><\/script>/);
  }
});

test("root boots the hourly game in place while preserving explicit legacy modes", () => {
  assert.doesNotMatch(rootHtml, /location\.replace/);
  assert.match(rootHtml, /\.\/simple\/simple\.bundle\.js/);
  assert.match(rootHtml, /\["endless", "campaign"\]\.includes\(mode\)/);
  assert.match(rootHtml, /\.\/public\/app\.bundle\.js/);
  assert.match(simpleHtml, /<link rel="canonical" href="https:\/\/plan9\.kr\/stacks\/" \/>/);
});

test("hourly header exposes the shared Malitmot Discord community link", () => {
  assert.match(hourlyBundle, /href="https:\/\/discord\.gg\/MA6xyVAkt" target="_blank" rel="noopener"/);
  assert.match(hourlyBundle, /community\.discord/);
});
