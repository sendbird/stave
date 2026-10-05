import { formatPercent } from "@/i18n/format";
import { formatTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { WorkspaceExecutionControls } from "./WorkspaceExecutionControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  formatResourceBytes,
  resourcePageLabel,
  shouldShowResourceWorkspace,
  uniqueResourceProcesses,
  type ResourceProcess,
} from "@/lib/performance/resource-manager";
import type { AppMetrics } from "./ResourcesPopover";
import { managerStyles as styles } from "./resource-manager.styles";
import { shareStyles } from "./resource-dashboard.styles";

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
  const { t: tI18n } = useTranslation(["workspace"]);
  const workspaces = useAppStore((s) => s.workspaces);
  const recentRepositories = useAppStore((s) => s.recentRepositories);
  const tasks = useAppStore((s) => s.tasks);
  const repositoryName = useAppStore((s) => s.repositoryName);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
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
    for (const repository of recentRepositories)
      for (const workspace of repository.workspaces)
        result.set(workspace.id, `${repository.repositoryName} / ${workspace.name}`);
    for (const workspace of workspaces)
      result.set(
        workspace.id,
        `${repositoryName ?? "Repository"} / ${workspace.name}`,
      );
    return result;
  }, [workspaces, recentRepositories, repositoryName, i18n.resolvedLanguage]);
  const processes: ResourceProcess[] = metrics.processes.map((p) => ({
    pid: p.pid,
    label: p.pid === metrics.hostService?.pid ? tI18n("workspace:resourceManagerOverview.hostService") : labels[p.role],
    rssBytes: p.memory.workingSetSizeKB * 1024,
    cpu: p.cpu.percentCPUUsage,
  }));
  const knownPids = new Set(processes.map((p) => p.pid));
  if (metrics.hostService) {
    if (!knownPids.has(metrics.hostService.pid))
      processes.push({
        pid: metrics.hostService.pid,
        label: tI18n("workspace:resourceManagerOverview.hostService"),
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
  const lensWorkspaceIds = metrics.lens.guests.map(
    (guest) => guest.workspaceId,
  );
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
    <section className={sx(styles.section)} aria-label={tI18n("workspace:resourceManagerOverview.resourceManager")}>
      {/*
        The headline total, CPU and process count moved to the dashboard above,
        which both views share. Repeating them here produced two numbers for the
        same question that were computed differently and disagreed.
      */}
      <span className={sx(styles.muted)}>
        {tI18n("workspace:resourceManagerOverview.measuredRssCountedOncePerPidShared")}</span>
      {!metrics.hostService && (
        <p role="status" className={sx(styles.message)}>
          {tI18n("workspace:resourceManagerOverview.hostMetricsUnavailableProviderAndTerminalMemory")}</p>
      )}
      {metrics.lens.memoryBudgetKB !== undefined && (
        <span className={sx(styles.muted)}>
          {tI18n("workspace:resourceManagerOverview.theHiddenLensBudgetAboveIsBased")}</span>
      )}
      <h3 className={sx(styles.heading)}>{tI18n("workspace:resourceManagerOverview.workspaceMemory")}</h3>
      <div className={sx(styles.section)}>
        <div className={sx(styles.tableScroll)}>
          <table className={sx(styles.table)} aria-label={tI18n("workspace:resourceManagerOverview.workspaceMemory")}>
            <thead>
              <tr>
                <th className={sx(styles.columnHeading)}>{tI18n("workspace:resourceManagerOverview.workspace")}</th>
                <th className={sx(styles.numericHeading)}>{tI18n("workspace:resourceManagerOverview.attributedRss")}</th>
                <th className={sx(styles.numericHeading)}>{tI18n("workspace:resourceManagerOverview.sharedRss")}</th>
              </tr>
            </thead>
            <tbody>
              {[...names]
                .filter(([id]) =>
                  shouldShowResourceWorkspace({
                    workspaceId: id,
                    activeWorkspaceId,
                    processes: unique,
                    lensWorkspaceIds,
                  }),
                )
                .map(([id, name]) => {
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
                  const attributed = own ? sum(own) : 0;
                  return (
                    <tr key={id} className={sx(styles.dataRow)}>
                      <th scope="row" className={sx(styles.identityCell)}>
                        {name}
                        {/*
                        Magnitude, so one hue for every row: a ramp keyed to
                        size would re-encode the bar length as color and spend
                        the only free channel on what the bar already says.
                      */}
                        <div className={sx(shareStyles.track)} aria-hidden>
                          <div
                            className={sx(shareStyles.fill)}
                            style={{
                              width: `${total > 0 ? Math.min((attributed / total) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                      </th>
                      <td className={sx(styles.numericCell)}>
                        {own ? formatResourceBytes(attributed) : "—"}
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
          {tI18n("workspace:resourceManagerOverview.onlyTheCurrentWorkspaceAndWorkspacesWith")}</span>
      </div>
      <h3 className={sx(styles.heading)}>{tI18n("workspace:resourceManagerOverview.processesLargestGroupsFirst")}</h3>
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
                    {tI18n("workspace:resourceManagerOverview.releaseHiddenPages")}</Button>
                )}
              </div>
              <div className={sx(styles.detail)}>
                <div className={sx(styles.tableScroll)}>
                  <table
                    className={sx(styles.table)}
                    aria-label={tI18n("workspace:resourceManagerOverview.valueProcesses", { name: name })}
                  >
                    <thead>
                      <tr>
                        <th className={sx(styles.columnHeading)}>
                          {tI18n("workspace:resourceManagerOverview.processTask")}</th>
                        <th className={sx(styles.numericHeading)}>{tI18n("workspace:resourceManagerOverview.rss")}</th>
                        <th className={sx(styles.numericHeading)}>{tI18n("workspace:resourceManagerOverview.cpu")}</th>
                        <th className={sx(styles.numericHeading)}>
                          {tI18n("workspace:resourceManagerOverview.rssChange")}</th>
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
                                    {tI18n("workspace:resourceManagerOverview.pid")}{p.pid}
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
                                        tI18n("workspace:resourceManagerOverview.taskValue", { value1: owner.taskId }))
                                      : tI18n("workspace:resourceManagerOverview.workspaceService")}{" "}
                                    ·{" "}
                                    {owner.active
                                      ? tI18n("workspace:resourceManagerOverview.running")
                                      : tI18n("workspace:resourceManagerOverview.retainedAfterTask")}
                                  </span>
                                ))}
                                {p.owners && p.owners.length > 1 && (
                                  <span className={sx(styles.muted)}>
                                    {tI18n("workspace:resourceManagerOverview.sharedProcessTaskMemoryCannotBeMeasured")}</span>
                                )}
                                {owner === "application" && (
                                  <span className={sx(styles.muted)}>
                                    {p.label === "provider" ||
                                    p.label === "pty" ||
                                    p.label === "other" ||
                                    p.label === "language-server"
                                      ? tI18n("workspace:resourceManagerOverview.ownerUnavailable")
                                      : tI18n("workspace:resourceManagerOverview.sharedAppInfrastructure")}
                                  </span>
                                )}
                              </div>
                            </th>
                            <td className={sx(styles.numericCell)}>
                              {formatResourceBytes(p.rssBytes)}
                            </td>
                            <td className={sx(styles.numericCell)}>
                              {p.cpu === null ? "—" : formatPercent(p.cpu / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
                            ? tI18n("workspace:resourceManagerOverview.agentOwnedAutomaticIdlePolicyApplies")
                            : tI18n("workspace:resourceManagerOverview.eligibleForReleaseWhenIdle")}
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
                        {guest.sleeping ? tI18n("workspace:resourceManagerOverview.wakePage") : tI18n("workspace:resourceManagerOverview.sleepPage")}
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
                          ? tI18n("workspace:resourceManagerOverview.allowIdleRelease")
                          : tI18n("workspace:resourceManagerOverview.alwaysKeepActive")}
                      </Button>
                    </div>
                    <span className={sx(styles.pageMeta)}>
                      {guest.sleeping
                        ? tI18n("workspace:resourceManagerOverview.sleepingPageStateRetained")
                        : guest.visible
                          ? tI18n("workspace:resourceManagerOverview.visible")
                          : tI18n("workspace:resourceManagerOverview.hidden")}{" "}
                      · {guest.managedByMcp ? tI18n("workspace:resourceManagerOverview.agentSession") : tI18n("workspace:resourceManagerOverview.browserTab")} ·{" "}
                      {guest.lensSessionId}
                    </span>
                  </div>
                ))}
                {releaseTarget === owner && (
                  <div className={sx(styles.section)}>
                    <p className={sx(styles.muted)}>
                      {tI18n("workspace:resourceManagerOverview.tabsReopenAtTheirLastUrlUnsaved")}</p>
                    <div className={sx(styles.actions)}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setReleaseTarget(null)}
                      >
                        {tI18n("workspace:resourceManagerOverview.cancel")}</Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void release(owner)}
                      >
                        {tI18n("workspace:resourceManagerOverview.confirmRelease")}</Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      <p className={sx(styles.muted)}>
        {tI18n("workspace:resourceManagerOverview.changesCompareTheSamePidOverRecent")}</p>
      <WorkspaceExecutionControls />
      {message && (
        <p role="status" className={sx(styles.message)}>
          {message}
        </p>
      )}
      {Boolean(metrics.lens.resourceEvents?.length) && (
        <section>
          <h3 className={sx(styles.heading)}>
            {tI18n("workspace:resourceManagerOverview.recentPageReleasesAndReopenings")}</h3>
          <div className={sx(styles.detail)}>
            {metrics.lens
              .resourceEvents!.slice(-10)
              .reverse()
              .map((event, index) => (
                <span key={`${event.at}:${index}`} className={sx(styles.muted)}>
                  {formatTime(new Date(event.at))} ·{" "}
                  {names.get(event.workspaceId) ?? event.workspaceId} /{" "}
                  {event.lensSessionId} ·{" "}
                  {event.kind === "released" ? tI18n("workspace:resourceManagerOverview.releaseRequested") : tI18n("workspace:resourceManagerOverview.reopened")}
                </span>
              ))}
          </div>
        </section>
      )}
    </section>
  );
}
