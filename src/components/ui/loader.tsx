import {
  Loader as AdsLoader,
  type LoaderProps as AdsLoaderProps,
} from "../ads/components/Loader";
import { cx } from "../ads/utils/stylex";
import "./loader.css";
export type {
  LoaderSize,
  LoaderVariant,
  LoaderTone,
} from "../ads/components/Loader";
export type LoaderProps = AdsLoaderProps & {
  cadence?: "full" | "reduced";
  paused?: boolean;
};
export function Loader({
  cadence = "full",
  paused = false,
  className,
  ...props
}: LoaderProps) {
  return (
    <AdsLoader
      {...props}
      // `.stave-loader` is the product loader's identity hook: consumers and
      // tests target it to find "the app's loader" independently of the
      // canonical ADS class names. It carries no animation of its own — cadence
      // and pause are driven by the data attributes below — so restoring it is
      // purely an identity marker.
      className={cx("stave-loader", className)}
      data-loader-variant={props.variant ?? "spinner"}
      data-loader-size={props.size ?? "sm"}
      data-loader-labeled={props.showLabel ? "true" : "false"}
      data-loader-cadence={cadence}
      data-loader-paused={paused ? "true" : "false"}
      aria-live={
        props["aria-hidden"] ? undefined : (props["aria-live"] ?? "polite")
      }
    />
  );
}
