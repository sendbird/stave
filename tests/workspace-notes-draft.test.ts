import { afterEach, describe, expect, test } from "bun:test";
import {
  clearNotesDraft,
  readNotesDraft,
  resolveNotesCommit,
  writeNotesDraft,
} from "@/components/layout/workspace-information/notes-draft";

afterEach(() => {
  clearNotesDraft("ws-a");
  clearNotesDraft("ws-b");
});

describe("workspace notes drafts", () => {
  test("a draft outlives the editor and stays with its workspace", () => {
    writeNotesDraft("ws-a", { text: "half-written", baseNotes: "saved" });
    expect(readNotesDraft("ws-a")).toEqual({
      text: "half-written",
      baseNotes: "saved",
    });
    expect(readNotesDraft("ws-b")).toBeNull();
  });

  test("clearing one workspace's draft leaves the other", () => {
    writeNotesDraft("ws-a", { text: "a", baseNotes: "" });
    writeNotesDraft("ws-b", { text: "b", baseNotes: "" });
    clearNotesDraft("ws-a");
    expect(readNotesDraft("ws-a")).toBeNull();
    expect(readNotesDraft("ws-b")?.text).toBe("b");
  });

  test("ignores a draft without a workspace", () => {
    writeNotesDraft("", { text: "x", baseNotes: "" });
    expect(readNotesDraft("")).toBeNull();
  });
});

describe("resolveNotesCommit", () => {
  test("saves when the notes did not move underneath", () => {
    expect(
      resolveNotesCommit({ draft: "new", baseNotes: "old", currentNotes: "old" }),
    ).toBe("save");
  });

  test("asks when the notes changed while editing", () => {
    expect(
      resolveNotesCommit({
        draft: "mine",
        baseNotes: "old",
        currentNotes: "agent wrote this",
      }),
    ).toBe("conflict");
  });

  test("has nothing to save when the draft equals the current notes", () => {
    expect(
      resolveNotesCommit({ draft: "same", baseNotes: "old", currentNotes: "same" }),
    ).toBe("unchanged");
  });
});
