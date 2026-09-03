import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_WORKSPACE_ID,
  launchStave,
  seedProject,
  type StaveApp,
} from "./harness/stave-app";
import {
  callStaveMcpTool,
  readScreenshotBase64,
  waitForStaveMcpEndpoint,
  type McpToolResult,
  type StaveMcpEndpoint,
} from "./harness/stave-mcp";
import {
  countDistinctColors,
  decodePng,
  differingPixelRatio,
  formatRgb,
  pixelAtFraction,
  type DecodedPng,
} from "./harness/png";

/**
 * Two claims the `<webview>` cutover rests on, measured against the shipping
 * product rather than argued from the source.
 *
 * Both are about a **parked** guest: an agent- or MCP-opened Lens session that
 * no panel has ever shown, laid out at its full 1280x800 default viewport and
 * hidden with `opacity: 0` (`resolveLensGuestStyle`). That state is what makes
 * `stave_lens_*` usable without stealing the user's foreground, so everything
 * downstream of it has to keep working while the guest is invisible.
 *
 * - **Claim A — a parked guest still answers a screenshot. It does, and the
 *   reason is one CSS property.** The other Electron spec watches a
 *   `requestAnimationFrame` counter, which shows the guest's *script* is still
 *   running and says nothing about whether the compositor produces frames. This
 *   one calls the tool an agent calls and decodes the PNG: a parked guest
 *   returns its page's actual pixels, and repaints them when the page changes.
 *   The last test in the file forces `visibility: hidden` back on by hand and
 *   watches the same call stop answering, because that is the regression this
 *   parking style exists to avoid and a comment cannot hold the line on it.
 *
 * - **Claim B — the focus guard in front of agent input means something. It
 *   does.** `withLensGuestFocus` trusts `focusLensGuest`, which returns
 *   `true` for any connected element without checking — so the guard looked
 *   like it might be waving through the exact case it documents. Measured, it
 *   is not: the borrow really does move `document.activeElement` onto the guest
 *   while the guest is parked. After the dispatch, `restoreLensGuestFocus`
 *   returns that focus to the host control that held it, so a parked guest
 *   cannot keep the caret. The control here removes only the borrow and
 *   watches the same `Input.insertText` land in the app's own text box instead
 *   of the page. The guard is the only thing standing between an agent
 *   keystroke and the user's prompt.
 *
 * Everything runs through the local MCP server the app starts at boot, because
 * that is the agent's real entry point: session acquisition, presentation
 * policy, the focus guard and the CDP dispatch, in the order the tool puts
 * them in.
 *
 * Requires `bun run build:desktop`.
 */

/** A session id no panel will ever adopt on its own. */
const PARKED_SESSION_ID = "agent-parked";

const LEFT_A = { r: 220, g: 20, b: 60 };
const RIGHT_A = { r: 0, g: 0, b: 128 };
const LEFT_B = { r: 34, g: 139, b: 34 };
const RIGHT_B = { r: 255, g: 215, b: 0 };

let stave: StaveApp;
let endpoint: StaveMcpEndpoint;
let projectDir: string;
let server: Server;
let origin: string;

function paintPage(
  title: string,
  left: { r: number; g: number; b: number },
  right: { r: number; g: number; b: number },
): string {
  const css = (color: { r: number; g: number; b: number }) =>
    `rgb(${color.r}, ${color.g}, ${color.b})`;
  return `<!doctype html>
<html>
  <head><title>${title}</title></head>
  <body style="margin:0;overflow:hidden;background:#ffffff">
    <div style="position:fixed;left:0;top:0;bottom:0;width:50%;background:${css(left)}"></div>
    <div style="position:fixed;right:0;top:0;bottom:0;width:50%;background:${css(right)}"></div>
    <h1 id="heading" style="position:fixed;left:12px;top:6px;margin:0;font:700 28px system-ui;color:#ffffff">${title}</h1>
  </body>
</html>`;
}

/** Nothing but white, so a real frame has something to be measured against. */
const BLANK_PAGE = `<!doctype html>
<html><head><title>blank</title></head>
<body style="margin:0;overflow:hidden;background:#ffffff"></body></html>`;

const FORM_PAGE = `<!doctype html>
<html>
  <head><title>lens form</title></head>
  <body style="margin:0;background:#101010;color:#ffffff;font:16px system-ui">
    <h1 id="heading">lens form</h1>
    <input id="field" style="width:420px;height:44px;font-size:20px" />
    <button id="press" style="width:220px;height:64px;font-size:20px">press</button>
    <div id="pressed"></div>
    <script>
      document.getElementById("press").addEventListener("click", () => {
        document.getElementById("pressed").textContent = "pressed";
      });
    </script>
  </body>
</html>`;

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    const url = request.url ?? "/";
    const body = url.startsWith("/paint/b")
      ? paintPage("paint b", LEFT_B, RIGHT_B)
      : url.startsWith("/paint/a")
        ? paintPage("paint a", LEFT_A, RIGHT_A)
        : url.startsWith("/form")
          ? FORM_PAGE
          : BLANK_PAGE;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // A cached document would let a stale frame masquerade as a fresh one.
      "cache-control": "no-store",
    });
    response.end(body);
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

function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  return callStaveMcpTool(endpoint, name, {
    workspaceId: E2E_WORKSPACE_ID,
    lensSessionId: PARKED_SESSION_ID,
    ...args,
  });
}

async function navigateParkedGuest(pathname: string): Promise<void> {
  const result = await callTool("stave_lens_navigate", {
    url: `${origin}${pathname}`,
  });
  expect(result.isError, result.text).toBe(false);
}

/** The parked guest as its own Playwright page, for reads the path under test cannot fake. */
function findGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

/**
 * The guest element's own state in the host document, plus where host focus is.
 *
 * One evaluate rather than several: "was the guest parked *at the moment* input
 * was dispatched" is the question, and splitting it across calls would let the
 * two answers come from different moments.
 */
function hostState() {
  return stave.page.evaluate(() => {
    const guest = document.querySelector(
      `webview[data-lens-session-id="agent-parked"]`,
    ) as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    const probe = document.getElementById(
      "e2e-host-probe",
    ) as HTMLInputElement | null;
    const style = guest ? getComputedStyle(guest) : null;
    return {
      guestFound: Boolean(guest),
      opacity: style?.opacity ?? null,
      visibility: style?.visibility ?? null,
      display: style?.display ?? null,
      pointerEvents: style?.pointerEvents ?? null,
      width: style?.width ?? null,
      height: style?.height ?? null,
      left: style?.left ?? null,
      top: style?.top ?? null,
      tabIndex: guest?.tabIndex ?? null,
      hasTabindexAttribute: guest?.hasAttribute("tabindex") ?? null,
      activeTag: active?.tagName.toLowerCase() ?? null,
      activeId: active?.id || null,
      activeIsGuest: Boolean(guest) && active === guest,
      guestMatchesFocus: guest?.matches(":focus") ?? null,
      guestMatchesFocusWithin: guest?.matches(":focus-within") ?? null,
      probeValue: probe?.value ?? null,
      documentHasFocus: document.hasFocus(),
      placeholders: document.querySelectorAll("[data-lens-guest-placeholder]")
        .length,
    };
  });
}

/**
 * Put host focus somewhere unmistakable and leave it there.
 *
 * A real text input in the app's own window, focused and empty, is the thing
 * the focus guard exists to protect: if the borrow does not move focus, this is
 * where `Input.insertText` would land.
 */
function focusHostProbe(): Promise<string | null> {
  return stave.page.evaluate(() => {
    let probe = document.getElementById(
      "e2e-host-probe",
    ) as HTMLInputElement | null;
    if (!probe) {
      probe = document.createElement("input");
      probe.id = "e2e-host-probe";
      probe.type = "text";
      probe.style.position = "fixed";
      probe.style.left = "8px";
      probe.style.bottom = "8px";
      probe.style.zIndex = "2147483647";
      document.body.append(probe);
    }
    probe.value = "";
    probe.focus();
    return document.activeElement?.id || null;
  });
}

/**
 * Overwrite one of the guest element's own style properties from the host
 * document.
 *
 * Only the two controls use this, and only for properties `applyPlacement`
 * would rewrite on the next placement change anyway. Nothing here is a
 * suggestion about how the product should be written — each call isolates the
 * single variable its control is about.
 */
async function setGuestStyle(patch: Record<string, string>): Promise<void> {
  await stave.page.evaluate((input) => {
    const guest = document.querySelector(
      `webview[data-lens-session-id="agent-parked"]`,
    ) as HTMLElement | null;
    if (!guest) {
      throw new Error("the parked guest element is gone");
    }
    for (const [property, value] of Object.entries(input)) {
      guest.style.setProperty(property, value);
    }
  }, patch);
  // One frame is not enough for the guest's compositor to come back; give the
  // surface a beat before asking it for an image.
  await stave.page.waitForTimeout(600);
}

/** Whether the guest is reachable by a pointer at its own top-left corner. */
function guestHitTest() {
  return stave.page.evaluate(() => {
    const guest = document.querySelector(
      `webview[data-lens-session-id="agent-parked"]`,
    ) as HTMLElement | null;
    const rect = guest?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(rect.x + 40, rect.y + 40)
      : null;
    return {
      opacity: guest ? getComputedStyle(guest).opacity : null,
      pointerEvents: guest ? getComputedStyle(guest).pointerEvents : null,
      hitTag: hit?.tagName.toLowerCase() ?? null,
      hitIsGuest: hit === guest,
    };
  });
}

async function captureParkedGuest(options?: {
  fullPage?: boolean;
}): Promise<{ image: DecodedPng; bytes: number }> {
  const result = await callTool("stave_lens_screenshot", { ...options });
  expect(result.isError, result.text).toBe(false);
  const base64 = readScreenshotBase64(result);
  const buffer = Buffer.from(base64, "base64");
  return { image: decodePng(buffer), bytes: buffer.byteLength };
}

function expectColor(
  actual: { r: number; g: number; b: number },
  expected: { r: number; g: number; b: number },
  label: string,
): void {
  expect(
    { r: actual.r, g: actual.g, b: actual.b },
    `${label}: got ${formatRgb({ ...actual, a: 255 })}`,
  ).toEqual(expected);
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  await startFixtureServer();

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });

  /*
   * Seeded settings, not a poke at main's security config.
   *
   * `lensCdpApprovedHosts` is what keeps `assertCdpAllowed` from opening an
   * approval dialog for the fixture host; the renderer pushes it to main on
   * boot, exactly as it would for a user who typed the host into Settings.
   * `lensAgentPresentationMode: "agent-decides"` is the setting under which a
   * parked guest is the whole point: any other value would have the renderer
   * open a panel for this session on the first agent activity and un-park the
   * guest out from under the measurement.
   */
  await seedProject(stave.page, {
    projectPath: projectDir,
    settings: {
      lensCdpApprovedHosts: ["127.0.0.1"],
      lensDeveloperModeCdp: true,
      lensAgentPresentationMode: "agent-decides",
    },
  });

  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);

  // The Lens surface is never opened in this spec. The only guest that exists
  // is the one main asks the window for on the agent's behalf.
  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          url: `${origin}/paint/a`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 60_000 },
    )
    .toBe("ok");

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

test("the agent-opened session is parked by the product's own code path", async () => {
  const state = await hostState();
  console.log("[parked] host state", JSON.stringify(state));

  expect(state.guestFound).toBe(true);
  expect(state.placeholders).toBe(0);

  /*
   * The regression guard, and the reason each value is what it is.
   *
   * `opacity: 0` is the only one of the three CSS ways to hide an element that
   * leaves Chromium compositing it. `display: none` and `visibility: hidden`
   * both take the guest out of the paint tree, and a guest with no frame cannot
   * answer `Page.captureScreenshot` — measured below, and measured again at the
   * bottom of this file by forcing the regression back on. Anyone tidying this
   * to `visibility: hidden` because it "reads better" has to get past here.
   */
  expect(state.opacity).toBe("0");
  expect(state.visibility).toBe("visible");
  expect(state.display).toBe("flex");
  // Nothing paints, so nothing can be seen; `pointer-events: none` is what
  // stops an invisible guest swallowing clicks. See the hit-test below.
  expect(state.pointerEvents).toBe("none");

  // Parked at the default viewport, not collapsed and not moved offscreen: a
  // guest outside the viewport fails a capture the same way a hidden one does.
  expect(state.width).toBe("1280px");
  expect(state.height).toBe("800px");
  expect(state.left).toBe("0px");
  expect(state.top).toBe("0px");
});

test("Claim A: a parked guest answers stave_lens_screenshot with the page's pixels", async () => {
  /*
   * The claim, asserted against the shipping parked style with nothing poked.
   *
   * The guest reaching this point was created, parked and navigated entirely by
   * the product — main asked the window for it, the window mounted it parked,
   * and no panel has ever presented it. The only thing this test does is call
   * the tool an agent calls, and look at the pixels that come back.
   *
   * Pixels, not byte counts: a blank 1280x800 frame still compresses to a few
   * kilobytes, so length alone could never separate "answered" from "answered
   * with the page".
   */
  const { image, bytes } = await captureParkedGuest();

  const left = pixelAtFraction(image, 0.25, 0.5);
  const right = pixelAtFraction(image, 0.75, 0.5);
  const distinct = countDistinctColors(image);
  console.log(
    "[claim A] paint/a",
    JSON.stringify({
      bytes,
      size: `${image.width}x${image.height}`,
      left: formatRgb(left),
      right: formatRgb(right),
      distinctColors: distinct,
    }),
  );

  // The capture describes the parked 1280x800 viewport, at whatever device
  // scale the surface runs at.
  expect(image.width).toBeGreaterThanOrEqual(1280);
  expect(Math.abs(image.width / image.height - 1280 / 800)).toBeLessThan(0.01);

  // The two halves of the page come back as the two colours the page paints,
  // and the anti-aliased heading puts more than a handful of colours in frame.
  expectColor(left, LEFT_A, "left half of the parked guest");
  expectColor(right, RIGHT_A, "right half of the parked guest");
  expect(distinct).toBeGreaterThan(2);

  // Still parked. A capture that only worked by un-parking would prove nothing.
  const state = await hostState();
  expect(state.opacity).toBe("0");
  expect(state.placeholders).toBe(0);
});

test("Claim A: the frame is live, not a stale one, and dwarfs a blank page", async () => {
  test.setTimeout(120_000);

  const first = await captureParkedGuest();

  /*
   * Polled, not captured once.
   *
   * `stave_lens_navigate` resolves on `did-finish-load`, which is earlier than
   * the compositor's first frame of the new document, and
   * `Page.captureScreenshot` hands back the frame that exists rather than
   * waiting for the next one. Capturing immediately therefore reads the
   * *previous* page — a race that has nothing to do with parking, but which
   * would make this comparison lie in either direction.
   */
  await navigateParkedGuest("/paint/b");
  let second = first;
  await expect
    .poll(
      async () => {
        second = await captureParkedGuest();
        return formatRgb(pixelAtFraction(second.image, 0.25, 0.5));
      },
      { timeout: 20_000 },
    )
    .toBe(formatRgb({ ...LEFT_B, a: 255 }));

  await navigateParkedGuest("/blank");
  let blank = second;
  await expect
    .poll(
      async () => {
        blank = await captureParkedGuest();
        return countDistinctColors(blank.image);
      },
      { timeout: 20_000 },
    )
    .toBe(1);

  const changed = differingPixelRatio(first.image, second.image);
  console.log(
    "[claim A] comparison",
    JSON.stringify({
      paintA: {
        bytes: first.bytes,
        left: formatRgb(pixelAtFraction(first.image, 0.25, 0.5)),
      },
      paintB: {
        bytes: second.bytes,
        left: formatRgb(pixelAtFraction(second.image, 0.25, 0.5)),
        right: formatRgb(pixelAtFraction(second.image, 0.75, 0.5)),
      },
      blank: {
        bytes: blank.bytes,
        distinctColors: countDistinctColors(blank.image),
        center: formatRgb(pixelAtFraction(blank.image, 0.5, 0.5)),
      },
      differingPixelRatio: Number(changed.toFixed(4)),
    }),
  );

  // A second, visually different page produces a visually different frame while
  // the guest stays parked the whole time: the compositor is running, not
  // replaying one cached image from before the session was hidden.
  expectColor(pixelAtFraction(second.image, 0.25, 0.5), LEFT_B, "paint/b left");
  expectColor(
    pixelAtFraction(second.image, 0.75, 0.5),
    RIGHT_B,
    "paint/b right",
  );
  expect(changed).toBeGreaterThan(0.9);

  // And a genuinely blank page is distinguishable from both: one colour, and a
  // fraction of the bytes. This is the number that says byte length alone could
  // never have settled the claim.
  expect(countDistinctColors(blank.image)).toBe(1);
  expect(first.bytes).toBeGreaterThan(blank.bytes);
  expect(second.bytes).toBeGreaterThan(blank.bytes);

  const stillParked = await hostState();
  expect(stillParked.opacity).toBe("0");
  expect(stillParked.placeholders).toBe(0);

  await navigateParkedGuest("/paint/a");
});

test("Claim A: the parked guest is untouchable because pointer-events says so", async () => {
  /*
   * Load-bearing in a way it was not under `visibility: hidden`.
   *
   * An unpainted element cannot be hit, so the old parked style got
   * un-hittability for free. An `opacity: 0` element is fully hit-testable — it
   * is invisible, not absent — and a parked guest sits at 0,0 across a
   * 1280x800 rectangle, directly over the app's own chrome. `pointer-events:
   * none` is now the only thing between a parked agent session and every click
   * the user aims at the app underneath it.
   */
  const parked = await guestHitTest();
  console.log("[claim A] parked hit test", JSON.stringify(parked));

  expect(parked.opacity).toBe("0");
  expect(parked.pointerEvents).toBe("none");
  expect(parked.hitIsGuest).toBe(false);
  // Something of the app's own is there to receive the click instead.
  expect(parked.hitTag).not.toBeNull();
  expect(parked.hitTag).not.toBe("webview");

  // And the proof that `pointer-events` is what is carrying it: turn only that
  // one property off and the guest immediately becomes the hit target.
  await setGuestStyle({ "pointer-events": "auto" });
  const grabby = await guestHitTest();
  console.log(
    "[claim A] hit test with pointer-events auto",
    JSON.stringify(grabby),
  );
  expect(grabby.hitIsGuest).toBe(true);

  await setGuestStyle({ "pointer-events": "none" });
  expect((await guestHitTest()).hitIsGuest).toBe(false);
});

test("Claim B: stave_lens_type lands in the parked guest, not the host", async () => {
  await navigateParkedGuest("/form");
  await expect
    .poll(async () => findGuestPage()?.url() ?? null, { timeout: 15_000 })
    .toContain("/form");

  const guest = findGuestPage();
  expect(guest).toBeDefined();
  await expect(guest!.locator("#heading")).toHaveText("lens form");

  const focusedBefore = await focusHostProbe();
  const before = await hostState();
  expect(focusedBefore).toBe("e2e-host-probe");

  const typed = "agent-typed-here";
  const result = await callTool("stave_lens_type", {
    text: typed,
    // A selector, deliberately: this spec is about a parked guest taking input
    // at all, which must keep working through the escape-hatch addressing mode
    // as well as through a snapshot ref.
    target: "#field",
  });

  const after = await hostState();
  const guestValue = await guest!.locator("#field").inputValue();

  console.log(
    "[claim B] type",
    JSON.stringify({
      toolIsError: result.isError,
      toolText: result.text.slice(0, 400),
      guestFieldValue: guestValue,
      hostProbeValue: after.probeValue,
      hostActiveBefore: `${before.activeTag}#${before.activeId}`,
      hostActiveAfter: `${after.activeTag}#${after.activeId}`,
      guestElementIsActive: after.activeIsGuest,
      guestMatchesFocus: after.guestMatchesFocus,
      guestMatchesFocusWithin: after.guestMatchesFocusWithin,
      guestTabIndex: after.tabIndex,
      guestHasTabindexAttribute: after.hasTabindexAttribute,
      guestOpacity: after.opacity,
      documentHasFocus: after.documentHasFocus,
    }),
  );

  // What the agent asked for has to be what happened.
  expect(result.isError, result.text).toBe(false);
  expect(guestValue).toBe(typed);
  // And nothing may have leaked into the app's own window.
  expect(after.probeValue).toBe("");
  // Still parked throughout.
  expect(after.opacity).toBe("0");
});

test("Claim B: the focus borrow returns host activeElement after the dispatch", async () => {
  // Recorded as its own assertion because the guard's doc block is a claim
  // about DOM focus, not about where characters ended up. `focusLensGuest`
  // reports success for any connected element and never checks; if host focus
  // is unchanged after a borrow, the guard is passing without measuring
  // anything, whatever the input dispatch happens to do. After the dispatch,
  // the same path must give that focus back — otherwise a parked guest in
  // another workspace keeps the caret.
  const focusedBefore = await focusHostProbe();
  expect(focusedBefore).toBe("e2e-host-probe");

  const result = await callTool("stave_lens_type", {
    text: "second-pass",
    target: "#field",
  });
  expect(result.isError, result.text).toBe(false);

  const after = await hostState();
  console.log(
    "[claim B] focus restore",
    JSON.stringify({
      hostActiveAfter: `${after.activeTag}#${after.activeId}`,
      guestElementIsActive: after.activeIsGuest,
      guestMatchesFocus: after.guestMatchesFocus,
      guestOpacity: after.opacity,
      guestTabIndex: after.tabIndex,
    }),
  );

  expect(
    after.activeId,
    `after restoring focus from a parked guest, host document.activeElement is ${after.activeTag}#${after.activeId}`,
  ).toBe("e2e-host-probe");
  expect(after.activeIsGuest).toBe(false);
});

test("Claim B: without the borrow, the same input lands in the app's own box", async () => {
  /*
   * The counterfactual the guard's doc block implies but never states.
   *
   * `withLensGuestFocus` is justified by "input silently landing on whatever
   * else holds focus". This dispatches the same `Input.insertText` on the same
   * debugger session with host focus deliberately parked on the app's own text
   * input and no borrow at all, so the answer to "what does the guard buy" is a
   * measurement rather than an inference.
   */
  const guest = findGuestPage();
  expect(guest).toBeDefined();

  const focusedBefore = await focusHostProbe();
  expect(focusedBefore).toBe("e2e-host-probe");

  const control = await stave.app.evaluate(async ({ webContents }, text) => {
    const target = webContents
      .getAllWebContents()
      .find((contents) => contents.getType() === "webview");
    if (!target) {
      return { ok: false as const, message: "no webview WebContents" };
    }
    // The product's CDP controller owns the single allowed attachment, so reuse
    // it instead of fighting it for one.
    if (!target.debugger.isAttached()) {
      target.debugger.attach("1.3");
    }
    await target.debugger.sendCommand("Runtime.evaluate", {
      expression: `(() => { const f = document.querySelector("#field"); f.value = ""; f.focus(); })()`,
    });
    await target.debugger.sendCommand("Input.insertText", { text });
    const read = (await target.debugger.sendCommand("Runtime.evaluate", {
      expression: `document.querySelector("#field").value`,
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    return { ok: true as const, value: String(read.result?.value ?? "") };
  }, "no-borrow-control");

  const after = await hostState();
  console.log(
    "[claim B] control (no focus borrow)",
    JSON.stringify({
      control,
      hostProbeValue: after.probeValue,
      hostActiveAfter: `${after.activeTag}#${after.activeId}`,
      guestElementIsActive: after.activeIsGuest,
    }),
  );

  expect(control.ok).toBe(true);
  // The guest never saw the characters...
  expect(control.ok && control.value).toBe("");
  // ...the app's own text input did. Same debugger session, same command, same
  // parked guest; the only thing removed was the borrow. So the guard is load
  // bearing, and the misdelivery its doc block describes is not hypothetical.
  expect(after.probeValue).toBe("no-borrow-control");
  expect(after.activeId).toBe("e2e-host-probe");
});

test("Claim B: stave_lens_click reaches the parked guest", async () => {
  const guest = findGuestPage();
  expect(guest).toBeDefined();

  const focusedBefore = await focusHostProbe();
  expect(focusedBefore).toBe("e2e-host-probe");

  const result = await callTool("stave_lens_click", { target: "#press" });
  const pressed = await guest!.locator("#pressed").textContent();
  const after = await hostState();

  console.log(
    "[claim B] click",
    JSON.stringify({
      toolIsError: result.isError,
      toolText: result.text.slice(0, 400),
      guestPressed: pressed,
      hostActiveAfter: `${after.activeTag}#${after.activeId}`,
      guestOpacity: after.opacity,
    }),
  );

  expect(result.isError, result.text).toBe(false);
  expect(pressed).toBe("pressed");
  expect(after.opacity).toBe("0");
});

test("Claim A: forcing visibility:hidden back onto a parked guest breaks capture", async () => {
  /*
   * A simulated regression, and it has to stay last in this file.
   *
   * Nothing in the product does this. The test sets `visibility: hidden` on the
   * parked guest by hand — the style parking used to carry — so that the reason
   * `resolveLensGuestStyle` returns `opacity` is measured rather than asserted
   * by comment. Everything else about the guest is unchanged: same session,
   * same page, same tool call.
   *
   * Why it must be last: a hidden guest does not refuse the capture, it never
   * answers it, and the call dies on Lens's own 15-second guard. The abandoned
   * `Page.captureScreenshot` stays queued on the guest's debugger session, and
   * anything else that talks to that page — including Playwright's own protocol
   * calls — queues behind it.
   */
  test.setTimeout(180_000);

  // Onto a page with known colours, since the input tests left the guest on the
  // form. Polled, because a capture taken before the new document's first frame
  // reads the previous page.
  await navigateParkedGuest("/paint/a");
  await expect
    .poll(
      async () =>
        formatRgb(
          pixelAtFraction((await captureParkedGuest()).image, 0.25, 0.5),
        ),
      { timeout: 20_000 },
    )
    .toBe(formatRgb({ ...LEFT_A, a: 255 }));

  await setGuestStyle({ visibility: "hidden" });
  const startedAt = Date.now();
  const regressed = await callTool("stave_lens_screenshot", {});
  const elapsedMs = Date.now() - startedAt;

  console.log(
    "[claim A] regression control: visibility:hidden",
    JSON.stringify({
      isError: regressed.isError,
      text: regressed.text,
      elapsedMs,
    }),
  );

  expect(regressed.isError).toBe(true);
  expect(regressed.text).toMatch(/timed out|Unable to capture screenshot/);

  // Put the shipping style back and confirm the capture returns with it, so the
  // one CSS property really is the whole difference.
  await setGuestStyle({ visibility: "visible" });
  const restored = await captureParkedGuest();
  console.log(
    "[claim A] restored to the shipping parked style",
    JSON.stringify({
      bytes: restored.bytes,
      size: `${restored.image.width}x${restored.image.height}`,
      left: formatRgb(pixelAtFraction(restored.image, 0.25, 0.5)),
    }),
  );
  expectColor(
    pixelAtFraction(restored.image, 0.25, 0.5),
    LEFT_A,
    "left half after restoring the shipping parked style",
  );
});
