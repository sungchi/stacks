# Garden Stacks Code — 애셋 정리

이 문서는 이 저장소에 정리한 Garden Stacks 런타임 애셋의 위치와 갱신 규칙이다.

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
| `generated/cards/` | 숫자 카드와 Garden Stacks 카드 대표 이미지 |
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

## 6. 현재 복사 범위

- 원본 `assets/generated/garden_stacks`를 이 저장소의 `public/assets/garden-stacks/generated`로 복사했다.
- 원본 `assets/ui`를 이 저장소의 `public/assets/garden-stacks/ui`로 복사했다.

보드/카드 시스템 구현에 직접 필요하지 않은 원본 스크립트, 테스트, 캡처 도구는 문서 레퍼런스로만 남긴다.
