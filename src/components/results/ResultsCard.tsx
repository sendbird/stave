import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { sx } from "@/components/ads/utils/stylex";
import { resultsStyles as styles } from "./results.styles";

/**
 * One section of the Results page: an outer surface with a header (section
 * icon in a dashed tile, title, a small monospace subtitle, optional meta on
 * the right) and an inner well one step lighter that holds the data.
 */
export function ResultsCard(props: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  meta?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className={sx(styles.card)} aria-labelledby={props.id}>
      <header className={sx(styles.cardHead)}>
        <IconTile size="xs" xstyle={styles.tile}>
          <Icon size={iconTileGlyphSizes.xs} />
        </IconTile>
        <div className={sx(styles.cardTitles)}>
          <h2 id={props.id} className={sx(styles.cardTitle)}>
            {props.title}
          </h2>
          <p className={sx(styles.cardSubtitle)}>{props.subtitle}</p>
        </div>
        {props.meta ? <p className={sx(styles.cardMeta)}>{props.meta}</p> : null}
      </header>
      <div className={sx(styles.well)}>{props.children}</div>
    </section>
  );
}
