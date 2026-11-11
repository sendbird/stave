import { z } from "zod";
import { parseInlineRenderUrl } from "../inline-render/inline-render";

export const ArtifactPresentationSchema = z.enum(["component-render", "example", "capture", "unspecified"]);
export const ReportArtifactSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: z.url().max(2000),
  /** A declaration by the agent, never host verification of the page's contents. */
  presentation: ArtifactPresentationSchema.optional(),
  /** The original local source, retained by the host after archiving. */
  sourceUrl: z.url().max(2000).optional(),
  savedAt: z.iso.datetime().optional(),
  /** Existing Workspace Tools process; the user starts it explicitly. */
  livePreview: z.object({ scriptId: z.string().trim().min(1).max(160), url: z.url().max(2000).refine((value) => /^https?:\/\//i.test(value)) }).strict().optional(),
}).strict();
/** Only the host may attach provenance and archive timestamps. */
export const ReportArtifactInputSchema = ReportArtifactSchema.omit({ sourceUrl: true, savedAt: true }).refine(
  (artifact) => !artifact.livePreview || Boolean(savedHtmlReference(artifact.url)) || /^file:.*\.html?(?:[?#]|$)/i.test(artifact.url),
  // i18n-ignore: diagnostic for model-facing tool input, never UI copy
  { message: "livePreview requires a saved HTML or a local file:// HTML artifact. Report HTTP links without livePreview." },
);
export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

export function savedHtmlReference(url: string) {
  return parseInlineRenderUrl(url)?.renderId ?? null;
}


export function isLocalPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}


export const MAX_RETAINED_REPORT_ARTIFACTS = 100;

/** Corrected reports and retried stages keep saved originals; a new save has its own immutable URL. */
export function retainSavedReportArtifacts(previous: readonly ReportArtifact[], current: readonly ReportArtifact[]): ReportArtifact[] {
  const artifacts = new Map(previous.filter((artifact) => savedHtmlReference(artifact.url)).map((artifact) => [artifact.url, artifact]));
  for (const artifact of current) artifacts.set(artifact.url, artifact);
  if (artifacts.size > MAX_RETAINED_REPORT_ARTIFACTS) throw new Error("This run already holds 100 report artifacts. Start a new run for additional comparisons.");
  return [...artifacts.values()];
}
