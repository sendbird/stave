import { describe, expect, test } from "bun:test";
import { buildZenProjectList } from "@/components/layout/zen-project-sidebar.utils";

describe("buildZenProjectList", () => {
  test("keeps the current project at the top and de-duplicates it from recents", () => {
    expect(buildZenProjectList({
      currentProjectName: "Stave",
      currentProjectPath: "/tmp/stave",
      recentProjects: [
        { projectName: "Another", projectPath: "/tmp/another" },
        { projectName: "Stave (old)", projectPath: "/tmp/stave" },
      ],
    })).toEqual([
      {
        projectName: "Stave",
        projectPath: "/tmp/stave",
        isCurrent: true,
      },
      {
        projectName: "Another",
        projectPath: "/tmp/another",
        isCurrent: false,
      },
    ]);
  });

  test("falls back to the path basename when a project has no display name", () => {
    expect(buildZenProjectList({
      currentProjectName: null,
      currentProjectPath: null,
      recentProjects: [
        { projectName: "", projectPath: "/tmp/actionbook-core" },
      ],
    })).toEqual([
      {
        projectName: "actionbook-core",
        projectPath: "/tmp/actionbook-core",
        isCurrent: false,
      },
    ]);
  });
});
