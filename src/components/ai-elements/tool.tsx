import { Button as AdsButton } from "@/components/ads/components/Button";
import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Wrench } from "lucide-react";
import { StaveIcon } from "@/components/brand-icons";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { TruncationWarningBanner } from "@/components/ai-elements/truncation-warning";
import {
  isStaveToolName,
  toStaveToolDisplayName,
} from "@/lib/tool-display-name";
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { Loader } from "@/components/ui/loader";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { toolStyles as s } from "./tool.styles";

interface ToolProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  openWhen?: boolean;
}

export type ToolState =
  "input-streaming" | "input-available" | "output-available" | "output-error";

interface ToolHeaderProps extends HTMLAttributes<HTMLButtonElement> {
  type?: string;
  state?: ToolState;
  title?: string;
  elapsedSeconds?: number;
}

interface ToolContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useToolContext() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used inside <Tool />.");
  }
  return context;
}

export function Tool({
  className,
  defaultOpen = false,
  openWhen = false,
  ...props
}: ToolProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (openWhen) {
      setOpen(true);
    }
  }, [openWhen]);

  const contextValue = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <ToolContext.Provider value={contextValue}>
      <section className={cx(sx(s.root), className)} {...props} />
    </ToolContext.Provider>
  );
}

function displayToolName(args: { type?: string; title?: string }) {
  if (args.title?.trim()) {
    return args.title.trim();
  }
  if (!args.type) {
    return "Tool";
  }
  if (isStaveToolName(args.type)) {
    return toStaveToolDisplayName(args.type);
  }
  return args.type.replace(/^tool[-_:]?/i, "").replaceAll(/[_-]+/g, " ");
}

export function getStatusBadge(state?: ToolHeaderProps["state"]): ReactNode {
  switch (state) {
    case "input-streaming":
      return (
        <span aria-label="Running" className={sx(s.badge, s.badgeMuted)}>
          <Loader aria-hidden size="xs" variant="steps" />
        </span>
      );
    case "input-available":
      return (
        <span aria-label="Input available" className={sx(s.badge, s.badgeMuted)}>
          <Wrench className={sx(s.badgeIcon)} />
        </span>
      );
    case "output-available":
      return (
        <span aria-label="Done" className={sx(s.badge, s.badgeSuccess)}>
          <CircleCheck className={sx(s.badgeIcon)} />
        </span>
      );
    case "output-error":
      return (
        <span aria-label="Error" className={sx(s.badge, s.badgeError)}>
          <CircleAlert className={sx(s.badgeIcon)} />
        </span>
      );
    default:
      return (
        <span aria-label="Idle" className={sx(s.badge, s.badgeMuted)}>
          <Wrench className={sx(s.badgeIcon)} />
        </span>
      );
  }
}

function formatElapsedTime(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function getToolStatusText(state?: ToolState, elapsedSeconds?: number) {
  switch (state) {
    case "input-streaming":
      return elapsedSeconds != null && elapsedSeconds > 0
        ? `Running (${formatElapsedTime(elapsedSeconds)})`
        : "Running";
    case "input-available":
      return "Ready";
    case "output-available":
      return elapsedSeconds != null && elapsedSeconds > 0
        ? `Done (${formatElapsedTime(elapsedSeconds)})`
        : "Done";
    case "output-error":
      return "Error";
    default:
      return "Idle";
  }
}

function getToolStatusTextStyle(state?: ToolState) {
  switch (state) {
    case "output-available":
      return s.statusSuccess;
    case "output-error":
      return s.statusError;
    default:
      return s.statusMuted;
  }
}

export function ToolHeader({
  className,
  type,
  state,
  title,
  elapsedSeconds,
  ...props
}: ToolHeaderProps) {
  const { open, setOpen } = useToolContext();
  return (
    <AdsButton
      layout="host"
      type="button"
      className={cx(sx(s.header, open && s.headerOpen), className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      <span className={sx(s.headerName)}>
        {type && isStaveToolName(type) ? (
          <StaveIcon className={sx(s.headerIcon)} />
        ) : (
          <Wrench className={sx(s.headerIcon)} />
        )}
        {displayToolName({ type, title })}
      </span>
      <span className={sx(s.headerMeta)}>
        <span className={sx(s.statusText, getToolStatusTextStyle(state))}>
          {getToolStatusText(state, elapsedSeconds)}
        </span>
        {getStatusBadge(state)}
        <ChevronDown className={sx(s.chevron, transition.transform, open && s.chevronOpen)} />
      </span>
    </AdsButton>
  );
}

export function ToolContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { open } = useToolContext();
  if (!open) {
    return null;
  }
  return <div className={cx(sx(s.content), className)} {...props} />;
}

export function ToolInput(args: { input: unknown; className?: string }) {
  const content =
    typeof args.input === "string"
      ? args.input
      : JSON.stringify(args.input, null, 2);
  const truncationNotice = detectTruncationNotice({
    text: content,
    source: "tool_input",
  });
  return (
    <div className={cx(sx(s.ioBlock, s.ioInput), args.className)}>
      <p className={sx(s.ioLabel)}>Input</p>
      {truncationNotice ? (
        <TruncationWarningBanner
          notice={truncationNotice}
          compact
          className={sx(s.banner)}
        />
      ) : null}
      <LinkifiedText as="pre" text={content} className={sx(s.pre)} />
    </div>
  );
}

export function ToolOutput(args: {
  output?: ReactNode;
  outputText?: string;
  errorText?: string;
  className?: string;
  label?: string;
  linkifyOutputText?: boolean;
}) {
  const truncationNotice = detectTruncationNotice({
    text: args.errorText ?? args.outputText,
    source: "tool_output",
  });
  return (
    <div className={cx(sx(s.ioBlock, s.ioOutput), args.className)}>
      <p className={sx(s.ioLabel)}>{args.label ?? "Output"}</p>
      {truncationNotice ? (
        <TruncationWarningBanner
          notice={truncationNotice}
          compact
          className={sx(s.banner)}
        />
      ) : null}
      {args.errorText ? (
        <LinkifiedText
          as="p"
          text={args.errorText}
          className={sx(s.errorText)}
        />
      ) : (
        <div>
          {args.output ??
            (typeof args.outputText === "string" && args.outputText !== "" ? (
              args.linkifyOutputText === false ? (
                <pre className={sx(s.outputPre)}>{args.outputText}</pre>
              ) : (
                <LinkifiedText
                  as="pre"
                  text={args.outputText}
                  className={sx(s.outputPre)}
                />
              )
            ) : (
              <span className={sx(s.noOutput)}>No output.</span>
            ))}
        </div>
      )}
    </div>
  );
}

type ToolGroupState = ToolState;

export function ToolGroup(args: {
  states: (ToolGroupState | undefined)[];
  children: ReactNode;
  defaultOpen?: boolean;
  openWhen?: boolean;
}) {
  const { states, children, defaultOpen = false, openWhen = false } = args;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) {
      setOpen(true);
    }
  }, [openWhen]);

  const latestState = [...states]
    .reverse()
    .find((state): state is ToolGroupState => state !== undefined);

  const overallState: ToolGroupState = latestState ?? "input-available";

  return (
    <div className={sx(s.root)}>
      <AdsButton
        layout="host"
        type="button"
        className={sx(s.header, open && s.headerOpen)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={sx(s.headerName)}>
          <Wrench className={sx(s.headerIcon)} />
          Tools
        </span>
        <span className={sx(s.headerMeta)}>
          <span className={sx(s.statusText, getToolStatusTextStyle(overallState))}>
            {getToolStatusText(overallState)}
          </span>
          {getStatusBadge(overallState)}
          <ChevronDown className={sx(s.chevron, transition.transform, open && s.chevronOpen)} />
        </span>
      </AdsButton>
      {open && <div className={sx(s.groupList)}>{children}</div>}
    </div>
  );
}
