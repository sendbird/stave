# Feature Guide Authoring

Use this folder for user-facing feature guides.

## Required Template

- Start every new feature guide from [`docs/templates/feature-guide-template.md`](../templates/feature-guide-template.md).
- Keep the section order unless the feature has a strong reason to differ.
- Write for end users first. Move implementation detail to `docs/architecture/` or `docs/developer/`.

## When To Add Or Update A Guide

- Add a guide when shipping a new user-facing feature.
- Update the existing guide when behavior, entry points, limitations, or workflow steps change.
- If a UI change alters how a feature is configured or used, the feature guide should change in the same PR or task.

## Scope Rules

- `docs/features/`: task-oriented usage guides.
- `docs/architecture/`: how the system is built.
- `docs/developer/`: contributor-only debugging and engineering detail.
- `docs/ui/`: design-system and UX rationale.

## Publishing Rules

- Add or update public end-user navigation in [`site/src/public-docs.ts`](../../site/src/public-docs.ts).
- Use stable headings so the same content can be reused in a future docs website.
- Prefer short procedures, explicit UI labels, and small real examples over long prose.
- Add screenshots when a guide depends on finding a specific UI surface or visually confirming success.
- Keep screenshots durable: crop to the relevant surface, avoid personal paths or private prompt content, and add a short caption that explains what to look at.
