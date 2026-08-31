import {
  forwardRef,
  type ClipboardEvent,
  type ForwardedRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $createRangeSelection,
  $createTabNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type EditorConfig,
  type EditorState,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  type TextNode,
} from "lexical";
import type { CommandPaletteItem } from "@/lib/commands";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import {
  getPromptTokenSegmentSignature,
  parsePromptTokenSegments,
  type PromptTokenDescriptor,
  type PromptTokenParseOptions,
} from "@/lib/prompt-token-chips";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import { cn } from "@/lib/utils";
import { registerPromptLexicalPreventedEnterCommand } from "./prompt-lexical-editor.commands";
import { PromptTokenChip } from "./prompt-token-chip";

const PROMPT_SYNC_TAG = "stave-prompt-sync";
const PROMPT_TOKENIZE_TAG = "stave-prompt-tokenize";

export interface PromptLexicalEditorSelectionRange {
  start: number;
  end: number;
}

export interface PromptLexicalEditorHandle {
  focus: () => void;
  getRootElement: () => HTMLDivElement | null;
  getSelectionRange: () => PromptLexicalEditorSelectionRange;
  setSelectionRange: (start: number, end?: number) => void;
}

interface PromptLexicalEditorProps {
  value: string;
  selectionRange?: PromptLexicalEditorSelectionRange;
  disabled?: boolean;
  minimal?: boolean;
  placeholder?: string;
  className?: string;
  commandPaletteItems?: readonly CommandPaletteItem[];
  skillPaletteItems?: readonly SkillCatalogEntry[];
  workspaceInformationReferenceOptions?: readonly WorkspaceInformationReferenceOption[];
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onSelectionChange?: (range: PromptLexicalEditorSelectionRange) => void;
}

type SerializedPromptTokenNode = Spread<
  {
    kind: PromptTokenDescriptor["kind"];
    token: string;
    label: string;
    detail?: string;
  },
  SerializedLexicalNode
>;

class PromptTokenNode extends DecoratorNode<ReactNode> {
  __descriptor: PromptTokenDescriptor;

  static getType(): string {
    return "prompt-token";
  }

  static clone(node: PromptTokenNode): PromptTokenNode {
    return new PromptTokenNode(node.__descriptor, node.__key);
  }

  static importJSON(
    serializedNode: SerializedPromptTokenNode,
  ): PromptTokenNode {
    return $createPromptTokenNode({
      kind: serializedNode.kind,
      token: serializedNode.token,
      label: serializedNode.label,
      detail: serializedNode.detail,
    });
  }

  constructor(descriptor: PromptTokenDescriptor, key?: NodeKey) {
    super(key);
    this.__descriptor = descriptor;
  }

  createDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "inline-flex align-baseline";
    return element;
  }

  updateDOM(prevNode: PromptTokenNode): boolean {
    const prev = prevNode.__descriptor;
    const next = this.__descriptor;
    return (
      prev.kind !== next.kind ||
      prev.token !== next.token ||
      prev.label !== next.label ||
      prev.detail !== next.detail
    );
  }

  decorate(): ReactNode {
    return (
      <PromptTokenChip
        descriptor={this.__descriptor}
        compact
        className="mx-0.5"
      />
    );
  }

  exportJSON(): SerializedPromptTokenNode {
    return {
      type: "prompt-token",
      version: 1,
      kind: this.__descriptor.kind,
      token: this.__descriptor.token,
      label: this.__descriptor.label,
      ...(this.__descriptor.detail ? { detail: this.__descriptor.detail } : {}),
    };
  }

  getTextContent(): string {
    return this.__descriptor.token;
  }

  getTextContentSize(): number {
    return this.__descriptor.token.length;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return false;
  }

  getDescriptor(): PromptTokenDescriptor {
    return this.__descriptor;
  }
}

function $createPromptTokenNode(descriptor: PromptTokenDescriptor) {
  return $applyNodeReplacement(new PromptTokenNode(descriptor));
}

function $isPromptTokenNode(
  node: LexicalNode | null | undefined,
): node is PromptTokenNode {
  return node instanceof PromptTokenNode;
}

function appendPlainTextNodes(parent: ElementNode, text: string) {
  if (!text) {
    return;
  }

  for (const part of text.split(/(\n|\t)/)) {
    if (!part) {
      continue;
    }
    if (part === "\n") {
      parent.append($createLineBreakNode());
      continue;
    }
    if (part === "\t") {
      parent.append($createTabNode());
      continue;
    }
    parent.append($createTextNode(part));
  }
}

function writePromptTextToEditor(
  value: string,
  options: PromptTokenParseOptions,
) {
  const root = $getRoot();
  root.clear();

  const paragraph = $createParagraphNode();
  root.append(paragraph);

  for (const segment of parsePromptTokenSegments(value, options)) {
    if (segment.type === "text") {
      appendPlainTextNodes(paragraph, segment.text);
      continue;
    }
    paragraph.append($createPromptTokenNode(segment.descriptor));
  }
}

function getPromptTokenSignatureForText(
  value: string,
  options: PromptTokenParseOptions,
) {
  return getPromptTokenSegmentSignature(
    parsePromptTokenSegments(value, options),
  );
}

function collectPromptTokenNodeSignature(node: LexicalNode, output: string[]) {
  if ($isPromptTokenNode(node)) {
    const descriptor = node.getDescriptor();
    output.push(`${descriptor.kind}:${descriptor.token}:${descriptor.label}`);
    return;
  }
  if (!$isElementNode(node)) {
    return;
  }
  for (const child of node.getChildren()) {
    collectPromptTokenNodeSignature(child, output);
  }
}

function getPromptTokenSignatureInEditor() {
  const output: string[] = [];
  collectPromptTokenNodeSignature($getRoot(), output);
  return output.join("|");
}

function getPromptTextContentFromElement(element: ElementNode): string {
  return element
    .getChildren()
    .map((child) =>
      $isElementNode(child)
        ? getPromptTextContentFromElement(child)
        : child.getTextContent(),
    )
    .join(element.getKey() === "root" ? "\n" : "");
}

function getEditorTextContent() {
  return getPromptTextContentFromElement($getRoot()).replace(/\n+$/, "");
}

function getCharacterOffsetForElementPoint(
  element: ElementNode,
  targetOffset: number,
) {
  return element
    .getChildren()
    .slice(0, targetOffset)
    .reduce((total, child) => total + child.getTextContentSize(), 0);
}

function getCharacterOffsetForSelectionPoint(args: {
  element: ElementNode;
  key: NodeKey;
  offset: number;
  type: "text" | "element";
}): number | null {
  if (args.element.getKey() === args.key && args.type === "element") {
    return getCharacterOffsetForElementPoint(args.element, args.offset);
  }

  let consumed = 0;
  for (const child of args.element.getChildren()) {
    const size = child.getTextContentSize();
    if (child.getKey() === args.key) {
      if ($isTextNode(child)) {
        return consumed + Math.max(0, Math.min(args.offset, size));
      }
      return consumed + (args.offset > 0 ? size : 0);
    }
    if ($isElementNode(child)) {
      const nestedOffset = getCharacterOffsetForSelectionPoint({
        element: child,
        key: args.key,
        offset: args.offset,
        type: args.type,
      });
      if (nestedOffset !== null) {
        return consumed + nestedOffset;
      }
    }
    consumed += size;
  }

  return null;
}

function getSelectionRangeFromEditorState(): PromptLexicalEditorSelectionRange {
  const selection = $getSelection();
  const textLength = getEditorTextContent().length;
  if (!$isRangeSelection(selection)) {
    return { start: textLength, end: textLength };
  }
  const root = $getRoot();
  const start =
    getCharacterOffsetForSelectionPoint({
      element: root,
      key: selection.anchor.key,
      offset: selection.anchor.offset,
      type: selection.anchor.type,
    }) ?? textLength;
  const end =
    getCharacterOffsetForSelectionPoint({
      element: root,
      key: selection.focus.key,
      offset: selection.focus.offset,
      type: selection.focus.type,
    }) ?? textLength;
  const normalizedStart = Math.max(0, Math.min(start, textLength));
  const normalizedEnd = Math.max(0, Math.min(end, textLength));
  return {
    start: Math.min(normalizedStart, normalizedEnd),
    end: Math.max(normalizedStart, normalizedEnd),
  };
}

function resolvePointAtCharacterOffset(
  element: ElementNode,
  targetOffset: number,
): { key: NodeKey; offset: number; type: "text" | "element" } {
  const children = element.getChildren();
  let consumed = 0;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    const size = child.getTextContentSize();
    if ($isTextNode(child)) {
      if (targetOffset <= consumed + size) {
        return {
          key: child.getKey(),
          offset: Math.max(0, Math.min(size, targetOffset - consumed)),
          type: "text",
        };
      }
      consumed += size;
      continue;
    }

    if ($isElementNode(child)) {
      if (targetOffset <= consumed + size) {
        return resolvePointAtCharacterOffset(child, targetOffset - consumed);
      }
      consumed += size;
      continue;
    }

    if (targetOffset <= consumed) {
      return { key: element.getKey(), offset: index, type: "element" };
    }
    if (targetOffset <= consumed + size) {
      return { key: element.getKey(), offset: index + 1, type: "element" };
    }
    consumed += size;
  }

  return {
    key: element.getKey(),
    offset: children.length,
    type: "element",
  };
}

function setSelectionFromCharacterRange(start: number, end: number) {
  const root = $getRoot();
  const textLength = getEditorTextContent().length;
  const clampedStart = Math.max(0, Math.min(start, textLength));
  const clampedEnd = Math.max(0, Math.min(end, textLength));
  const anchor = resolvePointAtCharacterOffset(root, clampedStart);
  const focus = resolvePointAtCharacterOffset(root, clampedEnd);
  const selection = $createRangeSelection();

  selection.anchor.set(anchor.key, anchor.offset, anchor.type);
  selection.focus.set(focus.key, focus.offset, focus.type);
  $setSelection(selection);
}

function getPromptTokenDeletionBeforeSelection(): {
  tokenNode: PromptTokenNode;
  textNodeBeforeCaret?: TextNode;
  textCharactersBeforeCaret: number;
} | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  if (selection.anchor.type === "text") {
    const node = selection.anchor.getNode();
    if (!$isTextNode(node)) {
      return null;
    }

    const textBeforeCaret = node
      .getTextContent()
      .slice(0, selection.anchor.offset);
    if (textBeforeCaret && !/^\s+$/.test(textBeforeCaret)) {
      return null;
    }

    const previousSibling = node.getPreviousSibling();
    if (!$isPromptTokenNode(previousSibling)) {
      return null;
    }

    return {
      tokenNode: previousSibling,
      textNodeBeforeCaret: node,
      textCharactersBeforeCaret: selection.anchor.offset,
    };
  }

  const node = selection.anchor.getNode();
  if (!$isElementNode(node)) {
    return null;
  }

  const previousSibling = node.getChildren()[selection.anchor.offset - 1];
  if ($isPromptTokenNode(previousSibling)) {
    return {
      tokenNode: previousSibling,
      textCharactersBeforeCaret: 0,
    };
  }

  if (!$isTextNode(previousSibling)) {
    return null;
  }

  const text = previousSibling.getTextContent();
  if (!/^\s+$/.test(text)) {
    return null;
  }

  const tokenNode = previousSibling.getPreviousSibling();
  if (!$isPromptTokenNode(tokenNode)) {
    return null;
  }

  return {
    tokenNode,
    textNodeBeforeCaret: previousSibling,
    textCharactersBeforeCaret: text.length,
  };
}

function deletePromptTokenBeforeSelection() {
  const deletion = getPromptTokenDeletionBeforeSelection();
  if (!deletion) {
    return false;
  }

  const selectionRange = getSelectionRangeFromEditorState();
  const tokenCharacterCount = deletion.tokenNode.getTextContentSize();
  const nextCaretIndex = Math.max(
    0,
    selectionRange.start -
      tokenCharacterCount -
      deletion.textCharactersBeforeCaret,
  );

  if (deletion.textNodeBeforeCaret) {
    const text = deletion.textNodeBeforeCaret.getTextContent();
    const nextText = text.slice(deletion.textCharactersBeforeCaret);
    if (nextText) {
      deletion.textNodeBeforeCaret.setTextContent(nextText);
    } else {
      deletion.textNodeBeforeCaret.remove();
    }
  }
  deletion.tokenNode.remove();
  setSelectionFromCharacterRange(nextCaretIndex, nextCaretIndex);
  return true;
}

function PromptLexicalEditablePlugin(args: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!args.disabled);
  }, [args.disabled, editor]);

  return null;
}

function PromptLexicalSelectionPlugin(args: {
  onSelectionChange?: (range: PromptLexicalEditorSelectionRange) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const onSelectionChangeRef = useRef(args.onSelectionChange);
  onSelectionChangeRef.current = args.onSelectionChange;

  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const range = editor
            .getEditorState()
            .read(() => getSelectionRangeFromEditorState());
          onSelectionChangeRef.current?.(range);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  return null;
}

function PromptLexicalTokenDeletionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const deleted = deletePromptTokenBeforeSelection();
          if (!deleted) {
            return false;
          }
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  return null;
}

function PromptLexicalPreventedEnterPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => registerPromptLexicalPreventedEnterCommand(editor), [editor]);

  return null;
}

function PromptLexicalImperativePlugin(args: {
  forwardedRef: ForwardedRef<PromptLexicalEditorHandle>;
}) {
  const [editor] = useLexicalComposerContext();

  useImperativeHandle(
    args.forwardedRef,
    () => ({
      focus: () => {
        editor.focus();
      },
      getRootElement: () => editor.getRootElement() as HTMLDivElement | null,
      getSelectionRange: () =>
        editor.getEditorState().read(() => getSelectionRangeFromEditorState()),
      setSelectionRange: (start: number, end = start) => {
        editor.update(() => setSelectionFromCharacterRange(start, end), {
          discrete: true,
        });
        editor.focus();
      },
    }),
    [args.forwardedRef, editor],
  );

  return null;
}

function PromptLexicalExternalSyncPlugin(args: {
  value: string;
  selectionRange?: PromptLexicalEditorSelectionRange;
  tokenOptions: PromptTokenParseOptions;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const snapshot = editor.getEditorState().read(() => ({
      text: getEditorTextContent(),
      tokenSignature: getPromptTokenSignatureInEditor(),
      selection: getSelectionRangeFromEditorState(),
    }));
    const expectedTokenSignature = getPromptTokenSignatureForText(
      args.value,
      args.tokenOptions,
    );

    if (
      snapshot.text === args.value &&
      snapshot.tokenSignature === expectedTokenSignature
    ) {
      return;
    }

    const nextSelection =
      snapshot.text === args.value
        ? snapshot.selection
        : (args.selectionRange ?? {
            start: args.value.length,
            end: args.value.length,
          });
    editor.update(
      () => {
        writePromptTextToEditor(args.value, args.tokenOptions);
        setSelectionFromCharacterRange(nextSelection.start, nextSelection.end);
      },
      { tag: PROMPT_SYNC_TAG },
    );
  }, [args.selectionRange, args.tokenOptions, args.value, editor]);

  return null;
}

function PromptLexicalChangePlugin(args: {
  value: string;
  tokenOptions: PromptTokenParseOptions;
  onChange: (value: string) => void;
  onSelectionChange?: (range: PromptLexicalEditorSelectionRange) => void;
}) {
  const valueRef = useRef(args.value);
  const tokenOptionsRef = useRef(args.tokenOptions);
  const onChangeRef = useRef(args.onChange);
  const onSelectionChangeRef = useRef(args.onSelectionChange);
  valueRef.current = args.value;
  tokenOptionsRef.current = args.tokenOptions;
  onChangeRef.current = args.onChange;
  onSelectionChangeRef.current = args.onSelectionChange;

  return (
    <OnChangePlugin
      ignoreSelectionChange={false}
      onChange={(
        editorState: EditorState,
        editor: LexicalEditor,
        tags: Set<string>,
      ) => {
        if (tags.has(PROMPT_SYNC_TAG) || tags.has(PROMPT_TOKENIZE_TAG)) {
          return;
        }

        const snapshot = editorState.read(() => ({
          text: getEditorTextContent(),
          tokenSignature: getPromptTokenSignatureInEditor(),
          selection: getSelectionRangeFromEditorState(),
        }));
        onSelectionChangeRef.current?.(snapshot.selection);
        if (snapshot.text !== valueRef.current) {
          onChangeRef.current(snapshot.text);
        }

        const expectedTokenSignature = getPromptTokenSignatureForText(
          snapshot.text,
          tokenOptionsRef.current,
        );
        if (snapshot.tokenSignature === expectedTokenSignature) {
          return;
        }

        editor.update(
          () => {
            writePromptTextToEditor(snapshot.text, tokenOptionsRef.current);
            setSelectionFromCharacterRange(
              snapshot.selection.start,
              snapshot.selection.end,
            );
          },
          { tag: PROMPT_TOKENIZE_TAG },
        );
      }}
    />
  );
}

export const PromptLexicalEditor = forwardRef<
  PromptLexicalEditorHandle,
  PromptLexicalEditorProps
>(function PromptLexicalEditor(props, ref) {
  const tokenOptions = useMemo<PromptTokenParseOptions>(
    () => ({
      commandPaletteItems: props.commandPaletteItems,
      skillPaletteItems: props.skillPaletteItems,
      workspaceInformationReferenceOptions:
        props.workspaceInformationReferenceOptions,
      allowGenericCommandTokens: false,
      allowGenericSkillTokens: false,
    }),
    [
      props.commandPaletteItems,
      props.skillPaletteItems,
      props.workspaceInformationReferenceOptions,
    ],
  );
  const initialConfig = useMemo(
    () => ({
      namespace: "StavePromptInput",
      editable: !props.disabled,
      nodes: [PromptTokenNode],
      onError: (error: Error) => {
        throw error;
      },
      editorState: () => {
        writePromptTextToEditor(props.value, tokenOptions);
        $getRoot().selectEnd();
      },
    }),
    [],
  );

  const placeholder = props.placeholder?.trim() ? props.placeholder : null;

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative min-w-0">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Prompt"
              aria-multiline="true"
              aria-disabled={props.disabled}
              className={cn(
                "whitespace-pre-wrap break-words [overflow-wrap:anywhere] outline-none",
                props.className,
              )}
              data-prompt-lexical-editor="true"
              onBlur={props.onBlur}
              onFocus={props.onFocus}
              onKeyDownCapture={props.onKeyDown}
              onPaste={props.onPaste}
              spellCheck={false}
            />
          }
          placeholder={
            placeholder ? (
              <div
                data-prompt-lexical-placeholder="true"
                className={cn(
                  "pointer-events-none absolute left-0 top-0 select-none",
                  props.minimal
                    ? "font-mono text-[15px] leading-7 text-muted-foreground"
                    : "text-[15px] font-normal leading-6 tracking-normal text-muted-foreground/75",
                )}
              >
                {placeholder}
              </div>
            ) : null
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <PromptLexicalEditablePlugin disabled={props.disabled} />
      <PromptLexicalSelectionPlugin
        onSelectionChange={props.onSelectionChange}
      />
      <PromptLexicalPreventedEnterPlugin />
      <PromptLexicalTokenDeletionPlugin />
      <PromptLexicalImperativePlugin forwardedRef={ref} />
      <PromptLexicalExternalSyncPlugin
        value={props.value}
        selectionRange={props.selectionRange}
        tokenOptions={tokenOptions}
      />
      <PromptLexicalChangePlugin
        value={props.value}
        tokenOptions={tokenOptions}
        onChange={props.onChange}
        onSelectionChange={props.onSelectionChange}
      />
    </LexicalComposer>
  );
});
