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
const checkerPath = path.join(
  repositoryRoot,
  "scripts/check-temporary-migrations.mjs",
);
const fixtureDirectories: string[] = [];
// Assembled at runtime so this file never registers as a marker itself.
const markerComment = (id: string) =>
  `// ${["temporary", "migration"].join("-")}: ${id}`;

async function createFixture(args: {
  version: string;
  migrations?: unknown[];
  files?: Record<string, string>;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "stave-temporary-migrations-"));
  fixtureDirectories.push(root);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ version: args.version }),
    ...(args.migrations
      ? {
          "config/temporary-migrations.json": JSON.stringify({
            version: 1,
            migrations: args.migrations,
          }),
        }
      : {}),
    ...args.files,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  return root;
}

function runChecker(cwd: string) {
  return spawnSync("node", [checkerPath], { cwd, encoding: "utf8" });
}

const legacyKeyEntry = {
  id: "legacy-key",
  description: "Reads the renamed storage key.",
  introducedAfter: "0.19.6",
  removeInVersion: "0.22.0",
  files: ["src/legacy-key.ts"],
  tests: ["tests/legacy-key.test.ts"],
};
const legacyKeyFiles = {
  "src/legacy-key.ts": `${markerComment("legacy-key")}\nexport const legacy = 1;\n`,
  "tests/legacy-key.test.ts": "export {};\n",
};

afterEach(async () => {
  await Promise.all(
    fixtureDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("check-temporary-migrations", () => {
  test("passes with no registry and no markers", async () => {
    const result = runChecker(await createFixture({ version: "0.19.6" }));
    expect(result.status).toBe(0);
  });

  test("passes while a registered, marked migration is not yet due", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.20.3",
        migrations: [legacyKeyEntry],
        files: legacyKeyFiles,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 registered");
  });

  test("warns one minor release before removal", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.21.0",
        migrations: [legacyKeyEntry],
        files: legacyKeyFiles,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("must be removed before 0.22.0");
  });

  test("fails once the package reaches removeInVersion and names what to delete", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.22.0",
        migrations: [legacyKeyEntry],
        files: legacyKeyFiles,
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"legacy-key" expired');
    expect(result.stderr).toContain("src/legacy-key.ts");
    expect(result.stderr).toContain("tests/legacy-key.test.ts");
  });

  test("fails for a marker that is not registered", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.19.6",
        files: { "src/orphan.ts": `${markerComment("orphan")}\n` },
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("migration: orphan");
    expect(result.stderr).toContain("not registered");
  });

  test("fails when a registered file lacks its marker", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.19.6",
        migrations: [legacyKeyEntry],
        files: {
          "src/legacy-key.ts": "export const legacy = 1;\n",
          "tests/legacy-key.test.ts": "export {};\n",
        },
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has no");
  });

  test("fails when a marked file is not listed", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.19.6",
        migrations: [legacyKeyEntry],
        files: {
          ...legacyKeyFiles,
          "electron/extra.ts": `${markerComment("legacy-key")}\n`,
        },
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("electron/extra.ts carries its marker");
  });

  test("rejects a removal version that is not after the introduction", async () => {
    const result = runChecker(
      await createFixture({
        version: "0.19.6",
        migrations: [{ ...legacyKeyEntry, removeInVersion: "0.19.6" }],
        files: legacyKeyFiles,
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be later than introducedAfter");
  });
});
