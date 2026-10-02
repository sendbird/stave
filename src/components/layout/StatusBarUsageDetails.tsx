import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import {
  buildUsageHeadlineWindows,
  windowDurationTitle,
} from "@/components/layout/status-bar-usage.utils";
import {
  clampUsagePercent,
  describeTurnSpend,
  formatResetCountdown,
  formatUsagePercent,
  usageTone,
  type UsageStripCost,
} from "@/components/layout/status-bar-usage-strip.utils";
import { formatCostUsd } from "@/lib/missions/usage";
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
 * at a limit, and what turns run in Stave cost. The status bar segment owns
 * the popover itself; this file only lays out what it says.
 */

const TONE_FILL = {
  ok: statusBarUsageStyles.toneOk,
  warn: statusBarUsageStyles.toneWarn,
  danger: statusBarUsageStyles.toneDanger,
} as const;

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString();
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
  const normalizedPercent = clampUsagePercent(usedPercent);
  const countdown = formatResetCountdown(resetsAt, now);
  const reset =
    countdown === null ? null : countdown === "now" ? "resets now" : `resets in ${countdown}`;
  const value = [`${formatUsagePercent(usedPercent)} used`, reset].filter(Boolean).join(" · ");

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
  if (!snapshot || snapshot.source === "unavailable") {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ?? "Claude usage unavailable."}
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
      <p className={sx(statusBarUsageStyles.noteFaint)}>
        source: {snapshot.source}
      </p>
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
  if (
    !snapshot ||
    snapshot.source === "unavailable" ||
    snapshot.buckets.length === 0
  ) {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ?? "No Codex rate-limit buckets reported."}
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
            {bucket.limitName ?? bucket.limitId ?? "Rate limit"}
            {bucket.planType ? (
              <span className={sx(statusBarUsageStyles.bucketPlan)}>
                ({bucket.planType})
              </span>
            ) : null}
          </p>
          {bucket.primary ? (
            <UsageWindowRow
              label={codexWindowLabel(bucket.primary, "Primary")}
              usedPercent={bucket.primary.usedPercent}
              resetsAt={bucket.primary.resetsAt}
              now={now}
            />
          ) : null}
          {bucket.secondary ? (
            <UsageWindowRow
              label={codexWindowLabel(bucket.secondary, "Secondary")}
              usedPercent={bucket.secondary.usedPercent}
              resetsAt={bucket.secondary.resetsAt}
              now={now}
            />
          ) : null}
          {bucket.individualLimit ? (
            <>
              <UsageWindowRow
                label="Credit limit"
                usedPercent={bucket.individualLimit.usedPercent}
                resetsAt={bucket.individualLimit.resetsAt}
                now={now}
              />
              {bucket.individualLimit.used !== null &&
              bucket.individualLimit.limit !== null ? (
                <div className={sx(statusBarUsageStyles.amountRow)}>
                  <span className={sx(statusBarUsageStyles.amountLabel)}>Credits</span>
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
              No usage windows reported for this bucket.
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
  if (!snapshot || snapshot.source === "unavailable" || !snapshot.monthly) {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ??
          `${provider === "cursor" ? "Cursor" : "Kiro"} usage unavailable.`}
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
            label="Included plan"
            usedPercent={snapshot.monthly.usedPercent}
            resetsAt={snapshot.monthly.resetsAt}
            now={now}
          />
          <UsageAmount
            usage={snapshot.monthly}
            label="Included spend"
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
                label={bucket.unit ?? "Usage"}
                provider="kiro"
              />
            ) : null}
          </div>
        ))
      ) : provider === "kiro" ? (
        <UsageWindowRow
          label="Monthly"
          usedPercent={snapshot.monthly.usedPercent}
          resetsAt={snapshot.monthly.resetsAt}
          now={now}
        />
      ) : null}
      {provider === "kiro" &&
      (snapshot as KiroUsageSnapshot).overagesEnabled !== null ? (
        <p className={sx(statusBarUsageStyles.noteFaint)}>
          overages:{" "}
          {(snapshot as KiroUsageSnapshot).overagesEnabled
            ? "enabled"
            : "disabled"}
        </p>
      ) : null}
      <p className={sx(statusBarUsageStyles.noteFaint)}>
        source: {snapshot.source}
      </p>
    </div>
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
  return (
    <div className={sx(statusBarUsageStyles.limitNote)}>
      <p className={sx(statusBarUsageStyles.note)}>
        {blockAtLimit
          ? `At 100%, Stave holds new ${providerName} turns until that limit resets. Running turns finish.`
          : `Stop turns at 100% usage is off, so Stave keeps sending ${providerName} turns past a limit.`}
      </p>
      {canSwitch ? (
        <p className={sx(statusBarUsageStyles.note)}>
          Stave doesn't switch accounts on its own. To keep working, choose
          another account below.
        </p>
      ) : null}
    </div>
  );
}

/** Today's and this month's reported cost, and what kind of number it is. */
export function TurnSpendDetail({
  cost,
  providerName,
  multipleAccounts,
}: {
  cost: UsageStripCost;
  providerName: string;
  multipleAccounts: boolean;
}) {
  const hint = describeTurnSpend({ cost, providerName, multipleAccounts });
  return (
    <div className={sx(statusBarUsageStyles.spendSection)}>
      <p className={sx(statusBarUsageStyles.bucketTitle)}>{hint.title}</p>
      <div className={sx(statusBarUsageStyles.stackTight)}>
        <div className={sx(statusBarUsageStyles.amountRow)}>
          <span className={sx(statusBarUsageStyles.amountLabel)}>Today</span>
          <span className={sx(statusBarUsageStyles.amountValue)}>
            {formatCostUsd(cost.todayUsd)}
          </span>
        </div>
        <div className={sx(statusBarUsageStyles.amountRow)}>
          <span className={sx(statusBarUsageStyles.amountLabel)}>
            This month · {cost.monthTurns === 1 ? "1 turn" : `${cost.monthTurns} turns`}
          </span>
          <span className={sx(statusBarUsageStyles.amountValue)}>
            {formatCostUsd(cost.monthUsd)}
          </span>
        </div>
      </div>
      {/* The rows above already give the totals, the hint's first line. */}
      {hint.lines.slice(1).map((line) => (
        <p key={line} className={sx(statusBarUsageStyles.note)}>
          {line}
        </p>
      ))}
    </div>
  );
}
