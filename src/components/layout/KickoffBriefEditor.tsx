import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Textarea,
} from "@/components/ui";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "./kickoff-dialog.styles";
import {
  buildKickoffFirstTaskPrompt,
  normalizeKickoffBrief,
  type KickoffBrief,
} from "@/lib/kickoff-brief";
import type { KickoffProposalDraft } from "@/lib/workspace-kickoff";

const BRIEF_LABEL_KEYS = {
  decisions: "kickoff:kickoffBriefEditor.decisions",
  constraints: "kickoff:kickoffBriefEditor.constraints",
  acceptanceCriteria: "kickoff:kickoffBriefEditor.completionCriteria",
  openQuestions: "kickoff:kickoffBriefEditor.openQuestions",
} as const;

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
  const [expanded, setExpanded] = useState<unknown[]>([]);
  return (
    <Accordion id="kickoff-brief-editor" value={expanded} onValueChange={setExpanded} xstyle={kickoffStyles.briefSections}>
      <AccordionItem value="brief">
        <AccordionTrigger xstyle={kickoffStyles.briefToggle}>
          <span>{tI18n("kickoff:kickoffBriefEditor.reviewTaskDetails")}</span>
          <ChevronDown
            aria-hidden="true"
            className={sx(kickoffStyles.briefChevron, transition.transform, expanded.includes("brief") && kickoffStyles.briefChevronOpen)}
          />
        </AccordionTrigger>
        <AccordionContent xstyle={kickoffStyles.briefPanel}>
          <div className={sx(kickoffStyles.sourceStack)}>
            <p className={sx(kickoffStyles.hint)}>
              {tI18n("kickoff:kickoffBriefEditor.theseDetailsGoIntoTheFirstTask")}</p>
            {Object.entries(BRIEF_LABEL_KEYS).map(([key, label]) => (
              <label key={key} className={sx(kickoffStyles.labeledField)}>
                {tI18n(label)}
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
        <AccordionTrigger xstyle={kickoffStyles.briefToggle}>
          <span>{tI18n("kickoff:kickoffBriefEditor.previewFullFirstTaskPrompt")}</span>
          <ChevronDown
            aria-hidden="true"
            className={sx(kickoffStyles.briefChevron, transition.transform, expanded.includes("prompt-preview") && kickoffStyles.briefChevronOpen)}
          />
        </AccordionTrigger>
        <AccordionContent xstyle={kickoffStyles.briefPanel}>
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
