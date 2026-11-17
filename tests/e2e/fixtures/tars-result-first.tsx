import { chatTypeScaleVars } from "@/components/ai-elements/message-text-scale";
import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TooltipProvider } from "@/components/ui";
import { buildTarsOutputs } from "@/lib/tars/outputs-model";
import { TarsOutputList } from "@/components/tars/TarsTray";
import { TarsReportPanel } from "@/components/tars/TarsReportPanel";
import { TarsResultCard } from "@/components/tars/TarsResultCard";
import { buildTarsResultFixtures } from "@/dev/tars-preview/tars-result-fixtures";
import { projectTarsReport } from "@/lib/tars/report-model";
import { projectTarsResult } from "@/lib/tars/result-model";
import "@/globals.css";

const params = new URLSearchParams(location.search);
const ko = params.get("lang") === "ko";
applyAppLocale(ko ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
document.documentElement.dataset.uiDensity = params.get("density") === "compact" ? "compact" : "regular";
const fixture = buildTarsResultFixtures(new Date("2026-11-05T00:00:00Z"));
const id = params.get("case") === "reported" ? fixture.ids.reported : fixture.ids.verified;
const row = fixture.responsibilities.find((item) => item.id === id)!;
const run = fixture.runs[row.agentRunId!]!;
const report = run.report!;
report.stages.at(-1)!.summary = ko
  ? "청구서 CSV 내보내기를 구현했습니다. 열 이름과 인코딩을 맞추고 회귀 검사로 확인했습니다."
  : "Implemented invoice CSV export with consistent columns and encoding, checked with regression tests.";
report.links.push({ label: ko ? "CSV 결과 예시 열기" : "Open CSV example", url: "https://example.com/invoice.csv", source: "agent" });
if (params.get("case") === "long") {
  report.stages[0]!.summary += "\n\n" + (ko ? "패키징된 Electron 앱은 미검증입니다." : "Not verified on packaged Electron.");
  report.stages.at(-1)!.summary += "\n\n" + (ko ? "열 이름과 인코딩을 검사했습니다. " : "Checked column names and encoding. ").repeat(80);
  report.acceptanceCriteria.push({ text: (ko ? "긴 기준도 빠짐없이 표시합니다. " : "Long criteria remain readable. ").repeat(14) + "x".repeat(120), status: "unverified", required: false });
  report.leftBehind.push(ko ? "실제 운영 데이터에서는 확인하지 않았습니다." : "Not verified against production data.");
  report.links[0]!.label += "x".repeat(120);
}
if (params.get("case") === "missing") report.stages.forEach((stage) => { stage.summary = null; });
if (params.get("case") === "history") {
  report.stages[0]!.summary = "## Summary\n\nImplemented CSV export.\n\n## Not verified\n\nPackaged Electron was skipped.";
  report.stages.at(-1)!.summary = "## Summary\n\nCompleted regression checks.\n\n**Limitations**\n\nProduction deployment was skipped.";
  report.leftBehind = ["Release remains pending."];
}
if (["none", "none-with-caveat"].includes(params.get("case") ?? "")) {
  report.stages.at(-1)!.summary = "## Summary\n\nCompleted regression checks.\n\n## Limitations\n\n- None\nNone.\nN/A\n- 없음\nNo known limitations.\nnothing is blocked";
  report.leftBehind = [];
  if (params.get("case") === "none-with-caveat") {
    report.stages.at(-1)!.summary += "\nProduction deployment was skipped.";
    report.leftBehind = ["Release remains pending."];
  }
}
if (params.get("case") === "zero") { report.acceptanceCriteria = []; row.acceptanceCriteria = []; }
if (["stopped", "cancelled"].includes(params.get("case") ?? "")) {
  report.outcome = params.get("case") as "stopped" | "cancelled";
  report.reason = "Execution ended before deployment.";
}
if (params.get("case") === "pending") run.report = null;
const model = projectTarsResult({ outcome: "completed", row, run });
const notice = { kind: "completed" as const, activity: { id: "fixture-result", responsibilityId: row.id, revision: row.revision, title: row.title,
  state: "completed" as const, detail: null, createdAt: row.updatedAt } };
const styles = stylex.create({
  page: { padding: vars["--aui-space-16"], display: "grid", gap: vars["--aui-space-16"], minWidth: 0, color: vars["--aui-color-text"] },
  frame: { minWidth: 0, containerType: "inline-size", display: "grid", gap: vars["--aui-space-12"] },
});
createRoot(document.getElementById("root")!).render(<StaveDesignProvider><TooltipProvider><main className={sx(styles.page)}>
  <p data-example="">{ko ? "예시 데이터 · 실제 완료 결과가 아닙니다" : "Example data · not an actual completed result"}</p>
  <section className={sx(styles.frame)} data-surface="result" style={chatTypeScaleVars(Number(params.get("messageFontSize") ?? 16))}><TarsResultCard notice={notice} result={{ model, row, agentName: "Implementer", actions: {
    onOpenSide: (target) => { document.querySelector('[data-surface="report"]')?.scrollIntoView(); document.documentElement.dataset.opened = target.kind; },
  } }} /></section>
  <section className={sx(styles.frame)} data-surface="report"><TarsReportPanel model={projectTarsReport(row, run)} row={row} outputs={<TarsOutputList outputs={buildTarsOutputs({ responsibilities: [row], runs: { [run.agentRun.id]: run } }).filter((output) => output.kind !== "report" && output.kind !== "pullRequest")}
    onOpenSide={(target) => { document.documentElement.dataset.opened = target.kind; }} />} /></section>
</main></TooltipProvider></StaveDesignProvider>);
