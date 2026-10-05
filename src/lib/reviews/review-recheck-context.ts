import { z } from "zod";
import { parseReviewFindings, type ReviewFinding, type ParsedReviewFindings } from "./review-findings";

const RECHECK_START = "Re-check an earlier review of this workspace. Do not review from scratch.";
const EarlierFindingsSchema = z.array(z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
  severity: z.enum(["critical", "major", "minor"]),
  title: z.string().min(1),
  file: z.string().nullable(),
  line: z.number().int().positive().nullable(),
  detail: z.string().nullable(),
})).min(1);

/** Read only the outer generated request, never a quoted earlier prompt or a reply's claim about its scope. */
export function readReviewRecheckFindings(prompt: string | null | undefined):
  { ok: true; findings: ReviewFinding[] } | { ok: false } | null {
  const text = prompt?.trim().replace(/\r\n?/g, "\n");
  if (!text?.startsWith(RECHECK_START)) return null;
  const block = /^Earlier findings \(JSON\):\n```json\n([\s\S]*?)\n```(?:\n|$)/m.exec(text);
  if (!block) return { ok: false };
  try {
    const parsed = EarlierFindingsSchema.safeParse(JSON.parse(block[1]!));
    if (!parsed.success || new Set(parsed.data.map((finding) => finding.id)).size !== parsed.data.length) return { ok: false };
    return { ok: true, findings: parsed.data.map((finding) => ({ ...finding, fix: null })) };
  } catch {
    return { ok: false };
  }
}

export function parseReviewFindingsForPrompt(
  reply: string | null | undefined,
  prompt: string | null | undefined,
): ParsedReviewFindings {
  const earlier = readReviewRecheckFindings(prompt);
  if (earlier && !earlier.ok) return { ok: false, reason: "invalid" };
  return parseReviewFindings(reply, earlier ? { earlierFindings: earlier.findings } : {});
}
