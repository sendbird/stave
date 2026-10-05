import { i18n } from "@/i18n/runtime";
/**
 * Provider-agnostic vocabulary for hook lifecycle activity.
 *
 * Every provider that supports hooks runs them at the same handful of moments in
 * a turn, but each names those moments in its own casing: Claude reports
 * `SessionStart` / `UserPromptSubmit`, the Codex app server reports
 * `sessionStart` or `user_prompt_submit`. Titling activity rows straight from
 * those tokens made the shelf read like a different feature depending on which
 * provider ran, and it put a provider's internal identifier in the one slot the
 * eye lands on first.
 *
 * So rows are titled from the canonical labels here, and whatever only that
 * provider can say — its own event token, the handler type, the file the handler
 * was declared in — is carried separately as provider-specific detail. The two
 * never share a slot, which is what lets a reader tell normalized content from
 * raw provider content at a glance.
 */

/**
 * Overrides for tokens a mechanical humanizer gets wrong. Anything absent falls
 * through to `humanizeHookEventToken`, so a provider shipping a new hook event
 * still renders a readable row instead of a raw identifier.
 */
const HOOK_EVENT_LABELS: Record<string, string> = {
  get sessionstart() { return i18n.t("providers:hookActivity.sessionStart"); },
  get sessionend() { return i18n.t("providers:hookActivity.sessionEnd"); },
  get userpromptsubmit() { return i18n.t("providers:hookActivity.promptSubmit"); },
  get userpromptexpansion() { return i18n.t("providers:hookActivity.promptExpansion"); },
  get pretooluse() { return i18n.t("providers:hookActivity.beforeToolUse"); },
  get posttooluse() { return i18n.t("providers:hookActivity.afterToolUse"); },
  get posttoolusefailure() { return i18n.t("providers:hookActivity.afterToolFailure"); },
  get posttoolbatch() { return i18n.t("providers:hookActivity.afterToolBatch"); },
  get pretoolcall() { return i18n.t("providers:hookActivity.beforeToolUse"); },
  get posttoolcall() { return i18n.t("providers:hookActivity.afterToolUse"); },
  get precompact() { return i18n.t("providers:hookActivity.beforeCompaction"); },
  get postcompact() { return i18n.t("providers:hookActivity.afterCompaction"); },
  get stop() { return i18n.t("providers:hookActivity.turnStop"); },
  get stopfailure() { return i18n.t("providers:hookActivity.turnStopFailure"); },
  get subagentstart() { return i18n.t("providers:hookActivity.subagentStart"); },
  get subagentstop() { return i18n.t("providers:hookActivity.subagentStop"); },
  get permissionrequest() { return i18n.t("providers:hookActivity.permissionRequest"); },
  get permissiondenied() { return i18n.t("providers:hookActivity.permissionDenied"); },
  get instructionsloaded() { return i18n.t("providers:hookActivity.instructionsLoaded"); },
  get cwdchanged() { return i18n.t("providers:hookActivity.workingDirectoryChange"); },
  get filechanged() { return i18n.t("providers:hookActivity.fileChange"); },
  get worktreecreate() { return i18n.t("providers:hookActivity.worktreeCreate"); },
  get worktreeremove() { return i18n.t("providers:hookActivity.worktreeRemove"); },
  get teammateidle() { return i18n.t("providers:hookActivity.teammateIdle"); },
  get taskcreated() { return i18n.t("providers:hookActivity.taskCreated"); },
  get taskcompleted() { return i18n.t("providers:hookActivity.taskCompleted"); },
  get messagedisplay() { return i18n.t("providers:hookActivity.messageDisplay"); },
};

/**
 * Collapse a provider's event token to a casing-free key so `SessionStart`,
 * `sessionStart` and `session_start` all resolve to the same canonical label.
 */
export function normalizeHookEventToken(hookEvent: string) {
  return hookEvent.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function humanizeHookEventToken(hookEvent: string) {
  const words = hookEvent
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const sentence = words.join(" ").toLowerCase();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}

/**
 * The canonical label for a hook event, or null when the provider named no
 * usable event. `unknown` is treated as unnamed on purpose: both runtimes emit
 * it as a placeholder, and "Unknown hook" says less than a plain "Hook" row.
 */
export function describeHookEventLabel(hookEvent: string): string | null {
  const key = normalizeHookEventToken(hookEvent);
  if (!key || key === "unknown") {
    return null;
  }
  return HOOK_EVENT_LABELS[key] ?? humanizeHookEventToken(hookEvent);
}

/**
 * Trim a handler's declaring file down to its last two segments, matching how
 * tool rows already preview paths. An absolute hooks.json path is mostly the
 * user's home directory, and the row has one line to spend.
 */
export function formatHookSourcePreview(sourcePath: string) {
  const trimmed = sourcePath.trim();
  if (!trimmed) {
    return null;
  }
  const segments = trimmed.split("/").filter(Boolean);
  return segments.length > 2 ? segments.slice(-2).join("/") : trimmed;
}
