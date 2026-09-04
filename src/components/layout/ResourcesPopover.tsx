import {
  Activity,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  appendResourceMetricSample,
  summarizeResourceMetricSamples,
  type ResourceMetricSample,
  type ResourceMetricSummary,
} from "@/lib/performance/resource-metric-history";
import { getLatestWorkspaceSwitchPerformance } from "@/lib/performance/workspace-switch-metrics";
import { cn } from "@/lib/utils";

interface ProcessMetric {
  pid: number;
  type: string;
  role:
    | "main"
    | "host-renderer"
    | "lens-guest"
    | "gpu"
    | "utility"
    | "other";
  memory: { workingSetSizeKB: number; peakWorkingSetSizeKB: number };
  cpu: { percentCPUUsage: number };
}

interface AppMetrics {
  processes: ProcessMetric[];
  mainProcess: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  hostRendererPid: number | null;
  hostService: {
    pid: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    terminalSessions: number;
    ptyPids: number[];
    childProcesses: Array<{
      pid: number;
      parentPid: number;
      rssBytes: number;
      kind: "provider" | "pty" | "language-server" | "other";
    }>;
  } | null;
  lens: {
    sessions: number;
    visibleSessions: number;
    managedByMcpSessions: number;
    diagnosticsSessions: number;
    authPopups: number;
    consoleEntries: number;
    networkEntries: number;
    downloadEntries: number;
    cdpControllers: number;
    cdpClosingControllers: number;
    cdpInFlightCommands: number;
    cdpCloseDrainTimeouts: number;
    guests: Array<{
      workspaceId: string;
      lensSessionId: string;
      pid: number | null;
      visible: boolean;
      managedByMcp: boolean;
      url: string;
    }>;
  };
  renderer: {
    currentlyUnresponsive: boolean;
    unresponsiveEvents: number;
    renderProcessGoneEvents: number;
    lastRenderProcessGoneReason?: string;
  };
  persistence: {
    pageSizeBytes: number;
    pageCount: number;
    freePages: number;
    usedBytes: number;
    fileBytes: number;
    autoVacuum: number;
  } | null;
  uptimeSeconds: number;
}

interface RendererMemoryMetrics {
  heap: {
    totalHeapSize: number;
    usedHeapSize: number;
    heapSizeLimit: number;
  };
  process: { residentSet?: number; private: number; shared?: number };
  blink: { allocated: number; marked: number; total: number };
}

/** Map Electron process type labels to friendlier display names. */
const processLabel: Record<string, string> = {
  Browser: "Main",
  Tab: "Renderer",
  GPU: "GPU",
  Utility: "Utility",
  Zygote: "Zygote",
};

const processRoleLabel: Record<ProcessMetric["role"], string> = {
  main: "Main",
  "host-renderer": "App renderer",
  "lens-guest": "Lens guest",
  gpu: "GPU",
  utility: "Utility",
  other: "Other",
};

/** Colour classes for the process-type pills. */
const processColor: Record<string, string> = {
  Browser: "bg-blue-500",
  Tab: "bg-emerald-500",
  GPU: "bg-purple-500",
  Utility: "bg-amber-500",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatKB(kb: number): string {
  return formatBytes(kb * 1024);
}

function formatSignedKB(kb: number): string {
  if (kb === 0) return "0 B";
  return `${kb > 0 ? "+" : "−"}${formatKB(Math.abs(kb))}`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function barColor(ratio: number): string {
  if (ratio < 0.6) return "bg-emerald-500";
  if (ratio < 0.85) return "bg-amber-500";
  return "bg-red-500";
}

function UsageBar({
  used,
  total,
  label,
  detail,
}: {
  used: number;
  total: number;
  label: string;
  detail: string;
}) {
  const ratio = total > 0 ? used / total : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground/80">{detail}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            barColor(ratio),
          )}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function MemoryUsagePopover({
  collapsed,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  /** "bar" renders a compact inline trigger for the bottom status bar. */
  variant?: "sidebar" | "bar";
}) {
  const isBar = variant === "bar";
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [rendererMemory, setRendererMemory] =
    useState<RendererMemoryMetrics | null>(null);
  const [recentMetrics, setRecentMetrics] =
    useState<ResourceMetricSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const samplesRef = useRef<ResourceMetricSample[]>([]);

  const fetchMetrics = useCallback(async () => {
    try {
      const [appResult, rendererResult] = await Promise.allSettled([
        window.api?.metrics?.getAppMetrics?.(),
        window.api?.metrics?.getRendererMemory?.(),
      ]);
      if (appResult.status === "fulfilled" && appResult.value) {
        setMetrics(appResult.value);
      }
      if (rendererResult.status === "fulfilled" && rendererResult.value) {
        setRendererMemory(rendererResult.value);
      }
      if (appResult.status === "fulfilled" && appResult.value) {
        const rendererCpuPercent = appResult.value.processes
          .filter((process) => process.role === "host-renderer")
          .reduce((sum, process) => sum + process.cpu.percentCPUUsage, 0);
        const gpuCpuPercent = appResult.value.processes
          .filter((process) => process.role === "gpu")
          .reduce((sum, process) => sum + process.cpu.percentCPUUsage, 0);
        const rendererHeapUsedKB =
          rendererResult.status === "fulfilled" && rendererResult.value
            ? rendererResult.value.heap.usedHeapSize
            : null;
        samplesRef.current = appendResourceMetricSample(samplesRef.current, {
          sampledAt: Date.now(),
          rendererCpuPercent,
          gpuCpuPercent,
          rendererHeapUsedKB,
        });
        setRecentMetrics(summarizeResourceMetricSamples(samplesRef.current));
      }
    } catch {
      // silently ignore — app metrics may be unavailable in dev/web mode
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setLoading(true);
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchMetrics]);

  const totalWorkingSetKB =
    metrics?.processes.reduce((sum, p) => sum + p.memory.workingSetSizeKB, 0) ??
    0;
  const totalCpu =
    metrics?.processes.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0) ?? 0;
  const latestWorkspaceSwitch = getLatestWorkspaceSwitchPerformance();
  const lensWorkingSetKB =
    metrics?.processes
      .filter((process) => process.role === "lens-guest")
      .reduce((sum, process) => sum + process.memory.workingSetSizeKB, 0) ?? 0;
  const childProcessRss =
    metrics?.hostService?.childProcesses.reduce(
      (sum, child) => sum + child.rssBytes,
      0,
    ) ?? 0;
  const providerChildProcesses =
    metrics?.hostService?.childProcesses.filter(
      (child) => child.kind === "provider",
    ) ?? [];
  const providerChildRss = providerChildProcesses.reduce(
    (sum, child) => sum + child.rssBytes,
    0,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  isBar
                    ? "h-6 gap-1.5 rounded-none px-2 text-xs"
                    : cn("rounded-md p-0", collapsed ? "h-10 w-10" : "h-9 w-9"),
                )}
                aria-label="memory-usage"
              />
            }
          >
            <Activity className="size-4" />
            {isBar ? <span>Memory</span> : null}
          </PopoverTrigger>
        </TooltipTrigger>
        {!open ? (
          <TooltipContent side={collapsed ? "right" : isBar ? "top" : "bottom"}>
            Memory Usage
          </TooltipContent>
        ) : null}
      </Tooltip>

      <PopoverContent
        side={isBar ? "top" : "right"}
        align={isBar ? "end" : "start"}
        sideOffset={isBar ? 8 : 12}
        className="w-80 gap-0 overflow-hidden border border-border/80 bg-card p-0"
        initialFocus={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Memory Usage</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="refresh-metrics"
            onClick={() => {
              setLoading(true);
              fetchMetrics();
            }}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto p-3">
          {!metrics ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Activity className="size-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground/70">
                {loading ? "Loading metrics…" : "Metrics unavailable"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border/50 bg-secondary/30 px-2.5 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <MemoryStick className="size-3 text-muted-foreground" />
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {formatKB(totalWorkingSetKB)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Electron
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-secondary/30 px-2.5 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Cpu className="size-3 text-muted-foreground" />
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {totalCpu.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">CPU</div>
                </div>
                <div className="rounded-md border border-border/50 bg-secondary/30 px-2.5 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="size-3 text-muted-foreground" />
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {formatUptime(metrics.uptimeSeconds)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Uptime
                  </div>
                </div>
              </div>

              {/* Heap usage bar */}
              <UsageBar
                label="JS Heap"
                used={metrics.mainProcess.heapUsed}
                total={metrics.mainProcess.heapTotal}
                detail={`${formatBytes(
                  metrics.mainProcess.heapUsed,
                )} / ${formatBytes(metrics.mainProcess.heapTotal)}`}
              />

              {/* RSS bar */}
              <UsageBar
                label="RSS (Main)"
                used={metrics.mainProcess.rss}
                total={metrics.mainProcess.rss * 1.25}
                detail={formatBytes(metrics.mainProcess.rss)}
              />

              {rendererMemory ? (
                <UsageBar
                  label="Renderer heap"
                  used={rendererMemory.heap.usedHeapSize}
                  total={rendererMemory.heap.totalHeapSize}
                  detail={`${formatKB(
                    rendererMemory.heap.usedHeapSize,
                  )} / ${formatKB(rendererMemory.heap.totalHeapSize)}`}
                />
              ) : null}

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {rendererMemory ? (
                  <>
                    <span className="text-muted-foreground/70">
                      Renderer memory
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatKB(
                        rendererMemory.process.residentSet ??
                          rendererMemory.process.private,
                      )}
                    </span>
                  </>
                ) : null}
                {rendererMemory ? (
                  <>
                    <span className="text-muted-foreground/70">
                      Blink allocated
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatKB(rendererMemory.blink.allocated)}
                    </span>
                  </>
                ) : null}
                <span className="text-muted-foreground/70">
                  Renderer stalls
                </span>
                <span
                  className={cn(
                    "text-right font-mono",
                    metrics.renderer.currentlyUnresponsive
                      ? "text-red-500"
                      : "text-muted-foreground/80",
                  )}
                >
                  {metrics.renderer.unresponsiveEvents}
                  {metrics.renderer.currentlyUnresponsive ? " active" : ""}
                </span>
                <span className="text-muted-foreground/70">Renderer exits</span>
                <span className="truncate text-right font-mono text-muted-foreground/80">
                  {metrics.renderer.renderProcessGoneEvents}
                  {metrics.renderer.lastRenderProcessGoneReason
                    ? ` · ${metrics.renderer.lastRenderProcessGoneReason}`
                    : ""}
                </span>
              </div>

              {recentMetrics && recentMetrics.sampleCount > 1 ? (
                <div className="border-t border-border/50 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Recent pressure
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {Math.max(1, Math.round(recentMetrics.durationMs / 1_000))}s
                      · {recentMetrics.sampleCount} samples
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground/70">
                      App renderer CPU
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {recentMetrics.rendererCpuAverage.toFixed(1)}% avg ·{" "}
                      {recentMetrics.rendererCpuPeak.toFixed(1)}% peak
                    </span>
                    <span className="text-muted-foreground/70">GPU CPU</span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {recentMetrics.gpuCpuAverage.toFixed(1)}% avg ·{" "}
                      {recentMetrics.gpuCpuPeak.toFixed(1)}% peak
                    </span>
                    {recentMetrics.rendererHeapDeltaKB != null ? (
                      <>
                        <span className="text-muted-foreground/70">
                          Renderer heap change
                        </span>
                        <span className="text-right font-mono text-muted-foreground/80">
                          {formatSignedKB(recentMetrics.rendererHeapDeltaKB)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {metrics.hostService ? (
                <div className="border-t border-border/50 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Host service
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {formatBytes(metrics.hostService.memory.rss)} RSS
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground/70">
                      All descendants
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {metrics.hostService.childProcesses.length} ·{" "}
                      {formatBytes(childProcessRss)}
                    </span>
                    <span className="text-muted-foreground/70">
                      ↳ Provider trees (subset)
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {providerChildProcesses.length} ·{" "}
                      {formatBytes(providerChildRss)}
                    </span>
                    <span className="text-muted-foreground/70">PTY sessions</span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {metrics.hostService.terminalSessions}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Lens lifecycle and bounded-log cardinalities */}
              <div className="border-t border-border/50 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Lens resources
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {metrics.lens.sessions} sessions ·{" "}
                    {metrics.lens.visibleSessions} visible
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground/70">Diagnostics</span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.diagnosticsSessions} active
                  </span>
                  <span className="text-muted-foreground/70">MCP sessions</span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.managedByMcpSessions}
                  </span>
                  <span className="text-muted-foreground/70">Hidden guests</span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.sessions - metrics.lens.visibleSessions}
                  </span>
                  <span className="text-muted-foreground/70">
                    Guest working set
                  </span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {formatKB(lensWorkingSetKB)}
                  </span>
                  <span className="text-muted-foreground/70">
                    Buffered logs
                  </span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.consoleEntries} C ·{" "}
                    {metrics.lens.networkEntries} N ·{" "}
                    {metrics.lens.downloadEntries} D
                  </span>
                  <span className="text-muted-foreground/70">
                    Auth popups
                  </span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.authPopups}
                  </span>
                  <span className="text-muted-foreground/70">
                    CDP active / closing
                  </span>
                  <span className="text-right font-mono text-muted-foreground/80">
                    {metrics.lens.cdpControllers} /{" "}
                    {metrics.lens.cdpClosingControllers}
                  </span>
                  <span className="text-muted-foreground/70">
                    CDP in-flight / timeouts
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono",
                      metrics.lens.cdpCloseDrainTimeouts > 0
                        ? "text-amber-500"
                        : "text-muted-foreground/80",
                    )}
                  >
                    {metrics.lens.cdpInFlightCommands} /{" "}
                    {metrics.lens.cdpCloseDrainTimeouts}
                  </span>
                </div>
              </div>

              {metrics.persistence ? (
                <div className="border-t border-border/50 pt-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Persistence
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground/70">
                      SQLite used
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatBytes(metrics.persistence.usedBytes)}
                    </span>
                    <span className="text-muted-foreground/70">
                      File / reclaimable
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatBytes(metrics.persistence.fileBytes)} /{" "}
                      {formatBytes(
                        metrics.persistence.freePages *
                          metrics.persistence.pageSizeBytes,
                      )}
                    </span>
                    <span className="text-muted-foreground/70">
                      Incremental vacuum
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {metrics.persistence.autoVacuum === 2 ? "on" : "pending"}
                    </span>
                  </div>
                </div>
              ) : null}

              {latestWorkspaceSwitch ? (
                <div className="border-t border-border/50 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Last workspace switch
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {latestWorkspaceSwitch.cacheHit ? "cache" : "storage"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground/70">
                      Interactive
                    </span>
                    <span className="text-right font-mono text-foreground/80">
                      {formatDuration(latestWorkspaceSwitch.totalMs)}
                    </span>
                    <span className="text-muted-foreground/70">
                      Outgoing save
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatDuration(latestWorkspaceSwitch.flushMs)}
                    </span>
                    <span className="text-muted-foreground/70">Shell load</span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatDuration(latestWorkspaceSwitch.shellMs)}
                    </span>
                    <span className="text-muted-foreground/70">
                      Files ready
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatDuration(latestWorkspaceSwitch.filesMs)}
                    </span>
                    <span className="text-muted-foreground/70">
                      Messages ready
                    </span>
                    <span className="text-right font-mono text-muted-foreground/80">
                      {formatDuration(latestWorkspaceSwitch.messagesMs)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Process breakdown */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <HardDrive className="size-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Processes ({metrics.processes.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {metrics.processes
                    .slice()
                    .sort(
                      (a, b) =>
                        b.memory.workingSetSizeKB - a.memory.workingSetSizeKB,
                    )
                    .map((proc) => (
                      <div
                        key={proc.pid}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary/40"
                      >
                        <span
                          className={cn(
                            "inline-block size-2 shrink-0 rounded-full",
                            processColor[proc.type] ?? "bg-zinc-500",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground/80">
                          {proc.role === "other"
                            ? (processLabel[proc.type] ?? proc.type)
                            : processRoleLabel[proc.role]}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {formatKB(proc.memory.workingSetSizeKB)}
                        </span>
                        {proc.cpu.percentCPUUsage > 0.1 && (
                          <span className="font-mono text-muted-foreground/60">
                            {proc.cpu.percentCPUUsage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* External / ArrayBuffers detail */}
              <div className="border-t border-border/50 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/70">External</span>
                  <span className="font-mono text-muted-foreground/70">
                    {formatBytes(metrics.mainProcess.external)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/70">ArrayBuffers</span>
                  <span className="font-mono text-muted-foreground/70">
                    {formatBytes(metrics.mainProcess.arrayBuffers)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
