import { afterEach, expect, test } from "bun:test";
import { i18n } from "@/i18n/runtime";
import { AutomationScheduleSchema } from "@/lib/automations";
import {
  describeAutomationDraftIssue,
  formatAutomationSchedule,
  formatAutomationWeekday,
} from "@/lib/automation-presentation";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  buildWorkspaceInformationReferenceOptions,
  formatWorkspaceInformationReferencesContext,
  resolveWorkspaceInformationReferenceFromToken,
} from "@/lib/workspace-information-references";
import { emptyResumeBriefFields, getWorkspaceInstructions } from "@/lib/workspace-resume-brief";
import { WORKSPACE_TOOLS_PRESENTATION, workspaceToolsRunningLabel } from "@/lib/workspace-tools-presentation";

afterEach(async () => { await i18n.changeLanguage("en"); });

test("schedule labels follow language changes and retain schedule tokens", async () => {
  const schedule = { every: 3, unit: "weeks" } as const;
  expect(formatAutomationSchedule(schedule)).toBe("Every 3 weeks");
  expect(formatAutomationWeekday(1)).toBe("Mon");
  await i18n.changeLanguage("ko");
  expect(formatAutomationSchedule(schedule)).toBe("3주마다");
  expect(formatAutomationWeekday(1)).toBe("월");
  expect(schedule).toEqual({ every: 3, unit: "weeks" });
});

test("invalid schedule rules get a Korean UI summary", async () => {
  const result = AutomationScheduleSchema.safeParse({ every: 1, unit: "hours", at: { hour: 9, minute: 0 } });
  expect(result.success).toBe(false);
  if (result.success) return;
  const english = describeAutomationDraftIssue(result.error.issues[0]);
  await i18n.changeLanguage("ko");
  const korean = describeAutomationDraftIssue(result.error.issues[0]);
  expect(korean).not.toBe(english);
  expect(korean).toMatch(/[가-힣]/);
});

test("presentation getters and counts translate without reimporting modules", async () => {
  expect(WORKSPACE_TOOLS_PRESENTATION.label).toBe("Workspace Tools");
  expect(workspaceToolsRunningLabel(1)).toBe("Workspace Tools, 1 process running");
  expect(workspaceToolsRunningLabel(3)).toBe("Workspace Tools, 3 processes running");
  await i18n.changeLanguage("ko");
  expect(WORKSPACE_TOOLS_PRESENTATION.label).toBe("워크스페이스 도구");
  expect(workspaceToolsRunningLabel(0)).toBe("워크스페이스 도구");
  expect(workspaceToolsRunningLabel(1)).toMatch(/1.*실행/);
  expect(workspaceToolsRunningLabel(3)).toMatch(/3.*실행/);
});

test("reference UI translates while injected model context stays unchanged", async () => {
  const info = { ...createEmptyWorkspaceInformation(), notes: "User notes stay verbatim." };
  const reference = resolveWorkspaceInformationReferenceFromToken("@info:notes")!;
  const englishContext = formatWorkspaceInformationReferencesContext({ info, references: [reference] });
  const englishOptions = buildWorkspaceInformationReferenceOptions(info);
  await i18n.changeLanguage("ko");
  const koreanOptions = buildWorkspaceInformationReferenceOptions(info);
  expect(koreanOptions.find((option) => option.reference.section === "notes")?.title).toBe("메모");
  expect(koreanOptions.map((option) => option.reference.token)).toEqual(englishOptions.map((option) => option.reference.token));
  expect(formatWorkspaceInformationReferencesContext({ info, references: [reference] })).toBe(englishContext);
  expect(englishContext).toContain("User notes stay verbatim.");
});

test("legacy instructions keep their original heading contract across languages", async () => {
  const brief = { ...emptyResumeBriefFields(), goal: "Ship the user's task", nextAction: "Run the checks" };
  const english = getWorkspaceInstructions(brief);
  await i18n.changeLanguage("ko");
  expect(getWorkspaceInstructions(brief)).toBe(english);
  expect(english).toContain("Goal: Ship the user's task");
});
