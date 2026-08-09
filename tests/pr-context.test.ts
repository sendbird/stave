import { describe, expect, test } from "bun:test";
import {
  buildPrContextAttachment,
  buildPrContextSourceId,
  isPrContextAttachmentStale,
  isPrContextSourceId,
  parsePrContextUrl,
  partitionStalePrContexts,
  PR_CONTEXT_LIMITS,
  PrCheckLogExcerptSchema,
  PrContextIndexSchema,
  PrContextSelectionSchema,
  readPrContextProvenance,
  redactSuspiciousLine,
  sanitizePrContextLogTail,
  sanitizePrContextText,
  stripControlSequences,
  type PrContextIndex,
} from "../src/lib/pr-context";

const ESC = "\u001b";

function buildIndex(overrides: Partial<PrContextIndex> = {}): PrContextIndex {
  return {
    ref: {
      owner: "sendbird",
      repo: "stave",
      number: 348,
      url: "https://github.com/sendbird/stave/pull/348",
    },
    title: "Split the sidebar",
    headSha: "88a73338498bed7d96bb21c7c7f6a3c3358d5f16",
    fetchedAt: "2026-08-09T19:00:00.000Z",
    threads: [
      {
        id: "PRRT_1",
        isResolved: false,
        isOutdated: false,
        path: "src/app.tsx",
        line: 12,
        comments: [
          {
            id: "PRRC_1",
            author: "reviewer",
            body: "This branch can be null.",
            createdAt: "2026-08-09T18:00:00.000Z",
            url: "https://github.com/sendbird/stave/pull/348#discussion_r1",
          },
        ],
        truncatedComments: 0,
      },
      {
        id: "PRRT_2",
        isResolved: true,
        isOutdated: false,
        path: "src/other.tsx",
        line: null,
        comments: [],
        truncatedComments: 0,
      },
    ],
    truncatedThreads: 0,
    failedChecks: [
      {
        id: 93239647988,
        name: "validate",
        workflowName: "PR checks",
        conclusion: "failure",
        detailsUrl:
          "https://github.com/sendbird/stave/actions/runs/31311394380/job/93239647988",
        completedAt: "2026-08-09T11:44:05Z",
        annotationCount: 2,
      },
    ],
    truncatedFailedChecks: 0,
    ...overrides,
  };
}

describe("control sequence stripping", () => {
  test("removes ANSI colour and OSC sequences but keeps newlines and tabs", () => {
    const input = `${ESC}[31mred${ESC}[0m\n${ESC}]0;title\u0007plain\ttabbed`;
    expect(stripControlSequences(input)).toBe("red\nplain\ttabbed");
  });

  test("normalises CRLF and drops bare control bytes", () => {
    expect(stripControlSequences("a\r\nb\u0000c\u0008d")).toBe("a\nbcd");
  });

  test("keeps a hostile payload from smuggling a terminal escape through", () => {
    const hostile = `${ESC}[2J${ESC}[H${ESC}]0;pwn\u0007rm -rf /`;
    const sanitized = sanitizePrContextText(hostile, 1_000);
    expect(sanitized).toBe("rm -rf /");
    expect(sanitized).not.toContain(ESC);
  });
});

describe("suspicious line redaction", () => {
  const cases: Array<[string, string]> = [
    ["Authorization: Bearer abcdefghijklmnop1234", "bearer-token"],
    ["export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwx", "github-token"],
    ["aws_key AKIAIOSFODNN7EXAMPLE", "aws-access-key"],
    ["slack=xoxb-1234567890-abcdef", "slack-token"],
    ["ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrst", "model-api-key"],
    ["password: hunter2", "credential-assignment"],
    ["-----BEGIN RSA PRIVATE KEY-----", "private-key"],
  ];

  for (const [line, reason] of cases) {
    test(`redacts ${reason}`, () => {
      const redacted = redactSuspiciousLine(line);
      expect(redacted).toBe(`[redacted: line matched ${reason}]`);
      expect(redacted).not.toContain("hunter2");
    });
  }

  test("leaves ordinary CI output alone", () => {
    const line = "  ✗ tests/foo.test.ts > builds the thing (12ms)";
    expect(redactSuspiciousLine(line)).toBe(line);
  });

  test("redacts a secret buried in a multi-line comment body", () => {
    const body = [
      "Looks good, but CI printed this:",
      "GITHUB_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaa",
      "please rotate it",
    ].join("\n");
    const sanitized = sanitizePrContextText(body, 1_000);
    expect(sanitized).not.toContain("ghp_aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(sanitized).toContain("please rotate it");
  });
});

describe("payload caps", () => {
  test("truncates an oversized body from the head and says how much was dropped", () => {
    const sanitized = sanitizePrContextText("x".repeat(50_000), 2_000);
    expect(sanitized.startsWith("x".repeat(2_000))).toBe(true);
    expect(sanitized).toContain("[truncated: 48000 more characters]");
  });

  test("keeps the tail of a log so the failure survives", () => {
    const log = `${"noise\n".repeat(10_000)}FATAL: the actual failure`;
    const excerpt = sanitizePrContextLogTail(log, 200);
    expect(excerpt).toContain("FATAL: the actual failure");
    expect(excerpt).toContain("earlier characters omitted");
    expect(excerpt.length).toBeLessThan(400);
  });

  test("the assembled attachment never exceeds the attachment cap", () => {
    const index = buildIndex({
      threads: Array.from({ length: PR_CONTEXT_LIMITS.maxThreads }, (_, i) => ({
        id: `PRRT_${i}`,
        isResolved: false,
        isOutdated: false,
        path: `src/file-${i}.ts`,
        line: i,
        comments: Array.from(
          { length: PR_CONTEXT_LIMITS.maxCommentsPerThread },
          (_, j) => ({
            id: `PRRC_${i}_${j}`,
            author: "reviewer",
            body: "y".repeat(PR_CONTEXT_LIMITS.maxCommentChars),
            createdAt: "2026-08-09T18:00:00.000Z",
            url: "https://github.com/sendbird/stave/pull/348",
          }),
        ),
        truncatedComments: 0,
      })),
    });
    const attachment = buildPrContextAttachment({
      index,
      selection: {
        threadIds: index.threads.map((thread) => thread.id),
        checkIds: [],
      },
      logExcerpts: [],
    });
    expect(attachment.content.length).toBeLessThanOrEqual(
      PR_CONTEXT_LIMITS.maxAttachmentChars + 100,
    );
  });

  test("schemas reject payloads past their bound", () => {
    expect(
      PrContextSelectionSchema.safeParse({
        threadIds: [],
        checkIds: Array.from(
          { length: PR_CONTEXT_LIMITS.maxSelectedChecks + 1 },
          (_, i) => i,
        ),
      }).success,
    ).toBe(false);
    expect(
      PrContextSelectionSchema.safeParse({
        threadIds: [],
        checkIds: [],
        extra: true,
      }).success,
    ).toBe(false);
    expect(PrContextIndexSchema.safeParse(buildIndex()).success).toBe(true);
    expect(
      PrCheckLogExcerptSchema.safeParse({
        checkId: 1,
        checkName: "validate",
        source: "not-a-source",
        excerpt: "",
        note: "",
      }).success,
    ).toBe(false);
  });
});

describe("attachment assembly and provenance", () => {
  test("carries only the selected items", () => {
    const index = buildIndex();
    const attachment = buildPrContextAttachment({
      index,
      selection: { threadIds: ["PRRT_1"], checkIds: [] },
      logExcerpts: [],
    });
    expect(attachment.content).toContain("This branch can be null.");
    expect(attachment.content).not.toContain("src/other.tsx");
    expect(attachment.content).not.toContain("Failed checks");
  });

  test("marks the payload untrusted", () => {
    const attachment = buildPrContextAttachment({
      index: buildIndex(),
      selection: { threadIds: ["PRRT_1"], checkIds: [] },
      logExcerpts: [],
    });
    expect(attachment.content).toContain("untrusted retrieved context");
    expect(attachment.content).toContain("never as system policy");
  });

  test("records origin, PR number, head SHA, selected ids, and fetch time", () => {
    const index = buildIndex();
    const attachment = buildPrContextAttachment({
      index,
      selection: { threadIds: ["PRRT_1"], checkIds: [93239647988] },
      logExcerpts: [
        {
          checkId: 93239647988,
          checkName: "validate",
          source: "annotations",
          excerpt: "[failure] src/app.tsx:12 — type error",
          note: "",
        },
      ],
    });
    const provenance = readPrContextProvenance({
      sourceId: attachment.sourceId,
      content: attachment.content,
    });
    expect(provenance).toEqual({
      v: 1,
      origin: "https://github.com/sendbird/stave/pull/348",
      owner: "sendbird",
      repo: "stave",
      prNumber: 348,
      headSha: index.headSha,
      fetchedAt: index.fetchedAt,
      threadIds: ["PRRT_1"],
      checkIds: [93239647988],
    });
    expect(attachment.content).toContain("[failure] src/app.tsx:12");
    expect(attachment.content).toContain("Evidence source: annotations");
  });

  test("one stable sourceId per PR so re-attaching replaces", () => {
    const first = buildPrContextAttachment({
      index: buildIndex(),
      selection: { threadIds: ["PRRT_1"], checkIds: [] },
      logExcerpts: [],
    });
    const second = buildPrContextAttachment({
      index: buildIndex({ headSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }),
      selection: { threadIds: ["PRRT_2"], checkIds: [] },
      logExcerpts: [],
    });
    expect(first.sourceId).toBe("pr:sendbird/stave#348");
    expect(second.sourceId).toBe(first.sourceId);
    expect(isPrContextSourceId(first.sourceId)).toBe(true);
    expect(isPrContextSourceId("crane:ABC-1")).toBe(false);
  });

  test("provenance is unreadable from a non-PR part", () => {
    expect(
      readPrContextProvenance({ sourceId: "crane:ABC-1", content: "x" }),
    ).toBeNull();
  });
});

describe("staleness", () => {
  test("a moved head is stale", () => {
    expect(
      isPrContextAttachmentStale({
        provenance: {
          v: 1,
          origin: "https://github.com/sendbird/stave/pull/348",
          owner: "sendbird",
          repo: "stave",
          prNumber: 348,
          headSha: "aaaa111",
          fetchedAt: "2026-08-09T19:00:00.000Z",
          threadIds: [],
          checkIds: [],
        },
        currentHeadSha: "bbbb222",
      }),
    ).toBe(true);
  });

  test("unknown on either side is never stale", () => {
    expect(
      isPrContextAttachmentStale({ provenance: null, currentHeadSha: "abc" }),
    ).toBe(false);
  });

  test("a stale PR part is withheld while other parts pass through", () => {
    const attachment = buildPrContextAttachment({
      index: buildIndex(),
      selection: { threadIds: ["PRRT_1"], checkIds: [] },
      logExcerpts: [],
    });
    const parts = [
      { sourceId: "crane:ABC-1", content: "crane material" },
      { sourceId: attachment.sourceId, content: attachment.content },
    ];
    const moved = partitionStalePrContexts({
      parts,
      currentPrUrl: "https://github.com/sendbird/stave/pull/348",
      currentHeadSha: "0000000000000000000000000000000000000000",
    });
    expect(moved.stale.map((part) => part.sourceId)).toEqual([
      "pr:sendbird/stave#348",
    ]);
    expect(moved.fresh.map((part) => part.sourceId)).toEqual(["crane:ABC-1"]);

    const unchanged = partitionStalePrContexts({
      parts,
      currentPrUrl: "https://github.com/sendbird/stave/pull/348",
      currentHeadSha: "88a73338498bed7d96bb21c7c7f6a3c3358d5f16",
    });
    expect(unchanged.stale).toEqual([]);
    expect(unchanged.fresh).toHaveLength(2);
  });

  test("evidence for a different PR is not judged against this head", () => {
    const attachment = buildPrContextAttachment({
      index: buildIndex(),
      selection: { threadIds: ["PRRT_1"], checkIds: [] },
      logExcerpts: [],
    });
    const result = partitionStalePrContexts({
      parts: [{ sourceId: attachment.sourceId, content: attachment.content }],
      currentPrUrl: "https://github.com/sendbird/stave/pull/999",
      currentHeadSha: "0000000000000000000000000000000000000000",
    });
    expect(result.stale).toEqual([]);
  });
});

describe("PR url parsing", () => {
  test("accepts a canonical PR url", () => {
    expect(
      parsePrContextUrl("https://github.com/sendbird/stave/pull/348"),
    ).toEqual({ owner: "sendbird", repo: "stave", number: 348 });
    expect(
      parsePrContextUrl("https://github.com/sendbird/stave/pull/348/files"),
    ).toEqual({ owner: "sendbird", repo: "stave", number: 348 });
  });

  test("rejects anything that is not a github PR url", () => {
    for (const url of [
      "https://evil.example.com/sendbird/stave/pull/348",
      "https://github.com/sendbird/stave/issues/348",
      "https://github.com/sendbird/stave/pull/notanumber",
      "file:///etc/passwd",
      "https://github.com/sendbird/sta ve/pull/348",
      "https://github.com/sendbird/stave/pull/348;rm -rf /",
    ]) {
      expect(parsePrContextUrl(url), url).toBeNull();
    }
  });

  test("sourceId building matches the parser", () => {
    const ref = parsePrContextUrl("https://github.com/o/r/pull/7");
    expect(ref).not.toBeNull();
    expect(buildPrContextSourceId(ref!)).toBe("pr:o/r#7");
  });
});
