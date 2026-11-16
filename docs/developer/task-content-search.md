# Local task content search

The main process owns the derived SQLite index. Renderer requests pass strict
shared Zod schemas through preload and IPC; responses are validated in main,
preload and the renderer helper. No provider request is made.

Only user/assistant prose and readable tool names enter the index. Tool inputs,
outputs, thinking, attachment data and secret-request metadata are excluded.
Common credential patterns in prose are redacted; this is not a guarantee that
arbitrary credentials pasted into ordinary prose can be identified.

FTS5 trigram is preferred. Older SQLite runtimes retain an ordinary FTS5 index
or fall back to a plain table. Substring queries use LIKE when the tokenizer
cannot support them, including two-character queries. Message triggers update
the derived rows inside the original write transaction. Task/workspace deletion
also removes documents. Archive does not delete message history.

Existing messages are backfilled in resumable batches of at most 50 rows with
an 8 ms extraction budget, yielding between batches. A SQLite commit or index
merge can extend a batch beyond that extraction budget. Search shows progress
and refreshes while migration is incomplete. Newly written messages are indexed
immediately. The migration cursor advances only after its batch commits. Transient database
locks retry with a bounded delay; closing the store cancels pending retries.

Requests are limited to 50 results and an offset of 10,000. Cross-task results
use a compact task-level vocabulary index to select candidates by relevance and
recency. Each vocabulary preserves whole words once, including Korean and
partial-word candidates. Exact message checks reject words that occur only
across different messages, fill each page, and compute match counts and the
best snippet. Dirty tasks are checked immediately through the message index,
then rebuilt asynchronously. Single-task results are in message order.
A 150 ms cooperative SQL budget interrupts expensive scans with an explicit
failure. The UI suggests a more specific phrase. SQL budget checks sample
document row IDs; scheduling, sorting, metadata reads and SQLite internals can
extend wall time beyond that budget.

Historical message windows are separate from the live transcript used by replay
and persistence. Message-ID paging loads a bounded anchor window; older/newer
paging and Back to latest avoid hidden gaps in the displayed conversation.

## Measurement

On the development machine, a synthetic database with 2,000 tasks and 200,000
messages took 34.75 ms to initialize index structures and 51,305.78 ms to build
both indexes in 4,466 batches. The longest observed batch was 182.05 ms,
including SQLite commit/index work and scheduling. Other workspace checks were
active during measurement; no claim of isolated-machine timing is made.

All 140 measured queries succeeded. Query p95 times were 1.77 ms for a selective
identifier, 0.15 ms for no matches, 4.58 ms for a common Korean phrase, 4.48 ms
for two Korean characters, 7.11 ms for a common two-word phrase, 4.92 ms for a
common word, and 4.97 ms for a partial word. The benchmark uses a larger timeout
to measure completed queries, not timeout responses. An earlier message-only
aggregation design reached 269 ms p95 under shared load; the task-level index
removes that aggregation from cross-task queries.

The native tests cover all tokenizer modes, an existing file reopened during
backfill, message/task/workspace mutations, archive, delegated cross-workspace
parents, ranking/pages, safe extraction and application-store anchor paging.
Browser tests use synthetic bridge responses; packaged application testing is a
separate validation boundary.

Reproduce the synthetic benchmark with `bun run scripts/benchmark-content-search.ts`.
It creates a temporary on-disk SQLite database, seeds 2,000 tasks and 200,000
messages, measures startup and every indexing batch, then runs 20 measured
queries per phrase after three warm-up reads. Query timings require successful
responses and use a generous test-only deadline so timeouts cannot appear as
fast results. Production searches retain their shorter execution budget.
