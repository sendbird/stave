import { formatNumber } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { Loader } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import {
  buildUsageHeadlineWindows,
  windowDurationTitle,
  type StatusBarUsageProvider,
} from "@/components/layout/status-bar-usage.utils";
import {
  clampUsagePercent,
  describeTurnSpend,
  describeTurnTokenCounting,
  formatResetCountdown,
  formatUsagePercent,
  usageTone,
  type UsageStripCost,
  type UsageStripTokens,
} from "@/components/layout/status-bar-usage-strip.utils";
import { formatCostUsd, formatTokenCount } from "@/lib/agent-runs/usage";
import type {
  AccountUsageWindow,
  ClaudeUsageSnapshot,
  CodexRateLimitWindowSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "@/lib/providers/provider.types";

/**
 * The usage popover's body: every window a provider reports, what Stave does
 * at a limit, and the tokens and cost of turns run in Stave. The status bar
 * segment owns the popover itself; this file only lays out what it says.
 */

const TONE_FILL = {
  ok: statusBarUsageStyles.toneOk,
  warn: statusBarUsageStyles.toneWarn,
  danger: statusBarUsageStyles.toneDanger,
} as const;

function formatCredits(value: number): string {
  return formatNumber(Math.round(value));
}

function UsageWindowRow({
  label,
  usedPercent,
  resetsAt,
  note,
  now,
}: {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
  note?: string | null;
  now: number;
}) {
  useTranslation();
  const normalizedPercent = clampUsagePercent(usedPercent);
  const countdown = formatResetCountdown(resetsAt, now);
  const reset =
    countdown === null ? null : countdown === i18n.t("shell:usageUnits.now") ? i18n.t("shell:statusBarUsageDetails.resetsNow") : i18n.t("shell:statusBarUsageDetails.resetsIn", { value1: countdown });
  const value = [i18n.t("shell:usageUnits.used", { percent: formatUsagePercent(usedPercent) }), reset].filter(Boolean).join(" · ");

  return (
    <div className={sx(statusBarUsageStyles.stackTight)}>
      <div className={sx(statusBarUsageStyles.windowHead)}>
        <span className={sx(statusBarUsageStyles.windowLabel)}>{label}</span>
        <span className={sx(statusBarUsageStyles.windowValue)}>{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalizedPercent)}
        aria-valuetext={value}
        className={sx(statusBarUsageStyles.meterTrack)}
      >
        <div
          aria-hidden="true"
          className={sx(statusBarUsageStyles.meterFill, TONE_FILL[usageTone(normalizedPercent)])}
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
      {note ? <p className={sx(statusBarUsageStyles.noteFaint)}>{note}</p> : null}
    </div>
  );
}

export function ClaudeDetail({
  snapshot,
  now,
}: {
  snapshot: ClaudeUsageSnapshot | null;
  now: number;
}) {
  useTranslation();
  if (!snapshot || snapshot.source === "unavailable") {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ?? i18n.t("shell:statusBarUsageDetails.claudeUsageUnavailable")}
      </p>
    );
  }
  const windows = buildUsageHeadlineWindows({ provider: "claude", claude: snapshot });
  return (
    <div className={sx(statusBarUsageStyles.stackSnug)}>
      {windows.map((window) => (
        <UsageWindowRow
          key={window.title}
          label={window.title}
          usedPercent={window.usedPercent}
          resetsAt={window.resetsAt}
          note={window.note}
          now={now}
        />
      ))}
    </div>
  );
}

function codexWindowLabel(window: CodexRateLimitWindowSnapshot, fallback: string): string {
  const minutes = window.windowDurationMins ?? null;
  return minutes === null ? fallback : windowDurationTitle(minutes * 60_000);
}

export function CodexDetail({
  snapshot,
  now,
}: {
  snapshot: CodexUsageSnapshot | null;
  now: number;
}) {
  useTranslation();
  if (
    !snapshot ||
    snapshot.source === "unavailable" ||
    snapshot.buckets.length === 0
  ) {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ?? i18n.t("shell:statusBarUsageDetails.noCodexRateLimitBucketsReported")}
      </p>
    );
  }
  return (
    <div className={sx(statusBarUsageStyles.stack)}>
      {snapshot.buckets.map((bucket, index) => (
        <div
          key={`${bucket.limitId ?? "bucket"}:${index}`}
          className={sx(statusBarUsageStyles.stackTight)}
        >
          <p className={sx(statusBarUsageStyles.bucketTitle)}>
            {bucket.limitName ?? bucket.limitId ?? i18n.t("shell:statusBarUsageDetails.rateLimit")}
            {bucket.planType ? (
              <span className={sx(statusBarUsageStyles.bucketPlan)}>
                ({bucket.planType})
              </span>
            ) : null}
          </p>
          {bucket.primary ? (
            <UsageWindowRow
              label={codexWindowLabel(bucket.primary, i18n.t("shell:statusBarUsageDetails.primary"))}
              usedPercent={bucket.primary.usedPercent}
              resetsAt={bucket.primary.resetsAt}
              now={now}
            />
          ) : null}
          {bucket.secondary ? (
            <UsageWindowRow
              label={codexWindowLabel(bucket.secondary, i18n.t("shell:statusBarUsageDetails.secondary"))}
              usedPercent={bucket.secondary.usedPercent}
              resetsAt={bucket.secondary.resetsAt}
              now={now}
            />
          ) : null}
          {bucket.individualLimit ? (
            <>
              <UsageWindowRow
                label={i18n.t("shell:statusBarUsageDetails.creditLimit")}
                usedPercent={bucket.individualLimit.usedPercent}
                resetsAt={bucket.individualLimit.resetsAt}
                now={now}
              />
              {bucket.individualLimit.used !== null &&
              bucket.individualLimit.limit !== null ? (
                <div className={sx(statusBarUsageStyles.amountRow)}>
                  <span className={sx(statusBarUsageStyles.amountLabel)}>{i18n.t("shell:statusBarUsageDetails.credits")}</span>
                  <span className={sx(statusBarUsageStyles.amountValue)}>
                    {formatCredits(bucket.individualLimit.used)} /{" "}
                    {formatCredits(bucket.individualLimit.limit)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          {!bucket.primary && !bucket.secondary && !bucket.individualLimit ? (
            <p className={sx(statusBarUsageStyles.note)}>
              {i18n.t("shell:statusBarUsageDetails.noUsageWindowsReportedForThisBucket")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function UsageAmount({
  usage,
  label,
  provider,
}: {
  usage: AccountUsageWindow;
  label: string;
  provider: "cursor" | "kiro";
}) {
  useTranslation();
  if (usage.used === null || usage.limit === null) {
    return null;
  }
  const amount =
    provider === "cursor"
      ? `$${usage.used.toFixed(2)} / $${usage.limit.toFixed(2)}`
      : `${formatCredits(usage.used)} / ${formatCredits(usage.limit)}`;
  return (
    <div className={sx(statusBarUsageStyles.amountRow)}>
      <span className={sx(statusBarUsageStyles.amountLabel)}>{label}</span>
      <span className={sx(statusBarUsageStyles.amountValue)}>{amount}</span>
    </div>
  );
}

export function AccountDetail({
  provider,
  snapshot,
  now,
}: {
  provider: "cursor" | "kiro";
  snapshot: CursorUsageSnapshot | KiroUsageSnapshot | null;
  now: number;
}) {
  useTranslation();
  if (!snapshot || snapshot.source === "unavailable" || !snapshot.monthly) {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ??
          i18n.t("shell:statusBarUsageDetails.usageUnavailable", { value1: provider === "cursor" ? "Cursor" : "Kiro" })}
      </p>
    );
  }
  const plan =
    provider === "cursor"
      ? (snapshot as CursorUsageSnapshot).planType
      : (snapshot as KiroUsageSnapshot).planName;
  return (
    <div className={sx(statusBarUsageStyles.stack)}>
      {plan ? (
        <p className={sx(statusBarUsageStyles.bucketTitle)}>{plan}</p>
      ) : null}
      {provider === "cursor" ? (
        <div className={sx(statusBarUsageStyles.stackTight)}>
          <UsageWindowRow
            label={i18n.t("shell:statusBarUsageDetails.includedPlan")}
            usedPercent={snapshot.monthly.usedPercent}
            resetsAt={snapshot.monthly.resetsAt}
            now={now}
          />
          <UsageAmount
            usage={snapshot.monthly}
            label={i18n.t("shell:statusBarUsageDetails.includedSpend")}
            provider="cursor"
          />
        </div>
      ) : null}
      {snapshot.buckets.length > 0 ? (
        snapshot.buckets.map((bucket) => (
          <div key={bucket.id} className={sx(statusBarUsageStyles.stackTight)}>
            <UsageWindowRow
              label={bucket.label}
              usedPercent={bucket.usedPercent}
              resetsAt={bucket.resetsAt}
              now={now}
            />
            {provider === "kiro" ? (
              <UsageAmount
                usage={bucket}
                label={bucket.unit ?? i18n.t("shell:statusBarUsageDetails.usage")}
                provider="kiro"
              />
            ) : null}
          </div>
        ))
      ) : provider === "kiro" ? (
        <UsageWindowRow
          label={i18n.t("shell:statusBarUsageDetails.monthly")}
          usedPercent={snapshot.monthly.usedPercent}
          resetsAt={snapshot.monthly.resetsAt}
          now={now}
        />
      ) : null}
      {provider === "kiro" &&
      (snapshot as KiroUsageSnapshot).overagesEnabled !== null ? (
        <p className={sx(statusBarUsageStyles.noteFaint)}>
          {i18n.t("shell:statusBarUsageDetails.overages")}{" "}
          {(snapshot as KiroUsageSnapshot).overagesEnabled
            ? i18n.t("shell:statusBarUsageDetails.enabled")
            : i18n.t("shell:statusBarUsageDetails.disabled")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shown while the first reading for the current account is on its way — at
 * startup or right after an account switch — in place of "unavailable".
 */
export function UsageReadPending({
  providerName,
  accountLabel,
}: {
  providerName: string;
  accountLabel: string | null;
}) {
  useTranslation();
  return (
    <p className={sx(statusBarUsageStyles.note, statusBarUsageStyles.pendingNote)}>
      <Loader aria-hidden size="xs" variant="spinner" />
      {accountLabel
        ? i18n.t("shell:statusBarUsageDetails.readingUsageForTheAccount", { value1: providerName, value2: accountLabel })
        : i18n.t("shell:statusBarUsageDetails.readingUsage", { value1: providerName })}
    </p>
  );
}

/** Whose numbers these are, when the provider has more than one account. */
export function UsageAccountNote({ accountLabel }: { accountLabel: string }) {
  useTranslation();
  return (
    <p className={sx(statusBarUsageStyles.noteFaint)}>{i18n.t("shell:statusBarUsageDetails.accountUsage", { account: accountLabel })}</p>
  );
}

/** What reaching a limit means in Stave, which the numbers alone do not say. */
export function UsageLimitNote({
  providerName,
  blockAtLimit,
  canSwitch,
}: {
  providerName: string;
  blockAtLimit: boolean;
  canSwitch: boolean;
}) {
  useTranslation();
  return (
    <div className={sx(statusBarUsageStyles.limitNote)}>
      <p className={sx(statusBarUsageStyles.note)}>
        {blockAtLimit
          ? i18n.t("shell:statusBarUsageDetails.at100StaveHoldsNewTurnsUntil", { value1: providerName })
          : i18n.t("shell:statusBarUsageDetails.stopTurnsAt100UsageIsOff", { value1: providerName })}
      </p>
      {canSwitch ? (
        <p className={sx(statusBarUsageStyles.note)}>
          {i18n.t("shell:statusBarUsageDetails.staveDoesnTSwitchAccountsOnItsOwn")}
        </p>
      ) : null}
    </div>
  );
}

function TurnTotalRow({ label, value }: { label: string; value: string }) {
  useTranslation();
  return (
    <div className={sx(statusBarUsageStyles.amountRow)}>
      <span className={sx(statusBarUsageStyles.amountLabel)}>{label}</span>
      <span className={sx(statusBarUsageStyles.amountValue)}>{value}</span>
    </div>
  );
}

function monthLabel(turns: number): string {
  return i18n.t("shell:usageUnits.monthTurns", { count: turns });
}

/**
 * Today's and this month's tokens of turns run in Stave, which the bar shows,
 * then the reported cost, which only this popover shows, and what kind of
 * numbers they are.
 */
export function TurnUsageDetail({
  tokens,
  cost,
  provider,
  providerName,
  multipleAccounts,
}: {
  tokens: UsageStripTokens | null;
  cost: UsageStripCost | null;
  provider: StatusBarUsageProvider;
  providerName: string;
  multipleAccounts: boolean;
}) {
  useTranslation();
  const spend = cost ? describeTurnSpend({ cost, providerName }) : null;
  return (
    <div className={sx(statusBarUsageStyles.spendSection, statusBarUsageStyles.stack)}>
      {tokens ? (
        <div className={sx(statusBarUsageStyles.stackSnug)}>
          <p className={sx(statusBarUsageStyles.bucketTitle)}>{i18n.t("shell:statusBarUsageDetails.tokensInTurnsRunInStave")}</p>
          <div className={sx(statusBarUsageStyles.stackTight)}>
            <TurnTotalRow label={i18n.t("shell:statusBarUsageDetails.today")} value={i18n.t("shell:usageUnits.tokens", { amount: formatTokenCount(tokens.todayTokens) })} />
            <TurnTotalRow
              label={monthLabel(tokens.monthTurns)}
              value={`${formatTokenCount(tokens.monthTokens)} tokens`}
            />
          </div>
          <p className={sx(statusBarUsageStyles.note)}>
            {describeTurnTokenCounting({ provider, providerName })}
          </p>
        </div>
      ) : null}
      {cost && spend ? (
        <div className={sx(statusBarUsageStyles.stackSnug)}>
          <p className={sx(statusBarUsageStyles.bucketTitle)}>{spend.title}</p>
          <div className={sx(statusBarUsageStyles.stackTight)}>
            <TurnTotalRow label={i18n.t("shell:statusBarUsageDetails.today")} value={formatCostUsd(cost.todayUsd)} />
            <TurnTotalRow label={monthLabel(cost.monthTurns)} value={formatCostUsd(cost.monthUsd)} />
          </div>
          {/* The rows above already give the totals, the hint's first line. */}
          {spend.lines.slice(1).map((line) => (
            <p key={line} className={sx(statusBarUsageStyles.note)}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {multipleAccounts ? (
        <p className={sx(statusBarUsageStyles.noteFaint)}>{i18n.t("shell:statusBarUsageDetails.allAccounts", { provider: providerName })}</p>
      ) : null}
    </div>
  );
}
