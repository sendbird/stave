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

function releaseBrowserViewOnNextTick(view: BrowserViewToRetain): void {
  setImmediate(() => {
    retainedBrowserViews.delete(view);
  });
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
    () => observeRetainedBrowserView(view, attempt + 1),
    delay,
  );
  timer.unref?.();
}

function observeRetainedBrowserView(
  view: BrowserViewToRetain,
  attempt: number,
): void {
  if (!retainedBrowserViews.has(view)) {
    return;
  }

  try {
    if (view.webContents.isDestroyed()) {
      releaseBrowserViewOnNextTick(view);
      return;
    }
  } catch {
    scheduleRetentionObserverRetry(view, attempt);
    return;
  }

  try {
    view.webContents.once("destroyed", () => {
      releaseBrowserViewOnNextTick(view);
    });
  } catch {
    scheduleRetentionObserverRetry(view, attempt);
  }
}

export function retainBrowserViewUntilDestroyed(
  view: BrowserViewToRetain,
): void {
  if (retainedBrowserViews.has(view)) {
    return;
  }

  retainedBrowserViews.add(view);
  observeRetainedBrowserView(view, 0);
}

export function getRetainedBrowserViewCountForTests(): number {
  return retainedBrowserViews.size;
}

/**
 * Remove a native browser surface before doing any potentially slow teardown,
 * then close its WebContents while retaining the wrapper until destruction.
 * Every step is best-effort so one stale native object cannot abort the rest.
 */
export function closeRetainedBrowserView(args: {
  view: BrowserViewToClose;
  removeFromParent: () => void;
  beforeClose?: () => void;
}): void {
  retainBrowserViewUntilDestroyed(args.view);

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
  try {
    args.beforeClose?.();
  } catch {
    // Cleanup must not prevent the WebContents close attempt.
  }

  const attemptClose = (retry: boolean) => {
    try {
      if (!args.view.webContents.isDestroyed()) {
        args.view.webContents.close();
      }
    } catch {
      if (retry) {
        setImmediate(() => attemptClose(false));
      } else {
        reportQuarantinedBrowserView(
          args.view,
          "WebContents close failed after retry",
        );
      }
      // Keep the strong reference when close fails while the target is alive.
    }
  };
  attemptClose(true);
}
