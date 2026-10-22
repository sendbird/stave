import { i18n } from "@/i18n";
import { useCallback, useState } from "react";
import {
  applyFleetBulkPlan,
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
import { setResultsReviewed } from "@/lib/reviews/result-review-client";
import { useAppStore } from "@/store/app.store";

function bulkOperations(): FleetBulkOperations {
  return {
    setResultsReviewed,
    markNotificationRead: (args) => useAppStore.getState().markNotificationRead(args),
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

    const cleared = outcome.reviewed.length + outcome.read.length + outcome.snoozed.length;
    if (cleared > 0) {
      const title = i18n.t("fleet:bulk.cleared", { count: cleared });
      const description =
        outcome.read.length > 0 ? i18n.t("fleet:bulk.readsCannotBeUndone") : undefined;
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
    if (outcome.failed > 0) {
      toast.error(i18n.t("fleet:bulk.failed", { count: outcome.failed }));
    }
    return outcome;
  }, []);

  return { apply, applying };
}
