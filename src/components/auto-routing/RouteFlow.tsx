import { useTranslation, i18n } from "@/i18n";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { sx } from "@/components/ads/utils/stylex";
import {
  listEligibleRouteModels,
  resolveRouteTierForModel,
  ROUTE_COMPLEXITY_LABELS,
  ROUTE_TIER_LABELS,
  ROUTE_TIERS,
  ROUTER_ROLE_LABELS,
  TASK_CLASS_LABELS,
  TASK_CLASSES,
  type AutoRoutingProfile,
  type ResolvedRoute,
  type RouteRule,
  type RouterRole,
  type RouterSignals,
  type RouteTier,
} from "@/lib/providers/auto-routing-profile";
import {
  formatModelPrice,
  getProviderLabel,
  listProviderIds,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AutoRoutingSignalSummary } from "@/lib/routing/auto-routing";
import { routeFlowStyles as styles } from "./route-flow.styles";

/* -------------------------------------------------------------------------- */
/* Explanations                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Why a rule did not fire for these signals, as the first failing condition
 * in the same order the router checks them. `null` means the rule matches.
 */
export function explainRuleMiss(
  rule: RouteRule,
  signals: RouterSignals,
  role: RouterRole,
  options: { skillRouting?: boolean } = {},
): string | null {
  const { when } = rule;
  if (!rule.enabled) {
    return i18n.t("settingsConnections:flow.disabled");
  }
  if ((when.role ?? "primary") !== role) {
    return i18n.t("settingsConnections:flow.roleMiss", { role: ROUTER_ROLE_LABELS[role] });
  }
  if (when.taskClass && when.taskClass !== signals.taskClass) {
    return i18n.t("settingsConnections:flow.taskClassMiss", { taskClass: TASK_CLASS_LABELS[signals.taskClass] });
  }
  if (when.skill && when.skill.length > 0) {
    if (options.skillRouting === false) {
      return i18n.t("settingsConnections:flow.skillRoutingOff");
    }
    if (!signals.skill) {
      return i18n.t("settingsConnections:flow.skillNotPresent");
    }
    if (!when.skill.includes(signals.skill.toLowerCase())) {
      return i18n.t("settingsConnections:flow.skillMiss", { skill: signals.skill });
    }
  }
  if (when.complexity && when.complexity !== signals.complexity) {
    return i18n.t("settingsConnections:flow.levelMiss", { level: ROUTE_COMPLEXITY_LABELS[signals.complexity].toLowerCase() });
  }
  if (typeof when.sensitive === "boolean" && when.sensitive !== signals.sensitive) {
    return when.sensitive ? i18n.t("settingsConnections:flow.notSensitive") : i18n.t("settingsConnections:flow.sensitive");
  }
  if (typeof when.budgetUsedAtLeast === "number") {
    const used = signals.budgetUsedPercent;
    if (typeof used !== "number") {
      return i18n.t("settingsConnections:flow.usageUnknown");
    }
    if (used < when.budgetUsedAtLeast) {
      return i18n.t("settingsConnections:flow.usageMiss", { used: Math.round(used), threshold: when.budgetUsedAtLeast });
    }
  }
  return null;
}

/** `plan · sensitive · /ship · ≥97% used`, or `always` for an empty `when`. */
export function describeRuleConditions(rule: RouteRule): string[] {
  const { when } = rule;
  const parts: string[] = [];
  if (when.taskClass) parts.push(TASK_CLASS_LABELS[when.taskClass].toLowerCase());
  if (when.skill && when.skill.length > 0) {
    parts.push(when.skill.map((skill) => `/${skill}`).join(" "));
  }
  if (when.complexity) parts.push(i18n.t("settingsConnections:flow.conditionLevel", { level: ROUTE_COMPLEXITY_LABELS[when.complexity].toLowerCase() }));
  if (typeof when.sensitive === "boolean") {
    parts.push(when.sensitive ? i18n.t("settingsConnections:flow.sensitive") : i18n.t("settingsConnections:flow.notSensitive"));
  }
  if (typeof when.budgetUsedAtLeast === "number") {
    parts.push(i18n.t("settingsConnections:flow.conditionUsage", { percent: when.budgetUsedAtLeast }));
  }
  return parts.length > 0 ? parts : [i18n.t("settingsConnections:flow.always")];
}

/* -------------------------------------------------------------------------- */
/* Signals                                                                    */
/* -------------------------------------------------------------------------- */

interface SignalNode {
  id: string;
  label: string;
  value: string;
  /** The signal moved the decision (sensitive, deep budget, skill, outage). */
  decisive: boolean;
}

function buildSignalNodes(args: {
  signals: RouterSignals;
  summary: AutoRoutingSignalSummary;
  profile: AutoRoutingProfile;
}): SignalNode[] {
  const { signals, summary, profile } = args;
  const nodes: SignalNode[] = [
    {
      id: "task-class",
      label: i18n.t("settingsConnections:routeFlow.taskClass"),
      value: TASK_CLASS_LABELS[summary.taskClass],
      decisive: false,
    },
    { id: "complexity", label: i18n.t("settingsConnections:flow.level"), value: ROUTE_COMPLEXITY_LABELS[summary.complexity] ?? summary.complexity, decisive: false },
    {
      id: "sensitive",
      label: i18n.t("settingsConnections:flow.sensitiveLabel"),
      value: summary.sensitive ? i18n.t("settingsConnections:flow.yes") : i18n.t("settingsConnections:flow.no"),
      decisive: summary.sensitive,
    },
  ];
  if (summary.skill) {
    nodes.push({ id: "skill", label: i18n.t("settingsConnections:flow.skill"), value: `/${summary.skill}`, decisive: true });
  }
  if (summary.phase) {
    nodes.push({ id: "phase", label: i18n.t("settingsConnections:flow.phase"), value: summary.phase, decisive: false });
  }
  if (summary.fileContextCount > 0) {
    nodes.push({
      id: "files",
      label: i18n.t("settingsConnections:flow.files"),
      value: String(summary.fileContextCount),
      decisive: false,
    });
  }
  if (typeof summary.budgetUsedPercent === "number") {
    nodes.push({
      id: "budget",
      label: i18n.t("settingsConnections:routeFlow.budgetUsed"),
      value: `${summary.budgetUsedPercent}%`,
      decisive: summary.budgetUsedPercent >= profile.budgetGuard.stepDownAt,
    });
  }
  const unavailable = listProviderIds().filter(
    (providerId) => signals.providerAvailability?.[providerId] === false,
  );
  if (unavailable.length > 0) {
    nodes.push({
      id: "providers",
      label: i18n.t("settingsConnections:flow.unavailable"),
      value: unavailable.map((providerId) => getProviderLabel({ providerId })).join(", "),
      decisive: true,
    });
  }
  return nodes;
}

/* -------------------------------------------------------------------------- */
/* Model ladder                                                               */
/* -------------------------------------------------------------------------- */

interface LadderRung {
  model: string;
  tier: RouteTier;
  notes: string[];
}

function tierIndex(tier: RouteTier) {
  return ROUTE_TIERS.indexOf(tier);
}

/** Mirrors the router's nearest-rung pick: closest tier, ties to the stronger. */
function pickRungForTier(rungs: readonly LadderRung[], tier: RouteTier): number {
  const requested = tierIndex(tier);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  rungs.forEach((rung, index) => {
    const distance = Math.abs(tierIndex(rung.tier) - requested);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function shiftTier(rungs: readonly LadderRung[], tier: RouteTier, shift: number): RouteTier {
  const indices = rungs.map((rung) => tierIndex(rung.tier));
  const min = indices.length > 0 ? Math.min(...indices) : 0;
  const max = indices.length > 0 ? Math.max(...indices) : ROUTE_TIERS.length - 1;
  const index = Math.min(max, Math.max(min, tierIndex(tier) - shift));
  return ROUTE_TIERS[index] ?? tier;
}

function buildLadder(args: {
  profile: AutoRoutingProfile;
  route: ResolvedRoute;
  matchedRule: RouteRule | null;
  runtimeModels?: readonly string[];
}): LadderRung[] {
  const { profile, route, matchedRule } = args;
  const models = listEligibleRouteModels({
    profile,
    providerId: route.providerId,
    runtimeModels: args.runtimeModels,
  });
  if (!models.includes(route.model)) {
    models.push(route.model);
  }
  const rungs: LadderRung[] = models.map((model) => ({
    model,
    tier: resolveRouteTierForModel(model),
    notes: [],
  }));
  if (rungs.length === 0) {
    return rungs;
  }

  const fallbackModel = profile.fallbacks[route.providerId]?.model;
  const targetTier: RouteTier =
    matchedRule?.then.tier ??
    resolveRouteTierForModel(matchedRule?.then.model ?? fallbackModel ?? rungs[0]!.model);
  const targetIndex = matchedRule?.then.model
    ? Math.max(0, rungs.findIndex((rung) => rung.model === matchedRule.then.model))
    : pickRungForTier(rungs, targetTier);
  const targetNote = matchedRule ? i18n.t("settingsConnections:flow.ruleTarget") : i18n.t("settingsConnections:flow.fallbackTarget");
  rungs[targetIndex]?.notes.push(targetNote);

  if (route.budgetShift === -2) {
    const cheapest = pickRungForTier(rungs, "light");
    if (cheapest !== targetIndex) {
      rungs[cheapest]?.notes.push(i18n.t("settingsConnections:flow.budgetCheapest"));
    }
    return rungs;
  }

  let cursorTier = targetTier;
  const cursorIndex = targetIndex;
  if (route.stanceShift !== 0) {
    // The preference moves effort inside the level's range, never the rung.
    rungs[cursorIndex]?.notes.push(route.stanceShift > 0 ? i18n.t("settingsConnections:flow.preferenceMoreEffort") : i18n.t("settingsConnections:flow.preferenceLessEffort"));
  }
  if (route.budgetShift === -1) {
    if (route.budgetHeldModel) {
      // Effort-first step-down: the rung stays, only the effort dropped.
      rungs[cursorIndex]?.notes.push(i18n.t("settingsConnections:flow.budgetLessEffort"));
    } else {
      cursorTier = shiftTier(rungs, cursorTier, -1);
      const next = pickRungForTier(rungs, cursorTier);
      if (next !== cursorIndex) {
        rungs[next]?.notes.push(i18n.t("settingsConnections:flow.budgetLessTier"));
      }
    }
  }
  if (route.cacheHeldModel) {
    // The step-down was undone to keep the previous turn's prompt cache.
    const held = pickRungForTier(rungs, route.tier);
    if (held !== cursorIndex) {
      rungs[held]?.notes.push(i18n.t("settingsConnections:flow.keptForCache"));
    }
  }
  return rungs;
}

/* -------------------------------------------------------------------------- */
/* Connectors                                                                 */
/* -------------------------------------------------------------------------- */

type Segment = { y1: number; y2: number } | null;
const GAP_COUNT = 4;

function useLitConnectors(rootRef: RefObject<HTMLDivElement | null>) {
  const [segments, setSegments] = useState<Segment[]>(() =>
    Array.from({ length: GAP_COUNT }, () => null),
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const measure = () => {
      try {
        const next: Segment[] = [];
        for (let gap = 0; gap < GAP_COUNT; gap += 1) {
          const gapCell = root.querySelector<HTMLElement>(`[data-flow-gap="${gap}"]`);
          const from = root.querySelector<HTMLElement>(
            `[data-flow-col="${gap}"] [data-flow-lit="true"]`,
          );
          const to = root.querySelector<HTMLElement>(
            `[data-flow-col="${gap + 1}"] [data-flow-lit="true"]`,
          );
          if (!gapCell || !from || !to) {
            next.push(null);
            continue;
          }
          const gapRect = gapCell.getBoundingClientRect();
          const fromRect = from.getBoundingClientRect();
          const toRect = to.getBoundingClientRect();
          if (gapRect.height <= 0) {
            next.push(null);
            continue;
          }
          next.push({
            y1: fromRect.top + fromRect.height / 2 - gapRect.top,
            y2: toRect.top + toRect.height / 2 - gapRect.top,
          });
        }
        setSegments((previous) =>
          previous.every(
            (segment, index) =>
              segment?.y1 === next[index]?.y1 && segment?.y2 === next[index]?.y2,
          )
            ? previous
            : next,
        );
      } catch {
        setSegments(Array.from({ length: GAP_COUNT }, () => null));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    return () => observer.disconnect();
  });

  return segments;
}

function Connector(props: { index: number; segment: Segment }) {
  return (
    <div className={sx(styles.gap)} data-flow-gap={props.index} aria-hidden>
      {props.segment ? (
        <svg className={sx(styles.gapSvg)} preserveAspectRatio="none">
          <path
            className={sx(styles.connectorPath)}
            d={`M 0 ${props.segment.y1} C 10 ${props.segment.y1}, 10 ${props.segment.y2}, 20 ${props.segment.y2}`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <span className={sx(styles.gapGlyph)}>→</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface RouteFlowProps {
  profile: AutoRoutingProfile;
  signals: RouterSignals;
  route: ResolvedRoute;
  summary: AutoRoutingSignalSummary;
  prompt?: string;
  role: RouterRole;
  runtimeModelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
  /** Tighter padding; hides the per-rule miss notes. */
  compact?: boolean;
  "data-testid"?: string;
}

const HEADER_KEYS = ["settingsConnections:flow.headerPrompt", "settingsConnections:flow.headerSignals", "settingsConnections:flow.headerTask", "settingsConnections:flow.headerRule", "settingsConnections:flow.headerModel"] as const;

/**
 * Prompt → Signals → Task class → Rule → Model as five columns of nodes. The
 * lit node in each column is where the decision landed; the muted nodes are
 * the alternatives the router considered and passed over, with the reason on
 * every rule it skipped on the way down the table.
 */
export function RouteFlow(props: RouteFlowProps) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const { profile, signals, route, summary, role, compact = false } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const segments = useLitConnectors(rootRef);

  const roleRules = profile.rules.filter((rule) => (rule.when.role ?? "primary") === role);
  const matchedIndex = route.ruleId
    ? roleRules.findIndex((rule) => rule.id === route.ruleId)
    : -1;
  const matchedRule = matchedIndex >= 0 ? roleRules[matchedIndex]! : null;
  const signalNodes = buildSignalNodes({ signals, summary, profile });
  const ladder = buildLadder({
    profile,
    route,
    matchedRule,
    runtimeModels: props.runtimeModelsByProvider?.[route.providerId],
  });
  const modelLabel = toHumanModelName({ model: route.model });
  const hiddenSummary = t(route.ruleId ? "settingsConnections:flow.summaryRule" : "settingsConnections:flow.summaryFallback", { taskClass: TASK_CLASS_LABELS[route.taskClass], rule: route.ruleId, model: modelLabel, effort: route.effort ? ` · ${route.effort}` : "", reason: route.reason });

  const nodeStyle = (lit: boolean, extra?: { warn?: boolean }) =>
    sx(
      styles.node,
      compact && styles.nodeCompact,
      lit && styles.nodeLit,
      !lit && styles.nodeMuted,
      extra?.warn && !lit && styles.warnNode,
    );

  return (
    <div
      ref={rootRef}
      className={sx(styles.root)}
      role="group"
      aria-label={t("settingsConnections:routeFlow.routingDecision")}
      data-testid={props["data-testid"]}
    >
      <span className={sx(styles.srOnly)} data-testid="route-flow-summary">
        {hiddenSummary}
      </span>
      {HEADER_KEYS.map((header, index) => (
        <HeaderCell key={header} label={t(header)} withGap={index < HEADER_KEYS.length - 1} />
      ))}

      {/* Col 1 · Prompt */}
      <div className={sx(styles.column, compact && styles.columnCompact)} data-flow-col={0}>
        <div className={nodeStyle(true)} data-flow-lit="true" aria-current="true">
          <span className={sx(styles.prompt)} title={props.prompt}>
            {props.prompt?.trim() || t("settingsConnections:routeFlow.emptyPrompt")}
          </span>
          <span className={sx(styles.caption)}>{ROUTER_ROLE_LABELS[role]}</span>
        </div>
      </div>
      <Connector index={0} segment={segments[0] ?? null} />

      {/* Col 2 · Signals */}
      <div className={sx(styles.column, compact && styles.columnCompact)} data-flow-col={1}>
        {signalNodes.map((signal, index) => (
          <div
            key={signal.id}
            className={nodeStyle(index === 0, { warn: signal.decisive })}
            data-flow-lit={index === 0 ? "true" : undefined}
            data-signal={signal.id}
            data-decisive={signal.decisive ? "true" : undefined}
          >
            <span className={sx(styles.signalLabel, signal.decisive && styles.warnText)}>
              {signal.label}
            </span>
            <span className={sx(styles.signalValue, signal.decisive && styles.warnText)}>
              {signal.value}
            </span>
          </div>
        ))}
      </div>
      <Connector index={1} segment={segments[1] ?? null} />

      {/* Col 3 · Task class */}
      <div className={sx(styles.column, compact && styles.columnCompact)} data-flow-col={2}>
        {TASK_CLASSES.map((taskClass) => {
          const lit = taskClass === route.taskClass;
          return (
            <div
              key={taskClass}
              className={nodeStyle(lit)}
              data-flow-lit={lit ? "true" : undefined}
              data-task-class={taskClass}
              aria-current={lit ? "true" : undefined}
            >
              <span className={sx(styles.nodeRow)}>
                <span className={sx(styles.dot, lit && styles.dotLit)} aria-hidden />
                <span className={sx(styles.primaryText, !lit && styles.primaryTextMuted)}>
                  {TASK_CLASS_LABELS[taskClass]}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <Connector index={2} segment={segments[2] ?? null} />

      {/* Col 4 · Rule */}
      <div className={sx(styles.column, compact && styles.columnCompact)} data-flow-col={3}>
        {roleRules.map((rule, index) => {
          const lit = index === matchedIndex;
          const skipped = matchedIndex === -1 || index < matchedIndex;
          const miss = skipped
            ? explainRuleMiss(rule, signals, role, {
                skillRouting: profile.signals.skillRouting,
              })
            : null;
          return (
            <div
              key={`${rule.id}-${index}`}
              className={nodeStyle(lit)}
              data-flow-lit={lit ? "true" : undefined}
              data-rule-id={rule.id}
              data-rule-state={lit ? "matched" : skipped ? "skipped" : "below"}
              aria-current={lit ? "true" : undefined}
            >
              <span className={sx(styles.nodeRow)}>
                <span className={sx(styles.dot, lit && styles.dotLit)} aria-hidden />
                <span className={sx(styles.ruleId, !lit && styles.ruleIdMuted)}>{rule.id}</span>
              </span>
              <span className={sx(styles.caption)}>
                {describeRuleConditions(rule).join(" · ")}
              </span>
              {skipped && !compact ? (
                <span className={sx(styles.caption)} data-rule-miss>
                  {i18n.t("settingsConnections:messages.ruleSkipped", { reason: miss ?? i18n.t("settingsConnections:routeFlow.lowerRuleMatchedFirst") })}
                </span>
              ) : null}
            </div>
          );
        })}
        {matchedIndex === -1 ? (
          <div
            className={nodeStyle(true)}
            data-flow-lit="true"
            data-rule-id="fallback"
            data-rule-state="matched"
            aria-current="true"
          >
            <span className={sx(styles.nodeRow)}>
              <span className={sx(styles.dot, styles.dotLit)} aria-hidden />
              <span className={sx(styles.ruleId)}>{t("settingsConnections:routeFlow.fallback")}</span>
            </span>
            <span className={sx(styles.caption)}>{t("settingsConnections:routeFlow.noRuleMatched")}</span>
          </div>
        ) : null}
      </div>
      <Connector index={3} segment={segments[3] ?? null} />

      {/* Col 5 · Model */}
      <div className={sx(styles.column, compact && styles.columnCompact)} data-flow-col={4}>
        {ladder.map((rung) => {
          const lit = rung.model === route.model;
          const price = formatModelPrice(rung.model);
          return (
            <div
              key={rung.model}
              className={nodeStyle(lit)}
              data-flow-lit={lit ? "true" : undefined}
              data-model={rung.model}
              aria-current={lit ? "true" : undefined}
            >
              <span className={sx(styles.nodeRow)}>
                <span className={sx(styles.dot, lit && styles.dotLit)} aria-hidden />
                <AgentIdentity
                  providerId={route.providerId}
                  model={rung.model}
                  effort={lit ? (route.effort ?? null) : null}
                  compact
                />
              </span>
              <span className={sx(styles.ladderMeta)}>
                <span>{ROUTE_TIER_LABELS[rung.tier]}</span>
                {price ? <span className={sx(styles.mono)}>{price}</span> : null}
              </span>
              {rung.notes.map((note) => (
                <span
                  key={note}
                  className={sx(
                    note === t("settingsConnections:flow.ruleTarget") || note === t("settingsConnections:flow.fallbackTarget") ? styles.accentNote : styles.adjustNote,
                  )}
                  data-ladder-note
                >
                  {note}
                </span>
              ))}
            </div>
          );
        })}
        <span className={sx(styles.reason)} data-testid="route-flow-reason">
          {route.reason}
        </span>
      </div>
    </div>
  );
}

function HeaderCell(props: { label: string; withGap: boolean }) {
  return (
    <>
      <span className={sx(styles.header)}>{props.label}</span>
      {props.withGap ? <span className={sx(styles.headerGap)} aria-hidden /> : null}
    </>
  );
}
