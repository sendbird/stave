import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { MAX_DRAFT_DESCRIPTION_CHARS, type PlaybookDraftResult } from "@/lib/playbooks/draft-with-ai";
import type { Playbook } from "@/lib/playbooks/schema";
import { playbookStyles as styles } from "./playbooks.styles";

/**
 * Describe a way of working — or paste how you did it last time — and get an
 * editable draft. The draft replaces the editor's contents but is never saved
 * until the user saves it.
 */
export function DraftWithAi(props: {
  onDraft: (playbook: Playbook) => void;
  onClose: () => void;
  run: (description: string) => Promise<PlaybookDraftResult>;
  /** The editor holds changes the draft would replace. */
  replacesChanges?: boolean;
}) {
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const submit = async () => {
    setPending(true);
    setFailure(null);
    const result = await props.run(description);
    setPending(false);
    if (result.ok) props.onDraft(result.playbook);
    else setFailure(result.message);
  };
  return (
    <section className={sx(styles.draftPanel)} aria-label="Draft with AI">
      <div className={sx(styles.draftHeader)}>
        <Sparkles aria-hidden className={sx(styles.icon, styles.iconAccent)} />
        <h3 className={sx(styles.draftTitle)}>Draft with AI</h3>
        <span className={sx(styles.footerSpacer)} />
        <Button variant="quiet" size="iconSm" iconOnly aria-label="Close Draft with AI" onClick={props.onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <Textarea
        label="How do you work?"
        description="One sentence is enough, or paste a real example of the steps you took."
        placeholder="Take a Slack request to a reviewed PR: restate it, get my OK on the plan, build, run the checks, open a draft PR and fix failing checks."
        value={description}
        maxLength={MAX_DRAFT_DESCRIPTION_CHARS}
        autoResize
        maxRows={10}
        size="sm"
        autoFocus
        error={failure ?? undefined}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && description.trim()) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className={sx(styles.draftActions)}>
        {props.replacesChanges ? (
          <span className={sx(styles.footerNote)}>The draft replaces what is in the editor until you save.</span>
        ) : null}
        <Button size="sm" disabled={!description.trim() || pending} loading={pending} onClick={() => void submit()}>
          Draft stages
        </Button>
      </div>
    </section>
  );
}
