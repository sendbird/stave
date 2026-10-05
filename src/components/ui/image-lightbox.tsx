import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
  return (
    <Lightbox
      open={args.open}
      onOpenChange={(open) => {
        if (!open) args.onClose();
      }}
      media={{ src: args.imageSrc, alt: args.alt }}
      hasZoom
      title={args.ariaLabel ?? i18n.t("ui:imageLightbox.imageFullScreenPreview")}
      closeLabel={args.closeLabel ?? i18n.t("ui:imageLightbox.closePreview")}
      className={UI_LAYER_CLASS.lightbox}
      testId="image-lightbox"
    />
  );
}
