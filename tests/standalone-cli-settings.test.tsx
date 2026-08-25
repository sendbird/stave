import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliFolderError,
  buildStandaloneCliFolderFieldAria,
  StandaloneCliSettingsCard,
  STANDALONE_CLI_FOLDER_ERROR_ID,
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

describe("standalone cli folder field accessibility", () => {
  test("leaves a valid field unannotated", () => {
    expect(buildStandaloneCliFolderFieldAria(null)).toEqual({});
  });

  test("marks the input invalid and points it at the alert", () => {
    // role="alert" alone announces the message but leaves the input reading as
    // valid and unrelated to it, so the field needs both attributes.
    expect(
      buildStandaloneCliFolderFieldAria("Enter an absolute folder path."),
    ).toEqual({
      "aria-invalid": true,
      "aria-describedby": STANDALONE_CLI_FOLDER_ERROR_ID,
    });
  });

  test("describes the field with an id the alert actually carries", () => {
    expect(STANDALONE_CLI_FOLDER_ERROR_ID).toBe(
      `${STANDALONE_CLI_SETTING_FIELD_ID}-error`,
    );
  });

  test("does not mark a pristine card invalid", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(StandaloneCliSettingsCard),
      ),
    );

    // Bare "aria-invalid" also matches the Tailwind `aria-invalid:` variant
    // classes the input always carries, so assert on the rendered attribute.
    expect(markup).not.toContain('aria-invalid="true"');
    expect(markup).not.toContain(STANDALONE_CLI_FOLDER_ERROR_ID);
  });
});
