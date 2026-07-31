import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  closeRetainedBrowserView,
  getRetainedBrowserViewCountForTests,
  retainBrowserViewUntilDestroyed,
} from "../electron/main/browser/browser-closing-view";
import { isLiveBrowserSessionForWebContents } from "../electron/main/browser/browser-session-identity";

class FakeWebContents extends EventEmitter {
  private destroyed = false;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.emit("destroyed");
  }
}

function waitForImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function waitForTimeout(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("browser closing view retention", () => {
  test("retains an alive view until after its web contents is destroyed", async () => {
    const webContents = new FakeWebContents();
    const view = { webContents };

    retainBrowserViewUntilDestroyed(view);
    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(1);

    webContents.destroy();

    expect(getRetainedBrowserViewCountForTests()).toBe(1);

    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("releases an already-destroyed view on the next tick", async () => {
    const webContents = new FakeWebContents();
    const view = { webContents };
    webContents.destroy();

    retainBrowserViewUntilDestroyed(view);

    expect(getRetainedBrowserViewCountForTests()).toBe(1);

    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("retaining the same view more than once is idempotent", async () => {
    const webContents = new FakeWebContents();
    const view = { webContents };

    retainBrowserViewUntilDestroyed(view);
    retainBrowserViewUntilDestroyed(view);

    expect(getRetainedBrowserViewCountForTests()).toBe(1);
    expect(webContents.listenerCount("destroyed")).toBe(1);

    webContents.destroy();
    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("a destroyed view only releases the same view identity", async () => {
    const firstWebContents = new FakeWebContents();
    const secondWebContents = new FakeWebContents();
    const firstView = { webContents: firstWebContents };
    const secondView = { webContents: secondWebContents };

    retainBrowserViewUntilDestroyed(firstView);
    retainBrowserViewUntilDestroyed(secondView);

    expect(getRetainedBrowserViewCountForTests()).toBe(2);

    firstWebContents.destroy();
    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(1);

    secondWebContents.destroy();
    await waitForImmediate();

    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("retries destruction observation after a transient state check failure", async () => {
    const webContents = new FakeWebContents();
    let checks = 0;
    const view = {
      webContents: {
        isDestroyed: () => {
          checks += 1;
          if (checks === 1) {
            throw new Error("temporarily unavailable");
          }
          return webContents.isDestroyed();
        },
        once: webContents.once.bind(webContents),
      },
    };

    retainBrowserViewUntilDestroyed(view);
    await waitForTimeout(10);
    webContents.destroy();
    await waitForImmediate();

    expect(checks).toBeGreaterThan(1);
    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("retries destruction observation after a transient listener failure", async () => {
    const webContents = new FakeWebContents();
    let subscriptions = 0;
    const view = {
      webContents: {
        isDestroyed: () => webContents.isDestroyed(),
        once: (event: "destroyed", listener: () => void) => {
          subscriptions += 1;
          if (subscriptions === 1) {
            throw new Error("temporarily unavailable");
          }
          return webContents.once(event, listener);
        },
      },
    };

    retainBrowserViewUntilDestroyed(view);
    await waitForTimeout(10);
    webContents.destroy();
    await waitForImmediate();

    expect(subscriptions).toBe(2);
    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("hides and detaches the native surface before cleanup and close", async () => {
    const calls: string[] = [];
    const webContents = new FakeWebContents();
    const view = {
      webContents: Object.assign(webContents, {
        close: () => {
          calls.push("close");
          webContents.destroy();
        },
      }),
      setVisible: (visible: boolean) => calls.push(`visible:${visible}`),
      setBounds: (bounds: { width: number; height: number }) =>
        calls.push(`bounds:${bounds.width}x${bounds.height}`),
    };

    closeRetainedBrowserView({
      view,
      removeFromParent: () => calls.push("remove"),
      beforeClose: () => calls.push("cleanup"),
    });

    expect(calls).toEqual([
      "visible:false",
      "bounds:0x0",
      "remove",
      "cleanup",
      "close",
    ]);
    expect(getRetainedBrowserViewCountForTests()).toBe(1);
    await waitForImmediate();
    expect(getRetainedBrowserViewCountForTests()).toBe(0);
  });

  test("keeps an alive target retained when close throws", async () => {
    const webContents = new FakeWebContents();
    let closeAttempts = 0;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => warnings.push(String(message));
    const view = {
      webContents: Object.assign(webContents, {
        close: () => {
          closeAttempts += 1;
          throw new Error("close failed");
        },
      }),
      setVisible: () => {},
      setBounds: () => {},
    };

    try {
      closeRetainedBrowserView({ view, removeFromParent: () => {} });
      await waitForImmediate();
      expect(closeAttempts).toBe(2);
      expect(warnings).toEqual([
        "[lens:lifecycle] WebContents close failed after retry; keeping browser view quarantined",
      ]);
      expect(getRetainedBrowserViewCountForTests()).toBe(1);

      webContents.destroy();
      await waitForImmediate();
      expect(getRetainedBrowserViewCountForTests()).toBe(0);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("browser session callback identity", () => {
  test("accepts only the matching live WebContents", () => {
    const session = { closing: false, webContentsId: 42 };

    expect(isLiveBrowserSessionForWebContents(session, 42)).toBe(true);
    expect(isLiveBrowserSessionForWebContents(session, 41)).toBe(false);
  });

  test("rejects closing and missing sessions", () => {
    expect(
      isLiveBrowserSessionForWebContents(
        { closing: true, webContentsId: 42 },
        42,
      ),
    ).toBe(false);
    expect(isLiveBrowserSessionForWebContents(undefined, 42)).toBe(false);
  });
});
