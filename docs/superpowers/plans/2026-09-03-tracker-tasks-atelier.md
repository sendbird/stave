<!-- doc-path-check: external-repository -->

# Crane Stave Tasks — Cross-Repository Record

Stave's Tasks surface reads Crane tickets through connector-authenticated routes
that Crane serves. This note records the boundary between the two repositories so
a later change to either side can find the other.

**Status:** both halves implemented. The Atelier half was built in its own
workspace on branch `feat/crane-stave-tasks-api`, against a task-by-task plan
with server names verified in place; that plan is the authoritative server-side
spec and lives in the Atelier repository at
`docs/superpowers/plans/2026-09-03-crane-stave-tasks-api.md`. Do not restate it
here — a second copy would drift.

## The Boundary

The contract is `crane-tasks-v1`, and its JSON fixtures are duplicated verbatim
in both repositories on purpose:

- Stave: `tests/fixtures/crane-tasks-v1/*.json`, asserted by `tests/crane-tasks-contract.test.ts` against `src/lib/tracker-tasks/contract.ts`
- Atelier: `apps/crane/tests/fixtures/crane-tasks-v1/*.json`, asserted against the Crane contract module

Both sides validate **every** fixture, including the family the other side
authored. That matters: for a while each suite read only its own family, so the
two schemas drifted apart while both stayed green — a nameless account, an
over-long label, a non-https avatar, and an uncapped subtask count were all
emittable by the server and rejected by the client, and the server's semantic
label colours were dropped by a client that expected CSS. Reading the other
side's fixtures is what makes "the fixtures are the arbiter" a fact.

**A change to either copy is a change to both.** If the two ever disagree, the
fixtures are the arbiter, not either implementation.

### One deliberate asymmetry

The server validates its own output with `.strict()`; the client strips unknown
properties instead of rejecting them. That is not drift. The server must never
ship a field it did not mean to, and the client must not break when a newer
Crane adds one — asserting symmetry would force a lockstep release for every
additive server change. `invalid-list-forbidden-property.json` therefore fails
on the server and is *accepted with the extra key stripped* on the client. The
denylist is unaffected: a property naming a local path, a command, a provider
runtime, or a credential is still rejected before any field is read.

### Label colour

Crane stores label colour as one of seven semantic tokens — `neutral`,
`accent`, `info`, `warning`, `warm`, `success`, `danger` — not as a CSS value.
Stave maps them onto its own theme tokens, so the dot repaints with a custom
theme and no external string reaches a style attribute. A tracker that does send
a CSS colour (a hex or `rgb()`) still works; `resolveTrackerLabelColor` decides
which of the two it is.

## Routes

All three require `Authorization: Bearer <stc_ secret>` with the `crane` scope,
and are gated on the Crane-side feature flag.

| Route | Purpose | Stave caller |
| --- | --- | --- |
| `GET /api/crane/stave/tasks` | The calling user's assigned tickets, cursor-paginated | `listCraneTasks` |
| `GET /api/crane/stave/tasks/:ref` | One ticket plus its description | `getCraneTask` |
| `POST /api/crane/stave/tasks/:ref/stave-jobs/claim` | Queue and claim a job for a run Stave is starting | `createCraneTaskJob` |

All three live in `electron/main/atelier-connector/http-client.ts` on the Stave
side, with the per-call response byte budgets the contract declares.

Two properties of the claim route matter to Stave and must survive any
server-side refactor:

- The response carries `nextSequence`, and Stave posts its first receipt at
  exactly that number. The reply shape is otherwise identical to the existing
  dispatch claim, which is why the receipt loop needed no new client code.
- `running` is accepted as the *first* receipt for a connector-created job. A
  Crane-initiated job's first receipt follows approval in Crane; a
  Stave-initiated one was already approved locally, so requiring an earlier
  state would reject every one of them.

Conflict codes arrive as 409 and are distinguishable only from the body, which
is why Stave reads the body rather than mapping the status:
`job_already_active` when the ticket already has a live job, and `task_closed`
when the ticket is done or closed. The route can also answer `invalid_request`
(400), `job_create_failed` (500), and `platform_db_unbound` or
`invalid_dispatch_base_url` (503). Stave does not branch on any of them — a
failed claim becomes `crane_claim_failed` — so the list is documentation, not a
dependency.

## Stave Side

- Model, contract, and pure UI logic: `src/lib/tracker-tasks/`
- Jira Cloud connector (independent of Crane): `src/lib/jira-connector/`, `electron/main/jira-connector/`
- Sources, refresh runtime, kickoff: `electron/main/tracker-tasks/`
- Cache and kickoff rows: `electron/persistence/tracker-tasks-store.ts`
- Surface: `src/components/layout/tasks/`
- User guide: `docs/features/tasks.md`
- Invariants: `docs/architecture/contracts.md`, "Tracker Tasks Contract"

Until the Crane routes are deployed, the Crane source reports itself as
`unpaired` or surfaces its request failure per source, and the Jira source is
unaffected. Nothing in Stave changes when they land.
