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

/** Work that is not a pull request: research, documents, investigation, coordination, review. */
const WORK_STARTERS: readonly PlaybookStarter[] = [
  {
    id: "research-question",
    description: "Answer a question with sourced evidence and a recommendation.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Research a question",
      purpose: "Answer the question in the assignment with sourced evidence and a practical recommendation.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "Separate findings from assumptions. Cite every source with its link and date. Do not change files.",
      stages: [
        {
          id: "scope",
          title: "Scope",
          kind: "ai",
          role: "plan",
          instruction:
            "Restate the question and the decision it informs. List what would change the answer and the sources worth checking, starting with the workspace's own context.",
          doneWhen: "The question, the decision it informs and the sources to check are reported.",
        },
        {
          id: "research",
          title: "Research",
          kind: "ai",
          instruction:
            "Read primary sources and the relevant workspace context. Record each source's link and date, and note where sources disagree.",
          doneWhen: "Findings are reported with their sources, and assumptions and conflicting evidence are called out.",
        },
        {
          id: "recommend",
          title: "Recommend",
          kind: "ai",
          instruction:
            "Give a practical recommendation, how confident you are, and what would change it. Save the recommendation and next steps in the workspace Information panel with `stave_append_workspace_notes`.",
          doneWhen: "A recommendation with its confidence and next steps is reported and saved in Information.",
        },
      ],
    },
  },
  {
    id: "decision-document",
    description: "Turn notes and evidence into a proposal for a specific audience.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Draft a decision document",
      purpose: "Turn the notes and evidence in the assignment into a clear proposal for its audience.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "Mark every claim that still needs verification. Keep the document in the workspace.",
      stages: [
        {
          id: "outline",
          title: "Outline",
          kind: "ai",
          role: "plan",
          instruction:
            "Name the audience, the purpose and the expected format. Gather the notes and evidence, and outline the problem, the options and their tradeoffs.",
          doneWhen: "The audience, purpose, format and an outline are reported.",
        },
        {
          id: "draft",
          title: "Draft",
          kind: "ai",
          instruction:
            "Write the document: the problem, the options, their tradeoffs, the proposed decision and concrete next actions. Save it in the workspace.",
          doneWhen: "The document is saved in the workspace and its path is reported as evidence.",
        },
        {
          id: "check",
          title: "Check",
          kind: "ai",
          instruction:
            "Read the document as its audience would. List missing evidence and claims that need verification, and fix what you can.",
          doneWhen: "Remaining gaps and unverified claims are listed, or the document is reported complete.",
        },
      ],
    },
  },
  {
    id: "investigate-problem",
    description: "Reproduce a problem and explain its cause before changing code.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Investigate a problem",
      purpose: "Reproduce the problem in the assignment, explain its cause and propose the smallest safe fix.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "Do not change files. Keep confirmed facts apart from hypotheses.",
      stages: [
        {
          id: "reproduce",
          title: "Reproduce",
          kind: "ai",
          instruction:
            "Reproduce the problem and record the exact steps and what you observed. Read the relevant code and earlier decisions.",
          doneWhen: "Reproduction steps and the observed behavior are reported, or why it does not reproduce.",
        },
        {
          id: "explain",
          title: "Explain",
          kind: "ai",
          instruction:
            "Explain the cause with the evidence for it, separating confirmed facts from hypotheses. Propose the smallest safe fix and how to validate it.",
          doneWhen: "The cause, its evidence and a fix proposal with a validation plan are reported.",
        },
      ],
    },
  },
  {
    id: "plan-build-verify",
    description: "Plan, build and verify an outcome, without a pull request.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Plan, build and verify",
      purpose: "Deliver the outcome in the assignment as a verified change, reported with its evidence and risks.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "Keep unrelated changes out. Keep decisions and remaining work in the Information panel.",
      stages: [
        {
          id: "plan",
          title: "Plan",
          kind: "ai",
          role: "plan",
          instruction:
            "Inspect the existing architecture and define checkable completion criteria for the outcome.",
          doneWhen: "Two to six checkable acceptance criteria and the approach are reported.",
        },
        build,
        verify,
        {
          id: "report",
          title: "Report",
          kind: "ai",
          instruction:
            "Summarize the results, the validation evidence and the unresolved risks. Keep decisions and remaining work in the workspace Information panel.",
          doneWhen: "Results, evidence and open risks are reported and saved in Information.",
        },
      ],
    },
  },
  {
    id: "coordinate-tasks",
    description: "Split work into delegated tasks, then reconcile and verify their results.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Coordinate independent tasks",
      purpose: "Deliver the outcome in the assignment through delegated tasks, reconciled and verified.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "A finished delegated run is not verified work until you checked its result.",
      stages: [
        {
          id: "assign",
          title: "Assign",
          kind: "ai",
          role: "plan",
          instruction:
            "Split the outcome into independent assignments. For each, name its completion check, the provider and permissions it needs, and whether it edits files and so needs its own worktree.",
          doneWhen: "Each assignment is listed with its completion check, provider and worktree choice.",
        },
        {
          id: "delegate",
          title: "Delegate",
          kind: "ai",
          instruction:
            "Start each assignment as a delegated task with `stave_delegate_task`, on its own worktree when it edits files. Follow them with `stave_list_delegated_tasks`.",
          doneWhen: "Every assignment runs as a delegated task, and each task is reported.",
        },
        {
          id: "reconcile",
          title: "Reconcile",
          kind: "ai",
          instruction:
            "Read each delegated task's result, reconcile conflicting findings and verify the integrated outcome.",
          doneWhen: "Each result is verified or its gap named, and the integrated outcome is verified.",
        },
      ],
    },
  },
  {
    id: "independent-review",
    description: "Review work against its goal, then fix and verify what should change.",
    template: {
      version: PLAYBOOK_VERSION,
      name: "Independent review",
      purpose: "Review the current work against its goal and completion checks, and fix what should change now.",
      checkIns: DEFAULT_CHECK_INS,
      team: "solo",
      constraints: "Report findings with evidence and severity. Distinguish tested from untested claims.",
      stages: [
        {
          id: "review",
          title: "Review",
          kind: "ai",
          role: "plan",
          instruction:
            "Review the work for correctness, failure and restart behavior, performance-sensitive paths and accessibility. Use an advisor for an independent view when one is configured.",
          doneWhen: "Actionable findings are reported with evidence and severity.",
        },
        {
          id: "fix-findings",
          title: "Fix",
          kind: "ai",
          instruction: "Fix the findings that should be fixed now and verify each fix. Leave the rest listed with the reason.",
          doneWhen: "Each finding is fixed and verified, or listed with the reason it stays.",
        },
      ],
    },
  },
];

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
  ...WORK_STARTERS,
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
