import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaudeInstalledPluginsField } from "@/components/layout/settings-dialog-claude-plugins";

describe("Settings → Providers → Installed Plugins", () => {
  const html = renderToStaticMarkup(createElement(ClaudeInstalledPluginsField));

  test("explains that CLI-installed plugins work without the user setting source", () => {
    expect(html).toContain("Installed Plugins");
    expect(html).toContain("claude plugin install");
    expect(html).toContain("user");
  });

  test("offers every plugin policy so installs can be honored, forced, or ignored", () => {
    expect(html).toContain("Claude config");
    expect(html).toContain("All installed");
    expect(html).toContain("Off");
  });

  test("says it is still checking rather than claiming an empty inventory", () => {
    // Effects do not run in static rendering, so no discovery result exists
    // yet — the panel must not report "no plugins found" before it has looked.
    expect(html).toContain("Checking installed Claude plugins");
    expect(html).not.toContain("No Claude CLI plugins found");
  });
});
