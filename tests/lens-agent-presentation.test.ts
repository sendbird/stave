import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  resolveAutomaticLensPresentationPlacement,
  resolveLensAgentActivityKind,
  resolveLensPresentationRequestPolicy,
  selectPendingLensPresentationRequest,
  shouldRequestLensAgentPresentation,
} from "@/lib/lens/lens-agent-presentation";
import {
  defaultSettings,
  normalizeLensAgentPresentationMode,
  normalizePersistedLensSettings,
} from "@/store/app-settings";

describe("Lens agent activity presentation", () => {
  test("classifies only inherently visual or interactive tools", () => {
    expect(resolveLensAgentActivityKind("stave_lens_screenshot")).toBe(
      "visual",
    );
    expect(resolveLensAgentActivityKind("stave_lens_inspect")).toBe("visual");
    expect(resolveLensAgentActivityKind("stave_lens_measure")).toBe("visual");
    expect(resolveLensAgentActivityKind("stave_lens_click")).toBe(
      "interaction",
    );
    expect(resolveLensAgentActivityKind("stave_lens_type")).toBe(
      "interaction",
    );
    expect(resolveLensAgentActivityKind("stave_lens_set_style")).toBe(
      "interaction",
    );
    expect(
      resolveLensAgentActivityKind("stave_lens_fill_saved_account"),
    ).toBe("interaction");
    expect(resolveLensAgentActivityKind("stave_lens_set_appearance")).toBe(
      "visual",
    );
  });

  test("does not classify navigation or read-only diagnostics as presentation triggers", () => {
    for (const toolName of [
      "stave_lens_open_session",
      "stave_lens_close_session",
      "stave_lens_present_session",
      "stave_lens_navigate",
      "stave_lens_list_saved_accounts",
      "stave_lens_create_saved_account",
      "stave_lens_update_saved_account",
      "stave_lens_delete_saved_account",
      "stave_lens_snapshot",
      "stave_lens_get_html",
      "stave_lens_get_text",
      "stave_lens_evaluate",
      "stave_lens_get_console",
      "stave_lens_get_network",
      "stave_lens_download",
      "stave_lens_list_downloads",
      "stave_lens_get_annotations",
      "stave_lens_list_sessions",
      "stave_lens_reload",
    ]) {
      expect(resolveLensAgentActivityKind(toolName)).toBeNull();
    }
  });

  /*
   * The classification table and its call sites live in different programs:
   * `bun run typecheck` covers `src` only, so a tool wired up in
   * `electron/main/browser` with no entry here compiles in every gate CI runs
   * and then silently never presents. That is exactly how
   * `stave_lens_set_appearance` shipped inert. Read the call sites back.
   */
  test("every tool that asks for activity presentation is classified", () => {
    const source = readFileSync(
      path.join(
        import.meta.dir,
        "..",
        "electron",
        "main",
        "browser",
        "browser-tools.ts",
      ),
      "utf8",
    );
    const callSites = [
      ...source.matchAll(
        /requestLensAgentActivityPresentation\(\s*[^,)]+,\s*"([^"]+)"/g,
      ),
    ].map((match) => match[1]);

    expect(callSites.length).toBeGreaterThan(0);
    for (const toolName of callSites) {
      expect(resolveLensAgentActivityKind(toolName)).not.toBeNull();
    }
  });

  test("never re-presents a session already adopted by the UI", () => {
    expect(
      shouldRequestLensAgentPresentation({
        managedByMcp: false,
        toolName: "stave_lens_click",
      }),
    ).toBe(false);
    expect(
      shouldRequestLensAgentPresentation({
        managedByMcp: true,
        toolName: "stave_lens_click",
      }),
    ).toBe(true);
  });

  test("maps the user setting to an automatic placement", () => {
    expect(resolveAutomaticLensPresentationPlacement("split-right")).toBe(
      "split-right",
    );
    expect(resolveAutomaticLensPresentationPlacement("background-tab")).toBe(
      "background-tab",
    );
    expect(
      resolveAutomaticLensPresentationPlacement("agent-decides"),
    ).toBeNull();
  });

  test("keeps automatic activity in its workspace while explicit requests may switch", () => {
    expect(
      resolveLensPresentationRequestPolicy({
        payload: {
          workspaceId: "ws-b",
          lensSessionId: "lens-b",
          requestKind: "agent-activity",
        },
        activeWorkspaceId: "ws-a",
        mode: "split-right",
      }),
    ).toEqual({
      placement: "split-right",
      allowWorkspaceSwitch: false,
      deferUntilWorkspaceActive: true,
    });
    expect(
      resolveLensPresentationRequestPolicy({
        payload: {
          workspaceId: "ws-b",
          lensSessionId: "lens-b",
          requestKind: "explicit",
        },
        activeWorkspaceId: "ws-a",
        mode: "agent-decides",
      }),
    ).toEqual({
      placement: "focus",
      allowWorkspaceSwitch: true,
      deferUntilWorkspaceActive: false,
    });
  });

  test("treats legacy requests as explicit and honors agent-decides only for automatic activity", () => {
    expect(
      resolveLensPresentationRequestPolicy({
        payload: {
          workspaceId: "ws-a",
          lensSessionId: "legacy-lens",
        },
        activeWorkspaceId: "ws-a",
        mode: "agent-decides",
      }),
    ).toEqual({
      placement: "focus",
      allowWorkspaceSwitch: true,
      deferUntilWorkspaceActive: false,
    });
    expect(
      resolveLensPresentationRequestPolicy({
        payload: {
          workspaceId: "ws-a",
          lensSessionId: "automatic-lens",
          requestKind: "agent-activity",
        },
        activeWorkspaceId: "ws-a",
        mode: "agent-decides",
      }),
    ).toBeNull();
  });

  test("never lets an early automatic hint replace a queued explicit request", () => {
    const explicit = {
      workspaceId: "ws-a",
      lensSessionId: "lens-a",
      requestKind: "explicit" as const,
      reason: "Sign in",
    };
    const automatic = {
      workspaceId: "ws-a",
      lensSessionId: "lens-a",
      requestKind: "agent-activity" as const,
      activityKind: "interaction" as const,
    };

    expect(
      selectPendingLensPresentationRequest(explicit, automatic),
    ).toBe(explicit);
    expect(
      selectPendingLensPresentationRequest(automatic, explicit),
    ).toBe(explicit);
    expect(
      selectPendingLensPresentationRequest(undefined, automatic),
    ).toBe(automatic);
    expect(
      selectPendingLensPresentationRequest(
        { workspaceId: "ws-a", lensSessionId: "lens-a" },
        automatic,
      ).requestKind,
    ).toBeUndefined();
  });

  test("normalizes missing and invalid settings to the visible split default", () => {
    expect(defaultSettings.lensAgentPresentationMode).toBe("split-right");
    expect(normalizeLensAgentPresentationMode(undefined)).toBe("split-right");
    expect(normalizeLensAgentPresentationMode("invalid")).toBe("split-right");
    expect(normalizeLensAgentPresentationMode("background-tab")).toBe(
      "background-tab",
    );
    expect(normalizeLensAgentPresentationMode("agent-decides")).toBe(
      "agent-decides",
    );
    expect(
      normalizePersistedLensSettings({}).lensAgentPresentationMode,
    ).toBe("split-right");
    expect(
      normalizePersistedLensSettings({
        lensAgentPresentationMode: "background-tab",
      }).lensAgentPresentationMode,
    ).toBe("background-tab");
  });
});
