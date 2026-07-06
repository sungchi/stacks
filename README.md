# Garden Stacks Code

`garden-stacks-code`는 Garden Stacks 최신 프로토타입의 게임 시스템과 애셋을 참고해, `malitmot` 방식의 가벼운 정적 웹 앱으로 다시 구현하기 위한 작업 저장소다.

목표는 Garden Stacks의 불필요한 과거 히스토리를 옮기는 것이 아니라, 현재 구현에 필요한 규칙, UI 방향, 검수 기준, 런타임 애셋만 간결하게 정리하는 것이다.

## 기준 레퍼런스

- 게임 시스템/애셋: `/Users/sungchi/Desktop/Projects/textbattle2/prototype/emoji_garden`
- 추가 Garden Stacks 산출물: `/Users/sungchi/Desktop/Projects/textbattle2`
- 구현 방식/UI 운영감: `/Users/sungchi/Desktop/Projects/malitmot`

현재 구현 기준은 `Garden Stacks 4.1 / Four Garden Piles`의 4정원 숫자 솔리테어다. Lua 프로토타입의 구조를 그대로 이식하지 않고, `malitmot`처럼 브라우저에서 바로 실행 가능한 HTML/CSS/ES module 중심으로 옮긴다.

## 문서 인덱스

- [AGENTS.md](AGENTS.md): 작업자 지침, 문서 라우팅, 변경 원칙.
- [docs/requirements.md](docs/requirements.md): 제품/게임/UX/기술 요구사항의 단일 기준.
- [docs/checklist.md](docs/checklist.md): 구현 전후 빠른 검수 체크리스트.
- [docs/assets.md](docs/assets.md): 이 저장소에 정리한 애셋 경로와 사용 규칙.
- [docs/analysis/garden-stacks-ui-proposal-2026-07-04.md](docs/analysis/garden-stacks-ui-proposal-2026-07-04.md): 깔끔하고 직관적인 게임 UI 제안 보고서.
- [docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md](docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md): 무한 정원 고득점 모드 규칙·제한·재미요소 제안서.
- [docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md](docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md): B/W UI 기본 스타일 가이드.
- [docs/mockups/garden-stacks-ui-2026-07-04/bw-index.html](docs/mockups/garden-stacks-ui-2026-07-04/bw-index.html): malitmot식 흑백 UI 기본 목업 모음.
- [docs/mockups/garden-stacks-ui-2026-07-04/index.html](docs/mockups/garden-stacks-ui-2026-07-04/index.html): UI 제안 보고서 기반 정적 HTML 목업 모음.

## 애셋

런타임 애셋은 `public/assets/garden-stacks/` 아래에 정리했다.

- `generated/`: Garden Stacks 카드, 종, 발견 스탬프, 이벤트 배지, 월드맵, 타입 아이콘.
- `ui/`: promoted UI, 스탬프, 효과, 더미 모티프, 카드 패널.

원본의 `tools/`, 드래프트, 레거시 문서, `.DS_Store`, Aseprite 작업 파일은 이 저장소로 옮기지 않는다. 애셋 갱신 규칙은 [docs/assets.md](docs/assets.md)를 따른다.

## 구현 방향

- 첫 화면은 랜딩 페이지가 아니라 실제 게임 화면이어야 한다.
- 정적 웹 앱을 기본으로 한다. `index.html`은 `public/app.bundle.js`를 읽는 오프라인 번들 방식으로 실행된다.
- 게임 규칙은 DOM 코드에서 분리해 순수 JS 모듈로 작성한다.
- 저장은 우선 `localStorage`를 사용한다.
- 모바일 우선으로 만들되, 데스크톱에서는 실제 4정원 보드와 손패가 넓게 읽히게 한다.
- 기본 UI 스타일은 B/W 가이드의 흰 바탕, 검은 선, 회색 보조면, 컬러 게임 애셋 조합을 따른다.
- `simple/index.html`은 전체 게임 시스템과 저장을 공유하되, 플레이 화면을 상태줄·4정원·손패·핵심 액션·메뉴로 줄인 별도 심플 UI다.

## 실행

- `npm run build:offline`: `src/` ES module 소스를 `public/app.bundle.js`와 `simple/simple.bundle.js`로 갱신한다.
- `npm test`: 숫자 솔리테어 순수 규칙 테스트를 실행한다.
- `npm run serve`: `http://127.0.0.1:4173/`에서 로컬 확인 서버를 연다.
- 심플 UI는 서버 실행 후 `http://127.0.0.1:4173/simple/`에서 연다.
- `npm run open`: `index.html`을 연다.

소스 파일을 수정한 뒤에는 `npm run build:offline`을 다시 실행한다.
