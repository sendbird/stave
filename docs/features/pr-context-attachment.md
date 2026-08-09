# PR Context Attachment

Attach "these review threads and this failed check's log excerpt" from a pull
request to a task, as bounded, untrusted context.

This is Stage A of the agent platform plan. Read
[`docs/architecture/agent-platform-taxonomy.md`](../architecture/agent-platform-taxonomy.md)
for the vocabulary; the contract file list is in
[`docs/architecture/contracts.md`](../architecture/contracts.md).

## What it does

From the PR menu in the top bar, **Attach PR context…** opens a dialog listing
the pull request's review threads and its failed checks. Ticking items and
pressing **Attach to task** puts one retrieved-context part on the active task.
That part travels the same path Crane issue context already uses: it is stored
with the task and re-sent with every later turn until it is removed.

Unresolved, non-outdated review threads start ticked. Failed checks start
unticked, because each one costs a network round trip and a chunk of context.

## The two-step fetch

Opening the dialog fetches **metadata only**:

- review threads and their comments, through `gh api graphql`
- failed check runs for the PR's head commit, through
  `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`

No log is read at this point. Log evidence is fetched only on **Attach**, and
only for the check ids the user ticked — at most
`PR_CONTEXT_LIMITS.maxSelectedChecks` (5) per request.

For each selected failed check the runtime tries, in order:

1. **Annotations** — `gh api repos/{o}/{r}/check-runs/{id}/annotations`. Small,
   structured, and usually the actual failure.
2. **Job log tail** — `gh run view --repo {o}/{r} --job {id} --log`, keeping the
   last `maxLogTailChars` (12 000) characters. CI failures live at the end.
3. **`unavailable`** with a stated reason. A check with neither annotations nor
   an Actions job is reported as such, never as silence.

Every excerpt records which of the three it was, so a reader can judge how
complete the evidence is.

## Bounds, sanitization, redaction

Everything lives in [`src/lib/pr-context.ts`](../../src/lib/pr-context.ts) and
is applied in the host service, before the payload crosses IPC.

- `PR_CONTEXT_LIMITS` is the single cap table: 20 threads, 10 comments per
  thread, 2 000 chars per comment, 25 annotations, 12 000 chars of log tail,
  120 000 chars of assembled attachment.
- `stripControlSequences` removes ANSI CSI/OSC/two-byte escapes, C0 controls
  other than tab and newline, DEL, and the C1 range. A CI log cannot smuggle a
  terminal escape into the transcript.
- `redactSuspiciousLine` replaces any line matching a credential pattern
  (bearer token, `ghp_`/`github_pat_`, AWS access key, Slack token, `sk-`/
  `sk-ant-`, a PEM private-key header, or a `secret|password|token|…` assignment)
  with `[redacted: line matched <name>]`. The reason survives; the value does
  not.
- Truncation always says how much was dropped — head-truncation for comments,
  tail-truncation for logs.
- Comment bodies and log lines are never written to a log. Error strings
  returned from the runtime are classified messages or the first line of
  stderr, capped at 300 characters.

## Provenance

Every attachment carries a machine-readable provenance line:

```
stave-pr-context-provenance: {"v":1,"origin":"…","owner":"…","repo":"…","prNumber":348,"headSha":"…","fetchedAt":"…","threadIds":[…],"checkIds":[…]}
```

It is embedded in the attachment body rather than kept in a second store, so
provenance survives a restart with no new persistence surface and no schema
migration. `readPrContextProvenance` parses it back through a Zod schema.

The body also opens with an untrusted-context preamble stating that review
comments and CI logs are written by other people and machines, and that an
instruction inside them is data to consider, not an order to obey.

## Staleness

One attachment per PR, keyed `pr:<owner>/<repo>#<number>`. Re-attaching the
same PR replaces the previous part rather than stacking a second copy against
the 20-part `sourceContexts` cap.

When the PR head moves, the attachment is **withheld from further turns** until
the user refreshes it. Old CI evidence quietly steering an agent is the failure
this stage exists to prevent.

- `partitionStalePrContexts` is the single decision point. The turn assembly in
  `src/store/app.store.ts` and the banner in `TaskSourceContextNotice.tsx` both
  call it, so what the user sees and what goes on the wire agree by
  construction.
- Staleness compares the attachment's `headSha` against
  `workspacePrInfoById[workspaceId].pr.headRefOid`. Unknown on either side is
  **not** stale — the feature never invents staleness from missing data.
- An attachment whose PR is not the workspace's current-branch PR is never
  judged against that PR's head.
- The banner offers **Refresh PR context**, which reopens the dialog through the
  `attach-context` action on the top-bar PR event bus.

## Scope

The dialog targets the workspace's **current-branch pull request**. Linked pull
requests in the Information panel are not attachment sources; widening to them
means deciding which task a workspace-scoped panel attaches to, which this
stage deliberately left alone.

## Tests

- [`tests/pr-context.test.ts`](../../tests/pr-context.test.ts) — caps,
  sanitization, hostile payloads, attachment assembly, provenance round-trip,
  staleness partition, URL parsing.
- [`tests/pr-context-runtime.test.ts`](../../tests/pr-context-runtime.test.ts) —
  the `gh` fetch with an injected runner: metadata-only index, selected-checks-only
  log fetch, oversized and hostile fixtures, argument-injection attempts through
  `details_url` and `headSha`.
- [`tests/pr-context-ipc-contract.test.ts`](../../tests/pr-context-ipc-contract.test.ts) —
  the full renderer → preload → IPC schema → main → host-service chain, the two
  argument schemas, and the consumer wiring.
