import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import type { ProjectDetail } from "@/lib/projects/api";
import { integrationAcceptanceFailure, type ProjectTaskView, type ProjectIntegration } from "@/lib/projects/task-integration";
import { useProjectsStore } from "@/store/projects-store";

const STATUS = { "not-recorded": "Integration not recorded", pending: "Integration needs review", accepted: "Integration accepted by you", stale: "Integration review is outdated" };

export function ProjectTaskIntegration(props: { detail: ProjectDetail; busy: boolean; onOpen: (workspaceId: string, taskId: string) => void }) {
  const { detail } = props;
  const runCommand = useProjectsStore(state => state.runCommand);
  const tasks = detail.linkedTasks ?? [];
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [dependencies, setDependencies] = useState<string[]>([]);
  const writable = ["active", "paused"].includes(detail.project.state);
  const options = [...(detail.taskCandidates ?? []).filter(task => task.taskId !== detail.project.coordinator.taskId),
    ...tasks.filter(task => !(detail.taskCandidates ?? []).some(candidate => candidate.taskId === task.taskId))];
  const chosen = options.find(task => task.taskId === selected);
  const link = async () => {
    if (!chosen) return;
    const result = await runCommand("linkTask", { projectId: detail.project.id, taskId: chosen.taskId, workspaceId: chosen.workspaceId, dependsOn: dependencies });
    if (result.ok) { setEditing(false); setSelected(""); setDependencies([]); }
  };
  return <section className={sx(s.section)} aria-label="Linked tasks and integration">
    <div className={sx(s.header)}><h3 className={sx(s.heading)}>Linked tasks</h3>
      {writable ? <Button size="xs" variant="quiet" disabled={props.busy || !detail.integrationSnapshot} aria-expanded={editing} onClick={() => setEditing(!editing)}>Link a task</Button> : null}</div>
    <p className={sx(s.hint)}>Coordinate existing tasks and their dependencies. Linking keeps each task's execution and permissions unchanged.</p>
    {editing ? <div className={sx(s.form)}>
      <Select label="Task" value={selected || null} options={options.map(task => ({ value: task.taskId, label: "workspaceName" in task && task.workspaceName ? `${task.title} · ${task.workspaceName}` : task.title }))}
        placeholder="Choose a task from this repository" onValueChange={value => { const id = String(value ?? ""); setSelected(id); setDependencies(tasks.find(task => task.taskId === id)?.dependsOn ?? []); }} />
      <fieldset className={sx(s.dependencies)}><legend>Depends on</legend>{tasks.filter(task => task.taskId !== selected).map(task =>
        <Checkbox key={task.taskId} label={task.title} checked={dependencies.includes(task.taskId)} disabled={props.busy}
          onCheckedChange={checked => setDependencies(current => checked ? [...current, task.taskId] : current.filter(id => id !== task.taskId))} />)}</fieldset>
      <div className={sx(s.actions)}><Button size="sm" disabled={props.busy || !chosen} onClick={() => void link()}>{tasks.some(task => task.taskId === selected) ? "Save dependencies" : "Link task"}</Button>
        <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button></div>
    </div> : null}
    {!tasks.length ? <p className={sx(s.hint)}>No ordinary tasks linked. Missions below continue through their existing approval flow.</p> :
      <ul className={sx(s.list)}>{tasks.map(task => <li key={task.taskId} className={sx(s.row)}>
        <div className={sx(s.task)}><strong>{task.title}</strong><span className={sx(s.hint)}>{!task.available ? "Task missing" : task.archived ? "Archived" : task.running ? "Running" : task.outcome === "completed" ? "Run finished · integration still requires review" : task.outcome === "failed" ? "Last run failed" : "No confirmed run result"}</span>
          {task.dependsOn.length ? <span className={sx(s.hint)}>Depends on {task.dependsOn.map(id => tasks.find(candidate => candidate.taskId === id)?.title ?? id).join(", ")}</span> : null}</div>
        <div className={sx(s.actions)}><Button size="xs" variant="quiet" disabled={!task.available} onClick={() => props.onOpen(task.workspaceId, task.taskId)}>Open</Button>
          {writable ? <><Button size="xs" variant="quiet" disabled={props.busy} onClick={() => { setEditing(true); setSelected(task.taskId); setDependencies(task.dependsOn); }}>Dependencies</Button>
            <Button size="xs" variant="quiet" disabled={props.busy} onClick={() => void runCommand("unlinkTask", { projectId: detail.project.id, taskId: task.taskId })}>Unlink</Button></> : null}</div>
      </li>)}</ul>}
    {tasks.length ? <IntegrationReview key={`${detail.project.id}:${detail.project.integration?.recordedAt ?? "new"}`} detail={detail} tasks={tasks} busy={props.busy} writable={writable} /> : null}
  </section>;
}

function IntegrationReview(props: { detail: ProjectDetail; tasks: ProjectTaskView[]; busy: boolean; writable: boolean }) {
  const record = props.detail.project.integration;
  const [owner, setOwner] = useState(record?.ownerTaskId ?? "");
  const [summary, setSummary] = useState(record?.summary ?? "");
  const [criteriaText, setCriteriaText] = useState(record?.criteria.map(item => item.text).join("\n") ?? "");
  const [met, setMet] = useState<string[]>(record?.criteria.filter(item => item.status === "met").map(item => item.text) ?? []);
  const [evidenceRows, setEvidenceRows] = useState<ProjectIntegration["evidence"]>(record?.evidence.length ? record.evidence : [{ label: "", ref: "", source: "user" }]);
  const [snapshot, setSnapshot] = useState(props.detail.integrationSnapshot);
  const [begun, setBegun] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [unresolved, setUnresolved] = useState(record?.unresolved.join("\n") ?? "");
  const runCommand = useProjectsStore(state => state.runCommand);
  const lines = (value: string) => [...new Set(value.split("\n").map(line => line.trim()).filter(Boolean))];
  const criteria = lines(criteriaText).map(text => ({ text, status: met.includes(text) ? "met" as const : "unverified" as const }));
  const evidence = evidenceRows.filter(item => item.label.trim() && item.ref.trim()).map(item => ({ ...item, label: item.label.trim(), ref: item.ref.trim() }));
  const values = { ownerTaskId: owner, summary, criteria, evidence, unresolved: lines(unresolved) };
  const failure = integrationAcceptanceFailure(values, props.tasks, reviewed);
  const changed = snapshot !== props.detail.integrationSnapshot;
  const save = (accept: boolean) => void runCommand("recordIntegration", { projectId: props.detail.project.id, ...values, expectedSnapshot: snapshot!, accept, reviewed });
  const updateEvidence = (index: number, patch: Partial<ProjectIntegration["evidence"][number]>) => { setReviewed(false); setEvidenceRows(rows => rows.map((item, i) => i === index ? { ...item, ...patch, source: "user" } : item)); };
  return <div className={sx(s.form)}>
    <div className={sx(s.header)}><h3 className={sx(s.heading)}>Integration</h3><span role="status" className={sx(s.hint)}>{STATUS[props.detail.integrationStatus ?? "not-recorded"]}</span></div>
    {record ? <p className={sx(s.hint)}>{record.summary} · Owner: {props.tasks.find(task => task.taskId === record.ownerTaskId)?.title ?? "Task missing"}{record.acceptedAt ? ` · reviewed ${new Date(record.acceptedAt).toLocaleString()}` : ""}</p> : null}
    {record?.userReview ? <p className={sx(s.hint)}>User review recorded {new Date(record.userReview.reviewedAt).toLocaleString()}. Evidence sources remain separate.</p> : null}
    {props.tasks.some(task => task.workspaceFreshness === "unknown") ? <p className={sx(s.hint)}>Workspace file changes could not be verified. Your review covers task records and the evidence you provide.</p> : null}
    {record?.verificationScope === "task-metadata" ? <p className={sx(s.hint)}>Recorded scope: task records and your evidence; workspace file changes were not verified.</p> : null}
    <p className={sx(s.hint)}>Finished task runs do not accept the combined result. Record evidence and review it against the current work.</p>
    {props.writable ? <details onToggle={event => { if (event.currentTarget.open && !begun) { setBegun(true); setSnapshot(props.detail.integrationSnapshot); } }}><summary className={sx(s.toggle)}>Record or review integration</summary><div className={sx(s.form)}>
      <Select label="Integration owner" value={owner || null} options={props.tasks.map(task => ({ value: task.taskId, label: task.title, disabled: !task.available || task.archived }))} onValueChange={value => { setOwner(String(value ?? "")); setReviewed(false); }} />
      <Textarea label="Combined result" value={summary} maxLength={2000} onChange={event => { setSummary(event.target.value); setReviewed(false); }} />
      <Textarea label="Acceptance criteria (one per line)" value={criteriaText} onChange={event => { setCriteriaText(event.target.value); setReviewed(false); }} />
      {criteria.map(item => <Checkbox key={item.text} label={item.text} checked={met.includes(item.text)} onCheckedChange={checked => { setMet(current => checked ? [...current, item.text] : current.filter(text => text !== item.text)); setReviewed(false); }} />)}
      {evidenceRows.map((item, index) => <div className={sx(s.form)} key={index}>
        <TextField label={`Evidence ${index + 1}`} value={item.label} maxLength={500} placeholder="What the combined result demonstrates" onChange={event => updateEvidence(index, { label: event.target.value })} />
        <TextField label={`Evidence reference ${index + 1}`} value={item.ref} maxLength={2000} placeholder="Document, PR, test output or review reference" onChange={event => updateEvidence(index, { ref: event.target.value })} />
        <span className={sx(s.hint)}>Source: {item.source === "user" ? "User-provided evidence" : "Agent report"}</span>
        {evidenceRows.length > 1 ? <Button size="xs" variant="quiet" onClick={() => { setEvidenceRows(rows => rows.filter((_, i) => i !== index)); setReviewed(false); }}>Remove evidence {index + 1}</Button> : null}
      </div>)}
      <Button size="xs" variant="quiet" disabled={evidenceRows.length >= 50} onClick={() => { setEvidenceRows(rows => [...rows, { label: "", ref: "", source: "user" }]); setReviewed(false); }}>Add evidence</Button>
      <Checkbox label="I reviewed this evidence for the combined result" checked={reviewed} onCheckedChange={checked => setReviewed(Boolean(checked))} />
      <Textarea label="Unresolved items (one per line)" value={unresolved} onChange={event => { setUnresolved(event.target.value); setReviewed(false); }} />
      {failure ? <p className={sx(s.hint)}>{failure}</p> : null}
      {changed ? <div className={sx(s.form)}><p className={sx(s.hint)}>Linked work changed while this review was open. Check the current result before accepting.</p><Button size="sm" variant="secondary" onClick={() => { setSnapshot(props.detail.integrationSnapshot); setReviewed(false); }}>Review current work</Button></div> : null}
      <div className={sx(s.actions)}><Button size="sm" variant="secondary" disabled={props.busy || changed || !owner || !summary.trim() || !criteria.length} onClick={() => save(false)}>Save integration report</Button>
        <Button size="sm" disabled={props.busy || changed || !reviewed || !summary.trim() || Boolean(failure)} onClick={() => save(true)}>Accept combined result</Button></div>
    </div></details> : null}
  </div>;
}

const s = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"], minWidth: 0 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: vars["--ads-space-8"] },
  heading: { margin: 0, fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-semibold"] },
  hint: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"], overflowWrap: "anywhere" },
  form: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0, paddingBlock: vars["--ads-space-8"] },
  list: { listStyle: "none", margin: 0, padding: 0, maxHeight: "20rem", overflowY: "auto", scrollbarGutter: "stable" },
  row: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--ads-space-8"], paddingBlock: vars["--ads-space-8"], borderBottom: `1px solid ${vars["--ads-color-border-subtle"]}` },
  task: { display: "flex", flexDirection: "column", flex: "1 1 16rem", gap: vars["--ads-space-4"], minWidth: 0, overflowWrap: "anywhere", fontSize: vars["--ads-font-size-body"] },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-4"] },
  dependencies: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], border: "none", padding: 0, fontSize: vars["--ads-font-size-caption"] },
  toggle: { cursor: "pointer", fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"], ':focus-visible': { outline: `2px solid ${vars["--ads-color-border-focus"]}`, outlineOffset: 2 } },
});
