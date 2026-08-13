import { expect, test } from "bun:test";
import {
  buildIntentGuardContextInput,
  buildWorkspaceResourceDedupeKey,
  createEmptyWorkspaceInformation,
  detectWorkspaceResourcesInText,
  extractCraneIssueReference,
  isCraneIssueUrl,
  toggleWorkspaceIntentAnchor,
  upsertWorkspaceResourceInState,
  type WorkspaceCraneIssue,
} from "@/lib/workspace-information";
import { collectIntentContext } from "@/lib/source-control-review";
import { buildWorkspaceInformationSeed } from "@/lib/workspace-kickoff";
import {
  isWorkspaceInformationSectionAvailable,
  resolveVisibleWorkspaceInformationSections,
  workspaceInformationSectionHasContent,
} from "@/lib/workspace-information-sections";

const CRANE_URL =
  "https://atelier.delight-tools.ai/apps/crane/w/FRONTEND/task/TFE-94";

test("extractCraneIssueReference reads the key and team from a Crane task URL", () => {
  expect(extractCraneIssueReference(CRANE_URL)).toEqual({
    host: "atelier.delight-tools.ai",
    issueKey: "TFE-94",
    teamKey: "FRONTEND",
  });
  expect(isCraneIssueUrl(CRANE_URL)).toBe(true);
});

test("non-Crane URLs are not treated as Crane issues", () => {
  expect(
    extractCraneIssueReference("https://sendbird.atlassian.net/browse/DESK-1"),
  ).toBeNull();
  expect(extractCraneIssueReference("https://example.com/task/TFE-94")).toBeNull();
  expect(isCraneIssueUrl("not a url")).toBe(false);
});

test("a Crane list URL without a task segment still resolves as Crane", () => {
  const reference = extractCraneIssueReference(
    "https://atelier.delight-tools.ai/apps/crane",
  );
  expect(reference?.issueKey).toBe("");
});

test("a Crane URL in free text is detected as a crane resource, not jira", () => {
  const detected = detectWorkspaceResourcesInText(`See ${CRANE_URL} for scope.`);
  expect(detected).toEqual([
    { kind: "crane", url: CRANE_URL, issueKey: "TFE-94", title: "TFE-94" },
  ]);
});

test("Crane and Jira issues sharing a key do not collide", () => {
  expect(
    buildWorkspaceResourceDedupeKey({ kind: "crane", url: CRANE_URL }),
  ).toBe("crane:key:atelier.delight-tools.ai:TFE-94");
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "jira",
      url: "https://sendbird.atlassian.net/browse/TFE-94",
    }),
  ).toBe("jira:key:TFE-94");
});

test("Crane issues upsert into their own list and dedupe by key", () => {
  const first = upsertWorkspaceResourceInState({
    current: createEmptyWorkspaceInformation(),
    input: { kind: "crane", url: CRANE_URL, title: "Hide region information" },
  });
  expect(first.deduplicated).toBe(false);
  expect(first.state.jiraIssues).toEqual([]);
  expect(first.state.craneIssues).toHaveLength(1);
  expect((first.state.craneIssues?.[0] as WorkspaceCraneIssue).issueKey).toBe(
    "TFE-94",
  );

  const second = upsertWorkspaceResourceInState({
    current: first.state,
    input: { kind: "crane", url: `${CRANE_URL}?from=list`, status: "in_review" },
  });
  expect(second.deduplicated).toBe(true);
  expect(second.state.craneIssues).toHaveLength(1);
  expect((second.state.craneIssues?.[0] as WorkspaceCraneIssue).status).toBe(
    "in_review",
  );
});

test("the Crane section is hidden until the connector is on or entries exist", () => {
  const empty = createEmptyWorkspaceInformation();
  expect(
    isWorkspaceInformationSectionAvailable({ id: "crane", information: empty }),
  ).toBe(false);
  expect(
    isWorkspaceInformationSectionAvailable({
      id: "crane",
      information: empty,
      craneConnectorEnabled: true,
    }),
  ).toBe(true);

  const withIssue = upsertWorkspaceResourceInState({
    current: empty,
    input: { kind: "crane", url: CRANE_URL },
  }).state;
  expect(
    isWorkspaceInformationSectionAvailable({
      id: "crane",
      information: withIssue,
    }),
  ).toBe(true);
  expect(
    workspaceInformationSectionHasContent({ id: "crane", information: withIssue }),
  ).toBe(true);
});

test("a stale visibility override cannot resurrect the gated Crane section", () => {
  const sections = resolveVisibleWorkspaceInformationSections({
    visibility: { crane: true },
    information: createEmptyWorkspaceInformation(),
  });
  expect(sections).not.toContain("crane");

  expect(
    resolveVisibleWorkspaceInformationSections({
      visibility: { crane: true },
      information: createEmptyWorkspaceInformation(),
      craneConnectorEnabled: true,
    }),
  ).toContain("crane");
});

test("a kickoff proposal cannot seed a Crane URL into the Jira section", () => {
  const information = buildWorkspaceInformationSeed({
    branchName: "crane/tfe-94",
    workspaceLabel: "TFE-94",
    sourceSummary: "TFE-94",
    firstTaskTitle: "Kick off TFE-94",
    firstTaskPrompt: "Start the work",
    panelEntries: [
      {
        target: "jiraIssues",
        title: "Hide region information",
        url: CRANE_URL,
        reference: "TFE-94",
        note: "",
      },
    ],
    notes: "",
    todos: [],
    degraded: true,
  });

  expect(information.jiraIssues).toHaveLength(0);
  expect(information.craneIssues?.[0]).toMatchObject({
    issueKey: "TFE-94",
    url: CRANE_URL,
  });
});

test("a pinned Crane issue reaches the intent guard context", () => {
  const seeded = upsertWorkspaceResourceInState({
    current: createEmptyWorkspaceInformation(),
    input: { kind: "crane", url: CRANE_URL, title: "Hide region information" },
  }).state;
  const issue = seeded.craneIssues?.[0] as WorkspaceCraneIssue;

  const context = collectIntentContext(
    buildIntentGuardContextInput(toggleWorkspaceIntentAnchor(seeded, issue.id)),
  );
  expect(context).toContain("[Crane] TFE-94 — Hide region information");
});
