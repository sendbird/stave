# Auto (Model Router)

Stave Auto picks an eligible provider, model, and effort for each turn.
It uses existing Stave models and requires no additional service or model
installation. Auto itself remains opt-in.

## Default behavior

Model classification is on by default. The Utility model reads the bounded
request and recent conversation and rates the work on one ordered scale.
Deterministic rules then map each level to one model rung and an effort range:

| Level | Work | Claude | Codex | Effort range |
| --- | --- | --- | --- | --- |
| Simple | A bounded, obvious step: a typo, rename, small config edit, direct answer | Sonnet 5.5 | GPT-6 Luna | Low – Medium |
| Standard | Ordinary connected work, including routine workflows such as shipping a PR | Opus 5.5 | GPT-6.1 Sol | Medium – High |
| Complex | Cross-module changes, non-obvious bugs, migrations, sensitive changes | Opus 5.5 | GPT-6.1 Sol | High – Extra high |
| Expert | Architecture design and its verification, ambiguous cross-system failures | Fable 5.1 | GPT-6 Astra | Low – Medium |
| Extreme | Exceptional, research-grade reasoning; rare by design | Fable 5.1 | GPT-6 Astra | High – Extra high |

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

Auto does not pick Claude Haiku 4.5 unless it is allowed explicitly: it
rejects an effort value, so Sonnet 5.5 is the light Claude route.

A task that runs as an [agent](agents.md) whose model is Auto-routing with a
task class uses that class as a fallback: a confident classification still
decides, and the agent's class applies when the intent is unclear or when
classification is unavailable (in place of local keyword matching). A safety
escalation always wins.

The current provider stays selected unless switching is enabled or a custom
rule explicitly selects another provider. Reviews and skill commands (`/ship`
or `$ship`) do not automatically change providers or force a light model.

Cost-saver, Balanced, and Quality-first keep the level's model and pick the
low end, the recommended point, or the high end of its effort range. Usage
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

The previous eligible model stays selected when the next route would only
downgrade it on the same provider. A clearly new task, an escalation, or the
hard budget threshold can change it. Uncertain continuations preserve the
capable previous model even at that threshold.

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

Auto uses the configured Utility model for intent classification by default.
Advanced settings can explicitly disable it for local-only routing. If no
model or provider is configured, it uses Codex's existing Utility default
(Luna). The classifier answers bounded questions — intent, level
(`low`, `medium`, `high`, `expert`, `extreme`, or `unknown`), risk,
continuity, and evidence codes — each with a concrete anchor, and the result
is strictly validated against schema version 2. It never chooses a model or
effort, and never selects tools, permissions, approval policy, or execution
mode. A leading `/name` or `$name` is read as a skill command.

Each request has a 30-second deadline including readiness checks, one selected
provider, and at most one model execution. Unavailable authentication, invalid
JSON, timeout, or failure produces a conservative local route. Cancellation
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
60 seconds for the exact bounded input, selected model, workspace, and task;
failures are not cached. The cache holds at most 64 entries. Readiness checks
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

Settings → Auto shows, in order: the enable switch and preference; **Routing
levels**, a live table of what each level runs on for Claude and Codex under
the current preference and allowed models (a level with no allowed model reads
"No allowed model"); and **Allowed models**, where **Default** allows every
catalog model except Claude Haiku 4.5. Advanced settings holds classification
and signal switches, the usage budget, the usage wizard, the rules, and a local
rule preview. Each rule is one summary line (`complex level → Flagship · High
effort`) that expands for editing. The preview makes no AI call and can differ
from a classifier result.

Changing preference preserves saved rules, signals, allowed models, and
manually customized budget thresholds. Existing saved rules survive profile
validation. **Reset to defaults** explicitly replaces them with the current
table while preserving other settings.

The table has one rule per level, ordered Extreme, Expert, sensitive, Complex,
Standard, Simple, plus a delegated-task default (the flagship at medium
effort). Custom rules can still match task class, skill, role, level,
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
models, and signals are kept. Auto itself
remains off unless the user enables it. Model prices, where
available, are used for display and ordering rather than promised savings.
