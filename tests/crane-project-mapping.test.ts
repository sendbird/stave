import { describe, expect, test } from "bun:test";
import {
  findMappedStaveProjectPath,
  getCraneTeamKey,
  updateCraneTeamProjectMapping,
} from "@/lib/crane-connector/project-mapping";

describe("Crane project mapping", () => {
  test("derives a stable team key from the issue key", () => {
    expect(getCraneTeamKey("ATL-42")).toBe("ATL");
    expect(getCraneTeamKey("platform-core-7")).toBe("PLATFORM-CORE");
    expect(getCraneTeamKey("not-an-issue")).toBeNull();
  });

  test("uses only mappings that still point to a registered project", () => {
    const mappings = [
      {
        craneTeamKey: "ATL",
        staveProjectPath: "/tmp/atelier",
      },
    ];

    expect(
      findMappedStaveProjectPath({
        issueKey: "ATL-42",
        mappings,
        registeredProjectPaths: ["/tmp/atelier"],
      }),
    ).toBe("/tmp/atelier");
    expect(
      findMappedStaveProjectPath({
        issueKey: "ATL-42",
        mappings,
        registeredProjectPaths: ["/tmp/stave"],
      }),
    ).toBeNull();
  });

  test("replaces and removes a local team mapping without touching other routes", () => {
    const existing = [
      {
        craneTeamKey: "ATL",
        staveProjectPath: "/tmp/old-atelier",
      },
      {
        craneProjectId: "project-stave",
        staveProjectPath: "/tmp/stave",
      },
    ];
    const updated = updateCraneTeamProjectMapping({
      mappings: existing,
      teamKey: "atl",
      staveProjectPath: "/tmp/atelier",
    });

    expect(updated).toEqual([
      {
        craneTeamKey: "ATL",
        staveProjectPath: "/tmp/atelier",
      },
      {
        craneProjectId: "project-stave",
        staveProjectPath: "/tmp/stave",
      },
    ]);
    expect(
      updateCraneTeamProjectMapping({
        mappings: updated,
        teamKey: "ATL",
        staveProjectPath: null,
      }),
    ).toEqual([
      {
        craneProjectId: "project-stave",
        staveProjectPath: "/tmp/stave",
      },
    ]);
  });
});
