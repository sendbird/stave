import { expect, test } from "bun:test";
import {
  CRANE_STAVE_DISPATCH_VERSION,
  parseCraneStaveJobV1,
} from "@/lib/crane-connector/contract";
import {
  buildCraneDispatchBranchName,
  buildCraneDispatchTaskTitle,
  resolveCraneJiraReference,
  resolveCranePrimaryIssueKey,
} from "@/lib/crane-connector/jira-reference";

function buildJob(
  overrides: {
    key?: string;
    title?: string;
    description?: string;
    instruction?: string;
    links?: { rel: string; url: string; key?: string; title?: string }[];
  } = {},
) {
  return parseCraneStaveJobV1({
    version: CRANE_STAVE_DISPATCH_VERSION,
    id: "job-1",
    kind: "run_task",
    connectorId: "connector-1",
    issue: {
      id: "issue-1",
      key: overrides.key ?? "TFE-94",
      title: overrides.title ?? "Hide region information",
      description: overrides.description ?? "",
      href: "https://atelier.delight-tools.ai/apps/crane/w/FRONTEND/task/TFE-94",
      updatedAt: "2026-08-12T05:32:16.923Z",
      ...(overrides.links === undefined ? {} : { links: overrides.links }),
    },
    instruction: overrides.instruction ?? "Ship the fix.",
    requestedAt: "2026-08-12T05:32:16.923Z",
    expiresAt: "2026-08-12T06:32:16.923Z",
  });
}

test("a rel=jira entry in issue.links outranks any link in the body", () => {
  const job = buildJob({
    description:
      "See https://sendbird.atlassian.net/browse/DFE-1111 for background.",
    links: [
      { rel: "design", url: "https://figma.com/file/abc" },
      {
        rel: "Jira",
        key: "DFE-2898",
        url: "https://sendbird.atlassian.net/browse/DFE-2898",
      },
    ],
  });
  expect(resolveCraneJiraReference(job)).toEqual({
    key: "DFE-2898",
    url: "https://sendbird.atlassian.net/browse/DFE-2898",
    source: "crane_link",
  });
  expect(buildCraneDispatchBranchName(job)).toBe("crane/dfe-2898");
  expect(buildCraneDispatchTaskTitle(job)).toBe(
    "DFE-2898: Hide region information",
  );
});

test("a rel=jira entry without a key derives it from the Jira URL", () => {
  expect(
    resolveCraneJiraReference(
      buildJob({
        links: [
          {
            rel: "jira",
            url: "https://sendbird.atlassian.net/browse/DFE-2898",
          },
        ],
      }),
    ),
  ).toEqual({
    key: "DFE-2898",
    url: "https://sendbird.atlassian.net/browse/DFE-2898",
    source: "crane_link",
  });
});

test("a rel=jira entry pointing off a Jira host keeps the key but drops the URL", () => {
  expect(
    resolveCraneJiraReference(
      buildJob({
        links: [
          {
            rel: "jira",
            key: "dfe-2898",
            url: "https://evil.example/browse/DFE-2898",
          },
        ],
      }),
    ),
  ).toEqual({ key: "DFE-2898", url: "", source: "crane_link" });
});

test("non-Jira links never resolve a Jira reference", () => {
  expect(
    resolveCraneJiraReference(
      buildJob({
        links: [{ rel: "linear", url: "https://linear.app/team/issue/ABC-12" }],
      }),
    ),
  ).toBeNull();
  expect(resolveCranePrimaryIssueKey(buildJob({ links: [] }))).toBe("TFE-94");
});

test("a job with no declared link and no Jira text resolves nothing", () => {
  expect(buildJob().issue.links).toBeUndefined();
  expect(resolveCraneJiraReference(buildJob())).toBeNull();
});

test("the Crane key never counts as a Jira key", () => {
  const job = buildJob({
    key: "TFE-94",
    description: "Follow-up of TFE-71, blocked by TFE-12.",
  });
  expect(resolveCraneJiraReference(job)).toBeNull();
  expect(resolveCranePrimaryIssueKey(job)).toBe("TFE-94");
  expect(buildCraneDispatchBranchName(job)).toBe("crane/tfe-94");
  expect(buildCraneDispatchTaskTitle(job)).toBe(
    "Crane TFE-94: Hide region information",
  );
});

test("a Jira URL in the issue body wins over the Crane key", () => {
  const job = buildJob({
    description:
      "Spec: https://sendbird.atlassian.net/browse/DESK-4821 — see the ACs there.",
  });
  expect(resolveCraneJiraReference(job)).toEqual({
    key: "DESK-4821",
    url: "https://sendbird.atlassian.net/browse/DESK-4821",
    source: "issue_url",
  });
  expect(buildCraneDispatchBranchName(job)).toBe("crane/desk-4821");
  expect(buildCraneDispatchTaskTitle(job)).toBe(
    "DESK-4821: Hide region information",
  );
});

test("a bare Jira key in the instruction is used as a last resort", () => {
  const job = buildJob({ instruction: "Implement DESK-4821 behind a flag." });
  expect(resolveCraneJiraReference(job)).toEqual({
    key: "DESK-4821",
    url: "",
    source: "issue_text",
  });
});

test("the Crane issue URL is not mistaken for a Jira link", () => {
  const job = buildJob({
    description:
      "Duplicate of https://atelier.delight-tools.ai/apps/crane/w/FRONTEND/task/TFE-71.",
  });
  expect(resolveCraneJiraReference(job)).toBeNull();
});
