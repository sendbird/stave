import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { QuotaRing } from "@/components/layout/QuotaRing";
import { QuotaTimeLeftClock } from "@/components/layout/QuotaTimeLeftClock";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import {
  usageStripStyles as styles,
  usageStripVisibility,
} from "@/components/layout/status-bar-usage-strip.styles";
import {
  resolveWindowTimeLeftRatio,
  type UsageHeadlineWindow,
} from "@/components/layout/status-bar-usage.utils";
import {
  describeTurnTokens,
  describeUsageWindow,
  formatStripTokens,
  formatUsagePercent,
  formatWindowContext,
  type UsageHint,
  type UsageStripBreakpoint,
  type UsageStripCost,
  type UsageStripTokens,
} from "@/components/layout/status-bar-usage-strip.utils";
import type { StatusBarUsageProvider } from "@/components/layout/status-bar-usage.utils";

/**
 * The entries inside a status bar usage segment. Each window renders both
 * forms — the full ring entry and the compact `5h 42%` — and the strip's
 * container query shows one, so the switch costs no measurement or re-render.
 * The hint explains the entry the pointer rests on; the popover says the rest.
 */

// Long enough that sweeping the pointer along the bar does not flash a
// paragraph; the group's instant-follow window still applies after the first.
const HINT_DELAY_MS = 400;

function UsageHintContent({ hint }: { hint: UsageHint }) {
  return (
    <span className={sx(styles.hint)}>
      <span>{hint.title}</span>
      {hint.lines.map((line) => (
        <span key={line} className={sx(styles.hintLine)}>
          {line}
        </span>
      ))}
    </span>
  );
}

export function UsageWindowItem({
  window,
  providerName,
  blockAtLimit,
  now,
  breakpoint,
  hintsDisabled,
}: {
  window: UsageHeadlineWindow;
  providerName: string;
  blockAtLimit: boolean;
  now: number;
  breakpoint: UsageStripBreakpoint;
  hintsDisabled: boolean;
}) {
  const visibility = usageStripVisibility(breakpoint);
  const timeLeftRatio = resolveWindowTimeLeftRatio({
    resetsAt: window.resetsAt,
    windowMs: window.windowMs,
    now,
  });
  const percent = formatUsagePercent(window.usedPercent);
  return (
    <Tooltip disabled={hintsDisabled}>
      <TooltipTrigger
        delay={HINT_DELAY_MS}
        render={<span className={sx(styles.item)} />}
      >
        <span className={sx(styles.full, visibility.full)}>
          <QuotaRing usedPercent={window.usedPercent} timeLeftRatio={timeLeftRatio} />
          <span className={sx(styles.percent)}>{percent}</span>
          <span className={sx(styles.context)}>{formatWindowContext(window, now)}</span>
        </span>
        <span
          className={sx(
            statusBarUsageStyles.triggerMono,
            statusBarUsageStyles.triggerWindow,
            visibility.compact,
          )}
        >
          {window.short ? `${window.short} ` : ""}
          {percent}
          {timeLeftRatio === null ? null : (
            <QuotaTimeLeftClock timeLeftRatio={timeLeftRatio} size={11} />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <UsageHintContent
          hint={describeUsageWindow({ window, providerName, blockAtLimit, now })}
        />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Tokens of turns run in Stave appear in the full strip only; the compact
 * meter stays as it was. Dollars are not on the bar: the popover has them.
 */
export function UsageTokensItem({
  tokens,
  cost,
  provider,
  providerName,
  multipleAccounts,
  breakpoint,
  hintsDisabled,
}: {
  tokens: UsageStripTokens;
  cost: UsageStripCost | null;
  provider: StatusBarUsageProvider;
  providerName: string;
  multipleAccounts: boolean;
  breakpoint: UsageStripBreakpoint;
  hintsDisabled: boolean;
}) {
  const visibility = usageStripVisibility(breakpoint);
  const { amount, context } = formatStripTokens(tokens);
  return (
    <Tooltip disabled={hintsDisabled}>
      <TooltipTrigger
        delay={HINT_DELAY_MS}
        render={<span className={sx(styles.item, styles.full, visibility.full)} />}
      >
        <span className={sx(styles.percent)}>{amount}</span>
        <span className={sx(styles.context)}>{context}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <UsageHintContent
          hint={describeTurnTokens({ tokens, cost, provider, providerName, multipleAccounts })}
        />
      </TooltipContent>
    </Tooltip>
  );
}
