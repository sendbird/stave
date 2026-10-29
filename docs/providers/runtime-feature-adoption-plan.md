# 런타임 기능 채택 현황

최근 검토일: 2026년 10월 29일

Claude Code와 Codex의 런타임 기능을 Stave 관점에서 검토하고, 시점별로
채택한 범위와 보류한 범위를 기록한다. 런타임 기능은 adapter·IPC·UI·테스트가
모두 연결된 경우에만 “지원”으로 본다.

## 기준 버전

| Runtime          | 확인한 버전                                     | 적용 방식                                                                  |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Claude Agent SDK | exact pin `0.3.312`, 내장 Claude Code `2.1.312` | Stave가 버전을 고정한다.                                                   |
| Codex App Server | schema 검증 CLI `0.165.0`                       | Stave가 버전을 강제하지 않고, 선택된 실행 파일의 버전으로 기능을 제한한다. |

Codex 요청·알림 필드는 `0.165.0` 실행 파일에서 생성한 experimental App Server
schema와 대조했다. 최초 2026-07-31 검토에서는 Claude SDK `0.3.197`과 Codex
`0.145.0`을 사용했다.

2026-09-29에 설치 pin을 `@anthropic-ai/claude-agent-sdk@0.3.284`, 내장 Claude
Code `2.1.284`로 올렸다. `Options`에서 제거된 필드는 없다. 새로 추가된 optional
필드와 `background_tasks_changed`, `control_request_progress`,
`conversation_reset` 메시지는 채택하지 않고, 기존 mapper가 빈 이벤트로 둔다.

비용은 **S**(adapter 한 경로), **M**(계약과 작은 UI), **L**(영속 ID나 새 작업
흐름)로 표시한다.

## 2026-10-29 갱신

현재 Claude exact pin은 `0.3.312`, 내장 Claude Code는 `2.1.312`다. Codex의
요청·알림 계약은 `0.165.0`에서 생성한 experimental schema를 기준으로
검토했다. 이 Codex 버전은 최소 지원 버전이나 사용자의 선택된 실행 파일을
뜻하지 않는다. 기존 기능별 버전 제한과 구버전 요청 downgrade는 유지한다.

| 기능 | 결정과 경계 |
| --- | --- |
| Claude effective permission mode | `system/status.permissionMode` 변화를 관측해 대화에 알린다. init을 기준으로 중복·다른 세션·Stop 이후 알림을 버린다. 요청한 권한이나 저장 설정을 바꾸지 않는다. |
| Claude 미응답 질문 | init이 `ask_user_question_unanswered_v1`을 광고한 query에서만 승인된 응답의 빈 질문을 `skipped`로 표시한다. 사용자 거부는 기존 deny를 유지한다. host가 구별하지 못하는 `replied_in_chat`·`dismissed`는 추정하지 않는다. |
| Claude context snapshot | category의 stable `id`·`kind`, MCP instructions, agent·skill provenance를 보존한다. 기존 명시적 context 조회를 재사용하며 매 turn 조회를 추가하지 않는다. Settings는 stable id를 row key로 사용한다. 상세 provenance의 새 화면은 추가하지 않는다. |
| Codex safety reviewer | 현재 thread·turn의 `decisionSource: agent` 최종 `approved`·`denied`만 승인 기록에 표시한다. 사용자 승인과 별도 ID를 쓰며 중복·다른 turn·Stop 이후 알림을 버린다. 명령·stdin·판정 사유 원문은 기록하지 않는다. |
| Codex trusted app metadata | `appContext`는 connector 대상 지정이 필요한 계약이므로 기존 MCP resource capture로 변환하지 않는다. 기존 `mcpAppUi`·legacy 경로와 실패·timeout 처리를 유지한다. |

`item/autoApprovalReview/started`, risk·rationale와 guardian warning을 위한 새
상태 계약은 보류한다. 완료되지 않은 검사를 허용이나 거부로 표시하지 않는다.
안전성 reviewer와 native 코드 리뷰는 별도 기능이며, token·과금 절감은 검증한
사실로 안내하지 않는다.

Native 코드 리뷰는 기존 read-only prompt review를 유지한다. Codex의 단발
`review/start` RPC는 Stave task의 stream·취소·종료 수명주기에 연결된 기능이
아니다. 이를 기본 reviewer로 활성화하지 않는다. 별도 child의 inline review와
early notification, 취소·늦은 완료·실패를 연결한 뒤 채택을 판단한다. Claude
foreground review도 파일 수정·네트워크 게시 차단과 계정·비용 상한 검증이
선행되어야 한다. 실제 inference·게시·hosted upload는 이번 갱신에 포함하지 않는다.

cache 5m/1h 청구 counters는 context 점유율과 의미가 달라 합산하지 않는다.
기존 mapper가 소비하지 않는 신규 optional SDK 설정과 message는 자동으로
활성화하지 않으며, 필요한 UI·권한 계약을 정한 뒤 별도로 채택한다.

## 채택 결과

| 기능                             | 상태                                                                                                   | UI 노출               | 비용 | Provider 대칭                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------- | ---- | --------------------------------------- |
| Claude `sandbox.credentials`     | **채택**. 보호할 파일 경로와 환경변수 이름을 deny 규칙으로 전달한다. 값은 입력받지 않는다.             | 설정 필요             | M    | `sandbox.credentialGuards`              |
| Claude permission denial         | **채택**. 도구와 짧은 거부 사유를 대화에 표시한다.                                                     | 자동 표시             | S    | 공통 `permission_denial` event          |
| Claude auto-mode classifier 설정 | **보류**. `classifyAllShell`이 공개 typed `Settings`에 없다.                                           | 없음                  | M    | `approval.autoClassifierPolicy = false` |
| Codex App/MCP `writes` approval  | **채택**. `Inherit`, `Auto`, `Prompt`, `Writes`, `Approve`를 제공한다.                                 | 설정 필요             | M    | `approval.appToolModes`                 |
| Provider hook lifecycle          | **채택**. 실행·완료·차단·실패 상태만 활동 영역에 표시한다. raw output은 저장하지 않는다.               | 자동 표시             | M    | 공통 `hooks.lifecycleEvents`            |
| Codex hook 목록                  | **채택**. 경로·종류·trust 상태를 읽기 전용으로 표시한다. 명령 편집은 지원하지 않는다.                  | Codex 진단 화면       | M    | Codex `hooks.inventory`                 |
| Turn/message 단위 분기           | **채택**. provider-native 경계 ID를 저장하고 새 Stave task/session을 만든다.                           | 메시지 `Fork here`    | L    | `history.forkBoundary`                  |
| Claude file rewind               | **채택**. dry-run으로 파일·증감량을 확인한 뒤 별도 확인으로 적용한다. 대화와 Git 이력은 바꾸지 않는다. | 메시지 preview dialog | L    | Claude `history.rewind.files`           |
| Codex `indexed` web search       | **채택**. 구버전에서는 `cached`로 안전하게 낮춘다.                                                     | 설정 필요             | S–M  | `webSearchModes`                        |
| Codex permission profile         | **보류**. discovery와 managed policy 왕복이 더 안정화되어야 한다.                                      | 없음                  | L    | `approval.permissionProfiles = false`   |
| Turn별 multi-agent policy        | **보류**. child activity·approval·cancel UI가 먼저 필요하다.                                           | 없음                  | L    | 빈 `delegationPolicies`                 |
| Codex rollout budget             | **보류**. Stave goal budget과 수명주기가 다르고 아직 실험적이다.                                       | 없음                  | M    | capability 미노출                       |

`writes`는 tool annotation을 따르는 승인 정책이며 filesystem/network sandbox가
아니다. Claude credential guard도 사용자가 직접 명령으로 값을 출력하는 행위까지
막는 비밀 저장소는 아니다.

## Capability 원칙

한쪽 runtime에만 있는 기능도 화면의 `providerId` 조건문으로 추측하지 않는다.
선택된 실행 파일의 버전과 Stave가 실제 연결한 범위를 다음 descriptor로 전달한다.

```ts
type ProviderRuntimeCapabilities = {
  approval: {
    appToolModes: Array<"auto" | "prompt" | "writes" | "approve">;
    autoClassifierPolicy: boolean;
    permissionProfiles: boolean;
  };
  sandbox: { credentialGuards: boolean };
  history: {
    forkBoundary: "thread" | "turn" | "message" | null;
    rewind: { files: boolean; conversation: boolean };
  };
  hooks: {
    lifecycleEvents: boolean;
    inventory: boolean;
    trustManagement: boolean;
  };
  delegationPolicies: Array<"disabled" | "explicit" | "proactive">;
  webSearchModes: Array<"disabled" | "cached" | "live" | "indexed">;
};
```

버전을 알 수 없거나 runtime이 없으면 descriptor는 fail-closed 상태가 된다. 오래된
Codex에는 새 field를 보내지 않으며, 저장된 `indexed` 설정은 `cached`로 낮춘다.

## 후속 계획

1. 실제 Claude·Codex turn으로 hook 표시, 분기 후 이어쓰기, rewind preview/apply를
   smoke test한다.
2. Claude가 classifier 설정을 public type으로 공개하면 auto-mode 정책을 다시
   검토한다.
3. Codex permission profile과 multi-agent policy는 관련 discovery·activity 계약이
   안정화된 뒤 capability를 추가한다.
4. conversation rewind와 rollout budget은 stable public API가 생기기 전까지
   보류한다.

## 검증 기준

- renderer → preload → IPC schema → host service → provider adapter 계약이 같다.
- credential 값, hook command, raw hook output은 transcript와 log에 넣지 않는다.
- 분기와 rewind는 진행 중 turn에서 거부한다.
- rewind는 항상 dry-run과 사용자 확인을 거친다.
- custom theme token은 추가하지 않고 기존 semantic token만 사용한다.

## 참고 자료

- [Claude Agent SDK v0.3.197](https://github.com/anthropics/claude-agent-sdk-typescript/releases/tag/v0.3.197)
- [Claude Code v2.1.187: sandbox credentials](https://github.com/anthropics/claude-code/releases/tag/v2.1.187)
- [Claude Code v2.1.193: auto-mode classifier](https://github.com/anthropics/claude-code/releases/tag/v2.1.193)
- [Codex 0.116.0: UserPromptSubmit hooks](https://github.com/openai/codex/releases/tag/rust-v0.116.0)
- [Codex 0.117.0: fork boundaries](https://github.com/openai/codex/releases/tag/rust-v0.117.0)
- [Codex 0.142.0: writes approval와 indexed search](https://github.com/openai/codex/releases/tag/rust-v0.142.0)
- [Codex 0.145.0: 2026-07-31 검증](https://github.com/openai/codex/releases/tag/rust-v0.145.0)
