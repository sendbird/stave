import { app, ipcMain } from "electron";

export interface AppMetricsResult {
  processes: Array<{
    pid: number;
    type: string;
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
  uptimeSeconds: number;
}

export function registerMetricsHandlers() {
  ipcMain.handle("metrics:get-app-metrics", (): AppMetricsResult => {
    const processMetrics = app.getAppMetrics();
    const mainMemory = process.memoryUsage();

    return {
      processes: processMetrics.map((p) => ({
        pid: p.pid,
        type: p.type,
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
      uptimeSeconds: process.uptime(),
    };
  });
}
