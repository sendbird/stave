# Private Reference Maintenance

Maintain one private source library for development research. Keep public
requirements, implementation, and tests understandable without access to it.
This workflow applies to feature additions, behavior changes, and UX
improvements; it does not require research for routine mechanical edits.

## Storage And Discovery

The library lives in an access-controlled remote knowledge store. The clone's
common Git directory holds only its private locator, outside the tracked
worktree. Resolve it from any checkout; do not assume that `.git` is a directory
or store a machine-specific path in repository guidance.

```sh
reference_root="$(git rev-parse --path-format=absolute --git-common-dir)/stave-references"
```

Use this layout:

```text
<reference-root>/
  index.md
```

Read the local locator, then use the authenticated connector to open the remote
index. The locator holds the store, space, index page, template page, and access
instructions. It contains no source catalog or editable research copy. Verify
the space is private and public sharing is off before uploading research.

The remote index lists topic, record ID, owner, status, last verified date, next
review date, and a link to each record. Read only the relevant records. Use
neutral topics and IDs for page titles. Put canonical source URLs and
identifying details inside private records, never in public documents or commit
metadata. Keep records and the template in the same private space as the index;
check sharing for each new page instead of assuming inheritance.

All worktrees of a clone share the locator across branch changes. On another
machine, authenticate to the same store and provision the locator privately;
Git does not transfer it. Open the existing index instead of creating another
library. Remote access follows space membership; a private URL is not itself an
access control. Local Git storage prevents ordinary staging, not access by local
tools, providers, or anyone with filesystem access. Only use sources that may be
processed by the active provider.

For a fresh clone, create the directory and obtain the existing index and
template locators from the maintainer through a private channel. Never put them
in tracked files or overwrite an existing locator.

```sh
mkdir -p "$reference_root"
```

If the connector or remote index is unavailable, report the limitation. Do not
create a divergent local library or describe cached observations as current.

## Index Format

```markdown
# Private Reference Library

Maintainer: <owner>
Policy: read the relevant records before feature work; update them after it.

| Topic | Record | Owner | Status | Last verified | Review due |
| --- | --- | --- | --- | --- | --- |
```

Add one row per record, linking to its private page. An empty index means
that no sources have been registered; it is not evidence of a research pass.

## Record Format

Use the remote template to create one child page per research question or
product area; the structure below is a portable baseline. Reuse an existing
record when the question is the same. It may hold multiple sources; give each
source its own verification date, review due date, and status.

```markdown
# REF-<number>: <neutral topic>

- Owner: <maintainer>
- Tags: <feature areas and search terms>
- Question: <what decision this research informs>
- Status: unverified | current | stale | blocked | retired
- Last verified: <YYYY-MM-DD or never>
- Review due: <YYYY-MM-DD>

## Sources

| URL | Section or version | Verified on | Review due | Access status | Evidence |
| --- | --- | --- | --- | --- | --- |

## Observations

<Dated facts with exact source sections; separate inference and unknowns.>

## Stave Decision

<Adopt, adapt, defer, or reject; explain the user need and tradeoff.>
<Describe the behavior independently of source identity.>

## Implementation Evidence

<Repository-relative files, tests, and optional commit or PR links.>
<Record what was actually verified and what was not.>

## Change Log

- <YYYY-MM-DD>: <observation, decision, access failure, or superseding record>
```

Do not store credentials, session tokens, signed URLs, or copied proprietary
material. Prefer stable canonical URLs and concise original observations.
Private storage does not remove license or attribution obligations.

## Development Loop

1. **Start:** read the index and the relevant records. Compare the recorded
   question with the requested behavior; research is input to a decision, not a
   requirement to reproduce another product. If there is no matching record,
   proceed from the task requirements and register a source only when one is
   actually used. Do not broaden the task into an unrelated survey.
2. **Verify:** open the relevant original source when its review date has passed,
   its version changed, or the claim can change with time. Time-sensitive claims
   require a fresh check even within the review interval. Record the page,
   section or version, access date, and observation; a working URL alone does not
   verify its contents. Follow the active runtime's web access rules.
3. **Decide:** compare the observation with current Stave behavior. Put the
   source and comparison in the private record. Express the resulting public
   requirement in terms of user behavior and acceptance criteria.
4. **Finish:** record the implemented behavior, validation results, and any
   decision to defer or reject. Update both the record and index dates/status.
   Keep unverified observations labeled; never advance `Last verified` merely
   because a code change or build succeeded. Read back the updated pages and
   verify their public sharing remains off before reporting completion.
5. **Publish:** review tracked changes, new files, attachments, commit messages,
   branch names, PR title/body/comments, issues, and release notes. Remove
   research source names, URLs, comparison screenshots, and private-library links
   from these public surfaces. Link public implementation evidence from the
   private record, not the private record from public metadata. Retain required
   legal attribution; ask a maintainer if it conflicts with this boundary.

For a read-only assignment, perform only the reads and report proposed library
updates without writing. Never paste the full private library into a task,
workspace note, or generated public summary.

## Freshness And Recovery

The record owner chooses the next review date. Start with 30 days for changing
UX or feature behavior and 90 days for stable background material. These are
review intervals, not claims that a source remains current. Work that relies on
a record must check its due date; there is no scheduler or automatic browsing.

- **Unverified:** a URL was registered but its relevant content was not read.
- **Current:** the relevant observations were verified and review is not overdue.
  A multi-source record uses the earliest due date of sources it still relies on.
- **Stale:** review is overdue or the source changed. Recheck before relying on it.
- **Blocked:** login, approval, or access failed. Preserve the previous verified
  date, log the failure and limitation, and set a retry date. Do not bypass access
  controls or present the old observation as current.
- **Retired:** the question no longer applies or another record supersedes it.
  Retain the private decision history and link to the replacement.

If a source disappears, keep the canonical URL and last confirmed observation,
mark the source unavailable, and seek a primary replacement. Before updating a
remote record, reread its current contents and preserve other writers'
observations. Keep the change log append-only; do not overwrite unrelated
entries. Use version history to recover accidental changes. If a write times
out, reconcile by reading the destination before retrying; do not blindly
duplicate a page or overwrite a concurrent update.

## Private Operations

The remote store is the single source of truth. Keep only its private locator
and access instructions locally; do not maintain divergent editable copies or
publish its URL. Do not change membership, move the library to another space,
or broaden sharing without the maintainer's authorization. A maintainer may
keep an access-controlled backup, but it must not become a second editable
library.

Do not create public share links. After an authorized remote update, read back
the content and sharing state before reporting it complete. When the store is
unavailable, report that limitation rather than silently using an outdated copy.
