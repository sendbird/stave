import { NormalizedProviderEventSchema, type ParsedNormalizedProviderEvent } from "@/lib/providers/schemas";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeLegacyProviderEvent(payload: unknown): unknown | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const kind = asString(record.kind);
  switch (kind) {
    case "assistant_text":
      return {
        type: "text",
        text: asString(record.text) ?? "",
      };
    case "assistant_thinking":
      return {
        type: "thinking",
        text: asString(record.text) ?? "",
        isStreaming: false,
      };
    case "tool_use": {
      const output = asString(record.output);
      return {
        type: "tool",
        toolName: asString(record.toolName) ?? "tool_use",
        input: asString(record.input) ?? "",
        ...(output != null ? { output } : {}),
        state: output ? "output-available" : "input-available",
      };
    }
    case "done":
      return { type: "done" };
    default:
      break;
  }

  const eventType = asString(record.eventType);
  switch (eventType) {
    case "AGENT_MESSAGE":
      return {
        type: "text",
        text: asString(record.text) ?? "",
      };
    case "ERROR":
      return {
        type: "error",
        message: asString(record.message) ?? "Provider error.",
        recoverable: asBoolean(record.recoverable) ?? false,
      };
    case "EXEC_COMMAND_BEGIN":
      return {
        type: "tool",
        toolName: "bash",
        input: asString(record.command) ?? "",
        state: "input-available",
      };
    case "EXEC_COMMAND_END":
      return {
        type: "tool",
        toolName: "bash",
        input: "",
        output: asString(record.output) ?? "",
        state: "output-available",
      };
    case "MCP_TOOL_CALL_BEGIN": {
      const requestId = asString(record.requestId);
      return {
        type: "tool",
        ...(requestId ? { toolUseId: requestId } : {}),
        toolName: asString(record.toolName) ?? "mcp_tool",
        input: asString(record.input) ?? "",
        state: "input-available",
      };
    }
    case "MCP_TOOL_CALL_END": {
      const requestId = asString(record.requestId);
      if (requestId) {
        return {
          type: "tool_result",
          tool_use_id: requestId,
          output: asString(record.output) ?? "",
          ...(asBoolean(record.failed) ? { isError: true } : {}),
        };
      }
      return {
        type: "tool",
        toolName: asString(record.toolName) ?? "mcp_tool",
        input: "",
        output: asString(record.output) ?? "",
        state: asBoolean(record.failed) ? "output-error" : "output-available",
      };
    }
    case "TASK_STARTED":
      return {
        type: "system",
        content: asString(record.text) ?? "Task started.",
      };
    case "TASK_COMPLETE":
      return { type: "done" };
    default:
      return null;
  }
}

export function parseNormalizedEvent(args: { payload: unknown }): ParsedNormalizedProviderEvent | null {
  const parsed = NormalizedProviderEventSchema.safeParse(args.payload);
  if (parsed.success) {
    return parsed.data;
  }

  const legacyPayload = normalizeLegacyProviderEvent(args.payload);
  if (legacyPayload) {
    const legacyParsed = NormalizedProviderEventSchema.safeParse(legacyPayload);
    if (legacyParsed.success) {
      return legacyParsed.data;
    }
  }

  console.error("[provider-runtime] dropped invalid event", parsed.error.flatten());
  return null;
}
