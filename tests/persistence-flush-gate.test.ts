import { afterEach, describe, expect, mock, test } from "bun:test";

// Quit-time durability gate (Phase 3 of the persistence/memory plan).
//
// `persistence:upsert-workspace-sync` used to run a full `upsertWorkspace`
// inside a blocking `ipcRenderer.sendSync` reply. It is replaced by this gate:
// main asks the renderer to flush and awaits an acknowledgement, bounded by a
// timeout so a wedged or torn-down renderer can never block quitting.

let sentChannels: Array<{ channel: string; payload: unknown }> = [];
let windowState: {
  destroyed: boolean;
  webContentsDestroyed: boolean;
  loading: boolean;
  present: boolean;
} = {
  destroyed: false,
  webContentsDestroyed: false,
  loading: false,
  present: true,
};

mock.module("../electron/main/window", () => ({
  getMainWindow: () =>
    windowState.present
      ? {
          isDestroyed: () => windowState.destroyed,
          webContents: {
            isDestroyed: () => windowState.webContentsDestroyed,
            isLoadingMainFrame: () => windowState.loading,
            send: (channel: string, payload: unknown) => {
              sentChannels.push({ channel, payload });
            },
          },
        }
      : null,
}));

const {
  PERSISTENCE_FLUSH_REQUEST_CHANNEL,
  requestRendererPersistenceFlush,
  resolveRendererPersistenceFlush,
  resetRendererPersistenceFlushState,
} = await import("../electron/main/persistence-flush-gate");

afterEach(() => {
  resetRendererPersistenceFlushState();
  sentChannels = [];
  windowState = {
    destroyed: false,
    webContentsDestroyed: false,
    loading: false,
    present: true,
  };
});

describe("renderer persistence flush gate", () => {
  test("asks the renderer and resolves once it acknowledges", async () => {
    const pending = requestRendererPersistenceFlush({ timeoutMs: 1_000 });

    expect(sentChannels).toHaveLength(1);
    expect(sentChannels[0]?.channel).toBe(PERSISTENCE_FLUSH_REQUEST_CHANNEL);
    const requestId = (sentChannels[0]?.payload as { requestId: number })
      .requestId;

    expect(resolveRendererPersistenceFlush({ requestId })).toEqual({
      ok: true,
    });
    await expect(pending).resolves.toBe("flushed");
  });

  test("resolves without waiting when there is no renderer to ask", async () => {
    windowState.present = false;
    await expect(requestRendererPersistenceFlush()).resolves.toBe(
      "unavailable",
    );
    expect(sentChannels).toHaveLength(0);
  });

  test("resolves when the renderer is mid-teardown", async () => {
    windowState.webContentsDestroyed = true;
    await expect(requestRendererPersistenceFlush()).resolves.toBe(
      "unavailable",
    );
  });

  test("gives up after the timeout instead of blocking the quit", async () => {
    const outcome = await requestRendererPersistenceFlush({ timeoutMs: 10 });
    expect(outcome).toBe("timeout");
  });

  test("ignores an acknowledgement for an abandoned request", async () => {
    const first = requestRendererPersistenceFlush({ timeoutMs: 10 });
    const staleRequestId = (sentChannels[0]?.payload as { requestId: number })
      .requestId;
    expect(await first).toBe("timeout");

    // A late ack for the timed-out request must not settle the next one.
    const second = requestRendererPersistenceFlush({ timeoutMs: 1_000 });
    expect(
      resolveRendererPersistenceFlush({ requestId: staleRequestId }),
    ).toEqual({ ok: false });

    const currentRequestId = (sentChannels[1]?.payload as { requestId: number })
      .requestId;
    expect(currentRequestId).not.toBe(staleRequestId);
    resolveRendererPersistenceFlush({ requestId: currentRequestId });
    await expect(second).resolves.toBe("flushed");
  });

  test("a re-entrant request joins the in-flight one instead of stacking", async () => {
    const first = requestRendererPersistenceFlush({ timeoutMs: 1_000 });
    const second = requestRendererPersistenceFlush({ timeoutMs: 1_000 });

    // Only one renderer round-trip for a repeated quit attempt.
    expect(sentChannels).toHaveLength(1);

    const requestId = (sentChannels[0]?.payload as { requestId: number })
      .requestId;
    resolveRendererPersistenceFlush({ requestId });

    expect(await first).toBe("flushed");
    expect(await second).toBe("flushed");
  });
});

/**
 * Strip comments so the guards below match real code, not the prose that
 * documents why the blocking bridge was removed.
 */
function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function findOffenders(args: {
  roots: string[];
  pattern: RegExp;
  extensions: string;
}) {
  const offenders: string[] = [];
  for (const root of args.roots) {
    const glob = new Bun.Glob(`**/*.${args.extensions}`);
    for await (const relativePath of glob.scan({ cwd: root })) {
      const path = `${root}/${relativePath}`;
      if (path.includes("/node_modules/")) {
        continue;
      }
      const code = stripComments(await Bun.file(path).text());
      if (args.pattern.test(code)) {
        offenders.push(path);
      }
    }
  }
  return offenders.sort();
}

describe("blocking sync persistence bridge is gone", () => {
  test("no code references the upsert-workspace-sync bridge", async () => {
    const offenders = await findOffenders({
      roots: ["electron", "src"],
      extensions: "{ts,tsx}",
      pattern: /persistence:upsert-workspace-sync|\bupsertWorkspaceSync\b/,
    });
    expect(offenders).toEqual([]);
  });

  test("no code performs a synchronous renderer IPC round-trip", async () => {
    const offenders = await findOffenders({
      roots: ["electron"],
      extensions: "ts",
      pattern: /ipcRenderer\s*\.\s*sendSync\s*\(/,
    });
    expect(offenders).toEqual([]);
  });

  test("main gates quit cleanup on the renderer flush", async () => {
    const mainSource = stripComments(
      await Bun.file("electron/main.ts").text(),
    );
    expect(mainSource).toContain("await requestRendererPersistenceFlush()");
    // The flush has to precede the compaction/close that ends the store's life.
    expect(mainSource.indexOf("requestRendererPersistenceFlush")).toBeLessThan(
      mainSource.indexOf("resetMainProcessState({ compactPersistence: true })"),
    );
  });
});
