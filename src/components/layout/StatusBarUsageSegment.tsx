import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import {
  buildUsageHeadlineWindows,
  headlineUsagePercent,
} from "@/components/layout/status-bar-usage.utils";
import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import { useAppStore } from "@/store/app.store";
import type {
  AccountUsageWindow,
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "@/lib/providers/provider.types";

type UsageProvider = "claude" | "codex" | "cursor" | "kiro";

function formatPercent(usedPercent: number): string {
  return `${Math.round(usedPercent)}%`;
}

function usageToneStyle(usedPercent: number) {
  if (usedPercent < 60) return statusBarUsageStyles.toneOk;
  if (usedPercent < 85) return statusBarUsageStyles.toneWarn;
  return statusBarUsageStyles.toneDanger;
}

function clampUsagePercent(usedPercent: number): number {
  if (!Number.isFinite(usedPercent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, usedPercent));
}

function formatResetsIn(resetsAt: number | null): string {
  if (resetsAt === null || Number.isNaN(resetsAt)) {
    return "unknown";
  }
  const deltaMs = resetsAt * 1000 - Date.now();
  if (deltaMs <= 0) {
    return "soon";
  }
  const hours = Math.floor(deltaMs / 3_600_000);
  const minutes = Math.floor((deltaMs % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function UsageWindowRow({
  label,
  usedPercent,
  resetsAt,
}: {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}) {
  const normalizedPercent = clampUsagePercent(usedPercent);
  const resetLabel = formatResetsIn(resetsAt);

  return (
    <div className={sx(statusBarUsageStyles.stackTight)}>
      <div className={sx(statusBarUsageStyles.windowHead)}>
        <span className={sx(statusBarUsageStyles.windowLabel)}>{label}</span>
        <span className={sx(statusBarUsageStyles.windowValue)}>
          {formatPercent(usedPercent)} · resets {resetLabel}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalizedPercent)}
        aria-valuetext={`${formatPercent(usedPercent)} used, resets ${resetLabel}`}
        className={sx(statusBarUsageStyles.meterTrack)}
      >
        <div
          aria-hidden="true"
          className={sx(
            statusBarUsageStyles.meterFill,
            usageToneStyle(normalizedPercent),
          )}
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
    </div>
  );
}

function ClaudeDetail({ snapshot }: { snapshot: ClaudeUsageSnapshot | null }) {
  if (!snapshot || snapshot.source === "unavailable") {
    return (
      <p className={sx(statusBarUsageStyles.note)}>
        {snapshot?.error ?? "Claude usage unavailable."}
      </p>
    );
  }
  return (
    <div className={sx(statusBarUsageStyles.stackSnug)}>
      {snapshot.session ? (
        <UsageWindowRow
          label="Session (5h)"
          usedPercent={snapshot.session.usedPercent}
          resetsAt={snapshot.session.resetsAt}
        />
      ) : null}
      {snapshot.weekly ? (
        <UsageWindowRow
          label="Weekly (7d)"
          usedPercent={snapshot.weekly.usedPercent}
          resetsAt={snapshot.weekly.resetsAt}
        />
      ) : null}
      {snapshot.fableWeekly ? (
        <UsageWindowRow
          label="Weekly (Fable)"
          usedPercent={snapshot.fableWeekly.usedPercent}
          resetsAt={snapshot.fableWeekly.resetsAt}
        />
      ) : null}
      <p className={sx(statusBarUsageStyles.noteFaint)}>
        source: {snapshot.source}
      </p>
    </div>
  );
}

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString();
}

function CodexDetail({ snapshot }: { snapshot: CodexUsageSnapshot | null }) {
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
              label="Primary"
              usedPercent={bucket.primary.usedPercent}
              resetsAt={bucket.primary.resetsAt}
            />
          ) : null}
          {bucket.secondary ? (
            <UsageWindowRow
              label="Secondary"
              usedPercent={bucket.secondary.usedPercent}
              resetsAt={bucket.secondary.resetsAt}
            />
          ) : null}
          {bucket.individualLimit ? (
            <>
              <UsageWindowRow
                label="Usage"
                usedPercent={bucket.individualLimit.usedPercent}
                resetsAt={bucket.individualLimit.resetsAt}
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

function AccountDetail({
  provider,
  snapshot,
}: {
  provider: "cursor" | "kiro";
  snapshot: CursorUsageSnapshot | KiroUsageSnapshot | null;
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

/**
 * Compact provider usage meter for the bottom status bar. Clicking it
 * opens a detail popover anchored near the bottom-right of its trigger
 * (session/weekly or rate-limit-bucket breakdown, reset countdowns, data
 * source, and a manual refresh button). Polling itself is owned by the
 * parent `StatusBar` so mounting two segments doesn't double-fetch.
 */
export function StatusBarUsageSegment({
  provider,
}: {
  provider: UsageProvider;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const loading = useAppStore((state) => state.rateLimitsLoading);
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);

  const label: Record<UsageProvider, string> = {
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
    kiro: "Kiro",
  };
  const claudeSnapshot =
    provider === "claude" ? (snapshot?.claude ?? null) : null;
  const codexSnapshot = provider === "codex" ? (snapshot?.codex ?? null) : null;
  const cursorSnapshot =
    provider === "cursor" ? (snapshot?.cursor ?? null) : null;
  const kiroSnapshot = provider === "kiro" ? (snapshot?.kiro ?? null) : null;
  const headlineWindows = buildUsageHeadlineWindows({
    provider,
    claude: claudeSnapshot,
    codex: codexSnapshot,
    cursor: cursorSnapshot,
    kiro: kiroSnapshot,
  });
  const headlinePercent = headlineUsagePercent(headlineWindows);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            xstyle={statusBarUsageStyles.trigger}
            aria-label={`${label[provider].toLowerCase()}-usage`}
          />
        }
      >
        <span
          className={sx(
            statusBarUsageStyles.triggerDot,
            headlinePercent === null
              ? statusBarUsageStyles.toneUnknown
              : usageToneStyle(clampUsagePercent(headlinePercent)),
          )}
        />
        <span>{label[provider]}</span>
        {headlineWindows.length === 0 ? (
          <span className={sx(statusBarUsageStyles.triggerMono)}>—</span>
        ) : (
          headlineWindows.map((window) => (
            <span key={window.short} className={sx(statusBarUsageStyles.triggerMono)}>
              {window.short ? `${window.short} ` : ""}
              {formatPercent(window.usedPercent)}
            </span>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        xstyle={statusBarUsageStyles.popover}
        initialFocus={false}
      >
        <div className={sx(statusBarUsageStyles.popoverHeader)}>
          <span className={sx(statusBarUsageStyles.popoverTitle)}>{label[provider]} Usage</span>
          <Button
            variant="ghost"
            size="sm"
            xstyle={statusBarUsageStyles.refreshButton}
            aria-label="refresh-rate-limits"
            onClick={() => void refreshRateLimits()}
          >
            <RefreshCw
              className={sx(
                statusBarUsageStyles.refreshIcon,
                loading && statusBarUsageStyles.refreshIconSpinning,
              )}
            />
          </Button>
        </div>
        <div className={sx(statusBarUsageStyles.popoverBody)}>
          {provider === "claude" ? (
            <ClaudeDetail snapshot={claudeSnapshot} />
          ) : provider === "codex" ? (
            <CodexDetail snapshot={codexSnapshot} />
          ) : provider === "cursor" ? (
            <AccountDetail provider="cursor" snapshot={cursorSnapshot} />
          ) : (
            <AccountDetail provider="kiro" snapshot={kiroSnapshot} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
