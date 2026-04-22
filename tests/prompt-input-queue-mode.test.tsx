import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    localStorage: createMemoryStorage(),
    location: {
      href: "https://stave.test/workspace",
    },
    // `border-beam` (PromptInput decoration) calls `window.matchMedia` during
    // its initial render for `theme="auto"` detection. The server-render path
    // below needs a stub so the lib doesn't throw.
    matchMedia: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  } as unknown;
}

function getCrossReviewButtonMarkup(html: string) {
  return html.match(
    /<button[^>]*aria-label="Review by Claude Code"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

const MODEL_OPTION: ModelSelectorOption = {
  key: "codex:gpt-5.4",
  providerId: "codex",
  model: "gpt-5.4",
  label: "GPT-5.4",
  available: true,
};

describe("PromptInput queue mode", () => {
  test("renders the focus hint as an overlay for an empty draft", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain("Focus");
    expect(html).toContain("pointer-events-none absolute right-0 top-0");
    expect(html).toContain("pointer-events-auto h-8 gap-2 shadow-sm");
    expect(html).toContain("z-40");
  });

  test("hides the focus hint when the draft already has text", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "Draft plan request",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).not.toContain("Focus");
    expect(html).not.toContain("pointer-events-none absolute right-0 top-0");
  });

  test("renders the cross-review CTA before attach with visible text", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          crossReviewProvider: "claude-code" as const,
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onCrossReview: () => {},
          onSubmit: () => {},
        }),
      ),
    );
    const buttonMarkup = getCrossReviewButtonMarkup(html);

    expect(html).toContain('aria-label="Review by Claude Code"');
    expect(html).toContain(">Review by</span>");
    expect(html).toContain(">Claude Code</span>");
    expect(buttonMarkup).toBeTruthy();
    expect(buttonMarkup).toContain('data-variant="ghost"');
    expect(buttonMarkup).toContain("text-muted-foreground");
    expect(buttonMarkup).toContain("hover:bg-secondary/30");
    expect(buttonMarkup).toContain("<img");
    expect(html.indexOf('aria-label="Review by Claude Code"')).toBeLessThan(
      html.indexOf('aria-label="Attach files"'),
    );
  });

  test("renders a leading toolbar action before the cross-review CTA", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          crossReviewProvider: "claude-code" as const,
          leadingToolbarAction: createElement(
            "button",
            { type: "button", "aria-label": "Open Coliseum" },
            "Coliseum",
          ),
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onCrossReview: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html.indexOf('aria-label="Open Coliseum"')).toBeLessThan(
      html.indexOf('aria-label="Review by Claude Code"'),
    );
  });

  test("keeps the cross-review CTA understated in minimal mode", async () => {
    setWindowContext();
    const [{ ZenPromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(ZenPromptInput, {
          value: "",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          crossReviewProvider: "claude-code" as const,
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onCrossReview: () => {},
          onSubmit: () => {},
        }),
      ),
    );
    const buttonMarkup = getCrossReviewButtonMarkup(html);

    expect(buttonMarkup).toBeTruthy();
    expect(buttonMarkup).toContain('data-variant="ghost"');
    expect(buttonMarkup).not.toContain("bg-background/60");
    expect(buttonMarkup).not.toContain("backdrop-blur-md");
  });

  test("renders queued-next-turn preview and queue action during an active turn", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "Follow up after this finishes",
          isTurnActive: true,
          submitMode: "queue-next" as const,
          queuedNextTurn: {
            queuedAt: "2026-04-09T00:00:00.000Z",
            sourceTurnId: "turn-1",
            content: "Follow up after this finishes",
          },
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: ["README.md"],
          attachments: [
            {
              kind: "image" as const,
              id: "image-1",
              dataUrl: "data:image/png;base64,abc",
              label: "diagram.png",
            },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onClearQueuedNextTurn: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).toContain("Queued next");
    expect(html).toContain("Follow up after this finishes");
    expect(html).toContain(
      "Sends automatically when the current response finishes.",
    );
    expect(html).toContain("1 file");
    expect(html).toContain("1 image");
    expect(html).toContain("Update queued");
    expect(html).toContain("Clear");
    expect(html).toContain('aria-label="Abort"');
    expect(html).toContain("dark:bg-transparent");
    expect(html).not.toContain("absolute right-4 top-4");
    expect(html).not.toContain("README.md");
    expect(html).not.toContain("Focus");
  });

  test("renders the runtime drawer trigger as an icon-only button", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "",
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          runtimeStatusItems: [
            { id: "mode", label: "Mode", value: "Plan" },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain('aria-label="Current Runtime"');
    expect(html).not.toContain(">Runtime</span>");
  });
});
