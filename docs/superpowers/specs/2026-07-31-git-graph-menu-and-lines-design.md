# Git Graph — 진입 메뉴 분리 + 라인 지오메트리 개선 Design Spec

- Date: 2026-07-31
- Workspace: `fix/git-graph` (worktree:1qt2x0h)
- Status: Approved for planning
- 선행 스펙: `docs/superpowers/specs/2026-06-30-git-graph-design.md`

## 1. 배경 / 목표

현재 Git Graph는 Source Control 패널(`WorkspaceChangesPanel`) 내부의 "Open Git Graph"
버튼(헤더 + History 탭, 2곳)으로만 진입할 수 있고, 그래프 라인은 edge 전체 수직 구간에
걸친 완만한 장거리 S-커브로 그려져 분기/머지 지점이 읽기 어렵다.

목표 두 가지:

1. **진입점 분리** — Source Control 패널이 아닌 별도 메뉴(RightRail 전용 버튼)에서 열도록 변경.
2. **라인 지오메트리 개선** — vscode-git-graph(mhutchie) 방식처럼 곡선을 1 row 높이 안에
   가두고 나머지는 수직 직선으로 그려, 꺾임 각도가 얕고 길게 늘어지는 라인을 제거.

## 2. 현재 구조의 문제

### 진입점

- `WorkspaceChangesPanel.tsx` 헤더(L901-911)와 History 탭(L1185-1193)의 버튼 →
  `openGitGraph()` 스토어 액션 → `git-graph:${workspaceId}` 에디터 탭.
- Source Control 패널을 열어야만 진입 가능. 별도 메뉴 없음.

### 라인 렌더링 (`GitGraphCanvas.tsx` `buildEdgePath`)

- bezier 제어점이 edge 전체 수직 길이(dy)의 33%/67% 지점에 위치 → 부모가 멀수록
  화면을 가로지르는 장거리 S-커브.

### 레이아웃 (`graph-layout.ts`) — 렌더링만 고치면 드러나는 결함

- **trunk 지그재그**: 첫 번째 부모에 대해 다른 lane의 기존 예약을 adopt하기 때문에,
  feature 커밋이 분기점 부모를 먼저 예약하면 trunk가 오른쪽 lane으로 끌려간다.
- **lane 점유 미추적**: 수렴 edge가 진행 중인 동안 출발 lane이 즉시 해제되어 다른
  커밋이 재사용할 수 있다 → 직선 렌더링 시 라인이 무관한 노드를 관통.
- **`laneCount` 폭 버그**: 점유 lane "개수"만 세서 lane hole이 있으면 실제 최대 lane
  인덱스보다 작게 계산 → 그래프가 커밋 텍스트 영역을 침범.
- **취약한 부모 해석**: `GraphEdge`가 부모 hash를 갖고 있지 않아 렌더러가 emission
  순서로 부모 인덱스를 재구성. `graph-layout.ts`의 `continue` 분기와 어긋나면 desync.

## 3. 설계 — 진입점 (RightRail 전용 버튼)

- `RightRail.tsx`에 Lens/Terminal처럼 **하드코딩 버튼** 추가:
  - 아이콘: lucide `GitGraph`, title "Git Graph", 위치: Lens/Terminal 버튼 그룹.
  - onClick → 기존 `openGitGraph()` 재사용 (스토어/IPC 변경 없음).
- **`RightRailPanelId`에는 추가하지 않는다** — 사이드 오버레이 패널이 아니라 에디터 탭을
  여는 버튼이므로. persisted layout state 마이그레이션 불필요.
- `WorkspaceChangesPanel.tsx`의 "Open Git Graph" 버튼 2곳 제거 (+ 미사용 import 정리).
- `command-palette-registry.ts`에 `view.open-git-graph` ("Open Git Graph") 항목 추가.
  단축키는 부여하지 않는다 (팔레트 검색용).

## 4. 설계 — 레이아웃 알고리즘 (`src/lib/git-graph/graph-layout.ts`)

vscode-git-graph의 line-following 방식으로 재작업. 순수 함수 유지.

- **`GraphEdge`에 `toHash: string` 추가** (`src/lib/git-graph/types.ts`):
  렌더러가 hash로 목적지 노드를 직접 조회. emission 순서 재구성 로직 삭제.
- **첫 번째 부모는 항상 커밋 자신의 lane에 예약**:
  - 기존 "다른 lane의 예약 adopt" 제거. 같은 부모를 여러 lane이 예약할 수 있다.
  - 부모 커밋 row에서는 자신을 예약한 lane 중 **가장 왼쪽 lane**에 안착, 나머지
    lane은 그 row에서 collapse (기존 step 3 유지) → trunk가 lane 0에 안정 유지.
- **비-첫번째 부모(머지 대상)**: 기존 예약 lane이 있으면 그 lane, 없으면 leftmost
  free lane 신규 예약 (현행 유지).
- **edge는 emission 시점의 예약 lane을 `toLane`(= travelLane)으로 기록**하고, 그
  lane은 부모 row까지 점유 유지 → 수직 구간에 다른 노드가 배치될 수 없다.
- **`laneCount` = `maxLaneIndex + 1`** 로 수정 (lane hole 포함 폭 계산).
- 색상 규칙은 현행 유지 (lane 기반 palette index).

## 5. 설계 — 렌더링 (`src/components/git-graph/GitGraphCanvas.tsx`)

`buildEdgePath`를 3-세그먼트 경로로 교체. 곡선은 cubic bezier로 **ROW_HEIGHT(28px)
하나 안에만** 존재한다.

```
① top bend    : fromLane ≠ travelLane 이면, 시작 노드에서 1 row 안에 travelLane으로 꺾임
② vertical    : travelLane을 따라 수직 직선
③ bottom bend : travelLane ≠ 부모의 최종 lane 이면, 마지막 1 row 안에 부모 lane으로 꺾임
```

- 머지 fan-out → 노드 바로 아래에서 꺾임(①). 분기점 수렴 → 부모 노드 바로 위에서
  꺾임(③). fromRow+1 === toRow 인 1-row edge는 단일 bezier.
- `SvgLayer`: `parentIndexForRow` 재구성 로직 삭제, `edge.toHash`로 `nodeByHash` 조회.
- **부모가 로드 범위 밖(off-window)인 edge**: 현행 1-row stub 대신 travelLane을 따라
  캔버스 하단까지 수직선으로 연장 ("Load more"로 이어질 라인임을 표현).
- 미사용 로컬 `svgWidth`(GitGraphCanvas L267) 정리.
- `GitGraphRow`의 spacer는 수정된 `laneCount`를 그대로 사용 (컴포넌트 변경 없음).

## 6. 테스트 / 검증

- `tests/git-graph-layout.test.ts` 보강:
  - trunk 안정성: 분기점에서 trunk 커밋이 lane 0 유지.
  - 머지 fan-out, octopus 머지(부모 3개).
  - lane hole 시 `laneCount = maxLaneIndex + 1`.
  - off-window 부모, edge `toHash` 포함 검증.
- `buildEdgePath` export 후 path 문자열 테스트: straight / top-bend / bottom-bend / 1-row.
- 완료 기준: `bun run typecheck` + `bunx --bun vitest run tests/git-graph-*` 통과,
  실제 앱에서 그래프 육안 확인 (worktree 스코프 준수).

## 7. 비목표 (Non-goals)

- 가상 스크롤(virtualization) 도입 — 별도 과제.
- 그래프 데이터의 Zustand 슬라이스 이전, IPC/데이터 흐름 변경 — 현행 유지.
- 색상 팔레트 변경 — 현행 유지.

## 핵심 파일 참조

- `src/components/layout/RightRail.tsx` — 신규 진입 버튼
- `src/components/layout/WorkspaceChangesPanel.tsx` — 기존 버튼 제거
- `src/components/layout/command-palette-registry.ts` — 팔레트 항목
- `src/lib/git-graph/graph-layout.ts`, `src/lib/git-graph/types.ts` — 레이아웃 재작업
- `src/components/git-graph/GitGraphCanvas.tsx` — 경로 렌더링
- `src/store/app-store-editor-actions.ts` — `openGitGraph()` (변경 없음, 재사용)
- `tests/git-graph-layout.test.ts` — 테스트 보강
