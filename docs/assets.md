# Stacks (스택스) Code — 애셋 정리

이 문서는 이 저장소에 정리한 Stacks (스택스) 런타임 애셋의 위치와 갱신 규칙이다.

## 1. 기준

원본 기준 경로:

- `/Users/sungchi/Desktop/Projects/textbattle2/prototype/emoji_garden/assets/generated/garden_stacks`
- `/Users/sungchi/Desktop/Projects/textbattle2/prototype/emoji_garden/assets/ui`

이 저장소 경로:

- `public/assets/garden-stacks/generated`
- `public/assets/garden-stacks/ui`

가져오지 않는 것:

- `prototype/emoji_garden/tools/`
- `legacy-reference/`, `promotion/`, 출시 문서
- `.DS_Store`
- Aseprite 작업 파일
- 실험 드래프트와 과거 Lucky Garden 산출물

## 2. 폴더 역할

| 경로 | 역할 |
|---|---|
| `generated/cards/` | 숫자 카드와 Stacks (스택스) 카드 대표 이미지 |
| `generated/species/` | 대표 종 120개 런타임 이미지와 manifest |
| `generated/discovery/` | 발견 스탬프 |
| `generated/events/` | 이벤트 배지 |
| `generated/type_icons/` | 지형/유형 아이콘 시트 |
| `generated/world_map/` | 스테이지 노드, 잠금, 이동수단, 월드맵 |
| `ui/promoted/` | 버튼, 칩, 패널, 도감, 아이콘 등 promoted UI |
| `ui/effects/` | 카드 이동, 콤보, 발견, 보상 효과 |
| `ui/pile_motifs/` | 초지/숲/습지/사막 더미 모티프 |
| `ui/stamps/` | 선택/잠금/완료/신규 상태 스탬프 |
| `ui/cards/` | leafy panel 카드 런타임 PNG |

## 3. 런타임 사용 규칙

- 새 코드에서는 이 저장소의 `public/assets/garden-stacks/` 경로만 참조한다.
- 원본 프로젝트의 절대 경로를 브라우저 런타임에 넣지 않는다.
- manifest가 있는 폴더는 manifest를 우선 기준으로 삼는다.
- 이미지 키와 게임 데이터 키가 다르면 게임 데이터에 `imageId`를 명시한다.
- 누락 이미지가 있을 때는 `generated/cards/card_locked_unknown.png` 또는 중립 UI fallback을 쓴다.
- 픽셀 애셋은 CSS에서 `image-rendering: pixelated`를 적용한다.

## 4. 주요 manifest

- `generated/cards/manifest.json`
- `generated/cards/card_backs_manifest.json`
- `generated/species/manifest.json`
- `generated/discovery/manifest.json`
- `generated/events/manifest.json`
- `generated/type_icons/manifest.json`
- `ui/promoted/manifest.lua`
- `ui/promoted/garden_templates_manifest.lua`
- `ui/promoted/garden_refined_manifest.lua`
- `ui/effects/manifest.lua`
- `ui/pile_motifs/manifest.lua`
- `ui/stamps/manifest.lua`

Lua manifest는 현재 원본 구조를 보존하기 위한 참고 파일이다. 웹 구현에서 필요하면 JSON으로 변환한 별도 빌드 산출물을 추가한다.

## 5. 갱신 절차

1. 원본에서 최신 런타임 폴더를 확인한다.
2. `.DS_Store`, Aseprite 작업 파일, 드래프트를 제외하고 복사한다.
3. `find public/assets/garden-stacks -type f`로 파일 수를 확인한다.
4. manifest가 가리키는 핵심 이미지가 실제로 존재하는지 확인한다.
5. 이 문서의 폴더 역할 또는 주요 manifest 목록이 바뀌면 함께 갱신한다.

## 6. 능동형 정원 도구

무한 정원 4.2의 도구는 새 이미지를 만들지 않고 아래 런타임 카드 일러스트를 재사용한다.

| 도구 | 이미지 ID | 런타임 경로 |
|---|---|---|
| 옮겨심기 | `reward_ecology_kit` | `generated/cards/reward_ecology_kit.png` |
| 접붙이기 | `plan_conservation_work` | `generated/cards/plan_conservation_work.png` |
| 가지치기 | `hand_pruning` | `generated/cards/hand_pruning.png` |

- 세 이미지는 숫자 카드가 아니라 정사각형 도구 슬롯과 도구 보상에서 사용한다.
- 44px, 56px, 72px급 표시에서 `object-fit: contain`, `image-rendering: pixelated`를 유지한다.
- 접붙이기와 가지치기가 혼동되면 접붙이기만 `generated/cards/hand_watering.png`와 비교한 뒤 교체한다.
- 누락 시 `generated/cards/card_locked_unknown.png`를 사용한다.

## 7. 시간 정원 seed 일러스트

기본 시간 정원은 새 파일을 만들지 않고 `generated/cards/`와 `generated/species/`의 기존 이미지 40개를 숫자별 네 변형으로 사용한다. 정확한 목록은 `src/game/hourly-harvest.js`의 `HOURLY_ART_VARIANTS`가 기준이다.

- 변형은 `<시간 seed>:<규칙 버전>:<애셋 버전>:<카드 ID>`로 결정한다.
- 같은 seed의 재시도와 저장 복원은 같은 `variantId`, 카드명, 이미지 경로를 유지한다.
- 한 seed 안에서 같은 숫자의 네 장은 가능한 한 서로 다른 변형을 사용한다.
- 일러스트는 숫자, 점수, 수확, solver 경로에 영향을 주지 않는다.
- 참조 파일이 누락되면 해당 숫자의 대표 카드 이미지 또는 `card_locked_unknown.png`로 대체한다.
- 현재 40개 참조 경로는 자동 검수에서 모두 존재해야 한다.

## 8. 현재 복사 범위

- 원본 `assets/generated/garden_stacks`를 이 저장소의 `public/assets/garden-stacks/generated`로 복사했다.
- 원본 `assets/ui`를 이 저장소의 `public/assets/garden-stacks/ui`로 복사했다.

보드/카드 시스템 구현에 직접 필요하지 않은 원본 스크립트, 테스트, 캡처 도구는 문서 레퍼런스로만 남긴다.
