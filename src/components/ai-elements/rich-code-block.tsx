import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { richFenceFor } from "@/lib/markdown/rich-fence";
import { JsonTreeBlock } from "./json-tree-block";
import { TerminalOutputBlock } from "./terminal-output-block";

/**
 * A finished fenced block drawn as what it holds: JSON as a tree, terminal
 * output with its colors. Anything else is the ordinary code block
 * (`fallback`). The fence is read once per code change, not per render.
 */
export function RichCodeBlock(props: {
  code: string;
  language?: string;
  title: ReactNode;
  fallback: ReactNode;
}) {
  useTranslation();
  const { code, language } = props;
  const fence = useMemo(() => richFenceFor(language, code), [code, language]);
  if (fence?.kind === "json") {
    return <JsonTreeBlock code={code} document={fence.document} title={props.title} />;
  }
  if (fence?.kind === "terminal") {
    return <TerminalOutputBlock text={fence.text} title={props.title} />;
  }
  return <>{props.fallback}</>;
}
