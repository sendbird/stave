import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";
import { createFakeGh, fakePr } from "../fixtures/fake-gh";

test("PR stack discovery and confirmed retarget cross real preload, main and host with strict requests", async () => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(path.join(tmpdir(), "pr-stack-native-"));
  const cwd = path.join(directory, "repository");
  await mkdir(cwd);
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
  git("commit", "--allow-empty", "-m", "test: base"); git("checkout", "-b", "child");
  const state = { repo: { owner: "example", name: "repo", defaultBranch: "main" }, viewer: "me" };
  const gh = createFakeGh(directory, { ...state, prs: [
    fakePr({ number: 1, headRefName: "parent", baseRefName: "main", state: "MERGED", createdAt: "2026-11-17T00:00:00Z", mergedAt: "2026-11-17T00:30:00Z" }, state),
    fakePr({ number: 2, headRefName: "child", baseRefName: "parent", createdAt: "2026-11-17T00:10:00Z" }, state),
    fakePr({ number: 3, headRefName: "theirs", baseRefName: "parent", createdAt: "2026-11-17T00:11:00Z", author: { id: "o", login: "other", is_bot: false } }, state),
    fakePr({ number: 10, headRefName: "develop", baseRefName: "main", state: "MERGED", createdAt: "2026-11-17T00:00:00Z", mergedAt: "2026-11-17T00:30:00Z" }, state),
    fakePr({ number: 11, headRefName: "feature", baseRefName: "develop", createdAt: "2026-11-17T00:10:00Z" }, state),
  ] });
  const bin = path.dirname(gh.executable);
  const stave = await launchStave({ env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, ...gh.env } });
  try {
    await stave.page.waitForFunction(() => Boolean(window.api?.sourceControl?.getPrStack));
    const result = await stave.page.evaluate(cwd => window.api.sourceControl!.getPrStack!({ cwd }), cwd);
    expect(result.ok, String(result.code)).toBe(true);
    expect(result.stack?.retarget).toMatchObject({ parent: { number: 1 }, toBase: "main", children: [{ number: 2 }], excluded: [{ pr: { number: 3 }, reason: "not-yours" }] });
    const rejected = await stave.page.evaluate(async cwd => {
      try {
        await window.api.sourceControl!.retargetPrStack!({ cwd, parentNumber: 1, children: [{ number: 2, fromBase: "parent", toBase: "main" }], force: true } as never);
        return false;
      } catch { return true; }
    }, cwd);
    expect(rejected).toBe(true);
    // A long-lived parent is refused by the host even when the renderer asks.
    const refused = await stave.page.evaluate(cwd => window.api.sourceControl!.retargetPrStack!({ cwd, parentNumber: 10, children: [{ number: 11, fromBase: "develop", toBase: "main" }] }), cwd);
    expect(refused).toMatchObject({ ok: false, code: "parent-ineligible", results: [] });
    const updated = await stave.page.evaluate(cwd => window.api.sourceControl!.retargetPrStack!({ cwd, parentNumber: 1, children: [{ number: 2, fromBase: "parent", toBase: "main" }, { number: 3, fromBase: "parent", toBase: "main" }] }), cwd);
    expect(updated).toEqual({ ok: false, code: null, results: [{ number: 2, status: "updated", reason: null }, { number: 3, status: "skipped", reason: "not-yours" }] });
    const calls = gh.calls();
    expect(calls).toContainEqual(["pr", "update-branch", "2"]);
    expect(calls.filter(args => args[1] === "edit").map(args => args[2])).toEqual(["2"]);
    expect(calls.flat().some(arg => arg.includes("force"))).toBe(false);
    expect(git("branch", "--show-current")).toBe("child");
  } finally { await stave.close(); await rm(directory, { recursive: true, force: true }); }
});
