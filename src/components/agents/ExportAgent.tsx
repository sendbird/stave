import { useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import {
  AGENT_EXPORT_FORMAT_LABELS,
  AGENT_EXPORT_FORMATS,
  exportAgentFile,
  type AgentExportFormat,
} from "@/lib/agents/export";
import type { AgentConfig } from "@/lib/agents/schema";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { agentStyles } from "./agents.styles";

type WriteState =
  | { step: "idle" }
  | { step: "confirm-replace"; revision: string }
  | { step: "busy" }
  | { step: "done"; path: string }
  | { step: "error"; message: string };

/**
 * Export: shows the file an agent becomes and its path, and writes it only
 * when the user presses Write — and, when a file is already there, only after
 * a second press that names it.
 */
export function ExportAgent(props: { agent: AgentConfig; rootPath: string | null }) {
  const [format, setFormat] = useState<AgentExportFormat>("claude-md");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WriteState>({ step: "idle" });
  const file = useMemo(() => exportAgentFile(props.agent, format), [props.agent, format]);
  const fs = typeof window === "undefined" ? undefined : window.api?.fs;
  const canWrite = Boolean(props.rootPath && fs?.readFile && fs?.createFile && fs?.writeFile);

  const write = async (expectedRevision: string | null) => {
    if (!props.rootPath || !fs?.readFile || !fs.createFile || !fs.writeFile) return;
    setState({ step: "busy" });
    const rootPath = props.rootPath;
    try {
      let revision = expectedRevision;
      if (revision === null) {
        const existing = await fs.readFile({ rootPath, filePath: file.path });
        if (existing.ok) {
          setState({ step: "confirm-replace", revision: existing.revision });
          return;
        }
        const created = await fs.createFile({ rootPath, filePath: file.path });
        if (!created.ok) throw new Error(created.stderr ?? "The file could not be created.");
        revision = created.revision ?? null;
      }
      const written = await fs.writeFile({ rootPath, filePath: file.path, content: file.content, expectedRevision: revision });
      if (!written.ok) {
        throw new Error(written.conflict ? "The file changed while exporting. Try again." : (written.stderr ?? "The file could not be written."));
      }
      setState({ step: "done", path: file.path });
    } catch (error) {
      setState({ step: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section aria-label="Export">
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>Export</h3>
        <span className={sx(styles.sectionAside)}>Use this agent outside Stave</span>
      </div>
      <div className={sx(agentStyles.assignRow)}>
        <Select
          size="sm"
          aria-label="Export as"
          value={format}
          options={AGENT_EXPORT_FORMATS.map((value) => ({ value, label: AGENT_EXPORT_FORMAT_LABELS[value] }))}
          onValueChange={(value) => {
            setFormat(String(value) as AgentExportFormat);
            setState({ step: "idle" });
          }}
        />
        <code className={sx(styles.hint)}>{file.path}</code>
        <Button size="sm" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide file" : "Show file"}
        </Button>
        {state.step === "confirm-replace" ? (
          <Button size="sm" variant="secondary" onClick={() => void write(state.revision)}>
            Replace {file.path}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={!canWrite || state.step === "busy"} onClick={() => void write(null)}>
            Write to repository
          </Button>
        )}
      </div>
      {open ? <pre className={sx(agentStyles.instructions)}>{file.content}</pre> : null}
      {file.leftOut.length ? (
        <p className={sx(styles.hint)}>Not in the file: {file.leftOut.join(", ")}.</p>
      ) : null}
      {!canWrite ? <p className={sx(styles.hint)}>Open a workspace to write the file.</p> : null}
      {state.step === "confirm-replace" ? (
        <p className={sx(styles.hint, styles.hintWarning)} role="status">
          {file.path} already exists. Replace it, or show the file and copy what you need.
        </p>
      ) : null}
      {state.step === "done" ? (
        <p className={sx(styles.hint)} role="status">
          Wrote {state.path}. Commit it to share the agent through the repository.
        </p>
      ) : null}
      {state.step === "error" ? (
        <p className={sx(styles.hint, styles.hintWarning)} role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
