import { describe, expect, test } from "bun:test";
import { buildPlaybookDraftPrompt, parsePlaybookDraft } from "../src/lib/playbooks/draft-with-ai";
import {
  applyCheckIns,
  canAddPlaybook,
  createActionStage,
  createBlankPlaybook,
  describeSignOffs,
  duplicatePlaybook,
  explainActionUnavailable,
  explainPlaybookLimit,
  groupIssuesByField,
  listUnplacedIssues,
  moveStage,
  playbooksEqual,
  removePlaybook,
  setStageSignOff,
  stageAsksFirst,
  uniqueStageId,
  upsertPlaybook,
} from "../src/lib/playbooks/library";
import { parsePlaybook } from "../src/lib/playbooks/normalize";
import { MAX_PLAYBOOKS, type Playbook } from "../src/lib/playbooks/schema";
import { isCustomCheckIns } from "../src/lib/playbooks/sign-off";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

describe("playbook library", () => {
  test("stage ids are unique slugs of their titles", () => {
    expect(uniqueStageId("Open draft PR", [])).toBe("open-draft-pr");
    expect(uniqueStageId("Build", ["build", "build-2"])).toBe("build-3");
    expect(uniqueStageId("¿?", [])).toBe("stage");
  });

  test("a blank playbook needs a purpose and an instruction before it saves", () => {
    const blank = createBlankPlaybook({ now: MISSION_NOW, taken: [] });
    const parsed = parsePlaybook(blank);
    expect(parsed.ok).toBe(false);
    const issues = groupIssuesByField(parsed.ok ? [] : parsed.issues);
    expect(issues.get("purpose")).toBe("Purpose is required.");
    expect(issues.get("stages.0.instruction")).toBe("Instruction is required.");
  });

  test("duplicate, upsert and remove keep the list consistent", () => {
    const original = starterPlaybook("request-to-pr");
    const copy = duplicatePlaybook({ playbook: { ...original, shortcut: "pr" }, now: MISSION_NOW, taken: [original] });
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Request → PR copy");
    expect(copy.shortcut).toBeUndefined();
    const list = upsertPlaybook(upsertPlaybook([original], copy), { ...copy, name: "Mine" });
    expect(list.map((playbook) => playbook.name)).toEqual(["Request → PR", "Mine"]);
    expect(removePlaybook(list, original.id).map((playbook) => playbook.id)).toEqual([copy.id]);
  });

  test("a sign-off toggle that matches the preset stays on the preset", () => {
    const playbook = starterPlaybook("request-to-pr");
    const verify = playbook.stages.findIndex((stage) => stage.id === "verify");
    expect(stageAsksFirst(playbook, verify)).toBe(false);
    const asked = setStageSignOff(playbook, verify, "ask");
    expect(asked.stages[verify]!.signOff).toBe("ask");
    expect(isCustomCheckIns(asked)).toBe(true);
    const back = setStageSignOff(asked, verify, "auto");
    expect(back.stages[verify]!.signOff).toBeUndefined();
    expect(isCustomCheckIns(back)).toBe(false);
    // Picking a preset clears every override.
    expect(isCustomCheckIns(applyCheckIns(asked, "plan-and-publishing"))).toBe(false);
  });

  test("the summary names the stages that ask", () => {
    const playbook = starterPlaybook("request-to-pr");
    expect(describeSignOffs(playbook)).toBe("Asks before Build and Ready for review");
    expect(describeSignOffs(applyCheckIns(playbook, "when-stuck"))).toBe("Stops only when stuck or blocked");
    expect(describeSignOffs(applyCheckIns(playbook, "every-stage"))).toBe("Asks before every stage");
  });

  test("moving stages and adding actions respect the playbook's rules", () => {
    const playbook = starterPlaybook("request-to-pr");
    const moved = moveStage(playbook.stages, 0, 2);
    expect(moved.map((stage) => stage.id).slice(0, 3)).toEqual(["build", "verify", "understand"]);
    expect(explainActionUnavailable(playbook, "open-draft-pr")).toContain("already has");
    const withoutPr = { stages: playbook.stages.filter((stage) => stage.kind === "ai") };
    expect(explainActionUnavailable(withoutPr, "open-draft-pr")).toBeNull();
    expect(createActionStage("watch-checks", ["watch-checks"])).toMatchObject({
      id: "watch-checks-2",
      action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
    });
  });
});

describe("draft with AI", () => {
  test("the prompt asks for JSON in the playbook's shape and quotes the description", () => {
    const prompt = buildPlaybookDraftPrompt("Fix flaky tests, then open a PR.");
    expect(prompt).toContain('"checkIns"');
    expect(prompt).toContain("Fix flaky tests, then open a PR.");
  });

  test("an answer becomes an editable playbook with fresh ids", () => {
    const answer = [
      "Here you go:",
      "```json",
      JSON.stringify({
        name: "Flaky test fix",
        purpose: "Make a flaky test reliable and open a PR.",
        checkIns: "plan-and-publishing",
        stages: [
          { kind: "ai", title: "Reproduce", instruction: "Run the test until it fails.", doneWhen: "A failing seed is known.", role: "plan" },
          { kind: "ai", title: "Fix", instruction: "Remove the race.", doneWhen: "Fifty runs pass." },
          { kind: "action", action: "open-draft-pr" },
          { kind: "action", action: "open-draft-pr" },
          { kind: "action", action: "deploy" },
        ],
      }),
      "```",
    ].join("\n");
    const result = parsePlaybookDraft(answer, MISSION_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.playbook.stages.map((stage) => stage.id)).toEqual(["reproduce", "fix", "open-draft-pr"]);
    expect(parsePlaybook(result.playbook).ok).toBe(true);
  });

  test("an answer without stages is refused with a sentence", () => {
    expect(parsePlaybookDraft("I cannot help with that.", MISSION_NOW)).toMatchObject({ ok: false });
    expect(parsePlaybookDraft('{"name":"x","stages":[]}', MISSION_NOW)).toMatchObject({ ok: false });
  });
});

describe("playbook library limits and comparisons", () => {
  test("a long stage title never leaves a dash at the end of its id", () => {
    const id = uniqueStageId("Summarize the findings for the product team in a short note", []);
    expect(id).toBe("summarize-the-findings-for-the-product-team");
    expect(id.endsWith("-")).toBe(false);
    const playbook = starterPlaybook("request-to-pr");
    const stages = [{ ...playbook.stages[0]!, id }, ...playbook.stages.slice(1)];
    expect(parsePlaybook({ ...playbook, stages }).ok).toBe(true);
    // Its numbered twin stays within the limit too.
    expect(uniqueStageId("Summarize the findings for the product team in a short note", [id])).toBe(`${id}-2`);
  });

  test("a duplicate leaves the start conditions with the original", () => {
    const original: Playbook = {
      ...starterPlaybook("request-to-pr"),
      startsWhen: { issueAssigned: { filter: "", since: "2026-01-01T00:00:00.000Z" } },
    };
    const copy = duplicatePlaybook({ playbook: original, now: MISSION_NOW, taken: [original] });
    expect(copy.startsWhen).toBeUndefined();
    expect(original.startsWhen).toBeDefined();
  });

  test("a full library refuses a new playbook but still saves the ones it holds", () => {
    const one = starterPlaybook("request-to-pr");
    const full = Array.from({ length: MAX_PLAYBOOKS }, (_, index) => ({ ...one, id: `p${index}` }));
    expect(canAddPlaybook(full.slice(1))).toBe(true);
    expect(explainPlaybookLimit(full.slice(1))).toBeNull();
    expect(canAddPlaybook(full)).toBe(false);
    expect(explainPlaybookLimit(full)).toContain(`${MAX_PLAYBOOKS} playbooks`);
    expect(canAddPlaybook(full, "p3")).toBe(true);
  });

  test("playbooks compare by content, whatever order their keys were written in", () => {
    const saved = starterPlaybook("request-to-pr");
    const reordered = Object.fromEntries(Object.entries(saved).reverse()) as Playbook;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(saved));
    expect(playbooksEqual(saved, reordered)).toBe(true);
    expect(playbooksEqual(saved, { ...saved, name: "Renamed" })).toBe(false);
  });

  test("issues without a field of their own are listed for the save banner", () => {
    const issues = groupIssuesByField([
      "name: Name is required.",
      "stages.1.id: Stage id \"build\" is used more than once.",
      "startsWhen.schedule.workspaceId: Too small: expected string to have >=1 characters",
      "runtime.providerId: Invalid option",
    ]);
    expect(listUnplacedIssues(issues)).toEqual([
      {
        path: "startsWhen.schedule.workspaceId",
        label: "Starts when",
        message: "Too small: expected string to have >=1 characters",
      },
      { path: "runtime.providerId", label: "Runs on", message: "Invalid option" },
    ]);
  });
});
