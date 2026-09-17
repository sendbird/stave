import {
  type AutoRoutingProfile,
  migrateLegacyAutoSettings,
  resolveRoute,
  type ResolvedRoute,
  type RouteComplexity,
  type RouterRole,
  type RouterSignals,
  type Stance,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import { resolveTightestAccountUsageWindow } from "@/lib/providers/account-usage-block";
import {
  inferProviderIdFromModel,
  isAutoModelId,
  listProviderIds,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
  type ModelTier,
  type TaskType,
} from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

export const AUTO_ROUTING_CONFIDENCE_THRESHOLD = 0.7;
export const AUTO_ROUTING_CLASSIFIER_TIMEOUT_MS = 800;
export const AUTO_ROUTING_TINY_PROMPT_TOKEN_LIMIT = 12;
export const AUTO_ROUTING_FILE_CONTEXT_TIER_UP_THRESHOLD = 4;
export const AUTO_ROUTING_LONG_PROMPT_TOKEN_LIMIT = 120;
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
  // "a regression in X" is debugging; "add a regression test" is building one.
  /\bregression\b(?!\s+tests?\b)/i,
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

const CI_FIX_PATTERNS = [
  /\bci\b/i,
  /\bpipeline\b/i,
  /\bworkflow (?:run|failure|failing)\b/i,
  /\blint(?:er)?\b/i,
  /\bflaky\b/i,
  /\bbuild (?:is )?(?:broken|failing|red)\b/i,
];

const DOCS_PATTERNS = [
  /\bdocs?\b/i,
  /\bdocumentation\b/i,
  /\breadme\b/i,
  /\bchangelog\b/i,
  /\bdocstring\b/i,
  /\bjsdoc\b/i,
  /문서/,
];

const RESEARCH_PATTERNS = [
  /\bresearch\b/i,
  /\binvestigate\b/i,
  /\bexplain\b/i,
  /\bhow does\b/i,
  /\bwhat is\b/i,
  /\bcompare\b/i,
  /\bsummari[sz]e\b/i,
  /조사/,
  /설명/,
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

/** Build verbs strong enough to outrank the tiny-prompt shortcut. */
const BUILD_VERB_PATTERNS = [
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\bwire\b/i,
  /\bmigrate\b/i,
  /구현/,
  /만들/,
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

/** `/ship`, `/ci-fix …`, `/review:pr` at the very start of the prompt. */
const SKILL_COMMAND_PATTERN = /^\s*\/([a-z][\w:-]{0,63})(?=\s|$)/i;

/** Skills whose name already tells the task class. */
const SKILL_TASK_CLASS: Readonly<Record<string, TaskClass>> = {
  "ci-fix": "ci-fix",
  ci: "ci-fix",
  review: "review",
  "code-review": "review",
  plan: "plan",
  docs: "docs",
  doc: "docs",
  research: "research",
  debug: "debug",
  "quick-edit": "quick-edit",
  typo: "quick-edit",
};

export interface AutoRoutingSettings {
  autoRoutingEnabled: boolean;
  autoRoutingUseClassifier: boolean;
  autoRoutingObjective: number;
  autoRoutingSafetyEscalation: boolean;
  autoRoutingAllowProviderSwitch: boolean;
  autoRoutingEligibleClaudeModels: readonly string[];
  autoRoutingEligibleCodexModels: readonly string[];
  /** v2 role table; absent falls back to a profile migrated from the v1 flags. */
  autoRoutingProfile?: AutoRoutingProfile;
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

/** Compact, serialisable signal summary carried on every decision. */
export interface AutoRoutingSignalSummary {
  taskClass: TaskClass;
  complexity: RouteComplexity;
  sensitive: boolean;
  skill?: string;
  phase?: "plan" | "execute";
  fileContextCount: number;
  budgetUsedPercent?: number;
  lastAssistantProvider?: ProviderId | null;
}

export interface AutoRoutingDecision {
  providerId: ProviderId;
  model: string;
  role: RouterRole;
  taskType: TaskType;
  taskClass: TaskClass;
  tier: ModelTier;
  confidence: number;
  source:
    | "disabled"
    | "manual"
    | "heuristic"
    | "classifier"
    | "classifier_fallback";
  rationale: string;
  /** Id of the role-table rule that fired; `null` for fallback/manual/disabled. */
  ruleId: string | null;
  /** Human sentence from the rule plus stance/budget adjustments. */
  ruleReason: string;
  stance: Stance;
  signals: AutoRoutingSignalSummary;
  providerChanged: boolean;
  stick: boolean;
  claudeEffort?: NonNullable<ProviderRuntimeOptions["claudeEffort"]>;
  codexReasoningEffort?: NonNullable<
    ProviderRuntimeOptions["codexReasoningEffort"]
  >;
}

export interface AutoRoutingDecisionRecord {
  decision: AutoRoutingDecision;
  resolvedAt: string;
  /** First 120 characters of the prompt the decision was made for. */
  promptPreview: string;
}

export const AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS = 120;

export function buildAutoRoutingDecisionRecord(args: {
  decision: AutoRoutingDecision;
  prompt: string;
  resolvedAt?: string;
}): AutoRoutingDecisionRecord {
  const preview = args.prompt.replace(/\s+/g, " ").trim();
  return {
    decision: args.decision,
    resolvedAt: args.resolvedAt ?? new Date().toISOString(),
    promptPreview:
      preview.length > AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS
        ? `${preview.slice(0, AUTO_ROUTING_PROMPT_PREVIEW_MAX_CHARS - 1)}…`
        : preview,
  };
}

export interface ResolveAutoRoutingDecisionArgs {
  settings: AutoRoutingSettings;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  currentProviderId: ProviderId;
  currentModel: string;
  prompt: string;
  history: readonly AutoRoutingHistoryMessage[];
  fileContextCount?: number;
  /** Plan mode on the draft, when the caller knows it. */
  phase?: "plan" | "execute";
  rateLimitsSnapshot?: RateLimitsSnapshotResponse | null;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  runtimeModelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
  classifierTimeoutMs?: number;
  classifyRoute?: (
    args: AutoRoutingClassifierRequest,
  ) => Promise<AutoRoutingClassifierResult | null>;
}

interface HeuristicRoute {
  taskType: TaskType;
  taskClass: TaskClass;
  tier: ModelTier;
  complexity: RouteComplexity;
  sensitive: boolean;
  skill?: string;
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

/** Legacy task type → v2 task class. `general` depends on prompt size. */
export function taskTypeToTaskClass(
  taskType: TaskType,
  options?: { tiny?: boolean },
): TaskClass {
  switch (taskType) {
    case "quick_edit":
      return "quick-edit";
    case "plan":
      return "plan";
    case "implementation":
      return "implement";
    case "debug":
      return "debug";
    case "review":
      return "review";
    case "safety":
      return "safety-critical";
    case "general":
    default:
      return options?.tiny ? "quick-edit" : "implement";
  }
}

/** v2 task class → the legacy field still recorded on turn evidence. */
export function taskClassToTaskType(taskClass: TaskClass): TaskType {
  switch (taskClass) {
    case "quick-edit":
    case "docs":
    case "ci-fix":
      return "quick_edit";
    case "plan":
    case "research":
      return "plan";
    case "implement":
      return "implementation";
    case "debug":
      return "debug";
    case "review":
      return "review";
    case "safety-critical":
      return "safety";
    default:
      return "general";
  }
}

/** Detects a leading slash command such as `/ship` and returns its name. */
export function detectPromptSkill(prompt: string): string | undefined {
  const match = SKILL_COMMAND_PATTERN.exec(prompt);
  return match?.[1]?.toLowerCase();
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
  // A timeout or malformed verdict is not a fact about the prompt; caching it
  // would pin every later attempt to the fallback path.
  if (result === null) {
    return;
  }
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

export function resolveHeuristicRoute(args: {
  prompt: string;
  fileContextCount: number;
  safetyEscalation: boolean;
  skillRouting?: boolean;
}): HeuristicRoute {
  const prompt = args.prompt.trim();
  const tokenCount = countPromptTokens(prompt);
  const isTiny =
    tokenCount > 0 &&
    tokenCount <= AUTO_ROUTING_TINY_PROMPT_TOKEN_LIMIT &&
    args.fileContextCount === 0;
  const sensitive = matchesAny(prompt, SENSITIVE_DOMAIN_PATTERNS);
  const skill = args.skillRouting === false ? undefined : detectPromptSkill(prompt);

  let taskType: TaskType = "general";
  let taskClass: TaskClass | null = null;
  let tier: ModelTier = isTiny ? "light" : "standard";
  let confidence = isTiny ? 0.78 : 0.62;
  let rationale = isTiny ? "tiny prompt" : "general prompt";

  if (matchesAny(prompt, PLAN_PATTERNS)) {
    taskType = "plan";
    tier = "heavy";
    confidence = 0.84;
    rationale = "planning keywords";
  } else if (matchesAny(prompt, CI_FIX_PATTERNS)) {
    taskType = "quick_edit";
    taskClass = "ci-fix";
    tier = "light";
    confidence = 0.76;
    rationale = "CI keywords";
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
  } else if (matchesAny(prompt, DOCS_PATTERNS)) {
    taskType = "quick_edit";
    taskClass = "docs";
    tier = "light";
    confidence = 0.74;
    rationale = "documentation keywords";
  } else if (matchesAny(prompt, QUICK_EDIT_PATTERNS)) {
    taskType = "quick_edit";
    tier = "light";
    confidence = 0.78;
    rationale = "quick-edit keywords";
  } else if (
    matchesAny(prompt, IMPLEMENTATION_PATTERNS) &&
    (!isTiny || matchesAny(prompt, BUILD_VERB_PATTERNS))
  ) {
    // "Implement the follow-up fix" is implementation work despite its length;
    // a bare tiny "fix it" stays a quick edit below.
    taskType = "implementation";
    tier = args.fileContextCount > 0 ? "heavy" : "standard";
    confidence = 0.76;
    rationale = "implementation keywords";
  } else if (isTiny) {
    taskType = "quick_edit";
    tier = "light";
    confidence = 0.78;
    rationale = "tiny prompt";
  } else if (matchesAny(prompt, RESEARCH_PATTERNS)) {
    taskType = "plan";
    taskClass = "research";
    tier = "heavy";
    confidence = 0.72;
    rationale = "research keywords";
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
    taskClass = "safety-critical";
    tier = tierIndex(tier) < tierIndex("heavy") ? "heavy" : tier;
    confidence = Math.max(confidence, 0.86);
    rationale = `${rationale}, sensitive domain`;
  }

  // A named skill is the strongest signal we have about intent.
  if (skill && SKILL_TASK_CLASS[skill] && !(args.safetyEscalation && sensitive)) {
    taskClass = SKILL_TASK_CLASS[skill] ?? taskClass;
    taskType = taskClassToTaskType(taskClass);
    confidence = Math.max(confidence, 0.9);
    rationale = `/${skill} command`;
  } else if (skill) {
    confidence = Math.max(confidence, 0.8);
    rationale = `${rationale}, /${skill} command`;
  }

  const complexity: RouteComplexity =
    isTiny
      ? "low"
      : tokenCount >= AUTO_ROUTING_LONG_PROMPT_TOKEN_LIMIT ||
          args.fileContextCount >= AUTO_ROUTING_FILE_CONTEXT_TIER_UP_THRESHOLD
        ? "high"
        : "medium";

  return {
    taskType,
    taskClass: taskClass ?? taskTypeToTaskClass(taskType, { tiny: isTiny }),
    tier,
    complexity,
    sensitive,
    ...(skill ? { skill } : {}),
    confidence,
    rationale,
  };
}

export function findLastAssistantProvider(
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

/** Concrete model behind the most recent managed-provider assistant turn. */
export function findLastAssistantModel(
  history: readonly AutoRoutingHistoryMessage[],
): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (
      message?.role === "assistant" &&
      (message.providerId === "claude-code" || message.providerId === "codex")
    ) {
      const model = message.model?.trim();
      return model && !isAutoModelId({ model }) ? model : null;
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

/** Percent used of each provider's tightest usage window, when known. */
export function resolveBudgetUsedPercentByProvider(
  snapshot: RateLimitsSnapshotResponse | null | undefined,
): Partial<Record<ProviderId, number>> {
  const result: Partial<Record<ProviderId, number>> = {};
  if (!snapshot) {
    return result;
  }
  for (const providerId of listProviderIds()) {
    const window = resolveTightestAccountUsageWindow({ providerId, snapshot });
    if (window && Number.isFinite(window.usedPercent)) {
      result[providerId] = window.usedPercent;
    }
  }
  return result;
}

export function resolveAutoRoutingProfile(
  settings: AutoRoutingSettings,
): AutoRoutingProfile {
  return settings.autoRoutingProfile ?? migrateLegacyAutoSettings(settings);
}

function toClaudeEffort(
  effort: string | undefined,
  model: string,
): NonNullable<ProviderRuntimeOptions["claudeEffort"]> {
  const scale = ["low", "medium", "high", "xhigh", "max"] as const;
  return effort && (scale as readonly string[]).includes(effort)
    ? (effort as (typeof scale)[number])
    : resolveDefaultClaudeEffortForModel({ model });
}

function toCodexEffort(
  effort: string | undefined,
  model: string,
): NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  const scale = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
  return effort && (scale as readonly string[]).includes(effort)
    ? (effort as (typeof scale)[number])
    : resolveDefaultCodexEffortForModel({ model });
}

function routeTierToModelTier(route: ResolvedRoute): ModelTier {
  switch (route.tier) {
    case "frontier":
    case "flagship":
      return "frontier";
    case "balanced":
      return "heavy";
    case "light":
    default:
      return "light";
  }
}

function buildDecision(args: {
  providerId: ProviderId;
  model: string;
  role?: RouterRole;
  taskType: TaskType;
  taskClass?: TaskClass;
  tier: ModelTier;
  confidence: number;
  source: AutoRoutingDecision["source"];
  rationale: string;
  ruleId?: string | null;
  ruleReason?: string;
  stance?: Stance;
  signals?: Partial<AutoRoutingSignalSummary>;
  effort?: string;
  currentProviderId: ProviderId;
  stick?: boolean;
}): AutoRoutingDecision {
  const taskClass = args.taskClass ?? taskTypeToTaskClass(args.taskType);
  return {
    providerId: args.providerId,
    model: args.model,
    role: args.role ?? "primary",
    taskType: args.taskType,
    taskClass,
    tier: args.tier,
    confidence: args.confidence,
    source: args.source,
    rationale: args.rationale,
    ruleId: args.ruleId ?? null,
    ruleReason: args.ruleReason ?? "",
    stance: args.stance ?? "balanced",
    signals: {
      taskClass,
      complexity: "medium",
      sensitive: false,
      fileContextCount: 0,
      ...args.signals,
    },
    providerChanged: args.providerId !== args.currentProviderId,
    stick: args.stick === true,
    ...(args.providerId === "claude-code"
      ? { claudeEffort: toClaudeEffort(args.effort, args.model) }
      : args.providerId === "codex"
        ? { codexReasoningEffort: toCodexEffort(args.effort, args.model) }
        : {}),
  };
}

/**
 * Turns a prompt plus task context into the signal set the role table reads.
 * Pure: the optional classifier result is passed in, never fetched here.
 */
export function computeRouterSignals(args: {
  prompt: string;
  fileContextCount: number;
  history: readonly AutoRoutingHistoryMessage[];
  currentProviderId: ProviderId;
  currentModel?: string;
  profile: AutoRoutingProfile;
  phase?: "plan" | "execute";
  rateLimitsSnapshot?: RateLimitsSnapshotResponse | null;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  classifier?: AutoRoutingClassifierResult | null;
}): { signals: RouterSignals; heuristic: HeuristicRoute } {
  const heuristic = resolveHeuristicRoute({
    prompt: args.prompt,
    fileContextCount: args.fileContextCount,
    safetyEscalation: args.profile.signals.safetyEscalation,
    skillRouting: args.profile.signals.skillRouting,
  });
  const budgetByProvider = resolveBudgetUsedPercentByProvider(
    args.rateLimitsSnapshot,
  );
  const lastAssistantProvider = findLastAssistantProvider(args.history);
  const budgetProvider = lastAssistantProvider ?? args.currentProviderId;
  const taskClass = args.classifier
    ? heuristic.skill && heuristic.rationale.startsWith("/")
      ? heuristic.taskClass
      : taskTypeToTaskClass(args.classifier.taskType, {
          tiny: heuristic.complexity === "low",
        })
    : heuristic.taskClass;
  return {
    heuristic,
    signals: {
      taskClass,
      complexity: args.classifier?.complexity ?? heuristic.complexity,
      sensitive: heuristic.sensitive,
      ...(heuristic.skill ? { skill: heuristic.skill } : {}),
      ...(args.phase ? { phase: args.phase } : {}),
      fileContextCount: args.fileContextCount,
      ...(typeof budgetByProvider[budgetProvider] === "number"
        ? { budgetUsedPercent: budgetByProvider[budgetProvider] }
        : {}),
      budgetUsedPercentByProvider: budgetByProvider,
      ...(args.providerAvailability
        ? { providerAvailability: args.providerAvailability }
        : {}),
      lastAssistantProvider,
      lastAssistantModel: findLastAssistantModel(args.history),
      currentProviderId: args.currentProviderId,
      ...(args.currentModel ? { currentModel: args.currentModel } : {}),
    },
  };
}

export function summarizeRouterSignals(
  signals: RouterSignals,
): AutoRoutingSignalSummary {
  return {
    taskClass: signals.taskClass,
    complexity: signals.complexity,
    sensitive: signals.sensitive,
    ...(signals.skill ? { skill: signals.skill } : {}),
    ...(signals.phase ? { phase: signals.phase } : {}),
    fileContextCount: signals.fileContextCount,
    ...(typeof signals.budgetUsedPercent === "number"
      ? { budgetUsedPercent: Math.round(signals.budgetUsedPercent) }
      : {}),
    lastAssistantProvider: signals.lastAssistantProvider ?? null,
  };
}

/** `implement · 3 files · budget 41%` — the tooltip line under the Auto pill. */
export function formatAutoRoutingSignalSummary(
  summary: AutoRoutingSignalSummary,
) {
  const parts: string[] = [summary.taskClass];
  if (summary.skill) {
    parts.push(`/${summary.skill}`);
  }
  parts.push(`${summary.complexity} complexity`);
  if (summary.sensitive) {
    parts.push("sensitive");
  }
  if (summary.fileContextCount > 0) {
    parts.push(
      `${summary.fileContextCount} ${summary.fileContextCount === 1 ? "file" : "files"}`,
    );
  }
  if (typeof summary.budgetUsedPercent === "number") {
    parts.push(`budget ${summary.budgetUsedPercent}%`);
  }
  return parts.join(" · ");
}

export async function resolveAutoRoutingDecision(
  args: ResolveAutoRoutingDecisionArgs,
): Promise<AutoRoutingDecision> {
  const manualModel = args.runtimeOverrides?.model?.trim();
  if (manualModel) {
    const providerId =
      args.runtimeOverrides?.modelProviderId ??
      inferProviderIdFromModel({ model: manualModel });
    const decision = buildDecision({
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
    return {
      ...decision,
      ...(providerId === "claude-code" && args.runtimeOverrides?.claudeEffort
        ? { claudeEffort: args.runtimeOverrides.claudeEffort }
        : {}),
      ...(providerId === "codex" && args.runtimeOverrides?.codexReasoningEffort
        ? { codexReasoningEffort: args.runtimeOverrides.codexReasoningEffort }
        : {}),
    };
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

  const profile = resolveAutoRoutingProfile(args.settings);
  const fileContextCount = Math.max(0, args.fileContextCount ?? 0);
  const preliminary = resolveHeuristicRoute({
    prompt: args.prompt,
    fileContextCount,
    safetyEscalation: profile.signals.safetyEscalation,
    skillRouting: profile.signals.skillRouting,
  });

  let classifier: AutoRoutingClassifierResult | null = null;
  let source: AutoRoutingDecision["source"] = "heuristic";
  let classifierStick = false;
  if (
    profile.signals.classifier &&
    args.classifyRoute &&
    preliminary.confidence < AUTO_ROUTING_CONFIDENCE_THRESHOLD
  ) {
    classifier = await classifyWithTimeout({
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
      source = "classifier";
      classifierStick = classifier.stick === true;
    } else {
      source = "classifier_fallback";
      classifierStick = true;
    }
  }

  const { signals, heuristic } = computeRouterSignals({
    prompt: args.prompt,
    fileContextCount,
    history: args.history,
    currentProviderId: args.currentProviderId,
    currentModel: args.currentModel,
    profile,
    phase: args.phase,
    rateLimitsSnapshot: args.rateLimitsSnapshot,
    providerAvailability: args.providerAvailability,
    classifier,
  });

  // Stickiness still decides which provider "any-eligible" means: a classifier
  // that asked to stick, or a profile with provider switching off, pins the
  // provider that answered last.
  const pinnedProvider = resolveProviderStickiness({
    currentProviderId: args.currentProviderId,
    history: args.history,
    allowProviderSwitch: profile.signals.providerSwitch,
    classifierStick,
  });

  const route = resolveRoute({
    profile,
    role: "primary",
    signals: {
      ...signals,
      lastAssistantProvider: pinnedProvider,
    },
    runtimeModelsByProvider: args.runtimeModelsByProvider,
  });

  const confidence = classifier?.confidence ?? heuristic.confidence;
  const rationale = classifier?.rationale ?? heuristic.rationale;

  return buildDecision({
    providerId: route.providerId,
    model: route.model,
    role: "primary",
    taskType: taskClassToTaskType(signals.taskClass),
    taskClass: signals.taskClass,
    tier: routeTierToModelTier(route),
    confidence,
    source,
    rationale: route.ruleId ? `${rationale} → ${route.ruleId}` : rationale,
    ruleId: route.ruleId,
    ruleReason: route.reason,
    stance: profile.stance,
    signals: summarizeRouterSignals(signals),
    effort: route.effort,
    currentProviderId: args.currentProviderId,
    stick: classifierStick,
  });
}
