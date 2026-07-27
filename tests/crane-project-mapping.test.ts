import { describe, expect, test } from "bun:test";
import {
  findMappedCraneTeamRuntime,
  findMappedStaveProjectPath,
  getCraneTeamKey,
  updateCraneTeamProjectMapping,
} from "@/lib/crane-connector/project-mapping";
import {
  CraneConnectorSettingsSchema,
  DEFAULT_CRANE_CONNECTOR_SETTINGS,
  normalizeCraneConnectorSettings,
} from "@/lib/crane-connector/types";

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

  test("remembers and reads back the team's model and effort", () => {
    const mappings = updateCraneTeamProjectMapping({
      mappings: [],
      teamKey: "ATL",
      staveProjectPath: "/tmp/atelier",
      runtime: {
        provider: "codex",
        model: "gpt-5.6",
        effort: "xhigh",
        fastMode: false,
      },
    });

    expect(mappings[0]).toEqual({
      craneTeamKey: "ATL",
      staveProjectPath: "/tmp/atelier",
      runtime: {
        provider: "codex",
        model: "gpt-5.6",
        effort: "xhigh",
        fastMode: false,
      },
    });
    expect(
      findMappedCraneTeamRuntime({ issueKey: "ATL-2", mappings }),
    ).toMatchObject({ model: "gpt-5.6", effort: "xhigh" });
    expect(
      findMappedCraneTeamRuntime({ issueKey: "OTHER-2", mappings }),
    ).toBeNull();
    expect(
      findMappedCraneTeamRuntime({ issueKey: "not-an-issue", mappings }),
    ).toBeNull();
  });

  test("drops a stale remembered runtime when the mapping is rewritten without one", () => {
    const remembered = updateCraneTeamProjectMapping({
      mappings: [],
      teamKey: "ATL",
      staveProjectPath: "/tmp/atelier",
      runtime: {
        provider: "codex",
        model: "gpt-5.6",
        effort: "xhigh",
      },
    });

    expect(
      updateCraneTeamProjectMapping({
        mappings: remembered,
        teamKey: "ATL",
        staveProjectPath: "/tmp/atelier",
      }),
    ).toEqual([
      {
        craneTeamKey: "ATL",
        staveProjectPath: "/tmp/atelier",
      },
    ]);
  });

  test("drops only the unreadable mapping instead of the whole connector config", () => {
    // A mapping written by a newer build (or corrupted on disk) must not take
    // the pairing base URL and enabled flag down with it.
    const normalized = normalizeCraneConnectorSettings({
      enabled: true,
      baseUrl: "https://crane.internal.example.com",
      pollIntervalSeconds: 30,
      projectMappings: [
        { craneTeamKey: "ATL", staveProjectPath: "/tmp/atelier" },
        { craneTeamKey: "OPS", staveProjectPath: "/tmp/ops", futureField: 1 },
      ],
    });

    expect(normalized).toMatchObject({
      enabled: true,
      baseUrl: "https://crane.internal.example.com",
      pollIntervalSeconds: 30,
    });
    expect(normalized.projectMappings).toEqual([
      { craneTeamKey: "ATL", staveProjectPath: "/tmp/atelier" },
    ]);
  });

  test("keeps legacy mappings without a remembered runtime valid", () => {
    const legacy = [{ craneTeamKey: "ATL", staveProjectPath: "/tmp/atelier" }];
    expect(
      CraneConnectorSettingsSchema.safeParse({
        ...DEFAULT_CRANE_CONNECTOR_SETTINGS,
        projectMappings: legacy,
      }).success,
    ).toBe(true);
    expect(
      findMappedCraneTeamRuntime({ issueKey: "ATL-2", mappings: legacy }),
    ).toBeNull();
  });
});
