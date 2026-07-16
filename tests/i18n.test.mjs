import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
  detectLanguage,
  normalizeLanguage,
  translateCardName,
  translateText,
} from "../src/i18n.js";
import {
  HOURLY_COMBO_TYPES,
  HOURLY_SPECIES_POOL,
  hourlyResultShareText,
} from "../src/game/hourly-harvest.js";

test("Korean, English, and Japanese expose the same UI translation keys", () => {
  const expected = Object.keys(TRANSLATIONS.ko).sort();
  assert.deepEqual(SUPPORTED_LANGUAGES, ["ko", "en", "ja"]);
  for (const language of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(TRANSLATIONS[language]).sort(), expected);
    assert.ok(expected.every((key) => TRANSLATIONS[language][key].length > 0));
  }
});

test("stored language wins, then browser languages, then Korean fallback", () => {
  assert.equal(detectLanguage({ stored: "ja", languages: ["en-US"] }), "ja");
  assert.equal(detectLanguage({ stored: "fr", languages: ["en-US", "ja-JP"] }), "en");
  assert.equal(detectLanguage({ languages: ["fr-FR", "ja-JP"] }), "ja");
  assert.equal(detectLanguage({ language: "ko-KR" }), "ko");
  assert.equal(detectLanguage({ languages: ["fr-FR"] }), "ko");
  assert.equal(normalizeLanguage("EN_us"), "en");
  assert.equal(normalizeLanguage("zh-CN"), null);
});

test("text translation interpolates variables and falls back safely", () => {
  assert.equal(translateText("en", "hand.used", { count: 12 }), "12/40 used");
  assert.equal(translateText("ja-JP", "garden.title", { label: "C" }), "ガーデン C");
  assert.equal(translateText("fr", "score.score"), "점수");
  assert.equal(translateText("ko", "result.close"), "결과 닫기");
  assert.equal(translateText("en", "result.close"), "Close results");
  assert.equal(translateText("ja", "result.close"), "結果を閉じる");
});

test("game name remains Stacks in every language", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.equal(translateText(language, "brand.name"), "Stacks");
    assert.equal(translateText(language, "document.title").startsWith("Stacks -"), true);
  }
});

test("help copy describes one harvest path through the clockwise gardens in every language", () => {
  assert.match(translateText("ko", "help.rule3"), /마지막 카드에서 시계방향/);
  assert.match(translateText("en", "help.rule3"), /continue clockwise from the last card/);
  assert.match(translateText("ja", "help.rule3"), /最後のカードから時計回り/);
  for (const language of SUPPORTED_LANGUAGES) {
    assert.match(translateText(language, "help.rule4"), /×7/);
    assert.match(translateText(language, "help.rule4"), /×3/);
    assert.match(translateText(language, "help.example"), /3→4→5→6/);
    assert.match(translateText(language, "help.example"), /×5/);
    assert.match(translateText(language, "harvest.sameType"), /×3/);
  }
});

test("all hourly species candidates have names in all three languages", () => {
  assert.equal(HOURLY_SPECIES_POOL.length, 40);
  for (const { speciesId, cardName } of HOURLY_SPECIES_POOL) {
    assert.equal(translateCardName("ko", `0:${speciesId}`, "missing"), cardName);
    for (const language of SUPPORTED_LANGUAGES) {
      assert.notEqual(translateCardName(language, `0:${speciesId}`, "missing"), "missing");
    }
  }
  for (const { comboTypeId } of HOURLY_COMBO_TYPES) {
    for (const language of SUPPORTED_LANGUAGES) {
      assert.notEqual(translateText(language, `comboType.${comboTypeId}`), `comboType.${comboTypeId}`);
    }
  }
});

test("hourly share text follows the selected language", () => {
  const state = {
    seed: "2026071412",
    stars: 0,
    score: 42,
  };
  assert.equal(
    hourlyResultShareText(state, "https://example.com", "en"),
    "Stacks #2026071412 In progress 42 pts / ★★★ target 600 pts https://example.com",
  );
  assert.equal(
    hourlyResultShareText(state, "https://example.com", "ja"),
    "Stacks #2026071412 挑戦中 42点 / ★★★目標 600点 https://example.com",
  );
});
