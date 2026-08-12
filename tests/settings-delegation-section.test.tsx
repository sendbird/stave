import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsDelegationSection } from "@/components/layout/settings-dialog-delegation-section";

describe("Settings → Providers → Delegation", () => {
  const html = renderToStaticMarkup(createElement(SettingsDelegationSection));

  test("names the capability that has no arming control", () => {
    // Delegation is the one agent-driven capability with no pill to discover,
    // so the card has to say what it is and how it is triggered.
    expect(html).toContain("Delegation (child tasks)");
    expect(html).toContain("stave_delegate_task");
    expect(html).toContain("There is no button");
  });

  test("lists every parameter with whether it is required", () => {
    for (const parameter of [
      "provider",
      "permissionProfile",
      "lifecycle",
      "workspace",
      "model",
      "effort",
    ]) {
      expect(html).toContain(parameter);
    }
    expect(html).toContain("required");
    expect(html).toContain("optional");
    // The defaults matter more than the names: an omitted effort is the case
    // users hit without realising they made a choice.
    expect(html).toContain("Defaults to medium");
  });

  test("reports availability per provider rather than claiming readiness", () => {
    // No `window.api` in this environment, so the status read never resolves —
    // the card must say it is checking instead of asserting either state.
    expect(html).toContain("Checking");
    expect(html).toContain("Claude tasks:");
    expect(html).toContain("Codex tasks:");
  });
});
