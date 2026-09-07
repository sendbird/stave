import { app, ipcMain } from "electron";
import {
  getBrowserResourceMetrics,
  type BrowserResourceMetrics,
} from "../browser/browser-manager";
import {
  getRendererHealthMetrics,
  type RendererHealthMetrics,
} from "../runtime-health-metrics";
import { getPersistenceStorageMetrics } from "../state";
import type { SqliteStorageMetrics } from "../../persistence/sqlite-maintenance-policy";
import { getMainWindow } from "../window";
import { invokeHostService } from "../host-service-client";
import type { HostServiceResourceMetrics } from "../../host-service/protocol";

export type AppProcessRole =
  | "main"
  | "host-renderer"
  | "lens-guest"
  | "gpu"
  | "utility"
  | "other";

export interface AppMetricsResult {
  processes: Array<{
    pid: number;
    type: string;
    role: AppProcessRole;
    memory: {
      workingSetSizeKB: number;
      peakWorkingSetSizeKB: number;
    };
    cpu: {
      percentCPUUsage: number;
    };
  }>;
  mainProcess: {
    rss: number;
    /**
     * Private (non-shared) footprint in bytes. Unlike `rss`, this excludes
     * pages the allocator has already released to the OS but that stay
     * counted as resident until the kernel reclaims them, so it tracks what
     * the process actually costs. `null` when the platform cannot report it.
     */
    privateBytes: number | null;
    sharedBytes: number | null;
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
  hostService: HostServiceResourceMetrics | null;
  lens: BrowserResourceMetrics;
  renderer: RendererHealthMetrics;
  persistence: SqliteStorageMetrics | null;
  uptimeSeconds: number;
}

export function registerMetricsHandlers() {
  ipcMain.handle(
    "metrics:get-app-metrics",
    async (): Promise<AppMetricsResult> => {
      const processMetrics = app.getAppMetrics();
      const mainMemory = process.memoryUsage();
      const lens = getBrowserResourceMetrics();
      const lensGuestPids = new Set(
        lens.guests.flatMap((guest) =>
          guest.pid === null ? [] : [guest.pid],
        ),
      );
      const mainWindow = getMainWindow();
      let hostRendererPid: number | null = null;
      try {
        const rendererPid = mainWindow?.webContents.getOSProcessId() ?? 0;
        hostRendererPid = rendererPid > 0 ? rendererPid : null;
      } catch {
        // A renderer that exited during collection has no current process id.
      }
      const [hostService, mainMemoryInfo] = await Promise.all([
        invokeHostService("service.get-resource-metrics", undefined, {
          timeoutMs: 1_500,
        }).catch(() => null),
        process.getProcessMemoryInfo().catch(() => null),
      ]);
      // Electron reports ProcessMemoryInfo in kilobytes.
      const toBytes = (kb: number | undefined) =>
        typeof kb === "number" && Number.isFinite(kb) ? kb * 1024 : null;
      const mainPrivateBytes = toBytes(mainMemoryInfo?.private);
      const mainSharedBytes = toBytes(mainMemoryInfo?.shared);

      const resolveRole = (
        metric: (typeof processMetrics)[number],
      ): AppProcessRole => {
        if (metric.pid === process.pid || metric.type === "Browser") {
          return "main";
        }
        if (metric.pid === hostRendererPid) {
          return "host-renderer";
        }
        if (lensGuestPids.has(metric.pid)) {
          return "lens-guest";
        }
        if (metric.type === "GPU") {
          return "gpu";
        }
        if (metric.type === "Utility") {
          return "utility";
        }
        return "other";
      };

      return {
        processes: processMetrics.map((p) => ({
          pid: p.pid,
          type: p.type,
          role: resolveRole(p),
          memory: {
            workingSetSizeKB: p.memory.workingSetSize,
            peakWorkingSetSizeKB: p.memory.peakWorkingSetSize,
          },
          cpu: {
            percentCPUUsage: p.cpu.percentCPUUsage,
          },
        })),
        mainProcess: {
          rss: mainMemory.rss,
          privateBytes: mainPrivateBytes,
          sharedBytes: mainSharedBytes,
          heapTotal: mainMemory.heapTotal,
          heapUsed: mainMemory.heapUsed,
          external: mainMemory.external,
          arrayBuffers: mainMemory.arrayBuffers,
        },
        // Filled by the preload bridge from the renderer process. Electron 41
        // no longer exposes getProcessMemoryInfo() on WebContents.
        hostRendererMemory: null,
        hostRendererPid,
        hostService,
        lens,
        renderer: getRendererHealthMetrics(),
        persistence: getPersistenceStorageMetrics(),
        uptimeSeconds: process.uptime(),
      };
    },
  );
}
