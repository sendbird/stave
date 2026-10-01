import { useEffect, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { MY_STANDARDS_MAX_CHARS } from "@/lib/agents/standards";
import { useAppStore } from "@/store/app.store";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";

/**
 * My standards: the user's own instructions, added after every agent's
 * instructions when on. Each run keeps the text it started with.
 */
export function MyStandardsPanel() {
  const saved = useAppStore((state) => state.settings.myStandards);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [text, setText] = useState(saved.text);
  useEffect(() => setText(saved.text), [saved.text]);
  const changed = text !== saved.text;
  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.editor)}>
        <div className={sx(styles.heading)}>
          <div className={sx(styles.headingText)}>
            <h2 className={sx(styles.emptyTitle)}>My standards</h2>
            <p className={sx(styles.hint)}>
              Your own rules for every agent you run: how you want code written, reviewed or reported. They follow the
              agent's instructions and never replace them.
            </p>
          </div>
          <div className={sx(styles.headingActions)}>
            <Switch
              aria-label="Use my standards"
              checked={saved.enabled}
              onCheckedChange={(enabled) => updateSettings({ patch: { myStandards: { ...saved, enabled } } })}
            />
          </div>
        </div>
        <Textarea
          size="sm"
          aria-label="My standards"
          placeholder="For example: Prefer small commits. Name the tests you ran. Never change public API names without saying so."
          value={text}
          maxLength={MY_STANDARDS_MAX_CHARS}
          autoResize
          onChange={(event) => setText(event.target.value)}
        />
        <div className={sx(styles.footer)}>
          <Button size="sm" disabled={!changed} onClick={() => updateSettings({ patch: { myStandards: { ...saved, text } } })}>
            Save
          </Button>
          <Button size="sm" variant="quiet" disabled={!changed} onClick={() => setText(saved.text)}>
            Discard
          </Button>
        </div>
        <ul className={sx(styles.hint)}>
          <li>{saved.enabled ? "On: added to agents you assign, delegate to or call as subagents." : "Off: agents run with their own instructions only."}</li>
          <li>Work already running keeps the standards it started with. What it received shows them as a source.</li>
          <li>Kept in your settings only. They are never written into an exported agent file.</li>
        </ul>
      </div>
    </div>
  );
}
