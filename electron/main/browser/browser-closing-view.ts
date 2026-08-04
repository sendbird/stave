export interface BrowserViewToRetain {
  readonly webContents: {
    isDestroyed(): boolean;
    once(event: "destroyed", listener: () => void): unknown;
  };
}

export interface BrowserViewToClose extends BrowserViewToRetain {
  setVisible(visible: boolean): void;
  setBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void;
  readonly webContents: BrowserViewToRetain["webContents"] & {
    close(): void;
  };
}

const retainedBrowserViews = new Set<BrowserViewToRetain>();
const reportedBrowserViews = new WeakSet<BrowserViewToRetain>();
const RETENTION_OBSERVER_RETRY_DELAYS_MS = [0, 10, 50, 250, 1_000] as const;
const DESTROYED_VIEW_QUARANTINE_MS = 30_000;

function releaseBrowserViewAfterQuarantine(
  view: BrowserViewToRetain,
  quarantineMs: number,
): void {
  if (quarantineMs <= 0) {
    setImmediate(() => {
      retainedBrowserViews.delete(view);
    });
    return;
  }

  const timer = setTimeout(() => {
    retainedBrowserViews.delete(view);
  }, quarantineMs);
  timer.unref?.();
}

function reportQuarantinedBrowserView(
  view: BrowserViewToRetain,
  reason: string,
): void {
  if (reportedBrowserViews.has(view)) {
    return;
  }
  reportedBrowserViews.add(view);
  console.warn(`[lens:lifecycle] ${reason}; keeping browser view quarantined`);
}

function scheduleRetentionObserverRetry(
  view: BrowserViewToRetain,
  attempt: number,
  quarantineMs: number,
): void {
  const delay = RETENTION_OBSERVER_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    // Safety wins over reclamation when Electron cannot report whether the
    // native target is still alive. Keep the view quarantined rather than
    // risking the weak-callback destruction crash this guard prevents.
    reportQuarantinedBrowserView(
      view,
      "could not observe WebContents destruction",
    );
    return;
  }
  const timer = setTimeout(
    () => observeRetainedBrowserView(view, attempt + 1, quarantineMs),
    delay,
  );
  timer.unref?.();
}

function observeRetainedBrowserView(
  view: BrowserViewToRetain,
  attempt: number,
  quarantineMs: number,
): void {
  if (!retainedBrowserViews.has(view)) {
    return;
  }

  try {
    if (view.webContents.isDestroyed()) {
      releaseBrowserViewAfterQuarantine(view, quarantineMs);
      return;
    }
  } catch {
    scheduleRetentionObserverRetry(view, attempt, quarantineMs);
    return;
  }

  try {
    view.webContents.once("destroyed", () => {
      releaseBrowserViewAfterQuarantine(view, quarantineMs);
    });
  } catch {
    scheduleRetentionObserverRetry(view, attempt, quarantineMs);
  }
}

export function retainBrowserViewUntilDestroyed(
  view: BrowserViewToRetain,
  options?: { quarantineMs?: number },
): void {
  if (retainedBrowserViews.has(view)) {
    return;
  }

  retainedBrowserViews.add(view);
  observeRetainedBrowserView(
    view,
    0,
    options?.quarantineMs ?? DESTROYED_VIEW_QUARANTINE_MS,
  );
}

export function getRetainedBrowserViewCount(): number {
  return retainedBrowserViews.size;
}

export const getRetainedBrowserViewCountForTests = getRetainedBrowserViewCount;

/**
 * Remove a native browser surface before doing any potentially slow teardown,
 * then close its WebContents while retaining the wrapper until destruction.
 * Every step is best-effort so one stale native object cannot abort the rest.
 */
export function closeRetainedBrowserView(args: {
  view: BrowserViewToClose;
  removeFromParent: () => void;
  beforeClose?: () => void | Promise<void>;
  quarantineMs?: number;
}): Promise<void> {
  retainBrowserViewUntilDestroyed(args.view, {
    quarantineMs: args.quarantineMs,
  });

  try {
    args.view.setVisible(false);
  } catch {
    // The native view may already be detached.
  }
  try {
    args.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  } catch {
    // The native view may already be detached.
  }
  try {
    args.removeFromParent();
  } catch {
    // The owning window may already be destroyed.
  }
  const attemptClose = (retry: boolean): Promise<void> => {
    try {
      if (!args.view.webContents.isDestroyed()) {
        args.view.webContents.close();
      }
      return Promise.resolve();
    } catch {
      if (retry) {
        return new Promise((resolve) => {
          setImmediate(() => {
            void attemptClose(false).then(resolve);
          });
        });
      }
      reportQuarantinedBrowserView(
        args.view,
        "WebContents close failed after retry",
      );
      return Promise.resolve();
    }
  };

  return Promise.resolve()
    .then(() => args.beforeClose?.())
    .catch(() => {
      // Cleanup must not prevent the WebContents close attempt.
    })
    .then(
      () =>
        new Promise<void>((resolve) => {
          // Native detach, debugger disposal, and WebContents destruction must
          // not all run in the same main-thread callback stack.
          setImmediate(() => {
            void attemptClose(true).then(resolve);
          });
        }),
    );
}
