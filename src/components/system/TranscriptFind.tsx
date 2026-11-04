import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { Button, Input } from "@/components/ui";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

export function TranscriptFind(props: {
  query: string; onQuery: (value: string) => void;
  onStep: (backward: boolean) => void; onClose: () => void;
  result: string; label: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  return <div role="search" aria-label={props.label} className={sx(styles.row)}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); }
      if (event.key === "Enter") { event.preventDefault(); props.onStep(event.shiftKey); }
    }}>
    <Input ref={input} value={props.query} aria-label={props.label} placeholder={props.label}
      onChange={(event) => props.onQuery(event.target.value)} />
    <span role="status" className={sx(styles.result)}>{props.result}</span>
    <Button size="sm" variant="ghost" onClick={() => props.onStep(true)}>{t("transcriptFind.previous")}</Button>
    <Button size="sm" variant="ghost" onClick={() => props.onStep(false)}>{t("transcriptFind.next")}</Button>
    <Button size="sm" variant="ghost" onClick={props.onClose}>{t("transcriptFind.close")}</Button>
  </div>;
}
const styles = stylex.create({
  row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--ads-space-4"], padding: vars["--ads-space-8"], flexShrink: 0 },
  result: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], whiteSpace: "nowrap" },
});
