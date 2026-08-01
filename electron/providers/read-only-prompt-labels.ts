/**
 * Caller labels for the shared read-only prompt helpers
 * (`runClaudeReadOnlyPrompt` / `runCodexReadOnlyPrompt`).
 *
 * Those helpers back several unrelated features — the Advisor preflight, commit
 * message suggestions, task naming, route classification, PR descriptions, and
 * worktree diff review. Their failure `detail` is surfaced to users verbatim
 * (see the utility toast in `src/components/layout/AppShell.tsx`), so the label
 * must come from the caller. Hardcoding "Advisor" produced messages like
 * "Commit message generation is unavailable — Advisor was aborted."
 */
export const DEFAULT_READ_ONLY_PROMPT_LABEL = "Read-only analysis";

export const ADVISOR_READ_ONLY_PROMPT_LABEL = "Advisor";
