import type { ReportArtifact } from "../../../src/lib/agent-runs/artifacts";
import { buildInlineRenderUrl } from "../../../src/lib/inline-render/inline-render";
import { savedHtmlReference } from "../../../src/lib/agent-runs/artifacts";
import type { InlineRenderStore } from "../../main/inline-render/inline-render-store";
import { assertSelfContainedHtml, bundleHtmlArtifact } from "../../main/inline-render/html-artifact-bundle";

export interface ArchivedReportArtifacts {
  artifacts: ReportArtifact[];
  /** Only entries allocated by this batch; existing originals are never removed. */
  discard: () => Promise<void>;
}

/** Archive before recording; reuse identical source/content within this run. */
export async function archiveReportArtifacts(args: {
  artifacts: ReportArtifact[];
  previousArtifacts?: ReportArtifact[];
  workspacePath: string | null;
  agentRunId: string;
  taskId: string;
  turnId: string;
  store: InlineRenderStore;
}): Promise<ArchivedReportArtifacts> {
  const artifacts: ReportArtifact[] = [];
  const allocated: string[] = [];
  const discard = async () => { await Promise.all(allocated.map((id) => args.store.remove(id))); };
  try {
    for (const artifact of args.artifacts) {
      const renderId = savedHtmlReference(artifact.url);
      let html: string;
      let sourceUrl = artifact.url;
      if (renderId) {
        const page = await args.store.read(renderId);
        if (!page || page.record.taskId !== args.taskId) throw new Error("The saved HTML does not belong to this task or is missing.");
        html = page.html;
        sourceUrl = page.record.sourceUrl ?? artifact.url;
        assertSelfContainedHtml(html);
      } else if (new URL(artifact.url).protocol === "file:" && /\.html?$/i.test(new URL(artifact.url).pathname)) {
        if (!args.workspacePath) throw new Error("The HTML source workspace is unavailable.");
        html = await bundleHtmlArtifact({ workspacePath: args.workspacePath, fileUrl: artifact.url });
      } else {
        if (artifact.livePreview) throw new Error("livePreview requires a saved or local HTML artifact.");
        const { sourceUrl: _source, savedAt: _time, ...input } = artifact;
        artifacts.push(input);
        continue;
      }
      let reused: ReportArtifact | undefined;
      for (const previous of [...(args.previousArtifacts ?? []), ...artifacts]) {
        const id = savedHtmlReference(previous.url);
        if (!id) continue;
        const saved = await args.store.read(id);
        if (saved?.record.taskId === args.taskId && saved.record.sourceUrl === sourceUrl && saved.html === html) {
          reused = { ...artifact, url: previous.url, sourceUrl, savedAt: saved.record.createdAt };
          break;
        }
      }
      if (reused) { artifacts.push(reused); continue; }
      const reference = await args.store.publish({
        // Workspace cleanup cannot select the report's retention key.
        workspaceId: `report:${args.agentRunId}`, taskId: args.taskId, turnId: args.turnId,
        html, title: artifact.label, sourceUrl,
      });
      allocated.push(reference.renderId);
      const record = await args.store.describe(reference.renderId);
      artifacts.push({ ...artifact, sourceUrl, savedAt: record!.createdAt,
        url: buildInlineRenderUrl({ renderId: reference.renderId, networkPolicy: "blocked" }) });
    }
    return { artifacts, discard };
  } catch (error) { await discard(); throw error; }
}
