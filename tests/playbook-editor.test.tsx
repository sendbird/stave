import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreStartChecks } from "../src/components/missions/PreStartChecks";
import { PlaybookEditor } from "../src/components/playbooks/PlaybookEditor";
import { setStageSignOff } from "../src/lib/playbooks/library";
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
