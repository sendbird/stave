import { Circle, CircleAlert, CircleCheck, CirclePause } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  classifyProviderTurnStopReason,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivity,
} from "@/lib/providers/turn-status";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "../ads/components/Badge";
import { Loader } from "../ads/components/Loader";
import { focusRing } from "../ads/recipes/focus-ring";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { ModelResolutionSummary } from "./ModelResolutionSummary";

const EMPTY_MESSAGES: ChatMessage[] = [];
type RunStatus = {
  label: string;
  detail?: string;
  tone: "active" | "waiting" | "success" | "danger" | "neutral";
};

function normalizeStopReason(message: ChatMessage | null) {
  return message?.terminalStopReason?.trim().toLowerCase() ?? "";
}

function resolveRunStatus(args: {
  activeTurnId: string | null;
  activity: ProviderTurnActivitySnapshot | null;
  retained: RetainedTurnActivity | null;
  message: ChatMessage | null;
}): RunStatus {
  if (args.activeTurnId) {
    const activity =
      args.activity?.turnId === args.activeTurnId ? args.activity : null;
    if (activity?.pendingInteraction === "approval") {
      return { label: "Waiting", detail: "Approval needed", tone: "waiting" };
    }
    if (activity?.pendingInteraction === "user_input") {
      return { label: "Waiting", detail: "Input needed", tone: "waiting" };
    }
    if (activity?.stalledAt != null) {
      return {
        label: "Waiting",
        detail: "No recent provider activity",
        tone: "waiting",
      };
    }
    return { label: "Running", tone: "active" };
  }

  const stopReason = normalizeStopReason(args.message);
  if (stopReason && classifyProviderTurnStopReason(stopReason) === "failed") {
    return { label: "Failed", tone: "danger" };
  }
  if (
    stopReason &&
    classifyProviderTurnStopReason(stopReason) === "cancelled"
  ) {
    return { label: "Stopped", tone: "neutral" };
  }
  if (stopReason === "completed" || stopReason === "end_turn") {
    return { label: "Completed", tone: "success" };
  }
  if (stopReason) {
    return {
      label: "Ended",
      detail: `Provider stop: ${stopReason}`,
      tone: "neutral",
    };
  }
  if (args.activity?.completedAt && args.activity.turnError) {
    return { label: "Failed", tone: "danger" };
  }
  if (args.retained?.outcome === "failed") {
    return { label: "Failed", tone: "danger" };
  }
  if (args.retained?.outcome === "stopped") {
    return { label: "Stopped", tone: "neutral" };
  }
  if (args.message || args.retained) {
    return {
      label: "Ended",
      detail: "Completion status was not reported",
      tone: "neutral",
    };
  }
  return { label: "No run yet", tone: "neutral" };
}

function StatusIcon({ tone }: { tone: RunStatus["tone"] }) {
  if (tone === "active") {
    return <Loader size="sm" tone="accent" aria-hidden />;
  }
  if (tone === "waiting") {
    return <CirclePause className={sx(styles.icon)} aria-hidden />;
  }
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
      ? { providerId: message.providerId, model: message.model }
      : null;
  const hasRun = Boolean(activeTurnId || message || activity || retained);
  const title = activeTurnId
    ? "Current run"
    : hasRun
      ? "Last run"
      : "Run overview";

  if (!workspaceId || !taskId) {
    return null;
  }

  return (
    <section
      aria-labelledby="task-run-overview-title"
      className={sx(styles.panel)}
      data-testid="task-run-overview"
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.titleContainer)}>
          <h3 id="task-run-overview-title" className={sx(styles.title)}>
            {title}
          </h3>
        </div>
        <Badge
          role="status"
          variant="outline"
          tone={
            status.tone === "active"
              ? "accent"
              : status.tone === "waiting"
                ? "warning"
                : status.tone
          }
        >
          <StatusIcon tone={status.tone} />
          {status.label}
        </Badge>
      </div>

      {status.detail ? (
        <p className={sx(styles.detail)}>{status.detail}</p>
      ) : null}

      {actualModel || resolution ? (
        <details
          key={runTurnId ?? "unknown"}
          className={sx(styles.modelDetails)}
        >
          <summary className={sx(styles.disclosure, focusRing.ring)}>
            Model details
          </summary>
          <div className={sx(styles.modelContent)}>
            <ModelResolutionSummary
              actual={actualModel}
              resolution={resolution}
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
    gap: vars.space8,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorderSubtle,
    padding: vars.space12,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  titleContainer: { minWidth: 0 },
  title: {
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    fontWeight: vars.fontWeightMedium,
  },
  icon: { width: 16, height: 16, flexShrink: 0 },
  detail: {
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    color: vars.colorTextMuted,
  },
  modelDetails: { fontSize: vars.fontSizeCaption },
  disclosure: {
    cursor: "pointer",
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
  },
  modelContent: { paddingTop: vars.space8 },
});
