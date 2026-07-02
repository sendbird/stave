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
