import { i18n, useTranslation } from "@/i18n";
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
  const { t: tI18n } = useTranslation(["kickoff"]);
  return (
    <Accordion>
      <AccordionItem value="brief">
        <AccordionTrigger>{tI18n("kickoff:kickoffBriefEditor.reviewTaskDetails")}</AccordionTrigger>
        <AccordionContent>
          <div className={sx(kickoffStyles.sourceStack)}>
            <p className={sx(kickoffStyles.hint)}>
              {tI18n("kickoff:kickoffBriefEditor.theseDetailsGoIntoTheFirstTask")}</p>
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
                  placeholder={tI18n("kickoff:kickoffBriefEditor.oneItemPerLine")}
                  xstyle={kickoffStyles.instructionsTextarea}
                />
              </label>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="prompt-preview">
        <AccordionTrigger>{tI18n("kickoff:kickoffBriefEditor.previewFullFirstTaskPrompt")}</AccordionTrigger>
        <AccordionContent>
          <Textarea
            readOnly
            aria-label={tI18n("kickoff:kickoffBriefEditor.fullFirstTaskPrompt")}
            value={buildKickoffFirstTaskPrompt(draft, extraInstructions)}
            xstyle={kickoffStyles.promptTextarea}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
