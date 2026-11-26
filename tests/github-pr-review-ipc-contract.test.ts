import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GetGitHubPrReviewDetailArgsSchema,
  ListGitHubPrsArgsSchema,
  SubmitGitHubPrReviewArgsSchema,
} from "../electron/main/ipc/schemas";

const root = path.resolve(import.meta.dir, "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const preloadSource = read("electron/preload.ts");
const windowApiSource = read("src/types/window-api.d.ts");
const scmIpcSource = read("electron/main/ipc/scm.ts");
const hostProtocolSource = read("electron/host-service/protocol.ts");
const hostDispatchSource = read("electron/host-service.ts");
const runtimeSource = read("electron/host-service/github-pr-review-runtime.ts");

const CHANNELS = [
  {
    ipc: "scm:list-github-prs",
    host: "scm.list-github-prs",
    preloadMethod: "listGitHubPrs",
    runtimeFn: "listGitHubPullRequests",
  },
  {
    ipc: "scm:get-github-pr-review-detail",
    host: "scm.get-github-pr-review-detail",
    preloadMethod: "getGitHubPrReviewDetail",
    runtimeFn: "fetchGitHubPullRequestReviewDetail",
  },
  {
    ipc: "scm:submit-github-pr-review",
    host: "scm.submit-github-pr-review",
    preloadMethod: "submitGitHubPrReview",
    runtimeFn: "submitGitHubPullRequestReview",
  },
] as const;

describe("GitHub PR review IPC chain", () => {
  for (const channel of CHANNELS) {
    test(`${channel.ipc} stays connected end to end`, () => {
      expect(windowApiSource).toContain(`${channel.preloadMethod}?: (args:`);
      expect(preloadSource).toContain(`${channel.preloadMethod}: (args:`);
      expect(preloadSource).toContain(`"${channel.ipc}"`);
      expect(scmIpcSource).toContain(`"${channel.ipc}"`);
      expect(scmIpcSource).toContain(`"${channel.host}"`);
      expect(scmIpcSource).toContain("parsed.data");
      const requestIndex = hostProtocolSource.indexOf(`"${channel.host}":`);
      const responseIndex = hostProtocolSource.indexOf(
        `"${channel.host}":`,
        requestIndex + 1,
      );
      expect(requestIndex).toBeGreaterThanOrEqual(0);
      expect(responseIndex).toBeGreaterThan(requestIndex);
      expect(hostDispatchSource).toContain(`case "${channel.host}":`);
      expect(hostDispatchSource).toContain(
        `await ${channel.runtimeFn}(request.params)`,
      );
      expect(runtimeSource).toContain(
        `export async function ${channel.runtimeFn}(`,
      );
    });
  }
});

describe("GitHub PR review IPC schemas", () => {
  const prUrl = "https://github.com/sendbird/stave/pull/348";
  const expectedHeadOid = "88a73338498bed7d96bb21c7c7f6a3c3358d5f16";

  test("inbox inputs are bounded and strict", () => {
    expect(
      ListGitHubPrsArgsSchema.safeParse({
        kind: "review-requested",
        limit: 30,
      }).success,
    ).toBe(true);
    expect(ListGitHubPrsArgsSchema.safeParse({ kind: "unknown" }).success).toBe(
      false,
    );
    expect(
      ListGitHubPrsArgsSchema.safeParse({
        kind: "authored",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  test("detail inputs require a bounded URL", () => {
    expect(GetGitHubPrReviewDetailArgsSchema.safeParse({ prUrl }).success).toBe(
      true,
    );
    expect(
      GetGitHubPrReviewDetailArgsSchema.safeParse({ prUrl: "not-a-url" })
        .success,
    ).toBe(false);
  });

  test("review inputs require a safe head and a request-changes body", () => {
    expect(
      SubmitGitHubPrReviewArgsSchema.safeParse({
        prUrl,
        expectedHeadOid,
        event: "APPROVE",
      }).success,
    ).toBe(true);
    expect(
      SubmitGitHubPrReviewArgsSchema.safeParse({
        prUrl,
        expectedHeadOid: "$(whoami)",
        event: "APPROVE",
      }).success,
    ).toBe(false);
    expect(
      SubmitGitHubPrReviewArgsSchema.safeParse({
        prUrl,
        expectedHeadOid,
        event: "REQUEST_CHANGES",
        body: "   ",
      }).success,
    ).toBe(false);
  });
});

test("PR activity uses the same strict contract through the window and host bridges", () => {
  expect(windowApiSource).toContain("gitHubPrActivity?: GitHubPrActivityRequest");
  expect(preloadSource).toContain('ipcRenderer.invoke("scm:github-pr-activity", args)');
  expect(scmIpcSource).toContain('ipcMain.handle("scm:github-pr-activity"');
  expect(scmIpcSource).toContain("GitHubPrActivityArgsSchema.safeParse(args)");
  expect(scmIpcSource).toContain('invokeHostService("scm.github-pr-activity", parsed.data)');
  expect(hostProtocolSource).toContain('"scm.github-pr-activity": GitHubPrActivityArgs');
  expect(hostProtocolSource).toContain('"scm.github-pr-activity": GitHubPrActivityResult');
  expect(hostDispatchSource).toContain('case "scm.github-pr-activity":');
  expect(hostDispatchSource).toContain("await runGitHubPrActivity(request.params)");
});

test("PR management uses one strict channel through the window and host bridges", () => {
  expect(windowApiSource).toContain("prManage?: GitHubPrManageRequest");
  expect(preloadSource).toContain('ipcRenderer.invoke("scm:pr-manage", args)');
  expect(scmIpcSource).toContain('ipcMain.handle("scm:pr-manage"');
  expect(scmIpcSource).toContain("GitHubPrManageArgsSchema.safeParse(args)");
  expect(scmIpcSource).toContain('invokeHostService("scm.pr-manage", parsed.data).then(({ outcome }) => outcome)');
  expect(hostProtocolSource).toContain('"scm.pr-manage": GitHubPrManageArgs');
  expect(hostProtocolSource).toContain('"scm.pr-manage": { outcome: GitHubPrManageResult }');
  expect(hostDispatchSource).toContain('case "scm.pr-manage":');
  expect(hostDispatchSource).toContain("await runGitHubPrManage(request.params)");
  expect(read("electron/host-service/github-pr-manage-runtime.ts")).toContain("export async function runGitHubPrManage(");
});
