import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ScmReviewDiffArgsSchema, ScmReviewFileDiffArgsSchema } from "../src/lib/review/review-diff-contract";

const root = path.resolve(import.meta.dir, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const sources = {
  preload: read("electron/preload.ts"),
  windowApi: read("src/types/window-api.d.ts"),
  mainIpc: read("electron/main/ipc/scm.ts"),
  protocol: read("electron/host-service/protocol.ts"),
  dispatch: read("electron/host-service.ts"),
  devBridge: read("src/lib/dev-bridge.ts"),
  devServer: read("server/dev-server.ts"),
};

const CHANNELS = [
  { ipc: "scm:review-diff", host: "scm.review-diff", method: "getReviewDiff", route: "/api/scm/review-diff", runtimeFn: "getScmReviewDiff", schema: "ScmReviewDiffArgsSchema" },
  { ipc: "scm:review-file-diff", host: "scm.review-file-diff", method: "getReviewFileDiff", route: "/api/scm/review-file-diff", runtimeFn: "getScmReviewFileDiff", schema: "ScmReviewFileDiffArgsSchema" },
] as const;

describe("review diff IPC chain", () => {
  for (const channel of CHANNELS) {
    test(`${channel.ipc} runs renderer -> preload -> validated main handler -> host service, and through the dev bridge`, () => {
      expect(sources.windowApi).toContain(`${channel.method}?: (args:`);
      expect(sources.preload).toContain(`ipcRenderer.invoke("${channel.ipc}", args)`);
      expect(sources.mainIpc).toContain(`ipcMain.handle("${channel.ipc}"`);
      expect(sources.mainIpc).toContain(`${channel.schema}.safeParse(args)`);
      expect(sources.mainIpc).toContain(`invokeHostService("${channel.host}", parsed.data)`);
      expect(sources.protocol.split(`"${channel.host}":`).length - 1).toBe(2);
      expect(sources.dispatch).toContain(`case "${channel.host}":`);
      expect(sources.dispatch).toContain(`await ${channel.runtimeFn}(request.params)`);
      expect(sources.devBridge).toContain(`postJson({ path: "${channel.route}", body: args })`);
      expect(sources.devServer).toContain(`url.pathname === "${channel.route}"`);
    });
  }
});

describe("review diff arguments", () => {
  test("accept the three bases and refuse anything else", () => {
    expect(ScmReviewDiffArgsSchema.safeParse({ cwd: "/tmp/repo", base: { kind: "commit", sha: "abc1234" } }).success).toBe(true);
    expect(ScmReviewDiffArgsSchema.safeParse({ base: { kind: "merge-base" } }).success).toBe(true);
    expect(ScmReviewDiffArgsSchema.safeParse({ base: { kind: "head" } }).success).toBe(true);
    for (const base of [{ kind: "commit", sha: "--all" }, { kind: "commit", sha: "HEAD~1" }, { kind: "tag", name: "v1" }, { kind: "head", extra: true }])
      expect(ScmReviewDiffArgsSchema.safeParse({ base }).success).toBe(false);
    expect(ScmReviewDiffArgsSchema.safeParse({ base: { kind: "head" }, path: "x" }).success).toBe(false);
  });

  test("a file read needs a commit and a path without NUL", () => {
    expect(ScmReviewFileDiffArgsSchema.safeParse({ baseSha: "abc1234", path: "src/a.ts", oldPath: "src/b.ts", untracked: false }).success).toBe(true);
    expect(ScmReviewFileDiffArgsSchema.safeParse({ baseSha: "abc1234", path: "src/a\0.ts" }).success).toBe(false);
    expect(ScmReviewFileDiffArgsSchema.safeParse({ baseSha: "main", path: "src/a.ts" }).success).toBe(false);
    expect(ScmReviewFileDiffArgsSchema.safeParse({ baseSha: "abc1234", path: "" }).success).toBe(false);
  });
});
