import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsDelegationSection } from "@/components/layout/settings-dialog-delegation-section";

describe("Settings → Providers → Delegation", () => {
  const html = renderToStaticMarkup(createElement(SettingsDelegationSection));

  test("names the capability that has no arming control", () => {
    // Delegation is the one agent-driven capability with no pill to discover,
    // so the card says what it is and how it is triggered.
    expect(html).toContain("Delegated tasks");
    expect(html).toContain("There is no switch to turn on");
  });

  test("keeps the helper limits and drops the parameter reference", () => {
    expect(html).toContain('data-testid="team-limit-concurrentHelpers"');
    expect(html).toContain('data-testid="team-limit-totalHelpers"');
    expect(html).not.toContain("stave_delegate_task");
    expect(html).not.toContain("Asking for one");
    expect(html).not.toContain("read-only for second opinions");
  });

  test("reports availability per provider rather than claiming readiness", () => {
    // No `window.api` in this environment, so the status read never resolves —
    // the card must say it is checking instead of asserting either state.
    expect(html).toContain("Checking");
    expect(html).toContain("Claude tasks:");
    expect(html).toContain("Codex tasks:");
  });
});
