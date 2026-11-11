import { expect, test } from "bun:test";
import { tarsSummaryExcerpt, tarsSummaryCaveats, tarsEarlierSummaryCaveats } from "../src/lib/tars/completion-summary";
import { projectTarsReport } from "../src/lib/tars/report-model";
import { buildTarsResultFixtures } from "../src/dev/tars-preview/tars-result-fixtures";

test('only frozen final text leads; every stage summary stays whole', () => {
  const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
  const row = f.responsibilities[0]!;
  const run = f.runs[row.agentRunId!]!;
  const original = run.report!.stages.at(-1)!.summary!;
  expect(projectTarsReport(row, run).summary).toBe(original);
  expect(projectTarsReport(row, { ...run, report: null }).summary).toBeNull();
  const text = 'Exported invoices with stable columns.\n\nNot verified on production data.';
  run.report!.stages.at(-1)!.summary = text;
  const model = projectTarsReport(row, run);
  expect(tarsSummaryExcerpt(text)).toBe('Exported invoices with stable columns.…');
  expect(model.summaries.at(-1)!.text).toBe(text);
  expect(tarsSummaryCaveats(model)).toContain('Not verified on production data.');
  model.summary = 'Done.\n\n## Limitations\n\nDeployment was skipped.\n\n## Verification\n\nTests passed.';
  expect(tarsSummaryCaveats(model)).toContain('Deployment was skipped.');
  expect(tarsSummaryCaveats(model)).not.toContain('Tests passed.');
  expect(tarsSummaryExcerpt('x'.repeat(900)).length).toBeLessThanOrEqual(321);
});

for (const heading of ['## Not verified', '## Unverified', '**Limitations**', '## 미확인']) {
  test(`includes the body below ${heading}`, () => {
    const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
    const row = f.responsibilities[0]!;
    const model = projectTarsReport(row, f.runs[row.agentRunId!]);
    model.summary = `Done.\n\n${heading}\n\nPackaged Electron was skipped.\n\n## Checks\n\nTests passed.`;
    model.leftBehind = [];
    expect(tarsSummaryCaveats(model)).toContain('Packaged Electron was skipped.');
    expect(tarsSummaryCaveats(model)).not.toContain('Tests passed.');
  });
}
for (const text of ['제약 없음', '남은 작업 없음', 'No limitations', 'Nothing blocked']) {
  test(`does not warn for ${text}`, () => {
    const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
    const row = f.responsibilities[0]!;
    const model = projectTarsReport(row, f.runs[row.agentRunId!]);
    model.summary = text;
    model.leftBehind = [];
    expect(tarsSummaryCaveats(model)).toEqual([]);
  });
}
for (const text of ['- None', 'None.', 'N/A', '- 없음', 'No known limitations.', 'nothing is blocked']) {
  test(`does not warn for a standalone absence statement under Limitations: ${text}`, () => {
    const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
    const row = f.responsibilities[0]!;
    const model = projectTarsReport(row, f.runs[row.agentRunId!]);
    model.summary = `Done.\n\n## Limitations\n\n${text}`;
    model.leftBehind = [];
    expect(tarsSummaryCaveats(model)).toEqual([]);
    model.summaries = [{ stageId: 'work', title: 'Work', text: model.summary }, { stageId: 'verify', title: 'Verify', text: 'Done.' }];
    expect(tarsEarlierSummaryCaveats(model)).toEqual([]);
  });
}

for (const text of [
  'No known limitations, but production is unverified.',
  'nothing is blocked locally; deployment is blocked.',
  'None of the production checks passed.',
  'N/A for local builds; production was skipped.',
  '없음으로 표시했지만 운영 환경은 미검증입니다.',
  'No known limitations. Production is blocked.',
]) {
  test(`keeps an actual limitation alongside absence wording: ${text}`, () => {
    const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
    const row = f.responsibilities[0]!;
    const model = projectTarsReport(row, f.runs[row.agentRunId!]);
    model.summary = `## Limitations\n\n${text}`;
    model.leftBehind = [];
    expect(tarsSummaryCaveats(model)).toEqual([text]);
  });
}

test('a standalone absence statement does not hide following limitations or structured remaining work', () => {
  const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
  const row = f.responsibilities[0]!;
  const model = projectTarsReport(row, f.runs[row.agentRunId!]);
  model.summary = '## Limitations\n\n- None\n- Production deployment was skipped.\n\n## Checks\n\nTests passed.';
  model.leftBehind = ['No known limitations.'];
  expect(tarsSummaryCaveats(model)).toEqual(['- Production deployment was skipped.', 'No known limitations.']);
});

test('extracts content after summary headings without changing the original', () => {
  for (const heading of ['## Summary', '**요약**']) {
    expect(tarsSummaryExcerpt(`${heading}\n\nImplemented CSV export.\n\nMore detail.`)).toBe('Implemented CSV export.…');
  }
});


test('earlier caveats retain their stage without claiming the final status', () => {
  const f = buildTarsResultFixtures(new Date('2026-11-05T00:00:00Z'));
  const row = f.responsibilities[0]!;
  const model = projectTarsReport(row, f.runs[row.agentRunId!]);
  model.summaries = [
    { stageId: 'work', title: 'Work', text: 'Implemented.\n\nNot verified on packaged Electron.' },
    { stageId: 'verify', title: 'Verify', text: 'Packaged Electron verified successfully. No limitations.' },
  ];
  model.summary = model.summaries[1]!.text;
  model.leftBehind = [];
  expect(tarsSummaryCaveats(model)).toEqual([]);
  expect(tarsEarlierSummaryCaveats(model)).toEqual([{ ...model.summaries[0]!, caveats: ['Not verified on packaged Electron.'] }]);
  model.leftBehind = ['Pending release'];
  expect(tarsSummaryCaveats(model)).toEqual(['Pending release']);
  expect(model.summaries[0]!.text).toContain('Not verified on packaged Electron.');
});
