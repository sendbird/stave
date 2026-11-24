import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorkspaceScratchChangedEvent } from "../src/lib/workspace-scratch";
import {
  WorkspaceScratchWatchHub,
  nodeScratchWatchPort,
  type ScratchWatchPort,
} from "../electron/main/utils/workspace-scratch-watch";

function fakePort(options: { refuse?: boolean } = {}) {
  const watchers: { directory: string; onChange: () => void; onError: () => void; closed: boolean }[] = [];
  const missing = new Set<string>();
  const port: ScratchWatchPort = {
    watch(directory, onChange, onError) {
      if (options.refuse) return null;
      const watcher = { directory, onChange, onError, closed: false };
      watchers.push(watcher);
      return { close: () => { watcher.closed = true; } };
    },
    isDirectory: async (directory) => !missing.has(directory),
  };
  return { port, watchers, missing };
}

function setup(options: { refuse?: boolean; ensureFails?: boolean } = {}) {
  const { port, watchers, missing } = fakePort(options);
  const notices: { subscriberId: number; event: WorkspaceScratchChangedEvent }[] = [];
  const ensured: string[] = [];
  const hub = new WorkspaceScratchWatchHub({
    notify: (subscriberId, event) => notices.push({ subscriberId, event }),
    ensureFolder: async (rootPath) => {
      if (options.ensureFails) throw new Error("linked folder");
      ensured.push(rootPath);
      return path.join(rootPath, ".stave", "scratch");
    },
    port,
    debounceMs: 10,
  });
  return { hub, watchers, missing, notices, ensured };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("WorkspaceScratchWatchHub", () => {
  test("one watcher per folder, shared by subscribers and closed when the last leaves", async () => {
    const { hub, watchers, ensured } = setup();
    expect(await hub.subscribe(1, "/ws/a")).toEqual({ watching: true });
    expect(await hub.subscribe(2, "/ws/a/")).toEqual({ watching: true });
    expect(watchers).toHaveLength(1);
    expect(watchers[0]!.directory).toBe(path.join("/ws/a", ".stave", "scratch"));
    expect(ensured).toEqual([path.resolve("/ws/a")]);
    expect(hub.subscriberCount("/ws/a")).toBe(2);

    hub.unsubscribe(1, "/ws/a");
    expect(watchers[0]!.closed).toBe(false);
    hub.unsubscribe(2, "/ws/a");
    expect(watchers[0]!.closed).toBe(true);
    expect(hub.watchedRoots()).toEqual([]);

    // A later subscriber starts a fresh watcher.
    await hub.subscribe(3, "/ws/a");
    expect(watchers).toHaveLength(2);
    expect(watchers[1]!.closed).toBe(false);
  });

  test("a closed window drops all of its subscriptions", async () => {
    const { hub, watchers } = setup();
    await hub.subscribe(7, "/ws/a");
    await hub.subscribe(7, "/ws/b");
    await hub.subscribe(8, "/ws/b");
    hub.removeSubscriber(7);
    expect(watchers.map((watcher) => watcher.closed)).toEqual([true, false]);
    expect(hub.watchedRoots()).toEqual([path.resolve("/ws/b")]);
  });

  test("a burst of writes becomes one notice per debounce window, to every subscriber", async () => {
    const { hub, watchers, notices } = setup();
    await hub.subscribe(1, "/ws/a");
    await hub.subscribe(2, "/ws/a");
    for (let index = 0; index < 20; index += 1) watchers[0]!.onChange();
    await wait(30);
    expect(notices).toEqual([
      { subscriberId: 1, event: { rootPath: path.resolve("/ws/a"), watching: true } },
      { subscriberId: 2, event: { rootPath: path.resolve("/ws/a"), watching: true } },
    ]);
    watchers[0]!.onChange();
    await wait(30);
    expect(notices).toHaveLength(4);
  });

  test("no notice after the last subscriber left during the debounce", async () => {
    const { hub, watchers, notices } = setup();
    await hub.subscribe(1, "/ws/a");
    watchers[0]!.onChange();
    hub.unsubscribe(1, "/ws/a");
    await wait(30);
    expect(notices).toEqual([]);
  });

  test("falls back when the platform refuses a recursive watcher or the folder is refused", async () => {
    const refused = setup({ refuse: true });
    expect(await refused.hub.subscribe(1, "/ws/a")).toEqual({ watching: false });
    const linked = setup({ ensureFails: true });
    expect(await linked.hub.subscribe(1, "/ws/a")).toEqual({ watching: false });
    expect(linked.watchers).toHaveLength(0);
  });

  test("a failing watcher tells subscribers to poll, and a new subscription tries again", async () => {
    const { hub, watchers, notices } = setup();
    await hub.subscribe(1, "/ws/a");
    watchers[0]!.onError();
    expect(watchers[0]!.closed).toBe(true);
    expect(notices).toEqual([{ subscriberId: 1, event: { rootPath: path.resolve("/ws/a"), watching: false } }]);
    expect(await hub.subscribe(2, "/ws/a")).toEqual({ watching: true });
    expect(watchers).toHaveLength(2);
  });

  test("a removed scratch folder stops the watch instead of reporting changes", async () => {
    const { hub, watchers, missing, notices } = setup();
    await hub.subscribe(1, "/ws/a");
    missing.add(watchers[0]!.directory);
    watchers[0]!.onChange();
    await wait(30);
    expect(watchers[0]!.closed).toBe(true);
    expect(notices.map((notice) => notice.event.watching)).toEqual([false]);
  });
});

describe("nodeScratchWatchPort", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });

  test("watches a real folder recursively and refuses a missing one", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "stave-scratch-watch-"));
    roots.push(root);
    await mkdir(path.join(root, "agents", "a1"), { recursive: true });
    const onChange = mock(() => {});
    const handle = nodeScratchWatchPort.watch(root, onChange, () => {});
    try {
      // Recursive watching is unavailable on some platforms: then null is the contract.
      if (handle) {
        await wait(50);
        await writeFile(path.join(root, "agents", "a1", "out.log"), "x");
        for (let attempt = 0; attempt < 40 && onChange.mock.calls.length === 0; attempt += 1) await wait(25);
        expect(onChange.mock.calls.length).toBeGreaterThan(0);
      }
    } finally {
      handle?.close();
    }
    expect(nodeScratchWatchPort.watch(path.join(root, "missing"), () => {}, () => {})).toBeNull();
    expect(await nodeScratchWatchPort.isDirectory(root)).toBe(true);
    await symlink(root, path.join(root, "..", `${path.basename(root)}-link`));
    roots.push(path.join(root, "..", `${path.basename(root)}-link`));
    expect(await nodeScratchWatchPort.isDirectory(path.join(root, "..", `${path.basename(root)}-link`))).toBe(false);
  });
});
