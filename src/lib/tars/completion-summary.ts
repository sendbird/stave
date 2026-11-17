import type { TarsReportModel } from "./report-model";

/** Recognize explicit Markdown headings, including a standalone bold heading. */
function heading(line: string): string | null {
  const match = line.trim().match(/^#{1,6}\s+(.+?)\s*#*$/) ?? line.trim().match(/^\*\*(.+?)\*\*:?$/);
  return match?.[1]?.replace(/:$/, "") ?? null;
}

/** A plain first sentence only; the unchanged source stays in the disclosure. */
export function tarsSummaryExcerpt(text: string) {
  let fenced = false;
  const lines = text.split("\n").filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return false; }
    if (fenced || heading(line) !== null) return false;
    // Skip shell lines and standalone revision records, never reinterpret their outcome.
    return !/^\s*(?:[-*]\s+)?(?:[$>]\s|(?:bunx?|npm|npx|git|yarn|pnpm|node|tsc)\s|(?:commit|revision|sha)\s*[: ]\s*[a-f0-9]{7,40}\b|[a-f0-9]{7,40}(?:\.\.[a-f0-9]{7,40})?\s*$)/i.test(line);
  });
  const plain = lines.join(" ")
    .replace(/\([^)]*`(?:bunx?|npm|npx|git|yarn|pnpm|node|tsc)\s[^`]*`[^)]*\)/gi, "")
    .replace(/\(\s*(?:(?:commit|revision|sha)\s*[: ]\s*)?[a-f0-9]{7,40}(?:\.\.[a-f0-9]{7,40})?\s*\)/gi, "")
    // Require a digit and a hex letter for bare short hashes so prose and counts survive.
    .replace(/\b(?=[a-f0-9]{7,40}\b)(?=[a-f0-9]*[0-9])(?=[a-f0-9]*[a-f])[a-f0-9]{7,40}(?:\.\.[a-f0-9]{7,40})?\b|\b[a-f0-9]{40}\b/gi, "")
    .replace(/!?(?:\[([^\]]+)\])\([^)]+\)/g, "$1")
    .replace(/[*`_]/g, "").replace(/^\s*[-+]\s+/, "")
    .replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/\s+([.!?。])/g, "$1").trim();
  const first = (plain.match(/.*?[.!?。](?=\s|$)|.+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .find((sentence) => !/\b(?:bunx?|npm|npx|git|yarn|pnpm|node|tsc)\s/i.test(sentence)) ?? "";
  return first.length > 320 ? `${first.slice(0, 320).trimEnd()}…` : first;
}

const CAVEAT_SECTION = /^(?:limitations?|remaining(?: work)?|caveats?|not (?:verified|tested|checked)|unverified|제약(?: 사항)?|한계|미검증|미확인|남은(?: 작업| 일)?)(?:\s|$)/i;
const CAVEAT = /\b(?:not (?:verified|tested|checked|implemented|complete)|unverified|limitations?|incomplete|blocked)\b|미(?:검증|확인|완료|구현)|제약|한계|확인하지|남은/i;
// Match only standalone absence statements; qualifiers or following caveats stay visible.
const NONE = /^(?:none|n\/a|없음|no (?:(?:known )?limitations?|remaining work|caveats?)|nothing (?:is )?(?:blocked|remaining)|(?:(?:제약|한계|미검증|미확인)(?: 사항)?|남은 (?:작업|일))(?:이|은|는)?\s*없(?:음|습니다|다|어요)?)[.!。]?$/i;

/** Only explicit text is extracted; no status is inferred from free prose. */
function explicitCaveats(text: string | null): string[] {
  const result: string[] = [];
  let inCaveats = false;
  let paragraph: string[] = [];
  const flush = () => {
    const body = paragraph.join("\n").trim();
    if (body) result.push(body);
    paragraph = [];
  };
  for (const line of (text ?? "").split("\n")) {
    const title = heading(line);
    if (title !== null) {
      flush();
      inCaveats = CAVEAT_SECTION.test(title);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const plain = line.trim().replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
    const relevant = plain.split(/(?<=[.!?。])\s+/).filter((sentence) => !NONE.test(sentence));
    if (relevant.some((sentence) => inCaveats || CAVEAT.test(sentence))) paragraph.push(line);
  }
  flush();
  return [...new Set(result)];
}

/** Structured remaining work stays verbatim, regardless of prose extraction. */
export function tarsSummaryCaveats(model: TarsReportModel) {
  // A passed review that ended the run is its last word, so its caveats still stand beside the work's headline.
  const last = model.summaries.at(-1)?.text;
  return [...new Set([...explicitCaveats(model.summary), ...(last && last !== model.summary ? explicitCaveats(last) : []), ...model.leftBehind])];
}

/** Earlier notes are historical context, never claims that a limitation remains unresolved. */
export function tarsEarlierSummaryCaveats(model: TarsReportModel) {
  return model.summaries.slice(0, -1).filter((stage) => stage.text !== model.summary).flatMap((stage) => {
    const caveats = explicitCaveats(stage.text);
    return caveats.length ? [{ ...stage, caveats }] : [];
  });
}
