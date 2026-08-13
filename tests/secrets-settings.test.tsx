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
    expect(html).toContain(
      "Assign an environment variable name, then reference it in a prompt as @secret:{NAME}",
    );
    expect(html).toContain("Loading secrets");
    expect(html).toContain("value is never shown to an agent");
    expect(html).toContain("@secret:{OPENAI_API_KEY}");
    expect(html).toContain("supported MCP authentication");
    expect(html).not.toContain("plain-secret-value");
  });
});
