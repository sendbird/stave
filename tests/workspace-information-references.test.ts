import { expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  buildWorkspaceInformationReferenceOptions,
  extractWorkspaceInformationReferencesFromText,
  formatWorkspaceInformationReferencesContext,
  getActiveWorkspaceInformationTokenMatch,
  replaceWorkspaceInformationToken,
  resolveWorkspaceInformationReferenceFromToken,
} from "@/lib/workspace-information-references";

test("buildWorkspaceInformationReferenceOptions includes section and item references", () => {
  const info = {
    ...createEmptyWorkspaceInformation(),
    notes: "Keep the implementation narrow.",
    todos: [
      {
        id: "todo-1",
        text: "Add @info chips",
        completed: false,
        status: "in_progress" as const,
      },
    ],
    jiraIssues: [
      {
        id: "jira-1",
        issueKey: "SB-1234",
        title: "Support Information mentions",
        url: "https://jira.example/SB-1234",
        status: "In Progress",
        note: "Use section and item references.",
      },
    ],
  };

  const options = buildWorkspaceInformationReferenceOptions(info);

  expect(options.some((option) => option.reference.token === "@info:todo")).toBe(
    true,
  );
  expect(
    options.some(
      (option) =>
        option.kind === "item" &&
        option.reference.section === "todo" &&
        option.reference.itemId === "todo-1",
    ),
  ).toBe(true);
});

test("extractWorkspaceInformationReferencesFromText parses section and item tokens", () => {
  const references = extractWorkspaceInformationReferencesFromText(
    "Check @info:todo and @info:jira/SB-1234 before editing.",
  );

  expect(references).toMatchObject([
    { section: "todo", scope: "section", token: "@info:todo" },
    {
      section: "jira",
      scope: "item",
      itemId: "SB-1234",
      token: "@info:jira/SB-1234",
    },
  ]);
});

test("lens references resolve, extract, and format from @lens tokens", () => {
  const options = buildWorkspaceInformationReferenceOptions(
    createEmptyWorkspaceInformation(),
  );
  expect(options.some((option) => option.reference.token === "@lens")).toBe(
    true,
  );

  expect(resolveWorkspaceInformationReferenceFromToken("@lens")).toMatchObject({
    section: "lens",
    scope: "section",
    token: "@lens",
  });

  expect(
    extractWorkspaceInformationReferencesFromText(
      "Fix the layout on @lens but ignore @lenses.",
    ),
  ).toMatchObject([{ section: "lens", token: "@lens" }]);

  const lensReference = resolveWorkspaceInformationReferenceFromToken("@lens");
  const context = formatWorkspaceInformationReferencesContext({
    info: createEmptyWorkspaceInformation(),
    references: [lensReference!],
    lens: {
      url: "http://localhost:3000/settings",
      title: "Settings",
      isLoading: false,
    },
  });
  expect(context).toContain("Section: Lens browser (@lens)");
  expect(context).toContain("Current URL: http://localhost:3000/settings");
  expect(context).toContain("Page title: Settings");

  const closedContext = formatWorkspaceInformationReferencesContext({
    info: createEmptyWorkspaceInformation(),
    references: [lensReference!],
    lens: null,
  });
  expect(closedContext).toContain("Lens browser state unavailable");
});

test("web references request the provider-native browser integration", () => {
  const info = createEmptyWorkspaceInformation();
  info.connectedBrowserTab = {
    providerId: "codex",
    status: "connected",
    requestedAt: "2026-08-11T05:00:00.000Z",
    lastUpdatedAt: "2026-08-11T05:00:01.000Z",
  };
  const options = buildWorkspaceInformationReferenceOptions(info);
  expect(options.some((option) => option.reference.token === "@web")).toBe(
    true,
  );
  expect(resolveWorkspaceInformationReferenceFromToken("@web")).toMatchObject({
    section: "web",
    scope: "section",
    token: "@web",
  });
  expect(
    extractWorkspaceInformationReferencesFromText(
      "Open it with @web but ignore @website.",
    ),
  ).toMatchObject([{ section: "web", token: "@web" }]);

  const context = formatWorkspaceInformationReferencesContext({
    info,
    references: [resolveWorkspaceInformationReferenceFromToken("@web")!],
  });
  expect(context).toContain("Section: Connected browser (@web)");
  expect(context).toContain("provider's browser extension tools");
  expect(context).toContain("Last provider: codex");
  expect(context).toContain("Connection status: connected");
  expect(context).not.toContain("example.com");
});

test("getActiveWorkspaceInformationTokenMatch opens on bare @ and @info tokens", () => {
  expect(
    getActiveWorkspaceInformationTokenMatch({
      text: "Check @",
      caretIndex: "Check @".length,
    }),
  ).toMatchObject({ token: "@", query: "" });

  expect(
    getActiveWorkspaceInformationTokenMatch({
      text: "Check @todo",
      caretIndex: "Check @todo".length,
    }),
  ).toMatchObject({ token: "@todo", query: "todo" });

  expect(
    getActiveWorkspaceInformationTokenMatch({
      text: "Check @info:todo",
      caretIndex: "Check @info:todo".length,
    }),
  ).toMatchObject({ token: "@info:todo", query: "todo" });
});

test("replaceWorkspaceInformationToken inserts a trailing separator for consecutive chips", () => {
  const reference = resolveWorkspaceInformationReferenceFromToken("@info:todo");

  expect(reference).not.toBeNull();
  expect(
    replaceWorkspaceInformationToken({
      text: "Check @",
      match: { start: "Check ".length, end: "Check @".length },
      reference: reference!,
    }),
  ).toBe("Check @info:todo ");
});

test("formatWorkspaceInformationReferencesContext resolves section and human item keys", () => {
  const info = {
    ...createEmptyWorkspaceInformation(),
    todos: [
      {
        id: "todo-1",
        text: "Wire prompt input chips",
        completed: false,
        status: "pending" as const,
      },
    ],
    jiraIssues: [
      {
        id: "jira-1",
        issueKey: "SB-1234",
        title: "Support Information mentions",
        url: "https://jira.example/SB-1234",
        status: "In Review",
        note: "Mention by issue key should resolve.",
      },
    ],
  };

  const todoSection = resolveWorkspaceInformationReferenceFromToken("@info:todo");
  const jiraItem = resolveWorkspaceInformationReferenceFromToken(
    "@info:jira/SB-1234",
  );

  expect(todoSection).not.toBeNull();
  expect(jiraItem).not.toBeNull();
  const context = formatWorkspaceInformationReferencesContext({
    info,
    references: [todoSection!, jiraItem!],
  });

  expect(context).toContain("Section: Todos (@info:todo)");
  expect(context).toContain("Wire prompt input chips");
  expect(context).toContain("Item: SB-1234");
  expect(context).toContain("Mention by issue key should resolve.");
});
