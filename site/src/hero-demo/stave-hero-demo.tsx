import * as React from "react";
import {
  ArrowUp,
  FileText,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  ListChecks,
  NotebookText,
  Paperclip,
  Pencil,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import { sx } from "@/components/ads/utils/stylex";

import { Bar, Window } from "../vendor/stageshow/kit/window";
import { Collapse } from "../vendor/stageshow/kit/motion/Collapse";
import { States } from "../vendor/stageshow/kit/motion/States";
import { Check } from "../vendor/stageshow/kit/parts/Check";
import { Spinner } from "../vendor/stageshow/kit/parts/Spinner";
import { Stage, type LookTokens } from "../vendor/stageshow/kit/stage";
import type { Act } from "../vendor/stageshow/kit/act";
import type { Layout } from "../vendor/stageshow/kit/looks";

import "./stave-hero-demo.css";
import { demoStyles as s } from "./stave-hero-demo.styles";

// One task, start to finish: the request is typed into a task that has its
// own worktree, the agent reads and edits, stops for the command approval the
// user kept, runs the tests once allowed, and opens a draft pull request that
// lands in the task's Information panel while its checks pass. Plays once when
// it comes into view; the payoff is the still (and the reduced-motion poster).
//
// Real strings: the task and its branch, the request, the three activity
// rows, the approval, the run status and the pull request. Everything else is
// placeholder lines in the app's own colors.

const TASK_TITLE = "Fix flaky upload retry";
const BRANCH = "fix/upload-retry";
const REQUEST = "Fix the flaky upload retry test and open a draft PR";
const COMMAND = "bun test upload";
const PR_TITLE = "fix(upload): retry after the socket closes";

type Step = "read" | "edit" | "bash";
type Run = "idle" | "working" | "done";

type S = {
  focused: boolean;
  draft: string;
  sent: boolean;
  steps: Step[];
  approval: boolean;
  allowPressed: boolean;
  testsPassed: boolean;
  run: Run;
  pr: boolean;
  checksPassed: boolean;
};

const initial: S = {
  focused: false,
  draft: "",
  sent: false,
  steps: [],
  approval: false,
  allowPressed: false,
  testsPassed: false,
  run: "idle",
  pr: false,
  checksPassed: false,
};

const poster: S = {
  ...initial,
  sent: true,
  steps: ["read", "edit", "bash"],
  testsPassed: true,
  run: "done",
  pr: true,
  checksPassed: true,
};

// Design sizes. The window runs off the stage's bottom edge on purpose;
// `composerInset` keeps the composer a full gutter above that edge.
const WIDE = { width: 1024, height: 540 };
const COMPACT = { below: 720, width: 358, height: 342 };
const SCENE = {
  wide: {
    window: { left: 40, top: 40, width: 944, height: 540 },
    composerInset: 80,
  },
  // The phone column crops harder: what shows of the window stays square.
  compact: {
    window: { left: 16, top: 16, width: 326, height: 362 },
    composerInset: 52,
  },
} as const;
// Between beats the pointer rests on the empty end of the window's title bar.
const REST = { wide: { x: 760, y: 60 }, compact: { x: 280, y: 36 } };

/** The scene's script; it starts once `ready` resolves (see useStartGate). */
const makeScript = (ready: () => Promise<void>) => async (a: Act<S>) => {
  await ready();
  await a.wait(700);

  a.mark("type");
  await a.click({ at: "composer", x: 0.4, y: 0.3 });
  await a.set({ focused: true });
  await a.wait(250);
  await a.type("draft", REQUEST, { interval: 32 });
  await a.wait(350);

  a.mark("send");
  await a.click({ at: "send", x: 0.5, y: 0.5 });
  await a.set({ sent: true, draft: "", focused: false, run: "working" });
  await a.move("rest");
  await a.wait(650);

  a.mark("work");
  await a.set({ steps: ["read"] });
  await a.wait(650);
  await a.set({ steps: ["read", "edit"] });
  await a.wait(700);

  a.mark("approve");
  await a.set({ approval: true });
  await a.wait(500);
  await a.move({ at: "allow", x: 0.9, y: 0.72 });
  await a.wait(250);
  await a.click();
  await a.set({ allowPressed: true });
  await a.wait(120);
  // Close the card first, then grow the run row, so the thread moves once
  await a.set({ approval: false, allowPressed: false });
  await a.move("rest");
  await a.set({ steps: ["read", "edit", "bash"] });
  await a.wait(1300);
  await a.set({ testsPassed: true });
  await a.wait(350);

  a.mark("result");
  await a.set({ run: "done", pr: true });
  await a.wait(1300);
  await a.set({ checksPassed: true });
  await a.wait(3000);
};

/** The site toggles `.dark` on the root; the demo follows it. */
function useSiteDark() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// The desktop app's own light and dark colors, mapped onto the stage's
// tokens so the illustration reads as Stave rather than a generic window.
const LIGHT_TOKENS = {
  "--ss-surface": "oklch(0.985 0.003 75)",
  "--ss-chrome": "oklch(0.985 0.003 75)",
  "--ss-canvas": "oklch(0.955 0.003 75)",
  "--ss-raised": "oklch(0.998 0.003 75)",
  "--ss-line": "oklch(0.86 0.003 75 / 0.7)",
  "--ss-text-strong": "oklch(0.225 0.003 75)",
  "--ss-text": "oklch(0.47 0.003 75)",
  "--ss-text-faint": "oklch(0.6 0.003 75)",
  "--ss-icon": "oklch(0.51 0.003 75)",
  "--ss-icon-faint": "oklch(0.75 0.003 75)",
  "--ss-accent": "oklch(0.54 0.18 260)",
  "--ss-accent-2": "oklch(0.54 0.18 260)",
  "--ss-success": "oklch(0.51 0.12 155)",
  "--stave-demo-on-accent": "oklch(0.99 0.003 75)",
} as const;

const DARK_TOKENS = {
  "--ss-surface": "oklch(0.17 0.003 75)",
  "--ss-chrome": "oklch(0.17 0.003 75)",
  "--ss-canvas": "oklch(0.145 0.003 75)",
  "--ss-raised": "oklch(0.205 0.003 75)",
  "--ss-line": "oklch(0.32 0.003 75 / 0.9)",
  "--ss-text-strong": "oklch(0.92 0.003 75)",
  "--ss-text": "oklch(0.72 0.003 75)",
  "--ss-text-faint": "oklch(0.58 0.003 75)",
  "--ss-icon": "oklch(0.68 0.003 75)",
  "--ss-icon-faint": "oklch(0.42 0.003 75)",
  "--ss-accent": "oklch(0.71 0.15 252)",
  "--ss-accent-2": "oklch(0.71 0.15 252)",
  "--ss-success": "oklch(0.74 0.12 155)",
  "--stave-demo-on-accent": "oklch(0.16 0.03 255)",
} as const;

const SHARED_TOKENS = {
  "--ss-font":
    '"Geist Variable", "Pretendard Variable", ui-sans-serif, system-ui, -apple-system, sans-serif',
  "--ss-radius-window": "14px",
} as const;

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/**
 * The demo sits just under the fold on common laptop screens, and a stage
 * starts its script as soon as one pixel shows. The script first waits on
 * this gate, which opens once most of the demo is visible, so people see the
 * story from its opening frame. Reduced motion shows the poster and never
 * runs the script.
 */
function useStartGate(ref: React.RefObject<HTMLDivElement | null>) {
  const open = React.useRef(false);
  const waiting = React.useRef<Array<() => void>>([]);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.intersectionRatio < 0.6) return;
        open.current = true;
        waiting.current.splice(0).forEach((resolve) => resolve());
        observer.disconnect();
      },
      { threshold: [0.6] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return React.useCallback(
    () =>
      open.current
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiting.current.push(resolve)),
    [],
  );
}

export function StaveHeroDemo() {
  const dark = useSiteDark();
  const frame = React.useRef<HTMLDivElement>(null);
  const ready = useStartGate(frame);
  const script = React.useMemo(() => makeScript(ready), [ready]);
  const tokens = {
    ...SHARED_TOKENS,
    ...(dark ? DARK_TOKENS : LIGHT_TOKENS),
  } as LookTokens;

  return (
    <div
      ref={frame}
      className={sx(s.frame)}
      role="img"
      aria-label={`Animated preview of a Stave task: the request "${REQUEST}" runs in its own worktree, waits for approval before running tests, and opens a draft pull request whose checks pass.`}
    >
      <Stage
        width={WIDE.width}
        height={WIDE.height}
        compact={COMPACT}
        initial={initial}
        poster={poster}
        script={script}
        play="once"
        theme={dark ? "dark" : "light"}
        fidelity="standard"
        tokens={tokens}
        cursor={{ at: REST }}
        className="stave-hero-demo"
      >
        {(state, _rect, layout) => <Scene state={state} layout={layout} />}
      </Stage>
    </div>
  );
}

function Scene({ state, layout }: { state: S; layout: Layout }) {
  const compact = layout === "compact";
  const scene = SCENE[layout];

  return (
    <>
      <Window
        title={TASK_TITLE}
        lead={compact ? undefined : <BranchChip />}
        toolbar={compact ? <BranchIcon /> : undefined}
        sidebar={compact ? undefined : <Sidebar run={state.run} />}
        sidebarWidth={200}
        style={{
          position: "absolute",
          ...scene.window,
          boxShadow: "var(--ss-shadow-hero)",
        }}
      >
        <div className={sx(s.content)}>
          <TaskColumn
            state={state}
            compact={compact}
            composerInset={scene.composerInset}
          />
          {!compact && (
            <InfoPanel pr={state.pr} checksPassed={state.checksPassed} />
          )}
        </div>
      </Window>

      <span
        data-target="rest"
        style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }}
      />
    </>
  );
}

function BranchChip() {
  return (
    <span className={sx(s.branchChip)}>
      <GitBranch {...ICON} size={12} />
      {BRANCH}
    </span>
  );
}

function BranchIcon() {
  return (
    <span className={sx(s.barIcon)}>
      <GitBranch {...ICON} />
    </span>
  );
}

function Sidebar({ run }: { run: Run }) {
  return (
    <div className={sx(s.sidebar)}>
      <div className={sx(s.sidebarGroup)}>
        <FolderGit2 {...ICON} />
        <Bar w={58} h={7} tone={4} />
      </div>
      <div className={sx(s.taskRow, s.taskRowSelected)}>
        <TaskStatus run={run} />
        <div className={sx(s.taskText)}>
          <span className={sx(s.taskTitle)}>{TASK_TITLE}</span>
          <span className={sx(s.taskBranch)}>{BRANCH}</span>
        </div>
      </div>
      {[
        [112, 82],
        [92, 70],
      ].map(([title, branch], i) => (
        <PlaceholderTask key={i} title={title ?? 0} branch={branch ?? 0} />
      ))}
      <div className={sx(s.sidebarGroup, s.sidebarGroupGap)}>
        <FolderGit2 {...ICON} />
        <Bar w={44} h={7} tone={4} />
      </div>
      {[
        [104, 76],
        [124, 88],
        [88, 64],
      ].map(([title, branch], i) => (
        <PlaceholderTask key={i} title={title ?? 0} branch={branch ?? 0} />
      ))}
      <div className={sx(s.sidebarGroup, s.sidebarGroupGap)}>
        <FolderGit2 {...ICON} />
        <Bar w={66} h={7} tone={4} />
      </div>
      <PlaceholderTask title={116} branch={78} />
    </div>
  );
}

function PlaceholderTask({ title, branch }: { title: number; branch: number }) {
  return (
    <div className={sx(s.taskRow)}>
      <span className={sx(s.taskStatus)}>
        <GitBranch {...ICON} color="var(--ss-icon-faint)" />
      </span>
      <div className={sx(s.taskText)}>
        <span className={sx(s.barLine, s.barLineTitle)}>
          <Bar w={title} h={7} tone={3} />
        </span>
        <span className={sx(s.barLine, s.barLineBranch)}>
          <Bar w={branch} h={5} tone={2} />
        </span>
      </div>
    </div>
  );
}

/** Idle branch, a running spinner, then a check: one slot, crossfaded. */
function TaskStatus({ run }: { run: Run }) {
  return (
    <span className={sx(s.taskStatus)}>
      <span className={sx(s.taskStatusLayer, run !== "idle" && s.hidden)}>
        <GitBranch {...ICON} />
      </span>
      <span className={sx(s.taskStatusLayer, run !== "working" && s.hidden)}>
        <Spinner size={14} />
      </span>
      <span className={sx(s.taskStatusLayer, run !== "done" && s.hidden)}>
        <Check on={run === "done"} size={14} />
      </span>
    </span>
  );
}

function TaskColumn({
  state,
  compact,
  composerInset,
}: {
  state: S;
  compact: boolean;
  composerInset: number;
}) {
  return (
    <div className={sx(s.column, compact && s.columnCompact)}>
      <div className={sx(s.thread, compact && s.threadCompact)}>
        <History compact={compact} />

        <Collapse open={state.sent} reveal="drop" from="below">
          <div className={sx(s.request)}>
            <span className={sx(s.requestBubble)}>{REQUEST}</span>
          </div>
        </Collapse>

        <Collapse open={state.steps.includes("read")} from="below">
          <Activity icon={<FileText {...ICON} />} verb="Read" subject="upload-queue.ts" />
        </Collapse>
        <Collapse open={state.steps.includes("edit")} from="below">
          <Activity icon={<Pencil {...ICON} />} verb="Edit" subject="upload-queue.ts" />
        </Collapse>
        <Collapse open={state.steps.includes("bash")} from="below">
          <Activity
            icon={<TerminalSquare {...ICON} />}
            verb="Bash"
            subject={COMMAND}
            result={
              <States
                value={state.testsPassed ? "passed" : "running"}
                align="end"
                states={{
                  running: (
                    <span className={sx(s.activityResult, s.rowResult)}>
                      <Spinner size={14} />
                      Running
                    </span>
                  ),
                  passed: (
                    <span className={sx(s.activityResult, s.rowResult)}>
                      <Check on size={14} />
                      14 passed
                    </span>
                  ),
                }}
              />
            }
          />
        </Collapse>

        {compact && (
          <Collapse open={state.pr} reveal="drop" from="below">
            <div className={sx(s.inlinePr)}>
              <PullRequest checksPassed={state.checksPassed} />
            </div>
          </Collapse>
        )}
      </div>

      <Collapse open={state.approval} reveal="drop" from="below">
        <Approval pressed={state.allowPressed} />
      </Collapse>

      {/* In the phone column the pull request card is the finished signal,
          so the run status closes when the run is done. */}
      <Collapse open={compact ? state.run === "working" : state.run !== "idle"}>
        <div className={sx(s.status)}>
          <States
            value={state.run === "done" ? "done" : "working"}
            align="start"
            states={{
              working: (
                <span className={sx(s.activityResult, s.statusResult)}>
                  <Spinner size={14} />
                  Working on your request
                </span>
              ),
              done: (
                <span className={sx(s.activityResult, s.statusResult)}>
                  <Check on size={14} />
                  Done
                </span>
              ),
            }}
          />
        </div>
      </Collapse>

      <Composer
        draft={state.draft}
        focused={state.focused}
        compact={compact}
        inset={composerInset}
      />
    </div>
  );
}

/** An earlier turn in the task, as placeholder lines, so the thread is full
 * from the first frame and the new exchange is what the eye lands on. */
function History({ compact }: { compact: boolean }) {
  return (
    <div className={sx(s.history)}>
      <div className={sx(s.pastLines)}>
        <Bar w="76%" h={7} tone={2} />
        <Bar w="88%" h={7} tone={2} />
        <Bar w="40%" h={7} tone={2} />
      </div>
      <div className={sx(s.historyBubble)}>
        <Bar w={compact ? 120 : 160} h={30} r={14} tone={2} />
      </div>
      <div className={sx(s.pastLines)}>
        <Bar w="82%" h={7} tone={2} />
        <Bar w="58%" h={7} tone={2} />
      </div>
      <div className={sx(s.historyBubble)}>
        <Bar w={compact ? 150 : 200} h={30} r={14} tone={2} />
      </div>
      <div className={sx(s.pastLines)}>
        <Bar w="90%" h={7} tone={2} />
        <Bar w="74%" h={7} tone={2} />
      </div>
      {[64, 92].map((w, i) => (
        <div key={i} className={sx(s.activity)}>
          <span className={sx(s.activityIcon)}>
            <FileText {...ICON} color="var(--ss-icon-faint)" />
          </span>
          <Bar w={30} h={7} tone={3} />
          <Bar w={w} h={7} tone={2} />
          <span />
        </div>
      ))}
      <div className={sx(s.pastLines)}>
        <Bar w="84%" h={7} tone={2} />
        <Bar w="62%" h={7} tone={2} />
      </div>
    </div>
  );
}

function Activity({
  icon,
  verb,
  subject,
  result,
}: {
  icon: React.ReactNode;
  verb: string;
  subject: string;
  result?: React.ReactNode;
}) {
  return (
    <div className={sx(s.activity)}>
      <span className={sx(s.activityIcon)}>{icon}</span>
      <span className={sx(s.activityVerb)}>{verb}</span>
      <span className={sx(s.fileChip)}>{subject}</span>
      <span>{result}</span>
    </div>
  );
}

function Approval({ pressed }: { pressed: boolean }) {
  return (
    <div className={sx(s.approval)}>
      <div className={sx(s.approvalHead)}>
        <TerminalSquare {...ICON} />
        Allow this command?
      </div>
      <div className={sx(s.approvalCommand)}>{COMMAND}</div>
      <div className={sx(s.approvalActions)}>
        <span className={sx(s.action, s.actionQuiet)}>Deny</span>
        <span
          className={sx(s.action, s.actionPrimary, pressed && s.actionPressed)}
          data-target="allow"
        >
          Allow once
        </span>
      </div>
    </div>
  );
}

function Composer({
  draft,
  focused,
  compact,
  inset,
}: {
  draft: string;
  focused: boolean;
  compact: boolean;
  inset: number;
}) {
  return (
    <div
      className={sx(s.composer, focused && s.composerFocused)}
      style={{ marginBottom: inset }}
      data-target="composer"
      data-cursor="ibeam"
    >
      <div className={sx(s.draft, compact && s.draftCompact)}>
        <span className={sx(s.placeholder, draft.length > 0 && s.hidden)}>
          Describe the task
        </span>
        {draft}
        {focused && <span className={sx(s.caret)} />}
      </div>
      <div className={sx(s.composerFooter)} data-cursor="pointer">
        <span className={sx(s.modelChip)}>Claude · High</span>
        {!compact && (
          <span className={sx(s.safetyChip)}>
            <ShieldCheck {...ICON} />
            Ask before commands
          </span>
        )}
        <span className={sx(s.footerSpacer)} />
        <Paperclip {...ICON} />
        <span
          className={sx(s.send, draft.length > 0 && s.sendReady)}
          data-target="send"
        >
          <ArrowUp {...ICON} />
        </span>
      </div>
    </div>
  );
}

/** The task's Information panel; the pull request the task opens lands at
 * the top of its list. */
function InfoPanel({ pr, checksPassed }: { pr: boolean; checksPassed: boolean }) {
  return (
    <div className={sx(s.panel)}>
      <PanelSection icon={<NotebookText {...ICON} />} label={64}>
        <div className={sx(s.pastLines)}>
          <Bar w="92%" h={7} tone={2} />
          <Bar w="86%" h={7} tone={2} />
          <Bar w="48%" h={7} tone={2} />
        </div>
      </PanelSection>
      <PanelSection icon={<ListChecks {...ICON} />} label={48}>
        {[132, 104].map((w) => (
          <div key={w} className={sx(s.panelRow)}>
            <Check on={false} size={14} />
            <Bar w={w} h={7} tone={2} />
          </div>
        ))}
      </PanelSection>
      <div className={sx(s.panelSection)}>
        <div className={sx(s.panelHeading, s.panelHeadingReal)}>
          <GitPullRequest {...ICON} />
          Pull requests
        </div>
        <div className={sx(s.prList)}>
          <Collapse open={pr} reveal="drop">
            <PullRequestRow checksPassed={checksPassed} />
          </Collapse>
          {[
            [150, 96],
            [118, 104],
            [136, 82],
          ].map(([title, meta]) => (
            <div key={title} className={sx(s.prRow)}>
              <span className={sx(s.prIcon, s.prIconFaint)}>
                <GitPullRequest {...ICON} />
              </span>
              <div>
                <span className={sx(s.barLine, s.prBarTitle)}>
                  <Bar w={title ?? 0} h={7} tone={3} />
                </span>
                <span className={sx(s.barLine, s.prBarMeta)}>
                  <Bar w={meta ?? 0} h={5} tone={2} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: number;
  children: React.ReactNode;
}) {
  return (
    <div className={sx(s.panelSection)}>
      <div className={sx(s.panelHeading)}>
        {icon}
        <Bar w={label} h={7} tone={4} />
      </div>
      {children}
    </div>
  );
}

function PullRequestRow({ checksPassed }: { checksPassed: boolean }) {
  return (
    <div className={sx(s.prRow, s.prRowNew)}>
      <span className={sx(s.prIcon)}>
        <GitPullRequest {...ICON} />
      </span>
      <div>
        <div className={sx(s.prTitle)}>{PR_TITLE}</div>
        <div className={sx(s.prMeta)}>#128 · Draft · {BRANCH}</div>
        <div className={sx(s.prRowChecks)}>
          <Check on={checksPassed} pending={!checksPassed} size={14} />
          <States
            value={checksPassed ? "passed" : "running"}
            align="start"
            states={{ running: "Checks running", passed: "All checks passed" }}
          />
        </div>
      </div>
    </div>
  );
}

function PullRequest({ checksPassed }: { checksPassed: boolean }) {
  return (
    <div className={sx(s.pr)}>
      <div className={sx(s.prHead)}>
        <span className={sx(s.prIcon)}>
          <GitPullRequest {...ICON} />
        </span>
        <div>
          <div className={sx(s.prTitle)}>{PR_TITLE}</div>
          <div className={sx(s.prMeta)}>#128 · Draft</div>
        </div>
      </div>
      <div className={sx(s.prChecks)}>
        <span className={sx(s.prIcon)}>
          <Check on={checksPassed} pending={!checksPassed} size={14} />
        </span>
        <States
          value={checksPassed ? "passed" : "running"}
          align="start"
          states={{ running: "Checks running", passed: "All checks passed" }}
        />
      </div>
    </div>
  );
}
