import { describe, expect, test } from "bun:test";
import { parseKiroSessionList } from "../electron/host-service/kiro-native-session-files";

describe("parseKiroSessionList", () => {
  test("flattens the per-cwd groups the CLI prints", () => {
    expect(
      parseKiroSessionList({
        stdout: JSON.stringify([
          {
            cwd: "/private/tmp/notes",
            complete: true,
            sessions: [
              {
                sessionId: "e68a16b7-b0bc-42f1-b665-d33937e601cf",
                source: "classic",
                title: "say hi in one word",
                updatedAt: "2026-09-10T00:07:23.097Z",
                messageCount: 2,
              },
            ],
          },
        ]),
      }),
    ).toEqual([
      {
        sessionId: "e68a16b7-b0bc-42f1-b665-d33937e601cf",
        updatedAtMs: Date.parse("2026-09-10T00:07:23.097Z"),
      },
    ]);
  });

  test("drops malformed entries instead of throwing", () => {
    expect(
      parseKiroSessionList({
        stdout: JSON.stringify([
          { cwd: "/tmp", sessions: [{ sessionId: "" }, { title: "no id" }, 7] },
          { cwd: "/tmp", sessions: "not-an-array" },
          null,
        ]),
      }),
    ).toEqual([]);
  });

  test("treats an unusable updatedAt as the oldest possible timestamp", () => {
    expect(
      parseKiroSessionList({
        stdout: JSON.stringify([
          { sessions: [{ sessionId: "s1", updatedAt: "not-a-date" }] },
        ]),
      }),
    ).toEqual([{ sessionId: "s1", updatedAtMs: 0 }]);
  });

  test("returns nothing for non-JSON output", () => {
    expect(parseKiroSessionList({ stdout: "kiro-cli: not logged in" })).toEqual(
      [],
    );
  });
});
