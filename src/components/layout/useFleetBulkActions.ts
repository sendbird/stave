import { i18n } from "@/i18n";
import { useCallback, useRef, useState } from "react";
import {
  applyFleetBulkPlan,
  countFleetBulkOutcome,
  countFleetBulkPlan,
  revertFleetBulkOutcome,
  type FleetBulkOperations,
  type FleetBulkOutcome,
  type FleetBulkPlan,
} from "@/lib/fleet/attention-bulk";
import {
  FLEET_ATTENTION_CLEAR_SNOOZE_MS,
  resolveSnoozeDeadline,
} from "@/lib/fleet/attention-snooze";
import {
  clearFleetAttentionSnoozes,
  snoozeFleetAttention,
} from "@/lib/fleet/attention-snooze-client";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import { toast } from "@/lib/notifications/toast";
import {
  listResultReviews,
  setResultMarkedReviewed,
  setResultsReviewed,
} from "@/lib/reviews/result-review-client";
import { resultReviewKey, type ResultReviewScope } from "@/lib/reviews/result-review";
import { useAppStore } from "@/store/app.store";

/** Which of `scopes` still wait for review, from the durable store itself. */
async function listPendingResults(scopes: ResultReviewScope[], markedReviewed = false) {
  const workspaceIds = [...new Set(scopes.map((scope) => scope.workspaceId))];
  const pendingKeys = new Set<string>();
  for (let offset = 0; ; offset += 200) {
    const page = await listResultReviews({
      workspaceIds,
      latestPerTask: true,
      pendingOnly: !markedReviewed,
      includeEvidence: false,
      limit: 200,
      offset,
    });
    for (const result of page.results) {
      if (!markedReviewed || !result.markedReviewedAt) pendingKeys.add(resultReviewKey(result));
    }
    if (!page.hasMore || page.results.length === 0) break;
  }
  return scopes.filter((scope) => pendingKeys.has(resultReviewKey(scope)));
}

function bulkOperations(): FleetBulkOperations {
  return {
    listPendingResults,
    setResultsReviewed,
    setResultMarkedReviewed,
    markNotificationRead: async (args) => {
      const notification = useAppStore
        .getState()
        .notifications.find((item) => item.id === args.id);
      // Read elsewhere since Fleet listed it: nothing to change or count.
      if (!notification || notification.readAt) return false;
      await useAppStore.getState().markNotificationRead(args);
      return true;
    },
    snoozeFleetAttention,
    clearFleetAttentionSnoozes,
  };
}

/**
 * Applies a bulk clear plan and says what happened. The toast counts only what
 * saved and offers guarded Undo for snoozes. Result and notification reads
 * cannot be safely taken back across writers; the toast says so. Failures are
 * reported separately, never as cleared.
 */
export function useFleetBulkActions() {
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);

  const apply = useCallback(async (plan: FleetBulkPlan): Promise<FleetBulkOutcome | null> => {
    if (countFleetBulkPlan(plan) === 0 || applyingRef.current) {
      return null;
    }
    applyingRef.current = true;
    setApplying(true);
    const operations = bulkOperations();
    const outcome = await applyFleetBulkPlan({
      plan,
      operations,
      resolvedAt: new Date().toISOString(),
      snoozedUntil: resolveSnoozeDeadline({ durationMs: plan.snoozeDurationMs ?? FLEET_ATTENTION_CLEAR_SNOOZE_MS }),
    }).finally(() => {
      applyingRef.current = false;
      setApplying(false);
    });

    const cleared = countFleetBulkOutcome(outcome);
    if (cleared > 0) {
      const title = plan.markedReviewed
        ? i18n.t("fleet:bulkAttention.markedReviewed", { count: cleared })
        : plan.snoozeDurationMs !== undefined
        ? i18n.t("fleet:bulkAttention.snoozed", { count: cleared })
        : i18n.t("fleet:bulk.cleared", { count: cleared });
      const description =
        [
          outcome.read.length > 0 || outcome.readResults > 0 ? i18n.t("fleet:bulk.readsCannotBeUndone") : null,
          outcome.markedReviewed
            ? i18n.t("fleet:bulkAttention.reviewMarksUndoInTask")
            : null,
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      if (outcome.snoozed.length > 0) {
        offerUndoToast(title, {
          undoLabel: i18n.t("fleet:bulk.undo"),
          onUndo: () => {
            void revertFleetBulkOutcome(outcome, operations).then((ok) => {
              if (!ok) toast.error(i18n.t("fleet:bulk.undoFailed"));
            });
          },
          description,
        });
      } else {
        toast.success(title, description ? { description } : undefined);
      }
    }
    if (cleared === 0 && outcome.failed === 0) {
      toast.info(i18n.t(plan.markedReviewed ? "fleet:bulkAttention.alreadyReviewed" : "fleet:bulk.alreadyCleared"));
    }
    if (outcome.failed > 0) {
      toast.error(i18n.t(plan.markedReviewed ? "fleet:bulkAttention.reviewFailed" : "fleet:bulk.failed", { count: outcome.failed }));
    }
    return outcome;
  }, []);

  return { apply, applying };
}
