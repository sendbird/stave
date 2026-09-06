import { AlertCircle, Plus, X } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { getHookBlocking, isHookLinked } from "./scripts-manager-state";
import {
  SCRIPT_TRIGGER_METADATA,
  SCRIPT_TRIGGER_IDS,
} from "@/lib/workspace-scripts/constants";
import type {
  ScriptEditorCandidate,
  ScriptEditorHookLink,
  ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import type { ScriptTrigger } from "@/lib/workspace-scripts/types";
import { hooksTabStyles } from "./script-hooks-tab.styles";

function HookTriggerCard(props: {
  trigger: ScriptTrigger;
  candidates: ScriptEditorCandidate[];
  links: ScriptEditorHookLink[] | undefined;
  onToggleLink: (
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    enabled: boolean,
  ) => void;
  onToggleBlocking: (
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    blocking: boolean,
  ) => void;
}) {
  const meta = SCRIPT_TRIGGER_METADATA[props.trigger];
  const linkedCandidates = props.candidates.filter((candidate) =>
    isHookLinked(props.links, candidate),
  );
  const unlinkedCandidates = props.candidates.filter(
    (candidate) => !isHookLinked(props.links, candidate),
  );

  return (
    <div className={sx(hooksTabStyles.card)}>
      <div className={sx(hooksTabStyles.cardHeader)}>
        <div className={sx(hooksTabStyles.cardHeaderText)}>
          <p className={sx(hooksTabStyles.cardTitle)}>{meta.label}</p>
          <p className={sx(hooksTabStyles.cardDescription)}>
            {meta.description}
          </p>
        </div>
        <Badge variant="outline" className={sx(hooksTabStyles.countBadge)}>
          {linkedCandidates.length}
        </Badge>
      </div>

      {linkedCandidates.length === 0 ? (
        <p className={sx(hooksTabStyles.emptyLinks)}>
          No commands or processes assigned yet.
        </p>
      ) : (
        <div className={sx(hooksTabStyles.linkList)}>
          {linkedCandidates.map((candidate) => {
            const blocking = getHookBlocking(props.links, candidate);
            return (
              <div
                key={`${candidate.scriptKind}:${candidate.scriptId}`}
                className={sx(hooksTabStyles.linkRow)}
              >
                <div className={sx(hooksTabStyles.linkBody)}>
                  <div className={sx(hooksTabStyles.linkTitleRow)}>
                    <span className={sx(hooksTabStyles.candidateLabel)}>
                      {candidate.label}
                    </span>
                    <Badge
                      variant="outline"
                      className={sx(hooksTabStyles.kindBadge)}
                    >
                      {candidate.scriptKind}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={sx(hooksTabStyles.idBadge)}
                    >
                      {candidate.scriptId}
                    </Badge>
                  </div>
                </div>
                <div className={sx(hooksTabStyles.blockingGroup)}>
                  <Switch
                    checked={blocking}
                    onCheckedChange={(checked) =>
                      props.onToggleBlocking(props.trigger, candidate, checked)
                    }
                  />
                  <span className={sx(hooksTabStyles.blockingLabel)}>
                    Blocking
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  xstyle={hooksTabStyles.removeButton}
                  onClick={() =>
                    props.onToggleLink(props.trigger, candidate, false)
                  }
                  aria-label="Remove assignment"
                >
                  <X className={sx(hooksTabStyles.icon)} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              xstyle={hooksTabStyles.assignTrigger}
              disabled={unlinkedCandidates.length === 0}
            />
          }
        >
          <Plus className={sx(hooksTabStyles.icon)} />
          {props.candidates.length === 0
            ? "Nothing to assign"
            : "Assign command or process"}
        </PopoverTrigger>
        <PopoverContent align="end" xstyle={hooksTabStyles.popoverContent}>
          {unlinkedCandidates.length === 0 ? (
            <p className={sx(hooksTabStyles.popoverEmpty)}>
              All candidates already assigned.
            </p>
          ) : (
            <div className={sx(hooksTabStyles.popoverList)}>
              <p className={sx(hooksTabStyles.popoverHeading)}>
                Available commands and processes
              </p>
              {unlinkedCandidates.map((candidate) => (
                <AdsButton
                  key={`${candidate.scriptKind}:${candidate.scriptId}`}
                  type="button"
                  layout="host"
                  xstyle={hooksTabStyles.candidateButton}
                  onClick={() =>
                    props.onToggleLink(props.trigger, candidate, true)
                  }
                >
                  <div className={sx(hooksTabStyles.linkBody)}>
                    <div className={sx(hooksTabStyles.linkTitleRow)}>
                      <span className={sx(hooksTabStyles.candidateLabel)}>
                        {candidate.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={sx(hooksTabStyles.kindBadge)}
                      >
                        {candidate.scriptKind}
                      </Badge>
                    </div>
                    {candidate.description ? (
                      <p className={sx(hooksTabStyles.candidateDescription)}>
                        {candidate.description}
                      </p>
                    ) : null}
                  </div>
                  <Plus className={sx(hooksTabStyles.candidateAddIcon)} />
                </AdsButton>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ScriptHooksTab(props: {
  hooks: ScriptEditorState["hooks"];
  candidates: ScriptEditorCandidate[];
  unresolvedHookRefs: Array<{
    trigger: ScriptTrigger;
    link: ScriptEditorHookLink;
  }>;
  onToggleLink: (
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    enabled: boolean,
  ) => void;
  onToggleBlocking: (
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    blocking: boolean,
  ) => void;
}) {
  return (
    <div className={sx(hooksTabStyles.root)}>
      <div className={sx(hooksTabStyles.intro)}>
        <p className={sx(hooksTabStyles.introTitle)}>Lifecycle triggers</p>
        <p className={sx(hooksTabStyles.introDescription)}>
          Start one-shot commands or long-running processes from task, turn, and
          PR events.
        </p>
      </div>

      {props.candidates.length === 0 ? (
        <Empty xstyle={hooksTabStyles.emptyState}>
          <EmptyHeader>
            <EmptyMedia>
              <AlertCircle className={sx(hooksTabStyles.emptyIcon)} />
            </EmptyMedia>
            <EmptyTitle>No commands or processes yet</EmptyTitle>
            <EmptyDescription>
              Create a command or process first, then return here to attach it
              to a trigger.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={sx(hooksTabStyles.grid)}>
          {SCRIPT_TRIGGER_IDS.map((trigger) => (
            <HookTriggerCard
              key={trigger}
              trigger={trigger}
              candidates={props.candidates}
              links={props.hooks[trigger]}
              onToggleLink={props.onToggleLink}
              onToggleBlocking={props.onToggleBlocking}
            />
          ))}
        </div>
      )}

      {props.unresolvedHookRefs.length > 0 ? (
        <div className={sx(hooksTabStyles.unresolved)}>
          <div className={sx(hooksTabStyles.unresolvedHeader)}>
            <AlertCircle className={sx(hooksTabStyles.emptyIcon)} />
            Preserved unresolved hook refs
          </div>
          <div className={sx(hooksTabStyles.unresolvedList)}>
            {props.unresolvedHookRefs.map(({ trigger, link }, index) => (
              <Badge
                key={`${trigger}:${link.scriptKind ?? "unknown"}:${link.scriptId}:${index}`}
                variant="secondary"
                className={sx(hooksTabStyles.unresolvedBadge)}
              >
                {SCRIPT_TRIGGER_METADATA[trigger].label} →{" "}
                {link.scriptKind ?? "unknown"}:{link.scriptId}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
