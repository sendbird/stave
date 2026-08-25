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
  waitForStaveMcpEndpoint,
  type McpToolResult,
  type StaveMcpEndpoint,
} from "./harness/stave-mcp";

/**
 * A Lens session that loses its page comes back to that page.
 *
 * The gap this covers is a direct consequence of the rendering-model cutover. A
 * guest is a renderer-owned `<webview>`, so it dies with the renderer: a reload,
 * a crash, a dev-time restart. Main outlives all three and rebuilds the session
 * on the next open — and everything it knew about the page lived on the session
 * object that just died, so the rebuild used to land on `about:blank`. Under
 * `WebContentsView` the page outlived the renderer and none of this existed.
 *
 * The guest is killed by removing its element from the host document, which is
 * not a simulation of the failure: removing the element *is* what destroys the
 * `WebContents`, and it is exactly what a renderer teardown does to every guest
 * at once. Killing it this way rather than reloading the whole window keeps the
 * test off app-startup hydration, which is racy for reasons that have nothing
 * to do with Lens.
 *
 * The second test is the half that makes the first one safe: a session that was
 * *closed* must not come back to anything. Lens session ids are reused — the
 * first tab in every workspace is `default` — so a recovery record that
 * outlived a close would open the next fresh tab on the last one's page.
 *
 * Requires `bun run build:desktop`.
 */

let stave: StaveApp;
let projectDir: string;
let server: Server;
let origin: string;
let endpoint: StaveMcpEndpoint;

const RECOVERY_SESSION_ID = "agent-recovery";
const CLOSED_SESSION_ID = "agent-closed";

/** Distinct, cache-proof pages, so "which page is this" is never ambiguous. */
function fixtureHtml(marker: string): string {
  return `<!doctype html>
<html>
  <head><title>${marker}</title></head>
  <body style="margin:0;background:#101820">
    <h1 id="marker" style="color:white">${marker}</h1>
  </body>
</html>`;
}

async function startFixtureServer(): Promise<void> {
  server = createServer((request, response) => {
    const marker = (request.url ?? "/").replace(/^\//, "") || "root";
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(fixtureHtml(marker));
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
    ...args,
  });
}

/**
 * The guest as its own Playwright page.
 *
 * A `<webview>` guest is a separate `WebContents`, so it is never a frame of
 * the host page; it is a window. This is the read the product cannot fake —
 * where the page actually is, not what a tool reports about it.
 */
function findGuestPage(pathname: string): Page | undefined {
  return stave.app
    .windows()
    .find((window) => window.url() === `${origin}${pathname}`);
}

function anyFixtureGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

/** Destroy a session's guest the way a renderer teardown does: remove the element. */
async function killGuestElement(lensSessionId: string): Promise<void> {
  const removed = await stave.page.evaluate((sessionId) => {
    const guest = document.querySelector(
      `webview[data-lens-session-id="${sessionId}"]`,
    );
    guest?.remove();
    return Boolean(guest);
  }, lensSessionId);
  expect(removed, "no guest element to kill").toBe(true);
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  await startFixtureServer();

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });

  // No panel is ever opened here: every session in this spec is agent-opened,
  // which is the path that exercises session rebuild without a UI in the way.
  await seedProject(stave.page, {
    projectPath: projectDir,
    settings: { lensAgentPresentationMode: "agent-decides" },
  });

  endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a session whose guest died reopens on the page it was on", async () => {
  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          lensSessionId: RECOVERY_SESSION_ID,
          url: `${origin}/before-the-crash`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 60_000 },
    )
    .toBe("ok");

  await expect
    .poll(() => Boolean(findGuestPage("/before-the-crash")), {
      timeout: 30_000,
    })
    .toBe(true);

  await killGuestElement(RECOVERY_SESSION_ID);

  // The page is really gone, not merely hidden — otherwise the assertion below
  // could pass on the guest that was never destroyed.
  await expect
    .poll(() => Boolean(anyFixtureGuestPage()), { timeout: 15_000 })
    .toBe(false);

  /*
   * Reopen with no URL. This is the shape of every real recovery: the caller
   * asks for the session it already had, and says nothing about where it should
   * be. Anything that passed a URL here would be testing navigation.
   */
  const reopened = await callTool("stave_lens_open_session", {
    lensSessionId: RECOVERY_SESSION_ID,
  });
  expect(reopened.isError, reopened.text).toBe(false);

  await expect
    .poll(() => findGuestPage("/before-the-crash")?.url() ?? null, {
      timeout: 30_000,
    })
    .toBe(`${origin}/before-the-crash`);

  // Loaded, not just pointed at: a restore that set the address without
  // fetching the document would satisfy a URL check and nothing else.
  const guest = findGuestPage("/before-the-crash");
  if (!guest) {
    throw new Error("the restored guest page disappeared after the poll");
  }
  await expect(guest.locator("#marker")).toHaveText("before-the-crash", {
    timeout: 15_000,
  });
});

test("a session that was closed comes back blank, not where it was", async () => {
  await expect
    .poll(
      async () => {
        const result = await callTool("stave_lens_navigate", {
          lensSessionId: CLOSED_SESSION_ID,
          url: `${origin}/before-the-close`,
        });
        return result.isError ? result.text : "ok";
      },
      { timeout: 60_000 },
    )
    .toBe("ok");
  await expect
    .poll(() => Boolean(findGuestPage("/before-the-close")), { timeout: 30_000 })
    .toBe(true);

  const closed = await callTool("stave_lens_close_session", {
    lensSessionId: CLOSED_SESSION_ID,
  });
  expect(closed.isError, closed.text).toBe(false);

  await expect
    .poll(() => Boolean(findGuestPage("/before-the-close")), { timeout: 15_000 })
    .toBe(false);

  /*
   * One call, not a poll. Reopening a session the moment after it closed is
   * exactly where the guest mount used to fail intermittently — `did-attach`
   * arriving before `getWebContentsId` would answer — so retrying here would
   * hide the regression this is positioned to catch.
   */
  const reopened = await callTool("stave_lens_open_session", {
    lensSessionId: CLOSED_SESSION_ID,
  });
  expect(reopened.isError, reopened.text).toBe(false);

  // Held for a settle window rather than sampled once: the restore, if it
  // happened, would be an unawaited load that lands a moment after the open
  // returns, and a single sample would miss it.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    expect(findGuestPage("/before-the-close")).toBeUndefined();
    await stave.page.waitForTimeout(300);
  }

  const guestUrl = await stave.page.evaluate((sessionId) => {
    const guest = document.querySelector(
      `webview[data-lens-session-id="${sessionId}"]`,
    );
    return guest?.getAttribute("src") ?? null;
  }, CLOSED_SESSION_ID);
  expect(guestUrl).toBe("about:blank");
});
