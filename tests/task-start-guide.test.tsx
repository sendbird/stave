import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
    api: {
      fs: {
        listFiles: async () => ({ ok: true, files: [] }),
      },
    },
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("TaskStartGuide", () => {
  test("renders browse actions as outline buttons", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState((state) => ({
      settings: { ...state.settings, showTaskStartExamples: true },
    }));

    const { TaskStartGuide } = await import(
      "../src/components/session/TaskStartGuide"
    );
    const html = renderToStaticMarkup(
      createElement(TaskStartGuide, { onSelect: () => {} }),
    );

    expect(html).toContain("What would you like to work on?");
    expect(html).toContain("Browse workflows, macros");
    expect(html).toContain("Keep a goal");
    expect(html).toMatch(
      /data-variant="outline"[^>]*>[\s\S]*Browse workflows, macros/,
    );
    expect(html).toMatch(
      /data-variant="outline"[^>]*>[\s\S]*Keep a goal &amp; next action/,
    );
    expect(html).toContain('data-testid="task-start-guide"');
  });

  test("lifts the empty-task cluster and tightens the chip row", () => {
    const styles = readFileSync(
      join(import.meta.dir, "..", "src", "components", "session", "chat-area.styles.ts"),
      "utf8",
    );
    const guide = readFileSync(
      join(import.meta.dir, "..", "src", "components", "session", "TaskStartGuide.tsx"),
      "utf8",
    );

    expect(styles).toContain("paddingBottom: vars.space24");
    expect(styles).toContain("gap: vars.space8");
    expect(guide).toContain("styles.footerActions");
    expect(guide).toContain("gap: vars.space8");
  });
});
