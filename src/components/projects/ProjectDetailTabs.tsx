import { useEffect, useState } from "react";
import { ArrowUpRight, CircleCheck, CircleDot, FileText, GitPullRequest, Link2, MonitorPlay, Ticket, X } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { Tabs } from "@/components/ads/components/Tabs";
import { TextField } from "@/components/ads/components/TextField";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Segmented } from "@/components/playbooks/Segmented";
import type { ProjectDetail, ProjectLibraryItem } from "@/lib/projects/api";
import type { ProjectMemory, ProjectSettings } from "@/lib/projects/domain";
import { useProjectsStore, type ProjectDetailTab } from "@/store/projects-store";
import { missionTitle } from "./ProjectRows";
import { countActiveTriggers, ProjectStartsWhen } from "./ProjectStartsWhen";
import { projectStyles as styles } from "./projects.styles";



const LIBRARY_ICONS: Record<ProjectLibraryItem["kind"], typeof Link2> = {
  "pull-request": GitPullRequest,
  issue: Ticket,
  preview: MonitorPlay,
  document: FileText,
  link: Link2,
};

function TabLabel(props: { label: string; count?: number; attention?: boolean }) {
  return (
    <span className={sx(styles.tabLabel)}>
      {props.label}
      {props.count !== undefined ? <span className={sx(styles.tabCount)}>{props.count}</span> : null}
      {props.attention ? <span className={sx(styles.tabDot)} aria-label="Something to review" role="img" /> : null}
    </span>
  );
}

/** What the project learned, what it collected and what it may do, in three tabs. */
export function ProjectDetailTabs(props: {
  detail: ProjectDetail;
  busy: boolean;
  onSetMemoryStatus: (memory: ProjectMemory, status: ProjectMemory["status"] | "removed") => void;
  onUpdateSettings: (settings: Partial<ProjectSettings>) => void;
}) {
  const { detail } = props;
  const tab = useProjectsStore((state) => state.detailTab);
  const setTab = useProjectsStore((state) => state.setDetailTab);
  const candidates = detail.memories.filter((memory) => memory.status === "candidate").length;
  return (
    <Tabs.Root variant="line" value={tab} onValueChange={(value) => setTab(value as ProjectDetailTab)} xstyle={styles.lane}>
      <Tabs.List aria-label="Project details">
        <Tabs.Tab value="memory">
          <TabLabel label="Memory" count={detail.memories.length} attention={candidates > 0} />
        </Tabs.Tab>
        <Tabs.Tab value="library">
          <TabLabel label="Library" count={detail.library.length} />
        </Tabs.Tab>
        <Tabs.Tab value="starts-when">
          <TabLabel label="Starts when" count={countActiveTriggers(detail.project.settings.triggers)} />
        </Tabs.Tab>
        <Tabs.Tab value="settings">
          <TabLabel label="Settings" />
        </Tabs.Tab>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Panel value="memory" xstyle={styles.tabPanel}>
        <MemoryList detail={detail} busy={props.busy} onSetStatus={props.onSetMemoryStatus} />
      </Tabs.Panel>
      <Tabs.Panel value="library" xstyle={styles.tabPanel}>
        <LibraryList items={detail.library} />
      </Tabs.Panel>
      <Tabs.Panel value="starts-when" xstyle={styles.tabPanel}>
        <ProjectStartsWhen
          triggers={detail.project.settings.triggers}
          onChange={(triggers) => props.onUpdateSettings({ triggers })}
        />
      </Tabs.Panel>
      <Tabs.Panel value="settings" xstyle={styles.tabPanel}>
        <SettingsList settings={detail.project.settings} onUpdate={props.onUpdateSettings} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function MemoryList(props: {
  detail: ProjectDetail;
  busy: boolean;
  onSetStatus: (memory: ProjectMemory, status: ProjectMemory["status"] | "removed") => void;
}) {
  const { memories, missions } = props.detail;
  if (memories.length === 0) {
    return <p className={sx(styles.emptyLane)}>Decisions from finished missions and the coordinator's notes appear here.</p>;
  }
  const titleOf = (missionId: string | null) => {
    const mission = missionId ? missions.find((candidate) => candidate.missionId === missionId) : undefined;
    return mission ? missionTitle(mission) : null;
  };
  return (
    <ul className={sx(styles.rows)}>
      {memories.map((memory) => {
        const candidate = memory.status === "candidate";
        const source = titleOf(memory.sourceMissionId);
        return (
          <li key={memory.id} className={sx(styles.row, styles.rowCompact)}>
            <span className={sx(styles.rowMark)}>
              {candidate ? (
                <CircleDot aria-hidden className={sx(styles.icon, styles.toneWaiting)} />
              ) : (
                <CircleCheck aria-hidden className={sx(styles.icon, styles.toneDone)} />
              )}
            </span>
            <span className={sx(styles.rowText)}>
              <span className={sx(styles.memoryText)}>{memory.content}</span>
              <span className={sx(styles.rowMeta)}>
                {candidate ? <span className={sx(styles.rowWaiting)}>To review · </span> : null}
                {memory.kind === "decision" ? "Decision" : "Coordinator note"}
                {source ? ` · from “${source}”` : ""}
              </span>
            </span>
            <span className={sx(styles.rowActions)}>
              {candidate ? (
                <Button size="xs" variant="secondary" disabled={props.busy} onClick={() => props.onSetStatus(memory, "accepted")}>
                  Accept
                </Button>
              ) : null}
              <Tooltip content="Remove from project memory">
                <Button
                  size="xs"
                  variant="quiet"
                  iconOnly
                  aria-label="Remove from project memory"
                  disabled={props.busy}
                  onClick={() => props.onSetStatus(memory, "removed")}
                >
                  <X aria-hidden />
                </Button>
              </Tooltip>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const LIBRARY_KIND_WORDS: Record<ProjectLibraryItem["kind"], string> = {
  "pull-request": "pull request pr",
  issue: "issue ticket",
  preview: "preview deploy",
  document: "document doc",
  link: "link",
};

/** Whether a library item matches a search: its label, mission, address or kind. */
export function libraryItemMatches(item: ProjectLibraryItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [item.label, item.missionTitle, item.url, LIBRARY_KIND_WORDS[item.kind]].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function LibraryList({ items }: { items: readonly ProjectLibraryItem[] }) {
  const [query, setQuery] = useState("");
  if (items.length === 0) {
    return <p className={sx(styles.emptyLane)}>Pull requests, issues and previews from finished missions collect here.</p>;
  }
  const shown = items.filter((item) => libraryItemMatches(item, query));
  return (
    <div className={sx(styles.tabStack)}>
      <span className={sx(styles.librarySearch)}>
        <TextField
          size="sm"
          type="search"
          aria-label="Search the library"
          placeholder="Search by name, mission or kind — “pr”, “preview”…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <span className={sx(styles.hint)}>
            {shown.length} of {items.length}
          </span>
        ) : null}
      </span>
      {shown.length === 0 ? (
        <p className={sx(styles.emptyLane)}>Nothing in the library matches “{query.trim()}”.</p>
      ) : (
        <ul className={sx(styles.rows)}>
          {shown.map((item) => {
            const Icon = LIBRARY_ICONS[item.kind];
            return (
              <li key={`${item.missionId}:${item.url}`} className={sx(styles.linkItem)}>
                <a className={sx(styles.row, styles.rowCompact, styles.rowLink, focusRing.ring, transition.colors)} href={item.url} target="_blank" rel="noreferrer">
                  <span className={sx(styles.rowMark)}>
                    <Icon aria-hidden className={sx(styles.icon, styles.iconMuted)} />
                  </span>
                  <span className={sx(styles.rowText)}>
                    <span className={sx(styles.rowTitle)}>{item.label}</span>
                    <span className={sx(styles.rowMeta)}>{item.missionTitle}</span>
                  </span>
                  <span className={sx(styles.rowActions)}>
                    {item.verified ? (
                      <Badge size="sm" tone="success">
                        Verified
                      </Badge>
                    ) : null}
                    <ArrowUpRight aria-hidden className={sx(styles.icon, styles.iconMuted)} />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "2026-10-15" for a date input, in local time. */
function toDateInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The last moment of a local calendar day, as the project's end. */
function endOfLocalDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!, 23, 59, 59).toISOString();
}

/**
 * The end date, committed on blur or Enter and only as a whole day from today
 * on: a date field reports each keystroke (a year typed digit by digit reads
 * as 0002 first), and a past end would expire the project for good.
 */
function EndDateField(props: { endsAt: string | null; onCommit: (endsAt: string | null) => void }) {
  const saved = props.endsAt ? toDateInput(props.endsAt) : "";
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValue(saved);
    setError(null);
  }, [saved]);
  const today = toDateInput(new Date().toISOString());
  const commit = () => {
    if (value === saved) return setError(null);
    if (!value) return props.onCommit(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < today) {
      setError("Choose today or a later day.");
      return;
    }
    setError(null);
    props.onCommit(endOfLocalDay(value));
  };
  return (
    <TextField
      size="sm"
      type="date"
      aria-label="End date"
      value={value}
      min={today}
      error={error ?? undefined}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function SettingRow(props: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <li className={sx(styles.settingRow)}>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)}>{props.label}</span>
        <span className={sx(styles.settingHint)}>{props.hint}</span>
      </span>
      {props.children}
    </li>
  );
}

function SettingsList(props: { settings: ProjectSettings; onUpdate: (settings: Partial<ProjectSettings>) => void }) {
  const { settings } = props;
  return (
    <ul className={sx(styles.rows)}>
      <SettingRow label="Missions at once" hint="How many of this project's missions may run side by side, each on its own worktree.">
        <Segmented
          aria-label="Missions at once"
          size="xs"
          value={String(settings.parallelLimit) as "1" | "2" | "3" | "4"}
          options={(["1", "2", "3", "4"] as const).map((value) => ({ value, label: value }))}
          onChange={(value) => props.onUpdate({ parallelLimit: Number(value) })}
        />
      </SettingRow>
      <SettingRow
        label="Ask before starting"
        hint="On: the coordinator proposes and you start each mission. Off: missions start on their own, up to the limit."
      >
        <Switch
          aria-label="Ask before starting a mission"
          checked={settings.askBeforeStarting}
          onCheckedChange={(checked) => props.onUpdate({ askBeforeStarting: checked })}
        />
      </SettingRow>
      <SettingRow
        label="End date"
        hint="After this day the project stops waking its coordinator and starts no missions. Running missions finish on their own."
      >
        <span className={sx(styles.endDate)}>
          <span className={sx(styles.endDateField)}>
            <EndDateField endsAt={settings.endsAt} onCommit={(endsAt) => props.onUpdate({ endsAt })} />
          </span>
          {settings.endsAt ? (
            <Button variant="quiet" size="xs" onClick={() => props.onUpdate({ endsAt: null })}>
              No end date
            </Button>
          ) : null}
        </span>
      </SettingRow>
      <SettingRow
        label="Accept decisions automatically"
        hint="Decisions from finished missions become memory later missions follow. Off: you review each one first."
      >
        <Switch
          aria-label="Accept decisions automatically"
          checked={settings.autoAcceptDecisions}
          onCheckedChange={(checked) => props.onUpdate({ autoAcceptDecisions: checked })}
        />
      </SettingRow>
    </ul>
  );
}
