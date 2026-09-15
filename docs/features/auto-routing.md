# Auto (Model Router)

Stave Auto chooses the provider, model, and effort for a turn so users of
several providers do not have to pick a model for every prompt. The router is a
small, inspectable table rather than a black box: every decision names the rule
that fired and the signals it saw, and the table is the user's to edit.

## Pipeline

```
prompt + context ──▶ Signals ──▶ Task class ──▶ Role table × Stance ──▶ Route
                                                        │
                                              budget guard, eligibility,
                                              provider fallback
```

1. **Signals** (`src/store/auto-routing.ts`)
   - `taskClass` from keyword heuristics (English and Korean) and, for
     low-confidence prompts, an optional utility-model classifier.
   - `complexity` from prompt length and attached file context.
   - `sensitive` for auth, secrets, payments, migrations, and production
     wording (safety escalation).
   - `skill` from a leading slash command such as `/ship` or `/ci-fix`.
   - `budgetUsedPercent` from the tightest usage window of the current
     provider (`rateLimitsSnapshot`).
   - `lastAssistantProvider` for provider stickiness.
2. **Task classes**: `plan`, `implement`, `quick-edit`, `debug`, `review`,
   `ci-fix`, `docs`, `research`, `safety-critical`.
3. **Role table** (`src/lib/providers/auto-routing-profile.ts`): ordered
   rules `{ when, then, reason }`. `when` filters on task class, role, skill,
   complexity, sensitivity, and budget use; `then` names a provider (or
   `any-eligible` / `alternate-provider`), a tier or model, and an effort.
   The first enabled rule that matches wins; otherwise the provider fallback
   runs.
4. **Roles**: the same table routes the `primary` turn, the `advisor` target,
   the `worker` model, and `delegate` (child task) defaults. Rules without a
   `role` filter apply to the primary only.
   Advisor Auto uses the current user prompt's heuristic task class,
   complexity, sensitivity, skill, and attached file count at send time, even
   when the primary model is manually selected. The resolved Advisor stays
   fixed for that turn; individual consult questions do not reroute it. Custom
   Advisor rules can use those signals; the starter's default remains unchanged.
5. **Stance**: `cost-saver`, `balanced`, or `quality-first`. The stance
   shifts every route one rung down or up and moves the budget-guard
   thresholds. Cost-saver also lowers effort one step; quality-first keeps the
   rule's effort, since a stronger model at a deeper effort double-charges.
   A profile is a role table plus a stance.
6. **Budget guard**: above `stepDownAt` the route steps down one effort when
   the model keeps its prompt cache across effort changes (Fable 5.1, Opus 5),
   otherwise one rung; above `cheapestAt` the cheapest eligible model runs.

## Starter profiles

Three starters share one role table and differ only by stance. Users clone a
starter into a custom profile and edit rules, fallbacks, eligible models, and
thresholds.

| Task class / role | Route | Effort | Why |
| --- | --- | --- | --- |
| plan, research, safety-critical | frontier | medium | Most capable model where judgment matters |
| implement, debug | flagship | high (xhigh at high complexity, medium at low) | Strong execution; complexity moves effort, not the model |
| quick-edit, ci-fix | flagship | medium | Same model as implement so the prompt cache survives; edits need the repo in context |
| review | flagship on the other provider | high | Cross-model check |
| docs | balanced | medium | Prose on the cost step-down model |
| `/ship` | light | medium | Routine publication flow |
| advisor role | frontier on the other provider | medium | A genuine second opinion |
| delegate role | provider default | medium | Predictable child tasks |

Coding classes share one flagship model and differ only by effort. Both
vendors advise lowering effort before lowering the model, a model switch
always invalidates the prompt cache, and a light model given a deep budget
mostly buys tokens (Luna scores 41% on 8-needle MRCR whatever the effort).
When a rule names a tier without an effort, the router's ladder applies:
frontier medium, flagship high, balanced high, light medium. The manual model
picker's defaults in `MODEL_CAPABILITIES` follow the same vendor-recommended
values.

## Where decisions are shown

- Composer Auto pill: `Auto · Balanced` before the first routed turn, then
  `Auto → Opus 5 · High`; the tooltip carries the rule reason and signals.
- Model resolution summary on the turn: routed target, task class · stance,
  source, rule, and signals.
- Settings › Auto (Model Router): profile picker, stance, role-table editor,
  budget guard, signals, eligible models, and a dry-run tester that resolves a
  pasted prompt without calling any provider.

## Settings and persistence

`settings.autoRoutingProfile` stores the versioned profile
(`AUTO_ROUTING_PROFILE_VERSION`). Legacy flags (`autoRoutingObjective`,
eligible-model lists, classifier and escalation toggles) migrate into the
profile on load; `autoRoutingEnabled` remains the kill switch.

## Pricing

`MODEL_PRICING` records list prices where known, for display and ordering. When
a model has no entry (runtime catalogs, unknown ids) the router falls back to
tier order.
