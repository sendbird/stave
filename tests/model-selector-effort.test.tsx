import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    location: { href: "https://stave.test/workspace" },
  } as unknown;
}

describe("ModelSelector effort axis", () => {
  test("shows the effort next to the model on the trigger", async () => {
    setWindowContext();
    const { ModelSelector, buildModelSelectorValue } = await import(
      "@/components/ai-elements/model-selector"
    );
    const value = buildModelSelectorValue({
      providerId: "codex",
      model: "gpt-5.6-sol",
    });

    const html = renderToStaticMarkup(
      createElement(ModelSelector, {
        value,
        options: [value],
        effort: "xhigh",
        onSelect: () => {},
      }),
    );

    expect(html).toContain("· X-High");
  });

  test("omits the effort suffix when the caller opts out", async () => {
    setWindowContext();
    const { ModelSelector, buildModelSelectorValue } = await import(
      "@/components/ai-elements/model-selector"
    );
    const value = buildModelSelectorValue({
      providerId: "codex",
      model: "gpt-5.6-sol",
    });

    const html = renderToStaticMarkup(
      createElement(ModelSelector, {
        value,
        options: [value],
        onSelect: () => {},
      }),
    );

    expect(html).not.toContain("·");
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});
