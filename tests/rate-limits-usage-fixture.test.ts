import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";

const directory = mkdtempSync(path.join(tmpdir(), "stave-usage-fixture-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("the e2e usage window fixture", () => {
  test("with reads disabled, a named fixture is the Claude window Stave reads, and moves when the file does", async () => {
    const file = path.join(directory, "usage.json");
    const env = { STAVE_DISABLE_ACCOUNT_USAGE_READS: "1", STAVE_E2E_ACCOUNT_USAGE_FILE: file };
    writeFileSync(file, JSON.stringify({ claude: { session: { usedPercent: 100, resetsAt: 1_800_000_000 } } }));
    const exhausted = await getRateLimitsSnapshot({ env, providers: ["claude-code"] });
    expect(exhausted.claude.session).toEqual({ usedPercent: 100, resetsAt: 1_800_000_000 });
    expect(exhausted.reads?.["claude-code"]?.status).toBe("fresh");
    writeFileSync(file, JSON.stringify({ claude: { session: { usedPercent: 10, resetsAt: null } } }));
    expect((await getRateLimitsSnapshot({ env, providers: ["claude-code"] })).claude.session?.usedPercent).toBe(10);
  });

  test("without disabled reads the fixture is never read; without a fixture reads stay unavailable", async () => {
    const file = path.join(directory, "ignored.json");
    writeFileSync(file, JSON.stringify({ claude: { session: { usedPercent: 100, resetsAt: null } } }));
    const unavailable = await getRateLimitsSnapshot({ env: { STAVE_DISABLE_ACCOUNT_USAGE_READS: "1" }, providers: ["claude-code"] });
    expect(unavailable.claude.source).toBe("unavailable");
    expect(unavailable.reads?.["claude-code"]?.status).toBe("unavailable");
    let fetched = false;
    const live = await getRateLimitsSnapshot({ env: { STAVE_E2E_ACCOUNT_USAGE_FILE: file }, providers: ["claude-code"], force: true,
      fetchers: { claude: async () => { fetched = true; return { source: "oauth", session: { usedPercent: 42, resetsAt: null }, weekly: null, fableWeekly: null, error: null }; } } });
    expect(fetched).toBe(true);
    expect(live.claude.session?.usedPercent).toBe(42);
  });
});
