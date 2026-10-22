import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_LENS_SESSION_ID,
  E2E_WORKSPACE_ID,
  launchStave,
  openLensSurface,
  seedRepository,
  type StaveApp,
} from "./harness/stave-app";

/**
 * Lens review records across navigation and a native restart.
 *
 * A task's conversation is seeded with sent visual feedback (the fixture was
 * generated from the product's own draft-to-display builders; the sentinel
 * origin and IDs are filled in here). The real Lens session then captures the
 * target, and the record is saved and read through the product bridge. The
 * test checks that navigation keeps the record but marks it for a re-check,
 * that a capture of an older document cannot confirm the new one, and that
 * after a restart the record, its capture and its verdict are still there and
 * the sent feedback tray shows them. No provider turn runs.
 *
 * Requires the `out/` desktop build (`bun run build:desktop`).
 */

const TASK_ID = "task-e2e-lens-review";
const SENTINEL_ORIGIN = "http://127.0.0.1:59999";
const FIXTURE_HTML = `<!doctype html>
<html>
  <head><title>lens review fixture</title></head>
  <body style="margin: 24px; font: 18px system-ui">
    <h1>lens review fixture</h1>
    <button id="target" style="margin-top: 24px; padding: 16px 28px">Fixture action</button>
  </body>
</html>`;

let stave: StaveApp;
let server: Server;
let origin: string;
let profileDir: string;
let repositoryDir: string;
const lens = { workspaceId: E2E_WORKSPACE_ID, lensSessionId: E2E_LENS_SESSION_ID };

async function readSentFeedback(): Promise<{ annotation: Record<string, unknown> & { id: string; review: { page: { viewport: unknown } } }; displayParts: unknown[] }> {
  const text = await readFile(path.join(import.meta.dirname, "fixtures", "lens-review-sent-feedback.json"), "utf8");
  return JSON.parse(text.replaceAll(SENTINEL_ORIGIN, origin).replaceAll("__WORKSPACE_ID__", E2E_WORKSPACE_ID).replaceAll("__LENS_SESSION_ID__", E2E_LENS_SESSION_ID));
}

function findGuestPage(): Page | undefined {
  return stave.app.windows().find((window) => window.url().startsWith(origin));
}

const navigate = () => stave.page.evaluate(async (args) => (await window.api.lens?.navigate?.(args))?.ok === true, { ...lens, url: `${origin}/fixture` });

test.beforeAll(async () => {
  profileDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-lens-review-"));
  repositoryDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));
  server = createServer((request, response) => {
    response.writeHead(request.url === "/fixture" ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(request.url === "/fixture" ? FIXTURE_HTML : "not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("fixture server did not bind a port");
  origin = `http://127.0.0.1:${address.port}`;

  stave = await launchStave({ userDataDir: profileDir });
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({ timeout: 30_000 });
  await seedRepository(stave.page, { repositoryPath: repositoryDir, settings: { lensCdpApprovedHosts: ["127.0.0.1"], lensDeveloperModeCdp: true } });
  const { displayParts } = await readSentFeedback();
  const seeded = await stave.page.evaluate(async ({ workspaceId, taskId, displayParts }) => {
    const loaded = await window.api.persistence?.loadWorkspace?.({ workspaceId });
    if (!loaded?.snapshot) throw new Error("Fixture workspace snapshot was unavailable");
    const snapshot = loaded.snapshot;
    const message = { id: "sent-feedback", role: "user", model: "user", providerId: "user", content: "Make the fixture action easier to find", parts: [{ type: "text", text: "Make the fixture action easier to find" }], displayParts };
    return window.api.persistence?.upsertWorkspace?.({ id: workspaceId, name: "e2e", snapshot: {
      ...snapshot,
      activeTaskId: taskId,
      tasks: [{ id: taskId, title: "Lens review fixture task", provider: "codex" as const, updatedAt: "2026-10-22T01:00:00.000Z", unread: false }],
      messagesByTask: { ...snapshot.messagesByTask, [taskId]: [message] },
      messageCountByTask: { ...(snapshot.messageCountByTask ?? {}), [taskId]: 1 },
      promptDraftByTask: { ...(snapshot.promptDraftByTask ?? {}), [taskId]: { text: "", attachedFilePaths: [], attachments: [] } },
      providerSessionByTask: { ...(snapshot.providerSessionByTask ?? {}), [taskId]: {} },
    } as never });
  }, { workspaceId: E2E_WORKSPACE_ID, taskId: TASK_ID, displayParts });
  expect(seeded?.ok).toBe(true);
  await stave.page.reload({ waitUntil: "domcontentloaded" });
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({ timeout: 30_000 });
  await openLensSurface(stave.page);
  await expect.poll(navigate, { timeout: 30_000 }).toBe(true);
  await expect.poll(() => Boolean(findGuestPage()), { timeout: 30_000 }).toBe(true);
});

test.afterAll(async () => {
  await stave?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  for (const dir of [profileDir, repositoryDir]) if (dir) await rm(dir, { recursive: true, force: true });
});

test("a Lens review record keeps its comparison and verdict across navigation and a restart", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const { annotation } = await readSentFeedback();
  const annotationId = annotation.id;
  const viewport = async () => (await stave.page.evaluate(async (args) => window.api.lens!.evaluate!(args), { ...lens, expression: "({ width: innerWidth, height: innerHeight, devicePixelRatio })" })).result;
  const list = () => stave.page.evaluate(async (args) => window.api.lens!.listReviewRecords(args), { taskId: TASK_ID, annotationId });
  const capture = async () => {
    annotation.review.page.viewport = await viewport();
    const result = await stave.page.evaluate(async (args) => window.api.lens!.compareAnnotation(args as never), { ...lens, annotation });
    expect(result.ok, result.message).toBe(true);
    return { dataUrl: result.dataUrl!, documentId: result.documentId!, pageKey: result.pageKey! };
  };
  const save = (shot: { dataUrl: string; documentId: string; pageKey: string }) => stave.page.evaluate(async (args) => window.api.lens!.saveReviewRecord(args as never), {
    taskId: TASK_ID, ...lens, annotation, verdict: "confirmed", documentId: shot.documentId, pageKey: shot.pageKey, afterDataUrl: shot.dataUrl,
    beforeImageId: `lens-comment-image:${E2E_WORKSPACE_ID}:${E2E_LENS_SESSION_ID}:${annotationId}`,
  });
  await expect.poll(async () => await findGuestPage()?.locator("#target").count(), { timeout: 30_000 }).toBe(1);

  const first = await capture();
  expect((await save(first)).ok).toBe(true);
  expect((await list()).records?.map((record) => record.verdict)).toEqual(["confirmed"]);

  // Navigation keeps the record and marks it instead of erasing it; the tray reads it again.
  await expect.poll(navigate, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await list()).records?.[0]?.recheckReason, { timeout: 30_000 }).toBe("page-changed");
  const savedReview = () => stave.page.getByRole("region", { name: "Sent visual feedback" }).getByRole("region", { name: "Saved Lens review" });
  await expect(savedReview()).toContainText("Needs re-check: the page changed after it was confirmed");
  // A capture of the previous document cannot confirm the new one.
  expect((await save(first)).code).toBe("page-changed");

  // A confirmation of the current page, then a restart: the records and captures stay, but not as confirmed.
  await expect.poll(async () => await findGuestPage()?.locator("#target").count(), { timeout: 30_000 }).toBe(1);
  const second = await capture();
  expect((await save(second)).ok).toBe(true);
  stave.app.process().kill("SIGKILL");
  stave = await launchStave({ userDataDir: profileDir });
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({ timeout: 30_000 });
  const restarted = await list();
  expect(restarted.records?.map((record) => [record.verdict, record.recheckReason])).toEqual([["needs-recheck", "page-changed"], ["needs-recheck", "page-changed"]]);
  const image = await stave.page.evaluate(async (id) => window.api.lens!.readReviewRecordImage({ id }), restarted.records![0]!.id);
  expect(image.dataUrl).toBe(second.dataUrl);

  await openLensSurface(stave.page);
  await expect.poll(navigate, { timeout: 30_000 }).toBe(true);
  await expect(savedReview()).toContainText("Needs re-check: the page changed after it was confirmed", { timeout: 30_000 });
  await expect(savedReview().getByRole("img", { name: "Saved capture of the target" })).toHaveAttribute("src", second.dataUrl);
  await savedReview().screenshot({ path: testInfo.outputPath("lens-review-record-after-restart.png") });
});
