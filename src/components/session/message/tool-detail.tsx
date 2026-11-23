import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";

import { Button } from "@/components/aui/components/Button";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import {
  normalizeToolDetailOutput,
  type ToolDetailInput,
  type ToolFileLocation,
  type ToolJsonNode,
} from "@/lib/tool-detail";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";
import { useAppStore } from "@/store/app.store";

import { TraceOutput } from "./turn-event-rows";

function ToolLocation({ location, taskId }: { location: ToolFileLocation; taskId: string }) {
  useTranslation();
  const workspaceCwd = useAppStore((state) => {
    const owner = state.taskWorkspaceIdById[taskId];
    if (owner && owner !== state.activeWorkspaceId) return null;
    return state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath ?? "";
  });
  const filePath = workspaceCwd === null || /^(?!file:\/\/)[a-z][a-z0-9+.-]*:/i.test(location.path)
    ? null
    : resolveWorkspaceRelativeFilePath({ filePath: location.path, workspacePath: workspaceCwd });
  const { line, path } = location;
  const text = line === undefined ? path : `${path}:${line}`;
  if (!filePath) return <span>{text}</span>;
  return (
    <Button
      flushInline
      layout="host"
      press="none"
      variant="quiet"
      xstyle={styles.location}
      onClick={() => {
        const state = useAppStore.getState();
        const owner = state.taskWorkspaceIdById[taskId];
        if (owner && owner !== state.activeWorkspaceId) return;
        void state.openFileFromTree({ filePath, line });
      }}
      title={i18n.t("session:toolDetail.openFile", { location: text })}
      type="button"
    >
      {text}
    </Button>
  );
}

export function ReadToolDetail({ read, taskId, remainingInput }: {
  read: NonNullable<ToolDetailInput["read"]>;
  taskId: string;
  remainingInput?: string | null;
}) {
  useTranslation();
  const { offset, limit, endLine, pages } = read;
  return (
    <div data-tool-read-detail="">
      <div className={sx(styles.read)}>
        <ToolLocation location={read} taskId={taskId} />
        {endLine !== undefined && read.line !== undefined ? (
          <span>{i18n.t("session:toolDetail.lineRange", { start: formatNumber(read.line), end: formatNumber(endLine) })}</span>
        ) : null}
        {offset !== undefined ? <span>{i18n.t("session:toolDetail.offset", { value: formatNumber(offset) })}</span> : null}
        {limit !== undefined ? <span>{i18n.t("session:toolDetail.limit", { value: formatNumber(limit) })}</span> : null}
        {pages ? <span>{i18n.t("session:toolDetail.pages", { value: pages })}</span> : null}
      </div>
      {remainingInput ? <div className={sx(styles.remainingInput)}>{remainingInput}</div> : null}
    </div>
  );
}

export function ToolJsonTree({ root }: { root: ToolJsonNode }) {
  return <div data-tool-json-detail=""><JsonLine node={root} /></div>;
}

function JsonLine({ node, depth = 0, comma = false }: { node: ToolJsonNode; depth?: number; comma?: boolean }) {
  const prefix = node.key === undefined ? "" : `${JSON.stringify(node.key)}: `;
  if ("text" in node) return <div>{prefix}{node.text}{comma ? "," : ""}</div>;
  return <JsonBranch node={node} prefix={prefix} depth={depth} comma={comma} />;
}

function JsonBranch({ node, prefix, depth, comma }: {
  node: Extract<ToolJsonNode, { children: ToolJsonNode[] }>;
  prefix: string;
  depth: number;
  comma: boolean;
}) {
  useTranslation();
  const [open, setOpen] = useState(depth === 0);
  const left = node.array ? "[" : "{";
  const right = node.array ? "]" : "}";
  const close = right + (comma ? "," : "");
  if (node.children.length === 0 && node.omitted === 0) return <div>{prefix}{left}{close}</div>;

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={sx(styles.jsonToggle, focusRing.ring)}>
        {prefix}{left}{open ? "" : `…${close}`}
      </summary>
      {open ? (
        <>
          <div className={sx(styles.jsonChildren)}>
            {node.children.map((child, index) => (
              <JsonLine key={index} node={child} depth={depth + 1} comma={index + 1 < node.children.length || node.omitted > 0} />
            ))}
            {node.omitted > 0 ? (
              <span className={sx(styles.muted)}>
                {i18n.t("session:toolDetail.hiddenEntries", { count: node.omitted })}
              </span>
            ) : null}
          </div>
          <div>{close}</div>
        </>
      ) : null}
    </details>
  );
}

export function ToolMatchList({ detail, taskId }: {
  detail: Extract<ReturnType<typeof normalizeToolDetailOutput>, { kind: "matches" }>;
  taskId: string;
}) {
  return (
    <div data-tool-match-detail="">
      <ul className={sx(styles.matches)}>
        {detail.matches.map((match, index) => (
          <li key={index}>
            <ToolLocation location={match} taskId={taskId} />
            {match.snippet ? <div className={sx(styles.muted)}>{match.snippet}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mounted by the lazy ToolRun panel, so closed rows don't parse large results. */
export function FormattedToolOutput({ output, search, taskId }: {
  output: string;
  search?: ToolDetailInput["search"];
  taskId: string;
}) {
  useTranslation();
  const detail = useMemo(() => normalizeToolDetailOutput(output, search), [output, search]);
  const label = i18n.t("ui:toolrun.output");
  switch (detail.kind) {
    case "matches":
      return (
        <TraceOutput
          capped
          label={label}
          text={output}
          content={<ToolMatchList detail={detail} taskId={taskId} />}
          note={detail.hidden > 0 ? i18n.t("session:toolDetail.hiddenMatches", { count: detail.hidden }) : undefined}
        />
      );
    case "json":
      return (
        <TraceOutput
          capped label={label} text={output}
          copyLabel={i18n.t("session:toolDetail.copyRaw")}
          content={<ToolJsonTree root={detail.root} />}
        />
      );
    case "text":
      return (
        <TraceOutput
          capped label={label} text={detail.text}
          copyText={detail.truncated ? output : undefined}
          note={detail.truncated ? i18n.t("session:toolDetail.outputPreview") : undefined}
        />
      );
  }
}

const styles = stylex.create({
  read: {
    alignItems: "baseline",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  remainingInput: { marginBlockStart: vars["--aui-space-4"] },
  location: {
    color: vars["--aui-color-info-text"],
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    textAlign: "start",
    textDecoration: "underline",
    whiteSpace: "normal",
  },
  matches: {
    display: "grid",
    gap: vars["--aui-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  muted: {
    color: vars["--aui-color-text-muted"],
  },
  jsonToggle: {
    cursor: "pointer",
  },
  jsonChildren: {
    paddingInlineStart: vars["--aui-space-12"],
  },
});
