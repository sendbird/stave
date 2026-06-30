# Stave Git Graph — Design Spec

- Date: 2026-06-30
- Workspace: `feat/git-graph` (worktree:1do6u0v)
- Status: Approved for planning

## 1. 배경 / 목표

vscode-git-graph(https://github.com/mhutchie/vscode-git-graph) 확장의 핵심 경험 —
색상 lane으로 그려지는 commit graph 시각화와 그 위에서의 git 인터랙션 — 을 Stave로 가져온다.

Stave 현황:

- Git 실행은 `child_process.spawn`으로 raw git CLI 직접 호출 (`simple-git`/`isomorphic-git` 미사용).
- 백엔드는 Host Service 모델: `electron/host-service/scm-runtime.ts` 가 git 실행,
  `electron/main/ipc/scm.ts` 가 IPC 핸들러(`scm:*`), renderer 는 `window.api.sourceControl.*` 로 호출.
- 이미 존재: status / stage / unstage / discard / commit / diff / history,
  list-branches / fetch / create-branch / checkout / pull / merge / rebase / cherry-pick, PR(`gh`).
- **없음**: commit graph 시각화. History 탭은 최근 15개 커밋의 단순 리스트(점·선만, lane 없음).

### 형태(폼팩터) 결정 — 하이브리드

- 우측 레일 Source Control 패널(`WorkspaceChangesPanel`)은 **commit/staging 중심으로 유지**.
- **에디터 영역에 전용 "Git Graph" 뷰를 신설**하고, 그 위에서 커밋·브랜치 ref full 인터랙션 제공.
- History 탭은 Git Graph 뷰로 진입(또는 컴팩트 그래프로 대체).

이유: git-graph 는 폭이 넓은 테이블형 뷰라 좁은 우측 레일에 부적합. 넓은 에디터 영역이 적합하며,
Stave 에 이미 에디터 탭 + `openDiffInEditor` 패턴이 있어 자연스럽게 통합된다.

## 2. 범위

### 포함 (MVP)

- 풀 commit graph 시각화 (lane 색상, 노드, 머지 곡선, ref/태그 뱃지).
- 커밋 클릭 → 커밋 상세 + 변경 파일 목록 + diff (기존 `getDiff`/`openDiffInEditor` 재사용).
- 커밋 우클릭 액션: checkout · branch 생성 · tag 생성 · cherry-pick · revert · reset(soft/mixed/hard) · 해시 복사.
- 브랜치/ref 우클릭 액션: checkout · rename · delete · merge · rebase · push · (remote) pull.
- 브랜치 필터(현재 / 전체 / 특정), 페이지네이션("더 보기").

### 제외 (후속)

- stash 관리, 다중 repo 선택, 인터랙티브 rebase UI.
- 커밋 graph 내 검색/필터 고급 기능.

## 3. 아키텍처 (3계층, 기존 패턴 준수)

```
[Renderer]  GitGraphView (에디터 탭)  ──┐
            window.api.sourceControl.getGraph(...) / 액션 호출
[Main IPC]  electron/main/ipc/scm.ts   (scm:graph 등 신규 핸들러)
            invokeHostService("scm.graph", ...)
[Host]      electron/host-service/scm-runtime.ts  (git CLI 실행)
```

모든 신규 코드는 이 3계층에 대칭으로 추가한다 (claude-sdk / codex 대칭 규칙처럼 scm 계층 대칭 유지).

## 4. 데이터 계층 — `scm:graph` IPC 신설

기존 `getHistory`(hash/subject/relativeDate 만)로는 그래프를 못 그린다. 신규 IPC 추가:

- git 명령:
  - `git log --all --parents --date-order --pretty=<format>` 로
    `hash`, `parents[]`, `author`, `authorDate`, `subject`, inline `refs` 수집.
  - `git for-each-ref` 로 로컬/원격 브랜치 + 태그 ref 매핑.
  - `git worktree list --porcelain` 로 worktree 표시(기존 `parseGitWorktrees` 재사용).
  - working tree 변경은 "uncommitted changes" 가상 노드로 표현(HEAD 위에).
- 반환 타입(초안):
  ```ts
  interface GraphCommit {
    hash: string;
    parents: string[];
    author: string;
    authorDate: string; // ISO
    subject: string;
    refs: GraphRef[]; // branch / remote / tag / HEAD
  }
  interface GraphResult {
    commits: GraphCommit[];
    head: string | null;
    branches: GraphRef[];
    hasMore: boolean;
  }
  ```
- 페이지네이션: 초기 N개(예: 500) + `hasMore` 기반 "더 보기".
- 브랜치 필터 인자: `{ cwd, limit, skip, scope: "current" | "all" | branchName }`.

## 5. 그래프 렌더링

- **레이아웃 계산기 `buildGraphLayout(commits): GraphLayout`** 를 `src/lib` 에 순수 함수로 추가.
  부모 관계로 lane(열) 배치, lane 색상 할당, 노드 위치, 머지 곡선 edge 를 계산.
- 외부 그래프 라이브러리 미도입(Stave 의 raw-git 기조 + 번들 경량 유지).
- 렌더: 좌측 **SVG 그래프 열**(lane 선 + 노드 + 머지 곡선) + 우측 가상 테이블(subject / ref 뱃지 / author / date).
- 대량 커밋 대응: 가상 스크롤(행 높이 고정).

## 6. 인터랙션

- 커밋 클릭 → 상세 패널(메타데이터 + 변경 파일) → 파일 클릭 시 기존 diff 뷰 연동.
- 커밋 우클릭 메뉴: checkout / create branch here / create tag / cherry-pick / revert / reset(soft·mixed·hard) / copy hash.
- 브랜치 ref 우클릭 메뉴: checkout / rename / delete / merge into current / rebase current onto / push / (remote) pull.
- 모든 변경 동작: 확인 다이얼로그 + 실패 시 에러 표시. `reset --hard`, force push 등 파괴적 동작은 강한 경고 문구.

## 7. 백엔드 작업 분류

- **재사용(기존 scm-runtime/IPC)**: checkout, create-branch, merge, rebase, cherry-pick, fetch, pull, diff, status.
- **신규(핸들러 + runtime 함수 + window-api 타입 + host-service 라우팅 대칭 추가)**:
  - `scm:graph` (데이터)
  - `scm:revert`
  - `scm:reset` (mode: soft|mixed|hard)
  - `scm:create-tag`, `scm:delete-tag`
  - `scm:rename-branch`, `scm:delete-branch`
  - `scm:push` (force 옵션 포함)

## 8. 상태 / 진입점

- 새 에디터 뷰 종류 추가(기존 diff 탭 패턴 따름). 진입점: Source Control 패널 상단 "Open Git Graph" 버튼 + RightRail.
- 그래프 데이터 / 필터 / 선택 커밋 상태는 워크스페이스 스코프 zustand 슬라이스로 `src/store/app.store.ts` 에 추가.

## 9. 테스트 / 검증

- 순수 함수 단위 테스트(TDD): git log 파서, `buildGraphLayout`(lane 배치/색상/머지 곡선 케이스).
- IPC/런타임: 기존 scm 테스트 패턴 준수.
- 작업 후 `bun run typecheck` + 관련 focused test. UI 는 AGENTS.md 테마 가드레일 준수.

## 10. 구현 순서(권장)

1. 데이터: `scm:graph` 파서 + `buildGraphLayout` (+ 단위 테스트).
2. 뷰: 읽기 전용 그래프 + 커밋 상세/diff 연동 + 진입점.
3. 커밋 액션: revert / reset / tag / cherry-pick + 확인 다이얼로그.
4. 브랜치 ref 액션: rename / delete / push / merge / rebase.
5. History 탭 대체 + 진입점 정리.

## 11. 리스크 / 주의

- `git log --all` 대량 저장소 성능 → 페이지네이션 + 가상 스크롤 필수.
- lane 알고리즘 정확도(머지/octopus, 끊긴 부모) → 엣지 케이스 테스트 확보.
- 파괴적 git 동작 → 확인 다이얼로그 + 명확한 경고. worktree 에 attach 된 브랜치 삭제/checkout 방지 가드(`isBranchAttachedElsewhere`).
- Host Service 3계층 대칭 누락 방지.

## 핵심 파일 참조

- `electron/host-service/scm-runtime.ts` — git 실행 런타임
- `electron/main/ipc/scm.ts` — IPC 핸들러
- `src/types/window-api.d.ts` — renderer API 타입
- `src/components/layout/WorkspaceChangesPanel.tsx` — 현 Source Control 패널
- `src/components/layout/EditorPanel.tsx` — 패널 호스트 / SCM 상태
- `src/components/layout/RightRail.tsx`, `src/lib/right-rail-panels.ts` — 패널 토글/정의
- `src/lib/source-control-worktrees.ts` — worktree 파싱
- `src/store/app.store.ts`, `src/store/layout.utils.ts` — 상태
