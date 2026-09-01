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
import { cn } from "@/lib/utils";
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

function usageToneClass(usedPercent: number): string {
  if (usedPercent < 60) return "bg-success";
  if (usedPercent < 85) return "bg-warning";
  return "bg-destructive";
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
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono text-foreground/80">
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
        className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15"
      >
        <div
          aria-hidden="true"
          className={cn(
            "h-full rounded-full",
            usageToneClass(normalizedPercent),
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
      <p className="text-xs text-muted-foreground">
        {snapshot?.error ?? "Claude usage unavailable."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
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
      <p className="text-[10px] text-muted-foreground/70">
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
      <p className="text-xs text-muted-foreground">
        {snapshot?.error ?? "No Codex rate-limit buckets reported."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {snapshot.buckets.map((bucket, index) => (
        <div
          key={`${bucket.limitId ?? "bucket"}:${index}`}
          className="space-y-1.5"
        >
          <p className="text-xs font-medium text-foreground">
            {bucket.limitName ?? bucket.limitId ?? "Rate limit"}
            {bucket.planType ? (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
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
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Credits</span>
                  <span className="font-mono text-foreground/80">
                    {formatCredits(bucket.individualLimit.used)} /{" "}
                    {formatCredits(bucket.individualLimit.limit)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          {!bucket.primary && !bucket.secondary && !bucket.individualLimit ? (
            <p className="text-xs text-muted-foreground">
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
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/80">{amount}</span>
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
      <p className="text-xs text-muted-foreground">
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
    <div className="space-y-3">
      {plan ? (
        <p className="text-xs font-medium text-foreground">{plan}</p>
      ) : null}
      {provider === "cursor" ? (
        <div className="space-y-1.5">
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
          <div key={bucket.id} className="space-y-1.5">
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
        <p className="text-[10px] text-muted-foreground/70">
          overages:{" "}
          {(snapshot as KiroUsageSnapshot).overagesEnabled
            ? "enabled"
            : "disabled"}
        </p>
      ) : null}
      <p className="text-[10px] text-muted-foreground/70">
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
            className="h-6 gap-1.5 rounded-none px-2 text-xs text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            aria-label={`${label[provider].toLowerCase()}-usage`}
          />
        }
      >
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            headlinePercent === null
              ? "bg-muted-foreground/40"
              : usageToneClass(clampUsagePercent(headlinePercent)),
          )}
        />
        <span>{label[provider]}</span>
        {headlineWindows.length === 0 ? (
          <span className="font-mono">—</span>
        ) : (
          headlineWindows.map((window) => (
            <span key={window.short} className="font-mono">
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
        className="w-72 gap-0 overflow-hidden border border-border/80 bg-card p-0"
        initialFocus={false}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
          <span className="text-sm font-medium">{label[provider]} Usage</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="refresh-rate-limits"
            onClick={() => void refreshRateLimits()}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="p-3">
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
