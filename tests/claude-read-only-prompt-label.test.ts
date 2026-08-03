import { describe, expect, test } from "bun:test";

// Regression guard for the auto task-name / advisor / commit-message failure
// where `claude-sdk-runtime.ts` referenced DEFAULT_READ_ONLY_PROMPT_LABEL
// without importing it. The resulting ReferenceError was thrown inside
// runClaudeReadOnlyPrompt and swallowed by the utility-inference try/catch, so
// task titles silently stayed "New Task".
//
// This is a source-level check on purpose: electron/ is NOT covered by
// `tsc --noEmit` (tsconfig `include` is ["src"]), so a missing import there
// does not surface at typecheck time. A runtime test cannot guard it reliably
// either, because sibling suites `mock.module()` these files process-wide.
const RUNTIME_FILES = [
  "electron/providers/claude-sdk-runtime.ts",
  "electron/providers/codex-app-server-runtime.ts",
  "electron/providers/codex-read-only-prompt.ts",
];

const IMPORT_RE =
  /import\s*\{[^}]*\bDEFAULT_READ_ONLY_PROMPT_LABEL\b[^}]*\}\s*from\s*["'][^"']*read-only-prompt-labels["']/;

describe("read-only prompt label imports", () => {
  for (const file of RUNTIME_FILES) {
    test(`${file} imports DEFAULT_READ_ONLY_PROMPT_LABEL when it is used`, async () => {
      const source = await Bun.file(
        new URL(`../${file}`, import.meta.url),
      ).text();

      if (!source.includes("DEFAULT_READ_ONLY_PROMPT_LABEL")) {
        return; // File does not use the constant — nothing to guard.
      }

      expect(IMPORT_RE.test(source)).toBe(true);
    });
  }
});
