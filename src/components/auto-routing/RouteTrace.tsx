import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  ROUTE_COMPLEXITY_LABELS,
  STANCE_LABELS,
  TASK_CLASS_LABELS,
  type Stance,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import { getProviderLabel, listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { describeRoutingDecisionFacts } from "@/lib/providers/routing-decision-label";
import type {
  AutoRoutingDecision,
  AutoRoutingDecisionRecord,
} from "@/lib/routing/auto-routing";
import type { RouteTraceEntry } from "./route-trace-entry";
import { routeTraceStyles as styles } from "./route-trace.styles";

/* -------------------------------------------------------------------------- */
/* Signals                                                                    */
/* -------------------------------------------------------------------------- */

export interface RouteTraceSignalChip {
  id: string;
  label: string;
  /** The signal moved the decision (sensitive, deep budget, skill, outage). */
  decisive: boolean;
}

/**
 * Signal chips for one recorded decision. Mirrors `RouteFlow`'s signal
 * column but reads the persisted summary, so the shelf needs no profile or
 * live rate-limit snapshot to redraw a decision the router already made.
 */
export function buildRouteTraceSignals(args: {
  decision: Pick<AutoRoutingDecision, "signals">;
  budgetStepDownAt?: number;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
}): RouteTraceSignalChip[] {
  const { signals } = args.decision;
  const chips: RouteTraceSignalChip[] = [];
  if (signals.skill) {
    chips.push({ id: "skill", label: `/${signals.skill}`, decisive: true });
  }
  if (signals.phase) {
    chips.push({ id: "phase", label: signals.phase, decisive: false });
  }
  chips.push({
    id: "complexity",
    label: i18n.t("settingsConnections:messages.level", { level: ROUTE_COMPLEXITY_LABELS[signals.complexity] ?? signals.complexity }),
    decisive: false,
  });
  if (signals.sensitive) {
    chips.push({ id: "sensitive", label: i18n.t("settingsConnections:messages.sensitive"), decisive: true });
  }
  if (signals.fileContextCount > 0) {
    chips.push({
      id: "files",
      label: i18n.t("settingsConnections:messages.files", { count: signals.fileContextCount }),
      decisive: false,
    });
  }
  if (typeof signals.budgetUsedPercent === "number") {
    const deep =
      typeof args.budgetStepDownAt === "number" &&
      signals.budgetUsedPercent >= args.budgetStepDownAt;
    chips.push({
      id: "budget",
      label: i18n.t("settingsConnections:messages.budget", { percent: signals.budgetUsedPercent }),
      decisive: deep,
    });
  }
  const unavailable = listProviderIds().filter(
    (providerId) => args.providerAvailability?.[providerId] === false,
  );
  if (unavailable.length > 0) {
    chips.push({
      id: "providers",
      label: i18n.t("settingsConnections:routeTrace.unavailable", { value1: unavailable.map((providerId) => getProviderLabel({ providerId })).join(", ") }),
      decisive: true,
    });
  }
  return chips;
}

function toSourceLabel(source: RouteTraceEntry["source"]) {
  switch (source) {
    case "classifier":
      return i18n.t("settingsConnections:messages.sourceClassifier");
    case "classifier_fallback":
      return i18n.t("settingsConnections:routeTrace.classifierFallback");
    case "heuristic":
      return i18n.t("settingsConnections:messages.sourceHeuristic");
    case "manual":
      return i18n.t("settingsConnections:messages.sourceManual");
    case "disabled":
      return i18n.t("settingsConnections:messages.sourceDisabled");
  }
}

/** True for decisions the router made; manual picks and disabled Auto have no route. */
export function isRoutedDecision(
  record: AutoRoutingDecisionRecord | null | undefined,
): record is AutoRoutingDecisionRecord {
  return (
    record != null &&
    record.decision.source !== "disabled" &&
    record.decision.source !== "manual"
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface RouteTraceProps {
  entry: RouteTraceEntry;
  /** Usage percent at which the budget guard steps down; marks the chip. */
  budgetStepDownAt?: number;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  /** Starts folded to the one-line header; the chain opens on demand. */
  defaultCollapsed?: boolean;
  className?: string;
  "data-testid"?: string;
}

interface Hop {
  id: string;
  label: string;
  warn?: boolean;
  body: ReactNode;
}

/**
 * The route one turn actually took, top to bottom: prompt → signals →
 * decision model → task class → rule → model. Every hop is the node that lit; nothing the router
 * passed over is drawn, so the chain reads as "what is running and why"
 * while the turn is live rather than as a table to study afterwards.
 */
export function RouteTrace(props: RouteTraceProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { entry } = props;
  const [collapsed, setCollapsed] = useState(props.defaultCollapsed ?? false);
  const effort = entry.effort;
  const chips = entry.signals
    ? buildRouteTraceSignals({
        decision: { signals: entry.signals },
        budgetStepDownAt: props.budgetStepDownAt,
        providerAvailability: props.providerAvailability,
      })
    : [];
  const decisive = chips.some((chip) => chip.decisive);
  const facts = describeRoutingDecisionFacts(entry.routingDecision);
  const taskLabel = entry.taskClass
    ? (TASK_CLASS_LABELS[entry.taskClass as TaskClass] ?? entry.taskClass)
    : null;
  const ruleLabel = entry.ruleId ?? "fallback";
  const stanceLabel = entry.stance
    ? (STANCE_LABELS[entry.stance as Stance] ?? entry.stance)
    : null;

  const hops: Hop[] = [
    {
      id: "prompt",
      label: t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.label"),
      body: (
        <span className={sx(styles.prompt)} title={entry.promptPreview}>
          {entry.promptPreview || t("settingsConnections:routeFlow.emptyPrompt")}
        </span>
      ),
    },
    ...(chips.length > 0
      ? [{
          id: "signals",
          label: t("settingsConnections:routeTrace.signals"),
          warn: decisive,
          body: (
            <span className={sx(styles.chips)}>
              {chips.map((chip) => (
                <span
                  key={chip.id}
                  className={sx(styles.chip, chip.decisive && styles.chipWarn)}
                  data-signal={chip.id}
                  data-decisive={chip.decisive ? "true" : undefined}
                >
                  {chip.label}
                </span>
              ))}
            </span>
          ),
        }]
      : []),
    ...(facts.length > 0
      ? [{
          id: "decision",
          label: t("settingsConnections:routeTrace.decision"),
          warn: facts.some((fact) => fact.warn),
          body: (
            <span className={sx(styles.facts)}>
              {facts.map((fact) => (
                <span key={fact.key} className={sx(styles.row)} data-decision-fact={fact.key}>
                  <span className={sx(styles.caption)}>{fact.label}</span>
                  <span
                    className={sx(styles.factValue, fact.warn && styles.factWarn)}
                    title={fact.title}
                  >
                    {fact.value}
                  </span>
                </span>
              ))}
            </span>
          ),
        }]
      : []),
    {
      id: "task",
      label: t("settingsConnections:routeTrace.task"),
      body: (
        <span className={sx(styles.row)}>
          {taskLabel ? (
            <span className={sx(styles.hopValue)} data-task-class={entry.taskClass ?? undefined}>
              {taskLabel}
            </span>
          ) : null}
          <span className={sx(styles.caption)}>
            {toSourceLabel(entry.source)}
            {entry.confidence !== null && entry.source === "classifier" && entry.confidence < 1
              ? t("settingsConnections:routeTrace.sure", { value1: Math.round(entry.confidence * 100) })
              : null}
          </span>
        </span>
      ),
    },
    {
      id: "rule",
      label: t("settingsConnections:routeTrace.rule"),
      body: (
        <>
          <span className={sx(styles.row)}>
            <span className={sx(styles.mono)} data-rule-id={ruleLabel}>
              {ruleLabel}
            </span>
            {stanceLabel ? (
              <span className={sx(styles.caption)}>{t("settingsConnections:messages.stance", { stance: stanceLabel })}</span>
            ) : null}
          </span>
          {entry.ruleReason ? (
            <span className={sx(styles.caption)} data-testid="route-trace-reason">
              {entry.ruleReason}
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: "model",
      label: t("settingsProviders:auxiliaryInference.model.title"),
      body: (
        <AgentIdentity
          providerId={entry.providerId}
          model={entry.model}
          effort={effort}
          compact
        />
      ),
    },
  ];

  const summary = t(entry.ruleId ? "settingsConnections:messages.traceRuleSummary" : "settingsConnections:messages.traceFallbackSummary", { taskClass: taskLabel ?? toSourceLabel(entry.source), rule: entry.ruleId, model: entry.model, effort: effort ? ` · ${effort}` : "" });

  return (
    <section
      className={props.className}
      aria-label={t("settingsConnections:routeTrace.route")}
      data-testid={props["data-testid"] ?? "route-trace"}
      data-collapsed={collapsed ? "true" : undefined}
      data-route-origin={entry.origin}
    >
      <div className={sx(styles.header)} data-testid="route-trace-header">
        <h3 className={sx(styles.title)}>
          <span className={sx(styles.titleLead)}>{t("settingsConnections:routeTrace.route")}</span>
          <span className={sx(styles.titleSep)} aria-hidden>
            ·
          </span>
          <span className={sx(styles.titleMuted)}>
            <span className={sx(styles.titleIdentity)}>
              <AgentIdentity
                providerId={entry.providerId}
                model={entry.model}
                effort={effort}
                compact
              />
            </span>
            <span className={sx(styles.titleRule)}>← {ruleLabel}</span>
          </span>
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={sx(styles.toggle)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("settingsConnections:routeTrace.showHowThisModelWasChosen") : t("settingsConnections:routeTrace.hideRoute")}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? t("settingsConnections:routeTrace.why") : t("common:actions.hide")}
          {collapsed ? (
            <ChevronDown aria-hidden size={12} />
          ) : (
            <ChevronUp aria-hidden size={12} />
          )}
        </Button>
      </div>
      <span className={sx(styles.srOnly)} data-testid="route-trace-summary">
        {summary}
      </span>
      {collapsed ? null : (
        <ol className={sx(styles.chain)} data-testid="route-trace-chain">
          {hops.map((hop, index) => {
            const last = index === hops.length - 1;
            return (
              <li key={hop.id} className={sx(styles.hopItem)} data-hop={hop.id}>
                <span className={sx(styles.railCell)} aria-hidden>
                  <span className={sx(styles.dot, hop.warn && styles.dotWarn)} />
                  {last ? null : <span className={sx(styles.rail)} />}
                </span>
                <span className={sx(styles.hop, last && styles.hopLast)}>
                  <span className={sx(styles.hopLabel)}>{hop.label}</span>
                  {hop.body}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
