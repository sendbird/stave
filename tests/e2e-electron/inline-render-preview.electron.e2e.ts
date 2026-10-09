import { expect, test } from "@playwright/test";
import { decodePng, formatRgb, pixelAt, type DecodedPng, type Rgba } from "./harness/png";
import { launchStave, type StaveApp } from "./harness/stave-app";
import { callStaveMcpTool, waitForStaveMcpEndpoint } from "./harness/stave-mcp";

/**
 * `stave_preview_html` only answers a Stave task turn, and this suite has no
 * provider turn to call it from. The launch flag makes main expose the same
 * function the tool calls, so everything after the caller check (context sync,
 * the hidden window, the session, the CSP, capture and the result) is the
 * product's own path. The refusal of an outside caller is checked over MCP.
 */
const HOOK_ENV = { STAVE_E2E_INLINE_RENDER_PREVIEW: "1" };

type PreviewContent = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
type PreviewSummary = {
  width: number;
  appearance: string;
  networkPolicy: string;
  contentHeight: number;
  frameHeight: number;
  capturedHeight: number;
  images: Array<{ top: number; height: number }>;
  consoleMessages: string[];
  failedRequests?: string[];
  blockedNavigations?: string[];
};
type PreviewHook = {
  preview: (input: { html: string; width?: number; appearance?: "light" | "dark" }) => Promise<{
    content: PreviewContent;
  }>;
  context: () => { networkPolicy: string; theme: { appearance: string; variables: Record<string, string> } | null };
};

const PROBE_PAGE = `<!doctype html>
<style>
  #gap { height: 40px; }
  #top { height: 560px; background: var(--primary); }
  #bottom { height: 634px; background: rgb(255, 160, 0); }
</style>
<div id="gap"></div>
<div id="top"></div>
<div id="bottom"></div>
<script>
  console.error("preview-probe: console error");
  fetch("https://example.com/preview-probe").then(
    () => console.warn("preview-probe: fetch sent"),
    () => console.warn("preview-probe: fetch refused"),
  );
  setTimeout(() => { location.href = "https://example.com/escape"; }, 0);
  throw new Error("preview-probe: uncaught");
</script>`;

function preview(stave: StaveApp, input: Parameters<PreviewHook["preview"]>[0]) {
  return stave.app.evaluate(
    async (_electron, args) =>
      (globalThis as unknown as { __staveInlineRenderPreviewE2e: PreviewHook }).__staveInlineRenderPreviewE2e.preview(
        args,
      ),
    input,
  );
}

function previewContext(stave: StaveApp) {
  return stave.app.evaluate(() =>
    (globalThis as unknown as { __staveInlineRenderPreviewE2e: PreviewHook }).__staveInlineRenderPreviewE2e.context(),
  );
}

function windowCount(stave: StaveApp) {
  return stave.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

function readResult(content: PreviewContent): { summary: PreviewSummary; images: DecodedPng[] } {
  expect(content[0]?.type).toBe("text");
  const summary = JSON.parse(content[0]!.text!) as PreviewSummary;
  const images = content.slice(1).map((part) => {
    expect(part).toMatchObject({ type: "image", mimeType: "image/png" });
    return decodePng(Buffer.from(part.data!, "base64"));
  });
  return { summary, images };
}

/** Within a few levels per channel: the capture goes through the display's colour pipeline. */
function expectColor(actual: Rgba, expected: { r: number; g: number; b: number }, label: string) {
  const close = (a: number, b: number) => Math.abs(a - b) <= 8;
  expect(
    close(actual.r, expected.r) && close(actual.g, expected.g) && close(actual.b, expected.b),
    `${label}: got ${formatRgb(actual)}, expected ${formatRgb({ ...expected, a: 255 })}`,
  ).toBe(true);
}

test("stave_preview_html renders a page offscreen and reports what the agent cannot see", async () => {
  test.setTimeout(180_000);
  const stave = await launchStave({ env: HOOK_ENV });
  try {
    // An outside MCP client is refused: previews belong to a Stave turn.
    const endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
    const refused = await callStaveMcpTool(endpoint, "stave_preview_html", { html: "<p>outside</p>" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("only works inside a Stave task turn");

    // The renderer reports the user's setting (the default) and theme at startup.
    await expect
      .poll(async () => {
        const context = await previewContext(stave);
        return { networkPolicy: context.networkPolicy, themed: context.theme !== null };
      }, { timeout: 30_000 })
      .toEqual({ networkPolicy: "open", themed: true });

    // The same bridge the renderer uses when the setting or theme changes.
    const pushed = await stave.page.evaluate(() =>
      (
        window as unknown as {
          api: { inlineRender: { setPreviewContext: (args: unknown) => Promise<{ ok: boolean }> } };
        }
      ).api.inlineRender.setPreviewContext({
        networkPolicy: "blocked",
        theme: {
          appearance: "dark",
          variables: { "--primary": "rgb(0, 128, 255)", "--background": "rgb(10, 20, 30)" },
        },
      }),
    );
    expect(pushed).toEqual({ ok: true });
    expect((await previewContext(stave)).networkPolicy).toBe("blocked");

    const baselineWindows = await windowCount(stave);
    const { summary, images } = readResult((await preview(stave, { html: PROBE_PAGE, width: 640, appearance: "dark" })).content);

    expect(summary).toMatchObject({
      width: 640,
      appearance: "dark",
      networkPolicy: "blocked",
      contentHeight: 1234,
      frameHeight: 1234,
      capturedHeight: 1234,
      images: [
        { top: 0, height: 1200 },
        { top: 1200, height: 34 },
      ],
    });

    // One image pixel per CSS pixel, and the page's own pixels: the theme
    // background through the transparent gap, the themed block, the fixed one.
    expect(images.map((image) => [image.width, image.height])).toEqual([
      [640, 1200],
      [640, 34],
    ]);
    expectColor(pixelAt(images[0]!, 320, 20), { r: 10, g: 20, b: 30 }, "theme background");
    expectColor(pixelAt(images[0]!, 320, 300), { r: 0, g: 128, b: 255 }, "--primary block");
    expectColor(pixelAt(images[1]!, 320, 17), { r: 255, g: 160, b: 0 }, "bottom block");

    // Console errors with lines in the HTML as written, the uncaught exception,
    // and the request the blocked policy refused before it reached the network.
    const consoleText = summary.consoleMessages.join("\n");
    expect(consoleText).toContain("error: preview-probe: console error (line 11)");
    expect(consoleText).toContain("Uncaught Error: preview-probe: uncaught (line 17)");
    expect(consoleText).toContain("connect-src 'none'");
    expect(consoleText).toContain("preview-probe: fetch refused");
    expect(consoleText).not.toContain("fetch sent");
    // Electron's own development warnings are not the page's problem.
    expect(consoleText).not.toContain("Electron Security Warning");
    expect(summary.failedRequests).toBeUndefined();

    // The page tried to leave; the window refused and captured the page itself.
    expect(summary.blockedNavigations).toEqual(["https://example.com/escape"]);

    // Every preview window is gone once the call returns.
    expect(await windowCount(stave)).toBe(baselineWindows);

    // A page that never yields is stopped at the deadline and its window torn down.
    const started = Date.now();
    const stuck = await preview(stave, { html: "<p>stuck</p><script>for (;;) {}</script>" }).then(
      () => "returned",
      (error: unknown) => String(error),
    );
    expect(stuck).toContain("did not finish rendering within 15 s");
    expect(Date.now() - started).toBeLessThan(25_000);
    await expect.poll(() => windowCount(stave), { timeout: 10_000 }).toBe(baselineWindows);

    // The slot recovers for the next preview.
    const after = readResult(
      (await preview(stave, { html: '<div style="height: 120px; background: rgb(0, 200, 0)"></div>' })).content,
    );
    expect(after.summary).toMatchObject({ width: 720, contentHeight: 120, capturedHeight: 120 });
    expectColor(pixelAt(after.images[0]!, 360, 60), { r: 0, g: 200, b: 0 }, "recovered preview");
  } finally {
    await stave.close();
  }
});
