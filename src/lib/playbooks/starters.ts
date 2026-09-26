import { generatePlaybookId } from "./normalize";
import {
  DEFAULT_CHECK_INS,
  DEFAULT_WATCH_CHECKS,
  PLAYBOOK_VERSION,
  type ActionStage,
  type AiStage,
  type Playbook,
} from "./schema";

/** A playbook without the identity it receives when the user adds it. */
export type PlaybookTemplate = Omit<Playbook, "id" | "createdAt" | "updatedAt">;

export interface PlaybookStarter {
  id: string;
  description: string;
  template: PlaybookTemplate;
}

export interface StageTemplate {
  id: string;
  label: string;
  description: string;
  stage: AiStage;
}

const openDraftPr: ActionStage = {
  id: "open-draft-pr",
  title: "Open draft PR",
  kind: "action",
  action: { type: "open-draft-pr" },
};

const watchChecks: ActionStage = {
  id: "watch-checks",
  title: "Watch checks",
  kind: "action",
  action: { type: "watch-checks", ...DEFAULT_WATCH_CHECKS },
};

const readyForReview: ActionStage = {
  id: "ready-for-review",
  title: "Ready for review",
  kind: "action",
  action: { type: "mark-pr-ready" },
};

const build: AiStage = {
  id: "build",
  title: "Build",
  kind: "ai",
  instruction:
    "Implement the smallest complete change that meets the acceptance criteria. Follow the repository's conventions and instructions, and leave unrelated files untouched.",
  doneWhen:
    "Every acceptance criterion is addressed by the diff, or reported as unmet with the reason.",
};

const verify: AiStage = {
  id: "verify",
  title: "Verify",
  kind: "ai",
  instruction:
    "Run the repository's relevant checks, such as typecheck, lint and focused tests, and exercise the changed behavior. Review the diff and fix defects this work caused. Commit the verified change on the workspace branch with a clear message.",
  doneWhen:
    "The relevant checks pass, each acceptance criterion is marked met, unmet or unverified, and the change is committed.",
};

const createIssue: AiStage = {
  id: "create-issue",
  title: "Create issue",
  kind: "ai",
  role: "publish",
  instruction:
    "Search the tracker named in the assignment, or the repository's usual tracker, for an existing issue about this request. Create or update exactly one issue with the restated request and the acceptance criteria. Register it in the workspace with `stave_add_workspace_jira_issue` or `stave_add_workspace_crane_issue`. If no tracker is reachable, report the stage as blocked instead of guessing.",
  doneWhen: "One issue link is registered in the workspace and reported as evidence.",
};

const reportBack: AiStage = {
  id: "report-back",
  title: "Report back to the thread",
  kind: "ai",
  role: "publish",
  instruction:
    "Reply once in the original Slack thread with a short note for the requester: what changed, the pull request and issue links, and anything they need to decide or check. If this mission already replied in the thread, do not post again.",
  doneWhen: "One reply is posted in the thread and its link is reported as evidence.",
};

export const PLAYBOOK_STARTERS: readonly PlaybookStarter[] = [
  {
    id: "slack-request-to-pr",
    description:
      "Turn a Slack request into an issue, a verified change and a pull request ready for review, then tell the requester.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Slack request → PR",
      purpose:
        "Take a request from a Slack thread through a tracked issue, a verified change and a pull request that is ready for review, then report back to the requester in the thread.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints:
        "Never merge or deploy. Keep unrelated changes out of the pull request.",
      stages: [
        {
          id: "understand",
          title: "Understand",
          kind: "ai",
          role: "plan",
          instruction:
            "Read the Slack thread linked in the assignment with your Slack tools, including replies and linked documents, and register it with `stave_add_workspace_slack_thread`. Inspect the relevant code and earlier decisions. Work out the outcome the requester needs, the scope, the constraints and any open questions.",
          doneWhen:
            "The request is restated in one paragraph, open questions are listed, and two to six checkable acceptance criteria are reported.",
        },
        createIssue,
        build,
        verify,
        openDraftPr,
        watchChecks,
        readyForReview,
        reportBack,
      ],
    },
  },
  {
    id: "request-to-pr",
    description:
      "Turn a request into a verified change and a pull request ready for review.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Request → PR",
      purpose:
        "Take the request in the assignment through a verified change to a pull request that is ready for review.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints:
        "Never merge or deploy. Keep unrelated changes out of the pull request.",
      stages: [
        {
          id: "understand",
          title: "Understand",
          kind: "ai",
          role: "plan",
          instruction:
            "Read the request and any linked issue, thread or document. Inspect the relevant code and earlier decisions. Work out the outcome, the scope, the constraints and any open questions.",
          doneWhen:
            "The request is restated in one paragraph, open questions are listed, and two to six checkable acceptance criteria are reported.",
        },
        build,
        verify,
        openDraftPr,
        watchChecks,
        readyForReview,
      ],
    },
  },
  {
    id: "fix-failing-checks",
    description: "Get this workspace's pull request back to green.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Fix failing checks",
      purpose:
        "Find why the checks on this workspace's pull request fail, fix the failures this branch caused, and watch the checks until they pass.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints:
        "Never merge. Do not skip, disable or loosen a check to make it pass.",
      stages: [
        {
          id: "diagnose",
          title: "Diagnose",
          kind: "ai",
          instruction:
            "Read the failing checks on this workspace's pull request and their job logs, for example with `gh pr checks` and `gh run view --log-failed`. Find the cause of each failure and whether this branch caused it. Do not change files yet.",
          doneWhen:
            "Each failing check is named with its cause and log link, and failures this branch did not cause are called out.",
        },
        {
          id: "fix",
          title: "Fix",
          kind: "ai",
          instruction:
            "Fix the failures this branch caused. Run the matching checks locally, then commit and push the branch.",
          doneWhen:
            "The failing checks pass locally, or the ones that cannot run locally are named, and the fix is pushed.",
        },
        watchChecks,
      ],
    },
  },
  {
    id: "address-review",
    description:
      "Work through review comments on this workspace's pull request and reply to reviewers.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Address review",
      purpose:
        "Resolve the review feedback on this workspace's pull request with verified changes and clear replies.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints:
        "Never merge. Do not resolve review threads; reviewers do that.",
      stages: [
        {
          id: "read-review",
          title: "Read review",
          kind: "ai",
          role: "plan",
          instruction:
            "Read the review comments and requested changes on this workspace's pull request, for example with `gh pr view --comments` and the review threads. Group them into changes to make, questions to answer, and suggestions to decline with a reason. Do not change files yet.",
          doneWhen:
            "Each review point is grouped, and every change to make is reported as an acceptance criterion.",
        },
        {
          id: "change",
          title: "Change",
          kind: "ai",
          instruction:
            "Make the agreed changes, run the relevant checks, then commit and push the branch.",
          doneWhen:
            "Every agreed change is in the pushed branch and the relevant checks pass.",
        },
        watchChecks,
        {
          id: "reply-to-reviewers",
          title: "Reply to reviewers",
          kind: "ai",
          role: "publish",
          instruction:
            "Reply once on each review thread you worked on: what changed and where, or why you declined. Answer the reviewers' questions.",
          doneWhen: "Every review point has one reply, and the replies are reported as evidence.",
        },
      ],
    },
  },
];

/** Stages offered by "Add stage" in the Playbook Builder. */
export const STAGE_TEMPLATES: readonly StageTemplate[] = [
  {
    id: "create-issue",
    label: "Create issue",
    description: "Find or create one tracker issue for the work.",
    stage: createIssue,
  },
  {
    id: "deploy-preview",
    label: "Deploy preview",
    description: "Deploy a preview of the branch with the repository's own steps.",
    stage: {
      id: "deploy-preview",
      title: "Deploy preview",
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
    label: "Report back to the thread",
    description: "Reply once in the Slack thread the request came from.",
    stage: reportBack,
  },
  {
    id: "visual-check",
    label: "Visual check",
    description: "Check the changed screens in Stave Lens.",
    stage: {
      id: "visual-check",
      title: "Visual check",
      kind: "ai",
      instruction:
        "Open each changed screen in Stave Lens with `stave_lens_navigate`, then inspect it with `stave_lens_snapshot` and `stave_lens_screenshot` in light and dark themes. Check the acceptance criteria that concern the interface and fix visual defects this work caused.",
      doneWhen:
        "A screenshot of each changed screen is reported as evidence, with defects fixed or listed.",
    },
  },
];

export function findPlaybookStarter(id: string): PlaybookStarter | undefined {
  return PLAYBOOK_STARTERS.find((starter) => starter.id === id);
}

export function createPlaybookFromStarter(
  starter: PlaybookStarter,
  options: { now: Date; id?: string },
): Playbook {
  const timestamp = options.now.toISOString();
  return {
    ...structuredClone(starter.template),
    id: options.id ?? generatePlaybookId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** A copy of the template's stage with an id no other stage uses. */
export function createStageFromTemplate(
  template: StageTemplate,
  existingStageIds: Iterable<string>,
): AiStage {
  const taken = new Set(existingStageIds);
  let id = template.stage.id;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${template.stage.id}-${suffix}`;
  }
  return { ...structuredClone(template.stage), id };
}
