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
import { cn } from "@/lib/utils";

interface ProcessMetric {
  pid: number;
  type: string;
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
  uptimeSeconds: number;
}

/** Map Electron process type labels to friendlier display names. */
const processLabel: Record<string, string> = {
  Browser: "Main",
  Tab: "Renderer",
  GPU: "GPU",
  Utility: "Utility",
  Zygote: "Zygote",
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

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

export function MemoryUsagePopover({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const result = await window.api?.metrics?.getAppMetrics?.();
      if (result) setMetrics(result);
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
    metrics?.processes.reduce(
      (sum, p) => sum + p.memory.workingSetSizeKB,
      0,
    ) ?? 0;
  const totalCpu =
    metrics?.processes.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0) ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  collapsed ? "h-10 w-10" : "h-9 w-9",
                )}
                aria-label="memory-usage"
              >
                <Activity className="size-4" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        {!open ? (
          <TooltipContent side={collapsed ? "right" : "bottom"}>
            Memory Usage
          </TooltipContent>
        ) : null}
      </Tooltip>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        className="w-80 gap-0 overflow-hidden border border-border/80 bg-card/96 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
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
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
            />
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
                  <div className="text-[10px] text-muted-foreground">Total</div>
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
                detail={`${formatBytes(metrics.mainProcess.heapUsed)} / ${formatBytes(metrics.mainProcess.heapTotal)}`}
              />

              {/* RSS bar */}
              <UsageBar
                label="RSS (Main)"
                used={metrics.mainProcess.rss}
                total={metrics.mainProcess.rss * 1.25}
                detail={formatBytes(metrics.mainProcess.rss)}
              />

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
                          {processLabel[proc.type] ?? proc.type}
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
                  <span className="text-muted-foreground/70">
                    ArrayBuffers
                  </span>
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
