# Stacks (스택스) Code — Agent Guide

이 문서는 `garden-stacks-code`에서 작업하는 에이전트와 개발자가 먼저 읽어야 하는 운영 지침이다. 상세 제품 규칙은 이 파일에 계속 추가하지 말고 [docs/requirements.md](docs/requirements.md)를 기준으로 관리한다.

> 작업 기준일: 2026-07-05

## 1. 프로젝트 정체성

이 프로젝트는 Stacks (스택스) 최신 프로토타입을 웹으로 다시 구현하기 위한 정리 저장소다.

한 줄 피치:

**0~9 정원 카드 1장을 골라 4개 정원에 자동 배치하고, 세로·층 숫자 흐름을 수확해 최고 점수를 노리는 모바일 우선 정적 웹 카드 솔리테어.**

참고할 것은 Stacks (스택스)의 최신 게임 감각과 애셋이다. 옛 Lucky Garden, slot, 출시 히스토리, 실험 로그는 구현 기준으로 들고 오지 않는다.

## 2. 문서 인덱스

| 문서 | 역할 | 상태 |
|---|---|---|
| [docs/requirements.md](docs/requirements.md) | 제품 상세 요구사항, 게임 규칙, UI, 저장, 테스트 기준 | 기준 |
| [docs/checklist.md](docs/checklist.md) | 구현·검수 체크리스트 | 파생 |
| [docs/assets.md](docs/assets.md) | 애셋 위치, 사용 규칙, 갱신 절차 | 기준 |
| [docs/requirements/garden-stacks-active-garden-tools-v0.1.md](docs/requirements/garden-stacks-active-garden-tools-v0.1.md) | 무한 정원 능동형 도구 분리 요구사항 | 기준 |
| [docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md](docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md) | 무한 정원 고득점 모드 규칙 제안서 | 제안 |
| [docs/analysis/garden-stacks-auto-chain-combo-proposal-2026-07-08.md](docs/analysis/garden-stacks-auto-chain-combo-proposal-2026-07-08.md) | 자동 배치 연쇄 콤보 모드 규칙 제안서 | 제안 |
| [docs/analysis/garden-stacks-endless-default-mode-analysis-2026-07-10.md](docs/analysis/garden-stacks-endless-default-mode-analysis-2026-07-10.md) | 현재 무한 정원 기본 모드 구현 분석과 개선 우선순위 | 분석 |
| [docs/analysis/garden-stacks-active-tools-balance-2026-07-11.md](docs/analysis/garden-stacks-active-tools-balance-2026-07-11.md) | 능동형 정원 도구 20시드 초기 밸런스 검증 | 분석 |
| [docs/analysis/garden-stacks-unique-card-art-2026-07-12.md](docs/analysis/garden-stacks-unique-card-art-2026-07-12.md) | 40장 카드별 고유 이미지의 재미·위험·단계 도입 분석 | 분석 |
| [docs/analysis/garden-stacks-harvest-solitaire-concept-2026-07-12.md](docs/analysis/garden-stacks-harvest-solitaire-concept-2026-07-12.md) | 윗묶음 이동·공간 압박·매시간 seed 기반 수확 솔리테어 제안 | 제안 |
| [docs/analysis/garden-stacks-ui-proposal-2026-07-04.md](docs/analysis/garden-stacks-ui-proposal-2026-07-04.md) | 깔끔하고 직관적인 게임 UI 제안 보고서 | 제안 |
| [docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md](docs/analysis/garden-stacks-endless-mode-proposal-2026-07-07.md) | 무한 정원 고득점 모드 규칙·제한·재미요소 제안서 | 제안 |
| [docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md](docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md) | B/W UI 기본 스타일 가이드 | 기준 |
| [docs/mockups/garden-stacks-ui-2026-07-04/bw-index.html](docs/mockups/garden-stacks-ui-2026-07-04/bw-index.html) | malitmot식 흑백 UI 기본 목업 모음 | 기준 |
| [docs/mockups/garden-stacks-ui-2026-07-04/index.html](docs/mockups/garden-stacks-ui-2026-07-04/index.html) | UI 제안 보고서 기반 정적 HTML 목업 모음 | 제안 |
| [simple/index.html](simple/index.html) | 전체 시스템을 공유하는 심플 플레이 UI 진입점 | 구현 |
| [AGENTS.md](AGENTS.md) | 작업 지침, 문서 라우팅, 변경 원칙 | 기준 |

새 상세 문서를 추가할 때는 이 인덱스를 함께 갱신한다.

## 3. 단일 진실 규칙

- `AGENTS.md`는 긴 제품 스펙을 담지 않는다.
- 게임 규칙과 UX 요구사항의 현재 기준은 [docs/requirements.md](docs/requirements.md)다.
- 애셋 경로와 갱신 정책은 [docs/assets.md](docs/assets.md)를 따른다.
- 체크리스트는 실행과 검수를 돕는 파생 문서이며, 새로운 제품 규칙의 원본이 되지 않는다.
- 구현만 바꾸고 문서를 갱신하지 않는 작업은 완료로 보지 않는다.
- 문서가 서로 충돌하면 더 구체적인 최신 상세 문서를 우선하되, 같은 작업 안에서 충돌을 정리한다.

## 4. 핵심 가드레일

- 첫 구현 기준은 `Stacks (스택스) 4.1 / Four Garden Piles`의 4정원 숫자 솔리테어다.
- Lua/Love2D 구조를 그대로 복제하지 않는다. `malitmot`처럼 정적 HTML, CSS, ES module, `node --test` 기반으로 구현한다.
- 첫 화면은 실제 게임 또는 저장된 런을 이어갈 수 있는 게임 화면이어야 한다. 마케팅 랜딩 페이지를 만들지 않는다.
- 기본 플레이 진입은 무한 정원이며, 캠페인은 메뉴와 명시적 모드 주소로 접근한다.
- 게임 규칙은 DOM 렌더링과 분리된 순수 함수로 둔다.
- 숫자 카드, 콤보 판정, 보상, 스테이지 종료, 저장/복원은 자동 테스트 대상이다.
- UI는 모바일 우선이다. 데스크톱에서는 같은 플레이 구조를 넓은 4정원 보드와 손패로 보여준다.
- 기본 시각 스타일은 [docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md](docs/mockups/garden-stacks-ui-2026-07-04/bw-style-guide.md)다.
- `simple/` UI는 같은 게임 시스템과 저장 키를 쓰며, 상태줄·4정원·손패·핵심 액션·메뉴만 남긴 간결한 플레이 화면이다.
- 장식 설명 UI보다 실제 카드, 더미, 추천 흐름, 결과 피드백이 먼저 읽혀야 한다.
- 애셋은 `public/assets/garden-stacks/` 아래의 런타임 파일을 우선 사용한다.
- 원본 프로젝트의 `tools/`, 드래프트, 레거시 문서, `.DS_Store`, Aseprite 작업 파일은 필요할 때만 참조하고 이 저장소에 기본 포함하지 않는다.

## 5. 작업 절차

새 작업을 시작할 때:

1. 이 `AGENTS.md`를 읽는다.
2. 관련 상세 요구사항을 [docs/requirements.md](docs/requirements.md)에서 확인한다.
3. 애셋을 다루면 [docs/assets.md](docs/assets.md)를 확인한다.
4. 요구사항이 부족하면 구현 전에 문서를 갱신한다.
5. 변경 범위에 맞는 구현, 테스트, 검수를 수행한다.

코드 구현 시:

- 기존 패턴이 생기면 그 패턴을 따른다.
- 전역 상태를 최소화하고, 규칙 모듈은 입력 상태를 받아 새 결과를 내는 형태로 작성한다.
- 브라우저 전용 API는 UI 계층에만 둔다.
- 저장 키는 버전을 포함해 이후 마이그레이션이 가능하게 한다.
- UI 변경은 360px 모바일 폭과 데스크톱 폭에서 텍스트 겹침을 확인한다.
- `src/` 소스 파일을 수정하면 `npm run build:offline`으로 `public/app.bundle.js`와 `simple/simple.bundle.js`를 갱신한다.

문서 작업 시:

- 요구사항은 입력, 출력, 완료 조건 또는 검증 기준을 포함한다.
- 긴 스펙은 `AGENTS.md`가 아니라 `docs/` 아래에 둔다.
- 중복 설명을 늘리지 말고 문서 링크로 연결한다.
- 새 용어를 만들면 [docs/requirements.md](docs/requirements.md)의 용어 표를 갱신한다.

## 6. 완료 조건

문서 변경 완료 조건:

- 문서 인덱스가 최신이다.
- 상세 요구사항과 작업 지침의 역할이 섞이지 않는다.
- 새 요구사항은 검증 기준을 포함한다.

구현 변경 완료 조건:

- 관련 상세 요구사항이 최신이다.
- 핵심 규칙에 자동 테스트가 있다.
- 모바일 주요 화면에서 텍스트, 카드, 버튼, 더미가 겹치지 않는다.
- 데스크톱에서도 모바일 중심 레이아웃이 과하게 늘어나거나 비어 보이지 않는다.
- `npm test`와 `npm run build:offline`이 성공한다.

## 7. 커밋 규칙

문서 변경:

- `docs(spec): garden stacks 요구사항 정리`
- `docs(assets): 애셋 인벤토리 갱신`
- `docs(guide): 에이전트 지침 정리`

기능 구현:

- `feat(game): 숫자 솔리테어 규칙 추가`
- `feat(ui): 4정원 플레이 화면 구현`
- `test(game): 콤보 판정 테스트 추가`

커밋할 때는 요청된 파일만 명시적으로 스테이지한다. 관련 없는 변경을 함께 커밋하지 않는다.
