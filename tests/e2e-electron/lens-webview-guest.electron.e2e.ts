import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

/**
 * Does the rendering primitive the plan depends on actually behave as claimed?
 *
 * Three questions, none of which can be asked of a `WebContentsView` at all,
 * because it is not in the renderer's DOM and no page-driving harness can see
 * or address it:
 *
 * 1. Can a page-driving harness reach the guest and drive it?
 * 2. Does DOM chrome paint above the guest and receive its clicks?
 * 3. Does the attach clamp refuse a non-Lens partition in a real window?
 *
 * Measured answer to (1), and it is not the one the plan assumed. A `<webview>`
 * guest is **not** a frame of the host page: `page.frames()` never lists it,
 * because the guest is a separate `WebContents` rather than an iframe in the
 * host's frame tree. Frame addressing does not work.
 *
 * What does work, and is strictly better: Playwright surfaces the guest as its
 * own `Page` in `app.windows()`, so the full locator API drives it directly.
 * The plan's documented fallback — driving through the CDP gateway — also
 * works, and is exercised below so the agent path has coverage that does not
 * depend on Playwright's Electron internals.
 *
 * The harness installs the shipping clamp rather than a copy, so a change that
 * breaks attachment fails here.
 */

const HARNESS_DIR = path.join(import.meta.dirname, "harness");
const LENS_PARTITION = "persist:lens-harness-workspace";

let server: Server;
let origin: string;
let bundleDir: string;
let app: ElectronApplication;
let page: Page;

async function startFixtureServer(): Promise<void> {
  const guestHtml = await readFile(
    path.join(HARNESS_DIR, "guest.html"),
    "utf8",
  );
  server = createServer((request, response) => {
    if (request.url?.startsWith("/guest")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(guestHtml);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("fixture server did not bind a port");
  }
  origin = `http://127.0.0.1:${address.port}`;
}

/**
 * Bundle the shipping clamp to ESM so the plain-JavaScript harness main can
 * import it. Bundling rather than re-implementing is the point: the harness has
 * to fail when the product's clamp changes.
 */
async function bundleClamp(): Promise<string> {
  bundleDir = await mkdtemp(path.join(tmpdir(), "lens-harness-"));
  const outfile = path.join(bundleDir, "webview-attach.mjs");
  const result = spawnSync(
    "bun",
    [
      "build",
      path.join(
        import.meta.dirname,
        "../../electron/main/browser/browser-webview-attach.ts",
      ),
      "--target=node",
      "--format=esm",
      `--outfile=${outfile}`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`bundling the attach clamp failed: ${result.stderr}`);
  }
  return outfile;
}

/**
 * The guest as its own Playwright page. Polled rather than awaited on an event:
 * a `<webview>` guest is not a BrowserWindow, so `app.waitForEvent("window")`
 * is not a contract worth relying on for it.
 */
async function findGuestPage(): Promise<Page | undefined> {
  return app
    .windows()
    .find((window) => window.url().startsWith(`${origin}/guest`));
}

/** Create a `<webview>` and wait for it to attach, or report that it did not. */
async function attachGuest(args: {
  id: string;
  partition: string;
  src: string;
  bounds: { x: number; y: number; width: number; height: number };
}): Promise<boolean> {
  return page.evaluate(async (input) => {
    const root = document.getElementById("lens-surface-root");
    if (!root) {
      throw new Error("harness host page is missing #lens-surface-root");
    }
    const guest = document.createElement("webview");
    guest.id = input.id;
    guest.setAttribute("partition", input.partition);
    guest.setAttribute("src", input.src);
    guest.style.left = `${input.bounds.x}px`;
    guest.style.top = `${input.bounds.y}px`;
    guest.style.width = `${input.bounds.width}px`;
    guest.style.height = `${input.bounds.height}px`;

    const attached = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 8_000);
      guest.addEventListener("dom-ready", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    root.append(guest);
    return attached;
  }, args);
}

test.beforeAll(async () => {
  await startFixtureServer();
  const clampModule = await bundleClamp();

  app = await electron.launch({
    args: [path.join(HARNESS_DIR, "main.mjs")],
    env: {
      ...process.env,
      LENS_HARNESS_CLAMP_MODULE: clampModule,
      LENS_HARNESS_GUEST_PRELOAD: path.join(HARNESS_DIR, "guest-preload.cjs"),
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (bundleDir) {
    await rm(bundleDir, { recursive: true, force: true });
  }
});

test("a Lens-partitioned guest attaches and is drivable as its own page", async () => {
  const attached = await attachGuest({
    id: "guest-primary",
    partition: LENS_PARTITION,
    src: `${origin}/guest`,
    bounds: { x: 0, y: 0, width: 800, height: 500 },
  });
  expect(attached).toBe(true);

  // Not a frame of the host page. Recorded as an assertion rather than a
  // comment, because the plan assumed the opposite and the next person to read
  // it should find the correction enforced.
  expect(
    page.frames().some((frame) => frame.url().startsWith(`${origin}/guest`)),
    "a webview guest is a separate WebContents, not a frame of its host",
  ).toBe(false);

  await expect.poll(async () => Boolean(await findGuestPage())).toBe(true);
  const guest = await findGuestPage();
  await expect(guest!.locator("#heading")).toHaveText("guest ready");
});

test("the guest takes input: click and type land in the page", async () => {
  const guest = await findGuestPage();
  expect(guest).toBeTruthy();

  await guest!.locator("#press").click();
  await expect(guest!.locator("#pressed")).toHaveText("pressed");

  await guest!.locator("#field").fill("hello lens");
  await expect(guest!.locator("#echo")).toHaveText("hello lens");
});

test("the guest is drivable through CDP, the documented fallback path", async () => {
  // The agent path talks to the guest over `webContents.debugger`, so it must
  // work without Playwright's Electron page mapping. Same API the Lens CDP
  // gateway uses today against a `WebContentsView`.
  const guestWebContentsId = await page.evaluate(() => {
    const guest = document.querySelector("webview") as unknown as {
      getWebContentsId: () => number;
    } | null;
    return guest?.getWebContentsId() ?? null;
  });
  expect(guestWebContentsId).not.toBeNull();

  const probe = await app.evaluate(async ({ webContents }, id: number) => {
    const guest = webContents.fromId(id);
    if (!guest) {
      return null;
    }
    guest.debugger.attach("1.3");
    try {
      const result = (await guest.debugger.sendCommand("Runtime.evaluate", {
        expression: "document.getElementById('heading').textContent",
        returnByValue: true,
      })) as { result?: { value?: unknown } };
      return {
        type: guest.getType(),
        url: guest.getURL(),
        heading: result?.result?.value ?? null,
      };
    } finally {
      guest.debugger.detach();
    }
  }, guestWebContentsId as number);

  expect(probe).toMatchObject({ type: "webview", heading: "guest ready" });
  expect(probe?.url).toContain("/guest");
});

test("main's forced preferences are what the guest actually runs with", async () => {
  const guest = await findGuestPage();
  expect(guest).toBeTruthy();

  // The clamp overwrites `preload` and forbids node integration. Both are
  // security properties, so they are asserted from inside the guest rather than
  // trusted to the unit test.
  await expect(guest!.locator("#preload-loaded")).toHaveText("true");
  await expect(guest!.locator("#node-globals")).toHaveText("false");
});

test("DOM chrome paints above the guest and receives the click", async () => {
  // This is the property a composited native view cannot express at any price:
  // the whole workaround layer exists to fake it.
  const result = await page.evaluate(async () => {
    const overlay = document.getElementById("overlay");
    if (!overlay) {
      throw new Error("harness host page is missing #overlay");
    }
    overlay.style.left = "100px";
    overlay.style.top = "100px";
    overlay.style.width = "200px";
    overlay.style.height = "80px";
    overlay.dataset.open = "true";
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let clickedOverlay = false;
    overlay.addEventListener("click", () => {
      clickedOverlay = true;
    });

    const hit = document.elementFromPoint(150, 130);
    (hit as HTMLElement | null)?.click();

    return { hitId: hit?.id ?? null, clickedOverlay };
  });

  expect(result.hitId).toBe("overlay");
  expect(result.clickedOverlay).toBe(true);
});

test("the guest keeps painting under the overlay instead of being hidden", async () => {
  // The current model's only way to show that overlay is to hide the whole
  // guest. Here the guest is still attached, still live, and still the hit
  // target everywhere the overlay is not.
  const guest = await findGuestPage();
  expect(guest).toBeTruthy();
  await expect(guest!.locator("#heading")).toHaveText("guest ready");

  const outsideOverlay = await page.evaluate(
    () => document.elementFromPoint(600, 400)?.tagName.toLowerCase() ?? null,
  );
  expect(outsideOverlay).toBe("webview");
});

test("a non-Lens partition is refused attachment", async () => {
  const attached = await attachGuest({
    id: "guest-refused",
    partition: "persist:not-lens",
    src: `${origin}/guest`,
    bounds: { x: 0, y: 520, width: 200, height: 100 },
  });
  expect(attached).toBe(false);

  const refusals = await app.evaluate(
    () =>
      (globalThis as { __lensHarnessRefusals?: string[] })
        .__lensHarnessRefusals ?? [],
  );
  expect(refusals.join(" ")).toContain("persist:not-lens");
});
