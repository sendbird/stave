import { describe, expect, test } from "bun:test";
import {
  canSteerQueuedTurnItem,
  describeQueuedTurnAttachments,
  describeQueueLine,
  describeTurnRunLabel,
  reorderQueuedTurns,
  resolveQueuedTurnActions,
  resolveShelfDetailHost,
  resolveShelfDetailOpen,
  resolveShelfRunControls,
  resolveShelfRunKey,
  resolveShelfRunSource,
  resolveShelfTurnAlert,
  resolveTurnRunHeadline,
  resolveTurnRunTone,
  resolveVisibleQueuedTurns,
  selectComposerShelfRows,
  summarizeShelfTodos,
} from "@/components/session/composer-shelf/composer-shelf.utils";
import { defaultSettings } from "@/store/app-settings";
import type { PromptDraftQueuedTurn } from "@/types/chat";

const item = (id: string, patch: Partial<PromptDraftQueuedTurn> = {}): PromptDraftQueuedTurn => ({
  id,
  queuedAt: "2026-10-02T09:00:00.000Z",
  content: `message ${id}`,
  attachedFilePaths: [],
  attachments: [],
  ...patch,
});

describe("composer shelf rows", () => {
  test("an active run heads the line for its whole life, the turns it starts included", () => {
    expect(resolveShelfRunSource({ missionActive: true, turnVisible: true })).toBe("mission");
    expect(resolveShelfRunSource({ missionActive: true, turnVisible: false })).toBe("mission");
    expect(resolveShelfRunSource({ missionActive: false, turnVisible: true })).toBe("turn");
    expect(resolveShelfRunSource({ missionActive: false, turnVisible: false })).toBeNull();
  });

  test("stacks the run line over the queue line, and takes no room when nothing is in flight", () => {
    expect(selectComposerShelfRows({ run: null, queueCount: 0 })).toEqual([]);
    expect(selectComposerShelfRows({ run: "turn", queueCount: 0 })).toEqual(["run"]);
    expect(selectComposerShelfRows({ run: "mission", queueCount: 2 })).toEqual(["run", "queue"]);
    // A queue left after Stop keeps the shelf up on its own.
    expect(selectComposerShelfRows({ run: null, queueCount: 1 })).toEqual(["queue"]);
  });
});

describe("where details open", () => {
  test("the placement picks the detail host; the line itself never moves", () => {
    expect(resolveShelfDetailHost("docked")).toBe("inline");
    expect(resolveShelfDetailHost("floating")).toBe("floating");
    expect(resolveShelfDetailHost("panel")).toBe("panel");
  });

  test("inline and floating get a toggle and keep the panel button only when wide", () => {
    expect(resolveShelfRunControls({ detailHost: "inline", canExpand: true, canOpenPanel: true })).toEqual({
      detailToggle: "inline",
      panelButton: "wide",
    });
    expect(resolveShelfRunControls({ detailHost: "floating", canExpand: true, canOpenPanel: true })).toEqual({
      detailToggle: "floating",
      panelButton: "wide",
    });
  });

  test("the panel button is the only way in, and never dropped, when nothing else opens details", () => {
    expect(resolveShelfRunControls({ detailHost: "panel", canExpand: true, canOpenPanel: true })).toEqual({
      detailToggle: null,
      panelButton: "always",
    });
    // An agent run between turns has no list to unfold.
    expect(resolveShelfRunControls({ detailHost: "inline", canExpand: false, canOpenPanel: true })).toEqual({
      detailToggle: null,
      panelButton: "always",
    });
  });

  test("details start collapsed by default", () => {
    expect(defaultSettings.turnActivityExpandedByDefault).toBe(false);
    expect(resolveShelfDetailOpen({ override: undefined, runKey: "turn:t1", expandedByDefault: false })).toBe(false);
    expect(resolveShelfDetailOpen({ override: undefined, runKey: "turn:t1", expandedByDefault: true })).toBe(true);
  });

  test("a manual toggle lasts for its run; the next run starts from the setting again", () => {
    const override = { runKey: "turn:t1", open: true };
    expect(resolveShelfDetailOpen({ override, runKey: "turn:t1", expandedByDefault: false })).toBe(true);
    expect(resolveShelfDetailOpen({ override, runKey: "turn:t2", expandedByDefault: false })).toBe(false);
    expect(resolveShelfDetailOpen({ override, runKey: null, expandedByDefault: false })).toBe(false);
  });

  test("an agent run keys the toggle on the run, so it survives the run's turns", () => {
    expect(resolveShelfRunKey({ missionId: "m1", turnId: "t1" })).toBe("mission:m1");
    expect(resolveShelfRunKey({ missionId: "m1", turnId: "t2" })).toBe("mission:m1");
    expect(resolveShelfRunKey({ missionId: null, turnId: "t1" })).toBe("turn:t1");
    expect(resolveShelfRunKey({ missionId: null, turnId: null })).toBeNull();
  });
});

describe("turn run line", () => {
  const base = {
    pendingInteraction: null,
    isStalled: false,
    steering: false,
    turnError: null,
    turnErrorRecoverable: false,
    completed: false,
  } as const;

  test("stalled, steering, a retry and a failure are tones of the one line", () => {
    expect(resolveTurnRunTone(base)).toBe("active");
    expect(resolveTurnRunTone({ ...base, isStalled: true })).toBe("stalled");
    expect(resolveTurnRunTone({ ...base, steering: true })).toBe("steering");
    expect(resolveTurnRunTone({ ...base, turnError: "429", turnErrorRecoverable: true })).toBe("retrying");
    expect(resolveTurnRunTone({ ...base, turnError: "boom", completed: true })).toBe("failed");
    expect(resolveTurnRunTone({ ...base, completed: true })).toBe("done");
  });

  test("waiting on you outranks every other tone", () => {
    expect(
      resolveTurnRunTone({ ...base, pendingInteraction: "approval", isStalled: true, steering: true }),
    ).toBe("waiting");
    expect(describeTurnRunLabel("waiting", "approval")).toBe("Waiting for approval");
    expect(describeTurnRunLabel("waiting", "user_input")).toBe("Waiting for your input");
    expect(describeTurnRunLabel("active", null)).toBe("Working");
    expect(describeTurnRunLabel("stalled", null)).toBe("Stalled");
  });

  test("names the current step, and does not ask what the card above already asks", () => {
    const shared = {
      pendingInteraction: null,
      hasPendingInteractionCard: false,
      turnError: null,
      idleLabel: null,
      countsHeadline: null,
      isPlanPreparing: false,
    } as const;
    expect(
      resolveTurnRunHeadline({
        ...shared,
        tone: "active",
        featured: { title: "Edit file", detail: "src/ChatInput.tsx" },
      }),
    ).toEqual({ text: "Edit file", detail: "src/ChatInput.tsx", live: true });
    expect(
      resolveTurnRunHeadline({
        ...shared,
        tone: "waiting",
        pendingInteraction: "approval",
        hasPendingInteractionCard: true,
        featured: null,
      }).text,
    ).toBeNull();
    expect(
      resolveTurnRunHeadline({ ...shared, tone: "waiting", pendingInteraction: "approval", featured: null }).text,
    ).toBe("Review to continue");
    expect(
      resolveTurnRunHeadline({ ...shared, tone: "stalled", idleLabel: "2m 14s", featured: null }),
    ).toMatchObject({ text: "No updates for 2m 14s", live: false });
    expect(
      resolveTurnRunHeadline({
        ...shared,
        tone: "active",
        countsHeadline: "2 running · 1 done",
        featured: { title: "Agent A" },
      }).text,
    ).toBe("2 running · 1 done");
  });

  test("to-do progress is a count and one cell per item, scaled past ten", () => {
    expect(summarizeShelfTodos([{ status: "in_progress" }])).toBeNull();
    expect(
      summarizeShelfTodos([
        { status: "completed" },
        { status: "completed" },
        { status: "in_progress" },
        { status: "pending" },
      ]),
    ).toEqual({ done: 2, total: 4, segments: ["done", "done", "active", "pending"] });
    const many = summarizeShelfTodos([
      ...Array.from({ length: 10 }, () => ({ status: "completed" as const })),
      { status: "in_progress" as const },
      ...Array.from({ length: 9 }, () => ({ status: "pending" as const })),
    ]);
    expect(many?.done).toBe(10);
    expect(many?.total).toBe(20);
    expect(many?.segments).toHaveLength(10);
    expect(many?.segments.filter((segment) => segment === "done")).toHaveLength(5);
    expect(many?.segments[5]).toBe("active");
  });
});

describe("turn alert under an agent run", () => {
  const NOW = 1_000_000;
  const live = {
    completedAt: undefined,
    lastEventAt: NOW - 134_000,
    pendingInteraction: null,
    stalledAt: null,
    turnError: undefined,
    turnErrorRecoverable: undefined,
  };

  test("an ordinary turn leaves the run's line alone", () => {
    expect(resolveShelfTurnAlert({ activity: null, steering: false, now: NOW })).toBeNull();
    expect(resolveShelfTurnAlert({ activity: live, steering: false, now: NOW })).toBeNull();
    // Waiting on a card is the card's to ask, and done is the run's to say.
    expect(
      resolveShelfTurnAlert({
        activity: { ...live, stalledAt: NOW - 1, pendingInteraction: "approval" },
        steering: false,
        now: NOW,
      }),
    ).toBeNull();
    expect(resolveShelfTurnAlert({ activity: { ...live, completedAt: NOW }, steering: false, now: NOW })).toBeNull();
  });

  test("a stall says how long it has been quiet and how to break it, in the turn line's words", () => {
    expect(
      resolveShelfTurnAlert({ activity: { ...live, stalledAt: NOW - 44_000 }, steering: false, now: NOW }),
    ).toEqual({
      tone: "stalled",
      label: "Stalled",
      text: "No updates for 2m 14s",
      detail: "Esc stops it, or send a message to interrupt and continue",
    });
  });

  test("a steer in flight, a provider retry and a failure each say so", () => {
    expect(resolveShelfTurnAlert({ activity: live, steering: true, now: NOW })).toMatchObject({
      tone: "steering",
      label: "Steering",
      text: "Waiting for the provider to accept your message",
    });
    expect(
      resolveShelfTurnAlert({
        activity: { ...live, turnError: "Overloaded, retrying in 4s", turnErrorRecoverable: true },
        steering: false,
        now: NOW,
      }),
    ).toMatchObject({ tone: "retrying", label: "Retrying", text: "Overloaded, retrying in 4s" });
    expect(
      resolveShelfTurnAlert({
        activity: { ...live, turnError: "Provider stream failed", completedAt: NOW },
        steering: false,
        now: NOW,
      }),
    ).toMatchObject({ tone: "failed", label: "Failed", text: "Provider stream failed" });
  });
});

describe("queue line", () => {
  test("Steer belongs to a live turn and Send to an idle composer; never both", () => {
    const shared = { disabled: false, storedCount: 2, hasSteerHandler: true, hasSendHandler: true } as const;
    expect(
      resolveQueuedTurnActions({ ...shared, submitMode: "steer-or-queue", isTurnActive: true, canSteerQueuedTurn: true }),
    ).toEqual({ canSteer: true, canSend: false });
    expect(
      resolveQueuedTurnActions({ ...shared, submitMode: "send", isTurnActive: false, canSteerQueuedTurn: false }),
    ).toEqual({ canSteer: false, canSend: true });
    expect(
      resolveQueuedTurnActions({ ...shared, submitMode: "queue-next", isTurnActive: true, canSteerQueuedTurn: false }),
    ).toEqual({ canSteer: false, canSend: false });
    // A blocked composer, or a legacy item with no id to dispatch, offers neither.
    expect(
      resolveQueuedTurnActions({ ...shared, disabled: true, submitMode: "send", isTurnActive: false, canSteerQueuedTurn: false }),
    ).toEqual({ canSteer: false, canSend: false });
    expect(
      resolveQueuedTurnActions({ ...shared, storedCount: 0, submitMode: "send", isTurnActive: false, canSteerQueuedTurn: false }),
    ).toEqual({ canSteer: false, canSend: false });
  });

  test("an older build's single queued message still shows", () => {
    expect(
      resolveVisibleQueuedTurns({
        queuedTurns: [],
        queuedNextTurn: { queuedAt: "2026-10-01T00:00:00.000Z", content: "legacy follow-up" },
      }),
    ).toMatchObject([{ id: "legacy-2026-10-01T00:00:00.000Z", content: "legacy follow-up" }]);
    expect(resolveVisibleQueuedTurns({ queuedTurns: [], queuedNextTurn: { queuedAt: "x", content: "  " } })).toEqual([]);
    const stored = [item("a")];
    expect(resolveVisibleQueuedTurns({ queuedTurns: stored, queuedNextTurn: null })).toBe(stored);
  });

  test("the collapsed line counts, previews the next one and offers its one action", () => {
    const items = [item("a", { content: "  fix   the\ntest " }), item("b")];
    expect(
      describeQueueLine({ items, actions: { canSteer: true, canSend: false }, isTurnActive: true }),
    ).toMatchObject({ countLabel: "2 queued", preview: "fix the test", frontAction: "steer" });
    // Attachments cannot ride a steer, so the front item waits instead.
    const withFile = [item("a", { attachedFilePaths: ["README.md"] })];
    expect(canSteerQueuedTurnItem(withFile[0]!)).toBe(false);
    expect(
      describeQueueLine({ items: withFile, actions: { canSteer: true, canSend: false }, isTurnActive: true })
        ?.frontAction,
    ).toBeNull();
    expect(
      describeQueueLine({ items, actions: { canSteer: false, canSend: true }, isTurnActive: false }),
    ).toMatchObject({ frontAction: "send", hint: "Send one now, or it sends after your next message finishes." });
    expect(describeQueueLine({ items: [], actions: { canSteer: false, canSend: false }, isTurnActive: false })).toBeNull();
  });

  test("attachments read as a count", () => {
    expect(describeQueuedTurnAttachments(item("a"))).toBeNull();
    expect(
      describeQueuedTurnAttachments(
        item("a", {
          attachedFilePaths: ["a.ts", "b.ts"],
          attachments: [{ kind: "image", id: "i", dataUrl: "data:image/png;base64,", label: "x.png" }],
        }),
      ),
    ).toBe("2 files · 1 image");
  });

  test("reorders by id, so a list that changed during the drag is not written back stale", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(reorderQueuedTurns(items, { sourceId: "c", targetId: "a", edge: "top" }).map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(reorderQueuedTurns(items, { sourceId: "a", targetId: "c", edge: "bottom" }).map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    // A dropped item that has meanwhile been dispatched leaves the list as it is.
    expect(reorderQueuedTurns(items, { sourceId: "gone", targetId: "a", edge: "top" })).toBe(items);
    expect(reorderQueuedTurns(items, { sourceId: "a", targetId: "b", edge: "top" })).toBe(items);
  });
});
