import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AutoRoutingProfileList,
  resolveNextProfile,
} from "@/components/ai-elements/auto-routing-profile-list";
import {
  buildStarterProfile,
  cloneProfileAsCustom,
  CUSTOM_PROFILE_ID,
} from "@/lib/providers/auto-routing-profile";

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    location: { href: "https://stave.test/workspace" },
  } as unknown;
}

describe("resolveNextProfile", () => {
  test("switching to a starter keeps the eligible-model allowlist", () => {
    const profile = {
      ...buildStarterProfile("starter-balanced"),
      eligibleModelsByProvider: { "claude-code": ["claude-opus-5"] },
    };

    const next = resolveNextProfile({ profile, id: "starter-quality-first" });

    expect(next?.stance).toBe("quality-first");
    // The allowlist is a provider preference, not part of the stance, so it
    // must survive a stance switch made from the composer.
    expect(next?.eligibleModelsByProvider).toEqual({
      "claude-code": ["claude-opus-5"],
    });
  });

  test("switching to a starter adopts that stance's budget guard", () => {
    const profile = buildStarterProfile("starter-balanced");

    const next = resolveNextProfile({ profile, id: "starter-cost-saver" });

    expect(next?.budgetGuard).toEqual(
      buildStarterProfile("starter-cost-saver").budgetGuard,
    );
  });

  test("choosing Custom from a starter clones it into a user-owned copy", () => {
    const profile = buildStarterProfile("starter-quality-first");

    const next = resolveNextProfile({ profile, id: CUSTOM_PROFILE_ID });

    expect(next).not.toBeNull();
    expect(next?.id).not.toBe("starter-quality-first");
    // The clone keeps the stance it was cloned from rather than resetting.
    expect(next?.stance).toBe("quality-first");
  });

  test("choosing Custom when custom is already live is a no-op", () => {
    const profile = cloneProfileAsCustom(
      buildStarterProfile("starter-balanced"),
    );

    // Re-cloning would discard the edits the user made to their own copy.
    expect(resolveNextProfile({ profile, id: CUSTOM_PROFILE_ID })).toBeNull();
  });
});

describe("AutoRoutingProfileList", () => {
  test("lists the default Balanced profile first", () => {
    setWindowContext();

    const html = renderToStaticMarkup(
      createElement(AutoRoutingProfileList, {
        available: true,
        selected: true,
        onChoose: () => {},
      }),
    );

    for (const label of ["Cost-saver", "Balanced", "Quality-first", "Custom"]) {
      expect(html).toContain(label);
    }
    expect(html.indexOf("Balanced")).toBeLessThan(html.indexOf("Cost-saver"));
    expect(html.indexOf("Cost-saver")).toBeLessThan(
      html.indexOf("Quality-first"),
    );
    expect(html.indexOf("Quality-first")).toBeLessThan(html.indexOf("Custom"));
  });

  test("warns and disables the rows when Auto routing is off", () => {
    setWindowContext();

    const html = renderToStaticMarkup(
      createElement(AutoRoutingProfileList, {
        available: false,
        selected: false,
        onChoose: () => {},
      }),
    );

    expect(html).toContain("Auto routing is turned off");
    expect(html).toContain("disabled");
  });

  test("shows the routed rule the Auto option carries", () => {
    setWindowContext();

    const html = renderToStaticMarkup(
      createElement(AutoRoutingProfileList, {
        description: "Implement rule fired — long prompt, 6 files",
        available: true,
        selected: true,
        onChoose: () => {},
      }),
    );

    expect(html).toContain("Implement rule fired");
  });
});
