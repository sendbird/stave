import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliFolderError,
  StandaloneCliSettingsCard,
  STANDALONE_CLI_SETTING_FIELD_ID,
} from "@/components/layout/settings-dialog-standalone-cli-card";
import { defaultSettings } from "@/store/app-settings";

describe("standalone cli folder validation", () => {
  test("accepts a blank value as unset", () => {
    expect(buildStandaloneCliFolderError("")).toBeNull();
    expect(buildStandaloneCliFolderError("   ")).toBeNull();
  });

  test("accepts an absolute path", () => {
    expect(buildStandaloneCliFolderError("/tmp/notes")).toBeNull();
  });

  test("rejects a relative path with actionable copy", () => {
    expect(buildStandaloneCliFolderError("./notes")).toBe(
      "Enter an absolute folder path.",
    );
  });
});

describe("standalone cli settings default", () => {
  test("ships unset", () => {
    expect(defaultSettings.standaloneCliFolderPath).toBe("");
  });
});

describe("StandaloneCliSettingsCard", () => {
  test("renders the searchable field anchor and a browse control", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(StandaloneCliSettingsCard),
      ),
    );

    expect(markup).toContain(STANDALONE_CLI_SETTING_FIELD_ID);
    expect(markup).toContain("Standalone CLI Folder");
    expect(markup).toContain("Browse");
  });
});
