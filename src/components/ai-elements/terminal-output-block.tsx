import { Fragment, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import {
  ansiPlainText,
  parseAnsi,
  type AnsiColor,
  type AnsiColorName,
  type AnsiLine,
  type AnsiStyle,
} from "@/lib/markdown/ansi";
import { useAppStore } from "@/store/app.store";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  useCodeScrollRegion,
} from "./code-block";
import { chatType } from "./chat-type.stylex";
import { scaleMessageCodeFontSize, useMessageTextScale } from "./message-text-scale";

/**
 * The 16 terminal colors in the conversation's own palette, so output reads
 * in every theme: red, green, yellow and blue are the status text colors,
 * magenta and cyan mix their neighbours, black and white are the muted and
 * full text inks. Bright colors share their base hue; bold still sets them
 * apart.
 */
const MAGENTA = `color-mix(in oklch, ${vars["--aui-color-danger-text"]} 50%, ${vars["--aui-color-info-text"]})`;
const CYAN = `color-mix(in oklch, ${vars["--aui-color-info-text"]} 50%, ${vars["--aui-color-success-text"]})`;

const palette: Record<AnsiColorName, string> = {
  black: vars["--aui-color-text-subtle"],
  red: vars["--aui-color-danger-text"],
  green: vars["--aui-color-success-text"],
  yellow: vars["--aui-color-warning-text"],
  blue: vars["--aui-color-info-text"],
  magenta: MAGENTA,
  cyan: CYAN,
  white: vars["--aui-color-text-muted"],
  brightBlack: vars["--aui-color-text-muted"],
  brightRed: vars["--aui-color-danger-text"],
  brightGreen: vars["--aui-color-success-text"],
  brightYellow: vars["--aui-color-warning-text"],
  brightBlue: vars["--aui-color-info-text"],
  brightMagenta: MAGENTA,
  brightCyan: CYAN,
  brightWhite: vars["--aui-color-text"],
};

function colorValue(color: AnsiColor): string {
  return color.kind === "palette" ? palette[color.name] : color.hex;
}

/** A background is a wash of its color, so the text on it stays readable. */
function backgroundValue(color: AnsiColor): string {
  return `color-mix(in oklch, ${colorValue(color)} 22%, transparent)`;
}

function spanStyle(style: AnsiStyle): CSSProperties | undefined {
  let foreground = style.foreground ? colorValue(style.foreground) : undefined;
  let background = style.background ? backgroundValue(style.background) : undefined;
  if (style.inverse) {
    const text = foreground ?? vars["--aui-color-text"];
    background = `color-mix(in oklch, ${text} 85%, transparent)`;
    foreground = vars["--aui-color-surface"];
  }
  if (!foreground && !background) return undefined;
  return { color: foreground, backgroundColor: background };
}

function TerminalLines({ lines }: { lines: readonly AnsiLine[] }) {
  return (
    <>
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {line.map((span, spanIndex) => (
            <span
              key={spanIndex}
              className={sx(
                span.style.bold && styles.bold,
                span.style.dim && styles.dim,
                span.style.italic && styles.italic,
                span.style.underline && styles.underline,
                span.style.strikethrough && styles.strikethrough,
                span.style.underline && span.style.strikethrough && styles.underlineStrikethrough,
              )}
              style={spanStyle(span.style)}
            >
              {span.text}
            </span>
          ))}
          {lineIndex < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </>
  );
}

function TerminalBody({ lines }: { lines: readonly AnsiLine[] }) {
  useTranslation();
  const textScale = useMessageTextScale();
  const settingsCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);
  const fontSize = scaleMessageCodeFontSize(textScale, settingsCodeFontSize);
  const scrollHost = useRef<HTMLPreElement>(null);
  useCodeScrollRegion(scrollHost, String(lines.length), i18n.t("composer:message.codeScrollRegion"));
  return (
    <pre ref={scrollHost} className={sx(styles.pre)} style={{ fontSize: `${fontSize}px` }}>
      <code>
        <TerminalLines lines={lines} />
      </code>
    </pre>
  );
}

/**
 * Terminal output in a reply with its colors drawn instead of escape codes.
 * Copy copies the text without escapes.
 */
export function TerminalOutputBlock(props: { text: string; title: ReactNode }) {
  useTranslation();
  const lines = useMemo(() => parseAnsi(props.text.replace(/\n$/, "")), [props.text]);
  const plain = useMemo(() => ansiPlainText(lines), [lines]);
  return (
    <CodeBlock code={plain} body={<TerminalBody lines={lines} />} data-terminal-output="">
      <CodeBlockHeader>
        {props.title}
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

const styles = stylex.create({
  pre: {
    margin: 0,
    overflowX: "auto",
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    lineHeight: chatType["--chat-type-secondary-leading"],
    tabSize: 8,
    // The plain-code surface: the palette above is the app's, not the editor's.
    backgroundColor: "var(--background)",
    color: vars["--aui-color-text"],
  },
  bold: { fontWeight: vars["--aui-font-weight-semibold"] },
  dim: { opacity: 0.7 },
  italic: { fontStyle: "italic" },
  underline: { textDecorationLine: "underline" },
  strikethrough: { textDecorationLine: "line-through" },
  underlineStrikethrough: { textDecorationLine: "underline line-through" },
});
