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
    expect(html).toContain("one or more exact hostnames");
    expect(html).toContain("Loading saved accounts");
    expect(html).toContain("never submits the form");
    expect(html).not.toContain("plain-secret-value");
  });

  test("no longer advertises comma-separated host entry", () => {
    const html = renderToStaticMarkup(
      createElement(LensCredentialsSettingsCard),
    );

    // The editor form (with "Add host") is collapsed until the user opens it,
    // so only assert the removed comma-separated helper text is gone.
    expect(html).not.toContain("Separate multiple exact hostnames with commas");
  });
});
