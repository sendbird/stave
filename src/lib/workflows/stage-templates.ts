import { i18n } from "@/i18n/runtime";
import type { AiStage } from "./schema";

/**
 * Stages offered by "Add stage" in an agent's workflow editor
 * (`src/components/workflows/StageList.tsx`).
 */
export interface StageTemplate {
  id: string;
  label: string;
  description: string;
  stage: AiStage;
}

export const createIssue: AiStage = {
  id: "create-issue",
  get title() { return i18n.t("agentRuns:stageTemplates.title"); },
  kind: "ai",
  role: "publish",
  instruction:
    "Search the tracker named in the assignment, or the repository's usual tracker, for an existing issue about this request. Create or update exactly one issue with the restated request and the acceptance criteria. Register it in the workspace with `stave_add_workspace_jira_issue` or `stave_add_workspace_crane_issue`. If no tracker is reachable, report the stage as blocked instead of guessing.",
  doneWhen: "One issue link is registered in the workspace and reported as evidence.",
};

export const reportBack: AiStage = {
  id: "report-back",
  get title() { return i18n.t("agentRuns:stageTemplates.title2"); },
  kind: "ai",
  role: "publish",
  instruction:
    "Reply once in the original Slack thread with a short note for the requester: what changed, the pull request and issue links, and anything they need to decide or check. If this run already replied in the thread, do not post again.",
  doneWhen: "One reply is posted in the thread and its link is reported as evidence.",
};

export const STAGE_TEMPLATES: readonly StageTemplate[] = [
  {
    id: "create-issue",
    get label() { return i18n.t("agentRuns:stageTemplates.label"); },
    get description() { return i18n.t("agentRuns:stageTemplates.description"); },
    stage: createIssue,
  },
  {
    id: "deploy-preview",
    get label() { return i18n.t("agentRuns:stageTemplates.label2"); },
    get description() { return i18n.t("agentRuns:stageTemplates.description2"); },
    stage: {
      id: "deploy-preview",
      get title() { return i18n.t("agentRuns:stageTemplates.title3"); },
      kind: "ai",
      role: "publish",
      instruction:
        "Deploy a preview of this branch by following the repository's deploy instructions, such as AGENTS.md, the README or its documented scripts, for example an Amplify branch deployment. Never deploy to production. Register the preview link with `stave_add_workspace_amplify_link` for Amplify, otherwise with `stave_add_workspace_resource`.",
      doneWhen:
        "The preview URL serves this branch's change, and its link is registered and reported as evidence.",
    },
  },
  {
    id: "report-back",
    get label() { return i18n.t("agentRuns:stageTemplates.label3"); },
    get description() { return i18n.t("agentRuns:stageTemplates.description3"); },
    stage: reportBack,
  },
  {
    id: "visual-check",
    get label() { return i18n.t("agentRuns:stageTemplates.label4"); },
    get description() { return i18n.t("agentRuns:stageTemplates.description4"); },
    stage: {
      id: "visual-check",
      get title() { return i18n.t("agentRuns:stageTemplates.title4"); },
      kind: "ai",
      instruction:
        "Open each changed screen in Stave Lens with `stave_lens_navigate`, then inspect it with `stave_lens_snapshot` and `stave_lens_screenshot` in light and dark themes. Check the acceptance criteria that concern the interface and fix visual defects this work caused.",
      doneWhen:
        "A screenshot of each changed screen is reported as evidence, with defects fixed or listed.",
    },
  },
];
