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

test("an inline render page can ask to send a message and store its state for the next turn", async () => {
  test.setTimeout(120_000);
  const stave = await launchStave();
  try {
    const userData = await stave.app.evaluate(({ app }) => app.getPath("userData"));
    const store = createInlineRenderStore({ rootDir: () => path.join(userData, "inline-renders") });
    const reference = await store.publish({
      workspaceId: "e2e",
      taskId: "task-e2e",
      turnId: null,
      title: "Probe",
      html: PROBE_PAGE,
    });
    const src = buildInlineRenderUrl({ renderId: reference.renderId, networkPolicy: "blocked" });
    await mountRender(stave.page, { src, id: "probe-interaction" });
    const frame = renderFrame(stave.page, reference.renderId);

    // The bootstrap exposes a frozen API that speaks the host's JSON-RPC.
    expect(
      await frame.evaluate(() => {
        const api = (window as unknown as { stave?: Record<string, unknown> }).stave;
        return {
          send: typeof api?.sendMessage,
          context: typeof api?.updateModelContext,
          frozen: Object.isFrozen(api),
        };
      }),
    ).toEqual({ send: "function", context: "function", frozen: true });
    const message = stave.page.evaluate(
      (id) =>
        new Promise<unknown>((resolve) => {
          const frameElement = document.getElementById(id) as HTMLIFrameElement;
          window.addEventListener("message", (event) => {
            const data = event.data as { method?: string } | null;
            if (event.source === frameElement.contentWindow && data?.method === "ui/message") resolve(data);
          });
        }),
      "probe-interaction",
    );
    await frame.evaluate(() => {
      void (window as unknown as { stave: { sendMessage: (text: string) => Promise<unknown> } }).stave
        .sendMessage("Explain the spike")
        .catch(() => undefined);
    });
    expect(await message).toMatchObject({
      jsonrpc: "2.0",
      method: "ui/message",
      params: { role: "user", content: [{ type: "text", text: "Explain the spike" }] },
    });

    // Page state round-trips renderer -> preload -> IPC -> main store, bound
    // to the page's own task, and clears.
    const bridge = await stave.page.evaluate(async (renderId) => {
      const api = window.api!.inlineRender!;
      const stored = await api.setModelContext!({
        renderId,
        context: { text: null, structured: { selected: "codex" } },
      });
      const listed = await api.listTaskModelContexts!({ workspaceId: "e2e", taskId: "task-e2e" });
      const otherTask = await api.listTaskModelContexts!({ workspaceId: "e2e", taskId: "someone-else" });
      const oversized = await api.setModelContext!({
        renderId,
        context: { text: "x".repeat(20_000), structured: null },
      });
      await api.setModelContext!({ renderId, context: null });
      const cleared = await api.readModelContext!({ renderId });
      return { stored, listed, otherTask, oversized: oversized.ok, cleared };
    }, reference.renderId);
    expect(bridge.stored).toEqual({ ok: true });
    expect(bridge.listed).toMatchObject({
      ok: true,
      entries: [{ renderId: reference.renderId, title: "Probe", context: { structured: { selected: "codex" } } }],
    });
    expect(bridge.otherTask).toEqual({ ok: true, entries: [] });
    expect(bridge.oversized).toBe(false);
    expect(bridge.cleared).toEqual({ ok: true, entry: null });
  } finally {
    await stave.close();
  }
});
