import { describe, expect, test } from "bun:test";
import {
  appendServiceEntryToRawConfig,
  buildScriptConfigFromEditorState,
  buildScriptEditorState,
  collectScriptIdsFromRaw,
  createEmptyScriptEditorEntry,
  duplicateScriptEditorEntry,
  entryHasAdvancedValues,
  mergeScriptConfigIntoRaw,
  shouldAutoSyncScriptId,
  slugifyScriptId,
  validateScriptEditorEntry,
  validateScriptEditorState,
} from "../src/lib/workspace-scripts/editor";
import type {
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptsConfig,
} from "../src/lib/workspace-scripts/types";

describe("buildScriptEditorState", () => {
  test("hydrates entries and hook links from shared config", () => {
    const config: WorkspaceScriptsConfig = {
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["bun install"],
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          restartOnRun: false,
          orbit: {
            enabled: true,
            name: "stave",
            noTls: true,
            proxyPort: 1355,
          },
        },
      },
      hooks: {
        "task.created": ["bootstrap"],
        "pr.beforeOpen": [{ ref: "app", blocking: false }],
      },
    };

    const editorState = buildScriptEditorState({ config });
    expect(editorState.actions[0]).toMatchObject({
      id: "bootstrap",
      label: "Bootstrap",
      commandsText: "bun install",
      enabled: true,
    });
    expect(editorState.services[0]).toMatchObject({
      id: "app",
      restartOnRun: false,
      commandsText: "bun run dev",
      orbitEnabled: true,
      orbitName: "stave",
      orbitNoTls: true,
      orbitProxyPort: "1355",
    });
    expect(editorState.hooks["task.created"]).toEqual([
      {
        scriptId: "bootstrap",
        scriptKind: "action",
        blocking: true,
      },
    ]);
    expect(editorState.hooks["pr.beforeOpen"]).toEqual([
      {
        scriptId: "app",
        scriptKind: "service",
        blocking: false,
      },
    ]);
  });

  test("uses resolved config to infer hook kind when needed", () => {
    const config: WorkspaceScriptsConfig = {
      version: 2,
      hooks: {
        "pr.beforeOpen": ["bootstrap"],
      },
    };
    const resolvedConfig: ResolvedWorkspaceScriptsConfig = {
      actions: [
        {
          id: "bootstrap",
          kind: "action",
          label: "Bootstrap",
          description: "Prepare the workspace.",
          commands: ["bun install"],
          targetId: "workspace",
          target: {
            id: "workspace",
            label: "Workspace",
            cwd: "workspace",
            env: {},
          },
          source: "script",
        },
      ],
      services: [],
      hooks: {},
      targets: {
        workspace: {
          id: "workspace",
          label: "Workspace",
          cwd: "workspace",
          env: {},
        },
      },
      legacyPhases: {
        setup: [],
        run: [],
        teardown: [],
      },
    };

    const editorState = buildScriptEditorState({ config, resolvedConfig });
    expect(editorState.hooks["pr.beforeOpen"]).toEqual([
      {
        scriptId: "bootstrap",
        scriptKind: "action",
        blocking: true,
      },
    ]);
  });
});

describe("buildScriptConfigFromEditorState", () => {
  test("serializes actions, services, and hooks into config JSON shape", () => {
    const action = createEmptyScriptEditorEntry("action");
    action.id = "bootstrap";
    action.label = "Bootstrap";
    action.description = "Prepare the workspace.";
    action.commandsText = "bun install\nbun run db:prepare";

    const service = createEmptyScriptEditorEntry("service");
    service.id = "app";
    service.target = "workspace";
    service.commandsText = "bun run dev";
    service.restartOnRun = false;
    service.orbitEnabled = true;
    service.orbitName = "Stave Desktop";
    service.orbitNoTls = true;
    service.orbitProxyPort = "1355";

    const config = buildScriptConfigFromEditorState({
      actions: [action],
      services: [service],
      hooks: {
        "task.created": [
          {
            scriptId: "bootstrap",
            scriptKind: "action",
            blocking: true,
          },
        ],
        "pr.beforeOpen": [
          {
            scriptId: "app",
            scriptKind: "service",
            blocking: false,
          },
        ],
      },
      targets: [],
    });

    expect(config).toEqual({
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          description: "Prepare the workspace.",
          commands: ["bun install", "bun run db:prepare"],
          target: "workspace",
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          target: "workspace",
          restartOnRun: false,
          orbit: {
            enabled: true,
            name: "Stave Desktop",
            noTls: true,
            proxyPort: 1355,
          },
        },
      },
      hooks: {
        "task.created": [
          {
            ref: "bootstrap",
            kind: "action",
          },
        ],
        "pr.beforeOpen": [
          {
            ref: "app",
            kind: "service",
            blocking: false,
          },
        ],
      },
    });
  });
});

describe("mergeScriptConfigIntoRaw", () => {
  test("preserves top-level metadata but drops per-target unknown keys", () => {
    const rawConfig = {
      version: 2,
      notes: {
        owner: "team-desktop",
      },
      targets: {
        ci: {
          label: "CI Runtime",
          cwd: "project",
          env: {
            CI: "1",
          },
          // Unknown per-target key — dropped now that targets are editor-managed.
          legacyOnly: "keep-me?",
        },
      },
      actions: {
        old: {
          commands: ["echo old"],
        },
      },
    };

    const merged = mergeScriptConfigIntoRaw({
      rawConfig,
      // Targets are now round-tripped through the editor (known keys only).
      config: {
        version: 2,
        actions: {
          bootstrap: {
            commands: ["bun install"],
            target: "workspace",
          },
        },
        targets: {
          ci: {
            label: "CI Runtime",
            cwd: "project",
            env: {
              CI: "1",
            },
          },
        },
      },
    });

    expect(merged).toEqual({
      version: 2,
      // Top-level unknown keys survive.
      notes: {
        owner: "team-desktop",
      },
      targets: {
        ci: {
          label: "CI Runtime",
          cwd: "project",
          env: {
            CI: "1",
          },
        },
      },
      actions: {
        bootstrap: {
          commands: ["bun install"],
          target: "workspace",
        },
      },
    });
  });

  test("removes the raw targets block when the editor has no targets", () => {
    const merged = mergeScriptConfigIntoRaw({
      rawConfig: {
        version: 2,
        targets: { ci: { cwd: "project" } },
      },
      config: { version: 2 },
    });
    expect(merged).toEqual({ version: 2 });
  });
});

describe("targets round-trip", () => {
  test("hydrates and serializes targets, dropping empty env/shell", () => {
    const config: WorkspaceScriptsConfig = {
      version: 2,
      targets: {
        api: {
          label: "API",
          cwd: "project",
          env: { PORT: "3000" },
          shell: "/bin/zsh",
        },
        bare: {
          cwd: "workspace",
        },
      },
    };

    const state = buildScriptEditorState({ config });
    expect(state.targets).toEqual([
      {
        id: "api",
        label: "API",
        cwd: "project",
        shell: "/bin/zsh",
        envRows: [{ key: "PORT", value: "3000" }],
      },
      {
        id: "bare",
        label: "",
        cwd: "workspace",
        shell: "",
        envRows: [],
      },
    ]);

    const roundTripped = buildScriptConfigFromEditorState(state);
    expect(roundTripped.targets).toEqual({
      api: {
        label: "API",
        cwd: "project",
        env: { PORT: "3000" },
        shell: "/bin/zsh",
      },
      bare: {
        cwd: "workspace",
      },
    });
  });

  test("skips targets with a blank id and blank env keys", () => {
    const config = buildScriptConfigFromEditorState({
      actions: [],
      services: [],
      hooks: {},
      targets: [
        {
          id: "  ",
          label: "ignored",
          cwd: "workspace",
          shell: "",
          envRows: [],
        },
        {
          id: "api",
          label: "",
          cwd: "workspace",
          shell: "",
          envRows: [
            { key: "  ", value: "dropme" },
            { key: "OK", value: "1" },
          ],
        },
      ],
    });
    expect(config.targets).toEqual({
      api: {
        cwd: "workspace",
        env: { OK: "1" },
      },
    });
  });
});

describe("duplicateScriptEditorEntry", () => {
  test("assigns a unique -copy id and (copy) label", () => {
    const entry = createEmptyScriptEditorEntry("action");
    entry.id = "lint";
    entry.label = "Lint";
    entry.commandsText = "eslint .";

    const first = duplicateScriptEditorEntry(entry, ["lint"]);
    expect(first).toMatchObject({
      id: "lint-copy",
      label: "Lint (copy)",
      commandsText: "eslint .",
    });

    const second = duplicateScriptEditorEntry(entry, ["lint", "lint-copy"]);
    expect(second.id).toBe("lint-copy-2");
  });

  test("falls back to a script base when the source has no id", () => {
    const entry = createEmptyScriptEditorEntry("service");
    const dup = duplicateScriptEditorEntry(entry, []);
    expect(dup.id).toBe("script-copy");
    expect(dup.label).toBe("script (copy)");
  });
});

describe("validateScriptEditorEntry", () => {
  test("reports per-field issues for an empty action", () => {
    const entry = createEmptyScriptEditorEntry("action");
    entry.timeoutMs = "0";
    expect(validateScriptEditorEntry({ entry, kind: "action" })).toEqual({
      id: "ID is required.",
      commands: "Add at least one command.",
      timeoutMs: "Timeout must be a positive integer.",
    });
  });

  test("flags duplicate ids and Orbit target constraints", () => {
    const entry = createEmptyScriptEditorEntry("service");
    entry.id = "dev";
    entry.commandsText = "bun run dev";
    entry.orbitEnabled = true;
    entry.target = "project";
    entry.orbitProxyPort = "-1";

    expect(
      validateScriptEditorEntry({ entry, kind: "service", duplicateId: true }),
    ).toEqual({
      id: 'Duplicate ID "dev".',
      target: "Orbit services must target the workspace.",
      orbitProxyPort: "Proxy port must be a positive integer.",
    });
  });
});

describe("slugifyScriptId", () => {
  test("derives a stable id from a label and suffixes collisions", () => {
    expect(slugifyScriptId("Dev Server", [])).toBe("dev-server");
    expect(slugifyScriptId("Dev Server", ["dev-server"])).toBe("dev-server-2");
    expect(slugifyScriptId("Dev Server", ["dev-server", "dev-server-2"])).toBe(
      "dev-server-3",
    );
    expect(slugifyScriptId("   ", [])).toBe("process");
  });

  test("follows the label until the id is edited independently", () => {
    expect(
      shouldAutoSyncScriptId({
        currentId: "",
        currentLabel: "",
        otherIds: [],
      }),
    ).toBe(true);
    expect(
      shouldAutoSyncScriptId({
        currentId: "dev-server",
        currentLabel: "Dev Server",
        otherIds: [],
      }),
    ).toBe(true);
    expect(
      shouldAutoSyncScriptId({
        currentId: "api",
        currentLabel: "Dev Server",
        otherIds: [],
      }),
    ).toBe(false);
  });
});

describe("appendServiceEntryToRawConfig", () => {
  test("appends a workspace service without rewriting other keys", () => {
    const next = appendServiceEntryToRawConfig({
      rawConfig: {
        version: 2,
        actions: { lint: { commands: ["bun run lint"] } },
      },
      id: "dev-server",
      label: "Dev Server",
      commands: ["bun run dev"],
    });
    expect(next).toMatchObject({
      version: 2,
      actions: { lint: { commands: ["bun run lint"] } },
      services: {
        "dev-server": {
          label: "Dev Server",
          commands: ["bun run dev"],
          target: "workspace",
        },
      },
    });
    expect(collectScriptIdsFromRaw(next)).toEqual(["lint", "dev-server"]);
  });
});

describe("entryHasAdvancedValues", () => {
  test("treats workspace defaults as basic", () => {
    const entry = createEmptyScriptEditorEntry("service");
    expect(entryHasAdvancedValues(entry, "service")).toBe(false);
    entry.description = "Watches the app";
    expect(entryHasAdvancedValues(entry, "service")).toBe(true);
  });
});

describe("validateScriptEditorState", () => {
  test("reports missing ids and invalid timeouts", () => {
    const entry = createEmptyScriptEditorEntry("action");
    entry.timeoutMs = "0";

    expect(
      validateScriptEditorState({
        actions: [entry],
        services: [],
        hooks: {},
        targets: [],
      }),
    ).toEqual([
      'actions: "action 1" is missing an id.',
      'actions: "action 1" needs at least one command.',
      'actions: "action 1" has an invalid timeout.',
    ]);
  });
});
