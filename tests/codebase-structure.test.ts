import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/codebase-structure.mjs",
);
const fixtures: string[] = [];

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

async function write(root: string, file: string, content: string) {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function inventory(cwd: string, ...args: string[]) {
  const result = spawnSync("node", [script, "--json", ...args], {
    cwd,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("separates generated and declaration files, and compares a stable Git tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "stave-structure-"));
  fixtures.push(root);
  git(root, "init", "-q");
  await write(root, ".gitignore", "ignored/\n");
  await write(root, "src/main.ts", "first\nsecond\n");
  await write(root, "src/api.d.ts", "declare const api: string;\n");
  await write(root, "src/generated/model.ts", "// @generated\nexport {};\n");
  await write(root, "tests/main.test.ts", "test();");
  await write(root, "docs/guide.md", "# Guide\n");
  await write(root, "site/src/page.tsx", "export {};\n");
  await write(root, ".github/workflows/check.yml", "name: Check\n");
  await write(root, "build/entitlements.mac.plist", "<plist/>\n");
  await write(root, "ignored/skip.ts", "skip\n");
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );

  await write(root, "src/main.ts", "first\nsecond\nthird");
  await write(root, "src/new.ts", "new\n");
  const working = inventory(root);
  const head = inventory(root, "--ref", "HEAD");

  expect(working.categories.source).toEqual({ files: 5, lines: 8 });
  expect(working.categories.tests).toEqual({ files: 1, lines: 1 });
  expect(working.categories.docs).toEqual({ files: 1, lines: 1 });
  expect(working.categories.tooling).toEqual({ files: 2, lines: 2 });
  expect(working.kinds.generated).toEqual({ files: 1, lines: 2 });
  expect(working.kinds.declaration).toEqual({ files: 1, lines: 1 });
  expect(
    working.files.map((file: { path: string }) => file.path),
  ).not.toContain("ignored/skip.ts");
  expect(head.categories.source).toEqual({ files: 4, lines: 6 });
  expect(
    head.files.find((file: { path: string }) => file.path === "src/main.ts")
      .lines,
  ).toBe(2);
  expect(inventory(root, "--ref", "HEAD")).toEqual(head);
});
