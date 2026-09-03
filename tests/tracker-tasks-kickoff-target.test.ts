import { beforeEach, describe, expect, test } from "bun:test";

import type { CraneProjectMapping } from "@/lib/crane-connector/types";
import type { JiraProjectMapping } from "@/lib/jira-connector/types";
import {
  TRACKER_TASKS_LAST_PROJECT_STORAGE_KEY,
  describeTrackerTaskScope,
  findTrackerTaskMappedProjectPath,
  findTrackerTaskRuntimeMemory,
  parseTrackerTaskLastProjects,
  readTrackerTaskLastProject,
  resolveTrackerTaskScopeKey,
  updateJiraProjectMapping,
  writeTrackerTaskLastProject,
} from "@/lib/tracker-tasks/kickoff-target";
import type { TrackerTask } from "@/lib/tracker-tasks/types";

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "PLAT-1",
    key: "PLAT-1",
    title: "Fix the flaky upload retry",
    url: "https://example.invalid/PLAT-1",
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "Medium", level: "medium" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: null,
    team: { key: "PLAT", name: "Platform" },
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

const CRANE_MAPPINGS: CraneProjectMapping[] = [
  { craneTeamKey: "PLAT", staveProjectPath: "/tmp/platform" },
];

const JIRA_MAPPINGS: JiraProjectMapping[] = [
  {
    jiraProjectKey: "ABC",
    staveProjectPath: "/tmp/abc",
    runtime: { providerId: "codex", model: "gpt-5-codex", effort: "high" },
  },
];

const SETTINGS = {
  craneMappings: CRANE_MAPPINGS,
  jiraMappings: JIRA_MAPPINGS,
};

describe("resolveTrackerTaskScopeKey", () => {
  test("reads the Crane team key off the ticket key", () => {
    expect(resolveTrackerTaskScopeKey(makeTask())).toBe("PLAT");
  });

  test("reads the Jira project key and normalizes its case", () => {
    expect(
      resolveTrackerTaskScopeKey(
        makeTask({ source: "jira", key: "abc-42", ref: "abc-42" }),
      ),
    ).toBe("ABC");
  });

  test("returns nothing for a key that carries no scope", () => {
    expect(resolveTrackerTaskScopeKey(makeTask({ key: "12345" }))).toBeNull();
    expect(describeTrackerTaskScope(makeTask({ key: "12345" }))).toBeNull();
  });
});

describe("findTrackerTaskMappedProjectPath", () => {
  test("uses the Crane team mapping when the project is registered", () => {
    expect(
      findTrackerTaskMappedProjectPath({
        task: makeTask(),
        settings: SETTINGS,
        registeredProjectPaths: ["/tmp/platform"],
      }),
    ).toBe("/tmp/platform");
  });

  test("uses the Jira project mapping for a Jira ticket", () => {
    expect(
      findTrackerTaskMappedProjectPath({
        task: makeTask({ source: "jira", key: "ABC-42", ref: "ABC-42" }),
        settings: SETTINGS,
        registeredProjectPaths: ["/tmp/abc"],
      }),
    ).toBe("/tmp/abc");
  });

  test("ignores a mapping whose project is no longer registered", () => {
    // Preselecting a path Stave cannot open would fail at submit, after the
    // user filled in the rest of the form.
    expect(
      findTrackerTaskMappedProjectPath({
        task: makeTask({ source: "jira", key: "ABC-42", ref: "ABC-42" }),
        settings: SETTINGS,
        registeredProjectPaths: ["/tmp/other"],
      }),
    ).toBeNull();
  });

  test("returns nothing when no mapping covers the ticket", () => {
    expect(
      findTrackerTaskMappedProjectPath({
        task: makeTask({ key: "OTHER-9", ref: "OTHER-9" }),
        settings: SETTINGS,
        registeredProjectPaths: ["/tmp/platform"],
      }),
    ).toBeNull();
  });
});

describe("findTrackerTaskRuntimeMemory", () => {
  test("returns the remembered runtime for a Jira project", () => {
    expect(
      findTrackerTaskRuntimeMemory({
        task: makeTask({ source: "jira", key: "ABC-42", ref: "ABC-42" }),
        settings: SETTINGS,
      })?.model,
    ).toBe("gpt-5-codex");
  });

  test("returns nothing when the mapping has no runtime memory", () => {
    expect(
      findTrackerTaskRuntimeMemory({ task: makeTask(), settings: SETTINGS }),
    ).toBeNull();
  });
});

describe("updateJiraProjectMapping", () => {
  test("replaces the row for a project key rather than duplicating it", () => {
    const next = updateJiraProjectMapping({
      mappings: JIRA_MAPPINGS,
      jiraProjectKey: "abc",
      staveProjectPath: "/tmp/abc-2",
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      jiraProjectKey: "ABC",
      staveProjectPath: "/tmp/abc-2",
    });
  });

  test("drops the row when the project is cleared", () => {
    expect(
      updateJiraProjectMapping({
        mappings: JIRA_MAPPINGS,
        jiraProjectKey: "ABC",
        staveProjectPath: null,
      }),
    ).toEqual([]);
  });

  test("keeps unrelated rows untouched", () => {
    const next = updateJiraProjectMapping({
      mappings: JIRA_MAPPINGS,
      jiraProjectKey: "XYZ",
      staveProjectPath: "/tmp/xyz",
    });
    expect(next).toHaveLength(2);
    expect(next.map((row) => row.jiraProjectKey)).toEqual(["XYZ", "ABC"]);
  });
});

describe("last-used project storage", () => {
  // Bun's test runtime has no DOM, and the helpers are written to survive a
  // missing or throwing `localStorage`; the stub is what makes the round trip
  // observable at all.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  test("salvages a corrupt document instead of throwing", () => {
    expect(parseTrackerTaskLastProjects("not json")).toEqual({});
    expect(parseTrackerTaskLastProjects("[]")).toEqual({});
    expect(parseTrackerTaskLastProjects(null)).toEqual({});
    expect(parseTrackerTaskLastProjects('{"crane":42,"jira":"/tmp/a"}')).toEqual(
      { jira: "/tmp/a" },
    );
  });

  test("round-trips one source without clearing the other", () => {
    writeTrackerTaskLastProject("crane", "/tmp/platform");
    writeTrackerTaskLastProject("jira", "/tmp/abc");
    expect(readTrackerTaskLastProject("crane")).toBe("/tmp/platform");
    expect(readTrackerTaskLastProject("jira")).toBe("/tmp/abc");
  });

  test("reports nothing for a source that was never used", () => {
    expect(readTrackerTaskLastProject("jira")).toBeNull();
  });
});
