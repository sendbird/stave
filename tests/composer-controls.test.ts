import { describe, expect, test } from "bun:test";
import {
  collectActiveComposerControls,
  composerControlPlacementOptions,
  normalizeComposerControlPlacements,
  partitionComposerFrameToolbar,
  resolveComposerControlLayout,
} from "../src/lib/composer-controls";

describe("normalizeComposerControlPlacements", () => {
  test("returns an empty map for non-object input", () => {
    expect(normalizeComposerControlPlacements(null)).toEqual({});
    expect(normalizeComposerControlPlacements("secrets")).toEqual({});
    expect(normalizeComposerControlPlacements(["secrets"])).toEqual({});
  });

  test("drops unknown control ids and unknown placements", () => {
    expect(
      normalizeComposerControlPlacements({
        secrets: "hidden",
        notAControl: "hidden",
        review: "somewhere-else",
      }),
    ).toEqual({ secrets: "hidden" });
  });

  test("drops the retired Advisor and Worker placements", () => {
    expect(
      normalizeComposerControlPlacements({ advisor: "hidden", worker: "overflow", review: "overflow" }),
    ).toEqual({ review: "overflow" });
  });

  test("keeps the map sparse so a control added later defaults to visible", () => {
    expect(
      normalizeComposerControlPlacements({
        secrets: "toolbar",
        review: "overflow",
      }),
    ).toEqual({ review: "overflow" });
  });

  test("degrades overflow to toolbar for controls with no tray position", () => {
    // Fast lives inside the model popover, so "overflow" would resolve to no
    // rendered position at all — visible is the safe reading.
    expect(normalizeComposerControlPlacements({ fast: "overflow" })).toEqual(
      {},
    );
    expect(normalizeComposerControlPlacements({ fast: "hidden" })).toEqual({
      fast: "hidden",
    });
  });

  test("offers only toolbar and hidden for fast", () => {
    expect(composerControlPlacementOptions("fast")).toEqual([
      "toolbar",
      "hidden",
    ]);
    expect(composerControlPlacementOptions("secrets")).toEqual([
      "toolbar",
      "overflow",
      "hidden",
    ]);
  });
});

describe("collectActiveComposerControls", () => {
  test("reports nothing at rest", () => {
    expect(
      collectActiveComposerControls({
        planMode: false,
        thinkingMode: "adaptive",
        runtimeTone: "default",
        boundSecretCount: 0,
      }),
    ).toEqual([]);
  });

  test("treats a forced-off thinking mode as active, not as rest", () => {
    expect(
      collectActiveComposerControls({ thinkingMode: "disabled" }),
    ).toContain("thinking");
    expect(
      collectActiveComposerControls({ thinkingMode: "enabled" }),
    ).toContain("thinking");
  });

  test("reports the states that cost money or change the next turn", () => {
    expect(
      collectActiveComposerControls({
        planMode: true,
        fastMode: true,
        runtimeTone: "warning",
        boundSecretCount: 2,
      }),
    ).toEqual(["plan", "fast", "secrets", "runtime"]);
  });
});

describe("resolveComposerControlLayout", () => {
  test("puts every available control on the toolbar by default", () => {
    const layout = resolveComposerControlLayout({ placements: {} });
    expect(layout.overflow).toEqual([]);
    expect(layout.hidden).toEqual([]);
    expect(layout.forced).toEqual([]);
    expect(layout.toolbar).toContain("secrets");
  });

  test("routes configured controls into the tray and out of sight", () => {
    const layout = resolveComposerControlLayout({
      placements: { review: "overflow", compare: "hidden" },
    });
    expect(layout.overflow).toEqual(["review"]);
    expect(layout.hidden).toEqual(["compare"]);
    expect(layout.toolbar).not.toContain("review");
    expect(layout.toolbar).not.toContain("compare");
  });

  test("pulls a demoted control back onto the toolbar while it is active", () => {
    // Bound secrets change what the next turn can reach; hiding the control
    // must not hide that.
    const layout = resolveComposerControlLayout({
      placements: { secrets: "hidden", thinking: "overflow" },
      activeIds: ["secrets", "thinking"],
    });
    expect(layout.toolbar).toContain("secrets");
    expect(layout.toolbar).toContain("thinking");
    expect(layout.hidden).toEqual([]);
    expect(layout.overflow).toEqual([]);
    expect(layout.forced).toEqual(["thinking", "secrets"]);
  });

  test("still reports the configured placement while a control is forced", () => {
    const layout = resolveComposerControlLayout({
      placements: { secrets: "hidden" },
      activeIds: ["secrets"],
    });
    // The editor has to show what the user chose, not the temporary promotion.
    expect(layout.placementById.secrets).toBe("hidden");
  });

  test("excludes controls that have nothing to render this frame", () => {
    const layout = resolveComposerControlLayout({
      placements: { review: "overflow" },
      unavailableIds: ["review", "thinking"],
    });
    expect(layout.overflow).toEqual([]);
    expect(layout.toolbar).not.toContain("thinking");
    expect(layout.hidden).toEqual([]);
  });

  test("an unavailable control is not force-promoted by a stale active flag", () => {
    const layout = resolveComposerControlLayout({
      placements: { secrets: "hidden" },
      activeIds: ["secrets"],
      unavailableIds: ["secrets"],
    });
    expect(layout.toolbar).not.toContain("secrets");
    expect(layout.forced).toEqual([]);
  });
});

describe("partitionComposerFrameToolbar", () => {
  test("keeps provider-owned settings in the wing and Stave tooling in the bar", () => {
    expect(
      partitionComposerFrameToolbar([
        "plan",
        "fast",
        "secrets",
        "runtime",
        "review",
        "macro",
        "thinking",
      ]),
    ).toEqual({
      left: [],
      right: ["plan", "thinking"],
      // Order is the caller's; the real toolbar is built in id order, which
      // puts the runtime readout last.
      status: ["secrets", "runtime", "review", "macro"],
    });
  });

  test("returns empty wings when the toolbar only has card-owned controls", () => {
    expect(partitionComposerFrameToolbar(["fast"])).toEqual({
      left: [],
      right: [],
      status: [],
    });
  });
});
