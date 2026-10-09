import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createInlineRenderStore,
  inlineRenderWorkspaceKey,
  type InlineRenderStore,
} from "../electron/main/inline-render/inline-render-store";
import { respondToInlineRenderRequest } from "../electron/main/inline-render/inline-render-protocol";
import { buildInlineRenderUrl, isInlineRenderId } from "@/lib/inline-render/inline-render";

let root: string;
let store: InlineRenderStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "stave-inline-render-"));
  store = createInlineRenderStore({ rootDir: () => root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function publish(overrides: Partial<Parameters<InlineRenderStore["publish"]>[0]> = {}) {
  return store.publish({
    workspaceId: "worktree:abc",
    taskId: "task-1",
    turnId: "turn-1",
    html: "<p>chart</p>",
    title: "  Weekly   spend ",
    ...overrides,
  });
}

describe("inline render store", () => {
  test("publishes the agent's markup unchanged and reads it back", async () => {
    const reference = await publish({ height: 9_000 });
    expect(isInlineRenderId(reference.renderId)).toBe(true);
    expect(reference.renderId.startsWith(inlineRenderWorkspaceKey("worktree:abc"))).toBe(true);
    expect(reference).toMatchObject({ title: "Weekly spend", height: 2_000 });

    const page = await store.read(reference.renderId);
    expect(page?.html).toBe("<p>chart</p>");
    expect(page?.record).toMatchObject({ taskId: "task-1", turnId: "turn-1", title: "Weekly spend" });
  });

  test("never reads outside its own files", async () => {
    await publish();
    expect(await store.read("../../etc/passwd")).toBeNull();
    expect(await store.read("0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100")).toBeNull();
  });

  test("refuses an empty or oversized page", async () => {
    expect(publish({ html: "" })).rejects.toThrow();
    expect(publish({ html: "x".repeat(512_001) })).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  test("removing a workspace removes only that workspace's pages", async () => {
    const kept = await publish({ workspaceId: "worktree:other" });
    const removed = await publish();
    await store.removeWorkspace("worktree:abc");
    expect(await store.read(removed.renderId)).toBeNull();
    expect((await store.read(kept.renderId))?.html).toBe("<p>chart</p>");
  });
});

describe("inline render protocol", () => {
  test("serves the page with the bootstrap and the URL's policy", async () => {
    const reference = await publish({ html: "<!doctype html><p id=mine>chart</p>" });
    const response = await respondToInlineRenderRequest({
      url: buildInlineRenderUrl({ renderId: reference.renderId, networkPolicy: "blocked" }),
      method: "GET",
      store,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toStartWith("sandbox allow-scripts allow-forms;");
    expect(csp).toContain("connect-src 'none'");
    const body = await response.text();
    expect(body.indexOf("stave-inline-render-theme")).toBeLessThan(body.indexOf("id=mine"));
  });

  test("a tampered policy is served as blocked", async () => {
    const reference = await publish();
    const response = await respondToInlineRenderRequest({
      url: `stave-render://frame/${reference.renderId}?net=everything`,
      method: "GET",
      store,
    });
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  test("refuses unknown pages and other methods with a closed policy", async () => {
    const missing = await respondToInlineRenderRequest({
      url: "stave-render://frame/0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100?net=open",
      method: "GET",
      store,
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-security-policy")).toContain("sandbox");

    const reference = await publish();
    const post = await respondToInlineRenderRequest({
      url: buildInlineRenderUrl({ renderId: reference.renderId, networkPolicy: "open" }),
      method: "POST",
      store,
    });
    expect(post.status).toBe(405);
  });
});

describe("inline render page context", () => {
  test("the last context wins, is bound to the page's own task, and clears", async () => {
    const first = await publish();
    const second = await publish();
    const other = await publish({ taskId: "task-2" });
    expect(await store.setModelContext(first.renderId, { text: "claude", structured: null })).toBe(true);
    expect(await store.setModelContext(first.renderId, { text: null, structured: { selected: "codex" } })).toBe(true);
    expect(await store.setModelContext(second.renderId, { text: "second", structured: null })).toBe(true);
    expect(await store.setModelContext(other.renderId, { text: "other task", structured: null })).toBe(true);

    expect((await store.readModelContext(first.renderId))?.context).toEqual({
      text: null,
      structured: { selected: "codex" },
    });
    const entries = await store.listTaskModelContexts({ workspaceId: "worktree:abc", taskId: "task-1" });
    expect(entries.map((entry) => entry.renderId).sort()).toEqual([first.renderId, second.renderId].sort());
    expect(entries.every((entry) => entry.title === "Weekly spend")).toBe(true);
    expect(await store.listTaskModelContexts({ workspaceId: "elsewhere", taskId: "task-1" })).toEqual([]);

    expect(await store.setModelContext(first.renderId, null)).toBe(true);
    expect(await store.readModelContext(first.renderId)).toBeNull();
    expect(
      (await store.listTaskModelContexts({ workspaceId: "worktree:abc", taskId: "task-1" })).map(
        (entry) => entry.renderId,
      ),
    ).toEqual([second.renderId]);
  });

  test("an unknown page or an oversized context is refused", async () => {
    expect(
      await store.setModelContext("0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100", {
        text: "x",
        structured: null,
      }),
    ).toBe(false);
    const reference = await publish();
    await expect(
      store.setModelContext(reference.renderId, { text: "x".repeat(20_000), structured: null }),
    ).rejects.toThrow("exceeds");
    expect(await store.readModelContext(reference.renderId)).toBeNull();
  });

  test("archiving the workspace removes page context too", async () => {
    const reference = await publish();
    await store.setModelContext(reference.renderId, { text: "x", structured: null });
    await store.removeWorkspace("worktree:abc");
    expect(await store.listTaskModelContexts({ workspaceId: "worktree:abc", taskId: "task-1" })).toEqual([]);
  });
});
