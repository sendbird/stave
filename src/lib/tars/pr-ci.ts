import { parsePrContextUrl } from "../pr-context";

/** Only an explicitly supplied GitHub PR can become a read target. */
export function tarsCiPullRequest(text: string) {
  if (text.includes("\nUntrusted issue context (suggestions are not authorization):")) return null;
  const urls = text.match(/https?:\/\/[^\s<>"\u3130-\u318f\uac00-\ud7af]+/gi) ?? [];
  if (urls.length !== 1) return null;
  const raw = urls[0]!.replace(/[.,;:!?)]+$/, "");
  const ref = parsePrContextUrl(raw);
  if (!ref || !ref.number || [ref.owner, ref.repo].some(part => part === "." || part === "..")) return null;
  const url = `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
  const words = text.replace(raw, " ").trim();
  // Pasting a PR alone or asking to inspect its CI enters a reply-only path.
  // A subsequent instruction to fix or publish follows the ordinary work path.
  const ciTopic = /\bci\b|checks?|build|tests?|pipeline|workflow|failed|failure|실패|검사|빌드|테스트|체크|체크런/i;
  const asksForEvidence = /\b(?:why|what|explain|summari[sz]e|summary|inspect|diagnos\w*|investigat\w*|analy[sz]e|show|report|reason|cause)\b|왜|요약|원인|알려|분석|살펴|확인|설명|보여/i;
  const asksForWork = /\b(?:fix|repair|patch|publish|rerun|merge|push|commit|implement|create|add|change|remove|delete|modify|update|run|restart)\b|수정|고쳐|고치|커밋|푸시|게시|병합|실행|구현|만들|추가|삭제|바꿔/i;
  const mixed = asksForWork.test(words);
  // Intake appends a reviewable paragraph, preserving unrelated unsent words above it.
  const last = text.trim().split(/\n\s*\n/).at(-1) ?? "";
  if (last.includes(raw) && asksForWork.test(last.replace(raw, "")) && !asksForEvidence.test(last.replace(raw, ""))) return null;
  // Default a CI-related link to a read; a model never chooses whether to admit actions on a summary.
  if (text.trim() !== raw && (!ciTopic.test(words) || (mixed && !asksForEvidence.test(words)))) return null;
  return { url, mixed };
}
