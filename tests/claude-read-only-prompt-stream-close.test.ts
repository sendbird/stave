import { describe, expect, test } from "bun:test";

// Regression guard for the auto task-name failure where
// `runClaudeReadOnlyPrompt` returned the stream-consumer promise directly from
// inside a `try` block whose `finally` calls `stream.close()`. In an async
// function a bare `return <promise>` records the completion immediately, so the
// `finally` closed the SDK query before it had been consumed: every read-only
// prompt resolved to "ended without a result". The failure was silent — the
// utility-inference layer just skipped the rename, so task titles stayed
// "New Task" (and advisor / commit-message inference degraded to the fallback
// provider).
//
// This is a source-level check on purpose: `consumeClaudeReadOnlyPromptStream`
// is unit-tested directly, which is exactly why the caller's try/finally
// interaction went uncovered. A runtime test cannot guard it reliably either,
// because sibling suites `mock.module()` these files process-wide.
const RUNTIME_FILE = "electron/providers/claude-sdk-runtime.ts";

describe("runClaudeReadOnlyPrompt stream lifetime", () => {
  test("awaits the stream consumer so the finally block cannot close it early", async () => {
    const source = await Bun.file(
      new URL(`../${RUNTIME_FILE}`, import.meta.url),
    ).text();

    const calls = [
      ...source.matchAll(
        /(return\s+(?:await\s+)?)consumeClaudeReadOnlyPromptStream\(/g,
      ),
    ];

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[1]).toBe("return await ");
    }
  });
});
