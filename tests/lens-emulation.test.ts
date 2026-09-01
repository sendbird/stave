import { describe, expect, test } from "bun:test";
import {
  EMPTY_LENS_APPEARANCE,
  isLensAppearanceEmpty,
  planLensAppearanceCommands,
  resolveLensAppearanceState,
} from "../src/lib/lens/lens-emulation";

describe("resolveLensAppearanceState", () => {
  test("applies a single feature", () => {
    const state = resolveLensAppearanceState(EMPTY_LENS_APPEARANCE, {
      colorScheme: "dark",
    });
    expect(state).toEqual({ colorScheme: "dark", reducedMotion: null });
  });

  test("is incremental, so one feature does not clear the other", () => {
    // Asking for reduced motion must not silently drop a colour scheme set two
    // calls ago; the page the agent would then be reading is one no request
    // described.
    const dark = resolveLensAppearanceState(EMPTY_LENS_APPEARANCE, {
      colorScheme: "dark",
    });
    const both = resolveLensAppearanceState(dark, { reducedMotion: "reduce" });

    expect(both).toEqual({ colorScheme: "dark", reducedMotion: "reduce" });
    expect(
      resolveLensAppearanceState(both, { colorScheme: "light" }).reducedMotion,
    ).toBe("reduce");
  });

  test("reset clears every feature", () => {
    const both = resolveLensAppearanceState(EMPTY_LENS_APPEARANCE, {
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    expect(resolveLensAppearanceState(both, { reset: true })).toEqual(
      EMPTY_LENS_APPEARANCE,
    );
  });

  test("an empty request changes nothing", () => {
    const dark = resolveLensAppearanceState(EMPTY_LENS_APPEARANCE, {
      colorScheme: "dark",
    });
    expect(resolveLensAppearanceState(dark, {})).toEqual(dark);
  });
});

describe("isLensAppearanceEmpty", () => {
  test("distinguishes no override from any override", () => {
    expect(isLensAppearanceEmpty(EMPTY_LENS_APPEARANCE)).toBe(true);
    expect(
      isLensAppearanceEmpty({ colorScheme: "light", reducedMotion: null }),
    ).toBe(false);
    expect(
      isLensAppearanceEmpty({ colorScheme: null, reducedMotion: "reduce" }),
    ).toBe(false);
  });
});

describe("planLensAppearanceCommands", () => {
  test("emulates the requested features as media features", () => {
    expect(
      planLensAppearanceCommands({
        colorScheme: "dark",
        reducedMotion: "reduce",
      }),
    ).toEqual([
      {
        method: "Emulation.setEmulatedMedia",
        params: {
          features: [
            { name: "prefers-color-scheme", value: "dark" },
            { name: "prefers-reduced-motion", value: "reduce" },
          ],
        },
      },
    ]);
  });

  test("an empty state still issues the call, with an empty feature list", () => {
    // `Emulation.setEmulatedMedia` has no separate clear. Omitting the call
    // would leave the previous override in place for the life of the session.
    expect(planLensAppearanceCommands(EMPTY_LENS_APPEARANCE)).toEqual([
      { method: "Emulation.setEmulatedMedia", params: { features: [] } },
    ]);
  });
});
