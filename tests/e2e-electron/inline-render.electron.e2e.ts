import path from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";
import { launchStave } from "./harness/stave-app";
import { createInlineRenderStore } from "../../electron/main/inline-render/inline-render-store";
import {
  buildInlineRenderThemeFragment,
  buildInlineRenderUrl,
  INLINE_RENDER_FRAME_SANDBOX,
  type InlineRenderNetworkPolicy,
} from "../../src/lib/inline-render/inline-render";

const PROBE_PAGE = `<!doctype html>
<style>#probe { block-size: 420px; color: var(--foreground); }</style>
<div id="probe">probe</div>`;

/**
 * Mounts a render the way the conversation does and resolves with the first
 * height the page reports, which proves the bootstrap ran inside the frame.
 */
async function mountRender(page: Page, args: { src: string; id: string }) {
  return page.evaluate(
    ({ src, id, sandbox }) =>
      new Promise<number>((resolve, reject) => {
        const frame = document.createElement("iframe");
        frame.id = id;
        frame.setAttribute("sandbox", sandbox);
        frame.style.inlineSize = "640px";
        const timer = setTimeout(() => reject(new Error("the page never reported its size")), 15_000);
        window.addEventListener("message", (event) => {
          const data = event.data as { method?: string; params?: { height?: number } } | null;
          if (event.source === frame.contentWindow && data?.method === "ui/notifications/size-changed") {
            clearTimeout(timer);
            resolve(data.params?.height ?? 0);
          }
        });
        frame.src = src;
        document.body.appendChild(frame);
      }),
    { ...args, sandbox: INLINE_RENDER_FRAME_SANDBOX },
  );
}

function renderFrame(page: Page, renderId: string): Frame {
  const frame = page.frames().find((candidate) => candidate.url().includes(renderId));
  if (!frame) throw new Error("render frame not found");
  return frame;
}

test("an inline render page is isolated, themed, sized, and cannot navigate itself", async () => {
  test.setTimeout(120_000);
  const stave = await launchStave();
  try {
    const userData = await stave.app.evaluate(({ app }) => app.getPath("userData"));
    const store = createInlineRenderStore({ rootDir: () => path.join(userData, "inline-renders") });
    const publish = () =>
      store.publish({ workspaceId: "e2e", taskId: "task-e2e", turnId: null, title: "Probe", html: PROBE_PAGE });
    const srcFor = (renderId: string, networkPolicy: InlineRenderNetworkPolicy) =>
      `${buildInlineRenderUrl({ renderId, networkPolicy })}${buildInlineRenderThemeFragment({
        appearance: "dark",
        variables: { "--foreground": "rgb(1, 2, 3)" },
      })}`;

    const blocked = await publish();
    const height = await mountRender(stave.page, { src: srcFor(blocked.renderId, "blocked"), id: "probe-blocked" });
    expect(height).toBeGreaterThanOrEqual(420);

    const frame = renderFrame(stave.page, blocked.renderId);
    // The theme from the URL fragment applied before the page's own styles.
    expect(
      await frame.evaluate(() => ({
        dark: document.documentElement.classList.contains("dark"),
        color: getComputedStyle(document.getElementById("probe")!).color,
      })),
    ).toEqual({ dark: true, color: "rgb(1, 2, 3)" });

    // Opaque origin, no bridge, no way into the app.
    expect(
      await frame.evaluate(() => {
        let parentDocument = "readable";
        try {
          void window.parent.document.title;
        } catch {
          parentDocument = "refused";
        }
        return {
          origin: window.origin,
          parentDocument,
          bridge: typeof (window as unknown as { api?: unknown }).api,
        };
      }),
    ).toEqual({ origin: "null", parentDocument: "refused", bridge: "undefined" });

    // The blocked policy refuses every request before it reaches the network.
    expect(
      await frame.evaluate(() =>
        fetch("https://example.com/", { mode: "no-cors" }).then(
          () => "sent",
          () => "refused",
        ),
      ),
    ).toBe("refused");

    // A page cannot navigate its own frame: not away, and not back to itself
    // under a wider policy.
    for (const target of ["https://example.com/", srcFor(blocked.renderId, "open")]) {
      await frame.evaluate((url) => {
        window.location.href = url;
      }, target);
      await stave.page.waitForTimeout(750);
      const current = renderFrame(stave.page, blocked.renderId);
      expect(current.url()).toContain("net=blocked");
      expect(
        await current.evaluate(() =>
          fetch("https://example.com/", { mode: "no-cors" }).then(
            () => "sent",
            () => "refused",
          ),
        ),
      ).toBe("refused");
    }

    // The CDN policy still refuses data requests, even to an allowlisted host.
    const cdn = await publish();
    await mountRender(stave.page, { src: srcFor(cdn.renderId, "cdn"), id: "probe-cdn" });
    expect(
      await renderFrame(stave.page, cdn.renderId).evaluate(() =>
        fetch("https://cdn.jsdelivr.net/", { mode: "no-cors" }).then(
          () => "sent",
          () => "refused",
        ),
      ),
    ).toBe("refused");
  } finally {
    await stave.close();
  }
});
