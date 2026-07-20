import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
} from "@/lib/providers/provider.types";

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

function ClaudeDetail({
  snapshot,
}: {
  snapshot: ClaudeUsageSnapshot | null;
}) {
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

/**
 * Compact Claude/Codex usage meter for the bottom status bar. Clicking it
 * opens a detail popover anchored near the bottom-right of its trigger
 * (session/weekly or rate-limit-bucket breakdown, reset countdowns, data
 * source, and a manual refresh button). Polling itself is owned by the
 * parent `StatusBar` so mounting two segments doesn't double-fetch.
 */
export function StatusBarUsageSegment({
  provider,
}: {
  provider: "claude" | "codex";
}) {
  const [open, setOpen] = useState(false);
  const snapshot = useAppStore((state) => state.rateLimitsSnapshot);
  const loading = useAppStore((state) => state.rateLimitsLoading);
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);

  const label = provider === "claude" ? "Claude" : "Codex";
  const claudeSnapshot = provider === "claude" ? (snapshot?.claude ?? null) : null;
  const codexSnapshot = provider === "codex" ? (snapshot?.codex ?? null) : null;
  const codexHeadlineBucket = codexSnapshot?.buckets[0] ?? null;
  const headlinePercent =
    provider === "claude"
      ? (claudeSnapshot?.session?.usedPercent ??
        claudeSnapshot?.weekly?.usedPercent ??
        claudeSnapshot?.fableWeekly?.usedPercent ??
        null)
      : (codexHeadlineBucket?.primary?.usedPercent ??
        codexHeadlineBucket?.individualLimit?.usedPercent ??
        null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 rounded-none px-2 text-xs text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          aria-label={`${label.toLowerCase()}-usage`}
        >
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              headlinePercent === null
                ? "bg-muted-foreground/40"
                : usageToneClass(clampUsagePercent(headlinePercent)),
            )}
          />
          <span>{label}</span>
          <span className="font-mono">
            {headlinePercent === null ? "—" : formatPercent(headlinePercent)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 gap-0 overflow-hidden border border-border/80 bg-card p-0 shadow-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
          <span className="text-sm font-medium">{label} Usage</span>
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
          ) : (
            <CodexDetail snapshot={codexSnapshot} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
