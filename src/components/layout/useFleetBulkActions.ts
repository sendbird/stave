import { i18n } from "@/i18n";
import { useCallback, useState } from "react";
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
  setResultsReviewed,
} from "@/lib/reviews/result-review-client";
import { resultReviewKey, type ResultReviewScope } from "@/lib/reviews/result-review";
import { useAppStore } from "@/store/app.store";

/** Which of `scopes` still wait for review, from the durable store itself. */
async function listPendingResults(scopes: ResultReviewScope[]) {
  const workspaceIds = [...new Set(scopes.map((scope) => scope.workspaceId))];
  const pendingKeys = new Set<string>();
  for (let offset = 0; ; offset += 200) {
    const page = await listResultReviews({
      workspaceIds,
      pendingOnly: true,
      includeEvidence: false,
      limit: 200,
      offset,
    });
    for (const result of page.results) pendingKeys.add(resultReviewKey(result));
    if (!page.hasMore || page.results.length === 0) break;
  }
  return scopes.filter((scope) => pendingKeys.has(resultReviewKey(scope)));
}

function bulkOperations(): FleetBulkOperations {
  return {
    listPendingResults,
    setResultsReviewed,
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
 * actually changed and offers Undo for the result reviews and snoozes it
 * applied; notification reads cannot be taken back (there is no unread
 * operation), and the toast says so when the plan included any. Failures are
 * reported separately, never as cleared.
 */
export function useFleetBulkActions() {
  const [applying, setApplying] = useState(false);

  const apply = useCallback(async (plan: FleetBulkPlan): Promise<FleetBulkOutcome | null> => {
    if (countFleetBulkPlan(plan) === 0) {
      return null;
    }
    setApplying(true);
    const operations = bulkOperations();
    const outcome = await applyFleetBulkPlan({
      plan,
      operations,
      resolvedAt: new Date().toISOString(),
      snoozedUntil: resolveSnoozeDeadline({ durationMs: FLEET_ATTENTION_CLEAR_SNOOZE_MS }),
    }).finally(() => setApplying(false));

    const cleared = countFleetBulkOutcome(outcome);
    if (cleared > 0) {
      const title = i18n.t("fleet:bulk.cleared", { count: cleared });
      const description =
        [
          outcome.read.length > 0 ? i18n.t("fleet:bulk.readsCannotBeUndone") : null,
          outcome.reviewedUnconfirmed > 0
            ? i18n.t("fleet:bulk.someReviewsCannotBeUndone")
            : null,
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      if (outcome.reviewed.length > 0 || outcome.snoozed.length > 0) {
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
      toast.info(i18n.t("fleet:bulk.alreadyCleared"));
    }
    if (outcome.failed > 0) {
      toast.error(i18n.t("fleet:bulk.failed", { count: outcome.failed }));
    }
    return outcome;
  }, []);

  return { apply, applying };
}
