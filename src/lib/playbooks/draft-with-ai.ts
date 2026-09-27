/**
 * Draft with AI: a sentence, or a pasted example of how the user worked,
 * becomes an editable playbook draft. The model answers with JSON; this module
 * builds the prompt and turns the answer into a playbook the schema accepts.
 * The result is always a draft the user reviews — never saved on its own.
 *
 * Pure. The call itself lives in `src/store/playbook-draft-runtime.ts`.
 */
import { createActionStage, uniqueStageId } from "./library";
import { generatePlaybookId, parsePlaybook } from "./normalize";
import {
  AI_STAGE_ROLES,
  CHECK_INS,
  DEFAULT_CHECK_INS,
  MAX_PLAYBOOK_STAGES,
  PLAYBOOK_LIMITS,
  PLAYBOOK_VERSION,
  type Playbook,
  type PlaybookStage,
  type StaveActionType,
} from "./schema";

export const MAX_DRAFT_DESCRIPTION_CHARS = 6_000;

const ACTION_TYPES: readonly StaveActionType[] = ["open-draft-pr", "watch-checks", "mark-pr-ready"];

export function buildPlaybookDraftPrompt(description: string): string {
  return [
    "You design playbooks for a coding assistant. A playbook is an ordered list of stages that an AI agent",
    "runs on one task, one stage per turn, until the outcome is reached.",
    "",
    "Turn the user's description below into one playbook. Answer with a single JSON object and nothing else:",
    "{",
    '  "name": string (3-6 words),',
    '  "purpose": string (one sentence: the outcome this playbook delivers),',
    '  "checkIns": "every-stage" | "plan-and-publishing" | "when-stuck",',
    '  "stages": [',
    '    { "kind": "ai", "title": string (1-3 words), "instruction": string, "doneWhen": string, "role"?: "plan" | "publish" }',
    '    | { "kind": "action", "action": "open-draft-pr" | "watch-checks" | "mark-pr-ready" }',
    "  ]",
    "}",
    "",
    "Rules:",
    `- Use 2 to ${Math.min(8, MAX_PLAYBOOK_STAGES)} stages. Start with a stage that understands the request.`,
    '- "instruction" says what the agent does in that stage, in 1-3 sentences, imperative voice.',
    '- "doneWhen" is a checkable condition, not a restatement of the instruction.',
    '- Mark the stage that writes the plan with role "plan"; mark a stage that writes outside the repository',
    '  (posts a message, updates a ticket) with role "publish".',
    "- Use Stave actions only for pull request steps; Stave performs them itself. Each at most once, and",
    '  "watch-checks" and "mark-pr-ready" come after "open-draft-pr".',
    "- Do not invent tools, credentials or services the description does not mention.",
    '- Prefer "plan-and-publishing" unless the description asks for more or fewer check-ins.',
    "",
    "Description:",
    "<<<",
    description.trim().slice(0, MAX_DRAFT_DESCRIPTION_CHARS),
    ">>>",
  ].join("\n");
}

/** The outermost JSON object in a model answer, tolerating a code fence. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start === -1 || end <= start ? null : text.slice(start, end + 1);
}

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export type PlaybookDraftResult = { ok: true; playbook: Playbook } | { ok: false; message: string };

/** Turns the model's answer into a validated playbook draft. */
export function parsePlaybookDraft(text: string, now: Date): PlaybookDraftResult {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, message: "The draft came back without a playbook. Try describing it again." };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "The draft could not be read. Try again." };
  }
  const taken: string[] = [];
  const stages: PlaybookStage[] = [];
  const rawStages = Array.isArray(raw.stages) ? raw.stages.slice(0, MAX_PLAYBOOK_STAGES) : [];
  for (const candidate of rawStages) {
    if (!candidate || typeof candidate !== "object") continue;
    const stage = candidate as Record<string, unknown>;
    if (stage.kind === "action") {
      const type = ACTION_TYPES.find((action) => action === stage.action);
      if (!type || stages.some((existing) => existing.kind === "action" && existing.action.type === type)) continue;
      const action = createActionStage(type, taken);
      taken.push(action.id);
      stages.push(action);
      continue;
    }
    const title = asText(stage.title, PLAYBOOK_LIMITS.stageTitle) || "Stage";
    const role = AI_STAGE_ROLES.find((value) => value === stage.role);
    const id = uniqueStageId(title, taken);
    taken.push(id);
    stages.push({
      id,
      title,
      kind: "ai",
      instruction: asText(stage.instruction, PLAYBOOK_LIMITS.instruction),
      doneWhen: asText(stage.doneWhen, PLAYBOOK_LIMITS.doneWhen),
      ...(role ? { role } : {}),
    });
  }
  const timestamp = now.toISOString();
  const checkIns = CHECK_INS.find((value) => value === raw.checkIns) ?? DEFAULT_CHECK_INS;
  const playbook = {
    version: PLAYBOOK_VERSION,
    id: generatePlaybookId(),
    name: asText(raw.name, PLAYBOOK_LIMITS.name) || "Drafted playbook",
    purpose: asText(raw.purpose, PLAYBOOK_LIMITS.purpose),
    checkIns,
    team: "solo" as const,
    stages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const parsed = parsePlaybook(playbook);
  if (parsed.ok) return parsed;
  // A draft is still worth editing when a field is missing or a stage is out
  // of order: the editor shows each issue next to its field. Only a draft
  // with no usable stage is refused.
  if (stages.length === 0) return { ok: false, message: "The draft had no usable stages. Try describing the steps." };
  return { ok: true, playbook: playbook as Playbook };
}
