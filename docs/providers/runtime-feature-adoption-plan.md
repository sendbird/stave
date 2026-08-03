# 2026년 상반기 런타임 기능 채택 현황

검토일: 2026년 7월 31일

Claude Code와 Codex의 2026년 상반기 기능을 Stave 관점에서 검토하고, 이번에
채택한 범위와 보류한 범위를 기록한다. 런타임 기능은 adapter·IPC·UI·테스트가
모두 연결된 경우에만 “지원”으로 본다.

## 기준 버전

| Runtime          | 확인한 버전                                     | 적용 방식                                                                  |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Claude Agent SDK | exact pin `0.3.197`, 내장 Claude Code `2.1.197` | Stave가 버전을 고정한다.                                                   |
| Codex App Server | 사용자 설치 CLI `0.145.0`                       | Stave가 버전을 강제하지 않고, 선택된 실행 파일의 버전으로 기능을 제한한다. |

Codex 요청 필드는 같은 `0.145.0` 실행 파일에서 생성한 experimental App Server
schema와 대조했다.

비용은 **S**(adapter 한 경로), **M**(계약과 작은 UI), **L**(영속 ID나 새 작업
흐름)로 표시한다.

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
- [Codex 0.145.0: 검증 baseline](https://github.com/openai/codex/releases/tag/rust-v0.145.0)
