import { expect, test } from "bun:test";
import {
  applyDetectedWorkspaceResources,
  buildIntentGuardContextInput,
  buildWorkspaceResourceDedupeKey,
  changeWorkspaceInfoCustomFieldType,
  detectWorkspaceResourcesInText,
  upsertWorkspaceResourceInState,
  createEmptyWorkspaceInformation,
  createWorkspaceAmplifyLink,
  createWorkspaceInfoCustomField,
  extractAmplifyLinkReference,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  extractStorybookResourceReference,
  formatWorkspaceInfoHostLabel,
  formatStorybookAccessContext,
  inferStorybookResourceAccess,
  isGitHubPullRequestUrl,
  isWorkspaceInfoUrl,
  isWorkspaceIntentAnchor,
  normalizeGitHubRepoReference,
  resolveVisibleWorkspaceLinkedPullRequests,
  resolveStorybookResourceAccess,
  shouldAutoFillWorkspaceInformation,
  toggleWorkspaceIntentAnchor,
  updateWorkspaceLinkedPullRequestUrl,
  updateWorkspaceInfoSelectFieldOptions,
} from "@/lib/workspace-information";
import {
  formatWorkspaceInfoTaskSeedPrompt,
  resolveWorkspaceInfoTaskSeedTitle,
} from "@/lib/workspace-information-task-seed";

test("createEmptyWorkspaceInformation returns empty defaults", () => {
  expect(createEmptyWorkspaceInformation()).toEqual({
    jiraIssues: [],
    confluencePages: [],
    figmaResources: [],
    storybookResources: [],
    linkedPullRequests: [],
    amplifyLinks: [],
    slackThreads: [],
    hirondelleProject: null,
    notes: "",
    todos: [],
    customFields: [],
    intentAnchorIds: [],
  });
});

test("toggleWorkspaceIntentAnchor adds and removes ids immutably", () => {
  const base = createEmptyWorkspaceInformation();
  const added = toggleWorkspaceIntentAnchor(base, "jira-1");
  expect(added.intentAnchorIds).toEqual(["jira-1"]);
  expect(isWorkspaceIntentAnchor(added, "jira-1")).toBe(true);
  expect(isWorkspaceIntentAnchor(base, "jira-1")).toBe(false);

  const removed = toggleWorkspaceIntentAnchor(added, "jira-1");
  expect(removed.intentAnchorIds).toEqual([]);
  expect(isWorkspaceIntentAnchor(removed, "jira-1")).toBe(false);
});

test("buildIntentGuardContextInput is empty until resources are pinned", () => {
  const info = {
    ...createEmptyWorkspaceInformation(),
    notes: "Read-only dashboard only.",
    jiraIssues: [
      {
        id: "jira-1",
        issueKey: "PROJ-1",
        title: "PRD",
        url: "https://jira/PROJ-1",
        status: "",
        note: "",
      },
    ],
    figmaResources: [
      {
        id: "figma-1",
        title: "Design",
        url: "https://figma/abc",
        nodeId: "",
        note: "",
      },
    ],
  };

  // No pins: disarmed even though notes/resources exist.
  expect(buildIntentGuardContextInput(info)).toEqual({});

  // Pin only the Jira issue: notes are included, but the unpinned Figma is not.
  const pinned = toggleWorkspaceIntentAnchor(info, "jira-1");
  const input = buildIntentGuardContextInput(pinned);
  expect(input.notes).toBe("Read-only dashboard only.");
  expect(input.jiraIssues?.map((issue) => issue.id)).toEqual(["jira-1"]);
  expect(input.figmaResources).toEqual([]);
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

test("resolveVisibleWorkspaceLinkedPullRequests hides duplicate and current branch PRs", () => {
  const items = [
    {
      id: "pr-current",
      title: "Current",
      url: "https://www.github.com/Sendbird/Stave/pull/164/?tab=checks",
      status: "open" as const,
      note: "",
    },
    {
      id: "pr-current-duplicate",
      title: "Current duplicate",
      url: "https://github.com/sendbird/stave/pull/164",
      status: "open" as const,
      note: "",
    },
    {
      id: "pr-related",
      title: "Related",
      url: "https://github.com/sendbird/stave/pull/165",
      status: "review" as const,
      note: "",
    },
    {
      id: "pr-draft-input",
      title: "",
      url: "",
      status: "planned" as const,
      note: "",
    },
  ];

  expect(
    resolveVisibleWorkspaceLinkedPullRequests({
      items,
      currentBranchUrl: "https://github.com/sendbird/stave/pull/164",
    }).map((item) => item.id),
  ).toEqual(["pr-related", "pr-draft-input"]);
});

test("updateWorkspaceLinkedPullRequestUrl rejects duplicate manual entries", () => {
  const existing = {
    id: "pr-existing",
    title: "Existing",
    url: "https://github.com/sendbird/stave/pull/164",
    status: "open" as const,
    note: "",
  };
  const draft = {
    id: "pr-draft",
    title: "",
    url: "",
    status: "planned" as const,
    note: "",
  };

  const linkedDuplicate = updateWorkspaceLinkedPullRequestUrl({
    items: [existing, draft],
    itemId: draft.id,
    url: "https://www.github.com/Sendbird/Stave/pull/164/files",
  });
  expect(linkedDuplicate.duplicate).toBe("linked");
  expect(linkedDuplicate.items).toEqual([existing]);

  const currentBranchDuplicate = updateWorkspaceLinkedPullRequestUrl({
    items: [draft],
    itemId: draft.id,
    url: "https://github.com/sendbird/stave/pull/165",
    currentBranchUrl: "https://github.com/sendbird/stave/pull/165/checks",
  });
  expect(currentBranchDuplicate.duplicate).toBe("current_branch");
  expect(currentBranchDuplicate.items).toEqual([]);
});

test("updateWorkspaceLinkedPullRequestUrl accepts a unique PR", () => {
  const draft = {
    id: "pr-draft",
    title: "",
    url: "",
    status: "planned" as const,
    note: "",
  };
  const result = updateWorkspaceLinkedPullRequestUrl({
    items: [draft],
    itemId: draft.id,
    url: "https://github.com/sendbird/stave/pull/166",
    currentBranchUrl: "https://github.com/sendbird/stave/pull/165",
  });

  expect(result.duplicate).toBeNull();
  expect(result.items[0]?.url).toBe(
    "https://github.com/sendbird/stave/pull/166",
  );
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

test("extractStorybookResourceReference reads host and story path", () => {
  expect(
    extractStorybookResourceReference(
      "https://storybook.example.com/?path=/docs/components-button--docs",
    ),
  ).toEqual({
    host: "storybook.example.com",
    storyPath: "/docs/components-button--docs",
    title: "components button",
  });
});

test("inferStorybookResourceAccess detects private GitHub Pages hosts", () => {
  expect(
    inferStorybookResourceAccess(
      "https://silver-chainsaw-ww7n83m.pages.github.io/?path=/story/2026-06-kms-help-center-contents-articles--filter-status-published",
    ),
  ).toEqual({
    kind: "requires_github_auth",
    provider: "github-pages",
    externalRepo: "",
    readableVia: "github_cli",
    sourceHint: "",
  });

  expect(
    inferStorybookResourceAccess(
      "https://sendbird.github.io/design-system/?path=/docs/button--docs",
    ),
  ).toEqual({
    kind: "unknown",
    provider: "github-pages",
    externalRepo: "",
    readableVia: "unknown",
    sourceHint: "",
  });
});

test("resolveStorybookResourceAccess stores GitHub repo mapping for agents", () => {
  expect(
    resolveStorybookResourceAccess({
      url: "https://silver-chainsaw-ww7n83m.pages.github.io/?path=/story/example--default",
      externalRepo: "https://github.com/acme/storybook.git",
      sourceHint: "storybook-static artifact",
    }),
  ).toEqual({
    kind: "requires_github_auth",
    provider: "github-pages",
    externalRepo: "acme/storybook",
    readableVia: "github_cli",
    sourceHint: "storybook-static artifact",
  });

  expect(normalizeGitHubRepoReference("acme/storybook")).toBe("acme/storybook");
});

test("formatStorybookAccessContext tells agents to avoid direct fetches", () => {
  expect(
    formatStorybookAccessContext({
      id: "storybook-1",
      title: "Private Storybook",
      url: "https://silver-chainsaw-ww7n83m.pages.github.io/?path=/story/example--default",
      note: "",
      access: {
        kind: "requires_github_auth",
        provider: "github-pages",
        externalRepo: "acme/storybook",
        readableVia: "github_cli",
        sourceHint: "storybook-static",
      },
    }),
  ).toBe(
    "access requires GitHub auth, provider github-pages, repo acme/storybook, read via GitHub CLI/API instead of direct web fetch, source storybook-static",
  );
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

test("resolveWorkspaceInfoTaskSeedTitle prefers normalized title", () => {
  expect(
    resolveWorkspaceInfoTaskSeedTitle({
      title: "  Fix   flaky   tests  ",
      referenceLabel: "ENG-123",
    }),
  ).toBe("Fix flaky tests");
});

test("formatWorkspaceInfoTaskSeedPrompt includes source reference url and note", () => {
  const prompt = formatWorkspaceInfoTaskSeedPrompt({
    title: "Add task seeding",
    sourceLabel: "GitHub pull request",
    referenceLabel: "sendbird/stave #27",
    url: "https://github.com/sendbird/stave/pull/27",
    note: "Carry this into a focused implementation task.",
  });

  expect(prompt.split("\n")[0]).toBe("Add task seeding");
  expect(prompt).toContain(
    "Create a Stave task from this GitHub pull request.",
  );
  expect(prompt).toContain("Reference: sendbird/stave #27");
  expect(prompt).toContain("URL: https://github.com/sendbird/stave/pull/27");
  expect(prompt).toContain("Carry this into a focused implementation task.");
});

test("extractAmplifyLinkReference parses a valid Amplify deploy URL", () => {
  const reference = extractAmplifyLinkReference(
    "https://main.d123abc456.amplifyapp.com",
  );
  expect(reference).toEqual({
    host: "main.d123abc456.amplifyapp.com",
    branch: "main",
    appId: "d123abc456",
  });
});

test("extractAmplifyLinkReference returns null for non-Amplify hosts", () => {
  expect(extractAmplifyLinkReference("https://example.com")).toBeNull();
  expect(extractAmplifyLinkReference("not a url")).toBeNull();
});

test("createWorkspaceAmplifyLink returns an empty amplify link with a unique id", () => {
  const link = createWorkspaceAmplifyLink();
  expect(link.url).toBe("");
  expect(link.label).toBe("");
  expect(link.note).toBe("");
  expect(link.id).toStartWith("amplify-");
});

// ---------------------------------------------------------------------------
// Resource dedup keys, prompt auto-detection, and upsert
// ---------------------------------------------------------------------------

test("buildWorkspaceResourceDedupeKey collapses Jira URL variants onto the issue key", () => {
  const base = buildWorkspaceResourceDedupeKey({
    kind: "jira",
    url: "https://acme.atlassian.net/browse/ABC-123",
  });
  expect(base).toBe("jira:key:ABC-123");
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "jira",
      url: "https://www.acme.atlassian.net/browse/ABC-123?focusedCommentId=99",
    }),
  ).toBe(base);
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "jira",
      url: "https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ABC-123",
    }),
  ).toBe(base);
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ABC-124",
    }),
  ).not.toBe(base);
});

test("buildWorkspaceResourceDedupeKey collapses PR URL variants onto owner/repo#number", () => {
  const base = buildWorkspaceResourceDedupeKey({
    kind: "pull_request",
    url: "https://github.com/sendbird/stave/pull/27",
  });
  expect(base).toBe("pr:sendbird/stave#27");
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "pull_request",
      url: "https://www.github.com/sendbird/stave/pull/27/files",
    }),
  ).toBe(base);
});

test("buildWorkspaceResourceDedupeKey keys Confluence pages on page id when present", () => {
  const base = buildWorkspaceResourceDedupeKey({
    kind: "confluence",
    url: "https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Some+Title",
  });
  expect(base).toBe("confluence:page:acme.atlassian.net:123456");
  expect(
    buildWorkspaceResourceDedupeKey({
      kind: "confluence",
      url: "https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Renamed?focusedCommentId=1",
    }),
  ).toBe(base);
});

test("detectWorkspaceResourcesInText finds registerable URLs in prose", () => {
  const detected = detectWorkspaceResourcesInText(
    [
      "SBIS 이슈 https://acme.atlassian.net/browse/ABC-123 참고해서",
      "PR https://github.com/sendbird/stave/pull/27 리뷰하고,",
      "디자인은 https://www.figma.com/design/FILEKEY123/My-Design?node-id=1-2 확인.",
      "스레드: https://acme.slack.com/archives/C0123456789/p1234567890123456",
      "배포: https://main.d123abc456.amplifyapp.com",
      "문서: https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Spec",
    ].join("\n"),
  );

  expect(detected.map((item) => item.kind).sort()).toEqual(
    ["amplify", "confluence", "figma", "jira", "pull_request", "slack"].sort(),
  );
  const jira = detected.find((item) => item.kind === "jira");
  expect(jira?.issueKey).toBe("ABC-123");
  const pr = detected.find((item) => item.kind === "pull_request");
  expect(pr?.title).toBe("sendbird/stave#27");
});

test("detectWorkspaceResourcesInText dedupes repeats and ignores non-resource URLs", () => {
  const detected = detectWorkspaceResourcesInText(
    [
      "https://acme.atlassian.net/browse/ABC-123",
      "https://acme.atlassian.net/browse/ABC-123?focusedCommentId=1",
      "https://example.com/some/page",
      // Issue-key-looking branch segment must not classify as Jira.
      "https://github.com/sendbird/stave/tree/fix/ABC-123-something",
    ].join(" "),
  );
  expect(detected).toHaveLength(1);
  expect(detected[0]?.kind).toBe("jira");
});

test("upsertWorkspaceResourceInState appends a new Jira issue", () => {
  const current = createEmptyWorkspaceInformation();
  const result = upsertWorkspaceResourceInState({
    current,
    input: {
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ABC-123",
    },
  });
  expect(result.deduplicated).toBe(false);
  expect(result.state.jiraIssues).toHaveLength(1);
  expect(result.state.jiraIssues[0]?.issueKey).toBe("ABC-123");
  expect(result.state.jiraIssues[0]?.title).toBe("ABC-123");
});

test("upsertWorkspaceResourceInState merges duplicate Jira registrations", () => {
  const first = upsertWorkspaceResourceInState({
    current: createEmptyWorkspaceInformation(),
    input: {
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ABC-123",
    },
  });
  const second = upsertWorkspaceResourceInState({
    current: first.state,
    input: {
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ABC-123?focusedCommentId=9",
      status: "In Progress",
      note: "from agent",
    },
  });
  expect(second.deduplicated).toBe(true);
  expect(second.state.jiraIssues).toHaveLength(1);
  expect(second.state.jiraIssues[0]?.id).toBe(first.state.jiraIssues[0]?.id);
  expect(second.state.jiraIssues[0]?.status).toBe("In Progress");
  expect(second.state.jiraIssues[0]?.note).toBe("from agent");
});

test("upsertWorkspaceResourceInState is a referential no-op for identical duplicates", () => {
  const first = upsertWorkspaceResourceInState({
    current: createEmptyWorkspaceInformation(),
    input: {
      kind: "pull_request",
      url: "https://github.com/sendbird/stave/pull/27",
      title: "sendbird/stave#27",
    },
  });
  const second = upsertWorkspaceResourceInState({
    current: first.state,
    input: {
      kind: "pull_request",
      url: "https://github.com/sendbird/stave/pull/27/files",
    },
  });
  expect(second.deduplicated).toBe(true);
  expect(second.state).toBe(first.state);
});

test("applyDetectedWorkspaceResources folds detections and reports additions", () => {
  const seeded = upsertWorkspaceResourceInState({
    current: createEmptyWorkspaceInformation(),
    input: {
      kind: "jira",
      url: "https://acme.atlassian.net/browse/ABC-123",
    },
  }).state;
  const detected = detectWorkspaceResourcesInText(
    "https://acme.atlassian.net/browse/ABC-123 https://github.com/sendbird/stave/pull/27",
  );
  const result = applyDetectedWorkspaceResources({
    current: seeded,
    detected,
  });
  expect(result.added).toHaveLength(1);
  expect(result.state.jiraIssues).toHaveLength(1);
  expect(result.state.linkedPullRequests).toHaveLength(1);

  const repeat = applyDetectedWorkspaceResources({
    current: result.state,
    detected,
  });
  expect(repeat.added).toHaveLength(0);
  expect(repeat.state).toBe(result.state);
});

test("shouldAutoFillWorkspaceInformation excludes the default workspace", () => {
  const workspaceDefaultById = {
    "workspace:default": true,
    "workspace:feature": false,
  };

  expect(
    shouldAutoFillWorkspaceInformation({
      workspaceId: "workspace:default",
      workspaceDefaultById,
    }),
  ).toBe(false);
  expect(
    shouldAutoFillWorkspaceInformation({
      workspaceId: "workspace:feature",
      workspaceDefaultById,
    }),
  ).toBe(true);
});
