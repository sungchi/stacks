export const ASSET_BASE = "public/assets/garden-stacks";

export const CATEGORIES = {
  terrain: { id: "terrain", label: "지형", short: "땅" },
  flora: { id: "flora", label: "식물", short: "식물" },
  fauna: { id: "fauna", label: "동물", short: "동물" },
  action: { id: "action", label: "관리/도구", short: "관리" },
};

export const CATEGORY_ORDER = ["terrain", "flora", "fauna", "action"];

export const COLORS = {
  green: { id: "green", label: "초록", short: "생장", css: "#4fba55" },
  blue: { id: "blue", label: "파랑", short: "물길", css: "#3e8ed8" },
  yellow: { id: "yellow", label: "노랑", short: "햇빛", css: "#d7a51e" },
  purple: { id: "purple", label: "보라", short: "밤길", css: "#8f63c8" },
};

export const COLOR_ORDER = ["green", "blue", "yellow", "purple"];

export const DIGITS = [
  { digit: 0, name: "영", cardName: "빈 흙", category: "terrain", color: "blue", assetKey: "number_terrain_empty_soil", imageId: "floor_meadow", resetMultiplier: 9, role: "낮은 기본점수, 끊김 뒤 x9 새 흐름 씨앗" },
  { digit: 1, name: "하나", cardName: "새싹", category: "flora", color: "green", assetKey: "number_flora_sprout", imageId: "occupant_clover", resetMultiplier: 8, role: "초지 이웃수 흐름의 시작점, x8 씨앗" },
  { digit: 2, name: "둘", cardName: "꽃망울", category: "flora", color: "green", assetKey: "number_flora_bud", imageId: "occupant_flower", resetMultiplier: 7, role: "낮은 숫자 콤보를 안정화하는 x7 징검" },
  { digit: 3, name: "셋", cardName: "벌", category: "fauna", color: "purple", assetKey: "number_fauna_bee", imageId: "occupant_bee", resetMultiplier: 6, role: "중간 홀짝 흐름과 x6 재시작" },
  { digit: 4, name: "넷", cardName: "물주기", category: "action", color: "yellow", assetKey: "number_action_watering", imageId: "hand_watering", resetMultiplier: 5, role: "4+5 더블 콤보의 절반, x5 씨앗" },
  { digit: 5, name: "다섯", cardName: "숲그늘", category: "terrain", color: "purple", assetKey: "number_terrain_forest_shade", imageId: "floor_forest_shade_walk", resetMultiplier: 4, role: "4+5 더블 콤보의 절반, x4 씨앗" },
  { digit: 6, name: "여섯", cardName: "나비", category: "fauna", color: "purple", assetKey: "number_fauna_butterfly", imageId: "bee_tab", resetMultiplier: 3, role: "숲 홀짝 흐름과 x3 재시작" },
  { digit: 7, name: "일곱", cardName: "가지치기", category: "action", color: "yellow", assetKey: "number_action_pruning", imageId: "hand_pruning", resetMultiplier: 2, role: "2+7 합 9와 높은 기본점수, x2 씨앗" },
  { digit: 8, name: "여덟", cardName: "물가", category: "terrain", color: "blue", assetKey: "number_terrain_waterside", imageId: "floor_wetland", resetMultiplier: 1, role: "1+8 합 9와 높은 기본점수, x1 씨앗" },
  { digit: 9, name: "아홉", cardName: "철새", category: "fauna", color: "blue", assetKey: "number_fauna_migratory_bird", imageId: "bird_tab", resetMultiplier: 0, role: "가장 높은 기본점수지만 끊김 뒤 x0 씨앗" },
];

export const COMBOS = [
  { id: "same", label: "같은수", example: "7 -> 7", role: "같은 숫자를 이어 반복 흐름을 만든다." },
  { id: "neighbor", label: "이웃수", example: "3 -> 4", role: "1 차이 숫자로 초지 흐름을 만든다." },
  { id: "sum9", label: "합 9", example: "2 -> 7", role: "두 숫자의 합이 9인 물가 반사 흐름이다." },
  { id: "parity", label: "홀짝", example: "2 -> 6", role: "같은 홀짝으로 끊김을 줄이는 안전망이다." },
  { id: "double", label: "더블", example: "4 -> 5", role: "이웃수와 합 9를 동시에 만족하는 강한 순간 보정이다." },
];

export const COMBO_LABELS = Object.fromEntries(COMBOS.map((combo) => [combo.id, combo.label]));

export const LANDS = {
  meadow: {
    id: "meadow",
    label: "초지",
    short: "연속",
    preferred: { neighbor: true },
    categoryAffinity: { flora: 0.08, fauna: 0.08, action: 0.04 },
    imageId: "floor_meadow",
    description: "이웃수를 선호한다. 식물/동물 카드는 서식 적합 보너스를 받고, 관리/도구 카드는 약한 관리 보너스를 받는다.",
  },
  forest: {
    id: "forest",
    label: "숲",
    short: "반복",
    preferred: { same: true, parity: true },
    categoryAffinity: { terrain: 0.08, flora: 0.08, action: 0.04 },
    imageId: "floor_forest",
    description: "같은수와 홀짝을 선호한다. 지형/식물 카드는 서식 적합 보너스를 받고, 관리/도구 카드는 약한 관리 보너스를 받는다.",
  },
  wetland: {
    id: "wetland",
    label: "습지",
    short: "합 9",
    preferred: { sum9: true },
    categoryAffinity: { terrain: 0.08, fauna: 0.08, action: 0.04 },
    imageId: "floor_wetland",
    description: "합 9를 선호한다. 지형/동물 카드는 서식 적합 보너스를 받고, 관리/도구 카드는 약한 관리 보너스를 받는다.",
  },
};

export const LAND_ORDER = ["meadow", "forest", "wetland"];

export const CAMPAIGN_STAGES = [
  { index: 1, id: "number_meadow_1", name: "초지 숫자길", activeLand: "meadow", targetReputation: 295, plays: 18, discards: 3, routeKind: "origin" },
  { index: 2, id: "number_forest_2", name: "숲 반복길", activeLand: "forest", targetReputation: 320, plays: 18, discards: 3, routeKind: "car" },
  { index: 3, id: "number_wetland_3", name: "습지 반사길", activeLand: "wetland", targetReputation: 345, plays: 18, discards: 3, routeKind: "car" },
  { index: 4, id: "number_meadow_4", name: "긴 초지길", activeLand: "meadow", targetReputation: 375, plays: 17, discards: 3, routeKind: "plane" },
  { index: 5, id: "number_forest_5", name: "깊은 숲길", activeLand: "forest", targetReputation: 405, plays: 17, discards: 2, routeKind: "car" },
  { index: 6, id: "number_wetland_6", name: "큰 물가길", activeLand: "wetland", targetReputation: 435, plays: 17, discards: 2, routeKind: "plane" },
  { index: 7, id: "number_mixed_7", name: "갈림 정원길", activeLand: "meadow", targetReputation: 470, plays: 16, discards: 2, routeKind: "car" },
  { index: 8, id: "number_final_8", name: "마지막 숫자정원", activeLand: "wetland", targetReputation: 510, plays: 16, discards: 2, routeKind: "plane" },
];

export const META_UPGRADES = {
  extraPlay: { id: "extraPlay", name: "긴 산책로", max: 2, cost: [6, 10], description: "새 런의 내기를 +1 늘립니다." },
  extraDiscard: { id: "extraDiscard", name: "넓은 모종판", max: 2, cost: [5, 9], description: "새 런의 갈아엎기를 +1 늘립니다." },
  targetDiscount: { id: "targetDiscount", name: "동네 소문", max: 2, cost: [7, 12], description: "스테이지 목표 평판을 20 낮춥니다." },
  handSize: { id: "handSize", name: "손수레 확장", max: 1, cost: [12], description: "손패를 1장 늘립니다." },
  starterSprout: { id: "starterSprout", name: "새싹 보관함", max: 1, cost: [4], description: "새 런 시작 덱에 새싹 1을 1장 추가합니다." },
};

export const META_UPGRADE_ORDER = ["extraPlay", "extraDiscard", "targetDiscount", "handSize", "starterSprout"];

export const REWARDS = [
  { id: "discoverDandelionPath", name: "1 카드 추가", kind: "addDigit", digit: 1, imageId: "occupant_clover", short: "새싹 1 +1장", description: "새싹 1 카드 1장을 덱 맨 위에 추가합니다.", codexNote: "초지 가장자리에서 낮은 숫자 흐름을 다시 시작하게 해주는 발견입니다." },
  { id: "discoverCloverStep", name: "2 카드 추가", kind: "addDigit", digit: 2, imageId: "occupant_flower", short: "꽃망울 2 +1장", description: "꽃망울 2 카드 1장을 덱 맨 위에 추가합니다.", codexNote: "초반 손패에서 1-2-3 흐름과 2+7 합 9를 동시에 노리게 합니다." },
  { id: "discoverWaterReflection", name: "합 9 연결 보충", kind: "chooseDigit", digits: [0, 9], imageId: "floor_wetland", short: "0/9 중 필요한 카드", description: "현재 흐름에 맞춰 빈 흙 0 또는 철새 9를 덱 맨 위에 추가합니다.", codexNote: "약한 0을 합 9의 핵심 연결점으로 바꾸는 습지 발견입니다." },
  { id: "discoverTreeRing", name: "같은수 점수 강화", kind: "comboBonus", combo: "same", amount: 0.1, imageId: "tree_tab", short: "같은수 +10%", description: "이번 런 동안 같은수 콤보 점수를 10% 올립니다.", codexNote: "반복되는 숫자가 숲의 나이테처럼 쌓여 같은수 콤보를 강화합니다." },
  { id: "discoverBeeRoute", name: "합 9 점수 강화", kind: "comboBonus", combo: "sum9", amount: 0.1, imageId: "occupant_bee", short: "합 9 +10%", description: "이번 런 동안 합 9 콤보 점수를 10% 올립니다.", codexNote: "먼 숫자끼리 왕복하는 항로를 기록해 합 9 콤보의 보상을 키웁니다." },
  { id: "discoverColorGraft", name: "4색 완성 보정", kind: "colorGraft", imageId: "plan_clover_seed", short: "부족 색으로 변경", description: "덱/손패 카드 1장의 색상 마크를 현재 가장 부족한 색으로 바꿉니다.", codexNote: "4개의 정원 더미 중 색상 세트가 가까운 흐름에 마지막 색을 붙여 4색 완성을 노리게 합니다." },
  { id: "discoverTypeGraft", name: "유형 순서 보정", kind: "typeGraft", imageId: "work_flora_comparison", short: "다음 유형으로 변경", description: "덱/손패 카드 1장의 유형을 현재 흐름의 다음 생태 순서에 맞게 바꿉니다.", codexNote: "지형-식물-동물-관리/도구 루트를 이어가기 쉽도록 카드의 생태 유형을 바꿔 줍니다." },
  { id: "discoverSeedSorting", name: "덱 압축", kind: "removeDigit", imageId: "reward_seed_bank", short: "많은 숫자 1장 제거", description: "덱에서 현재 가장 많은 숫자 카드 1장을 제거합니다.", codexNote: "불필요한 숫자를 덜어 콤보 흐름을 더 자주 만나게 하는 정리 발견입니다." },
];

export function digitCard(digit) {
  return DIGITS.find((item) => item.digit === Number(digit)) ?? null;
}

export function categoryLabel(id) {
  return CATEGORIES[id]?.label ?? "카드";
}

export function categoryShort(id) {
  return CATEGORIES[id]?.short ?? "카드";
}

export function colorLabel(id) {
  return COLORS[id]?.label ?? "무색";
}

export function colorShort(id) {
  return COLORS[id]?.short ?? "기본";
}

export function colorCss(id) {
  return COLORS[id]?.css ?? "#8b918a";
}

export function landLabel(id) {
  return LANDS[id]?.label ?? "초지";
}

export function stageByIndex(index) {
  const normalized = Math.max(1, Math.min(CAMPAIGN_STAGES.length, Math.floor(Number(index) || 1)));
  return CAMPAIGN_STAGES[normalized - 1];
}

export function rewardById(id) {
  return REWARDS.find((reward) => reward.id === id) ?? null;
}

export function cardImagePath(imageId) {
  const key = imageId || "card_locked_unknown";
  return `${ASSET_BASE}/generated/cards/${key}.png`;
}

export function discoveryImagePath(fileName) {
  return `${ASSET_BASE}/generated/discovery/${fileName}`;
}

export function worldMapImagePath(fileName) {
  return `${ASSET_BASE}/generated/world_map/${fileName}`;
}
