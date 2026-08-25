import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliTriggerLabel,
  TopBarStandaloneCli,
} from "@/components/layout/TopBarStandaloneCli";

describe("buildStandaloneCliTriggerLabel", () => {
  test("prompts for setup when no folder is configured", () => {
    expect(
      buildStandaloneCliTriggerLabel({ folderPath: "", open: false }),
    ).toBe("Standalone CLI — set a folder in Settings");
  });

  test("names the close action while open", () => {
    expect(
      buildStandaloneCliTriggerLabel({ folderPath: "/tmp/notes", open: true }),
    ).toBe("Close Standalone CLI");
  });

  test("names the open action while closed", () => {
    expect(
      buildStandaloneCliTriggerLabel({ folderPath: "/tmp/notes", open: false }),
    ).toBe("Open Standalone CLI");
  });
});

describe("TopBarStandaloneCli", () => {
  test("renders a trigger with no project context and no folder", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(TopBarStandaloneCli, { noDragStyle: {} }),
      ),
    );

    expect(markup).toContain("Standalone CLI — set a folder in Settings");
  });
});
