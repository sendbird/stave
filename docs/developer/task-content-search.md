# Local task content search

The main process owns the derived SQLite index. Renderer requests pass strict
shared Zod schemas through preload and IPC; responses are validated in main,
preload and the renderer helper. No provider request is made.

Only user/assistant prose and readable tool names enter the index. Tool inputs,
outputs, thinking, attachment data and secret-request metadata are excluded.
Common credential patterns in prose are redacted; this is not a guarantee that
arbitrary credentials pasted into ordinary prose can be identified.

The main process alone creates and builds the derived tables. The host service
only writes messages. Pure SQL triggers record message IDs in a durable queue;
they never call runtime functions, so connections without search support can
still save and delete. Opening the store replaces prior function-calling triggers.
Deletion cleans up derived task and message rows, including direct task deletes.

Backfill runs in batches of at most 25 messages with a 4 ms extraction budget.
A shared monotonic cursor advances only after commit. An extractor version in
content_search_migration resets the derived index for background rebuilding when
the extraction policy changes. Lock contention retries initialization and batches.
Main checks the queue every second. Completion marks queued messages ready;
otherwise entries wait three seconds after their last update. A task vocabulary
is rebuilt once its queue drains, rather than on every streaming update.
Only unfinished backfill reports incomplete status. UI polls status and searches
once on completion, retaining the current Find selection and page.

Requests are limited to 50 results and an offset of 10,000. Cross-task results
use a compact task-level vocabulary index to select candidates by relevance and
recency. Each vocabulary preserves whole words once, including Korean and
partial-word candidates. Exact message checks reject words that occur only
across different messages, fill each page, and compute match counts and the
best snippet. Dirty tasks are checked immediately through the message index,
then rebuilt asynchronously. Single-task results are in message order.
A 150 ms cooperative SQL budget interrupts expensive scans with an explicit
failure. The UI suggests a more specific phrase. The budget includes metadata enrichment and sorting. Registry, workspace and
latest-turn metadata are cached for 500 ms; parent lookup uses an expression
index. SQLite internals and shared machine scheduling can still extend wall time.

Historical message windows are separate from the live transcript used by replay
and persistence. Message-ID paging loads a bounded anchor window; older/newer
paging and Back to latest avoid hidden gaps in the displayed conversation.

## Measurement

A same-session comparison on a synthetic database with 2,000 tasks and 200,000
messages measured the following. The updated run overlapped browser validation;
these are observed wall times, not an isolated-machine guarantee.

| Metric | Previous head | Review fixes |
| --- | ---: | ---: |
| Structure initialization | 21.02 ms | 28.80 ms |
| Index build | 14,717.83 ms | 6,228.09 ms |
| Longest batch | 28.84 ms | 12.13 ms |
| Derived database growth | 265,351,168 bytes | 71,426,048 bytes |
| Successful measured queries | 140 | 140 |
| Query p95 range | 0.06–2.55 ms | 0.36–7.04 ms |

Disk growth is SQLite page count times page size after indexing minus the seeded
source database, including index tables and their indexes. The maximum batch
includes extraction, SQLite writes/commit and task-vocabulary refresh.
The benchmark uses a generous test-only query deadline to measure successful
queries; production retains its 150 ms cooperative budget.

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
