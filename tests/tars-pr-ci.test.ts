import { expect, test } from "bun:test";
import { tarsCiPullRequest } from "../src/lib/tars/pr-ci";
import { readTarsCi } from "../electron/main/tars-pr-ci";
import type { invokeHostService } from "../electron/main/host-service-client";

const url = "https://github.com/team/project/pull/12";
const head = "a".repeat(40);
function reader(options: { indexError?: string; logsError?: string; latest?: string; failed?: boolean } = {}) {
  const calls: Array<{ method: string; args: unknown }> = [];
  const invoke = async (method: string, args: unknown) => {
    calls.push({ method, args });
    if (method === "scm.fetch-pr-context-index") return {
      ok: !options.indexError, index: {
        headSha: head, failedChecks: options.failed === false ? [] : [{ id: 42, name: "test" }], truncatedFailedChecks: 0,
      }, stderr: options.indexError ?? "",
    };
    if (method === "scm.fetch-pr-check-logs") return {
      ok: !options.logsError, excerpts: options.logsError ? [] : [{
        checkId: 42, checkName: "test", source: "annotations", excerpt: "expected 42, received 0\npassword=synthetic-example",
      }], stderr: options.logsError ?? "",
    };
    if (method === "scm.get-pr-status-for-url") return { ok: true, pr: { headRefOid: options.latest ?? head }, stderr: "" };
    throw new Error("Unexpected host call");
  };
  return { calls, read: () => readTarsCi(url, invoke as typeof invokeHostService) };
}

test("only the user's GitHub PR read request enters the CI path", () => {
  for (const text of [url, `Tell me which test failed on ${url}`, `Why did CI fail? ${url}`, `CI 실패 원인을 요약해 주세요. ${url}`]) {
    expect(tarsCiPullRequest(text)).toEqual({ url, mixed: false });
  }
  expect(tarsCiPullRequest(`Explain the CI error, then fix it: ${url}`)).toEqual({ url, mixed: true });
  for (const text of [`Add CI to ${url}`, `Fix the CI on ${url}`, `Can you fix CI on ${url}?`, `${url} CI 수정해 줄래?`, `Merge ${url}`, url.replace("github.com", "github.com.example.org"), url.replace("/pull/", "/issues/"), `${url} ${url}`]) {
    expect(tarsCiPullRequest(text)).toBeNull();
  }
});

test("reads sanitized log excerpts at the observed commit and verifies the head again", async () => {
  const r = reader();
  const result = await r.read();
  expect(r.calls).toEqual([
    { method: "scm.fetch-pr-context-index", args: { prUrl: url } },
    { method: "scm.fetch-pr-check-logs", args: { prUrl: url, headSha: head, checkIds: [42] } },
    { method: "scm.get-pr-status-for-url", args: { url } },
  ]);
  expect(result.prompt).toContain("expected 42, received 0");
  expect(result.prompt).not.toContain("synthetic-example");
  expect(result.evidence).toContain(head);
  expect(result.evidence).toContain(url + "/checks?check_run_id=42");
});

test("head change, lack of access and missing logs never invent a cause", async () => {
  const moved = await reader({ latest: "b".repeat(40) }).read();
  expect(moved.prompt).toBeNull();
  expect(moved.evidence).toContain("changed");
  expect((await reader({ indexError: "GitHub CLI is not installed." }).read()).evidence).toContain("Install GitHub CLI");
  expect((await reader({ indexError: "GitHub CLI is not authenticated." }).read()).evidence).toContain("gh auth login");
  expect((await reader({ indexError: "HTTP 403" }).read()).evidence).toContain("read the PR");
  const missing = await reader({ logsError: "Logs expired." }).read();
  expect(missing.prompt).toBeNull();
  expect(missing.evidence).toContain("unavailable");
  expect(missing.evidence).toContain("test");
  expect((await reader({ failed: false }).read()).evidence).toContain("no failed check runs");
});
