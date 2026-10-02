import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button,
  Loader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { StatusBarAccountSection } from "@/components/layout/StatusBarAccountSection";
import {
  AccountDetail,
  ClaudeDetail,
  CodexDetail,
  TurnUsageDetail,
  UsageAccountNote,
  UsageLimitNote,
  UsageReadPending,
} from "@/components/layout/StatusBarUsageDetails";
import {
  UsageTokensItem,
  UsageWindowItem,
} from "@/components/layout/StatusBarUsageStripItems";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import {
  usageStripStyles,
  usageStripVisibility,
} from "@/components/layout/status-bar-usage-strip.styles";
import {
  headlineUsagePercent,
  statusBarAccountProviderId,
  STATUS_BAR_USAGE_PROVIDER_IDS,
  type StatusBarAccountView,
} from "@/components/layout/status-bar-usage.utils";
import {
  describeUsageSegmentForAssistiveTech,
  usageTone,
  type UsageStripBreakpoint,
  type UsageStripSegmentModel,
} from "@/components/layout/status-bar-usage-strip.utils";
import {
  noteRateLimitsMeterClosed,
  noteRateLimitsMeterOpen,
} from "@/lib/providers/rate-limits-poll-policy";
import { useTurnSpend } from "@/lib/providers/use-turn-spend";
import { useAppStore } from "@/store/app.store";

const TONE_DOT = {
  ok: statusBarUsageStyles.toneOk,
  warn: statusBarUsageStyles.toneWarn,
  danger: statusBarUsageStyles.toneDanger,
} as const;

/**
 * One provider in the status bar's usage strip. With room, each quota window
 * is a ring, its percent and when it resets, followed by the tokens of turns
 * run in Stave today and this month; without room, the compact meter (dot,
 * name, percents). Clicking opens the details popover: every window, what
 * Stave does at a limit, tokens and cost, and the account switch. Polling is
 * owned by the parent `StatusBar` so mounting two segments doesn't
 * double-fetch.
 */
export function StatusBarUsageSegment({
  segment,
  account,
  breakpoint,
  tokensBreakpoint,
  now,
}: {
  segment: UsageStripSegmentModel;
  account: StatusBarAccountView | null;
  /** Where the windows switch to their full form. */
  breakpoint: UsageStripBreakpoint;
  /** Where the tokens entry joins them; never narrower than `breakpoint`. */
  tokensBreakpoint: UsageStripBreakpoint;
  now: number;
}) {
  const { provider, providerName, stale } = segment;
  const providerId = STATUS_BAR_USAGE_PROVIDER_IDS[provider];
  const [open, setOpen] = useState(false);
  useEffect(() => () => noteRateLimitsMeterClosed(providerId), [providerId]);
  useEffect(() => {
    if (stale) {
      setOpen(false);
      noteRateLimitsMeterClosed(providerId);
    }
  }, [providerId, stale]);
  const snapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const reading = useAppStore(
    (state) => (state.rateLimitsInFlightByProvider[providerId] ?? 0) > 0,
  );
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);
  const blockAtLimit = useAppStore(
    (state) => state.settings.blockTurnsWhenAccountLimitReached,
  );
  const visibility = usageStripVisibility(breakpoint);
  const headlinePercent = headlineUsagePercent(segment.windows);
  const accountProviderId = statusBarAccountProviderId(provider);
  const multipleAccounts = (account?.options.length ?? 0) > 1;
  // Name whose numbers these are only when there is another account they could be.
  const accountLabel = multipleAccounts ? (account?.selected?.label ?? null) : null;
  const gateway = segment.gateway;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Opening the meter is the one unambiguous signal that the user cares
        // about these numbers right now, so it — and only it — unlocks the
        // fast poll tier, and only for the provider actually on screen. The
        // read is left to the poll tick, which still applies the per-provider
        // cache floor, so holding the popover open cannot spam the account.
        if (next && !stale) {
          noteRateLimitsMeterOpen(providerId);
          // Tokens and cost are a local read, so the popover can simply ask for them.
          void useTurnSpend.getState().refresh();
        } else {
          noteRateLimitsMeterClosed(providerId);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            xstyle={statusBarUsageStyles.trigger}
            aria-label={describeUsageSegmentForAssistiveTech(segment, now)}
          />
        }
      >
        <span
          className={sx(
            statusBarUsageStyles.triggerDot,
            headlinePercent === null
              ? statusBarUsageStyles.toneUnknown
              : TONE_DOT[usageTone(headlinePercent)],
            // The full strip drops the dot: its rings carry the tone.
            visibility.compact,
          )}
        />
        <span className={sx(usageStripStyles.name)}>
          {segment.name}
          {stale ? " (unverified)" : ""}
        </span>
        {gateway ? null : segment.windows.length === 0 ? (
          segment.pending ? (
            <Loader aria-hidden size="xs" variant="spinner" />
          ) : (
            <span className={sx(statusBarUsageStyles.triggerMono)}>—</span>
          )
        ) : (
          segment.windows.map((window) => (
            <UsageWindowItem
              key={window.title}
              window={window}
              providerName={providerName}
              blockAtLimit={blockAtLimit}
              now={now}
              breakpoint={breakpoint}
              hintsDisabled={open}
            />
          ))
        )}
        {segment.tokens ? (
          <UsageTokensItem
            tokens={segment.tokens}
            cost={segment.cost}
            provider={provider}
            providerName={providerName}
            multipleAccounts={multipleAccounts}
            breakpoint={tokensBreakpoint}
            hintsDisabled={open}
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        xstyle={statusBarUsageStyles.popover}
        initialFocus={false}
      >
        <div className={sx(statusBarUsageStyles.popoverHeader)}>
          <span className={sx(statusBarUsageStyles.popoverTitle)}>{providerName} usage</span>
          {gateway ? null : <Button
            variant="ghost"
            size="sm"
            xstyle={statusBarUsageStyles.refreshButton}
            aria-label="refresh-rate-limits"
            disabled={stale}
            onClick={() =>
              void refreshRateLimits({
                providers: [providerId],
                force: true,
                reason: "manual",
              })
            }
          >
            <RefreshCw
              className={sx(
                statusBarUsageStyles.refreshIcon,
                reading && statusBarUsageStyles.refreshIconSpinning,
              )}
            />
          </Button>}
        </div>
        <div className={sx(statusBarUsageStyles.popoverBody)}>
          {gateway ? (
            <p className={sx(statusBarUsageStyles.note)}>
              Usage and charges are managed by your Gateway. Subscription quota
              is unavailable.
            </p>
          ) : segment.pending ? (
            <UsageReadPending providerName={providerName} accountLabel={accountLabel} />
          ) : (
            <>
              {provider === "claude" ? (
                <ClaudeDetail snapshot={snapshot?.claude ?? null} now={now} />
              ) : provider === "codex" ? (
                <CodexDetail snapshot={snapshot?.codex ?? null} now={now} />
              ) : (
                <AccountDetail
                  provider={provider}
                  snapshot={snapshot?.[provider] ?? null}
                  now={now}
                />
              )}
              {accountLabel && segment.windows.length > 0 ? (
                <UsageAccountNote accountLabel={accountLabel} />
              ) : null}
              {segment.windows.length > 0 ? (
                <UsageLimitNote
                  providerName={providerName}
                  blockAtLimit={blockAtLimit}
                  canSwitch={account?.canSwitch === true}
                />
              ) : null}
            </>
          )}
        </div>
        {segment.tokens || segment.cost ? (
          <TurnUsageDetail
            tokens={segment.tokens}
            cost={segment.cost}
            provider={provider}
            providerName={providerName}
            multipleAccounts={multipleAccounts}
          />
        ) : null}
        {account && accountProviderId ? (
          <StatusBarAccountSection
            providerId={accountProviderId}
            providerName={providerName}
            view={account}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
