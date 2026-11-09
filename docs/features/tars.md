# Tars

Tars is your personal representative in Stave: one ongoing conversation,
reachable from every workspace, where you ask about your work, shape plans and
hand over outcomes. When you explicitly ask it to do something, it delegates
the work to a supervised agent team in an isolated copy of your repository,
follows it until the result is verified and comes back to you when a decision
is needed. Its name, instructions, conversation and responsibilities persist
across workspaces, tasks and restarts.

## How it works

1. **You talk.** Open **Tars** at the top of the sidebar and write. There is
   no task, workspace, form or mode to choose. Questions, status requests and
   discussion are simply answered; they start no work.
2. **Tars proposes.** When you explicitly ask for work, the reply proposes one
   or more bounded work units, each with a title, an instruction, required
   acceptance criteria, a priority, a registered target workspace,
   optionally a named agent, and a one-line reason the flow block shows under
   **Tars decision**. If the goal or the target is unclear, Tars asks
   instead of guessing. Tars reasons over a bounded summary of your
   repositories, workspaces and work that Stave supplies; it has no file,
   shell or MCP tools of its own.
3. **The host admits or refuses.** Before anything runs, Stave's host checks
   every unit: the workspace is registered and its repository resolves, a
   named agent exists, is allowed and is suitable, and the units fit the turn
   limit. Each unit's outcome appears under the reply as admitted or refused
   with a translated reason. Admission is not completion.
4. **New workspace in the repository.** Each admitted unit gets a new
   workspace of its own in the target repository, created from the target
   workspace's branch (or the repository's default branch when the target has
   none). Its branch follows the repository's **Kickoff branch naming rule**
   in repository settings (without one, a Conventional Commits prefix such as
   `feat/` or `fix/` and a short description): Tars proposes the name, and
   Stave keeps only git-safe characters and adds a short suffix, for example
   `fix/billing-export-empty-3fa9c1`, so the new workspace never reuses a
   branch or workspace you already have. Uncommitted changes in your
   workspace are not part of it unless you turn on **Include my working
   changes** next to **Send** for that message: then, when the work is
   admitted, Stave snapshots the target workspace's working tree (modified,
   staged and new files, and deletions; files your `.gitignore` ignores stay
   out) as a commit on top of its current commit, without changing your files
   or staging, and the new workspace starts from that commit. A tree without
   changes starts from the branch as usual. The choice is off by default and
   turns off again after each send.
5. **Execution lead and helpers.** The unit becomes a normal Stave task with
   an [agent run](agent-runs.md) led by the built-in Supervisor, Tars's
   execution lead. A named agent does the work stage; otherwise the lead
   chooses its own helpers from the built-in agents.
6. **Review and verify.** The run works, hands the result to an independent
   read-only Reviewer, then resolves findings and verifies. The Reviewer may
   run the repository's own test, lint and typecheck scripts (taken from its
   `package.json`) to check the evidence itself; it still cannot write files. The agent's own
   claim is not enough: Tars completes the work only when the final stage has
   a check Stave saw pass on the current revision, or a stage has a passed
   independent review. Otherwise it asks you whether to accept it.
7. **Report and publish.** A completed or ended run leaves a frozen **Result
   report**, its **Changes** and **Review**. Changes stay uncommitted in the
   Tars workspace until you decide. For completed, verified work, **Create
   draft PR** (or asking Tars, such as "open a draft PR for it") opens a
   confirmation card; only your confirmation on that card makes Stave commit,
   push the work's branch and open a draft pull request. See
   [Publish completed work](#publish-completed-work).

**Follow-ups.** Saved status changes appear in the conversation and the
**Work** tray without you asking. When a change needs judgment (the work
blocked, its run stopped to ask you, a completion could not be verified,
criteria were left unmet, or a plain wait went an hour without change), Tars
starts one **Automatic follow-up** turn of its own to explain and advise. See
[Automatic follow-up](#automatic-follow-up) for the exact rules.

**Ownership.** Work Tars delegated is held by Tars and carries a **Tars**
owner label in Fleet and on the task's run line. You can take it over at any
time; from then on it is yours, Tars no longer watches or resumes it, and only
an explicit **Hand back** returns it.

**Persistence and restart.** The conversation, settings, responsibilities,
decisions and their records are saved. After a restart Tars reconnects to the
same worktree, task and run instead of starting another copy. A reasoning
request that was interrupted is not run again automatically.

**When it runs.** Tars works only while the Stave desktop app is running. It
does not execute while Stave is closed or the computer is asleep; it catches up
when Stave starts again. The browser-only development runtime has no Tars
service.

## What it can do

- Answer questions about your work from what Stave observed, saying when an
  observation is stale or missing. General conversation works even before you
  add a repository.
- Turn an explicit request into one or more work units in registered
  workspaces, each with acceptance criteria and a priority, from a single
  message, starting from the branch or, when you ask, from your uncommitted
  changes.
- Hand a unit to a specific agent: the built-in Implementer, Debugger, UI
  Polisher, Reviewer or Researcher, or a saved agent you allowed.
- Run work by priority (higher first, oldest first on a tie) and change the
  order of queued work when you ask, from a queued card's **Do first** and
  **Do later**, or by dragging it in the tray.
- Supervise each unit through work, independent review and verification, and
  refuse to call it done on the agent's word alone.
- Ask you to choose between 2 to 4 options as a decision card you answer by
  click, key or a short word.
- Pause, resume, take over, hand back and cancel work, from a click or from
  your words ("stop it", "I'll take it from here", "take it back").
- Follow up by itself when work blocks, asks you, or cannot be verified, so
  stuck work does not wait for you to ask.
- Open a responsibility's report, changes, timeline or review beside the
  conversation, also on request ("show me the report", "what changed?").
- Commit, push and open a draft pull request for completed, verified work,
  each time only after you confirm its card.
- Quote selected diff lines into your message so you can ask about them.
- Recover saved work after a restart without duplicating it.

## Limits

- **No publishing on its own.** Delegated work does not commit, push, open
  pull requests, merge, deploy, send messages or spend money. Stave itself
  commits, pushes and opens a **draft** pull request only when you confirm a
  publish card, every time; there is no "always allow", and nothing is ever
  merged, deployed or force-pushed. Agents that publish or deliver outside the
  workspace, such as Shipper, are never used. This is enforced by refusing
  publishing agents and by authorizing no publishing stage; it is not a shell
  sandbox, so the task's provider permissions and safety controls still apply.
- **Only while Stave is open.** Nothing executes while Stave is closed or the
  computer is asleep, and Tars does not schedule wake-ups of its own.
- **One responsibility runs at a time.** Others wait in the queue, and a
  queued card names the work it waits behind. Work waiting for your answer
  gives up its slot to independent queued work. Only queued work can change
  its place; work that started keeps it, and priorities stay between 0 and
  100.
- **Reasoning has no tools.** Tars itself cannot read files, run commands or
  call MCP tools; it sees only the summary Stave supplies. Connected apps are
  not read merely because they are available.
- **Uncommitted changes only when you include them.** The Tars workspace
  starts from the branch, not from your working copy, unless the message had
  **Include my working changes** on. Then it starts from a snapshot taken when
  the work was admitted, not when you sent the message; later edits are not
  part of it. Ignored files, Stave's own `.stave` folder and changes inside
  submodules are never included.
  Every unit one message admits in the same workspace starts from the same
  snapshot.
- **Registered workspaces only.** Tars never invents a target, never silently
  picks the active workspace and does not adopt existing tasks.
- **Claude Code and Codex only**, for both the conversation and the work.
  Cursor, Kiro and OpenCode are not supported.
- **Agent allowlist.** Saved agents are usable only after you allow them in
  settings (none at first). The host still refuses an unsuitable one.
- **Turn limit.** Every work unit gets the whole turn limit (default 30, 1 to
  100); its run and its helpers share it. One message proposes at most 8
  work units.
- **Follow-up timing.** One follow-up per change. A running run whose stage
  stops to ask you is followed up at once; a plain wait (a paused run, a usage
  limit, a tool approval or question waiting in the task) only after an hour
  without change. At most six follow-ups start per hour, and automatic turns
  since your last action toward Tars stop at the turn-limit number. A
  follow-up never starts new work, pauses, takes over, hands back or accepts
  work as done.
- **Message limits.** A message holds up to 32,000 characters and at most 32
  messages can be outstanding. A message too long to sit in the run's
  8,000-character assignment reaches the run whole as context on every turn
  of its execution lead; nothing is cut. One reasoning attempt times out after 120
  seconds and is not retried automatically.
- **Settings apply forward.** Changing settings affects later messages and new
  work, not runs already admitted (removing an agent from the allowlist also
  applies to messages already sent).

## Quick start

### 1. Send a first message

Open **Tars** at the top of the sidebar and write as you would to a colleague.
For example:

- "What is running right now, and does anything need me?"
- "In the `web` workspace, fix the flaky date-picker test. Done means its
  test passes."
- "Add a `slugify` helper with unit tests in the `api` workspace. Use the
  Implementer."

Name the workspace and say what "done" means; Tars turns that into acceptance
criteria. If something is unclear it asks first. The first send saves the
conversation settings (see [Settings and models](#settings-and-models)).

An empty conversation offers a few example requests; pressing one puts its
full text in the message box without sending it. **How Tars works** below the
examples, and the help button in the Tars header at any time, show what Tars
can do and its limits in short form.

### 2. Answer decisions

A decision waiting on you is one card in the conversation. Answer it in
whichever way is handy:

- **Click** an option.
- **Keys**, while the card or one of its options has focus: **1** to **4**, or
  **Enter** for the focused or recommended option. **Esc** chooses **Not now**.
- **Words**: reply "1" to "4", or "yes", "ok", "네" and similar to pick the
  recommended option, when exactly one decision waits in Tars's newest message.

Cancelling and accepting as done are never chosen by default; pick them
explicitly. Details are in [Decisions](#decisions).

### 3. Control work

| Control | Effect |
|---|---|
| **Pause** | Holds the responsibility. A manual pause stays paused after a restart. |
| **Resume** | Continues paused or blocked work. Never continues work you took over. |
| **Take over** | Stops Tars's execution and makes the work yours; continue in its task. |
| **Hand back** | Returns work you took over; Tars verifies it again before completing. |
| **Cancel responsibility** | Ends supervision permanently. Changes, worktree, task and history stay. |
| **Cancel message** | Stops a queued or running reply. Admitted work is not undone. |
| **Do first** / **Do later** | On a queued card's more-actions menu: moves it ahead of the queued work before it, or behind the work after it. Dragging the card's grip does the same (see [Queue order](#queue-order)). |

You can ask in words too. Pause and take over apply at once; resume, hand back
and cancel wait for your **Confirm** on a card. **Stop** in a Tars task or in
Fleet pauses the work rather than cancelling it.

### 4. See progress

- **Conversation**: a flow block for each delegated unit, one-line status and
  control records, and **Automatic follow-up** turns. A message sent with
  **Include my working changes** carries that tag.
- **Work** tray: the header indicator ("1 running · 1 needs you") opens lanes
  **Needs you**, **Running**, **Done** and **Outputs**, each card with a live
  run monitor and, once its workspace exists, the work's branch; a **While you were away** summary leads it when you return.
- **Side view**: **Report**, **Changes**, **Timeline** and **Review** of one
  responsibility, opened from an output, a flow stage or your words.
- **Fleet**: the **Tars** owner label and **Tars decision** rows in
  [Fleet](fleet-needs-me.md)'s attention inbox.
- **Task**: **Open task** leads to the execution conversation, where you answer
  the run's tool approvals and questions.
- **Agents**: the Supervisor's **Work** list includes Tars's work once you turn
  on **Show Tars work**.

## FAQ and troubleshooting

**Tars answered but no work started.** Look at the outcome under the reply. A
unit may have been refused (with its reason), Tars may have asked a question
instead, or it treated the message as conversation; ask explicitly for the
outcome and name the workspace. Admitted work also waits while another
responsibility runs.

**My work was refused.** Common reasons: the workspace is not registered, the
named agent is unknown, archived, not allowed, publishing, fixed to another
provider or model than a pinned execution model, or needs more permission than
delegated work allows.

**My uncommitted changes are missing from Tars's work.** Tars starts from the
target workspace's branch unless you turn on **Include my working changes**
next to **Send** for that message; the switch turns off after each send. With
it on, the tray card says **From your working changes** with the snapshot's
short commit, or **No working changes to include** when the workspace had
none. Files your `.gitignore` ignores are never included. If Stave could not
take the snapshot, the work is refused with that reason instead of starting
from the branch.

**Where are the results?** In the work's own workspace (its branch follows
the repository's naming rule, with a short suffix), left uncommitted until you
publish them. Open **Changes** in the side view, or **Open task**.

**How do I get a pull request for Tars's work?** Choose **Create draft PR** on
the completed work's card in **Done** or in its report, or ask Tars ("open a
draft PR for it", "PR 올려줘"). Either way a confirmation card shows the
repository, base and head branch, changed files, the commit message and pull
request title you can edit, and the body. Press **Open draft PR** or Enter to
publish; Decline or Esc publishes nothing. The pull request opens as a draft
and is never merged by Stave.

**Publishing was refused or stopped.** The card or its line says why: the work
is not completed or was accepted without a Stave-verified check, it changed
since the card was shown, its workspace has no changes, it is not on its own
branch, the repository has no GitHub `origin`, or the GitHub CLI (`gh`) is not
installed or signed in. A step that failed (commit, push or the pull request)
offers **Retry**, which opens the card again and continues from that step.

**Why am I asked to "Accept as done"?** The run reported completion but Stave
saw no passing check on the final revision and no passed independent review.
Accept it, cancel it, or ask Tars for new verification work.

**Tars did not follow up.** It follows up once per change; plain waits wait an
hour; at most six follow-ups start per hour (the card shows **Next check**);
automatic turns stop at the turn-limit number until you act again; nothing
follows up while Stave is closed, for work you paused or took over, or for a
change you already wrote about.

**Stop paused the work instead of cancelling it.** That is intended while Tars
holds the work. Take it over or cancel the responsibility if you want it to
end.

**I cannot change the task's agent.** Changing it would end Tars's run. Take
the work over first.

**Hand back was refused.** The run already ended, is held for a reason only
its task can clear (such as its turn limit), or the final verification has no
attempts left. Open the task, or cancel and ask for new work.

**A message shows as interrupted after a restart.** Reasoning is never re-run
automatically, to avoid repeated cost. Send it again.

**Does Tars cost usage while idle?** Unchanged observations and reads start no
model call. Each message and each automatic follow-up is one call on the
conversation model; delegated work uses the execution model.

---

The sections below are the detailed reference.

## Conversation details

You can talk while delegated work runs, and switching workspaces keeps the
same conversation.

- Delegated work must target a currently registered workspace. Its repository
  is resolved and checked by the host before work is admitted.
- An answer describes a proposal; its action outcomes show whether each unit
  was admitted or rejected. Follow admitted work in the **Work** tray and its
  task.
- **Cancel message** stops queued or running reasoning. It does not undo
  already admitted responsibilities; use their own controls.

Messages, answers and action outcomes survive restart. If sending loses its
response, retry the unchanged draft to recover the same message. An
interrupted reasoning request is marked failed rather than run again: inspect
its saved state and send a new message. Reads and unchanged execution
observations do not start model calls.

## Delegation and execution

Each work unit's run gets the configured turn limit and shares it with its
supervised helpers. Local MCP must be
enabled for supervised runs to report their stages; when it is not, the run is
not admitted and the responsibility is blocked.

### Who does the work

Built-in agents that can take delegated work (Implementer, Debugger, UI
Polisher, Reviewer and Researcher) are always available. Your saved agents are
available only after you allow them under **Agents Tars may use** in Tars
settings; none are allowed at first. Agents that publish or deliver outside
the workspace, such as Shipper or a saved agent with a pull request or publish
stage, are never used: publishing happens only through a publish card you
confirm, and Stave, not an agent, carries it out.
When reasoning, Tars sees only the agents it may use, with each one's name,
kind of work, and "use when" and "don't use when" descriptions.

The host checks a named agent again before admitting the work. It refuses the
unit, with a translated reason in the conversation, when the agent:

- does not exist or is archived,
- is a saved agent you have not allowed, or you removed it from the list after
  the message was sent,
- publishes or delivers outside the workspace,
- cannot take delegated work on Claude or Codex, such as a primary-only agent
  or one fixed to another provider,
- is fixed to a different provider or model than a pinned execution model, or
- would run with more permission than Tars's delegated work allows.

The allowlist only offers active saved agents; ones that cannot take delegated
work or that publish are disabled there. Provider, pin and permission
conflicts are caught at admission, not in the list.

Right after Stave starts, saved agents are not known until the app has loaded
them. Work naming a saved agent waits for them and is then checked; it is not
refused just because they had not loaded yet.

Tars's execution lead runs as the built-in Supervisor agent. In **Agents**, the
Supervisor's **Work** list leaves out what Tars delegated, so your own
Supervisor work stays easy to find; once Tars has had work, turn on **Show Tars
work** there to include it.

Each responsibility owns a normal Stave task and agent run. It may create
tasks and isolated worktrees, execute, repair and review within the delegated
goal. The generated workflow authorizes no publishing action stage at
admission. Instructions describing the delegated scope are not an additional
shell sandbox; review the configured provider safeguards before leaving work
unattended.

## Follow and control work

The **Work** tray (**맡긴 일** in Korean) shows responsibilities, priority,
required criteria, status and any waiting or failure detail. Tars, Fleet and
the owner labels update as soon as Tars saves a change; nothing polls, and the
conversation also reads again when the window regains focus. Status sentences
Tars writes itself (such as "waiting for your answer or approval") appear in
the app's language; a reason the run gave in its own words is shown as
written. **Open task** leads to its execution conversation, where you answer
questions and approvals, give further direction and inspect the run's review,
report and check evidence.

A completed worker reply alone does not finish the responsibility: its run and
required acceptance report must also complete, and the report's "met" must
rest on more than the agent's own claim. The final stage needs a check Stave
saw pass on the current revision (`classifyStageEvidence` +
`isVerifiedEvidence`), or some stage needs a passed independent review.
Otherwise the responsibility is blocked with `unverifiedCompletion`; only the
user's `acceptCompletion` (a click, or a model proposal the user confirms)
completes it, recorded as `acceptedWithoutVerification`, and the run is not
touched. The conversation shows this as a [decision card](#decisions) with
**Accept as done**, **Cancel responsibility** and **Ask Tars for new
verification work**; the last only writes that request into the message box
for you to send. While it waits, pause, resume, take over and hand back are
refused for that work.

Control details beyond the [quick start table](#3-control-work):

- **Take over** keeps the run paused for you rather than ending it. Taking over
  a task's run from the task itself or from Fleet has the same effect (see
  [Controls from Fleet and the task](#controls-from-fleet-and-the-task)).
- **Hand back** continues within the same registered scope and, because you
  may have changed the result, completes the responsibility only after a final
  verification done after the hand-back. Handing back during the final
  verification restarts that verification. It is refused when the run already
  ended while you held the work, when the run is paused for a reason only its
  task can clear, or when the final verification has no attempts left.
- **Cancel responsibility** cancels a run still in progress but does not undo
  changes already made or delete its worktree, task or history.

When a control comes from the conversation, resume, hand back and cancel wait
for you as a decision card with **Confirm** under the reply; Tars's reply alone
never returns work to Tars or cancels it. Until you confirm or refuse it, such
a proposal counts as a Tars decision waiting on you; it stops waiting when a
newer proposal for the same work replaces it, when the work's revision changes
(any saved change to it), or when the work ends. Words and clicks go through
one host check: a control based on an outdated view, an unknown
responsibility, a resume of work you took over, or any control of ended work is
refused with its reason, and retrying the same request applies it at most
once. Each click adds a one-line record such as "Paused · click" to the
conversation; it is not shown as a message from you.

- Previously admitted runs can resume concurrently when their waits end.
- An unreadable task or run is shown as blocked rather than as completed.
  Open its task to inspect the cause; a refused control shows why.

### Queue order

Queued work starts by priority, higher first, and oldest first on a tie. In
the tray's **Running** lane, work that started comes first and queued work
follows in the order it will start. A queued card's more-actions menu offers
**Do first** (move it ahead of the queued work before it) and **Do later**
(behind the work after it), each only where it applies. Its grip moves it too:
drag it to another queued card, or focus the grip and press **Alt+Up** or
**Alt+Down**. Asking in words ("do the search fix first") still works and sets
the priority Tars proposes.

A move goes through the same host check as words: the work must be yours to
control through Tars, still queued and unchanged since you saw it, and its
registered workspace must still resolve. Stave computes the new priority from
the queue as it is when it applies the move: the middle between the two
neighbors, or ten past the neighbor at either end, within 0 to 100. Only the
moved work changes when such a priority exists (an equal priority is enough
when oldest-first already orders the pair); otherwise Stave renumbers as few
other queued items as it can, all in the one move. Each move leaves one line
such as "Moved earlier · click" with the new priority in the conversation, or
the reason it was refused. A move changes which work starts next, never work
already running.

### Run monitor and the "while you were away" summary

A tray card whose run Stave has read shows the run as it stands: the stage it
is on with the time since that stage's latest attempt started (a live clock),
one segment per workflow stage (done, in progress, not started, or stopped
short), the step count such as "2/3", and **Timeline**, which opens the side
view's timeline at that stage. Each card wears the same state tag (a still
state mark and the state's word) as the run panel and Agents. Values the run
did not record, such as a start time, are left out rather than shown as zero.

When the Tars view opens again after you were away (it was closed or the
window was hidden), a **While you were away** summary leads the tray: counts
of work that came to need you, ended unfinished (cancelled by something other
than your own cancel) or finished between the last time the view was visible
and now, and up to four of them, each opening its report or timeline. It is
dismissible, never shown on a first visit or when nothing changed, and the
last-visible time is kept in this device's local storage only.

### Results, changes and the side view

The tray's **Outputs** section lists what each responsibility produced: its
**Result report** once the run ended, its **Changes** when the run recorded
changed files, its **Review** once the independent reviewer reported, the
draft pull request Stave opened after you confirmed it, and the links the
run's report recorded, which open in the browser. The header indicator adds the outputs count only when there is at
least one; **Needs you** keeps counting Fleet's rows.

An output opens the side view: one panel about one responsibility, with a
switch between **Report**, **Changes**, **Timeline** and **Review** at its
top. In a wide Tars view (1,088 px or more) it takes the tray's column and the
tray folds to its header indicator until the side view closes; the
conversation never gets narrower than 440 px. In a narrower view it opens
between the conversation and the message box, at most 40% of the view's
height, and scrolls. Esc or the close button closes it and returns focus to
what opened it. Opening, switching and closing it are view-only and never
recorded in the conversation.

- **Report**: per acceptance criterion, its status and what decided it: the
  agent's report in a named stage, or a Stave check with its result, each with
  the workspace revision it was checked on and whether that is the revision the
  run ended on (or that the final revision is unknown). Evidence is listed once,
  under **Evidence reported in** the stage that reported it, labelled by source
  (**Verified by Stave**, **Provider result** or **Agent reported**); it is not
  tied to a single criterion. A criterion Tars delegated that the run never
  reported reads **Not reported**. The report is frozen when the run ends and
  says when; it then lists unmet criteria and what the run left behind. Work
  whose run has not ended has no report yet.
- **Changes**: the execution workspace's changed files since the run started
  and each file's diff, read the way Review reads them. Unlike the report this
  is the workspace as it is now, not frozen; **Refresh** reads it again. Select
  lines in the diff and choose **Ask about this** to put the file, the line
  range and the lines into the message box as a quote. Nothing is sent until
  you send it.
- **Timeline**: the run's stages with their attempts and what each produced,
  the run's own decisions (routes, waits, retries, account switches), the
  hand-offs and controls recorded in Tars, and the commands and tool calls,
  folded.
- **Review**: the reviewer stage's verdict, findings with their reasons and
  cited evidence, on the revision it reviewed.

In a delegated work flow, a stage opens its place on the timeline, the review
stage opens the review and completion opens the report. A blocked or stuck
stage shows its reason and opens the report on its unmet criteria. **Show in
Fleet** stays in each stage's menu and the tray card's menu.

A blocked card in the tray shows its reason and **Open report**, which opens
the report on its unmet criteria with the next steps the work admits, through
the same host check as the tray: **Resume**, **Take over** and **Cancel
responsibility**, or, for a completion Stave could not verify, its decision
card.

Words open it too: "show me the report", "보고서 보여줘" or "what changed?"
lets Tars propose a `show` of one responsibility's report, changes, timeline or
review. The host admits it only for a responsibility Tars holds for you; it
grants nothing, changes no work and its receipt only says what opened. A reply
opens at most one view, and reopening Tars never replays an earlier one.

### Publish completed work

Completed work that Stave verified can become a draft pull request, and only
through a confirmation card each time:

- **Words**: ask Tars to commit, push or open a pull request for one completed
  piece of work. Tars may propose a `publish` at the revision it saw; it is
  saved as proposed and shows as the card under the reply. An automatic
  follow-up can never propose it.
- **Click**: **Create draft PR** on a **Done** card or in the work's report
  opens the same card at the end of the conversation (or brings Tars's waiting
  proposal for that work into view).

The card shows the repository, the base branch (the source workspace's branch,
otherwise the repository's default branch), the head branch (the work's own
branch, `tars/<id>` for older work), the number of changed files, an editable
commit message and pull request title prefilled as a Conventional Commit
subject from the work's title (such as `feat: show the saved card first`; the
type is a choice on the card), and a preview of the body: each acceptance
criterion with its met or unmet status and the verification evidence from the
frozen report. A **Draft PR** tag and a **Can't be undone** tag say what it is.
Enter, while the card or one of its fields has focus, or **Open draft PR**
publishes; Esc or **Decline** publishes nothing and records nothing.

When you confirm, the host checks everything again from saved state, not from
the card or Tars's words: Tars holds the work, it is completed with Stave's
verification, its revision is still the one you saw, its execution workspace
exists and has uncommitted changes or commits ahead of the base, it is on its
own branch (never the base), and the repository has a GitHub `origin` that the
GitHub CLI can reach. Then, in the execution workspace, it runs `git add -A`,
`git commit`, `git push -u origin` of the work's branch (never forced) and
`gh pr create --draft` against the base, or records the pull request that
already exists for the branch. Each step is saved on the work, so **Retry**
continues where it stopped, and a restart in the middle turns it into a
retryable stop. The card folds to one line such as "Draft PR #12 opened ·
click"; the pull request becomes an output in the tray's **Outputs** and a link
in the report. Stave never merges, marks it ready or deploys.

### Decisions

A decision waiting on you is one card in the conversation, whatever asked it:

- a control Tars proposed that waits for **Confirm** (resume, hand back,
  cancel, accept as done),
- Stave's own choice for a completion it could not verify, and
- a question Tars asks when it needs you to choose: 2 to 4 options, each with
  a short label and a one-line reason, and a recommended option when Tars has
  one. An option either controls one responsibility at the revision Tars saw,
  or sends the option back to Tars as your answer. A question grants nothing
  by itself; choosing an option takes the same host check as a click.

While it waits, the card has a full attention outline and shows each option's
key. Answering is the same action three ways:

- **Click** an option.
- **Keys**, only while the card or one of its options has focus: **1** to
  **4** choose that option; **Enter** chooses the focused option, or the
  recommended one (without one, Enter on the card does nothing). Keys typed in
  the message box stay text; the card never takes focus by itself.
- **Words**: a short reply binds only when exactly one decision waits in
  Tars's newest message and you said nothing after it. "1" to "4" pick that
  option; an affirmative picks the recommended option (none recommended: not
  bound). Affirmatives are "yes", "y", "yeah", "yep", "ok", "okay", "sure",
  "응", "어", "네", "넵", "예", "그래" and "좋아", ignoring case and trailing
  punctuation. Otherwise the message goes to Tars as usual.

A confirmation, a proposed control or Stave's unverified-completion choice,
leads with what it does ("Cancel this work?") and the work it is about, then
rows for the repository, workspace, revision and effect when Stave knows them,
and a **Can't be undone** tag for cancelling or accepting as done. Its footer
offers **Not now** (Esc while the card has focus), which leaves the decision
waiting and moves focus to the message box, next to **Confirm** and its key.

Cancelling and accepting as done cannot be undone, so they are never a
default: they are never recommended (Stave drops such a recommendation and
keeps the question), Enter on the card never applies one, and an affirmative
never applies one. Choose them explicitly by click, by their number, or by
Enter on their own focused button.

Each answer folds the card to one line such as "Keep it running · click" (or
"· key", "· words"); a click or key is never shown as a message from you.
Answering twice applies once, and a different answer to an answered decision
is refused with that reason. If an answer is refused for a reason other than
the work changing or ending (for example the run could not be reached), the
card keeps the attempt on record and stays open, so you can try again or
choose another option. Answering one responsibility's proposal retires only
the other options for that same responsibility. A decision is bound to the
work its options control: when that work moves past the revision Tars saw, or
ends, the card says it is no longer valid, offers no buttons, and Tars asks
again by itself, at most once per reply and only while nothing newer was said.
That follow-up can only ask; it cannot act. Stave's unverified-completion
choice is not asked again: it simply stops waiting once the work changes. A
question stops waiting when you send another message.

Decisions about work also wait in the tray's **Needs you** and as **Tars
decision** rows in [Fleet](fleet-needs-me.md). Every Tars row there offers
**Open in Tars**, and a single proposal also keeps its **Confirm**. A question
about no particular work appears only in the conversation.

### Controls from Fleet and the task

Work Tars holds shows a compact **Tars** owner label in Fleet (Tree cards and
the open tree's header, Cards task rows, Table task cells, a row's control
panel) and on the run line above the task's composer. Stopping or taking over
that work, from anywhere, goes through the same host check as a click in Tars
and never cancels its run:

- Every **Stop** of the task's turn (the composer's Stop, Esc, the command
  palette's stop, the review status line, the composer shelf and the run line)
  pauses the responsibility, then stops the in-flight turn. The run stays
  paused for Tars to resume; it is not cancelled or released.
- In a Fleet row's control panel, **Pause** pauses the responsibility and
  **Take over** is Tars's takeover. The attention band opens the same panel.
- On the task's run line, **Take control** is Tars's takeover. It keeps the
  run paused for you instead of ending it and releasing the task's agent.
- Each control adds a one-line record to the conversation with where it came
  from, such as "Paused · Fleet" or "Paused · task view". A refusal shows its
  translated reason where you pressed it. When Tars refused the pause or could
  not be asked, the run goes on, so its automatic turn keeps running; only a
  turn you started yourself stops.
- Changing or clearing the task's agent in the composer's picker is refused
  while Tars holds the work, because it would end Tars's run. Take the work
  over first, then change the agent.

Once Tars has the work paused, **Stop** ends only your own in-flight turn: no
Tars control is sent, nothing is recorded, and the paused run is kept. Tars
holds a task through its own run: once Tars lost the task, a run you start
there is yours everywhere (no **Tars** label, and Stop cancels it as before).
Before acting, a control reads ownership again, so it names the current
revision and never misses newly delegated work. If ownership cannot be read
and the last snapshot or the run's own Tars marker shows Tars holding the
work, the run is kept and the reason is shown. Work you took over, ended work
and work Tars does not hold keep their usual controls: **Stop** there cancels
the task's run and ends the turn as before. Answering, approving, steering and
queueing a reply stay task actions and are not recorded in the conversation.
The owner label is read when Fleet, a control panel or a run line opens, and
again whenever Tars saves a change; it does not poll.

Tars reconciles the stable worktree, task and run references after restart
instead of starting another copy. If Stave stopped after a run was created but
before that was saved, Tars finds and adopts the same run, with the evidence it
already has, instead of creating another. The host reads execution snapshots
every five seconds; an unchanged observation does not start another model turn.

### Automatic follow-up

Tars records each change it observes in a responsibility. Changes it can settle
by itself (verified completion, a pause or a takeover) are applied and shown as
a one-line notice at most. A change that needs judgment starts one automatic
follow-up turn of Tars's own, so blocked work does not wait silently for you to
ask:

- the work became blocked,
- its run stopped its own stage to ask you for a decision: the stage blocked,
  got stuck or awaits your sign-off while the run is still running. A helper
  the run delegated to counts the same way when its stage asks you, since the
  run waits for that helper. Tars shows the work as waiting for you and follows
  up at once, not after the quiet hour, and the tray's **Needs you** counts the
  helper's row that Fleet shows. When the stage blocked on an acceptance
  criterion, the reason Tars reads says whether the stage report marked it
  **Not met** or **Not verified**; a report that left a required criterion out
  or reworded it is refused while the run's turn is still going, so it does
  not reach you,
- its run reported completion Stave could not verify,
- it ended with required criteria unmet or a verification older than a hand-back,
- it waited an hour without any change (a turn the run took counts as a
  change) in a plain wait: a run you paused, a run paused for a usage limit or
  another run pause, or a tool approval or question you answer in its task
  (or in the task of a helper the run delegated to), or
- a question Tars asked became invalid because its work changed.

The follow-up appears in the conversation as **Automatic follow-up ·** its
reason and the work's title (in Korean, **자동 후속 ·**), never as your words.
It goes through the same queue as your messages: it is only added while none
of your messages can start, and a follow-up still queued starts nothing once
you have written to Tars about the change. It may ask a question, propose a
resume or cancel that waits for your **Confirm**, or open a view. It never
changes a priority, because that applies at once; it can ask whether you want it. It never starts work by itself: to suggest new work it asks, for
example "Start new work to fix it?", and only your answer can lead to it. It
never pauses, takes over or hands back anything, never offers accept as done
(or repeats the cancel Stave's own unverified-completion card offers), and
proposes nothing about work you paused or took over, or that ended, including
when that happened while Tars was thinking. The run's own words reach Tars only
as an untrusted observation. A change you already wrote about after it
happened starts nothing, and a follow-up whose change is no longer current
just before Tars would think about it is cancelled without a model call ("Tars
did not follow up: the work changed before it could."). That check runs again
right before the model call.

Each change gets one follow-up, however often the host sees it again. A stage
that asks you is one change until the run continues: new words from the same
stage start nothing more, and it gets no second follow-up after an hour; if the
run takes another turn or starts the stage again and asks again, that is a new
change, even when Stave did not see it running in between. If the follow-up
for an ask never reached Tars (for example, you wrote to Tars about it first),
the ask still gets the one follow-up after an hour without change. Several
changes of the same work are combined into one. Follow-ups are limited:

- At most six start in any rolling hour across all work, counted when Tars
  actually starts thinking, not when the follow-up was queued; one cancelled
  before Tars thought about it does not count. Re-asks after an invalidated
  question count too. Starts are counted from the time Stave began recording
  them; inbox rows written by earlier development builds are not migrated.
  Past that, the change waits, and the work's tray card says when Tars looks
  next.
- Automatic turns (follow-ups and re-asks) are counted since your last action
  toward Tars: a message, an answer, a **Confirm** or any control click in
  Tars, Fleet or the task. When their number reaches the turn limit in
  settings, Tars stops following up and says so in the conversation and on the
  card; your next action starts the count again. This count is separate from
  the turns of delegated work, which it does not use up. Each follow-up is one
  call on the conversation model.

A waiting card shows **Next check** with the time Tars follows up if nothing
changes before then; it never shows a time that has passed, and shows nothing
once that wait was followed up or when the run's stage asked you (that was
followed up when it asked). Processed changes older than 30 days are removed
when Stave starts; unprocessed ones are kept.

## Settings and models

Open the settings button (**Conversation settings**) in the conversation
header to change the name, standing instructions, conversation model and
account, execution model, the agents Tars may use and the turn limit per work
unit.
Until you change them, the conversation uses Codex when it is available
(otherwise Claude Code) with that provider's model from your app settings, and
a turn limit of 30; the first send saves these choices for the conversation.
Saving settings affects later messages and new work, not already admitted
runs. Instructions do not grant new permissions.

The **Conversation model** is used only for talking with Tars, including its
automatic follow-ups. Delegated work runs separately:

- **Execution model: Automatic** (the default) forces no model. Stave Auto
  routes each turn of the work on the conversation's provider and account, and
  helpers, including the reviewer, can run on the other provider so the
  review is independent of the provider that wrote the change. With Stave Auto
  turned off in Settings, the work stays on the provider's default model.
- **Pinning an execution model** runs the work, its helpers and its review on
  that model and its provider at the model's default effort. A pin on the
  other provider runs with that provider's System default account.

Conversation delegation keeps the selected account; other conversation runtime
preferences, including its reasoning effort, are not copied into supervised
work. A task's completion report remains distinct from host-verified checks or
a live external outcome. Use [Fleet](fleet-needs-me.md) for the detailed
cross-workspace attention inbox.

## Live verification

`tests/e2e-electron/tars-live-provider.electron.e2e.ts` runs Tars against the
installed Claude Code (and once Codex) binaries with their existing sign-ins,
in a throwaway Git repository and an isolated Stave profile. It is skipped
unless you opt in, because every scenario spends real usage:

```sh
bun run build:desktop
STAVE_TARS_LIVE_E2E=1 STAVE_TARS_LIVE_RESULTS=/tmp/tars-live.json \
  bun run test:e2e:electron tests/e2e-electron/tars-live-provider.electron.e2e.ts -g "A:"
```

`STAVE_TARS_LIVE_CLAUDE_MODEL` picks the conversation and pinned execution
model (default `claude-sonnet-5-5`); the turn limit is capped at 12 and each
scenario at 25 minutes. Each scenario records every expectation with its
evidence, turns, wall time and the run's recorded cost, appends that entry to
`STAVE_TARS_LIVE_RESULTS`, then fails if any expectation failed.

- **A, words**: a message asks for a small function and its test. Tars
  delegates, the run goes work → review → verify, completion needs a passing
  check Stave observed on the final revision or a same-revision passed
  review, the frozen report lists every criterion with its source, the flow
  block, tray and Fleet agree, nothing is committed. A Codex conversation
  then opens the report with a `show`.
- **B, clicks**: pause, resume, take over, a refused resume while taken
  over, and hand back, each a click record in the conversation; the hand-back
  restarts the final verification before completion.
- **C+D, a failing decisive check and a restart**: the required check cannot
  pass without editing generated files the repository forbids. Stave is
  closed while the first turn runs and relaunched on the same profile: the
  same responsibility, task, run, worktree and conversation continue, with no
  copy. The work never completes and no model call repeats while nothing
  changes.

Latest results (2026-11-06, Claude Sonnet 5.5 pinned, Codex for one
conversation turn; details in `.stave/context/plans/tars-live-results.json`):
A and B passed every control and completion expectation (A about $2.5–2.7 and
3–4 run turns, B about $1.9 and 5 run turns). B's last recorded run failed one
expectation, "Fleet shows the Tars owner label on the running work", and has
not been run again since, and in both A runs the read-only reviewer helper was
refused shell access, so it relied on the lead's check evidence. The runs
found that a
repository registered through a symbolic link (macOS `/var` → `/private/var`)
lost its Tars work on restart and never showed it in Fleet, because the
worktree's workspace id was derived again from Git's resolved path; worktree
discovery now keeps the registered path, and A, C and D pass after the fix.
When the agent itself blocks on the failing check, Tars shows the work as
waiting for you, so its automatic follow-up came only after an hour without
change; a stage that asks you is now followed up at once (see Automatic
follow-up). One planner turn failed once without a recorded cause.
