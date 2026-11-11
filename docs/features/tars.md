# Tars

Tars is your personal representative in Stave: one ongoing conversation,
reachable from every workspace, where you ask about your work, shape plans and
hand over outcomes. When you explicitly ask it to do something, it delegates
the work to a supervised agent team in an isolated copy of your repository,
follows it until the result is verified and comes back to you when a decision
is needed. Its name, instructions, conversation and responsibilities persist
across workspaces, tasks and restarts.

The header's **How Tars works** button explains giving a task, following its
progress and checking the result in three steps. Confirmation requirements and
keeping Stave open stay visible; **More about running tasks** expands the remaining
conditions. Selecting a request example fills the composer without sending it.
Icon buttons show their action in a tooltip on hover or keyboard focus,
including the header, side views, question navigation and attachment removal.

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
   shell or MCP tools of its own. When there is more work than the summary
   holds (20 pieces), it keeps the work your message names by title or id
   first, then work that has not ended (running, waiting on you, blocked,
   paused, queued), then the most recently updated ended work, and says how
   many it left out.
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
   changes**, the icon button next to **Send**, for that message: then, when
   the work is admitted, Stave snapshots the target workspace's working tree (modified,
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
blocked, its run's stage stopped to ask you or at one of Stave's own checks, a completion could not be verified,
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

## Attach files

Use **Attach files** beside **Send**, or drop or paste files onto the input.
Text files and PNG, JPEG, GIF and WebP images are supported, including files
outside a registered workspace. You can attach up to eight files: text is
limited to 32 KB total; images to 4 MB each and 6 MB total. Remove a file with
its chip's remove button before sending. Unsupported or oversized selections
show an error and leave the existing draft intact.
Files with the same name stay separate; a number distinguishes their attachment names.

Stave saves the selected contents with the message and passes them to the
conversation model. A retry uses the same snapshot; switching workspaces or
reopening Stave preserves the attachment names in the conversation. The
conversation itself shows each attachment as a chip with its name, type and
size, never its contents: the saved contents, such as an image's data, are not loaded again every
time the conversation refreshes, and Stave reads them only for Tars's own
reasoning turn on that message and for the first turn of the work it delegates. Attached
material supplies context and does not authorize delegated work on its own.
You can discuss attachments without text; to start work, include a written
instruction with them. The host refuses delegation from an attachment-only message.

The attachments also reach the work the message delegates, so you can send a
screenshot with "fix this" and the agent doing the work sees it. Each work
keeps a reference to the message's attachments, never a copy: their content
stays saved with the message, and the work's run reads it for its first turn
only, as attached files and images (images as image input on Claude and Codex,
text files the way the task composer sends them). Later turns of that run do
not send them again, and the run's helpers receive only what the lead passes
on. When one message starts several works, each carries every attachment
unless Tars gives a work only the ones it needs, for example one screenshot per
bug; a work Tars gives an attachment the message does not have is refused with
that reason. Queued work keeps the reference through a restart, and starting
queued work now sends them the same way. If the saved attachments cannot be
read when the run's first turn starts, that turn does not start and the stage
waits with the reason, instead of running without them. The **Request** view
lists the attachments a work carries by name, and Tars sees their names when it
reports on the work.

## What it can do

- Answer questions about your work from what Stave observed, saying when an
  observation is stale or missing. General conversation works even before you
  add a repository.
- Clear this conversation, or the ended work in the panel's **Done** and
  **Outputs**, when you ask; it shows a card first and only your **Clear**
  hides anything. See [Clear the conversation and the panel](#clear-the-conversation-and-the-panel).
- Set up work that runs later or repeats, when you ask: "every weekday at 9,
  check the release branch", "tomorrow at 3 pm look at this again". It shows a
  card first, and only your confirmation creates, changes, pauses or removes
  a schedule. See [Schedule work](#schedule-work).
- Turn an explicit request into one or more work units in registered
  workspaces, each with acceptance criteria and a priority, from a single
  message, starting from the branch or, when you ask, from your uncommitted
  changes.
- Hand a unit to a specific agent: the built-in Implementer, Debugger, UI
  Polisher, Reviewer or Researcher, or a saved agent you allowed.
- Run work by priority (higher first, oldest first on a tie) and change the
  order of queued work when you ask, from a queued card's **Do first** and
  **Do later**, or by dragging it in the tray. Start queued work at once,
  beside the work already running, from **Start now** or your words ("run it
  now", "대기 중인 거 강제로 실행해").
- Do what you would do to the run in its task, from your words: give a run
  paused at its turn limit more turns, retry a blocked or stuck stage, skip
  the current stage, sign off a stage waiting for your approval, or resume a
  run paused by a usage limit. Each waits for your confirmation on its card.
- Answer what waits in the work's task from your words: approve or deny a
  tool approval, answer a question the run asked, send your words to the run
  as your reply ("tell it to use the existing index"), or request changes on a
  stage waiting for your sign-off. Denying applies at once; the rest wait for
  your confirmation on a card that shows the exact request, answers or words.
- Supervise each unit through work, independent review and verification, and
  refuse to call it done on the agent's word alone.
- Ask you to choose between 2 to 4 options as a decision card you answer by
  click, key or a short word.
- Pause, resume, take over, hand back and cancel work, from a click or from
  your words ("stop it", "I'll take it from here", "take it back").
- Follow up by itself when work blocks, asks you, or cannot be verified, so
  stuck work does not wait for you to ask.
- Open a responsibility's request (your message, Tars's instruction and the
  completion criteria), report, changes, timeline or review beside the
  conversation, also on request ("show me the report", "what changed?").
- Commit, push and open a draft pull request for completed, verified work,
  each time only after you confirm its card.
- Quote selected diff lines into your message so you can ask about them.
- Act as independently as you choose: one setting with three levels decides
  what Tars applies at once and what waits for you, and **Never do** rules in
  your own words make Stave ask first. See
  [How independently Tars acts](#how-independently-tars-acts).
- Show what it knows and what its work spent: the standing instructions, the
  agents it may use and each repository's branch rule and memory, and tokens,
  turns and time by work and by model. See
  [What Tars knows, and usage](#what-tars-knows-and-usage).
- Summarize what happened while you were away, in one card where you left the
  conversation.
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
  computer is asleep. Tars runs no scheduler of its own: scheduled work is a
  schedule in Stave's Schedules, which runs only while Stave is open and runs
  a missed occurrence once when it opens.
- **Scheduled runs are tasks, not Tars work.** A run a schedule starts is a
  normal task in the workspace you named, in the Guided permission mode. It
  gets no new branch, no Tars review or verification and no Tars report.
- **Independent work runs concurrently.** There is no cap unless you set
  **Settings → Concurrent responsibilities** to a positive number; then work
  beyond it waits in the queue, and a queued card says only the reason Stave
  observed (the limit, a busy database, or not confirmed). Work waiting for
  your answer gives up its slot. Only queued work can change its place; work
  that started keeps it, and priorities stay between 0 and 100. **Start now**
  starts the work you chose even when the limit is reached.
- **Reasoning has no tools.** Tars itself cannot read files, run commands or
  call MCP tools; it sees only the summary Stave supplies. Connected apps are
  not read merely because they are available.
- **Uncommitted changes only when you include them.** The Tars workspace
  starts from the branch, not from your working copy, unless the message had
  **Working changes** on. Then it starts from a snapshot taken when
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
  follow-up never starts new work, starts queued work now, pauses, takes over,
  hands back, skips a stage or accepts work as done.
- **Answers in the task are once and yours.** Tars answers a tool approval
  once, never with an "always allow" rule, and only for a request it observed
  in the work's own task or the task of a helper its run delegated to. An
  approval waits for your confirmation (**Approve**) and is never a recommended or default
  choice. Your words reach the run only while no turn runs in its task;
  otherwise say them in the task or ask again after the turn.
- **Never through Tars.** Merging, deploying, force-pushing, deleting
  branches, worktrees or tasks, "always allow" rules, spending money and
  messaging other people are not available through Tars at all.
- **Message limits.** A message holds up to 32,000 characters and at most 32
  messages can be outstanding. A message too long to sit in the run's
  8,000-character assignment reaches the run whole as context on every turn
  of its execution lead; nothing is cut. One reasoning attempt times out after 120
  seconds and is not retried automatically.
- **Settings apply forward.** Changing settings affects later messages and new
  work, not runs already admitted (removing an agent from the allowlist also
  applies to messages already sent, and a more careful autonomy level or a new
  **Never do** rule applies from Tars's next decision).

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

An empty conversation, and one you cleared, shows a start screen:

- a greeting with the name you gave Tars;
- **Right now**: how many pieces of work need you, are running and finished
  in the last day. Each count opens its section of the work list (**Needs
  you**, **In progress**, **Done**) and moves focus there. Counts of zero are
  left out, and the line is hidden when there is nothing to count;
- **Try asking**: example requests grouped by what Tars can do: hand off work,
  schedule work, check or steer work, decide and answer, open results, publish,
  and tidy up. Pressing one (or Enter on it) adds its full text to the message
  box and focuses it; nothing is sent until you send it. Handing off and
  scheduling work are offered only when a repository is registered, and an
  example a suggestion chip already asks about your real work is left out;
- **Where Tars can work**: the names of up to four registered repositories and
  how many more there are, or, with none, how to add one (**Open repository**
  in the sidebar).

The help button in the Tars header shows what Tars can do and its limits in
short form at any time.

### 2. Answer decisions

Waiting decisions and publish confirmations appear one at a time above the
message box, with their position and total count. **Previous waiting item** and
**Next waiting item** move between them without submitting; your selected option
and edited publish words stay with each card. Answering advances to the next
waiting item. A failure or refused attempt stays on its card. History keeps the
question and **Review above message box** while it waits, then the settled record.
Long cards scroll inside the dock so the message box remains reachable.

Answer whichever way is handy:

- **Click** an option to choose it, then **Answer**.
- **Keys**, while the card or one of its options has focus: **1** to **4** or
  the arrow keys choose an option, and **Enter** answers with it. The
  recommended option starts chosen, so Enter alone answers with it. A
  confirmation's single button answers with **1**. **Esc** chooses **Not now**:
  it leaves the item waiting and moves to the next item, or back to the message
  box when it is the only one.
- **Words**: reply "1" to "4", or "yes", "ok", "네" and similar to pick the
  recommended option, when exactly one decision waits in Tars's newest message.

Cancelling and accepting as done are never chosen by default; pick them
explicitly. Details are in [Decisions](#decisions).

### 3. Control work

| Control | Effect |
|---|---|
| **Start now** | The main action on a queued card: starts that work at once, beside work already running, bypassing the configured admission limit. Other queued work keeps its priority and follows normal admission. |
| **Pause** | Holds the responsibility. A manual pause stays paused after a restart. |
| **Resume** | Continues paused or blocked work. Never continues work you took over. |
| **Take over** | Stops Tars's execution and makes the work yours; continue in its task. |
| **Hand back** | Returns work you took over; Tars verifies it again before completing. |
| **Cancel work** | Ends supervision permanently. Changes, worktree, task and history stay. |
| **Cancel message** | Stops a queued or running reply. Admitted work is not undone. |
| **Do first** / **Do later** | On a queued card's more-actions menu: moves it ahead of the queued work before it, or behind the work after it. Dragging the card's grip does the same (see [Queue order](#queue-order)). |

You can ask in words too ("run the queued work now", "바로 실행해"). Start now,
pause and take over apply at once; resume, hand back and cancel wait for your
confirmation on a card. **Stop** in a Tars task or in
Fleet pauses the work rather than cancelling it.

Words also reach what you would do to the run in its task. Each waits for your
confirmation, and the run checks its own state again, so a command that does not
fit (for example, sign-off while no stage waits for it) is refused with
"The run cannot do this in its current state":

| Ask | Effect on the run |
|---|---|
| "Give it more turns" (**Add turns**) | A run paused at its turn limit gets 10 more turns and continues. |
| "Retry it" (**Retry stage**) | A blocked or stuck current stage starts a fresh attempt. |
| "Skip this stage" (**Skip stage**) | The run moves past its current stage. It cannot be undone, so it is never the recommended choice. |
| "Approve it" (**Approve stage**) | A stage waiting for your sign-off starts. |
| "Resume it" (**Resume**) | Also continues a run paused by a usage limit or an expired wait. Over a run whose stage waits for an answer, resume is refused: retry, skip or answer in the task instead. |

None of these apply to work you took over, including a run you took over in
its task before Tars noticed, or to work you paused through Tars: resume it
first.

Requests waiting in the work's task (or a helper's task) appear in what Tars
observes, so you can answer them in the conversation:

| Ask | Effect in the task |
|---|---|
| "Approve it" / "Deny it" (**Approve request** / **Deny request**) | Answers one tool approval once. Deny applies at once; approve waits for **Approve** on a card that shows the request as a code block labelled with its tool, with its line breaks. A request longer than 500 characters ends in "…" with a note that only its start is shown and **Open task**, which opens the task where it waits so you can read it whole. |
| "Answer existing" (**Answer question**) | Answers one question the run asked; the card lists each question and its answer. |
| "Tell it to …" (**Send to task**) | Sends your words to the run as your reply in its task; the card shows the words. While a turn runs there, Stave keeps them and says them once that turn ends (see below). |
| "Ask it to change …" (**Request changes**) | On a stage waiting for your sign-off: the stage before it runs again with your feedback (at most 2,000 characters). |

Words you confirm while the work's task is in the middle of a turn are not
refused. Stave keeps them with the confirmation and says them in the task as
your reply exactly once, after that turn ends and nothing else waits there (a
paused run keeps them until it resumes). Under the card a line says **Waiting
for the run's current turn to end**, then **Said in the task after its turn
ended**, or that they were not said and why: taking the work over, cancelling
it or its completion first cancels them, and so does its run ending or
changing owner; a run that refuses them leaves them **Not said in the task**.
Several are said in order, each after the turn the previous one started; words
you confirm while earlier ones for the same work still wait are kept behind
them even if the task is free by then. One work's words never wait for
another work: each is said on its own, however many other works are paused or
busy. They survive a restart: before saying them Stave names the turn they
start, so words that were being said when Stave stopped count as said only if
the run took that very turn (another reply you typed in the task does not
count), and are otherwise said once after the restart, provided the work is
still Tars's. Taking the work over, cancelling it or accepting it also cancels
words that were being said and did not reach the run, and handing the work
back never says words kept from before you took it over. Your words are only
your reply in the task: they grant no permission and never answer a waiting
approval or question.

A request that is no longer waiting, or a set of requests that changed since
you saw it, is refused instead of answering something else. These answers are
confirmed only on the conversation card that shows them: the tray and Fleet
name the waiting proposal and lead you to Tars instead of offering
**Confirm**. A stage command applies only to the stage attempt Tars had observed at
the revision you saw; if the run moved to another stage or attempt since, it
is refused as changed, so a confirmed skip never skips a later stage.

New queue-move records offer **Undo**, which restores the earlier priorities,
including any neighboring work that the move renumbered. A pause or takeover
of queued work also offers **Undo** if execution had never started. Undo
refuses if the work, its queue or its registered scope changed meanwhile; it
never overwrites newer work. Older records without saved prior values, active
run controls, starts, task replies, completion decisions and publication have
no Undo. Clearing keeps its separate Undo.

### 4. See progress

- **Sidebar**: the **Tars** entry shows the number of running work with the
  moving running mark and an amber count of what needs you; collapsed, one dot
  (amber when something needs you, otherwise the running color).
- **Conversation**: a flow block for each delegated unit, with the state's mark
  and the work's observation line visible while folded, one-line status and
  control records, and **Automatic follow-up** turns. A message sent with
  **Working changes** on carries that chip; where a reply Tars is still
  writing will appear, **Thinking** shimmers beside the moving mark.
- **Composer**: while work runs, the band above the message box names each
  running piece of work (two at most, then a count), its stage and what Stave
  last observed, with **Timeline**.
- **Work** tray: the header indicator ("1 needs you · 2 in progress · 3 done")
  opens lanes **Needs you**, **In progress**, **Done** and **Outputs**, each card
  with a live run monitor, what Stave observed and its recent progress, and,
  once its workspace exists, the work's branch.
- **While you were away**: when you return after ten minutes or more, one
  summary card sits in the conversation where you left.
- **Side view**: **Request**, **Report**, **Changes**, **Timeline** and **Review** of one
  responsibility, opened from an output, a flow stage or your words.
- **Fleet**: the **Tars** owner label and **Tars decision** rows in
  [Fleet](fleet-needs-me.md)'s attention inbox.
- **Task**: **Open task** leads to the execution conversation, where you answer
  the run's tool approvals and questions.
- **Agents**: the Supervisor's **Work** list includes Tars's work once you turn
  on **Show Tars work**.

While work runs, its card shows the current attempt’s latest linked turn’s selected model and effort below the branch, for example **GPT-6.1 Sol · High**. An unreported effort is omitted; without a model selection the card says **Checking model**. These are routing selections, not provider-confirmed execution values. Paused, queued and ended work does not show a current model.

Use the **Group by project** icon beside the Work tray title to fold work and outputs by project within each lane. Its tooltip names the option, and it highlights while grouping is on. The title row stays above the scrolling list without a separate toolbar row. Project counts count work cards or outputs, not attention requests. Registered project names are used when available, otherwise the repository folder name; missing ownership appears as **Unknown project**. Queued work stays outside project groups in its existing order across all projects; drag and earlier/later actions still change that global queue. Lane filters, Clear and Undo keep their existing scope. The grouping choice lasts while the tray is open.

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
target workspace's branch unless you turn on **Working changes** next to
**Send** for that message; the toggle turns off after each send. With
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

**Your draft is kept.** What you type in the message box, with its
**Include my working changes** choice, stays when you leave Tars for a
workspace and after Stave restarts. Attached files stay with it while Stave is
open, but are not saved across a restart: attach them again after one. Files
still being read hold **Send** until they are attached, even if you leave Tars
and come back. A
message Tars saved clears the draft. A send that fails keeps it, so you can
retry or edit it; a retry of the unchanged draft, with the same files, is the
same request, so a send whose response was lost cannot become a second
message. Editing the words, the choice or the attached files makes it a new
message. If the draft cannot be saved when you press **Send**, nothing is
sent: the send shows as failed and the draft stays, so a restart cannot send
the same words twice. If it cannot be saved when Stave quits, Stave says it
could not save your latest workspace changes or Tars draft and offers **Keep
Stave open**, **Retry saving** or **Quit without saving**.
Answering a decision with a short word clears the word only once the answer
is taken.

**Reading the conversation.** Your messages sit on the right in a bubble only
as wide as their words, with their files (name, type and size) and the
**Includes working changes** chip above it. Tars's replies start on the left,
without a bubble or a name line; screen readers announce each side by name. A
thin rule names each day (**Today**, **Yesterday**, then the weekday and
date). A message's clock time ("2:32 PM") shows beside your bubble, on its
last line, while you hover or focus the message, so it never moves the text;
focus or hover the time for the full local and UTC time. Records sit on a
timeline rail between messages: the first record of a run shows its time, and
later ones show theirs on hover or focus.
Until Tars replies, its place shows the message's state: **Thinking**,
**Queued** or **Cancelled**, with **Cancel message** as an icon button beside
a message in progress. Text follows the chat font size setting, as in a task.
Prose keeps a readable line length;
code blocks and tables may use a wider measure when the window has room, and a
long code line scrolls sideways inside its block instead of widening the view.
**Include my working changes** is an icon button at every width, like
**Attach files** and **Send**; hover or focus it to see its name and what it
does. It looks pressed while it is on.

Messages, answers and action outcomes survive restart. If a send fails, a
notice at the end of the conversation says so and **Retry** sends the
unchanged draft again as the same message, so a send whose response was lost
is recovered rather than duplicated. A message Tars could not answer shows a
notice in place of its reply with the reason; an interrupted reasoning request
is marked failed rather than run again. **Edit and resend** puts the message's
words (and its working-changes choice, but not its files) back in the message
box to send as a new message. Reads and unchanged execution
observations do not start model calls.

### Suggested requests

While the message box is empty, up to four suggestion chips sit above it,
built from the work as Stave last read it, most useful first and at most one
per piece of work: **What needs me?** when anything waits on you, how the work
Tars just delegated is going, why blocked work stopped, **Resume** paused work,
**Start … now** for queued work (or all of it), **Open a draft PR** or **Show
the report** for work that completed in the last day, **What finished today?**
when several did, and how running work is going. A long title is shortened on
the chip; the words it inserts keep the whole title. Pressing a chip (or Enter
on it) only puts its words in the message box and focuses it: nothing is sent
until you send it, and the chips step aside while the box holds words. No chip
is offered before the work was read, and ended work the tray cleared is not
suggested.

## Clear the conversation and the panel

Clearing hides; it never deletes. Every clear leaves a record with **Undo**
(for the conversation, **Restore**), and survives a restart.

- **Conversation.** **Clear conversation** (the eraser in the header) asks
  first, then hides the conversation so far: the start screen returns and Tars's
  recent conversation memory starts fresh, so its next reply does not draw on
  the hidden messages. Your work, the requests that admitted it, decisions and
  records stay saved and Tars still knows your work. Some things always stay
  in view: a message still queued or being answered (and its reply, even when
  it arrives after the clear), a question or confirmation still waiting for
  you, a draft PR or clear proposal still waiting for its card, and words
  still waiting to be said in a task. The record at the top says how many messages it hid;
  **Restore** brings them back.
- **Done and Outputs.** **Clear** in the tray's **Done** section hides ended
  work's cards; **Clear** in **Outputs** hides ended work's outputs. Only ended
  (completed or cancelled) work is hidden; running, waiting, paused, blocked
  and taken-over work never is, and neither is completed work whose draft PR
  is still committing or pushing, failed and waiting for a retry, or proposed
  and waiting for your confirmation. The section then says how many ended
  items it hides, with **Undo** for the latest clear; clearing the conversation
  afterwards keeps that **Undo**. Hidden work stays in Fleet
  and in its task, and Tars can still report on it.
- **By asking.** Say "clear the chat", "대화 지워줘", "done 정리해줘" or
  "clear everything". Tars proposes a clear card that says nothing is deleted,
  then lists what each part would hide now and what always stays; **Clear**
  (Enter) applies it through
  the same path as the buttons, **Not now** (Esc) leaves everything as it is.
  Tars never proposes a clear on its own initiative, and an automatic
  follow-up cannot.
- **Retention.** **Keep ended work in the panel** in settings hides ended
  work's card and outputs once the work last changed more than that many days
  ago: 1, 3, 7 (the default), 14 or 30 days, or **Until I clear it**. It is
  judged each time the tray is read and needs no background job; work a clear
  never hides is never aged out either. Choosing **Until I clear it** shows such
  work again.

## Schedule work

Ask Tars for work that should run later or repeat, and it sets up a schedule
in Stave's [Schedules](automations.md). Tars does not run a scheduler of its
own: the schedule is an ordinary start-a-task schedule that Schedules stores,
fires and shows, and each run is a normal task in the workspace you named.

- **By asking.** "Every weekday at 9, check the release branch", "tomorrow at
  3 pm look at this again", "매주 월요일 아침 9시에 의존성 업데이트 확인해줘".
  Tars proposes a schedule card. Nothing is created until you confirm it.
- **The card** is laid out like every confirmation card. It leads with what
  will happen, then states what will run (the request each run gets, in plain
  words) and when: the rule, and the next two runs in this computer's local
  time with the time zone's name. The schedule's name is the chip under the
  title, and its name and where it runs (the workspace, its branch and
  repository) are under a collapsed **Details**. A new schedule is saved **paused**, as every schedule an agent
  proposes is: **Create** (Enter) keeps it paused until you turn it on, and
  **Create and turn on** enables it to run at the shown times. **Not now** (Esc) leaves everything as
  it is. The same request confirmed twice (a retry, a double click) creates
  one schedule.
- **What a run does.** At its time the Schedules service starts a new task in
  that workspace with the saved request, in the **Guided** permission mode
  (the run asks you before a risky action) and one run at a time: a run due
  while the previous one is still going is skipped and says so. The run is a
  task of that workspace, not Tars work: it does not get a new branch, Tars's
  review and verification stages or a Tars report, and it is not counted
  against **Concurrent responsibilities**. The run uses the execution model
  you chose for Tars, or the conversation's provider on its default model.
- **In the conversation.** Each run a Tars schedule starts leaves a record
  whose actor is the schedule (a calendar mark, "A schedule started this, not
  you"), which follows the run to finished, failed or skipped and opens its
  task. Your confirmation of a card, and the pause switch, are recorded as
  your own actions.
- **Change, pause, turn on, remove.** "Pause the release check", "move it to
  10:30", "remove that schedule". Each shows its own card with what the
  schedule is now and what it will be; removing cannot be undone (its run
  history in Schedules goes with it), so the card says **Can't be undone**,
  **Remove** is red and it is never the Enter default.
- **Only schedules Tars created.** A schedule you made in Schedules is yours:
  Tars refuses to change, pause, turn on or remove it and says so. A schedule
  Tars created that you later edited in Schedules (its name, request, where or
  when it runs, or its permission mode) is yours too; turning it on or off
  there is not an edit. A schedule removed in Schedules is refused as removed.
- **The list.** Under the tray's lanes, **Schedules** lists the ones Tars
  created with their rule, where they run, the next run, the last outcome and
  a switch that pauses or turns one on. **Open Schedules** opens Stave's
  Schedules screen, where every schedule, its editor and its run history
  live. "Show my schedules" opens the list.
- **Refused with a reason.** A one-time time that has passed, a date or time
  that cannot be read or does not exist on this computer's clock (such as
  inside a daylight-saving jump), a repeat rule Schedules cannot run, an
  interval under one minute, and a workspace that is not registered are
  refused when proposed, and again when you confirm, with the reason.
- **Never on its own.** Tars proposes a schedule only when your own message
  asks for one. An automatic follow-up can never propose, change or list one.

**Times.** A repeating rule is a local wall-clock rule ("every weekday at
09:00"). Schedules resolves it in this computer's time zone on every run, so
it keeps 09:00 across daylight-saving changes, and follows the computer if its
zone changes. A one-time run is saved as one instant in UTC and shown in local
time. The supported repeat rules are those of Schedules: every N minutes,
hours, days or weeks, with a time of day for days and weeks and chosen
weekdays for weeks. "The first Monday of the month" or "the last day of the
month" cannot be expressed.

**Only while Stave is open.** A run missed while Stave was closed happens
once when it opens.

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
the app's language. When a run stops or is cancelled with a reason in its
own words, or a stage's turn could not start, the card says so in the app's
language and keeps the run's or provider's own words, untranslated, under
**Technical details**. Other reasons the run gave in its own words are shown
as written. **Open task** leads to its execution conversation, where you answer
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
**Accept as done**, **Cancel work** and **Ask Tars for new
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
- **Cancel work** cancels a run still in progress but does not undo
  changes already made or delete its worktree, task or history.
- **Start now** applies only to queued work you delegated earlier: right after
  the control settles, Tars prepares the worktree and task and starts the run
  outside the configured admission limit, so it runs beside work already
  running. Pause or cancel still apply while it prepares.
  It does not change the priority or the order of the rest of the queue. If
  preparation fails, the work is blocked with its reason. If a restart or a
  database lock interrupts preparation, it continues like any interrupted
  preparation in its reserved slot. Started, paused, blocked or
  taken-over work is refused (`notStartable`). An automatic follow-up never
  proposes or offers it.

When a control comes from the conversation, resume, hand back and cancel wait
for you as a decision card under the reply, its button named by the action (**Resume**, **Hand back**, **Cancel work**); Tars's reply alone
never returns work to Tars or cancels it. Until you confirm or refuse it, such
a proposal counts as a Tars decision waiting on you; it stops waiting when a
newer proposal for the same work replaces it, when the work's revision changes
(any saved change to it), or when the work ends. Words and clicks go through
one host check: a control based on an outdated view, an unknown
responsibility, a resume of work you took over, or any control of ended work is
refused with its reason, and retrying the same request applies it at most
once. Each click adds a record row to the conversation: the control, the
work, where it came from and its outcome, such as "Pause · Verify the release
candidate · click · Applied"; it is not shown as a message from you.

- Eligible independent responsibilities start concurrently by default, including
  isolated worktrees of the same repository. No portfolio cap is imposed unless
  **Settings → Concurrent responsibilities** is a positive integer; `0` (the
  default, including earlier saved settings without this field) adds no cap.
  This is separate from the per-run turn budget and team helper limits.
- A configured cap counts running work, preparation and uncertain execution
  receipts. Waiting work yields its slot; admitted runs may resume when their
  own constraints clear. Lowering the cap does not interrupt admitted work.
- Tars prepares, observes and controls each responsibility on its own queue, so
  slow worktree or task preparation, a denied scope or an unavailable provider
  for one responsibility does not hold back another's preparation. The runs
  underneath do the same: each run starts, advances, takes a reply and takes
  pause or cancel on its own queue, so a slow task read, start or update of one
  run never delays another responsibility's run start, words or control. Two
  operations on the same run still happen one after the other, in the order
  they were asked. Task/run identity checks, SQLite write transactions, native
  provider/account limits and same-task duplicate protection remain in force.
- Queued cards display the scheduler's observed active count and configured
  cap, or an observed database lock with automatic retry. Before observation,
  the reason is explicitly unconfirmed. A different running task alone is never
  evidence of a blocking dependency. These live facts use `queueWait` on the
  responsibility snapshot; they do not add timeline events or imply progress.
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
other queued items as it can, all in the one move. Each move leaves a record
row such as "Do first · Refresh the API reference · click · Priority 70 ·
Applied" in the conversation, or **Not applied** with the reason on the line
under it. A move changes which work starts next, never work
already running.

### Run monitor and the "while you were away" summary

A tray card whose run Stave has read shows the run as it stands: the stage it
is on with the time since that stage's latest attempt started (a live clock),
one segment per workflow stage (done, in progress, not started, or stopped
short), the step count such as "2/3", and **Timeline**, which opens the side
view's timeline at that stage. Every card, queued work included, also has
**Request**, which opens what the work was handed (see
[Results, changes and the side view](#results-changes-and-the-side-view)). **Request** and **Timeline** are icon
buttons at the end of the card's footer, named by their tooltips, so the card's
actions keep to one line. The work's branch is the line under the owner, in the
code face at the same small size. What waits on you sits in a shaded area right
above the actions. A Tars decision is one line: an amber mark (read aloud as
"Tars decision waiting") and the proposal's own text, with **Can't be undone**
at its end when it applies; other items (such as **Blocked**) put their kind on
a short line, then their text across the card's width. A card has at most one
primary action, the Confirm of a waiting Tars proposal, in the danger tone
when it cannot be undone; the state's own control (**Pause**, **Resume**,
**Hand back**) and **Open task** are smaller secondary actions of one weight,
and the rest is in the **More actions** menu. Each card wears the same state tag (the state
mark and the state's word) as the run panel and Agents. Values the run
did not record, such as a start time, are left out rather than shown as zero.

**States never share a look.** Running work alone wears the running tone and
the one moving mark (reduced motion settles it); blocked work wears the
warning tone, completed work the success tone, and queued, waiting, paused and
taken-over work stays neutral, told apart by its glyph and word. The header
indicator uses the lanes' own names and the numbers their headers show
("16 need you · 2 in progress · 4 done · 7 outputs"), so the two never
disagree: running work that needs you is in **Needs you** and counted there.
The sidebar's Tars entry still counts what is actually running. Each lane
header keeps its place at the top of the tray while you scroll through it,
with the chevron beside its name turned down while it is open; an empty lane
stays folded to its muted header with a zero count until you open it. The
conversation's notices use the state's own word: **Completed**, **Blocked**,
**Cancelled**.

**Ended work shows what it came to.** Where work completes or stops, the
conversation shows a result card, aligned with the conversation's outer edge, under the notice's row (the state, the work,
its agent and how long the run worked). The timeline connector stops at a
full-width result surface and resumes between text-only records, so it never
runs through a card. The card shows only what the run
recorded:

- Under **Full summary, criteria and evidence**, the completion criteria, each with what backs it. **Met · confirmed by a
  check** is a criterion whose own Stave check passed on the revision the run
  ended on. **Met · confirmed by review** is one the independent review passed
  on that revision. **Met · agent's report only** is everything else that was
  reported met: nothing Stave ran or reviewed confirms it. **Not met**,
  **Not confirmed** and **Not reported** are the report's own statuses. Checks
  Stave ran and saw pass are named on one line under the list; they back the
  result as a whole and never turn a single criterion into a verified one.
- A short excerpt of the final recorded summary and the report's output links first, with **Open report**. No summary is invented when none was recorded.
- **Full summary, criteria and evidence** expands the complete stage summaries, criteria and stage evidence. The Report view uses the same order: summary and outputs first, full detail folded. Unmet, unverified and unreported criteria, recorded remaining work, explicit caveats in the final summary, stale checks and completion accepted without a Stave check stay visible above the fold. The criterion count summarizes met statuses without implying a source; the details distinguish agent reports, checks and reviews. Empty criterion sets have no count. Earlier-stage caveats remain visible as historical notes labeled with their stage and may have been superseded; they are not presented as current unresolved warnings. Stop or cancellation reasons precede the summary. Result text follows the chat font size, while Report text keeps the panel scale.
- The changed files with lines added and removed, and **View changes**; the
  review's result; and the draft pull request as a link, or **Create draft
  PR** where the work can be published.
- For blocked work, and for work that **Failed** (a step that could not start,
  or a run that stopped for a reason other than unmet criteria): the reason in
  your language, the tool's own message under **Technical details**, the
  controls that state admits (the tray's own, such as **Resume**, **Take
  over** and **Open task**) and **Open timeline**.

A cancel stays one row. So does an earlier stop the work has since moved on
from: only the newest notice of a piece of work carries its card and controls.

**The composer band starts folded.** Above the message box, running work is
one summary line: how many pieces run now, and how many of them Stave has not
observed for a while ("2 running now · 1 not updated recently"). The line is
an inline disclosure; selecting it (or Enter/Space) unfolds one row per
running piece of work with its stage, live line and **Timeline**, and folds
them again. Folding is view-only and lasts while Tars stays open.

**Live progress is observed, never inferred.** Under the monitor, in the flow
block, in the composer band and at the top of the timeline, Tars says what it
observed about running work, from two sources only: the run Stave read (its
stage, its recorded events) and the provider turn of the run's lead task,
which the host relays for every workspace.

- While the turn reports steps, its latest tool call in plain words and when
  it was reported ("Running the tests · updated just now"). Only a reported step
  counts: a turn adopted after a reload, or one that has not reported a step,
  reads "Working · no activity reported yet", never as live.
- After the relayed turn finished, "Waiting to take the next step"; when no turn
  has reached this window yet (such as right after a restart), "No activity
  reported yet". Both add the run's last update.
- When nothing was observed for five minutes (`TARS_PROGRESS_STALE_MS`, the
  provider stall threshold) or the provider marked the turn stalled, "No update
  for 7m · progress may be out of date" in the warning ink, or, when
  a last step is known, "Last activity: Running the tests, 7m ago · progress may
  be out of date".
- Without a run read in this window, "No progress information yet"; work that is
  not running never borrows a turn's words and is not called out of date for
  being quiet.

**Recent progress** lists the run's latest recorded changes, newest first, in
plain sentences with their age: stages starting turns, reporting, completing,
retrying, blocking, waits on you, pauses and resumes, the run ending. Repeated
turns of one stage fold into the newest; bookkeeping rows are left out. A card
lists three, the timeline eight.

The conversation has a **While you were away** summary, so coming back does
not mean reading every record row. It is the only one: the work tray shows no
recap of its own. Stave notes when you last saw the end
of the conversation: the window visible and focused, Tars open and the
transcript scrolled to its end. When you come back ten minutes or more later
(`TARS_AWAY_MIN_GAP_MS`) and something happened meanwhile, one card sits in the
transcript where you left, and the view scrolls to it:

- **Decisions waiting for you**: questions and confirmations Tars raised.
- **Blocked or failed**: work that is blocked, ended without finishing, that
  Tars stopped following up, or whose draft PR did not open.
- **Finished** work, and **draft PRs opened**.

Each group says its count and names up to three pieces of work, newest first,
then "And N more". A work chip opens the work's request; the link beside it
opens its report or timeline, or goes to its decision card or its record in
the conversation. Work is listed as it stands now: work that was blocked and
then went on is not listed as blocked. **Jump to first new item** moves to the
first entry after the card, and **Dismiss** removes the card for good; the
records under it are unchanged either way. A card you did not dismiss is still
there after a restart, and a later absence replaces it once you have seen the
end of the conversation. Nothing shows after a shorter absence, when nothing
happened, or on a profile that never opened the conversation. The summary is
read from the conversation already on screen (no model call), and the seen
time and the dismissal are saved with the Tars view settings in Stave's
database (`tars:get-away`, `tars:save-away`): saved at most once a minute while
you stay and when you leave, never per scroll.

### Results, changes and the side view

The tray's **Outputs** section lists what each responsibility produced: its
**Result report** once the run ended, its **Changes** when the run recorded
changed files, its **Review** once the independent reviewer reported, the
draft pull request Stave opened after you confirmed it, and the links the
run's report recorded, which open in the browser. Each row shows its kind's
icon, and at its end where it opens: a side-panel icon for the side view, an
arrow for the browser. The header indicator adds the outputs count only when there is at
least one; **Needs you** keeps counting Fleet's rows.

An output or a card's **Request** opens the side view: one panel about one
responsibility, with a switch between **Request**, **Report**, **Changes**,
**Timeline** and **Review** at its top. In a wide Tars view (1,088 px or more) it takes the tray's column at the
tray's width (26rem), so opening, switching or closing it never moves the
conversation, and the tray folds to its header indicator until the side view
closes; the conversation never gets narrower than 440 px. Both panels open with
the same title bar: the tray's names it **Work**; the side view's names its kind
(such as **Run timeline**), with the work's title and the switch under it.
Content wider than the column, such as a long diff line, scrolls inside it. In a narrower view it opens
between the conversation and the message box, at most 40% of the view's
height, and scrolls. Esc or the close button closes it and returns focus to
what opened it. Opening, switching and closing it are view-only and never
recorded in the conversation.

- **Request**: what the work was handed, readable from the moment it is
  admitted, before it has a task, a run or an execution workspace, and in
  every later state and after a restart. **Your message** is the message that
  admitted the work exactly as you sent it, with when you sent it (and, when
  it was your choice on a Tars question, that question). **Tars's
  instruction** is the instruction Tars wrote for this unit; the run receives
  it together with your message. **N attachments** lists, by name, the files
  and images from your message that the work carries; its run's lead receives
  them with its first turn. **Completion criteria** lists the criteria
  saved with the work. Texts are shown whole as plain text: line breaks,
  indentation and code blocks are kept and long lines wrap, and each text has
  a copy button. Work Tars admitted before this view existed did not keep your
  message apart. For such work Stave reads the message that admitted it back
  from the conversation (the same message, so the text is exact) and shows it
  as **Your message**, next to the whole saved instruction the run received.
  Only when that message is no longer in the conversation, or the work was not
  admitted from a message, does it say **The original message was not saved
  for this work** and show the whole saved instruction (and, for a long
  message, the text attached in full) instead of a guess. Two work units from
  one message share that message, never each other's instruction. If the
  saved texts cannot be read, the criteria stay and **Retry** reads again.
  You can also ask Tars for your requests in the order you sent them, for
  example "show the queued ones in the order I asked". Tars sees, for up to
  the 20 most recent requests, when each was sent, its first 300 characters
  and which work it started, plus when each work was created. It quotes only
  that excerpt, says when it was cut and points you to this view for the full
  text; it says so when a work's message was not stored.
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
- **Timeline**: **Now** first (the state tag, the stage the active run is on,
  what Stave observed and how current it is, and up to eight recent changes),
  then the run's stages with their attempts and what each produced (the
  current stage's time keeps counting while the run is active), the run's own
  decisions (routes, waits, retries, account switches), the hand-offs and
  controls recorded in Tars, and the commands and tool calls, folded. Without
  a run it says whether the run has not started yet, the work ended before one
  started, or the run is not loaded in this window.
- **Review**: the reviewer stage's verdict, findings with their reasons and
  cited evidence, on the revision it reviewed.

In a delegated work flow, the request node opens the request, a stage opens
its place on the timeline, the review stage opens the review and completion
opens the report. A blocked or stuck
stage shows its reason and opens the report on its unmet criteria. **Show in
Fleet** stays in each stage's menu and the tray card's menu.

A blocked card in the tray shows its reason and **Open report** (at the end of
its **Blocked** line when the card lists the block among what waits on you), which opens
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
type is a choice on the card), and the body: each acceptance criterion with
its met or unmet status and the verification evidence from the frozen report.
The body shows as rendered markdown; **Raw text** shows exactly the text that
is sent, which is the same either way. A **Draft PR** tag and a **Can't be
undone** tag say what it is. Enter, while the card or one of its fields has
focus, or **Open draft PR** (the card's primary button, in the danger tone)
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
retryable stop. The card folds to a record row such as "Draft PR #12 opened ·
Show the saved card first at checkout · click" with **Open on GitHub**; the pull request becomes an output in the tray's **Outputs** and a link
in the report. Stave never merges, marks it ready or deploys.

### Decisions

One waiting decision at a time appears above the message box, whatever asked it:

- a control Tars proposed that waits for your confirmation (resume, hand back,
  cancel, accept as done),
- new work or a queue change that your
  [autonomy level](#how-independently-tars-acts) or one of your **Never do**
  rules held: its button (**Start work** or **Change priority**) applies the
  saved proposal, and nothing is started or reordered before it,
- Stave's own choice for a completion it could not verify, and
- a question Tars asks when it needs you to choose: 2 to 4 options, each with
  a short label and a one-line reason, and a recommended option when Tars has
  one. An option either controls one responsibility at the revision Tars saw,
  or sends the option back to Tars as your answer. A question grants nothing
  by itself; choosing an option takes the same host check as a click.

While it waits, the card has a full attention outline. A question's options
(an ask, or Stave's choice for a completion it could not verify) are a radio
group: each option shows its label, its reason on the line under it and its
number key, the recommended one is marked **Recommended** and starts chosen,
and an option that cannot be undone carries **Can't be undone**. **Answer**
sends the chosen option. A confirmation has one button named by what it does,
such as **Resume**, **Cancel work**, **Approve**, **Skip step** or **Send
answer**, with its key. A waiting card carries no "waiting" tag: its buttons
already say it waits. Answering is the same action three ways:

- **Click** an option to choose it, then **Answer** (on a confirmation, click
  its button).
- **Keys**, only while the card or one of its options has focus: **1** to
  **4** or the arrow keys choose an option and **Enter** answers with the
  chosen one (nothing chosen: Enter does nothing). On a confirmation **1**
  confirms, and **Enter** too when it is recommended. Enter on another button
  in the card (**Details**, the work, **Open task**, **Not now**) is that
  button's own press and confirms nothing. Keys typed in the message box stay
  text; the card never takes focus by itself.
- **Words**: a short reply binds only when exactly one decision waits in
  Tars's newest message and you said nothing after it. "1" to "4" pick that
  option; an affirmative picks the recommended option (none recommended: not
  bound). Affirmatives are "yes", "y", "yeah", "yep", "ok", "okay", "sure",
  "응", "어", "네", "넵", "예", "그래" and "좋아", ignoring case and trailing
  punctuation. Otherwise the message goes to Tars as usual.

A confirmation, a proposed control or Stave's unverified-completion choice,
leads with what will happen: what it does ("Cancel this work?"), the work it is
about as a chip, then the effect in one sentence. What it carries follows only
when it has it: the request a tool approval answers, as a code block labelled
with its tool ("Request from Bash"), the answers or the words to send. The
repository and workspace, when Stave knows them, are under a
collapsed **Details**. A single action that cannot be undone (cancelling,
accepting as done, approving a tool request, skipping a step) says **Can't be
undone** once, in the card's header; in a choice it is on each option it
applies to. Its footer offers **Not now** (Esc while the card has focus),
which leaves the decision waiting and opens the next queued item (or focuses the
message box when it is the only one), next to
the card's button and its key. Card text follows the chat font size: the
title and effect at the messages' size, the other lines one step under it, as
records are.

Cancelling and accepting as done cannot be undone, so they are never a
default: they are never recommended (Stave drops such a recommendation and
keeps the question), so they never start chosen, and an affirmative never
applies one. Choose them explicitly: in a question, choose the option, then
**Answer** or Enter; on a confirmation, its button or **1** (never Enter). The
card's main button is always the primary one, in the danger tone when it cannot
be undone.

Each answer folds the card to a record row with the option, the question, how
you answered (click, key or words) and its outcome, such as "Keep it running ·
Should I pause the release check? · click · Answered"; a click or key is never
shown as a message from you.
Answering twice applies once, and a different answer to an answered decision
is refused with that reason. If an answer is refused for a reason other than
the work changing or ending (for example the run could not be reached), the
card stays open with a short alert under its options saying which choice was
not applied and why, so you can try again or choose another option. Answering one responsibility's proposal retires only
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
- Each control adds a record row to the conversation with where it came
  from, such as "Pause · Verified result · Fleet · Applied" or "… · task view ·
  Applied". A refusal shows its
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
- its run's own stage stopped while the run is still running: the stage
  blocked, got stuck or awaits your sign-off. A helper the run delegated to
  counts the same way when its stage stops, since the run waits for that
  helper. Tars shows the work as waiting for you and follows up at once, not
  after the quiet hour, and the tray's **Needs you** counts the helper's row
  that Fleet shows. Tars tells apart what the stage waits for. Only a stage
  whose agent blocked it for your input or permission asks you a question:
  Tars gets that question and the agent's suggested action in the agent's own
  words, and the line reads **Tars follow-up · Needs your answer or approval**. A
  stage awaiting your sign-off reads the same. A stage that one of Stave's own
  checks stopped (a required criterion not met or not verified, no report, the
  reporting tools unavailable, a failed stage action) or that the agent
  blocked on its environment or an outside service asks you nothing: the line
  reads **Tars follow-up · A Stave check stopped progress** (in
  Korean, **Tars 후속 확인 · Stave 검사에서 멈춤**), and Tars says what needs
  verifying or which next step fits instead of saying the run asked you
  something. When the stage blocked on an acceptance criterion, the reason
  Tars reads says whether the stage report marked it **Not met** or **Not
  verified**; a report that left a required criterion out or reworded it is
  refused while the run's turn is still going, so it does not reach you,
- its run reported completion Stave could not verify,
- it ended with required criteria unmet or a verification older than a hand-back,
- it waited an hour without any change (a turn the run took counts as a
  change) in a plain wait: a run you paused, a run paused for a usage limit or
  another run pause, or a tool approval or question you answer in its task
  (or in the task of a helper the run delegated to), or
- a question Tars asked became invalid because its work changed.

The follow-up appears in the conversation as **Tars follow-up ·** its
reason and the work's title (in Korean, **Tars 후속 확인 ·**), never as your words.
That line heads Tars's reply: the reply and anything it proposes hang from the
line's mark on the record rail, so they read as one item Tars wrote by itself.
It goes through the same queue as your messages: it is only added while none
of your messages can start, and a follow-up still queued starts nothing once
you have written to Tars about the change. It may ask a question, propose a
resume, cancel, stage retry, more turns or sign-off that waits for your
confirmation when what it observed fits, or open a view. It never proposes
skipping a stage or starting queued work now, and never answers in the task
for you: for a waiting approval it can only ask you with **Approve** and
**Deny** options, and your choice applies it. It never
changes a priority, because that applies at once; it can ask whether you want it. It never starts work by itself: to suggest new work it asks, for
example "Start new work to fix it?", and only your answer can lead to it. It
never pauses, takes over or hands back anything, never offers accept as done
(or repeats the cancel Stave's own unverified-completion card offers), and
proposes nothing about work you paused or took over, or that ended, including
when that happened while Tars was thinking. The run's own words reach Tars only
as an untrusted observation. A change you already wrote about after it
happened starts nothing, and a follow-up whose change is no longer current
just before Tars would think about it is cancelled without a model call: its
line stays as one item with "Tars did not follow up: the work changed before
it could." under it. That check runs again right before the model call.

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

Open **Tars settings** in the conversation
header to change the name, standing instructions, how long ended work stays in
the panel, conversation model and account, execution model, the agents Tars may
use and the turn limit per work unit. A turn is one request for an agent to
work; the limit includes the lead agent and its helpers.
Until you change them, the conversation uses Codex when it is available
(otherwise Claude Code) with that provider's model from your app settings, and
a turn limit of 30; the first send saves these choices for the conversation.
Settings have three tabs: **General** (name, standing instructions and ended-work
retention), **Models** (conversation model/account, execution model and allowed
agents), and **Work** (autonomy, rules and work limits). Draft edits survive
switching tabs. **Save** remains visible below the scrolling panel.

Saving settings affects later messages and new work, not already admitted
runs. Instructions do not grant new permissions.

**Standing instructions** have a short default in your app language: lead with
the answer or the decision needed, restate the goal and completion criteria
before delegating, prefer small reviewable work without lowering criteria, say
what happened and what you need to decide when work blocks, and say when an
observation is stale or unknown. A profile that has never used Tars starts with
it. An empty saved profile also opens with this default filled into the draft;
existing custom text is preserved. **Reset to default** replaces a custom draft.
Clearing the field remains an explicit edit, with **Use default** available to
restore it. **Save** applies the draft; opening settings alone changes nothing.
An empty field means Tars follows only its built-in rules.

**Keep ended work in the panel** sets the retention period described in
[Clear the conversation and the panel](#clear-the-conversation-and-the-panel).

### How independently Tars acts

**How independently Tars acts** is one choice between three levels. It decides
which of Tars's proposals Stave applies at once and which wait for your
confirmation on a card. **Actions and confirmations** expands a list for the level you
picked: what Tars does on its own, asks first, always asks and never does.
The list reads the same policy Stave applies; confirmation requirements for
commits, pushes and draft PRs remain visible while it is collapsed. A saved change applies from
Tars's next decision, without a restart.

| Level | What changes |
| --- | --- |
| **Careful** | Starting new work, changing the queue order and starting queued work now wait for your confirmation. A held delegation shows a **Start this work?** card with **Start work**; nothing is created until you confirm it. |
| **Balanced** (default) | Exactly the behavior without levels: work you ask for starts, and continuing, answering for you or ending work waits for you. |
| **Hands-off** | When you ask in your own words, Tars also resumes work, retries a stage and adds turns to the task at once. Each leaves an applied record in the conversation. |

No level loosens a safeguard:

- Cancelling work, skipping a stage, accepting a completion Stave could not
  verify, approving a tool request and publishing always wait for you.
- Handing back work you took over, approving a waiting stage and anything Tars
  says for you in a task (an answer, your words, requested changes) also wait
  at every level.
- Pausing work, handing it over to you and denying a tool request always apply
  at once, because they only reduce what Tars does.
- An [automatic follow-up](#automatic-follow-up) gains nothing from a level.
  Without your words Tars can still only ask, show a view or propose something
  for you to confirm.
- Tars never merges, deploys, force-pushes, deletes branches, worktrees or
  tasks, creates an "always allow" rule, spends money or messages other people.
  Stave offers it no action for these.

Stave uses the more careful of the level saved now and the level that was saved
when you sent the message, so lowering the level takes effect immediately and a
message never carries a looser level than your settings.

**Never do** holds up to 12 rules in your own words, such as "never touch
production branches". Tars receives them as hard constraints. Stave also asks
you first when a proposed action plainly names a rule's repository, branch or
action, even at a level that would apply it, and shows the rule and the word
that matched on the card; confirming is then never the Enter or "yes" default.
The rules guide Tars's decisions. Stave does not block an action because of a
rule, and it does not read a rule's meaning beyond those words, so a rule that
names nothing Stave can match depends on Tars following it.

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

## What Tars knows, and usage

The book button in the conversation header (**Knowledge and usage**) opens two
read-mostly views beside the conversation. Opening them changes nothing and is
not recorded in the conversation.

### What Tars knows

Everything Tars carries from one message to the next, grouped by where it
applies, each part with its source and the editor that changes it:

- **Everywhere**
  - **Standing instructions**: the text as saved, whether you wrote it or it is
    Stave's default, and when it was last saved. Tars reads it with every
    message and hands it to the agents it starts. **Edit** opens
    **Tars settings**.
  - **Agents Tars may hand work to**: the saved agents you allowed. Built-in
    agents are always allowed. **Edit** opens **Tars settings**.
- **Per repository** (the first 12 registered repositories, which is what Tars
  is shown; more are counted)
  - **Branch naming rule**: the repository's own rule, or Stave's default when
    none is set. **Edit** opens **Settings > Repository**.
  - **Repository memory**: the repository's
    [memories](repository-memory.md), read when you open the repository's
    section. Tars does not read these itself: the tasks it starts in that
    repository receive the relevant ones, at most 6 per turn. Memories in use
    are listed first, the always-included ones leading; candidates waiting for
    review and memories not confirmed for a long time are listed under **Not
    used yet**. Each row shows its kind, how it is used, when it was last
    confirmed and the task it came from, and has the same edit and forget
    actions as the Memory section (forgetting offers **Undo**). When memory is
    turned off for a repository the view says its tasks receive none.
- **What Tars does not remember**: with each message Tars rereads only the last
  8 messages of the conversation and the current state of its work. Older
  messages stay on screen but are not read again, and Tars saves no memories
  from the conversation.

The view adds no memory store. It shows a time only where one is saved: the
standing instructions' last save and each memory's last confirmation. The
allowed agents and the branch rule have no saved time, and no item records when
it was last used.

### Usage

What the work Tars started spent, as the providers reported it, for **Today**,
**7 days** (the first shown) and **30 days**. Days are calendar days in your
local time: today from midnight, 7 days as today and the six days before it.

- **Totals**: tokens, turns and time working. **Reported cost** appears only
  when a provider reported a cost for a turn in the period; Stave never applies
  a price to tokens. When some turns reported no token count, or only some
  reported a cost, the view says how many.
- **By work**: each piece of work with its share of the period as a bar, its
  tokens, turns, time, repository and the models its turns ran on. The title
  opens that work's timeline (or its request when it has no run).
- **By model**: the same figures per model, with its provider.

Tokens are new prompt plus output; prompt read back from a provider's cache is
not counted, on the same rule as the **AI usage** screen. A turn belongs
to the period in which it started. The figures come from the turns of each
work's own task, including any turns you took there.

Not counted, and said in the view:

- Tars's own replies. Their number is shown; their tokens and cost are not
  recorded.
- Turns of helper tasks that a run starts.

The report is read when the view opens and on **Refresh**, never on a timer. It
reads at most the 200 most recently changed pieces of work and 20,000 turns; if
there were more, it says the totals are a lower bound.

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
