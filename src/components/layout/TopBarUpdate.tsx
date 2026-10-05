import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { ArrowUpCircle, RefreshCcw } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Loader,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppUpdateStatusSnapshot } from "@/lib/app-update";
import { getRespondingTasks } from "@/lib/tasks";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { layoutShellStyles } from "./layout-shell.styles";
import { updateStyles } from "./top-bar-update.styles";

function InfoRow(args: { label: string; value: string | null }) {
  useTranslation();
  return (
    <div className={sx(updateStyles.infoRow)}>
      <span className={sx(updateStyles.infoLabel)}>{args.label}</span>
      <span className={sx(updateStyles.infoValue)}>{args.value ?? "-"}</span>
    </div>
  );
}

export function TopBarUpdate(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const [tasks, activeTurnIdsByTask] = useAppStore(
    useShallow((state) => [state.tasks, state.activeTurnIdsByTask] as const),
  );
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [snapshot, setSnapshot] = useState<AppUpdateStatusSnapshot | null>(
    null,
  );
  const respondingTasks = useMemo(
    () =>
      getRespondingTasks({
        tasks,
        activeTurnIdsByTask,
      }),
    [activeTurnIdsByTask, tasks, i18n.language],
  );
  const respondingTaskSummaries = respondingTasks.slice(0, 3).map((task) => ({
    id: task.id,
    title: task.title.trim() || i18n.t("shell:topBarUpdate.untitledTask"),
  }));

  async function refreshStatus() {
    const getStatus = window.api?.tooling?.getAppUpdateStatus;
    if (!getStatus) {
      setSnapshot({
        state: "error",
        supported: true,
        checkedAt: new Date().toISOString(),
        currentVersion: null,
        latestVersion: null,
        summary: i18n.t("shell:topBarUpdate.appUpdateBridgeUnavailable"),
        detail: i18n.t("shell:topBarUpdate.theRendererCouldNotReachTheApp"),
        canInstall: false,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextSnapshot = await getStatus();
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot({
        state: "error",
        supported: true,
        checkedAt: new Date().toISOString(),
        currentVersion: null,
        latestVersion: null,
        summary: i18n.t("shell:topBarUpdate.failedToCheckForAppUpdates"),
        detail: error instanceof Error ? error.message : String(error),
        canInstall: false,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  if (!loading && snapshot && !snapshot.supported) {
    return null;
  }

  const checkedAt = snapshot?.checkedAt
    ? formatDateTime(snapshot.checkedAt)
    : null;
  const hasUpdate = snapshot?.state === "available";
  const hasIssue = snapshot?.state === "blocked" || snapshot?.state === "error";

  async function startInstall() {
    const install = window.api?.tooling?.installAppUpdateAndRestart;
    if (!install) {
      toast.error(i18n.t("shell:topBarUpdate.appUpdateBridgeUnavailable2"));
      return;
    }

    setInstalling(true);
    try {
      const result = await install();
      if (!result.ok) {
        toast.error(result.summary, {
          description: result.detail,
        });
        return;
      }
      toast.success(result.summary, {
        description: result.detail,
      });
    } catch (error) {
      toast.error(i18n.t("shell:topBarUpdate.failedToStartTheAppUpdate"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setInstalling(false);
    }
  }

  async function handleInstallClick() {
    if (respondingTasks.length > 0) {
      setConfirmOpen(true);
      return;
    }
    await startInstall();
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={<span {...stylex.props(layoutShellStyles.inlineFlex)} />}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  xstyle={[
                    updateStyles.trigger,
                    hasUpdate && updateStyles.triggerHasUpdate,
                  ]}
                  style={props.noDragStyle}
                  aria-label={i18n.t("shell:topBarUpdate.appUpdate")}
                />
              }
            >
              {loading ? (
                <Loader aria-hidden size="xs" variant="spinner" />
              ) : (
                <ArrowUpCircle />
              )}
              {hasUpdate ? (
                <span
                  {...stylex.props(updateStyles.pip, updateStyles.pipUpdate)}
                />
              ) : null}
              {!hasUpdate && hasIssue ? (
                <span
                  {...stylex.props(updateStyles.pip, updateStyles.pipIssue)}
                />
              ) : null}
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{i18n.t("shell:topBarUpdate.appUpdate")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={10}
          xstyle={updateStyles.panel}
          style={props.noDragStyle}
        >
          <PopoverHeader className={sx(updateStyles.panelHeader)}>
            <div className={sx(updateStyles.panelHeaderRow)}>
              <div className={sx(updateStyles.panelHeaderText)}>
                <PopoverTitle>{i18n.t("shell:topBarUpdate.appUpdate")}</PopoverTitle>
                <p className={sx(updateStyles.panelSummary)}>
                  {snapshot?.summary ??
                    i18n.t("shell:topBarUpdate.checkingForTheLatestStaveRelease")}
                </p>
              </div>
              {snapshot ? (
                <Badge
                  variant={
                    hasUpdate ? "success" : hasIssue ? "warning" : "secondary"
                  }
                  className={sx(updateStyles.stateBadge)}
                >
                  {snapshot.state === "available"
                    ? i18n.t("shell:topBarUpdate.available")
                    : snapshot.state === "blocked"
                      ? i18n.t("shell:topBarUpdate.blocked")
                      : snapshot.state === "error"
                        ? i18n.t("shell:topBarUpdate.error")
                        : i18n.t("shell:topBarUpdate.current")}
                </Badge>
              ) : null}
            </div>
          </PopoverHeader>

          <div className={sx(updateStyles.panelBody)}>
            <div className={sx(updateStyles.infoList)}>
              <InfoRow
                label={i18n.t("shell:topBarUpdate.installed")}
                value={snapshot?.currentVersion ?? null}
              />
              <InfoRow label={i18n.t("shell:topBarUpdate.latest")} value={snapshot?.latestVersion ?? null} />
              <InfoRow label={i18n.t("shell:topBarUpdate.lastChecked")} value={checkedAt} />
            </div>

            {snapshot?.detail ? (
              <div className={sx(updateStyles.detailBox)}>
                <p className={sx(updateStyles.detailText)}>{snapshot.detail}</p>
              </div>
            ) : null}

            <div className={sx(updateStyles.actions)}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void refreshStatus()}
              >
                <RefreshCcw
                  {...stylex.props(loading && updateStyles.spinning)}
                />
                {i18n.t("shell:topBarUpdate.refresh")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!snapshot?.canInstall || installing}
                onClick={() => void handleInstallClick()}
              >
                {installing ? (
                  <Loader aria-hidden size="xs" variant="spinner" />
                ) : (
                  <ArrowUpCircle />
                )}
                {i18n.t("shell:topBarUpdate.installRestart")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent xstyle={updateStyles.confirmSurface}>
          <DialogHeader>
            <DialogTitle>{i18n.t("shell:topBarUpdate.interruptActiveTasksAndUpdateStave")}</DialogTitle>
            <DialogDescription>
              {respondingTasks.length === 1
                ? i18n.t("shell:topBarUpdate.thisUpdateWillStopTheTaskThat")
                : i18n.t("shell:topBarUpdate.thisUpdateWillStopTasksThatAre", { value1: respondingTasks.length })}
            </DialogDescription>
          </DialogHeader>

          <div className={sx(updateStyles.confirmBody)}>
            <div className={sx(updateStyles.warningNote)}>
              {i18n.t("shell:topBarUpdate.saveAnyContextYouStillNeedBefore")}
            </div>

            <div className={sx(updateStyles.detailBox)}>
              <p className={sx(updateStyles.taskListEyebrow)}>{i18n.t("shell:topBarUpdate.activeTasks")}</p>
              <ul className={sx(updateStyles.taskList)}>
                {respondingTaskSummaries.map((task) => (
                  <li key={task.id} className={sx(updateStyles.taskListItem)}>
                    {task.title}
                  </li>
                ))}
                {respondingTasks.length > respondingTaskSummaries.length ? (
                  <li className={sx(updateStyles.taskListOverflow)}>
                    +{respondingTasks.length - respondingTaskSummaries.length}{" "}
                    {i18n.t("shell:topBarUpdate.more")}
                  </li>
                ) : null}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={installing}
              onClick={() => setConfirmOpen(false)}
            >
              {i18n.t("shell:topBarUpdate.cancel")}
            </Button>
            <Button
              type="button"
              disabled={installing}
              onClick={() => {
                setConfirmOpen(false);
                void startInstall();
              }}
            >
              {installing ? (
                <Loader aria-hidden size="xs" variant="spinner" />
              ) : (
                <ArrowUpCircle />
              )}
              {i18n.t("shell:topBarUpdate.continueUpdate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
