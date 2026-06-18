import { describe, expect, test } from "bun:test";
import { parseReviewFindings } from "../src/lib/source-control-review";

describe("parseReviewFindings", () => {
  test("parses structured findings from a JSON object", () => {
    expect(
      parseReviewFindings(
        JSON.stringify({
          findings: [
            {
              severity: "high",
              file: "src/app.ts",
              line: 42,
              kind: "bug",
              message: "The guard returns before saving the new value.",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        severity: "high",
        file: "src/app.ts",
        line: 42,
        kind: "bug",
        message: "The guard returns before saving the new value.",
      },
    ]);
  });

  test("parses fenced JSON arrays and normalizes aliases", () => {
    expect(
      parseReviewFindings(`\`\`\`json
[
  {
    "severity": "blocker",
    "path": "electron/main.ts",
    "line": "7",
    "kind": "concurrency",
    "description": "Two writes can race and drop the latest snapshot."
  }
]
\`\`\``),
    ).toEqual([
      {
        severity: "critical",
        file: "electron/main.ts",
        line: 7,
        kind: "race",
        message: "Two writes can race and drop the latest snapshot.",
      },
    ]);
  });

  test("returns no findings for malformed or empty responses", () => {
    expect(parseReviewFindings("no issues found")).toEqual([]);
    expect(parseReviewFindings("{ invalid json")).toEqual([]);
    expect(parseReviewFindings('{"findings":[]}')).toEqual([]);
  });
});
