import { describe, expect, test } from "bun:test";
import {
  parseProcessTable,
  selectDescendantProcessMetrics,
} from "../electron/host-service/resource-metrics";

describe("host-service resource metrics", () => {
  test("parses padded ps output and converts RSS from KiB to bytes", () => {
    expect(
      parseProcessTable(
        "  100  1  2048 node host-service.js\n  101  100  512 codex app-server\ninvalid\n",
      ),
    ).toEqual([
      {
        pid: 100,
        parentPid: 1,
        rssBytes: 2_097_152,
        command: "node host-service.js",
      },
      {
        pid: 101,
        parentPid: 100,
        rssBytes: 524_288,
        command: "codex app-server",
      },
    ]);
  });

  test("attributes the full descendant tree without exposing commands", () => {
    const rows = parseProcessTable(
      [
        "100 1 1000 node host-service.js",
        "101 100 200 zsh",
        "102 101 300 worker",
        "103 100 400 claude",
        "104 103 500 helper",
        "105 100 600 typescript-language-server",
        "106 999 700 unrelated",
      ].join("\n"),
    );

    expect(
      selectDescendantProcessMetrics({ rows, rootPid: 100, ptyPids: [101] }),
    ).toEqual([
      { pid: 101, parentPid: 100, rssBytes: 204_800, kind: "pty" },
      { pid: 102, parentPid: 101, rssBytes: 307_200, kind: "pty" },
      { pid: 103, parentPid: 100, rssBytes: 409_600, kind: "provider" },
      { pid: 104, parentPid: 103, rssBytes: 512_000, kind: "provider" },
      {
        pid: 105,
        parentPid: 100,
        rssBytes: 614_400,
        kind: "language-server",
      },
    ]);
  });
});
