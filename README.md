# Stacks (스택스)

`garden-stacks-code`는 Garden Stacks 최신 프로토타입의 게임 시스템과 애셋을 참고해, `malitmot` 방식의 가벼운 정적 웹 앱으로 다시 구현하기 위한 작업 저장소다.

- 공개 게임: <https://plan9.kr/stacks/>
- GitHub 저장소: <https://github.com/sungchi/stacks>

목표는 Garden Stacks의 불필요한 과거 히스토리를 옮기는 것이 아니라, 현재 구현에 필요한 규칙, UI 방향, 검수 기준, 런타임 애셋만 간결하게 정리하는 것이다.

## 기준 레퍼런스

- 게임 시스템/애셋: `/Users/sungchi/Desktop/Projects/textbattle2/prototype/emoji_garden`
- 추가 Garden Stacks 산출물: `/Users/sungchi/Desktop/Projects/textbattle2`
- 구현 방식/UI 운영감: `/Users/sungchi/Desktop/Projects/malitmot`

현재 기본 게임은 KST 시간 seed마다 같은 40장 덱을 제공하는 `매시간 네 정원 수확`이다. 네 장을 한 정원에 모아 합으로 수확하고, 놓인 순서의 카드 연쇄와 시계방향 정원 연결 중 더 긴 길이를 `×1~×4` 배수로 써 별 목표에 도전한다. 기존 무한 정원과 캠페인은 명시 모드로 보존한다.

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
- 정적 웹 앱을 기본으로 한다. 기본 주소는 `simple/simple.bundle.js` 시간 게임으로 이동하고 명시적 레거시 모드는 `public/app.bundle.js`를 사용한다.
- 게임 규칙은 DOM 코드에서 분리해 순수 JS 모듈로 작성한다.
- 저장은 우선 `localStorage`를 사용한다.
- 모바일 우선으로 만들되, 데스크톱에서는 실제 4정원 보드와 손패가 넓게 읽히게 한다.
- 기본 UI 스타일은 B/W 가이드의 흰 바탕, 검은 선, 회색 보조면, 컬러 게임 애셋 조합을 따른다.
- `simple/index.html`은 시간별 seed, 별 목표, 4정원, 수동 손패 배치, 다시하기, 공유를 제공하는 기본 플레이 UI다.

## 실행

- `npm run build:offline`: `src/` ES module 소스를 `public/app.bundle.js`와 `simple/simple.bundle.js`로 갱신한다.
- `npm run build:current`: 현재 기본 시간 정원만 별도로 빌드한다.
- `npm run build:hourly`: 현재 기본 게임인 시간 정원 `simple/simple.bundle.js`만 갱신한다.
- `npm run build:legacy`: 명시 모드용 `public/app.bundle.js`만 갱신한다.
- `npm test`: 시간 정원과 레거시 숫자 솔리테어의 순수 규칙 테스트를 실행한다.
- `npm run serve`: `http://127.0.0.1:4173/`에서 로컬 확인 서버를 연다.
- 기본 시간 게임은 `http://127.0.0.1:4173/` 또는 `/simple/`에서 연다.
- 레거시 무한 정원은 `/?mode=endless`, 캠페인은 `/?mode=campaign`으로 연다.
- `npm run open`: `index.html`을 연다.

시간 정원 소스만 수정했으면 `npm run build:current` 또는 `npm run build:hourly`, 레거시까지 포함한 전체 검수에서는 `npm run build:offline`을 실행한다.

## GitHub Pages 배포

이 프로젝트는 빌드 산출물을 저장소에 포함하는 정적 웹 앱이므로 GitHub Pages의 `main` 브랜치 루트(`/`)를 직접 배포한다. 루트의 `.nojekyll`은 Jekyll 변환 없이 현재 파일 구조를 그대로 서비스하게 한다. 프로젝트 페이지의 `/stacks/` 하위 경로에서도 `index.html`의 상대 경로와 `simple/index.html`의 `<base href="../">`가 애셋 경로를 유지한다.

최초 저장소와 Pages 생성:

```bash
gh repo create sungchi/stacks --public --source=. --remote=stacks
git push -u stacks main
gh api --method POST repos/sungchi/stacks/pages \
  --input - <<'JSON'
{"source":{"branch":"main","path":"/"}}
JSON
gh api --method PUT repos/sungchi/stacks/pages -F https_enforced=true
```

이후 배포:

```bash
npm test
npm run build:offline
git add <변경한 소스와 생성된 번들>
git commit -m "feat(game): 변경 내용"
git push stacks main
```

푸시 후 GitHub의 `pages-build-deployment`가 완료되면 <https://plan9.kr/stacks/>에 반영된다. 이 계정은 GitHub Pages 기본 도메인 대신 `plan9.kr` 커스텀 도메인을 사용하므로 프로젝트 경로가 `/stacks/` 아래에 붙는다. 상태와 설정은 다음 명령으로 확인한다.

```bash
gh run list --repo sungchi/stacks --workflow pages-build-deployment --limit 5
gh api repos/sungchi/stacks/pages
```
