/**
 * Git / GitHub status identity. These resolve the `service-git-*` theme
 * tokens so PR chrome, sidebar glyphs, and source-control codes share one
 * palette instead of borrowing ADS success / accent / danger.
 */
export const SERVICE_GIT = {
  open: "var(--service-git-open)",
  merged: "var(--service-git-merged)",
  closed: "var(--service-git-closed)",
  modified: "var(--service-git-modified)",
} as const;
