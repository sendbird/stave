import {
  getDefaultModelForProvider,
  inferProviderIdFromModel,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
  resolveTierModel,
  type ModelTier,
  type TaskType,
} from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

export const AUTO_ROUTING_CONFIDENCE_THRESHOLD = 0.7;
export const AUTO_ROUTING_CLASSIFIER_TIMEOUT_MS = 800;
export const AUTO_ROUTING_TINY_PROMPT_TOKEN_LIMIT = 12;
export const AUTO_ROUTING_FILE_CONTEXT_TIER_UP_THRESHOLD = 4;
export const AUTO_ROUTING_PROMPT_HASH_CACHE_LIMIT = 64;
export const AUTO_ROUTING_PROVIDER_SWITCH_MIN_ASSISTANT_TURNS = 3;

const MODEL_TIERS = [
  "light",
  "standard",
  "heavy",
  "frontier",
] as const satisfies readonly ModelTier[];

const TASK_TYPES = [
  "quick_edit",
  "plan",
  "implementation",
  "debug",
  "review",
  "general",
  "safety",
] as const satisfies readonly TaskType[];

const SENSITIVE_DOMAIN_PATTERNS = [
  /\bauth(?:entication|orization)?\b/i,
  /\bcredential/i,
  /\bsecret/i,
  /\btoken\b/i,
  /\bpayment\b/i,
  /\bbilling\b/i,
  /\bcrypto\b/i,
  /\bdelete\b/i,
  /\bdrop\s+table\b/i,
  /\bmigration\b/i,
  /\bproduction\b/i,
  /\bsecurity\b/i,
];

const PLAN_PATTERNS = [
  /\bplan\b/i,
  /\barchitecture\b/i,
  /\bdesign\b/i,
  /\broadmap\b/i,
  /\brefactor strategy\b/i,
  /설계/,
  /플랜/,
];

const DEBUG_PATTERNS = [
  /\bdebug\b/i,
  /\berror\b/i,
  /\bfailing\b/i,
  /\bstack trace\b/i,
  /\bregression\b/i,
  /\btest failure\b/i,
  /에러/,
  /실패/,
];

const REVIEW_PATTERNS = [
  /\breview\b/i,
  /\baudit\b/i,
  /\bpr\b/i,
  /\bcode review\b/i,
  /리뷰/,
  /검토/,
];

const IMPLEMENTATION_PATTERNS = [
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\badd\b/i,
  /\bcreate\b/i,
  /\bfix\b/i,
  /\bupdate\b/i,
  /\bwire\b/i,
  /구현/,
  /수정/,
  /추가/,
];

const QUICK_EDIT_PATTERNS = [
  /\btypo\b/i,
  /\brename\b/i,
  /\bcopy\b/i,
  /\blabel\b/i,
  /\bsmall\b/i,
  /\btiny\b/i,
  /오타/,
  /문구/,
];

export interface AutoRoutingSettings {
  autoRoutingEnabled: boolean;
  autoRoutingUseClassifier: boolean;
  autoRoutingObjective: number;
  autoRoutingSafetyEscalation: boolean;
  autoRoutingAllowProviderSwitch: boolean;
  autoRoutingEligibleClaudeModels: readonly string[];
  autoRoutingEligibleCodexModels: readonly string[];
}

export interface AutoRoutingHistoryMessage {
  role: "user" | "assistant";
  content: string;
  providerId?: ProviderId | "user";
  model?: string;
}

export interface AutoRoutingClassifierRequest {
  prompt: string;
  history: readonly AutoRoutingHistoryMessage[];
  fileContextCount: number;
}

export interface AutoRoutingClassifierResult {
  taskType: TaskType;
  complexity: "low" | "medium" | "high";
  recommendedTier: ModelTier;
  confidence: number;
  rationale?: string;
  stick?: boolean;
}

export interface AutoRoutingDecision {
  providerId: ProviderId;
  model: string;
  taskType: TaskType;
  tier: ModelTier;
  confidence: number;
  source:
    | "disabled"
    | "manual"
    | "heuristic"
    | "classifier"
    | "classifier_fallback";
  rationale: string;
  providerChanged: boolean;
  stick: boolean;
  claudeEffort?: NonNullable<ProviderRuntimeOptions["claudeEffort"]>;
  codexReasoningEffort?: NonNullable<
    ProviderRuntimeOptions["codexReasoningEffort"]
  >;
}

export interface ResolveAutoRoutingDecisionArgs {
  settings: AutoRoutingSettings;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  currentProviderId: ProviderId;
  currentModel: string;
  prompt: string;
  history: readonly AutoRoutingHistoryMessage[];
  fileContextCount?: number;
  classifierTimeoutMs?: number;
  classifyRoute?: (
    args: AutoRoutingClassifierRequest,
  ) => Promise<AutoRoutingClassifierResult | null>;
}

interface HeuristicRoute {
  taskType: TaskType;
  tier: ModelTier;
  confidence: number;
  rationale: string;
}

const classifierCache = new Map<string, AutoRoutingClassifierResult | null>();

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeAutoRoutingObjective(value: number | undefined) {
  return clamp(typeof value === "number" ? value : 0.5, 0, 1);
}

export function normalizeAutoRoutingEligibleModels(
  value: readonly unknown[] | undefined,
) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(
      (entry, index, entries) =>
        entry.length > 0 && entries.indexOf(entry) === index,
    );
}

function countPromptTokens(prompt: string) {
  return prompt
    .trim()
    .split(/\s+/g)
    .filter(Boolean).length;
}

function matchesAny(prompt: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(prompt));
}

function tierIndex(tier: ModelTier) {
  return MODEL_TIERS.indexOf(tier);
}

function shiftTier(tier: ModelTier, offset: number): ModelTier {
  const nextIndex = clamp(
    tierIndex(tier) + offset,
    0,
    MODEL_TIERS.length - 1,
  );
  return MODEL_TIERS[nextIndex] ?? tier;
}

function applyObjectiveToTier(args: {
  tier: ModelTier;
  objective: number;
}): ModelTier {
  const objective = normalizeAutoRoutingObjective(args.objective);
  if (objective <= 0.2) {
    return shiftTier(args.tier, -1);
  }
  if (objective >= 0.8) {
    return shiftTier(args.tier, 1);
  }
  return args.tier;
}

function hashClassifierPrompt(args: AutoRoutingClassifierRequest) {
  const historyTail = args.history
    .slice(-6)
    .map((message) => `${message.role}:${message.providerId ?? ""}:${message.content}`)
    .join("\n");
  return `${args.fileContextCount}\n${args.prompt}\n${historyTail}`;
}

function rememberClassifierResult(
  key: string,
  result: AutoRoutingClassifierResult | null,
) {
  classifierCache.set(key, result);
  if (classifierCache.size <= AUTO_ROUTING_PROMPT_HASH_CACHE_LIMIT) {
    return;
  }
  const oldestKey = classifierCache.keys().next().value;
  if (oldestKey) {
    classifierCache.delete(oldestKey);
  }
}

function normalizeClassifierResult(
  result: AutoRoutingClassifierResult | null,
): AutoRoutingClassifierResult | null {
  if (!result) {
    return null;
  }
  if (!TASK_TYPES.includes(result.taskType)) {
    return null;
  }
  if (!MODEL_TIERS.includes(result.recommendedTier)) {
    return null;
  }
  return {
    taskType: result.taskType,
    complexity:
      result.complexity === "low" ||
      result.complexity === "medium" ||
      result.complexity === "high"
        ? result.complexity
        : "medium",
    recommendedTier: result.recommendedTier,
    confidence: clamp(result.confidence, 0, 1),
    rationale: result.rationale,
    stick: result.stick === true,
  };
}

async function classifyWithTimeout(args: {
  request: AutoRoutingClassifierRequest;
  classifyRoute: NonNullable<ResolveAutoRoutingDecisionArgs["classifyRoute"]>;
  timeoutMs: number;
}) {
  const cacheKey = hashClassifierPrompt(args.request);
  if (classifierCache.has(cacheKey)) {
    return classifierCache.get(cacheKey) ?? null;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), args.timeoutMs);
  });

  try {
    const result = await Promise.race([
      args.classifyRoute(args.request).then(normalizeClassifierResult),
      timeout,
    ]);
    rememberClassifierResult(cacheKey, result);
    return result;
  } catch {
    rememberClassifierResult(cacheKey, null);
    return null;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function resolveHeuristicRoute(args: {
  prompt: string;
  fileContextCount: number;
  safetyEscalation: boolean;
}): HeuristicRoute {
  const prompt = args.prompt.trim();
  const tokenCount = countPromptTokens(prompt);
  const isTiny =
    tokenCount > 0 &&
    tokenCount <= AUTO_ROUTING_TINY_PROMPT_TOKEN_LIMIT &&
    args.fileContextCount === 0;
  const sensitive = matchesAny(prompt, SENSITIVE_DOMAIN_PATTERNS);

  let taskType: TaskType = "general";
  let tier: ModelTier = isTiny ? "light" : "standard";
  let confidence = isTiny ? 0.78 : 0.62;
  let rationale = isTiny ? "tiny prompt" : "general prompt";

  if (matchesAny(prompt, PLAN_PATTERNS)) {
    taskType = "plan";
    tier = "heavy";
    confidence = 0.84;
    rationale = "planning keywords";
  } else if (matchesAny(prompt, DEBUG_PATTERNS)) {
    taskType = "debug";
    tier = args.fileContextCount > 0 ? "heavy" : "standard";
    confidence = 0.78;
    rationale = "debugging keywords";
  } else if (matchesAny(prompt, REVIEW_PATTERNS)) {
    taskType = "review";
    tier = args.fileContextCount > 0 ? "heavy" : "standard";
    confidence = 0.76;
    rationale = "review keywords";
  } else if (matchesAny(prompt, QUICK_EDIT_PATTERNS) || isTiny) {
    taskType = "quick_edit";
    tier = "light";
    confidence = 0.78;
    rationale = "quick-edit keywords";
  } else if (matchesAny(prompt, IMPLEMENTATION_PATTERNS)) {
    taskType = "implementation";
    tier = args.fileContextCount > 0 ? "heavy" : "standard";
    confidence = 0.76;
    rationale = "implementation keywords";
  }

  if (args.fileContextCount > 0 && tier === "light") {
    tier = "standard";
    rationale = `${rationale}, file context`;
  }
  if (args.fileContextCount >= AUTO_ROUTING_FILE_CONTEXT_TIER_UP_THRESHOLD) {
    tier = shiftTier(tier, 1);
    if (tier === "frontier") {
      tier = "heavy";
    }
    confidence = Math.max(confidence, 0.74);
    rationale = `${rationale}, multiple files`;
  }

  if (args.safetyEscalation && sensitive) {
    taskType = "safety";
    tier = tierIndex(tier) < tierIndex("heavy") ? "heavy" : tier;
    confidence = Math.max(confidence, 0.86);
    rationale = `${rationale}, sensitive domain`;
  }

  return { taskType, tier, confidence, rationale };
}

function findLastAssistantProvider(
  history: readonly AutoRoutingHistoryMessage[],
): ProviderId | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (
      message?.role === "assistant" &&
      (message.providerId === "claude-code" || message.providerId === "codex")
    ) {
      return message.providerId;
    }
  }
  return null;
}

function countAssistantProviderTurns(
  history: readonly AutoRoutingHistoryMessage[],
) {
  return history.filter(
    (message) =>
      message.role === "assistant" &&
      (message.providerId === "claude-code" || message.providerId === "codex"),
  ).length;
}

export function resolveProviderStickiness(args: {
  currentProviderId: ProviderId;
  history: readonly AutoRoutingHistoryMessage[];
  allowProviderSwitch: boolean;
  classifierStick?: boolean;
  suggestedProviderId?: ProviderId;
}) {
  const lastAssistantProvider = findLastAssistantProvider(args.history);
  if (args.history.length === 0) {
    return "claude-code" satisfies ProviderId;
  }
  if (args.classifierStick) {
    return lastAssistantProvider ?? args.currentProviderId;
  }
  if (!args.allowProviderSwitch) {
    return lastAssistantProvider ?? args.currentProviderId;
  }
  const pinnedProvider = lastAssistantProvider ?? args.currentProviderId;
  const assistantTurns = countAssistantProviderTurns(args.history);
  if (
    args.suggestedProviderId &&
    args.suggestedProviderId !== pinnedProvider &&
    assistantTurns >= AUTO_ROUTING_PROVIDER_SWITCH_MIN_ASSISTANT_TURNS
  ) {
    return args.suggestedProviderId;
  }
  return pinnedProvider;
}

function suggestProviderForTaskType(taskType: TaskType): ProviderId {
  if (
    taskType === "implementation" ||
    taskType === "debug" ||
    taskType === "quick_edit"
  ) {
    return "codex";
  }
  return "claude-code";
}

function resolveEligibleModels(args: {
  providerId: ProviderId;
  settings: AutoRoutingSettings;
}) {
  return args.providerId === "claude-code"
    ? args.settings.autoRoutingEligibleClaudeModels
    : args.settings.autoRoutingEligibleCodexModels;
}

function buildDecision(args: {
  providerId: ProviderId;
  model: string;
  taskType: TaskType;
  tier: ModelTier;
  confidence: number;
  source: AutoRoutingDecision["source"];
  rationale: string;
  currentProviderId: ProviderId;
  stick?: boolean;
}): AutoRoutingDecision {
  return {
    providerId: args.providerId,
    model: args.model,
    taskType: args.taskType,
    tier: args.tier,
    confidence: args.confidence,
    source: args.source,
    rationale: args.rationale,
    providerChanged: args.providerId !== args.currentProviderId,
    stick: args.stick === true,
    ...(args.providerId === "claude-code"
      ? {
          claudeEffort: resolveDefaultClaudeEffortForModel({
            model: args.model,
          }),
        }
      : args.providerId === "codex"
        ? {
            codexReasoningEffort: resolveDefaultCodexEffortForModel({
              model: args.model,
            }),
          }
        : {}),
  };
}

export async function resolveAutoRoutingDecision(
  args: ResolveAutoRoutingDecisionArgs,
): Promise<AutoRoutingDecision> {
  const manualModel = args.runtimeOverrides?.model?.trim();
  if (manualModel) {
    const providerId =
      args.runtimeOverrides?.modelProviderId ??
      inferProviderIdFromModel({ model: manualModel });
    return buildDecision({
      providerId,
      model: manualModel,
      taskType: "general",
      tier: "standard",
      confidence: 1,
      source: "manual",
      rationale: "manual model override",
      currentProviderId: args.currentProviderId,
      stick: true,
    });
  }

  if (
    !args.settings.autoRoutingEnabled ||
    args.runtimeOverrides?.autoRouting !== true
  ) {
    return buildDecision({
      providerId: args.currentProviderId,
      model: args.currentModel,
      taskType: "general",
      tier: "standard",
      confidence: 1,
      source: "disabled",
      rationale: "auto routing disabled",
      currentProviderId: args.currentProviderId,
      stick: true,
    });
  }

  const fileContextCount = Math.max(0, args.fileContextCount ?? 0);
  const heuristic = resolveHeuristicRoute({
    prompt: args.prompt,
    fileContextCount,
    safetyEscalation: args.settings.autoRoutingSafetyEscalation,
  });
  let selectedRoute = heuristic;
  let source: AutoRoutingDecision["source"] = "heuristic";
  let classifierStick = false;

  if (
    args.settings.autoRoutingUseClassifier &&
    args.classifyRoute &&
    heuristic.confidence < AUTO_ROUTING_CONFIDENCE_THRESHOLD
  ) {
    const classifier = await classifyWithTimeout({
      request: {
        prompt: args.prompt,
        history: args.history,
        fileContextCount,
      },
      classifyRoute: args.classifyRoute,
      timeoutMs:
        args.classifierTimeoutMs ?? AUTO_ROUTING_CLASSIFIER_TIMEOUT_MS,
    });
    if (classifier) {
      selectedRoute = {
        taskType: classifier.taskType,
        tier: classifier.recommendedTier,
        confidence: classifier.confidence,
        rationale: classifier.rationale ?? "classifier recommendation",
      };
      source = "classifier";
      classifierStick = classifier.stick === true;
    } else {
      source = "classifier_fallback";
      classifierStick = true;
    }
  }

  const tier = applyObjectiveToTier({
    tier: selectedRoute.tier,
    objective: args.settings.autoRoutingObjective,
  });
  const providerId = resolveProviderStickiness({
    currentProviderId: args.currentProviderId,
    history: args.history,
    allowProviderSwitch: args.settings.autoRoutingAllowProviderSwitch,
    classifierStick,
    suggestedProviderId: suggestProviderForTaskType(selectedRoute.taskType),
  });
  const eligibleModels = resolveEligibleModels({
    providerId,
    settings: args.settings,
  });
  const model =
    resolveTierModel({
      tier,
      providerId,
      eligibleModels,
      // TODO(fable): when available, frontier should resolve to claude-fable-5.
    }) ?? getDefaultModelForProvider({ providerId });

  return buildDecision({
    providerId,
    model,
    taskType: selectedRoute.taskType,
    tier,
    confidence: selectedRoute.confidence,
    source,
    rationale: selectedRoute.rationale,
    currentProviderId: args.currentProviderId,
    stick: classifierStick,
  });
}
