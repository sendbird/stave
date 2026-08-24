# Scratch Session — 설계 문서

- 날짜: 2026-08-24
- 상태: Draft (사용자 리뷰 대기)
- 대상: 렌더러(팝오버 표면 + 전용 스토어). 메인 프로세스 / IPC / 프로바이더 런타임 변경 없음.

## 1. 개요

등록된 프로젝트 없이, 임의의 폴더 위치에서 알림 팝업 형태의 경량 에이전트 세션을
열어 두는 기능이다. 프로젝트 목록·워크스페이스·git worktree를 만들지 않고, 폴더
경로만으로 턴을 실행한다.

### 확정된 요구사항 (브레인스토밍 결과)

- **표면**: 별도 OS 윈도우나 트레이가 아니라, 메인 창 안의 앵커된 팝오버.
  기존 알림 팝업과 같은 형태.
- **용도**: 낯선 폴더에 대한 일회성 질문. 프로젝트 목록을 오염시키지 않는 것이 핵심.
- **쓰기 권한**: 파일 수정 허용. 승인 요청은 팝오버 안에서 인라인으로 처리한다.
- **Clear**: 사용자가 원할 때 세션을 비울 수 있어야 한다.
- **프로젝트 미등록**: `recentProjects`, 프로젝트 레지스트리, workspace 스냅샷 어디에도
  기록을 남기지 않는다.

### 비목표 (v1에서 제외)

- PlanViewer, Advisor, Worker, TodoFloater, diff 파일 블록, 파일 검색, 서브태스크
- 대화 이력의 영속화 (앱 재시작 시 세션은 사라진다)
- "프로젝트로 승진" 경로
- 동시 다중 scratch 세션 (한 번에 하나)
- 별도 윈도우 / 트레이 / 전역 핫키 / always-on-top

## 2. 제약과 이음새

설계를 결정한 두 가지 사실.

### 2.1 스토어는 프로젝트 스코프다 (제약)

`src/store/app-store.types.ts`의 `AppState`에서 `workspaces: WorkspaceSummary[]`,
`tasks`, `messagesByTask`, `activeWorkspaceId`는 모두 "현재 열린 프로젝트"를 서술한다.
프로젝트를 전환하면 `src/store/app-store-persistence.ts`가 이 필드들을 통째로 교체하고,
프로젝트가 없으면 빈 배열로 초기화한다.

따라서 다음 두 요구를 동시에 만족하는 세션은 이 배열들 안에 살 수 없다.

- 프로젝트가 하나도 열려 있지 않은 상태에서도 동작해야 한다
- 사용자가 프로젝트를 전환해도 살아 있어야 한다

또한 사이드바(`src/components/layout/ProjectWorkspaceSidebar.tsx`)와
`src/components/layout/FleetView.tsx`는 트리를 `recentProjects`와 `state.workspaces`에서
파생시키므로, 그 배열에 임시 workspace를 주입하면 곧바로 UI로 새어 나온다.

### 2.2 턴 실행 경로는 이미 workspace 비의존적이다 (이음새)

- `electron/main/ipc/schemas.ts`의 `StreamTurnArgsSchema`는 `providerId`와 `prompt`만
  요구하고 `cwd` / `taskId` / `workspaceId`는 모두 optional이다.
- `src/store/provider-turn-runtime.ts`의 `runProviderTurn`은 콜백 기반이며
  `workspaceId`가 optional이다. `cwd`는 `electron/providers/claude-sdk-runtime.ts`와
  `electron/providers/codex-app-server-runtime.ts` 양쪽에서 `runtimeCwd`로 직행한다.
- `src/lib/session/provider-event-replay.ts`의 `replayProviderEventsToTaskState`는
  `{taskId, messages, events, provider, model, turnId, providerSession}`를 받아 다음
  상태를 돌려주는 **순수 리듀서**다. 텍스트 스트리밍, thinking, tool 파트, compact 경계,
  세션 커서 갱신이 모두 이 안에 있다.
- `src/store/provider-runtime-options.ts`의 `buildProviderRuntimeOptions`는 스토어
  의존이 없는 순수 함수다.
- `src/store/provider-message.utils.ts`는 스토어 의존이 0인 순수 모듈이며 승인 파트
  조회·전이·중단 헬퍼를 모두 제공한다.
- `electron/preload.ts`의 `provider.respondApproval({turnId, requestId, approved})`는
  workspaceId도 taskId도 요구하지 않는다.

즉 채팅 의미론과 승인 프로토콜을 **복제하지 않고** 프로젝트 스코프 밖에서 세션을
운영할 수 있다.

### 2.3 채택하지 않은 대안

- **임시 workspace 주입**: 기존 `ChatArea`를 그대로 재사용할 수 있어 기능은 가장 넓지만,
  2.1의 누출 경로를 필터링으로 막아야 하고 프로젝트 전환 시 소멸하며 현재 프로젝트의
  sqlite 스냅샷에 섞인다. 아키텍처와 반대 방향이다.
- **숨겨진 프로젝트 등록**: 코드는 가장 적지만 폴더가 사실상 등록되고 사용자의 활성
  프로젝트가 교체된다. "등록하지 않은"이라는 전제를 포기하는 안이다.

## 3. 표면 설계

### 3.1 트리거

`src/components/layout/TopBar.tsx`의 오른쪽 클러스터에서 `TopBarRoutines` 옆에 둔다.
`TopBarNotifications`와 달리 **`hasProjectContext` 게이트 밖**에 배치한다 — 프로젝트가
없어도 떠야 한다.

배지 규칙:

- 턴 진행 중: 중립 점
- 승인 대기: `text-warning` 점
- 그 외: 배지 없음

새 테마 토큰을 도입하지 않는다. 기존 `bg-card`, `border-border/80`, `text-warning`만 쓴다.

### 3.2 팝오버 레이아웃

`src/components/layout/TopBarNotifications.tsx`의 패턴을 따른다. `PopoverContent`는
`p-0`, `rounded-xl`, `border-border/80`, `bg-card`이며 폭은 `min(32rem, 100vw-1rem)`
(알림 팝업의 28rem보다 넓게).

3단 구성:

1. **헤더** — 폴더 경로 칩(클릭 시 폴더 선택), 프로바이더 토글, Clear 버튼
2. **본문** — 스크롤 전사. 폴더 미선택이면 "폴더 선택" 빈 상태로 대체
3. **푸터** — 한 줄 입력 + 전송/중지 버튼

### 3.3 전사 렌더링

경량 유지를 위해 `src/components/session/ChatPanel.tsx`를 재사용하지 않는다. 이 컴포넌트는
활성 태스크 기준 스토어 셀렉터 열 개 이상에 묶여 있다. 대신:

- 사용자 메시지: 단순 행
- 어시스턴트 메시지: `src/components/session/message/assistant-trace.tsx`의
  `AssistantMessageBody` (스토어 참조 0인 prop-driven 렌더러)
- 승인 파트: 전용 인라인 행 (6절)

## 4. 상태 설계

전용 스토어를 신설하고 `src/store/app.store.ts`는 건드리지 않는다. 프로젝트 스코프
배열과 영속화 스냅샷에 섞이지 않는 것이 이 설계의 핵심 보장이며, 임포트 46개의 hot
파일을 피하는 이점이 따라온다.

파일: `src/store/{scratch-session.store.ts}`

상태:

- `folderPath: string | null` — 절대 경로, 검증 완료된 값만 저장
- `provider: ProviderId`
- `model: string` — 해당 프로바이더의 사용자 기본 모델
- `taskId: string` — `scratch-<uuid>`. Clear 시에만 새로 발급
- `messages: ChatMessage[]`
- `activeTurnId: string | null`
- `providerSession: TaskProviderSessionState`
- `error: string | null`

전부 메모리에만 존재한다. 앱 설정 기본값(기본 프로바이더, 모델, 런타임 설정)은
`useAppStore.getState()`에서 **단방향으로만** 읽는다. 역방향 의존은 만들지 않는다.

## 5. 턴 실행

`send(prompt)`:

1. `folderPath`가 없으면 폴더 선택을 요구하고 종료한다.
2. `fs:resolve-path` IPC로 경로를 재검증한다 (`~` 전개 + `isDirectory()` 보장).
   실패하면 `error`에 사유를 담고 종료한다.
3. `turnId`를 발급하고 사용자 메시지와 빈 어시스턴트 메시지를 append한다.
4. `buildProviderRuntimeOptions({ provider, model, settings, includeAdvisor: false,
providerSession })`. `includeAdvisor: false`는 Advisor와 Worker를 동시에 끈다.
5. `runProviderTurn({ turnId, provider, prompt, taskId, cwd: folderPath,
runtimeOptions, onEvent })`. **`workspaceId`는 넘기지 않는다** — 메인 프로세스가
   workspace 스냅샷을 건드릴 여지를 없앤다.
6. `onEvent`는 이벤트를 모아 `replayProviderEventsToTaskState`로 접고 결과를
   `messages` / `activeTurnId` / `providerSession`에 반영한다.

중지: `provider.abortTurn({ turnId })`.

멀티턴 연속성은 안정된 `taskId` + `cwd` + `providerSession` 커서로 확보된다. Codex는
스레드 캐시 키에 `taskId`와 `cwd`가 들어가고, Claude는 `provider_session` 이벤트로
확보한 `nativeSessionId`로 재개한다. 커서 갱신 자체도 2.2의 순수 리듀서가 처리한다.

## 6. 인라인 승인

승인은 이미 어시스턴트 메시지 안의 `ApprovalPart`로 도착한다
(`src/types/chat.ts`: `toolName`, `description`, `input?`, `requestId`, `state`).

승인 행 컴포넌트는 툴명·설명·승인/거부를 렌더하고
`provider.respondApproval({ turnId: activeTurnId, requestId, approved })`를 호출한 뒤,
성공 시 `updateApprovalPartsByRequestId`로 로컬 파트 상태를 전이시킨다. 실패 시
`system_event` 파트로 사유를 남긴다.

host 경유 승인(`localMcp.respondApproval`)은 `workspaceId`를 요구하므로 경로에서
제외한다. scratch 세션은 Stave local MCP를 붙이지 않으므로 해당 종류가 발생하지
않는다. 방어적으로, 처리할 수 없는 승인이 도착하면 안내 문구와 함께 거부한다.

턴이 비정상 종료하거나 Clear가 실행될 때는 `interruptPendingToolInteractionsInMessages`로
대기 중 승인을 정리한다 — 응답 대상이 사라진 유령 승인 버튼을 남기지 않기 위한 것이다.

## 7. Clear와 수명

### 7.1 Clear

헤더의 Clear는 다음을 한 번에 수행한다.

1. `activeTurnId`가 있으면 `provider.abortTurn`
2. `interruptPendingToolInteractionsInMessages`로 대기 승인 정리
3. `provider.cleanupTask({ taskId })`로 프로바이더 측 스레드/세션 캐시 해제
4. `messages`, `providerSession`, `activeTurnId`, `error` 초기화 및 `taskId` 재발급

`folderPath`와 `provider` 선택은 유지한다 — 같은 폴더에서 다시 묻는 흐름이 가장 흔하다.

진행 중 턴이나 대기 중 승인이 있을 때만 `src/components/layout/ConfirmDialog.tsx`로
확인을 받는다. 그 외에는 즉시 비운다. 알림 팝업의 clear-history 선례와 같은 방식이다.

### 7.2 수명

- 팝오버를 닫아도 세션은 유지되고 스트리밍도 계속된다. 상태가 컴포넌트 밖에 있으므로
  자연히 성립한다. 다시 열면 이어서 보인다.
- 프로젝트 전환과 무관하다.
- 앱을 종료하면 사라진다. 영속화 계층에 아무것도 쓰지 않기 때문이며, 일회성이라는
  용도와 일치한다.
- 폴더를 바꾸면 기존 세션을 비울지 확인한다 (7.1과 같은 정리 절차).

## 8. 파일

신규:

- `src/store/{scratch-session.store.ts}` — 전용 스토어
- `src/components/layout/{TopBarScratchSession.tsx}` — 트리거 + 팝오버 셸
- `src/components/layout/{scratch-session/ScratchTranscript.tsx}` — 전사 + 승인 행
- `src/components/layout/{scratch-session/ScratchComposer.tsx}` — 입력 + 전송/중지
- `tests/{scratch-session.test.ts}` — 스토어 단위 테스트

수정:

- `src/components/layout/TopBar.tsx` — 트리거 배치 1줄 (`hasProjectContext` 게이트 밖)

## 9. 테스트 전략

`runProviderTurn`은 `dependencies.runTurn` 주입을 지원한다. 가짜 async generator로
프로바이더를 대체해 스토어를 순수 단위 테스트한다.

- 폴더 가드: 경로 미선택 / 비-디렉터리 / 상대 경로에서 턴이 시작되지 않는다
- `workspaceId` 미전달: 턴 인자에 workspaceId가 없다
- 이벤트 폴딩: text / thinking / tool / approval / done 순서가 메시지에 반영된다
- 세션 커서: `provider_session` 이벤트가 `providerSession`에 반영되고 다음 턴에 전달된다
- 승인: 승인/거부가 `respondApproval`을 올바른 `turnId`/`requestId`로 호출하고 파트
  상태가 전이된다. 실패 응답은 `system_event`로 남는다
- Clear: abort → 대기 승인 정리 → `cleanupTask` → 상태 초기화 + `taskId` 재발급
- 프로젝트 전환 무관성: 프로젝트 스코프 상태를 교체해도 scratch 상태가 보존된다

UI는 승인 행과 빈 상태에 대한 최소 컴포넌트 테스트만 둔다.

## 10. 위험과 완화

- **위험**: 낯선 폴더에서 쓰기 권한이 열려 있다.
  **완화**: 승인 프롬프트가 인라인으로 노출되고, 헤더에 대상 폴더 경로가 항상 보인다.
  런타임 기본 승인 정책은 `docs/features/provider-sandbox-and-approval.md`의 기존
  설정을 그대로 따르며, 이 기능이 그것을 완화하지 않는다.
- **위험**: 프로젝트 스코프 상태로의 누출.
  **완화**: 전용 스토어로 물리적으로 분리하고, `app.store.ts`를 수정하지 않는다.
  영속화 직렬화는 필드를 하나씩 명시하므로 새 스토어가 스냅샷에 섞일 경로가 없다.
- **위험**: 팝오버가 닫힌 동안 응답 대상이 사라진 승인이 남는다.
  **완화**: 턴 종료·Clear 시 `interruptPendingToolInteractionsInMessages`로 정리한다.
- **위험**: 경량 표면이 점점 본 채팅을 재구현하게 된다.
  **완화**: 비목표 목록을 명시했고, 확장 요구가 오면 "프로젝트로 승진" 경로를 먼저
  검토한다.

## 11. 미해결 질문

- 기능 이름: 가칭 `Scratch Session`. **사용자 노출 문구만 미확정이며 구현을 막지
  않는다** — 코드 식별자와 파일명은 `scratch` 계열로 확정한다. 노출 문구가 바뀌면
  카피만 교체한다.
- 트리거 아이콘 선택.
- 향후 "프로젝트로 승진"을 도입할 경우 전사 이력을 이관할지 여부 (v1 범위 밖).
