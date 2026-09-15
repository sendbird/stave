import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsageSample } from "@/lib/providers/auto-routing-wizard";
import {
  DEFAULT_CLAUDE_HAIKU_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
} from "@/lib/providers/model-catalog";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
    api: {},
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

function fixture(): UsageSample[] {
  const plans = [
    "Plan the architecture for the new notifications module",
    "Plan how we should split the monolith into packages",
    "Plan the rollout of the new theme editor step by step",
  ];
  const ciFixes = [
    "Fix the failing CI pipeline on main",
    "The lint job fails in CI, fix it",
    "CI is red because of the typecheck step, fix it",
  ];
  return [
    ...plans.map((prompt) => ({
      prompt,
      providerId: "claude-code" as const,
      model: DEFAULT_CLAUDE_OPUS_MODEL,
      effort: "medium",
    })),
    ...ciFixes.map((prompt) => ({
      prompt,
      providerId: "claude-code" as const,
      model: DEFAULT_CLAUDE_HAIKU_MODEL,
    })),
  ];
}

describe("SettingsAutoRoutingWizard", () => {
  test("renders the scan step from override samples with insights and a class table", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { SettingsAutoRoutingWizard } = await import(
      "../src/components/layout/settings-dialog-auto-routing-wizard"
    );

    const html = renderToStaticMarkup(
      createElement(SettingsAutoRoutingWizard, { samplesOverride: fixture() }),
    );

    expect(html).toContain("Set up from my usage");
    expect(html).toContain("Scan again");
    expect(html).toContain("Continue to review");
    expect(html).toContain("Low confidence");
    expect(html).toContain("You ran all 3 Plan prompts on Claude Opus 5");
    expect(html).toContain("Usually runs on");
    expect(html).toContain("Claude Opus 5");
    expect(html).toContain("Claude Haiku 4.5");
    expect(html).not.toContain("No history yet");
  });

  test("renders the empty state once a scan found nothing", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { SettingsAutoRoutingWizard } = await import(
      "../src/components/layout/settings-dialog-auto-routing-wizard"
    );

    const html = renderToStaticMarkup(
      createElement(SettingsAutoRoutingWizard, { samplesOverride: [] }),
    );

    expect(html).toContain("No history yet. Use Stave for a while, or pick a starter profile.");
    expect(html).not.toContain("Continue to review");
  });
});
