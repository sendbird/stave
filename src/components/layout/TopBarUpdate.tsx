import {
  ArrowUpCircle,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
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
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

function InfoRow(args: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{args.label}</span>
      <span className="max-w-[70%] text-right font-mono text-xs text-foreground break-all">
        {args.value ?? "-"}
      </span>
    </div>
  );
}

export function TopBarUpdate(props: {
  noDragStyle: CSSProperties;
}) {
  const [tasks, activeTurnIdsByTask] = useAppStore(
    useShallow((state) => [
      state.tasks,
      state.activeTurnIdsByTask,
    ] as const),
  );
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [snapshot, setSnapshot] = useState<AppUpdateStatusSnapshot | null>(null);
  const respondingTasks = useMemo(
    () =>
      getRespondingTasks({
        tasks,
        activeTurnIdsByTask,
      }),
    [activeTurnIdsByTask, tasks],
  );
  const respondingTaskSummaries = respondingTasks
    .slice(0, 3)
    .map((task) => ({
      id: task.id,
      title: task.title.trim() || "Untitled Task",
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
        summary: "App update bridge unavailable.",
        detail: "The renderer could not reach the app update service.",
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
        summary: "Failed to check for app updates.",
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
    ? new Date(snapshot.checkedAt).toLocaleString()
    : null;
  const hasUpdate = snapshot?.state === "available";
  const hasIssue = snapshot?.state === "blocked" || snapshot?.state === "error";

  async function startInstall() {
    const install = window.api?.tooling?.installAppUpdateAndRestart;
    if (!install) {
      toast.error("App update bridge unavailable");
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
      toast.error("Failed to start the app update", {
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
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    hasUpdate && "text-primary",
                  )}
                  style={props.noDragStyle}
                  aria-label="app-update"
                >
                  {loading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-4" />
                  )}
                  {hasUpdate ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex size-2.5 rounded-full bg-primary" />
                  ) : null}
                  {!hasUpdate && hasIssue ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex size-2.5 rounded-full bg-warning" />
                  ) : null}
                </Button>
              </PopoverTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">App Update</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[min(24rem,calc(100vw-1rem))] rounded-xl border-border/80 bg-card p-0 shadow-2xl"
          style={props.noDragStyle}
        >
          <PopoverHeader className="border-b border-border/70 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <PopoverTitle className="text-sm font-semibold text-foreground">
                  App Update
                </PopoverTitle>
                <p className="text-xs text-muted-foreground">
                  {snapshot?.summary ?? "Checking for the latest Stave release..."}
                </p>
              </div>
              {snapshot ? (
                <Badge
                  variant={hasUpdate ? "success" : hasIssue ? "warning" : "secondary"}
                  className="shrink-0"
                >
                  {snapshot.state === "available"
                    ? "Available"
                    : snapshot.state === "blocked"
                      ? "Blocked"
                      : snapshot.state === "error"
                        ? "Error"
                        : "Current"}
                </Badge>
              ) : null}
            </div>
          </PopoverHeader>

          <div className="space-y-3 px-4 py-3">
            <div className="space-y-2">
              <InfoRow label="Installed" value={snapshot?.currentVersion ?? null} />
              <InfoRow label="Latest" value={snapshot?.latestVersion ?? null} />
              <InfoRow label="Last Checked" value={checkedAt} />
            </div>

            {snapshot?.detail ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                  {snapshot.detail}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void refreshStatus()}
              >
                <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!snapshot?.canInstall || installing}
                onClick={() => void handleInstallClick()}
              >
                {installing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowUpCircle className="size-4" />
                )}
                Install & Restart
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Interrupt active tasks and update Stave?</DialogTitle>
            <DialogDescription>
              {respondingTasks.length === 1
                ? "This update will stop the task that is currently responding."
                : `This update will stop ${respondingTasks.length} tasks that are currently responding.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              Save any context you still need before continuing. Stave will close and restart to apply the update.
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Active Tasks
              </p>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {respondingTaskSummaries.map((task) => (
                  <li key={task.id} className="truncate">
                    {task.title}
                  </li>
                ))}
                {respondingTasks.length > respondingTaskSummaries.length ? (
                  <li className="text-muted-foreground">
                    +{respondingTasks.length - respondingTaskSummaries.length} more
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
              Cancel
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
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="size-4" />
              )}
              Continue Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
