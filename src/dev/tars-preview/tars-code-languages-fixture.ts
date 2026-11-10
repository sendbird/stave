/**
 * `gallery=true` B4: one short, realistic fence per language a Tars reply
 * commonly carries, plus the aliases that resolve to a loaded grammar
 * (`sh`, `yml`, `jsonc`, `golang`, `patch`), so a design review sees each
 * highlight in both themes. A test highlights every sample with the real
 * grammars, so a fence that falls back to plain text fails there.
 */
export const TARS_GALLERY_CODE_SAMPLES: ReadonlyArray<readonly [fence: string, code: string]> = [
  ["ts", "export function retryDelay(attempt: number, base = 250): number {\n  return Math.min(base * 2 ** attempt, 30_000);\n}"],
  ["tsx", "export function ExportButton({ busy }: { busy: boolean }) {\n  return <Button disabled={busy} onClick={startExport}>Export</Button>;\n}"],
  ["js", "const accounts = await listAccounts({ status: \"active\" });\nfor (const account of accounts) queue.push(account.id);"],
  ["json", "{\n  \"account\": \"acct_7f3c\",\n  \"invoices\": 18204,\n  \"complete\": true\n}"],
  ["jsonc", "{\n  // Retries stop after five attempts.\n  \"maxAttempts\": 5\n}"],
  ["bash", "set -euo pipefail\nbun test tests/billing-export.test.ts --timeout 30000"],
  ["sh", "if [ -z \"$EXPORT_BUCKET\" ]; then echo \"missing bucket\" >&2; exit 1; fi"],
  ["python", "def retry_delay(attempt: int, base: float = 0.25) -> float:\n    \"\"\"Exponential backoff, capped at 30 seconds.\"\"\"\n    return min(base * 2 ** attempt, 30.0)"],
  ["go", "func RetryDelay(attempt int) time.Duration {\n\treturn min(250*time.Millisecond<<attempt, 30*time.Second)\n}"],
  ["golang", "package export\n\nimport \"context\""],
  ["rust", "pub fn retry_delay(attempt: u32) -> Duration {\n    Duration::from_millis(250u64.saturating_mul(1 << attempt)).min(Duration::from_secs(30))\n}"],
  ["sql", "SELECT account_id, count(*) AS invoices\nFROM invoices\nWHERE issued_at >= now() - interval '1 day'\nGROUP BY account_id;"],
  ["diff", "--- a/src/export/retry.ts\n+++ b/src/export/retry.ts\n@@ -1,3 +1,3 @@\n-const MAX_ATTEMPTS = 3;\n+const MAX_ATTEMPTS = 5;\n export { MAX_ATTEMPTS };"],
  ["patch", "@@ -10,2 +10,2 @@\n-  timeout: 10_000,\n+  timeout: 30_000,"],
  ["yaml", "jobs:\n  export:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bun test tests/billing-export.test.ts"],
  ["yml", "retry:\n  max_attempts: 5\n  base_delay_ms: 250"],
  ["markdown", "## Export plan\n\n- [x] Keep a cursor per account\n- [ ] Cap each account at **five minutes**"],
];

export const TARS_GALLERY_CODE_LANGUAGES = TARS_GALLERY_CODE_SAMPLES.map(([fence]) => fence);

export function tarsGalleryCodeReply(intro: string): string {
  return [intro, "", ...TARS_GALLERY_CODE_SAMPLES.flatMap(([fence, code]) => ["```" + fence, code, "```", ""])].join("\n").trimEnd();
}
