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
  sessionstart: "Session start",
  sessionend: "Session end",
  userpromptsubmit: "Prompt submit",
  userpromptexpansion: "Prompt expansion",
  pretooluse: "Before tool use",
  posttooluse: "After tool use",
  posttoolusefailure: "After tool failure",
  posttoolbatch: "After tool batch",
  pretoolcall: "Before tool use",
  posttoolcall: "After tool use",
  precompact: "Before compaction",
  postcompact: "After compaction",
  stop: "Turn stop",
  stopfailure: "Turn stop failure",
  subagentstart: "Subagent start",
  subagentstop: "Subagent stop",
  permissionrequest: "Permission request",
  permissiondenied: "Permission denied",
  instructionsloaded: "Instructions loaded",
  cwdchanged: "Working directory change",
  filechanged: "File change",
  worktreecreate: "Worktree create",
  worktreeremove: "Worktree remove",
  teammateidle: "Teammate idle",
  taskcreated: "Task created",
  taskcompleted: "Task completed",
  messagedisplay: "Message display",
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
