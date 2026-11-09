/**
 * `richReply=true`: a reply with every shape that has to stay readable in the
 * Tars transcript — a long paragraph, an unbroken token, nested lists, a code
 * block with a line wider than the column, and a table wider than the column.
 * The code fence is plain on purpose: a highlighted fence loads its grammars
 * in a worker the dev server optimizes on first use, which reloads every open
 * page and breaks whatever else the e2e suite is running at that moment. Both
 * kinds of block share the same horizontal overflow.
 */
export const TARS_PREVIEW_RICH_REPLY = [
  "I checked the export pipeline end to end. The nightly job reads every billing account, groups invoices by currency and writes one CSV per account, but the retry path re-reads the whole account list after any failure, so a single slow account makes the job restart from the top and the export finishes hours late on the first business day of the month.",
  "",
  "The failing request was https://billing.example.com/api/v2/exports/nightly/accounts/acct_7f3c9e2b1a4d6f8e0c2b4a6d8f0e2c4b/invoices?currency=EUR&page=1",
  "",
  "**What I would change:**",
  "",
  "1. Keep a cursor per account so a retry resumes after the last written invoice instead of starting over from the first account in the list.",
  "   - Store the cursor next to the export record.",
  "   - Clear it once the account's file is complete.",
  "2. Cap each account at five minutes and move a slow account to the end of the queue.",
  "3. Report the accounts that were skipped in the job summary.",
  "",
  "```",
  "export async function exportAccount(account: BillingAccount, cursor: ExportCursor | null, { signal, writer, logger }: ExportContext): Promise<ExportResult> {",
  "  const invoices = await listInvoices(account.id, { after: cursor?.lastInvoiceId, signal });",
  "  return writer.append(account.id, invoices);",
  "}",
  "```",
  "",
  "| Account | Currency | Invoices | Last written invoice | Duration | Result |",
  "| --- | --- | --- | --- | --- | --- |",
  "| acct_7f3c9e2b1a4d | EUR | 18,204 | inv_2026_11_04_000018204 | 4m 58s | Complete |",
  "| acct_1b2c3d4e5f6a | USD | 42,977 | inv_2026_11_04_000031002 | 5m 00s | Moved to the end of the queue |",
].join("\n");
