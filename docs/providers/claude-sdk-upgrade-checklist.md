# Claude Agent SDK 업그레이드 체크리스트

Claude SDK exact pin이나 내장 Claude Code 동작을 바꿀 때 사용한다.

- 현재: `@anthropic-ai/claude-agent-sdk@0.3.197`
- 내장 Claude Code: `2.1.197`
- 관련 결정: [2026년 상반기 런타임 기능 채택 현황](./runtime-feature-adoption-plan.md)

## 1. 버전 확인

- [ ] `package.json`이 exact pin인지 확인한다.
- [ ] `bun.lock`의 SDK와 모든 platform optional package 버전이 같은지 확인한다.
- [ ] 설치 package의 `version`과 `claudeCodeVersion`을 각각 확인한다.
- [ ] 사용자 지정 Claude executable을 지원하는 변경이면 `claude --version`도 따로
      확인한다.

## 2. 변경점 분류

- [ ] 변경 구간의 SDK와 Claude Code release note를 읽는다.
- [ ] `Options`, `Settings`, `SandboxSettings`, `PermissionMode`, callback,
      `Query`, session mutation, `SDKMessage` union을 비교한다.
- [ ] 새 public 기능을 **채택**, **보류**, **무관** 중 하나로 기록한다.
- [ ] 공개 export가 아닌 bundle 내부 control request에는 의존하지 않는다.

## 3. 계약 확인

다음 경로를 함께 확인한다.

- runtime: `electron/providers/claude-sdk-runtime.ts`,
  `electron/providers/runtime.ts`, `electron/providers/types.ts`
- IPC: `src/lib/providers/provider.types.ts`, `src/lib/providers/schemas.ts`,
  `electron/main/ipc/schemas.ts`, `electron/preload.ts`,
  `src/types/window-api.d.ts`
- 설정/UI: `src/store/provider-runtime-options.ts`,
  `src/lib/providers/runtime-option-contract.ts`,
  `src/components/layout/settings-dialog-providers-section.tsx`
- 테스트: `tests/claude-sdk-runtime.test.ts`, `tests/ipc-schemas.test.ts`,
  `tests/provider-runtime-options.test.ts`

## 4. 기능별 안전 조건

### Permission과 sandbox

- `sandbox.credentials`에는 파일 경로와 환경변수 **이름**만 넣는다.
- secret 값은 main process env 경로에만 두고 renderer, model text, diagnostics,
  log로 보내지 않는다.
- secondary read-only run은 filesystem·network 제한을 계속 fail-closed로 유지한다.
- permission denial은 필요한 사유만 normalized event로 표시한다.

### Session과 rewind

- provider-native message ID를 영속화한 뒤 branch/rewind에 사용한다.
- file rewind는 `dryRun` → 영향 파일 표시 → 사용자 확인 → 적용 순서로 실행한다.
- Git restore, conversation rewind, file rewind를 같은 기능처럼 표현하지 않는다.
- fork는 원본 session을 덮지 않고 새 Stave task/session을 만든다.

### Message와 hook

- 새 `SDKMessage` member는 normalize·의도적 ignore·diagnostic 중 하나로 분류한다.
- normalized event type과 Zod schema를 같은 변경에서 수정한다.
- hook의 start·progress·response를 함께 확인하고 raw output은 저장하지 않는다.
- rate limit, prompt suggestion, task progress, compact boundary, result mapping도
  회귀 확인한다.

## 5. 실행과 검증

1. 기존 버전과 `claudeCodeVersion`을 기록한다.
2. `bun add --exact @anthropic-ai/claude-agent-sdk@<version>`으로 올린다.
3. manifest, lockfile, 설치 metadata와 declaration diff를 확인한다.
4. 채택 기능을 전체 계약 경로에 연결하고 문서의 baseline을 갱신한다.
5. 아래 검증을 실행한다.

```sh
bun run typecheck
bun test tests/claude-sdk-runtime.test.ts tests/ipc-schemas.test.ts tests/provider-runtime-options.test.ts
```

session이나 sandbox가 바뀌면 정상 turn, resume/fork, rewind preview/apply,
approval 왕복, abort, secondary read-only도 smoke test한다.

## 참고 자료

- [Claude Agent SDK TypeScript releases](https://github.com/anthropics/claude-agent-sdk-typescript/releases)
- [Claude Code releases](https://github.com/anthropics/claude-code/releases)
