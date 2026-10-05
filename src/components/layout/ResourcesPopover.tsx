import { formatPercent } from "@/i18n/format";
import { formatNumber } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Activity,
  HardDrive,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
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
import {
  formatBytes,
  formatDuration,
  formatKB,
  formatSignedKB,
} from "@/lib/performance/resource-format";
import {
  appFootprintKB,
  appWorkingSetKB,
  hostServiceProcesses,
} from "@/lib/performance/resource-manager";
import { getLatestWorkspaceSwitchPerformance } from "@/lib/performance/workspace-switch-metrics";
import type { StorageCleanupReport } from "@/lib/storage-cleanup/storage-cleanup-policy";
import { transition } from "@/components/ads/recipes/transition";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { processTypeStyles, resourceStyles } from "./resources-popover.styles";
import { ResourceDashboard } from "./ResourceDashboard";
import { ResourceManagerOverview } from "./ResourceManagerOverview";
import { WorkspaceCleanupDialog } from "./WorkspaceCleanupDialog";
import { managerStyles } from "./resource-manager.styles";

interface ProcessMetric {
  pid: number;
  type: string;
  role: "main" | "host-renderer" | "lens-guest" | "gpu" | "utility" | "other";
  memory: { workingSetSizeKB: number; peakWorkingSetSizeKB: number };
  cpu: { percentCPUUsage: number };
}

export interface AppMetrics {
  processes: ProcessMetric[];
  mainProcess: {
    rss: number;
    /** Private (non-shared) footprint; excludes pages already released to the OS. */
    privateBytes: number | null;
    sharedBytes: number | null;
    heapSizeLimit: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  hostRendererMemory: {
    privateBytes: number;
    sharedBytes: number;
  } | null;
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
      owners?: Array<{
        workspaceId: string;
        taskId?: string;
        taskTitle?: string;
        active: boolean;
      }>;
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
    memoryBudgetKB?: number;
    resourceEvents?: Array<{
      workspaceId: string;
      lensSessionId: string;
      kind: "released" | "reopened";
      at: number;
    }>;
    guests: Array<{
      workspaceId: string;
      lensSessionId: string;
      pid: number | null;
      visible: boolean;
      managedByMcp: boolean;
      url: string;
      sleeping?: boolean;
      keptActive?: boolean;
      protectionReasons?: string[];
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
  systemMemory: { totalKB: number; freeKB: number } | null;
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
  get Browser() { return i18n.t("workspace:resourcesPopover.main"); },
  get Tab() { return i18n.t("workspace:resourcesPopover.renderer"); },
  GPU: "GPU",
  get Utility() { return i18n.t("workspace:resourcesPopover.utility"); },
  get Zygote() { return i18n.t("workspace:resourcesPopover.zygote"); },
};

const processRoleLabel: Record<ProcessMetric["role"], string> = {
  get main() { return i18n.t("workspace:resourcesPopover.main"); },
  get "host-renderer"() { return i18n.t("workspace:resourcesPopover.appRenderer"); },
  "lens-guest": "Lens guest",
  gpu: "GPU",
  get utility() { return i18n.t("workspace:resourcesPopover.utility"); },
  get other() { return i18n.t("workspace:resourcesPopover.other"); },
};

/** Tone per Electron process type for the pills. */
const processColor: Record<string, StyleXValue> = {
  Browser: processTypeStyles.Browser,
  Tab: processTypeStyles.Tab,
  GPU: processTypeStyles.GPU,
  Utility: processTypeStyles.Utility,
};

export function MemoryUsagePopover({
  collapsed,
  variant = "sidebar",
  barLabelXstyle,
}: {
  collapsed?: boolean;
  /** "bar" renders a compact inline trigger for the bottom status bar. */
  variant?: "sidebar" | "bar";
  /** When the bar trigger's label shows; the status bar's shrink order decides. */
  barLabelXstyle?: StyleXValue;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const isBar = variant === "bar";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"usage" | "diagnostics">("usage");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [rendererMemory, setRendererMemory] =
    useState<RendererMemoryMetrics | null>(null);
  const [recentMetrics, setRecentMetrics] =
    useState<ResourceMetricSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [storageReport, setStorageReport] =
    useState<StorageCleanupReport | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const samplesRef = useRef<ResourceMetricSample[]>([]);
  /**
   * A dialog opened with the mouse must not hand its trigger a keyboard focus
   * ring on the way out. Escape *is* keyboard input, so when focus returns to
   * the trigger the browser matches `:focus-visible` and paints a ring around a
   * button nobody tabbed to — it then sits there until the next click. Focus
   * still returns to the trigger; only the ring is withheld, and only until the
   * control is left or the keyboard is actually used on it.
   */
  const openedByPointerRef = useRef(false);
  const [ringSuppressed, setRingSuppressed] = useState(false);

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
        const renderer =
          rendererResult.status === "fulfilled" ? rendererResult.value : null;
        const rendererHeapUsedKB = renderer?.heap.usedHeapSize ?? null;
        samplesRef.current = appendResourceMetricSample(samplesRef.current, {
          sampledAt: Date.now(),
          rendererCpuPercent,
          gpuCpuPercent,
          rendererHeapUsedKB,
          totalCpuPercent: appResult.value.processes.reduce(
            (sum, process) => sum + process.cpu.percentCPUUsage,
            0,
          ),
          totalFootprintKB: appFootprintKB({
            processes: appResult.value.processes,
            hostProcesses: hostServiceProcesses(appResult.value.hostService),
            mainPrivateBytes: appResult.value.mainProcess.privateBytes,
            hostRendererPrivateBytes:
              appResult.value.hostRendererMemory?.privateBytes ??
              (typeof renderer?.process.private === "number"
                ? renderer.process.private * 1024
                : null),
          }),
        });
        setRecentMetrics(summarizeResourceMetricSamples(samplesRef.current));
      }
    } catch {
      // silently ignore — app metrics may be unavailable in dev/web mode
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStorageReport = useCallback(async () => {
    try {
      const response = await window.api?.storage?.getCleanupReport?.();
      if (response?.ok && response.report) {
        setStorageReport(response.report);
      }
    } catch {
      // Storage report is best-effort; the popover stays usable without it.
    }
  }, []);

  const runStorageCleanup = useCallback(
    async (mode: "reclaim" | "clear-all-caches") => {
      if (storageBusy) return;
      setStorageBusy(true);
      setStorageMessage(null);
      try {
        const response = await window.api?.storage?.runCleanup?.(
          mode === "reclaim"
            ? {
                deleteOrphanedPartitions: true,
                clearLensCaches: "oversized",
                deleteStaleDatabaseFiles: true,
              }
            : { clearLensCaches: "all" },
        );
        if (response?.ok && response.result) {
          setStorageMessage(
            response.result.errors.length > 0
              ? `Reclaimed ${formatBytes(response.result.reclaimedBytes)} with ${response.result.errors.length} error(s)`
              : `Reclaimed ${formatBytes(response.result.reclaimedBytes)}`,
          );
        } else {
          setStorageMessage(response?.error ?? "Clean-up unavailable");
        }
      } catch (error) {
        setStorageMessage(String(error));
      } finally {
        setStorageBusy(false);
        void fetchStorageReport();
      }
    },
    [storageBusy, fetchStorageReport],
  );

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

  // Working-set (RSS) figures count pages the allocator has already released
  // but the kernel has not reclaimed yet, so after a burst they can read
  // several GB above the real footprint. Where a private footprint is
  // available (main, host renderer) substitute it into the headline total.
  const mainPrivateBytes = metrics?.mainProcess.privateBytes ?? null;
  const hostRendererPrivateBytes =
    metrics?.hostRendererMemory?.privateBytes ??
    (typeof rendererMemory?.process.private === "number"
      ? rendererMemory.process.private * 1024
      : null);
  const hostProcesses = hostServiceProcesses(metrics?.hostService ?? null);
  const totalWorkingSetKB = metrics
    ? appWorkingSetKB({ processes: metrics.processes, hostProcesses })
    : 0;
  const totalFootprintKB = metrics
    ? appFootprintKB({
        processes: metrics.processes,
        hostProcesses,
        mainPrivateBytes,
        hostRendererPrivateBytes,
      })
    : 0;
  const totalCpu =
    metrics?.processes.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0) ?? 0;
  const latestWorkspaceSwitch = getLatestWorkspaceSwitchPerformance();
  const lensWorkingSetKB =
    metrics?.processes
      .filter((process) => process.role === "lens-guest")
      .reduce((sum, process) => sum + process.memory.workingSetSizeKB, 0) ?? 0;
  /**
   * The budget governs *hidden* guests only — a visible tab is never evicted —
   * so charging visible pages against it would report a permanent overrun.
   */
  const hiddenLensPids = new Set(
    metrics?.lens.guests
      .filter((guest) => !guest.visible && guest.pid !== null)
      .map((guest) => guest.pid) ?? [],
  );
  const hiddenLensWorkingSetKB =
    metrics?.processes
      .filter((process) => hiddenLensPids.has(process.pid))
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
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && openedByPointerRef.current) {
            setRingSuppressed(true);
          }
          setOpen(nextOpen);
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={<span className={sx(resourceStyles.tooltipAnchor)} />}
          >
            <DialogTrigger
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
                    ringSuppressed && resourceStyles.triggerRingSuppressed,
                  ]}
                  aria-label={tI18n("workspace:resourcesPopover.resourceManager")}
                  onPointerDown={() => {
                    openedByPointerRef.current = true;
                  }}
                  onKeyDown={() => {
                    openedByPointerRef.current = false;
                    setRingSuppressed(false);
                  }}
                  onBlur={() => setRingSuppressed(false)}
                />
              }
            >
              <Activity className={sx(resourceStyles.triggerIcon)} />
              {isBar ? <span className={sx(barLabelXstyle)}>{tI18n("workspace:resourcesPopover.resourceManager")}</span> : null}
            </DialogTrigger>
          </TooltipTrigger>
          {!open ? (
            <TooltipContent
              side={collapsed ? "right" : isBar ? "top" : "bottom"}
            >
              {tI18n("workspace:resourcesPopover.resourceManager")}</TooltipContent>
          ) : null}
        </Tooltip>

        <DialogContent
          showCloseButton={false}
          xstyle={[managerStyles.dialog, managerStyles.resourceDialog]}
        >
          {/* Header */}
          <div className={sx(resourceStyles.header)}>
            <div className={sx(resourceStyles.headerTitleGroup)}>
              <Activity className={sx(resourceStyles.headerIcon)} />
              <DialogTitle className={sx(resourceStyles.headerTitle)}>
                {tI18n("workspace:resourcesPopover.resourceManager")}</DialogTitle>
            </div>
            <div className={sx(managerStyles.actions)}>
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="refresh-metrics"
                aria-label={i18n.t("workspace:resourcesPopover.accessibility.refreshMetrics")}
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
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tI18n("workspace:resourcesPopover.closeResourceManager")}
                  />
                }
              >
                <X className={sx(resourceStyles.refreshIcon)} />
              </DialogClose>
            </div>
          </div>

          {/*
            The dashboard sits above the view switcher rather than inside a
            tab: the headline reading is the same question in both views, and
            duplicating it per tab would make the two views disagree whenever
            one of them was not the one being watched.
          */}
          {metrics ? (
            <ResourceDashboard
              metrics={metrics}
              rendererMemory={rendererMemory}
              recent={recentMetrics}
              totalFootprintKB={totalFootprintKB}
              totalWorkingSetKB={totalWorkingSetKB}
              totalCpuPercent={totalCpu}
              hiddenLensWorkingSetKB={hiddenLensWorkingSetKB}
              hostProcessCount={hostProcesses.length}
            />
          ) : null}

          <div className={sx(managerStyles.toolbar)}>
            <div
              className={sx(managerStyles.segmented)}
              role="group"
              aria-label={tI18n("workspace:resourcesPopover.resourceView")}
            >
              <Button
                size="sm"
                variant={view === "usage" ? "secondary" : "ghost"}
                aria-pressed={view === "usage"}
                xstyle={managerStyles.segment}
                onClick={() => setView("usage")}
              >
                {tI18n("workspace:resourcesPopover.workspacesAndProcesses")}</Button>
              <Button
                size="sm"
                variant={view === "diagnostics" ? "secondary" : "ghost"}
                aria-pressed={view === "diagnostics"}
                xstyle={managerStyles.segment}
                onClick={() => setView("diagnostics")}
              >
                {tI18n("workspace:resourcesPopover.diagnosticsAndStorage")}</Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setCleanupOpen(true);
              }}
            >
              <Trash2 className={sx(resourceStyles.refreshIcon)} />
              {tI18n("workspace:resourcesPopover.cleanUpWorkspaces")}</Button>
          </div>
          {/* Content */}
          <div className={sx(resourceStyles.body)}>
            {!metrics ? (
              <div className={sx(resourceStyles.emptyState)}>
                <Activity className={sx(resourceStyles.emptyIcon)} />
                <p className={sx(resourceStyles.emptyCopy)}>
                  {loading ? tI18n("workspace:resourcesPopover.loadingMetrics") : tI18n("workspace:resourcesPopover.metricsUnavailable")}
                </p>
              </div>
            ) : (
              <div className={sx(resourceStyles.stack)}>
                <div hidden={view !== "usage"}>
                  <ResourceManagerOverview
                    metrics={metrics}
                    refresh={fetchMetrics}
                  />
                </div>
                <section
                  hidden={view !== "diagnostics"}
                  aria-label={tI18n("workspace:resourcesPopover.memoryDiagnosticsAndStorage")}
                >
                  <div className={sx(resourceStyles.stack)}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchStorageReport()}
                    >
                      <Search className={sx(resourceStyles.refreshIcon)} />
                      {tI18n("workspace:resourcesPopover.scanAppStorage")}</Button>
                    <div className={sx(resourceStyles.detailGrid)}>
                      <span className={sx(resourceStyles.detailKey)}>
                        {tI18n("workspace:resourcesPopover.mainProcess")}</span>
                      <span className={sx(resourceStyles.detailValue)}>
                        {mainPrivateBytes !== null
                          ? tI18n("workspace:resourcesPopover.valueRssValue", { value1: formatBytes(mainPrivateBytes), value2: formatBytes(metrics.mainProcess.rss) })
                          : tI18n("workspace:resourcesPopover.rssValue", { value1: formatBytes(metrics.mainProcess.rss) })}
                      </span>
                      <span className={sx(resourceStyles.detailKey)}>
                        {tI18n("workspace:resourcesPopover.appFootprint")}</span>
                      <span className={sx(resourceStyles.detailValue)}>
                        {totalFootprintKB !== totalWorkingSetKB
                          ? tI18n("workspace:resourcesPopover.valueRssValue", { value1: formatKB(totalFootprintKB), value2: formatKB(totalWorkingSetKB) })
                          : formatKB(totalFootprintKB)}
                      </span>
                      {rendererMemory ? (
                        <>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.rendererMemory")}</span>
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
                            {tI18n("workspace:resourcesPopover.blinkAllocated")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatKB(rendererMemory.blink.allocated)}
                          </span>
                        </>
                      ) : null}
                      <span className={sx(resourceStyles.detailKey)}>
                        {tI18n("workspace:resourcesPopover.rendererStalls")}</span>
                      <span
                        className={sx(
                          resourceStyles.detailValuePlain,
                          metrics.renderer.currentlyUnresponsive
                            ? resourceStyles.detailValueDanger
                            : resourceStyles.detailValueMuted,
                        )}
                      >
                        {metrics.renderer.unresponsiveEvents}
                        {metrics.renderer.currentlyUnresponsive
                          ? tI18n("workspace:resourcesPopover.active")
                          : ""}
                      </span>
                      <span className={sx(resourceStyles.detailKey)}>
                        {tI18n("workspace:resourcesPopover.rendererExits")}</span>
                      <span
                        className={sx(
                          resourceStyles.detailValue,
                          resourceStyles.truncated,
                        )}
                      >
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
                            {tI18n("workspace:resourcesPopover.recentPressure")}</span>
                          <span className={sx(resourceStyles.groupMeta)}>
          {tI18n("workspace:resourcesPopover.sampleWindow", { seconds: Math.max(1, Math.round(recentMetrics.durationMs / 1_000)), count: recentMetrics.sampleCount })}
        </span>
                        </div>
                        <div className={sx(resourceStyles.detailGrid)}>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.appRendererCpu")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {tI18n("workspace:resourcesPopover.cpuSummary", { average: formatNumber(recentMetrics.rendererCpuAverage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), peak: formatNumber(recentMetrics.rendererCpuPeak, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.gpuCpu")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {tI18n("workspace:resourcesPopover.cpuSummary", { average: formatNumber(recentMetrics.gpuCpuAverage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), peak: formatNumber(recentMetrics.gpuCpuPeak, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>
                          {recentMetrics.rendererHeapDeltaKB != null ? (
                            <>
                              <span className={sx(resourceStyles.detailKey)}>
                                {tI18n("workspace:resourcesPopover.rendererHeapChange")}</span>
                              <span className={sx(resourceStyles.detailValue)}>
                                {formatSignedKB(
                                  recentMetrics.rendererHeapDeltaKB,
                                )}
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
                            {tI18n("workspace:resourcesPopover.hostService")}</span>
                          <span className={sx(resourceStyles.groupMeta)}>
                            {formatBytes(metrics.hostService.memory.rss)} {tI18n("workspace:resourcesPopover.rss")}</span>
                        </div>
                        <div className={sx(resourceStyles.detailGrid)}>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.allDescendants")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {metrics.hostService.childProcesses.length} ·{" "}
                            {formatBytes(childProcessRss)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.providerTreesSubset")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {providerChildProcesses.length} ·{" "}
                            {formatBytes(providerChildRss)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.ptySessions")}</span>
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
                          {tI18n("workspace:resourcesPopover.lensResources")}</span>
                        <span className={sx(resourceStyles.groupMeta)}>
          {tI18n("workspace:resourcesPopover.lensVisibility", { sessions: metrics.lens.sessions, visible: metrics.lens.visibleSessions })}
        </span>
                      </div>
                      <div className={sx(resourceStyles.detailGrid)}>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.diagnostics")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
          {tI18n("workspace:resourcesPopover.activeSessions", { count: metrics.lens.diagnosticsSessions })}
        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.mcpSessions")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {metrics.lens.managedByMcpSessions}
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.hiddenGuests")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {metrics.lens.sessions - metrics.lens.visibleSessions}
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.guestWorkingSet")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {formatKB(lensWorkingSetKB)}
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.bufferedLogs")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {metrics.lens.consoleEntries} C ·{" "}
                          {metrics.lens.networkEntries} N ·{" "}
                          {metrics.lens.downloadEntries} D
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.authPopups")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {metrics.lens.authPopups}
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.cdpActiveClosing")}</span>
                        <span className={sx(resourceStyles.detailValue)}>
                          {metrics.lens.cdpControllers} /{" "}
                          {metrics.lens.cdpClosingControllers}
                        </span>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.cdpInFlightTimeouts")}</span>
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
                          {tI18n("workspace:resourcesPopover.persistence")}</div>
                        <div className={sx(resourceStyles.detailGrid)}>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.sqliteUsed")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatBytes(metrics.persistence.usedBytes)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.fileReclaimable")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatBytes(metrics.persistence.fileBytes)} /{" "}
                            {formatBytes(
                              metrics.persistence.freePages *
                                metrics.persistence.pageSizeBytes,
                            )}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.incrementalVacuum")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {metrics.persistence.autoVacuum === 2
                              ? tI18n("workspace:resourcesPopover.on")
                              : tI18n("workspace:resourcesPopover.pending")}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {storageReport ? (
                      <div className={sx(resourceStyles.group)}>
                        <div className={sx(resourceStyles.groupHead)}>
                          <span className={sx(resourceStyles.groupTitle)}>
                            {tI18n("workspace:resourcesPopover.storage")}</span>
                          <span className={sx(resourceStyles.groupMeta)}>
                            {formatBytes(
                              storageReport.totals.partitionBytes +
                                storageReport.totals.staleDatabaseBytes,
                            )}{" "}
                            {tI18n("workspace:resourcesPopover.onDisk")}</span>
                        </div>
                        <div className={sx(resourceStyles.detailGrid)}>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.lensPartitions")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {storageReport.partitions.length} ·{" "}
                            {formatBytes(storageReport.totals.partitionBytes)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.orphaned")}</span>
                          <span
                            className={sx(
                              storageReport.totals.orphanedPartitionCount > 0
                                ? resourceStyles.detailValueWarning
                                : resourceStyles.detailValue,
                            )}
                          >
                            {storageReport.totals.orphanedPartitionCount} ·{" "}
                            {formatBytes(
                              storageReport.totals.orphanedPartitionBytes,
                            )}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.oversizedCaches")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {storageReport.totals.oversizedCacheCount} ·{" "}
                            {formatBytes(
                              storageReport.totals.oversizedCacheBytes,
                            )}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.staleDbFiles")}</span>
                          <span
                            className={sx(
                              storageReport.staleDatabaseFiles.length > 0
                                ? resourceStyles.detailValueWarning
                                : resourceStyles.detailValue,
                            )}
                          >
                            {storageReport.staleDatabaseFiles.length} ·{" "}
                            {formatBytes(
                              storageReport.totals.staleDatabaseBytes,
                            )}
                          </span>
                        </div>
                        <div className={sx(resourceStyles.storageActions)}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={storageBusy}
                            onClick={() => void runStorageCleanup("reclaim")}
                          >
                            <Trash2
                              className={sx(resourceStyles.refreshIcon)}
                            />
                            {storageBusy ? tI18n("workspace:resourcesPopover.cleaning") : tI18n("workspace:resourcesPopover.cleanUp")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={storageBusy}
                            onClick={() =>
                              void runStorageCleanup("clear-all-caches")
                            }
                          >
                            {tI18n("workspace:resourcesPopover.clearLensCaches")}</Button>
                        </div>
                        {storageMessage ? (
                          <div className={sx(resourceStyles.storageMessage)}>
                            {storageMessage}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {latestWorkspaceSwitch ? (
                      <div className={sx(resourceStyles.group)}>
                        <div className={sx(resourceStyles.groupHead)}>
                          <span className={sx(resourceStyles.groupTitle)}>
                            {tI18n("workspace:resourcesPopover.lastWorkspaceSwitch")}</span>
                          <span className={sx(resourceStyles.groupMeta)}>
                            {latestWorkspaceSwitch.cacheHit
                              ? tI18n("workspace:resourcesPopover.cache")
                              : tI18n("workspace:resourcesPopover.storage2")}
                          </span>
                        </div>
                        <div className={sx(resourceStyles.detailGrid)}>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.interactive")}</span>
                          <span
                            className={sx(resourceStyles.detailValueStrong)}
                          >
                            {formatDuration(latestWorkspaceSwitch.totalMs)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.outgoingSave")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatDuration(latestWorkspaceSwitch.flushMs)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.shellLoad")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatDuration(latestWorkspaceSwitch.shellMs)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.filesReady")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatDuration(latestWorkspaceSwitch.filesMs)}
                          </span>
                          <span className={sx(resourceStyles.detailKey)}>
                            {tI18n("workspace:resourcesPopover.messagesReady")}</span>
                          <span className={sx(resourceStyles.detailValue)}>
                            {formatDuration(latestWorkspaceSwitch.messagesMs)}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {/* Process breakdown */}
                    <div>
                      <div className={sx(resourceStyles.processHead)}>
                        <HardDrive
                          className={sx(resourceStyles.processHeadIcon)}
                        />
                        <span className={sx(resourceStyles.groupTitle)}>
          {tI18n("workspace:resourcesPopover.processCount", { count: metrics.processes.length })}
        </span>
                      </div>
                      <div className={sx(resourceStyles.processList)}>
                        {metrics.processes
                          .slice()
                          .sort(
                            (a, b) =>
                              b.memory.workingSetSizeKB -
                              a.memory.workingSetSizeKB,
                          )
                          .map((proc) => (
                            <div
                              key={proc.pid}
                              className={sx(
                                resourceStyles.processRow,
                                transition.colors,
                              )}
                            >
                              <span
                                className={sx(
                                  resourceStyles.processDot,
                                  processColor[proc.type] ??
                                    processTypeStyles.other,
                                )}
                              />
                              <span className={sx(resourceStyles.processName)}>
                                {proc.role === "other"
                                  ? (processLabel[proc.type] ?? proc.type)
                                  : processRoleLabel[proc.role]}
                              </span>
                              <span
                                className={sx(resourceStyles.processMemory)}
                              >
                                {formatKB(proc.memory.workingSetSizeKB)}
                              </span>
                              {proc.cpu.percentCPUUsage > 0.1 && (
                                <span className={sx(resourceStyles.processCpu)}>
                                  {formatPercent(proc.cpu.percentCPUUsage / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* External / ArrayBuffers detail */}
                    <div className={sx(resourceStyles.group)}>
                      <div className={sx(resourceStyles.externalRow)}>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.external")}</span>
                        <span className={sx(resourceStyles.externalValue)}>
                          {formatBytes(metrics.mainProcess.external)}
                        </span>
                      </div>
                      <div className={sx(resourceStyles.externalRowSpaced)}>
                        <span className={sx(resourceStyles.detailKey)}>
                          {tI18n("workspace:resourcesPopover.arraybuffers")}</span>
                        <span className={sx(resourceStyles.externalValue)}>
                          {formatBytes(metrics.mainProcess.arrayBuffers)}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <WorkspaceCleanupDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
      />
    </>
  );
}
