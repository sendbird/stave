# Heron User Guide Sources

These files are the sources of the Stave user guide published in Atelier Heron
as product `stave`, spec `user-guide`:

- `user-guide.ko.md`: Korean source
- `user-guide.en.md`: English source

They use the Heron Markdown format, not plain GitHub Markdown. The repository is
the source of truth; Heron holds the published revisions.

## When To Update

Update both sources in the same change as any user-facing change to a feature,
label, entry point, default, workflow step or limitation that the guide
describes. Keep the matching `docs/features/` guide in sync as well. Check labels
against `src/locales/en` and `src/locales/ko`, not against older docs.

## Screenshots

Heron cannot embed images. Each section links to a PNG under
`docs/screenshots/guide/<locale>/` through its GitHub `main` URL, so a merged
re-capture updates what the guide shows without editing the links.

```bash
node scripts/capture-guide-screenshots.mjs
GUIDE_SCREENSHOT_ONLY=overview,fleet GUIDE_SCREENSHOT_LOCALES=ko node scripts/capture-guide-screenshots.mjs
```

The script uses synthetic data only. Open every new image before committing it.
When you add a screenshot, add a capture step to the script and link the PNG
from both sources.

## Publishing A Revision

1. Read the current Heron source first (`heron_get_spec product=stave
   spec=user-guide format=source`) and reconcile any edit made directly in
   Heron back into these files.
2. Run `heron_validate_spec kind=spec product=stave spec=user-guide` with both
   sources until it reports no errors.
3. Create the revision with `heron_create_revision` (or `heron_update_revision`
   while a draft is open). Use change kind `content` for behavior changes and
   `editorial` for wording or layout only; wire impact is `none`.
4. Move it to `review`; a `stave` product owner publishes it as current.

## Format Limits Found So Far

- Both locales need the same pages, heading counts per page, directive order and
  table row IDs. Only prose, titles, captions and labels are translated.
- Diagram edge flags are bare words: `edge a -> b main : label`,
  `edge a -> b dashed : label`. Bracketed flags fail validation.
- `states` names are compared across locales and cannot be translated. Use a
  `diagram architecture` or `pipeline` when the labels must be localized.
- A table cell with an odd number of backticks breaks the row, even when the
  backtick is escaped. Describe the key in words instead.
- Images (`![...](...)`) are not rendered. Link to the screenshot instead.
