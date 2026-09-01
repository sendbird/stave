import { describe, expect, test } from "bun:test";
import {
  selectEvictableLensGuests,
  type LensGuestEvictionCandidate,
} from "../src/lib/lens/lens-guest-eviction";

function candidate(
  overrides: Partial<LensGuestEvictionCandidate> & { lensSessionId: string },
): LensGuestEvictionCandidate {
  return {
    workspaceId: "workspace-1",
    visible: false,
    managedByMcp: false,
    closing: false,
    lastVisibleAt: 0,
    createdSequence: 0,
    ...overrides,
  };
}

const ids = (sessions: ReadonlyArray<LensGuestEvictionCandidate>) =>
  sessions.map((session) => session.lensSessionId);

describe("selectEvictableLensGuests", () => {
  test("evicts nothing while the hidden count is within the cap", () => {
    const sessions = [
      candidate({ lensSessionId: "a", createdSequence: 1 }),
      candidate({ lensSessionId: "b", createdSequence: 2 }),
      candidate({ lensSessionId: "c", createdSequence: 3 }),
    ];
    expect(selectEvictableLensGuests(sessions, { maxHidden: 3 })).toEqual([]);
  });

  test("evicts only the surplus, least recently presented first", () => {
    const sessions = [
      candidate({ lensSessionId: "recent", lastVisibleAt: 9 }),
      candidate({ lensSessionId: "oldest", lastVisibleAt: 1 }),
      candidate({ lensSessionId: "middle", lastVisibleAt: 5 }),
      candidate({ lensSessionId: "older", lastVisibleAt: 3 }),
      candidate({ lensSessionId: "newer", lastVisibleAt: 7 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 3 }))).toEqual([
      "oldest",
      "older",
    ]);
  });

  test("ranks never-presented sessions by creation order", () => {
    // They all carry lastVisibleAt 0, so without the tie-break the victim is
    // whatever the registry happens to yield first.
    const sessions = [
      candidate({ lensSessionId: "third", createdSequence: 3 }),
      candidate({ lensSessionId: "first", createdSequence: 1 }),
      candidate({ lensSessionId: "second", createdSequence: 2 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 1 }))).toEqual([
      "first",
      "second",
    ]);
  });

  test("prefers a never-presented session over one that was shown", () => {
    const sessions = [
      candidate({ lensSessionId: "shown", lastVisibleAt: 4 }),
      candidate({ lensSessionId: "never", createdSequence: 99 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 1 }))).toEqual([
      "never",
    ]);
  });

  test("never evicts a visible session", () => {
    const sessions = [
      candidate({ lensSessionId: "visible", visible: true, lastVisibleAt: 1 }),
      candidate({ lensSessionId: "hidden-a", lastVisibleAt: 2 }),
      candidate({ lensSessionId: "hidden-b", lastVisibleAt: 3 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 1 }))).toEqual([
      "hidden-a",
    ]);
  });

  test("never evicts an agent-driven session", () => {
    // An agent opens a session no panel is showing and then keeps addressing
    // it; reclaiming that is reclaiming the thing it is working on.
    const sessions = [
      candidate({ lensSessionId: "mcp", managedByMcp: true }),
      candidate({ lensSessionId: "hidden", lastVisibleAt: 5 }),
      candidate({ lensSessionId: "hidden-2", lastVisibleAt: 6 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 1 }))).toEqual([
      "hidden",
    ]);
  });

  test("never evicts a session already closing", () => {
    const sessions = [
      candidate({ lensSessionId: "closing", closing: true }),
      candidate({ lensSessionId: "hidden", lastVisibleAt: 5 }),
      candidate({ lensSessionId: "hidden-2", lastVisibleAt: 6 }),
    ];
    expect(ids(selectEvictableLensGuests(sessions, { maxHidden: 1 }))).toEqual([
      "hidden",
    ]);
  });

  test("spares the exempt session even when it ranks first", () => {
    // The cap runs when a guest binds, and a freshly bound guest is hidden
    // until its panel reports otherwise — so it is the best candidate there is.
    const sessions = [
      candidate({ lensSessionId: "just-bound", createdSequence: 1 }),
      candidate({ lensSessionId: "older", createdSequence: 2 }),
      candidate({ lensSessionId: "oldest", createdSequence: 3 }),
    ];
    expect(
      ids(
        selectEvictableLensGuests(sessions, {
          maxHidden: 1,
          exempt: { workspaceId: "workspace-1", lensSessionId: "just-bound" },
        }),
      ),
    ).toEqual(["older"]);
  });

  test("the exempt match is scoped to a workspace", () => {
    // The first Lens tab in every workspace reuses the id `default`, so an
    // id-only match would spare a session in a workspace nobody is looking at.
    const sessions = [
      candidate({
        workspaceId: "workspace-2",
        lensSessionId: "default",
        createdSequence: 1,
      }),
      candidate({ lensSessionId: "default", createdSequence: 2 }),
    ];
    expect(
      selectEvictableLensGuests(sessions, {
        maxHidden: 0,
        exempt: { workspaceId: "workspace-1", lensSessionId: "default" },
      }).map((session) => session.workspaceId),
    ).toEqual(["workspace-2"]);
  });

  test("counts guests across workspaces", () => {
    // Switching workspaces leaves every Lens tab's session open behind it, so
    // a per-workspace cap would not bound anything.
    const sessions = [
      candidate({ workspaceId: "w1", lensSessionId: "a", createdSequence: 1 }),
      candidate({ workspaceId: "w2", lensSessionId: "a", createdSequence: 2 }),
      candidate({ workspaceId: "w3", lensSessionId: "a", createdSequence: 3 }),
    ];
    expect(
      selectEvictableLensGuests(sessions, { maxHidden: 2 }).map(
        (session) => session.workspaceId,
      ),
    ).toEqual(["w1"]);
  });
});
