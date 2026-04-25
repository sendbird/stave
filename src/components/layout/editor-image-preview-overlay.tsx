import { ImageLightbox } from "@/components/ui";

export function EditorImagePreviewOverlay(args: {
  open: boolean;
  imageSrc: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <ImageLightbox
      open={args.open}
      imageSrc={args.imageSrc}
      alt={args.alt}
      onClose={args.onClose}
    />
  );
}
