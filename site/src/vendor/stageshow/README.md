# Vendored illustration kit

The landing page's product demo (`site/src/hero-demo/`) is drawn with a subset
of a third-party React kit for animated product illustrations.

- Upstream: https://github.com/benjitaylor/skills/tree/8020574/stageshow/kit
- Commit: `802057409787133703c56001080169e347305572`
- License: MIT, `LICENSE` in this directory (also listed in the repository
  `NOTICE`).
- Taken: `stage`, `act`, `clock`, `cursor`, `cursors`, `keys`, `looks`,
  `measure`, `reduced-motion`, `util`, `ease`, `window` and their CSS, plus
  `motion/Collapse`, `motion/States`, `parts/Check` and `parts/Spinner`. The
  kit's brand marks and app icons are not included.
- Modified: non-null assertions and one tuple cast in `act.ts`, `measure.ts`
  and `stage.tsx` so the files pass this repository's
  `noUncheckedIndexedAccess` typecheck. Runtime behavior is unchanged.

Do not edit these files for demo styling; restyle through the stage's tokens,
props and the demo's own classes. To update, copy the same files from a newer
upstream commit, reapply the typecheck-only changes and update this record.
