import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreStartChecks } from "../src/components/missions/PreStartChecks";
import { MissionInsightsFailure } from "../src/components/playbooks/MissionInsights";
import { PlaybookEditor, PlaybookSaveBanner } from "../src/components/playbooks/PlaybookEditor";
import { UnreadablePlaybooksNotice } from "../src/components/playbooks/PlaybooksTab";
import { StageRow } from "../src/components/playbooks/StageRow";
import { setStageSignOff } from "../src/lib/playbooks/library";
import type { PlaybookStage } from "../src/lib/playbooks/schema";
import { evaluatePreStartChecks } from "../src/lib/missions/pre-start-checks";
import { starterPlaybook } from "./fixtures/mission-fixtures";

function renderEditor(overrides: Partial<Parameters<typeof PlaybookEditor>[0]> = {}) {
  const playbook = starterPlaybook("request-to-pr");
  return renderToStaticMarkup(
    createElement(PlaybookEditor, {
      draft: playbook,
      saved: playbook,
      takenShortcuts: new Set<string>(),
      onChange: () => {},
      onSave: () => {},
      onDiscard: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
      onStartMission: () => {},
      ...overrides,
    }),
  );
}

describe("playbook editor", () => {
  test("name and purpose head the editor, then check-ins, shortcut, permissions and the stages", () => {
    const html = renderEditor();
    const order = ['value="Request → PR"', "Check-ins", "Shortcut", "Permissions", "Constraints", ">Stages<"];
    const positions = order.map((text) => html.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('role="radiogroup" aria-label="Check-ins"');
    expect(html).toContain("Asks before Build and Ready for review");
    // A saved, unchanged playbook has nothing to save.
    expect(html).toContain(">Saved<");
  });

  test("each stage row shows its sign-off as a pressed hand; the first stage cannot ask", () => {
    const html = renderEditor();
    expect(html.match(/aria-label="Ask me before this stage" aria-pressed="true"/g)?.length).toBe(2);
    expect(html).toContain('aria-label="Starts with the mission"');
    expect(html).toContain("Stave action");
  });

  test("an override marks the check-ins Custom and unsaved", () => {
    const saved = starterPlaybook("request-to-pr");
    const draft = setStageSignOff(saved, 2, "ask");
    const html = renderEditor({ draft, saved });
    expect(html).toContain(">Custom<");
    expect(html).toContain(">Unsaved changes<");
  });

  test("a shortcut another playbook uses is flagged", () => {
    const saved = { ...starterPlaybook("request-to-pr"), shortcut: "pr" };
    const html = renderEditor({ draft: saved, saved, takenShortcuts: new Set(["pr"]) });
    expect(html).toContain("Another playbook already uses !pr.");
  });

  test("Start mission waits for a save and a task", () => {
    const saved = starterPlaybook("request-to-pr");
    expect(renderEditor({ draft: { ...saved, name: "Edited" }, saved })).toMatch(/disabled=""[^>]*>.*Start mission/);
    expect(renderEditor({ onStartMission: null })).toMatch(/disabled=""[^>]*>.*Start mission/);
  });

  test("a playbook whose keys were written in another order still reads as saved", () => {
    const saved = starterPlaybook("request-to-pr");
    const reordered = Object.fromEntries(Object.entries(saved).reverse()) as typeof saved;
    expect(renderEditor({ draft: reordered, saved })).toContain(">Saved<");
  });

  test("a full library says so and holds the save of a new playbook", () => {
    const draft = starterPlaybook("request-to-pr");
    const html = renderEditor({
      draft,
      saved: null,
      saveBlockedReason: "You have 50 playbooks, the most Stave keeps. Delete one to add another.",
    });
    expect(html).toContain("You have 50 playbooks, the most Stave keeps. Delete one to add another.");
    expect(html).toMatch(/disabled=""[^>]*>(<span[^>]*>)?Save playbook/);
  });

  test("a macro with the same shortcut is pointed out", () => {
    const draft = { ...starterPlaybook("request-to-pr"), shortcut: "ship" };
    const html = renderEditor({ draft, saved: draft, macroShortcuts: new Map([["ship", "Ship it"]]) });
    expect(html).toContain("The macro “Ship it” also uses !ship.");
  });

  test("the save banner lists issues that have no field of their own", () => {
    const html = renderToStaticMarkup(
      createElement(PlaybookSaveBanner, {
        message: "Fix 2 fields before saving.",
        unplaced: [
          { path: "startsWhen.schedule.workspaceId", label: "Starts when", message: "Choose a workspace." },
          { path: "runtime.providerId", label: "Runs on", message: "Invalid option" },
        ],
      }),
    );
    expect(html).toContain("Fix 2 fields before saving.");
    expect(html).toContain("Starts when:</span> Choose a workspace.");
    expect(html).toContain("Runs on:</span> Invalid option");
  });
});

describe("stage rows show every issue", () => {
  function renderRow(stage: PlaybookStage, issues: Map<string, string>) {
    return renderToStaticMarkup(
      createElement(StageRow, {
        stage,
        index: 1,
        count: 3,
        asksFirst: false,
        expanded: true,
        issues,
        onToggleExpanded: () => {},
        onChange: () => {},
        onToggleSignOff: () => {},
        onMove: () => {},
        onDuplicate: () => {},
        onRemove: () => {},
        dragHandlers: { onDragStart: () => {}, onDragEnd: () => {}, onDragOver: () => {}, onDrop: () => {} },
      }),
    );
  }

  test("stage-wide issues and a duplicate id appear in the row", () => {
    const stage = starterPlaybook("request-to-pr").stages[1]!;
    const html = renderRow(
      stage,
      new Map([
        ["", "Watch checks must come after Open draft PR."],
        ["id", "This stage id is used more than once."],
      ]),
    );
    expect(html).toContain("Watch checks must come after Open draft PR.");
    expect(html).toContain("This stage id is used more than once.");
  });

  test("a Run script stage shows its script issue on the Script field", () => {
    const stage: PlaybookStage = { id: "run-script", title: "Run script", kind: "action", action: { type: "run-script", scriptId: "" } };
    const html = renderRow(stage, new Map([["action.scriptId", "Script is required."]]));
    expect(html).toContain("Script is required.");
    expect(html.match(/Script is required\./g)?.length).toBe(1);
  });
});

describe("playbook library notices", () => {
  test("playbooks that could not be read are counted and named", () => {
    const html = renderToStaticMarkup(
      createElement(UnreadablePlaybooksNotice, {
        entries: [
          { value: { name: "Request → PR", version: 2 }, issues: ["version: Invalid input"] },
          { value: "garbage", issues: [] },
        ],
      }),
    );
    expect(html).toContain("2 playbooks could not be read");
    expect(html).toContain("“Request → PR”");
    expect(html).toContain("keeps them aside unchanged");
    expect(renderToStaticMarkup(createElement(UnreadablePlaybooksNotice, { entries: [] }))).toBe("");
  });

  test("insights that fail to load explain why and offer a retry", () => {
    const html = renderToStaticMarkup(
      createElement(MissionInsightsFailure, { message: "The database is locked.", onRetry: () => {} }),
    );
    expect(html).toContain("Mission insights could not be read");
    expect(html).toContain("The database is locked.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("available in the desktop app");
  });
});

describe("pre-start checks list", () => {
  test("each check reads as a sentence, and uncommitted files carry their checkbox", () => {
    const checks = evaluatePreStartChecks({
      playbook: starterPlaybook("request-to-pr"),
      providerSupported: true,
      reporting: { state: "ready", reason: null, detail: null },
      github: { state: "unauthenticated", detail: "Run `gh auth login` in a terminal, then check again." },
      dirtyFileCount: 2,
      dirtyAcknowledged: false,
      activeMission: false,
    });
    const html = renderToStaticMarkup(
      createElement(PreStartChecks, { checks, dirtyAcknowledged: false, onAcknowledgeDirty: () => {} }),
    );
    expect(html).toContain("GitHub CLI");
    expect(html).toContain("blocks the start");
    expect(html).toContain("2 uncommitted files");
    expect(html).toContain("Start on top of these changes");
  });
});
