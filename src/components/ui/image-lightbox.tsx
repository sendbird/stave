import { Lightbox } from "../ads/components/Lightbox";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";

export function ImageLightbox(args: {
  open: boolean;
  imageSrc: string;
  alt: string;
  onClose: () => void;
  ariaLabel?: string;
  closeLabel?: string;
  imageTitle?: string;
}) {
  return (
    <Lightbox
      open={args.open}
      onOpenChange={(open) => {
        if (!open) args.onClose();
      }}
      media={{ src: args.imageSrc, alt: args.alt }}
      hasZoom
      title={args.ariaLabel ?? "Image full screen preview"}
      closeLabel={args.closeLabel ?? "Close preview"}
      className={UI_LAYER_CLASS.lightbox}
      testId="image-lightbox"
    />
  );
}
