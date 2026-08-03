import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

export type LocalMcpTaskTurnActivityEvent = Extract<
  NormalizedProviderEvent,
  {
    type:
      | "advisor_activity"
      | "hook_activity"
      | "tool"
      | "tool_progress"
      | "tool_result"
      | "subagent_progress"
      | "provider_session"
      | "model_resolved"
      | "error"
      | "done";
  }
>;

const LOCAL_MCP_ACTIVITY_TEXT_LIMIT = 4_096;

function boundActivityText(value: string) {
  if (value.length <= LOCAL_MCP_ACTIVITY_TEXT_LIMIT) {
    return value;
  }
  return `${value.slice(0, LOCAL_MCP_ACTIVITY_TEXT_LIMIT - 1).trimEnd()}…`;
}

const TOOL_INPUT_ACTIVITY_KEYS = new Set([
  "command",
  "description",
  "file_path",
  "message",
  "name",
  "notebook_path",
  "path",
  "pattern",
  "prompt",
  "query",
  "subagent_type",
  "subagentType",
  "agent_type",
  "agentType",
  "task_name",
  "url",
]);

function compactToolInput(input: string) {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return boundActivityText(input);
    }
    const compact = Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        if (!TOOL_INPUT_ACTIVITY_KEYS.has(key)) {
          return [];
        }
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean" &&
          value !== null
        ) {
          return [];
        }
        return [
          [
            key,
            typeof value === "string" ? boundActivityText(value) : value,
          ] as const,
        ];
      }),
    );
    return JSON.stringify(compact);
  } catch {
    return boundActivityText(input);
  }
}

/**
 * Keep host-owned turn activity live without sending transcript-sized payloads
 * through Electron IPC. The renderer still reloads durable messages from
 * SQLite; this projection carries only the fields needed by the Advisor and
 * Turn activity surfaces.
 */
export function projectLocalMcpTaskTurnActivityEvent(
  event: NormalizedProviderEvent,
): LocalMcpTaskTurnActivityEvent | undefined {
  switch (event.type) {
    case "advisor_activity":
    case "hook_activity":
    case "tool_progress":
    case "subagent_progress":
    case "provider_session":
    case "model_resolved":
    case "done":
      return event;
    case "error":
      return { ...event, message: boundActivityText(event.message) };
    case "tool":
      return {
        ...event,
        input: compactToolInput(event.input),
        ...(event.output ? { output: boundActivityText(event.output) } : {}),
      };
    case "tool_result":
      return { ...event, output: boundActivityText(event.output) };
    default:
      return undefined;
  }
}

/**
 * Signal emitted after the host service has persisted a task turn update. The
 * renderer reloads transcript content from SQLite, while `activityEvents`
 * carries a bounded, presentation-only projection for live turn chrome.
 */
export interface LocalMcpTaskTurnUpdate {
  workspaceId: string;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  model: string;
  sequence: number;
  eventType: "started" | NormalizedProviderEvent["type"];
  done: boolean;
  activityEvents?: LocalMcpTaskTurnActivityEvent[];
}

/** Preserve projected activity when the renderer coalesces SQLite reloads. */
export function mergeLocalMcpTaskTurnUpdates(
  previous: LocalMcpTaskTurnUpdate | undefined,
  next: LocalMcpTaskTurnUpdate,
): LocalMcpTaskTurnUpdate {
  if (!previous) {
    return next;
  }
  const activityEvents = [
    ...(previous.activityEvents ?? []),
    ...(next.activityEvents ?? []),
  ];
  return {
    ...next,
    ...(activityEvents.length > 0 ? { activityEvents } : {}),
  };
}
