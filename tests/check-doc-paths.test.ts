import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checkerPath = path.join(repositoryRoot, "scripts/check-doc-paths.mjs");
const fixtureDirectories: string[] = [];

async function createFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "stave-doc-paths-"));
  fixtureDirectories.push(root);
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, "skills"), { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }

  return root;
}

function runChecker(cwd: string) {
  return spawnSync("node", [checkerPath], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(async () => {
  await Promise.all(
    fixtureDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("check-doc-paths", () => {
  test("checks bare repository paths inside fenced diagrams", async () => {
    const root = await createFixture({
      "docs/architecture.md": ["```text", "src/missing-runtime.ts", "```"].join(
        "\n",
      ),
    });

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "docs/architecture.md:2: src/missing-runtime.ts",
    );
  });

  test("uses the full fence delimiter before resuming Markdown parsing", async () => {
    const root = await createFixture({
      "docs/fences.md": [
        "````markdown",
        "```md",
        "[inside sample](missing-inside.md)",
        "```",
        "````",
        "[outside fence](missing-outside.md)",
      ].join("\n"),
    });

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("missing-inside.md");
    expect(result.stderr).toContain("missing-outside.md");
  });

  test("matches directory globs without accepting wrong-case paths", async () => {
    const root = await createFixture({
      "docs/paths.md": [
        "Skills live under `skills/*`.",
        "See src/components/panes/workspacepanehost.tsx.",
      ].join("\n"),
      "skills/demo/SKILL.md": "# Demo\n",
      "src/components/panes/WorkspacePaneHost.tsx": "export {};\n",
    });

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("skills/*");
    expect(result.stderr).toContain(
      "src/components/panes/workspacepanehost.tsx",
    );
  });
});
