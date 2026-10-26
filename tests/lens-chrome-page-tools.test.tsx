import { describe, expect, test } from "bun:test";
import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../src/components/ui";
import { LensChrome } from "../src/components/panes/surfaces/lens/LensChrome";
import {
  LENS_CHROME_COMPACT_WIDTH,
  isLensChromeCompact,
} from "../src/components/panes/surfaces/lens/useLensChromeCompact";
import type { LensPanelTab } from "../src/lib/lens/lens-log-format";

function renderChrome(args: {
  panelTab: LensPanelTab;
  annotationActive?: boolean;
  isLoading?: boolean;
}) {
  function Harness() {
    const urlInputRef = useRef<HTMLInputElement | null>(null);
    const isUrlInputFocused = useRef(false);
    const noop = () => {};
    const asyncNoop = async () => {};
    const url = "http://localhost:5173/";
    return createElement(
      TooltipProvider,
      null,
      createElement(LensChrome, {
        hasLensApi: true,
        lensPageActionDisabled: false,
        navigation: {
          url,
          inputUrl: url,
          setInputUrl: noop,
          isLoading: Boolean(args.isLoading),
          canGoBack: false,
          canGoForward: false,
          goBack: noop,
          goForward: noop,
          reload: noop,
          stop: noop,
          openDevTools: noop,
          onSubmit: noop,
          onUrlKeyDown: noop,
          urlInputRef,
          isUrlInputFocused,
        },
        panelTab: args.panelTab,
        onPanelTabChange: noop,
        consoleEntryCount: 12,
        networkEntryCount: 1,
        overlayModes: {
          isAnnotationModeActive: Boolean(args.annotationActive),
          isBoxInspectActive: false,
          isPickerActive: false,
          toggleAnnotationMode: asyncNoop,
          toggleBoxInspect: asyncNoop,
          startElementPicker: asyncNoop,
          setIsAnnotationModeActive: noop,
          setIsBoxInspectActive: noop,
        },
        picker: { disabled: false, tooltip: "Pick" },
        capture: {
          downloads: [],
          saveScreenshot: asyncNoop,
          downloadPageAssets: asyncNoop,
          openDownloadInFinder: noop,
        },
        pageLinks: { copyAddress: noop, openInBrowser: noop },
        fullView: { available: true, active: false, toggle: noop },
        onFloatingSurfaceOpenChange: noop,
      }),
    );
  }
  return renderToStaticMarkup(createElement(Harness));
}

/** The opening tag of the button with this accessible name. */
function buttonTag(markup: string, label: string): string {
  const tag = markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`no button labelled ${label}`);
  return tag;
}

const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

describe("LensChrome page tools", () => {
  test("picker and comments are available on the preview tab", () => {
    const markup = renderChrome({ panelTab: "preview" });
    expect(isDisabled(buttonTag(markup, "Pick element"))).toBe(false);
    expect(isDisabled(buttonTag(markup, "Toggle visual comments"))).toBe(false);
  });

  test("picker and comments wait for the preview on console and network", () => {
    for (const panelTab of ["console", "network"] as const) {
      const markup = renderChrome({ panelTab });
      expect(isDisabled(buttonTag(markup, "Pick element"))).toBe(true);
      expect(isDisabled(buttonTag(markup, "Toggle visual comments"))).toBe(true);
    }
  });

  test("an active comment mode can still be turned off from another tab", () => {
    const markup = renderChrome({ panelTab: "console", annotationActive: true });
    expect(isDisabled(buttonTag(markup, "Toggle visual comments"))).toBe(false);
    expect(isDisabled(buttonTag(markup, "Pick element"))).toBe(true);
  });

  test("counts name what they count", () => {
    const markup = renderChrome({ panelTab: "preview" });
    expect(markup).toContain('aria-label="Show console, 12 log entries"');
    expect(markup).toContain('aria-label="Show network, 1 request"');
  });

  test("stop uses the square glyph so it never reads as the address clear X", () => {
    const markup = renderChrome({ panelTab: "preview", isLoading: true });
    const stop = markup.match(/<button[^>]*aria-label="Stop loading"[^>]*>[\s\S]*?<\/button>/)?.[0];
    expect(stop).toBeDefined();
    expect(stop).toContain("lucide-square");
    expect(stop).not.toContain("lucide-x");
  });
});

describe("isLensChromeCompact", () => {
  test("switches below the threshold only", () => {
    expect(isLensChromeCompact(240)).toBe(true);
    expect(isLensChromeCompact(LENS_CHROME_COMPACT_WIDTH - 1)).toBe(true);
    expect(isLensChromeCompact(LENS_CHROME_COMPACT_WIDTH)).toBe(false);
    expect(isLensChromeCompact(640)).toBe(false);
  });

  test("treats an unmeasured toolbar as no signal", () => {
    expect(isLensChromeCompact(0)).toBe(false);
  });
});
