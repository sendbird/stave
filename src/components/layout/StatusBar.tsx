import { useEffect, useState } from "react";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useLoadTurnSpend, useTurnSpend } from "@/lib/providers/use-turn-spend";
import { StatusBarMemorySegment } from "@/components/layout/StatusBarMemorySegment";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import {
  buildUsageHeadlineWindows,
  listCliConnectedUsageProviders,
  resolveStatusBarAccountView,
  statusBarAccountProviderId,
  STATUS_BAR_USAGE_PROVIDER_IDS,
  STATUS_BAR_USAGE_PROVIDER_NAMES,
} from "@/components/layout/status-bar-usage.utils";
import {
  buildUsageStripSegment,
  resolveUsageStripBreakpoint,
} from "@/components/layout/status-bar-usage-strip.utils";
import { usageStripStyles } from "@/components/layout/status-bar-usage-strip.styles";
import { resolveResourceLabelBreakpoint } from "@/components/layout/status-bar-shrink";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import { isRateLimitsReadPending } from "@/store/rate-limits-account-reset";
import { resolveEarliestAccountUsageResetAtMs } from "@/lib/providers/account-usage-block";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  noteRateLimitsInteraction,
  readRateLimitsPollInputs,
  resolveRateLimitsPollPlan,
  subscribeRateLimitsPollWake,
} from "@/lib/providers/rate-limits-poll-policy";
import { useAppStore } from "@/store/app.store";
import { providerSurfaceVisible, useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

/**
 * Wall clock for countdowns and time-left clocks. A minute is the finest unit
 * they show, and between usage reads nothing else would re-render them.
 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Global, VSCode-style bottom status bar. Spans the full window width below
 * the project sidebar, chat/editor column, and right rail — a persistent
 * home for provider usage plus other bottom-of-window info (memory today,
 * more segments later).
 */
export function StatusBar() {
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);
  // The meters name and switch the account, so the status bar — always
  // mounted — owns loading the account list.
  useLoadProviderAccounts();
  const providerAvailability = useAppStore((state) => state.providerAvailability);
  const readiness = useProviderReadinessStore((state) => state.providers);
  const cursorBinaryPath = useAppStore((state) => state.settings.cursorBinaryPath);
  const kiroBinaryPath = useAppStore((state) => state.settings.kiroBinaryPath);
  const runtimeOptions = { cursorBinaryPath, kiroBinaryPath };
  const usageProviders = listCliConnectedUsageProviders(providerAvailability).filter(
    (provider) => (provider !== "cursor" && provider !== "kiro") || providerSurfaceVisible(provider, runtimeOptions),
  );
  useLoadTurnSpend();
  const now = useMinuteClock();
  const snapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const claudeAccountProfileId = useAppStore((state) => state.settings.claudeAccountProfileId);
  const codexAccountProfileId = useAppStore((state) => state.settings.codexAccountProfileId);
  const profiles = useProviderAccounts((state) => state.profiles);
  const spendByProvider = useTurnSpend((state) => state.byProvider);
  const rateLimitsUpdatedAtByProvider = useAppStore((state) => state.rateLimitsUpdatedAtByProvider);
  const rateLimitsInFlightByProvider = useAppStore((state) => state.rateLimitsInFlightByProvider);
  // Every segment is described here, not inside each one, because the full
  // strip shows only when all of them fit: the width rule needs the set.
  const usageSegments = usageProviders.map((provider) => {
    const accountProviderId = statusBarAccountProviderId(provider);
    const account =
      accountProviderId && window.api?.providerAccounts
        ? resolveStatusBarAccountView({
            providerId: accountProviderId,
            profiles,
            selectedId: selectedProviderAccount(accountProviderId, {
              claudeAccountProfileId,
              codexAccountProfileId,
            }),
          })
        : null;
    const segment = buildUsageStripSegment({
      provider,
      providerName: STATUS_BAR_USAGE_PROVIDER_NAMES[provider],
      windows: buildUsageHeadlineWindows({
        provider,
        claude: snapshot?.claude ?? null,
        codex: snapshot?.codex ?? null,
        cursor: snapshot?.cursor ?? null,
        kiro: snapshot?.kiro ?? null,
      }),
      account,
      spend: spendByProvider[STATUS_BAR_USAGE_PROVIDER_IDS[provider]],
      stale:
        (provider === "cursor" || provider === "kiro") &&
        readiness[provider]?.stale === true,
      pending: isRateLimitsReadPending(
        {
          rateLimitsUpdatedAtByProvider,
          rateLimitsInFlightByProvider,
        },
        STATUS_BAR_USAGE_PROVIDER_IDS[provider],
      ),
    });
    return { segment, account };
  });
  const stripBreakpoint = resolveUsageStripBreakpoint(
    usageSegments.map(({ segment }) => segment),
  );
  // The second step of the bar's shrink order, chosen after the first so the
  // label never goes while the strip could still show its full form.
  const resourceLabelBreakpoint = resolveResourceLabelBreakpoint({
    segments: usageSegments.map(({ segment }) => segment),
    fullStripStep: stripBreakpoint,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // State is read at fire time rather than closed over: this loop and its
    // listeners outlive any single render, and the tier decision has to see
    // the interaction timestamp as it is now.
    const tick = () => {
      if (cancelled) {
        return;
      }
      const now = Date.now();
      const state = useAppStore.getState();
      const resetsAtMsByProvider: Partial<Record<ProviderId, number | null>> =
        {};
      for (const providerId of listProviderIds()) {
        resetsAtMsByProvider[providerId] = resolveEarliestAccountUsageResetAtMs(
          { providerId, snapshot: state.rateLimitsSnapshot },
        );
      }
      const plan = resolveRateLimitsPollPlan({
        now,
        visible: document.visibilityState !== "hidden",
        inputs: readRateLimitsPollInputs(),
        updatedAtByProvider: state.rateLimitsUpdatedAtByProvider,
        resetsAtMsByProvider,
      });
      if (plan.providers.length > 0) {
        void refreshRateLimits({ providers: plan.providers });
      }
      // Reschedule from the plan rather than a fixed interval so a tier change
      // (window hidden, meter opened, a turn started) takes effect on the next
      // hop instead of at the end of a long fixed period.
      timer = setTimeout(tick, plan.intervalMs);
    };

    // Opening the meter or starting the first turn after a quiet stretch has
    // to be able to pull the next evaluation forward, or the app would sit on
    // a pending 30-minute timer while the user waits for a number.
    const rearm = () => {
      if (cancelled) {
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      tick();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      // Returning to the window says the user is working, not that they are
      // watching a quota, so it records ordinary attention rather than opening
      // the fast tier — only the meter itself does that. The pending timer is
      // replaced so a tier change is evaluated now instead of at the end of a
      // hidden-window period.
      noteRateLimitsInteraction();
      rearm();
    };

    tick();
    const unsubscribeWake = subscribeRateLimitsPollWake(rearm);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribeWake();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshRateLimits, readiness, cursorBinaryPath, kiroBinaryPath]);

  return (
    <div {...stylex.props(layoutShellStyles.statusBar)}>
      <div {...stylex.props(usageStripStyles.container)}>
        {usageSegments.map(({ segment, account }) => (
          <StatusBarUsageSegment
            key={segment.provider}
            segment={segment}
            account={account}
            breakpoint={stripBreakpoint}
            now={now}
          />
        ))}
      </div>
      <div {...stylex.props(layoutShellStyles.statusGroup)}>
        <StatusBarMemorySegment labelBreakpoint={resourceLabelBreakpoint} />
      </div>
    </div>
  );
}
