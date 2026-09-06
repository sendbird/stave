# Reliability renewal

The current change hardens existing resource and execution contracts and adds
first-project and first-task orientation. It is not a replacement execution
engine or a completed persistence migration.

## Implemented contracts

- Desktop and browser builds deduplicate React, React DOM, and Lexical so shared
  dependency trees cannot create incompatible hook dispatchers or editor nodes.

- Hidden Lens guest budgets count protected guests, while victim selection
  continues to spare visible, busy, and explicitly exempt guests.
- Lens session removal follows the bounded native CDP drain. Reopening the same
  key waits for removal notification; duplicate close requests share a promise.
- Local tracker links persist a turn cursor, reject old-turn updates, represent
  waiting and cancellation, and preserve failure across a trailing done event.
  A run finishing does not claim the tracker ticket is complete.
- `bun run typecheck:lens-main` now checks the combined renderer/main program.
  Renderer and Lens errors remain forbidden. Other existing diagnostics are
  fingerprinted in `config/main-typecheck-baseline.json` by relative file,
  diagnostic code, source expression, and occurrence count. New occurrences
  fail. Resolved entries must be removed from the baseline; do not increase
  allowances to make a change pass. The gate uses no generated tsconfig file.

## Evidence

- `tests/lens-close-ordering.test.ts` invokes the real session manager with
  controlled native boundaries and tests both drain and timeout order.
- `tests/tracker-kickoff-turn-state.test.ts` exercises SQLite migration,
  cursor persistence, late events, waiting, failure, and cancellation.
- `tests/e2e-electron/desktop-resource-budget.electron.e2e.ts` opens eight local
  pages, verifies bounded session growth and release, and writes per-process
  resource samples. Run after `bun run build:desktop`. Timing is MCP navigation
  return latency, not time to interactive. RSS is not V8 heap size; Electron's
  heap statistics and process working sets use KiB, while Node RSS uses bytes.

## Next boundaries

1. Add byte budgets alongside message count limits and separate large artifacts
   from hot transcript projections. Preserve original content for lazy loading.
2. Separate notification read state from review of a specific result/revision.
3. Define a single writer and revision/acknowledgment contract for each persisted
   field before changing cache eviction or workspace flush behavior.
4. Add main-owned renderer recovery and tests for crash, hang, and uncertain
   side effects. Do not automatically replay external writes after a crash.
5. Measure workspace switch through the next rendered frame and input readiness,
   alongside the existing flush/shell/files/messages phases.
6. Validate repeated resource churn, large transcripts and long-running sessions
   on fixed hardware before setting absolute release performance budgets.

The tracker cursor relies on the host's ordered `started` notifications when
switching between distinct turn IDs. Restart reconciliation for app-wide live
runs remains a separate contract. Lens command counts are not yet a lease for
an entire multi-command user action.
