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
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
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
      const hostService = await invokeHostService(
        "service.get-resource-metrics",
        undefined,
        { timeoutMs: 1_500 },
      ).catch(() => null);

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
          heapTotal: mainMemory.heapTotal,
          heapUsed: mainMemory.heapUsed,
          external: mainMemory.external,
          arrayBuffers: mainMemory.arrayBuffers,
        },
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
