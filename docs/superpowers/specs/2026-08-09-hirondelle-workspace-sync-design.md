<!-- doc-path-check: external-repository -->

# Hirondelle ↔ Stave Workspace Sync — 설계 문서

- 날짜: 2026-08-09
- 상태: Draft (사용자 리뷰 대기)
- 대상 레포: `sendbird/stave` + `sendbird/atelier` (양쪽 계약 포함, 구현 플랜은 레포별로 분리)

## 1. 개요

Stave workspace(git worktree 단위의 로컬 에이전트 작업 공간)를 Atelier의 Hirondelle
project(기능 런칭 단위의 팀 가시적 변경 추적 프로젝트)에 연결하고 양방향으로 동기화한다.

- **풀 (Hirondelle → Stave)**: 프로젝트 요약·일정·제약·gotcha·최근 변경 이벤트를
  워크스페이스로 가져와 에이전트를 그라운딩한다. (Hirondelle 제품 문서의
  "Agents" 시나리오를 구현)
- **푸시 (Stave → Hirondelle)**: Stave에서 일어난 작업(PR 오픈, 태스크 완료,
  리소스 링크, opt-in 턴 요약)을 Hirondelle의 change event / links로 올려
  팀 가시성을 만든다. Hirondelle이 `stave`라는 새 변경 소스를 얻는다.

### 확정된 요구사항 (브레인스토밍 결과)

| 결정 | 선택 |
|---|---|
| 방향 | 양방향 (매핑 + 상호 싱크) |
| 매핑 단위 | Stave workspace N : 1 Hirondelle project, 수동 연결 |
| v1 데이터 흐름 | 풀: 컨텍스트 스냅샷 + 에이전트 on-demand 조회 / 푸시: 작업 이벤트 + 리소스 링크 |
| 푸시 트리거 | lifecycle 훅 자동 + 이벤트 종류별 토글 |
| 인증 | Crane↔Stave 커넥터를 Atelier 공용 커넥터로 일반화 (스코프 확장) |
| 기본 푸시 범위 | factual 이벤트만 기본 on, 턴 요약(interpretive)은 opt-in |
| 아키텍처 | 접근안 A: 전용 sync surface(서버 측 병합) + Stave durable outbox |

### 비목표 (v1에서 제외)

- Hirondelle → Stave 실시간 알림/배지 (stamp 폴링 기반, Phase 2 후보)
- 커넥터 스코프 업그레이드 엔드포인트 (기존 Crane 커넥터 사용자는 재페어링)
- Stave todos ↔ Hirondelle schedule stages 동기화 (의미 불일치, 보류)
- Hirondelle 웹 UI에서 Stave workspace를 조회/제어하는 기능
- 턴 요약 스로틀/배치 (opt-in 기본 off이므로 v1은 턴당 1이벤트 그대로)

## 2. 용어와 매핑 모델

- **Stave workspace**: `worktree:<hash>` id를 가진 git worktree +
  `WorkspaceInformationState` (notes/todos/링크 리소스).
- **Hirondelle project**: `hirondelle_projects` 행 + 5개 섹션(members, links,
  properties, schedule stages, memory entries) + `hirondelle_change_events`
  원장 + `hirondelle_context_documents`.
- **매핑**: N개의 Stave workspace → 1개의 Hirondelle project. 매핑의 소유자는
  **Stave** (Workspace Information에 저장). Hirondelle 쪽에는 매핑 테이블을
  만들지 않고, 이벤트 `metadata_json`에 workspace 이름/브랜치로 출처를 담는다.

## 3. 아키텍처 개요

```
┌─ Stave (Electron) ──────────────────┐          ┌─ Atelier (CF Worker) ────────────┐
│ renderer: Information panel 카드,    │          │ src/stave-connector/ (공용 승격)  │
│   설정 UI, lifecycle 훅               │          │   auth.mjs — stc_ 검증 + scope    │
│      ↓ IPC                          │  HTTPS   │      ↑                            │
│ main: atelier-connector (페어링/볼트) │ ───────→ │ crane: 기존 dispatch 라우트        │
│       hirondelle-sync (outbox 런타임)│ Bearer   │ hirondelle: /api/hirondelle/stave/*│
│ host-service: WI 변경 이벤트 소스     │  stc_    │   → D1 (projects/events/links)    │
└─────────────────────────────────────┘          └──────────────────────────────────┘
```

- 전송은 항상 **Stave 아웃바운드** (데스크톱 앱, 인바운드 불가 — Crane과 동일).
- 계약 버전: `stave-sync-v1`. 양쪽 레포에 동일한 JSON fixture를 복제해 검증
  (Crane의 `stave-dispatch-v1` fixture 방식과 동일).

## 4. Atelier 쪽 설계

### 4.1 커넥터 일반화

- 마이그레이션: `crane_stave_connectors`에 `scopes` TEXT(JSON 배열) 컬럼 추가,
  기존 행은 `["crane"]`으로 백필. 테이블 이름은 유지(리네임은 위험 대비 이득 없음).
- `resolveStaveConnectorCaller`를 `apps/crane/src/server/stave-dispatch-auth.mjs`에서
  플랫폼 공용 모듈 `src/stave-connector/auth.mjs`로 추출. Crane과 Hirondelle
  라우트가 같은 resolver를 사용하되, 호출마다 다음을 라이브로 재확인한다:
  1. 커넥터 시크릿(`stc_`) 해시 일치 + 사용자 활성 상태 (기존 동작)
  2. 요청 라우트가 요구하는 **스코프** 포함 여부 (`crane` / `hirondelle`)
  3. 해당 앱 권한 (`hirondelle:view` 또는 `hirondelle:edit`)
- 페어링 교환(`POST /api/crane/stave/connectors/exchange` — 경로 유지)에
  `requestedScopes` 필드 추가. 서버는 사용자가 실제 가진 권한과의 교집합만 부여.
- 기존 커넥터는 crane 전용으로 남는다. Hirondelle 스코프가 필요하면 재페어링.

### 4.2 Hirondelle Stave 라우트 (신설)

파일: `apps/hirondelle/src/server/stave-sync-routes.mjs`
(등록: `routes.mjs`의 `registerHirondelleRoutes`에서 위임)

| 라우트 | 스코프/권한 | 용도 |
|---|---|---|
| `GET /api/hirondelle/stave/projects?query=&limit=` | `hirondelle` + `hirondelle:view` | 매핑 피커용 목록. visibility 존중 (personal은 커넥터 소유자만) |
| `GET /api/hirondelle/stave/projects/:ref/context-bundle` | 〃 | 프로젝트 + 5개 섹션 + 최근 change event 50개 + markdown 프로젝션 일괄 반환 |
| `POST /api/hirondelle/stave/projects/:ref/events` | `hirondelle` + `hirondelle:edit` | change event 배치 푸시 (멱등) |
| `POST /api/hirondelle/stave/projects/:ref/links/merge` | 〃 | links 섹션 서버 측 병합 |

공통 정책:

- `:ref`는 기존 라우트와 동일하게 slug 또는 id 허용, `resolveProject`의
  visibility 체크 재사용.
- Feature flag `HIRONDELLE_STAVE_SYNC_ENABLED` — off면 라우트 전체 404.
- 모든 쓰기는 `platform_audit_logs` 기록 (`appSlug: "hirondelle"`).
- 요청 본문 크기 제한 (Crane `BODY_LIMITS` 패턴), 이벤트 배치 최대 20건.
- archived 프로젝트에는 쓰기 거부 (409 + 에러 코드), 읽기는 허용.

### 4.3 events 푸시 (멱등성)

- 각 이벤트는 Stave가 생성한 `staveEventId`(uuid)를 `metadata_json`에 포함.
- 중복 방지: `hirondelle_change_events`에 표현식 부분 유니크 인덱스
  `UNIQUE (project_id, json_extract(metadata_json, '$.staveEventId'))
  WHERE json_extract(metadata_json, '$.staveEventId') IS NOT NULL`.
- 응답은 이벤트별 `inserted | duplicate` 결과 배열 → Stave outbox가 양쪽 모두
  전송 완료로 처리.

### 4.4 links 병합 규칙

- 마이그레이션으로 `hirondelle_links`에 `origin TEXT` nullable 컬럼 추가
  (`'stave'` 또는 NULL=사람). note 필드에 매직 스트링을 심지 않는다.
- 병합 identity는 **정규화된 URL** (trailing slash 제거, fragment 제거).
- 규칙 (단일 `db.batch`로 원자 처리):
  - URL이 없으면 insert (`origin='stave'`, position은 맨 뒤).
  - URL이 있고 `origin='stave'`면 label/note 갱신.
  - URL이 있고 사람이 만든 행이면 **건드리지 않음**.
  - **삭제는 절대 하지 않음** (Stave에서 리소스를 제거해도 Hirondelle 링크는 유지).
- 이 라우트는 change event를 만들지 않는다 (links 섹션 자체가 이력).

### 4.5 마이그레이션 목록

번호는 구현 시점의 다음 순번을 사용한다 (2026-08-09 기준 마지막은 `0024`).

1. `stave_connector_scopes` — `scopes` 컬럼 + 백필.
2. `hirondelle_stave_sync` —
   - `hirondelle_change_events.source` CHECK에 `stave` 추가 (SQLite 특성상
     테이블 리빌드: 새 테이블 생성 → 복사 → 스왑).
   - `staveEventId` 표현식 유니크 인덱스.
   - `hirondelle_links.origin` 컬럼.

## 5. Stave 쪽 설계

### 5.1 커넥터 계층: `electron/main/atelier-connector/`

Crane 커넥터에서 페어링·자격증명·HTTP 베이스를 이 모듈로 승격:

- 볼트: `safeStorage` OS 암호화, `userData/atelier-connector.v1.json`.
  시크릿과 함께 부여받은 `scopes`를 저장. 기존 `crane-connector.v1.json`이
  있으면 시작 시 1회 마이그레이션 (crane 스코프로 읽어들이고 구 파일 제거).
- 페어링 IPC `atelier-connector:pair`가 스코프 목록을 받아 교환 요청에 포함.
- HTTP 클라이언트: Crane 패턴 그대로 — fetch + Zod strict 검증 + bounded read
  + `redirect: "error"` + 30s 타임아웃 + 타입드 에러 코드. 단 context-bundle
  응답은 markdown 포함으로 커서 읽기 한도 512KB.
- `crane-connector/runtime.ts`는 잡 폴링 로직만 남기고 자격증명은
  atelier-connector 서비스에서 얻는다. 기존 Crane 동작 변화 없음.

### 5.2 싱크 엔진: `electron/main/hirondelle-sync/`

- **Durable outbox**: 새 SQLite 테이블 `hirondelle_sync_outbox`
  (`id`, `workspace_id`, `project_ref`, `kind`, `payload_json`, `attempts`,
  `next_attempt_at`, `created_at`, `delivered_at`, `status`).
  트리거 시점에 동기적으로 기록 → 앱 종료/오프라인/서버 장애에도 유실 없음.
- **런타임**: Crane 패턴 — 직렬화된 operation queue + generation-guarded
  `setTimeout` + 지수 백오프. `electron/main.ts`의 `runBeforeQuitCleanup()`에서 정지.
- **링크 병합 코얼레싱**: 리소스 링크 변경은 워크스페이스당 30초 디바운스로
  묶어 `links/merge` 1회 호출 (outbox에는 "merge 필요" 마커 1건만 유지).

### 5.3 트리거 배선 (기존 훅 재사용)

| 소스 | 경로 |
|---|---|
| `pr.afterOpen`, `task.archiving`, `turn.completed` | renderer script-trigger 디스패처 지점에서 `hirondelle-sync:enqueue` IPC |
| 에이전트발 WI 변경 (리소스 추가 등) | main이 이미 수신하는 `local-mcp.workspace-information-updated` 이벤트 구독 |
| 사용자발 WI 변경 (렌더러 편집) | 해당 store 액션에서 동일 enqueue IPC (신규 배선 — 렌더러 편집은 현재 이벤트를 emit하지 않음) |

### 5.4 매핑 & 풀 데이터 저장

- **매핑**: `WorkspaceInformationState`에 1급 필드 추가 —
  `hirondelleProject?: { ref, slug, name, url, linkedAt, lastPulledAt }`.
  스냅샷에 함께 저장되고 Information panel에 노출.
- **풀 스냅샷**: context-bundle의 markdown을 워크스페이스의
  `.stave/context/hirondelle/<slug>.md`에 기록. 에이전트가 파일로 자연스럽게
  읽고, 기존 `.stave/context` 컨벤션과 일치. 워크스페이스 킥오프 시드
  (`buildWorkspaceInformationSeed`)에 포함.
- **풀 시점**: 연결 직후 + 수동 새로고침 + 워크스페이스 열 때 1시간 이상
  오래됐으면 자동 갱신.

### 5.5 MCP 도구

기존 4단계 레시피(host-service runtime → protocol action → main service →
MCP server 등록)로 추가:

- `stave_hirondelle_list_projects` — 검색어로 프로젝트 목록 (피커/에이전트 공용)
- `stave_hirondelle_link_project` / `stave_hirondelle_unlink_project`
- `stave_hirondelle_get_context` — on-demand 최신 번들 조회 + 스냅샷 파일 갱신

### 5.6 설정 & UI

- `AppSettings.hirondelleSync`: 마스터 스위치 + 이벤트 종류별 토글.
  기본값: `prOpened` ✅ / `taskCompleted` ✅ / `resourceLinks` ✅ /
  `turnSummaries` ❌. 시크릿은 AppSettings에 절대 넣지 않음 (볼트 전용).
  `SettingDefinition`은 `sectionId: "integrations"`, `sensitivity: "sensitive"`,
  `importExport: "exclude"`.
- 설정 integrations 섹션: 기존 Crane 카드 옆에 "Atelier 커넥터" 상태
  (페어링/스코프/last seen) + Hirondelle 싱크 토글 + outbox 상태(대기/실패 건수).
- Information panel: **Hirondelle 카드** — 연결된 프로젝트명(클릭 시 웹 열기),
  마지막 풀 시각, 새로고침/연결 해제 버튼, 미연결 시 프로젝트 검색 피커.

## 6. 데이터 매핑 상세

### 6.1 푸시: change events

| Stave 트리거 | 토글 (기본값) | kind | tier | summary / source_url |
|---|---|---|---|---|
| `pr.afterOpen` | `prOpened` (on) | `pr_opened` | factual | "PR #N: 제목" / PR URL |
| `task.archiving` | `taskCompleted` (on) | `task_completed` | factual | 태스크 제목 |
| workspace 연결/해제 | 마스터 스위치 on이면 항상 (연결 자체가 명시적 행위라 개별 토글 없음) | `workspace_linked` / `workspace_unlinked` | factual | workspace 이름 + 브랜치 |
| `turn.completed` | `turnSummaries` (off) | `work_update` | interpretive | 턴 요약 텍스트 |

`metadata_json` 공통: `{ staveEventId, workspaceName, branch, contract: "stave-sync-v1" }`.

### 6.2 푸시: 리소스 링크 → `hirondelle_links`

| Stave WI 리소스 | Hirondelle `kind` | label 규칙 |
|---|---|---|
| linkedPullRequests | `github` | "PR #N 제목" |
| figmaResources | `figma` | 리소스 제목 |
| slackThreads | `slack` | 스레드 제목/채널 |
| jiraIssues | `other` | "KEY: 요약" |
| confluencePages | `other` | 페이지 제목 |
| storybookResources / amplifyLinks | `other` | 리소스 제목 |

### 6.3 풀: context-bundle → Stave

- 번들 구성: project(name/slug/summary/status/updatedAt) + members + links +
  properties + schedule stages + memory entries + 최근 change events 50 +
  markdown 프로젝션.
- 저장: markdown → `.stave/context/hirondelle/<slug>.md`,
  메타(`lastPulledAt` 등) → WI `hirondelleProject` 필드.
- Stave WI의 리소스 섹션으로의 역병합(예: Hirondelle links → Stave Jira 목록)은
  **하지 않는다** — 순환 싱크 방지. 에이전트는 markdown 스냅샷과 on-demand
  도구로 충분히 접근 가능.

## 7. 에러 처리 & 신뢰성

- **outbox 재시도**: 지수 백오프 (Crane `computeCraneConnectorRetryDelay` 패턴),
  최대 시도 후 `failed` 상태로 dead-letter. 설정 카드에 실패 건수 노출 +
  수동 재시도 버튼.
- **401/403**: 커넥터 무효/스코프 부족 → 싱크 일시정지, 상태 "재페어링 필요" 표시.
  자동 재시도하지 않음 (사용자 조치 필요).
- **404 (프로젝트 삭제) / 409 (archived)**: 매핑을 `stale`로 표시, Information
  panel 카드에 경고. 해당 워크스페이스의 outbox 항목은 보류.
- **오프라인**: outbox가 보존, 다음 스케줄에 자연 재개.
- **부분 실패**: 이벤트 배치는 항목별 결과(`inserted | duplicate`)로 처리,
  links/merge는 원자적(전부 또는 전무).

## 8. 보안 & 프라이버시 경계

- `stc_` 시크릿은 OS 암호화 볼트에만 저장. 로그에 절대 남기지 않음
  (기존 log sanitizer 패턴 적용).
- **전송 허용**: workspace 이름, 브랜치명, PR/Jira 등 URL과 제목, 태스크 제목,
  턴 요약(opt-in일 때만).
- **전송 금지**: 로컬 파일 경로, diff/트랜스크립트, 파일 내용, 시크릿,
  환경 변수. (Crane 커넥터와 동일한 경계)
- 서버는 호출마다 사용자 상태 + 스코프 + 앱 권한 + visibility를 라이브 재확인.
- 응답 크기 bounded read, `redirect: "error"`, Zod `.strict()` 파싱.

## 9. 테스트 전략

### Atelier (`apps/hirondelle/tests/`, `tests/test-db.ts` 하니스)

- 인증: 스코프 없는 커넥터 거부, 권한 상실 사용자 거부, personal visibility 404.
- events: 멱등(동일 staveEventId 재전송 → duplicate), 배치 한도, archived 409.
- links/merge: 신규 insert / stave 행 갱신 / 사람 행 불변 / 삭제 없음 / 원자성.
- context-bundle: 형태 스냅샷, flag off 시 404.
- 계약 fixture: `apps/hirondelle/tests/fixtures/stave-sync-v1/*.json`.

### Stave (`tests/hirondelle-*.test.ts`)

- outbox: enqueue/drain/백오프/dead-letter/재시작 후 복구.
- 링크 병합 코얼레싱 디바운스.
- 계약 Zod 파싱: 서버와 동일한 `stave-sync-v1` fixture 복제본으로 검증.
- 볼트 마이그레이션 (crane → atelier).
- 설정 normalize (rehydrate 시).
- 마무리 게이트: `bun run typecheck` + 관련 focused test.

## 10. 롤아웃

1. **Atelier 먼저 배포** (flag off → 검증 후 on). 서버가 있어야 클라이언트
   테스트가 가능.
2. **Stave 배포**: 설정 UI + 런타임 (페어링 전까지 비활성).
3. 문서: Stave `docs/features/hirondelle-sync.md` (feature doc 게이트),
   Atelier `docs/apps/hirondelle.md` 및 커넥터 문서 갱신.

## 11. 미해결 질문 / Phase 2 후보

- 커넥터 스코프 업그레이드 엔드포인트 (재페어링 없이 스코프 추가).
- Hirondelle 변경 감지 배지 (stamp 폴링) — 연결된 프로젝트가 바뀌면
  Information panel에 "새 변경 N건" 표시.
- 턴 요약 스로틀/배치 (turnSummaries를 켠 사용자의 피드 노이즈 완화).
- Hirondelle MCP (Atelier Phase 3)가 생기면 `stave_hirondelle_get_context`의
  역할 재검토 (중복 가능).
- Stave todos ↔ Hirondelle schedule/memory 매핑.
