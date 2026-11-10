/**
 * One reply with every shape that can be wider than the transcript column:
 * a plain-text fence of long prose lines right under a numbered heading, fences
 * and tables inside list items and quotes, a top-level table and code block,
 * long links, a long inline code token and an unbroken word. The task chat and
 * the Tars previews render it so the overflow regressions measure the real
 * markdown path. The fences carry no highlighted language on purpose: a
 * highlighted fence loads its grammar in a worker the dev server optimizes on
 * first use, which reloads every open page mid-test.
 */
const LONG_URL =
  "https://billing.example.com/api/v2/exports/nightly/accounts/acct_7f3c9e2b1a4d6f8e0c2b4a6d8f0e2c4b/invoices?currency=EUR&page=1&include=lines,taxes,discounts";

export const TRANSCRIPT_OVERFLOW_REPLY = [
  "### 1. Tars 컴포저 드래프트 저장과 대화 화면 개선",
  "",
  "```text",
  "Stave의 Tars 컴포저 드래프트 저장과 대화 화면을 개선해줘.",
  "",
  "- 컴포저 하단 조작을 간결하게 정리하면서 필요한 기능을 찾을 수 있게 하고, 키보드 접근과 접근 가능한 이름을 유지해줘.",
  "- 긴 메시지·코드·목록에 읽기 좋은 폭과 넘침 처리를 적용해줘. Keep long messages, code and lists inside a readable width.",
  "```",
  "",
  "1. A numbered step with a fence inside it:",
  "",
  "   ```text",
  "   - A long plain-text line inside a list item that is wider than the reply column in a monospace font, so it has to scroll inside its own block.",
  "   ```",
  "",
  "2. A step with a table inside it:",
  "",
  "   | Account | Currency | Invoices | Last written invoice | Duration | Result |",
  "   | --- | --- | --- | --- | --- | --- |",
  "   | acct_7f3c9e2b1a4d | EUR | 18,204 | inv_2026_11_04_000018204 | 4m 58s | Moved to the end of the queue |",
  "",
  `3. A step with a long link: ${LONG_URL}`,
  "   - A nested item with `exportAccount.retryPolicy.maxAttemptsPerAccountBeforeMovingToTheEndOfTheQueue` in it.",
  "",
  "> A quote with a fence inside it:",
  ">",
  "> ```",
  "> const quoted = await exportAccount(account, cursor, { signal, writer, logger, retryPolicy: { maxAttempts: 5, backoffMs: 2_000 } });",
  "> ```",
  "",
  `A paragraph with a long link ${LONG_URL} and an unbroken token ${"0123456789abcdef".repeat(10)} in it.`,
  "",
  "| Account | Currency | Invoices | Last written invoice | Duration | Result | Owner | Notes |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| acct_7f3c9e2b1a4d | EUR | 18,204 | inv_2026_11_04_000018204 | 4m 58s | Complete | billing-platform | Resumed from the saved cursor after one retry |",
  "| acct_1b2c3d4e5f6a | USD | 42,977 | inv_2026_11_04_000031002 | 5m 00s | Moved to the end of the queue | billing-platform | Hit the five-minute cap |",
  "",
  "| Step | Result |",
  "| --- | --- |",
  "| Cursor | Saved |",
  "",
  "```",
  "export async function exportAccount(account: BillingAccount, cursor: ExportCursor | null, { signal, writer, logger }: ExportContext): Promise<ExportResult> {",
  "  return writer.append(account.id, await listInvoices(account.id, { after: cursor?.lastInvoiceId, signal }));",
  "}",
  "```",
].join("\n");
