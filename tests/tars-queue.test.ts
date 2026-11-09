import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { reprioritizeTars } from "../electron/host-service/tars-queue";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { TarsActionRecordSchema, TarsConversationSchema, type TarsQueueMove } from "../src/lib/tars/conversation";
import { compareTarsQueue, planTarsQueueMove, tarsQueueDropMove, type TarsQueueRow } from "../src/lib/tars/queue-order";
import type { TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const row = (id: string, priority: number, minutes = 0): TarsQueueRow => ({ id, priority, createdAt: at(minutes) });
const orderOf = (rows: readonly TarsQueueRow[]) => [...rows].sort(compareTarsQueue).map((entry) => entry.id);
function applyPlan(rows: readonly TarsQueueRow[], id: string, move: TarsQueueMove) {
  const plan = planTarsQueueMove(rows, id, move);
  if (!plan.ok) throw new Error(plan.reason);
  const next = new Map(plan.changes.map((change) => [change.id, change.priority]));
  return { plan, rows: rows.map((entry) => next.has(entry.id) ? { ...entry, priority: next.get(entry.id)! } : entry) };
}

describe("queue order math", () => {
  test("Do first lands between the two neighbors, at the middle, and changes no other row", () => {
    const rows = [row("a", 80), row("b", 60), row("c", 50)];
    const { plan, rows: moved } = applyPlan(rows, "c", { direction: "earlier" });
    expect(plan.changes).toEqual([{ id: "c", priority: 70 }]);
    expect(orderOf(moved)).toEqual(["a", "c", "b"]);
  });

  test("moves to either end go ten past the neighbor", () => {
    expect(applyPlan([row("a", 60), row("b", 50)], "b", { direction: "earlier" }).plan.changes).toEqual([{ id: "b", priority: 70 }]);
    expect(applyPlan([row("a", 60), row("b", 50)], "a", { direction: "later" }).plan.changes).toEqual([{ id: "a", priority: 40 }]);
    // Clamped to the 0..100 range.
    expect(applyPlan([row("a", 95), row("b", 50)], "b", { direction: "earlier" }).plan.changes).toEqual([{ id: "b", priority: 100 }]);
    expect(applyPlan([row("a", 4), row("b", 3)], "a", { direction: "later" }).plan.changes).toEqual([{ id: "a", priority: 0 }]);
  });

  test("Do later lands behind the next queued work", () => {
    const { plan, rows: moved } = applyPlan([row("a", 80), row("b", 60), row("c", 50)], "a", { direction: "later" });
    expect(plan.changes).toEqual([{ id: "a", priority: 55 }]);
    expect(orderOf(moved)).toEqual(["b", "a", "c"]);
  });

  test("an equal priority is enough when the oldest-first rule already orders the pair", () => {
    // `b` is older than `c`, so b at 50 runs before c at 50; moving `c` earlier than `b` needs 51.
    const { plan, rows: moved } = applyPlan([row("a", 90), row("b", 50, 1), row("c", 50, 2)], "c", { direction: "earlier" });
    expect(plan.changes).toHaveLength(1);
    expect(orderOf(moved)).toEqual(["a", "c", "b"]);
    // An older row moving later can share the priority of the newer row it passes... only if that row stays ahead by age.
    const older = applyPlan([row("x", 51, 0), row("y", 50, 5), row("z", 10, 6)], "x", { direction: "later" });
    expect(older.plan.changes).toHaveLength(1);
    expect(orderOf(older.rows)).toEqual(["y", "x", "z"]);
  });

  test("without a gap it renumbers as few other rows as it can, in one plan", () => {
    // All equal: the oldest-first rule orders them, so no priority alone moves the oldest behind the next.
    const ties = [row("a", 50, 0), row("b", 50, 1), row("c", 50, 2)];
    const moved = applyPlan(ties, "a", { direction: "later" });
    expect(orderOf(moved.rows)).toEqual(["b", "a", "c"]);
    expect(moved.plan.changes.filter((change) => change.id !== "a")).toHaveLength(1);
    expect(moved.plan.changes[0]!.id).toBe("a");
    // Pinned at the top of the range.
    const top = [row("a", 100, 0), row("b", 100, 1), row("c", 100, 2)];
    const raised = applyPlan(top, "c", { direction: "earlier" });
    expect(orderOf(raised.rows)).toEqual(["a", "c", "b"]);
    expect(raised.plan.changes.filter((change) => change.id !== "c")).toHaveLength(1);
    for (const change of [...moved.plan.changes, ...raised.plan.changes]) expect(change.priority).toBeGreaterThanOrEqual(0);
    for (const change of raised.plan.changes) expect(change.priority).toBeLessThanOrEqual(100);
  });

  test("refuses moves past the ends, unknown work and a drop target that moved to the other side", () => {
    const rows = [row("a", 80), row("b", 60), row("c", 50)];
    expect(planTarsQueueMove(rows, "a", { direction: "earlier" })).toEqual({ ok: false, reason: "queueEdge" });
    expect(planTarsQueueMove(rows, "c", { direction: "later" })).toEqual({ ok: false, reason: "queueEdge" });
    expect(planTarsQueueMove(rows, "missing", { direction: "later" })).toEqual({ ok: false, reason: "notQueued" });
    expect(planTarsQueueMove(rows, "a", { direction: "earlier", relativeTo: "c" })).toEqual({ ok: false, reason: "stale" });
    expect(planTarsQueueMove(rows, "a", { direction: "later", relativeTo: "gone" })).toEqual({ ok: false, reason: "stale" });
  });

  test("a move relative to other queued work lands directly before or after it", () => {
    const rows = [row("a", 90), row("b", 70), row("c", 50), row("d", 30)];
    expect(orderOf(applyPlan(rows, "d", { direction: "earlier", relativeTo: "a" }).rows)).toEqual(["d", "a", "b", "c"]);
    expect(orderOf(applyPlan(rows, "a", { direction: "later", relativeTo: "c" }).rows)).toEqual(["b", "c", "a", "d"]);
  });

  test("random queues: every plan yields the asked order within 0..100, changing only the moved row whenever a gap exists", () => {
    let seed = 7;
    const random = (limit: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % limit; };
    for (let trial = 0; trial < 400; trial++) {
      const size = 2 + random(7);
      const rows = Array.from({ length: size }, (_, index) => row(`r${index}`, random(4) === 0 ? 100 : random(101), random(5)));
      const order = orderOf(rows);
      const from = random(size);
      const id = order[from]!;
      const direction = random(2) === 0 ? "earlier" as const : "later" as const;
      const anchorIndex = direction === "earlier" ? random(from + 1) - 1 : from + 1 + random(size - from);
      const relative = random(2) === 0 && anchorIndex >= 0 && anchorIndex < size && anchorIndex !== from ? order[anchorIndex] : undefined;
      const move: TarsQueueMove = relative ? { direction, relativeTo: relative } : { direction };
      const plan = planTarsQueueMove(rows, id, move);
      const edge = !relative && (direction === "earlier" ? from === 0 : from === size - 1);
      if (edge) { expect(plan).toEqual({ ok: false, reason: "queueEdge" }); continue; }
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      const anchor = relative ?? order[direction === "earlier" ? from - 1 : from + 1]!;
      const rest = order.filter((entry) => entry !== id);
      const expected = [...rest];
      expected.splice(rest.indexOf(anchor) + (direction === "earlier" ? 0 : 1), 0, id);
      const next = new Map(plan.changes.map((change) => [change.id, change.priority]));
      const moved = rows.map((entry) => next.has(entry.id) ? { ...entry, priority: next.get(entry.id)! } : entry);
      expect(orderOf(moved)).toEqual(expected);
      for (const change of plan.changes) { expect(change.priority).toBeGreaterThanOrEqual(0); expect(change.priority).toBeLessThanOrEqual(100); }
      expect(plan.changes[0]!.id).toBe(id);
    }
  });

  test("a drop becomes the move to the queued work it lands next to, or nothing when it would not move", () => {
    const rows = [row("a", 90), row("b", 70), row("c", 50), row("d", 30)];
    expect(tarsQueueDropMove(rows, "a", "c", "bottom")).toEqual({ direction: "later", relativeTo: "c" });
    expect(tarsQueueDropMove(rows, "a", "c", "top")).toEqual({ direction: "later", relativeTo: "b" });
    expect(tarsQueueDropMove(rows, "d", "b", "top")).toEqual({ direction: "earlier", relativeTo: "b" });
    expect(tarsQueueDropMove(rows, "d", "a", "bottom")).toEqual({ direction: "earlier", relativeTo: "b" });
    expect(tarsQueueDropMove(rows, "b", "a", "bottom")).toBeNull();
    expect(tarsQueueDropMove(rows, "b", "c", "top")).toBeNull();
    expect(tarsQueueDropMove(rows, "b", "b", "top")).toBeNull();
  });
});

describe("queue moves through the host", () => {
  const databases: Database[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  function fixture() {
    const database = new Database(":memory:"); databases.push(database);
    const conversations = new TarsConversationStore(database);
    const responsibilities = new TarsStore(database);
    let registry = [{ repositoryPath: "/tmp/repository", workspaces: [{ id: "source" }] }] as PersistenceRepositoryRegistryEntry[];
    let ticks = 0;
    const ports = { conversations, responsibilities, now: () => NOW, readRegistry: () => registry, requestTick: () => { ticks++; } };
    const create = (id: string, priority: number, minutes: number, overrides: Partial<TarsResponsibility> = {}) => responsibilities.create({
      requestId: `request-${id}`, title: `Work ${id}`, instruction: "Do it.", acceptanceCriteria: ["Done"], workspaceId: "source",
      repositoryPath: "/tmp/repository", providerId: "codex", model: null, priority, ...overrides,
    }, at(minutes));
    const queue = () => responsibilities.snapshot().responsibilities.filter((entry) => entry.state === "queued").map((entry) => entry.title);
    return { database, conversations, responsibilities, ports, create, queue, ticks: () => ticks, setRegistry: (next: PersistenceRepositoryRegistryEntry[]) => { registry = next; } };
  }

  test("Do first moves the work ahead of the next queued item, records one click line, and a retry applies once", async () => {
    const f = fixture();
    const a = f.create("a", 80, 0); f.create("b", 60, 1); const c = f.create("c", 50, 2);
    const input = { requestId: "move-1", responsibilityId: c.id, expectedRevision: c.revision, move: { direction: "earlier" as const }, source: "click" as const };
    const result = await reprioritizeTars(input, f.ports);
    expect(result.record).toMatchObject({ requestId: "move-1", source: "click", status: "applied", priority: 70, reason: null,
      action: { kind: "move", responsibilityId: c.id, expectedRevision: c.revision, move: { direction: "earlier" } } });
    expect(f.queue()).toEqual(["Work a", "Work c", "Work b"]);
    // Only the moved row changed.
    expect(f.responsibilities.get(a.id)).toEqual(a);
    expect(f.responsibilities.get(c.id)).toMatchObject({ priority: 70, revision: c.revision + 1, state: "queued" });
    expect(result.snapshot.responsibilities.find((entry) => entry.id === c.id)?.priority).toBe(70);
    expect(f.ticks()).toBe(1);
    // The same request again changes nothing more.
    const replay = await reprioritizeTars(input, f.ports);
    expect(replay.record).toEqual(result.record);
    expect(f.responsibilities.get(c.id)?.revision).toBe(c.revision + 1);
    // The record is one conversation line, never a message.
    const records = f.conversations.listActions();
    expect(records).toHaveLength(1);
    expect(TarsConversationSchema.shape.records.parse(records)).toEqual(records);
    // Reusing the request ID for another move is refused.
    await expect(reprioritizeTars({ ...input, move: { direction: "later" } }, f.ports)).rejects.toThrow("different action");
  });

  test("refuses with a reason: an outdated view, started work, unknown work, the queue's end and a removed workspace", async () => {
    const f = fixture();
    const a = f.create("a", 80, 0); const b = f.create("b", 60, 1);
    const refuse = async (requestId: string, input: Partial<{ responsibilityId: string; expectedRevision: number; move: TarsQueueMove }>) =>
      (await reprioritizeTars({ requestId, responsibilityId: b.id, expectedRevision: b.revision, move: { direction: "earlier" }, source: "click", ...input }, f.ports)).record;
    expect(await refuse("stale", { expectedRevision: b.revision + 1 })).toMatchObject({ status: "rejected", reason: "stale" });
    expect(await refuse("unknown", { responsibilityId: "missing" })).toMatchObject({ status: "rejected", reason: "notOwned" });
    expect(await refuse("edge", { responsibilityId: a.id, expectedRevision: a.revision })).toMatchObject({ status: "rejected", reason: "queueEdge" });
    f.setRegistry([]);
    expect(await refuse("scope", {})).toMatchObject({ status: "rejected", reason: "outOfScope" });
    f.setRegistry([{ repositoryPath: "/tmp/repository", workspaces: [{ id: "source" }] }] as PersistenceRepositoryRegistryEntry[]);
    const running = f.responsibilities.patch(b.id, b.revision, { state: "running" }, NOW);
    expect(await refuse("running", { expectedRevision: running.revision })).toMatchObject({ status: "rejected", reason: "notQueued" });
    expect(f.responsibilities.get(a.id)).toEqual(a);
    expect(f.ticks()).toBe(0);
    for (const record of f.conversations.listActions()) expect(TarsActionRecordSchema.parse(record)).toEqual(record);
  });

  test("a renumber is one admitted operation: every row moves with the record, or none does", async () => {
    const f = fixture();
    const a = f.create("a", 50, 0); const b = f.create("b", 50, 1); const c = f.create("c", 50, 2);
    f.database.exec(`CREATE TRIGGER refuse_applied_move BEFORE UPDATE ON tars_action_records
      WHEN json_extract(NEW.body_json, '$.status') = 'applied'
      BEGIN SELECT RAISE(ABORT, 'Record storage refused the move'); END;`);
    const input = { requestId: "renumber", responsibilityId: a.id, expectedRevision: a.revision, move: { direction: "later" as const }, source: "click" as const };
    expect((await reprioritizeTars(input, f.ports)).record).toMatchObject({ status: "rejected", reason: "unknown" });
    expect([f.responsibilities.get(a.id), f.responsibilities.get(b.id), f.responsibilities.get(c.id)]).toEqual([a, b, c]);
    f.database.exec("DROP TRIGGER refuse_applied_move");
    const retried = await reprioritizeTars({ ...input, requestId: "renumber-2" }, f.ports);
    expect(retried.record.status).toBe("applied");
    expect(f.queue()).toEqual(["Work b", "Work a", "Work c"]);
  });

  test("a drag records its source and lands directly before the work it was dropped on", async () => {
    const f = fixture();
    const a = f.create("a", 90, 0); f.create("b", 70, 1); const c = f.create("c", 50, 2);
    const result = await reprioritizeTars({ requestId: "drag-1", responsibilityId: c.id, expectedRevision: c.revision,
      move: { direction: "earlier", relativeTo: a.id }, source: "drag" }, f.ports);
    expect(result.record).toMatchObject({ source: "drag", status: "applied", action: { move: { direction: "earlier", relativeTo: a.id } } });
    expect(f.queue()).toEqual(["Work c", "Work a", "Work b"]);
  });

  test("words take the same admission: a refused reprioritize decision carries the reason code", async () => {
    const f = fixture();
    const row = f.create("a", 50, 0);
    f.conversations.configure({ providerId: "codex", model: "chosen", maxTurns: 7 });
    let sequence = 0;
    const answer = (priority: number, expectedRevision: number) => {
      const queued = f.conversations.create({ requestId: `words-${sequence++}`, text: "Do that one first." }, NOW);
      const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
      return f.conversations.answer(claimed.id, claimed.revision, { reply: "Moved.", actions: [{ kind: "reprioritize", responsibilityId: row.id, expectedRevision, priority }] }, NOW);
    };
    const ports = { ...f.ports, control: () => { throw new Error("No control in this test."); } };
    const stale = answer(90, row.revision + 1);
    expect((await applyTarsDecision({ messageId: stale.id, expectedRevision: stale.revision }, ports))[0]).toMatchObject({ status: "rejected", reason: "stale" });
    const running = f.responsibilities.patch(row.id, row.revision, { state: "running" }, NOW);
    const started = answer(90, running.revision);
    expect((await applyTarsDecision({ messageId: started.id, expectedRevision: started.revision }, ports))[0]).toMatchObject({ status: "rejected", reason: "notQueued" });
  });
});
