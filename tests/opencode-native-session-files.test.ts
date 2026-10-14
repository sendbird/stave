import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOpenCodeSessionList } from "../electron/host-service/opencode-native-session-files";

describe("OpenCode session list parsing", () => {
  test("keeps sessions of the requested folder, matching its realpath", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "stave-opencode-sessions-"));
    const real = realpathSync(folder);
    const stdout = JSON.stringify([
      { id: "ses_here", created: 2_000, updated: 3_000, directory: real },
      { id: "ses_alias", created: 1_500, updated: 1_600, directory: folder },
      { id: "ses_elsewhere", created: 4_000, updated: 4_000, directory: "/tmp/another-project" },
      { id: "not-a-session", created: 5_000, directory: real },
      { id: "ses_no_directory", created: 6_000 },
    ]);
    expect(parseOpenCodeSessionList({ stdout, cwd: folder })).toEqual([
      { sessionId: "ses_here", updatedAtMs: 2_000 },
      { sessionId: "ses_alias", updatedAtMs: 1_500 },
    ]);
  });

  test("returns nothing for output that is not a JSON list", () => {
    expect(parseOpenCodeSessionList({ stdout: "No sessions", cwd: "/tmp" })).toEqual([]);
    expect(parseOpenCodeSessionList({ stdout: '{"id":"ses_x"}', cwd: "/tmp" })).toEqual([]);
  });
});
