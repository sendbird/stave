import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { ModelSelector } from "@/components/ai-elements/model-selector";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import { RouteFlow } from "@/components/auto-routing";
import { SettingsAutoRoutingSection } from "@/components/layout/settings-dialog-auto-routing-section";
import { ModelResolutionSummary } from "@/components/session/ModelResolutionSummary";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  formatResolvedRouteLabel,
  resolveRoute,
  STANCE_LABELS,
  type AutoRoutingProfile,
  type ResolvedRoute,
  type RouterSignals,
  type RouteTier,
} from "@/lib/providers/auto-routing-profile";
import type { ModelTier } from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import {
  buildAutoRoutingDecisionRecord,
  computeRouterSignals,
  formatAutoRoutingSignalSummary,
  summarizeRouterSignals,
  taskClassToTaskType,
  type AutoRoutingDecision,
  type AutoRoutingDecisionRecord,
  type AutoRoutingSignalSummary,
} from "@/store/auto-routing";
import { buildAutoRoutingModelResolution } from "@/store/auto-routing-dispatch";
import type { UsageSample } from "@/lib/providers/auto-routing-wizard";
import { useAppStore } from "@/store/app.store";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

export const PREVIEW_PROVIDER_AVAILABILITY: Record<ProviderId, boolean> = {
  "claude-code": true,
  codex: true,
  cursor: true,
  kiro: false,
};

/**
 * Claude's session window is deliberately deep into the budget guard so one
 * of the sample prompts shows the "step down" adjustment; Codex is relaxed so
 * the alternate-provider routes stay untouched.
 */
export function buildPreviewRateLimits(now: number): RateLimitsSnapshotResponse {
  const inTwoHours = now + 2 * 60 * 60_000;
  const inFiveDays = now + 5 * 24 * 60 * 60_000;
  return {
    claude: {
      source: "oauth",
      session: { usedPercent: 86, resetsAt: inTwoHours },
      weekly: { usedPercent: 41, resetsAt: inFiveDays },
      fableWeekly: { usedPercent: 12, resetsAt: inFiveDays },
      error: null,
    },
    codex: {
      source: "rpc",
      buckets: [
        {
          limitId: "codex",
          limitName: null,
          planType: "pro",
          primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: inTwoHours },
          secondary: { usedPercent: 38, windowDurationMins: 10_080, resetsAt: inFiveDays },
          individualLimit: null,
          credits: null,
        },
      ],
      error: null,
    },
    cursor: {
      source: "dashboard",
      planType: "pro",
      monthly: { usedPercent: 54, resetsAt: inFiveDays, used: 270, limit: 500 },
      buckets: [],
      error: null,
    },
    kiro: {
      source: "unavailable",
      planName: null,
      monthly: null,
      buckets: [],
      overagesEnabled: null,
      error: "Kiro is not signed in",
    },
  };
}

/**
 * A fortnight of one developer's prompts, as the usage wizard would pair them
 * with the model that answered: plans and reviews on the frontier tier,
 * implementation on the flagship, quick edits, docs and /ship on the light
 * tier. Enough per class to clear the wizard's minimum sample count.
 */
export function buildPreviewUsageSamples(now: number): UsageSample[] {
  const day = 24 * 60 * 60_000;
  const at = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
  const rows: Array<[string, ProviderId, string, string | undefined, number]> = [
    ["Plan the migration of the terminal host to a single close pipeline.", "claude-code", "claude-opus-5", "high", 13],
    ["Design an architecture for streaming diff review across workspaces.", "claude-code", "claude-opus-5", "high", 12],
    ["Plan how to split the settings dialog into lazy sections.", "claude-code", "claude-opus-5", "medium", 9],
    ["Outline a plan for provider failover when Kiro is signed out.", "codex", "gpt-6-astra", "high", 6],
    ["Implement the close-request drain in electron/terminal/host.ts.", "claude-code", "claude-sonnet-5", "high", 12],
    ["Add a regression test for duplicate close requests and make it pass.", "claude-code", "claude-sonnet-5", "high", 11],
    ["Implement the Delegations panel filter row with All/Advisor/Worker/Tasks.", "codex", "gpt-5.6-sol", "high", 8],
    ["Build the exchange row so it expands into the shared detail body.", "claude-code", "claude-sonnet-5", "high", 5],
    ["Wire the wizard's apply step to updateSettings.", "claude-code", "claude-sonnet-5", "medium", 2],
    ["Review this diff for race conditions in the close ordering.", "codex", "gpt-5.6-sol", "high", 11],
    ["Code review: is the retry loop safe against a duplicate close event?", "codex", "gpt-5.6-sol", "high", 7],
    ["Review the PR for accessibility regressions in the shelf.", "codex", "gpt-5.6-sol", "medium", 3],
    ["Fix typo in the Delegations empty-state copy.", "claude-code", "claude-haiku-4-5", undefined, 10],
    ["Rename useDelegationClock to useExchangeClock.", "claude-code", "claude-haiku-4-5", undefined, 8],
    ["Bump the shelf row gap from 4 to 6.", "claude-code", "claude-haiku-4-5", undefined, 4],
    ["Update docs/features/auto-routing.md to describe the stance model.", "claude-code", "claude-haiku-4-5", undefined, 9],
    ["Write a README section for the Delegations panel.", "claude-code", "claude-haiku-4-5", undefined, 6],
    ["Document the budget guard thresholds in the settings copy.", "codex", "gpt-5.6-luna", "low", 1],
    ["/ship the advisor worker ux branch", "claude-code", "claude-haiku-4-5", undefined, 10],
    ["/ship fix/delegations-panel", "claude-code", "claude-haiku-4-5", undefined, 5],
    ["/ship the auto routing profile change", "claude-code", "claude-haiku-4-5", undefined, 1],
    ["/ci-fix the flaky terminal host test that fails on main", "codex", "gpt-5.6-luna", "low", 7],
    ["/ci-fix lint failures on the release branch", "codex", "gpt-5.6-luna", "low", 2],
    ["Why does the shelf collapse when the worker finishes? Debug it.", "claude-code", "claude-sonnet-5", "high", 9],
    ["Debug the stack trace from the consult log dialog on reopen.", "claude-code", "claude-sonnet-5", "high", 4],
  ];
  return rows.map(([prompt, providerId, model, effort, daysAgo]) => ({
    prompt,
    providerId,
    model,
    ...(effort ? { effort } : {}),
    at: at(daysAgo),
    ...(prompt.startsWith("/") ? { skill: prompt.slice(1).split(/\s+/)[0] } : {}),
  }));
}

interface SamplePrompt {
  id: string;
  title: string;
  prompt: string;
  fileContextCount: number;
  phase?: "plan" | "execute";
}

/** One prompt per lane the router is expected to light up differently. */
const LIVE_SAMPLE: SamplePrompt = {
  id: "implement",
  title: "Implementation (this turn)",
  prompt:
    "Add a regression test for duplicate close requests in the terminal host and make it pass.",
  fileContextCount: 3,
  phase: "execute",
};

export const SAMPLE_PROMPTS: readonly SamplePrompt[] = [
  {
    id: "plan",
    title: "Planning",
    prompt:
      "Plan how to move the terminal host to a single close pipeline. Which modules change, in what order, and what could break?",
    fileContextCount: 0,
    phase: "plan",
  },
  LIVE_SAMPLE,
  {
    id: "ci-fix",
    title: "Skill flow",
    prompt: "/ci-fix the flaky terminal host test that fails on main",
    fileContextCount: 0,
  },
  {
    id: "safety",
    title: "Sensitive change",
    prompt:
      "Rotate the production API keys and update the secrets manager config so the old keys stop working.",
    fileContextCount: 1,
  },
];

export const LIVE_PROMPT: SamplePrompt = LIVE_SAMPLE;

/* -------------------------------------------------------------------------- */
/* Decision plumbing (mirrors what the composer records on a routed turn)     */
/* -------------------------------------------------------------------------- */

const ROUTE_TIER_TO_MODEL_TIER: Readonly<Record<RouteTier, ModelTier>> = {
  frontier: "frontier",
  flagship: "heavy",
  balanced: "standard",
  light: "light",
};

export interface PreviewRouteTrace {
  sample: SamplePrompt;
  signals: RouterSignals;
  route: ResolvedRoute;
  summary: AutoRoutingSignalSummary;
  heuristicRationale: string;
}

export function traceSamplePrompt(args: {
  sample: SamplePrompt;
  profile: AutoRoutingProfile;
  currentProviderId: ProviderId;
  currentModel: string;
  rateLimitsSnapshot: RateLimitsSnapshotResponse;
}): PreviewRouteTrace {
  const { signals, heuristic } = computeRouterSignals({
    prompt: args.sample.prompt,
    fileContextCount: args.sample.fileContextCount,
    history: [],
    currentProviderId: args.currentProviderId,
    currentModel: args.currentModel,
    profile: args.profile,
    phase: args.sample.phase,
    rateLimitsSnapshot: args.rateLimitsSnapshot,
    providerAvailability: PREVIEW_PROVIDER_AVAILABILITY,
  });
  const route = resolveRoute({ profile: args.profile, role: "primary", signals });
  return {
    sample: args.sample,
    signals,
    route,
    summary: summarizeRouterSignals(signals),
    heuristicRationale: heuristic.rationale,
  };
}

export function buildPreviewDecisionRecord(args: {
  trace: PreviewRouteTrace;
  currentProviderId: ProviderId;
  stance: AutoRoutingProfile["stance"];
  resolvedAt: number;
}): AutoRoutingDecisionRecord {
  const { route } = args.trace;
  const effort = route.effort;
  const decision: AutoRoutingDecision = {
    providerId: route.providerId,
    model: route.model,
    role: "primary",
    taskType: taskClassToTaskType(route.taskClass),
    taskClass: route.taskClass,
    tier: ROUTE_TIER_TO_MODEL_TIER[route.tier],
    confidence: 0.86,
    source: "heuristic",
    rationale: args.trace.heuristicRationale,
    ruleId: route.ruleId,
    ruleReason: route.reason,
    stance: args.stance,
    signals: args.trace.summary,
    providerChanged: route.providerId !== args.currentProviderId,
    stick: false,
    ...(effort && route.providerId === "claude-code"
      ? { claudeEffort: effort as NonNullable<AutoRoutingDecision["claudeEffort"]> }
      : {}),
    ...(effort && route.providerId === "codex"
      ? {
          codexReasoningEffort: effort as NonNullable<
            AutoRoutingDecision["codexReasoningEffort"]
          >,
        }
      : {}),
  };
  return buildAutoRoutingDecisionRecord({
    decision,
    prompt: args.trace.sample.prompt,
    resolvedAt: new Date(args.resolvedAt).toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = stylex.create({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  grid: {
    alignItems: "start",
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  caption: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  frame: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-8"],
  },
  composerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  composerHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  traceList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  traceItem: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  traceItemLive: {
    borderColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-8"],
  },
});

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One node flow per sample prompt: which task class, rule and model lit up
 * and what each column passed over on the way there.
 */
function RouteTraceList(props: {
  traces: readonly PreviewRouteTrace[];
  profile: AutoRoutingProfile;
  liveId: string;
}) {
  return (
    <div className={sx(styles.traceList)}>
      {props.traces.map((trace) => {
        const live = trace.sample.id === props.liveId;
        return (
          <div
            key={trace.sample.id}
            className={sx(styles.traceItem, live && styles.traceItemLive)}
            data-live={live ? "" : undefined}
          >
            <span className={sx(styles.caption)}>{trace.sample.title}</span>
            <RouteFlow
              profile={props.profile}
              signals={trace.signals}
              route={trace.route}
              summary={trace.summary}
              prompt={trace.sample.prompt}
              role="primary"
              data-testid={`route-trace-${trace.sample.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function AutoRouterPreviewSection(props: {
  taskId: string;
  currentProviderId: ProviderId;
  currentModel: string;
  rateLimitsSnapshot: RateLimitsSnapshotResponse;
}) {
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const wizardSamples = useMemo(() => buildPreviewUsageSamples(Date.now()), []);
  const autoRoutingEnabled = useAppStore(
    (state) => state.settings.autoRoutingEnabled,
  );
  const record = useAppStore(
    (state) => state.autoRoutingDecisionByTask[props.taskId] ?? null,
  );

  // Recomputed from the live profile so edits in the settings editor below
  // move the flows immediately — that loop is the point of the boilerplate.
  const traces = useMemo(
    () =>
      SAMPLE_PROMPTS.map((sample) =>
        traceSamplePrompt({
          sample,
          profile,
          currentProviderId: props.currentProviderId,
          currentModel: props.currentModel,
          rateLimitsSnapshot: props.rateLimitsSnapshot,
        }),
      ),
    [profile, props.currentModel, props.currentProviderId, props.rateLimitsSnapshot],
  );

  const autoOption = useMemo<ModelSelectorOption>(
    () =>
      buildAutoModelSelectorOption({
        providerId: props.currentProviderId,
        available: autoRoutingEnabled,
        stanceLabel: STANCE_LABELS[profile.stance],
        routed:
          record && record.decision.source !== "disabled" && record.decision.source !== "manual"
            ? {
                label: formatResolvedRouteLabel({
                  model: record.decision.model,
                  effort:
                    record.decision.claudeEffort ?? record.decision.codexReasoningEffort,
                }),
                description: `${record.decision.ruleReason} — ${formatAutoRoutingSignalSummary(record.decision.signals)}`,
              }
            : null,
      }),
    [autoRoutingEnabled, profile.stance, props.currentProviderId, record],
  );
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      autoOption,
      buildModelSelectorValue({ providerId: "claude-code", model: "claude-opus-5" }),
      buildModelSelectorValue({ providerId: "claude-code", model: "claude-sonnet-5" }),
      buildModelSelectorValue({ providerId: "codex", model: "gpt-5.6-sol" }),
    ],
    [autoOption],
  );

  const resolution = record
    ? buildAutoRoutingModelResolution({
        decision: record.decision,
        provider: record.decision.providerId,
        model: record.decision.model,
      })
    : null;

  return (
    <section className={sx(styles.section)} aria-label="Stave Auto preview">
      <p className={sx(styles.label)}>
        Stave Auto · Model Router (live against the profile edited below)
      </p>
      <p className={sx(styles.label)}>Route trace · one flow per prompt</p>
      <RouteTraceList traces={traces} profile={profile} liveId={LIVE_PROMPT.id} />
      <p className={sx(styles.caption)}>
        Claude session budget is seeded at 86% so the budget guard is visible;
        Kiro is seeded as unavailable so provider fallback is exercised. Edit
        the stance or a rule below and the flows re-route.
      </p>
      <div className={sx(styles.grid)}>
        <div className={sx(styles.stack)}>
          <p className={sx(styles.label)}>Composer · Auto pill after a routed turn</p>
          <div className={sx(styles.frame)}>
            <div className={sx(styles.composerRow)}>
              <ModelSelector
                value={autoOption}
                options={modelOptions}
                triggerAriaLabel="Model"
                onSelect={() => {}}
              />
              <span className={sx(styles.composerHint)} title={record?.promptPreview}>
                {record ? `for “${record.promptPreview}”` : "no routed turn yet"}
              </span>
            </div>
          </div>
        </div>
        <div className={sx(styles.stack)}>
          <p className={sx(styles.label)}>Turn · model resolution</p>
          <div className={sx(styles.frame)}>
            <ModelResolutionSummary
              actual={
                record
                  ? {
                      providerId: record.decision.providerId,
                      model: record.decision.model,
                      modelInfo: record.decision.claudeEffort
                        ? { effort: record.decision.claudeEffort }
                        : undefined,
                    }
                  : null
              }
              resolution={resolution ?? undefined}
            />
          </div>
        </div>
      </div>
      <p className={sx(styles.label)}>
        Settings · Auto (Model Router) — the usage wizard is fed two weeks of
        sample prompts; press “Scan my history” to see the proposal
      </p>
      <SettingsAutoRoutingSection wizardSamples={wizardSamples} />
    </section>
  );
}
