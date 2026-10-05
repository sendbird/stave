import type { ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { resultsStyles as styles } from "./results.styles";

/** A flat section: its question, definition and data share one surface. */
export function ResultsCard(props: { id: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={sx(styles.card)} aria-labelledby={props.id}>
      <header className={sx(styles.cardHead)}>
        <h2 id={props.id} className={sx(styles.cardTitle)}>{props.title}</h2>
        <p className={sx(styles.cardSubtitle)}>{props.subtitle}</p>
      </header>
      {props.children}
    </section>
  );
}
