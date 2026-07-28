import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecretsSettingsCard } from "../src/components/layout/settings-dialog-secrets";

describe("SecretsSettingsCard", () => {
  test("renders the secure secret manager without exposing a value", () => {
    const html = renderToStaticMarkup(createElement(SecretsSettingsCard));

    expect(html).toContain("Secrets");
    expect(html).toContain("Add secret");
    expect(html).toContain("Store API tokens and other secret values");
    expect(html).toContain("Loading secrets");
    expect(html).toContain("never sent to an agent automatically");
    expect(html).not.toContain("plain-secret-value");
  });
});
