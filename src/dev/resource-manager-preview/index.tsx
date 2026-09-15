import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { MemoryUsagePopover, type AppMetrics } from "@/components/layout/ResourcesPopover";
import { useAppStore } from "@/store/app.store";
import { buildWorkspaceSessionState } from "@/store/workspace-session-state";
import { applyThemeClass } from "@/lib/themes/apply";

const rootPath = "/tmp/resource-preview";
const ids = ["base", "current", "settled", "dirty", "linked", "unavailable"];
const date = "2026-08-01T00:00:00.000Z";
const process = (pid: number, role: AppMetrics["processes"][number]["role"], mb: number) => ({ pid, type: role === "main" ? "Browser" : "Tab", role, memory: { workingSetSizeKB: mb * 1024, peakWorkingSetSizeKB: mb * 1024 }, cpu: { percentCPUUsage: 0.2 } });
const metrics: AppMetrics = {
  processes: [process(101, "main", 220), process(102, "host-renderer", 620), process(103, "lens-guest", 1290), process(104, "lens-guest", 74)],
  mainProcess: { rss: 220 * 1024 ** 2, privateBytes: null, sharedBytes: null, heapTotal: 100e6, heapUsed: 70e6, external: 0, arrayBuffers: 0 },
  hostRendererMemory: null, hostRendererPid: 102,
  hostService: { pid: 105, memory: { rss: 60e6, heapTotal: 30e6, heapUsed: 20e6, external: 0, arrayBuffers: 0 }, terminalSessions: 0, ptyPids: [], childProcesses: [] },
  lens: { sessions: 2, visibleSessions: 1, managedByMcpSessions: 0, diagnosticsSessions: 0, authPopups: 0, consoleEntries: 0, networkEntries: 0, downloadEntries: 0, cdpControllers: 0, cdpClosingControllers: 0, cdpInFlightCommands: 0, cdpCloseDrainTimeouts: 0, guests: [
    { workspaceId: "settled", lensSessionId: "default", pid: 103, visible: false, managedByMcp: false, url: "http://localhost:5173/dashboard" },
    { workspaceId: "current", lensSessionId: "default", pid: 104, visible: true, managedByMcp: false, url: "http://localhost:6006/components" },
  ] },
  renderer: { currentlyUnresponsive: false, unresponsiveEvents: 0, renderProcessGoneEvents: 0 }, persistence: null, uptimeSeconds: 3600,
};

function installFixture() {
  const paths = Object.fromEntries(ids.map((id) => [id, id === "base" ? rootPath : `${rootPath}/${id}`]));
  useAppStore.setState({
    projectPath: rootPath, projectName: "Example project", activeWorkspaceId: "current",
    workspaces: ids.map((id) => ({ id, name: id === "settled" ? "fix/completed-workspace-with-a-long-branch-name" : id, updatedAt: date })),
    workspacePathById: paths, workspaceBranchById: Object.fromEntries(ids.map((id) => [id, `fix/${id}`])),
    workspaceDefaultById: { base: true }, workspaceLastActiveAtById: Object.fromEntries(ids.map((id) => [id, date])),
    recentProjects: [{ projectPath: rootPath, projectName: "Example project", lastOpenedAt: date, defaultBranch: "main", workspaces: [], activeWorkspaceId: "current", workspacePathById: paths, workspaceDefaultById: { base: true }, workspaceBranchById: {}, linkedWorkspacePaths: [paths.linked!] }],
    activeTurnIdsByTask: {}, taskWorkspaceIdById: {}, notifications: [],
    closeWorkspace: async ({ workspaceId }) => { useAppStore.setState((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== workspaceId) })); },
  });
  const shell = buildWorkspaceSessionState({ snapshot: null });
  const api = {
    ...window.api,
    metrics: { getAppMetrics: async () => ({ ...metrics }), getRendererMemory: async () => null },
    lens: { releaseWorkspaceGuests: async ({ workspaceId }: { workspaceId: string }) => {
      const victims = metrics.lens.guests.filter((g) => g.workspaceId === workspaceId && !g.visible);
      metrics.lens.guests = metrics.lens.guests.filter((g) => !victims.includes(g));
      metrics.processes = metrics.processes.filter((p) => !victims.some((g) => g.pid === p.pid));
      return { ok: true, released: victims.length };
    } },
    scripts: { getStatus: async () => ({ ok: true, statuses: [] }) },
    terminal: {
      getSlotState: async () => ({ state: "idle" }),
      runCommand: async ({ cwd, command }: { cwd: string; command: string }) => ({ ok: !cwd.endsWith("unavailable"), code: 0, stderr: "", stdout: command === "du -sk ." ? "245760\t.\n" : command.startsWith("git worktree list") ? `worktree ${rootPath}\0\0` : cwd.endsWith("dirty") ? " M src/app.ts\n" : "" }),
    },
    persistence: {
      listWorkspaces: async () => ({ ok: true, workspaces: [] }), loadWorkspace: async () => ({ ok: true, workspace: null }), upsertWorkspace: async () => ({ ok: true }),
      loadWorkspaceShell: async () => ({ ok: true, shell }),
    },
  };
  window.api = api as unknown as typeof window.api;
}

export function ResourceManagerPreview() {
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { installFixture(); setReady(true); }, []);
  useEffect(() => { applyThemeClass({ enabled: dark }); }, [dark]);
  return <main className={sx(styles.page)}>
    <h1>Resource Manager preview</h1>
    <p>Isolated UI fixture. File operations and metrics are simulated.</p>
    <Button variant="secondary" onClick={() => setDark((value) => !value)}>{dark ? "Use light theme" : "Use dark theme"}</Button>
    {ready && <MemoryUsagePopover variant="bar" />}
  </main>;
}
const styles = stylex.create({ page: { padding: 32, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 } });
