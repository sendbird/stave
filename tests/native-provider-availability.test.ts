import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describeNativeProviderAvailability } from "../electron/providers/provider-availability";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe.skipIf(process.platform === "win32")("native provider authenticated availability", () => {
  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId} requires sign-in, recovers after login, and hides again after logout`, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "stave-availability-"));
      directories.push(directory);
      const executable = path.join(directory, "provider-cli");
      const identity = path.join(directory, "identity");
      await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv[2] === "--version") { console.log("2.1.179"); }
else {
  const state = fs.readFileSync(${JSON.stringify(identity)}, "utf8");
  if (state === "unknown") { process.exitCode = 1; }
  else if (${JSON.stringify(providerId)} === "claude-code") {
    console.log(JSON.stringify({loggedIn: state === "authenticated"}));
  } else {
    console.log(state === "authenticated" ? "Logged in using a test account" : "Not logged in");
    if (state !== "authenticated") process.exitCode = 1;
  }
}
`, { mode: 0o755 });
      const runtimeOptions = providerId === "claude-code" ? { claudeBinaryPath: executable } : { codexBinaryPath: executable };
      for (const state of ["unauthenticated", "authenticated", "unknown", "unauthenticated"] as const) {
        await writeFile(identity, state);
        const result = await describeNativeProviderAvailability({ providerId, runtimeOptions });
        expect(result.ok).toBe(true);
        expect(result.toolingStatus?.available).toBe(true);
        expect(result.toolingStatus?.authState).toBe(state);
        expect(result.available).toBe(state === "authenticated");
      }
    });
  }
});
