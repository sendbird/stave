import { describe, expect, test } from "bun:test";
import {
  buildEditorHookCandidates,
  buildEditorTargetOptions,
  getScriptEditorRunDisabledReason,
  scriptEditorScopeKey,
} from "../src/components/scripts/scripts-manager-state";
import {
  createEmptyScriptEditorEntry,
  createEmptyScriptEditorState,
  createEmptyScriptEditorTargetEntry,
} from "../src/lib/workspace-scripts/editor";

describe("ScriptsManager scope safety", () => {
  test("keys async loads by scope and physical file", () => {
    expect(
      scriptEditorScopeKey({
        id: "workspace",
        label: "Workspace",
        description: "",
        rootPath: "<workspace>",
        filePath: ".stave/scripts.json",
      }),
    ).toBe("workspace\0<workspace>\0.stave/scripts.json");
    expect(scriptEditorScopeKey(null)).toBe("");
  });

  test("only offers targets and hook entries owned or referenced by the editor file", () => {
    const action = createEmptyScriptEditorEntry("action");
    action.id = "lint";
    action.label = "Lint";
    action.commandsText = "bun run lint";
    action.target = "ci";

    const target = createEmptyScriptEditorTargetEntry();
    target.id = "ci";
    target.label = "CI";

    const state = {
      ...createEmptyScriptEditorState(),
      actions: [action],
      targets: [target],
    };

    expect(buildEditorTargetOptions(state)).toEqual([
      { id: "workspace", label: "Workspace" },
      { id: "project", label: "Project" },
      { id: "ci", label: "CI" },
    ]);
    expect(buildEditorHookCandidates(state)).toEqual([
      {
        scriptId: "lint",
        scriptKind: "action",
        label: "Lint",
        description: "",
      },
    ]);
  });

  test("only runs when the effective source is the selected shared file", () => {
    expect(
      getScriptEditorRunDisabledReason({
        entryId: "lint",
        isDirty: false,
        selectedScopeId: "project",
        origin: { tier: "project", localOverride: false },
      }),
    ).toBeNull();

    expect(
      getScriptEditorRunDisabledReason({
        entryId: "lint",
        isDirty: false,
        selectedScopeId: "project",
        origin: { tier: "workspace", localOverride: false },
      }),
    ).toContain("workspace config");

    expect(
      getScriptEditorRunDisabledReason({
        entryId: "lint",
        isDirty: false,
        selectedScopeId: "project",
        origin: { tier: "project", localOverride: true },
      }),
    ).toContain("local override");

    expect(
      getScriptEditorRunDisabledReason({
        entryId: "lint",
        isDirty: true,
        selectedScopeId: "project",
        origin: { tier: "project", localOverride: false },
      }),
    ).toContain("Save changes first");
  });
});
