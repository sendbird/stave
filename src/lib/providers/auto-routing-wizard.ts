import {
  cloneProfileAsCustom,
  resolveRouteTierForModel,
  ROUTE_TIER_LABELS,
  STANCE_LABELS,
  TASK_CLASS_LABELS,
  TASK_CLASSES,
  withStance,
  type AutoRoutingProfile,
  type RouteRule,
  type RouteRuleThen,
  type RouteTier,
  type Stance,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import {
  getProviderLabel,
  isAutoModelId,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  detectPromptSkill,
  resolveHeuristicRoute,
  taskTypeToTaskClass,
} from "@/store/auto-routing";
import type { ChatMessage } from "@/types/chat";

/* -------------------------------------------------------------------------- */
/* Samples                                                                    */
/* -------------------------------------------------------------------------- */

/** One user prompt paired with the assistant turn that answered it. */
export interface UsageSample {
  prompt: string;
  providerId: ProviderId;
  model: string;
  effort?: string;
  /** ISO timestamp of the answering turn; breaks frequency ties toward recent. */
  at?: string;
  /** Slash-command skill the prompt opened with, when any. */
  skill?: string;
}

const KNOWN_PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "kiro",
]);

function isProviderId(value: string): value is ProviderId {
  return KNOWN_PROVIDER_IDS.has(value);
}

/**
 * Pairs each user message with the next assistant message that answered it.
 * Streaming rows, rows without a concrete model, and unanswered prompts are
 * skipped: they say nothing about which model the user ended up relying on.
 */
export function collectUsageSamples(
  messages: readonly ChatMessage[],
): UsageSample[] {
  const samples: UsageSample[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const user = messages[index];
    if (!user || user.role !== "user") {
      continue;
    }
    const prompt = user.content.trim();
    if (!prompt) {
      continue;
    }
    let answer: ChatMessage | null = null;
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
      const candidate = messages[cursor];
      if (!candidate || candidate.role === "user") {
        break;
      }
      if (candidate.role === "assistant") {
        answer = candidate;
        break;
      }
    }
    if (!answer || answer.isStreaming) {
      continue;
    }
    const model = answer.model.trim();
    if (!model || isAutoModelId({ model }) || !isProviderId(answer.providerId)) {
      continue;
    }
    const effort = answer.modelInfo?.effort;
    const skill = detectPromptSkill(prompt);
    const at = answer.startedAt ?? user.startedAt;
    samples.push({
      prompt,
      providerId: answer.providerId,
      model,
      ...(effort ? { effort: String(effort) } : {}),
      ...(at ? { at } : {}),
      ...(skill ? { skill } : {}),
    });
  }
  return samples;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                   */
/* -------------------------------------------------------------------------- */

export interface UsageTarget {
  providerId: ProviderId;
  model: string;
  effort?: string;
}

export interface UsageClassSummary {
  taskClass: TaskClass;
  count: number;
  /** Percent of all samples that landed in this class, 0-100. */
  share: number;
  dominant: UsageTarget;
  /** How many of `count` ran on the dominant target. */
  dominantCount: number;
  tier: RouteTier;
}

export interface UsageSkillSummary {
  skill: string;
  count: number;
  dominant: UsageTarget;
  dominantCount: number;
}

export interface UsageProviderShare {
  providerId: ProviderId;
  count: number;
  /** Percent of all samples, 0-100. */
  share: number;
}

export type UsageConfidence = "low" | "medium" | "high";

export interface UsageAnalysis {
  totalSamples: number;
  confidence: UsageConfidence;
  /** Sorted by count, largest class first. */
  classes: UsageClassSummary[];
  /** Sorted by count, most-used skill first. */
  skills: UsageSkillSummary[];
  /** Sorted by count, most-used provider first. */
  providers: UsageProviderShare[];
  insights: string[];
  recommendedStance: Stance;
}

export const USAGE_CONFIDENCE_MEDIUM_AT = 8;
export const USAGE_CONFIDENCE_HIGH_AT = 30;

interface ClassifiedSample extends UsageSample {
  taskClass: TaskClass;
}

function classifySample(sample: UsageSample): ClassifiedSample {
  const route = resolveHeuristicRoute({
    prompt: sample.prompt,
    fileContextCount: 0,
    safetyEscalation: true,
  });
  // `taskClass` is always set today; the fallback guards older classifier shapes.
  const taskClass = route.taskClass ?? taskTypeToTaskClass(route.taskType);
  return { ...sample, taskClass };
}

function targetKey(sample: UsageSample) {
  return `${sample.providerId}::${sample.model}`;
}

function timestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Most frequent provider+model among the samples; ties go to the pair used most
 * recently. Effort is the most common value recorded on that pair, when any.
 */
function pickDominantTarget(samples: readonly UsageSample[]): {
  target: UsageTarget;
  count: number;
} | null {
  interface Bucket {
    sample: UsageSample;
    count: number;
    latest: number;
    efforts: Map<string, number>;
  }
  const buckets = new Map<string, Bucket>();
  for (const sample of samples) {
    const key = targetKey(sample);
    const bucket: Bucket = buckets.get(key) ?? {
      sample,
      count: 0,
      latest: 0,
      efforts: new Map<string, number>(),
    };
    bucket.count += 1;
    bucket.latest = Math.max(bucket.latest, timestamp(sample.at));
    if (sample.effort) {
      bucket.efforts.set(sample.effort, (bucket.efforts.get(sample.effort) ?? 0) + 1);
    }
    buckets.set(key, bucket);
  }
  let winner: Bucket | null = null;
  for (const bucket of buckets.values()) {
    if (
      !winner ||
      bucket.count > winner.count ||
      (bucket.count === winner.count && bucket.latest > winner.latest)
    ) {
      winner = bucket;
    }
  }
  if (!winner) {
    return null;
  }
  let effort: string | undefined;
  let effortCount = 0;
  for (const [value, count] of winner.efforts) {
    if (count > effortCount) {
      effort = value;
      effortCount = count;
    }
  }
  return {
    target: {
      providerId: winner.sample.providerId,
      model: winner.sample.model,
      ...(effort ? { effort } : {}),
    },
    count: winner.count,
  };
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function resolveUsageConfidence(totalSamples: number): UsageConfidence {
  if (totalSamples < USAGE_CONFIDENCE_MEDIUM_AT) {
    return "low";
  }
  if (totalSamples < USAGE_CONFIDENCE_HIGH_AT) {
    return "medium";
  }
  return "high";
}

/**
 * Mostly frontier/flagship turns read as quality-first, mostly light turns as
 * cost-saver; everything in between (and no data) stays balanced.
 */
export function recommendStance(samples: readonly UsageSample[]): Stance {
  if (samples.length === 0) {
    return "balanced";
  }
  let strong = 0;
  let light = 0;
  for (const sample of samples) {
    const tier = resolveRouteTierForModel(sample.model);
    if (tier === "frontier" || tier === "flagship") {
      strong += 1;
    } else if (tier === "light") {
      light += 1;
    }
  }
  if (strong / samples.length >= 0.6) {
    return "quality-first";
  }
  if (light / samples.length >= 0.5) {
    return "cost-saver";
  }
  return "balanced";
}

export function formatUsageTarget(target: UsageTarget) {
  const name = toHumanModelName({ model: target.model });
  return target.effort ? `${name} · ${formatEffortLabel(target.effort)}` : name;
}

export function formatEffortLabel(effort: string) {
  return `${effort.slice(0, 1).toUpperCase()}${effort.slice(1)}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function classNoun(taskClass: TaskClass, count: number) {
  const label = TASK_CLASS_LABELS[taskClass];
  return `${label} ${pluralize(count, "prompt")}`;
}

function buildInsights(args: {
  totalSamples: number;
  classes: readonly UsageClassSummary[];
  skills: readonly UsageSkillSummary[];
  providers: readonly UsageProviderShare[];
}): string[] {
  const insights: string[] = [];
  for (const entry of args.classes) {
    if (entry.count < 2) {
      continue;
    }
    const model = toHumanModelName({ model: entry.dominant.model });
    insights.push(
      entry.dominantCount === entry.count
        ? `You ran all ${entry.count} ${classNoun(entry.taskClass, entry.count)} on ${model}`
        : `You ran ${entry.dominantCount} of ${entry.count} ${classNoun(entry.taskClass, entry.count)} on ${model}`,
    );
  }
  for (const entry of args.skills) {
    if (entry.count < 2) {
      continue;
    }
    const model = toHumanModelName({ model: entry.dominant.model });
    insights.push(
      entry.dominantCount === entry.count
        ? `/${entry.skill} goes to ${model} every time (${entry.count} runs)`
        : `/${entry.skill} goes to ${model} in ${entry.dominantCount} of ${entry.count} runs`,
    );
  }
  if (args.providers.length > 1) {
    for (const entry of args.providers) {
      insights.push(
        `${getProviderLabel({ providerId: entry.providerId })} answered ${entry.share}% of turns`,
      );
    }
  }
  return insights;
}

export function analyzeUsage(
  samples: readonly UsageSample[],
  _opts?: { now?: Date },
): UsageAnalysis {
  const classified = samples.map(classifySample);
  const total = classified.length;

  const byClass = new Map<TaskClass, ClassifiedSample[]>();
  const bySkill = new Map<string, ClassifiedSample[]>();
  const byProvider = new Map<ProviderId, number>();
  for (const sample of classified) {
    byClass.set(sample.taskClass, [...(byClass.get(sample.taskClass) ?? []), sample]);
    if (sample.skill) {
      bySkill.set(sample.skill, [...(bySkill.get(sample.skill) ?? []), sample]);
    }
    byProvider.set(sample.providerId, (byProvider.get(sample.providerId) ?? 0) + 1);
  }

  const classes: UsageClassSummary[] = [];
  for (const taskClass of TASK_CLASSES) {
    const group = byClass.get(taskClass);
    if (!group || group.length === 0) {
      continue;
    }
    const dominant = pickDominantTarget(group);
    if (!dominant) {
      continue;
    }
    classes.push({
      taskClass,
      count: group.length,
      share: percent(group.length, total),
      dominant: dominant.target,
      dominantCount: dominant.count,
      tier: resolveRouteTierForModel(dominant.target.model),
    });
  }
  classes.sort((left, right) => right.count - left.count);

  const skills: UsageSkillSummary[] = [];
  for (const [skill, group] of bySkill) {
    const dominant = pickDominantTarget(group);
    if (!dominant) {
      continue;
    }
    skills.push({
      skill,
      count: group.length,
      dominant: dominant.target,
      dominantCount: dominant.count,
    });
  }
  skills.sort(
    (left, right) => right.count - left.count || left.skill.localeCompare(right.skill),
  );

  const providers: UsageProviderShare[] = [...byProvider.entries()]
    .map(([providerId, count]) => ({ providerId, count, share: percent(count, total) }))
    .sort((left, right) => right.count - left.count);

  return {
    totalSamples: total,
    confidence: resolveUsageConfidence(total),
    classes,
    skills,
    providers,
    insights: buildInsights({ totalSamples: total, classes, skills, providers }),
    recommendedStance: recommendStance(samples),
  };
}

/* -------------------------------------------------------------------------- */
/* Profile proposal                                                           */
/* -------------------------------------------------------------------------- */

export interface WizardChange {
  kind: "rule" | "stance";
  taskClass?: TaskClass;
  skill?: string;
  /** Human description of what the base profile did, when it had a rule. */
  before?: string;
  after: string;
  evidence: string;
}

export interface WizardInclude {
  taskClasses?: readonly TaskClass[];
  skills?: readonly string[];
  stance?: boolean;
}

export interface BuildProfileFromUsageOptions {
  base: AutoRoutingProfile;
  /** Classes and skills with fewer samples keep the base rule. Default 3. */
  minSamplesPerClass?: number;
  name?: string;
  /**
   * Restricts which proposals are applied (for the review step's checkboxes).
   * Omitted means everything; an empty list for a key means none of that key.
   */
  include?: WizardInclude;
}

export const DEFAULT_WIZARD_MIN_SAMPLES = 3;
export const USAGE_PROFILE_NAME = "My routing (from usage)";

/** Stable identity for a change so a review list can toggle it. */
export function wizardChangeKey(change: WizardChange) {
  if (change.kind === "stance") {
    return "stance";
  }
  return change.skill ? `skill:${change.skill}` : `class:${change.taskClass ?? ""}`;
}

export function describeRuleThen(then: RouteRuleThen) {
  const parts: string[] = [];
  if (then.model) {
    parts.push(toHumanModelName({ model: then.model }));
  } else if (then.tier) {
    parts.push(`${ROUTE_TIER_LABELS[then.tier]} tier`);
  } else {
    parts.push("Provider default");
  }
  if (then.providerId !== "any-eligible" && then.providerId !== "alternate-provider") {
    parts[0] = `${parts[0]} (${getProviderLabel({ providerId: then.providerId })})`;
  } else if (then.providerId === "alternate-provider") {
    parts[0] = `${parts[0]} (other provider)`;
  }
  if (then.effort) {
    parts.push(formatEffortLabel(then.effort));
  }
  return parts.join(" · ");
}

function isPrimaryClassRule(rule: RouteRule, taskClass: TaskClass) {
  const when = rule.when;
  return (
    when.taskClass === taskClass &&
    !when.role &&
    !when.skill &&
    when.complexity === undefined &&
    when.sensitive === undefined &&
    when.budgetUsedAtLeast === undefined
  );
}

function isPrimarySkillRule(rule: RouteRule, skill: string) {
  const when = rule.when;
  return (
    !when.taskClass &&
    !when.role &&
    when.skill?.length === 1 &&
    when.skill[0] === skill &&
    when.budgetUsedAtLeast === undefined
  );
}

function ruleFromTarget(args: {
  id: string;
  when: RouteRule["when"];
  target: UsageTarget;
  reason: string;
}): RouteRule {
  return {
    id: args.id,
    when: args.when,
    then: {
      providerId: args.target.providerId,
      model: args.target.model,
      ...(args.target.effort ? { effort: args.target.effort } : {}),
    },
    reason: args.reason,
    enabled: true,
  };
}

function includesClass(include: WizardInclude | undefined, taskClass: TaskClass) {
  return !include?.taskClasses || include.taskClasses.includes(taskClass);
}

function includesSkill(include: WizardInclude | undefined, skill: string) {
  return !include?.skills || include.skills.includes(skill);
}

/**
 * Proposes a custom profile from the analysis. Rule order after the rebuild:
 * role/budget rules from the base first, then skill rules, then the
 * safety-critical class rule, then the remaining class rules.
 */
export function buildProfileFromUsage(
  analysis: UsageAnalysis,
  opts: BuildProfileFromUsageOptions,
): { profile: AutoRoutingProfile; changes: WizardChange[] } {
  const minSamples = Math.max(1, opts.minSamplesPerClass ?? DEFAULT_WIZARD_MIN_SAMPLES);
  const changes: WizardChange[] = [];
  let profile = cloneProfileAsCustom(opts.base);
  profile.name = opts.name ?? USAGE_PROFILE_NAME;

  const head: RouteRule[] = [];
  let skillRules: RouteRule[] = [];
  let safetyRules: RouteRule[] = [];
  let classRules: RouteRule[] = [];
  for (const entry of profile.rules) {
    if (entry.when.skill && entry.when.skill.length > 0) {
      skillRules.push(entry);
    } else if (entry.when.taskClass === "safety-critical") {
      safetyRules.push(entry);
    } else if (entry.when.taskClass) {
      classRules.push(entry);
    } else {
      head.push(entry);
    }
  }

  for (const summary of analysis.skills) {
    if (summary.count < minSamples || !includesSkill(opts.include, summary.skill)) {
      continue;
    }
    const existing = skillRules.find((entry) => isPrimarySkillRule(entry, summary.skill));
    const after = describeRuleThen({
      providerId: summary.dominant.providerId,
      model: summary.dominant.model,
      ...(summary.dominant.effort ? { effort: summary.dominant.effort } : {}),
    });
    const evidence = `You usually run /${summary.skill} on ${toHumanModelName({ model: summary.dominant.model })} (${summary.dominantCount} of ${summary.count} turns)`;
    const next = ruleFromTarget({
      id: existing?.id ?? `usage-skill-${summary.skill}`,
      when: { skill: [summary.skill] },
      target: summary.dominant,
      reason: evidence,
    });
    skillRules = existing
      ? skillRules.map((entry) => (entry === existing ? next : entry))
      : [...skillRules, next];
    changes.push({
      kind: "rule",
      skill: summary.skill,
      ...(existing ? { before: describeRuleThen(existing.then) } : {}),
      after,
      evidence,
    });
  }

  for (const summary of analysis.classes) {
    if (summary.count < minSamples || !includesClass(opts.include, summary.taskClass)) {
      continue;
    }
    const group = summary.taskClass === "safety-critical" ? safetyRules : classRules;
    const existing = group.find((entry) => isPrimaryClassRule(entry, summary.taskClass));
    const after = describeRuleThen({
      providerId: summary.dominant.providerId,
      model: summary.dominant.model,
      ...(summary.dominant.effort ? { effort: summary.dominant.effort } : {}),
    });
    const evidence = `You usually run ${TASK_CLASS_LABELS[summary.taskClass].toLowerCase()} prompts on ${toHumanModelName({ model: summary.dominant.model })} (${summary.dominantCount} of ${summary.count} turns)`;
    const next = ruleFromTarget({
      id: existing?.id ?? `usage-${summary.taskClass}`,
      when: { taskClass: summary.taskClass },
      target: summary.dominant,
      reason: evidence,
    });
    const rebuilt = existing
      ? group.map((entry) => (entry === existing ? next : entry))
      : [...group, next];
    if (summary.taskClass === "safety-critical") {
      safetyRules = rebuilt;
    } else {
      classRules = rebuilt;
    }
    changes.push({
      kind: "rule",
      taskClass: summary.taskClass,
      ...(existing ? { before: describeRuleThen(existing.then) } : {}),
      after,
      evidence,
    });
  }

  // Only regroup when a rule actually changed; an empty analysis leaves the
  // base table byte-for-byte intact.
  if (changes.length > 0) {
    profile.rules = [...head, ...skillRules, ...safetyRules, ...classRules];
  }

  if (
    analysis.totalSamples > 0 &&
    analysis.recommendedStance !== opts.base.stance &&
    opts.include?.stance !== false
  ) {
    profile = withStance(profile, analysis.recommendedStance);
    changes.push({
      kind: "stance",
      before: STANCE_LABELS[opts.base.stance],
      after: STANCE_LABELS[analysis.recommendedStance],
      evidence: describeStanceEvidence(analysis),
    });
  }

  return { profile, changes };
}

function describeStanceEvidence(analysis: UsageAnalysis) {
  const tierCounts = new Map<RouteTier, number>();
  for (const entry of analysis.classes) {
    tierCounts.set(entry.tier, (tierCounts.get(entry.tier) ?? 0) + entry.count);
  }
  const strong = (tierCounts.get("frontier") ?? 0) + (tierCounts.get("flagship") ?? 0);
  const light = tierCounts.get("light") ?? 0;
  switch (analysis.recommendedStance) {
    case "quality-first":
      return `${percent(strong, analysis.totalSamples)}% of your turns ran on frontier or flagship models`;
    case "cost-saver":
      return `${percent(light, analysis.totalSamples)}% of your turns ran on light models`;
    case "balanced":
      return "Your turns spread across model tiers";
  }
}
