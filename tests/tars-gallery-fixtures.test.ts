import { describe, expect, test } from "bun:test";
import { buildTarsGalleryFixtures } from "../src/dev/tars-preview/tars-gallery-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { TarsConversationSchema, TarsMessageSchema, tarsMessageView } from "../src/lib/tars/conversation";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { projectTarsPublishProposals } from "../src/lib/tars/publish-model";
import { selectTarsActivityNotices } from "../src/lib/tars/flow-model";
import { TarsSnapshotSchema } from "../src/lib/tars/types";

const START = new Date("2026-11-05T00:00:00.000Z");

function gallery(korean: boolean) {
  return buildTarsGalleryFixtures({ start: START, korean, tray: buildTarsTrayFixtures(START), side: buildTarsSideViewFixtures(START) });
}

describe("Tars preview gallery", () => {
  for (const korean of [false, true]) test(`every saved shape parses (${korean ? "ko" : "en"})`, () => {
    const { conversation, responsibilities, pendingDecisions, followUps } = gallery(korean);
    for (const message of conversation.messages) expect(TarsMessageSchema.safeParse(message).error).toBeUndefined();
    const view = { ...conversation, messages: conversation.messages.map(tarsMessageView) };
    expect(TarsConversationSchema.safeParse(view).error).toBeUndefined();
    expect(TarsSnapshotSchema.safeParse({ runtime: "desktop", identity: { id: "personal", name: "Tars", instructions: "", updatedAt: START.toISOString() },
      responsibilities, pendingDecisions, followUps }).error).toBeUndefined();
    // Conversation order is time order, so the transcript reads the cases in the order they were written.
    const times = conversation.messages.map((message) => message.createdAt);
    expect(times).toEqual([...times].sort());
  });

  test("the projection gives each card the state its case names", () => {
    const { conversation, responsibilities } = gallery(false);
    const decisions = projectTarsDecisions({ messages: conversation.messages, receipts: conversation.receipts, records: conversation.records,
      answers: conversation.answers ?? [], activity: conversation.activity, responsibilities });
    const state = (id: string) => decisions.find((view) => view.id === id);
    // Every waiting confirmation is live and offered; none was superseded by a later proposal.
    for (const code of ["f1", "f2", "f3", "f6", "f8", "f9", "f10"]) expect(state(`confirm:g-${code}:0`)).toMatchObject({ state: "waiting", checked: true });
    for (const code of ["f4", "f5", "f7"]) for (const index of [0, 1]) expect(state(`confirm:g-${code}:${index}`)).toMatchObject({ state: "waiting", checked: true });
    expect(state("confirm:g-e1:0")?.answer?.status).toBe("applied");
    expect(state("confirm:g-e2:0")).toMatchObject({ state: "answered", answer: null, record: { source: "fleet" } });
    expect(state("confirm:g-e3:0")?.answer?.status).toBe("rejected");
    expect(state("confirm:g-e4:0")?.answer?.status).toBe("pending");
    expect(state("confirm:g-e5:0")).toMatchObject({ state: "retired", why: "superseded" });
    expect(state("confirm:g-e7:0")?.delivery?.status).toBe("queued");
    expect(state("ask:g-g1:0")?.answer?.messageId).toBe("g-g1-answer");
    expect(state("ask:g-g2:0")?.answer?.source).toBe("words");
    expect(state("ask:g-g3:0")).toMatchObject({ state: "retired", why: "movedOn" });
    expect(state("ask:g-g4:0")).toMatchObject({ state: "invalid", why: "targetMoved", reasked: true });
    expect(state("ask:g-g5:0")).toMatchObject({ state: "invalid", why: "targetEnded" });
    expect(state("ask:g-g6:0")).toMatchObject({ state: "retired", why: "settled" });
    expect(state("unverified:gallery-audit:3")).toMatchObject({ state: "waiting", failure: { status: "rejected" } });
    // The one question still waiting is the newest message, so a short answer binds to it.
    expect(state("ask:g-m:0")).toMatchObject({ state: "waiting", latest: true, checked: true });
    expect(decisions.filter((view) => view.state === "waiting" && view.kind === "ask")).toHaveLength(1);
  });

  test("notices and publish proposals take their case's state", () => {
    const { conversation, responsibilities } = gallery(false);
    expect(selectTarsActivityNotices(conversation.activity, conversation.records).map((notice) => notice.kind)).toEqual(["completed", "blocked", "cancelled", "blocked"]);
    const proposals = projectTarsPublishProposals({ receipts: conversation.receipts, publications: conversation.publications ?? [], responsibilities });
    expect(proposals.map((view) => [view.messageId, view.state])).toEqual([["g-l1", "waiting"], ["g-l2", "invalid"], ["g-l4", "settled"]]);
  });
});
