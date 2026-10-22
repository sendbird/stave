import { afterEach, describe, expect, test } from "bun:test";
import {
  EMPTY_FLEET_ATTENTION,
  publishFleetAttention,
  useFleetAttentionStore,
} from "@/store/fleet-attention-store";

afterEach(() => {
  useFleetAttentionStore.setState({ snapshot: EMPTY_FLEET_ATTENTION });
});

describe("Fleet attention store", () => {
  test("claims nothing before the producer has published", () => {
    const { snapshot } = useFleetAttentionStore.getState();
    expect(snapshot.queueStatus).toBe("checking");
    expect(snapshot.count).toBe(0);
  });

  test("every reader sees the one published snapshot", () => {
    const published = {
      ...EMPTY_FLEET_ATTENTION,
      count: 2,
      queueStatus: "next" as const,
    };
    publishFleetAttention(published);
    expect(useFleetAttentionStore.getState().snapshot).toBe(published);
    // Publishing the same snapshot again does not notify subscribers.
    let notified = 0;
    const unsubscribe = useFleetAttentionStore.subscribe(() => {
      notified += 1;
    });
    publishFleetAttention(published);
    unsubscribe();
    expect(notified).toBe(0);
  });
});

describe("publishing while a turn streams", () => {
  const item = (id: string, workspaceId: string, kind: "approval" | "result-ready" = "approval") => ({
    id, kind, priority: kind === "approval" ? 1 : 4, repositoryPath: "/tmp/project", repositoryName: "project",
    workspaceId, workspaceName: workspaceId, taskId: `task-${id}`, createdAt: "2026-10-22T00:00:00.000Z",
    source: "live" as const, resultReview: kind === "result-ready"
      ? { repositoryPath: "/tmp/project", workspaceId, taskId: `task-${id}`, turnId: `turn-${id}` } as never
      : undefined,
  });
  // What the producer builds on every pass: new objects even when nothing changed.
  const snapshotOf = (items: ReturnType<typeof item>[]) => {
    const byWorkspace: Record<string, ReturnType<typeof item>[]> = {};
    for (const entry of items) (byWorkspace[entry.workspaceId] ??= []).push(entry);
    return {
      ...EMPTY_FLEET_ATTENTION,
      items, count: items.length, queueStatus: "next" as const,
      blockingItems: items.filter((entry) => entry.kind === "approval"),
      reviewItems: items.filter((entry) => entry.kind !== "approval"),
      attentionItemsByWorkspaceId: byWorkspace,
      highestAttentionByWorkspaceId: Object.fromEntries(Object.entries(byWorkspace).map(([key, list]) => [key, list[0]])),
      inbox: {
        itemEntries: items.map((entry) => ({ id: entry.id, item: entry, notifications: [], kind: entry.kind,
          tier: "blocking" as const, title: entry.id, detail: null, repositoryPath: entry.repositoryPath,
          repositoryName: entry.repositoryName, workspaceId: entry.workspaceId, workspaceName: entry.workspaceName,
          taskId: entry.taskId, at: entry.createdAt, unread: false, error: false })),
        unlinkedEntries: [], historyEntries: [],
        entryByItemId: new Map(items.map((entry) => [entry.id, entry])),
      },
    } as never;
  };

  test("a pass that changes nothing publishes nothing", () => {
    publishFleetAttention(snapshotOf([item("a", "ws-1"), item("b", "ws-2", "result-ready")]));
    const first = useFleetAttentionStore.getState().snapshot;
    let notified = 0;
    const unsubscribe = useFleetAttentionStore.subscribe(() => {
      notified += 1;
    });
    publishFleetAttention(snapshotOf([item("a", "ws-1"), item("b", "ws-2", "result-ready")]));
    unsubscribe();
    expect(notified).toBe(0);
    expect(useFleetAttentionStore.getState().snapshot).toBe(first);
  });

  test("a change keeps the references of every slice it did not touch", () => {
    publishFleetAttention(snapshotOf([item("a", "ws-1"), item("b", "ws-2", "result-ready")]));
    const first = useFleetAttentionStore.getState().snapshot;
    publishFleetAttention(snapshotOf([item("a", "ws-1"), item("b", "ws-2", "result-ready"), item("c", "ws-3")]));
    const next = useFleetAttentionStore.getState().snapshot;
    expect(next).not.toBe(first);
    expect(next.items).toHaveLength(3);
    expect(next.items[0]).toBe(first.items[0]);
    expect(next.reviewItems).toBe(first.reviewItems);
    expect(next.attentionItemsByWorkspaceId["ws-1"]).toBe(first.attentionItemsByWorkspaceId["ws-1"]);
    expect(next.attentionItemsByWorkspaceId["ws-2"]).toBe(first.attentionItemsByWorkspaceId["ws-2"]);
    expect(next.highestAttentionByWorkspaceId["ws-1"]).toBe(first.highestAttentionByWorkspaceId["ws-1"]);
    expect(next.inbox.itemEntries[0]).toBe(first.inbox.itemEntries[0]);
    expect(next.inbox.unlinkedEntries).toBe(first.inbox.unlinkedEntries);
  });
});
