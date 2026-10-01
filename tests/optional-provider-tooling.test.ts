import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  inspectOptionalProviderTooling,
  optionalProviderReadKey,
} from "../electron/providers/optional-provider-tooling";
import { getProviderModelCatalog } from "../electron/providers/provider-model-catalog";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(auth: string, acpExit = 0) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stave-tooling-"));
  directories.push(directory);
  const executable = path.join(directory, "provider-cli");
  const calls = path.join(directory, "calls");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(calls)}, process.argv[2] + "\\n");
switch (process.argv[2]) {
  case "--version": console.log("1.0.0"); break;
  case "acp": process.exitCode = ${acpExit}; break;
  default: console.log(${JSON.stringify(auth)}); process.exitCode = ${auth.includes("not logged in") ? 1 : 0};
}
`,
    { mode: 0o755 },
  );
  return { executable, calls };
}

describe.skipIf(process.platform === "win32")(
  "shared native optional-provider tooling",
  () => {
    test("availability and Tooling join one bounded probe and do not expose account output", async () => {
      const { executable, calls } = await fixture(
        "Logged in as test@example.invalid",
      );
      const args = {
        providerId: "cursor" as const,
        cursorBinaryPath: executable,
      };
      const [one, two] = await Promise.all([
        inspectOptionalProviderTooling(args),
        inspectOptionalProviderTooling({ ...args, force: true }),
      ]);
      expect(one).toEqual(two);
      expect(one.state).toBe("ready");
      expect(JSON.stringify(one)).not.toContain("test@example.invalid");
      expect((await readFile(calls, "utf8")).trim().split("\n").sort()).toEqual(
        ["--version", "acp", "status"],
      );
      expect(optionalProviderReadKey("cursor", args)).not.toBeNull();
      await inspectOptionalProviderTooling(args);
      expect((await readFile(calls, "utf8")).trim().split("\n")).toHaveLength(
        3,
      );
    });

    test("logged out and unsupported runtimes cannot launch a catalog read", async () => {
      for (const [auth, acpExit] of [
        ["not logged in; agent login", 0],
        ["Logged in", 1],
      ] as const) {
        const { executable, calls } = await fixture(auth, acpExit);
        const args = {
          providerId: "cursor" as const,
          cursorBinaryPath: executable,
        };
        const status = await inspectOptionalProviderTooling(args);
        expect(status.state).not.toBe("ready");
        expect(optionalProviderReadKey("cursor", args)).toBeNull();
        const before = await readFile(calls, "utf8");
        const result = await getProviderModelCatalog({
          providerId: "cursor",
          runtimeOptions: args,
        });
        expect(result.ok).toBe(false);
        expect(result.models).toEqual([]);
        expect(await readFile(calls, "utf8")).toBe(before);
      }
    });

    test("initial discovery is required even for a configured executable", async () => {
      const { executable, calls } = await fixture("Logged in");
      const result = await getProviderModelCatalog({
        providerId: "kiro",
        runtimeOptions: { kiroBinaryPath: executable },
      });
      expect(result.ok).toBe(false);
      expect(await readFile(calls, "utf8").catch(() => "")).toBe("");
    });
  },
);
