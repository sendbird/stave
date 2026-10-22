import { i18n } from "@/i18n/runtime";
import type {
  FleetAttentionKind,
  FleetAttentionTier,
} from "./attention-projection";
import type { WorkQueueLane } from "./work-attention-order";

/**
 * Fleet's words, kept in one place so every entry point says the same thing.
 *
 * The blocking tier and the sidebar lane it fills are both "Action required";
 * the review tier and its lane are both "In review" (the lane names fixed in
 * `docs/architecture/agent-platform-taxonomy.md`). The inbox headings, the
 * sidebar Work queue, the board filter and the top bar read these instead of
 * keeping their own synonyms, and the kind labels are shared by the inbox,
 * the notification bell and the table view.
 */
export const FLEET_TIER_LABEL: Record<FleetAttentionTier, string> = {
  get blocking() { return i18n.t("fleet:vocabulary.actionRequired"); },
  get review() { return i18n.t("fleet:vocabulary.inReview"); },
};

export const FLEET_LANE_LABEL: Record<WorkQueueLane, string> = {
  get "action-required"() { return i18n.t("fleet:vocabulary.actionRequired"); },
  get "in-progress"() { return i18n.t("fleet:vocabulary.inProgress"); },
  get "in-review"() { return i18n.t("fleet:vocabulary.inReview"); },
  get idle() { return i18n.t("fleet:vocabulary.idle"); },
};

/** What an attention item is, as its row badge says it. */
export const FLEET_ATTENTION_KIND_LABEL: Record<FleetAttentionKind, string> = {
  get "user-input"() { return i18n.t("fleet:vocabulary.kind.userInput"); },
  get approval() { return i18n.t("fleet:vocabulary.kind.approval"); },
  get "run-failed"() { return i18n.t("fleet:vocabulary.kind.runFailed"); },
  get "turn-stalled"() { return i18n.t("fleet:vocabulary.kind.turnStalled"); },
  get "result-ready"() { return i18n.t("fleet:vocabulary.kind.resultReady"); },
  get "pr-changes-requested"() { return i18n.t("fleet:vocabulary.kind.prChangesRequested"); },
  get "pr-checks-failed"() { return i18n.t("fleet:vocabulary.kind.prChecksFailed"); },
  get "pr-merge-conflict"() { return i18n.t("fleet:vocabulary.kind.prMergeConflict"); },
  get "pr-behind-base"() { return i18n.t("fleet:vocabulary.kind.prBehindBase"); },
  get "pr-ready-to-merge"() { return i18n.t("fleet:vocabulary.kind.prReadyToMerge"); },
  get "agent-run-sign-off"() { return i18n.t("fleet:vocabulary.kind.agentRunSignOff"); },
  get "agent-run-blocked"() { return i18n.t("fleet:vocabulary.kind.agentRunBlocked"); },
  get "agent-run-stuck"() { return i18n.t("fleet:vocabulary.kind.agentRunStuck"); },
};

/**
 * "Fleet View · 2 actions required · 3 in review": the blocking count first,
 * review items named separately, each part present only when it counts.
 */
export function describeFleetAttentionCounts(args: {
  blockingCount: number;
  reviewCount: number;
}) {
  return [
    i18n.t("fleet:fleetView.fleetView"),
    args.blockingCount > 0
      ? i18n.t("fleet:vocabulary.actionRequiredCount", { count: args.blockingCount })
      : null,
    args.reviewCount > 0
      ? i18n.t("fleet:vocabulary.inReviewCount", { count: args.reviewCount })
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** What opening an attention item does, for its accessible name. */
export function describeFleetAttentionPrimaryAction(kind: FleetAttentionKind) {
  switch (kind) {
    case "user-input":
      return i18n.t("fleet:vocabulary.primaryAction.openQuestion");
    case "approval":
      return i18n.t("fleet:vocabulary.primaryAction.openApproval");
    case "run-failed":
      return i18n.t("fleet:vocabulary.primaryAction.openFailure");
    case "turn-stalled":
      return i18n.t("fleet:vocabulary.primaryAction.openTurn");
    case "result-ready":
      return i18n.t("fleet:vocabulary.primaryAction.reviewResult");
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return i18n.t("fleet:vocabulary.primaryAction.openWorkspace");
    case "pr-ready-to-merge":
      return i18n.t("fleet:vocabulary.primaryAction.openMergeControls");
    case "agent-run-sign-off":
      return i18n.t("fleet:vocabulary.primaryAction.reviewSignOff");
    case "agent-run-blocked":
    case "agent-run-stuck":
      return i18n.t("fleet:vocabulary.primaryAction.openRun");
  }
}
