import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
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
        if (!created.ok) throw new Error(created.stderr ?? i18n.t("agents:exportAgent.extraCopy34"));
        revision = created.revision ?? null;
      }
      const written = await fs.writeFile({ rootPath, filePath: file.path, content: file.content, expectedRevision: revision });
      if (!written.ok) {
        throw new Error(written.conflict ? i18n.t("agents:exportAgent.extraCopy35") : (written.stderr ?? i18n.t("agents:exportAgent.extraCopy36")));
      }
      setState({ step: "done", path: file.path });
    } catch (error) {
      setState({ step: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section aria-label={i18n.t("agents:exportAgent.ariaLabel")}>
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>{i18n.t("agents:exportAgent.exportAgent")}</h3>
        <span className={sx(styles.sectionAside)}>{i18n.t("agents:exportAgent.exportAgent2")}</span>
      </div>
      <div className={sx(agentStyles.assignRow)}>
        <Select
          size="sm"
          aria-label={i18n.t("agents:exportAgent.ariaLabel2")}
          value={format}
          options={AGENT_EXPORT_FORMATS.map((value) => ({ value, label: AGENT_EXPORT_FORMAT_LABELS[value] }))}
          onValueChange={(value) => {
            setFormat(String(value) as AgentExportFormat);
            setState({ step: "idle" });
          }}
        />
        <code className={sx(styles.hint)}>{file.path}</code>
        <Button size="sm" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? i18n.t("agents:exportAgent.exportAgent3") : i18n.t("agents:exportAgent.exportAgent4")}
        </Button>
        {state.step === "confirm-replace" ? (
          <Button size="sm" variant="secondary" onClick={() => void write(state.revision)}>{i18n.t("agents:exportAgent.sentence17", { value1: file.path })}</Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={!canWrite || state.step === "busy"} onClick={() => void write(null)}>
            {i18n.t("agents:exportAgent.exportAgent6")}</Button>
        )}
      </div>
      {open ? <pre className={sx(agentStyles.instructions)}>{file.content}</pre> : null}
      {file.leftOut.length ? (
        <p className={sx(styles.hint)}>{i18n.t("agents:exportAgent.sentence18", { value1: file.leftOut.join(", ") })}</p>
      ) : null}
      {!canWrite ? <p className={sx(styles.hint)}>{i18n.t("agents:exportAgent.exportAgent8")}</p> : null}
      {state.step === "confirm-replace" ? (
        <p className={sx(styles.hint, styles.hintWarning)} role="status">{i18n.t("agents:exportAgent.sentence19", { value1: file.path })}</p>
      ) : null}
      {state.step === "done" ? (
        <p className={sx(styles.hint)} role="status">{i18n.t("agents:exportAgent.sentence20", { value1: state.path })}</p>
      ) : null}
      {state.step === "error" ? (
        <p className={sx(styles.hint, styles.hintWarning)} role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
