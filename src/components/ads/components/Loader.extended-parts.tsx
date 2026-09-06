import { sx } from "../utils/stylex";
import { extendedLoaderStyles as styles } from "./Loader.extended-styles";
import type { ExtendedLoaderVariant } from "./Loader.types";

type ExtendedLoaderMarkProps = { variant: ExtendedLoaderVariant };

const phases = [
  styles.phase0,
  styles.phase1,
  styles.phase2,
  styles.phase3,
] as const;

/** Ten task-specific marks that extend Loader's stable public contract. */
export function ExtendedLoaderMark({ variant }: ExtendedLoaderMarkProps) {
  switch (variant) {
    case "cascade":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="cascade">
          {[
            styles.cascade1,
            styles.cascade2,
            styles.cascade3,
            styles.cascade4,
          ].map((position, index) => (
            <span
              className={sx(styles.cascadeDot, position, phases[index])}
              key={index}
            />
          ))}
        </span>
      );
    case "decode":
      return (
        <span
          className={sx(styles.mark, styles.decode)}
          data-ads-loader-anatomy="decode"
        >
          {phases.map((phase, index) => (
            <span className={sx(styles.decodeCell, phase)} key={index} />
          ))}
        </span>
      );
    case "compile":
      return (
        <span
          className={sx(styles.mark, styles.compile)}
          data-ads-loader-anatomy="compile"
        >
          {[styles.compileTop, styles.compileMiddle, styles.compileBottom].map(
            (position, index) => (
              <span
                className={sx(styles.compileBar, position, phases[index])}
                key={index}
              />
            ),
          )}
        </span>
      );
    case "route":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="route">
          <span className={sx(styles.routeRail)} />
          <span className={sx(styles.routeNode, styles.routeStart)} />
          <span className={sx(styles.routeNode, styles.routeMiddle)} />
          <span className={sx(styles.routeNode, styles.routeEnd)} />
          <span className={sx(styles.routeRunner)} />
        </span>
      );
    case "handoff":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="handoff">
          <span className={sx(styles.routeRail)} />
          {[styles.handoff1, styles.handoff2, styles.handoff3].map(
            (position, index) => (
              <span
                className={sx(styles.handoffNode, position, phases[index])}
                key={index}
              />
            ),
          )}
        </span>
      );
    case "vision":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="vision">
          <span className={sx(styles.visionFrame)} />
          <span className={sx(styles.visionIris)} />
          <span className={sx(styles.visionFocus)} />
        </span>
      );
    case "explore":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="explore">
          <span className={sx(styles.exploreCenter)} />
          {[
            styles.exploreBranch1,
            styles.exploreBranch2,
            styles.exploreBranch3,
          ].map((position, index) => (
            <span className={sx(styles.exploreBranch, position)} key={index} />
          ))}
          {[styles.exploreLeaf1, styles.exploreLeaf2, styles.exploreLeaf3].map(
            (position, index) => (
              <span
                className={sx(styles.exploreLeaf, position, phases[index])}
                key={index}
              />
            ),
          )}
        </span>
      );
    case "sync":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="sync">
          <span className={sx(styles.syncRail, styles.syncRailTop)} />
          <span className={sx(styles.syncRail, styles.syncRailBottom)} />
          <span className={sx(styles.syncRunner, styles.syncRunnerTop)} />
          <span className={sx(styles.syncRunner, styles.syncRunnerBottom)} />
        </span>
      );
    case "verify":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="verify">
          <span className={sx(styles.verifyFrame)} />
          {[styles.verify1, styles.verify2, styles.verify3, styles.verify4].map(
            (position, index) => (
              <span
                className={sx(styles.verifyPoint, position, phases[index])}
                key={index}
              />
            ),
          )}
        </span>
      );
    case "persist":
      return (
        <span className={sx(styles.mark)} data-ads-loader-anatomy="persist">
          {[styles.persist1, styles.persist2, styles.persist3].map(
            (position, index) => (
              <span
                className={sx(styles.persistLayer, position, phases[index])}
                key={index}
              />
            ),
          )}
        </span>
      );
  }
}
