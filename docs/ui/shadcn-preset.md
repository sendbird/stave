# shadcn Preset

Current stored UI metadata:

- style: `radix-vega`
- preset reference: `bNQ7GS20w`
- menu treatment: `default-translucent`
- menu accent: `subtle`
- Tailwind class prefix: empty string
- generated alias set includes `@/hooks`
- default sans stack: `Geist Variable`

To bootstrap the same preset shape:

```bash
bunx --bun shadcn@latest init --preset bNQ7GS20w
```

`components.json` stores the style/menu metadata, while the preset's color token palette is applied in `src/globals.css`. The current `bNQ7GS20w` swap kept the metadata and font stack the same and only changed the color tokens.

## Motion Primitives

Stave uses a small set of shared motion utilities in `src/globals.css` for
core shadcn/Radix primitives. The current timings and scale values are adapted
from the restrained patterns in [transitions.dev](https://transitions.dev/),
but implemented as local CSS variables and keyframes instead of an additional
runtime dependency.

Current shared motion classes:

- `t-dropdown` for anchored menus and popovers:
  `DropdownMenuContent`, `DropdownMenuSubContent`, `ContextMenuContent`,
  `ContextMenuSubContent`, `PopoverContent`, and `SelectContent`
- `t-modal` for `DialogContent`
- `t-overlay` for `DialogOverlay`
- `t-tooltip` for `TooltipContent`
- `t-skeleton-pulse` for `Skeleton`

Motion variables such as `--dropdown-open-dur`, `--modal-open-dur`,
`--tt-in-dur`, and `--pulse-dur` live in `:root` because they are behavior
tokens, not user-editable color or surface tokens. Do not add them to
`THEME_TOKEN_NAMES`, `EXTENDED_THEME_TOKEN_NAMES`, built-in custom themes, or
`@theme inline` unless a future change intentionally exposes motion as part of
the theme system.

All shared motion must respect the global reduced-motion path. New motion
classes should either be covered by the existing `prefers-reduced-motion:
reduce` block in `src/globals.css` or add an equivalent reduced-motion branch
in the same file. Keep side-panel motion such as `Sheet` and `Drawer` separate
from modal/menu motion because their directional slide behavior is part of the
component contract.

When changing these primitives, verify at minimum:

- `bun run typecheck`
- `bun test tests/custom-theme.test.ts` if `src/globals.css` or theme-adjacent
  behavior changed
- `bun run build` for Tailwind class and CSS generation regressions
