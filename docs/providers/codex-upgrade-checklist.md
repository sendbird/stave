# Codex Upgrade Checklist

Use this checklist whenever Stave upgrades `@openai/codex-sdk`, changes expected Codex CLI or app-server behavior, or adopts a newer Codex app-server protocol surface.

Current baseline: `@openai/codex-sdk@0.140.0` with local `codex` CLI/App Server `0.140.0`.

## Guardrails

- Treat the upgrade as both a dependency change and a contract review. Do not close the work with only a version bump.
- Verify the installed package types, generated app-server protocol surface, and current OpenAI Codex docs before wiring new behavior into Stave.
- If official support exists for a capability Stave has been waiting on, either wire it end to end in the same change or document why it is intentionally deferred in the same change or handoff.

## Guardian Reviewer

- Explicitly check whether official Guardian reviewer support is present in the installed SDK, CLI, or app-server protocol.
- Review support for:
  - `approvalsReviewer`
  - `allowedApprovalsReviewers`
  - `guardian_subagent`
  - granular approval policy shapes
  - guardian approval review events or related notification payloads
- If support is now official and stable enough for Stave, evaluate whether Stave should:
  - add runtime option support
  - expose a settings surface
  - extend Codex mode presets
- Do not override external `guardian_approval` feature state unless the product decision explicitly calls for it.

## Required Check Files

- `electron/providers/codex-app-server-runtime.ts`
- `electron/providers/codex-sdk-runtime.ts`
- `electron/providers/runtime.ts`
- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `electron/main/ipc/schemas.ts`
- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `src/store/provider-runtime-options.ts`
- `src/lib/providers/provider-mode-presets.ts`
- `src/components/layout/settings-dialog-providers-section.tsx`
- `src/components/layout/settings-dialog-codex-section.tsx`

## Upgrade Checks

- Confirm the default runtime path still matches product intent:
  - app-server path
  - legacy SDK fallback path
- Confirm any new request fields are wired across the full path:
  - renderer settings or draft override
  - shared runtime options type
  - preload and `window.api`
  - IPC schema
  - provider runtime request payload
- Keep App Server `experimentalApi` advertised while Stave requests `experimentalRawEvents`; `thread/start` rejects that parameter without the capability.
- Confirm `on-failure`, `on-request`, `untrusted`, and `never` approval policies still round-trip through settings, IPC schema, and runtime payloads.
- Confirm restricted sandbox readable roots use App Server `permissionProfile` and remain additive without widening the workspace write root.
- Confirm any new response or event payloads are mapped into Stave's normalized provider event flow if needed.
- Confirm Codex mode presets still reflect the intended autonomy model after the upgrade.
- Confirm external config import or raw config editing does not silently fight any new first-class Stave surface.

## Verification

- Run `bun run typecheck`.
- Run the most relevant provider tests for the touched surfaces.
- If runtime request or response fields changed, smoke check at least one Codex turn in Stave.
- If approval behavior changed, verify at least:
  - normal turn startup
  - approval request rendering
  - approval response handling
  - any app-server-only approval routing behavior introduced by the upgrade
