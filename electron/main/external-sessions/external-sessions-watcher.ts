import path from "node:path";
import {
  countRunningExternalWork,
  EXTERNAL_SESSIONS_OFF_SNAPSHOT,
  type ExternalAgent,
  type ExternalSession,
  type ExternalSessionsMode,
  type ExternalSessionsSnapshot,
  type ExternalSessionSource,
} from "../../../src/lib/external-sessions/external-sessions";
import { ClaudeTranscriptState, deriveAgentStatus, parseClaudeAgentMeta, type ClaudeAgentMeta } from "./claude-transcript";
import { CodexRolloutState, STAVE_CODEX_ORIGINATOR, type CodexSubagentInfo } from "./codex-rollout";
import { nodeExternalSessionsFs, type ExternalSessionsFs } from "./fs-port";
import { readEndLines, readHeadLines, TranscriptTail } from "./transcript-tail";

/**
 * Watches the transcripts Claude Code and Codex write for sessions Stave did
 * not start. Read-only: it never writes, moves or deletes anything there, and
 * keeps what it learns in memory only.
 *
 * - `count` mode (the badge): a 10 s folder scan; a changed candidate's last
 *   64 KB is read once to tell whether it is still working. No file is followed.
 * - `live` mode (the Activity page is open): recursive `fs.watch` with a short
 *   debounce, a 2 s poll of known files and the 10 s scan; transcripts are
 *   followed from their last 2 MB onward.
 * - no mode: nothing runs and every cached state is dropped.
 */

export interface ExternalSessionCandidate {
  source: ExternalSessionSource;
  id: string;
}

export interface ExternalSessionsWatcherOptions {
  fs?: ExternalSessionsFs;
  /** Claude Code configuration folders (each holds `projects/`). */
  claudeConfigDirs: () => readonly string[];
  /** Codex homes (each holds `sessions/`). */
  codexHomes: () => readonly string[];
  /** The subset of `candidates` Stave started (stored native session ids). */
  ownedSessionIds: (candidates: readonly ExternalSessionCandidate[]) => ReadonlySet<string> | Promise<ReadonlySet<string>>;
  onChange: (snapshot: ExternalSessionsSnapshot) => void;
  now?: () => number;
  /** false: no intervals or fs.watch (tests call `scan`/`poll`/`publishNow`). */
  timers?: boolean;
}

export const EXTERNAL_SESSION_LIMITS = {
  activeMs: 30 * 60_000,
  idleMs: 5 * 60_000,
  lookbackMs: 6 * 60 * 60_000,
  maxSessions: 30,
  maxAgents: 12,
  codexDays: 7,
  pollMs: 2_000,
  scanMs: 10_000,
  sweepMs: 5 * 60_000,
  watchDebounceMs: 120,
  scanDebounceMs: 250,
  publishMs: 250,
  ownershipRecheckMs: 60_000,
  peekBytes: 64 * 1024,
  claudeHeadBytes: 256 * 1024,
  codexHeadBytes: 512 * 1024,
  metaBytes: 64 * 1024,
  /** Sub-agents are many and short: their first read takes less of the end than a session's 2 MB. */
  agentFirstBytes: 512 * 1024,
} as const;

const CLAUDE_SESSION_FILE = /^([0-9a-f][0-9a-f-]{7,})\.jsonl$/i;
const CLAUDE_AGENT_FILE = /^agent-([\w-]{1,120})\.jsonl$/;
const CODEX_ROLLOUT_FILE = /^rollout-.+\.jsonl$/;

interface FileFacts {
  file: string;
  mtimeMs: number;
  size: number;
}

interface AgentEntry extends FileFacts {
  id: string;
  metaFile: string;
  meta: ClaudeAgentMeta;
  metaRead: boolean;
  state: ClaudeTranscriptState;
  tail?: TranscriptTail;
  readMtimeMs: number;
}

interface ClaudeEntry extends FileFacts {
  source: "claude-code";
  id: string;
  agentsDir: string;
  state: ClaudeTranscriptState;
  tail?: TranscriptTail;
  headRead: boolean;
  readMtimeMs: number;
  agents: Map<string, AgentEntry>;
}

interface CodexEntry extends FileFacts {
  source: "codex";
  /** Known after the head read. */
  id?: string;
  originator?: string;
  /** Set on a sub-agent's own rollout. */
  subagent?: CodexSubagentInfo;
  /** Sub-agent rollouts shown under this session; refilled every scan. */
  children: CodexEntry[];
  state: CodexRolloutState;
  tail?: TranscriptTail;
  headRead: boolean;
  readMtimeMs: number;
}

type SessionEntry = ClaudeEntry | CodexEntry;

export class ExternalSessionsWatcher {
  private readonly fs: ExternalSessionsFs;
  private mode: ExternalSessionsMode | null = null;
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly fileMtimes = new Map<string, number>();
  private readonly listings = new Map<string, { mtimeMs: number; names: string[] }>();
  private readonly owned = new Set<string>();
  private readonly notOwnedCheckedAt = new Map<string, number>();
  /** A rollout's first line, read once per file: its id and who started it. */
  private readonly codexHeads = new Map<string, Pick<CodexRolloutState, "id" | "originator" | "cwd" | "branch" | "startedAt" | "title" | "subagent">>();
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private readonly watchers: { close(): void }[] = [];
  private pollSoon: ReturnType<typeof setTimeout> | undefined;
  private scanSoon: ReturnType<typeof setTimeout> | undefined;
  private publishTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPublishAt = 0;
  private lastKey = "";
  private current: ExternalSessionsSnapshot = EXTERNAL_SESSIONS_OFF_SNAPSHOT;
  private sweptAt = Number.NEGATIVE_INFINITY;
  private scanning: Promise<void> | null = null;
  private rescan = false;
  private polling: Promise<void> | null = null;
  /** Bumped on every mode change, so a pass started under an old mode drops its result. */
  private generation = 0;

  constructor(private readonly options: ExternalSessionsWatcherOptions) {
    this.fs = options.fs ?? nodeExternalSessionsFs;
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  get activeMode() {
    return this.mode;
  }

  snapshot(): ExternalSessionsSnapshot {
    return this.current;
  }

  setMode(mode: ExternalSessionsMode | null) {
    if (mode === this.mode) return;
    const previous = this.mode;
    this.generation += 1;
    this.stopTimers();
    if (mode === null) {
      this.mode = null;
      this.sessions.clear();
      this.fileMtimes.clear();
      this.listings.clear();
      this.owned.clear();
      this.notOwnedCheckedAt.clear();
      this.codexHeads.clear();
      this.sweptAt = Number.NEGATIVE_INFINITY;
      this.lastKey = "";
      this.current = EXTERNAL_SESSIONS_OFF_SNAPSHOT;
      this.options.onChange(this.current);
      return;
    }
    this.mode = mode;
    if (previous !== null) {
      // The two modes read differently (a 64 KB peek vs. a followed tail):
      // start every transcript over in the new way.
      for (const entry of this.flat()) resetEntry(entry);
    }
    if (this.options.timers !== false) this.startTimers(mode);
    void this.scan();
  }

  dispose() {
    this.setMode(null);
  }

  private startTimers(mode: ExternalSessionsMode) {
    const scan = setInterval(() => void this.scan(), EXTERNAL_SESSION_LIMITS.scanMs);
    scan.unref?.();
    this.timers.push(scan);
    if (mode !== "live") return;
    const poll = setInterval(() => void this.poll(), EXTERNAL_SESSION_LIMITS.pollMs);
    poll.unref?.();
    this.timers.push(poll);
  }

  private stopTimers() {
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    for (const watcher of this.watchers.splice(0)) {
      try {
        watcher.close();
      } catch {
        // already closed
      }
    }
    clearTimeout(this.pollSoon);
    clearTimeout(this.scanSoon);
    clearTimeout(this.publishTimer);
    this.pollSoon = this.scanSoon = this.publishTimer = undefined;
  }

  private ensureWatchers() {
    if (this.mode !== "live" || this.options.timers === false || this.watchers.length > 0) return;
    const roots = [
      ...this.options.claudeConfigDirs().map((dir) => path.join(dir, "projects")),
      ...this.options.codexHomes().map((dir) => path.join(dir, "sessions")),
    ];
    for (const root of new Set(roots)) {
      const watcher = this.fs.watch(root, (relative) => this.onFileEvent(path.join(root, relative)));
      if (watcher) this.watchers.push(watcher);
    }
  }

  private onFileEvent(file: string) {
    if (!file.endsWith(".jsonl") || this.mode !== "live") return;
    if (!this.knows(file) && !this.scanSoon) {
      this.scanSoon = setTimeout(() => {
        this.scanSoon = undefined;
        void this.scan();
      }, EXTERNAL_SESSION_LIMITS.scanDebounceMs);
      this.scanSoon.unref?.();
    }
    clearTimeout(this.pollSoon);
    this.pollSoon = setTimeout(() => void this.poll(), EXTERNAL_SESSION_LIMITS.watchDebounceMs);
    this.pollSoon.unref?.();
  }

  /** Every followed transcript: the sessions, then the Codex sub-agents nested under them. */
  private flat(): SessionEntry[] {
    const out: SessionEntry[] = [];
    for (const entry of this.sessions.values()) {
      out.push(entry);
      if (entry.source === "codex") out.push(...entry.children);
    }
    return out;
  }

  private knows(file: string) {
    for (const entry of this.flat()) {
      if (entry.file === file) return true;
      if (entry.source === "claude-code") for (const agent of entry.agents.values()) if (agent.file === file) return true;
    }
    return false;
  }

  /** Find sessions written lately; one pass at a time (a request during one runs once more after it). */
  scan(): Promise<void> {
    if (this.mode === null) return Promise.resolve();
    if (this.scanning) {
      this.rescan = true;
      return this.scanning;
    }
    const run = (async () => {
      try {
        do {
          this.rescan = false;
          await this.scanOnce();
        } while (this.rescan && this.mode !== null);
      } catch {
        // A failed pass leaves the last picture; the next one tries again.
      } finally {
        this.scanning = null;
      }
    })();
    this.scanning = run;
    return run;
  }

  private async scanOnce() {
    const generation = this.generation;
    const now = this.now();
    this.ensureWatchers();
    const sweep = now - this.sweptAt >= EXTERNAL_SESSION_LIMITS.sweepMs;
    if (sweep) this.sweptAt = now;
    const found: SessionEntry[] = [];
    for (const dir of new Set(this.options.claudeConfigDirs())) found.push(...(await this.findClaude(dir, now, sweep)));
    for (const home of new Set(this.options.codexHomes())) found.push(...(await this.findCodex(home, now, sweep)));
    if (generation !== this.generation) return;

    // Codex names its originator in the first line: read it before deciding.
    for (const entry of found) if (entry.source === "codex" && !entry.headRead) await this.readCodexHead(entry);
    const isStaveRollout = (entry: SessionEntry) => entry.source === "codex" && entry.originator === STAVE_CODEX_ORIGINATOR;
    const staveParents = new Set(found.filter((entry) => isStaveRollout(entry) && sessionId(entry)).map((entry) => sessionId(entry)!));
    const candidates = found.filter((entry) => sessionId(entry) && !isStaveRollout(entry));
    // A sub-agent's parent may be one Stave owns without being in `found`: ask about it too.
    const parentIds = candidates.flatMap((entry) => (entry.source === "codex" && entry.subagent?.parentId ? [entry.subagent.parentId] : []));
    await this.resolveOwnership([
      ...candidates.map((entry) => ({ source: entry.source, id: sessionId(entry)! })),
      ...parentIds.map((id) => ({ source: "codex" as const, id })),
    ], now);
    if (generation !== this.generation) return;

    const visible = candidates.filter((entry) => {
      if (this.owned.has(sessionId(entry)!)) return false;
      if (entry.source !== "codex" || !entry.subagent) return true;
      // Internal reviews are never shown; a sub-agent of a Stave-owned parent stays with Stave.
      if (entry.subagent.kind === "internal") return false;
      const parentId = entry.subagent.parentId;
      return !parentId || !(staveParents.has(parentId) || this.owned.has(parentId));
    });
    const isChild = (entry: SessionEntry): entry is CodexEntry => entry.source === "codex" && entry.subagent?.kind === "thread_spawn";
    const byRecent = (a: SessionEntry, b: SessionEntry) => b.mtimeMs - a.mtimeMs;
    const kept = new Map<string, SessionEntry>();
    for (const entry of visible.filter((candidate) => !isChild(candidate)).sort(byRecent)) {
      const key = `${entry.source}:${sessionId(entry)}`;
      if (kept.has(key)) continue;
      kept.set(key, entry);
      if (kept.size >= EXTERNAL_SESSION_LIMITS.maxSessions) break;
    }
    for (const entry of kept.values()) if (entry.source === "codex") entry.children = [];
    // A sub-agent nests under its parent when that is listed; otherwise it stands alone.
    const children = new Set<string>();
    for (const entry of visible.filter(isChild).sort(byRecent)) {
      const parent = kept.get(`codex:${entry.subagent!.parentId}`);
      if (parent?.source === "codex" && !children.has(entry.file)) {
        children.add(entry.file);
        parent.children.push(entry);
        continue;
      }
      const key = `codex:${sessionId(entry)}`;
      if (kept.size >= EXTERNAL_SESSION_LIMITS.maxSessions || kept.has(key)) continue;
      entry.children = [];
      kept.set(key, entry);
    }
    this.sessions.clear();
    for (const [key, entry] of kept) this.sessions.set(key, entry);
    for (const entry of this.sessions.values()) if (entry.source === "claude-code") await this.scanAgents(entry, now);
    if (generation !== this.generation) return;
    if (this.mode === "count") await this.peekChanged();
    else await this.pollOnce();
    if (generation !== this.generation) return;
    this.schedulePublish();
  }

  private async listCached(dir: string) {
    const info = await this.fs.stat(dir);
    if (!info?.isDirectory) {
      this.listings.delete(dir);
      return { names: [] as string[], changed: false };
    }
    const known = this.listings.get(dir);
    if (known && known.mtimeMs === info.mtimeMs) return { names: known.names, changed: false };
    const names = await this.fs.list(dir);
    this.listings.set(dir, { mtimeMs: info.mtimeMs, names });
    return { names, changed: true };
  }

  /** A file's facts; files last seen older than the lookback are re-read only when their folder changed or on a sweep. */
  private async facts(file: string, now: number, force: boolean): Promise<FileFacts | null> {
    const known = this.fileMtimes.get(file);
    if (known !== undefined && !force && now - known > EXTERNAL_SESSION_LIMITS.lookbackMs) return null;
    const info = await this.fs.stat(file);
    if (!info || info.isDirectory) {
      this.fileMtimes.delete(file);
      return null;
    }
    this.fileMtimes.set(file, info.mtimeMs);
    return { file, mtimeMs: info.mtimeMs, size: info.size };
  }

  private async findClaude(configDir: string, now: number, sweep: boolean): Promise<ClaudeEntry[]> {
    const projects = path.join(configDir, "projects");
    const out: ClaudeEntry[] = [];
    for (const folder of (await this.listCached(projects)).names) {
      const folderDir = path.join(projects, folder);
      const { names, changed } = await this.listCached(folderDir);
      for (const name of names) {
        const id = CLAUDE_SESSION_FILE.exec(name)?.[1];
        if (!id) continue;
        const facts = await this.facts(path.join(folderDir, name), now, changed || sweep);
        if (!facts || now - facts.mtimeMs > EXTERNAL_SESSION_LIMITS.lookbackMs) continue;
        const agentsDir = path.join(folderDir, id, "subagents");
        const recent = now - facts.mtimeMs <= EXTERNAL_SESSION_LIMITS.activeMs || (await this.agentWrittenSince(agentsDir, now - EXTERNAL_SESSION_LIMITS.activeMs));
        if (!recent) continue;
        const existing = this.sessions.get(`claude-code:${id}`);
        if (existing?.source === "claude-code" && existing.file === facts.file) {
          existing.mtimeMs = facts.mtimeMs;
          existing.size = facts.size;
          out.push(existing);
        } else {
          out.push({ source: "claude-code", id, ...facts, agentsDir, state: new ClaudeTranscriptState(), headRead: false, readMtimeMs: -1, agents: new Map() });
        }
      }
    }
    return out;
  }

  private async agentWrittenSince(agentsDir: string, since: number) {
    for (const name of (await this.listCached(agentsDir)).names) {
      if (!CLAUDE_AGENT_FILE.test(name)) continue;
      const info = await this.fs.stat(path.join(agentsDir, name));
      if (info && info.mtimeMs >= since) return true;
    }
    return false;
  }

  private async findCodex(home: string, now: number, sweep: boolean): Promise<CodexEntry[]> {
    const out: CodexEntry[] = [];
    const known = new Map<string, CodexEntry>();
    for (const entry of this.flat()) if (entry.source === "codex") known.set(entry.file, entry);
    for (const dir of codexDayDirs(home, now)) {
      const { names, changed } = await this.listCached(dir);
      for (const name of names) {
        if (!CODEX_ROLLOUT_FILE.test(name)) continue;
        const facts = await this.facts(path.join(dir, name), now, changed || sweep);
        if (!facts || now - facts.mtimeMs > EXTERNAL_SESSION_LIMITS.activeMs) continue;
        const existing = known.get(facts.file);
        if (existing) {
          existing.mtimeMs = facts.mtimeMs;
          existing.size = facts.size;
          out.push(existing);
        } else {
          out.push({ source: "codex", ...facts, state: new CodexRolloutState(), headRead: false, readMtimeMs: -1, children: [] });
        }
      }
    }
    return out;
  }

  private async readCodexHead(entry: CodexEntry) {
    entry.headRead = true;
    let head = this.codexHeads.get(entry.file);
    if (!head) {
      const state = new CodexRolloutState();
      state.feed(await readHeadLines(this.fs, entry.file, EXTERNAL_SESSION_LIMITS.codexHeadBytes));
      head = { id: state.id, originator: state.originator, cwd: state.cwd, branch: state.branch, startedAt: state.startedAt, title: state.title, subagent: state.subagent };
      this.codexHeads.set(entry.file, head);
    }
    entry.id = head.id;
    entry.originator = head.originator;
    entry.subagent = head.subagent;
    entry.state.cwd ??= head.cwd;
    entry.state.branch ??= head.branch;
    entry.state.startedAt ??= head.startedAt;
    entry.state.title ??= head.title;
  }

  private async resolveOwnership(candidates: readonly ExternalSessionCandidate[], now: number) {
    const unresolved: ExternalSessionCandidate[] = [];
    const asked = new Set<string>();
    for (const { source, id } of candidates) {
      if (this.owned.has(id) || asked.has(id)) continue;
      const checkedAt = this.notOwnedCheckedAt.get(id);
      if (checkedAt !== undefined && now - checkedAt < EXTERNAL_SESSION_LIMITS.ownershipRecheckMs) continue;
      asked.add(id);
      unresolved.push({ source, id });
    }
    if (unresolved.length === 0) return;
    try {
      const owned = await this.options.ownedSessionIds(unresolved);
      for (const candidate of unresolved) {
        if (owned.has(candidate.id)) {
          this.owned.add(candidate.id);
          this.notOwnedCheckedAt.delete(candidate.id);
        } else {
          this.notOwnedCheckedAt.set(candidate.id, now);
        }
      }
    } catch {
      // Unknown this time: asked again next pass instead of being cached.
    }
  }

  private async scanAgents(entry: ClaudeEntry, now: number) {
    const seen = new Set<string>();
    for (const name of (await this.listCached(entry.agentsDir)).names) {
      const id = CLAUDE_AGENT_FILE.exec(name)?.[1];
      if (!id) continue;
      const file = path.join(entry.agentsDir, name);
      const info = await this.fs.stat(file);
      if (!info) continue;
      // Older than the active window means quiet for well over the idle
      // threshold, so it cannot be running: not shown, not read.
      if (now - info.mtimeMs > EXTERNAL_SESSION_LIMITS.activeMs) continue;
      const known = entry.agents.get(id);
      seen.add(id);
      if (known) {
        known.mtimeMs = info.mtimeMs;
        known.size = info.size;
      } else {
        entry.agents.set(id, { id, file, metaFile: path.join(entry.agentsDir, `agent-${id}.meta.json`), meta: {}, metaRead: false,
          state: new ClaudeTranscriptState(), mtimeMs: info.mtimeMs, size: info.size, readMtimeMs: -1 });
      }
    }
    for (const id of [...entry.agents.keys()]) if (!seen.has(id)) entry.agents.delete(id);
    for (const agent of entry.agents.values()) {
      // Claude Code marks the side file finished once, at the end: read it
      // first, and again only while the agent is quiet and not yet marked.
      const quiet = now - agent.mtimeMs > EXTERNAL_SESSION_LIMITS.idleMs;
      if (!agent.metaRead || (quiet && !agent.meta.finished)) {
        agent.metaRead = true;
        const raw = await this.fs.readRange(agent.metaFile, 0, EXTERNAL_SESSION_LIMITS.metaBytes);
        if (raw.length > 0 && raw.length < EXTERNAL_SESSION_LIMITS.metaBytes) agent.meta = parseClaudeAgentMeta(raw.toString("utf8"));
      }
    }
  }

  /** Count mode: a changed transcript's last 64 KB, read afresh. Nothing is followed. */
  private async peekChanged() {
    const peekBytes = EXTERNAL_SESSION_LIMITS.peekBytes;
    for (const entry of this.flat()) {
      if (entry.readMtimeMs !== entry.mtimeMs) {
        entry.readMtimeMs = entry.mtimeMs;
        if (entry.source === "claude-code") {
          entry.state = new ClaudeTranscriptState();
          entry.state.feed(await readEndLines(this.fs, entry.file, entry.size, peekBytes));
        } else {
          const head = entry.state;
          entry.state = new CodexRolloutState();
          entry.state.feed(await readEndLines(this.fs, entry.file, entry.size, peekBytes));
          entry.state.cwd ??= head.cwd;
        }
      }
      if (entry.source !== "claude-code") continue;
      for (const agent of entry.agents.values()) {
        if (agent.readMtimeMs === agent.mtimeMs) continue;
        agent.readMtimeMs = agent.mtimeMs;
        agent.state = new ClaudeTranscriptState();
        agent.state.feed(await readEndLines(this.fs, agent.file, agent.size, peekBytes));
      }
    }
  }

  /** Live mode: read what every known transcript added since the last read. */
  poll(): Promise<void> {
    if (this.mode !== "live") return Promise.resolve();
    if (this.polling) return this.polling;
    const run = (async () => {
      try {
        await this.pollOnce();
        this.schedulePublish();
      } catch {
        // Next poll tries again.
      } finally {
        this.polling = null;
      }
    })();
    this.polling = run;
    return run;
  }

  private async pollOnce() {
    if (this.mode !== "live") return;
    for (const entry of this.flat()) {
      if (entry.source === "claude-code") {
        if (!entry.headRead) {
          entry.headRead = true;
          const head = new ClaudeTranscriptState();
          head.feed(await readHeadLines(this.fs, entry.file, EXTERNAL_SESSION_LIMITS.claudeHeadBytes));
          entry.state.firstPrompt ??= head.firstPrompt;
          entry.state.startedAt = minDefined(entry.state.startedAt, head.startedAt);
          entry.state.cwd ??= head.cwd;
        }
        entry.tail ??= new TranscriptTail(entry.file, this.fs);
        const firstPrompt = entry.state.firstPrompt;
        entry.state.feed(await entry.tail.read());
        // The head's first prompt is the real first one; the tail only sees later ones.
        if (firstPrompt) entry.state.firstPrompt = firstPrompt;
        if (entry.tail.mtimeMs) entry.mtimeMs = entry.tail.mtimeMs;
        for (const agent of entry.agents.values()) {
          agent.tail ??= new TranscriptTail(agent.file, this.fs, { firstBytes: EXTERNAL_SESSION_LIMITS.agentFirstBytes });
          agent.state.feed(await agent.tail.read());
          if (agent.tail.mtimeMs) agent.mtimeMs = agent.tail.mtimeMs;
        }
      } else {
        entry.tail ??= new TranscriptTail(entry.file, this.fs);
        entry.state.feed(await entry.tail.read());
        if (entry.tail.mtimeMs) entry.mtimeMs = entry.tail.mtimeMs;
      }
    }
  }

  private schedulePublish() {
    if (this.publishTimer || this.mode === null) return;
    if (this.options.timers === false) {
      this.publishNow();
      return;
    }
    const wait = Math.max(0, this.lastPublishAt + EXTERNAL_SESSION_LIMITS.publishMs - this.now());
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      this.publishNow();
    }, wait);
    this.publishTimer.unref?.();
  }

  /** Recompute the picture and tell listeners when it changed. */
  publishNow() {
    if (this.mode === null) return;
    const now = this.now();
    this.lastPublishAt = now;
    const sessions = this.summarize(now);
    const runningCount = countRunningExternalWork(sessions);
    const live = this.mode === "live";
    const visible = live ? sessions : [];
    const key = JSON.stringify([this.mode, runningCount, visible]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.current = { state: this.mode, generatedAt: now, runningCount, sessions: visible };
    this.options.onChange(this.current);
  }

  private summarize(now: number): ExternalSession[] {
    const out: ExternalSession[] = [];
    for (const entry of this.sessions.values()) {
      const session = entry.source === "claude-code" ? this.summarizeClaude(entry, now) : summarizeCodex(entry, now);
      if (session) out.push(session);
    }
    const isLive = (session: ExternalSession) => Number(session.status === "working" || session.agents.some((agent) => agent.status === "running"));
    return out.sort((a, b) => isLive(b) - isLive(a) || b.lastAt - a.lastAt).slice(0, EXTERNAL_SESSION_LIMITS.maxSessions);
  }

  private summarizeClaude(entry: ClaudeEntry, now: number): ExternalSession | null {
    const { state } = entry;
    const agents: ExternalAgent[] = [];
    for (const agent of entry.agents.values()) {
      const toolUseId = agent.meta.toolUseId;
      const launch = toolUseId ? state.launches.get(toolUseId) : undefined;
      const status = deriveAgentStatus({
        lastWriteAt: agent.mtimeMs,
        now,
        idleMs: EXTERNAL_SESSION_LIMITS.idleMs,
        final: agent.state.final,
        markedFinished: agent.meta.finished === true,
        ...(toolUseId && state.results.get(toolUseId) ? { result: state.results.get(toolUseId) } : {}),
        ...(toolUseId && state.notices.get(toolUseId) ? { notice: state.notices.get(toolUseId) } : {}),
      });
      if (status !== "running" && now - agent.mtimeMs > EXTERNAL_SESSION_LIMITS.activeMs) continue;
      agents.push({
        id: agent.id,
        agentType: agent.meta.agentType ?? launch?.agentType ?? "general-purpose",
        description: agent.meta.description ?? launch?.description ?? agent.state.title ?? agent.id,
        status,
        startedAt: agent.state.startedAt ?? agent.mtimeMs,
        lastAt: agent.mtimeMs,
        ...(agent.state.action ? { action: agent.state.action } : {}),
        steps: agent.state.steps,
        ...(agent.state.contextTokens ? { contextTokens: agent.state.contextTokens } : {}),
      });
    }
    const shown = agents
      .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || b.lastAt - a.lastAt)
      .slice(0, EXTERNAL_SESSION_LIMITS.maxAgents)
      .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    if (!state.hasConversation && !state.title && shown.length === 0) return null;
    return {
      id: entry.id,
      source: "claude-code",
      ...(state.title ? { title: state.title } : {}),
      ...(state.cwd ? { cwd: state.cwd } : {}),
      ...(state.branch ? { branch: state.branch } : {}),
      status: sessionStatus(state.final, entry.mtimeMs, now),
      ...(state.startedAt !== undefined ? { startedAt: state.startedAt } : {}),
      lastAt: entry.mtimeMs,
      ...(state.action ? { action: state.action } : {}),
      steps: state.steps,
      ...(state.contextTokens ? { contextTokens: state.contextTokens } : {}),
      ...(state.model ? { model: state.model } : {}),
      agents: shown,
    };
  }
}

function summarizeCodex(entry: CodexEntry, now: number): ExternalSession | null {
  if (!entry.id) return null;
  const { state } = entry;
  const agents = entry.children
    .filter((child) => child.id)
    .map((child): ExternalAgent => {
      const status = deriveAgentStatus({ lastWriteAt: child.mtimeMs, now, idleMs: EXTERNAL_SESSION_LIMITS.idleMs, final: child.state.final, markedFinished: false });
      return {
        id: child.id!,
        agentType: child.subagent?.role ?? "Agent",
        description: child.subagent?.nickname ?? child.state.title ?? child.id!,
        status,
        startedAt: child.state.startedAt ?? child.mtimeMs,
        lastAt: child.mtimeMs,
        ...(child.state.action ? { action: child.state.action } : {}),
        steps: child.state.steps,
        ...(child.state.contextTokens ? { contextTokens: child.state.contextTokens } : {}),
      };
    })
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || b.lastAt - a.lastAt)
    .slice(0, EXTERNAL_SESSION_LIMITS.maxAgents)
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const title = state.title ?? (entry.subagent?.kind === "thread_spawn" ? entry.subagent.nickname : undefined);
  return {
    id: entry.id,
    source: "codex",
    ...(entry.subagent?.kind === "thread_spawn" ? { subagent: true } : {}),
    ...(title ? { title } : {}),
    ...(state.cwd ? { cwd: state.cwd } : {}),
    ...(state.branch ? { branch: state.branch } : {}),
    status: sessionStatus(state.final, entry.mtimeMs, now),
    ...(state.startedAt !== undefined ? { startedAt: state.startedAt } : {}),
    lastAt: entry.mtimeMs,
    ...(state.action ? { action: state.action } : {}),
    steps: state.steps,
    ...(state.contextTokens ? { contextTokens: state.contextTokens } : {}),
    ...(state.model ? { model: state.model } : {}),
    agents,
  };
}

/** `waiting` once the last answer ended its turn; `working` while written in the last five minutes. */
export function sessionStatus(final: boolean, lastWriteAt: number, now: number): ExternalSession["status"] {
  if (final) return "waiting";
  return now - lastWriteAt <= EXTERNAL_SESSION_LIMITS.idleMs ? "working" : "idle";
}

function sessionId(entry: SessionEntry) {
  return entry.id;
}

function resetEntry(entry: SessionEntry) {
  entry.tail = undefined;
  entry.headRead = false;
  entry.readMtimeMs = -1;
  if (entry.source === "claude-code") {
    entry.state = new ClaudeTranscriptState();
    for (const agent of entry.agents.values()) {
      agent.tail = undefined;
      agent.readMtimeMs = -1;
      agent.state = new ClaudeTranscriptState();
    }
  } else {
    entry.state = new CodexRolloutState();
  }
}

function minDefined(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/** `<home>/sessions/YYYY/MM/DD` for the last week, today first. */
export function codexDayDirs(home: string, now: number) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return Array.from({ length: EXTERNAL_SESSION_LIMITS.codexDays }, (_, index) => {
    const day = new Date(now - index * 86_400_000);
    return path.join(home, "sessions", String(day.getFullYear()), pad(day.getMonth() + 1), pad(day.getDate()));
  });
}
