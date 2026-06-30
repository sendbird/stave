import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

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
  Object.defineProperty(globalThis, "window", {
    value: {
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
    },
    configurable: true,
    writable: true,
  });
}

function getCrossReviewButtonMarkup(html: string) {
  return html.match(
    /<button[^>]*aria-label="Review by Claude Code"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
}

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
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
            { type: "button", "aria-label": "Open Tools" },
            "Tools",
          ),
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onCrossReview: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html.indexOf('aria-label="Open Tools"')).toBeLessThan(
      html.indexOf('aria-label="Review by Claude Code"'),
    );
  });

  test("keeps the cross-review CTA understated in minimal mode", async () => {
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
          minimal: true,
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
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Follow up after this finishes",
              attachedFilePaths: ["README.md"],
              attachments: [
                {
                  kind: "image" as const,
                  id: "image-1",
                  dataUrl: "data:image/png;base64,abc",
                  label: "diagram.png",
                },
              ],
            },
          ],
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onClearQueuedNextTurn: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).toContain("Queue");
    expect(html).toContain("Follow up after this finishes");
    expect(html).toContain("1 queued follow-up");
    expect(html).toContain("Next to send");
    expect(html).toContain("1 file");
    expect(html).toContain("1 image");
    expect(html).toContain("Queue next");
    expect(html).toContain("Clear all");
    expect(html).toContain('aria-label="Abort"');
    expect(html).toContain("dark:bg-transparent");
    expect(html).not.toContain("absolute right-4 top-4");
    expect(html).not.toContain("README.md");
    expect(html).not.toContain("Focus");
  });

  test("renders comments and lens annotation gadgets outside the textarea", async () => {
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
          promptBatch: [
            {
              id: "batch-1",
              createdAt: "2026-04-09T00:00:00.000Z",
              content: "First staged fragment",
            },
          ],
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [
            {
              kind: "lens-annotations" as const,
              id: "lens-1",
              label: "Lens comments",
              count: 2,
              summary: "1. Header cramped",
              content: "[Lens Visual Comments]\n\nraw readable detail",
            },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onAttachmentsChange: () => {},
          onSubmit: () => {},
          onRemovePromptBatchItem: () => {},
        }),
      ),
    );

    expect(html).toContain("Comment");
    expect(html).toContain("First staged fragment");
    expect(html).toContain('aria-label="Remove comment 1"');
    expect(html).toContain("Lens comments");
    expect(html).toContain("raw readable detail");
    expect(html).not.toContain("Focus");
  });

  test("renders Lens annotations as editable comments in the composer strip", async () => {
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
          attachments: [
            {
              kind: "image" as const,
              id: "lens-comment-image:workspace-1:annotation-1",
              dataUrl: "data:image/png;base64,abc",
              label: "Visual comment 1",
            },
            {
              kind: "lens-annotations" as const,
              id: "lens-1",
              workspaceId: "workspace-1",
              label: "Lens comments",
              count: 1,
              summary: "1. Header cramped",
              content: "[Lens Visual Comments]\n\nraw readable detail",
              annotations: [
                {
                  id: "annotation-1",
                  kind: "element" as const,
                  pin: 1,
                  rect: { x: 0, y: 0, width: 100, height: 40 },
                  comment: "Header cramped",
                  createdAt: "2026-04-09T00:00:00.000Z",
                  selector: "#root h1",
                  computedStyles: { fontSize: "16px" },
                },
              ],
            },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onAttachmentsChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain("Comment");
    expect(html).toContain("1 item will send as one prompt");
    expect(html).toContain('alt="Visual comment 1"');
    expect(html).toContain("Header cramped");
    expect(html).toContain("#root h1");
    expect(html).toContain('aria-label="Edit styles for comment 1"');
    expect(html).toContain('aria-label="Remove comment 1"');
    expect(html.match(/alt="Visual comment 1"/g)?.length ?? 0).toBe(1);
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
          runtimeStatusItems: [{ id: "mode", label: "Mode", value: "Plan" }],
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

  test("renders goal progress above the composer without another Running label", async () => {
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
          isTurnActive: true,
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          goalStatus: {
            statusLabel: "active",
            objective: "Finish the migration and keep tests green",
            tokenLabel: "2.5k / 10k tokens (25%)",
            elapsedLabel: "2m elapsed",
            progressPercent: 25,
            tone: "default" as const,
          },
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).toContain("Goal active");
    expect(html).toContain("Finish the migration and keep tests green");
    expect(html).toContain("2.5k / 10k tokens (25%)");
    expect(html).toContain("2m elapsed");
    expect(html).toContain("width:25%");
    expect(html).toContain('aria-label="Abort"');
    expect(html).not.toContain("Running");
  });
});
