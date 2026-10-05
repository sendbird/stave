import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { formatSystemEventDisplay } from "@/components/session/system-event-display";
import { isCodeDiffSummarySystemEvent, isSubagentProgressSystemEvent } from "@/components/session/chat-panel.utils";
import { getAgentDisplayName, getAgentDisplayDescription } from "@/lib/agents/display";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { groupAgents } from "@/lib/agents/agents-view";
import { matchAgents } from "@/lib/agents/selector-choice";
import { exportAgentFile } from "@/lib/agents/export";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { formatAge, STAGE_STATUS_PRESENTATION } from "@/lib/agent-runs/agent-run-view";
import { PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE } from "@/lib/truncation-visibility";

afterEach(() => applyAppLocale("en"));

describe("conversation locale presentation", () => {
  test("builtin presentation changes without rewriting agent prompts or exported provider files", () => {
    const agent = getBuiltinAgent("debugger")!;
    const instructions = agent.instructions;
    const providerFile = exportAgentFile(agent, "claude-md").content;
    applyAppLocale("en");
    expect(getAgentDisplayName(agent)).toBe("Debugger");
    const description = getAgentDisplayDescription(agent);
    applyAppLocale("ko");
    expect(getAgentDisplayName(agent)).toBe("디버거");
    expect(getAgentDisplayDescription(agent)).not.toBe(description);
    expect(agent.name).toBe("Debugger");
    expect(agent.instructions).toBe(instructions);
    expect(exportAgentFile(agent, "claude-md").content).toBe(providerFile);
    expect(getStageDisplayTitle(agent.workflow![0]!)).toBe("재현");
    expect(agent.workflow![0]!.title).toBe("Reproduce");
  });

  test("agent search matches translated labels, canonical aliases and identifiers", () => {
    const agent = getBuiltinAgent("debugger")!;
    applyAppLocale("ko");
    expect(groupAgents([agent], "디버거")[0]?.agents[0]?.id).toBe("debugger");
    expect(matchAgents([agent], "디버거")[0]?.id).toBe("debugger");
    expect(matchAgents([agent], "debugger")[0]?.id).toBe("debugger");
  });

  test("custom agent names and custom stage titles remain user content", () => {
    applyAppLocale("ko");
    expect(getAgentDisplayName({ id: "debugger", source: "custom", name: "My Debugger" })).toBe("My Debugger");
    expect(getStageDisplayTitle({ id: "user-step", title: "Reproduce" })).toBe("Reproduce");
  });

  test("status getters and short durations use the current language", () => {
    applyAppLocale("en");
    const english = STAGE_STATUS_PRESENTATION.running.label;
    expect(formatAge(120_000)).toBe("2m");
    applyAppLocale("ko");
    expect(STAGE_STATUS_PRESENTATION.running.label).not.toBe(english);
    expect(formatAge(120_000)).toBe("2분");
    expect(i18n.t("agentRuns:counts.files", { count: 1 })).toBe("파일 1개");
  });

  test("system-event replay classifiers retain canonical English in Korean", () => {
    applyAppLocale("ko");
    expect(isCodeDiffSummarySystemEvent("applied file change(s): src/app.ts")).toBe(true);
    expect(isCodeDiffSummarySystemEvent("skipped inline diff for file(s): large.ts")).toBe(true);
    expect(isSubagentProgressSystemEvent("Subagent progress: child is running")).toBe(true);
    expect(isSubagentProgressSystemEvent("Provider output from the user")).toBe(false);
  });

  test("known local stop and truncation notices translate only at presentation", () => {
    applyAppLocale("ko");
    expect(formatSystemEventDisplay("Generation was stopped locally before completion.")).toBe("완료 전에 이 기기에서 생성을 중지했습니다.");
    expect(formatSystemEventDisplay(PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE)).not.toBe(PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE);
    expect(formatSystemEventDisplay("Context compacted")).toBe("컨텍스트 압축됨");
    expect(formatSystemEventDisplay("Model-generated answer stays unchanged.")).toBe("Model-generated answer stays unchanged.");
  });

  test("input card chrome changes language while provider questions and options stay intact", () => {
    const props = {
      toolName: "AskUserQuestion",
      questions: [{ key: "scope", header: "Scope", question: "Which scope?", options: [{ label: "Focused", description: "Keep the change focused." }] }],
      state: "input-requested" as const,
      presentation: "composer" as const,
    };
    applyAppLocale("en");
    const english = renderToStaticMarkup(createElement(UserInputCard, props));
    expect(english).toContain("Continue");
    applyAppLocale("ko");
    const korean = renderToStaticMarkup(createElement(UserInputCard, props));
    expect(korean).toContain(i18n.t("composer:userInputCard.userInputCard2"));
    expect(korean).not.toContain("Agent needs your input");
    expect(korean).toContain("Which scope?");
    expect(korean).toContain("Keep the change focused.");
  });
});
