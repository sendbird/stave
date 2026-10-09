import { afterEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { defaultSettings } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import {
  applyProjectSettingsOverrides,
  effectiveSetting,
  isProjectOverridableSettingKey,
  normalizeProjectSettingsOverrides,
  PROJECT_OVERRIDABLE_SETTING_KEYS,
  resolveEffectiveSettings,
  resolveProjectSettingsOverrides,
  updateProjectSettingsOverrides,
} from "@/store/project-settings-overrides";
import {
  resolvePromptDraftRuntimeState,
  resolveTurnModelForSend,
} from "@/store/prompt-draft-runtime";
import {
  captureCurrentRepositoryState,
  cloneRecentRepositoryState,
  normalizeRecentRepositoryStates,
  type RecentRepositoryState,
} from "@/store/repository.utils";

const PROJECT_PATH = "/tmp/stave-scope/alpha";
const OTHER_PATH = "/tmp/stave-scope/beta";

function repository(
  repositoryPath: string,
  extra: Partial<RecentRepositoryState> = {},
): RecentRepositoryState {
  return {
    repositoryPath,
    repositoryName: repositoryPath.split("/").at(-1) ?? repositoryPath,
    lastOpenedAt: "2026-10-01T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: [],
    activeWorkspaceId: "",
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
    ...extra,
  };
}

describe("project settings allow-list", () => {
  test("names only model, effort and permission posture keys", () => {
    expect(PROJECT_OVERRIDABLE_SETTING_KEYS).toContain("modelClaude");
    expect(PROJECT_OVERRIDABLE_SETTING_KEYS).toContain("codexReasoningEffort");
    expect(PROJECT_OVERRIDABLE_SETTING_KEYS).toContain("claudePermissionMode");
    expect(PROJECT_OVERRIDABLE_SETTING_KEYS).toContain("kiroApprovalMode");
    expect(isProjectOverridableSettingKey("codexWebSearch")).toBe(false);
    expect(isProjectOverridableSettingKey("claudeBinaryPath")).toBe(false);
    expect(isProjectOverridableSettingKey("themeMode")).toBe(false);
  });

  test("refuses keys outside the allow-list and invalid values", () => {
    const result = updateProjectSettingsOverrides({
      overrides: undefined,
      patch: {
        modelClaude: "claude-opus-4-8",
        codexWebSearch: "live",
        chatStreamingEnabled: false,
        claudePermissionMode: "yolo",
      },
    });

    expect(result.overrides).toEqual({ modelClaude: "claude-opus-4-8" });
    expect(result.refusedKeys.sort()).toEqual(
      ["chatStreamingEnabled", "claudePermissionMode", "codexWebSearch"].sort(),
    );
  });

  test("drops non-listed keys from a stored blob", () => {
    expect(
      normalizeProjectSettingsOverrides({
        codexApprovalPolicy: "on-request",
        providerTimeoutMs: 10,
        claudeSandboxEnabled: "yes",
      }),
    ).toEqual({ codexApprovalPolicy: "on-request" });
    expect(normalizeProjectSettingsOverrides({ themeMode: "light" })).toBeUndefined();
    expect(normalizeProjectSettingsOverrides(["modelClaude"])).toBeUndefined();
  });

  test("keeps a clean blob as the same object", () => {
    const clean = { modelCodex: "gpt-5.6", codexNetworkAccess: false };
    expect(normalizeProjectSettingsOverrides(clean)).toBe(clean);
  });
});

describe("effective settings resolver", () => {
  const recentRepositories = [
    repository(PROJECT_PATH, {
      settingsOverrides: {
        modelClaude: "claude-haiku-4-6",
        claudePermissionMode: "default",
      },
    }),
    repository(OTHER_PATH),
  ];
  const source = { settings: defaultSettings, recentRepositories };

  test("a project override wins over the global value", () => {
    expect(effectiveSetting("modelClaude", PROJECT_PATH, source)).toBe(
      "claude-haiku-4-6",
    );
    expect(effectiveSetting("claudePermissionMode", PROJECT_PATH, source)).toBe(
      "default",
    );
  });

  test("an explicit task choice wins over the project override", () => {
    expect(
      effectiveSetting("claudePermissionMode", PROJECT_PATH, {
        ...source,
        taskChoice: "acceptEdits",
      }),
    ).toBe("acceptEdits");
  });

  test("falls back to the global value for other projects and keys", () => {
    expect(effectiveSetting("modelClaude", OTHER_PATH, source)).toBe(
      defaultSettings.modelClaude,
    );
    expect(effectiveSetting("modelClaude", null, source)).toBe(
      defaultSettings.modelClaude,
    );
    expect(effectiveSetting("claudeEffort", PROJECT_PATH, source)).toBe(
      defaultSettings.claudeEffort,
    );
  });

  test("never applies a smuggled non-listed key", () => {
    const smuggled = [
      repository(PROJECT_PATH, {
        settingsOverrides: { codexWebSearch: "live" } as never,
      }),
    ];
    expect(
      effectiveSetting("codexWebSearch", PROJECT_PATH, {
        settings: defaultSettings,
        recentRepositories: smuggled,
      }),
    ).toBe(defaultSettings.codexWebSearch);
    expect(
      resolveEffectiveSettings({
        settings: defaultSettings,
        recentRepositories: smuggled,
        repositoryPath: PROJECT_PATH,
      }).codexWebSearch,
    ).toBe(defaultSettings.codexWebSearch);
  });

  test("turn builders keep task choice > project > global", () => {
    const effective = resolveEffectiveSettings({
      ...source,
      repositoryPath: PROJECT_PATH,
    });

    expect(
      resolveTurnModelForSend({ providerId: "claude-code", settings: effective }),
    ).toBe("claude-haiku-4-6");
    expect(
      resolveTurnModelForSend({
        providerId: "claude-code",
        runtimeOverrides: { model: "claude-opus-4-8", modelProviderId: "claude-code" },
        settings: effective,
      }),
    ).toBe("claude-opus-4-8");
    expect(
      resolvePromptDraftRuntimeState({ fallback: effective }).claudePermissionMode,
    ).toBe("default");
    expect(
      resolvePromptDraftRuntimeState({
        promptDraft: { runtimeOverrides: { claudePermissionMode: "dontAsk" } },
        fallback: effective,
      }).claudePermissionMode,
    ).toBe("dontAsk");
  });

  test("returns stable objects for selectors", () => {
    expect(applyProjectSettingsOverrides(defaultSettings, undefined)).toBe(
      defaultSettings,
    );
    const first = resolveEffectiveSettings({ ...source, repositoryPath: PROJECT_PATH });
    const second = resolveEffectiveSettings({
      settings: defaultSettings,
      recentRepositories: recentRepositories.map(cloneRecentRepositoryState),
      repositoryPath: PROJECT_PATH,
    });
    expect(second).toBe(first);
  });
});

describe("clearing an override", () => {
  test("clears one key and drops the blob once empty", () => {
    const partial = updateProjectSettingsOverrides({
      overrides: { modelKiro: "auto", kiroApprovalMode: "manual" },
      clearKeys: ["kiroApprovalMode"],
    });
    expect(partial.overrides).toEqual({ modelKiro: "auto" });

    const empty = updateProjectSettingsOverrides({
      overrides: partial.overrides,
      clearKeys: ["modelKiro"],
    });
    expect(empty.overrides).toBeUndefined();
    expect(empty.changed).toBe(true);
  });

  test("reports no change for a no-op patch", () => {
    const overrides = { cursorEffort: "high" as const };
    const result = updateProjectSettingsOverrides({
      overrides,
      patch: { cursorEffort: "high" },
    });
    expect(result.changed).toBe(false);
    expect(result.overrides).toBe(overrides);
  });
});

describe("persistence with the repository state", () => {
  test("round-trips through the persisted JSON and normalization", () => {
    const saved = JSON.parse(
      JSON.stringify([
        repository(PROJECT_PATH, {
          settingsOverrides: {
            codexFileAccess: "read-only",
            codexApprovalPolicy: "on-request",
          },
        }),
      ]),
    );
    const [restored] = normalizeRecentRepositoryStates({ repositories: saved });
    expect(restored?.settingsOverrides).toEqual({
      codexFileAccess: "read-only",
      codexApprovalPolicy: "on-request",
    });
    expect(cloneRecentRepositoryState(restored!).settingsOverrides).toEqual(
      restored!.settingsOverrides,
    );
  });

  test("survives recapturing the open repository", () => {
    const captured = captureCurrentRepositoryState({
      recentRepositories: [
        repository(PROJECT_PATH, { settingsOverrides: { modelCodex: "gpt-5.6" } }),
      ],
      repositoryPath: PROJECT_PATH,
      repositoryName: "alpha",
      defaultBranch: "main",
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
    });
    expect(
      resolveProjectSettingsOverrides({
        repositoryPath: PROJECT_PATH,
        recentRepositories: captured,
      }),
    ).toEqual({ modelCodex: "gpt-5.6" });
  });

  test("drops an invalid stored blob instead of carrying it", () => {
    const [restored] = normalizeRecentRepositoryStates({
      repositories: [
        repository(PROJECT_PATH, { settingsOverrides: { themeMode: "dark" } as never }),
      ],
    });
    expect(restored && "settingsOverrides" in restored).toBe(false);
  });
});

describe("store action", () => {
  const noopStorage = createJSONStorage(() => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }));
  (
    useAppStore as typeof useAppStore & {
      persist?: { setOptions: (options: { storage: typeof noopStorage }) => void };
    }
  ).persist?.setOptions({ storage: noopStorage });
  const initialState = useAppStore.getState();

  afterEach(() => {
    useAppStore.setState(initialState, true);
  });

  test("writes, refuses and clears overrides on the repository entry", () => {
    useAppStore.setState({
      repositoryPath: null,
      recentRepositories: [repository(PROJECT_PATH), repository(OTHER_PATH)],
    });

    const { refusedKeys } = useAppStore.getState().updateProjectSettingsOverrides({
      repositoryPath: PROJECT_PATH,
      patch: {
        claudeEffort: "high",
        ...({ trustedTools: ["Bash"] } as object),
      },
    });
    expect(refusedKeys).toEqual(["trustedTools"]);

    const written = useAppStore.getState();
    expect(
      resolveProjectSettingsOverrides({
        repositoryPath: PROJECT_PATH,
        recentRepositories: written.recentRepositories,
      }),
    ).toEqual({ claudeEffort: "high" });
    expect(effectiveSetting("claudeEffort", PROJECT_PATH, written)).toBe("high");
    expect(effectiveSetting("claudeEffort", OTHER_PATH, written)).toBe(
      written.settings.claudeEffort,
    );
    expect(written.settings.trustedTools).toEqual(initialState.settings.trustedTools);

    useAppStore.getState().updateProjectSettingsOverrides({
      repositoryPath: PROJECT_PATH,
      clearKeys: ["claudeEffort"],
    });
    const cleared = useAppStore
      .getState()
      .recentRepositories.find((entry) => entry.repositoryPath === PROJECT_PATH);
    expect(cleared && "settingsOverrides" in cleared).toBe(false);
  });

  test("prunes overrides with the removed repository", async () => {
    useAppStore.setState({
      repositoryPath: null,
      recentRepositories: [
        repository(PROJECT_PATH, { settingsOverrides: { modelClaude: "claude-haiku-4-6" } }),
        repository(OTHER_PATH, { settingsOverrides: { modelCodex: "gpt-5.6" } }),
      ],
    });

    // Removal also closes terminals and notifications through `window.api`;
    // a bridge-less window keeps those steps no-ops here.
    const globalWithWindow = globalThis as { window?: unknown };
    const hadWindow = "window" in globalWithWindow;
    if (!hadWindow) {
      globalWithWindow.window = {};
    }
    try {
      await useAppStore.getState().removeRepositoryFromList({ repositoryPath: PROJECT_PATH });
    } finally {
      if (!hadWindow) {
        delete globalWithWindow.window;
      }
    }

    const state = useAppStore.getState();
    expect(
      resolveProjectSettingsOverrides({
        repositoryPath: PROJECT_PATH,
        recentRepositories: state.recentRepositories,
      }),
    ).toBeUndefined();
    expect(
      resolveProjectSettingsOverrides({
        repositoryPath: OTHER_PATH,
        recentRepositories: state.recentRepositories,
      }),
    ).toEqual({ modelCodex: "gpt-5.6" });
  });
});
