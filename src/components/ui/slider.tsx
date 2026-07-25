import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

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
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-7 w-full touch-none items-center select-none data-disabled:opacity-45 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-7 data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow rounded-full bg-muted shadow-[inset_0_1px_1px_color-mix(in_oklch,var(--foreground)_8%,transparent)] select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="rounded-full bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-valuetext={ariaValueText}
            getAriaLabel={getAriaLabel}
            getAriaValueText={getAriaValueText}
            data-slot="slider-thumb"
            className="block size-[1.125rem] shrink-0 rounded-full bg-foreground shadow-[0_1px_3px_color-mix(in_oklch,var(--background)_25%,transparent),0_0_0_2px_var(--background)] ring-ring/45 transition-[transform,box-shadow] duration-150 select-none hover:scale-110 focus-visible:scale-110 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
