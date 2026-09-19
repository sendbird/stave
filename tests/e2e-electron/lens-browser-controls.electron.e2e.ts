import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_WORKSPACE_ID,
  E2E_LENS_SESSION_ID,
  launchStave,
  openLensSurface,
  seedProject,
  type StaveApp,
} from "./harness/stave-app";

let stave: StaveApp;
let directory: string;
let server: Server;
let origin: string;
let guest: Page;
const received: { method?: string; body: string }[] = [];
const target = {
  workspaceId: E2E_WORKSPACE_ID,
  lensSessionId: E2E_LENS_SESSION_ID,
};

test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "lens-controls-"));
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.url === "/post")
        received.push({ method: request.method, body });
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><title>Lens controls</title><button id="button">Select me</button>
        <form action="/post" method="post" target="_blank"><input name="message" value="preserve-body"><button id="post">Submit</button></form>
        <script>window.addEventListener('message', e => window.lastMessage = e.data);</script>`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  stave = await launchStave();
  await seedProject(stave.page, { projectPath: directory });
  await openLensSurface(stave.page);
  await expect
    .poll(() =>
      stave.page.evaluate(
        async (args) =>
          (
            await window.api!.lens!.navigate!({
              ...args.target,
              url: args.origin,
            })
          )?.ok,
        { target, origin },
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      stave.app.windows().some((page) => page.url().startsWith(origin)),
    )
    .toBe(true);
  guest = stave.app.windows().find((page) => page.url().startsWith(origin))!;
});

test.afterAll(async () => {
  await stave?.close();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("native popups preserve opener messaging and POST submissions", async () => {
  await guest.evaluate((url) => {
    const child = window.open("about:blank", "login");
    if (!child) throw new Error("Popup was denied");
    child.location.href = url + "/login";
  }, origin);
  await expect
    .poll(() =>
      stave.app.windows().some((page) => page.url().endsWith("/login")),
    )
    .toBe(true);
  const popup = stave.app
    .windows()
    .find((page) => page.url().endsWith("/login"))!;
  expect(await popup.evaluate(() => Boolean(window.opener))).toBe(true);
  await popup.evaluate(() =>
    window.opener.postMessage("signed-in", location.origin),
  );
  await expect
    .poll(() =>
      guest.evaluate(
        () => (window as unknown as { lastMessage: string }).lastMessage,
      ),
    )
    .toBe("signed-in");
  await popup.evaluate(() => window.close());
  await guest.locator("#post").click();
  await expect
    .poll(() => received)
    .toEqual([{ method: "POST", body: "message=preserve-body" }]);
});

test("developer tools target the guest and the compact tools menu stays usable", async () => {
  await stave.page
    .getByRole("button", { name: "Open developer tools" })
    .click();
  await expect
    .poll(() =>
      stave.app.evaluate(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .find((wc) => wc.getURL() === url + "/")
            ?.isDevToolsOpened(),
        origin,
      ),
    )
    .toBe(true);
  await stave.app.evaluate(
    ({ webContents }, url) =>
      webContents
        .getAllWebContents()
        .find((wc) => wc.getURL() === url + "/")
        ?.closeDevTools(),
    origin,
  );
  await stave.page.getByRole("button", { name: "More browser tools" }).click();
  await expect(
    stave.page.getByRole("menuitem", { name: "Measure spacing" }),
  ).toBeVisible();
  await stave.page.keyboard.press("Escape");
  await expect(
    stave.page.getByRole("menuitem", { name: "Measure spacing" }),
  ).toBeHidden();
  await stave.page.screenshot({
    path: test.info().outputPath("lens-toolbar.png"),
  });
  const host = await stave.app.browserWindow(stave.page);
  const original = await host.evaluate((win) => win.getSize());
  await host.evaluate((win) => {
    win.setMinimumSize(640, 480);
    win.setSize(760, 720);
  });
  await expect
    .poll(async () => {
      const panel = await stave.page
        .getByTestId("lens-surface-panel")
        .boundingBox();
      const button = await stave.page
        .getByRole("button", { name: "More browser tools" })
        .boundingBox();
      return Boolean(
        panel &&
        button &&
        button.x >= panel.x &&
        button.x + button.width <= panel.x + panel.width,
      );
    })
    .toBe(true);
  await stave.page.screenshot({
    path: test.info().outputPath("lens-toolbar-narrow.png"),
  });
  await host.evaluate((win, size) => win.setSize(size[0], size[1]), original);
});

test("selection reads page-owned component metadata without exposing annotation state", async () => {
  await guest.evaluate(() => {
    const element = document.querySelector("#button")!;
    Object.assign(element, {
      __reactFiber$fixture: {
        type: "button",
        return: {
          type: { displayName: "ActionButton" },
          _debugSource: { fileName: "src/ActionButton.tsx", lineNumber: 12 },
        },
      },
    });
  });
  const selection = stave.page.evaluate(
    (args) =>
      window.api!.lens!.startElementPicker!({
        ...args,
        options: { extractDebugSource: true },
      }),
    target,
  );
  await expect
    .poll(() => guest.locator("#__stave_picker_overlay").count())
    .toBe(1);
  await guest.locator("#button").click();
  const result = await selection;
  expect(result.ok).toBe(true);
  expect(result.result?.componentNameChain).toContain("ActionButton");
  expect(result.result?.debugSource?.fileName).toBe("src/ActionButton.tsx");
});

test("reload rebuilds the guest after automatic crash recovery is exhausted", async () => {
  for (let index = 0; index < 5; index += 1) {
    const id = await stave.app.evaluate(({ webContents }, url) => {
      const page = webContents
        .getAllWebContents()
        .find((wc) => wc.getURL() === url + "/");
      if (!page) throw new Error("No guest to crash");
      const id = page.id;
      page.forcefullyCrashRenderer();
      return id;
    }, origin);
    if (index < 4) {
      await expect
        .poll(() =>
          stave.app.evaluate(
            ({ webContents }, { url, previous }) =>
              webContents
                .getAllWebContents()
                .some((wc) => wc.id !== previous && wc.getURL() === url + "/"),
            { url: origin, previous: id },
          ),
        )
        .toBe(true);
    }
  }
  await expect(
    stave.page.getByText("Lens keeps closing", { exact: true }).first(),
  ).toBeVisible();
  await stave.page
    .getByRole("button", { name: "Reload page", exact: true })
    .click();
  await expect
    .poll(() =>
      stave.page.evaluate(
        async (args) => (await window.api!.lens!.getState!(args)).state?.url,
        target,
      ),
    )
    .toBe(origin + "/");
});
