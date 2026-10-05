import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Check, Sparkles } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildStarterProfile,
  cloneProfileAsCustom,
  CUSTOM_PROFILE_ID,
  isStarterProfileId,
  STANCE_DESCRIPTIONS,
  STANCE_LABELS,
  withStance,
  type AutoRoutingProfile,
  type StarterProfileId,
} from "@/lib/providers/auto-routing-profile";
import { useAppStore } from "@/store/app.store";
import { autoRoutingProfileListStyles as styles } from "./auto-routing-profile-list.styles";

/**
 * The Auto rail tab's body. It stands where a provider tab's effort grid
 * stands, because the profile is what "effort" means for the router: the one
 * dial that modulates every route it picks.
 *
 * Balanced comes first because it is the default profile and the safest
 * starting point. The two directional alternatives follow it.
 */
const PROFILE_ROWS: readonly {
  id: StarterProfileId | typeof CUSTOM_PROFILE_ID;
  label: string;
  description: string;
}[] = [
  {
    id: "starter-balanced",
    get label() { return STANCE_LABELS.balanced; },
    get description() { return STANCE_DESCRIPTIONS.balanced; },
  },
  {
    id: "starter-cost-saver",
    get label() { return STANCE_LABELS["cost-saver"]; },
    get description() { return STANCE_DESCRIPTIONS["cost-saver"]; },
  },
  {
    id: "starter-quality-first",
    get label() { return STANCE_LABELS["quality-first"]; },
    get description() { return STANCE_DESCRIPTIONS["quality-first"]; },
  },

];

/**
 * One accent, deepening down the list, so the rows read as a single dial.
 *
 * Mixed toward `transparent` rather than toward the surface: the ADS neutrals
 * are warm (oklch hue ~89) and the accent is not, so mixing the two in oklch
 * rotates the hue through magenta and the "ramp" arrives at the bottom row a
 * different colour than it started. Alpha over the surface keeps one hue.
 */
function swatchColor(index: number, count: number) {
  const range = Math.max(count - 1, 1);
  // Floor at 32% so the lightest rung still reads against a dark surface.
  const mix = Math.round(32 + (index / range) * 58);
  return `color-mix(in oklch, var(--ads-color-accent) ${mix}%, transparent)`;
}

/**
 * Changing preference preserves saved rules, signals, and eligible models.
 * The legacy Custom action still clones a starter for older callers.
 */
export function resolveNextProfile(args: {
  profile: AutoRoutingProfile;
  id: StarterProfileId | typeof CUSTOM_PROFILE_ID;
}): AutoRoutingProfile | null {
  if (isStarterProfileId(args.id)) {
    return withStance(args.profile, buildStarterProfile(args.id).stance);
  }
  return isStarterProfileId(args.profile.id)
    ? cloneProfileAsCustom(args.profile)
    : null;
}

export function AutoRoutingProfileList(args: {
  /** Description carried by the Auto option: the last routed rule, when known. */
  description?: string;
  available: boolean;
  selected: boolean;
  disabled?: boolean;
  onChoose: () => void;
}) {
  useTranslation();
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const activeId = `starter-${profile.stance}`;
  const rows = PROFILE_ROWS;
  const selectedIndex = rows.findIndex((row) => row.id === activeId);
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
  ) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : (rowIndex + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
            rows.length;
    rowRefs.current.get(rows[nextIndex]?.id ?? "")?.focus();
  };

  const choose = (id: StarterProfileId | typeof CUSTOM_PROFILE_ID) => {
    const next = resolveNextProfile({ profile, id });
    if (next) {
      updateSettings({ patch: { autoRoutingProfile: next } });
    }
    args.onChoose();
  };

  return (
    <div className={sx(styles.panel)}>
      <div className={sx(styles.header)}>
        <Sparkles className={sx(styles.headerIcon)} aria-hidden="true" />
        <span className={sx(styles.headerBody)}>
          <span className={sx(styles.headerTitle)}>Stave Auto</span>
          <span className={sx(styles.headerText)}>
            {args.description ??
              i18n.t("composer:autoRoutingProfileList.autoRoutingProfileList")}
          </span>
        </span>
      </div>

      {args.available ? null : (
        <div role="alert" className={sx(styles.notice)}>
          {i18n.t("composer:autoRoutingProfileList.autoRoutingProfileList2")}</div>
      )}

      <div className={sx(styles.sectionLabel)}>{i18n.t("composer:autoRoutingProfileList.autoRoutingProfileList3")}</div>
      <div
        role="listbox"
        aria-label={i18n.t("composer:autoRoutingProfileList.ariaLabel")}
        className={sx(styles.list)}
      >
        {rows.map((row, rowIndex) => {
          const selected = args.selected && row.id === activeId;
          return (
            <AdsButton
              layout="host"
              key={row.id}
              ref={(element) => {
                if (element) {
                  rowRefs.current.set(row.id, element);
                } else {
                  rowRefs.current.delete(row.id);
                }
              }}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={args.disabled || !args.available}
              tabIndex={rowIndex === tabStopIndex ? 0 : -1}
              onKeyDown={(event) => moveFocus(event, rowIndex)}
              onClick={() => choose(row.id)}
              xstyle={[
                styles.row,
                selected ? styles.rowSelected : styles.rowIdle,
              ]}
            >
              <span
                aria-hidden="true"
                className={sx(styles.swatch)}
                style={
                  {
                    backgroundColor: swatchColor(rowIndex, rows.length),
                  } as CSSProperties
                }
              />
              <span className={sx(styles.body)}>
                <span className={sx(styles.titleLine)}>
                  <span className={sx(styles.title)}>{row.label}</span>
                  {row.id === activeId && !selected ? (
                    <span className={sx(styles.badge)}>{i18n.t("composer:autoRoutingProfileList.copy")}</span>
                  ) : null}
                </span>
                <span className={sx(styles.description)}>
                  {row.description}
                </span>
              </span>
              {selected ? (
                <Check className={sx(styles.check)} aria-hidden="true" />
              ) : null}
            </AdsButton>
          );
        })}
      </div>
    </div>
  );
}
