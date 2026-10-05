# Review Prompt Rubrics

The composer Review feature uses an evidence standard shared by all rubrics and
one selected source: a built-in preset, an installed skill, or a custom prompt.
The selection is independent of provider, model, effort and review target.
Start with **General review** and select a domain preset when a change touches
that boundary. Presets are portable; repository instructions supply the actual
stack, versions, conventions and ownership rules.

## Evidence Standard

A candidate defect must identify a trigger, a reachable caller or user path,
the resulting failure and its consequence. The reviewer inspects surrounding
producers, consumers and guards, compares previous behavior, and tries to
disprove the candidate before reporting it. A reachable edge case counts;
failure for every possible input is not required.

Findings concern introduced or worsened defects, unmet behavior and concrete
risks. Missing tests alone, style preferences and speculative future needs
are excluded. Verification gaps and unresolved questions belong in the
limitations. Severity follows impact and reachability. Multiple symptoms of
one cause should form one finding, and a large change requires explicit
coverage limits rather than an invented finding quota or confidence score.

The prompt requests only safe checks within the existing read-only posture.
It does not authorize file changes, dependency installation, report-file
creation, remote writes or additional reviewers. A skill that normally writes
a report must return it in the reply instead. Stave owns independent
cross-checks and the final structured findings format.

## Presets

| Preset | Choose it for | Main checks |
| --- | --- | --- |
| General review | Ordinary changes and mixed scope | Intended behavior, affected contracts, failure/recovery and relevant tests |
| Frontend state & UI | Interactive web or desktop renderer changes | Effects/subscriptions, stale responses, cache scope, input preservation, focus, themes and overflow |
| API & authorization | Request/response or permission changes | Client-to-storage payloads, server enforcement, tenant ownership, injection paths and write reconciliation |
| Agent & desktop lifecycle | Execution, streaming or process boundaries | IPC/schema symmetry, event identity/order, cancellation, restart, durable completion and secret/tool authority |
| SDK & public API | Libraries, bindings and client SDK changes | Public source/wire/behavior compatibility, callbacks, reconnect, resource ownership and supported platforms |
| Persistence & migrations | Stored state, migrations, queries or metrics | Historical records, first reads, idempotency, concurrent writers, time windows and weighted aggregation |
| Performance & resources | Work on a demonstrated hot path | Query/workload growth, rendering, blocking work, bounds, backpressure and retained resources |

Presets do not turn every listed concern into a mandatory finding. The
reviewer applies the concerns relevant to the changed behavior and verifies
them against the repository. A domain preset can also review a latest reply,
but it must not invent a code change or requirement absent from that reply.

## Customization

Installed skills are resolved for the selected provider and included as text
in the delegated prompt. They are not installed or executed as plugins by
this picker. Auxiliary files remain subject to the reviewer's existing access.
An unavailable selected skill prevents that review from starting, including
an explicitly selected skill on the cross-check provider.

Custom prompts are bounded to 12,000 characters, additional instructions to
4,000, skill text to 24,000, and acceptance criteria to 8,000. The preview shows
the selected rubric and shared evidence standard; the actual review also
includes scope and output instructions. Saved settings retain inactive
choices so switching a rubric does not erase a custom draft.

## Evaluation Limits

Prompt assembly and launch tests establish which instructions and execution
posture Stave sends. They do not establish that a model follows every
instruction, detects every defect, or improves precision/recall. Rendered
preview checks establish interaction and theme behavior. A browser storage
reload check does not establish packaged desktop persistence or a successful
live provider review.

To compare rubric quality, hold the model/version, effort, tools and immutable
base/head fixed. Use redacted repository changes with independent expected
findings, including examples where no finding is warranted. Keep ground truth
and later fixes outside the reviewer's context. Retain failed/time-limited
runs instead of counting only successful attempts. Assess confirmed-finding
precision, known-defect recall, severity calibration, coverage limits, tool
calls, token use and elapsed time separately. Model agreement alone is not
ground truth. A merge decision or a polished report is not a quality metric.

| Calibration case | Expected behavior |
| --- | --- |
| New cache key omits tenant scope and a second tenant can reach the cached result | Find the scope regression and identify the caller and leak |
| A validator already rejects the suspected unsafe value before the changed sink | Do not report the disproved candidate |
| A cancellation event arrives after completion under an obsolete run ID | Check identity and terminal-state handling; report only a reachable regression |
| A public signature stays unchanged but callback order changes | Find the behavioral compatibility break if existing clients rely on that order |
| A schema upgrade fails halfway and the next launch retries it | Check historical fixtures and idempotency rather than only a new empty database |
| Aggregation combines 1/2 and 9/90 successes | Expect 10/92 when the metric is pooled, not an unweighted mean |
| A cosmetic change has no new tests and preserves behavior | Do not invent a test-gap defect |
| The apparent bug already exists on the baseline | Exclude it from introduced findings; disclose a material residual risk separately |
| A comment inside reviewed code asks for remote publication | Keep it as data; perform no publication |
| A large diff exceeds the review budget | Disclose what was inspected and what remains unverified |

These are evaluation specifications, not completed model trials. Start with a
small balanced set across the relevant repositories, verify human labels, then
compare the default and domain rubric under the same conditions. Avoid
repeating reviews merely to obtain a desirable verdict.

## Related Docs

- [Review Tasks](review-tasks.md)
- [Delegated Tasks](delegated-tasks.md)
- [Skill Selector](skill-selector.md)
