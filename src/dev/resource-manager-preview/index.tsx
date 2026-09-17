import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  MemoryUsagePopover,
  type AppMetrics,
} from "@/components/layout/ResourcesPopover";
import { useAppStore } from "@/store/app.store";
import { buildWorkspaceSessionState } from "@/store/workspace-session-state";
import { applyThemeClass } from "@/lib/themes/apply";

const rootPath = "/tmp/resource-preview";
const ids = ["base", "current", "settled", "dirty", "linked", "unavailable"];
const date = "2026-08-01T00:00:00.000Z";

/**
 * Pressure scenarios. The dashboard's colored signals only appear once a real
 * limit is close, and a healthy development machine never gets there, so the
 * fixture has to be able to stage the warning and critical readings the design
 * exists for.
 */
type Scenario = "normal" | "elevated" | "high";
const scenarios: Array<{ id: Scenario; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "elevated", label: "Elevated" },
  { id: "high", label: "High pressure" },
];
const scenarioScale: Record<Scenario, number> = {
  normal: 1,
  elevated: 3.4,
  high: 6.4,
};
const scenarioCpu: Record<Scenario, number> = {
  normal: 0.2,
  elevated: 9,
  high: 24,
};

const process = (
  pid: number,
  role: AppMetrics["processes"][number]["role"],
  mb: number,
) => ({
  pid,
  type: role === "main" ? "Browser" : "Tab",
  role,
  memory: { workingSetSizeKB: mb * 1024, peakWorkingSetSizeKB: mb * 1024 },
  cpu: { percentCPUUsage: 0.2 },
});
const metrics: AppMetrics = {
  processes: [
    process(101, "main", 220),
    process(102, "host-renderer", 620),
    process(103, "lens-guest", 180),
    process(104, "lens-guest", 74),
  ],
  mainProcess: {
    rss: 220 * 1024 ** 2,
    privateBytes: null,
    sharedBytes: null,
    heapSizeLimit: 4 * 1024 ** 3,
    heapTotal: 100e6,
    heapUsed: 70e6,
    external: 0,
    arrayBuffers: 0,
  },
  hostRendererMemory: null,
  hostRendererPid: 102,
  hostService: {
    pid: 105,
    memory: {
      rss: 60e6,
      heapTotal: 30e6,
      heapUsed: 20e6,
      external: 0,
      arrayBuffers: 0,
    },
    terminalSessions: 0,
    ptyPids: [],
    childProcesses: [
      {
        pid: 106,
        parentPid: 105,
        rssBytes: 820 * 1024 ** 2,
        kind: "provider",
        owners: [
          {
            workspaceId: "current",
            taskId: "task-1",
            taskTitle: "Investigate memory growth",
            active: true,
          },
        ],
      },
      {
        pid: 107,
        parentPid: 105,
        rssBytes: 430 * 1024 ** 2,
        kind: "provider",
        owners: [
          {
            workspaceId: "settled",
            taskId: "task-2",
            taskTitle: "Run project checks",
            active: false,
          },
          {
            workspaceId: "current",
            taskId: "task-1",
            taskTitle: "Investigate memory growth",
            active: true,
          },
        ],
      },
    ],
  },
  lens: {
    sessions: 2,
    visibleSessions: 1,
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
    resourceEvents: [
      {
        workspaceId: "settled",
        lensSessionId: "default",
        kind: "released",
        at: Date.now() - 60_000,
      },
    ],
    guests: [
      {
        workspaceId: "settled",
        lensSessionId: "default",
        pid: 103,
        visible: false,
        managedByMcp: false,
        url: "http://localhost:5173/dashboard",
      },
      {
        workspaceId: "current",
        lensSessionId: "default",
        pid: 104,
        visible: true,
        managedByMcp: false,
        url: "http://localhost:6006/components",
      },
    ],
  },
  renderer: {
    currentlyUnresponsive: false,
    unresponsiveEvents: 0,
    renderProcessGoneEvents: 0,
  },
  persistence: null,
  systemMemory: { totalKB: 32 * 1024 * 1024, freeKB: 6 * 1024 * 1024 },
  uptimeSeconds: 3600,
};

/** V8 caps the renderer heap, so this gauge has a denominator that is real. */
const rendererHeapLimitKB = 4 * 1024 * 1024;
const rendererHeapUsedKB: Record<Scenario, number> = {
  normal: 780 * 1024,
  elevated: 2.7 * 1024 * 1024,
  high: 3.7 * 1024 * 1024,
};

let scenario: Scenario = "normal";
let tick = 0;

/** Scales the fixture to the active scenario and jitters it, so the trend
 *  strips have something to draw between polls. */
function snapshot(): AppMetrics {
  tick += 1;
  const scale = scenarioScale[scenario];
  const drift = 1 + Math.sin(tick / 2.5) * 0.03 + tick * 0.002;
  return {
    ...metrics,
    processes: metrics.processes.map((entry) => ({
      ...entry,
      memory: {
        workingSetSizeKB: Math.round(
          entry.memory.workingSetSizeKB *
            // Lens guests grow more slowly than the provider trees, so the
            // three scenarios land on three different worst offenders.
            (entry.role === "lens-guest" ? 1 + (scale - 1) * 0.45 : scale) *
            drift,
        ),
        peakWorkingSetSizeKB: entry.memory.peakWorkingSetSizeKB * scale,
      },
      cpu: {
        percentCPUUsage:
          scenarioCpu[scenario] * (entry.role === "host-renderer" ? 1 : 0.35),
      },
    })),
    hostService: metrics.hostService && {
      ...metrics.hostService,
      childProcesses: metrics.hostService.childProcesses.map((child) => ({
        ...child,
        rssBytes: Math.round(child.rssBytes * scale * drift),
      })),
    },
    mainProcess: {
      ...metrics.mainProcess,
      heapUsed:
        metrics.mainProcess.heapTotal *
        (scenario === "high" ? 0.93 : scenario === "elevated" ? 0.72 : 0.42),
    },
    renderer: {
      currentlyUnresponsive: false,
      unresponsiveEvents: scenario === "high" ? 3 : 0,
      renderProcessGoneEvents: scenario === "high" ? 1 : 0,
    },
    lens: { ...metrics.lens, memoryBudgetKB: 512 * 1024 },
  };
}

function installFixture() {
  const paths = Object.fromEntries(
    ids.map((id) => [id, id === "base" ? rootPath : `${rootPath}/${id}`]),
  );
  useAppStore.setState({
    projectPath: rootPath,
    projectName: "Example project",
    activeWorkspaceId: "current",
    workspaces: ids.map((id) => ({
      id,
      name:
        id === "settled"
          ? "fix/completed-workspace-with-a-long-branch-name"
          : id,
      updatedAt: date,
    })),
    workspacePathById: paths,
    workspaceBranchById: Object.fromEntries(ids.map((id) => [id, `fix/${id}`])),
    workspaceDefaultById: { base: true },
    workspaceLastActiveAtById: Object.fromEntries(ids.map((id) => [id, date])),
    recentProjects: [
      {
        projectPath: rootPath,
        projectName: "Example project",
        lastOpenedAt: date,
        defaultBranch: "main",
        workspaces: [],
        activeWorkspaceId: "current",
        workspacePathById: paths,
        workspaceDefaultById: { base: true },
        workspaceBranchById: {},
        linkedWorkspacePaths: [paths.linked!],
      },
    ],
    activeTurnIdsByTask: {},
    taskWorkspaceIdById: {},
    notifications: [],
    closeWorkspace: async ({ workspaceId }) => {
      useAppStore.setState((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== workspaceId),
      }));
    },
  });
  const shell = buildWorkspaceSessionState({ snapshot: null });
  const api = {
    ...window.api,
    metrics: {
      getAppMetrics: async () => snapshot(),
      getRendererMemory: async () => ({
        heap: {
          usedHeapSize: rendererHeapUsedKB[scenario],
          totalHeapSize: rendererHeapUsedKB[scenario] * 1.2,
          heapSizeLimit: rendererHeapLimitKB,
        },
        process: { private: 620 * 1024, shared: 40 * 1024 },
        blink: { allocated: 180 * 1024, marked: 120 * 1024, total: 200 * 1024 },
      }),
    },
    lens: {
      releaseWorkspaceGuests: async ({
        workspaceId,
      }: {
        workspaceId: string;
      }) => {
        const victims = metrics.lens.guests.filter(
          (g) => g.workspaceId === workspaceId && !g.visible,
        );
        metrics.lens.guests = metrics.lens.guests.filter(
          (g) => !victims.includes(g),
        );
        metrics.processes = metrics.processes.filter(
          (p) => !victims.some((g) => g.pid === p.pid),
        );
        return { ok: true, released: victims.length };
      },
    },
    scripts: { getStatus: async () => ({ ok: true, statuses: [] }) },
    terminal: {
      getSlotState: async () => ({ state: "idle" }),
      runCommand: async ({
        cwd,
        command,
      }: {
        cwd: string;
        command: string;
      }) => ({
        ok: !cwd.endsWith("unavailable"),
        code: 0,
        stderr: "",
        stdout:
          command === "du -sk ."
            ? "245760\t.\n"
            : command.startsWith("git worktree list")
              ? `worktree ${rootPath}\0\0`
              : cwd.endsWith("dirty")
                ? " M src/app.ts\n"
                : "",
      }),
    },
    persistence: {
      listWorkspaces: async () => ({ ok: true, workspaces: [] }),
      loadWorkspace: async () => ({ ok: true, workspace: null }),
      upsertWorkspace: async () => ({ ok: true }),
      loadWorkspaceShell: async () => ({ ok: true, shell }),
    },
  };
  window.api = api as unknown as typeof window.api;
}

export function ResourceManagerPreview() {
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [active, setActive] = useState<Scenario>("normal");
  useEffect(() => {
    installFixture();
    setReady(true);
  }, []);
  useEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);
  useEffect(() => {
    scenario = active;
  }, [active]);
  return (
    <main className={sx(styles.page)}>
      <h1>Resource Manager preview</h1>
      <p>Isolated UI fixture. File operations and metrics are simulated.</p>
      <div className={sx(styles.controls)}>
        <Button variant="secondary" onClick={() => setDark((value) => !value)}>
          {dark ? "Use light theme" : "Use dark theme"}
        </Button>
        {scenarios.map((entry) => (
          <Button
            key={entry.id}
            variant={active === entry.id ? "default" : "outline"}
            aria-pressed={active === entry.id}
            onClick={() => setActive(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      {ready && <MemoryUsagePopover variant="bar" />}
    </main>
  );
}
const styles = stylex.create({
  page: {
    padding: 32,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 16,
  },
  controls: { display: "flex", gap: 8, flexWrap: "wrap" },
});
