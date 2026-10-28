import { useTranslation } from "@/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import {
  countFleetBulkPlan,
  pickFleetBulkEffect,
  planFleetAttentionSnooze,
  planFleetOutcomeRead,
  planFleetOutcomeReview,
  planFleetReviewClear,
  summarizeFleetBulkPlan,
  type FleetBulkEffect,
  type FleetBulkPlan,
} from "@/lib/fleet/attention-bulk";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { getFleetAttentionTier } from "@/lib/fleet/attention-projection";
import { FLEET_ATTENTION_SNOOZE_DURATIONS } from "@/lib/fleet/attention-snooze";
import { inboxRowStyles as rowStyles } from "./inbox-row.styles";

/** Shared by Fleet and the bell: read outcomes, or temporarily hide any need. */
export function FleetAttentionBulkMenu(props: {
  items: readonly FleetAttentionItem[];
  busy: boolean;
  onApply: (plan: FleetBulkPlan) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  if (props.items.length === 0) return null;
  const readPlan = planFleetOutcomeRead(props.items);
  const readableCount = countFleetBulkPlan(readPlan);
  const reviewPlan = planFleetOutcomeReview(props.items);
  const reviewableCount = countFleetBulkPlan(reviewPlan);
  const total = new Set(props.items.map((item) => item.id)).size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            xstyle={rowStyles.rowAction}
            disabled={props.busy}
          />
        }
      >
        {t("fleet:bulkAttention.manage", { count: total })}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t("fleet:bulkAttention.scope", { count: props.items.filter((item) => getFleetAttentionTier(item.kind) === "blocking").length })}
        </DropdownMenuLabel>
        {readableCount > 0 ? (
          <DropdownMenuItem onSelect={() => props.onApply(readPlan)}>
            {t("fleet:bulkAttention.readOutcomes", { count: readableCount })}
          </DropdownMenuItem>
        ) : null}
        {reviewableCount > 0 ? (
          <DropdownMenuItem onSelect={() => props.onApply(reviewPlan)}>
            {t("fleet:bulkAttention.reviewResults", { count: reviewableCount })}
          </DropdownMenuItem>
        ) : null}
        {readableCount > 0 || reviewableCount > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuLabel>
          {t("fleet:bulkAttention.snoozeLabel", { count: total })}
        </DropdownMenuLabel>
        {FLEET_ATTENTION_SNOOZE_DURATIONS.map((duration) => (
          <DropdownMenuItem
            key={duration.id}
            onSelect={() => props.onApply(planFleetAttentionSnooze(props.items, duration.ms))}
          >
            {t("fleet:bulkAttention.snoozeFor", {
              count: total,
              duration: t(DURATION_LABEL_KEY[duration.id as keyof typeof DURATION_LABEL_KEY]),
            })}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {t("fleet:bulkAttention.requestsUnanswered")}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DURATION_LABEL_KEY = {
  "1h": "fleet:bulkAttention.oneHour",
  "4h": "fleet:bulkAttention.fourHours",
  "1d": "fleet:bulkAttention.oneDay",
  "1w": "fleet:bulkAttention.oneWeek",
} as const;

const BULK_EFFECT_LABEL_KEY = {
  "review-results": "fleet:bulkAttention.readResults",
  "read-notifications": "fleet:bulk.readNotifications",
  "hide-for-a-day": "fleet:bulk.hideForADay",
} as const satisfies Record<FleetBulkEffect, string>;

/**
 * `Clear all` for the `In review` group, as a menu that says what it will do
 * before it does it: each effect with its count (mark results read, mark
 * notifications read, hide pull requests for a day), any one of them alone,
 * or all of them. Pending interactions stay outside this clear plan.
 */
export function FleetReviewClearMenu(props: {
  items: readonly FleetAttentionItem[];
  busy: boolean;
  onApply: (plan: FleetBulkPlan) => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const plan = planFleetReviewClear(props.items);
  const total = countFleetBulkPlan(plan);
  const effects = summarizeFleetBulkPlan(plan);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            xstyle={rowStyles.rowAction}
            disabled={props.busy || total === 0}
            aria-label={
              props.items.length === 1
                ? tI18n("fleet:fleetAttentionInbox.clearOneInReview")
                : tI18n("fleet:fleetAttentionInbox.clearAllInReview", { reviewCount: props.items.length })
            }
          />
        }
      >
        {tI18n("fleet:fleetAttentionInbox.clearAll")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{tI18n("fleet:bulk.menuLabel")}</DropdownMenuLabel>
        {effects.map((summary) => (
          <DropdownMenuItem
            key={summary.effect}
            onSelect={() => props.onApply(pickFleetBulkEffect(plan, summary.effect))}
          >
            {tI18n(BULK_EFFECT_LABEL_KEY[summary.effect], { count: summary.count })}
          </DropdownMenuItem>
        ))}
        {effects.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => props.onApply(plan)}>
              {tI18n("fleet:bulk.applyAll", { count: total })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
