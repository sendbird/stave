import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Route, TriangleAlert } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button, Loader } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import type { AutoRoutingModelResolution } from "@/lib/providers/provider.types";
import { skipPendingAutoRoutingClassifier } from "@/store/auto-routing-dispatch";
import {
  updatePendingAutoRoute,
  type PendingAutoRoute,
} from "@/store/pending-auto-routing-store";
import type { ChatMessage } from "@/types/chat";
import { ModelResolutionSummary } from "./ModelResolutionSummary";
import {
  buildAutoRouteLineView,
  formatRouteElapsed,
  PENDING_AUTO_ROUTE_REVEAL_DELAY_MS,
} from "./auto-route-line.utils";
import { autoRouteLineStyles as styles } from "./auto-route-line.styles";

/**
 * The route Auto chose for one turn, drawn once above its response:
 * `Auto → Opus 5 · High · Implement · 2.4s`. A local-rules fallback is marked
 * here instead of raising a notification; "Why" opens the recorded evidence.
 */
export const AutoRouteLine = memo(function AutoRouteLine(props: {
  resolution: AutoRoutingModelResolution;
  message: Pick<
    ChatMessage,
    "providerId" | "model" | "modelInfo" | "modelExecution"
  >;
}) {
  const { resolution, message } = props;
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(
    () => buildAutoRouteLineView({ resolution, message }),
    [message, resolution],
  );
  const Icon = view.fallback ? TriangleAlert : Route;
  return (
    <div className={sx(styles.root)} data-testid="auto-route-line">
      <div
        className={sx(styles.line)}
        title={view.description}
        data-route-source={resolution.source}
        data-route-fallback={view.fallback ?? undefined}
      >
        <Icon
          aria-hidden
          className={sx(styles.icon, view.fallback !== null && styles.iconWarn)}
        />
        <span className={sx(styles.lead)}>Auto →</span>
        <span className={sx(styles.model)}>{view.modelLabel}</span>
        {view.taskLabel ? (
          <>
            <span className={sx(styles.separator)} aria-hidden>
              ·
            </span>
            <span className={sx(styles.meta)}>{view.taskLabel}</span>
          </>
        ) : null}
        {view.fallback ? (
          <>
            <span className={sx(styles.separator)} aria-hidden>
              ·
            </span>
            <span
              className={sx(styles.meta, styles.metaWarn)}
              data-testid="auto-route-fallback"
            >
              {view.fallback === "skipped" ? "Skipped classifier" : "Local rules"}
            </span>
          </>
        ) : null}
        {view.elapsedLabel ? (
          <>
            <span className={sx(styles.separator)} aria-hidden>
              ·
            </span>
            <span className={sx(styles.meta, styles.elapsed)}>
              {view.elapsedLabel}
            </span>
          </>
        ) : null}
        {view.ranLabel ? (
          <>
            <span className={sx(styles.separator)} aria-hidden>
              ·
            </span>
            <span className={sx(styles.meta)} data-testid="auto-route-ran">
              ran {view.ranLabel}
            </span>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={sx(styles.toggle)}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Hide how Auto chose this model" : "Show how Auto chose this model"
          }
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide" : "Why"}
          {expanded ? (
            <ChevronUp aria-hidden size={12} />
          ) : (
            <ChevronDown aria-hidden size={12} />
          )}
        </Button>
      </div>
      {expanded ? (
        <div className={sx(styles.detail)}>
          <ModelResolutionSummary
            actual={
              message.providerId === "user"
                ? null
                : {
                    providerId: message.providerId,
                    model: message.model,
                    modelInfo: message.modelInfo,
                    modelExecution: message.modelExecution,
                  }
            }
            resolution={resolution}
            showModelFacts={false}
          />
        </div>
      ) : null}
    </div>
  );
});

/** Ticks only while this row is mounted; the transcript around it never rerenders. */
function usePendingElapsedMs(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return Math.max(0, now - startedAt);
}

/**
 * The route line while Auto is still deciding. Draws nothing for the first
 * half second, so a quick classifier answer goes straight to the turn; after
 * that it shows the wait and offers to start on local rules instead.
 */
export function PendingAutoRouteStatus(props: { pending: PendingAutoRoute }) {
  const { pending } = props;
  const elapsedMs = usePendingElapsedMs(pending.startedAt);
  if (elapsedMs < PENDING_AUTO_ROUTE_REVEAL_DELAY_MS) {
    return null;
  }
  const phrase =
    pending.phase === "starting"
      ? pending.routedLabel
        ? `Starting ${pending.routedLabel}…`
        : "Starting…"
      : pending.skipped
        ? "Starting on local rules…"
        : "Choosing a model…";
  const canSkip = pending.phase === "classifying" && !pending.skipped;
  return (
    <div
      className={sx(styles.line)}
      role="status"
      aria-live="polite"
      data-testid="pending-auto-route"
      data-route-phase={pending.phase}
    >
      <Loader aria-hidden size="xs" variant="route" />
      <span className={sx(styles.lead)}>Auto ·</span>
      <Shimmer as="span" className={sx(styles.pendingPhrase)}>
        {phrase}
      </Shimmer>
      <span className={sx(styles.meta, styles.elapsed)}>
        {formatRouteElapsed(elapsedMs)}
      </span>
      {canSkip ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={sx(styles.skip)}
          title="Stop waiting for the classifier and pick a model with local rules"
          data-testid="pending-auto-route-skip"
          onClick={() => {
            if (skipPendingAutoRoutingClassifier(pending.taskId)) {
              updatePendingAutoRoute({
                taskId: pending.taskId,
                id: pending.id,
                patch: { skipped: true },
              });
            }
          }}
        >
          Start now
        </Button>
      ) : null}
    </div>
  );
}
