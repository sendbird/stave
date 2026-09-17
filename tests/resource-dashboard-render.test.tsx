import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceDashboard } from "@/components/layout/ResourceDashboard";
import type { AppMetrics } from "@/components/layout/ResourcesPopover";

const metrics: AppMetrics = {
  processes: [],
  mainProcess: {
    rss: 100 * 1024 ** 2,
    privateBytes: null,
    sharedBytes: null,
    heapUsed: 90 * 1024 ** 2,
    heapTotal: 100 * 1024 ** 2,
    heapSizeLimit: 4 * 1024 ** 3,
    external: 0,
    arrayBuffers: 0,
  },
  hostRendererMemory: null,
  hostRendererPid: null,
  hostService: null,
  lens: {
    sessions: 0,
    visibleSessions: 0,
    managedByMcpSessions: 0,
    diagnosticsSessions: 0,
    authPopups: 0,
    consoleEntries: 0,
    networkEntries: 0,
    downloadEntries: 0,
    cdpControllers: 0,
    cdpClosingControllers: 0,
    cdpInFlightCommands: 0,
    cdpCloseDrainTimeouts: 0,
    guests: [],
    memoryBudgetKB: 100,
  },
  renderer: {
    currentlyUnresponsive: false,
    unresponsiveEvents: 0,
    renderProcessGoneEvents: 0,
  },
  persistence: null,
  systemMemory: { totalKB: 16 * 1024 ** 2, freeKB: 8 * 1024 ** 2 },
  uptimeSeconds: 60,
};

function render(hiddenLensWorkingSetKB = 0) {
  return renderToStaticMarkup(createElement(ResourceDashboard, {
    metrics,
    rendererMemory: null,
    recent: null,
    totalFootprintKB: 100 * 1024,
    totalWorkingSetKB: 100 * 1024,
    totalCpuPercent: 5,
    hiddenLensWorkingSetKB,
    hostProcessCount: 0,
  }));
}

test("a mostly occupied allocated heap is healthy when far below the V8 limit", () => {
  const html = render();
  expect(html).toContain("Healthy");
  expect(html).toContain("90.0 MB / 4.00 GB");
  expect(html).not.toContain("High pressure");
  expect(html).toContain("Electron CPU");
});

test("an over-budget meter preserves the real percentage in text within bounded ARIA values", () => {
  const html = render(150);
  expect(html).toContain('aria-valuenow="100"');
  expect(html).not.toContain('aria-valuenow="150"');
  expect(html).toContain("150 percent, High");
});
