import { describe, expect, test } from "bun:test";
import {
  buildScriptConfigFromEditorState,
  buildScriptEditorState,
  createEmptyScriptEditorEntry,
  mergeScriptConfigIntoRaw,
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
  test("preserves untouched target definitions and extra metadata", () => {
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
      config: {
        version: 2,
        actions: {
          bootstrap: {
            commands: ["bun install"],
            target: "workspace",
          },
        },
      },
    });

    expect(merged).toEqual({
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
});

describe("validateScriptEditorState", () => {
  test("reports missing ids and invalid timeouts", () => {
    const entry = createEmptyScriptEditorEntry("action");
    entry.timeoutMs = "0";

    expect(validateScriptEditorState({
      actions: [entry],
      services: [],
      hooks: {},
    })).toEqual([
      'actions: "action 1" is missing an id.',
      'actions: "action 1" needs at least one command.',
      'actions: "action 1" has an invalid timeout.',
    ]);
  });
});
