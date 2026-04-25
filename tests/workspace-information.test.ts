import { expect, test } from "bun:test";
import {
  changeWorkspaceInfoCustomFieldType,
  createEmptyWorkspaceInformation,
  createWorkspaceInfoCustomField,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  formatWorkspaceInfoHostLabel,
  isGitHubPullRequestUrl,
  isWorkspaceInfoUrl,
  updateWorkspaceInfoSelectFieldOptions,
} from "@/lib/workspace-information";

test("createEmptyWorkspaceInformation returns empty defaults", () => {
  expect(createEmptyWorkspaceInformation()).toEqual({
    jiraIssues: [],
    confluencePages: [],
    figmaResources: [],
    linkedPullRequests: [],
    slackThreads: [],
    notes: "",
    todos: [],
    customFields: [],
  });
});

test("changeWorkspaceInfoCustomFieldType preserves id and label while resetting value", () => {
  const textField = createWorkspaceInfoCustomField({
    type: "text",
    label: "Owner",
  });
  const nextField = changeWorkspaceInfoCustomFieldType({
    field: {
      ...textField,
      value: "Platform",
    },
    type: "boolean",
  });

  expect(nextField).toEqual({
    id: textField.id,
    label: "Owner",
    type: "boolean",
    value: false,
  });
});

test("updateWorkspaceInfoSelectFieldOptions deduplicates options and resets stale value", () => {
  const field = {
    ...createWorkspaceInfoCustomField({
      type: "single_select",
      label: "Stage",
    }),
    options: ["design", "review"],
    value: "review",
  };

  const nextField = updateWorkspaceInfoSelectFieldOptions({
    field,
    rawValue: "design, qa, qa, release",
  });

  expect(nextField.options).toEqual(["design", "qa", "release"]);
  expect(nextField.value).toBe("design");
});

test("isWorkspaceInfoUrl accepts only http and https urls", () => {
  expect(isWorkspaceInfoUrl("https://example.com")).toBe(true);
  expect(isWorkspaceInfoUrl("http://example.com/path")).toBe(true);
  expect(isWorkspaceInfoUrl("ftp://example.com")).toBe(false);
  expect(isWorkspaceInfoUrl("not a url")).toBe(false);
});

test("extractGitHubPullRequestReference parses github pull request urls", () => {
  expect(
    extractGitHubPullRequestReference(
      "https://github.com/openai/stave/pull/164",
    ),
  ).toEqual({
    owner: "openai",
    repo: "stave",
    number: 164,
  });
  expect(
    isGitHubPullRequestUrl("https://github.com/openai/stave/pull/164"),
  ).toBe(true);
  expect(
    isGitHubPullRequestUrl("https://github.com/openai/stave/issues/164"),
  ).toBe(false);
});

test("extractJiraIssueReference reads the issue key from jira-style urls", () => {
  expect(
    extractJiraIssueReference("https://company.atlassian.net/browse/ABC-123"),
  ).toEqual({
    host: "company.atlassian.net",
    issueKey: "ABC-123",
  });
});

test("extractFigmaResourceReference reads the resource kind, title, and node id", () => {
  expect(
    extractFigmaResourceReference(
      "https://www.figma.com/file/FILE123/Workspace-Information?node-id=42-7",
    ),
  ).toEqual({
    host: "figma.com",
    kind: "file",
    fileKey: "FILE123",
    title: "Workspace Information",
    nodeId: "42-7",
  });
});

test("formatWorkspaceInfoHostLabel normalizes www-prefixed hosts", () => {
  expect(
    formatWorkspaceInfoHostLabel(
      "https://www.github.com/openai/stave/pull/164",
    ),
  ).toBe("github.com");
  expect(formatWorkspaceInfoHostLabel("not a url")).toBe("");
});

test("extractConfluencePageReference parses confluence page urls", () => {
  expect(
    extractConfluencePageReference(
      "https://company.atlassian.net/wiki/spaces/ENG/pages/12345/My+Page+Title",
    ),
  ).toEqual({
    host: "company.atlassian.net",
    spaceKey: "ENG",
    title: "My Page Title",
  });
});

test("extractConfluencePageReference handles wiki-only urls", () => {
  expect(
    extractConfluencePageReference(
      "https://company.atlassian.net/wiki/x/abc123",
    ),
  ).toEqual({
    host: "company.atlassian.net",
    spaceKey: "",
    title: "",
  });
});

test("extractConfluencePageReference returns null for non-confluence urls", () => {
  expect(extractConfluencePageReference("https://github.com/org/repo")).toBe(
    null,
  );
  expect(extractConfluencePageReference("not a url")).toBe(null);
});
