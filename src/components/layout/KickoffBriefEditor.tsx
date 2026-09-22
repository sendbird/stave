import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Textarea,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "./kickoff-dialog.styles";
import {
  buildKickoffFirstTaskPrompt,
  KICKOFF_BRIEF_FIELDS,
  normalizeKickoffBrief,
  type KickoffBrief,
} from "@/lib/kickoff-brief";
import type { KickoffProposalDraft } from "@/lib/workspace-kickoff";

export function KickoffBriefEditor({
  draft,
  extraInstructions,
  onChange,
}: {
  draft: KickoffProposalDraft;
  extraInstructions: string;
  onChange: (draft: KickoffProposalDraft) => void;
}) {
  return (
    <Accordion>
      <AccordionItem value="brief">
        <AccordionTrigger>Review task details</AccordionTrigger>
        <AccordionContent>
          <div className={sx(kickoffStyles.sourceStack)}>
            <p className={sx(kickoffStyles.hint)}>
              These details go into the first task. Leave unknown details empty
              or add an open question.
            </p>
            {Object.entries(KICKOFF_BRIEF_FIELDS).map(([key, label]) => (
              <label key={key} className={sx(kickoffStyles.labeledField)}>
                {label}
                <Textarea
                  value={(draft.brief?.[key as keyof KickoffBrief] ?? []).join(
                    "\n",
                  )}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      brief: {
                        ...normalizeKickoffBrief(draft.brief),
                        [key]: event.target.value.split("\n"),
                      },
                    })
                  }
                  placeholder="One item per line"
                  xstyle={kickoffStyles.instructionsTextarea}
                />
              </label>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="prompt-preview">
        <AccordionTrigger>Preview full first-task prompt</AccordionTrigger>
        <AccordionContent>
          <Textarea
            readOnly
            aria-label="Full first-task prompt"
            value={buildKickoffFirstTaskPrompt(draft, extraInstructions)}
            xstyle={kickoffStyles.promptTextarea}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
