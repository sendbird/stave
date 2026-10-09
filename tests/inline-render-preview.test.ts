import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  buildInlineRenderUrl,
  INLINE_RENDER_MAX_HEIGHT,
  INLINE_RENDER_THEME_VARIABLES,
  prepareInlineRenderDocument,
} from "@/lib/inline-render/inline-render";
import {
  buildInlineRenderPreviewFallbackTheme,
  buildInlineRenderPreviewNotes,
  buildInlineRenderPreviewSummary,
  buildInlineRenderPreviewToolResult,
  createInlineRenderPreviewMessageLog,
  formatInlineRenderPreviewConsoleMessage,
  INITIAL_INLINE_RENDER_PREVIEW_CONTEXT,
  INLINE_RENDER_PREVIEW_DEFAULT_WIDTH,
  INLINE_RENDER_PREVIEW_MAX_CAPTURE_HEIGHT,
  INLINE_RENDER_PREVIEW_MAX_WIDTH,
  INLINE_RENDER_PREVIEW_MIN_WIDTH,
  inlineRenderPreviewCaptureHeight,
  inlineRenderPreviewLineOffset,
  nextInlineRenderPreviewViewport,
  normalizeInlineRenderPreviewContext,
  normalizeInlineRenderPreviewOptions,
  planInlineRenderPreviewSlices,
  resolveInlineRenderPreviewTheme,
  shouldBlockInlineRenderPreviewNavigation,
  shouldReportInlineRenderPreviewConsoleMessage,
  type InlineRenderPreviewMeasurement,
} from "@/lib/inline-render/inline-render-preview";

const RENDER_ID = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";
const PAGE_URL = buildInlineRenderUrl({ renderId: RENDER_ID, networkPolicy: "blocked" });

function measurement(overrides: Partial<InlineRenderPreviewMeasurement> = {}): InlineRenderPreviewMeasurement {
  return {
    width: 720,
    appearance: "dark",
    networkPolicy: "blocked",
    firstContentHeight: 900,
    contentHeight: 900,
    viewportHeight: 900,
    capturedHeight: 900,
    loadTimedOut: false,
    consoleMessages: [],
    failedRequests: [],
    blockedNavigations: [],
    ...overrides,
  };
}

/** Declarations of the first `selector {` block in globals.css. */
function cssBlock(css: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`^${escaped} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(css)?.[1] ?? "";
  return new Map(
    [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((match) => [match[1]!, match[2]!.trim()]),
  );
}

describe("preview context", () => {
  test("starts with no network until the renderer reports the setting", () => {
    expect(INITIAL_INLINE_RENDER_PREVIEW_CONTEXT).toEqual({ networkPolicy: "blocked", theme: null });
  });

  test("an unknown policy loses network access instead of taking the default", () => {
    expect(normalizeInlineRenderPreviewContext({ networkPolicy: "wide-open" }).networkPolicy).toBe("blocked");
    expect(normalizeInlineRenderPreviewContext(null).networkPolicy).toBe("blocked");
    expect(normalizeInlineRenderPreviewContext({ networkPolicy: "cdn" }).networkPolicy).toBe("cdn");
    expect(normalizeInlineRenderPreviewContext({ networkPolicy: "open" }).networkPolicy).toBe("open");
  });

  test("keeps only allowlisted, clean theme variables", () => {
    const context = normalizeInlineRenderPreviewContext({
      networkPolicy: "open",
      theme: {
        appearance: "light",
        variables: { "--background": "red;}</style>", "--evil": "x", "--radius": 4 },
      },
    });
    expect(context.theme).toEqual({ appearance: "light", variables: { "--background": "red/style" } });
    expect(normalizeInlineRenderPreviewContext({ theme: { appearance: "sepia" } }).theme).toBeNull();
  });
});

describe("preview options", () => {
  test("defaults to a chat column and the appearance on screen, else dark", () => {
    expect(normalizeInlineRenderPreviewOptions({}, { appearance: null })).toEqual({
      width: INLINE_RENDER_PREVIEW_DEFAULT_WIDTH,
      appearance: "dark",
    });
    expect(normalizeInlineRenderPreviewOptions({}, { appearance: "light" }).appearance).toBe("light");
    expect(
      normalizeInlineRenderPreviewOptions({ appearance: "dark" }, { appearance: "light" }).appearance,
    ).toBe("dark");
  });

  test("rounds and clamps the width", () => {
    const width = (value: unknown) => normalizeInlineRenderPreviewOptions({ width: value }, { appearance: null }).width;
    expect(width(480.4)).toBe(480);
    expect(width(10)).toBe(INLINE_RENDER_PREVIEW_MIN_WIDTH);
    expect(width(99_999)).toBe(INLINE_RENDER_PREVIEW_MAX_WIDTH);
    expect(width(Number.NaN)).toBe(INLINE_RENDER_PREVIEW_DEFAULT_WIDTH);
    expect(width("640")).toBe(INLINE_RENDER_PREVIEW_DEFAULT_WIDTH);
  });
});

describe("preview theme", () => {
  test("the fallback palette is Stave's default light and dark theme", () => {
    const css = readFileSync("src/globals.css", "utf8");
    const root = cssBlock(css, ":root");
    for (const [appearance, selector] of [["light", ":root"], ["dark", ".dark"]] as const) {
      const declared = cssBlock(css, selector);
      const fallback = buildInlineRenderPreviewFallbackTheme(appearance);
      expect(fallback.appearance).toBe(appearance);
      for (const [name, value] of Object.entries(fallback.variables)) {
        // `.dark` inherits whatever it does not override from `:root`.
        const expected = declared.get(name) ?? root.get(name) ?? "missing";
        expect([appearance, name, value]).toEqual([appearance, name, expected]);
      }
      // Every host variable but the fonts, which the page falls back on itself.
      const missing = INLINE_RENDER_THEME_VARIABLES.filter((name) => !(name in fallback.variables));
      expect(missing).toEqual(["--font-sans", "--font-mono"]);
    }
  });

  test("uses the user's theme when it has the requested appearance", () => {
    const synced = { appearance: "dark" as const, variables: { "--background": "rgb(1, 2, 3)" } };
    expect(resolveInlineRenderPreviewTheme("dark", synced)).toEqual(synced);
  });

  test("otherwise falls back to the default palette, keeping fonts and radius", () => {
    const synced = {
      appearance: "dark" as const,
      variables: { "--background": "rgb(1, 2, 3)", "--font-sans": "Inter", "--radius": "2px" },
    };
    const theme = resolveInlineRenderPreviewTheme("light", synced);
    expect(theme.appearance).toBe("light");
    expect(theme.variables["--background"]).toBe(buildInlineRenderPreviewFallbackTheme("light").variables["--background"]);
    expect(theme.variables["--font-sans"]).toBe("Inter");
    expect(theme.variables["--radius"]).toBe("2px");
    expect(resolveInlineRenderPreviewTheme("dark", null)).toEqual(buildInlineRenderPreviewFallbackTheme("dark"));
  });
});

describe("what the page reports", () => {
  test("caps entries, counts repeats once, and says how many were left out", () => {
    const log = createInlineRenderPreviewMessageLog({ maxEntries: 2, maxChars: 12 });
    log.add("error: first");
    log.add("error: first");
    log.add("error: first");
    log.add("   ");
    log.add("error: second message that is long");
    log.add("error: third");
    log.add("error: fourth");
    expect(log.list()).toEqual(["error: first (×3)", "error: seco…", "2 more omitted"]);
  });

  test("reports the page's warnings and errors, not info or Electron's own notices", () => {
    const report = (level: string, sourceId = PAGE_URL) =>
      shouldReportInlineRenderPreviewConsoleMessage({ level, sourceId });
    expect(report("error")).toBe(true);
    expect(report("warning", "https://cdn.example/lib.js")).toBe(true);
    expect(report("info")).toBe(false);
    expect(report("debug")).toBe(false);
    expect(report("warning", "node:electron/js2c/sandbox_bundle")).toBe(false);
  });

  test("an empty log lists nothing", () => {
    expect(createInlineRenderPreviewMessageLog({ maxEntries: 20 }).list()).toEqual([]);
  });

  test("page lines are counted in the HTML the agent wrote", () => {
    const html = "<!doctype html>\n<p>one</p>\n<script>\nboom();\n</script>";
    const prepared = prepareInlineRenderDocument(html);
    const offset = inlineRenderPreviewLineOffset(html, prepared);
    const preparedLine = prepared.split("\n").findIndex((line) => line.includes("boom();")) + 1;
    expect(preparedLine - offset).toBe(4);
    expect(
      formatInlineRenderPreviewConsoleMessage({
        level: "error",
        message: "Uncaught ReferenceError: boom is not defined",
        sourceId: PAGE_URL,
        lineNumber: preparedLine,
        documentLineOffset: offset,
      }),
    ).toBe("error: Uncaught ReferenceError: boom is not defined (line 4)");
  });

  test("other sources keep their URL, and a line inside the bootstrap is not shown", () => {
    const base = { level: "warning" as const, message: "slow", documentLineOffset: 40 };
    expect(
      formatInlineRenderPreviewConsoleMessage({ ...base, sourceId: "https://cdn.example/lib.js", lineNumber: 7 }),
    ).toBe("warning: slow (https://cdn.example/lib.js:7)");
    expect(
      formatInlineRenderPreviewConsoleMessage({ ...base, sourceId: "https://cdn.example/lib.js", lineNumber: 0 }),
    ).toBe("warning: slow (https://cdn.example/lib.js)");
    expect(formatInlineRenderPreviewConsoleMessage({ ...base, sourceId: PAGE_URL, lineNumber: 12 })).toBe(
      "warning: slow",
    );
    expect(formatInlineRenderPreviewConsoleMessage({ ...base, sourceId: "", lineNumber: 3 })).toBe("warning: slow");
  });
});

describe("navigation", () => {
  test("the page can never navigate the preview window", () => {
    for (const targetUrl of ["https://example.com/", PAGE_URL, "about:blank"]) {
      expect(
        shouldBlockInlineRenderPreviewNavigation({ isMainFrame: true, isSameDocument: false, targetUrl }),
      ).toBe(true);
    }
    expect(
      shouldBlockInlineRenderPreviewNavigation({ isMainFrame: true, isSameDocument: true, targetUrl: `${PAGE_URL}#a` }),
    ).toBe(false);
  });

  test("a nested frame loads what the CSP allows, but never a render", () => {
    expect(
      shouldBlockInlineRenderPreviewNavigation({ isMainFrame: false, isSameDocument: false, targetUrl: "https://example.com/" }),
    ).toBe(false);
    expect(
      shouldBlockInlineRenderPreviewNavigation({ isMainFrame: false, isSameDocument: false, targetUrl: PAGE_URL }),
    ).toBe(true);
  });
});

describe("viewport and capture", () => {
  test("the viewport grows to the content within the cap", () => {
    expect(nextInlineRenderPreviewViewport(0)).toBe(80);
    expect(nextInlineRenderPreviewViewport(1233.2)).toBe(1234);
    expect(nextInlineRenderPreviewViewport(9_000)).toBe(INLINE_RENDER_PREVIEW_MAX_CAPTURE_HEIGHT);
  });

  test("the capture is the content, at least the frame minimum, at most the viewport", () => {
    expect(inlineRenderPreviewCaptureHeight(0, 80)).toBe(80);
    expect(inlineRenderPreviewCaptureHeight(500, 500)).toBe(500);
    expect(inlineRenderPreviewCaptureHeight(9_000, 4_000)).toBe(4_000);
  });

  test("slices cover the capture top to bottom", () => {
    expect(planInlineRenderPreviewSlices(4_000)).toEqual([
      { top: 0, height: 1_200 },
      { top: 1_200, height: 1_200 },
      { top: 2_400, height: 1_200 },
      { top: 3_600, height: 400 },
    ]);
    expect(planInlineRenderPreviewSlices(300)).toEqual([{ top: 0, height: 300 }]);
  });
});

describe("result", () => {
  test("notes a page that sizes itself to the viewport", () => {
    const notes = buildInlineRenderPreviewNotes(
      measurement({ firstContentHeight: 410, contentHeight: 560, viewportHeight: 510, capturedHeight: 510 }),
    );
    expect(notes[0]).toContain("grew from 410 px to 560 px");
    expect(notes[1]).toBe("Only the top 510 px of 560 px were captured.");
    expect(buildInlineRenderPreviewNotes(measurement())).toEqual([]);
  });

  test("notes a page taller than the frame, a truncated capture, and a slow load", () => {
    const notes = buildInlineRenderPreviewNotes(
      measurement({ firstContentHeight: 5_000, contentHeight: 5_000, viewportHeight: 4_000, capturedHeight: 4_000, loadTimedOut: true }),
    );
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain(`${INLINE_RENDER_MAX_HEIGHT} px`);
    expect(notes[1]).toBe("Only the top 4000 px of 5000 px were captured.");
    expect(notes[2]).toContain("still loading");
  });

  test("the summary leaves out empty optional lists and reports the frame height", () => {
    const summary = buildInlineRenderPreviewSummary(measurement({ contentHeight: 2_400, firstContentHeight: 2_400, viewportHeight: 2_400, capturedHeight: 2_400 }), [
      { top: 0, height: 1_200 },
      { top: 1_200, height: 1_200 },
    ]);
    expect(summary).toEqual({
      width: 720,
      appearance: "dark",
      networkPolicy: "blocked",
      contentHeight: 2_400,
      frameHeight: INLINE_RENDER_MAX_HEIGHT,
      capturedHeight: 2_400,
      images: [
        { top: 0, height: 1_200 },
        { top: 1_200, height: 1_200 },
      ],
      consoleMessages: [],
      notes: [expect.stringContaining("stops growing")],
    });
  });

  test("the tool result leads with the summary, then the images in order", () => {
    const result = buildInlineRenderPreviewToolResult(
      measurement({
        consoleMessages: ["error: boom (line 3)"],
        failedRequests: ["GET https://example.com/data.json: HTTP 404"],
        blockedNavigations: ["https://example.com/"],
      }),
      [
        { data: "AAAA", mimeType: "image/png", top: 0, height: 900 },
      ],
    );
    expect(result.content.map((part) => part.type)).toEqual(["text", "image"]);
    const summary = JSON.parse((result.content[0] as { text: string }).text);
    expect(summary.consoleMessages).toEqual(["error: boom (line 3)"]);
    expect(summary.failedRequests).toEqual(["GET https://example.com/data.json: HTTP 404"]);
    expect(summary.blockedNavigations).toEqual(["https://example.com/"]);
    expect(result.content[1]).toEqual({ type: "image", data: "AAAA", mimeType: "image/png" });
  });
});
