import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { ComposerControlPlacements } from "@/lib/composer-controls";
import type { AdvisorArmState } from "@/lib/providers/advisor";
import type { WorkerArmState } from "@/lib/providers/worker-mode";

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
    framed?: boolean;
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
    expect(draftHtml).toContain("pr-9");
    expect(draftHtml).not.toContain("pr-28");
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
    expect(html).toContain('data-loader-variant="orbit"');
    expect(html).not.toContain("animate-spin");
    expect(html).toContain("cursor-progress");
    expect(html).toContain("text-muted-foreground/70");
    // The busy chip overlays the draft. Growing the editor inset would reflow
    // the first line when the label appears and again when it collapses.
    expect(html).toContain("pr-9");
    expect(html).not.toContain("pr-28");
    expect(html).toContain("from-card");
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
    expect(html).toContain("pr-9");
    expect(html).not.toContain("pr-28");
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

  test("moves toolbar controls into the frame wings when framed", async () => {
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
          framed: true,
          frameTop: createElement("span", null, "Turn activity"),
          frameBottom: createElement("span", null, "main"),
          contextMeter: createElement(
            "span",
            { "data-testid": "context-meter-slot" },
            "72%",
          ),
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
        }),
      ),
    );

    expect(html).toContain('data-composer-frame="true"');
    expect(html).toContain('data-composer-frame-slot="top"');
    expect(html).toContain('data-composer-frame-slot="bottom"');
    expect(html).toContain('data-composer-frame-wing="right"');
    // Nothing session-scoped is wired up in this fixture, so the left wing has
    // no reason to exist — an empty shelf is never drawn.
    expect(html).not.toContain('data-composer-frame-wing="left"');
    expect(html).toContain("Turn activity");
    // Plan is provider-owned, so it stays in the right wing.
    expect(html).toContain('aria-label="Plan mode OFF"');
    expect(html).toContain('data-composer-control-label=""');
    expect(html).toContain(">Plan<");
    expect(html).toContain("group-hover/composer-wing:opacity-100");
    expect(html).toContain("motion-reduce:transition-opacity");
    expect(html).toContain('data-testid="context-meter-slot"');
    // Stave's own tooling rides the bottom status bar; the wings are the
    // provider's surface. Controls keep their labels there, except the runtime
    // readout, which stays a glyph because it is checked rather than operated.
    const statusBar = html.slice(
      html.indexOf('data-composer-frame-status-bar="true"'),
    );
    expect(statusBar).toContain('data-composer-status-tray="row"');
    expect(statusBar).toContain(">Review<");
    expect(statusBar).toContain('aria-label="Runtime ·');
    expect(statusBar).not.toContain(">Runtime<");
    // The raised card keeps the model picker and context meter; wings own Plan.
    expect(html).toContain("Opus 5");
  });

  test("opens Advisor state and options from one button", async () => {
    setWindowContext();
    const [{ PromptInputAdvisorPill }, { TooltipProvider }] = await Promise.all(
      [
        import("@/components/ai-elements/prompt-input-advisor-mode"),
        import("@/components/ui"),
      ],
    );
    const claudeTarget = {
      providerId: "claude-code" as const,
      model: "claude-opus-4-8",
    };
    const arm: AdvisorArmState = {
      enabled: false,
      target: null,
      effectiveTarget: claudeTarget,
      overridden: true,
      targetByProvider: {
        "claude-code": claudeTarget,
        codex: { providerId: "codex", model: "gpt-5.6-sol" },
      },
    };
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInputAdvisorPill, {
          arm,
          primaryProviderId: "claude-code",
          primaryModel: MODEL_OPTION.model,
          selectedProviderId: "claude-code",
          advisorModelOptions: [MODEL_OPTION.model],
          open: false,
          onSetEnabled: () => {},
          onSelectProvider: () => {},
          onSelectModel: () => {},
          onSelectEffort: () => {},
        }),
      ),
    );

    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Configure Advisor ·');
    expect(html).not.toContain("Choose which model advises");
  });

  test("opens Worker state and options from one button", async () => {
    setWindowContext();
    const [{ PromptInputWorkerPill }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input-worker-mode"),
      import("@/components/ui"),
    ]);
    const arm: WorkerArmState = {
      enabled: false,
      config: { presetId: "verified-patch", model: "auto", effort: "auto" },
      overridden: true,
    };
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInputWorkerPill, {
          arm,
          resolution: { status: "off" },
          primaryProviderId: "claude-code",
          primaryModel: MODEL_OPTION.model,
          open: false,
          onToggle: () => {},
          onSelectPreset: () => {},
          onSelectModel: () => {},
          onSelectEffort: () => {},
        }),
      ),
    );

    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Configure Worker mode ·');
    expect(html).not.toContain("Choose the worker preset");
  });
  test("hosts every status-shelf control as a bare, shared-pill button", async () => {
    setWindowContext();
    const [
      { PromptInput },
      { MacroControl },
      { COMPOSER_CONTROL_BUTTON },
      { TooltipProvider },
    ] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/session/MacroControl"),
      import("@/components/ai-elements/composer-control-density"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(PromptInput, {
          value: "",
          framed: true,
          selectedModel: MODEL_OPTION,
          modelOptions: [MODEL_OPTION],
          attachedFilePaths: [],
          macroControl: createElement(MacroControl, {
            macros: [],
            onSelect: () => {},
          }),
          onValueChange: () => {},
          onModelSelect: () => {},
          onAttachFilesChange: () => {},
          onSubmit: () => {},
        }),
      ),
    );

    // The shelf sizes its controls through the marker on their own button, so
    // the control has to arrive as a bare button wearing the shared pill. A
    // fixed-height wrapper around it would leave the button riding above the
    // row, sized by the wrapper instead of the lane.
    expect(html).toContain('data-macro-control="true"');
    expect(html).not.toContain('<div data-macro-control="true"');
    const macroButton = html.slice(
      html.lastIndexOf("<button", html.indexOf('data-macro-control="true"')),
    );
    expect(macroButton.startsWith("<button")).toBe(true);
    expect(macroButton.slice(0, macroButton.indexOf(">"))).toContain(
      COMPOSER_CONTROL_BUTTON,
    );
  });
  test("marks every composer control so its lane can size it", async () => {
    const [{ COMPOSER_CONTROL_LANE }] = await Promise.all([
      import("@/components/ai-elements/composer-control-density"),
    ]);
    const html = await renderToolbar();

    // Plan, provider mode, Thinking, Review and Runtime all render through
    // different primitives (tooltip trigger, popover pill, dialog trigger).
    // The lane can only reach them if each one carries the marker.
    for (const label of [
      'aria-label="Plan mode OFF"',
      'aria-label="Thinking: adaptive"',
      'aria-label="Review local changes"',
      'aria-label="Runtime · ',
    ]) {
      const at = html.indexOf(label);
      expect(at).toBeGreaterThan(-1);
      const start = html.lastIndexOf("<button", at);
      const tag = html.slice(start, html.indexOf(">", at));
      expect(tag).toContain('data-composer-control="true"');
    }
    // ...and the row has to state the size it wants, rather than leaving it to
    // whatever geometry each control happened to ship with.
    expect(html).toContain(
      COMPOSER_CONTROL_LANE.toolbar.split(" ")[0].replaceAll("&", "&amp;"),
    );
  });

  test("stacks every overflow item the same way, captioning only glyphs", async () => {
    const [{ ComposerControlMenuList }, { COMPOSER_CONTROL_LANE }] =
      await Promise.all([
        import("@/components/ai-elements/composer-control-menu"),
        import("@/components/ai-elements/composer-control-density"),
      ]);
    const html = renderToStaticMarkup(
      createElement(ComposerControlMenuList, {
        items: [
          {
            id: "review",
            label: "Review",
            node: createElement("button", { type: "button" }, "Review"),
          },
          {
            id: "runtime",
            label: "Runtime",
            iconOnly: true,
            node: createElement("button", { type: "button" }),
          },
        ],
      }),
    );

    // Both trays render through this list, so the rows are identical in shape
    // and only the caption distinguishes a control that shows no label.
    expect(html).toContain(
      COMPOSER_CONTROL_LANE.menu.split(" ")[0].replaceAll("&", "&amp;"),
    );
    expect((html.match(/class="flex items-center gap-2"/g) ?? []).length).toBe(
      2,
    );
    expect(html).toContain(">Runtime</span>");
    expect(html).not.toContain(">Review</span>");
  });
  test("keeps the overflow tray out of the model row, ahead of Runtime", async () => {
    const classic = await renderToolbar({
      composerControlPlacements: { review: "overflow" },
    });
    const framed = await renderToolbar({
      framed: true,
      composerControlPlacements: { review: "overflow" },
    });

    const trayAt = (html: string) =>
      html.indexOf('data-composer-tray-trigger="true"');
    const runtimeAt = (html: string) => html.indexOf('aria-label="Runtime · ');

    // Wherever the controls live, `⋯` takes the slot in front of Runtime —
    // never the one beside the model name, which is not a control row.
    expect(trayAt(classic)).toBeGreaterThan(-1);
    expect(trayAt(classic)).toBeLessThan(runtimeAt(classic));
    expect(trayAt(framed)).toBeGreaterThan(-1);
    expect(trayAt(framed)).toBeLessThan(runtimeAt(framed));

    const statusBarAt = framed.indexOf('data-composer-frame-status-bar="true"');
    expect(statusBarAt).toBeGreaterThan(-1);
    expect(trayAt(framed)).toBeGreaterThan(statusBarAt);
  });
});
