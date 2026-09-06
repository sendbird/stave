import { sliderLayout } from "./slider-layout.styles";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { sliderStyles } from "../ads/components/Slider";
import { sx } from "../ads/utils/stylex";
import { mergeClassName } from "../ads/components/merge-class-name";
import { focusRing } from "../ads/recipes/focus-ring";

type SliderProps = SliderPrimitive.Root.Props<number> &
  Pick<
    SliderPrimitive.Thumb.Props,
    "getAriaLabel" | "getAriaValueText" | "aria-valuetext"
  >;

function Slider({
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-valuetext": ariaValueText,
  getAriaLabel,
  getAriaValueText,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={mergeClassName(() => sx(sliderLayout.root), className)}
      data-slot="slider"
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className={sx(sliderLayout.control)}>
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={sx(sliderStyles.track, sliderLayout.track)}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={sx(sliderStyles.indicator, sliderLayout.indicator)}
          />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-valuetext={ariaValueText}
            getAriaLabel={getAriaLabel}
            getAriaValueText={getAriaValueText}
            data-slot="slider-thumb"
            className={sx(sliderStyles.thumb, focusRing.ring)}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
