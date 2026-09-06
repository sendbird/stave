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
import { transition } from "@/components/ads/recipes/transition";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import {
  processTypeStyles,
  resourceStyles,
  usageRampStyles,
} from "./resources-popover.styles";

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

/** Tone per Electron process type for the pills. */
const processColor: Record<string, StyleXValue> = {
  Browser: processTypeStyles.Browser,
  Tab: processTypeStyles.Tab,
  GPU: processTypeStyles.GPU,
  Utility: processTypeStyles.Utility,
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

function barColor(ratio: number): StyleXValue {
  if (ratio < 0.6) return usageRampStyles.healthy;
  if (ratio < 0.85) return usageRampStyles.watch;
  return usageRampStyles.saturated;
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
    <div className={sx(resourceStyles.usageBar)}>
      <div className={sx(resourceStyles.usageBarHead)}>
        <span className={sx(resourceStyles.usageBarLabel)}>{label}</span>
        <span className={sx(resourceStyles.usageBarDetail)}>{detail}</span>
      </div>
      <div className={sx(resourceStyles.usageBarTrack)}>
        <div
          className={sx(resourceStyles.usageBarFill, barColor(ratio))}
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
        <TooltipTrigger
          render={<span className={sx(resourceStyles.tooltipAnchor)} />}
        >
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                xstyle={[
                  resourceStyles.trigger,
                  isBar
                    ? resourceStyles.triggerBar
                    : [
                        resourceStyles.triggerRail,
                        collapsed
                          ? resourceStyles.triggerRailCollapsed
                          : resourceStyles.triggerRailExpanded,
                      ],
                ]}
                aria-label="memory-usage"
              />
            }
          >
            <Activity className={sx(resourceStyles.triggerIcon)} />
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
        xstyle={resourceStyles.popover}
        initialFocus={false}
      >
        {/* Header */}
        <div className={sx(resourceStyles.header)}>
          <div className={sx(resourceStyles.headerTitleGroup)}>
            <Activity className={sx(resourceStyles.headerIcon)} />
            <span className={sx(resourceStyles.headerTitle)}>Memory Usage</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            xstyle={resourceStyles.refreshButton}
            aria-label="refresh-metrics"
            onClick={() => {
              setLoading(true);
              fetchMetrics();
            }}
          >
            <RefreshCw
              className={sx(
                resourceStyles.refreshIcon,
                loading && resourceStyles.refreshIconSpinning,
              )}
            />
          </Button>
        </div>

        {/* Content */}
        <div className={sx(resourceStyles.body)}>
          {!metrics ? (
            <div className={sx(resourceStyles.emptyState)}>
              <Activity className={sx(resourceStyles.emptyIcon)} />
              <p className={sx(resourceStyles.emptyCopy)}>
                {loading ? "Loading metrics…" : "Metrics unavailable"}
              </p>
            </div>
          ) : (
            <div className={sx(resourceStyles.stack)}>
              {/* Summary row */}
              <div className={sx(resourceStyles.summaryGrid)}>
                <div className={sx(resourceStyles.summaryTile)}>
                  <div className={sx(resourceStyles.summaryTileIconRow)}>
                    <MemoryStick
                      className={sx(resourceStyles.summaryTileIcon)}
                    />
                  </div>
                  <div className={sx(resourceStyles.summaryTileValue)}>
                    {formatKB(totalWorkingSetKB)}
                  </div>
                  <div className={sx(resourceStyles.summaryTileLabel)}>
                    Electron
                  </div>
                </div>
                <div className={sx(resourceStyles.summaryTile)}>
                  <div className={sx(resourceStyles.summaryTileIconRow)}>
                    <Cpu className={sx(resourceStyles.summaryTileIcon)} />
                  </div>
                  <div className={sx(resourceStyles.summaryTileValue)}>
                    {totalCpu.toFixed(1)}%
                  </div>
                  <div className={sx(resourceStyles.summaryTileLabel)}>CPU</div>
                </div>
                <div className={sx(resourceStyles.summaryTile)}>
                  <div className={sx(resourceStyles.summaryTileIconRow)}>
                    <Clock className={sx(resourceStyles.summaryTileIcon)} />
                  </div>
                  <div className={sx(resourceStyles.summaryTileValue)}>
                    {formatUptime(metrics.uptimeSeconds)}
                  </div>
                  <div className={sx(resourceStyles.summaryTileLabel)}>
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

              <div className={sx(resourceStyles.detailGrid)}>
                {rendererMemory ? (
                  <>
                    <span className={sx(resourceStyles.detailKey)}>
                      Renderer memory
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatKB(
                        rendererMemory.process.residentSet ??
                          rendererMemory.process.private,
                      )}
                    </span>
                  </>
                ) : null}
                {rendererMemory ? (
                  <>
                    <span className={sx(resourceStyles.detailKey)}>
                      Blink allocated
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatKB(rendererMemory.blink.allocated)}
                    </span>
                  </>
                ) : null}
                <span className={sx(resourceStyles.detailKey)}>
                  Renderer stalls
                </span>
                <span
                  className={sx(
                    resourceStyles.detailValuePlain,
                    metrics.renderer.currentlyUnresponsive
                      ? resourceStyles.detailValueDanger
                      : resourceStyles.detailValueMuted,
                  )}
                >
                  {metrics.renderer.unresponsiveEvents}
                  {metrics.renderer.currentlyUnresponsive ? " active" : ""}
                </span>
                <span className={sx(resourceStyles.detailKey)}>Renderer exits</span>
                <span className={sx(resourceStyles.detailValue, resourceStyles.truncated)}>
                  {metrics.renderer.renderProcessGoneEvents}
                  {metrics.renderer.lastRenderProcessGoneReason
                    ? ` · ${metrics.renderer.lastRenderProcessGoneReason}`
                    : ""}
                </span>
              </div>

              {recentMetrics && recentMetrics.sampleCount > 1 ? (
                <div className={sx(resourceStyles.group)}>
                  <div className={sx(resourceStyles.groupHead)}>
                    <span className={sx(resourceStyles.groupTitle)}>
                      Recent pressure
                    </span>
                    <span className={sx(resourceStyles.groupMeta)}>
                      {Math.max(1, Math.round(recentMetrics.durationMs / 1_000))}s
                      · {recentMetrics.sampleCount} samples
                    </span>
                  </div>
                  <div className={sx(resourceStyles.detailGrid)}>
                    <span className={sx(resourceStyles.detailKey)}>
                      App renderer CPU
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {recentMetrics.rendererCpuAverage.toFixed(1)}% avg ·{" "}
                      {recentMetrics.rendererCpuPeak.toFixed(1)}% peak
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>GPU CPU</span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {recentMetrics.gpuCpuAverage.toFixed(1)}% avg ·{" "}
                      {recentMetrics.gpuCpuPeak.toFixed(1)}% peak
                    </span>
                    {recentMetrics.rendererHeapDeltaKB != null ? (
                      <>
                        <span className={sx(resourceStyles.detailKey)}>
                          Renderer heap change
                        </span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {formatSignedKB(recentMetrics.rendererHeapDeltaKB)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {metrics.hostService ? (
                <div className={sx(resourceStyles.group)}>
                  <div className={sx(resourceStyles.groupHead)}>
                    <span className={sx(resourceStyles.groupTitle)}>
                      Host service
                    </span>
                    <span className={sx(resourceStyles.groupMeta)}>
                      {formatBytes(metrics.hostService.memory.rss)} RSS
                    </span>
                  </div>
                  <div className={sx(resourceStyles.detailGrid)}>
                    <span className={sx(resourceStyles.detailKey)}>
                      All descendants
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {metrics.hostService.childProcesses.length} ·{" "}
                      {formatBytes(childProcessRss)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      ↳ Provider trees (subset)
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {providerChildProcesses.length} ·{" "}
                      {formatBytes(providerChildRss)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>PTY sessions</span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {metrics.hostService.terminalSessions}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Lens lifecycle and bounded-log cardinalities */}
              <div className={sx(resourceStyles.group)}>
                <div className={sx(resourceStyles.groupHead)}>
                  <span className={sx(resourceStyles.groupTitle)}>
                    Lens resources
                  </span>
                  <span className={sx(resourceStyles.groupMeta)}>
                    {metrics.lens.sessions} sessions ·{" "}
                    {metrics.lens.visibleSessions} visible
                  </span>
                </div>
                <div className={sx(resourceStyles.detailGrid)}>
                  <span className={sx(resourceStyles.detailKey)}>Diagnostics</span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.diagnosticsSessions} active
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>MCP sessions</span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.managedByMcpSessions}
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>Hidden guests</span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.sessions - metrics.lens.visibleSessions}
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>
                    Guest working set
                  </span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {formatKB(lensWorkingSetKB)}
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>
                    Buffered logs
                  </span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.consoleEntries} C ·{" "}
                    {metrics.lens.networkEntries} N ·{" "}
                    {metrics.lens.downloadEntries} D
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>
                    Auth popups
                  </span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.authPopups}
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>
                    CDP active / closing
                  </span>
                  <span className={sx(resourceStyles.detailValue)}>
                    {metrics.lens.cdpControllers} /{" "}
                    {metrics.lens.cdpClosingControllers}
                  </span>
                  <span className={sx(resourceStyles.detailKey)}>
                    CDP in-flight / timeouts
                  </span>
                  <span
                    className={sx(
                      resourceStyles.detailValuePlain,
                      metrics.lens.cdpCloseDrainTimeouts > 0
                        ? resourceStyles.detailValueWarning
                        : resourceStyles.detailValueMuted,
                    )}
                  >
                    {metrics.lens.cdpInFlightCommands} /{" "}
                    {metrics.lens.cdpCloseDrainTimeouts}
                  </span>
                </div>
              </div>

              {metrics.persistence ? (
                <div className={sx(resourceStyles.group)}>
                  <div className={sx(resourceStyles.groupTitleBlock)}>
                    Persistence
                  </div>
                  <div className={sx(resourceStyles.detailGrid)}>
                    <span className={sx(resourceStyles.detailKey)}>
                      SQLite used
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatBytes(metrics.persistence.usedBytes)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      File / reclaimable
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatBytes(metrics.persistence.fileBytes)} /{" "}
                      {formatBytes(
                        metrics.persistence.freePages *
                          metrics.persistence.pageSizeBytes,
                      )}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      Incremental vacuum
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {metrics.persistence.autoVacuum === 2 ? "on" : "pending"}
                    </span>
                  </div>
                </div>
              ) : null}

              {latestWorkspaceSwitch ? (
                <div className={sx(resourceStyles.group)}>
                  <div className={sx(resourceStyles.groupHead)}>
                    <span className={sx(resourceStyles.groupTitle)}>
                      Last workspace switch
                    </span>
                    <span className={sx(resourceStyles.groupMeta)}>
                      {latestWorkspaceSwitch.cacheHit ? "cache" : "storage"}
                    </span>
                  </div>
                  <div className={sx(resourceStyles.detailGrid)}>
                    <span className={sx(resourceStyles.detailKey)}>
                      Interactive
                    </span>
                    <span className={sx(resourceStyles.detailValueStrong)}>
                      {formatDuration(latestWorkspaceSwitch.totalMs)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      Outgoing save
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatDuration(latestWorkspaceSwitch.flushMs)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>Shell load</span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatDuration(latestWorkspaceSwitch.shellMs)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      Files ready
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatDuration(latestWorkspaceSwitch.filesMs)}
                    </span>
                    <span className={sx(resourceStyles.detailKey)}>
                      Messages ready
                    </span>
                    <span className={sx(resourceStyles.detailValue)}>
                      {formatDuration(latestWorkspaceSwitch.messagesMs)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Process breakdown */}
              <div>
                <div className={sx(resourceStyles.processHead)}>
                  <HardDrive className={sx(resourceStyles.processHeadIcon)} />
                  <span className={sx(resourceStyles.groupTitle)}>
                    Processes ({metrics.processes.length})
                  </span>
                </div>
                <div className={sx(resourceStyles.processList)}>
                  {metrics.processes
                    .slice()
                    .sort(
                      (a, b) =>
                        b.memory.workingSetSizeKB - a.memory.workingSetSizeKB,
                    )
                    .map((proc) => (
                      <div
                        key={proc.pid}
                        className={sx(resourceStyles.processRow, transition.colors)}
                      >
                        <span
                          className={sx(
                            resourceStyles.processDot,
                            processColor[proc.type] ?? processTypeStyles.other,
                          )}
                        />
                        <span className={sx(resourceStyles.processName)}>
                          {proc.role === "other"
                            ? (processLabel[proc.type] ?? proc.type)
                            : processRoleLabel[proc.role]}
                        </span>
                        <span className={sx(resourceStyles.processMemory)}>
                          {formatKB(proc.memory.workingSetSizeKB)}
                        </span>
                        {proc.cpu.percentCPUUsage > 0.1 && (
                          <span className={sx(resourceStyles.processCpu)}>
                            {proc.cpu.percentCPUUsage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* External / ArrayBuffers detail */}
              <div className={sx(resourceStyles.group)}>
                <div className={sx(resourceStyles.externalRow)}>
                  <span className={sx(resourceStyles.detailKey)}>External</span>
                  <span className={sx(resourceStyles.externalValue)}>
                    {formatBytes(metrics.mainProcess.external)}
                  </span>
                </div>
                <div className={sx(resourceStyles.externalRowSpaced)}>
                  <span className={sx(resourceStyles.detailKey)}>ArrayBuffers</span>
                  <span className={sx(resourceStyles.externalValue)}>
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
