import { describe, expect, it } from "bun:test";
import {
  formatLensSplitGutterEdges,
  resolveLensSplitGutterEdges,
} from "@/lib/lens/lens-split-gutters";

describe("resolveLensSplitGutterEdges", () => {
  it("reserves no gutter for a Lens that owns the whole grid", () => {
    expect(
      resolveLensSplitGutterEdges([
        {
          orientation: "horizontal",
          hasPrecedingView: false,
          hasFollowingView: false,
        },
      ]),
    ).toEqual([]);
  });

  it("reserves the leading edge for a Lens split to the right of a task", () => {
    expect(
      resolveLensSplitGutterEdges([
        {
          orientation: "horizontal",
          hasPrecedingView: true,
          hasFollowingView: false,
        },
      ]),
    ).toEqual(["left"]);
  });

  it("reserves both edges of a Lens wedged between two views", () => {
    expect(
      resolveLensSplitGutterEdges([
        {
          orientation: "vertical",
          hasPrecedingView: true,
          hasFollowingView: true,
        },
      ]),
    ).toEqual(["top", "bottom"]);
  });

  it("merges boundaries contributed by enclosing grid branches", () => {
    // Lens stacked below a terminal inside the right-hand column: the leaf
    // split view only knows about the horizontal neighbour above it, while the
    // column itself sits to the right of the task pane.
    expect(
      resolveLensSplitGutterEdges([
        {
          orientation: "vertical",
          hasPrecedingView: true,
          hasFollowingView: false,
        },
        {
          orientation: "horizontal",
          hasPrecedingView: true,
          hasFollowingView: false,
        },
      ]),
    ).toEqual(["top", "left"]);
  });

  it("ignores split views with an unknown orientation", () => {
    expect(
      resolveLensSplitGutterEdges([
        {
          orientation: null,
          hasPrecedingView: true,
          hasFollowingView: true,
        },
      ]),
    ).toEqual([]);
  });
});

describe("formatLensSplitGutterEdges", () => {
  it("emits a whitespace list the CSS `~=` operator can match", () => {
    expect(formatLensSplitGutterEdges(["top", "left"])).toBe("top left");
    expect(formatLensSplitGutterEdges([])).toBe("");
  });
});
