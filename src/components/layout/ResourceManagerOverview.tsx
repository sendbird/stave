import { WorkspaceExecutionControls } from "./WorkspaceExecutionControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  formatResourceBytes,
  resourcePageLabel,
  uniqueResourceProcesses,
  type ResourceProcess,
} from "@/lib/performance/resource-manager";
import type { AppMetrics } from "./ResourcesPopover";
import { managerStyles as styles } from "./resource-manager.styles";

const labels = {
  main: "Main",
  "host-renderer": "App renderer",
  "lens-guest": "Lens",
  gpu: "GPU",
  utility: "Utility",
  other: "Other",
};

export function ResourceManagerOverview({
  metrics,
  refresh,
}: {
  metrics: AppMetrics;
  refresh: () => Promise<void>;
}) {
  const workspaces = useAppStore((s) => s.workspaces);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const tasks = useAppStore((s) => s.tasks);
  const projectName = useAppStore((s) => s.projectName);
  const [releaseTarget, setReleaseTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<
    Array<{ at: number; bytes: number; processes: Map<number, number> }>
  >([]);
  const alive = useRef(true);
  const operation = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const setKeepActive = async (
    workspaceId: string,
    lensSessionId: string,
    keepActive: boolean,
  ) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const result = await window.api?.lens?.setKeepActive?.({
        workspaceId,
        lensSessionId,
        keepActive,
      });
      if (!result?.ok)
        throw new Error(result?.message ?? "Keep-active setting unavailable");
      await refresh();
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error ? error.message : "Setting could not be saved",
        );
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const setSleeping = async (
    workspaceId: string,
    lensSessionId: string,
    sleeping: boolean,
  ) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.api?.lens?.setSleeping?.({
        workspaceId,
        lensSessionId,
        sleeping,
      });
      if (!result?.ok)
        throw new Error(result?.message ?? "Page sleep unavailable");
      await refresh();
    } catch (error) {
      if (alive.current) setMessage(String(error));
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const names = useMemo(() => {
    const result = new Map<string, string>();
    for (const project of recentProjects)
      for (const workspace of project.workspaces)
        result.set(workspace.id, `${project.projectName} / ${workspace.name}`);
    for (const workspace of workspaces)
      result.set(
        workspace.id,
        `${projectName ?? "Project"} / ${workspace.name}`,
      );
    return result;
  }, [workspaces, recentProjects, projectName]);
  const processes: ResourceProcess[] = metrics.processes.map((p) => ({
    pid: p.pid,
    label: p.pid === metrics.hostService?.pid ? "Host service" : labels[p.role],
    rssBytes: p.memory.workingSetSizeKB * 1024,
    cpu: p.cpu.percentCPUUsage,
  }));
  const knownPids = new Set(processes.map((p) => p.pid));
  if (metrics.hostService) {
    if (!knownPids.has(metrics.hostService.pid))
      processes.push({
        pid: metrics.hostService.pid,
        label: "Host service",
        rssBytes: metrics.hostService.memory.rss,
        cpu: null,
      });
    for (const child of metrics.hostService.childProcesses) {
      const existing = processes.find((process) => process.pid === child.pid);
      if (existing) {
        existing.owners = child.owners;
        continue;
      }
      processes.push({
        pid: child.pid,
        label: child.kind,
        rssBytes: child.rssBytes,
        cpu: null,
        owners: child.owners,
      });
    }
  }
  const unique = uniqueResourceProcesses(processes);
  const groups = new Map<string, ResourceProcess[]>();
  for (const process of unique) {
    const owners = [
      ...new Set([
        ...(process.owners ?? []).map((owner) => owner.workspaceId),
        ...metrics.lens.guests
          .filter((guest) => guest.pid === process.pid)
          .map((guest) => guest.workspaceId),
      ]),
    ];
    const owner =
      owners.length === 1
        ? owners[0]!
        : owners.length > 1
          ? "shared"
          : "application";
    const group = groups.get(owner) ?? [];
    group.push(process);
    groups.set(owner, group);
  }
  const total = unique.reduce((sum, p) => sum + p.rssBytes, 0);
  const cpu = metrics.processes.reduce(
    (sum, p) => sum + p.cpu.percentCPUUsage,
    0,
  );
  useEffect(() => {
    setHistory((previous) =>
      [
        ...previous,
        {
          at: Date.now(),
          bytes: total,
          processes: new Map(unique.map((p) => [p.pid, p.rssBytes])),
        },
      ].slice(-120),
    );
  }, [metrics, total]);
  const release = async (workspaceId: string) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const before = await window.api?.metrics?.getAppMetrics?.();
      const result = await window.api?.lens?.releaseWorkspaceGuests?.({
        workspaceId,
      });
      if (!result?.ok)
        throw new Error(result?.message ?? "Release unavailable");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = await window.api?.metrics?.getAppMetrics?.();
      if (!alive.current) return;
      const rss = (snapshot: AppMetrics) =>
        uniqueResourceProcesses(
          snapshot.processes.map((p) => ({
            pid: p.pid,
            label: p.role,
            rssBytes: p.memory.workingSetSizeKB * 1024,
            cpu: null,
          })),
        ).reduce((sum, p) => sum + p.rssBytes, 0);
      const observation =
        before && after
          ? ` Electron RSS observed: ${formatResourceBytes(rss(before))} → ${formatResourceBytes(rss(after))}. Other activity can affect this change.`
          : " Memory observation unavailable.";
      setMessage(`${result.released} hidden page(s) released.${observation}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Release failed");
    } finally {
      operation.current = false;
      if (alive.current) {
        setBusy(false);
        setReleaseTarget(null);
      }
    }
  };
  return (
    <section className={sx(styles.section)} aria-label="Resource manager">
      <div className={sx(styles.toolbar)}>
        <strong className={sx(styles.headline)}>
          {formatResourceBytes(total)} RSS
        </strong>
        <span className={sx(styles.muted)}>
          {cpu.toFixed(1)}% Electron CPU · {unique.length} processes
        </span>
      </div>
      <span className={sx(styles.muted)}>
        Measured RSS, counted once per PID. Shared app memory cannot be split by
        workspace or task.
      </span>
      {!metrics.hostService && (
        <p role="status" className={sx(styles.message)}>
          Host metrics unavailable. Provider and terminal memory is missing from
          this snapshot.
        </p>
      )}
      {metrics.lens.memoryBudgetKB !== undefined && (
        <span className={sx(styles.muted)}>
          Hidden Lens budget:{" "}
          {formatResourceBytes(metrics.lens.memoryBudgetKB * 1024)} · Based on
          device RAM. Recently reopened pages get a cooldown.
        </span>
      )}

      {history.length > 1 && (
        <span className={sx(styles.muted)}>
          Recent RSS: {formatResourceBytes(history[0]!.bytes)} →{" "}
          {formatResourceBytes(total)} · Peak{" "}
          {formatResourceBytes(
            Math.max(...history.map((sample) => sample.bytes)),
          )}
          . Up to 120 recent observations.
        </span>
      )}
      <h3 className={sx(styles.heading)}>Workspace memory</h3>
      <div className={sx(styles.section)}>
        <div className={sx(styles.tableScroll)}>
          <table className={sx(styles.table)} aria-label="Workspace memory">
            <thead>
              <tr>
                <th className={sx(styles.columnHeading)}>Workspace</th>
                <th className={sx(styles.numericHeading)}>Attributed RSS</th>
                <th className={sx(styles.numericHeading)}>Shared RSS</th>
              </tr>
            </thead>
            <tbody>
              {[...names].map(([id, name]) => {
                const own = groups.get(id);
                const shared =
                  groups
                    .get("shared")
                    ?.filter(
                      (p) =>
                        p.owners?.some((o) => o.workspaceId === id) ||
                        metrics.lens.guests.some(
                          (g) => g.pid === p.pid && g.workspaceId === id,
                        ),
                    ) ?? [];
                const sum = (items: ResourceProcess[]) =>
                  items.reduce((total, p) => total + p.rssBytes, 0);
                return (
                  <tr key={id} className={sx(styles.dataRow)}>
                    <th scope="row" className={sx(styles.identityCell)}>
                      {name}
                    </th>
                    <td className={sx(styles.numericCell)}>
                      {own ? formatResourceBytes(sum(own)) : "—"}
                    </td>
                    <td className={sx(styles.numericCell)}>
                      {shared.length ? formatResourceBytes(sum(shared)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <span className={sx(styles.muted)}>
          — means no attributed process in this snapshot. Shared RSS is shown
          for each associated workspace; do not add those values together.
        </span>
      </div>
      <h3 className={sx(styles.heading)}>Processes · largest groups first</h3>
      {[...groups.entries()]
        .sort(
          (a, b) =>
            b[1].reduce((sum, p) => sum + p.rssBytes, 0) -
            a[1].reduce((sum, p) => sum + p.rssBytes, 0),
        )
        .map(([owner, group]) => {
          const guests = metrics.lens.guests.filter((guest) =>
            group.some((p) => p.pid === guest.pid),
          );
          const releasable =
            owner !== "application" &&
            owner !== "shared" &&
            guests.some(
              (g) =>
                !g.visible &&
                !g.managedByMcp &&
                !g.keptActive &&
                !g.protectionReasons?.length,
            );
          const name =
            owner === "application"
              ? "Stave app and unattributed processes"
              : owner === "shared"
                ? "Processes shared across workspaces"
                : (names.get(owner) ?? owner);
          return (
            <section key={owner} className={sx(styles.group)}>
              <div className={sx(styles.toolbar)}>
                <h3 className={sx(styles.groupHeading)}>
                  <span className={sx(styles.groupName)} title={name}>
                    {name}
                  </span>
                  <span className={sx(styles.value)}>
                    {formatResourceBytes(
                      group.reduce((sum, p) => sum + p.rssBytes, 0),
                    )}
                  </span>
                </h3>
                {releasable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setReleaseTarget(owner)}
                  >
                    Release hidden pages
                  </Button>
                )}
              </div>
              <div className={sx(styles.detail)}>
                <div className={sx(styles.tableScroll)}>
                  <table
                    className={sx(styles.table)}
                    aria-label={`${name} processes`}
                  >
                    <thead>
                      <tr>
                        <th className={sx(styles.columnHeading)}>
                          Process / task
                        </th>
                        <th className={sx(styles.numericHeading)}>RSS</th>
                        <th className={sx(styles.numericHeading)}>CPU</th>
                        <th className={sx(styles.numericHeading)}>
                          RSS change
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group
                        .sort((a, b) => b.rssBytes - a.rssBytes)
                        .map((p) => (
                          <tr key={p.pid} className={sx(styles.dataRow)}>
                            <th scope="row" className={sx(styles.identityCell)}>
                              <div className={sx(styles.processIdentity)}>
                                <span className={sx(styles.processTitle)}>
                                  {p.label}
                                  <span className={sx(styles.muted)}>
                                    PID {p.pid}
                                  </span>
                                </span>
                                {p.owners?.map((owner) => (
                                  <span
                                    key={`${owner.workspaceId}:${owner.taskId}`}
                                    className={sx(styles.muted)}
                                  >
                                    {names.get(owner.workspaceId) ??
                                      owner.workspaceId}{" "}
                                    ·{" "}
                                    {owner.taskId
                                      ? (owner.taskTitle ??
                                        tasks.find(
                                          (task) => task.id === owner.taskId,
                                        )?.title ??
                                        `Task ${owner.taskId}`)
                                      : "Workspace service"}{" "}
                                    ·{" "}
                                    {owner.active
                                      ? "Running"
                                      : "Retained after task"}
                                  </span>
                                ))}
                                {p.owners && p.owners.length > 1 && (
                                  <span className={sx(styles.muted)}>
                                    Shared process; task memory cannot be
                                    measured separately.
                                  </span>
                                )}
                                {owner === "application" && (
                                  <span className={sx(styles.muted)}>
                                    {p.label === "provider" ||
                                    p.label === "pty" ||
                                    p.label === "other" ||
                                    p.label === "language-server"
                                      ? "Owner unavailable"
                                      : "Shared app infrastructure"}
                                  </span>
                                )}
                              </div>
                            </th>
                            <td className={sx(styles.numericCell)}>
                              {formatResourceBytes(p.rssBytes)}
                            </td>
                            <td className={sx(styles.numericCell)}>
                              {p.cpu === null ? "—" : `${p.cpu.toFixed(1)}%`}
                            </td>
                            <td className={sx(styles.numericCell)}>
                              {history[0]?.processes.has(p.pid) ? (
                                <span className={sx(styles.muted)}>
                                  {p.rssBytes >=
                                  history[0]!.processes.get(p.pid)!
                                    ? "+"
                                    : "−"}
                                  {formatResourceBytes(
                                    Math.abs(
                                      p.rssBytes -
                                        history[0]!.processes.get(p.pid)!,
                                    ),
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {guests.map((guest) => (
                  <div
                    key={`${guest.workspaceId}:${guest.lensSessionId}`}
                    className={sx(styles.pageRow)}
                  >
                    <div className={sx(styles.processIdentity)}>
                      <span
                        className={sx(styles.truncate)}
                        title={resourcePageLabel(guest.url)}
                      >
                        {resourcePageLabel(guest.url)}
                      </span>
                      <span className={sx(styles.muted)}>
                        {guest.protectionReasons?.length
                          ? guest.protectionReasons.join(" · ")
                          : guest.managedByMcp
                            ? "Agent-owned; automatic idle policy applies"
                            : "Eligible for release when idle"}
                      </span>
                    </div>
                    <div className={sx(styles.actions)}>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={
                          busy ||
                          !window.api?.lens?.setSleeping ||
                          (!guest.sleeping &&
                            Boolean(guest.protectionReasons?.length))
                        }
                        onClick={() =>
                          void setSleeping(
                            guest.workspaceId,
                            guest.lensSessionId,
                            !guest.sleeping,
                          )
                        }
                      >
                        {guest.sleeping ? "Wake page" : "Sleep page"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !window.api?.lens?.setKeepActive}
                        aria-pressed={guest.keptActive ?? false}
                        onClick={() =>
                          void setKeepActive(
                            guest.workspaceId,
                            guest.lensSessionId,
                            !guest.keptActive,
                          )
                        }
                      >
                        {guest.keptActive
                          ? "Allow idle release"
                          : "Always keep active"}
                      </Button>
                    </div>
                    <span className={sx(styles.pageMeta)}>
                      {guest.sleeping
                        ? "Sleeping; page state retained"
                        : guest.visible
                          ? "Visible"
                          : "Hidden"}{" "}
                      · {guest.managedByMcp ? "Agent session" : "Browser tab"} ·{" "}
                      {guest.lensSessionId}
                    </span>
                  </div>
                ))}
                {releaseTarget === owner && (
                  <div className={sx(styles.section)}>
                    <p className={sx(styles.muted)}>
                      Tabs reopen at their last URL. Unsaved page input will be
                      lost.
                    </p>
                    <div className={sx(styles.actions)}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setReleaseTarget(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void release(owner)}
                      >
                        Confirm release
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      <p className={sx(styles.muted)}>
        Changes compare the same PID over recent observations. RSS growth alone
        does not prove a leak; compare after work finishes and inspect heap
        usage in Diagnostics.
      </p>
      <WorkspaceExecutionControls />
      {message && (
        <p role="status" className={sx(styles.message)}>
          {message}
        </p>
      )}
      {Boolean(metrics.lens.resourceEvents?.length) && (
        <section>
          <h3 className={sx(styles.heading)}>
            Recent page releases and reopenings
          </h3>
          <div className={sx(styles.detail)}>
            {metrics.lens
              .resourceEvents!.slice(-10)
              .reverse()
              .map((event, index) => (
                <span key={`${event.at}:${index}`} className={sx(styles.muted)}>
                  {new Date(event.at).toLocaleTimeString()} ·{" "}
                  {names.get(event.workspaceId) ?? event.workspaceId} /{" "}
                  {event.lensSessionId} ·{" "}
                  {event.kind === "released" ? "Release requested" : "Reopened"}
                </span>
              ))}
          </div>
        </section>
      )}
    </section>
  );
}
