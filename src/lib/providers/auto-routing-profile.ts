import { i18n } from "@/i18n/runtime";
import {
  CLAUDE_FABLE_MODEL,
  clampCodexEffortToModel,
  DEFAULT_CLAUDE_HAIKU_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  getDefaultModelForProvider,
  getModelCapability,
  getProviderLabel,
  getSdkModelOptions,
  isAutoModelId,
  listProviderIds,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
  toHumanModelName,
  type ModelTier,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export const AUTO_ROUTING_PROFILE_VERSION = 5 as const;

export const TASK_CLASSES = [
  "plan",
  "implement",
  "quick-edit",
  "debug",
  "review",
  "ci-fix",
  "docs",
  "research",
  "safety-critical",
] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

export const ROUTER_ROLES = ["primary", "advisor", "worker", "delegate"] as const;
export type RouterRole = (typeof ROUTER_ROLES)[number];

/** Roles a rule can be written for: the task's own turns and delegated tasks. */
export const SELECTABLE_ROUTER_ROLES = ["primary", "delegate"] as const satisfies readonly RouterRole[];
/**
 * Roles nothing routes any more: second opinions and in-turn workers are
 * subagents now. Still parsed, so a stored rule stays readable instead of
 * vanishing, but never offered for a new rule, a starter, or Reset.
 */
export const LEGACY_ROUTER_ROLES = ["advisor", "worker"] as const satisfies readonly RouterRole[];

export function isLegacyRouterRole(role: RouterRole): boolean {
  return (LEGACY_ROUTER_ROLES as readonly RouterRole[]).includes(role);
}

export const STANCES = ["cost-saver", "balanced", "quality-first"] as const;
export type Stance = (typeof STANCES)[number];

/**
 * One ordinal difficulty scale, lowest first: the classifier's complexity
 * answer and the condition a rule can name. See `ROUTE_LEVELS`.
 */
export const ROUTE_COMPLEXITIES = ["low", "medium", "high", "expert", "extreme"] as const;
export type RouteComplexity = (typeof ROUTE_COMPLEXITIES)[number];

/**
 * Strength rungs the router reasons in. Distinct from `ModelTier` on purpose:
 * the catalog groups Fable and Opus under one `frontier` tier, while routing
 * needs to tell "the most capable model" apart from "the everyday flagship".
 * Ordered strongest first so a stance step of +1 means "one rung stronger".
 */
export const ROUTE_TIERS = ["frontier", "flagship", "balanced", "light"] as const;
export type RouteTier = (typeof ROUTE_TIERS)[number];

/**
 * Provider selectors a rule may name. Concrete ids pin a provider;
 * `any-eligible` follows the provider already running the task (or the
 * primary, for delegated roles); `alternate-provider` picks the *other*
 * provider, which is how cross-model review and second-opinion advice are
 * expressed without hard-coding a provider.
 */
export type RouteProviderSelector =
  | ProviderId
  | "any-eligible"
  | "alternate-provider";

export interface RouteRuleWhen {
  taskClass?: TaskClass;
  /** Absent means the rule applies to the primary turn only. */
  role?: RouterRole;
  /** Slash command / skill names (without the leading slash). */
  skill?: string[];
  complexity?: RouteComplexity;
  sensitive?: boolean;
  /** Fires only when the tightest usage window is at least this percent used. */
  budgetUsedAtLeast?: number;
}

export interface RouteRuleThen {
  providerId: RouteProviderSelector;
  /** Exact model id; when set it wins over `tier`. */
  model?: string;
  tier?: RouteTier;
  /** Effort name on the provider's own scale; absent follows the model default. */
  effort?: string;
}

export interface RouteRule {
  id: string;
  when: RouteRuleWhen;
  then: RouteRuleThen;
  /** Short human sentence shown wherever the decision is surfaced. */
  reason: string;
  enabled: boolean;
}

export interface RouteFallback {
  model: string;
  effort?: string;
}

export interface BudgetGuard {
  /** Percent of the tightest usage window at which routes step one rung down. */
  stepDownAt: number;
  /** Percent at which every route collapses to the cheapest eligible model. */
  cheapestAt: number;
}

export interface RouterSignalToggles {
  classifier: boolean;
  skillRouting: boolean;
  budgetGuard: boolean;
  safetyEscalation: boolean;
  providerSwitch: boolean;
}

export interface AutoRoutingProfile {
  version: typeof AUTO_ROUTING_PROFILE_VERSION;
  id: string;
  name: string;
  stance: Stance;
  rules: RouteRule[];
  fallbacks: Record<ProviderId, RouteFallback>;
  /** Empty (or absent) means every catalog model of that provider is eligible. */
  eligibleModelsByProvider: Partial<Record<ProviderId, string[]>>;
  budgetGuard: BudgetGuard;
  signals: RouterSignalToggles;
}

/* -------------------------------------------------------------------------- */
/* Ladders                                                                    */
/* -------------------------------------------------------------------------- */

const ROUTE_TIER_BY_MODEL: Readonly<Record<string, RouteTier>> = {
  [CLAUDE_FABLE_MODEL]: "frontier",
  "claude-fable-5": "frontier",
  [DEFAULT_CLAUDE_OPUS_MODEL]: "flagship",
  [DEFAULT_CLAUDE_OPUS_1M_MODEL]: "flagship",
  opusplan: "flagship",
  [DEFAULT_CLAUDE_SONNET_MODEL]: "balanced",
  [DEFAULT_CLAUDE_SONNET_1M_MODEL]: "balanced",
  "claude-sonnet-5": "balanced",
  "claude-sonnet-5[1m]": "balanced",
  [DEFAULT_CLAUDE_HAIKU_MODEL]: "light",
  "gpt-6-astra": "frontier",
  "gpt-6.1-sol": "flagship",
  "gpt-6-sol": "flagship",
  "gpt-6-luna": "light",
  "gpt-5.6-sol": "flagship",
  "gpt-5.5": "flagship",
  "gpt-5.6-terra": "balanced",
  "gpt-5.6-luna": "light",
};

const MODEL_TIER_TO_ROUTE_TIER: Readonly<Record<ModelTier, RouteTier>> = {
  frontier: "flagship",
  heavy: "balanced",
  standard: "balanced",
  light: "light",
};

/**
 * Default effort per rung when a rule names a tier without an effort. Every
 * rung starts at medium: the level a task is classified at, not the rung,
 * decides when deeper effort is worth paying for (see `ROUTE_LEVELS`).
 */
const DEFAULT_EFFORT_BY_ROUTE_TIER: Readonly<Record<RouteTier, string>> = {
  frontier: "medium",
  flagship: "medium",
  balanced: "medium",
  light: "medium",
};

/**
 * Catalog models Auto does not pick unless the user allows them explicitly.
 * Haiku rejects an effort value and sits below what Stave treats as the
 * lightest useful coding model; Sonnet is the light Claude route.
 */
export const AUTO_ROUTING_OPT_IN_MODELS: ReadonlySet<string> = new Set([
  DEFAULT_CLAUDE_HAIKU_MODEL,
]);

/**
 * Models whose per-message effort changes keep the prompt cache warm, so the
 * budget guard lowers their effort instead of swapping the model (a model
 * switch always invalidates the cache and reprices that turn's input ~10×).
 */
const CACHE_PRESERVING_EFFORT_MODELS: ReadonlySet<string> = new Set([
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
]);

const CLAUDE_EFFORT_SCALE = ["low", "medium", "high", "xhigh", "max"] as const;
const CODEX_EFFORT_SCALE = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

/** Models that reject an explicit effort value outright. */
const MODELS_WITHOUT_EFFORT: ReadonlySet<string> = new Set([
  DEFAULT_CLAUDE_HAIKU_MODEL,
]);

export function resolveRouteTierForModel(model: string): RouteTier {
  const trimmed = model.trim();
  const known = ROUTE_TIER_BY_MODEL[trimmed];
  if (known) {
    return known;
  }
  if (isAutoModelId({ model: trimmed })) {
    return "light";
  }
  const capability = getModelCapability({ model: trimmed });
  return capability ? MODEL_TIER_TO_ROUTE_TIER[capability.tier] : "balanced";
}

function routeTierIndex(tier: RouteTier) {
  return ROUTE_TIERS.indexOf(tier);
}

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/* -------------------------------------------------------------------------- */
/* Stance                                                                     */
/* -------------------------------------------------------------------------- */

export const STANCE_LABELS: Readonly<Record<Stance, string>> = {
  "cost-saver": "Cost-saver",
  get balanced() { return i18n.t("providers:autoRoutingProfile.balanced"); },
  "quality-first": "Quality-first",
};

export const STANCE_DESCRIPTIONS: Readonly<Record<Stance, string>> = {
  get "cost-saver"() { return i18n.t("providers:autoRoutingProfile.sameModelsEachLevelRunsAt"); },
  get balanced() { return i18n.t("providers:autoRoutingProfile.sameModelsEachLevelRunsAtVariant2ab0fa3e"); },
  get "quality-first"() { return i18n.t("providers:autoRoutingProfile.sameModelsEachLevelRunsAtVariantc38c22b1"); },
};

/** Effort step the stance applies inside the level's effort range. */
const STANCE_SHIFT: Readonly<Record<Stance, -1 | 0 | 1>> = {
  "cost-saver": -1,
  balanced: 0,
  "quality-first": 1,
};

export const STANCE_BUDGET_GUARD: Readonly<Record<Stance, BudgetGuard>> = {
  "cost-saver": { stepDownAt: 60, cheapestAt: 90 },
  balanced: { stepDownAt: 80, cheapestAt: 97 },
  "quality-first": { stepDownAt: 90, cheapestAt: 99 },
};

/** Legacy 0..1 cost↔quality objective, kept in sync for older readers. */
export const STANCE_OBJECTIVE: Readonly<Record<Stance, number>> = {
  "cost-saver": 0.15,
  balanced: 0.5,
  "quality-first": 0.85,
};

export function stanceFromObjective(objective: number | undefined): Stance {
  if (typeof objective !== "number" || !Number.isFinite(objective)) {
    return "balanced";
  }
  if (objective <= 0.2) {
    return "cost-saver";
  }
  if (objective >= 0.8) {
    return "quality-first";
  }
  return "balanced";
}

export interface AppliedStance {
  stance: Stance;
  /**
   * Effort step every route moves by: −1, 0 or +1, clamped to the effort
   * range of the task's level. The stance never changes the model rung: the
   * level decides the model, the stance only how hard it thinks.
   */
  shift: -1 | 0 | 1;
  budgetGuard: BudgetGuard;
}

/** What the profile's stance does to every route, before any rule runs. */
export function applyStance(profile: AutoRoutingProfile): AppliedStance {
  return {
    stance: profile.stance,
    shift: STANCE_SHIFT[profile.stance],
    budgetGuard: profile.budgetGuard,
  };
}

/** Change preference while preserving manually customized budget thresholds. */
export function withStance(
  profile: AutoRoutingProfile,
  stance: Stance,
): AutoRoutingProfile {
  return {
    ...profile,
    ...(isStarterProfileId(profile.id)
      ? { id: `starter-${stance}`, name: STANCE_LABELS[stance] }
      : {}),
    stance,
    budgetGuard: profile.budgetGuard.stepDownAt === STANCE_BUDGET_GUARD[profile.stance].stepDownAt
      && profile.budgetGuard.cheapestAt === STANCE_BUDGET_GUARD[profile.stance].cheapestAt
      ? { ...STANCE_BUDGET_GUARD[stance] }
      : { ...profile.budgetGuard },
  };
}

/* -------------------------------------------------------------------------- */
/* Starter profiles                                                           */
/* -------------------------------------------------------------------------- */

export const TASK_CLASS_LABELS: Readonly<Record<TaskClass, string>> = {
  get plan() { return i18n.t("settingsProviders:cursorSection.modes.plan.label"); },
  get implement() { return i18n.t("providers:autoRoutingProfile.implement"); },
  get "quick-edit"() { return i18n.t("providers:autoRoutingProfile.quickEdit"); },
  get debug() { return i18n.t("providers:autoRoutingProfile.debug"); },
  get review() { return i18n.t("settingsConnections:settingsDialogAutoRoutingWizard.review"); },
  get "ci-fix"() { return i18n.t("providers:autoRoutingProfile.ciFix"); },
  get docs() { return i18n.t("providers:autoRoutingProfile.docs"); },
  get research() { return i18n.t("providers:autoRoutingProfile.research"); },
  "safety-critical": "Safety-critical",
};

export const ROUTER_ROLE_LABELS: Readonly<Record<RouterRole, string>> = {
  get primary() { return i18n.t("settingsProviders:codexOverviewTab.rateLimits.primary"); },
  get advisor() { return i18n.t("providers:autoRoutingProfile.advisor"); },
  get worker() { return i18n.t("providers:autoRoutingProfile.worker"); },
  get delegate() { return i18n.t("providers:autoRoutingProfile.delegate"); },
};

export const ROUTE_TIER_LABELS: Readonly<Record<RouteTier, string>> = {
  get frontier() { return i18n.t("providers:autoRoutingProfile.frontier"); },
  get flagship() { return i18n.t("providers:autoRoutingProfile.flagship"); },
  get balanced() { return i18n.t("providers:autoRoutingProfile.balanced"); },
  get light() { return i18n.t("settings:themeSection.appearance.light"); },
};

function rule(
  id: string,
  when: RouteRuleWhen,
  then: RouteRuleThen,
  reason: string,
): RouteRule {
  return { id, when, then, reason, enabled: true };
}

export const ROUTE_COMPLEXITY_LABELS: Readonly<Record<RouteComplexity, string>> = {
  get low() { return i18n.t("providers:autoRoutingProfile.simple"); },
  get medium() { return i18n.t("providers:autoRoutingProfile.standard"); },
  get high() { return i18n.t("providers:autoRoutingProfile.complex"); },
  get expert() { return i18n.t("providers:autoRoutingProfile.expert"); },
  get extreme() { return i18n.t("providers:autoRoutingProfile.extreme"); },
};

export interface RouteLevel {
  complexity: RouteComplexity;
  /** Plain-language description of the work this level covers. */
  description: string;
  /** Rung the level's default rule asks for. */
  tier: RouteTier;
  /** Weakest rung the level may land on, under budget pressure included. */
  floor: RouteTier;
  /** Balanced-stance effort. */
  effort: string;
  /** Effort range a stance may move within: [cost-saver end, quality-first end]. */
  effortRange: readonly [string, string];
}

/**
 * The routing ladder, lowest level first. Each level is one model rung and an
 * effort range; the preference picks a point inside the range.
 *
 *   Simple    light (Sonnet 5.5 / GPT-6 Luna)            low – medium
 *   Standard  flagship (Opus 5.5 / GPT-6.1 Sol)          medium – high
 *   Complex   flagship                                   high – xhigh
 *   Expert    frontier (Fable 5.1 / GPT-6 Astra)         low – medium
 *   Extreme   frontier                                   high – xhigh
 *
 * Most work is Standard. The frontier rungs need explicit evidence from the
 * classifier; local rules never infer them.
 */
export const ROUTE_LEVELS: readonly RouteLevel[] = [
  {
    complexity: "low",
    get description() { return i18n.t("providers:autoRoutingProfile.aBoundedObviousStepATypo"); },
    tier: "light",
    floor: "light",
    effort: "medium",
    effortRange: ["low", "medium"],
  },
  {
    complexity: "medium",
    get description() { return i18n.t("providers:autoRoutingProfile.ordinaryConnectedWorkInKnownCode"); },
    tier: "flagship",
    floor: "balanced",
    effort: "medium",
    effortRange: ["medium", "high"],
  },
  {
    complexity: "high",
    get description() { return i18n.t("providers:autoRoutingProfile.difficultCoupledWorkCrossModuleChanges"); },
    tier: "flagship",
    floor: "flagship",
    effort: "high",
    effortRange: ["high", "xhigh"],
  },
  {
    complexity: "expert",
    get description() { return i18n.t("providers:autoRoutingProfile.judgmentBeyondStrongImplementationArchitectureDesign"); },
    tier: "frontier",
    floor: "flagship",
    effort: "medium",
    effortRange: ["low", "medium"],
  },
  {
    complexity: "extreme",
    get description() { return i18n.t("providers:autoRoutingProfile.exceptionalResearchGradeReasoningRareBy"); },
    tier: "frontier",
    floor: "frontier",
    effort: "high",
    effortRange: ["high", "xhigh"],
  },
];

export function getRouteLevel(complexity: RouteComplexity): RouteLevel {
  return ROUTE_LEVELS.find((level) => level.complexity === complexity) ?? ROUTE_LEVELS[1]!;
}

function complexityIndex(complexity: RouteComplexity) {
  return ROUTE_COMPLEXITIES.indexOf(complexity);
}

/** The stronger of two levels. */
export function maxComplexity(left: RouteComplexity, right: RouteComplexity): RouteComplexity {
  return complexityIndex(left) >= complexityIndex(right) ? left : right;
}

const LEVEL_RULE_REASONS: Readonly<Record<RouteComplexity, string>> = {
  get low() { return i18n.t("providers:autoRoutingProfile.aClearlyBoundedTaskRunsOn"); },
  get medium() { return i18n.t("providers:autoRoutingProfile.ordinaryWorkRunsOnTheFlagship"); },
  get high() { return i18n.t("providers:autoRoutingProfile.complexWorkRunsOnTheFlagship"); },
  get expert() { return i18n.t("providers:autoRoutingProfile.expertDesignOrVerificationWorkRuns"); },
  get extreme() { return i18n.t("providers:autoRoutingProfile.exceptionalReasoningRunsOnTheFrontier"); },
};

/**
 * One shared role table; the three starters differ only by stance. The two
 * frontier levels come first so a sensitive expert task keeps its rung; a
 * sensitive task otherwise runs at least as Complex work.
 */
export function buildStarterRules(): RouteRule[] {
  const levelRule = (complexity: RouteComplexity) => {
    const level = getRouteLevel(complexity);
    return rule(complexity === "low" ? "bounded" : complexity === "medium" ? "standard" : complexity === "high" ? "complex" : complexity,
      { complexity },
      { providerId: "any-eligible", tier: level.tier, effort: level.effort },
      LEVEL_RULE_REASONS[complexity]);
  };
  return [
    rule("delegate-default", { role: "delegate" },
      { providerId: "any-eligible", tier: "flagship", effort: "medium" },
      i18n.t("providers:autoRoutingProfile.delegatedTasksStartOnTheFlagship")),
    levelRule("extreme"),
    levelRule("expert"),
    rule("safety-critical", { taskClass: "safety-critical" },
      { providerId: "any-eligible", tier: "flagship", effort: "high" },
      i18n.t("providers:autoRoutingProfile.sensitiveChangesRunOnTheFlagship")),
    levelRule("high"),
    levelRule("medium"),
    levelRule("low"),
  ];
}

function buildDefaultFallbacks(): Record<ProviderId, RouteFallback> {
  const fallbacks = {} as Record<ProviderId, RouteFallback>;
  for (const providerId of listProviderIds()) {
    fallbacks[providerId] = {
      model: getDefaultModelForProvider({ providerId }),
    };
  }
  return fallbacks;
}

export function buildDefaultSignalToggles(): RouterSignalToggles {
  return {
    classifier: true,
    skillRouting: true,
    budgetGuard: true,
    safetyEscalation: true,
    providerSwitch: false,
  };
}

export const STARTER_PROFILE_IDS = [
  "starter-balanced",
  "starter-cost-saver",
  "starter-quality-first",
] as const;
export type StarterProfileId = (typeof STARTER_PROFILE_IDS)[number];

const STARTER_STANCE_BY_ID: Readonly<Record<StarterProfileId, Stance>> = {
  "starter-balanced": "balanced",
  "starter-cost-saver": "cost-saver",
  "starter-quality-first": "quality-first",
};

export function buildStarterProfile(id: StarterProfileId): AutoRoutingProfile {
  // Persisted ids from older builds may not match; balanced is the safe rung.
  const stance: Stance = STARTER_STANCE_BY_ID[id] ?? "balanced";
  return {
    version: AUTO_ROUTING_PROFILE_VERSION,
    id,
    name: STANCE_LABELS[stance],
    stance,
    rules: buildStarterRules(),
    fallbacks: buildDefaultFallbacks(),
    eligibleModelsByProvider: {},
    budgetGuard: { ...STANCE_BUDGET_GUARD[stance] },
    signals: buildDefaultSignalToggles(),
  };
}

export const STARTER_PROFILES: readonly AutoRoutingProfile[] =
  STARTER_PROFILE_IDS.map(buildStarterProfile);

export interface RoleTableGroup {
  role: RouterRole;
  /** A role nothing routes any more; its stored rules are shown read-only. */
  legacy: boolean;
  /** Each rule with its index in `profile.rules`, in table order. */
  rules: Array<{ rule: RouteRule; index: number }>;
}

/**
 * The Role table's groups: the selectable roles always, then a legacy role
 * only when stored rules still name it.
 */
export function buildRoleTableGroups(rules: readonly RouteRule[]): RoleTableGroup[] {
  const byRole = new Map<RouterRole, RoleTableGroup["rules"]>(ROUTER_ROLES.map((role) => [role, []]));
  rules.forEach((rule, index) => byRole.get(rule.when.role ?? "primary")?.push({ rule, index }));
  return [...SELECTABLE_ROUTER_ROLES, ...LEGACY_ROUTER_ROLES]
    .map((role) => ({ role, legacy: isLegacyRouterRole(role), rules: byRole.get(role) ?? [] }))
    .filter((group) => !group.legacy || group.rules.length > 0);
}

export const DEFAULT_AUTO_ROUTING_PROFILE_ID: StarterProfileId =
  "starter-balanced";

export function isStarterProfileId(value: string): value is StarterProfileId {
  return (STARTER_PROFILE_IDS as readonly string[]).includes(value);
}

export const CUSTOM_PROFILE_ID = "custom";

/** A user-owned copy the editor can mutate without touching the starters. */
export function cloneProfileAsCustom(
  profile: AutoRoutingProfile,
): AutoRoutingProfile {
  return {
    ...structuredCloneProfile(profile),
    id: CUSTOM_PROFILE_ID,
    name: i18n.t("common:labels.custom"),
  };
}

function structuredCloneProfile(profile: AutoRoutingProfile): AutoRoutingProfile {
  return {
    ...profile,
    rules: profile.rules.map((entry) => ({
      ...entry,
      when: { ...entry.when, ...(entry.when.skill ? { skill: [...entry.when.skill] } : {}) },
      then: { ...entry.then },
    })),
    fallbacks: Object.fromEntries(
      Object.entries(profile.fallbacks).map(([key, value]) => [key, { ...value }]),
    ) as Record<ProviderId, RouteFallback>,
    eligibleModelsByProvider: Object.fromEntries(
      Object.entries(profile.eligibleModelsByProvider).map(([key, value]) => [
        key,
        [...(value ?? [])],
      ]),
    ),
    budgetGuard: { ...profile.budgetGuard },
    signals: { ...profile.signals },
  };
}

/* -------------------------------------------------------------------------- */
/* Validation and migration                                                   */
/* -------------------------------------------------------------------------- */

const PROVIDER_ID_SET: ReadonlySet<string> = new Set(listProviderIds());

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_ID_SET.has(value);
}

function isProviderSelector(value: unknown): value is RouteProviderSelector {
  return (
    isProviderId(value) ||
    value === "any-eligible" ||
    value === "alternate-provider"
  );
}

function normalizePercent(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
}

function normalizeRule(value: unknown, index: number): RouteRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<RouteRule>;
  const when = (candidate.when ?? {}) as Partial<RouteRuleWhen>;
  const then = (candidate.then ?? {}) as Partial<RouteRuleThen>;
  if (!isProviderSelector(then.providerId)) {
    return null;
  }
  const skill = normalizeStringList(when.skill).map((entry) =>
    entry.replace(/^\//, "").toLowerCase(),
  );
  const normalizedWhen: RouteRuleWhen = {
    ...(TASK_CLASSES.includes(when.taskClass as TaskClass)
      ? { taskClass: when.taskClass as TaskClass }
      : {}),
    ...(ROUTER_ROLES.includes(when.role as RouterRole)
      ? { role: when.role as RouterRole }
      : {}),
    ...(skill.length > 0 ? { skill } : {}),
    ...(ROUTE_COMPLEXITIES.includes(when.complexity as RouteComplexity)
      ? { complexity: when.complexity as RouteComplexity }
      : {}),
    ...(typeof when.sensitive === "boolean" ? { sensitive: when.sensitive } : {}),
    ...(typeof when.budgetUsedAtLeast === "number" &&
    Number.isFinite(when.budgetUsedAtLeast)
      ? { budgetUsedAtLeast: normalizePercent(when.budgetUsedAtLeast, 0) }
      : {}),
  };
  const model = typeof then.model === "string" ? then.model.trim() : "";
  const effort = typeof then.effort === "string" ? then.effort.trim() : "";
  const normalizedThen: RouteRuleThen = {
    providerId: then.providerId,
    ...(model ? { model: model.slice(0, 200) } : {}),
    ...(ROUTE_TIERS.includes(then.tier as RouteTier)
      ? { tier: then.tier as RouteTier }
      : {}),
    ...(effort ? { effort: effort.slice(0, 20) } : {}),
  };
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim().slice(0, 80)
      : `rule-${index + 1}`;
  return {
    id,
    when: normalizedWhen,
    then: normalizedThen,
    reason:
      typeof candidate.reason === "string"
        ? candidate.reason.trim().slice(0, 240)
        : "",
    enabled: candidate.enabled !== false,
  };
}

/**
 * Coerces any persisted or imported value into a well-formed profile. Unknown
 * or malformed fields fall back to the balanced starter rather than failing the
 * whole settings load: the router is a convenience, not a gate.
 */
export function validateProfile(value: unknown): AutoRoutingProfile {
  const starter = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID);
  if (!value || typeof value !== "object") {
    return starter;
  }
  const candidate = value as Partial<AutoRoutingProfile> & {
    rules?: unknown;
    fallbacks?: unknown;
    eligibleModelsByProvider?: unknown;
    budgetGuard?: unknown;
    signals?: unknown;
  };
  const stance = STANCES.includes(candidate.stance as Stance)
    ? (candidate.stance as Stance)
    : starter.stance;
  const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
  // temporary-migration: auto-routing-profile-v5
  // Version 5 replaced the complexity ladder. A starter profile saved before
  // it carries the previous starter table, whose tiers no longer match the
  // levels, so it takes the current table. Custom tables are kept as saved.
  const staleStarterTable =
    (typeof candidate.version !== "number" || candidate.version < AUTO_ROUTING_PROFILE_VERSION)
    && isStarterProfileId(rawId);
  // end temporary-migration: auto-routing-profile-v5
  const rules = Array.isArray(candidate.rules) && !staleStarterTable
    ? candidate.rules
        .map((entry, index) => normalizeRule(entry, index))
        .filter((entry): entry is RouteRule => entry !== null)
    : starter.rules;
  const seenRuleIds = new Set<string>();
  const dedupedRules = rules.map((entry) => {
    let id = entry.id;
    let suffix = 2;
    while (seenRuleIds.has(id)) {
      id = `${entry.id}-${suffix}`;
      suffix += 1;
    }
    seenRuleIds.add(id);
    return id === entry.id ? entry : { ...entry, id };
  });

  const fallbacks = buildDefaultFallbacks();
  if (candidate.fallbacks && typeof candidate.fallbacks === "object") {
    for (const providerId of listProviderIds()) {
      const entry = (candidate.fallbacks as Record<string, unknown>)[providerId];
      if (entry && typeof entry === "object") {
        const model = (entry as { model?: unknown }).model;
        const effort = (entry as { effort?: unknown }).effort;
        if (typeof model === "string" && model.trim()) {
          fallbacks[providerId] = {
            model: model.trim().slice(0, 200),
            ...(typeof effort === "string" && effort.trim()
              ? { effort: effort.trim().slice(0, 20) }
              : {}),
          };
        }
      }
    }
  }

  const eligibleModelsByProvider: Partial<Record<ProviderId, string[]>> = {};
  if (
    candidate.eligibleModelsByProvider &&
    typeof candidate.eligibleModelsByProvider === "object"
  ) {
    for (const providerId of listProviderIds()) {
      const models = normalizeStringList(
        (candidate.eligibleModelsByProvider as Record<string, unknown>)[providerId],
      );
      if (models.length > 0) {
        eligibleModelsByProvider[providerId] = models;
      }
    }
  }

  const stanceGuard = STANCE_BUDGET_GUARD[stance];
  const rawGuard = (candidate.budgetGuard ?? {}) as Partial<BudgetGuard>;
  const stepDownAt = normalizePercent(rawGuard.stepDownAt, stanceGuard.stepDownAt);
  const cheapestAt = Math.max(
    stepDownAt,
    normalizePercent(rawGuard.cheapestAt, stanceGuard.cheapestAt),
  );

  const rawSignals = (candidate.signals ?? {}) as Partial<RouterSignalToggles>;
  const defaults = buildDefaultSignalToggles();
  const signals: RouterSignalToggles = {
    // An explicit opt-out is honored from version 4, which first made
    // classification the default.
    classifier:
      typeof candidate.version === "number" && candidate.version >= 4 && typeof rawSignals.classifier === "boolean"
        ? rawSignals.classifier
        : defaults.classifier,
    skillRouting:
      typeof rawSignals.skillRouting === "boolean"
        ? rawSignals.skillRouting
        : defaults.skillRouting,
    budgetGuard:
      typeof rawSignals.budgetGuard === "boolean"
        ? rawSignals.budgetGuard
        : defaults.budgetGuard,
    safetyEscalation:
      typeof rawSignals.safetyEscalation === "boolean"
        ? rawSignals.safetyEscalation
        : defaults.safetyEscalation,
    providerSwitch:
      typeof rawSignals.providerSwitch === "boolean"
        ? rawSignals.providerSwitch
        : defaults.providerSwitch,
  };

  const id = rawId ? rawId.slice(0, 80) : starter.id;
  return {
    version: AUTO_ROUTING_PROFILE_VERSION,
    id,
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim().slice(0, 80)
        : isStarterProfileId(id)
          ? STANCE_LABELS[stance]
          : i18n.t("common:labels.custom"),
    stance,
    rules: dedupedRules,
    fallbacks,
    eligibleModelsByProvider,
    budgetGuard: { stepDownAt, cheapestAt },
    signals,
  };
}

export interface LegacyAutoRoutingSettings {
  autoRoutingUseClassifier?: unknown;
  autoRoutingObjective?: unknown;
  autoRoutingSafetyEscalation?: unknown;
  autoRoutingAllowProviderSwitch?: unknown;
  autoRoutingEligibleClaudeModels?: unknown;
  autoRoutingEligibleCodexModels?: unknown;
}

/**
 * Builds the current profile from legacy flags: the objective slider becomes a
 * stance, the switch toggles become signal toggles, and the eligible chip lists
 * carry over unchanged. The role table itself is the shared starter.
 */
export function migrateLegacyAutoSettings(
  settings: LegacyAutoRoutingSettings,
): AutoRoutingProfile {
  const stance = stanceFromObjective(
    typeof settings.autoRoutingObjective === "number"
      ? settings.autoRoutingObjective
      : undefined,
  );
  const starterId: StarterProfileId =
    stance === "cost-saver"
      ? "starter-cost-saver"
      : stance === "quality-first"
        ? "starter-quality-first"
        : "starter-balanced";
  const profile = buildStarterProfile(starterId);
  const defaults = profile.signals;
  const claude = normalizeStringList(settings.autoRoutingEligibleClaudeModels);
  const codex = normalizeStringList(settings.autoRoutingEligibleCodexModels);
  return {
    ...profile,
    eligibleModelsByProvider: {
      ...(claude.length > 0 ? { "claude-code": claude } : {}),
      ...(codex.length > 0 ? { codex } : {}),
    },
    signals: {
      ...defaults,
      // Model-first routing replaces the legacy opt-in behavior.
      classifier: true,
      safetyEscalation:
        typeof settings.autoRoutingSafetyEscalation === "boolean"
          ? settings.autoRoutingSafetyEscalation
          : defaults.safetyEscalation,
      providerSwitch:
        typeof settings.autoRoutingAllowProviderSwitch === "boolean"
          ? settings.autoRoutingAllowProviderSwitch
          : defaults.providerSwitch,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

export interface RouterSignals {
  /** Conservative capability floor when classification cannot establish scope. */
  uncertain?: boolean;
  newTask?: boolean;
  taskClass: TaskClass;
  complexity: RouteComplexity;
  sensitive: boolean;
  /** Slash command or skill name detected at the prompt start, without `/`. */
  skill?: string;
  phase?: "plan" | "execute";
  fileContextCount: number;
  /** Tightest usage window of the provider currently running the task. */
  budgetUsedPercent?: number;
  budgetUsedPercentByProvider?: Partial<Record<ProviderId, number>>;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  /** Provider that produced the most recent assistant turn, when any. */
  lastAssistantProvider?: ProviderId | null;
  /**
   * Model that produced the most recent assistant turn, when any. Prompt
   * caches are model-scoped, so a primary route that merely steps down from
   * this model re-reads the whole conversation at the uncached rate.
   */
  lastAssistantModel?: string | null;
  /** Provider the task (or the primary, for delegated roles) runs on. */
  currentProviderId: ProviderId;
  /** Model the primary is pinned to; lets the advisor avoid answering itself. */
  currentModel?: string;
}

export interface ResolvedRoute {
  role: RouterRole;
  providerId: ProviderId;
  model: string;
  effort?: string;
  tier: RouteTier;
  taskClass: TaskClass;
  /** The level the route ran at, after the safety and uncertainty floors. */
  complexity: RouteComplexity;
  /** `null` when no rule matched and the provider fallback was used. */
  ruleId: string | null;
  reason: string;
  /** Effort step the stance applied: −1, 0 or +1 inside the level's range. */
  stanceShift: -1 | 0 | 1;
  /** 0 when the guard did not fire, −1 for step-down, −2 for cheapest. */
  budgetShift: 0 | -1 | -2;
  /**
   * True when the −1 step lowered effort instead of the rung because the
   * model keeps its prompt cache across effort changes.
   */
  budgetHeldModel: boolean;
  /**
   * True when the primary kept the previous turn's model instead of the
   * cheaper pick, because switching would have re-read the whole conversation
   * uncached. Escalations to a stronger model are never held.
   */
  cacheHeldModel: boolean;
}

export interface ResolveRouteArgs {
  profile: AutoRoutingProfile;
  signals: RouterSignals;
  role: RouterRole;
  /** Runtime-advertised models for providers whose catalog is not static. */
  runtimeModelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
}

function providerCatalog(
  providerId: ProviderId,
  runtimeModels: readonly string[] | undefined,
) {
  const catalog = getSdkModelOptions({ providerId }) as readonly string[];
  if (runtimeModels && runtimeModels.length > 0) {
    return [...new Set([...catalog, ...runtimeModels])];
  }
  return [...catalog];
}

/** Eligible models for a provider, ordered strongest rung first. */
export function listEligibleRouteModels(args: {
  profile: AutoRoutingProfile;
  providerId: ProviderId;
  runtimeModels?: readonly string[];
}) {
  const configured = args.profile.eligibleModelsByProvider[args.providerId] ?? [];
  const catalog = providerCatalog(args.providerId, args.runtimeModels);
  const candidates = configured.length > 0
    ? configured
    : catalog.filter((model) => !AUTO_ROUTING_OPT_IN_MODELS.has(model));
  return [...candidates].sort(
    (left, right) =>
      routeTierIndex(resolveRouteTierForModel(left)) -
      routeTierIndex(resolveRouteTierForModel(right)),
  );
}

function pickModelForTier(args: {
  models: readonly string[];
  tier: RouteTier;
}): { model: string; tier: RouteTier } | null {
  if (args.models.length === 0) {
    return null;
  }
  const requested = routeTierIndex(args.tier);
  let best: { model: string; tier: RouteTier; distance: number } | null = null;
  for (const model of args.models) {
    const tier = resolveRouteTierForModel(model);
    const distance = Math.abs(routeTierIndex(tier) - requested);
    if (
      !best ||
      distance < best.distance ||
      // Tie: prefer the stronger rung so a step-down never lands weaker than
      // asked when an equally near stronger model exists.
      (distance === best.distance && routeTierIndex(tier) < routeTierIndex(best.tier))
    ) {
      best = { model, tier, distance };
    }
  }
  return best ? { model: best.model, tier: best.tier } : null;
}

function shiftTierWithinModels(args: {
  models: readonly string[];
  tier: RouteTier;
  shift: number;
}): RouteTier {
  const available = args.models.map((model) =>
    routeTierIndex(resolveRouteTierForModel(model)),
  );
  const min = available.length > 0 ? Math.min(...available) : 0;
  const max = available.length > 0 ? Math.max(...available) : ROUTE_TIERS.length - 1;
  // Rungs run strongest-first, so a +1 (stronger) step lowers the index.
  const index = clampIndex(routeTierIndex(args.tier) - args.shift, min, max);
  return ROUTE_TIERS[index] ?? args.tier;
}

function shiftEffort(args: {
  providerId: ProviderId;
  model: string;
  effort: string;
  shift: number;
}): string {
  const scale =
    args.providerId === "codex" ? CODEX_EFFORT_SCALE : CLAUDE_EFFORT_SCALE;
  const current = Math.max(0, (scale as readonly string[]).indexOf(args.effort));
  const next = clampIndex(current + args.shift, 0, scale.length - 1);
  return scale[next] ?? args.effort;
}

function resolveEffort(args: {
  providerId: ProviderId;
  model: string;
  requested: string | undefined;
  tier: RouteTier;
  shift: number;
}): string | undefined {
  if (args.providerId !== "claude-code" && args.providerId !== "codex") {
    return undefined;
  }
  if (MODELS_WITHOUT_EFFORT.has(args.model)) {
    return undefined;
  }
  // The router's own ladder is the source of truth for tier-only rules; the
  // catalog default only backstops a value the provider scale rejects.
  const base = args.requested ?? DEFAULT_EFFORT_BY_ROUTE_TIER[args.tier];
  const shifted = args.shift === 0
    ? base
    : shiftEffort({ ...args, effort: base });
  if (args.providerId === "claude-code") {
    const clamped = shifted === "ultra" ? "max" : shifted;
    return (CLAUDE_EFFORT_SCALE as readonly string[]).includes(clamped)
      ? clamped
      : resolveDefaultClaudeEffortForModel({ model: args.model });
  }
  const codexEffort = (CODEX_EFFORT_SCALE as readonly string[]).includes(shifted)
    ? (shifted as (typeof CODEX_EFFORT_SCALE)[number])
    : resolveDefaultCodexEffortForModel({ model: args.model });
  const clamped = clampCodexEffortToModel({ model: args.model, effort: codexEffort });
  return clamped === "minimal" ? "low" : clamped;
}

function otherProvider(providerId: ProviderId): ProviderId {
  return providerId === "codex" ? "claude-code" : "codex";
}

function isAvailable(
  providerId: ProviderId,
  availability: RouterSignals["providerAvailability"],
) {
  return availability?.[providerId] !== false;
}

function ruleMatches(args: {
  rule: RouteRule;
  role: RouterRole;
  signals: RouterSignals;
  skillRouting: boolean;
}) {
  const { when } = args.rule;
  if (!args.rule.enabled) {
    return false;
  }
  if ((when.role ?? "primary") !== args.role) {
    return false;
  }
  if (when.taskClass && when.taskClass !== args.signals.taskClass) {
    return false;
  }
  if (when.skill && when.skill.length > 0) {
    if (!args.skillRouting || !args.signals.skill) {
      return false;
    }
    if (!when.skill.includes(args.signals.skill.toLowerCase())) {
      return false;
    }
  }
  if (when.complexity && when.complexity !== args.signals.complexity) {
    return false;
  }
  if (typeof when.sensitive === "boolean" && when.sensitive !== args.signals.sensitive) {
    return false;
  }
  if (typeof when.budgetUsedAtLeast === "number") {
    const used = args.signals.budgetUsedPercent;
    if (typeof used !== "number" || used < when.budgetUsedAtLeast) {
      return false;
    }
  }
  return true;
}

function resolveProviderCandidates(args: {
  selector: RouteProviderSelector;
  signals: RouterSignals;
  role: RouterRole;
  providerSwitch: boolean;
}): ProviderId[] {
  const { signals } = args;
  const pinned =
    args.role === "primary"
      ? (signals.lastAssistantProvider ?? signals.currentProviderId)
      : signals.currentProviderId;
  const availability = signals.providerAvailability;
  const ordered = (preferred: ProviderId[]) => {
    const rest = listProviderIds().filter((id) => !preferred.includes(id));
    return [...preferred, ...rest].filter((id) => isAvailable(id, availability));
  };
  if (args.selector === "alternate-provider") {
    // Delegated roles only run on the two managed providers; the alternate of
    // an unmanaged primary is whichever managed provider is available first.
    const alternate =
      pinned === "claude-code" || pinned === "codex"
        ? otherProvider(pinned)
        : "claude-code";
    return ordered([alternate, otherProvider(alternate)]);
  }
  // Provider switching is a *preference* about discretionary routing, so with
  // it off Auto stays on the pinned provider. Availability is not a preference:
  // an uninstalled or usage-exhausted provider cannot run the turn, so Auto
  // fails over to one that can rather than resolving to no candidate at all.
  if (args.selector === "any-eligible") {
    return args.providerSwitch || !isAvailable(pinned, availability)
      ? ordered([pinned])
      : [pinned];
  }
  if (!isAvailable(args.selector, availability)) {
    return ordered([pinned]);
  }
  return [args.selector];
}

function isManagedProvider(providerId: ProviderId) {
  return providerId === "claude-code" || providerId === "codex";
}

function eligibleForRole(role: RouterRole, providerId: ProviderId) {
  // Advisors and delegates only run on the managed providers.
  if (role === "advisor" || role === "delegate") {
    return providerId === "claude-code" || providerId === "codex";
  }
  return true;
}

/** The level a turn routes at, after the safety and uncertainty floors. */
export function resolveEffectiveComplexity(args: {
  signals: Pick<RouterSignals, "complexity" | "sensitive" | "uncertain">;
  role: RouterRole;
  safetyEscalation: boolean;
}): RouteComplexity {
  let complexity = args.signals.complexity;
  if (args.role !== "primary") {
    return complexity;
  }
  // Unclear scope keeps an ordinary capable route rather than a light one.
  if (args.signals.uncertain) {
    complexity = maxComplexity(complexity, "medium");
  }
  // A sensitive change needs care (effort), not necessarily the frontier.
  if (args.signals.sensitive && args.safetyEscalation) {
    complexity = maxComplexity(complexity, "high");
  }
  return complexity;
}

function clampEffortToRange(args: {
  providerId: ProviderId;
  effort: string;
  requested: string;
  range: readonly [string, string];
}): string {
  const scale = (args.providerId === "codex" ? CODEX_EFFORT_SCALE : CLAUDE_EFFORT_SCALE) as readonly string[];
  const index = (value: string) => Math.max(0, scale.indexOf(value));
  // The range bounds the stance, never the rule's own choice.
  const low = Math.min(index(args.range[0]), index(args.requested));
  const high = Math.max(index(args.range[1]), index(args.requested));
  return scale[clampIndex(index(args.effort), low, high)] ?? args.effort;
}

function noRouteMessage(complexity: RouteComplexity, floor: RouteTier) {
  return i18n.t("providers:autoRoutingProfile.noAvailableAllowedModelMeetsThis", { value1: ROUTE_COMPLEXITY_LABELS[complexity], value2: ROUTE_TIER_LABELS[floor] });
}

/**
 * Pure resolution: signals × role table × stance → provider, model, effort.
 * No network, no store access, so the Settings dry-run tester can call it on
 * every keystroke and tests can pin every branch.
 *
 * The level decides the rung; the stance moves effort inside the level's
 * range; the budget guard lowers effort or the rung, never below the level's
 * floor. When the provider running the task has no allowed model that meets
 * the floor (an unmanaged provider, or a narrow allow list), Auto hands the
 * turn to an available provider that does, whether or not switching is on.
 */
export function resolveRoute(args: ResolveRouteArgs): ResolvedRoute {
  const { profile, signals, role } = args;
  const stance = applyStance(profile);
  const budgetUsed = signals.budgetUsedPercent;
  const guardOn = profile.signals.budgetGuard && typeof budgetUsed === "number";
  const complexity = resolveEffectiveComplexity({
    signals,
    role,
    safetyEscalation: profile.signals.safetyEscalation,
  });
  const level = getRouteLevel(complexity);
  const minimumTier: RouteTier = role !== "primary" ? "light" : level.floor;
  const satisfiesFloor = (model: string) => routeTierIndex(resolveRouteTierForModel(model)) <= routeTierIndex(minimumTier);
  const budgetShift: ResolvedRoute["budgetShift"] = !guardOn
    ? 0
    : budgetUsed >= profile.budgetGuard.cheapestAt
      ? -2
      : budgetUsed >= profile.budgetGuard.stepDownAt
        ? -1
        : 0;

  const matched = profile.rules.find((entry) =>
    ruleMatches({
      rule: entry,
      role,
      signals: { ...signals, complexity },
      skillRouting: profile.signals.skillRouting,
    }),
  );

  const selector: RouteProviderSelector = matched?.then.providerId ?? "any-eligible";
  const candidates = resolveProviderCandidates({
    selector,
    signals,
    role,
    providerSwitch: profile.signals.providerSwitch,
  }).filter((providerId) => eligibleForRole(role, providerId));
  // Capability failover: providers outside the preferred set, tried only when
  // none of the preferred ones has an allowed model that meets the floor.
  const failover = listProviderIds()
    .filter((providerId) =>
      !candidates.includes(providerId)
      && isAvailable(providerId, signals.providerAvailability)
      && eligibleForRole(role, providerId))
    .sort((left, right) => Number(isManagedProvider(right)) - Number(isManagedProvider(left)));

  const reasonParts: string[] = [];
  if (role === "primary" && signals.uncertain && complexity !== signals.complexity) {
    reasonParts.push(i18n.t("providers:autoRoutingProfile.unclearScopeRoutesAsStandardWork"));
  }
  if (role === "primary" && signals.sensitive && profile.signals.safetyEscalation && complexity !== signals.complexity) {
    reasonParts.push(i18n.t("providers:autoRoutingProfile.aSensitiveChangeRoutesAsComplex"));
  }
  const baseReason = matched?.reason ?? "";
  const preferredProvider = candidates[0] ?? signals.lastAssistantProvider ?? signals.currentProviderId;

  for (const providerId of [...candidates, ...failover]) {
    const models = listEligibleRouteModels({
      profile,
      providerId,
      runtimeModels: args.runtimeModelsByProvider?.[providerId],
    }).filter(satisfiesFloor);
    if (models.length === 0) {
      continue;
    }
    if (role === "advisor" && signals.currentModel) {
      // A second opinion from the same model is not a second opinion.
      const others = models.filter((model) => model !== signals.currentModel);
      if (others.length > 0) {
        models.splice(0, models.length, ...others);
      }
    }
    const failedOver = !candidates.includes(providerId);

    let tier: RouteTier;
    let model: string;
    let budgetHeldModel = false;
    if (budgetShift === -2) {
      const cheapest = pickModelForTier({ models, tier: "light" });
      if (!cheapest) {
        continue;
      }
      tier = cheapest.tier;
      model = cheapest.model;
      reasonParts.push(
        i18n.t("providers:autoRoutingProfile.usageIsAtSoTheLeast", { value1: Math.round(budgetUsed ?? 0) }),
      );
    } else {
      const requestedTier =
        matched?.then.tier ??
        (matched?.then.model
          ? resolveRouteTierForModel(matched.then.model)
          : resolveRouteTierForModel(profile.fallbacks[providerId]?.model ?? models[0] ?? ""));
      const pickAt = (shift: number) => {
        const explicitModel =
          matched?.then.model && models.includes(matched.then.model) && shift === 0
            ? matched.then.model
            : null;
        if (explicitModel) {
          return { model: explicitModel, tier: resolveRouteTierForModel(explicitModel) };
        }
        const shiftedTier = shiftTierWithinModels({ models, tier: requestedTier, shift });
        return pickModelForTier({ models, tier: shiftedTier });
      };
      const levelPick = pickAt(0);
      if (!levelPick) {
        continue;
      }
      // Effort first: when the pick keeps its cache across effort changes,
      // the guard lowers effort and leaves the model alone.
      budgetHeldModel =
        budgetShift === -1 && CACHE_PRESERVING_EFFORT_MODELS.has(levelPick.model);
      const picked = budgetHeldModel || budgetShift === 0 ? levelPick : pickAt(budgetShift);
      if (!picked) {
        continue;
      }
      model = picked.model;
      tier = picked.tier;
      if (budgetShift === -1) {
        reasonParts.push(
          budgetHeldModel
            ? i18n.t("providers:autoRoutingProfile.usageIsAtSoEffortStepped", { value1: Math.round(budgetUsed ?? 0) })
            : i18n.t("providers:autoRoutingProfile.usageIsAtSoTheRoute", { value1: Math.round(budgetUsed ?? 0) }),
        );
      }
    }
    if (failedOver) {
      reasonParts.push(
        i18n.t("providers:autoRoutingProfile.hasNoAllowedModelForWork", { value1: getProviderLabel({ providerId: preferredProvider }), value2: ROUTE_COMPLEXITY_LABELS[complexity].toLowerCase(), value3: getProviderLabel({ providerId }) }),
      );
    }

    // Cache stickiness. A model switch mid-task re-reads the whole
    // conversation at the uncached rate, which for a long task dwarfs the
    // per-turn saving of a cheaper model. Keep the previous turn's model when
    // the pick is merely a step down to a weaker rung on the same provider;
    // stepping *up* is a quality decision and always goes through, and the
    // hard budget ceiling (−2) still forces the cheapest model.
    let cacheHeldModel = false;
    const lastModel = signals.lastAssistantModel?.trim();
    if (
      role === "primary" &&
      (budgetShift !== -2 || signals.uncertain) &&
      !signals.newTask &&
      lastModel &&
      lastModel !== model &&
      signals.lastAssistantProvider === providerId &&
      models.includes(lastModel)
    ) {
      const lastTier = resolveRouteTierForModel(lastModel);
      if (routeTierIndex(lastTier) <= routeTierIndex(tier)) {
        model = lastModel;
        tier = lastTier;
        cacheHeldModel = true;
        reasonParts.push(
          i18n.t("providers:autoRoutingProfile.keptFromThePreviousTurnSo", { value1: toHumanModelName({ model: lastModel }) }),
        );
      }
    }

    const requestedEffort = matched?.then.effort ?? (matched ? undefined : profile.fallbacks[providerId]?.effort);
    const levelEffort = requestedEffort ?? (role === "primary" ? level.effort : undefined);
    let effort = resolveEffort({
      providerId,
      model,
      requested: levelEffort,
      tier,
      shift: budgetShift === -2 ? 0 : stance.shift + (budgetHeldModel ? -1 : 0),
    });
    if (effort && role === "primary" && budgetShift === 0 && stance.shift !== 0) {
      effort = clampEffortToRange({
        providerId,
        effort,
        requested: levelEffort ?? effort,
        range: level.effortRange,
      });
      if (providerId === "codex") {
        const clamped = clampCodexEffortToModel({ model, effort: effort as (typeof CODEX_EFFORT_SCALE)[number] });
        effort = clamped === "minimal" ? "low" : clamped;
      }
    }

    return {
      role,
      providerId,
      model,
      ...(effort ? { effort } : {}),
      tier,
      taskClass: signals.taskClass,
      complexity,
      ruleId: matched?.id ?? null,
      reason: [baseReason || (matched ? "" : i18n.t("providers:autoRoutingProfile.noRuleMatchedIsTheProvider", { value1: toHumanModelName({ model }) })), ...reasonParts]
        .filter(Boolean)
        .join(" "),
      stanceShift: stance.shift,
      budgetShift,
      budgetHeldModel,
      cacheHeldModel,
    };
  }

  throw new Error(noRouteMessage(complexity, minimumTier));
}

/**
 * What each level resolves to on one provider under the current profile, for
 * the Settings overview. A level with no allowed model reports the reason.
 */
export function previewRouteLevels(args: {
  profile: AutoRoutingProfile;
  providerId: ProviderId;
  runtimeModels?: readonly string[];
}): Array<{ level: RouteLevel; route: ResolvedRoute | null; error: string | null }> {
  // Preview only the provider's own models: no failover, no history.
  const availability = Object.fromEntries(
    listProviderIds().map((providerId) => [providerId, providerId === args.providerId]),
  ) as Partial<Record<ProviderId, boolean>>;
  return ROUTE_LEVELS.map((level) => {
    try {
      const route = resolveRoute({
        profile: { ...args.profile, signals: { ...args.profile.signals, budgetGuard: false } },
        role: "primary",
        signals: {
          taskClass: "implement",
          complexity: level.complexity,
          sensitive: false,
          fileContextCount: 0,
          currentProviderId: args.providerId,
          providerAvailability: availability,
        },
        ...(args.runtimeModels ? { runtimeModelsByProvider: { [args.providerId]: args.runtimeModels } } : {}),
      });
      return { level, route, error: null };
    } catch (error) {
      return { level, route: null, error: error instanceof Error ? error.message : i18n.t("providers:autoRoutingProfile.noRoute") };
    }
  });
}

export function buildRoleSignals(args: {
  currentProviderId: ProviderId;
  currentModel?: string;
  taskClass?: TaskClass;
  budgetUsedPercent?: number;
  providerAvailability?: RouterSignals["providerAvailability"];
}): RouterSignals {
  return {
    taskClass: args.taskClass ?? "implement",
    complexity: "medium",
    sensitive: false,
    fileContextCount: 0,
    currentProviderId: args.currentProviderId,
    ...(args.currentModel ? { currentModel: args.currentModel } : {}),
    ...(typeof args.budgetUsedPercent === "number"
      ? { budgetUsedPercent: args.budgetUsedPercent }
      : {}),
    ...(args.providerAvailability
      ? { providerAvailability: args.providerAvailability }
      : {}),
  };
}

/**
 * Default provider, model and effort for a delegated task. Exposed so
 * the delegation form can seed its draft from the same table the composer uses.
 */
export function resolveDelegateDefaults(
  profile: AutoRoutingProfile,
  args: { provider: ProviderId; primaryModel?: string; budgetUsedPercent?: number },
): { providerId: ProviderId; model: string; effort?: string; reason: string } {
  const route = resolveRoute({
    profile,
    role: "delegate",
    signals: buildRoleSignals({
      currentProviderId: args.provider,
      currentModel: args.primaryModel,
      budgetUsedPercent: args.budgetUsedPercent,
    }),
  });
  return {
    providerId: route.providerId,
    model: route.model,
    ...(route.effort ? { effort: route.effort } : {}),
    reason: route.reason,
  };
}

/** `Opus 5 · High` style label for pills and summaries. */
export function formatResolvedRouteLabel(route: Pick<ResolvedRoute, "model" | "effort">) {
  const name = toHumanModelName({ model: route.model }).replace(/^Claude /, "");
  const effort = route.effort
    ? `${route.effort.slice(0, 1).toUpperCase()}${route.effort.slice(1)}`
    : null;
  return effort ? `${name} · ${effort}` : name;
}
