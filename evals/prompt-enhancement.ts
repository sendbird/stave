import { randomInt } from "node:crypto";
import { buildPromptEnhancementInferencePrompt, parsePromptEnhancementInference } from "../src/lib/providers/utility-inference";
import { PROMPT_ENHANCEMENT_DEPTHS } from "../src/lib/providers/prompt-enhancement-context";
import type { EvalProvider } from "./runner";

export const enhancementFixtures = [
  {
    id: "en-scroll", language: "en",
    draft: "Fix the list jumping when older messages load. Keep the existing pagination behavior.",
    context: {},
  },
  {
    id: "en-question", language: "en",
    draft: "Why is the retry button disabled after a timeout? Explain only. Don't edit files.",
    context: {},
  },
  {
    id: "ko-restore", language: "ko",
    draft: "복원 시 세션이 두 번 붙는 문제 고쳐줘. src/restore.ts와 $skill/terminal-guard 표기는 유지해.",
    context: { workspaceSummary: "재현: 같은 탭을 다시 열 때 세션에 두 번 연결됨." },
  },
  {
    id: "ko-tradeoff", language: "ko",
    draft: "검색 결과가 늦게 떠. 디바운스와 요청 취소 중 뭘 할지 비교하고 추천해줘. 로딩 표시 방식은 내가 결정할게.",
    context: {},
  },
] as const;

export const enhancementRubric = [
  "Faithfulness: preserves intent, scope, constraints, language and literal tokens. A question remains a question.",
  "Clarity: makes the outcome and any requested steps easy to understand.",
  "Method: where appropriate, points to first-hand evidence, a fitting technique and an independently observable check.",
  "Decision ownership: separates choices that evidence can settle from choices reserved for the user.",
  "For each candidate score each dimension 0 (violated), 1 (partial), 2 (meets), or N/A. Cite the output. Record scores before opening the key.",
];

export async function runEnhancementEvaluation({ provider, samples, coin = () => randomInt(2) === 1 }: {
  provider: EvalProvider;
  samples: number;
  coin?: () => boolean;
}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 100) throw new Error("samples must be an integer from 1 to 100");
  const packet = {
    rubric: enhancementRubric,
    pairs: [] as Array<{ id: string; language: string; draft: string; context: object; A: string; B: string }>,
  };
  const keyEntries = [];
  const readiness = await provider.ready();
  const observedModels = new Set<string>();
  for (const fixture of readiness.ready ? enhancementFixtures : []) {
    for (let sample = 1; sample <= samples; sample++) {
      const id = `${fixture.id}-${sample}`;
      const [first, second] = PROMPT_ENHANCEMENT_DEPTHS;
      const order = coin() ? [second, first] as const : [first, second] as const;
      const candidates = [];
      for (const depth of order) {
        try {
          const result = await provider.generate(buildPromptEnhancementInferencePrompt({ prompt: fixture.draft, ...fixture.context, depth }));
          const text = parsePromptEnhancementInference(result.text, fixture.draft);
          if (result.model) observedModels.add(result.model);
          const error = !text ? "Empty rewrite" : !result.model ? "Provider did not report a resolved model" : null;
          candidates.push({ depth, text, raw: result.text, model: result.model ?? null, cost: result.cost ?? null, error });
        } catch (error) {
          candidates.push({ depth, text: null, model: null, cost: null, error: error instanceof Error ? error.message : String(error) });
        }
      }
      const [a, b] = candidates;
      if (!a || !b) throw new Error("Expected two rewrite depths");
      keyEntries.push({ id, A: a, B: b });
      if (a.text && b.text && !a.error && !b.error && a.model === b.model) {
        packet.pairs.push({ id, language: fixture.language, draft: fixture.draft, context: fixture.context, A: a.text, B: b.text });
      }
    }
  }
  // Comparisons across different resolved models are not admissible, even when both sides of a pair match.
  if (observedModels.size > 1) packet.pairs = [];
  const status = !readiness.ready ? "skipped" : packet.pairs.length === keyEntries.length ? "completed" : "incomplete";
  const costs = keyEntries.flatMap(({ A, B }) => [A.cost, B.cost]);
  const cost = costs.length && costs.every(value => value !== null) ? costs.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  return {
    packet,
    key: { status, skipReason: readiness.ready ? null : readiness.detail ?? "Credentials unavailable.",
      requestedModel: provider.model, resolvedModels: [...observedModels], version: provider.version, cost, pairs: keyEntries },
  };
}
