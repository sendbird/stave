import { describe, expect, it } from "bun:test";
import {
  buildGraphCommitDetails,
  parseGraphCommitMetadata,
  parseGraphNameStatus,
  parseGraphNumstat,
} from "@/lib/git-graph/commit-details";

const NUL = "\0";

function metadataRecord(fields: string[]) {
  return `${fields.join(NUL)}${NUL}`;
}

describe("parseGraphCommitMetadata", () => {
  it("preserves body newlines while trimming only trailing newlines", () => {
    const stdout = metadataRecord([
      "aaa1111aaa1111",
      "bbb2222bbb2222 ccc3333ccc3333",
      "Merge feature",
      "First paragraph.\n\nSecond paragraph.\n\n",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00+09:00",
      "Casey Committer",
      "casey@example.com",
      "2026-06-30T10:01:00+09:00",
      "G",
      "ABCDEF1234567890",
      "Jane Author <jane@example.com>",
    ]);

    expect(parseGraphCommitMetadata(stdout)).toEqual({
      hash: "aaa1111aaa1111",
      parents: ["bbb2222bbb2222", "ccc3333ccc3333"],
      subject: "Merge feature",
      body: "First paragraph.\n\nSecond paragraph.",
      author: "Jane Author",
      authorEmail: "jane@example.com",
      authorDate: "2026-06-30T10:00:00+09:00",
      committer: "Casey Committer",
      committerEmail: "casey@example.com",
      committerDate: "2026-06-30T10:01:00+09:00",
      signature: {
        status: "G",
        key: "ABCDEF1234567890",
        signer: "Jane Author <jane@example.com>",
      },
    });
  });

  it("maps an unsigned metadata record to a null signature", () => {
    const stdout = metadataRecord([
      "aaa1111aaa1111",
      "",
      "Initial commit",
      "",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "N",
      "",
      "",
    ]);

    expect(parseGraphCommitMetadata(stdout)?.signature).toBeNull();
  });

  it("keeps Git signature failure states even when identity fields are empty", () => {
    const stdout = metadataRecord([
      "aaa1111aaa1111",
      "",
      "Signed commit",
      "",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "E",
      "",
      "",
    ]);

    expect(parseGraphCommitMetadata(stdout)?.signature).toEqual({
      status: "E",
      key: "",
      signer: "",
    });
  });

  it("rejects incomplete, extra, and NUL-unterminated metadata records", () => {
    const fields = [
      "aaa1111aaa1111",
      "",
      "Incomplete commit",
      "",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "N",
      "",
      "",
    ];

    expect(
      parseGraphCommitMetadata(metadataRecord(fields.slice(0, -1))),
    ).toBeNull();
    expect(
      parseGraphCommitMetadata(metadataRecord([...fields, "unexpected"])),
    ).toBeNull();
    expect(parseGraphCommitMetadata(fields.join(NUL))).toBeNull();
  });
});

describe("parseGraphNameStatus", () => {
  it("parses rename and copy path pairs from name-status -z", () => {
    const stdout = [
      "R100",
      "src/old-name.ts",
      "src/new-name.ts",
      "C075",
      "src/original.ts",
      "src/copied.ts",
      "M",
      "src/modified.ts",
      "",
    ].join(NUL);

    expect(parseGraphNameStatus(stdout)).toEqual([
      {
        path: "src/new-name.ts",
        oldPath: "src/old-name.ts",
        status: "R",
      },
      {
        path: "src/copied.ts",
        oldPath: "src/original.ts",
        status: "C",
      },
      {
        path: "src/modified.ts",
        status: "M",
      },
    ]);
  });

  it("keeps unusual paths verbatim and drops an incomplete final rename", () => {
    const unusualPath = "src/line\nbreak\tname.ts";
    const stdout = ["M", unusualPath, "R100", "src/old.ts"].join(NUL);

    expect(parseGraphNameStatus(stdout)).toEqual([
      { path: unusualPath, status: "M" },
    ]);
  });
});

describe("parseGraphNumstat", () => {
  it("parses binary counts and Git's NUL-delimited rename form", () => {
    const stdout = [
      "-\t-\tassets/logo.bin",
      "12\t3\t",
      "src/old-name.ts",
      "src/new-name.ts",
      "",
    ].join(NUL);

    expect(parseGraphNumstat(stdout)).toEqual([
      {
        path: "assets/logo.bin",
        additions: null,
        deletions: null,
      },
      {
        path: "src/new-name.ts",
        oldPath: "src/old-name.ts",
        additions: 12,
        deletions: 3,
      },
    ]);
  });

  it("accepts tabs in paths and ignores malformed or incomplete records", () => {
    const unusualPath = "src/name\twith-tab.ts";
    const stdout = [
      `7\t2\t${unusualPath}`,
      "7x\t2\tinvalid-count.ts",
      "3\t1\t",
      "src/old.ts",
      "src/new.ts",
    ].join(NUL);

    expect(parseGraphNumstat(stdout)).toEqual([
      {
        path: unusualPath,
        additions: 7,
        deletions: 2,
      },
    ]);
  });
});

describe("buildGraphCommitDetails", () => {
  it("combines metadata, status, and numstat records by destination path", () => {
    const metadataStdout = metadataRecord([
      "aaa1111aaa1111",
      "bbb2222bbb2222",
      "Refactor files",
      "Keep parser contracts independent.",
      "Jane Author",
      "jane@example.com",
      "2026-06-30T10:00:00Z",
      "Casey Committer",
      "casey@example.com",
      "2026-06-30T10:01:00Z",
      "N",
      "",
      "",
    ]);
    const nameStatusStdout = [
      "R100",
      "src/old-name.ts",
      "src/new-name.ts",
      "C100",
      "src/original.ts",
      "src/copied.ts",
      "A",
      "assets/logo.bin",
      "",
    ].join(NUL);
    const numstatStdout = [
      "12\t3\t",
      "src/old-name.ts",
      "src/new-name.ts",
      "4\t0\tsrc/copied.ts",
      "-\t-\tassets/logo.bin",
      "",
    ].join(NUL);

    expect(
      buildGraphCommitDetails({
        metadataStdout,
        nameStatusStdout,
        numstatStdout,
      })?.files,
    ).toEqual([
      {
        path: "src/new-name.ts",
        oldPath: "src/old-name.ts",
        status: "R",
        additions: 12,
        deletions: 3,
      },
      {
        path: "src/copied.ts",
        oldPath: "src/original.ts",
        status: "C",
        additions: 4,
        deletions: 0,
      },
      {
        path: "assets/logo.bin",
        status: "A",
        additions: null,
        deletions: null,
      },
    ]);
  });
});
