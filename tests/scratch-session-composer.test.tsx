import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ScratchComposer imports useAppStore, whose module may touch localStorage/window
// at load. Stub the globals first, then dynamic-import the module. We test the
// presentational ScratchComposerView with explicit props because renderToStatic-
// Markup is a server render and zustand v5 feeds React getInitialState there, so
// store setState can't drive a static render (see the popover test for the same).
async function loadComposer() {
  const storageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storageStub,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { api: {} },
    configurable: true,
  });

  const composerModule =
    await import("@/components/layout/scratch-session/ScratchComposer");
  return { ScratchComposerView: composerModule.ScratchComposerView };
}

const noop = () => {};

describe("ScratchComposerView", () => {
  test("prompts to pick a folder and disables input when none is set", async () => {
    const { ScratchComposerView } = await loadComposer();

    const markup = renderToStaticMarkup(
      createElement(ScratchComposerView, {
        folderPath: null,
        activeTurnId: null,
        isClearing: false,
        error: null,
        draft: "",
        onDraftChange: noop,
        onSend: noop,
        onStop: noop,
      }),
    );

    expect(markup).toContain("Pick a folder first");
    expect(markup).toContain(">Send<");
    // Real disabled attribute is present (textarea + Send are both disabled).
    expect(markup).toContain('disabled=""');
  });

  test("offers stop instead of send while a turn is running", async () => {
    const { ScratchComposerView } = await loadComposer();

    const markup = renderToStaticMarkup(
      createElement(ScratchComposerView, {
        folderPath: "/tmp/scratch",
        activeTurnId: "turn-1",
        isClearing: false,
        error: null,
        draft: "",
        onDraftChange: noop,
        onSend: noop,
        onStop: noop,
      }),
    );

    expect(markup).toContain(">Stop<");
    expect(markup).not.toContain(">Send<");
  });

  test("enables send once a folder and a non-empty draft are present", async () => {
    const { ScratchComposerView } = await loadComposer();

    const markup = renderToStaticMarkup(
      createElement(ScratchComposerView, {
        folderPath: "/tmp/scratch",
        activeTurnId: null,
        isClearing: false,
        error: null,
        draft: "look at this",
        onDraftChange: noop,
        onSend: noop,
        onStop: noop,
      }),
    );

    expect(markup).toContain(">Send<");
    // Neither the textarea nor the Send button carries the disabled attribute.
    expect(markup).not.toContain('disabled=""');
  });

  test("disables the composer while clear is releasing the previous task", async () => {
    const { ScratchComposerView } = await loadComposer();

    const markup = renderToStaticMarkup(
      createElement(ScratchComposerView, {
        folderPath: "/tmp/scratch",
        activeTurnId: null,
        isClearing: true,
        error: null,
        draft: "do not send yet",
        onDraftChange: noop,
        onSend: noop,
        onStop: noop,
      }),
    );

    expect(markup).toContain("Clearing session…");
    expect(markup).toContain('disabled=""');
  });

  test("surfaces scratch-session failures in the popover", async () => {
    const { ScratchComposerView } = await loadComposer();

    const markup = renderToStaticMarkup(
      createElement(ScratchComposerView, {
        folderPath: "/tmp/scratch",
        activeTurnId: "turn-1",
        isClearing: false,
        error: "Approval delivery failed: gone",
        draft: "",
        onDraftChange: noop,
        onSend: noop,
        onStop: noop,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Approval delivery failed: gone");
  });
});
