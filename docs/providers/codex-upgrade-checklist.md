# Codex 업그레이드 체크리스트

Codex CLI/App Server의 기대 버전이나 protocol surface를 바꿀 때 사용한다.

- 현재 schema 확인값: 사용자 설치 Codex CLI/App Server `0.145.0`
- Stave는 Codex를 번들하거나 이 버전을 강제하지 않는다.
- 관련 결정: [2026년 상반기 런타임 기능 채택 현황](./runtime-feature-adoption-plan.md)

## 1. 기준 확인

- [ ] Stave가 실제 선택한 executable 경로와 `codex --version`을 확인한다.
- [ ] 같은 executable로 다음 schema를 생성한다.

```sh
codex app-server generate-json-schema --experimental --out <temporary-directory>
```

- [ ] 변경 구간의 공식 release note와 App Server 문서를 읽는다.
- [ ] option·request·response·notification 변경을 **채택**, **보류**, **무관**으로
      분류한다.

## 2. 계약 확인

다음 경로를 함께 확인한다.

- runtime: `electron/providers/codex-app-server-runtime.ts`,
  `electron/providers/codex-app-server-params.ts`,
  `electron/providers/runtime.ts`, `electron/providers/types.ts`
- IPC: `src/lib/providers/provider.types.ts`, `src/lib/providers/schemas.ts`,
  `electron/main/ipc/schemas.ts`, `electron/preload.ts`,
  `src/types/window-api.d.ts`
- 설정/UI: `src/store/provider-runtime-options.ts`,
  `src/lib/providers/runtime-option-contract.ts`,
  `src/components/layout/settings-dialog-providers-section.tsx`,
  `src/components/layout/settings-dialog-codex-section.tsx`
- 테스트: `tests/codex-app-server-runtime.test.ts`, `tests/ipc-schemas.test.ts`,
  `tests/provider-runtime-options.test.ts`

## 3. 기능별 확인

- **Approval**: shell approval과 App/MCP tool approval을 구분한다. legacy
  `on-failure`는 호환 목적으로 유지하되 새 기본값으로 사용하지 않는다.
- **Sandbox**: 생성 schema의 `SandboxPolicy` variant와 정확히 맞춘다.
- **Hook**: `hooks/list`, `hook/started`, `hook/completed`,
  `UserPromptSubmit`의 차단·실패를 확인한다. 명령과 raw output은 노출하지 않는다.
- **Fork**: `thread/fork`의 `lastTurnId`와 `beforeTurnId`를 함께 보내지 않는다.
- **Search**: `indexed`가 없는 구버전에는 `cached`를 보내고 새 field를 제거한다.
- **App tool approval**: `auto`·`prompt`·`writes`·`approve`를 shell sandbox로
  설명하지 않는다.
- **고급 기능**: permission profile, granular approval, multi-agent policy,
  rollout budget은 각각 별도의 capability와 채택 결정을 요구한다.

## 4. 버전 호환

- 새 기능은 `ProviderRuntimeCapabilities`로 UI와 adapter 양쪽에서 제한한다.
- 버전을 알 수 없으면 fail-closed로 처리한다.
- 사용자 config와 mode preset의 autonomy 의미가 충돌하지 않는지 확인한다.
- request field는 생성 schema에 있을 때만 보낸다. 수기 cast로 우회하지 않는다.

## 5. 검증

```sh
bun run typecheck
bun test tests/codex-app-server-runtime.test.ts tests/ipc-schemas.test.ts tests/provider-runtime-options.test.ts
```

request/response 변경은 정상 turn과 resume/fork를, approval 변경은 요청 표시와
응답 처리를, hook 변경은 lifecycle과 read-only inventory를 추가로 smoke test한다.

## 참고 자료

- [Codex releases](https://github.com/openai/codex/releases)
- [Codex App Server reference](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
