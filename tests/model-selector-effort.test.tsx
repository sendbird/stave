import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { modelEffortSelectorStyles } from "@/components/ai-elements/model-effort-selector.styles";
import { sx } from "@/components/ads/utils/stylex";

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

describe("model capability toggles", () => {
  async function renderCapabilityControl(args: {
    providerId: "codex" | "claude-code";
    model: string;
    extraModels?: readonly string[];
    fastMode?: boolean;
  }) {
    setWindowContext();
    const [{ ModelEffortSelector }, { buildModelSelectorValue }] =
      await Promise.all([
        import("@/components/ai-elements/model-effort-selector"),
        import("@/components/ai-elements/model-selector"),
      ]);
    const value = buildModelSelectorValue({
      providerId: args.providerId,
      model: args.model,
    });
    const options = [
      value,
      ...(args.extraModels ?? []).map((model) =>
        buildModelSelectorValue({ providerId: args.providerId, model }),
      ),
    ];
    return renderToStaticMarkup(
      createElement(ModelEffortSelector, {
        value,
        options,
        fastMode: args.fastMode,
        showFastMode: true,
        onSelect: () => {},
      }),
    );
  }

  test("stands Fast beside the model button instead of segmenting it", async () => {
    const html = await renderCapabilityControl({
      providerId: "codex",
      model: "gpt-5.6-sol",
      fastMode: true,
    });

    // Fast qualifies the model; it is not a part of it. So: no group chrome,
    // no hairline, and a full radius of its own.
    expect(html).not.toContain('data-slot="button-group"');
    expect(html).not.toContain('data-slot="button-group-separator"');
    const fastAt = html.indexOf('aria-label="Fast mode: On"');
    expect(fastAt).toBeGreaterThan(-1);
    const fastTag = html.slice(
      html.lastIndexOf("<button", fastAt),
      html.indexOf(">", fastAt),
    );
    // Its own full corner radius (formerly `rounded-md`), never a squared-off
    // segment corner (`rounded-none`): the capability toggle style owns the
    // standalone rounding. Active Fast merges the fast-active tone on top.
    expect(fastTag).toContain(
      sx(
        modelEffortSelectorStyles.capabilityToggle,
        modelEffortSelectorStyles.capabilityToggleFastActive,
      ),
    );
  });

  test("stands 1M beside the model button on the same terms", async () => {
    const html = await renderCapabilityControl({
      providerId: "claude-code",
      model: "claude-opus-5",
      extraModels: ["claude-opus-5[1m]"],
    });

    expect(html).not.toContain('data-slot="button-group-separator"');
    const contextAt = html.indexOf('aria-label="1M context: Off"');
    expect(contextAt).toBeGreaterThan(-1);
    const contextTag = html.slice(
      html.lastIndexOf("<button", contextAt),
      html.indexOf(">", contextAt),
    );
    // Stands beside the model button with its own full radius (formerly
    // `rounded-md`), same capability-toggle style as Fast (with its semibold
    // weight). Off state adds no active tone.
    expect(contextTag).toContain(
      sx(
        modelEffortSelectorStyles.capabilityToggle,
        modelEffortSelectorStyles.capabilityToggleSemibold,
      ),
    );
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});
