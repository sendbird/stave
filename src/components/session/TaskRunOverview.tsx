import { i18n, useTranslation } from "@/i18n";
import { Circle, CircleAlert, CircleCheck } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  classifyProviderTurnStopReason,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivity,
} from "@/lib/providers/turn-status";
import * as stylex from "@stylexjs/stylex";
import { focusRing } from "../ads/recipes/focus-ring";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import type { AgentTurnProvenance } from "@/lib/agents/turn-provenance";
import type {
  AutoRoutingModelResolution,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  formatActualRunModel,
  ModelResolutionSummary,
  type ActualRunModel,
} from "./ModelResolutionSummary";

const EMPTY_MESSAGES: ChatMessage[] = [];

const ICONED_PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "kiro",
]);

/** A recorded run can name a provider the catalog has no mark for. */
function toIconedProviderId(providerId: string): ProviderId | null {
  return ICONED_PROVIDER_IDS.has(providerId)
    ? (providerId as ProviderId)
    : null;
}

export type RunStatus = {
  label: string;
  detail?: string;
  tone: "active" | "waiting" | "success" | "danger" | "neutral";
};

function normalizeStopReason(message: ChatMessage | null) {
  return message?.terminalStopReason?.trim().toLowerCase() ?? "";
}

export function resolveRunStatus(args: {
  activeTurnId: string | null;
  activity: ProviderTurnActivitySnapshot | null;
  retained: RetainedTurnActivity | null;
  message: ChatMessage | null;
}): RunStatus {
  if (args.activeTurnId) {
    const activity =
      args.activity?.turnId === args.activeTurnId ? args.activity : null;
    if (activity?.pendingInteraction === "approval") {
      return { label: i18n.t("session:taskRunOverview.label"), detail: i18n.t("session:taskRunOverview.detail"), tone: "waiting" };
    }
    if (activity?.pendingInteraction === "user_input") {
      return { label: i18n.t("session:taskRunOverview.label2"), detail: i18n.t("session:taskRunOverview.detail2"), tone: "waiting" };
    }
    if (activity?.stalledAt != null) {
      return {
        label: i18n.t("session:taskRunOverview.label3"),
        detail: i18n.t("session:taskRunOverview.detail3"),
        tone: "waiting",
      };
    }
    return { label: i18n.t("session:taskRunOverview.label4"), tone: "active" };
  }

  const receipt = args.message?.terminalReceipt ??
    args.retained?.snapshot.terminalReceipt;
  if (receipt?.completedAt) {
    if (receipt.outcome === "failed") return { label: i18n.t("session:taskRunOverview.label5"), tone: "danger" };
    if (receipt.outcome === "cancelled") return { label: i18n.t("session:taskRunOverview.label6"), tone: "neutral" };
    if (receipt.outcome === "completed") return { label: i18n.t("session:taskRunOverview.label7"), tone: "success" };
    return { label: i18n.t("session:taskRunOverview.label8"), detail: i18n.t("session:taskRunOverview.detail4"), tone: "neutral" };
  }
  if (
    (args.activity?.completedAt && args.activity.turnError) ||
    args.retained?.outcome === "failed"
  ) {
    return { label: i18n.t("session:taskRunOverview.label9"), tone: "danger" };
  }
  const stopReason = normalizeStopReason(args.message);
  if (stopReason && classifyProviderTurnStopReason(stopReason) === "failed") {
    return { label: i18n.t("session:taskRunOverview.label10"), tone: "danger" };
  }
  if (
    stopReason &&
    classifyProviderTurnStopReason(stopReason) === "cancelled"
  ) {
    return { label: i18n.t("session:taskRunOverview.label11"), tone: "neutral" };
  }
  if (stopReason === "completed" || stopReason === "end_turn") {
    return { label: i18n.t("session:taskRunOverview.label12"), tone: "success" };
  }
  if (stopReason) {
    return {
      label: i18n.t("session:taskRunOverview.label13"),
      detail: i18n.t("session:taskRunOverview.detail5", { value1: stopReason }),
      tone: "neutral",
    };
  }
  if (args.retained?.outcome === "stopped") {
    return { label: i18n.t("session:taskRunOverview.label14"), tone: "neutral" };
  }
  if (args.message || args.retained) {
    return {
      label: i18n.t("session:taskRunOverview.label15"),
      detail: i18n.t("session:taskRunOverview.detail6"),
      tone: "neutral",
    };
  }
  return { label: i18n.t("session:taskRunOverview.label16"), tone: "neutral" };
}

/** Only the resting tones reach this: a live run is announced by the shelf. */
function StatusIcon({ tone }: { tone: Exclude<RunStatus["tone"], "active" | "waiting"> }) {
  useTranslation();
  if (tone === "success") {
    return <CircleCheck className={sx(styles.icon)} aria-hidden />;
  }
  if (tone === "danger") {
    return <CircleAlert className={sx(styles.icon)} aria-hidden />;
  }
  return <Circle className={sx(styles.icon)} aria-hidden />;
}

/** Mounted only by the selected Activity panel, keeping this subscription local. */
export function TaskRunOverview() {
  useTranslation();
  const [workspaceId, taskId, activeTurnId, messages, activity, retained] =
    useAppStore(
      useShallow((state) => {
        const activeTaskId = state.activeTaskId;
        const taskWorkspaceId = activeTaskId
          ? (state.taskWorkspaceIdById[activeTaskId] ?? state.activeWorkspaceId)
          : null;
        const scoped =
          activeTaskId != null && taskWorkspaceId === state.activeWorkspaceId;
        return [
          state.activeWorkspaceId,
          scoped ? activeTaskId : null,
          scoped ? (state.activeTurnIdsByTask[activeTaskId] ?? null) : null,
          scoped
            ? (state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES)
            : EMPTY_MESSAGES,
          scoped
            ? (state.providerTurnActivityByTask[activeTaskId] ?? null)
            : null,
          scoped
            ? (state.retainedTurnActivityByTask[activeTaskId] ?? null)
            : null,
        ] as const;
      }),
    );

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === "assistant") return candidate;
    }
    return null;
  }, [messages]);
  const runTurnId = activeTurnId
    ? activeTurnId
    : latestAssistantMessage
      ? (latestAssistantMessage.turnId ?? null)
      : (activity?.turnId ?? retained?.snapshot.turnId ?? null);
  const message = useMemo(() => {
    if (!runTurnId) return latestAssistantMessage;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === "assistant" && candidate.turnId === runTurnId) {
        return candidate;
      }
    }
    return null;
  }, [latestAssistantMessage, messages, runTurnId]);
  const resolution = useMemo(() => {
    if (!runTurnId) return message?.modelResolution;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (
        candidate?.role === "assistant" &&
        candidate.modelResolution &&
        candidate.turnId === runTurnId
      ) {
        return candidate.modelResolution;
      }
    }
    return undefined;
  }, [message, messages, runTurnId]);
  const displayedActivity = activity?.turnId === runTurnId ? activity : null;
  const displayedRetained =
    retained?.snapshot.turnId === runTurnId ? retained : null;
  const status = resolveRunStatus({
    activeTurnId,
    activity: displayedActivity,
    retained: displayedRetained,
    message,
  });
  const actualModel =
    message && message.providerId !== "user"
      ? {
          providerId: message.providerId,
          model: message.model,
          modelInfo: message.modelInfo,
          modelExecution: message.modelExecution,
        }
      : null;
  const hasRun = Boolean(activeTurnId || message || activity || retained);
  const title = activeTurnId
    ? i18n.t("session:taskRunOverview.title")
    : hasRun
      ? i18n.t("session:taskRunOverview.title2")
      : i18n.t("session:taskRunOverview.title3");

  if (!workspaceId || !taskId) {
    return null;
  }

  return (
    <TaskRunOverviewView
      title={title}
      status={status}
      actualModel={actualModel}
      resolution={resolution}
      agentProvenance={message?.agentProvenance}
      runTurnId={runTurnId}
    />
  );
}

/**
 * The run header itself, free of the store so the layout can be rendered in a
 * test: a stable summary that names the run on the left and what ran it on the
 * right. Auto-routing rationale remains available in a separate disclosure.
 */
export function TaskRunOverviewView(props: {
  title: string;
  status: RunStatus;
  actualModel: ActualRunModel | null;
  resolution?: AutoRoutingModelResolution;
  agentProvenance?: AgentTurnProvenance;
  runTurnId?: string | null;
}) {
  useTranslation();
  const { actualModel, resolution, runTurnId, status, title } = props;
  const modelMark = actualModel
    ? {
        providerId: toIconedProviderId(actualModel.providerId),
        label: formatActualRunModel(actualModel),
      }
    : resolution
      ? {
          providerId: resolution.selectedProviderId,
          label:
            toHumanModelName({ model: resolution.selectedModel }) ||
            resolution.selectedModel,
        }
      : null;
  // A live run, waiting on you included, is written once: on the composer
  // shelf's run line. The status here speaks only once the run has ended.
  const restingTone =
    status.tone === "active" || status.tone === "waiting" ? null : status.tone;
  const live = restingTone === null;
  const hasRoutingDetails = Boolean(resolution || actualModel?.modelExecution || props.agentProvenance);

  const headerRow = (
    <>
      <span className={sx(styles.titleContainer)}>
        <h3 id="task-run-overview-title" className={sx(styles.title)}>
          {title}
        </h3>
        {restingTone ? (
          <span
            role="status"
            className={sx(styles.status, statusTones[restingTone])}
          >
            <StatusIcon tone={restingTone} />
            {status.label}
          </span>
        ) : null}
      </span>
      {modelMark ? (
        <span className={sx(styles.model)} title={modelMark.label}>
          {modelMark.providerId ? (
            <ModelIcon
              providerId={modelMark.providerId}
              className={sx(styles.modelIcon)}
            />
          ) : null}
          <span className={sx(styles.modelName)}>{modelMark.label}</span>
        </span>
      ) : null}
    </>
  );

  return (
    <section
      aria-labelledby="task-run-overview-title"
      className={sx(styles.panel)}
      data-testid="task-run-overview"
    >
      <div className={sx(styles.header)}>{headerRow}</div>

      {status.detail && !live ? (
        <p className={sx(styles.detail)}>{status.detail}</p>
      ) : null}
      {hasRoutingDetails ? (
        <details
          key={runTurnId ?? "unknown"}
          className={sx(styles.modelDetails)}
        >
          <summary className={sx(styles.disclosure, focusRing.ring)}>
            {props.agentProvenance ? i18n.t("session:taskRunOverview.taskRunOverviewView") : resolution ? i18n.t("session:taskRunOverview.taskRunOverviewView2") : i18n.t("session:taskRunOverview.taskRunOverviewView3")}
          </summary>
          <div className={sx(styles.modelContent)}>
            <ModelResolutionSummary
              actual={actualModel}
              resolution={resolution}
              agentProvenance={props.agentProvenance}
              showModelFacts={false}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
    padding: vars["--ads-space-12"],
  },
  // What the run is on the left, what ran it on the right. Long model names
  // may wrap onto another line instead of clipping in a narrow panel.
  header: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  titleContainer: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    fontWeight: vars["--ads-font-weight-medium"],
    whiteSpace: "nowrap",
  },
  status: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
  },
  icon: { width: 14, height: 14, flexShrink: 0 },
  // The run's identity, not a status: the provider mark and the model name
  // read as one object, so they share the right edge the badge used to hold.
  model: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    // Holds that edge however short the title beside it is.
    marginInlineStart: "auto",
    minWidth: 0,
  },
  modelIcon: { width: 14, height: 14, flexShrink: 0 },
  modelName: {
    overflowWrap: "break-word",
    textAlign: "end",
    whiteSpace: "normal",
  },
  detail: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    color: vars["--ads-color-text-muted"],
  },
  modelDetails: { fontSize: vars["--ads-font-size-caption"] },
  disclosure: {
    cursor: "pointer",
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
  },
  modelContent: { paddingTop: vars["--ads-space-8"] },
});

const statusTones = stylex.create({
  success: { color: vars["--ads-color-success"] },
  danger: { color: vars["--ads-color-danger"] },
  neutral: { color: vars["--ads-color-text-muted"] },
});
