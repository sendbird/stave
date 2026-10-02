import { TASK_CLASS_LABELS, type TaskClass } from "@/lib/providers/auto-routing-profile";
import type { AutoRoutingModelResolution } from "@/lib/providers/provider.types";
import { getTurnModelInfoParts } from "@/lib/providers/turn-model-info";
import { AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE } from "@/lib/routing/auto-routing";
import type { PendingAutoRoute } from "@/store/pending-auto-routing-store";
import type { ChatMessage } from "@/types/chat";

/** Classifier waits shorter than this draw nothing, so a fast answer never flickers. */
export const PENDING_AUTO_ROUTE_REVEAL_DELAY_MS = 500;

/** `840ms` under a second, `2.4s` above it. */
export function formatRouteElapsed(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  return safe < 1_000 ? `${safe}ms` : `${(safe / 1_000).toFixed(1)}s`;
}

export interface AutoRouteLineView {
  /** `Opus 5 · High` — the routed target with the effort the turn ran at. */
  modelLabel: string;
  taskLabel: string | null;
  /** Set when Auto fell back to local rules instead of a classifier answer. */
  fallback: "skipped" | "unavailable" | null;
  elapsedLabel: string | null;
  /** The model that actually answered, only when it is not the routed one. */
  ranLabel: string | null;
  /** One sentence for the hover title and screen readers. */
  description: string;
}

type RouteLineMessage = Pick<ChatMessage, "providerId" | "model" | "modelInfo">;

/**
 * Collapses a recorded Auto decision into the one line drawn above the turn.
 * Reads only what the turn persisted, so a reloaded transcript draws the same
 * line the live one did.
 */
export function buildAutoRouteLineView(args: {
  resolution: AutoRoutingModelResolution;
  message: RouteLineMessage;
}): AutoRouteLineView {
  const { resolution, message } = args;
  const routed = getTurnModelInfoParts({
    providerId: resolution.selectedProviderId,
    model: resolution.selectedModel,
    modelInfo: message.modelInfo,
  });
  const modelLabel = [routed.name || resolution.selectedModel, ...routed.details]
    .filter(Boolean)
    .join(" · ");
  const taskLabel = resolution.taskClass
    ? (TASK_CLASS_LABELS[resolution.taskClass as TaskClass] ?? resolution.taskClass)
    : null;
  const fallback =
    resolution.source !== "classifier_fallback"
      ? null
      : resolution.rationale.startsWith(AUTO_ROUTING_CLASSIFIER_SKIPPED_RATIONALE)
        ? "skipped"
        : "unavailable";
  const elapsedLabel =
    resolution.classifierElapsedMs !== undefined
      ? formatRouteElapsed(resolution.classifierElapsedMs)
      : null;
  // Compared by display name: a runtime may confirm the routed model under a
  // longer id (a dated or context-suffixed alias) that is still the same model.
  const ranName =
    message.providerId !== "user" && message.model.length > 0
      ? getTurnModelInfoParts({ ...message, modelInfo: undefined }).name ||
        message.model
      : null;
  const ranLabel =
    ranName &&
    (message.providerId !== resolution.selectedProviderId ||
      ranName !== (routed.name || resolution.selectedModel))
      ? ranName
      : null;
  const lead =
    fallback === "skipped"
      ? "Classifier skipped, so Auto used local rules"
      : fallback === "unavailable"
        ? "Classifier unavailable, so Auto used local rules"
        : resolution.source === "classifier"
          ? "Auto routed this turn with the classifier"
          : "Auto routed this turn with local rules";
  const description = [
    `${lead}: ${modelLabel}`,
    taskLabel ? `task ${taskLabel}` : null,
    ranLabel ? `ran on ${ranLabel}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { modelLabel, taskLabel, fallback, elapsedLabel, ranLabel, description };
}

/** The pending line, in the same slots the recorded line will fill. */
export interface PendingAutoRouteView {
  /** `Opus 5 · High` once the router has answered; the model slot until then is empty. */
  target: string | null;
  phrase: string;
  /** Only a classifier wait can be cut short. */
  canSkip: boolean;
}

export function buildPendingAutoRouteView(
  pending: Pick<PendingAutoRoute, "phase" | "skipped" | "routedLabel">,
): PendingAutoRouteView {
  if (pending.phase === "starting") {
    return { target: pending.routedLabel ?? null, phrase: "Starting", canSkip: false };
  }
  return pending.skipped
    ? { target: null, phrase: "Using local rules", canSkip: false }
    : { target: null, phrase: "Choosing a model", canSkip: true };
}

/**
 * Whole seconds for a wait still running: a tenths clock flickers next to the
 * route mark. Nothing under a second, where the line has only just appeared.
 */
export function formatPendingRouteElapsed(ms: number): string | null {
  return ms < 1_000 ? null : `${Math.floor(ms / 1_000)}s`;
}
