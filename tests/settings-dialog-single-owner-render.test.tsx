import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Settings values that used to have several entry points now have one owner:
 * pre-PR review → Background AI, inline completion on/off → Editor (model in
 * Background AI), Jira on/off → Integrations. The old locations keep at most a
 * pointer, and the owner's switch shows the value the runtime actually uses.
 */

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
    api: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function store() {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  return useAppStore;
}

function render<P extends object>(component: ComponentType<P>, props: P) {
  return renderToStaticMarkup(createElement(component, props));
}

const navigate = () => {};

describe("lane enablement helpers", () => {
  test("pre-PR review and inline completion are on only when both keys are on", async () => {
    const { selectAuxLaneEnabled } = await import(
      "../src/components/layout/settings-dialog-aux-lane-enablement"
    );
    const settings = (await store()).getState().settings;
    const on = { ...settings.auxiliaryInferencePolicy.prePrReview, enabled: true };
    const policy = {
      ...settings.auxiliaryInferencePolicy,
      prePrReview: on,
      inlineCompletion: { ...on },
    };
    expect(
      selectAuxLaneEnabled(
        { auxiliaryInferencePolicy: policy, prePrReviewEnabled: false, editorAiCompletions: true },
        "prePrReview",
      ),
    ).toBe(false);
    expect(
      selectAuxLaneEnabled(
        { auxiliaryInferencePolicy: policy, prePrReviewEnabled: true, editorAiCompletions: false },
        "inlineCompletion",
      ),
    ).toBe(false);
    expect(
      selectAuxLaneEnabled(
        { auxiliaryInferencePolicy: policy, prePrReviewEnabled: true, editorAiCompletions: true },
        "prePrReview",
      ),
    ).toBe(true);
  });

  test("one switch writes every key that gates the lane", async () => {
    const { buildAuxLaneEnablementPatch } = await import(
      "../src/components/layout/settings-dialog-aux-lane-enablement"
    );
    const settings = (await store()).getState().settings;
    const prePr = buildAuxLaneEnablementPatch({ settings, lane: "prePrReview", enabled: true });
    expect(prePr.prePrReviewEnabled).toBe(true);
    expect(prePr.auxiliaryInferencePolicy?.prePrReview.enabled).toBe(true);
    expect(prePr).not.toHaveProperty("editorAiCompletions");

    const inline = buildAuxLaneEnablementPatch({ settings, lane: "inlineCompletion", enabled: true });
    expect(inline.editorAiCompletions).toBe(true);
    expect(inline.auxiliaryInferencePolicy?.inlineCompletion.enabled).toBe(true);
    // Other lanes are carried through untouched.
    expect(inline.auxiliaryInferencePolicy?.turnSummary).toEqual(
      settings.auxiliaryInferencePolicy.turnSummary,
    );

    const turnSummary = buildAuxLaneEnablementPatch({ settings, lane: "turnSummary", enabled: false });
    expect(Object.keys(turnSummary)).toEqual(["auxiliaryInferencePolicy"]);
  });
});

describe("Prompts no longer owns pre-PR review", () => {
  test("shows a pointer to Background AI instead of the switch and provider", async () => {
    await store();
    const { PromptsSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-prompts-section"
    );
    const html = render(PromptsSection, { onNavigateSection: navigate });
    expect(html).toContain("Pre-PR Review");
    expect(html).toContain("Open Background AI");
    expect(html).not.toContain("Review Before Opening PR");
    expect(html).not.toContain("Review Provider");
    // The prompt texts stay editable here.
    expect(html).toContain("Completion System Prompt");
    expect(html).toContain("Summary Prompt");
  });
});

describe("Editor owns inline completion on/off", () => {
  test("renders the switch and a pointer to Background AI for the model", async () => {
    await store();
    const { EditorSection } = await import(
      "../src/components/layout/settings-sections/settings-dialog-editor-section"
    );
    const html = render(EditorSection, { onNavigateSection: navigate });
    expect(html).toContain("Enable AI Completions");
    expect(html).toContain("Completion model");
    expect(html).toContain("Open Background AI");
  });

  test("Background AI links to Editor instead of rendering a second switch", async () => {
    await store();
    const { SettingsAuxiliaryInferenceSection } = await import(
      "../src/components/layout/settings-dialog-auxiliary-inference-section"
    );
    const html = render(SettingsAuxiliaryInferenceSection, { onNavigateSection: navigate });
    expect(html).toContain("Inline completion");
    expect(html).toContain("On/off lives in Editor");
    expect(html).toContain("Open Editor");
    expect(html).not.toContain("Run inline completion");
    // Pre-PR review is owned here and keeps its switch.
    expect(html).toContain("Run pre-PR review");
  });
});

describe("Integrations owns Jira on/off", () => {
  test("Issues → Sources shows Jira's status with a link, and keeps Crane's switch", async () => {
    await store();
    const { IssueTrackerSettingsSection } = await import(
      "../src/components/layout/settings-dialog-issues-section"
    );
    const html = render(IssueTrackerSettingsSection, { onNavigateSection: navigate });
    expect(html).toContain("Manage in Integrations");
    expect(html).not.toContain('id="settings-tasks-source-jira"');
    expect(html).toContain('id="settings-tasks-source-crane"');
  });

  test("with default settings Jira reads as off and points at Integrations", async () => {
    await store();
    const { IssueTrackerSettingsSection } = await import(
      "../src/components/layout/settings-dialog-issues-section"
    );
    // SSR renders the store's initial state, where the connector is off.
    const html = render(IssueTrackerSettingsSection, { onNavigateSection: navigate });
    expect(html).toContain("Off. Turn Jira on in Settings → Integrations.");
  });

  test("Jira is on only when the connector and the Issues source flag are both on", async () => {
    const { buildJiraEnablementPatch, isJiraSourceEnabled } = await import(
      "../src/lib/tracker-issues/jira-enablement"
    );
    const settings = (await store()).getState().settings;
    const withFlags = (connector: boolean, source: boolean) => ({
      jiraConnector: { ...settings.jiraConnector, enabled: connector },
      trackerIssues: {
        ...settings.trackerIssues,
        sourceEnabled: { ...settings.trackerIssues.sourceEnabled, jira: source },
      },
    });
    expect(isJiraSourceEnabled(withFlags(true, false))).toBe(false);
    expect(isJiraSourceEnabled(withFlags(false, true))).toBe(false);
    expect(isJiraSourceEnabled(withFlags(true, true))).toBe(true);

    // The Integrations switch writes both flags, so a profile that had hidden
    // Jira in Issues is not stranded once that switch is gone.
    const patch = buildJiraEnablementPatch({
      settings: withFlags(false, false),
      enabled: true,
    });
    expect(isJiraSourceEnabled(patch)).toBe(true);
    expect(patch.trackerIssues.sourceEnabled.crane).toBe(
      settings.trackerIssues.sourceEnabled.crane,
    );
  });
});
