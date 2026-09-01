import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { ComposerControlPlacements } from "@/lib/composer-controls";

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
      location: { href: "https://stave.test/workspace" },
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

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "window");
});

const MODEL_OPTION: ModelSelectorOption = {
  key: "claude-code:claude-opus-4-8",
  providerId: "claude-code",
  model: "claude-opus-4-8",
  label: "Opus 5",
};

async function renderToolbar(
  overrides: {
    composerControlPlacements?: ComposerControlPlacements;
    planMode?: boolean;
    thinkingMode?: "adaptive" | "enabled" | "disabled";
    advisorActive?: boolean;
    value?: string;
    onEnhancePrompt?: () => void;
    promptEnhancementPending?: boolean;
    promptEnhancementRevealing?: boolean;
    promptEnhancementRevealVersion?: number;
  } = {},
) {
  setWindowContext();
  const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
    import("@/components/ai-elements/prompt-input"),
    import("@/components/ui"),
  ]);
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(PromptInput, {
        value: "",
        selectedModel: MODEL_OPTION,
        modelOptions: [MODEL_OPTION],
        attachedFilePaths: [],
        reviewModelOptions: [MODEL_OPTION],
        preferredReviewModelKey: MODEL_OPTION.key,
        onLocalChangeReview: () => true,
        onPlanModeChange: () => {},
        onThinkingModeChange: () => {},
        onComposerControlPlacementsChange: () => {},
        runtimeStatusItems: [
          { id: "sandbox", label: "Sandbox", value: "workspace-write" },
        ],
        onValueChange: () => {},
        onModelSelect: () => {},
        onAttachFilesChange: () => {},
        onSubmit: () => {},
        ...overrides,
      }),
    ),
  );
}

describe("composer control placement in the toolbar", () => {
  test("replaces the Focus hint with prompt enhancement for a draft", async () => {
    const emptyHtml = await renderToolbar();
    const draftHtml = await renderToolbar({
      value: "fix this",
      onEnhancePrompt: () => {},
    });

    expect(emptyHtml).not.toContain(">Focus<");
    expect(draftHtml).toContain('aria-label="Enhance prompt"');
    // The idle enhance affordance is icon-only; only the busy states get a
    // visible label.
    expect(draftHtml).not.toContain(">Enhance<");
    expect(draftHtml).not.toContain(">Enhancing<");
    expect(draftHtml).toContain('data-prompt-enhancement-surface="idle"');
  });

  test("announces prompt enhancement while it is pending", async () => {
    const html = await renderToolbar({
      value: "fix this",
      onEnhancePrompt: () => {},
      promptEnhancementPending: true,
    });

    expect(html).toContain('aria-label="Enhancing prompt"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Enhancing prompt");
    expect(html).toContain('data-prompt-enhancement-state="enhancing"');
    expect(html).toContain('contentEditable="false"');
    // A locked composer has to look locked. The spinner alone read as an
    // editable input, so the affordance grows a visible label and the editable
    // is dimmed while the rewrite is in flight.
    expect(html).toContain(">Enhancing<");
    expect(html).toContain('data-prompt-enhancement-surface="enhancing"');
    expect(html).toContain("cursor-progress");
    expect(html).toContain("text-muted-foreground/70");
  });

  test("keeps the editor locked while the enhanced prompt is revealed", async () => {
    const html = await renderToolbar({
      value: "A clearer execution-ready prompt",
      onEnhancePrompt: () => {},
      promptEnhancementRevealing: true,
      promptEnhancementRevealVersion: 1,
    });

    expect(html).toContain('aria-label="Applying enhanced prompt"');
    expect(html).toContain("Applying enhanced prompt");
    expect(html).toContain('data-prompt-enhancement-state="applying"');
    expect(html).toContain('contentEditable="false"');
    expect(html).toContain(">Applying<");
    expect(html).toContain('data-prompt-enhancement-surface="applying"');
    expect(html).toContain("cursor-progress");
  });

  test("renders every control and no tray button by default", async () => {
    const html = await renderToolbar();
    expect(html).toContain('aria-label="Review local changes"');
    expect(html).toContain(">Plan<");
    expect(html).toContain(">Thinking<");
    // An empty tray must not cost a toolbar slot.
    expect(html).not.toContain('data-composer-tray-trigger="true"');
  });

  test("drops a hidden control out of the markup entirely", async () => {
    const html = await renderToolbar({
      composerControlPlacements: { review: "hidden" },
    });
    expect(html).not.toContain('aria-label="Review local changes"');
    expect(html).not.toContain('data-composer-tray-trigger="true"');
  });

  test("shows the tray button, with a count, once something is demoted", async () => {
    const html = await renderToolbar({
      composerControlPlacements: { review: "overflow", runtime: "overflow" },
    });
    expect(html).toContain('data-composer-tray-trigger="true"');
    expect(html).toContain('aria-label="More composer controls (2)"');
    // Closed popovers do not render their content, so the demoted control is
    // out of the row without being deleted.
    expect(html).not.toContain('aria-label="Review local changes"');
  });

  test("pulls a hidden control back onto the toolbar while it is active", async () => {
    // Plan mode changes what the next turn does; hiding the button must not
    // hide the mode.
    const html = await renderToolbar({
      composerControlPlacements: { plan: "hidden" },
      planMode: true,
    });
    expect(html).toContain(">Plan<");
  });

  test("keeps a hidden control hidden while it is at rest", async () => {
    const html = await renderToolbar({
      composerControlPlacements: { plan: "hidden" },
      planMode: false,
    });
    expect(html).not.toContain(">Plan<");
  });

  test("treats a forced-off thinking mode as active", async () => {
    const html = await renderToolbar({
      composerControlPlacements: { thinking: "hidden" },
      thinkingMode: "disabled",
    });
    expect(html).toContain(">Thinking<");
  });

  test("keeps the placement editor out of accessible names on the toolbar", async () => {
    const html = await renderToolbar({
      composerControlPlacements: { review: "overflow" },
    });
    // The editor lives in a closed popover; its radiogroups must not leak into
    // the toolbar's name space, where existing lookups match by substring.
    expect(html).not.toContain('aria-label="Review placement"');
  });
});
