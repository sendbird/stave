/**
 * Stave Auto preprocessor.
 *
 * Uses a lightweight classifier model to decide whether the prompt should be
 * handled directly by a single role intent or escalated into orchestration.
 * The classifier never selects concrete model IDs; Stave resolves role -> model
 * from the configured Stave Auto profile.
 */

import type { BridgeEvent, StreamTurnArgs } from "./types";
import type { StaveAutoIntent, StaveAutoProfile } from "../../src/lib/providers/provider.types";
import { getCachedAvailability } from "./stave-availability";
import { resolveStaveIntent, resolveStaveTarget } from "./stave-router";
import {
  applyStaveRoleRuntimeOverrides,
  resolveStaveProviderForModel,
} from "../../src/lib/providers/stave-auto-profile";

export type ExecutionProcessing =
  | {
      strategy: "direct";
      intent: StaveAutoIntent;
      reason: string;
      executionHints?: {
        fastMode?: boolean;
      };
    }
  | {
      strategy: "orchestrate";
      reason: string;
    };

function buildPreprocessorSystemPrompt(args: {
  orchestrationMode: StaveAutoProfile["orchestrationMode"];
  customPrompt?: string;
}) {
  // Allow user-supplied override.  The {orchestrationGuidance} placeholder is
  // resolved dynamically so the user can still reference the mode.
  const orchestrationGuidance = args.orchestrationMode === "aggressive"
    ? 'Bias toward "orchestrate" when the work naturally splits into analysis + implementation + verification.'
    : 'Use "orchestrate" only when the request genuinely benefits from multiple specialised steps.';

  const custom = args.customPrompt?.trim();
  if (custom) {
    return custom.replace(/\{orchestrationGuidance\}/g, orchestrationGuidance);
  }

  return `You are the Stave Auto classifier for an AI coding assistant.
Classify the user's request into one of these direct intents:
- "plan": planning or strategy only
- "analyze": explain, debug, review, root-cause analysis
- "implement": write, build, refactor, patch, add tests
- "quick_edit": rename, typo, tiny targeted change
- "general": balanced default when none of the above fit

Or choose "orchestrate" when the task clearly needs multiple distinct phases.
${orchestrationGuidance}

Respond with ONLY valid JSON.

For direct:
{"strategy":"direct","intent":"<plan|analyze|implement|quick_edit|general>","reason":"<=10 words>","executionHints":{"fastMode":false}}

For orchestration:
{"strategy":"orchestrate","reason":"<=10 words"}

Set fastMode true only for clearly urgent requests ("quick", "fast", "ASAP", "빨리", "빠르게", "즉시").`;
}

function buildPreprocessorUserPrompt(args: {
  userPrompt: string;
  historyLength: number;
  attachedFileCount: number;
}): string {
  const contextHints: string[] = [];
  if (args.historyLength > 0) {
    contextHints.push(`conversation history: ${args.historyLength} messages`);
  }
  if (args.attachedFileCount > 0) {
    contextHints.push(`attached files: ${args.attachedFileCount}`);
  }

  const contextLine = contextHints.length > 0
    ? `\n[Context: ${contextHints.join(", ")}]`
    : "";

  return `Classify this request:${contextLine}\n\n${args.userPrompt}`;
}

function buildSingleTurnPrompt(args: {
  providerId: "claude-code" | "codex";
  systemPrompt: string;
  prompt: string;
}) {
  if (args.providerId === "codex") {
    return `<system>\n${args.systemPrompt}\n</system>\n\n${args.prompt}`;
  }
  return args.prompt;
}

function parseExecutionProcessing(raw: string): ExecutionProcessing | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (parsed.strategy === "direct" && typeof parsed.intent === "string") {
      const intent = parsed.intent;
      if (
        intent === "plan"
        || intent === "analyze"
        || intent === "implement"
        || intent === "quick_edit"
        || intent === "general"
      ) {
        const plan: ExecutionProcessing = {
          strategy: "direct",
          intent,
          reason: typeof parsed.reason === "string" ? parsed.reason : "Classifier decision",
        };
        if (
          parsed.executionHints
          && typeof parsed.executionHints === "object"
          && !Array.isArray(parsed.executionHints)
        ) {
          const hints = parsed.executionHints as Record<string, unknown>;
          plan.executionHints = {
            fastMode: hints.fastMode === true,
          };
        }
        return plan;
      }
    }

    if (parsed.strategy === "orchestrate") {
      return {
        strategy: "orchestrate",
        reason: typeof parsed.reason === "string" ? parsed.reason : "Classifier decision",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function selectPreprocessorModel(args: {
  profile: StaveAutoProfile;
}): string | null {
  const preferred = args.profile.classifierModel;
  const preferredProvider = resolveStaveProviderForModel({ model: preferred });
  const preferredAvail = getCachedAvailability(preferredProvider);
  if (preferredAvail !== false) {
    return preferred;
  }

  const fallbackModel = preferredProvider === "claude-code" ? "gpt-5.3-codex" : "claude-haiku-4-5";
  const fallbackProvider = resolveStaveProviderForModel({ model: fallbackModel });
  const fallbackAvail = getCachedAvailability(fallbackProvider);
  if (fallbackAvail !== false) {
    return fallbackModel;
  }

  return null;
}

function fallbackToRegexProcessing(args: {
  prompt: string;
  historyLength: number;
  attachedFileCount: number;
  profile: StaveAutoProfile;
}): ExecutionProcessing {
  const intent = resolveStaveIntent({
    prompt: args.prompt,
    historyLength: args.historyLength,
    attachedFileCount: args.attachedFileCount,
  });
  const target = resolveStaveTarget({
    prompt: args.prompt,
    historyLength: args.historyLength,
    attachedFileCount: args.attachedFileCount,
    profile: args.profile,
  });
  return {
    strategy: "direct",
    intent,
    reason: target.reason,
  };
}

export async function runPreprocessor(args: {
  userPrompt: string;
  historyLength: number;
  attachedFileCount: number;
  profile: StaveAutoProfile;
  baseArgs: Pick<StreamTurnArgs, "cwd" | "taskId" | "workspaceId">;
  runTurnBatch: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
}): Promise<ExecutionProcessing> {
  const chosenModel = selectPreprocessorModel({ profile: args.profile });
  if (!chosenModel) {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      profile: args.profile,
    });
  }

  const preprocessorProviderId = resolveStaveProviderForModel({ model: chosenModel });

  let events: BridgeEvent[];
  try {
    const systemPrompt = buildPreprocessorSystemPrompt({
      orchestrationMode: args.profile.orchestrationMode,
      customPrompt: args.profile.promptPreprocessorClassifier,
    });
    const runtimeOptions = applyStaveRoleRuntimeOverrides({
      profile: args.profile,
      role: "classifier",
      model: chosenModel,
      runtimeOptions: {
        model: chosenModel,
        ...(preprocessorProviderId === "claude-code" ? { claudeSystemPrompt: systemPrompt } : {}),
        claudeMaxTurns: 1,
        claudePermissionMode: "bypassPermissions",
        claudeAllowedTools: [],
        codexFastMode: true,
        providerTimeoutMs: 10_000,
      },
    });
    events = await args.runTurnBatch({
      providerId: preprocessorProviderId,
      prompt: buildSingleTurnPrompt({
        providerId: preprocessorProviderId,
        systemPrompt,
        prompt: buildPreprocessorUserPrompt({
          userPrompt: args.userPrompt,
          historyLength: args.historyLength,
          attachedFileCount: args.attachedFileCount,
        }),
      }),
      cwd: args.baseArgs.cwd,
      taskId: args.baseArgs.taskId,
      workspaceId: args.baseArgs.workspaceId,
      runtimeOptions,
    });
  } catch {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      profile: args.profile,
    });
  }

  const rawText = events
    .filter((event): event is Extract<BridgeEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.text)
    .join("");

  const plan = parseExecutionProcessing(rawText);
  if (!plan) {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      profile: args.profile,
    });
  }

  if (args.profile.orchestrationMode === "off" && plan.strategy === "orchestrate") {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      profile: args.profile,
    });
  }

  return plan;
}
