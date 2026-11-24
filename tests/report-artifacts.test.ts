import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, realpath, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archiveReportArtifacts } from "../electron/host-service/supervision/report-artifacts";
import { reportFileArchiveRunKey, resolveArchivedReportFile } from "../electron/host-service/supervision/report-file-artifacts";
import { createInlineRenderStore } from "../electron/main/inline-render/inline-render-store";
import { savedHtmlReference, type ReportArtifact } from "../src/lib/agent-runs/artifacts";
import { REPORT_FILE_ARTIFACT_MAX_BYTES, isReportFileArtifactPath, isSavedReportFileArtifact } from "../src/lib/agent-runs/report-file-artifacts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "stave-report-artifact-")); roots.push(root);
  const workspacePath = path.join(root, "workspace"); await mkdir(workspacePath);
  const rootDir = () => path.join(root, "app-data");
  const store = createInlineRenderStore({ rootDir });
  const page = path.join(workspacePath, "report.html");
  await writeFile(page, '<!doctype html><link rel="stylesheet" href="style.css"><h1>Original</h1><img src="dot.svg"><script src="app.js"></script>');
  await writeFile(path.join(workspacePath, "style.css"), '@import "more.css"; h1{color:red;background-image:url(dot.svg)}');
  await writeFile(path.join(workspacePath, "more.css"), 'body{font-family:monospace}');
  await writeFile(path.join(workspacePath, "dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
  await writeFile(path.join(workspacePath, "app.js"), 'document.querySelector("h1").dataset.loaded="true";');
  const save = async (url = pathToFileURL(page).href, taskId = "task") => (await archiveReportArtifacts({ artifacts: [{ label: "Original", url, presentation: "component-render" }], workspacePath, agentRunId: "run", taskId, turnId: "turn", store })).artifacts;
  return { root, page, workspacePath, rootDir, store, save };
}

test("archives CSS imports, images and JS; immutable versions survive cleanup and store recreation", async () => {
  const f = await fixture();
  const [before] = await f.save();
  await writeFile(f.page, '<!doctype html><h1>Revised</h1>');
  const [after] = await f.save();
  expect(before!.url).not.toBe(after!.url);
  expect(before!.sourceUrl).toBe(pathToFileURL(f.page).href);
  await f.store.removeWorkspace("worktree:execution");
  await rm(f.workspacePath, { recursive: true });
  const restarted = createInlineRenderStore({ rootDir: f.rootDir });
  const saved = await restarted.read(savedHtmlReference(before!.url)!);
  expect(saved!.html).toContain("Original"); expect(saved!.html).toContain("data:image/svg+xml;base64,");
  expect(saved!.html).toContain("font-family:monospace"); expect(saved!.html).toContain(`data:text/javascript;base64,${Buffer.from('document.querySelector("h1").dataset.loaded="true";').toString("base64")}`);
  expect(saved!.html).not.toContain('href="style.css"'); expect(saved!.html).not.toContain('src="app.js"');
  expect((await restarted.read(savedHtmlReference(after!.url)!))!.html).toContain("Revised");
});

test("promotes a task's existing inline render beyond workspace cleanup, refuses another task", async () => {
  const f = await fixture();
  const inline = await f.store.publish({ workspaceId: "execution", taskId: "task", turnId: null, title: "Chart", html: "<h1>Chart</h1>" });
  // Use the same canonical URL builder as the existing preview.
  const { buildInlineRenderUrl } = await import("../src/lib/inline-render/inline-render");
  const input = buildInlineRenderUrl({ renderId: inline.renderId, networkPolicy: "blocked" });
  await expect(f.save(input, "other-task")).rejects.toThrow("does not belong");
  const [saved] = await f.save(input);
  await f.store.removeWorkspace("execution");
  expect(await f.store.read(inline.renderId)).toBeNull();
  expect((await f.store.read(savedHtmlReference(saved!.url)!))!.html).toContain("Chart");
});

for (const kind of ["missing", "symlink", "remote", "module", "oversize", "css-cycle"]) test(`refuses ${kind} dependency rather than recording a broken saved page`, async () => {
  const f = await fixture();
  if (kind === "missing") await rm(path.join(f.workspacePath, "app.js"));
  if (kind === "symlink") {
    await writeFile(path.join(f.root, "outside.js"), "private");
    await rm(path.join(f.workspacePath, "app.js"));
    await symlink(path.join(f.root, "outside.js"), path.join(f.workspacePath, "app.js"));
  }
  if (kind === "remote") await writeFile(f.page, '<img src="http://localhost:4567/test.png">');
  if (kind === "module") await writeFile(path.join(f.workspacePath, "app.js"), 'import "./other.js";');
  if (kind === "oversize") await writeFile(f.page, "a".repeat(3 * 1024 * 1024 + 1));
  if (kind === "css-cycle") await writeFile(path.join(f.workspacePath, "more.css"), '@import "style.css";');
  await expect(f.save()).rejects.toThrow();
});

test("leaves live HTTP links and existing artifact labels unchanged", async () => {
  const f = await fixture(); const url = "http://localhost:4321";
  const [link] = await f.save(url); expect(link!.url).toBe(url); expect(link!.label).toBe("Original");
});

test("persisted stage artifacts rebuild Tars reports and outputs with both saved versions after SQLite reopens", async () => {
  const { Database } = await import("bun:sqlite");
  const { AgentRunStore } = await import("../electron/persistence/agent-run-store");
  const { buildTarsSideViewFixtures } = await import("../src/dev/tars-preview/tars-side-fixtures");
  const { buildAgentRunReport } = await import("../src/lib/agent-runs/report");
  const { projectTarsReport } = await import("../src/lib/tars/report-model");
  const { buildTarsOutputs } = await import("../src/lib/tars/outputs-model");
  const f = await fixture();
  const first = (await f.save())[0]!;
  await writeFile(f.page, "<h1>Revised</h1>");
  const second = { ...(await f.save())[0]!, label: "Revised" };
  const fixtures = buildTarsSideViewFixtures(new Date("2026-11-05T00:00:00Z"));
  const detail = fixtures.runs["run-checkout"]!;
  const stage = detail.stages.at(-1)!;
  if (stage.report?.outcome !== "complete") throw new Error("missing fixture report");
  stage.report.artifacts = [first, second];
  const dbPath = path.join(f.root, "runs.sqlite");
  let db = new Database(dbPath);
  new AgentRunStore(db).create({ agentRun: detail.agentRun, upserts: detail.stages, events: [] }, new Date());
  db.close();
  await rm(f.workspacePath, { recursive: true });
  db = new Database(dbPath);
  try {
    const restored = new AgentRunStore(db).getAggregate(detail.agentRun.id)!;
    const report = buildAgentRunReport({ aggregate: restored, workspace: { branch: null, branchPushed: false, openPullRequest: null }, endedAt: new Date() });
    const run = { ...detail, ...restored, report };
    const reportLinks = projectTarsReport(fixtures.responsibilities[0]!, run).links;
    expect(reportLinks.map((link) => link.label)).toEqual(["Original", "Revised"]);
    expect(reportLinks[0]).toMatchObject({ sourceUrl: first.sourceUrl, presentation: "component-render", workspaceId: detail.agentRun.workspaceId });
    const outputs = buildTarsOutputs({ responsibilities: [fixtures.responsibilities[0]!], runs: { [detail.agentRun.id]: run } });
    expect(outputs.filter((output) => output.kind === "link").map((link) => link.url)).toEqual([first.url, second.url]);
  } finally { db.close(); }
});


test("existing inline renders with unresolved assets cannot masquerade as offline report copies", async () => {
  const f = await fixture();
  const { buildInlineRenderUrl } = await import("../src/lib/inline-render/inline-render");
  for (const html of ['<img src="http://localhost:4567/dot.png">', '<style>body{background:url(http://localhost:4567/dot.png)}</style>']) {
    const page = await f.store.publish({ workspaceId: "execution", taskId: "task", turnId: null, title: "Incomplete", html });
    await expect(f.save(buildInlineRenderUrl({ renderId: page.renderId, networkPolicy: "open" }))).rejects.toThrow("embed");
  }
});

for (const html of [
  '<script>const label="export csv"; const help="import this"; /* export {} */ const sample="<iframe src=example>";</script>',
  '<script type="application/json">{"export":"csv","import":"sample","html":"<iframe>"}</script>',
  '<img data-src="missing.png"><script data-src="missing.js">window.label="한글 export";</script><div data-style="url(missing.png)">텍스트</div>',
]) test("does not interpret strings, JSON, comments or data attributes as dependencies: " + html.slice(0, 45), async () => {
  const f = await fixture(); await writeFile(f.page, html);
  const [saved] = await f.save();
  expect((await f.store.read(savedHtmlReference(saved!.url)!))!.html).toContain(html.includes("한글") ? "한글" : html.includes("application/json") ? '"export":"csv"' : '"export csv"');
});

for (const html of ['<script>import("./missing.js")</script>', '<script type="module">const x=1;</script>', '<iframe src="nested.html"></iframe>', '<body background="old.png"></body>', '<style>div{background:image-set("dot.svg" 1x)}</style>', '<img src="/root.png">', '<link rel="stylesheet" href="https://example.invalid/app.css">']) test("refuses real unsupported dependency: " + html, async () => {
  const f = await fixture(); await writeFile(f.page, html);
  await expect(f.save()).rejects.toThrow(html.includes("/root.png") ? "Root-relative" : "standalone");
});

test("reuses identical source/content, retains changes, trusts stored provenance and rolls back only new entries", async () => {
  const f = await fixture();
  const input = { workspacePath: f.workspacePath, agentRunId: "run", taskId: "task", turnId: "turn", store: f.store };
  const original = (await f.save())[0]!;
  const repeated = await archiveReportArtifacts({ ...input, artifacts: [{ ...original, url: original.sourceUrl!, sourceUrl: "file:///forged.html" }], previousArtifacts: [original] });
  expect(repeated.artifacts[0]!.url).toBe(original.url);
  expect(repeated.artifacts[0]!.sourceUrl).toBe(original.sourceUrl);
  const promoted = await archiveReportArtifacts({ ...input, artifacts: [{ ...original, sourceUrl: "file:///forged.html" }], previousArtifacts: [original] });
  expect(promoted.artifacts[0]!.sourceUrl).toBe(original.sourceUrl);
  await writeFile(f.page, "<h1>수정본</h1>");
  const revised = await archiveReportArtifacts({ ...input, artifacts: [{ ...original, url: original.sourceUrl! }], previousArtifacts: [original] });
  expect(revised.artifacts[0]!.url).not.toBe(original.url);
  await revised.discard(); await repeated.discard();
  expect(await f.store.read(savedHtmlReference(revised.artifacts[0]!.url)!)).toBeNull();
  expect(await f.store.read(savedHtmlReference(original.url)!)).not.toBeNull();
});

test("input refuses forged host metadata and HTTP livePreview instead of silently discarding it", async () => {
  const { StageCompleteReportInputSchema } = await import("../src/lib/agent-runs/domain");
  for (const extra of [{ sourceUrl: "file:///forged.html" }, { savedAt: new Date().toISOString() }, { livePreview: { scriptId: "dev", url: "http://localhost:4567" } }]) {
    expect(StageCompleteReportInputSchema.safeParse({ summary: "Done", artifacts: [{ label: "Live", url: "http://localhost:4567", ...extra }] }).success).toBe(false);
  }
});

test("partial archive failure removes newly allocated entries but preserves saved originals", async () => {
  const f = await fixture(); const original = (await f.save())[0]!;
  const allocated: string[] = [];
  const store = { ...f.store, publish: async (input: Parameters<typeof f.store.publish>[0]) => { const reference = await f.store.publish(input); allocated.push(reference.renderId); return reference; } };
  await writeFile(f.page, "<h1>New version</h1>");
  await expect(archiveReportArtifacts({ artifacts: [{ label: "New", url: pathToFileURL(f.page).href }, { label: "Missing", url: pathToFileURL(path.join(f.workspacePath, "missing.html")).href }], workspacePath: f.workspacePath, agentRunId: "run", taskId: "task", turnId: "turn", store })).rejects.toThrow();
  expect(allocated).toHaveLength(1);
  expect(await store.read(allocated[0]!)).toBeNull();
  expect(await store.read(savedHtmlReference(original.url)!)).not.toBeNull();
});

test("a lead can archive a helper's local export within its workspace without access to helper inline renders", async () => {
  const f = await fixture();
  const helperPath = path.join(f.workspacePath, "helper-export.html");
  await writeFile(helperPath, "<h1>Helper export</h1>");
  const [saved] = await f.save(pathToFileURL(helperPath).href);
  expect((await f.store.read(savedHtmlReference(saved!.url)!))!.record.taskId).toBe("task");
  const inline = await f.store.publish({ workspaceId: "execution", taskId: "helper-task", turnId: null, title: "Helper", html: "<h1>Helper inline render</h1>" });
  const { buildInlineRenderUrl } = await import("../src/lib/inline-render/inline-render");
  await expect(f.save(buildInlineRenderUrl({ renderId: inline.renderId, networkPolicy: "blocked" }))).rejects.toThrow("does not belong");
});

test("frozen report retains earlier attempt versions and labels duplicate names with locale-aware version/time", async () => {
  const { buildTarsSideViewFixtures } = await import("../src/dev/tars-preview/tars-side-fixtures");
  const { buildAgentRunReport } = await import("../src/lib/agent-runs/report");
  const { applyRuntimeLocale } = await import("../src/i18n/runtime");
  const fixtures = buildTarsSideViewFixtures(new Date("2026-11-05T00:00:00Z"));
  const detail = fixtures.runs["run-checkout"]!;
  const stage = detail.stages.at(-1)!;
  if (stage.report?.outcome !== "complete") throw new Error("missing fixture report");
  const f = await fixture(); const original = (await f.save())[0]!;
  await writeFile(f.page, "<h1>Revised</h1>"); const revised = (await f.save())[0]!;
  // Only the prior attempt holds the original: freezing must not look at latest attempts alone.
  detail.stages.push({ ...stage, attempt: stage.attempt + 1, report: { ...stage.report, artifacts: [revised] } });
  stage.report.artifacts = [original];
  try {
    for (const locale of ["en", "ko"] as const) {
      applyRuntimeLocale(locale);
      const report = buildAgentRunReport({ aggregate: detail, workspace: { branch: null, branchPushed: false, openPullRequest: null }, endedAt: new Date() });
      const links = report.links.filter((link) => link.sourceUrl === original.sourceUrl);
      expect(links).toHaveLength(2);
      expect(links.map((link) => link.label)).toEqual([1, 2].map((version) => expect.stringContaining(locale === "en" ? `version ${version}` : `버전 ${version}`)));
      expect(links.every((link) => link.label.includes("2026") && link.savedAt)).toBe(true);
    }
  } finally { applyRuntimeLocale("en"); }
});

test("resolves imported CSS relative to its stylesheet while preserving media conditions and Unicode", async () => {
  const f = await fixture();
  await mkdir(path.join(f.workspacePath, "css"));
  await writeFile(f.page, '<link rel="stylesheet" href="css/theme.css" media="screen"><h1>한글</h1>');
  await writeFile(path.join(f.workspacePath, "css/theme.css"), '@import "../more.css" print; h1{background:url(../dot.svg)}');
  const [saved] = await f.save();
  const html = (await f.store.read(savedHtmlReference(saved!.url)!))!.html;
  expect(html).toContain('media="screen"');
  expect(html).toContain('@media print{body{font-family:monospace}}');
  expect(html).toContain('data:image/svg+xml;base64,');
  expect(html).toContain('한글');
});

test("preserves the quoting of embedded CSS data URLs", async () => {
  const f = await fixture();
  const image = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><text>한글</text></svg>')`;
  await writeFile(f.page, `<style>body{background-image:${image}}</style><h1>Saved image</h1>`);
  const [saved] = await f.save();
  const html = (await f.store.read(savedHtmlReference(saved!.url)!))!.html;
  expect(html).toContain(`background-image:${image}`);
});

describe("non-HTML file artifacts", () => {
  async function fileFixture() {
    const f = await fixture();
    const archiveRoot = path.join(f.root, "app-data", "report-files");
    const archive = (urls: string[], previousArtifacts?: ReportArtifact[]) => archiveReportArtifacts({
      artifacts: urls.map((url, index) => ({ label: `Proof ${index + 1}`, url, presentation: "capture" as const })),
      previousArtifacts, workspacePath: f.workspacePath, agentRunId: "run", taskId: "task", turnId: "turn", store: f.store, fileArchiveRoot: archiveRoot,
    });
    await mkdir(path.join(f.workspacePath, ".stave", "scratch", "lens"), { recursive: true });
    return { ...f, archiveRoot, archive };
  }

  test("copies a scratch screenshot into app data, so the report outlives the worktree", async () => {
    const f = await fileFixture();
    const screenshot = path.join(f.workspacePath, ".stave/scratch/lens/login.png");
    await writeFile(screenshot, "png-bytes");
    const sourceUrl = pathToFileURL(screenshot).href;
    const { artifacts } = await f.archive([sourceUrl]);
    const copy = artifacts[0]!;
    expect(copy.url).not.toBe(sourceUrl);
    expect(copy.sourceUrl).toBe(sourceUrl);
    expect(copy.savedAt).toBeDefined();
    expect(copy.presentation).toBe("capture");
    const copyPath = fileURLToPath(copy.url);
    expect(copyPath.startsWith(f.archiveRoot + path.sep)).toBe(true);
    expect(path.basename(copyPath)).toBe("login.png");
    await rm(f.workspacePath, { recursive: true });
    expect(await readFile(copyPath, "utf8")).toBe("png-bytes");
    expect(await resolveArchivedReportFile(copy.url, f.archiveRoot)).toBe(await realpath(copyPath));
    expect(isSavedReportFileArtifact(copy)).toBe(true);
  });

  test("reporting the same file again reuses its copy; a changed file gets a new one", async () => {
    const f = await fileFixture();
    const log = path.join(f.workspacePath, ".stave/scratch/tests.log");
    await writeFile(log, "ok 1\n");
    const first = (await f.archive([pathToFileURL(log).href])).artifacts[0]!;
    const again = await f.archive([pathToFileURL(log).href]);
    expect(again.artifacts[0]!.url).toBe(first.url);
    // A report that cites the saved copy itself keeps its recorded original.
    const cited = await f.archive([first.url], [first]);
    expect(cited.artifacts[0]).toMatchObject({ url: first.url, sourceUrl: first.sourceUrl, savedAt: first.savedAt });
    expect((await f.archive([first.url])).artifacts[0]!.sourceUrl).toBeUndefined();
    // Discarding a batch that only reused a copy never removes it.
    await again.discard();
    expect(await readFile(fileURLToPath(first.url), "utf8")).toBe("ok 1\n");
    await writeFile(log, "ok 1\nok 2\n");
    const changed = await f.archive([pathToFileURL(log).href]);
    expect(changed.artifacts[0]!.url).not.toBe(first.url);
    await changed.discard();
    expect(await resolveArchivedReportFile(changed.artifacts[0]!.url, f.archiveRoot)).toBeNull();
    expect(await resolveArchivedReportFile(first.url, f.archiveRoot)).not.toBeNull();
  });

  test("keeps the link when the file is too large, missing, outside the workspace or not a copied type", async () => {
    const f = await fileFixture();
    const large = path.join(f.workspacePath, ".stave/scratch/huge.json");
    await writeFile(large, Buffer.alloc(REPORT_FILE_ARTIFACT_MAX_BYTES + 1));
    const outside = path.join(f.root, "outside.txt");
    await writeFile(outside, "outside");
    const linked = path.join(f.workspacePath, ".stave/scratch/linked.txt");
    await symlink(outside, linked);
    const archive = path.join(f.workspacePath, "bundle.zip");
    await writeFile(archive, "zip");
    const urls = [
      pathToFileURL(large).href,
      pathToFileURL(path.join(f.workspacePath, ".stave/scratch/missing.png")).href,
      pathToFileURL(outside).href,
      pathToFileURL(linked).href,
      pathToFileURL(archive).href,
      "https://example.test/report.pdf",
    ];
    const { artifacts } = await f.archive(urls);
    expect(artifacts.map((artifact) => artifact.url)).toEqual(urls);
    expect(artifacts.every((artifact) => artifact.sourceUrl === undefined && artifact.savedAt === undefined)).toBe(true);
    expect(artifacts.some((artifact) => isSavedReportFileArtifact(artifact))).toBe(false);
  });

  test("a failed batch removes the copies it made", async () => {
    const f = await fileFixture();
    const pdf = path.join(f.workspacePath, ".stave/scratch/report.pdf");
    await writeFile(pdf, "%PDF-1.7");
    await writeFile(f.page, '<img src="missing.png">');
    await expect(f.archive([pathToFileURL(pdf).href, pathToFileURL(f.page).href])).rejects.toThrow();
    expect(await readdir(path.join(f.archiveRoot, reportFileArchiveRunKey("run")))).toEqual([]);
  });

  test("only files inside the archive open", async () => {
    const f = await fileFixture();
    await mkdir(f.archiveRoot, { recursive: true });
    const outside = path.join(f.root, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outside, path.join(f.archiveRoot, "escape.txt"));
    expect(await resolveArchivedReportFile(pathToFileURL(outside).href, f.archiveRoot)).toBeNull();
    expect(await resolveArchivedReportFile(pathToFileURL(path.join(f.archiveRoot, "escape.txt")).href, f.archiveRoot)).toBeNull();
    expect(await resolveArchivedReportFile(pathToFileURL(f.archiveRoot).href, f.archiveRoot)).toBeNull();
    expect(await resolveArchivedReportFile("https://example.test/a.png", f.archiveRoot)).toBeNull();
    expect(isReportFileArtifactPath("/a/b/shot.PNG")).toBe(true);
    expect(isReportFileArtifactPath("/a/b/bundle.zip")).toBe(false);
    expect(isSavedReportFileArtifact({ url: "file:///a.png" })).toBe(false);
  });
});
