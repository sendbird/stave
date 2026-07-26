import {
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL,
  DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  getProviderLabel,
  getSdkModelOptions,
} from "@/lib/providers/model-catalog";
import { buildLegacyPromptFromCanonicalRequest } from "@/lib/providers/canonical-request";
import { getProviderNativeSlashCommandInput } from "@/lib/providers/provider-request-translators";
import type {
  AdvisorTarget,
  CanonicalConversationRequest,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

export const ADVISOR_CONTEXT_SOURCE_ID = "stave:advisor";
export const ADVISOR_SETTING_FIELD_ID = "settings-field-advisor";
export const ADVISOR_PROMPT_MAX_CHARS = 120_000;
export const ADVISOR_ADVICE_MAX_CHARS = 12_000;
export const DEFAULT_ADVISOR_TIMEOUT_MS = 90_000;

const PROVIDER_IDS = new Set<ProviderId>(["claude-code", "codex"]);
const LEGACY_CLAUDE_ADVISOR_TARGET_BY_SOURCE = new Map<string, string>([
  ["claude-haiku-4-5", DEFAULT_CLAUDE_SONNET_MODEL],
  ["claude-sonnet-4-6", DEFAULT_CLAUDE_OPUS_MODEL],
  ["claude-sonnet-4-6[1m]", DEFAULT_CLAUDE_OPUS_MODEL],
  [DEFAULT_CLAUDE_SONNET_MODEL, DEFAULT_CLAUDE_OPUS_MODEL],
  ["claude-opus-4-6", DEFAULT_CLAUDE_OPUS_MODEL],
  ["claude-opus-4-6[1m]", DEFAULT_CLAUDE_OPUS_MODEL],
  ["claude-opus-4-7", DEFAULT_CLAUDE_OPUS_MODEL],
  ["claude-opus-4-7[1m]", DEFAULT_CLAUDE_OPUS_MODEL],
  [DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL, DEFAULT_CLAUDE_OPUS_MODEL],
  [DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL, DEFAULT_CLAUDE_OPUS_MODEL],
  [DEFAULT_CLAUDE_OPUS_MODEL, DEFAULT_CLAUDE_OPUS_MODEL],
  [DEFAULT_CLAUDE_OPUS_1M_MODEL, DEFAULT_CLAUDE_OPUS_MODEL],
]);
const ADVISOR_PROMPT_TRUNCATION_MARKER = "\n\n[Context truncated]\n\n";

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 24))}\n\n[Content truncated]`;
}

function truncatePromptText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  const availableChars = Math.max(
    0,
    maxChars - ADVISOR_PROMPT_TRUNCATION_MARKER.length,
  );
  const headChars = Math.floor(availableChars / 3);
  const tailChars = availableChars - headChars;
  return [
    value.slice(0, headChars),
    ADVISOR_PROMPT_TRUNCATION_MARKER,
    value.slice(-tailChars),
  ].join("");
}

export function normalizeAdvisorTarget(value: unknown): AdvisorTarget | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { providerId?: unknown; model?: unknown };
  if (
    typeof candidate.providerId !== "string" ||
    !PROVIDER_IDS.has(candidate.providerId as ProviderId) ||
    typeof candidate.model !== "string"
  ) {
    return null;
  }
  const model = candidate.model.trim();
  if (!model) {
    return null;
  }
  return {
    providerId: candidate.providerId as ProviderId,
    model: model.slice(0, 200),
  };
}

export function isSupportedAdvisorTarget(
  target: AdvisorTarget | null | undefined,
) {
  if (!target) {
    return false;
  }
  if (isStaticAdvisorTarget(target)) {
    return true;
  }
  // Codex's App Server can advertise newer models dynamically. The renderer
  // only lets users pick reported entries, while the main process performs an
  // authoritative model/list check before starting an unknown target.
  return target.providerId === "codex";
}

export function isStaticAdvisorTarget(
  target: AdvisorTarget | null | undefined,
) {
  if (!target) {
    return false;
  }
  const catalogModels = getSdkModelOptions({
    providerId: target.providerId,
  }) as readonly string[];
  return catalogModels.includes(target.model);
}

/**
 * Migrates the former Claude SDK `advisorModel` source selector.
 *
 * The old setting selected a source family and then mapped it one tier up.
 * Fable was already an effective target, so it remains exact. Unknown values
 * remain visible as an invalid Claude target instead of silently falling back.
 */
export function migrateLegacyClaudeAdvisorModel(
  value: unknown,
): AdvisorTarget | null {
  if (typeof value !== "string") {
    return null;
  }
  const model = value.trim();
  if (!model) {
    return null;
  }
  const mappedTarget = LEGACY_CLAUDE_ADVISOR_TARGET_BY_SOURCE.get(
    model.toLowerCase(),
  );
  if (mappedTarget) {
    return {
      providerId: "claude-code",
      model: mappedTarget,
    };
  }
  return { providerId: "claude-code", model: model.slice(0, 200) };
}

export function normalizePersistedAdvisorTarget(
  persistedSettings: unknown,
): AdvisorTarget | null {
  if (!persistedSettings || typeof persistedSettings !== "object") {
    return null;
  }
  const settings = persistedSettings as {
    advisorTarget?: unknown;
    claudeAdvisorModel?: unknown;
  };
  return Object.hasOwn(settings, "advisorTarget")
    ? normalizeAdvisorTarget(settings.advisorTarget)
    : migrateLegacyClaudeAdvisorModel(settings.claudeAdvisorModel);
}

export function shouldRunAdvisor(args: {
  conversation?: CanonicalConversationRequest;
  target?: AdvisorTarget | null;
}) {
  if (
    !args.conversation ||
    args.conversation.mode !== "chat" ||
    !isSupportedAdvisorTarget(args.target)
  ) {
    return false;
  }
  if (getProviderNativeSlashCommandInput(args.conversation)) {
    return false;
  }
  return !args.conversation.contextParts.some(
    (part) =>
      part.type === "retrieved_context" &&
      part.sourceId === ADVISOR_CONTEXT_SOURCE_ID,
  );
}

export function buildAdvisorPrompt(args: {
  conversation: CanonicalConversationRequest;
}) {
  const conversationText = buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: true,
    includeSkillContext: false,
    includeImageData: false,
  });
  return truncatePromptText(
    [
      "You are a read-only Advisor for another coding agent.",
      "Review the user's request and the available conversation context.",
      "Return concise, actionable advice: likely risks, missing checks, and a recommended approach.",
      "Do not claim to have changed files, do not ask the user questions, and do not use tools.",
      "",
      conversationText,
    ].join("\n"),
    ADVISOR_PROMPT_MAX_CHARS,
  );
}

export function boundAdvisorAdvice(value: string) {
  return truncateText(value.trim(), ADVISOR_ADVICE_MAX_CHARS);
}

export function appendAdvisorAdvice(args: {
  conversation: CanonicalConversationRequest;
  target: AdvisorTarget;
  advice: string;
}): CanonicalConversationRequest {
  const content = boundAdvisorAdvice(args.advice);
  if (!content) {
    return args.conversation;
  }
  return {
    ...args.conversation,
    contextParts: [
      ...args.conversation.contextParts,
      {
        type: "retrieved_context",
        sourceId: ADVISOR_CONTEXT_SOURCE_ID,
        title: `${getProviderLabel({
          providerId: args.target.providerId,
        })} Advisor · ${args.target.model}`,
        content,
      },
    ],
  };
}

export function withoutAdvisorTarget(
  runtimeOptions?: ProviderRuntimeOptions,
): ProviderRuntimeOptions | undefined {
  if (!runtimeOptions?.advisorTarget) {
    return runtimeOptions;
  }
  const { advisorTarget: _advisorTarget, ...nextRuntimeOptions } =
    runtimeOptions;
  return nextRuntimeOptions;
}
