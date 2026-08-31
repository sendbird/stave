import {
  AcpConfigOptionUpdateSchema,
  AcpContentChunkUpdateSchema,
  AcpCurrentModeUpdateSchema,
  AcpPlanUpdateSchema,
  AcpSessionNotificationSchema,
  AcpToolCallDeltaUpdateSchema,
  AcpToolCallUpdateSchema,
  AcpUsageUpdateSchema,
  type AcpSessionConfigOption,
} from "./acp-schemas";
import type { BridgeEvent } from "../types";
import { truncateBufferedText } from "../provider-buffering";

const ACP_TOOL_INPUT_MAX_BYTES = 128 * 1024;
const ACP_TOOL_OUTPUT_MAX_BYTES = 256 * 1024;
const ACP_PLAN_MAX_BYTES = 64 * 1024;

type ToolState = {
  title: string;
  kind?: string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | null;
  content?: Array<Record<string, unknown>> | null;
  rawInput?: unknown;
  rawOutput?: unknown;
  terminalSignature?: string;
};

function bounded(value: string, maxBytes: number) {
  return truncateBufferedText({ value, maxBytes });
}

function serializeBounded(value: unknown, maxBytes: number) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return bounded(value, maxBytes);
  }
  try {
    return bounded(JSON.stringify(value, null, 2), maxBytes);
  } catch {
    return "[unserializable ACP value]";
  }
}

function mapToolState(
  status: ToolState["status"],
): Extract<BridgeEvent, { type: "tool" }>["state"] {
  if (status === "completed") {
    return "output-available";
  }
  if (status === "failed") {
    return "output-error";
  }
  if (status === "in_progress") {
    return "input-available";
  }
  return "input-streaming";
}

function extractToolContent(content: ToolState["content"]) {
  const output: string[] = [];
  const diffs: Array<Extract<BridgeEvent, { type: "diff" }>> = [];
  for (const item of content ?? []) {
    if (item.type === "diff") {
      const path = typeof item.path === "string" ? item.path : "";
      const newText = typeof item.newText === "string" ? item.newText : "";
      if (path) {
        diffs.push({
          type: "diff",
          filePath: path,
          oldContent: typeof item.oldText === "string" ? item.oldText : "",
          newContent: newText,
          status: "accepted",
        });
      }
      continue;
    }
    if (item.type === "content") {
      const block = item.content;
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        output.push((block as Record<string, unknown>).text as string);
      } else {
        output.push(serializeBounded(block, ACP_TOOL_OUTPUT_MAX_BYTES));
      }
      continue;
    }
    if (item.type === "terminal") {
      const terminalId =
        typeof item.terminalId === "string" ? item.terminalId : "unknown";
      output.push(`[terminal ${terminalId}]`);
      continue;
    }
    output.push(serializeBounded(item, ACP_TOOL_OUTPUT_MAX_BYTES));
  }
  return {
    output: bounded(output.filter(Boolean).join("\n"), ACP_TOOL_OUTPUT_MAX_BYTES),
    diffs,
  };
}

export class AcpEventMapper {
  private readonly tools = new Map<string, ToolState>();
  private configOptions: AcpSessionConfigOption[] = [];
  private expectedModeId: string | null = null;

  constructor(
    private readonly options: {
      onDiagnostic?: (message: string) => void;
    } = {},
  ) {}

  setExpectedMode(modeId: string) {
    this.expectedModeId = modeId;
  }

  setConfigOptions(options: AcpSessionConfigOption[] | null | undefined) {
    this.configOptions = options ?? [];
  }

  getConfigOptions() {
    return this.configOptions;
  }

  mapNotification(params: unknown): BridgeEvent[] {
    const notification = AcpSessionNotificationSchema.safeParse(params);
    if (!notification.success) {
      this.options.onDiagnostic?.("Ignored invalid ACP session/update payload.");
      return [];
    }
    const update = notification.data.update;
    const discriminator = update.sessionUpdate;

    const content = AcpContentChunkUpdateSchema.safeParse(update);
    if (content.success) {
      if (content.data.sessionUpdate === "user_message_chunk") {
        return [];
      }
      return [
        content.data.sessionUpdate === "agent_thought_chunk"
          ? {
              type: "thinking",
              text: content.data.content.text,
              isStreaming: true,
            }
          : {
              type: "text",
              text: content.data.content.text,
              ...(content.data.messageId
                ? { segmentId: content.data.messageId }
                : {}),
            },
      ];
    }

    const toolCall = AcpToolCallUpdateSchema.safeParse(update);
    if (toolCall.success) {
      this.tools.set(toolCall.data.toolCallId, {
        title: toolCall.data.title,
        kind: toolCall.data.kind,
        status: toolCall.data.status,
        content: toolCall.data.content,
        rawInput: toolCall.data.rawInput,
        rawOutput: toolCall.data.rawOutput,
      });
      return this.mapTool(toolCall.data.toolCallId);
    }

    const toolDelta = AcpToolCallDeltaUpdateSchema.safeParse(update);
    if (toolDelta.success) {
      const current = this.tools.get(toolDelta.data.toolCallId) ?? {
        title: toolDelta.data.title?.trim() || "Tool",
      };
      this.tools.set(toolDelta.data.toolCallId, {
        ...current,
        ...(toolDelta.data.title != null
          ? { title: toolDelta.data.title }
          : {}),
        ...(toolDelta.data.kind !== undefined
          ? { kind: toolDelta.data.kind }
          : {}),
        ...(toolDelta.data.status !== undefined
          ? { status: toolDelta.data.status }
          : {}),
        ...(toolDelta.data.content !== undefined
          ? { content: toolDelta.data.content }
          : {}),
        ...(toolDelta.data.rawInput !== undefined
          ? { rawInput: toolDelta.data.rawInput }
          : {}),
        ...(toolDelta.data.rawOutput !== undefined
          ? { rawOutput: toolDelta.data.rawOutput }
          : {}),
      });
      return this.mapTool(toolDelta.data.toolCallId);
    }

    const plan = AcpPlanUpdateSchema.safeParse(update);
    if (plan.success) {
      return [
        {
          type: "tool",
          toolName: "TodoWrite",
          input: bounded(
            JSON.stringify({
              todos: plan.data.entries.map((entry) => ({
                content: entry.content,
                status:
                  entry.status === "completed"
                    ? "completed"
                    : entry.status === "in_progress"
                      ? "in_progress"
                      : "pending",
              })),
            }),
            ACP_PLAN_MAX_BYTES,
          ),
          state: plan.data.entries.every(
            (entry) => entry.status === "completed",
          )
            ? "output-available"
            : "input-available",
        },
      ];
    }

    const mode = AcpCurrentModeUpdateSchema.safeParse(update);
    if (mode.success) {
      if (
        this.expectedModeId &&
        mode.data.currentModeId !== this.expectedModeId
      ) {
        return [
          {
            type: "system",
            content: `ACP session mode changed to ${mode.data.currentModeId}.`,
          },
        ];
      }
      return [];
    }

    const config = AcpConfigOptionUpdateSchema.safeParse(update);
    if (config.success) {
      this.configOptions = config.data.configOptions;
      return [];
    }

    const usage = AcpUsageUpdateSchema.safeParse(update);
    if (usage.success) {
      return [
        {
          type: "context_usage",
          ...(usage.data.used !== undefined
            ? { usedTokens: usage.data.used }
            : {}),
          ...(usage.data.size !== undefined
            ? { sizeTokens: usage.data.size }
            : {}),
          ...(usage.data.usedPercent !== undefined
            ? { usedPercent: usage.data.usedPercent }
            : {}),
          ...(usage.data.cost
            ? {
                costAmount: usage.data.cost.amount,
                costCurrency: usage.data.cost.currency,
              }
            : {}),
        },
      ];
    }

    if (
      discriminator === "available_commands_update" ||
      discriminator === "session_info_update"
    ) {
      return [];
    }

    this.options.onDiagnostic?.(
      `Ignored unknown ACP session update: ${discriminator}.`,
    );
    return [];
  }

  private mapTool(toolCallId: string): BridgeEvent[] {
    const tool = this.tools.get(toolCallId);
    if (!tool) {
      return [];
    }
    const extracted = extractToolContent(tool.content);
    const output = extracted.output ||
      serializeBounded(tool.rawOutput, ACP_TOOL_OUTPUT_MAX_BYTES);
    const events: BridgeEvent[] = [
      {
        type: "tool",
        toolUseId: toolCallId,
        toolName: tool.title.trim() || tool.kind?.trim() || "Tool",
        input: serializeBounded(tool.rawInput, ACP_TOOL_INPUT_MAX_BYTES),
        ...(output ? { output } : {}),
        state: mapToolState(tool.status),
      },
      ...extracted.diffs,
    ];

    if (tool.status === "completed" || tool.status === "failed") {
      const terminalSignature = `${tool.status}:${output}`;
      if (tool.terminalSignature !== terminalSignature) {
        tool.terminalSignature = terminalSignature;
        events.push({
          type: "tool_result",
          tool_use_id: toolCallId,
          output,
          ...(tool.status === "failed" ? { isError: true } : {}),
        });
      }
    }
    return events;
  }
}
