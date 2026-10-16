# Auto (Model Router)

Stave Auto picks an eligible provider, model, and effort for each turn.
It uses existing Stave models and requires no additional service or model
installation. Auto itself remains opt-in.

## Default behavior

Model classification is on by default. The Routing decision model reads the bounded
request and recent conversation and rates the work on one ordered scale.
Deterministic rules then map each level to one model rung and an effort range:

| Level | Work | Claude | Codex | Effort range |
| --- | --- | --- | --- | --- |
| Simple | A bounded, obvious step: a typo, rename, small config edit, direct answer | Haiku 5.5 | GPT-6 Luna | Low – Medium |
| Standard | Ordinary connected work, including routine workflows such as shipping a PR | Opus 5.5 | GPT-6.1 Sol | Medium – High |
| Complex | Cross-module changes, non-obvious bugs, migrations, sensitive changes | Opus 5.5 | GPT-6.1 Sol | High – Extra high |
| Expert | Architecture design and its verification, ambiguous cross-system failures | Fable 5.1 | GPT-6 Astra | Low – Medium |
| Extreme | Exceptional, research-grade reasoning; rare by design | Fable 5.1 | GPT-6 Astra | Medium – High |

The frontier levels stop at high effort by default: Fable and Astra at extra
high cost far more than they add for most work. Each level is editable (see
Settings below), so a user who wants that ceiling can raise it.

Most work is Standard. The classifier is asked for the lowest level a
competent senior engineer would assign; Expert and Extreme need explicit
evidence in the request, and local rules never infer them. An unclear request
routes as Standard, not as a light model and not on the frontier. Short
wording alone does not prove that a task is easy or hard; explicit short
continuations reuse recent user context and keep a capable model.

With safety escalation enabled, a sensitive change (auth, secrets, payments,
production data) routes as Complex work or higher: it needs care, not
necessarily the frontier model. Routine commits, pushes, pull requests, and
checklist releases are not sensitive. Local sensitive-word matching is
deliberately conservative; a discussion of a sensitive topic can therefore
escalate when model classification is disabled or unavailable.

Claude Haiku 5.5 is the light Claude route, the counterpart of GPT-6 Luna on
Codex. Auto does not pick the previous Claude Haiku 4.5 unless it is allowed
explicitly, because it rejects an effort value; a stored allow-list that names
Haiku 4.5 moves onto Haiku 5.5.

A task that runs as an [agent](agents.md) whose model is Auto-routing with a
task class uses that class as a fallback: a confident classification still
decides, and the agent's class applies when the intent is unclear or when
classification is unavailable (in place of local keyword matching). A safety
escalation always wins.

The current provider stays selected inside a task. A rule that names a
provider, a [provider strength](#provider-switching), or an agent's preferred
provider moves a task only at a task boundary: its first turn, or a delegated
task. Later turns stay on the provider that answered last, and the route line
says the named provider applies from the next task, so a review → fix → review
loop does not bounce between providers. With **Switch provider mid-task** on, a
rule that names a provider may also move a task mid-way. Reviews and skill commands
(`/ship` or `$ship`) do not automatically change providers or force a light
model.

A rule's **Model rung** can be **Follows the level**: the rule picks the
provider and the level still picks the rung, so a Simple task runs on the
light model and an Expert task on the frontier one. A rule with no rung and no
model keeps its older meaning, the provider's default model.

## Provider switching

Settings → Auto → Advanced settings → **Provider switching** holds both
provider switches. **Start on the stronger provider** turns on the strength
table, which sets which provider each area of work (plan, UI & frontend, logic
& backend, other implementation, quick edit, debug, review, CI fix, docs,
research) starts on. **Switch provider mid-task** lets provider rules,
including this table, move a task that has already started.
Each row is a provider-only rule (`strength-<area>`) that follows the level,
placed after the user's own task-, skill- and usage-specific rules and before
the level rules. Safety-critical work keeps its own rule.

Precedence, highest first: an explicit provider (a composer pin or a
delegation's `provider`), an agent's Fixed provider, the user's own rules that
name a provider, an agent's preferred provider, then the strength table. A
strength rule is passed over while the task's agent prefers a provider.

Delegated tasks follow the table only when they name a saved agent whose
model is Auto-routing with a task class and no preferred provider; the
delegation prompt itself is never classified for this. A delegation never
moves to a provider whose CLI Stave cannot find: it stays on the parent's provider.

The table is off by default. Until the user turns it on or edits a row, it
shows the **Confident only** preset as a suggestion and stores nothing. Three
presets seed it from public benchmarks, GitHub repositories, blog comparisons
and posts on X, gathered and re-checked on 2026-10-11. Each row shows its
confidence and links its sources:

- **Confident only**: quick edits on Codex, where Codex scores clearly higher
  at a similar cost; everything else keeps the task's provider.
- **Public evaluations**: also plans, UI work and research on Claude, and
  logic work and reviews on Codex. These rows have low confidence. Other
  implementation, debugging, CI fixes and docs keep the task's provider
  because the evaluations disagree.
- **Claude builds, Codex reviews**: a common practitioner split, not a
  measurement.

Implementation is split by domain. **UI & frontend** is interface work people
see and touch (layout, styling, components, interaction); **Logic & backend**
is the behavior behind it (business rules, data, APIs, algorithms). The
classifier answers the domain alongside the intent. When it does not answer,
only UI is guessed from keywords such as `UI`, `CSS`, `layout` or `화면`, and
implementation whose domain stays unclear uses **Other implementation**. The
evidence for this split is thin: Claude leads interface arenas by small
margins and Codex matches it on long software tasks for far less, so both
rows have low confidence. A delegated agent declares a task class but no
domain, so its implementation work reads **Other implementation**.

These are claims about providers in general, not measurements of the user's
work, and models change faster than the presets. Moving a task to the other
provider sends at most 12,000 characters of the conversation there, and that
provider's own skills, hooks and MCP servers apply.

Each candidate provider is judged on its own usage window, so a nearly spent
Claude window does not lower the model Codex runs.

Cost-saver, Balanced, and Quality-first keep the level's model and pick the
low end, the recommended point, or the high end of its effort range. A rule
that names its own effort keeps it, moved one step by the preference. Usage
thresholds can lower effort or the model, but never below the level's
minimum rung: Simple may use a light model, Standard a balanced one (Sonnet
5.5 or GPT-5.6 Terra), Complex and Expert the flagship, Extreme only the
frontier.

When the provider running the task has no allowed model for the level, such
as a Cursor or Kiro task on its own Auto model or an allow list without a
capable model, Auto hands the turn to an available provider that has one and
says so on the route line, whether or not provider switching is enabled. Only
when no available provider has a capable allowed model does Auto report a
routing error instead of silently using an underpowered or disallowed model.

Auto does not change the model in the middle of a task while the prompt cache
is warm. Each model has its own cache, so a mid-task switch re-reads the whole
conversation at the cache-write rate instead of the much cheaper cache-read
rate. On the same provider, while the previous model is still allowed, Auto
keeps it for a turn that would step up a level, step down, or follow a usage
threshold (the hardest one included), and the route line says the switch was
deferred. The switch happens at the next boundary:

- the classifier marks the prompt as a new task;
- the cache has cooled: more time has passed since the last answer finished
  than the provider's window (60 minutes for Claude, whose subscription
  conversation cache lasts an hour; 30 minutes for Codex; 5 minutes for other
  providers);
- the conversation was compacted after the last answer;
- Auto cannot tell which model answered last or when it finished.

Some changes never wait: a provider that cannot run the turn (its CLI
unavailable or its usage exhausted), a previous model that is no longer
allowed, a sensitive change that safety escalation moves to a stronger model,
and a model pinned in the composer or fixed by an agent. Under a usage
threshold, a held model that keeps its cache across effort changes (Opus and
Fable) still lowers its effort. Agent Run turns follow the same rule.

## Provider failover

Provider switching is a preference about discretionary routing, so with it off
Auto stays on the provider already running the task. Availability is not a
preference: a provider that cannot run the turn — its CLI unavailable, or its
account usage exhausted — is skipped and Auto routes to one that can, whether
or not provider switching is enabled.

Exhaustion is judged per model, so a spent model-specific window does not
retire the whole provider while other allowed models there still have
headroom. When no provider has headroom, Auto keeps its ordinary route and the
account usage guard reports the block and its reset time, rather than Auto
failing to produce a route at all.

## Model intent classification

Settings → Auto → **Routing decision model** controls classification for both
Auto sends and Agent runs. The default is **Automatic**: try available,
signed-in Luna first, then Haiku. This setting is independent of Background
AI's text utility model. The **Model classification** switch in the same card
turns classification off for local-only routing. A line under the field names
the model in use and the
order Stave falls back through, or says the choice is not in use while Auto or
model classification is off.

To use Jev, save a Vercel AI Gateway key in Secrets, add an API connection in
Settings → Accounts, enable Auto, then choose that connection and Jev under Routing decision
model. Both pickers search inside their own list. Decision models are listed
separately from the coding models pinned on the connection. Jev is opt-in; adding a connection does not
change the default. An Agent's Auto-routing settings can override the global
Decision model, or inherit it. Saved Agent snapshots keep their overrides.
Fixed or composer-pinned models bypass classification. Saved-Agent delegates and
Agent runs use the same Decision setting within their admitted provider
and model catalog. A run's recommendations still obey its [team limits](./agents.md#team-limits):
model/effort pins, the two-change limit, two-turn cooldown and shared turn budget. Explicit resource
requests take priority over automatic recommendations. A classification that
requires a model outside the allowed catalog cannot widen that catalog.

Gateway classification uses the Decision HTTP API without a coding CLI or
tools. A missing key, rejected request, exhausted budget, invalid response or
timeout falls back to Luna, then Haiku. Native classifiers use selected
sign-in accounts; when the task account is a Gateway connection, they use
System default. If neither native classifier works, local routing continues.

The classifier answers bounded questions — intent, level
(`low`, `medium`, `high`, `expert`, `extreme`, or `unknown`), risk,
continuity, and evidence codes — each with a concrete anchor, and the result
is strictly validated against schema version 2. It never chooses a model or
effort, and never selects tools, permissions, approval policy, or execution
mode. A leading `/name` or `$name` is read as a skill command.

Each request has a 30-second deadline including readiness checks and fallbacks.
Each attempt has a nine-second ceiling so a failed preferred model leaves time
for the remaining models. Failure after native fallback produces a conservative
local route. Cancellation
interrupts classification and prevents the primary turn from starting.
Classification adds latency; the deadline is not a model speed guarantee.
Successful classifications determine the route even when they take several
seconds.

While classification runs, the prompt appears in the conversation right away,
including a new task's first prompt, and the composer shows Stop. After 500ms
a route line under the prompt shows `Auto → Choosing a model · 4s` and a
**Skip** action, which stops waiting and routes with local rules. The line uses
the same slots as the recorded route line, so the routed model fills in where
the wait was. Stop (or Esc) cancels the send and returns the prompt to the
composer.

Only bounded context is sent: up to 4,000 prompt characters and the last six
messages with up to 500 characters each. Successful results are cached for
60 seconds for the exact bounded input, Decision configuration, workspace, and task;
failures are not cached. The route records the Decision model, fallback category,
elapsed time and Gateway-reported cost; missing cost stays unknown. A cache hit
does not add the original call's cost again. The cache holds at most 64 entries. Readiness checks
share concurrent requests and cache positive results for 30 seconds, with
invalidation after runner failures.

Codex classification uses a fresh ephemeral thread on the shared App Server.
Its reduced instructions omit repository guidance and restrict skill context.
Shell, image, apps, web, and configured MCP tools remain disabled. Primary
secrets and resume IDs are not forwarded. No classifier conversation or
background keep-alive model loop accumulates tokens between requests.
Other utility calls and primary sessions keep their existing behavior.

## Settings and saved profiles

The composer shows three preferences. A task that runs as an
[agent](agents.md) offers them in the agent's model segment too, and picking
one keeps the agent. The composer button names the preference, such as
`Auto · Balanced`, and after a routed turn the model and effort it used, such
as `Auto → Opus 5.5 · Medium`. It shows no effort setting of its own, because
Auto chooses the effort on every turn.

Settings → Auto shows, in order: the enable switch and preference, with a
notice while Auto is off; **Routing decision model**, with the **Model
classification** switch and the model that classifies work; **Routing
levels**, a live table of what each level runs on for Claude and Codex under
the current preference and allowed models (a level with no allowed model reads
"No allowed model"); each level's edit button opens its model tier and the
effort each preference runs, and a changed level is marked **Custom** until
**Reset level**; and **Allowed models**, where **All (default)** allows every
listed catalog model. Advanced settings holds the usage wizard, routing signal
switches, the usage budget, provider switching, the rules, and a local rule
preview. Each rule is one summary line (`Complex level → Flagship · High
effort`) that expands for editing. The preview makes no AI call and can differ
from a classifier result.

Changing preference preserves saved rules, signals, allowed models, and
manually customized budget thresholds. Existing saved rules survive profile
validation. **Reset to defaults** asks for confirmation, then replaces them,
including the provider switching table, with the current table while
preserving level edits and other settings.

The table has one rule per level, ordered Extreme, Expert, sensitive, Complex,
Standard, Simple, plus a delegated-task default (the flagship at medium
effort). A level rule follows its level, so a level edit changes what that
rule runs. Custom rules can still match task class, skill, role, level,
sensitivity, and usage. Their primary routes obey eligibility and capability
requirements.

The usage wizard inserts inferred class and skill rules before generic
level defaults, while keeping safety rules ahead of those suggestions.
Historical model choice is evidence of preference, not proof of quality.

## Decision records

The composer and turn details show the chosen model, effort, rule, signals,
and classification source. Each routed response starts with one route line,
for example `Auto → Opus 5.5 · Medium · Implement · 2.4s`, naming the routed
model, the task class, and the classifier wait; **Why** opens the recorded
rule and signals. A local-rules fallback is marked on that line instead of in
a notification, and the line names the model that actually answered when the
runtime ran a different one. Routed decisions do not display invented
confidence percentages. Manual selections and disabled Auto retain their
existing behavior, and the selected model still passes the ordinary
account-usage guard before execution.

Profile version 4 enables model-first classification for legacy settings and
older profiles, while retaining saved custom tables and model eligibility. An
explicit classification opt-out saved in version 4 or later is respected.
Profile version 5 introduced the level ladder: a starter profile saved earlier
takes the current rule table once, while custom tables, preference, allowed
models, and signals are kept. Profile version 6 made levels editable
(`levels` on the profile): a level rule a custom table copied unchanged from
the version 5 starter now follows its level, and a level rule the user had
edited keeps its own model tier and effort. Auto itself
remains off unless the user enables it. Model prices, where
available, are used for display and ordering rather than promised savings.

## Connection catalogs and automatic follow-ups

Renderer Auto sends wait for the selected accounts' catalog before routing.
Cancellation stops that wait; a missing account never becomes an unrestricted
native catalog. Settings' level table, dry run and candidate explanation use
the same connection pins and allowed-model intersection as execution.

An omitted delegated execution model is resolved against the captured connection
before dispatch. The admission result is reused for the first supervised turn;
it does not trigger a second Decision call for the same input. Saved-Agent overrides apply on admission and supervised
continuations; the delegate stays on its admitted provider and frozen catalog.
Stopping during classification cancels the read after the durable stop and
prevents a late result from dispatching.

Wake-ups and report follow-ups use the task's captured account IDs to resolve
fresh keys. Explicit turn selections win. Decision diagnostics are retained
in routing history and copied Agent reports, and in the Auto route tooltip.
One-turn and detached delegate completion receipts retain the same diagnostics.
Gateway-reported Decision cost is separate from the primary turn's usage; it
is not a complete Gateway invoice or an estimated cost for native classifiers.
