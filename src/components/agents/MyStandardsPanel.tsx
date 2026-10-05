import { i18n, useTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { MY_STANDARDS_MAX_CHARS } from "@/lib/agents/standards";
import { useAppStore } from "@/store/app.store";
import { workflowStyles as styles } from "../workflows/workflows.styles";

/**
 * My standards: the user's own instructions, added after every agent's
 * instructions when on. Each run keeps the text it started with.
 */
export function MyStandardsPanel() {
  useTranslation();
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
            <h2 className={sx(styles.emptyTitle)}>{i18n.t("agents:myStandardsPanel.myStandardsPanel")}</h2>
            <p className={sx(styles.hint)}>
              {i18n.t("agents:myStandardsPanel.myStandardsPanel2")}</p>
          </div>
          <div className={sx(styles.headingActions)}>
            <Switch
              aria-label={i18n.t("agents:myStandardsPanel.ariaLabel")}
              checked={saved.enabled}
              onCheckedChange={(enabled) => updateSettings({ patch: { myStandards: { ...saved, enabled } } })}
            />
          </div>
        </div>
        <Textarea
          size="sm"
          aria-label={i18n.t("agents:myStandardsPanel.ariaLabel2")}
          placeholder={i18n.t("agents:myStandardsPanel.placeholder")}
          value={text}
          maxLength={MY_STANDARDS_MAX_CHARS}
          autoResize
          onChange={(event) => setText(event.target.value)}
        />
        <div className={sx(styles.footer)}>
          <Button size="sm" disabled={!changed} onClick={() => updateSettings({ patch: { myStandards: { ...saved, text } } })}>
            {i18n.t("agents:myStandardsPanel.myStandardsPanel3")}</Button>
          <Button size="sm" variant="quiet" disabled={!changed} onClick={() => setText(saved.text)}>
            {i18n.t("agents:myStandardsPanel.myStandardsPanel4")}</Button>
        </div>
        <ul className={sx(styles.hint)}>
          <li>{saved.enabled ? i18n.t("agents:myStandardsPanel.myStandardsPanel5") : i18n.t("agents:myStandardsPanel.myStandardsPanel6")}</li>
          <li>{i18n.t("agents:myStandardsPanel.myStandardsPanel7")}</li>
          <li>{i18n.t("agents:myStandardsPanel.myStandardsPanel8")}</li>
        </ul>
      </div>
    </div>
  );
}
