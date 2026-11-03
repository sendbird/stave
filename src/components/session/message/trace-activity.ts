import type { AppTFunction, I18nKey } from "@/i18n";
import { parseSubagentToolInput } from "@/lib/subagent-tool-input";
import type { ToolUsePart } from "@/types/chat";
import type { AssistantTraceEntry } from "./assistant-trace-builder";
import { deriveTraceToolSummary, getToolTitle } from "./assistant-trace.utils";
import { traceToolCategory, type TraceCategory } from "./trace-summary";

/**
 * What a streaming turn is doing right now, in one short line for the trace
 * header: the title of the newest step still in progress. A step that has
 * finished, failed or waits on the user is not "in progress", so a turn
 * between steps has no activity and the header shows only its status phrase
 * and clock.
 */

const ACTIVITY_KEYS = {
  read: "session:assistantTrace.activity.read",
  edit: "session:assistantTrace.activity.edit",
  command: "session:assistantTrace.activity.command",
  search: "session:assistantTrace.activity.search",
  web: "session:assistantTrace.activity.web",
} as const satisfies Partial<Record<TraceCategory, I18nKey>>;

function isRunning(part: ToolUsePart): boolean {
  return part.state === "input-streaming" || part.state === "input-available";
}

function toolActivity(part: ToolUsePart, t: AppTFunction): string {
  const category = traceToolCategory(part.toolName);
  const target = deriveTraceToolSummary({ toolName: part.toolName, input: part.input })?.text;
  if (target && category in ACTIVITY_KEYS) {
    return t(ACTIVITY_KEYS[category as keyof typeof ACTIVITY_KEYS], { target });
  }
  return t("session:assistantTrace.activity.tool", { tool: getToolTitle(part.toolName) });
}

function entryActivity(entry: AssistantTraceEntry, t: AppTFunction): string | null {
  switch (entry.kind) {
    case "reasoning":
      return entry.isStreaming ? t("ui:thinking.thinking") : null;
    case "tool":
      return isRunning(entry.part) ? toolActivity(entry.part, t) : null;
    case "subagent": {
      if (!isRunning(entry.part)) return null;
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      return parsed.description ?? parsed.subagentType ?? t("session:assistantTrace.baseTitle");
    }
    case "todo":
      return isRunning(entry.part) ? entry.title : null;
    default:
      return null;
  }
}

/** The newest in-progress step's title, or null when nothing is in progress. */
export function resolveTraceActivity(
  entries: readonly AssistantTraceEntry[],
  t: AppTFunction,
): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const activity = entryActivity(entries[index]!, t)?.replace(/\s+/g, " ").trim();
    if (activity) return activity;
  }
  return null;
}
