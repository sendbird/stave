import { i18n } from "@/i18n/runtime";
import {
  FOLLOW_LEVEL_TIER,
  isStrengthRule,
  STRENGTH_RULE_ID_PREFIX,
  TASK_CLASS_LABELS,
  type AutoRoutingProfile,
  type RouteRule,
  type TaskClass,
} from "./auto-routing-profile";
import { getProviderLabel } from "./model-catalog";

/**
 * Provider strengths: which provider a task's first turn starts on, by the
 * kind of work. Stored as ordinary provider-only rules (`strength-<class>`)
 * whose model follows the level, so the level ladder still picks the rung and
 * a user can edit them like any other rule. There is no separate profile
 * layer. A strength moves the provider only at a task boundary (see
 * `resolveProviderCandidates`).
 *
 * The presets below are seeded from public evaluations. They are hypotheses
 * about providers, not measurements of this user's work, so none is applied
 * until the user picks one, and each row keeps its confidence and sources.
 */

export type StrengthProviderId = "claude-code" | "codex";
/** A class absent from the map keeps the task's provider. */
export type ProviderStrengthMap = Partial<Record<StrengthTaskClass, StrengthProviderId>>;

/**
 * Safety-critical work is left out: it already has its own rule (flagship,
 * high effort), and no public evaluation separates the providers on it.
 */
export const STRENGTH_TASK_CLASSES = [
  "plan",
  "implement",
  "quick-edit",
  "debug",
  "review",
  "ci-fix",
  "docs",
  "research",
] as const satisfies readonly TaskClass[];
export type StrengthTaskClass = (typeof STRENGTH_TASK_CLASSES)[number];

export { isStrengthRule, STRENGTH_RULE_ID_PREFIX };

export type StrengthConfidence = "low" | "medium" | "high";
export type StrengthSourceKind = "benchmark" | "github" | "blog" | "research" | "x";

export interface StrengthSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** ISO date, month, or null when the page is undated. */
  date: string | null;
  kind: StrengthSourceKind;
  /** The claim this source contributes, paraphrased, with its number. */
  claim: string;
}

export interface StrengthEvidence {
  confidence: StrengthConfidence;
  /** One translated line on why; shown under the row with its sources. */
  rationale: string;
  sourceIds: readonly string[];
}

export interface ProviderStrengthPreset {
  id: string;
  /** When the evidence was gathered; presets age as models change. */
  asOf: string;
  map: ProviderStrengthMap;
  /** Evidence for every class, including those the preset leaves as "keep". */
  evidence: Partial<Record<StrengthTaskClass, StrengthEvidence>>;
}

/*
 * Sources gathered and re-checked 2026-10-11. X is read through the
 * fxtwitter JSON route (api.fxtwitter.com); x.com itself, xcancel and nitter
 * could not be read that day. Vendor-run benchmarks and older model
 * generations are named in their claim. A source that could not be opened is
 * left out rather than cited from search text.
 */
// i18n-ignore: citation metadata, kept in the source language
export const STRENGTH_SOURCES: readonly StrengthSource[] = [
  { id: "aa-agents", title: "Claude Code vs Codex: coding agent comparison", publisher: "Artificial Analysis", url: "https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex", date: "2026-10", kind: "benchmark",
    claim: "Sonnet 5.5 (max) in Claude Code index 68 at $14.19/task vs GPT-6.1 Sol (xhigh) in Codex 63 at $1.04; Terminal-Bench 4.0 66% vs 55%, SWE-Atlas QnA 67% vs 61%, DeepSWE 72% vs 73%. Sol (medium) 61 at $0.70 vs Sonnet 5.5 (high) 55 at $1.24." },
  { id: "bug-hunt-bench", title: "Bug Hunt Bench", publisher: "phuryn on GitHub", url: "https://github.com/phuryn/bug-hunt-bench", date: "2026-10-08", kind: "github",
    claim: "105 planted bugs, blind-judged. xhigh: GPT-6 Astra 43, GPT-6.1 Sol 42.7 ($4.35) vs Opus 5.5 and Sonnet 5.5 36. max: Sonnet 5.5 51.3 ($154) vs Astra 45, Sol 44.3 ($5.88)." },
  { id: "tbench-2-1", title: "Terminal-Bench 2.1 leaderboard", publisher: "Snorkel AI", url: "https://snorkel.ai/leaderboard/terminal-bench-2-1/", date: "2026-09", kind: "benchmark",
    claim: "GPT-6 Astra + Codex CLI 87.4% (Sep 3) vs Claude Fable 5 + Claude Code 83.8% (Jun 9); Fable 5.1 is not listed." },
  { id: "vals-tb4", title: "Terminal-Bench 4.0", publisher: "Vals AI", url: "https://www.vals.ai/benchmarks/terminal-bench-4", date: "2026-10-07", kind: "benchmark",
    claim: "Mini-SWE-agent harness: Opus 5.5 65.2%, Sonnet 5.5 64.1%, GPT-6 Astra 59.6%; without provider-side fallback Opus 5.5 is 58.1%. Astra leads software (61.1%), Sonnet 5.5 operations (51.9%)." },
  { id: "arena-webdev", title: "Code Arena: WebDev", publisher: "Arena", url: "https://arena.ai/leaderboard/code/webdev", date: "2026-10-08", kind: "benchmark",
    claim: "Claude Opus 5.5 1813 ±15 vs GPT-6 Astra 1786 ±11, one point between the intervals; Sonnet 5.5 1774, GPT-6.1 Sol 1755, Fable 5.1 1744." },
  { id: "arena-x-astra", title: "Code Arena WebDev win rates", publisher: "@arena on X", url: "https://x.com/arena/status/2100321600679928152", date: "2026-09-16", kind: "x",
    claim: "GPT-6 Astra #1 (1800) ahead of Fable 5.1 (1758), yet Fable 5.1 wins their head-to-head battles 43.5% to 29.0%." },
  { id: "arena-x-opus", title: "Opus 5.5 takes #1 in WebDev", publisher: "@arena on X", url: "https://x.com/arena/status/2103110782540255504", date: "2026-09-24", kind: "x",
    claim: "Claude Opus 5.5 (Max) #1 in Code Arena WebDev at a 60% lower price than GPT-6 Astra (Max)." },
  { id: "twostraws-x", title: "Codex vs Claude for app development", publisher: "Paul Hudson on X", url: "https://x.com/twostraws/status/2101317950787432483", date: "2026-09-19", kind: "x",
    claim: "Practitioner: for finding bugs Opus (5) beats Astra; passkeys, unit tests and API design go to Codex; Fable has a flair for design." },
  { id: "macroscope-review", title: "AI Code Review Benchmark 2026", publisher: "Macroscope (vendor)", url: "https://macroscope.com/content/ai-code-review-benchmark-best-models", date: "2026-09-22", kind: "benchmark",
    claim: "Vendor-run: GPT-6 Astra (max) 78.0, precision 91.7%, vs Claude Opus 5 (high) 69.9, recall 76.6%; older Claude model at a different effort." },
  { id: "composio", title: "Claude Code vs Codex: 100+ hours", publisher: "Composio", url: "https://composio.dev/content/claude-code-vs-openai-codex", date: "2026-08-18", kind: "blog",
    claim: "Hands-on, Fable 5 vs GPT-5.6 Sol (high): 47/47 vs 45/47 workflows; Codex /review the cleanest in-loop review; Claude keeps long-session memory better." },
  { id: "formation", title: "Claude Code vs. Codex: Which is Better?", publisher: "Formation", url: "https://formation.dev/blog/claude-code-vs-codex-whats-the-best-ai-coding-agent-for-software-engineers", date: "2026-04-30", kind: "blog",
    claim: "Codex the better review tool for high-stakes changes at about 4x fewer tokens; model versions not named." },
  { id: "catdoes", title: "Claude Code vs Codex: Opus 5.5 vs GPT-6 Sol", publisher: "CatDoes (vendor)", url: "https://catdoes.com/blog/claude-code-vs-codex", date: "2026-10-10", kind: "blog",
    claim: "Claude Code to design and review the important 20%; Codex for the other 80%, unattended tasks and automated PR review." },
  { id: "msr-pr-acceptance", title: "Comparing AI Coding Agents: A Task-Stratified Analysis of PR Acceptance", publisher: "Pinna et al., MSR '26", url: "https://arxiv.org/abs/2602.08915", date: "2026-05-07", kind: "research",
    claim: "7,156 PRs across five agents: documentation is Claude Code's best category (92.3%, all agents 82.1%); model versions not stated." },
  { id: "amplifying-security", title: "The Security Decisions Claude Code and Codex Make", publisher: "Amplifying.ai", url: "https://amplifying.ai/research/ai-security-decisions", date: "2026-04", kind: "research",
    claim: "Security requirement compliance at parity, Claude Code 84.7% vs Codex 83.3%; Opus 4.6 vs GPT-5.4, 12 sessions." },
  { id: "codex-review-repo", title: "boyand/codex-review", publisher: "GitHub", url: "https://github.com/boyand/codex-review", date: null, kind: "github",
    claim: "Workflow, not a measurement: Claude plans, Codex reviews the plan, Claude implements, Codex reviews the implementation." },
];

// Rationale getters, not strings: the row text is translated.
const EVIDENCE_2026_10: Partial<Record<StrengthTaskClass, StrengthEvidence>> = {
  plan: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.plan"); }, sourceIds: ["catdoes", "codex-review-repo"] },
  implement: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.implement"); }, sourceIds: ["arena-webdev", "arena-x-astra", "vals-tb4", "aa-agents"] },
  "quick-edit": { confidence: "medium", get rationale() { return i18n.t("providers:providerStrengths.rationale.quickEdit"); }, sourceIds: ["aa-agents"] },
  debug: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.debug"); }, sourceIds: ["bug-hunt-bench", "twostraws-x", "composio"] },
  review: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.review"); }, sourceIds: ["macroscope-review", "composio", "formation", "codex-review-repo"] },
  "ci-fix": { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.ciFix"); }, sourceIds: ["tbench-2-1", "vals-tb4", "aa-agents"] },
  docs: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.docs"); }, sourceIds: ["msr-pr-acceptance"] },
  research: { confidence: "low", get rationale() { return i18n.t("providers:providerStrengths.rationale.research"); }, sourceIds: ["aa-agents", "catdoes"] },
};

/**
 * The presets, most cautious first. `confident` keeps only medium-or-better
 * evidence; `evidence-2026-10` follows every row the evidence leans on and
 * keeps the task's provider where it is mixed or conflicting;
 * `plan-build-review` is a common practitioner split, not a measurement.
 */
export const PROVIDER_STRENGTH_PRESETS: readonly ProviderStrengthPreset[] = [
  {
    id: "confident",
    asOf: "2026-10-11",
    map: { "quick-edit": "codex" },
    evidence: EVIDENCE_2026_10,
  },
  {
    id: "evidence-2026-10",
    asOf: "2026-10-11",
    map: {
      plan: "claude-code",
      "quick-edit": "codex",
      review: "codex",
      docs: "claude-code",
      research: "claude-code",
    },
    evidence: EVIDENCE_2026_10,
  },
  {
    id: "plan-build-review",
    asOf: "2026-10-11",
    map: { plan: "claude-code", implement: "claude-code", review: "codex" },
    evidence: EVIDENCE_2026_10,
  },
];

export const DEFAULT_STRENGTH_PRESET_ID = "confident";

export function getStrengthPreset(id: string): ProviderStrengthPreset | null {
  return PROVIDER_STRENGTH_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getStrengthSources(ids: readonly string[]): StrengthSource[] {
  return ids
    .map((id) => STRENGTH_SOURCES.find((source) => source.id === id))
    .filter((source): source is StrengthSource => Boolean(source));
}

function strengthRuleId(taskClass: StrengthTaskClass) {
  return `${STRENGTH_RULE_ID_PREFIX}${taskClass}`;
}

function isStrengthTaskClass(value: unknown): value is StrengthTaskClass {
  return STRENGTH_TASK_CLASSES.includes(value as StrengthTaskClass);
}

function isStrengthProvider(value: unknown): value is StrengthProviderId {
  return value === "claude-code" || value === "codex";
}

export interface ProviderStrengthState {
  /** Classes with a strength rule, whether on or off. */
  map: ProviderStrengthMap;
  /** True when the profile holds strength rules and every one is on. */
  enabled: boolean;
  /** True when the profile holds no strength rules yet. */
  empty: boolean;
}

/** The strength table as the profile stores it. */
export function readProviderStrengths(profile: Pick<AutoRoutingProfile, "rules">): ProviderStrengthState {
  const map: ProviderStrengthMap = {};
  const rules = profile.rules.filter(isStrengthRule);
  for (const rule of rules) {
    const taskClass = rule.when.taskClass;
    if (isStrengthTaskClass(taskClass) && isStrengthProvider(rule.then.providerId)) {
      map[taskClass] = rule.then.providerId;
    }
  }
  return {
    map,
    enabled: rules.length > 0 && rules.every((rule) => rule.enabled),
    empty: rules.length === 0,
  };
}

function strengthReason(taskClass: StrengthTaskClass, providerId: StrengthProviderId) {
  return i18n.t("providers:providerStrengths.ruleReason", {
    task: TASK_CLASS_LABELS[taskClass],
    provider: getProviderLabel({ providerId }),
  });
}

/**
 * A rule that only narrows by role or level: the strength rules go before the
 * first of these so they are reached, and after the user's own task-, skill-,
 * usage- or sensitivity-specific rules, which outrank a strength.
 */
function isLevelOrCatchAllRule(rule: RouteRule) {
  const { when } = rule;
  return (
    !isStrengthRule(rule) &&
    (when.role === undefined || when.role === "primary") &&
    when.taskClass === undefined &&
    when.skill === undefined &&
    when.budgetUsedAtLeast === undefined &&
    when.sensitive === undefined
  );
}

/**
 * Writes the strength table into the profile's rules. Every strength rule is
 * replaced; a class missing from `map` gets no rule and keeps the task's
 * provider. The rules name a provider and follow the level for the model.
 */
export function writeProviderStrengths(
  profile: AutoRoutingProfile,
  args: { map: ProviderStrengthMap; enabled: boolean },
): AutoRoutingProfile {
  const rest = profile.rules.filter((rule) => !isStrengthRule(rule));
  const strengthRules: RouteRule[] = STRENGTH_TASK_CLASSES.flatMap((taskClass) => {
    const providerId = args.map[taskClass];
    if (!providerId) return [];
    return [{
      id: strengthRuleId(taskClass),
      when: { taskClass },
      then: { providerId, tier: FOLLOW_LEVEL_TIER },
      reason: strengthReason(taskClass, providerId),
      enabled: args.enabled,
    }];
  });
  const at = rest.findIndex(isLevelOrCatchAllRule);
  const index = at === -1 ? rest.length : at;
  return {
    ...profile,
    rules: [...rest.slice(0, index), ...strengthRules, ...rest.slice(index)],
  };
}

/** The preset whose map equals the stored one, or null for a custom table. */
export function matchStrengthPreset(map: ProviderStrengthMap): ProviderStrengthPreset | null {
  return (
    PROVIDER_STRENGTH_PRESETS.find((preset) =>
      STRENGTH_TASK_CLASSES.every((taskClass) => preset.map[taskClass] === map[taskClass]),
    ) ?? null
  );
}

/**
 * The strength table a delegated task may follow, from the Stave Auto
 * settings the host keeps: null unless Auto is on and the table is stored and
 * switched on. Delegations follow it only for a saved agent's declared task
 * class, never a guess from the prompt.
 */
export function readDelegationStrengths(
  settings: { routing: { autoRoutingEnabled: boolean; autoRoutingProfile?: Pick<AutoRoutingProfile, "rules"> } } | null | undefined,
): ProviderStrengthMap | null {
  const profile = settings?.routing.autoRoutingEnabled ? settings.routing.autoRoutingProfile : undefined;
  if (!profile) return null;
  const stored = readProviderStrengths(profile);
  return stored.enabled && !stored.empty ? stored.map : null;
}

