import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildClaudeUsageEvent } from "./claude-event-mapping";
import type { BridgeEvent } from "./types";

export type ClaudeReadOnlyPromptProgress = {
  stage: "loading_runtime" | "waiting_for_result";
  lastMessageType?: string;
};

export type ClaudeReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  model?: string;
  usage?: Extract<BridgeEvent, { type: "usage" }>;
  nativeSessionId?: string;
  sessionReused?: boolean;
  aborted?: boolean;
  detail?: string;
};

/**
 * Consumes the real SDK async iterator without treating an intermediate
 * assistant message as complete advice. Keeping this loop independently
 * testable covers delayed final results while exposing content-free progress
 * metadata to timeout diagnostics.
 */
export async function consumeClaudeReadOnlyPromptStream(args: {
  stream: AsyncIterable<SDKMessage>;
  label: string;
  onProgress?: (progress: ClaudeReadOnlyPromptProgress) => void;
}): Promise<ClaudeReadOnlyPromptResult> {
  for await (const message of args.stream) {
    args.onProgress?.({
      stage: "waiting_for_result",
      lastMessageType: message.type,
    });
    if (message.type !== "result") {
      continue;
    }
    const result = message;
    const usage = buildClaudeUsageEvent(result) as Extract<
      BridgeEvent,
      { type: "usage" }
    >;
    if (result.subtype !== "success" || result.is_error) {
      return {
        ok: false,
        usage,
        nativeSessionId: result.session_id,
        detail:
          result.subtype === "success"
            ? `Claude ${args.label} returned an error result.`
            : result.errors.join("\n") ||
              `Claude ${args.label} failed during execution.`,
      };
    }
    const models = Object.keys(result.modelUsage ?? {});
    return {
      ok: true,
      text: result.result,
      ...(models.length === 1 && models[0] ? { model: models[0] } : {}),
      usage,
      nativeSessionId: result.session_id,
    };
  }
  return {
    ok: false,
    detail: `Claude ${args.label} ended without a result.`,
  };
}
