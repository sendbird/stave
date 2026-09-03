import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_LENS_SESSION_ID,
  E2E_WORKSPACE_ID,
  launchStave,
  openLensSurface,
  seedProject,
  type StaveApp,
} from "./harness/stave-app";
import { decodePng, pixelAt } from "./harness/png";

/**
 * The built product, opening a real Lens session and driving its page — no IPC
 * mocking anywhere.
 *
 * This is the instrument the rendering-model cutover is checked against. The
 * other Electron spec covers the primitive in isolation with a hand-built
 * window; this one runs the shipping app, so it is the only place the whole
 * chain is exercised: the panel asks main to open a session, main asks this
 * window for a guest, the window mounts a `<webview>` and binds it back by
 * WebContents id, and the panel mirrors its own placeholder onto the element.
 *
 * What the assertions are actually for:
 *
 * - **Geometry is CSS.** The guest's rectangle must equal the placeholder's
 *   exactly. Not "within a pixel": there is no zoom factor, no device-pixel
 *   conversion and no inward rounding left in the path, and an exact match is
 *   the only assertion that would notice one coming back.
 * - **The guest is hoisted.** Its parent is the flat surface root, never the
 *   Dockview subtree — a guest whose DOM parent is reparented is destroyed.
 * - **Chrome over the page no longer costs the page.** A dropdown opening over
 *   the preview leaves the guest visible. Under `WebContentsView` this was the
 *   defining limitation: the only way to draw over the page was to blank it.
 * - **A parked guest keeps compositing**, which is what lets an agent-opened
 *   session that no panel is showing still answer. Parking is `opacity: 0`, and
 *   the frame counter here only shows the guest's *script* still runs — that a
 *   parked guest really returns pixels is measured in
 *   `lens-parked-guest-agent-path.electron.e2e.ts`.
 *
 * Requires `bun run build:desktop`.
 */

let stave: StaveApp;
let projectDir: string;
let server: Server;
let origin: string;

/*
 * A page that counts its own animation frames, so "is this guest still being
 * composited" is a measurement rather than an inference.
 */
const FIXTURE_HTML = `<!doctype html>
<html>
  <head><title>lens-fixture</title></head>
  <body style="margin:0;background:#123456">
    <h1 id="heading" style="color:white">lens fixture</h1>
    <script>
      window.__frames = 0;
      const tick = () => {
        window.__frames += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    </script>
  </body>
</html>`;

async function startFixtureServer(): Promise<void> {
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FIXTURE_HTML);
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
 * The guest as its own Playwright page.
 *
 * A `<webview>` guest is a separate `WebContents`, not a frame of the host
 * page, so `page.frames()` never lists it. It does show up in `app.windows()`,
 * which is what makes the full locator API usable against it.
 */
function findGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

/**
 * The guest element's own state.
 *
 * Separate from the placeholder comparison because the two do not always
 * coexist: the panel only renders a placeholder on its preview tab, while the
 * guest stays mounted the whole time — which is the property the parking test
 * is about.
 */
function guestState() {
  return stave.page.evaluate(() => {
    const guest = document.querySelector("webview");
    if (!(guest instanceof HTMLElement)) {
      return null;
    }
    const rect = guest.getBoundingClientRect();
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      parentId: guest.parentElement?.id ?? null,
      opacity: getComputedStyle(guest).opacity,
      visibility: getComputedStyle(guest).visibility,
      display: getComputedStyle(guest).display,
      pointerEvents: getComputedStyle(guest).pointerEvents,
      insideAppSurface: Boolean(
        guest.parentElement?.closest("[data-stave-app-surface]"),
      ),
      insideDockview: Boolean(guest.closest(".dv-dockview")),
    };
  });
}

/** The guest's rectangle alongside the placeholder it is mirroring. */
function guestGeometry() {
  return stave.page.evaluate(() => {
    const guest = document.querySelector("webview");
    const placeholder = document.querySelector(
      "[data-lens-guest-placeholder]",
    );
    if (!(guest instanceof HTMLElement) || !placeholder) {
      return null;
    }
    const guestRect = guest.getBoundingClientRect();
    const placeholderRect = placeholder.getBoundingClientRect();
    return {
      guest: {
        x: guestRect.x,
        y: guestRect.y,
        width: guestRect.width,
        height: guestRect.height,
      },
      placeholder: {
        x: placeholderRect.x,
        y: placeholderRect.y,
        width: placeholderRect.width,
        height: placeholderRect.height,
      },
    };
  });
}

test.beforeAll(async () => {
  // A throwaway directory, not this repository. Pointing the app at a real
  // checkout makes it do real git and workspace scanning on startup, which is
  // slow and — more to the point — variable enough to make the shell
  // assertions flaky for reasons that have nothing to do with Lens.
  projectDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  await startFixtureServer();

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });
  await seedProject(stave.page, { projectPath: projectDir });

  await openLensSurface(stave.page);

  /*
   * Retried, because the panel appearing and its session being bound are not
   * the same moment: `openSession` only resolves after main has asked this
   * window for a guest and the bind has come back, and a navigate that arrives
   * first is refused with "No browser session". Polling on the navigate's own
   * result is what makes the wait about the thing being waited for.
   */
  await expect
    .poll(
      () =>
        stave.page.evaluate(
          async (input) =>
            (
              await window.api?.lens?.navigate?.({
                workspaceId: input.workspaceId,
                lensSessionId: input.lensSessionId,
                url: input.url,
              })
            )?.ok === true,
          {
            workspaceId: E2E_WORKSPACE_ID,
            lensSessionId: E2E_LENS_SESSION_ID,
            url: `${origin}/fixture`,
          },
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  await expect
    .poll(() => Boolean(findGuestPage()), { timeout: 30_000 })
    .toBe(true);
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("the built product boots and its shell is drivable", async () => {
  await expect(stave.page.getByTestId("top-bar")).toBeVisible();
  await expect(stave.page.getByTestId("workspace-bar")).toBeVisible();
});

test("the renderer runs with webviewTag enabled", async () => {
  // The tag is what lets a guest be a DOM element at all. Asserted against the
  // real window rather than a harness one, because this is a property of the
  // product's `BrowserWindow` options and nothing else would catch it
  // regressing.
  const webviewTagEnabled = await stave.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    return Boolean(window?.webContents.getLastWebPreferences()?.webviewTag);
  });

  expect(webviewTagEnabled).toBe(true);
});

test("a Lens tab opens a real guest page and loads into it", async () => {
  const guest = findGuestPage();
  expect(guest).toBeDefined();
  await expect(guest!.locator("#heading")).toHaveText("lens fixture");

  // Main sees the same page the test is driving, through its own session state.
  const state = await stave.page.evaluate(
    (input) =>
      window.api!.lens!.getState!({
        workspaceId: input.workspaceId,
        lensSessionId: input.lensSessionId,
      }),
    { workspaceId: E2E_WORKSPACE_ID, lensSessionId: E2E_LENS_SESSION_ID },
  );
  expect(state.ok).toBe(true);
  expect(state.state?.url).toBe(`${origin}/fixture`);
});

test("the guest sits exactly on the placeholder, hoisted out of the pane tree", async () => {
  const geometry = await guestGeometry();
  expect(geometry).not.toBeNull();

  // Exact, not approximate. Every source of drift the old path had — zoom
  // scaling, device-pixel conversion, edges rounded inward to spare the
  // Dockview sash — is gone, so any difference at all is a regression.
  expect(geometry!.guest).toEqual(geometry!.placeholder);

  const state = await guestState();
  expect(state!.parentId).toBe("lens-surface-root");
  expect(state!.insideAppSurface).toBe(true);
  // A guest destroyed by a pane reparent is unrecoverable, so its distance from
  // the Dockview subtree is a structural invariant, not a detail.
  expect(state!.insideDockview).toBe(false);
  expect(state!.opacity).toBe("1");
  // Electron's flex display is the sizing contract for the internal guest
  // frame. Block layout can leave the page at its intrinsic content height.
  expect(state!.display).toBe("flex");
});

test("host pointer passthrough waits for every active pointer", async () => {
  const dispatchPointer = (
    type: "pointerdown" | "pointerup",
    pointerId: number,
  ) =>
    stave.page.evaluate(
      ({ eventType, id }) => {
        document.body.dispatchEvent(
          new PointerEvent(eventType, { bubbles: true, pointerId: id }),
        );
      },
      { eventType: type, id: pointerId },
    );

  await dispatchPointer("pointerdown", 41);
  await dispatchPointer("pointerdown", 42);
  expect((await guestState())!.pointerEvents).toBe("none");

  await dispatchPointer("pointerup", 41);
  expect((await guestState())!.pointerEvents).toBe("none");

  await dispatchPointer("pointerup", 42);
  expect((await guestState())!.pointerEvents).toBe("auto");
});

test("a sidebar resize can end after crossing the guest", async () => {
  const sidebar = stave.page.getByTestId("project-workspace-sidebar");
  const resizer = stave.page.locator(".cursor-col-resize:visible").first();
  const resizerBox = await resizer.boundingBox();
  const geometry = await guestGeometry();
  expect(resizerBox).not.toBeNull();
  expect(geometry).not.toBeNull();

  const widthBefore = (await sidebar.boundingBox())!.width;
  await stave.page.mouse.move(
    resizerBox!.x + resizerBox!.width / 2,
    resizerBox!.y + resizerBox!.height / 2,
  );
  await stave.page.mouse.down();
  await stave.page.mouse.move(
    geometry!.guest.x + geometry!.guest.width * 0.75,
    geometry!.guest.y + geometry!.guest.height * 0.5,
    { steps: 8 },
  );
  expect((await guestState())!.pointerEvents).toBe("none");

  await stave.page.mouse.up();
  expect((await guestState())!.pointerEvents).toBe("auto");

  const widthAfterRelease = (await sidebar.boundingBox())!.width;
  expect(widthAfterRelease).not.toBe(widthBefore);
  await stave.page.mouse.move(
    geometry!.guest.x + geometry!.guest.width * 0.5,
    geometry!.guest.y + geometry!.guest.height * 0.5,
  );
  await stave.page.waitForTimeout(50);
  expect((await sidebar.boundingBox())!.width).toBe(widthAfterRelease);
});

test("the product window paints and hit-tests the guest above the app surface", async () => {
  const geometry = await guestGeometry();
  expect(geometry).not.toBeNull();

  const samplePoint = {
    x: geometry!.placeholder.x + geometry!.placeholder.width * 0.5,
    y: geometry!.placeholder.y + geometry!.placeholder.height * 0.5,
  };
  const hit = await stave.page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return {
      tagName: target?.tagName.toLowerCase() ?? null,
      lensSessionId:
        target instanceof HTMLElement
          ? (target.dataset.lensSessionId ?? null)
          : null,
    };
  }, samplePoint);

  expect(hit).toEqual({
    tagName: "webview",
    lensSessionId: E2E_LENS_SESSION_ID,
  });

  // Electron windows do not have a Playwright-emulated viewport, so
  // `page.viewportSize()` is null. Read the renderer's CSS viewport instead
  // and scale it to the captured device pixels.
  const viewport = await stave.page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const screenshot = decodePng(await stave.page.screenshot());
  const sample = pixelAt(
    screenshot,
    samplePoint.x * (screenshot.width / viewport.width),
    samplePoint.y * (screenshot.height / viewport.height),
  );

  // The fixture is a solid #123456 away from its heading. Sampling the host
  // window, rather than the guest directly, proves the user can see the page
  // instead of an opaque Stave surface painted over it.
  expect(sample).toEqual({ r: 18, g: 52, b: 86, a: 255 });
});

test("the guest tracks the placeholder when the layout changes", async () => {
  const before = await guestGeometry();

  const size = stave.page.viewportSize();
  await stave.page.setViewportSize({
    width: Math.max(900, (size?.width ?? 1200) - 220),
    height: Math.max(700, (size?.height ?? 900) - 160),
  });

  await expect
    .poll(async () => {
      const geometry = await guestGeometry();
      return geometry ? geometry.guest.width !== before?.guest.width : false;
    }, { timeout: 10_000 })
    .toBe(true);

  const after = await guestGeometry();
  expect(after!.guest).toEqual(after!.placeholder);
});

test("panel chrome opens over the page without hiding it", async () => {
  // The behaviour the whole rendering-model change is for. With the guest
  // composited above the renderer, a 200x80 dropdown could only be shown by
  // blanking the entire preview; here it is ordinary stacking.
  const trigger = stave.page.getByRole("button", { name: "Save screenshot" });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  await expect(stave.page.getByRole("menuitem").first()).toBeVisible();

  const state = await guestState();
  expect(state!.opacity).toBe("1");
  expect(state!.rect.width).toBeGreaterThan(0);

  await stave.page.keyboard.press("Escape");
});

test("the occlusion and bounds-IPC paths are never used", async () => {
  // Release gate from the plan, and readable straight off the shipping
  // instrumentation: the observer that scanned `document.body` per mounted
  // panel is gone, and no layout change spends an IPC round trip any more.
  const snapshot = await stave.page.evaluate(() => {
    const read = (
      globalThis as unknown as {
        __staveLensInstrumentation?: () => unknown;
      }
    ).__staveLensInstrumentation;
    return read ? (read() as Record<string, never>) : null;
  });

  expect(snapshot).not.toBeNull();
  expect((snapshot as never as { occlusion: { observations: number } }).occlusion.observations).toBe(0);
  expect((snapshot as never as { boundsSync: { count: number } }).boundsSync.count).toBe(0);
  expect((snapshot as never as { surfaces: { attached: number } }).surfaces.attached).toBeGreaterThan(0);
});

test("a parked guest keeps compositing instead of freezing", async () => {
  const guest = findGuestPage();
  expect(guest).toBeDefined();

  // Switch the panel off the preview tab. The session stays open and the guest
  // stays mounted; it is only hidden.
  await stave.page.getByRole("button", { name: "Show console" }).click();
  await expect
    .poll(async () => (await guestState())?.opacity, { timeout: 10_000 })
    .toBe("0");

  /*
   * Invisible, never detached, and hidden by the only mechanism that leaves the
   * guest composited. `display: none` and `visibility: hidden` both take it out
   * of the paint tree, and a guest with no frame cannot answer a screenshot —
   * which is measured in `lens-parked-guest-agent-path.electron.e2e.ts`, since
   * the frame counter below cannot see the difference.
   */
  const parked = await guestState();
  expect(parked!.display).not.toBe("none");
  expect(parked!.visibility).not.toBe("hidden");
  expect(parked!.pointerEvents).toBe("none");
  expect(parked!.parentId).toBe("lens-surface-root");

  const before = await guest!.evaluate(
    () => (window as unknown as { __frames: number }).__frames,
  );
  await stave.page.waitForTimeout(700);
  const after = await guest!.evaluate(
    () => (window as unknown as { __frames: number }).__frames,
  );

  // A ticking counter is necessary but not sufficient: script scheduling
  // survives `visibility: hidden` too, which is exactly how the compositor
  // defect this parking style now avoids went unnoticed. The pixel-level proof
  // lives in the agent-path spec.
  expect(after).toBeGreaterThan(before);

  await stave.page.getByRole("button", { name: "Show preview" }).click();
  await expect
    .poll(async () => (await guestState())?.opacity, { timeout: 10_000 })
    .toBe("1");

  // Same page, same document: hiding a tab is not closing a session.
  await expect(guest!.locator("#heading")).toHaveText("lens fixture");
});

test("the guest still tracks the placeholder after a tab round trip", async () => {
  /*
   * Declared last on purpose: it depends on the preceding test having left the
   * panel through Console and back.
   *
   * The placeholder is rendered only on the Preview tab, so that round trip
   * destroys it and mounts a *different* element. A host that binds its
   * `ResizeObserver` once, in a mount-time effect, keeps observing the detached
   * one — the panel still looks right, because returning to Preview re-measures
   * once, and then every subsequent layout change is silently missed. The
   * asymmetry that gives it away is below: a window resize keeps working the
   * whole time, because that path re-reads the element on each call.
   */
  const before = await guestGeometry();
  expect(before!.guest).toEqual(before!.placeholder);

  const size = stave.page.viewportSize();
  await stave.page.setViewportSize({
    width: Math.max(820, (size?.width ?? 1000) - 140),
    height: Math.max(640, (size?.height ?? 800) - 120),
  });

  await expect
    .poll(async () => {
      const geometry = await guestGeometry();
      return geometry ? geometry.guest.width !== before?.guest.width : false;
    }, { timeout: 10_000 })
    .toBe(true);

  const after = await guestGeometry();
  expect(after!.guest).toEqual(after!.placeholder);
});

test("pane chrome that must be seen shares the guest's plane, not the pane's", async () => {
  /*
   * The loading badge and the load-error strip overlap a real page. They cannot
   * win that with a `z-index` in the pane: Dockview renders keep-alive panels
   * inside `.dv-render-overlay`, which sets `isolation: isolate`,
   * `contain: layout paint` and a `transform`, and carries `z-index: 1` — so
   * any layer the pane claims is scoped below the guest plane and the chrome is
   * painted behind an opaque page. Here it is a sibling of the guest instead.
   */
  const chrome = await stave.page.evaluate(() => {
    const layer = document.querySelector("[data-lens-guest-chrome]");
    const guest = document.querySelector("webview");
    if (!(layer instanceof HTMLElement) || !(guest instanceof HTMLElement)) {
      return null;
    }
    const layerRect = layer.getBoundingClientRect();
    const guestRect = guest.getBoundingClientRect();
    return {
      parentId: layer.parentElement?.id ?? null,
      insideDockview: Boolean(layer.closest(".dv-dockview")),
      sharesGuestParent: layer.parentElement === guest.parentElement,
      // Later in the flat root and explicitly above it, so nothing rests on
      // document order alone settling a paint against an out-of-process frame.
      aboveGuest:
        Number(getComputedStyle(layer).zIndex) >
        Number(getComputedStyle(guest).zIndex),
      pointerEvents: getComputedStyle(layer).pointerEvents,
      rect: {
        x: layerRect.x,
        y: layerRect.y,
        width: layerRect.width,
        height: layerRect.height,
      },
      guestRect: {
        x: guestRect.x,
        y: guestRect.y,
        width: guestRect.width,
        height: guestRect.height,
      },
    };
  });

  expect(chrome).not.toBeNull();
  expect(chrome!.parentId).toBe("lens-surface-root");
  expect(chrome!.insideDockview).toBe(false);
  expect(chrome!.sharesGuestParent).toBe(true);
  expect(chrome!.aboveGuest).toBe(true);
  // A sheet over the whole page must not take the page's clicks; only the
  // elements a panel puts inside it opt back in.
  expect(chrome!.pointerEvents).toBe("none");
  expect(chrome!.rect).toEqual(chrome!.guestRect);
});
