import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
    api: {},
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function renderMentions(args: { navigable?: boolean }) {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  const { MentionsSection } = await import(
    "../src/components/layout/settings-sections/settings-dialog-mentions-section"
  );
  return renderToStaticMarkup(
    createElement(MentionsSection, {
      onNavigateSection: args.navigable ? () => {} : undefined,
    }),
  );
}

describe("Mentions settings section", () => {
  test("lists every @ mention with its status", async () => {
    const html = await renderMentions({ navigable: true });
    expect(html).toContain("Prompt mentions");
    for (const mention of ["@web", "@lens", "@info"]) {
      expect(html).toContain(`>${mention}</code>`);
    }
    for (const section of ["@info:notes", "@info:jira", "@info:turn-summary"]) {
      expect(html).toContain(section);
    }
    // `@lens` and `@web` are their own mentions, not `@info:` aliases.
    expect(html).not.toContain("@info:lens");
    expect(html).not.toContain("@info:web");
    expect(html).toContain("Lens settings");
    // Browser access lives here now, with the mode selector.
    expect(html).toContain("When the agent may use Chrome");
  });

  test("defaults the @web status to Lens first", async () => {
    expect(await renderMentions({})).toContain("Lens first</span>");
  });

  test("reflects each browser mode in the @web status", async () => {
    const { PromptMentionsCard } = await import(
      "../src/components/layout/settings-sections/settings-dialog-mentions-section"
    );
    const expected = {
      explicit: "Only with @web</span>",
      auto: "Lens first</span>",
      always: "Always on</span>",
    } as const;
    for (const [browserMode, label] of Object.entries(expected)) {
      expect(
        renderToStaticMarkup(
          createElement(PromptMentionsCard, {
            browserMode: browserMode as keyof typeof expected,
          }),
        ),
      ).toContain(label);
    }
  });

  test("hides the Lens shortcut when the host cannot switch sections", async () => {
    expect(await renderMentions({})).not.toContain("Lens settings");
  });
});

describe("Providers settings after Browser access moved", () => {
  test("no longer renders the browser access card", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());
    const { ProvidersSection } = await import(
      "../src/components/layout/settings-dialog-providers-section"
    );
    const html = renderToStaticMarkup(createElement(ProvidersSection, {}));
    expect(html).not.toContain("settings-field-browser-access");
  });
});
