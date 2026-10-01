import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  closeKiroUsageConnection,
  fetchKiroUsageSnapshot,
} from "../electron/providers/rate-limits/kiro-usage-fetcher";

let directory: string | undefined;
afterEach(async () => {
  await closeKiroUsageConnection();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test.skipIf(process.platform === "win32")(
  "Kiro usage reuses one login but opens a new native session after reauthentication",
  async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "stave-usage-"));
    const executable = path.join(directory, "provider-cli");
    const calls = path.join(directory, "connections");
    await writeFile(
      executable,
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(calls)}, "opened\\n");
const readline = require("node:readline").createInterface({input:process.stdin});
readline.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === "initialize" ? {protocolVersion:1,agentCapabilities:{}}
    : request.method === "session/new" ? {sessionId:"usage-session"}
    : {success:true,data:{planName:"Test",usageBreakdowns:[{resourceType:"CREDIT",displayName:"Credits",used:10,limit:100}]}};
  console.log(JSON.stringify({jsonrpc:"2.0",id:request.id,result}));
});
`,
      { mode: 0o755 },
    );
    const runtimeOptions = { kiroBinaryPath: executable };
    expect(
      (
        await fetchKiroUsageSnapshot({
          runtimeOptions,
          usageIdentity: "first-login",
        })
      ).source,
    ).toBe("acp");
    expect(
      (
        await fetchKiroUsageSnapshot({
          runtimeOptions,
          usageIdentity: "first-login",
        })
      ).source,
    ).toBe("acp");
    expect((await readFile(calls, "utf8")).trim().split("\n")).toHaveLength(1);
    expect(
      (
        await fetchKiroUsageSnapshot({
          runtimeOptions,
          usageIdentity: "second-login",
        })
      ).source,
    ).toBe("acp");
    expect((await readFile(calls, "utf8")).trim().split("\n")).toHaveLength(2);
  },
);
