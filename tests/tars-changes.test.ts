import { Database } from "bun:sqlite";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsChangeBatcher } from "../electron/persistence/tars-changes";
import type { TarsChangeScope } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const input = { requestId: "change", title: "Fix search", instruction: "Fix and verify search.", acceptanceCriteria: ["Search works"],
  workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" as const };
const databases: Database[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function open(filename = ":memory:") {
  const database = new Database(filename); databases.push(database);
  database.exec("PRAGMA busy_timeout = 1000");
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  const seen: TarsChangeScope[][] = [];
  store.onChange((scopes) => seen.push([...scopes]));
  conversations.onChange((scopes) => seen.push([...scopes]));
  return { database, store, conversations, seen };
}
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("Tars stores report their writes", () => {
  test("responsibility, identity and activity writes report the snapshot and the timeline; replays report nothing", () => {
    const f = open();
    const created = f.store.create(input, NOW);
    expect(f.seen.splice(0).flat().sort()).toEqual(["conversation", "snapshot"]);
    f.store.create(input, NOW);
    expect(f.seen).toEqual([]);
    // Only a state or detail change journals activity.
    f.store.patch(created.id, created.revision, { priority: 70 }, NOW);
    expect(f.seen.splice(0).flat()).toEqual(["snapshot"]);
    f.store.updateIdentity({ name: "My Tars", instructions: "" }, NOW);
    expect(f.seen.splice(0).flat()).toEqual(["snapshot"]);
    expect(f.seen).toEqual([]);
  });

  test("messages report the conversation; receipts also report the snapshot's pending decisions; click records the conversation", () => {
    const f = open();
    const row = f.store.create(input, NOW);
    f.seen.length = 0;
    f.conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const queued = f.conversations.create({ requestId: "message", text: "Resume it" }, NOW);
    const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
    const action = { kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation: "cancel" as const };
    const answered = f.conversations.answer(claimed.id, claimed.revision, { reply: "Confirm to cancel.", actions: [action] }, NOW);
    expect(f.seen.splice(0)).toEqual([["conversation"], ["conversation"], ["conversation"], ["conversation"]]);
    const receipt = f.conversations.recordReceipt(answered.id, answered.revision, 0, action, NOW);
    f.conversations.settleReceipt(answered.id, 0, receipt.revision, { status: "proposed" }, NOW);
    expect(f.seen.splice(0)).toEqual([["conversation", "snapshot"], ["conversation", "snapshot"]]);
    f.conversations.recordAction({ requestId: "click", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause", source: "click" }, NOW);
    f.conversations.rejectAction("click", "stale", "The responsibility changed.", NOW);
    expect(f.seen.splice(0)).toEqual([["conversation"], ["conversation"]]);
  });

  test("a failing listener never fails the write", () => {
    const f = open();
    f.store.onChange(() => { throw new Error("listener broke"); });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(f.store.create(input, NOW).title).toBe("Fix search");
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  test("the batcher reports each scope once, after the transaction commits, so another connection reads the change", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-tars-changes-")); directories.push(directory);
    const filename = path.join(directory, "store.sqlite");
    const writer = open(filename);
    const reader = new TarsStore((() => { const database = new Database(filename); databases.push(database); return database; })());
    const reports: Array<{ scope: TarsChangeScope; responsibilities: number; identity: string }> = [];
    const notify = createTarsChangeBatcher((scope) => {
      const snapshot = reader.snapshot();
      reports.push({ scope, responsibilities: snapshot.responsibilities.length, identity: snapshot.identity.name });
    });
    writer.store.onChange(notify);
    writer.conversations.onChange(notify);
    writer.database.transaction(() => {
      const row = writer.store.create(input, NOW);
      writer.store.patch(row.id, row.revision, { state: "paused" }, NOW);
      writer.store.updateIdentity({ name: "Committed", instructions: "" }, NOW);
      // Nothing is reported while the transaction is open.
      expect(reports).toEqual([]);
    }).immediate();
    expect(reports).toEqual([]);
    await flush();
    expect(reports).toEqual([
      { scope: "conversation", responsibilities: 1, identity: "Committed" },
      { scope: "snapshot", responsibilities: 1, identity: "Committed" },
    ]);
    // A later write is a new batch.
    writer.conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    await flush();
    expect(reports.map((report) => report.scope)).toEqual(["conversation", "snapshot", "conversation"]);
  });
});

describe("main forwards Tars changes to every renderer", () => {
  test("host events are validated before forwarding, and main's own writes are batched", () => {
    const source = `
      import { mock } from "bun:test";
      const sent = [];
      let hostListener;
      const contents = (destroyed) => ({ isDestroyed: () => destroyed, send: (channel, payload) => sent.push([channel, payload]) });
      mock.module("electron", () => ({ webContents: { getAllWebContents: () => [contents(false), contents(true)] } }));
      mock.module("./electron/main/host-service-client", () => ({
        onHostServiceEvent: (name, listener) => { if (name === "tars.changed") hostListener = listener; return () => {}; } }));
      const { ensureTarsEventBridge, notifyTarsChanged } = await import("./electron/main/tars-events");
      ensureTarsEventBridge(); ensureTarsEventBridge();
      hostListener({ scope: "snapshot" });
      hostListener({ scope: "everything" });
      hostListener({ scope: "conversation", secret: "x" });
      hostListener(null);
      notifyTarsChanged(["conversation"]); notifyTarsChanged(["conversation", "snapshot"]);
      await Promise.resolve();
      console.log(JSON.stringify(sent));
    `;
    const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual([
      ["tars:changed", { scope: "snapshot" }],
      ["tars:changed", { scope: "conversation" }],
      ["tars:changed", { scope: "snapshot" }],
    ]);
  });
});
