import { useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import {
  JSON_TREE_CHILD_PAGE,
  initialJsonOpenDepth,
  type JsonTreeDocument,
  type JsonTreeNode,
} from "@/lib/markdown/json-tree";
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

type JsonContainer = Extract<JsonTreeNode, { kind: "object" | "array" }>;

function isContainer(node: JsonTreeNode): node is JsonContainer {
  return node.kind === "object" || node.kind === "array";
}

function containerSize(node: JsonContainer) {
  return node.kind === "object" ? node.entries.length : node.items.length;
}

function containerSummary(node: JsonContainer) {
  const count = containerSize(node);
  return node.kind === "object"
    ? i18n.t("composer:richBlock.jsonKeys", { count })
    : i18n.t("composer:richBlock.jsonItems", { count });
}

function PrimitiveValue({ node }: { node: JsonTreeNode }) {
  switch (node.kind) {
    case "string":
      return <span className={sx(styles.string)}>{JSON.stringify(node.value)}</span>;
    case "number":
      return <span className={sx(styles.number)}>{node.raw}</span>;
    case "boolean":
      return <span className={sx(styles.literal)}>{String(node.value)}</span>;
    case "null":
      return <span className={sx(styles.literal)}>{/* i18n-ignore: JSON literal */}null</span>;
    case "object":
      return <span className={sx(styles.punctuation)}>{"{}"}</span>;
    case "array":
      return <span className={sx(styles.punctuation)}>[]</span>;
  }
}

function KeyLabel({ name }: { name: string | number | null }) {
  if (name === null) return null;
  return (
    <>
      {typeof name === "number" ? (
        <span className={sx(styles.index)}>{name}</span>
      ) : (
        <span className={sx(styles.key)}>{JSON.stringify(name)}</span>
      )}
      <span className={sx(styles.punctuation)}>: </span>
    </>
  );
}

interface JsonNodeViewProps {
  name: string | number | null;
  node: JsonTreeNode;
  depth: number;
  openDepth: number;
  comma: boolean;
}

function JsonNodeView({ name, node, depth, openDepth, comma }: JsonNodeViewProps) {
  useTranslation();
  const [open, setOpen] = useState(depth < openDepth);
  const [limit, setLimit] = useState(JSON_TREE_CHILD_PAGE);
  const trailing = comma ? <span className={sx(styles.punctuation)}>,</span> : null;

  if (!isContainer(node) || containerSize(node) === 0) {
    return (
      <span className={sx(styles.row)}>
        <span className={sx(styles.chevronSpace)} aria-hidden />
        <KeyLabel name={name} />
        <PrimitiveValue node={node} />
        {trailing}
      </span>
    );
  }

  const [openBracket, closeBracket] = node.kind === "object" ? ["{", "}"] : ["[", "]"];
  const size = containerSize(node);
  const children =
    node.kind === "object"
      ? node.entries.slice(0, limit).map((entry, index) => ({ name: entry.key as string | number, value: entry.value, index }))
      : node.items.slice(0, limit).map((value, index) => ({ name: index as string | number, value, index }));
  const hidden = size - children.length;

  return (
    <span className={sx(styles.node)}>
      <Button
        layout="host"
        type="button"
        xstyle={[styles.row, styles.toggle]}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight aria-hidden className={sx(styles.chevron, transition.transform, open && styles.chevronOpen)} />
        <KeyLabel name={name} />
        <span className={sx(styles.punctuation)}>{openBracket}</span>
        {open ? null : (
          <>
            <span className={sx(styles.summary)}>{containerSummary(node)}</span>
            <span className={sx(styles.punctuation)}>{closeBracket}</span>
            {trailing}
          </>
        )}
      </Button>
      {open ? (
        <>
          <span className={sx(styles.children)}>
            {children.map((child) => (
              <JsonNodeView
                key={child.index}
                name={child.name}
                node={child.value}
                depth={depth + 1}
                openDepth={openDepth}
                comma={child.index < size - 1}
              />
            ))}
            {hidden > 0 ? (
              <span className={sx(styles.more)}>
                <Button size="xs" type="button" variant="quiet" onClick={() => setLimit((value) => value + JSON_TREE_CHILD_PAGE)}>
                  {i18n.t("composer:richBlock.jsonShowMore", { count: Math.min(hidden, JSON_TREE_CHILD_PAGE) })}
                </Button>
              </span>
            ) : null}
          </span>
          <span className={sx(styles.row)}>
            <span className={sx(styles.chevronSpace)} aria-hidden />
            <span className={sx(styles.punctuation)}>{closeBracket}</span>
            {trailing}
          </span>
        </>
      ) : null}
    </span>
  );
}

function JsonTreeView({ document }: { document: JsonTreeDocument }) {
  useTranslation();
  const textScale = useMessageTextScale();
  const settingsCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);
  const fontSize = scaleMessageCodeFontSize(textScale, settingsCodeFontSize);
  const scrollHost = useRef<HTMLPreElement>(null);
  useCodeScrollRegion(scrollHost, String(document.nodeCount), i18n.t("composer:message.codeScrollRegion"));
  return (
    <pre
      ref={scrollHost}
      className={sx(styles.tree)}
      style={{ fontSize: `${fontSize}px` }}
    >
      <JsonNodeView name={null} node={document.root} depth={0} openDepth={initialJsonOpenDepth(document)} comma={false} />
    </pre>
  );
}

/**
 * A JSON object or array in a reply, shown as a tree that folds. The header
 * keeps the code block's title and Copy (which copies the text as written),
 * and **Show code** switches to the highlighted source.
 */
export function JsonTreeBlock(props: { code: string; document: JsonTreeDocument; title: ReactNode }) {
  useTranslation();
  const [showCode, setShowCode] = useState(false);
  return (
    <CodeBlock
      code={props.code}
      language="json"
      body={showCode ? undefined : <JsonTreeView document={props.document} />}
      data-json-tree=""
    >
      <CodeBlockHeader>
        {props.title}
        <CodeBlockActions>
          <Button size="xs" type="button" variant="quiet" onClick={() => setShowCode((value) => !value)}>
            {showCode ? i18n.t("composer:richBlock.showTree") : i18n.t("composer:richBlock.showCode")}
          </Button>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

const styles = stylex.create({
  tree: {
    margin: 0,
    overflowX: "auto",
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    fontFamily: vars["--aui-font-mono"],
    lineHeight: chatType["--chat-type-secondary-leading"],
    // The plain-code surface: the tree's colors are the app's, not the editor's.
    backgroundColor: "var(--background)",
    color: vars["--aui-color-text"],
  },
  node: {
    display: "block",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    minInlineSize: "max-content",
    whiteSpace: "pre",
  },
  toggle: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    lineHeight: "inherit",
    margin: 0,
    padding: 0,
    textAlign: "start",
  },
  chevron: {
    alignSelf: "center",
    blockSize: "1em",
    inlineSize: "1em",
    flexShrink: 0,
    marginInlineEnd: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
  chevronSpace: {
    flexShrink: 0,
    inlineSize: "1em",
    marginInlineEnd: vars["--aui-space-4"],
  },
  children: {
    display: "block",
    paddingInlineStart: vars["--aui-space-16"],
  },
  more: {
    display: "block",
    paddingInlineStart: vars["--aui-space-16"],
  },
  key: {
    color: vars["--aui-color-text"],
  },
  index: {
    color: vars["--aui-color-text-muted"],
  },
  string: {
    color: vars["--aui-color-success-text"],
  },
  number: {
    color: vars["--aui-color-info-text"],
  },
  literal: {
    color: vars["--aui-color-warning-text"],
  },
  punctuation: {
    color: vars["--aui-color-text-muted"],
  },
  summary: {
    color: vars["--aui-color-text-subtle"],
    fontStyle: "italic",
    paddingInline: vars["--aui-space-4"],
  },
});
