# Auto (Model Router)

Stave Auto picks an eligible provider, model, and effort for each turn.
It uses existing Stave models and requires no additional service or model
installation. Auto itself remains opt-in.

## Default behavior

Model classification is on by default. The Utility model reads the bounded
request and recent conversation, then deterministic rules choose a model:

| Work | Default capability | Effort |
| --- | --- | --- |
| Clearly bounded edits or explanations | Light | Medium |
| Ordinary connected work | Balanced | Medium |
| Complex or uncertain work | Flagship or stronger | High |
| Sensitive changes, with safety escalation enabled | Frontier | Medium |

Short wording alone does not prove that a task is easy. Explicit short
continuations reuse recent user context and keep a capable model. Local
sensitive-word matching is deliberately conservative; a discussion of a
sensitive topic can therefore escalate when model classification is disabled or unavailable.

The current provider stays selected unless switching is enabled or a custom
rule explicitly selects another provider. Reviews and slash commands do not
automatically change providers or force a light model.

Balanced, Cost-saver, and Quality-first adjust the route within its capability
requirements. Usage thresholds can reduce effort or model cost, but cannot
override the primary task's capability floor. If no allowed available model
meets that floor, Auto reports a routing error instead of silently using an
underpowered or disallowed model.

The previous eligible model stays selected when the next route would only
downgrade it on the same provider. A clearly new task, an escalation, or the
hard budget threshold can change it. Uncertain continuations preserve the
capable previous model even at that threshold.

## Model intent classification

Auto uses the configured Utility model for intent classification by default.
Advanced settings can explicitly disable it for local-only routing. If no
model or provider is configured, it uses Codex's existing Utility default
(Luna). The classifier returns strictly validated intent, complexity,
risk, continuity, and evidence codes. It never selects tools, permissions,
approval policy, or execution mode.

Each request has a 30-second deadline including readiness checks, one selected
provider, and at most one model execution. Unavailable authentication, invalid
JSON, timeout, or failure produces a conservative local route. Cancellation
interrupts classification and prevents the primary turn from starting.
Classification adds latency; the deadline is not a model speed guarantee. A
progress notice appears after 500ms with a Cancel action. Failures show an
explicit fallback notice. Successful classifications determine the route even
when they take several seconds.

Only bounded context is sent: up to 4,000 prompt characters and the last six
messages with up to 500 characters each. Successful results are cached for
60 seconds for the exact bounded input, selected model, workspace, and task;
failures are not cached. The cache holds at most 64 entries. Readiness checks
share concurrent requests and cache positive results for 30 seconds, with
invalidation after runner failures.

Codex classification uses a fresh ephemeral thread on the shared App Server.
Its reduced instructions omit project guidance and restrict skill context.
Shell, image, apps, web, and configured MCP tools remain disabled. Primary
secrets and resume IDs are not forwarded. No classifier conversation or
background keep-alive model loop accumulates tokens between requests.
Other utility calls and primary sessions keep their existing behavior.

## Settings and saved profiles

The composer shows three preferences. Settings shows the enable switch,
preference, and eligible models first. Advanced settings contains budget and
signal controls, model classification, the usage wizard, rule editing,
and a local rule preview. The preview makes no AI call and can differ from an
classifier result.

Changing preference preserves saved rules, signals, eligible models, and
manually customized budget thresholds. Existing saved rules survive profile
validation. **Reset rules to defaults** explicitly replaces them with the
current six-rule table while preserving other settings.

The table has four primary rules (sensitive, complex, ordinary, bounded), an
Advisor default, and a delegated-task default. Worker defaults remain under
the Worker preset unless a Worker rule is configured. Custom rules can still
match task class, skill, role, complexity, sensitivity, and usage. Their
primary routes obey eligibility and capability requirements.

The usage wizard inserts inferred class and skill rules before generic
complexity defaults, while keeping safety rules ahead of those suggestions.
Historical model choice is evidence of preference, not proof of quality.

## Decision records

The composer and turn details show the chosen model, effort, rule, signals,
and classification source. Routed decisions do not display invented
confidence percentages. Manual selections and disabled Auto retain their
existing behavior, and the selected model still passes the ordinary
account-usage guard before execution.

Profile version 4 enables model-first classification for legacy settings and
older profiles, while retaining saved custom tables and model eligibility. An
explicit classification opt-out saved in version 4 is respected. Auto itself
remains off unless the user enables it. Model prices, where
available, are used for display and ordering rather than promised savings.
