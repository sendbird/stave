import { beforeEach, expect, test } from "bun:test";
import {
  formatScratchJson,
  isScratchFileFresh,
  scratchDisplayName,
  scratchPreviewKind,
} from "../src/lib/workspace-scratch-view";
import {
  selectScratchHasUnseen,
  useWorkspaceScratchStore,
} from "../src/store/workspace-scratch-store";

beforeEach(() => {
  useWorkspaceScratchStore.setState({ listingByWorkspace: {}, seenMtimeByWorkspace: {} });
});

test("each file gets the preview its extension calls for", () => {
  expect(scratchPreviewKind(".stave/scratch/lens/shot.PNG")).toBe("image");
  expect(scratchPreviewKind(".stave/scratch/api.json")).toBe("json");
  expect(scratchPreviewKind(".stave/scratch/tests.log")).toBe("log");
  expect(scratchPreviewKind(".stave/scratch/notes.md")).toBe("text");
  expect(scratchPreviewKind(".stave/scratch/README")).toBe("text");
  expect(scratchPreviewKind(".stave/scratch/archive.zip")).toBe("other");
  expect(scratchDisplayName(".stave/scratch/lens/shot.png")).toBe("lens/shot.png");
});

test("JSON is pretty-printed; anything that is not one JSON value stays as written", () => {
  expect(formatScratchJson('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  expect(formatScratchJson('{"a":1}\n{"a":2}\n')).toBe('{"a":1}\n{"a":2}\n');
});

test("a file stays new for 15 seconds", () => {
  expect(isScratchFileFresh({ mtimeMs: 100_000 }, 114_999)).toBe(true);
  expect(isScratchFileFresh({ mtimeMs: 100_000 }, 115_000)).toBe(false);
});

test("a listing that draws the same is not stored again", () => {
  const store = useWorkspaceScratchStore.getState();
  const listing = {
    files: [{ path: ".stave/scratch/a.log", sizeBytes: 1, mtimeMs: Date.now() + 60_000 }],
    fileCount: 1,
    totalBytes: 1,
    truncated: false,
  };
  expect(store.applyListing("ws", listing)).toBe(true);
  const stored = useWorkspaceScratchStore.getState().listingByWorkspace.ws;
  expect(store.applyListing("ws", { ...listing, files: [...listing.files] })).toBe(false);
  expect(useWorkspaceScratchStore.getState().listingByWorkspace.ws).toBe(stored);
  expect(store.applyListing("ws", { ...listing, files: [{ ...listing.files[0]!, sizeBytes: 2 }], totalBytes: 2 })).toBe(true);
});

test("the rail dot shows a file newer than the user saw, and clears once seen", () => {
  const store = useWorkspaceScratchStore.getState();
  const newest = Date.now() + 60_000;
  store.applyListing("ws", {
    files: [{ path: ".stave/scratch/a.log", sizeBytes: 1, mtimeMs: newest }],
    fileCount: 1,
    totalBytes: 1,
    truncated: false,
  });
  expect(selectScratchHasUnseen(useWorkspaceScratchStore.getState(), "ws")).toBe(true);
  store.markSeen("ws", newest);
  expect(selectScratchHasUnseen(useWorkspaceScratchStore.getState(), "ws")).toBe(false);
  // Files from before this session never light it.
  store.applyListing("old", {
    files: [{ path: ".stave/scratch/b.log", sizeBytes: 1, mtimeMs: 1_000 }],
    fileCount: 1,
    totalBytes: 1,
    truncated: false,
  });
  expect(selectScratchHasUnseen(useWorkspaceScratchStore.getState(), "old")).toBe(false);
});
