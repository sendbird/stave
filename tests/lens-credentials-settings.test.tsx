import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LensCredentialsSettingsCard } from "../src/components/layout/settings-dialog-lens-credentials";

describe("LensCredentialsSettingsCard", () => {
  test("renders the secure account manager without exposing a secret value", () => {
    const html = renderToStaticMarkup(
      createElement(LensCredentialsSettingsCard),
    );

    expect(html).toContain("Saved Accounts");
    expect(html).toContain("Add account");
    expect(html).toContain("Store multiple accounts");
    expect(html).toContain("Loading saved accounts");
    expect(html).toContain("never submits the form");
    expect(html).not.toContain("plain-secret-value");
  });
});
