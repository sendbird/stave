import { createContext, useContext, useEffect, useId, useRef } from "react";
import { FolderGit2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { sx } from "@/components/aui/utils/stylex";
import { buildTarsStartGroups, TARS_START_REPOSITORIES_MAX, type TarsStartCount } from "@/lib/tars/start";
import type { TarsSuggestion } from "@/lib/tars/suggestions";
import { tarsStartStyles as styles } from "./tars-start.styles";

/** What the Tars view knows that the start screen shows: the work as it is now and where Tars can work. */
export interface TarsStartInfo {
  /** The non-zero "Right now" counts (`buildTarsStartCounts`); empty before the work was read. */
  counts: readonly TarsStartCount[];
  /** Opens a count's tray lane, at its first work when it names one. */
  onOpenCount: (count: TarsStartCount) => void;
  /** Names of the registered repositories; null when the view cannot tell, which shows no repository line. */
  repositories: readonly string[] | null;
  /** Whether this bridge can open a draft pull request, and clear. */
  canPublish: boolean;
  canClear: boolean;
}

/** Without a Tars view around it (a test, a story) the start screen shows the greeting and the examples that need nothing. */
const NO_INFO: TarsStartInfo = { counts: [], onOpenCount: () => undefined, repositories: null, canPublish: false, canClear: false };

/** The Tars view publishes the start screen's facts here, so the conversation only places the screen. */
export const TarsStartContext = createContext<TarsStartInfo>(NO_INFO);

/**
 * Opens a tray lane's section when it is folded, then focuses the work named
 * (its first control) or the lane's header. The tray may still be mounting
 * (the narrow popover), so it is looked for over a few frames.
 */
export function focusTarsTrayLane(lane: string, responsibilityId: string | null, frames = 12) {
  const section = document.querySelector<HTMLElement>(`[data-tars-tray-lane="${lane}"]`);
  const trigger = section?.querySelector<HTMLElement>("button[aria-expanded]");
  if (!section || !trigger || !section.checkVisibility()) {
    if (frames > 0) requestAnimationFrame(() => focusTarsTrayLane(lane, responsibilityId, frames - 1));
    return;
  }
  if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
  // One frame on, a section that just opened has its cards.
  requestAnimationFrame(() => {
    const card = responsibilityId ? section.querySelector<HTMLElement>(`[data-tars-card="${CSS.escape(responsibilityId)}"]`) : null;
    const target = card?.querySelector<HTMLElement>("button:not([disabled])") ?? trigger;
    target.focus();
    (card ?? section).scrollIntoView({ block: "nearest" });
  });
}

/** The nearest ancestor that scrolls vertically: the transcript the start screen sits in. */
function scrollerOf(node: HTMLElement | null) {
  for (let parent = node?.parentElement ?? null; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

/**
 * The conversation with nothing in it yet, or with everything cleared: who
 * Tars is, what the work is doing right now, requests to start from grouped by
 * what Tars can do, and where it can work. An example only fills the message
 * box (`onExample`); the user sends it. An example a suggestion chip already
 * asks about real work is left out, so nothing is offered twice.
 */
export function TarsStart({ name, info, suggestions, onExample }: {
  name: string;
  info: TarsStartInfo;
  /** The chips shown above the composer now. */
  suggestions?: readonly Pick<TarsSuggestion, "kind">[];
  onExample: (text: string) => void;
}) {
  const { t } = useTranslation(["shell", "workspace"]);
  const id = useId();
  const root = useRef<HTMLElement>(null);
  // A transcript holds to its end, which would open a start screen taller than the window on its last lines. It is read from its
  // top, so once the transcript has settled (two frames) it is shown from there; a transcript that fits does not move.
  useEffect(() => {
    const scroller = scrollerOf(root.current);
    if (!scroller || !root.current) return;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => scroller.scrollTo({ top: 0 })); });
    // The transcript learns whether it is at its end from scroll events alone. Held at its top, a resize that removes the overflow
    // (or this screen leaving) moves nothing and so sends none; tell it, or its "scroll to latest" button would stay with nothing below.
    const sync = () => { if (scroller.isConnected) scroller.dispatchEvent(new Event("scroll")); };
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    observer.observe(root.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(sync));
    };
  }, []);
  const groups = buildTarsStartGroups({ repositories: info.repositories ? info.repositories.length : null, canPublish: info.canPublish, canClear: info.canClear, suggestions });
  const shown = info.repositories?.slice(0, TARS_START_REPOSITORIES_MAX) ?? [];
  const more = (info.repositories?.length ?? 0) - shown.length;
  return <section ref={root} className={sx(styles.root, textWrap.keepAll)} aria-labelledby={`${id}-greeting`} data-tars-welcome="" data-tars-start="">
    <div className={sx(styles.intro)}>
      <h2 id={`${id}-greeting`} className={sx(styles.greeting)}>{t("shell:tars.start.greeting", { name })}</h2>
      <p className={sx(styles.description)}>{t("shell:tars.start.intro")}</p>
    </div>
    {info.counts.length ? <section className={sx(styles.line)} aria-labelledby={`${id}-now`} data-tars-start-now="">
      <h3 id={`${id}-now`} className={sx(styles.heading, styles.besideControls)}>{t("shell:tars.start.now.title")}</h3>
      <ul className={sx(styles.row)}>
        {info.counts.map((entry) => <li key={entry.kind} className={sx(styles.item)}>
          <Button type="button" variant="secondary" size="xs" xstyle={styles.button} aria-describedby={`${id}-open-${entry.kind}`}
            title={t(`shell:tars.start.now.open.${entry.kind}`)} data-tars-start-count={entry.kind} data-tars-start-count-value={entry.count} onClick={() => info.onOpenCount(entry)}>
            <span className={sx(styles.buttonLabel)}>{t(`shell:tars.start.now.${entry.kind}`, { count: entry.count })}</span>
          </Button>
          <VisuallyHidden id={`${id}-open-${entry.kind}`}>{t(`shell:tars.start.now.open.${entry.kind}`)}</VisuallyHidden>
        </li>)}
      </ul>
    </section> : null}
    {groups.length ? <section className={sx(styles.section)} aria-labelledby={`${id}-examples`} data-tars-start-examples="">
      <h3 id={`${id}-examples`} className={sx(styles.heading)}>{t("shell:tars.start.examples.title")}</h3>
      <div className={sx(styles.groups)}>
        {groups.map((group) => <div key={group.id} role="group" className={sx(styles.group)} aria-labelledby={`${id}-group-${group.id}`} data-tars-start-group={group.id}>
          <p id={`${id}-group-${group.id}`} className={sx(styles.groupName)}>{t(`shell:tars.start.examples.groups.${group.id}`)}</p>
          <ul className={sx(styles.row, styles.groupExamples)}>
            {group.examples.map((example) => {
              const prompt = t(`shell:tars.start.examples.${example.id}.prompt`);
              return <li key={example.id} className={sx(styles.item)}>
                <Button type="button" variant="secondary" size="xs" xstyle={styles.button} title={prompt} data-tars-start-example={example.id}
                  data-tars-start-action={example.action} onClick={() => onExample(prompt)}>
                  <span className={sx(styles.buttonLabel)}>{t(`shell:tars.start.examples.${example.id}.label`)}</span>
                </Button>
              </li>;
            })}
          </ul>
        </div>)}
      </div>
    </section> : null}
    {info.repositories ? <section className={sx(styles.line)} aria-labelledby={`${id}-repositories`} data-tars-start-repositories={info.repositories.length}>
      <h3 id={`${id}-repositories`} className={sx(styles.heading)}>{t("shell:tars.start.repositories.title", { name })}</h3>
      {shown.length ? <ul className={sx(styles.repositories)}>
        {shown.map((repository, index) => <li key={`${index}:${repository}`} className={sx(styles.repository)} data-tars-start-repository="">
          <FolderGit2 aria-hidden="true" className={sx(styles.repositoryIcon)} /><span className={sx(styles.repositoryName)}>{repository}</span>
        </li>)}
        {more > 0 ? <li className={sx(styles.more)} data-tars-start-repositories-more={more}>{t("shell:tars.start.repositories.more", { count: more })}</li> : null}
      </ul> : <p className={sx(styles.note)} data-tars-start-no-repositories="">
        {t("shell:tars.start.repositories.none", { name, action: t("workspace:emptyState.noRepositories.action") })}</p>}
    </section> : null}
  </section>;
}

/** The start screen where the conversation places it, with what the Tars view published. */
export function TarsStartScreen(props: { name: string; suggestions?: readonly Pick<TarsSuggestion, "kind">[]; onExample: (text: string) => void }) {
  return <TarsStart {...props} info={useContext(TarsStartContext)} />;
}
