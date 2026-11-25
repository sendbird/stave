import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPullRequestTemplate } from "../electron/host-service/pull-request-template";

const roots: string[] = [];
function repo(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "pr-template-"));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("finds a single-file template in .github, the root or docs, in any letter case", async () => {
  expect(await readPullRequestTemplate(repo({ ".github/PULL_REQUEST_TEMPLATE.md": "## Upper\n" }))).toBe("## Upper");
  expect(await readPullRequestTemplate(repo({ ".github/pull_request_template.md": "## Lower" }))).toBe("## Lower");
  expect(await readPullRequestTemplate(repo({ "pull_request_template.md": "## Root" }))).toBe("## Root");
  expect(await readPullRequestTemplate(repo({ "docs/Pull_Request_Template.md": "## Docs" }))).toBe("## Docs");
});

test("prefers .github, then the root, then docs", async () => {
  expect(await readPullRequestTemplate(repo({
    "docs/pull_request_template.md": "docs", "pull_request_template.md": "root", ".github/pull_request_template.md": "github",
  }))).toBe("github");
  expect(await readPullRequestTemplate(repo({ "docs/pull_request_template.md": "docs", "pull_request_template.md": "root" }))).toBe("root");
});

test("uses the first template of a template folder when there is no single file", async () => {
  expect(await readPullRequestTemplate(repo({
    ".github/PULL_REQUEST_TEMPLATE/feature.md": "## Feature", ".github/PULL_REQUEST_TEMPLATE/bugfix.md": "## Bugfix",
    ".github/PULL_REQUEST_TEMPLATE/notes.txt": "not markdown",
  }))).toBe("## Bugfix");
  // A single file still wins over a folder.
  expect(await readPullRequestTemplate(repo({
    ".github/PULL_REQUEST_TEMPLATE/feature.md": "## Feature", "pull_request_template.md": "## Single",
  }))).toBe("## Single");
});

test("no template, an empty one or an oversized one reads as none", async () => {
  expect(await readPullRequestTemplate(repo({ "README.md": "hello" }))).toBeUndefined();
  expect(await readPullRequestTemplate(repo({ ".github/pull_request_template.md": "   \n" }))).toBeUndefined();
  expect(await readPullRequestTemplate(repo({ ".github/pull_request_template.md": "x".repeat(70 * 1024) }))).toBeUndefined();
  // The limit is in bytes: 30,000 three-byte characters are about 88 KiB.
  expect(await readPullRequestTemplate(repo({ ".github/pull_request_template.md": "가".repeat(30_000) }))).toBeUndefined();
  expect(await readPullRequestTemplate(repo({ ".github/pull_request_template.md": "가".repeat(20_000) }))).toBe("가".repeat(20_000));
  expect(await readPullRequestTemplate(path.join(tmpdir(), "no-such-repository-for-pr-template"))).toBeUndefined();
});
