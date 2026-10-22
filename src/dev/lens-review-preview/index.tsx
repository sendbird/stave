import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { LensReviewRecordView } from "@/components/panes/surfaces/lens/LensReviewRecordView";
import type { LensReviewRecord } from "@/lib/lens/lens-review-record";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";

/**
 * Saved Lens review records on the dev preview (`?stavePreview=lens-review`):
 * confirmed, needing a re-check after the page changed, a re-check the
 * reviewer asked for, and a record whose capture file is gone.
 * `&theme=dark` or `&theme=<built-in theme id>` and `&lang=ko` apply.
 */
const params = new URLSearchParams(window.location.search);

function targetImage(label: string, fill: string, overflow: boolean): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160"><rect width="480" height="160" fill="#f6f7f9"/><rect x="24" y="44" width="${overflow ? 520 : 300}" height="72" rx="10" fill="${fill}"/><text x="44" y="88" font-family="sans-serif" font-size="22" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const BEFORE = targetImage("Save changes and continue editing", "#7c3aed", true);
const AFTER = targetImage("Save changes", "#7c3aed", false);

const base: LensReviewRecord = {
  id: "record-1",
  taskId: "preview-task",
  workspaceId: "preview-workspace",
  lensSessionId: "lens-1",
  annotationId: "annotation-1",
  pageUrl: "http://localhost:5173/settings",
  viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
  before: { imageId: "lens-comment-image:preview-workspace:lens-1:annotation-1" },
  afterImagePath: "lens-reviews/preview/record-1.png",
  documentId: "document-1",
  verdict: "confirmed",
  confirmedAt: "2026-10-22T06:21:00.000Z",
  capturedAt: "2026-10-22T06:20:00.000Z",
  updatedAt: "2026-10-22T06:21:00.000Z",
};

const CASES: Array<{ id: string; record: LensReviewRecord; image?: string }> = [
  { id: "confirmed", record: base, image: AFTER },
  { id: "page-changed", record: { ...base, verdict: "needs-recheck", recheckReason: "page-changed", updatedAt: "2026-10-22T06:40:00.000Z" }, image: AFTER },
  { id: "reviewer", record: { ...base, verdict: "needs-recheck", recheckReason: "reviewer", confirmedAt: undefined }, image: AFTER },
  { id: "missing-capture", record: base },
];

export function LensReviewPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [records, setRecords] = useState(CASES);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
    applyAppLocale(params.get("lang") ?? "en");
  }, [theme, builtinTheme]);
  return (
    <main className={sx(styles.page)}>
      {records.map((entry) => (
        <section key={entry.id} className={sx(styles.case)} data-preview-case={entry.id}>
          <p className={sx(styles.caption)}>{entry.id}</p>
          <LensReviewRecordView
            record={entry.record}
            image={entry.image}
            original={BEFORE}
            aspectRatio={3}
            onVerdict={(verdict) =>
              setRecords((current) => current.map((candidate) => candidate.id === entry.id
                ? { ...candidate, record: { ...candidate.record, verdict, recheckReason: verdict === "confirmed" ? undefined : "reviewer" } }
                : candidate))}
          />
        </section>
      ))}
    </main>
  );
}

const styles = stylex.create({
  page: { display: "grid", gap: vars["--ads-space-16"], padding: vars["--ads-space-24"], maxWidth: 560, backgroundColor: vars["--ads-color-canvas"], minHeight: "100vh" },
  case: { padding: vars["--ads-space-12"], borderRadius: vars["--ads-radius-panel"], borderWidth: vars["--ads-border-width-hairline"], borderStyle: "solid", borderColor: vars["--ads-color-border"], backgroundColor: vars["--ads-color-canvas"] },
  caption: { margin: 0, marginBottom: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
});
