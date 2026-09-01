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

function getLocalReviewButtonMarkup(html: string) {
  return html.match(
    /<button[^>]*aria-label="Review local changes"[^>]*>[\s\S]*?<\/button>/,
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
const CLAUDE_MODEL_OPTION: ModelSelectorOption = {
  key: "claude-code:claude-opus-4-6",
  providerId: "claude-code",
  model: "claude-opus-4-6",
  label: "Opus 4.6",
  available: true,
};

describe("PromptInput queue mode", () => {
  test("does not render composer chrome over an empty draft", async () => {
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

    expect(html).not.toContain("Focus");
    expect(html).not.toContain('aria-label="Enhance prompt"');
    expect(html).not.toContain("pointer-events-none absolute right-0 top-0");
  });

  test("renders prompt enhancement over a non-empty draft", async () => {
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
          onEnhancePrompt: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain('aria-label="Enhance prompt"');
    expect(html).toContain("pointer-events-none absolute right-0 top-0");
    expect(html).toContain("pointer-events-auto disabled:opacity-100 size-7");
    expect(html).toContain("lucide-wand-sparkles");
    expect(html).toContain("z-40");
  });

  test("renders the local-change review CTA before attach with visible text", async () => {
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
          reviewModelOptions: [CLAUDE_MODEL_OPTION, MODEL_OPTION],
          preferredReviewModelKey: CLAUDE_MODEL_OPTION.key,
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onLocalChangeReview: () => true,
          onSubmit: () => {},
        }),
      ),
    );
    const buttonMarkup = getLocalReviewButtonMarkup(html);

    expect(html).toContain('aria-label="Review local changes"');
    expect(buttonMarkup).toContain(">Review</span>");
    expect(buttonMarkup).toBeTruthy();
    expect(buttonMarkup).toContain('data-variant="ghost"');
    expect(buttonMarkup).toContain("text-muted-foreground");
    expect(buttonMarkup).toContain("hover:bg-secondary/30");
    expect(buttonMarkup).not.toContain("<img");
    expect(html.indexOf('aria-label="Review local changes"')).toBeLessThan(
      html.indexOf('aria-label="Attach files"'),
    );
  });

  test("renders review before the action placed ahead of Runtime", async () => {
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
          reviewModelOptions: [CLAUDE_MODEL_OPTION, MODEL_OPTION],
          preferredReviewModelKey: CLAUDE_MODEL_OPTION.key,
          runtimeStatusItems: [
            {
              id: "sandbox",
              label: "Sandbox",
              value: "workspace-write",
            },
          ],
          secretsControl: createElement(
            "button",
            { type: "button", "aria-label": "Open Tools" },
            "Tools",
          ),
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onLocalChangeReview: () => true,
          onSubmit: () => {},
        }),
      ),
    );

    expect(html.indexOf('aria-label="Review local changes"')).toBeLessThan(
      html.indexOf('aria-label="Open Tools"'),
    );
    expect(html.indexOf('aria-label="Open Tools"')).toBeLessThan(
      html.indexOf('aria-label="Runtime · Safe"'),
    );
  });

  test("keeps the local review CTA understated in minimal mode", async () => {
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
          reviewModelOptions: [CLAUDE_MODEL_OPTION, MODEL_OPTION],
          preferredReviewModelKey: CLAUDE_MODEL_OPTION.key,
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onLocalChangeReview: () => true,
          onSubmit: () => {},
        }),
      ),
    );
    const buttonMarkup = getLocalReviewButtonMarkup(html);

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
    expect(html).toContain("Clear all");
    expect(html).toContain("dark:bg-transparent");
    expect(html).not.toContain("absolute right-4 top-4");
    expect(html).not.toContain("README.md");
    expect(html).not.toContain("Focus");
    // The composer has a draft, so the single morphing button shows
    // Send/Queue rather than Stop, and the old standalone Abort button is
    // gone entirely.
    expect(html).toContain('aria-label="Queue next turn"');
    expect(html).not.toContain('aria-label="Abort"');
    expect(html).not.toContain('aria-label="Stop responding"');
  });

  test("keeps current attachments visible while queued turns exist", async () => {
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
          value: "Current draft",
          isTurnActive: true,
          submitMode: "queue-next" as const,
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Queued draft",
              attachedFilePaths: [],
              attachments: [],
            },
          ],
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: ["src/current-context.ts"],
          attachments: [
            {
              kind: "image" as const,
              id: "current-image",
              dataUrl: "data:image/png;base64,current",
              label: "current.png",
            },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onOpenAttachedFile: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain("2 attached");
    expect(html).toContain("src/current-context.ts");
    expect(html).toContain(
      'aria-label="Open attached file src/current-context.ts"',
    );
    expect(html).toContain(
      'aria-label="Remove attached file src/current-context.ts"',
    );
    expect(html).toContain(
      'aria-label="Preview attached image current.png"',
    );
    expect(html).toContain(
      'aria-label="Remove attached image current.png"',
    );
  });

  test("offers a send-now action on queued turns when no turn is active", async () => {
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
          isTurnActive: false,
          submitMode: "send" as const,
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Follow up after the interrupt",
              attachedFilePaths: [],
              attachments: [],
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
          onSendQueuedTurn: () => {},
        }),
      ),
    );

    expect(html).toContain('aria-label="Send queued prompt 1 now"');
    expect(html).toContain(
      "send one now, or it sends after your next message finishes",
    );
  });

  test("hides the send-now action on queued turns while a turn is active", async () => {
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
          submitMode: "queue-next" as const,
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Follow up after this finishes",
              attachedFilePaths: [],
              attachments: [],
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
          onSendQueuedTurn: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).not.toContain('aria-label="Send queued prompt 1 now"');
    expect(html).toContain(
      "next sends automatically when the current response finishes",
    );
  });

  test("offers a steer action on queued turns while a steerable turn is active", async () => {
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
          submitMode: "steer-or-queue" as const,
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Actually check the migration too",
              attachedFilePaths: [],
              attachments: [],
            },
            {
              id: "queue-2",
              queuedAt: "2026-04-09T00:01:00.000Z",
              sourceTurnId: "turn-1",
              content: "Then look at the screenshot",
              attachedFilePaths: ["README.md"],
              attachments: [],
            },
          ],
          selectedModel: CLAUDE_MODEL_OPTION,
          modelOptions: [CLAUDE_MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onClearQueuedNextTurn: () => {},
          canSteerQueuedTurn: true,
          onSteerQueuedTurn: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).toContain(
      'aria-label="Steer queued prompt 1 into the current response"',
    );
    // Attachments can't ride along with a steer, so that item keeps waiting
    // for the auto-dispatch instead of offering the button.
    expect(html).not.toContain(
      'aria-label="Steer queued prompt 2 into the current response"',
    );
    expect(html).toContain("or steer one into it now");
    // Steering is not the same as dispatching a fresh turn — the send-now
    // action stays hidden while the turn runs.
    expect(html).not.toContain('aria-label="Send queued prompt 1 now"');
  });

  test("hides the steer action on queued turns when the turn is not steerable", async () => {
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
          submitMode: "queue-next" as const,
          queuedTurns: [
            {
              id: "queue-1",
              queuedAt: "2026-04-09T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "Actually check the migration too",
              attachedFilePaths: [],
              attachments: [],
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
          canSteerQueuedTurn: false,
          onSteerQueuedTurn: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).not.toContain(
      'aria-label="Steer queued prompt 1 into the current response"',
    );
    expect(html).not.toContain("or steer one into it now");
  });

  test("shows Stop instead of Send when a turn is active and the draft is empty", async () => {
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
          submitMode: "steer-or-queue" as const,
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onAbort: () => {},
        }),
      ),
    );

    expect(html).toContain('aria-label="Stop responding"');
    expect(html).not.toContain('aria-label="Send"');
    expect(html).not.toContain('aria-label="Queue next turn"');
    expect(html).not.toContain('aria-label="Steer this turn"');
  });

  test("defaults to Enter=queue, Tab=steer during a steerable active turn", async () => {
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
          value: "Also update the README",
          isTurnActive: true,
          submitMode: "steer-or-queue" as const,
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onAbort: () => {},
        }),
      ),
    );

    // The single primary button mirrors Enter, which defaults to queue.
    // There is no separate floating secondary button anymore. The placeholder
    // uses the same shortcut label as Settings so both available actions stay
    // visible without duplicating the key mapping here.
    expect(html).toContain('aria-label="Queue next turn"');
    expect(html).not.toContain('aria-label="Adjust current work"');
    expect(html).not.toContain("Adjust current work");
    expect(html).toContain("Enter queues, Tab steers");
    expect(html).not.toContain("Queue a follow-up");
  });

  test("respects steerQueueEnterAction=steer during a steerable active turn", async () => {
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
          value: "Also update the README",
          isTurnActive: true,
          submitMode: "steer-or-queue" as const,
          steerQueueEnterAction: "steer" as const,
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          attachments: [],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
          onAbort: () => {},
        }),
      ),
    );

    // The single primary button mirrors Enter (steer) when configured that
    // way; the placeholder follows the same setting and keeps Tab's queue
    // action visible.
    expect(html).toContain('aria-label="Steer this turn"');
    expect(html).not.toContain('aria-label="Queue next"');
    expect(html).not.toContain(">Queue next</span>");
    expect(html).toContain("Enter steers, Tab queues");
    expect(html).not.toContain("Steer this turn… (↵)");
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
              attachedFilePaths: ["src/comment-context.ts"],
              attachments: [
                {
                  kind: "image" as const,
                  id: "batch-image-1",
                  dataUrl: "data:image/png;base64,batch",
                  label: "Comment image",
                },
              ],
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
    expect(html).toContain("2 attachments");
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
                  review: {
                    version: 1,
                    page: {
                      url: "https://example.com/review",
                      title: "Review",
                      viewport: {
                        width: 1280,
                        height: 720,
                        devicePixelRatio: 1,
                      },
                      scroll: { x: 0, y: 0 },
                      documentId: "document-1",
                    },
                    anchor: {
                      selector: "#root h1",
                      bounds: { x: 0, y: 0, width: 100, height: 40 },
                      attributes: {},
                      ancestors: [],
                      nearby: [],
                      computedStyles: { fontSize: "16px" },
                    },
                    evidence: {
                      screenshot: {
                        kind: "clipped",
                        bounds: { x: 0, y: 0, width: 100, height: 40 },
                      },
                      styleEdits: [],
                    },
                    feedback: {
                      comment: "Header cramped",
                      intent: "fix",
                      priority: "high",
                    },
                    trust: "untrusted-page-evidence",
                  },
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
    expect(html).toContain("Fix");
    expect(html).toContain("High");
    expect(html).toContain(
      'aria-label="Edit intent and priority for comment 1"',
    );
    expect(html).toContain('aria-label="Edit styles for comment 1"');
    expect(html).toContain('aria-label="Remove comment 1"');
    expect(html.match(/alt="Visual comment 1"/g)?.length ?? 0).toBe(1);
  });

  test("renders the runtime profile trigger with its effective state", async () => {
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
            {
              id: "plan-mode",
              label: "Planning",
              value: "On",
              tone: "warning",
            },
          ],
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    expect(html).toContain('aria-label="Runtime · Custom"');
    expect(html).toContain("Runtime profile: Custom");
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
    expect(html).toContain('aria-label="Stop responding"');
    expect(html).not.toContain('aria-label="Abort"');
    expect(html).not.toContain("Running");
  });
});
