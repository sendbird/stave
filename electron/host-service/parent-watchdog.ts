export const HOST_PARENT_WATCHDOG_INTERVAL_MS = 2_000;

export function parseExpectedHostParentPid(value: string | undefined) {
  const pid = Number(value);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

export function isExpectedHostParentMissing(args: {
  expectedParentPid: number;
  actualParentPid: number;
  isProcessAlive: (pid: number) => boolean;
}) {
  return (
    args.actualParentPid !== args.expectedParentPid ||
    !args.isProcessAlive(args.expectedParentPid)
  );
}

export function startHostParentWatchdog(args: {
  expectedParentPid: number | null;
  onParentMissing: () => void;
  intervalMs?: number;
  getParentPid?: () => number;
  isProcessAlive?: (pid: number) => boolean;
}) {
  if (args.expectedParentPid === null) {
    return null;
  }
  const getParentPid = args.getParentPid ?? (() => process.ppid);
  const isProcessAlive =
    args.isProcessAlive ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
      }
    });
  let triggered = false;
  const timer = setInterval(() => {
    if (
      triggered ||
      !isExpectedHostParentMissing({
        expectedParentPid: args.expectedParentPid!,
        actualParentPid: getParentPid(),
        isProcessAlive,
      })
    ) {
      return;
    }
    triggered = true;
    clearInterval(timer);
    args.onParentMissing();
  }, args.intervalMs ?? HOST_PARENT_WATCHDOG_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
